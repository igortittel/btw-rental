-- BTW Rental – handover protocols and settlement (Phase 8)
--
--   start_protocol()       opens the draft of a pickup / return protocol, or a correcting
--                          version of a signed one
--   save_protocol_draft()  stores the whole draft (fields, damages, photos) in one transaction
--   sign_protocol()        validates, locks the protocol and moves the booking:
--                          pickup -> active, return -> completed
--
-- Signed protocols are immutable (triggers from Phase 1); a mistake is corrected by a new
-- version that points to the one it replaces.

alter table public.handover_protocols
  add column driver_license_no text,
  add column id_document_no    text;

alter table public.protocol_damages
  add column kind text not null default 'other'
    check (kind in ('scratch', 'dent', 'scuff', 'crack', 'other'));

-- One open draft per booking and type; versions are unique.
create unique index handover_protocols_one_draft_idx on public.handover_protocols (booking_id, type) where signed_at is null;
create unique index handover_protocols_version_idx on public.handover_protocols (booking_id, type, version);

alter table public.settlements
  add column damage_items jsonb not null default '[]'::jsonb, -- [{damage_id, label, cents}]
  add column late_minutes integer not null default 0 check (late_minutes >= 0),
  add column other_label  text;

-- ───────────────────────── start ─────────────────────────
create or replace function public.start_protocol(p_booking_id uuid, p_type public.protocol_type)
returns public.handover_protocols
language plpgsql set search_path = '' as $$
declare
  v_booking public.bookings;
  v_row     public.handover_protocols;
  v_prev    public.handover_protocols;
  v_pickup  public.handover_protocols;
