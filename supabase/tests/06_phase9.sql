-- Behaviour tests for Phase 9: payments and deposit, documents, GDPR erasure, audit,
-- staff 2FA. Run after migrations + seed:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/06_phase9.sql
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
create function pg_temp.login(p_uid text, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claim.aal', p_aal, true);
  if p_uid = '' then reset role; else set local role authenticated; end if;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'anna@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'boris@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'dana@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'operator@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'manager@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'owner@example.com');
update public.profiles set type = 'staff' where email like '%r@example.com';
insert into public.staff_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'operator'),
  ('00000000-0000-0000-0000-0000000000c2', 'manager'),
  ('00000000-0000-0000-0000-0000000000c3', 'owner');
update public.profiles set first_name = 'Anna', last_name = 'Nová', phone = '+421 900 111 222', date_of_birth = '1990-01-01'
 where id = '00000000-0000-0000-0000-00000000000a';

create function pg_temp.new_booking(p_customer uuid, p_from interval, p_to interval) returns uuid language sql as $$
  select (public.create_booking(jsonb_build_object(
    'customer_id', p_customer, 'consents', '[]'::jsonb, 'extras', '[]'::jsonb,
    'booking', jsonb_build_object(
      'vehicle_id', (select id from public.vehicles order by sort_order limit 1),
      'pickup_at', date_trunc('hour', now()) + p_from, 'return_at', date_trunc('hour', now()) + p_to,
      'pickup_location_id', (select id from public.locations where is_default),
      'return_location_id', (select id from public.locations where is_default),
      'pickup_custom_address', 'Hlavná 1, Bratislava', 'return_custom_address', '', 'customer_note', 'Prosím detskú sedačku',
      'customer_snapshot', jsonb_build_object('first_name', 'Anna', 'last_name', 'Nová', 'email', 'anna@example.com'),
      'days', 3, 'price_snapshot', jsonb_build_object('ratePerDayCents', 7900),
      'subtotal_cents', 23700, 'total_cents', 23700, 'vat_rate', 23, 'is_individual_price', false,
      'deposit_cents', 100000, 'rental_payment_method', 'transfer', 'deposit_payment_method', 'cash',
      'km_limit_per_day', 300, 'extra_km_cents', 62, 'locale', 'sk', 'abroad_trip', false, 'abroad_countries', ''))) ->> 'id')::uuid;
$$;

create temp table b as select pg_temp.new_booking('00000000-0000-0000-0000-00000000000a', '2 days', '5 days') as id;
insert into public.consents (profile_id, booking_id, type, version, ip, user_agent)
  values ('00000000-0000-0000-0000-00000000000a', (select id from b), 'terms', 'v1', '10.0.0.1', 'Safari');
insert into public.email_log (booking_id, profile_id, type, recipient) values ((select id from b), '00000000-0000-0000-0000-00000000000a', 'booking_received', 'anna@example.com');
grant select on b to authenticated;
grant select, insert, delete on storage.objects to authenticated; -- as on Supabase

-- ── payments ──
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$select public.record_payment((select id from b), 'rental', now(), 'transfer')$$, 'forbidden', 'a customer cannot record a payment');

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_error($$select public.record_payment((select id from b), 'tip', now(), 'cash')$$, 'invalid_kind', 'unknown payment kind is refused');
select pg_temp.expect_error($$select public.record_payment((select id from b), 'rental', now() + interval '3 days', 'cash')$$, 'invalid_date', 'payment date cannot be in the future');
select public.record_payment((select id from b), 'rental', now(), 'terminal');
select pg_temp.expect((select rental_payment_status = 'paid' and rental_payment_method = 'terminal' and rental_paid_marked_by = '00000000-0000-0000-0000-0000000000c1' from public.bookings where id = (select id from b)), 'operator records the rental payment (method and who)');
select pg_temp.expect_error($$select public.record_payment((select id from b), 'rental', now(), 'terminal')$$, 'payment_already_recorded', 'a payment is not recorded twice');
select pg_temp.expect_error($$select public.undo_payment((select id from b), 'rental')$$, 'forbidden', 'an operator cannot undo a payment');
select public.record_payment((select id from b), 'deposit', now(), 'cash');
select pg_temp.expect((select deposit_status = 'received' and deposit_received_marked_by is not null from public.bookings where id = (select id from b)), 'operator records the deposit');
select pg_temp.expect_error($$select public.record_deposit_return((select id from b), 100000, now(), 'cash')$$, 'forbidden', 'an operator cannot return the deposit');

select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select public.undo_payment((select id from b), 'rental');
select pg_temp.expect((select rental_payment_status = 'unpaid' and rental_paid_at is null and rental_paid_marked_by is null from public.bookings where id = (select id from b)), 'manager undoes the rental payment');
select pg_temp.expect_error($$select public.undo_payment((select id from b), 'rental')$$, 'nothing_to_undo', 'nothing to undo twice');
select pg_temp.login('');
select pg_temp.expect((select count(*) = 2 from public.audit_log where entity = 'bookings' and entity_id = (select id from b)::text and diff ? 'rental_payment_status'), 'payment changes are in the audit log');
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select pg_temp.expect_error($$select public.record_deposit_return((select id from b), 100000, now(), 'cash')$$, 'booking_not_finished', 'deposit is returned only after the rental');
select public.record_payment((select id from b), 'rental', now(), 'transfer');

