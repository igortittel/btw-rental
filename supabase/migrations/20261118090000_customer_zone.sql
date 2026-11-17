-- BTW Rental – customer area (Phase 7): changes and cancellations by the customer,
-- approval of changes by staff.
set search_path = public, extensions;

-- ───────────────────────── Shared: write a booking record ─────────────────────────
-- Applies the columns and extras built by lib/booking/record.ts to an existing booking.
-- SECURITY INVOKER: with a staff session RLS and the audit log apply; SECURITY DEFINER
-- callers below have checked the permission themselves. Never touches the status.
create or replace function private.apply_booking_record(p_booking_id uuid, p jsonb) returns public.bookings
language plpgsql security invoker set search_path = '' as $$
declare
  v_b jsonb := p -> 'booking';
  v_row public.bookings;
begin
  update public.bookings set
    vehicle_id             = (v_b ->> 'vehicle_id')::uuid,
    pickup_at              = (v_b ->> 'pickup_at')::timestamptz,
    return_at              = (v_b ->> 'return_at')::timestamptz,
    pickup_location_id     = (v_b ->> 'pickup_location_id')::uuid,
    return_location_id     = (v_b ->> 'return_location_id')::uuid,
    pickup_custom_address  = nullif(btrim(v_b ->> 'pickup_custom_address'), ''),
    return_custom_address  = nullif(btrim(v_b ->> 'return_custom_address'), ''),
    customer_note          = nullif(v_b ->> 'customer_note', ''),
    customer_snapshot      = v_b -> 'customer_snapshot',
    days                   = (v_b ->> 'days')::integer,
    price_snapshot         = v_b -> 'price_snapshot',
    subtotal_cents         = (v_b ->> 'subtotal_cents')::integer,
    total_cents            = (v_b ->> 'total_cents')::integer,
    vat_rate               = (v_b ->> 'vat_rate')::numeric,
    is_individual_price    = coalesce((v_b ->> 'is_individual_price')::boolean, false),
    price_override_reason  = nullif(v_b ->> 'price_override_reason', ''),
    deposit_cents          = (v_b ->> 'deposit_cents')::integer,
    rental_payment_method  = (v_b ->> 'rental_payment_method')::public.payment_method,
    deposit_payment_method = (v_b ->> 'deposit_payment_method')::public.payment_method,
    km_limit_per_day       = (v_b ->> 'km_limit_per_day')::integer,
    extra_km_cents         = (v_b ->> 'extra_km_cents')::integer,
    abroad_trip            = coalesce((v_b ->> 'abroad_trip')::boolean, false),
    abroad_countries       = nullif(v_b ->> 'abroad_countries', '')
  where id = p_booking_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'booking_not_editable' using errcode = 'P0002';
  end if;

  delete from public.booking_extras where booking_id = p_booking_id;
  insert into public.booking_extras (booking_id, extra_id, name_snapshot, quantity, unit_price_cents, pricing_type, total_cents)
  select p_booking_id, (e ->> 'extra_id')::uuid, e -> 'name_snapshot', (e ->> 'quantity')::integer,
         (e ->> 'unit_price_cents')::integer, (e ->> 'pricing_type')::public.extra_pricing_type, (e ->> 'total_cents')::integer
    from jsonb_array_elements(coalesce(p -> 'extras', '[]'::jsonb)) e;

  return v_row;
end;
$$;
revoke execute on function private.apply_booking_record(uuid, jsonb) from public, anon;
grant execute on function private.apply_booking_record(uuid, jsonb) to authenticated, service_role;

-- Staff edit now goes through the shared function (same behaviour as before).
create or replace function public.staff_update_booking(p_booking_id uuid, p jsonb) returns public.bookings
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.bookings b where b.id = p_booking_id and b.status in ('new', 'confirmed', 'active')) then
    raise exception 'booking_not_editable' using errcode = 'P0002';
  end if;
  return private.apply_booking_record(p_booking_id, p);
end;
$$;

