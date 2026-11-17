-- Security fix: the public_* views must be read-only for API roles.
--
-- Supabase's default privileges grant ALL on every new relation in `public` to anon and
-- authenticated. For tables that is harmless (RLS decides), but the public_* views run with
-- the owner's rights (security_invoker = false, owner bypasses RLS) and the simple ones are
-- automatically updatable – so anon could INSERT / UPDATE / DELETE locations, price tiers,
-- categories and public settings through them. Views are for reading only: keep SELECT,
-- revoke everything else from every API role, for every view in `public` (also future ones
-- when this block is re-run; new views must do the same, see CLAUDE.md).
do $$
declare
  v record;
begin
  for v in
    select c.oid::regclass as rel
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
  loop
    execute format('revoke insert, update, delete, truncate, references, trigger on %s from anon, authenticated', v.rel);
  end loop;
end $$;