-- Finish the booking (as the server) and return the deposit.
select pg_temp.login('');
update public.bookings set status = 'confirmed' where id = (select id from b);
update public.bookings set status = 'active' where id = (select id from b);
update public.bookings set status = 'completed' where id = (select id from b);
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select pg_temp.expect_error($$select public.record_deposit_return((select id from b), 81400, now(), 'transfer')$$, 'settlement_not_approved', 'a completed rental needs an approved settlement');
insert into public.settlements (booking_id, fuel_cents, approved_at, approved_by) values ((select id from b), 18600, now(), '00000000-0000-0000-0000-0000000000c2');
select pg_temp.expect_error($$select public.record_deposit_return((select id from b), 100001, now(), 'transfer')$$, 'invalid_amount', 'cannot return more than the deposit');
select public.record_deposit_return((select id from b), 81400, now(), 'transfer', '  zrážka podľa vyúčtovania ');
select pg_temp.expect((select deposit_status = 'partially_returned' and deposit_returned_cents = 81400 and deposit_return_method = 'transfer'
  and deposit_return_note = 'zrážka podľa vyúčtovania' and deposit_returned_marked_by = '00000000-0000-0000-0000-0000000000c2' from public.bookings where id = (select id from b)), 'partial deposit return is recorded');
select public.undo_payment((select id from b), 'deposit_return');
select public.record_deposit_return((select id from b), 100000, now(), 'cash');
select pg_temp.expect((select deposit_status = 'returned' from public.bookings where id = (select id from b)), 'full return -> returned');

-- Rental refund
select pg_temp.expect_error($$select public.record_rental_refund((select id from b), 23701, now(), 'transfer')$$, 'invalid_amount', 'refund cannot exceed the price');
select public.record_rental_refund((select id from b), 10000, now(), 'transfer', 'kompenzácia');
select pg_temp.expect((select rental_payment_status = 'partially_refunded' and rental_refunded_cents = 10000 from public.bookings where id = (select id from b)), 'partial refund is recorded');
select public.undo_payment((select id from b), 'rental_refund');
select pg_temp.expect((select rental_payment_status = 'paid' and rental_refunded_cents is null from public.bookings where id = (select id from b)), 'refund can be undone');

-- ── documents ──
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_error($$insert into public.documents (booking_id, type, storage_path) values ((select id from b), 'invoice', (select id from b)::text || '/fa.pdf')$$, '%row-level security%', 'an operator cannot add a document');
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select pg_temp.expect_error($$insert into public.documents (booking_id, type, storage_path) values ((select id from b), 'invoice', 'other/fa.pdf')$$, 'invalid_storage_path', 'a document must be in its booking folder');
select pg_temp.expect_error($$insert into public.documents (booking_id, type, storage_path) values ((select id from b), 'invoice', (select id from b)::text || '/../x.pdf')$$, 'invalid_storage_path', 'no path traversal in a document path');
insert into public.documents (booking_id, type, number, storage_path, amount_cents, issued_at, file_name)
  values ((select id from b), 'invoice', 'FA2026-0001', (select id from b)::text || '/fa.pdf', 23700, current_date, 'fa.pdf');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('documents', 'not-a-booking/x.pdf')$$, '%row-level security%', 'storage upload only into an existing booking folder');
insert into storage.objects (bucket_id, name) values ('documents', (select id from b)::text || '/fa.pdf');
select pg_temp.expect((select count(*) = 1 from storage.objects where bucket_id = 'documents'), 'manager uploads the PDF');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) = 1 from public.documents), 'the customer sees the document of their booking');
select pg_temp.expect((select count(*) = 1 from storage.objects where bucket_id = 'documents'), 'the customer may download their document');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) = 0 from public.documents), 'another customer does not see it');
select pg_temp.expect((select count(*) = 0 from storage.objects where bucket_id = 'documents'), 'another customer cannot download it');

-- ── cron runs and customer list are staff-only ──
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) = 0 from public.admin_customers), 'a customer sees no rows in admin_customers');
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect((select bookings_count = 1 and revenue_cents = 23700 and first_name = 'Anna' from public.admin_customers where id = '00000000-0000-0000-0000-00000000000a'), 'admin_customers counts bookings and revenue');
select pg_temp.expect((select count(*) = 0 from public.admin_customers where id = '00000000-0000-0000-0000-0000000000c1'), 'staff are not listed as customers');