-- ───────────────────────── Cancellation fee ─────────────────────────
-- Same rule as lib/cancellation.ts: the tier with the highest `min_hours` that is still
-- LESS than the hours left applies; nothing matching -> the lowest tier. No price -> 0.
create or replace function private.cancellation_fee_cents(p_total_cents integer, p_pickup_at timestamptz, p_now timestamptz default now())
returns integer language sql stable security definer set search_path = '' as $$
  with tiers as (
    select (t ->> 'min_hours')::numeric as min_hours, (t ->> 'fee_percent')::numeric as fee_percent
      from jsonb_array_elements(coalesce(private.setting('cancellation_tiers'),
             '[{"min_hours":72,"fee_percent":0},{"min_hours":24,"fee_percent":20},{"min_hours":0,"fee_percent":100}]'::jsonb)) t
  ), left_hours as (
    select extract(epoch from (p_pickup_at - p_now)) / 3600.0 as h
  ), chosen as (
    select coalesce(
      (select fee_percent from tiers, left_hours where left_hours.h > tiers.min_hours order by tiers.min_hours desc limit 1),
      (select fee_percent from tiers order by min_hours asc limit 1),
      0) as fee_percent
  )
  select case when p_total_cents is null then 0 else round(p_total_cents * (select fee_percent from chosen) / 100.0)::integer end;
$$;

-- The customer cancels their own booking. The fee is calculated HERE, never taken from
-- the caller. Allowed for new, confirmed and modified bookings (not once the rental runs).
create or replace function public.cancel_my_booking(p_booking_id uuid, p_reason text default null) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.bookings;
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.bookings where id = p_booking_id and customer_id = v_uid for update;
  if v_row.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if v_row.status not in ('new', 'confirmed', 'modified') then
    raise exception 'booking_not_cancellable' using errcode = 'P0001';
  end if;

  update public.bookings set
    status = 'cancelled',
    pending_change = null,
    cancelled_at = now(),
    cancelled_by = v_uid,
    cancellation_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), ''),
    cancellation_fee_cents = private.cancellation_fee_cents(v_row.total_cents, v_row.pickup_at)
  where id = p_booking_id
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.cancel_my_booking(uuid, text) from public, anon;
grant execute on function public.cancel_my_booking(uuid, text) to authenticated;

-- Licence plate of the customer's own booking – only once the booking is confirmed.
create or replace function public.my_booking_plate(p_booking_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select v.license_plate
    from public.bookings b join public.vehicles v on v.id = b.vehicle_id
   where b.id = p_booking_id and b.customer_id = (select auth.uid()) and b.status in ('confirmed', 'modified', 'active');
$$;
revoke execute on function public.my_booking_plate(uuid) from public, anon;
grant execute on function public.my_booking_plate(uuid) to authenticated;

-- ───────────────────────── Change requested by the customer ─────────────────────────
-- Called by trusted server code after it validated the change and calculated the price.
--   new        -> the booking is simply rewritten (stays new)
--   confirmed  -> the proposal is stored in pending_change and the status becomes
--                 `modified`; the row keeps the ORIGINAL values, so the vehicle stays
--                 blocked for the original term until staff decide.
create or replace function public.customer_update_booking(p_booking_id uuid, p_customer_id uuid, p jsonb) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bookings;
begin
  if not private.is_trusted_server() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.bookings where id = p_booking_id and customer_id = p_customer_id for update;
  if v_row.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;

  if v_row.status = 'new' then
    return private.apply_booking_record(p_booking_id, p);
  elsif v_row.status = 'confirmed' then
    update public.bookings
       set status = 'modified', pending_change = p || jsonb_build_object('requested_at', now())
     where id = p_booking_id
    returning * into v_row;
    update public.booking_status_history set changed_by = p_customer_id
     where booking_id = p_booking_id and to_status = 'modified' and changed_by is null;
    return v_row;
  end if;
  raise exception 'booking_not_editable' using errcode = 'P0001';
end;
$$;
revoke execute on function public.customer_update_booking(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.customer_update_booking(uuid, uuid, jsonb) to service_role;

-- Staff approve (apply the proposal) or reject (keep the original) a pending change.
-- Approving onto an occupied term fails on the exclusion constraint (23P01).
create or replace function public.resolve_booking_change(p_booking_id uuid, p_approve boolean, p_note text default null) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bookings;
begin
  if not (private.is_staff('operator') or private.is_trusted_server()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.bookings where id = p_booking_id for update;
  if v_row.id is null or v_row.status <> 'modified' then
    raise exception 'no_pending_change' using errcode = 'P0002';
  end if;

  perform set_config('app.status_note', coalesce(nullif(p_note, ''), case when p_approve then 'Úprava schválená' else 'Úprava zamietnutá' end), true);
  if p_approve then
    perform private.apply_booking_record(p_booking_id, v_row.pending_change);
  end if;
  update public.bookings set status = 'confirmed', pending_change = null where id = p_booking_id returning * into v_row;
  perform set_config('app.status_note', '', true);
  return v_row;
end;
$$;
revoke execute on function public.resolve_booking_change(uuid, boolean, text) from public, anon;
grant execute on function public.resolve_booking_change(uuid, boolean, text) to authenticated, service_role;
