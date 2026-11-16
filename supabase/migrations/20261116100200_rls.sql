-- BTW Rental – Row Level Security (Phase 1)
--
-- Model
--   anon           no direct table access; reads only through public_* views and RPC
--   customer       reads own rows; edits own profile; everything else goes through
--                  server actions (service role) that validate and price on the server
--   operator       reads everything operational; changes bookings, writes protocols
--   manager        + manages catalogue, customers, documents, settlements
--   owner          + staff, settings, audit log
--   service_role   bypasses RLS (trusted server code only, never shipped to the client)
set search_path = public, extensions;

grant usage on schema private to anon, authenticated, service_role;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    -- Supabase grants table privileges to anon by default; anon must never touch tables directly.
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- ───────────── profiles ─────────────
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff('operator')));
-- Column protection (type, email, anonymized_at…) is enforced by trigger profiles_guard.
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.is_staff('manager')))
  with check (id = (select auth.uid()) or (select private.is_staff('manager')));
-- Inserts and deletes happen via the auth trigger / service role only.

create policy customer_internal_select on public.customer_internal for select to authenticated
  using ((select private.is_staff('operator')));
create policy customer_internal_insert on public.customer_internal for insert to authenticated
  with check ((select private.is_staff('manager')));
create policy customer_internal_update on public.customer_internal for update to authenticated
  using ((select private.is_staff('manager'))) with check ((select private.is_staff('manager')));
create policy customer_internal_delete on public.customer_internal for delete to authenticated
  using ((select private.is_staff('manager')));

create policy staff_roles_select on public.staff_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff('owner')));
create policy staff_roles_insert on public.staff_roles for insert to authenticated
  with check ((select private.is_staff('owner')));
create policy staff_roles_update on public.staff_roles for update to authenticated
  using ((select private.is_staff('owner'))) with check ((select private.is_staff('owner')));
-- No delete policy: staff are deactivated, not removed.

-- ───────────── catalogue: staff read, manager write ─────────────
do $$
declare t text;
begin
  foreach t in array array[
    'vehicle_categories', 'vehicles', 'vehicle_images', 'features', 'vehicle_features',
    'price_tiers', 'vehicle_prices', 'extras', 'vehicle_extras', 'locations', 'availability_blocks'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_staff(''operator'')))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_staff(''manager'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_staff(''manager''))) with check ((select private.is_staff(''manager'')))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_staff(''manager'')))', t || '_delete', t);
  end loop;
end;
$$;

-- ───────────── bookings ─────────────
create policy bookings_select on public.bookings for select to authenticated
  using (customer_id = (select auth.uid()) or (select private.is_staff('operator')));
create policy bookings_insert on public.bookings for insert to authenticated
  with check ((select private.is_staff('manager')));
create policy bookings_update on public.bookings for update to authenticated
  using ((select private.is_staff('operator'))) with check ((select private.is_staff('operator')));
-- No delete policy: bookings are cancelled, never deleted.

create policy booking_counters_select on public.booking_counters for select to authenticated
  using ((select private.is_staff('operator')));

create policy booking_extras_select on public.booking_extras for select to authenticated
  using ((select private.owns_booking(booking_id)) or (select private.is_staff('operator')));
create policy booking_extras_insert on public.booking_extras for insert to authenticated
  with check ((select private.is_staff('manager')));
create policy booking_extras_update on public.booking_extras for update to authenticated
  using ((select private.is_staff('manager'))) with check ((select private.is_staff('manager')));
create policy booking_extras_delete on public.booking_extras for delete to authenticated
  using ((select private.is_staff('manager')));

-- History is written by trigger only.
create policy booking_status_history_select on public.booking_status_history for select to authenticated
  using ((select private.owns_booking(booking_id)) or (select private.is_staff('operator')));

create policy booking_notes_select on public.booking_notes for select to authenticated
  using ((select private.is_staff('operator')));
create policy booking_notes_insert on public.booking_notes for insert to authenticated
  with check ((select private.is_staff('operator')) and author_id = (select auth.uid()));

-- Consents are written by the server together with the booking.
create policy consents_select on public.consents for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.is_staff('operator')));

-- ───────────── protocols ─────────────
-- Customers see only signed protocols of their own bookings.
create policy handover_protocols_select on public.handover_protocols for select to authenticated
  using (
    (select private.is_staff('operator'))
    or (signed_at is not null and (select private.owns_booking(booking_id)))
  );
create policy handover_protocols_insert on public.handover_protocols for insert to authenticated
  with check ((select private.is_staff('operator')));
create policy handover_protocols_update on public.handover_protocols for update to authenticated
  using ((select private.is_staff('operator'))) with check ((select private.is_staff('operator')));
create policy handover_protocols_delete on public.handover_protocols for delete to authenticated
  using ((select private.is_staff('operator')));

do $$
declare t text;
begin
  foreach t in array array['protocol_damages', 'protocol_photos'] loop
    execute format($f$
      create policy %I on public.%I for select to authenticated using (
        (select private.is_staff('operator'))
        or exists (
          select 1 from public.handover_protocols p
          where p.id = protocol_id and p.signed_at is not null and private.owns_booking(p.booking_id)
        )
      )$f$, t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_staff(''operator'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_staff(''operator''))) with check ((select private.is_staff(''operator'')))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_staff(''operator'')))', t || '_delete', t);
  end loop;
end;
$$;

-- ───────────── documents & settlements ─────────────
create policy documents_select on public.documents for select to authenticated
  using ((select private.owns_booking(booking_id)) or (select private.is_staff('operator')));
create policy documents_insert on public.documents for insert to authenticated
  with check ((select private.is_staff('manager')));
create policy documents_update on public.documents for update to authenticated
  using ((select private.is_staff('manager'))) with check ((select private.is_staff('manager')));
create policy documents_delete on public.documents for delete to authenticated
  using ((select private.is_staff('manager')));

create policy settlements_select on public.settlements for select to authenticated
  using (
    (select private.is_staff('operator'))
    or (approved_at is not null and (select private.owns_booking(booking_id)))
  );
create policy settlements_insert on public.settlements for insert to authenticated
  with check ((select private.is_staff('operator')));
create policy settlements_update on public.settlements for update to authenticated
  using ((select private.is_staff('manager'))) with check ((select private.is_staff('manager')));

-- ───────────── system ─────────────
create policy settings_select on public.settings for select to authenticated
  using ((select private.is_staff('operator')));
create policy settings_insert on public.settings for insert to authenticated
  with check ((select private.is_staff('owner')));
create policy settings_update on public.settings for update to authenticated
  using ((select private.is_staff('owner'))) with check ((select private.is_staff('owner')));

-- Written by the server (service role) only.
create policy email_log_select on public.email_log for select to authenticated
  using ((select private.is_staff('operator')));

-- Written by trigger only; read-only for the owner.
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select private.is_staff('owner')));
