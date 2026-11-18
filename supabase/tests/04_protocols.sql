-- Behaviour tests for protocols and settlement (Phase 8). Run after migrations + seed:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/04_protocols.sql
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
  ('00000000-0000-0000-0000-0000000000c1', 'operator@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'manager@example.com');
insert into public.staff_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'operator'),
  ('00000000-0000-0000-0000-0000000000c2', 'manager');

create function pg_temp.new_booking(p_customer uuid, p_from interval, p_to interval) returns uuid language sql as $$
  select (public.create_booking(jsonb_build_object(
    'customer_id', p_customer, 'consents', '[]'::jsonb, 'extras', '[]'::jsonb,
    'booking', jsonb_build_object(
      'vehicle_id', (select id from public.vehicles order by sort_order limit 1),
      'pickup_at', date_trunc('hour', now()) + p_from, 'return_at', date_trunc('hour', now()) + p_to,
      'pickup_location_id', (select id from public.locations where is_default),
      'return_location_id', (select id from public.locations where is_default),
      'pickup_custom_address', '', 'return_custom_address', '', 'customer_note', '',
      'customer_snapshot', jsonb_build_object('first_name', 'Anna'),
      'days', 3, 'price_snapshot', jsonb_build_object('ratePerDayCents', 7900),
      'subtotal_cents', 23700, 'total_cents', 23700, 'vat_rate', 23, 'is_individual_price', false,
      'deposit_cents', 100000, 'rental_payment_method', 'transfer', 'deposit_payment_method', 'cash',
      'km_limit_per_day', 300, 'extra_km_cents', 62, 'locale', 'sk', 'abroad_trip', false, 'abroad_countries', ''))) ->> 'id')::uuid;
$$;

create function pg_temp.full_draft(p_booking uuid, p_km integer, p_damages jsonb default '[]') returns jsonb language sql as $$
  select jsonb_build_object(
    'handover_at', now(), 'odometer_km', p_km, 'fuel_level', 100,
    'cleanliness', jsonb_build_object('interior', 'clean', 'exterior', 'clean'),
    'accessories', jsonb_build_array(jsonb_build_object('key', 'vest', 'label', 'Reflexná vesta', 'present', true)),
    'note', '  ', 'signed_by_name', 'Anna Nová', 'staff_name', 'Jana Horváthová',
    'damages', p_damages,
    'photos', (select jsonb_agg(jsonb_build_object('angle', a, 'storage_path', p_booking::text || '/x/' || a || '.jpg')) from unnest(array['front', 'rear', 'left', 'right']) a));
$$;

create temp table b as select pg_temp.new_booking('00000000-0000-0000-0000-00000000000a', '2 days', '5 days') as id;
create temp table ids (name text primary key, id uuid);
grant select on b to authenticated;
grant all on ids to authenticated;

-- ── who may start ──
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$select public.start_protocol((select id from b), 'pickup')$$, 'forbidden', 'a customer cannot start a protocol');
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_error($$select public.start_protocol((select id from b), 'pickup')$$, 'booking_status_mismatch', 'no pickup protocol for an unconfirmed booking');
select public.change_booking_status((select id from b), 'confirmed');
select pg_temp.expect_error($$select public.start_protocol((select id from b), 'return')$$, 'booking_status_mismatch', 'no return protocol before the vehicle is handed over');

-- ── pickup ──
insert into ids select 'pickup', (public.start_protocol((select id from b), 'pickup')).id;
select pg_temp.expect((select (public.start_protocol((select id from b), 'pickup')).id = (select id from ids where name = 'pickup')), 'starting again returns the same draft');
select pg_temp.expect((select version = 1 and location_id is not null from public.handover_protocols where id = (select id from ids where name = 'pickup')), 'draft v1 with the pickup location');

select pg_temp.expect_error($$select public.save_protocol_draft((select id from ids where name = 'pickup'), jsonb_build_object('handover_at', now(), 'photos', jsonb_build_array(jsonb_build_object('angle', 'front', 'storage_path', 'other-booking/x.jpg'))))$$, 'invalid_storage_path', 'files from another booking folder are refused');

select public.save_protocol_draft((select id from ids where name = 'pickup'), pg_temp.full_draft((select id from b), 48210) - 'photos' ||
  jsonb_build_object('damages', jsonb_build_array(jsonb_build_object('view', 'left', 'x', 63, 'y', 62, 'kind', 'scratch', 'description', 'zadné dvere'))));