-- ── profile audit is redacted, customers' own edits are not logged ──
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update public.profiles set phone = '+421 900 000 001', refund_iban = 'SK00' where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select refund_iban = 'SK00' from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'a customer sets their refund IBAN');
select pg_temp.login('');
select pg_temp.expect((select count(*) = 0 from public.audit_log where entity = 'profiles' and entity_id = '00000000-0000-0000-0000-00000000000b'), 'a customer editing their profile is not audited');
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
update public.profiles set phone = '+421 900 000 002' where id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.login('');
select pg_temp.expect((select diff = '{"phone": {"changed": true}}'::jsonb from public.audit_log where entity = 'profiles' and entity_id = '00000000-0000-0000-0000-00000000000b'), 'staff profile edit is logged without the values');

-- ── GDPR erasure ──
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_error($$select public.anonymize_customer('00000000-0000-0000-0000-00000000000a')$$, 'forbidden', 'an operator cannot erase a customer');
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select pg_temp.expect_error($$select public.anonymize_customer('00000000-0000-0000-0000-0000000000c1')$$, 'not_a_customer', 'staff accounts cannot be erased here');
select pg_temp.login('');
create temp table b2 as select pg_temp.new_booking('00000000-0000-0000-0000-00000000000a', '20 days', '22 days') as id;
grant select on b2 to authenticated;
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select pg_temp.expect_error($$select public.anonymize_customer('00000000-0000-0000-0000-00000000000a')$$, 'customer_has_open_bookings', 'not while a booking is open');
select pg_temp.login('');
update public.bookings set status = 'cancelled' where id = (select id from b2);
insert into public.customer_internal (profile_id, is_blacklisted, internal_note) values ('00000000-0000-0000-0000-00000000000a', true, 'poznámka');
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select pg_temp.expect((select public.anonymize_customer('00000000-0000-0000-0000-00000000000a') = 'anonymized'), 'a customer with bookings is anonymised');
select pg_temp.login('');
select pg_temp.expect((select email is null and phone is null and date_of_birth is null and first_name = 'Anonymizovaný' and anonymized_at is not null
  from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'profile personal data removed');
select pg_temp.expect((select bool_and(customer_snapshot = '{"first_name": "Anonymizovaný", "last_name": "zákazník", "anonymized": true}'::jsonb
  and customer_note is null and pickup_custom_address is null) from public.bookings where customer_id = '00000000-0000-0000-0000-00000000000a'), 'booking snapshots anonymised');
select pg_temp.expect((select count(*) = 2 and bool_and(total_cents = 23700) from public.bookings where customer_id = '00000000-0000-0000-0000-00000000000a'), 'bookings and amounts stay');
select pg_temp.expect((select count(*) = 1 from public.documents where booking_id = (select id from b)), 'documents stay');
select pg_temp.expect((select ip is null and user_agent is null from public.consents where profile_id = '00000000-0000-0000-0000-00000000000a'), 'consents kept without IP and browser');
select pg_temp.expect((select bool_and(recipient = 'anonymizovaný') from public.email_log where booking_id = (select id from b)), 'e-mail log recipient removed');
select pg_temp.expect(not exists (select 1 from public.customer_internal where profile_id = '00000000-0000-0000-0000-00000000000a'), 'internal notes removed');
select pg_temp.expect((select count(*) = 1 from public.audit_log where entity_id = '00000000-0000-0000-0000-00000000000a' and action = 'customer.anonymize'), 'one audit entry for the anonymisation');
select pg_temp.expect(not exists (select 1 from public.audit_log where action <> 'customer.anonymize' and created_at = now() and diff::text like '%Nová%'), 'the audit log got no personal data from the anonymisation');
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select pg_temp.expect((select public.anonymize_customer('00000000-0000-0000-0000-00000000000a') = 'anonymized'), 'repeating is harmless');
select pg_temp.expect((select public.anonymize_customer('00000000-0000-0000-0000-00000000000d') = 'deleted'), 'a customer without bookings is deleted');
select pg_temp.login('');
select pg_temp.expect(not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000d'), 'profile row gone');

-- ── staff 2FA ──
select pg_temp.login('00000000-0000-0000-0000-0000000000c2', 'aal1');
select pg_temp.expect((select private.is_staff('manager')), 'without enforcement aal1 staff keep their rights');
select pg_temp.login('');
update public.settings set value = 'true'::jsonb where key = 'staff_mfa_enforced';
select pg_temp.login('00000000-0000-0000-0000-0000000000c2', 'aal1');
select pg_temp.expect(not (select private.is_staff('operator')), 'enforced: an aal1 session has no staff rights');
select pg_temp.expect((select count(*) = 0 from public.bookings), 'enforced: aal1 staff read no bookings');
select pg_temp.expect((select count(*) = 1 from public.staff_roles where user_id = '00000000-0000-0000-0000-0000000000c2'), 'enforced: own role row stays readable (the app shows the 2FA step)');
select pg_temp.login('00000000-0000-0000-0000-0000000000c2', 'aal2');
select pg_temp.expect((select private.is_staff('manager')), 'enforced: an aal2 session has its rights');
select pg_temp.expect((select count(*) > 0 from public.bookings), 'enforced: aal2 staff read bookings');

rollback;
