-- Behaviour tests for the customer area (Phase 7). Run after migrations + seed:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/03_customer_zone.sql
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
create function pg_temp.login(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  if p_uid = '' then reset role; else set local role authenticated; end if;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'anna@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'boris@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'operator@example.com');
insert into public.staff_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000c1', 'operator');

create function pg_temp.record(p_from interval, p_to interval, p_total integer) returns jsonb language sql as $$
  select jsonb_build_object(
    'booking', jsonb_build_object(
      'vehicle_id', (select id from public.vehicles order by sort_order limit 1),
      'pickup_at', date_trunc('hour', now()) + p_from, 'return_at', date_trunc('hour', now()) + p_to,
      'pickup_location_id', (select id from public.locations where is_default),
      'return_location_id', (select id from public.locations where is_default),
      'pickup_custom_address', '', 'return_custom_address', '', 'customer_note', 'pozn',
      'customer_snapshot', jsonb_build_object('first_name', 'Anna'),
      'days', 3, 'price_snapshot', jsonb_build_object('ratePerDayCents', 7900),
      'subtotal_cents', p_total, 'total_cents', p_total, 'vat_rate', 23, 'is_individual_price', false,
      'deposit_cents', 100000, 'rental_payment_method', 'transfer', 'deposit_payment_method', 'cash',
      'km_limit_per_day', 300, 'extra_km_cents', 62, 'locale', 'sk', 'abroad_trip', false, 'abroad_countries', ''),
    'extras', jsonb_build_array(jsonb_build_object('extra_id', (select id from public.extras where code = 'child_seat'),
      'name_snapshot', jsonb_build_object('sk', 'Autosedačka'), 'quantity', 1, 'unit_price_cents', 400, 'pricing_type', 'per_day', 'total_cents', 1200)));
$$;
create function pg_temp.new_booking(p_customer uuid, p_from interval, p_to interval) returns uuid language sql as $$
  select (public.create_booking(pg_temp.record(p_from, p_to, 23700) || jsonb_build_object('customer_id', p_customer, 'consents', '[]'::jsonb)) ->> 'id')::uuid;
$$;

-- ── cancellation fee: same boundaries as lib/cancellation.ts ──
select pg_temp.expect(private.cancellation_fee_cents(23700, now() + interval '200 hours') = 0, 'more than 72 h: free');
select pg_temp.expect(private.cancellation_fee_cents(23700, now() + interval '72 hours', now()) = 4740, 'exactly 72 h: 20 %');
select pg_temp.expect(private.cancellation_fee_cents(23700, now() + interval '24 hours 1 minute', now()) = 4740, 'just over 24 h: 20 %');
select pg_temp.expect(private.cancellation_fee_cents(23700, now() + interval '24 hours', now()) = 23700, 'exactly 24 h: 100 %');
select pg_temp.expect(private.cancellation_fee_cents(23700, now() - interval '5 hours', now()) = 23700, 'after pick-up: 100 %');
select pg_temp.expect(private.cancellation_fee_cents(null, now() + interval '1 hour', now()) = 0, 'no price: free');
select pg_temp.expect(private.cancellation_fee_cents(3333, now() + interval '30 hours', now()) = 667, 'rounded to cents');

-- ── customer cancels ──
create temp table b1 as select pg_temp.new_booking('00000000-0000-0000-0000-00000000000a', '2 days', '5 days') as id;
create temp table b2 as select pg_temp.new_booking('00000000-0000-0000-0000-00000000000a', '20 days', '23 days') as id;
grant select on b1, b2 to authenticated;

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.cancel_my_booking((select id from b1))$$, 'booking_not_found', 'a customer cannot cancel someone else''s booking');
select pg_temp.expect((select public.my_booking_plate((select id from b1)) is null), 'no plate for someone else''s booking');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select public.my_booking_plate((select id from b1)) is null), 'no plate before confirmation');
select pg_temp.expect((select (public.cancel_my_booking((select id from b1), '  Zmena plánov  ')).cancellation_fee_cents = 4740), 'cancel 48 h ahead: 20 % calculated by the database');
select pg_temp.expect((select status = 'cancelled' and cancelled_by = '00000000-0000-0000-0000-00000000000a' and cancellation_reason = 'Zmena plánov' and cancelled_at is not null
  from public.bookings where id = (select id from b1)), 'cancellation stored with who, when and why');
select pg_temp.expect_error($$select public.cancel_my_booking((select id from b1))$$, 'booking_not_cancellable', 'cannot cancel twice');
with u as (update public.bookings set cancellation_fee_cents = 0 where id = (select id from b1) returning 1) select pg_temp.expect((select count(*) = 0 from u), 'a customer cannot change the fee directly (RLS hides the row from updates)');
select pg_temp.expect_error($$select public.customer_update_booking((select id from b2), '00000000-0000-0000-0000-00000000000a', '{}'::jsonb)$$, '42501', 'a customer cannot call the server-only change function');
select pg_temp.login('');

