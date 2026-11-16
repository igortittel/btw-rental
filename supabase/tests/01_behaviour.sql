-- Behaviour tests for the Phase 1 schema. Run after migrations + seed on a scratch DB:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/01_behaviour.sql
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

create function pg_temp.as_user(p_role text, p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute format('set local role %I', p_role);
end $$;

-- ── fixtures (as trusted server) ──
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'anna@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'boris@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'operator@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'manager@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'owner@example.com');
update public.profiles set type = 'staff' where email like '%r@example.com';
insert into public.staff_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'operator'),
  ('00000000-0000-0000-0000-0000000000c2', 'manager'),
  ('00000000-0000-0000-0000-0000000000c3', 'owner');
insert into public.customer_internal (profile_id, is_blacklisted, blacklist_note)
values ('00000000-0000-0000-0000-00000000000a', true, 'secret');

create temp table t_ids as
select (select id from public.vehicles where vin = 'TESTBTW0000000001') as v1,
       (select id from public.locations where is_default) as loc;
grant select on t_ids to anon, authenticated;

create function pg_temp.book(p_customer uuid, p_from timestamptz, p_to timestamptz, p_status public.booking_status default 'new')
returns uuid language sql as $$
  insert into public.bookings (customer_id, vehicle_id, status, pickup_at, return_at, pickup_location_id, return_location_id,
    days, total_cents, subtotal_cents, vat_rate, deposit_cents, rental_payment_method, deposit_payment_method, km_limit_per_day, extra_km_cents)
  select p_customer, v1, p_status, p_from, p_to, loc, loc, 2, 15800, 15800, 23, 100000, 'transfer', 'cash', 300, 62 from t_ids
  returning id;
$$;

select pg_temp.expect((select count(*) = 5 from public.profiles where id::text like '00000000-0000-0000-0000-0000000000%'), 'profile is created for every auth user');

-- ── booking number, buffer, history ──
create temp table t_b as
select pg_temp.book('00000000-0000-0000-0000-00000000000a', '2027-03-01 10:00+01', '2027-03-03 10:00+01') as a1;
grant select on t_b to anon, authenticated;
select pg_temp.expect((select number = 'BTW-2027-0001' or number ~ '^BTW-20\d\d-0001$' from public.bookings, t_b where id = a1), 'booking number BTW-YYYY-0001');
select pg_temp.expect((select buffer_minutes = 240 and blocked_until = return_at + interval '4 hours' from public.bookings, t_b where id = a1), 'default 4 h buffer applied');
select pg_temp.expect((select count(*) = 1 from public.booking_status_history, t_b where booking_id = a1 and from_status is null and to_status = 'new'), 'history row on insert');

-- ── status transitions ──
select pg_temp.expect_error($$update public.bookings set status = 'active' where id = (select a1 from t_b)$$, 'invalid_status_transition%', 'new -> active rejected');
select pg_temp.expect_error($$update public.bookings set status = 'modified' where id = (select a1 from t_b)$$, '%', 'new -> modified rejected');
select public.change_booking_status((select a1 from t_b), 'confirmed', 'ok by phone');
select pg_temp.expect((select note = 'ok by phone' from public.booking_status_history, t_b where booking_id = a1 and to_status = 'confirmed'), 'status note recorded');
select pg_temp.expect_error($$insert into public.bookings (customer_id, vehicle_id, status, pickup_at, return_at, pickup_location_id, return_location_id, days, total_cents, vat_rate, deposit_cents, rental_payment_method, deposit_payment_method, km_limit_per_day, extra_km_cents)
  select '00000000-0000-0000-0000-00000000000a', v1, 'active', now(), now() + interval '1 day', loc, loc, 1, 1, 23, 1, 'cash', 'cash', 300, 62 from t_ids$$, 'invalid_initial_status', 'cannot insert as active');

