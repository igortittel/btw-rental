-- BTW Rental – public read API (Phase 1)
--
-- The public site never reads tables directly. These views expose only whitelisted,
-- non-internal columns (no licence plate, no insurance policy number, no notes).
-- They intentionally run with the owner's privileges (security_invoker = false) so
-- that anon needs no access to the underlying tables.
set search_path = public, extensions;

create view public.public_categories with (security_invoker = false) as
select c.id, c.slug, c.name, c.sort_order,
       (select count(*) from public.vehicles v
         where v.category_id = c.id and v.is_active and v.for_rental)::integer as vehicle_count
  from public.vehicle_categories c
 where c.is_active;

create view public.public_locations with (security_invoker = false) as
select l.id, l.name, l.address, l.map_url, l.latitude, l.longitude, l.surcharge_cents,
       l.for_pickup, l.for_return, l.is_default, l.sort_order
  from public.locations l
 where l.is_active;

create view public.public_settings with (security_invoker = false) as
select s.key, s.value from public.settings s where s.is_public;

create view public.public_price_tiers with (security_invoker = false) as
select t.id, t.min_days, t.max_days from public.price_tiers t;

create view public.public_vehicles with (security_invoker = false) as
select
  v.id, v.slug, v.vin, v.name, v.brand, v.model, v.variant,
  c.slug as category_slug, c.name as category_name,
  v.engine, v.power_kw, v.power_hp, v.gears, v.drivetrain, v.fuel, v.transmission,
  v.seats, v.luggage, v.description, v.sort_order, v.updated_at,
  -- Effective conditions: per-vehicle override, else global setting.
  coalesce(v.deposit_cents, (private.setting('deposit_cents'))::integer) as deposit_cents,
  coalesce(v.km_limit_per_day, (private.setting('km_limit_per_day'))::integer) as km_limit_per_day,
  coalesce(v.extra_km_cents, (private.setting('extra_km_cents'))::integer) as extra_km_cents,
  coalesce(v.min_driver_age, (private.setting('min_driver_age'))::integer) as min_driver_age,
  coalesce(v.min_license_months, (private.setting('min_license_months'))::integer) as min_license_months,
  coalesce(v.assistance ->> 'phone', private.setting('assistance') ->> 'phone') as assistance_phone,
  (select min(vp.price_per_day_cents) from public.vehicle_prices vp where vp.vehicle_id = v.id) as price_from_cents,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'tier_id', t.id, 'min_days', t.min_days, 'max_days', t.max_days,
             'price_per_day_cents', vp.price_per_day_cents) order by t.min_days)
      from public.price_tiers t
      left join public.vehicle_prices vp on vp.tier_id = t.id and vp.vehicle_id = v.id
  ), '[]'::jsonb) as prices,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'path', i.storage_path, 'alt', i.alt, 'width', i.width,
             'height', i.height, 'is_main', i.is_main) order by i.is_main desc, i.sort_order)
      from public.vehicle_images i where i.vehicle_id = v.id
  ), '[]'::jsonb) as images,
  coalesce((
    select jsonb_agg(jsonb_build_object('id', f.id, 'group', f.group_key, 'name', f.name)
                     order by f.group_key, vf.sort_order, f.sort_order)
      from public.vehicle_features vf
      join public.features f on f.id = vf.feature_id
     where vf.vehicle_id = v.id
  ), '[]'::jsonb) as features,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'code', e.code, 'name', e.name, 'description', e.description,
             'price_cents', coalesce(ve.price_override_cents, e.price_cents),
             'pricing_type', e.pricing_type, 'max_quantity', e.max_quantity,
             'max_charge_cents', e.max_charge_cents) order by e.sort_order)
      from public.extras e
      left join public.vehicle_extras ve on ve.extra_id = e.id and ve.vehicle_id = v.id
     where e.is_active
       and case when e.is_global then coalesce(ve.is_enabled, true)
                else coalesce(ve.is_enabled, false) end
  ), '[]'::jsonb) as extras
from public.vehicles v
join public.vehicle_categories c on c.id = v.category_id and c.is_active
where v.is_active and v.for_rental;

grant select on public.public_categories, public.public_locations, public.public_settings,
                public.public_price_tiers, public.public_vehicles
  to anon, authenticated, service_role;
