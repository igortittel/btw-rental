-- BTW Rental – helper functions and triggers (Phase 1)
set search_path = public, extensions;

-- ───────────────────────── Auth helpers (schema `private`, not exposed via the API) ─────────────────────────
-- Actor of the current statement: the signed-in user, or `app.actor_id` set by trusted
-- server code that runs with the service role.
create or replace function private.actor_id() returns uuid
language sql stable set search_path = '' as $$
  select coalesce(
    (select auth.uid()),
    nullif(current_setting('app.actor_id', true), '')::uuid
  );
$$;

-- TRUE when the caller is an active staff member with at least `min_role`.
-- Roles live in a table (never in user-editable JWT metadata).
create or replace function private.is_staff(min_role public.staff_role default 'operator') returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_roles sr
    where sr.user_id = (select auth.uid()) and sr.is_active and sr.role >= min_role
  );
$$;

-- Service role / direct DB connections have no auth.uid(); they are trusted server code.
create or replace function private.is_trusted_server() returns boolean
language sql stable set search_path = '' as $$
  select (select auth.uid()) is null;
$$;

create or replace function private.setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.settings where key = p_key;
$$;

create or replace function private.owns_booking(p_booking_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id and b.customer_id = (select auth.uid())
  );
$$;

-- ───────────────────────── Generic triggers ─────────────────────────
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_updated_at before update on public.profiles for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.customer_internal for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.staff_roles for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.vehicles for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.handover_protocols for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.settlements for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.settings for each row execute function private.touch_updated_at();

-- Audit trail for admin-managed tables. Logs only when there is an actor (staff session or
-- app.actor_id), and stores just the changed columns.
create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.actor_id();
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb;
  v_id text;
begin
  if v_actor is null then
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

do $$
declare t text;
begin
  foreach t in array array[
    'staff_roles', 'customer_internal', 'vehicle_categories', 'vehicles', 'vehicle_images',
    'vehicle_features', 'features', 'price_tiers', 'vehicle_prices', 'extras', 'vehicle_extras',
    'locations', 'availability_blocks', 'bookings', 'booking_extras', 'booking_notes',
    'handover_protocols', 'documents', 'settlements', 'settings'
  ] loop
    execute format(
      'create trigger audit after insert or update or delete on public.%I
         for each row execute function private.audit()', t);
  end loop;
end;
$$;

-- The audit log is append-only.
create or replace function private.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% on % is not allowed', tg_op, tg_table_name using errcode = 'P0001';
end;
$$;
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function private.forbid_change();

-- ───────────────────────── Profiles ─────────────────────────
-- Create a profile for every new Auth user.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, first_name, last_name, locale)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'sk' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id and anonymized_at is null;
  return new;
end;
$$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- A signed-in customer may edit their own contact/billing data, but never the columns
-- that drive authorisation or lifecycle.
create or replace function private.profiles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_trusted_server() or private.is_staff('manager') then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.type is distinct from old.type
     or new.email is distinct from old.email
     or new.anonymized_at is distinct from old.anonymized_at
     or new.created_at is distinct from old.created_at then
    raise exception 'protected_profile_column' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

-- ───────────────────────── Vehicles ─────────────────────────
create or replace function private.vehicles_normalize() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.vin := upper(btrim(new.vin));
  new.license_plate := nullif(upper(btrim(new.license_plate)), '');
  return new;
end;
$$;
create trigger vehicles_normalize before insert or update on public.vehicles
  for each row execute function private.vehicles_normalize();

-- ───────────────────────── Bookings ─────────────────────────
create or replace function private.is_valid_status_transition(p_from public.booking_status, p_to public.booking_status)
returns boolean language sql immutable set search_path = '' as $$
  select case p_from
    when 'new'       then p_to in ('confirmed', 'cancelled')
    when 'confirmed' then p_to in ('modified', 'active', 'cancelled')
    when 'modified'  then p_to in ('confirmed', 'cancelled')
    when 'active'    then p_to = 'completed'
    else false -- completed, cancelled are terminal
  end;
$$;

create or replace function private.next_booking_number(p_at timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_year integer := extract(year from p_at at time zone 'Europe/Bratislava')::integer;
  v_n integer;
begin
  insert into public.booking_counters as c (year, last_number) values (v_year, 1)
  on conflict (year) do update set last_number = c.last_number + 1
  returning last_number into v_n;
  return 'BTW-' || v_year || '-' || lpad(v_n::text, 4, '0');
end;
$$;

create or replace function private.bookings_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('new', 'confirmed') then
      raise exception 'invalid_initial_status' using errcode = 'P0001';
    end if;
    new.number := private.next_booking_number(coalesce(new.created_at, now()));
    if new.buffer_minutes is null then
      select coalesce(v.buffer_minutes, (private.setting('default_buffer_minutes'))::integer, 240)
        into new.buffer_minutes
        from public.vehicles v where v.id = new.vehicle_id;
    end if;
  else
    if new.number is distinct from old.number or new.created_at is distinct from old.created_at then
      raise exception 'immutable_booking_column' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status
       and not private.is_valid_status_transition(old.status, new.status) then
      raise exception 'invalid_status_transition: % -> %', old.status, new.status using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;

  new.blocked_until := new.return_at + make_interval(mins => new.buffer_minutes);
  return new;
end;
$$;
create trigger bookings_before_write before insert or update on public.bookings
  for each row execute function private.bookings_before_write();

-- Every status change is recorded. The optional note comes from `app.status_note`
-- (set by change_booking_status()).
create or replace function private.bookings_log_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      private.actor_id(),
      nullif(current_setting('app.status_note', true), '')
    );
  end if;
  return new;
end;
$$;
create trigger bookings_log_status after insert or update on public.bookings
  for each row execute function private.bookings_log_status();

