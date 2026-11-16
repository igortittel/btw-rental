-- BTW Rental – delivery / collection at the customer's own address
--
-- The customer may ask for the vehicle to be delivered to, or collected from, an
-- address of their choice. The standard location stays referenced (it is the base the
-- distance is measured from); the fee depends on the distance and is set by staff.
set search_path = public, extensions;

alter table public.bookings
  add column pickup_custom_address text,
  add column return_custom_address text;

comment on column public.bookings.pickup_custom_address is 'Delivery address chosen by the customer; NULL = standard pick-up location.';
comment on column public.bookings.return_custom_address is 'Collection address chosen by the customer; NULL = standard return location.';

create or replace function public.create_booking(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_customer_id uuid := (p ->> 'customer_id')::uuid;
  v_b jsonb := p -> 'booking';
  v_profile jsonb := p -> 'profile';
  v_vehicle_id uuid := (v_b ->> 'vehicle_id')::uuid;
  v_pickup timestamptz := (v_b ->> 'pickup_at')::timestamptz;
  v_return timestamptz := (v_b ->> 'return_at')::timestamptz;
  v_ip inet;
  v_booking public.bookings;
  v_pending integer;
  v_blacklisted boolean;
begin
  if not private.is_trusted_server() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles pr where pr.id = v_customer_id and pr.anonymized_at is null) then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;

  -- Authoritative availability check (confirmed bookings incl. buffer, manual blocks).
  if not public.is_vehicle_available(v_vehicle_id, v_pickup, v_return) then
    raise exception 'vehicle_unavailable' using errcode = 'P0001';
  end if;

  -- Contact and billing data are written only when the caller says so (new account or
  -- the signed-in owner of the account) – an anonymous form must not overwrite the
  -- profile of an existing customer. The booking keeps its own snapshot either way.
  if coalesce((p ->> 'update_profile')::boolean, false) then
    update public.profiles set
      first_name      = v_profile ->> 'first_name',
      last_name       = v_profile ->> 'last_name',
      phone           = v_profile ->> 'phone',
      date_of_birth   = (v_profile ->> 'date_of_birth')::date,
      is_company      = coalesce((v_profile ->> 'is_company')::boolean, false),
      company_name    = v_profile ->> 'company_name',
      ico             = v_profile ->> 'ico',
      dic             = v_profile ->> 'dic',
      ic_dph          = v_profile ->> 'ic_dph',
      billing_address = coalesce(v_profile -> 'billing_address', '{}'::jsonb),
      locale          = case when v_profile ->> 'locale' = 'en' then 'en' else 'sk' end
    where id = v_customer_id;
  end if;

  insert into public.bookings (
    customer_id, vehicle_id, status, pickup_at, return_at, pickup_location_id, return_location_id,
    pickup_custom_address, return_custom_address,
    customer_note, customer_snapshot, days, price_snapshot, subtotal_cents, total_cents, vat_rate,
    is_individual_price, deposit_cents, rental_payment_method, deposit_payment_method,
    km_limit_per_day, extra_km_cents, locale, abroad_trip, abroad_countries, created_by
  ) values (
    v_customer_id, v_vehicle_id, 'new', v_pickup, v_return,
    (v_b ->> 'pickup_location_id')::uuid, (v_b ->> 'return_location_id')::uuid,
    nullif(btrim(v_b ->> 'pickup_custom_address'), ''), nullif(btrim(v_b ->> 'return_custom_address'), ''),
    nullif(v_b ->> 'customer_note', ''), coalesce(v_b -> 'customer_snapshot', '{}'::jsonb),
    (v_b ->> 'days')::integer, coalesce(v_b -> 'price_snapshot', '{}'::jsonb),
    (v_b ->> 'subtotal_cents')::integer, (v_b ->> 'total_cents')::integer, (v_b ->> 'vat_rate')::numeric,
    coalesce((v_b ->> 'is_individual_price')::boolean, false), (v_b ->> 'deposit_cents')::integer,
    (v_b ->> 'rental_payment_method')::public.payment_method, (v_b ->> 'deposit_payment_method')::public.payment_method,
    (v_b ->> 'km_limit_per_day')::integer, (v_b ->> 'extra_km_cents')::integer,
    case when v_b ->> 'locale' = 'en' then 'en' else 'sk' end,
    coalesce((v_b ->> 'abroad_trip')::boolean, false), nullif(v_b ->> 'abroad_countries', ''), 'customer'
  ) returning * into v_booking;

  -- The history row written by the trigger has no actor (service role); the booking
  -- was created by the customer.
  update public.booking_status_history set changed_by = v_customer_id
   where booking_id = v_booking.id and changed_by is null;

  insert into public.booking_extras (booking_id, extra_id, name_snapshot, quantity, unit_price_cents, pricing_type, total_cents)
  select v_booking.id, (e ->> 'extra_id')::uuid, e -> 'name_snapshot', (e ->> 'quantity')::integer,
         (e ->> 'unit_price_cents')::integer, (e ->> 'pricing_type')::public.extra_pricing_type, (e ->> 'total_cents')::integer
    from jsonb_array_elements(coalesce(p -> 'extras', '[]'::jsonb)) e;

  begin
    v_ip := nullif(p ->> 'ip', '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.consents (profile_id, booking_id, type, version, granted, ip, user_agent)
  select v_customer_id, v_booking.id, (c ->> 'type')::public.consent_type, c ->> 'version',
         coalesce((c ->> 'granted')::boolean, true), v_ip, left(p ->> 'user_agent', 500)
    from jsonb_array_elements(coalesce(p -> 'consents', '[]'::jsonb)) c;

  -- Information for the staff notification: other unconfirmed bookings of the same
  -- vehicle in the same term, and the internal blacklist flag.
  select count(*) into v_pending
    from public.bookings o
   where o.vehicle_id = v_vehicle_id and o.id <> v_booking.id and o.status = 'new'
     and tstzrange(o.pickup_at, o.blocked_until, '[)') && tstzrange(v_booking.pickup_at, v_booking.blocked_until, '[)');

  select coalesce((select ci.is_blacklisted from public.customer_internal ci where ci.profile_id = v_customer_id), false)
    into v_blacklisted;

  return jsonb_build_object(
    'id', v_booking.id,
    'number', v_booking.number,
    'pending_overlaps', v_pending,
    'is_blacklisted', v_blacklisted
  );
end;
$$;

revoke execute on function public.create_booking(jsonb) from public, anon, authenticated;
grant execute on function public.create_booking(jsonb) to service_role;
