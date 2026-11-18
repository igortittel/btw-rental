-- BTW Rental – Phase 9: payments and deposit, documents, daily cron, customers + GDPR,
-- audit log screen, staff 2FA.
set search_path = public, extensions;

-- ───────────────────────── columns ─────────────────────────
alter table public.bookings
  add column rental_refunded_cents  integer check (rental_refunded_cents >= 0),
  add column rental_refunded_at     timestamptz,
  add column rental_refund_method   public.payment_method,
  add column rental_refund_note     text,
  add column deposit_returned_marked_by uuid references public.profiles (id) on delete set null,
  -- Set by the daily cron when the e-mail is claimed, so that no reminder goes out twice.
  add column pickup_reminder_sent_at timestamptz,
  add column return_reminder_sent_at timestamptz;

-- Account the customer wants the deposit returned to (customer zone profile / admin).
alter table public.profiles add column refund_iban text;

alter table public.documents
  add column file_name  text,
  add column emailed_at timestamptz;

-- One row per cron run: what was sent and what failed (shown on the dashboard).
create table public.cron_runs (
  id          bigint generated always as identity primary key,
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  result      jsonb not null default '{}'::jsonb,
  error       text
);
create index cron_runs_job_idx on public.cron_runs (job, started_at desc);
alter table public.cron_runs enable row level security;
revoke all on public.cron_runs from anon;
create policy cron_runs_select on public.cron_runs for select to authenticated
  using ((select private.is_staff('operator')));
-- Written by the server (service role) only.

-- ───────────────────────── staff 2FA ─────────────────────────
-- With `staff_mfa_enforced` = true, staff rights need a session verified with a second
-- factor (aal2). The app always asks for it; the database switch is turned on when this
-- code is live in production, so that older deployments keep working until then.
insert into public.settings (key, value, is_public) values ('staff_mfa_enforced', 'false'::jsonb, false)
on conflict (key) do nothing;

create or replace function private.is_staff(min_role public.staff_role default 'operator') returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_roles sr
    where sr.user_id = (select auth.uid()) and sr.is_active and sr.role >= min_role
  )
  and (
    coalesce((select value = 'true'::jsonb from public.settings where key = 'staff_mfa_enforced'), false) is false
    or coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
  );
$$;

-- ───────────────────────── audit ─────────────────────────
-- Changes: `app.skip_audit` = 'on' suppresses row logging (the GDPR anonymisation writes
-- its own entry and must not copy personal data into the immutable log), and a trigger
-- created with the argument 'redact' logs only which columns changed, not their values.
create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor  uuid := private.actor_id();
  v_redact boolean := tg_nargs > 0 and tg_argv[0] = 'redact';
  v_old    jsonb;
  v_new    jsonb;
  v_diff   jsonb;
  v_id     text;
begin
  if v_actor is null or current_setting('app.skip_audit', true) = 'on' then
    return coalesce(new, old);
  end if;
  -- Redacted tables (profiles): only staff edits are recorded, customers editing their own
  -- profile are not "writes in the admin".
  if v_redact and not exists (select 1 from public.staff_roles sr where sr.user_id = v_actor) then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_diff := jsonb_build_object('new', v_new);
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_diff := jsonb_build_object('old', v_old);
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    select jsonb_object_agg(n.key, jsonb_build_object('old', v_old -> n.key, 'new', n.value))
      into v_diff
      from jsonb_each(v_new) n
     where n.value is distinct from v_old -> n.key
       and n.key not in ('updated_at', 'updated_by');
    if v_diff is null then
      return new;
    end if;
  end if;

  if v_redact then
    select jsonb_object_agg(k, jsonb_build_object('changed', true))
      into v_diff
      from jsonb_object_keys(coalesce(v_diff -> 'new', v_diff -> 'old', v_diff)) k
     where k not in ('updated_at', 'updated_by');
  end if;

  v_id := coalesce(
    coalesce(v_new, v_old) ->> 'id',
    coalesce(v_new, v_old) ->> 'key',
    coalesce(v_new, v_old) ->> 'user_id',
    coalesce(v_new, v_old) ->> 'profile_id',
    coalesce(v_new, v_old) ->> 'vehicle_id'
  );

  insert into public.audit_log (actor_id, entity, entity_id, action, diff)
  values (v_actor, tg_table_name, v_id, lower(tg_op), v_diff);
  return coalesce(new, old);