-- ── double booking ──
select pg_temp.expect((select pg_temp.book('00000000-0000-0000-0000-00000000000b', '2027-03-02 10:00+01', '2027-03-04 10:00+01') is not null), 'overlapping NEW booking is allowed');
select pg_temp.expect_error($$update public.bookings set status = 'confirmed' where customer_id = '00000000-0000-0000-0000-00000000000b'$$, '23P01', 'confirming an overlapping booking is rejected');
select pg_temp.expect_error($$select pg_temp.book('00000000-0000-0000-0000-00000000000b', '2027-03-03 12:00+01', '2027-03-05 12:00+01', 'confirmed')$$, '23P01', 'booking inside the 4 h buffer is rejected');
select pg_temp.expect((select pg_temp.book('00000000-0000-0000-0000-00000000000b', '2027-03-03 14:00+01', '2027-03-05 14:00+01', 'confirmed') is not null), 'booking right after the buffer is accepted');
select pg_temp.expect((select not public.is_vehicle_available(v1, '2027-03-01 12:00+01', '2027-03-02 12:00+01') from t_ids), 'is_vehicle_available = false when taken');
select pg_temp.expect((select public.is_vehicle_available(v1, '2027-04-01 12:00+02', '2027-04-02 12:00+02') from t_ids), 'is_vehicle_available = true when free');
select pg_temp.expect((select not public.is_vehicle_available(v1, '2027-02-27 12:00+01', '2027-03-01 08:00+01') from t_ids), 'new booking must leave buffer before the next one');
select pg_temp.expect((select not public.is_vehicle_available(v1, '2027-04-01 12:00+02', '2027-04-02 12:00+02', null) from t_ids) is false, 'exclude param optional');

-- ── availability blocks ──
select pg_temp.expect_error($$insert into public.availability_blocks (vehicle_id, starts_at, ends_at, reason) select v1, '2027-03-02 00:00+01', '2027-03-02 12:00+01', 'service' from t_ids$$, '23P01', 'block over a confirmed booking is rejected');
insert into public.availability_blocks (vehicle_id, starts_at, ends_at, reason) select v1, '2027-05-01 00:00+02', '2027-05-03 00:00+02', 'stk' from t_ids;
select pg_temp.expect_error($$select pg_temp.book('00000000-0000-0000-0000-00000000000b', '2027-05-02 10:00+02', '2027-05-04 10:00+02', 'confirmed')$$, '23P01', 'confirmed booking over a block is rejected');
select pg_temp.expect((select count(*) = 4 and count(*) filter (where kind = 'pending') = 1 from t_ids, public.vehicle_availability(v1, '2027-01-01', '2028-01-01')), 'vehicle_availability returns booked + pending + block');

-- ── terminal states ──
select public.change_booking_status((select a1 from t_b), 'active');
select public.change_booking_status((select a1 from t_b), 'completed');
select pg_temp.expect_error($$update public.bookings set status = 'cancelled' where id = (select a1 from t_b)$$, 'invalid_status_transition%', 'completed is terminal');

-- ── protocols ──
create temp table t_p as
with ins as (insert into public.handover_protocols (booking_id, type, odometer_km) select a1, 'pickup', 1000 from t_b returning id) select id from ins;
insert into public.protocol_photos (protocol_id, angle, storage_path) select id, 'front', 'x.webp' from t_p;
update public.handover_protocols set signed_at = now(), signed_by_name = 'Anna' where id = (select id from t_p);
select pg_temp.expect_error($$update public.handover_protocols set odometer_km = 5 where id = (select id from t_p)$$, 'signed_protocol_is_immutable', 'signed protocol cannot be edited');
select pg_temp.expect_error($$delete from public.protocol_photos where protocol_id = (select id from t_p)$$, 'signed_protocol_is_immutable', 'photos of a signed protocol cannot be removed');
update public.handover_protocols set pdf_path = 'p.pdf' where id = (select id from t_p);
select pg_temp.expect((select pdf_path = 'p.pdf' from public.handover_protocols where id = (select id from t_p)), 'PDF can be attached once after signing');
grant select on t_p to authenticated;

-- ── RLS: anon ──
select pg_temp.as_user('anon', null);
select pg_temp.expect_error('select 1 from public.vehicles', '42501', 'anon cannot read vehicles table');
select pg_temp.expect_error('select 1 from public.bookings', '42501', 'anon cannot read bookings');
select pg_temp.expect_error('select 1 from public.settings', '42501', 'anon cannot read settings table');
select pg_temp.expect((select count(*) = 7 from public.public_vehicles), 'anon reads 7 vehicles through public_vehicles');
select pg_temp.expect((select count(*) = 0 from information_schema.columns where table_name = 'public_vehicles' and column_name in ('license_plate', 'assistance')), 'public_vehicles has no licence plate');
select pg_temp.expect((select count(*) = 0 from public.public_settings where key in ('bank', 'admin_notification_emails')), 'bank details are not public');
select pg_temp.expect((select (value)::int = 100000 from public.public_settings where key = 'deposit_cents'), 'public settings readable');
select pg_temp.expect((select count(*) > 0 from t_ids, public.vehicle_availability(v1, '2027-01-01', '2028-01-01')), 'anon can call vehicle_availability');
select pg_temp.expect_error($$select public.change_booking_status('00000000-0000-0000-0000-000000000000', 'cancelled')$$, '42501', 'anon cannot change booking status');
reset role;