-- ── change of a NEW booking is applied directly ──
select pg_temp.expect((select (public.customer_update_booking((select id from b2), '00000000-0000-0000-0000-00000000000a', pg_temp.record('21 days', '25 days', 31600))).status = 'new'), 'new booking stays new after a change');
select pg_temp.expect((select total_cents = 31600 and pending_change is null and (select count(*) from public.booking_extras e where e.booking_id = b.id) = 1
  from public.bookings b where id = (select id from b2)), 'new values and extras are stored');
select pg_temp.expect_error($$select public.customer_update_booking((select id from b2), '00000000-0000-0000-0000-00000000000b', pg_temp.record('21 days', '25 days', 1))$$, 'booking_not_found', 'only the owner''s booking can be changed');

-- ── change of a CONFIRMED booking waits for approval ──
update public.bookings set status = 'confirmed' where id = (select id from b2);
select pg_temp.expect((select (public.customer_update_booking((select id from b2), '00000000-0000-0000-0000-00000000000a', pg_temp.record('30 days', '32 days', 15800))).status = 'modified'), 'confirmed booking becomes modified');
select pg_temp.expect((select total_cents = 31600 and pickup_at = date_trunc('hour', now()) + interval '21 days' and (pending_change -> 'booking' ->> 'total_cents')::int = 15800 and pending_change ? 'requested_at'
  from public.bookings where id = (select id from b2)), 'row keeps the original, the proposal is in pending_change');
select pg_temp.expect((select changed_by = '00000000-0000-0000-0000-00000000000a' from public.booking_status_history where booking_id = (select id from b2) and to_status = 'modified'), 'history names the customer');
select pg_temp.expect((select not public.is_vehicle_available((select vehicle_id from public.bookings where id = (select id from b2)), date_trunc('hour', now()) + interval '22 days', date_trunc('hour', now()) + interval '23 days')), 'original term stays blocked while waiting');
select pg_temp.expect_error($$select public.customer_update_booking((select id from b2), '00000000-0000-0000-0000-00000000000a', pg_temp.record('40 days', '42 days', 1))$$, 'booking_not_editable', 'no second change while one is pending');

-- ── staff decide ──
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$select public.resolve_booking_change((select id from b2), true)$$, '42501', 'a customer cannot approve their own change');
select pg_temp.expect((select public.my_booking_plate((select id from b2)) is not null), 'plate is visible once confirmed / modified');
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect((select (public.resolve_booking_change((select id from b2), false)).status = 'confirmed'), 'operator rejects');
select pg_temp.login('');
select pg_temp.expect((select total_cents = 31600 and pending_change is null from public.bookings where id = (select id from b2)), 'rejected: original values kept');
select pg_temp.expect((select count(*) = 1 from public.booking_status_history where booking_id = (select id from b2) and from_status = 'modified' and to_status = 'confirmed' and note = 'Úprava zamietnutá' and changed_by = '00000000-0000-0000-0000-0000000000c1'), 'rejection noted in history with the operator');

select public.customer_update_booking((select id from b2), '00000000-0000-0000-0000-00000000000a', pg_temp.record('30 days', '32 days', 15800));
-- another confirmed booking takes the proposed term meanwhile
create temp table b3 as select pg_temp.new_booking('00000000-0000-0000-0000-00000000000b', '30 days', '31 days') as id;
update public.bookings set status = 'confirmed' where id = (select id from b3);
grant select on b3 to authenticated;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_error($$select public.resolve_booking_change((select id from b2), true)$$, '23P01', 'approval onto an occupied term is refused');
select pg_temp.login('');
select pg_temp.expect((select status = 'modified' and total_cents = 31600 from public.bookings where id = (select id from b2)), 'refused approval changes nothing');
update public.bookings set status = 'cancelled' where id = (select id from b3);
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect((select (public.resolve_booking_change((select id from b2), true)).total_cents = 15800), 'operator approves once the term is free');
select pg_temp.login('');
select pg_temp.expect((select status = 'confirmed' and pending_change is null and pickup_at = date_trunc('hour', now()) + interval '30 days' and blocked_until = return_at + interval '4 hours'
  from public.bookings where id = (select id from b2)), 'approved: proposal applied, buffer recalculated');
select pg_temp.expect_error($$select public.resolve_booking_change((select id from b2), true)$$, 'no_pending_change', 'nothing left to resolve');

-- a modified booking can still be cancelled by the customer
select public.customer_update_booking((select id from b2), '00000000-0000-0000-0000-00000000000a', pg_temp.record('33 days', '35 days', 15800));
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select (public.cancel_my_booking((select id from b2))).status = 'cancelled'), 'customer cancels a booking with a pending change');
select pg_temp.login('');
select pg_temp.expect((select pending_change is null and cancellation_fee_cents = 0 from public.bookings where id = (select id from b2)), 'pending change dropped, far ahead = no fee');

rollback;