select pg_temp.expect((select note is null from public.handover_protocols where id = (select id from ids where name = 'pickup')), 'blank note stored as null');
select pg_temp.expect_error($$select public.sign_protocol((select id from ids where name = 'pickup'), (select id from b)::text || '/s/c.png', (select id from b)::text || '/s/s.png')$$, 'protocol_incomplete: photos', 'signing needs the four photos');

select public.save_protocol_draft((select id from ids where name = 'pickup'), pg_temp.full_draft((select id from b), 48210,
  jsonb_build_array(jsonb_build_object('view', 'left', 'x', 63, 'y', 62, 'kind', 'scratch', 'description', ''))));
select pg_temp.expect_error($$select public.sign_protocol((select id from ids where name = 'pickup'), (select id from b)::text || '/s/c.png', (select id from b)::text || '/s/s.png')$$, 'protocol_incomplete: damage_description', 'every damage needs a description');

select public.save_protocol_draft((select id from ids where name = 'pickup'), pg_temp.full_draft((select id from b), 48210,
  jsonb_build_array(jsonb_build_object('view', 'left', 'x', 63, 'y', 62, 'kind', 'scratch', 'description', 'zadné dvere'))));
select pg_temp.expect((select count(*) = 1 and bool_and(not is_new) from public.protocol_damages where protocol_id = (select id from ids where name = 'pickup')), 'saving replaces damages; pickup damages are not new');
select pg_temp.expect_error($$select public.sign_protocol((select id from ids where name = 'pickup'), 'elsewhere/c.png', (select id from b)::text || '/s/s.png')$$, 'protocol_incomplete: signatures', 'signatures must be in the booking folder');
-- Phase 9: rental paid and deposit received before the car is handed over.
select pg_temp.expect_error($$select public.sign_protocol((select id from ids where name = 'pickup'), (select id from b)::text || '/s/c.png', (select id from b)::text || '/s/s.png')$$, 'protocol_incomplete: payments', 'pickup needs the payments recorded');
select public.record_payment((select id from b), 'rental', now(), 'transfer');
select pg_temp.expect_error($$select public.sign_protocol((select id from ids where name = 'pickup'), (select id from b)::text || '/s/c.png', (select id from b)::text || '/s/s.png')$$, 'protocol_incomplete: payments', 'pickup needs the deposit too');
select public.record_payment((select id from b), 'deposit', now(), 'terminal');
select pg_temp.expect((select (public.sign_protocol((select id from ids where name = 'pickup'), (select id from b)::text || '/s/c.png', (select id from b)::text || '/s/s.png')).signed_at is not null), 'operator signs the pickup protocol');
select pg_temp.expect((select status = 'active' from public.bookings where id = (select id from b)), 'signed pickup protocol -> booking active');
select pg_temp.expect((select note = 'Odovzdávací protokol podpísaný' and changed_by = '00000000-0000-0000-0000-0000000000c1' from public.booking_status_history where booking_id = (select id from b) and to_status = 'active'), 'status history names the protocol and the staff member');

-- ── immutability ──
select pg_temp.expect_error($$select public.save_protocol_draft((select id from ids where name = 'pickup'), pg_temp.full_draft((select id from b), 1))$$, 'protocol_not_editable', 'a signed protocol cannot be saved');
select pg_temp.expect_error($$update public.handover_protocols set odometer_km = 1 where id = (select id from ids where name = 'pickup')$$, 'signed_protocol_is_immutable', 'a signed protocol cannot be updated');
select pg_temp.expect_error($$delete from public.protocol_damages where protocol_id = (select id from ids where name = 'pickup')$$, 'signed_protocol_is_immutable', 'damages of a signed protocol cannot be deleted');
select pg_temp.expect_error($$delete from public.handover_protocols where id = (select id from ids where name = 'pickup')$$, 'signed_protocol_is_immutable', 'a signed protocol cannot be deleted');
update public.handover_protocols set pdf_path = (select id from b)::text || '/p.pdf' where id = (select id from ids where name = 'pickup');
select pg_temp.expect((select pdf_path is not null from public.handover_protocols where id = (select id from ids where name = 'pickup')), 'the PDF can be attached once after signing');
select pg_temp.expect_error($$update public.handover_protocols set pdf_path = 'x.pdf' where id = (select id from ids where name = 'pickup')$$, 'signed_protocol_is_immutable', 'the PDF path cannot be replaced');

-- ── customer visibility ──
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) = 0 from public.handover_protocols), 'another customer sees no protocol');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) = 1 from public.handover_protocols where booking_id = (select id from b)), 'the customer sees the signed protocol');
select pg_temp.expect((select count(*) = 1 from public.protocol_damages), 'the customer sees its damages');

