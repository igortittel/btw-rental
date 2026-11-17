-- Security regression tests: what the public API roles may touch. Run after migrations + seed:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/05_security.sql
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

-- ── views are read-only for every API role ──
select pg_temp.expect(
  not exists (
    select 1
    from pg_class c, unnest(array['anon', 'authenticated']) as r(role)
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
      and (has_table_privilege(r.role, c.oid, 'insert') or has_table_privilege(r.role, c.oid, 'update')
        or has_table_privilege(r.role, c.oid, 'delete') or has_table_privilege(r.role, c.oid, 'truncate'))
  ),
  'no view in public is writable by anon or authenticated');

select pg_temp.expect(
  (select bool_and(has_table_privilege('anon', c.oid, 'select'))
   from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v' and c.relname like 'public\_%'),
  'anon can still read every public_* view');

-- ── anon reads no table directly (personal data lives in tables, never in views) ──
select pg_temp.expect(
  not exists (
    select 1 from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and has_table_privilege('anon', c.oid, 'select')
  ),
  'anon has no SELECT on any table in public');

select pg_temp.expect(
  not exists (
    select 1 from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
  ),
  'every table in public has RLS enabled');

-- ── the actual attack: an anonymous visitor rewriting data through a view ──
set local role anon;
select pg_temp.expect_error('update public.public_locations set surcharge_cents = 0', '42501', 'anon cannot update locations through the view');
select pg_temp.expect_error('delete from public.public_settings', '42501', 'anon cannot delete public settings');
select pg_temp.expect_error('update public.public_price_tiers set min_days = 1', '42501', 'anon cannot change price tiers');
select pg_temp.expect_error('insert into public.public_categories (slug, name) values (''x'', ''{"sk":"x"}'')', '42501', 'anon cannot add categories');
select pg_temp.expect_error('select email from public.profiles', '42501', 'anon cannot read profiles');
select pg_temp.expect_error('select customer_snapshot from public.bookings', '42501', 'anon cannot read bookings');
reset role;

-- ── a signed-in customer cannot write through the views either ──
set local role authenticated;
select pg_temp.expect_error('update public.public_locations set surcharge_cents = 0', '42501', 'customer cannot update locations through the view');
reset role;

rollback;