-- A blocking booking must not overlap a manual availability block (and vice versa).
-- Booking-vs-booking overlap is handled by the EXCLUDE constraint.
create or replace function private.bookings_check_blocks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('confirmed', 'modified', 'active') and exists (
    select 1 from public.availability_blocks ab
    where ab.vehicle_id = new.vehicle_id
      and tstzrange(ab.starts_at, ab.ends_at, '[)') && tstzrange(new.pickup_at, new.blocked_until, '[)')
  ) then
    raise exception 'vehicle_blocked' using errcode = '23P01';
  end if;
  return new;
end;
$$;
create trigger bookings_check_blocks
  after insert or update of status, pickup_at, return_at, buffer_minutes, vehicle_id on public.bookings
  for each row execute function private.bookings_check_blocks();

create or replace function private.blocks_check_bookings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.bookings b
    where b.vehicle_id = new.vehicle_id
      and b.status in ('confirmed', 'modified', 'active')
      and tstzrange(b.pickup_at, b.blocked_until, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'block_overlaps_booking' using errcode = '23P01';
  end if;
  return new;
end;
$$;
create trigger blocks_check_bookings after insert or update on public.availability_blocks
  for each row execute function private.blocks_check_bookings();

-- ───────────────────────── Protocols: signed = immutable ─────────────────────────
create or replace function private.protocols_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.signed_at is not null then
      raise exception 'signed_protocol_is_immutable' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.signed_at is not null then
    -- The only permitted change after signing: attach the generated PDF once.
    if old.pdf_path is null and new.pdf_path is not null
       and (to_jsonb(new) - 'pdf_path' - 'updated_at') = (to_jsonb(old) - 'pdf_path' - 'updated_at') then
      return new;
    end if;
    raise exception 'signed_protocol_is_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger protocols_immutable before update or delete on public.handover_protocols
  for each row execute function private.protocols_immutable();

create or replace function private.protocol_children_immutable() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_protocol_id uuid := coalesce(new.protocol_id, old.protocol_id);
begin
  if exists (select 1 from public.handover_protocols p where p.id = v_protocol_id and p.signed_at is not null) then
    raise exception 'signed_protocol_is_immutable' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger protocol_children_immutable before insert or update or delete on public.protocol_damages
  for each row execute function private.protocol_children_immutable();
create trigger protocol_children_immutable before insert or update or delete on public.protocol_photos
  for each row execute function private.protocol_children_immutable();

-- ───────────────────────── RPC ─────────────────────────
-- Staff-only status change with an optional note (recorded in booking_status_history).
create or replace function public.change_booking_status(
  p_booking_id uuid,
  p_to_status public.booking_status,
  p_note text default null
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bookings;
begin
  if not (private.is_staff('operator') or private.is_trusted_server()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update public.bookings set status = p_to_status where id = p_booking_id returning * into v_row;
  perform set_config('app.status_note', '', true);
  if v_row.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;
revoke execute on function public.change_booking_status(uuid, public.booking_status, text) from public, anon;
grant execute on function public.change_booking_status(uuid, public.booking_status, text) to authenticated, service_role;

-- Public availability feed for the calendar. No personal data, no block reasons.
--   booked  = confirmed / modified / active bookings (incl. buffer) and manual blocks
--   pending = new bookings waiting for confirmation (do not block)
create or replace function public.vehicle_availability(
  p_vehicle_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns table (starts_at timestamptz, ends_at timestamptz, kind text)
language sql stable security definer set search_path = '' as $$
  select b.pickup_at, b.blocked_until, 'booked'::text
    from public.bookings b
   where b.vehicle_id = p_vehicle_id
     and b.status in ('confirmed', 'modified', 'active')
     and b.pickup_at < p_to and b.blocked_until > p_from
  union all
  select b.pickup_at, b.return_at, 'pending'::text
    from public.bookings b
   where b.vehicle_id = p_vehicle_id
     and b.status = 'new'
     and b.pickup_at < p_to and b.return_at > p_from
  union all
  select ab.starts_at, ab.ends_at, 'booked'::text
    from public.availability_blocks ab
   where ab.vehicle_id = p_vehicle_id
     and ab.starts_at < p_to and ab.ends_at > p_from
  order by 1;
$$;
grant execute on function public.vehicle_availability(uuid, timestamptz, timestamptz) to anon, authenticated, service_role;

-- TRUE when the vehicle can be booked for the given window (buffer applied to the new
-- booking as well as to existing ones). `p_exclude_booking_id` is used when editing.
create or replace function public.is_vehicle_available(
  p_vehicle_id uuid,
  p_pickup_at timestamptz,
  p_return_at timestamptz,
  p_exclude_booking_id uuid default null
) returns boolean
language sql stable security definer set search_path = '' as $$
  with v as (
    select coalesce(v.buffer_minutes, (private.setting('default_buffer_minutes'))::integer, 240) as buffer_minutes
      from public.vehicles v
     where v.id = p_vehicle_id and v.is_active and v.for_rental
  ), w as (
    select tstzrange(p_pickup_at, p_return_at + make_interval(mins => v.buffer_minutes), '[)') as r from v
  )
  select exists (select 1 from w)
     and not exists (
       select 1 from public.bookings b, w
        where b.vehicle_id = p_vehicle_id
          and b.status in ('confirmed', 'modified', 'active')
          and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
          and tstzrange(b.pickup_at, b.blocked_until, '[)') && w.r
     )
     and not exists (
       select 1 from public.availability_blocks ab, w
        where ab.vehicle_id = p_vehicle_id
          and tstzrange(ab.starts_at, ab.ends_at, '[)') && w.r
     );
$$;
grant execute on function public.is_vehicle_available(uuid, timestamptz, timestamptz, uuid) to anon, authenticated, service_role;