-- ── return ──
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
insert into ids select 'return', (public.start_protocol((select id from b), 'return')).id;
select pg_temp.expect((select signed_by_name = 'Anna Nová' from public.handover_protocols where id = (select id from ids where name = 'return')), 'return draft takes the name from the pickup protocol');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) = 1 from public.handover_protocols where booking_id = (select id from b)), 'the customer does not see the unsigned draft');
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select public.save_protocol_draft((select id from ids where name = 'return'), pg_temp.full_draft((select id from b), 48000));
select pg_temp.expect_error($$select public.sign_protocol((select id from ids where name = 'return'), (select id from b)::text || '/s/c2.png', (select id from b)::text || '/s/s2.png')$$, 'odometer_below_pickup', 'odometer below pickup is refused');
select public.save_protocol_draft((select id from ids where name = 'return'), pg_temp.full_draft((select id from b), 50195,
  jsonb_build_array(jsonb_build_object('view', 'right', 'x', 30, 'y', 60, 'kind', 'dent', 'description', 'blatník'))));
select pg_temp.expect((select bool_and(is_new) from public.protocol_damages where protocol_id = (select id from ids where name = 'return')), 'return damages are marked new');
select public.sign_protocol((select id from ids where name = 'return'), (select id from b)::text || '/s/c2.png', (select id from b)::text || '/s/s2.png');
select pg_temp.expect((select status = 'completed' from public.bookings where id = (select id from b)), 'signed return protocol -> booking completed');

-- ── correction ──
insert into ids select 'fix', (public.start_protocol((select id from b), 'pickup')).id;
select pg_temp.expect((select version = 2 and supersedes_id = (select id from ids where name = 'pickup') and odometer_km = 48210 and pdf_path is null and signed_at is null
  from public.handover_protocols where id = (select id from ids where name = 'fix')), 'correction = version 2 copied from the signed one');
select pg_temp.expect((select count(*) = 1 from public.protocol_damages where protocol_id = (select id from ids where name = 'fix')), 'correction copies the damages');
select pg_temp.expect((select count(*) = 4 from public.protocol_photos where protocol_id = (select id from ids where name = 'fix')), 'correction copies the photos');
select public.sign_protocol((select id from ids where name = 'fix'), (select id from b)::text || '/s/c3.png', (select id from b)::text || '/s/s3.png');
select pg_temp.expect((select status = 'completed' from public.bookings where id = (select id from b)), 'signing a correction leaves the status alone');
select pg_temp.expect((select count(*) = 2 and count(signed_at) = 2 from public.handover_protocols where booking_id = (select id from b) and type = 'pickup'), 'both versions stay stored');
insert into ids select 'draft2', (public.start_protocol((select id from b), 'pickup')).id;
delete from public.handover_protocols where id = (select id from ids where name = 'draft2');
select pg_temp.expect((select count(*) = 0 from public.handover_protocols where id = (select id from ids where name = 'draft2')), 'an unsigned draft can be discarded');

-- ── settlement ──
insert into public.settlements (booking_id, km_driven, extra_km, extra_km_cents, fuel_cents, damage_items, late_minutes) values ((select id from b), 1985, 485, 30070, 4500, '[]', 100);
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
update public.settlements set approved_at = now() where booking_id = (select id from b);
select pg_temp.expect((select approved_at is null from public.settlements where booking_id = (select id from b)), 'an operator cannot approve a settlement (RLS: manager)');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) = 0 from public.settlements), 'the customer does not see an unapproved settlement');
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
update public.settlements set approved_at = now(), approved_by = '00000000-0000-0000-0000-0000000000c2', damage_items = '[{"damage_id":"x","label":"blatník","cents":18000}]', damage_cents = 18000 where booking_id = (select id from b);
select pg_temp.expect((select total_cents = 52570 from public.settlements where booking_id = (select id from b)), 'manager approves; total = km + fuel + damage');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) = 1 from public.settlements), 'the customer sees the approved settlement');

-- ── storage: customer may read only the PDF of their own signed protocol ──
select pg_temp.login('');
insert into storage.objects (bucket_id, name) values ('protocols', (select id from b)::text || '/p.pdf'), ('protocols', 'someone-else/p.pdf'), ('protocol-media', (select id from b)::text || '/x/front.jpg');
grant select on storage.objects to authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) = 1 and bool_and(name = (select id from b)::text || '/p.pdf') from storage.objects), 'customer reads only their protocol PDF, no photos');
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) = 0 from storage.objects), 'another customer reads nothing');

rollback;
