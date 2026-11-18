-- BTW Rental – Phase 9 fix: remember the paid AMOUNTS, not only "paid".
-- A booking can change after it was paid (customer change approved, staff edit); the
-- outstanding amount is then total − (paid − refunded), resp. deposit − received.
set search_path = public, extensions;

alter table public.bookings
  add column rental_paid_cents      integer check (rental_paid_cents >= 0),
  add column deposit_received_cents integer check (deposit_received_cents >= 0);

-- Existing records: what was marked paid was the price at that time.
update public.bookings set rental_paid_cents = total_cents where rental_payment_status <> 'unpaid' and rental_paid_cents is null;
update public.bookings set deposit_received_cents = deposit_cents where deposit_status <> 'pending' and deposit_received_cents is null;

-- Still owed for the rental (0 when paid in full or overpaid; NULL price = nothing owed yet).
create or replace function private.rental_outstanding_cents(b public.bookings) returns integer
language sql immutable set search_path = '' as $$
  select greatest(0, coalesce(b.total_cents, 0) - (coalesce(b.rental_paid_cents, 0) - coalesce(b.rental_refunded_cents, 0)));
$$;
create or replace function private.deposit_outstanding_cents(b public.bookings) returns integer
language sql immutable set search_path = '' as $$
  select case when b.deposit_status in ('returned', 'partially_returned') then 0
              else greatest(0, b.deposit_cents - coalesce(b.deposit_received_cents, 0)) end;
$$;

-- Records a payment of everything still owed (first payment or a top-up after a price
-- change). The amount is taken from the booking, never from the browser.
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
    if v_row.total_cents is null then
      raise exception 'price_not_set' using errcode = 'P0001';
    end if;
    if private.rental_outstanding_cents(v_row) = 0 then
      raise exception 'payment_already_recorded' using errcode = 'P0001';
    end if;
    update public.bookings
       set rental_payment_status = 'paid', rental_paid_at = p_at, rental_payment_method = p_method,
           rental_paid_cents = coalesce(v_row.rental_paid_cents, 0) + private.rental_outstanding_cents(v_row),
           rental_paid_marked_by = private.actor_id()
     where id = p_booking_id returning * into v_row;
  elsif p_kind = 'deposit' then
    if v_row.deposit_status not in ('pending', 'received') or private.deposit_outstanding_cents(v_row) = 0 then
      raise exception 'payment_already_recorded' using errcode = 'P0001';
    end if;
    update public.bookings
       set deposit_status = 'received', deposit_received_at = p_at, deposit_payment_method = p_method,
           deposit_received_cents = v_row.deposit_cents,
           deposit_received_marked_by = private.actor_id()
     where id = p_booking_id returning * into v_row;
  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  return v_row;
end;
$$;

-- Deposit return: at most what was received.
create or replace function public.record_deposit_return(
  p_booking_id uuid,
  p_amount     integer,
  p_at         timestamptz,
  p_method     public.payment_method,
  p_note       text default null
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_row      public.bookings;
  v_received integer;
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
  v_received := coalesce(v_row.deposit_received_cents, v_row.deposit_cents);
  if p_amount is null or p_amount < 0 or p_amount > v_received then
    raise exception 'invalid_amount' using errcode = '23514';
  end if;
  if p_at is null or p_at > now() + interval '1 day' then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;

  update public.bookings
     set deposit_status = case when p_amount = v_received then 'returned' else 'partially_returned' end::public.deposit_status,
         deposit_returned_cents = p_amount, deposit_returned_at = p_at, deposit_return_method = p_method,
         deposit_return_note = nullif(btrim(coalesce(p_note, '')), ''),
         deposit_returned_marked_by = private.actor_id()
   where id = p_booking_id returning * into v_row;
  return v_row;
end;
$$;

-- Refund of a paid rental: after a cancellation, or of an overpayment after the price went
-- down. At most what was paid; a second refund adds up.
create or replace function public.record_rental_refund(
  p_booking_id uuid,
  p_amount     integer,
  p_at         timestamptz,
  p_method     public.payment_method,
  p_note       text default null
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_row      public.bookings;
  v_paid     integer;
  v_refunded integer;
begin
  if not private.is_staff('manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.bookings where id = p_booking_id for update;
  if v_row.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_row.rental_payment_status = 'unpaid' then
    raise exception 'rental_not_paid' using errcode = 'P0001';
  end if;
  v_paid := coalesce(v_row.rental_paid_cents, v_row.total_cents, 0);
  v_refunded := coalesce(v_row.rental_refunded_cents, 0);
  if p_amount is null or p_amount <= 0 or v_refunded + p_amount > v_paid then
    raise exception 'invalid_amount' using errcode = '23514';
  end if;
  if p_at is null or p_at > now() + interval '1 day' then
    raise exception 'invalid_date' using errcode = 'P0001';
  end if;
  update public.bookings
     set rental_payment_status = case when v_refunded + p_amount = v_paid then 'refunded' else 'partially_refunded' end::public.rental_payment_status,
         rental_refunded_cents = v_refunded + p_amount, rental_refunded_at = p_at, rental_refund_method = p_method,
         rental_refund_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_booking_id returning * into v_row;
  return v_row;
end;
$$;

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
    update public.bookings set rental_payment_status = 'unpaid', rental_paid_at = null, rental_paid_cents = null, rental_paid_marked_by = null
     where id = p_booking_id returning * into v_row;
  elsif p_kind = 'rental_refund' then
    if v_row.rental_payment_status not in ('refunded', 'partially_refunded') and coalesce(v_row.rental_refunded_cents, 0) = 0 then
      raise exception 'nothing_to_undo' using errcode = 'P0001';
    end if;
    update public.bookings set rental_payment_status = 'paid', rental_refunded_cents = null, rental_refunded_at = null,
           rental_refund_method = null, rental_refund_note = null
     where id = p_booking_id returning * into v_row;
  elsif p_kind = 'deposit' then
    if v_row.deposit_status <> 'received' then raise exception 'nothing_to_undo' using errcode = 'P0001'; end if;
    update public.bookings set deposit_status = 'pending', deposit_received_at = null, deposit_received_cents = null, deposit_received_marked_by = null
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

-- sign_protocol: the pickup needs nothing outstanding (amounts, not just the status).
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
  if v_row.type = 'pickup' and v_row.supersedes_id is null
     and coalesce((private.setting('require_payment_before_pickup'))::boolean, true)
     and (private.rental_outstanding_cents(v_booking) > 0 or private.deposit_outstanding_cents(v_booking) > 0) then
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