begin
  if not private.is_staff('operator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;

  select * into v_row from public.handover_protocols
   where booking_id = p_booking_id and type = p_type and signed_at is null;
  if v_row.id is not null then
    return v_row;
  end if;

  select * into v_prev from public.handover_protocols
   where booking_id = p_booking_id and type = p_type and signed_at is not null
   order by version desc limit 1;

  if v_prev.id is not null then
    -- Correction: a new version that starts as a copy of the signed one.
    insert into public.handover_protocols (
      booking_id, type, version, supersedes_id, location_id, handover_at, odometer_km, fuel_level, charge_level,
      cleanliness, accessories, note, signed_by_name, staff_name, driver_license_no, id_document_no, created_by)
    values (
      p_booking_id, p_type, v_prev.version + 1, v_prev.id, v_prev.location_id, v_prev.handover_at, v_prev.odometer_km,
      v_prev.fuel_level, v_prev.charge_level, v_prev.cleanliness, v_prev.accessories, v_prev.note, v_prev.signed_by_name,
      v_prev.staff_name, v_prev.driver_license_no, v_prev.id_document_no, (select auth.uid()))
    returning * into v_row;
    insert into public.protocol_damages (protocol_id, view, x, y, kind, description, photo_path, is_new)
      select v_row.id, d.view, d.x, d.y, d.kind, d.description, d.photo_path, d.is_new
        from public.protocol_damages d where d.protocol_id = v_prev.id order by d.created_at, d.id;
    insert into public.protocol_photos (protocol_id, angle, storage_path)
      select v_row.id, ph.angle, ph.storage_path from public.protocol_photos ph where ph.protocol_id = v_prev.id;
    return v_row;
  end if;

  if p_type = 'pickup' and v_booking.status not in ('confirmed', 'active') then
    raise exception 'booking_status_mismatch' using errcode = 'P0001';
  end if;
  if p_type = 'return' and v_booking.status not in ('active', 'completed') then
    raise exception 'booking_status_mismatch' using errcode = 'P0001';
  end if;

  if p_type = 'return' then
    select * into v_pickup from public.handover_protocols
     where booking_id = p_booking_id and type = 'pickup' and signed_at is not null
     order by version desc limit 1;
  end if;

  insert into public.handover_protocols (booking_id, type, version, location_id, driver_license_no, id_document_no, signed_by_name, created_by)
  values (
    p_booking_id, p_type, 1,
    case when p_type = 'pickup' then v_booking.pickup_location_id else v_booking.return_location_id end,
    v_pickup.driver_license_no, v_pickup.id_document_no, v_pickup.signed_by_name, (select auth.uid()))
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.start_protocol(uuid, public.protocol_type) from public, anon;
grant execute on function public.start_protocol(uuid, public.protocol_type) to authenticated, service_role;

-- ───────────────────────── save draft ─────────────────────────
-- p_data: {handover_at, odometer_km, fuel_level, charge_level, cleanliness, accessories, note,
--          signed_by_name, staff_name, driver_license_no, id_document_no,
--          damages: [{id, view, x, y, kind, description, photo_path}], photos: [{angle, storage_path}]}
-- Runs with the caller's rights: RLS limits it to staff, the triggers refuse signed protocols.
create or replace function public.save_protocol_draft(p_protocol_id uuid, p_data jsonb)
returns public.handover_protocols
language plpgsql set search_path = '' as $$
declare
  v_row    public.handover_protocols;
  v_prefix text;
begin
  update public.handover_protocols set
    handover_at       = nullif(p_data->>'handover_at', '')::timestamptz,
    odometer_km       = nullif(p_data->>'odometer_km', '')::integer,
    fuel_level        = nullif(p_data->>'fuel_level', '')::integer,
    charge_level      = nullif(p_data->>'charge_level', '')::integer,
    cleanliness       = coalesce(p_data->'cleanliness', '{}'::jsonb),
    accessories       = coalesce(p_data->'accessories', '[]'::jsonb),
    note              = nullif(btrim(coalesce(p_data->>'note', '')), ''),
    signed_by_name    = nullif(btrim(coalesce(p_data->>'signed_by_name', '')), ''),
    staff_name        = nullif(btrim(coalesce(p_data->>'staff_name', '')), ''),
    driver_license_no = nullif(btrim(coalesce(p_data->>'driver_license_no', '')), ''),
    id_document_no    = nullif(btrim(coalesce(p_data->>'id_document_no', '')), '')
  where id = p_protocol_id and signed_at is null
  returning * into v_row;
  if v_row.id is null then
    raise exception 'protocol_not_editable' using errcode = 'P0001';
  end if;

  -- Files must live in the folder of this booking.
  v_prefix := v_row.booking_id::text || '/';
  if exists (select 1 from jsonb_array_elements(coalesce(p_data->'photos', '[]'::jsonb)) e where left(e->>'storage_path', length(v_prefix)) <> v_prefix)
     or exists (select 1 from jsonb_array_elements(coalesce(p_data->'damages', '[]'::jsonb)) e
                where coalesce(e->>'photo_path', '') <> '' and left(e->>'photo_path', length(v_prefix)) <> v_prefix) then
    raise exception 'invalid_storage_path' using errcode = 'P0001';
  end if;

  delete from public.protocol_damages where protocol_id = p_protocol_id;
  insert into public.protocol_damages (id, protocol_id, view, x, y, kind, description, photo_path, is_new, created_at)
    select coalesce(nullif(e.value->>'id', '')::uuid, gen_random_uuid()), p_protocol_id,
           (e.value->>'view')::public.damage_view, (e.value->>'x')::numeric, (e.value->>'y')::numeric,
           coalesce(nullif(e.value->>'kind', ''), 'other'), btrim(coalesce(e.value->>'description', '')),
           nullif(e.value->>'photo_path', ''), v_row.type = 'return',
           now() + make_interval(secs => e.ordinality * 0.001) -- keeps the order of the list
      from jsonb_array_elements(coalesce(p_data->'damages', '[]'::jsonb)) with ordinality e;

  delete from public.protocol_photos where protocol_id = p_protocol_id;
  insert into public.protocol_photos (protocol_id, angle, storage_path)
    select p_protocol_id, e->>'angle', e->>'storage_path'
      from jsonb_array_elements(coalesce(p_data->'photos', '[]'::jsonb)) e;

  return v_row;
end;
$$;
revoke execute on function public.save_protocol_draft(uuid, jsonb) from public, anon;
grant execute on function public.save_protocol_draft(uuid, jsonb) to authenticated, service_role;

-- ───────────────────────── sign ─────────────────────────
-- Errors: protocol_not_editable, protocol_incomplete: <what>, odometer_below_pickup,
-- booking_status_mismatch. The first version of a protocol moves the booking; a correcting
-- version leaves the status alone.
create or replace function public.sign_protocol(
  p_protocol_id uuid,
  p_customer_signature_path text,
  p_staff_signature_path text
) returns public.handover_protocols
language plpgsql security definer set search_path = '' as $$
declare
  v_row     public.handover_protocols;
  v_booking public.bookings;
  v_pickup  public.handover_protocols;
  v_prefix  text;
  v_to      public.booking_status;
begin
  if not private.is_staff('operator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_row from public.handover_protocols where id = p_protocol_id for update;
  if v_row.id is null or v_row.signed_at is not null then
    raise exception 'protocol_not_editable' using errcode = 'P0001';
  end if;
  select * into v_booking from public.bookings where id = v_row.booking_id for update;

  if v_row.handover_at is null then raise exception 'protocol_incomplete: handover_at' using errcode = 'P0001'; end if;
  if v_row.odometer_km is null then raise exception 'protocol_incomplete: odometer' using errcode = 'P0001'; end if;
  if v_row.fuel_level is null and v_row.charge_level is null then raise exception 'protocol_incomplete: fuel' using errcode = 'P0001'; end if;
  if v_row.signed_by_name is null or v_row.staff_name is null then raise exception 'protocol_incomplete: names' using errcode = 'P0001'; end if;
  if (select count(distinct ph.angle) from public.protocol_photos ph
       where ph.protocol_id = p_protocol_id and ph.angle in ('front', 'rear', 'left', 'right')) < 4 then
    raise exception 'protocol_incomplete: photos' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.protocol_damages d where d.protocol_id = p_protocol_id and d.description = '') then
    raise exception 'protocol_incomplete: damage_description' using errcode = 'P0001';
  end if;
  v_prefix := v_row.booking_id::text || '/';
  if coalesce(p_customer_signature_path, '') = '' or coalesce(p_staff_signature_path, '') = ''
     or left(p_customer_signature_path, length(v_prefix)) <> v_prefix or left(p_staff_signature_path, length(v_prefix)) <> v_prefix then
    raise exception 'protocol_incomplete: signatures' using errcode = 'P0001';
  end if;

  if v_row.type = 'return' then
    select * into v_pickup from public.handover_protocols
     where booking_id = v_row.booking_id and type = 'pickup' and signed_at is not null
     order by version desc limit 1;
    if v_pickup.id is not null and v_row.odometer_km < v_pickup.odometer_km then
      raise exception 'odometer_below_pickup' using errcode = 'P0001';
    end if;
  end if;

  if v_row.supersedes_id is null then
    if v_row.type = 'pickup' then
      if v_booking.status = 'confirmed' then v_to := 'active';
      elsif v_booking.status <> 'active' then raise exception 'booking_status_mismatch' using errcode = 'P0001';
      end if;
    else
      if v_booking.status = 'active' then v_to := 'completed';
      elsif v_booking.status <> 'completed' then raise exception 'booking_status_mismatch' using errcode = 'P0001';
      end if;
    end if;
  end if;

  update public.handover_protocols
     set signed_at = now(), customer_signature_path = p_customer_signature_path, staff_signature_path = p_staff_signature_path
   where id = p_protocol_id
   returning * into v_row;

  if v_to is not null then
    perform set_config('app.status_note', case when v_row.type = 'pickup' then 'Odovzdávací protokol podpísaný' else 'Preberací protokol podpísaný' end, true);
    update public.bookings set status = v_to where id = v_row.booking_id;
    perform set_config('app.status_note', '', true);
  end if;
  return v_row;
end;
$$;
revoke execute on function public.sign_protocol(uuid, text, text) from public, anon;
grant execute on function public.sign_protocol(uuid, text, text) to authenticated, service_role;

-- ───────────────────────── storage ─────────────────────────
-- A customer may download the PDF of a signed protocol of their own booking (the inner
-- query runs under RLS, which already limits it to exactly those rows).
create policy btw_protocols_customer_select on storage.objects for select to authenticated
  using (
    bucket_id = 'protocols'
    and exists (select 1 from public.handover_protocols p where p.pdf_path = objects.name and p.signed_at is not null)
  );