-- ── RLS: customer Anna ──
select pg_temp.as_user('authenticated', '00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) = 1 from public.profiles), 'customer sees only own profile');
select pg_temp.expect((select count(*) = 1 from public.bookings), 'customer sees only own bookings');
select pg_temp.expect((select count(*) = 0 from public.vehicles), 'customer cannot read vehicles table (plates)');
select pg_temp.expect((select count(*) = 0 from public.customer_internal), 'customer cannot read own blacklist flag');
select pg_temp.expect((select count(*) = 0 from public.booking_notes), 'customer cannot read internal notes');
select pg_temp.expect((select count(*) = 0 from public.staff_roles), 'customer cannot read staff roles');
select pg_temp.expect((select count(*) = 0 from public.audit_log), 'customer cannot read audit log');
select pg_temp.expect((select count(*) = 1 from public.handover_protocols), 'customer sees own signed protocol');
update public.profiles set phone = '+421900111222' where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select phone = '+421900111222' from public.profiles), 'customer can edit own contact data');
select pg_temp.expect_error($$update public.profiles set type = 'staff' where id = '00000000-0000-0000-0000-00000000000a'$$, 'protected_profile_column', 'customer cannot promote themselves');
select pg_temp.expect_error($$insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-00000000000a', 'owner')$$, '42501', 'customer cannot grant themselves a role');
with u as (update public.bookings set total_cents = 1 returning 1) select pg_temp.expect((select count(*) = 0 from u), 'customer cannot update bookings');
with u as (update public.profiles set phone = 'x' where id = '00000000-0000-0000-0000-00000000000b' returning 1) select pg_temp.expect((select count(*) = 0 from u), 'customer cannot edit another profile');
select pg_temp.expect_error($$select public.change_booking_status((select a1 from t_b), 'cancelled')$$, '42501', 'customer cannot call change_booking_status');
reset role;

-- ── RLS: operator ──
select pg_temp.as_user('authenticated', '00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect((select count(*) = 7 from public.vehicles), 'operator reads vehicles');
select pg_temp.expect((select count(*) = 3 from public.bookings), 'operator reads all bookings');
with u as (update public.vehicles set name = 'x' returning 1) select pg_temp.expect((select count(*) = 0 from u), 'operator cannot edit vehicles');
select pg_temp.expect_error($$insert into public.extras (name, price_cents, pricing_type) values ('{"sk":"x"}', 1, 'per_day')$$, '42501', 'operator cannot create extras');
select pg_temp.expect((select count(*) = 0 from public.audit_log), 'operator cannot read audit log');
with u as (update public.settings set value = '1' where key = 'vat_rate' returning 1) select pg_temp.expect((select count(*) = 0 from u), 'operator cannot change settings');
reset role;

-- ── RLS: manager + audit ──
select pg_temp.as_user('authenticated', '00000000-0000-0000-0000-0000000000c2');
update public.vehicles set luggage = 4 where vin = 'TESTBTW0000000001';
select pg_temp.expect((select luggage = 4 from public.vehicles where vin = 'TESTBTW0000000001'), 'manager can edit vehicles');
update public.vehicles set vin = 'testbtw0000000001' where vin = 'TESTBTW0000000001';
select pg_temp.expect((select count(*) = 1 from public.vehicles where vin = 'TESTBTW0000000001'), 'VIN is normalised to upper case');
select pg_temp.expect_error($$insert into public.vehicle_categories (slug, name) values ('admin', '{"sk":"x"}')$$, '23514', 'reserved category slug rejected');
with u as (update public.settings set value = '1' where key = 'vat_rate' returning 1) select pg_temp.expect((select count(*) = 0 from u), 'manager cannot change settings');
select pg_temp.expect_error($$insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-00000000000b', 'operator')$$, '42501', 'manager cannot add staff');
reset role;

-- ── RLS: owner ──
select pg_temp.as_user('authenticated', '00000000-0000-0000-0000-0000000000c3');
select pg_temp.expect((select count(*) >= 1 from public.audit_log where entity = 'vehicles' and action = 'update' and actor_id = '00000000-0000-0000-0000-0000000000c2' and diff ? 'luggage'), 'owner reads audit log with the manager''s change');
update public.settings set value = '20' where key = 'vat_rate';
select pg_temp.expect((select value = '20' from public.settings where key = 'vat_rate'), 'owner can change settings');
with d as (delete from public.audit_log returning 1) select pg_temp.expect((select count(*) = 0 from d), 'owner cannot delete audit log rows');
reset role;
select pg_temp.expect_error($$delete from public.audit_log$$, '%not allowed%', 'audit log is append-only even for the server');
reset role;

rollback;
