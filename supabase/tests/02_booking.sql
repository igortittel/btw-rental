-- Behaviour tests for create_booking() (Phase 5). Run after migrations + seed:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/02_booking.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.expect_error(p_sql text, p_like text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_like or sqlstate like p_like then
      raise notice 'ok   - % (%)', p_label, sqlstate;
      return;
    end if;
    raise exception 'FAIL - %: unexpected error % %', p_label, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL - %: statement succeeded', p_label;
end $$;

create function pg_temp.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL - %', p_label; end if;
  raise notice 'ok   - %', p_label;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'anna@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'boris@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'manager@example.com');
insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000c2', 'manager');
update public.profiles set first_name = 'Boris', phone = '+421900111222' where id = '00000000-0000-0000-0000-00000000000b';
insert into public.customer_internal (profile_id, is_blacklisted) values ('00000000-0000-0000-0000-00000000000b', true);

-- Payload builder: customer, days from now, whether to write the profile.
create function pg_temp.payload(p_customer uuid, p_from interval, p_to interval, p_update boolean) returns jsonb language sql as $$
  select jsonb_build_object(
    'customer_id', p_customer,
    'update_profile', p_update,
    'profile', jsonb_build_object('first_name', 'Anna', 'last_name', 'Nováková', 'phone', '+421900000001',
      'date_of_birth', '1990-05-17', 'is_company', false, 'billing_address',
      jsonb_build_object('street', 'Hlavná 1', 'city', 'Bratislava', 'zip', '81101', 'country', 'SK'), 'locale', 'sk'),
    'booking', jsonb_build_object(
      'vehicle_id', (select id from public.vehicles order by sort_order limit 1),
      'pickup_at', date_trunc('hour', now()) + p_from, 'return_at', date_trunc('hour', now()) + p_to,
      'pickup_location_id', (select id from public.locations where is_default),
      'return_location_id', (select id from public.locations where is_default),
      'customer_note', 'Prosím o detskú sedačku vzadu.', 'customer_snapshot', jsonb_build_object('first_name', 'Anna'),
      'days', 3, 'price_snapshot', jsonb_build_object('rate_per_day_cents', 7900),
      'subtotal_cents', 23700, 'total_cents', 24900, 'vat_rate', 23, 'is_individual_price', false,
      'deposit_cents', 100000, 'rental_payment_method', 'transfer', 'deposit_payment_method', 'cash',
      'km_limit_per_day', 300, 'extra_km_cents', 62, 'locale', 'sk', 'abroad_trip', true, 'abroad_countries', 'Rakúsko'),
    'extras', jsonb_build_array(jsonb_build_object(
      'extra_id', (select id from public.extras where code = 'child_seat'), 'name_snapshot', jsonb_build_object('sk', 'Autosedačka'),
      'quantity', 1, 'unit_price_cents', 400, 'pricing_type', 'per_day', 'total_cents', 1200)),
    'consents', jsonb_build_array(
      jsonb_build_object('type', 'terms', 'version', '1'), jsonb_build_object('type', 'gdpr', 'version', '1'),
      jsonb_build_object('type', 'deposit', 'version', '1'), jsonb_build_object('type', 'km_limit', 'version', '1'),
      jsonb_build_object('type', 'license', 'version', '1'), jsonb_build_object('type', 'marketing', 'version', '1', 'granted', false)),
    'ip', '203.0.113.7', 'user_agent', 'test');
$$;

create temp table r as select public.create_booking(pg_temp.payload('00000000-0000-0000-0000-00000000000a', '5 days', '8 days', true)) as v;

select pg_temp.expect((select v ->> 'number' ~ '^BTW-\d{4}-\d{4}$' from r), 'booking number is assigned');
select pg_temp.expect((select (v ->> 'pending_overlaps')::int = 0 and (v ->> 'is_blacklisted')::boolean = false from r), 'no overlap, not blacklisted');
select pg_temp.expect((select status = 'new' and created_by = 'customer' and total_cents = 24900 and abroad_trip and buffer_minutes = 240
                         from public.bookings where id = (select (v ->> 'id')::uuid from r)), 'booking row stored as new with snapshot values');