end;
$$;

create trigger audit after update or delete on public.profiles
  for each row execute function private.audit('redact');

-- ───────────────────────── payments ─────────────────────────
-- Record that the rental payment or the deposit was received. Any staff member (the
-- terminal / cash payment is often taken at the car); undoing it is for managers.
create or replace function public.record_payment(
  p_booking_id uuid,
  p_kind       text,
  p_at         timestamptz,
  p_method     public.payment_method
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bookings;
begin
  if not private.is_staff('operator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_at is null or p_at > now() + interval '1 day' then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;
  select * into v_row from public.bookings where id = p_booking_id for update;
  if v_row.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_kind = 'rental' then
    if v_row.rental_payment_status <> 'unpaid' then
      raise exception 'payment_already_recorded' using errcode = 'P0001';
    end if;
    if v_row.total_cents is null then
      raise exception 'price_not_set' using errcode = 'P0001';
    end if;
    update public.bookings
       set rental_payment_status = 'paid', rental_paid_at = p_at, rental_payment_method = p_method,
           rental_paid_marked_by = private.actor_id()
     where id = p_booking_id returning * into v_row;
  elsif p_kind = 'deposit' then
    if v_row.deposit_status <> 'pending' then
      raise exception 'payment_already_recorded' using errcode = 'P0001';
    end if;
    update public.bookings
       set deposit_status = 'received', deposit_received_at = p_at, deposit_payment_method = p_method,
           deposit_received_marked_by = private.actor_id()
     where id = p_booking_id returning * into v_row;
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  return v_row;
end;
$$;

-- Return of the deposit after the rental: the amount is the deposit minus the approved
-- settlement (computed by the app as a proposal, editable). A cancelled booking may return
-- the deposit without a settlement.
create or replace function public.record_deposit_return(
  p_booking_id uuid,
  p_amount     integer,
  p_at         timestamptz,
  p_method     public.payment_method,
  p_note       text default null
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bookings;
begin
  if not private.is_staff('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.bookings where id = p_booking_id for update;
  if v_row.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_row.deposit_status <> 'received' then
    raise exception 'deposit_not_received' using errcode = 'P0001';
  end if;
  if v_row.status not in ('completed', 'cancelled') then
    raise exception 'booking_not_finished' using errcode = 'P0001';
  end if;
  if v_row.status = 'completed' and not exists (
    select 1 from public.settlements s where s.booking_id = p_booking_id and s.approved_at is not null
  ) then
    raise exception 'settlement_not_approved' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > v_row.deposit_cents then
    raise exception 'invalid_amount' using errcode = '23514';
  end if;
  if p_at is null or p_at > now() + interval '1 day' then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;

  update public.bookings
     set deposit_status = case when p_amount = v_row.deposit_cents then 'returned' else 'partially_returned' end::public.deposit_status,
         deposit_returned_cents = p_amount, deposit_returned_at = p_at, deposit_return_method = p_method,
         deposit_return_note = nullif(btrim(coalesce(p_note, '')), ''),
         deposit_returned_marked_by = private.actor_id()
   where id = p_booking_id returning * into v_row;
  return v_row;
end;
$$;

-- Refund of a paid rental (cancelled bookings).
create or replace function public.record_rental_refund(
  p_booking_id uuid,
  p_amount     integer,
  p_at         timestamptz,
  p_method     public.payment_method,
  p_note       text default null
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bookings;
begin
  if not private.is_staff('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.bookings where id = p_booking_id for update;
  if v_row.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_row.rental_payment_status <> 'paid' then
    raise exception 'rental_not_paid' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_row.total_cents then
    raise exception 'invalid_amount' using errcode = '23514';
  end if;
  if p_at is null or p_at > now() + interval '1 day' then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;
  update public.bookings
     set rental_payment_status = case when p_amount = v_row.total_cents then 'refunded' else 'partially_refunded' end::public.rental_payment_status,
         rental_refunded_cents = p_amount, rental_refunded_at = p_at, rental_refund_method = p_method,
         rental_refund_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_booking_id returning * into v_row;
  return v_row;
end;
$$;

-- Undo a wrongly recorded payment step (managers; the audit log keeps the history).
-- p_kind: rental | deposit | deposit_return | rental_refund
create or replace function public.undo_payment(p_booking_id uuid, p_kind text) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bookings;
begin
  if not private.is_staff('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.bookings where id = p_booking_id for update;
  if v_row.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_kind = 'rental' then
    if v_row.rental_payment_status <> 'paid' then raise exception 'nothing_to_undo' using errcode = 'P0001'; end if;
    update public.bookings set rental_payment_status = 'unpaid', rental_paid_at = null, rental_paid_marked_by = null
     where id = p_booking_id returning * into v_row;
  elsif p_kind = 'rental_refund' then
    if v_row.rental_payment_status not in ('refunded', 'partially_refunded') then raise exception 'nothing_to_undo' using errcode = 'P0001'; end if;
    update public.bookings set rental_payment_status = 'paid', rental_refunded_cents = null, rental_refunded_at = null,
           rental_refund_method = null, rental_refund_note = null
     where id = p_booking_id returning * into v_row;
  elsif p_kind = 'deposit' then
    if v_row.deposit_status <> 'received' then raise exception 'nothing_to_undo' using errcode = 'P0001'; end if;
    update public.bookings set deposit_status = 'pending', deposit_received_at = null, deposit_received_marked_by = null
     where id = p_booking_id returning * into v_row;
  elsif p_kind = 'deposit_return' then
    if v_row.deposit_status not in ('returned', 'partially_returned') then raise exception 'nothing_to_undo' using errcode = 'P0001'; end if;
    update public.bookings set deposit_status = 'received', deposit_returned_cents = null, deposit_returned_at = null,
           deposit_return_method = null, deposit_return_note = null, deposit_returned_marked_by = null
     where id = p_booking_id returning * into v_row;
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  return v_row;
end;
$$;

revoke execute on function public.record_payment(uuid, text, timestamptz, public.payment_method) from public, anon;
revoke execute on function public.record_deposit_return(uuid, integer, timestamptz, public.payment_method, text) from public, anon;
revoke execute on function public.record_rental_refund(uuid, integer, timestamptz, public.payment_method, text) from public, anon;
revoke execute on function public.undo_payment(uuid, text) from public, anon;
grant execute on function public.record_payment(uuid, text, timestamptz, public.payment_method) to authenticated, service_role;
grant execute on function public.record_deposit_return(uuid, integer, timestamptz, public.payment_method, text) to authenticated, service_role;
grant execute on function public.record_rental_refund(uuid, integer, timestamptz, public.payment_method, text) to authenticated, service_role;
grant execute on function public.undo_payment(uuid, text) to authenticated, service_role;

-- ───────────────────────── pickup needs both payments ─────────────────────────
-- Client decision (Phase 9): the rental must be paid and the deposit received before the
-- car is handed over. Switchable in Settings (`require_payment_before_pickup`).
insert into public.settings (key, value, is_public) values ('require_payment_before_pickup', 'true'::jsonb, false)
on conflict (key) do nothing;

create or replace function public.sign_protocol(
  p_protocol_id uuid,
  p_customer_signature_path text,
  p_staff_signature_path text
) returns public.handover_protocols
language plpgsql security definer set search_path = '' as $$
declare
  v_row     public.handover_protocols;
  v_booking public.bookings;
  v_pickup  public.handover_protocols;
  v_prefix  text;
  v_to      public.booking_status;
begin
  if not private.is_staff('operator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.handover_protocols where id = p_protocol_id for update;
  if v_row.id is null or v_row.signed_at is not null then
    raise exception 'protocol_not_editable' using errcode = 'P0001';
  end if;
  select * into v_booking from public.bookings where id = v_row.booking_id for update;

  if v_row.handover_at is null then raise exception 'protocol_incomplete: handover_at' using errcode = 'P0001'; end if;
  if v_row.odometer_km is null then raise exception 'protocol_incomplete: odometer' using errcode = 'P0001'; end if;
  if v_row.fuel_level is null and v_row.charge_level is null then raise exception 'protocol_incomplete: fuel' using errcode = 'P0001'; end if;
  if v_row.signed_by_name is null or v_row.staff_name is null then raise exception 'protocol_incomplete: names' using errcode = 'P0001'; end if;
  if (select count(distinct ph.angle) from public.protocol_photos ph
       where ph.protocol_id = p_protocol_id and ph.angle in ('front', 'rear', 'left', 'right')) < 4 then
    raise exception 'protocol_incomplete: photos' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.protocol_damages d where d.protocol_id = p_protocol_id and d.description = '') then
    raise exception 'protocol_incomplete: damage_description' using errcode = 'P0001';
  end if;
  v_prefix := v_row.booking_id::text || '/';
  if coalesce(p_customer_signature_path, '') = '' or coalesce(p_staff_signature_path, '') = ''
     or left(p_customer_signature_path, length(v_prefix)) <> v_prefix or left(p_staff_signature_path, length(v_prefix)) <> v_prefix then
    raise exception 'protocol_incomplete: signatures' using errcode = 'P0001';
  end if;
  -- First pickup protocol: payments must be recorded (individual price without an amount
  -- and a zero deposit are exempt).
  if v_row.type = 'pickup' and v_row.supersedes_id is null
     and coalesce((private.setting('require_payment_before_pickup'))::boolean, true)
     and ((v_booking.total_cents is not null and v_booking.total_cents > 0 and v_booking.rental_payment_status = 'unpaid')
          or (v_booking.deposit_cents > 0 and v_booking.deposit_status = 'pending')) then
    raise exception 'protocol_incomplete: payments' using errcode = 'P0001';
  end if;

  if v_row.type = 'return' then
    select * into v_pickup from public.handover_protocols
     where booking_id = v_row.booking_id and type = 'pickup' and signed_at is not null
     order by version desc limit 1;
    if v_pickup.id is not null and v_row.odometer_km < v_pickup.odometer_km then
      raise exception 'odometer_below_pickup' using errcode = 'P0001';
    end if;
  end if;

  if v_row.supersedes_id is null then
    if v_row.type = 'pickup' then
      if v_booking.status = 'confirmed' then v_to := 'active';
      elsif v_booking.status <> 'active' then raise exception 'booking_status_mismatch' using errcode = 'P0001';
      end if;
    else
      if v_booking.status = 'active' then v_to := 'completed';
      elsif v_booking.status <> 'completed' then raise exception 'booking_status_mismatch' using errcode = 'P0001';
      end if;
    end if;
  end if;

  update public.handover_protocols
     set signed_at = now(), customer_signature_path = p_customer_signature_path, staff_signature_path = p_staff_signature_path
   where id = p_protocol_id
   returning * into v_row;

  if v_to is not null then
    perform set_config('app.status_note', case when v_row.type = 'pickup' then 'Odovzdávací protokol podpísaný' else 'Preberací protokol podpísaný' end, true);
    update public.bookings set status = v_to where id = v_row.booking_id;
    perform set_config('app.status_note', '', true);
  end if;
  return v_row;
end;
$$;
revoke execute on function public.sign_protocol(uuid, text, text) from public, anon;
grant execute on function public.sign_protocol(uuid, text, text) to authenticated, service_role;

-- ───────────────────────── documents ─────────────────────────
-- Files live under `<booking_id>/` – the row and the storage object must agree.
create or replace function private.documents_check_path() returns trigger
language plpgsql set search_path = '' as $$
begin
  if left(new.storage_path, 37) <> new.booking_id::text || '/' or new.storage_path like '%..%' then
    raise exception 'invalid_storage_path' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger documents_check_path before insert or update of storage_path, booking_id on public.documents
  for each row execute function private.documents_check_path();

drop policy if exists btw_documents_insert on storage.objects;
create policy btw_documents_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (select private.is_staff('manager'))
    and exists (select 1 from public.bookings b where b.id::text = split_part(objects.name, '/', 1))
  );
-- A customer may download the documents of their own bookings (documents_select RLS limits
-- the inner query to those rows).
create policy btw_documents_customer_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (select 1 from public.documents d where d.storage_path = objects.name)
  );

-- ───────────────────────── customers ─────────────────────────
-- GDPR erasure (manager+). A customer without bookings is deleted; otherwise the personal
-- data is anonymised and bookings, invoices and signed protocols stay (accounting archive).
-- Deleting the Auth account is done by the server with the service role afterwards.
-- Returns 'deleted' | 'anonymized'. Idempotent for an already anonymised profile.
create or replace function public.anonymize_customer(p_profile_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_count   integer;
begin
  if not private.is_staff('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if v_profile.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_profile.type <> 'customer' or exists (select 1 from public.staff_roles sr where sr.user_id = p_profile_id) then
    raise exception 'not_a_customer' using errcode = 'P0001';
  end if;
  if v_profile.anonymized_at is not null then
    return 'anonymized';
  end if;
  if exists (select 1 from public.bookings b where b.customer_id = p_profile_id and b.status in ('new', 'confirmed', 'modified', 'active')) then
    raise exception 'customer_has_open_bookings' using errcode = 'P0001';
  end if;
  select count(*) into v_count from public.bookings where customer_id = p_profile_id;

  perform set_config('app.skip_audit', 'on', true);

  delete from public.auth_tokens where profile_id = p_profile_id;
  update public.email_log set recipient = 'anonymizovaný'
   where profile_id = p_profile_id or booking_id in (select id from public.bookings where customer_id = p_profile_id);

  if v_count = 0 then
    delete from public.consents where profile_id = p_profile_id;
    delete from public.profiles where id = p_profile_id;
  else
    update public.consents set ip = null, user_agent = null where profile_id = p_profile_id;
    delete from public.customer_internal where profile_id = p_profile_id;
    update public.bookings
       set customer_snapshot = jsonb_build_object('first_name', 'Anonymizovaný', 'last_name', 'zákazník', 'anonymized', true),
           customer_note = null, pickup_custom_address = null, return_custom_address = null
     where customer_id = p_profile_id;
    update public.profiles
       set email = null, first_name = 'Anonymizovaný', last_name = 'zákazník', phone = null, date_of_birth = null,
           is_company = false, company_name = null, ico = null, dic = null, ic_dph = null,
           billing_address = '{}'::jsonb, refund_iban = null, password_set = false, anonymized_at = now()
     where id = p_profile_id;
  end if;

  perform set_config('app.skip_audit', '', true);
  insert into public.audit_log (actor_id, entity, entity_id, action, diff)
  values (private.actor_id(), 'profiles', p_profile_id::text,
          case when v_count = 0 then 'customer.delete' else 'customer.anonymize' end,
          jsonb_build_object('bookings', v_count, 'requested_at', v_profile.deletion_requested_at));
  return case when v_count = 0 then 'deleted' else 'anonymized' end;
end;
$$;
revoke execute on function public.anonymize_customer(uuid) from public, anon;
grant execute on function public.anonymize_customer(uuid) to authenticated, service_role;

-- Customer list with booking count, revenue and last booking (staff only; the view runs
-- with the caller's rights so RLS applies).
create view public.admin_customers with (security_invoker = true) as
select
  p.id, p.email, p.first_name, p.last_name, p.phone, p.is_company, p.company_name, p.ico,
  p.password_set, p.deletion_requested_at, p.anonymized_at, p.created_at,
  coalesce(ci.is_blacklisted, false) as is_blacklisted,
  coalesce(b.bookings_count, 0) as bookings_count,
  coalesce(b.revenue_cents, 0) as revenue_cents,
  b.last_pickup_at
from public.profiles p
left join public.customer_internal ci on ci.profile_id = p.id
left join lateral (
  select count(*)::integer as bookings_count,
         coalesce(sum(x.total_cents) filter (where x.status in ('confirmed', 'modified', 'active', 'completed')), 0)::bigint as revenue_cents,
         max(x.pickup_at) as last_pickup_at
  from public.bookings x where x.customer_id = p.id
) b on true
where p.type = 'customer' and (select private.is_staff('operator'));
revoke all on public.admin_customers from anon;
revoke insert, update, delete, truncate on public.admin_customers from authenticated;
grant select on public.admin_customers to authenticated, service_role;
