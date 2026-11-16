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

-- Booking entered by staff: starts confirmed, is attributed to the staff member.
create temp table r4 as select public.create_booking(pg_temp.payload('00000000-0000-0000-0000-00000000000a', '60 days', '62 days', false)
  || jsonb_build_object('created_by_staff_id', '00000000-0000-0000-0000-0000000000c2', 'status', 'confirmed')) as v;
select pg_temp.expect((select b.status = 'confirmed' and b.created_by = 'staff' and b.created_by_staff_id = '00000000-0000-0000-0000-0000000000c2'
  from public.bookings b where b.id = (select (v ->> 'id')::uuid from r4)), 'staff booking is confirmed and attributed');
select pg_temp.expect((select h.changed_by = '00000000-0000-0000-0000-0000000000c2' from public.booking_status_history h where h.booking_id = (select (v ->> 'id')::uuid from r4)), 'history names the staff member');
select pg_temp.expect_error($$select public.create_booking(pg_temp.payload('00000000-0000-0000-0000-00000000000a', '70 days', '72 days', false) || jsonb_build_object('status', 'active'))$$, 'invalid_initial_status', 'a booking cannot be created as active');

-- staff_update_booking: manager edits term, price and extras atomically; audit log has the actor.
create temp table upd as select (pg_temp.payload('00000000-0000-0000-0000-00000000000a', '61 days', '64 days', false) -> 'booking')
  || jsonb_build_object('days', 3, 'total_cents', 30000, 'subtotal_cents', 30000, 'price_override_reason', 'Dohodnutá cena') as b;
grant select on r4, upd to authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
set local role authenticated;
select pg_temp.expect((select (public.staff_update_booking((select (v ->> 'id')::uuid from r4), jsonb_build_object('booking', (select b from upd), 'extras', '[]'::jsonb))).total_cents = 30000), 'manager updates a booking');
select pg_temp.expect((select b.price_override_reason = 'Dohodnutá cena' and b.status = 'confirmed' and b.blocked_until = b.return_at + interval '4 hours'
  and not exists (select 1 from public.booking_extras e where e.booking_id = b.id)
  from public.bookings b where b.id = (select (v ->> 'id')::uuid from r4)), 'new values stored, extras replaced, buffer recalculated, status untouched');
select pg_temp.expect_error($$select public.staff_update_booking('00000000-0000-0000-0000-0000000000ee', '{"booking":{}}'::jsonb)$$, 'booking_not_editable', 'unknown booking is rejected');
-- moving it onto another confirmed booking is refused by the exclusion constraint
select pg_temp.expect_error($$select public.staff_update_booking((select (v ->> 'id')::uuid from r4), jsonb_build_object('booking', (pg_temp.payload('00000000-0000-0000-0000-00000000000a', '5 days', '8 days', false) -> 'booking'), 'extras', '[]'::jsonb))$$, '23P01', 'edit cannot create a double booking');
reset role;
-- (only the owner and the server can read the audit log)
select pg_temp.expect((select count(*) >= 1 from public.audit_log where entity = 'bookings' and action = 'update' and actor_id = '00000000-0000-0000-0000-0000000000c2' and diff ? 'total_cents'), 'edit is in the audit log with the actor');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
set local role authenticated;
select pg_temp.expect_error($$select public.staff_update_booking((select (v ->> 'id')::uuid from r4), jsonb_build_object('booking', (select b from upd), 'extras', '[]'::jsonb))$$, 'booking_not_editable', 'a customer cannot edit a booking through the staff function');
reset role;
select set_config('request.jwt.claim.sub', '', true);

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
