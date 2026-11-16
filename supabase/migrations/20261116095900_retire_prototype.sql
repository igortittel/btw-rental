-- Retires the objects of the earlier prototype (if present) so the new schema can be
-- created with the same table names. Old tables are MOVED to schema `legacy_prototype`
-- (not exposed through the API), not dropped. On a fresh database this is a no-op.
--
-- To remove the old test data for good:  drop schema legacy_prototype cascade;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_new_user_link_bookings on auth.users;

drop policy if exists "vehicle_images_public_read" on storage.objects;
drop policy if exists "vehicle_images_admin_write" on storage.objects;
drop policy if exists "vehicle_images_admin_delete" on storage.objects;
drop policy if exists "admins_upload_docs" on storage.objects;
drop policy if exists "auth_view_own_docs" on storage.objects;
drop policy if exists "admins_delete_docs" on storage.objects;

drop function if exists public.check_booking_overlap() cascade;
drop function if exists public.set_booking_number() cascade;
drop function if exists public.update_booking_count() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.link_guest_bookings_on_signup() cascade;
drop function if exists public.link_user_bookings(uuid, text) cascade;
drop function if exists public.get_booked_ranges(uuid) cascade;
drop function if exists public.update_booking_statuses() cascade;
drop sequence if exists public.booking_number_seq;

do $$
declare
  t text;
  p record;
begin
  -- Only when the prototype's tables are there (recognised by its `maintenance` table).
  if to_regclass('public.maintenance') is null then
    return;
  end if;
  create schema if not exists legacy_prototype;
  revoke all on schema legacy_prototype from public;
  foreach t in array array['maintenance', 'bookings', 'profiles', 'vehicles'] loop
    if to_regclass('public.' || t) is not null then
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
      end loop;
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format('alter table public.%I set schema legacy_prototype', t);
    end if;
  end loop;
end;
$$;
