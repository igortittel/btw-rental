-- BTW Rental – core schema (Phase 1)
-- Money: integer cents incl. VAT. Time: timestamptz, displayed in Europe/Bratislava.

create schema if not exists extensions;
create schema if not exists private;
create extension if not exists btree_gist with schema extensions;

set search_path = public, extensions;

-- ───────────────────────── Enums ─────────────────────────
create type public.profile_type as enum ('customer', 'staff');
-- Ordered: operator < manager < owner (used for >= comparisons).
create type public.staff_role as enum ('operator', 'manager', 'owner');
create type public.feature_group as enum ('comfort', 'technical', 'safety', 'included');
create type public.fuel_type as enum ('petrol', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric');
create type public.transmission_type as enum ('automatic', 'manual');
create type public.drivetrain_type as enum ('fwd', 'rwd', 'awd');
create type public.extra_pricing_type as enum ('per_day', 'per_rental');
create type public.block_reason as enum ('service', 'stk', 'private', 'other');
create type public.booking_status as enum ('new', 'confirmed', 'modified', 'active', 'completed', 'cancelled');
create type public.booking_creator as enum ('customer', 'staff');
create type public.payment_method as enum ('transfer', 'terminal', 'cash');
create type public.rental_payment_status as enum ('unpaid', 'paid', 'refunded', 'partially_refunded');
create type public.deposit_status as enum ('pending', 'received', 'returned', 'partially_returned');
create type public.consent_type as enum ('terms', 'gdpr', 'marketing', 'deposit', 'km_limit', 'license');
create type public.protocol_type as enum ('pickup', 'return');
create type public.damage_view as enum ('top', 'left', 'right', 'front', 'rear');
create type public.document_type as enum ('proforma', 'invoice', 'credit_note', 'settlement');
create type public.email_status as enum ('queued', 'sent', 'delivered', 'bounced', 'failed');

-- ───────────────────────── People ─────────────────────────
-- profiles.id equals auth.users.id when the account is created. There is intentionally
-- NO foreign key: GDPR anonymisation deletes the Auth account but keeps the (anonymised)
-- profile row that bookings and accounting documents reference.
create table public.profiles (
  id                    uuid primary key,
  type                  public.profile_type not null default 'customer',
  email                 text,
  first_name            text not null default '',
  last_name             text not null default '',
  phone                 text,
  date_of_birth         date,
  is_company            boolean not null default false,
  company_name          text,
  ico                   text,
  dic                   text,
  ic_dph                text,
  billing_address       jsonb not null default '{}'::jsonb, -- {street, city, zip, country}
  locale                text not null default 'sk' check (locale in ('sk', 'en')),
  password_set          boolean not null default false,
  deletion_requested_at timestamptz,
  anonymized_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_type_idx on public.profiles (type);

-- Staff-only data about a customer. Kept out of `profiles` so that a customer reading
-- their own profile row can never receive it.
create table public.customer_internal (
  profile_id     uuid primary key references public.profiles (id) on delete cascade,
  is_blacklisted boolean not null default false,
  blacklist_note text,
  internal_note  text,
  updated_by     uuid,
  updated_at     timestamptz not null default now()
);

create table public.staff_roles (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  role       public.staff_role not null,
  is_active  boolean not null default true,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Catalogue ─────────────────────────
create table public.vehicle_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique
             check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
             -- Reserved words: static routes take precedence over /[kategoria].
             check (slug not in ('rezervacia', 'prihlasenie', 'nastavit-heslo', 'zabudnute-heslo',
                                 'moj-ucet', 'admin', 'api', 'auth', 'en', 'sk', 'images', 'static',
                                 'sitemap', 'robots', 'favicon')),
  name       jsonb not null, -- {sk, en}
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), -- slugify(brand model variant)
  name             text not null,
  brand            text not null,
  model            text not null,
  variant          text,
  category_id      uuid not null references public.vehicle_categories (id) on delete restrict,
  license_plate    text,                      -- INTERNAL, never in public views
  vin              text not null unique       -- public, part of the URL; no dashes (URL parser splits on the last dash)
                   check (vin ~ '^[A-Z0-9]{5,20}$'),
  engine           text,                      -- e.g. "2.0 Diesel"
  power_kw         integer check (power_kw > 0),
  power_hp         integer check (power_hp > 0),
  gears            integer check (gears > 0),
  drivetrain       public.drivetrain_type,
  fuel             public.fuel_type not null,
  transmission     public.transmission_type not null,
  seats            integer not null check (seats between 1 and 20),
  luggage          integer check (luggage >= 0),
  description      jsonb not null default '{}'::jsonb, -- {sk, en}
  for_rental       boolean not null default true,
  for_transfer     boolean not null default false,
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  -- Per-vehicle overrides; NULL = use the global value from `settings`.
  deposit_cents      integer check (deposit_cents >= 0),
  km_limit_per_day   integer check (km_limit_per_day > 0),
  extra_km_cents     integer check (extra_km_cents >= 0),
  min_driver_age     integer check (min_driver_age between 18 and 99),
  min_license_months integer check (min_license_months >= 0),
  buffer_minutes     integer check (buffer_minutes >= 0),
  assistance         jsonb, -- {phone, insurer, policy_number, note}; policy_number is internal
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index vehicles_category_idx on public.vehicles (category_id);
create index vehicles_listing_idx on public.vehicles (is_active, for_rental, sort_order);

create table public.vehicle_images (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles (id) on delete cascade,
  storage_path text not null, -- path in the public `vehicle-images` bucket
  alt          jsonb not null default '{}'::jsonb,
  width        integer,
  height       integer,
  sort_order   integer not null default 0,
  is_main      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index vehicle_images_vehicle_idx on public.vehicle_images (vehicle_id, sort_order);
create unique index vehicle_images_one_main_idx on public.vehicle_images (vehicle_id) where is_main;

create table public.features (
  id         uuid primary key default gen_random_uuid(),
  group_key  public.feature_group not null,
  name       jsonb not null, -- {sk, en}
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index features_group_idx on public.features (group_key, sort_order);

create table public.vehicle_features (
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  feature_id uuid not null references public.features (id) on delete cascade,
  sort_order integer not null default 0,
  primary key (vehicle_id, feature_id)
);
create index vehicle_features_feature_idx on public.vehicle_features (feature_id);

-- Global tier boundaries. max_days NULL = open-ended tier with an individual price.
create table public.price_tiers (
  id       uuid primary key default gen_random_uuid(),
  min_days integer not null unique check (min_days >= 1),
  max_days integer check (max_days is null or max_days >= min_days)
);

create table public.vehicle_prices (
  vehicle_id          uuid not null references public.vehicles (id) on delete cascade,
  tier_id             uuid not null references public.price_tiers (id) on delete cascade,
  price_per_day_cents integer not null check (price_per_day_cents >= 0),
  primary key (vehicle_id, tier_id)
);
create index vehicle_prices_tier_idx on public.vehicle_prices (tier_id);

create table public.extras (
  id               uuid primary key default gen_random_uuid(),
  code             text unique, -- stable key for seeded extras (roof_box, child_seat…)
  name             jsonb not null,
  description      jsonb not null default '{}'::jsonb,
  price_cents      integer not null check (price_cents >= 0),
  pricing_type     public.extra_pricing_type not null,
  max_quantity     integer not null default 1 check (max_quantity >= 1),
  max_charge_cents integer check (max_charge_cents >= 0),
  is_global        boolean not null default true, -- true: all vehicles; false: only rows in vehicle_extras
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

create table public.vehicle_extras (
  vehicle_id           uuid not null references public.vehicles (id) on delete cascade,
  extra_id             uuid not null references public.extras (id) on delete cascade,
  price_override_cents integer check (price_override_cents >= 0),
  is_enabled           boolean not null default true, -- false hides a global extra for this vehicle
  primary key (vehicle_id, extra_id)
);
create index vehicle_extras_extra_idx on public.vehicle_extras (extra_id);

create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  name            jsonb not null,
  address         text not null,
  map_url         text,
  latitude        numeric(9, 6),
  longitude       numeric(9, 6),
  surcharge_cents integer not null default 0 check (surcharge_cents >= 0),
  for_pickup      boolean not null default true,
  for_return      boolean not null default true,
  is_default      boolean not null default false,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);
create unique index locations_one_default_idx on public.locations (is_default) where is_default;

create table public.availability_blocks (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     public.block_reason not null default 'other',
  note       text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  exclude using gist (vehicle_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
);

-- ───────────────────────── Bookings ─────────────────────────
create table public.booking_counters (
  year        integer primary key,
  last_number integer not null default 0
);

create table public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  number              text not null unique,            -- BTW-2026-0001, set by trigger
  customer_id         uuid not null references public.profiles (id) on delete restrict,
  vehicle_id          uuid not null references public.vehicles (id) on delete restrict,
  status              public.booking_status not null default 'new',
  pickup_at           timestamptz not null,
  return_at           timestamptz not null,
  buffer_minutes      integer not null check (buffer_minutes >= 0), -- snapshot, defaulted by trigger
  blocked_until       timestamptz not null,            -- return_at + buffer, maintained by trigger
  pickup_location_id  uuid not null references public.locations (id) on delete restrict,
  return_location_id  uuid not null references public.locations (id) on delete restrict,
  customer_note       text,
  -- Snapshot of customer + billing data at booking time (invoices, protocols, anonymisation).
  customer_snapshot   jsonb not null default '{}'::jsonb,
  days                integer not null check (days >= 1),
  price_snapshot      jsonb not null default '{}'::jsonb, -- tier, rate, extras, locations, settings used
  subtotal_cents      integer check (subtotal_cents >= 0), -- rental only (days × rate); NULL for individual price
  total_cents         integer check (total_cents >= 0),    -- incl. VAT; NULL until an individual price is set
  vat_rate            numeric(5, 2) not null,
  is_individual_price boolean not null default false,
  price_override_reason text,
  deposit_cents       integer not null check (deposit_cents >= 0),
  rental_payment_method public.payment_method not null,
  rental_payment_status public.rental_payment_status not null default 'unpaid',
  rental_paid_at        timestamptz,
  rental_paid_marked_by uuid references public.profiles (id) on delete set null,
  deposit_payment_method public.payment_method not null,
  deposit_status         public.deposit_status not null default 'pending',
  deposit_received_at    timestamptz,
  deposit_received_marked_by uuid references public.profiles (id) on delete set null,
  deposit_returned_cents integer check (deposit_returned_cents >= 0),
  deposit_returned_at    timestamptz,
  deposit_return_method  public.payment_method,
  deposit_return_note    text,
  km_limit_per_day    integer not null check (km_limit_per_day > 0),
  extra_km_cents      integer not null check (extra_km_cents >= 0),
  locale              text not null default 'sk' check (locale in ('sk', 'en')),
  abroad_trip         boolean not null default false,
  abroad_countries    text,
  cancellation_fee_cents integer check (cancellation_fee_cents >= 0),
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles (id) on delete set null,
  cancellation_reason text,
  pending_change      jsonb,  -- proposed change while status = 'modified'; the row keeps the original
  created_by          public.booking_creator not null default 'customer',
  created_by_staff_id uuid references public.profiles (id) on delete set null,
  review_requested_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (return_at > pickup_at),
  check (is_individual_price or total_cents is not null),
  check ((status = 'modified') = (pending_change is not null)),
  -- DB-level double-booking protection, including the preparation buffer.
  constraint bookings_no_overlap exclude using gist (
    vehicle_id with =,
    tstzrange(pickup_at, blocked_until, '[)') with &&
  ) where (status in ('confirmed', 'modified', 'active'))
);
create index bookings_customer_idx on public.bookings (customer_id, pickup_at desc);
create index bookings_vehicle_idx on public.bookings (vehicle_id, pickup_at);
create index bookings_status_idx on public.bookings (status, pickup_at);
create index bookings_created_idx on public.bookings (created_at desc);
create index bookings_pickup_location_idx on public.bookings (pickup_location_id);
create index bookings_return_location_idx on public.bookings (return_location_id);

create table public.booking_extras (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings (id) on delete cascade,
  extra_id         uuid references public.extras (id) on delete set null,
  name_snapshot    jsonb not null,
  quantity         integer not null default 1 check (quantity >= 1),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  pricing_type     public.extra_pricing_type not null,
  total_cents      integer not null check (total_cents >= 0)
);
create index booking_extras_booking_idx on public.booking_extras (booking_id);
create index booking_extras_extra_idx on public.booking_extras (extra_id);

create table public.booking_status_history (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  from_status public.booking_status,
  to_status   public.booking_status not null,
  changed_by  uuid references public.profiles (id) on delete set null, -- NULL = system / cron
  note        text,
  created_at  timestamptz not null default now()
);
create index booking_status_history_booking_idx on public.booking_status_history (booking_id, created_at);

-- Internal notes live in their own table so customers can never select them.
create table public.booking_notes (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index booking_notes_booking_idx on public.booking_notes (booking_id, created_at);

create table public.consents (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  type       public.consent_type not null,
  version    text not null,
  granted    boolean not null default true,
  granted_at timestamptz not null default now(),
  ip         inet,
  user_agent text
);
create index consents_profile_idx on public.consents (profile_id, type);
create index consents_booking_idx on public.consents (booking_id);

-- ───────────────────────── Protocols ─────────────────────────
create table public.handover_protocols (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings (id) on delete restrict,
  type             public.protocol_type not null,
  version          integer not null default 1,
  supersedes_id    uuid references public.handover_protocols (id) on delete restrict,
  location_id      uuid references public.locations (id) on delete set null,
  handover_at      timestamptz,
  odometer_km      integer check (odometer_km >= 0),
  fuel_level       integer check (fuel_level between 0 and 100), -- percent
  charge_level     integer check (charge_level between 0 and 100), -- EV, percent
  cleanliness      jsonb not null default '{}'::jsonb, -- {interior, exterior}
  accessories      jsonb not null default '[]'::jsonb, -- [{key, label, present}]
  note             text,
  customer_signature_path text,
  staff_signature_path    text,
  signed_by_name   text,
  staff_name       text,
  signed_at        timestamptz, -- NOT NULL = immutable (see trigger)
  pdf_path         text,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index handover_protocols_booking_idx on public.handover_protocols (booking_id, type, version);
create index handover_protocols_supersedes_idx on public.handover_protocols (supersedes_id);

create table public.protocol_damages (
  id          uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references public.handover_protocols (id) on delete cascade,
  view        public.damage_view not null,
  x           numeric(5, 2) not null check (x between 0 and 100), -- percent of diagram width
  y           numeric(5, 2) not null check (y between 0 and 100),
  description text not null default '',
  photo_path  text,
  is_new      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index protocol_damages_protocol_idx on public.protocol_damages (protocol_id);

create table public.protocol_photos (
  id           uuid primary key default gen_random_uuid(),
  protocol_id  uuid not null references public.handover_protocols (id) on delete cascade,
  angle        text not null, -- front, rear, left, right, interior, odometer, other
  storage_path text not null,
  created_at   timestamptz not null default now()
);
create index protocol_photos_protocol_idx on public.protocol_photos (protocol_id);

-- ───────────────────────── Documents & settlement ─────────────────────────
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings (id) on delete restrict,
  type         public.document_type not null,
  number       text,
  storage_path text not null,
  amount_cents integer,
  issued_at    date,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index documents_booking_idx on public.documents (booking_id);

create table public.settlements (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null unique references public.bookings (id) on delete restrict,
  km_driven      integer,
  extra_km       integer not null default 0 check (extra_km >= 0),
  extra_km_cents integer not null default 0 check (extra_km_cents >= 0),
  fuel_diff      integer,                 -- percent points, return − pickup (informational)
  fuel_cents     integer not null default 0 check (fuel_cents >= 0),
  damage_cents   integer not null default 0 check (damage_cents >= 0),
  late_cents     integer not null default 0 check (late_cents >= 0),
  other_cents    integer not null default 0 check (other_cents >= 0),
  total_cents    integer generated always as
                 (extra_km_cents + fuel_cents + damage_cents + late_cents + other_cents) stored,
  note           text,
  approved_by    uuid references public.profiles (id) on delete set null,
  approved_at    timestamptz, -- customers only see approved settlements
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ───────────────────────── System ─────────────────────────
create table public.settings (
  key        text primary key,
  value      jsonb not null,
  is_public  boolean not null default false, -- exposed through the public_settings view
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table public.email_log (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete set null,
  type       text not null,
  recipient  text not null,
  locale     text,
  resend_id  text,
  status     public.email_status not null default 'queued',
  error      text,
  created_at timestamptz not null default now()
);
create index email_log_booking_idx on public.email_log (booking_id, created_at);
create index email_log_profile_idx on public.email_log (profile_id);
create index email_log_type_idx on public.email_log (type, created_at);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid, -- no FK: the log must survive account deletion
  entity     text not null,
  entity_id  text,
  action     text not null, -- insert | update | delete | custom verbs (e.g. customer.anonymize)
  diff       jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at desc);