select pg_temp.expect((select count(*) = 1 and sum(total_cents) = 1200 from public.booking_extras where booking_id = (select (v ->> 'id')::uuid from r)), 'extras stored');
select pg_temp.expect((select count(*) = 6 and count(*) filter (where not granted) = 1 and bool_and(ip = '203.0.113.7')
                         from public.consents where booking_id = (select (v ->> 'id')::uuid from r)), 'consents stored with IP; declined marketing recorded');
select pg_temp.expect((select changed_by = '00000000-0000-0000-0000-00000000000a' and to_status = 'new' and from_status is null
                         from public.booking_status_history where booking_id = (select (v ->> 'id')::uuid from r)), 'history names the customer');
select pg_temp.expect((select last_name = 'Nováková' and date_of_birth = '1990-05-17' and billing_address ->> 'city' = 'Bratislava'
                         from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'profile filled for a new account');

-- Existing account booked anonymously: profile untouched, overlap and blacklist reported.
create temp table r2 as select public.create_booking(pg_temp.payload('00000000-0000-0000-0000-00000000000b', '6 days', '7 days', false)) as v;
select pg_temp.expect((select first_name = 'Boris' and phone = '+421900111222' from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'existing profile is not overwritten');
select pg_temp.expect((select (v ->> 'pending_overlaps')::int = 1 and (v ->> 'is_blacklisted')::boolean from r2), 'overlapping new booking and blacklist are reported');

-- A confirmed booking blocks the term (incl. the 4 h buffer).
update public.bookings set status = 'confirmed' where id = (select (v ->> 'id')::uuid from r);
select pg_temp.expect_error($$select public.create_booking(pg_temp.payload('00000000-0000-0000-0000-00000000000b', '7 days', '9 days', false))$$, 'vehicle_unavailable', 'confirmed booking blocks the term');
select pg_temp.expect_error($$select public.create_booking(pg_temp.payload('00000000-0000-0000-0000-00000000000b', '8 days 2 hours', '9 days', false))$$, 'vehicle_unavailable', 'preparation buffer blocks the term');
select pg_temp.expect((select public.create_booking(pg_temp.payload('00000000-0000-0000-0000-00000000000b', '8 days 4 hours', '9 days', false)) ->> 'number' is not null), 'term right after the buffer is free');

-- Delivery to the customer's own address is stored next to the standard location.
create temp table r3 as select public.create_booking(jsonb_set(jsonb_set(pg_temp.payload('00000000-0000-0000-0000-00000000000b', '50 days', '52 days', false),
  '{booking,pickup_custom_address}', '"  Letisko Schwechat "'), '{booking,return_custom_address}', '""')) as v;
select pg_temp.expect((select b.pickup_custom_address = 'Letisko Schwechat' and b.return_custom_address is null and b.pickup_location_id is not null
  from public.bookings b where b.id = (select (v ->> 'id')::uuid from r3)), 'own delivery address is stored trimmed, empty one as NULL');

-- Atomicity: a bad extra aborts the whole booking.
create temp table before_count as select count(*) as n from public.bookings;
select pg_temp.expect_error($$select public.create_booking(jsonb_set(pg_temp.payload('00000000-0000-0000-0000-00000000000b', '20 days', '21 days', false), '{extras,0,quantity}', '0'))$$, '23514', 'invalid extra is rejected');
select pg_temp.expect((select count(*) = (select n from before_count) from public.bookings), 'nothing is stored when a part fails');

select pg_temp.expect_error($$select public.create_booking(pg_temp.payload('00000000-0000-0000-0000-0000000000ff', '30 days', '31 days', false))$$, 'customer_not_found', 'unknown customer is rejected');

-- Only the server may call it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select pg_temp.expect_error($$select public.create_booking(pg_temp.payload('00000000-0000-0000-0000-00000000000b', '40 days', '41 days', false))$$, '42501', 'a signed-in user cannot call create_booking (function check)');
set local role authenticated;
select pg_temp.expect_error($$select public.create_booking('{}'::jsonb)$$, '42501', 'authenticated has no execute privilege');
reset role;
set local role anon;
select pg_temp.expect_error($$select public.create_booking('{}'::jsonb)$$, '42501', 'anon has no execute privilege');
reset role;

rollback;
