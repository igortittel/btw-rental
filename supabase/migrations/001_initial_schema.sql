-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vehicles (
  id              UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  name            TEXT          NOT NULL,
  vin             TEXT          UNIQUE NOT NULL,
  plate           TEXT          UNIQUE NOT NULL,
  year            INTEGER       NOT NULL,
  brand           TEXT          NOT NULL,
  model           TEXT          NOT NULL,
  engine          TEXT          NOT NULL,
  transmission    TEXT          NOT NULL CHECK (transmission IN ('automatic', 'manual')),
  fuel            TEXT          NOT NULL CHECK (fuel IN ('petrol', 'diesel', 'electric', 'hybrid')),
  description_json JSONB        NOT NULL DEFAULT '{"comfort":[],"tech":[],"services":[]}',
  image_urls      TEXT[]        NOT NULL DEFAULT '{}',
  daily_price     NUMERIC(10,2) NOT NULL,
  is_available    BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id                   UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name            TEXT        NOT NULL DEFAULT '',
  company_name         TEXT,
  vat_number           TEXT,
  phone                TEXT,
  total_bookings_count INTEGER     NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id                  UUID          DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id          UUID          NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  pickup_datetime     TIMESTAMPTZ   NOT NULL,
  dropoff_datetime    TIMESTAMPTZ   NOT NULL,
  status              TEXT          NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  pickup_location     TEXT          NOT NULL,
  dropoff_location    TEXT          NOT NULL,
  total_price         NUMERIC(10,2) NOT NULL,
  addon_services_json JSONB         NOT NULL DEFAULT '[]',
  document_urls       TEXT[]        NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_dates CHECK (dropoff_datetime > pickup_datetime)
);

CREATE TABLE IF NOT EXISTS public.maintenance (
  id              UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  vehicle_id      UUID        NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL CHECK (type IN ('STK','PZP','KASKO','SERVICE','TOLL','TIRES')),
  expiration_date DATE        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bookings_vehicle_id  ON public.bookings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id     ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status      ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_dates       ON public.bookings(pickup_datetime, dropoff_datetime);
CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle  ON public.maintenance(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_expiry   ON public.maintenance(expiration_date);

-- ─────────────────────────────────────────────
-- FUNCTIONS & TRIGGERS
-- ─────────────────────────────────────────────

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Increment booking count when a booking is confirmed
CREATE OR REPLACE FUNCTION public.update_booking_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status = 'confirmed' AND OLD.status <> 'confirmed') THEN
    UPDATE public.profiles
    SET total_bookings_count = total_bookings_count + 1,
        updated_at = NOW()
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_booking_status_change
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_booking_count();

-- Prevent overlapping confirmed/pending bookings for the same vehicle
CREATE OR REPLACE FUNCTION public.check_booking_overlap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE vehicle_id = NEW.vehicle_id
      AND id <> NEW.id
      AND status IN ('pending', 'confirmed')
      AND pickup_datetime  < NEW.dropoff_datetime
      AND dropoff_datetime > NEW.pickup_datetime
  ) THEN
    RAISE EXCEPTION 'Booking dates overlap with an existing reservation for this vehicle.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER enforce_no_booking_overlap
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.check_booking_overlap();

-- Helper: get booked date ranges for a vehicle (used by the frontend calendar)
CREATE OR REPLACE FUNCTION public.get_booked_ranges(p_vehicle_id UUID)
RETURNS TABLE (pickup TIMESTAMPTZ, dropoff TIMESTAMPTZ) LANGUAGE sql STABLE AS $$
  SELECT pickup_datetime, dropoff_datetime
  FROM public.bookings
  WHERE vehicle_id = p_vehicle_id
    AND status IN ('pending', 'confirmed');
$$;

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

ALTER TABLE public.vehicles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance ENABLE ROW LEVEL SECURITY;

-- Vehicles: readable by all, writable only by admins
CREATE POLICY "vehicles_public_read" ON public.vehicles
  FOR SELECT USING (true);

CREATE POLICY "vehicles_admin_write" ON public.vehicles
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Profiles: own row only; admins see all
CREATE POLICY "profiles_own_read" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_own_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Bookings: own rows; admins manage all
CREATE POLICY "bookings_own_select" ON public.bookings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "bookings_own_insert" ON public.bookings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bookings_own_cancel" ON public.bookings
  FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "bookings_admin_all" ON public.bookings
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Maintenance: admins manage; authenticated users view
CREATE POLICY "maintenance_auth_read" ON public.maintenance
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "maintenance_admin_write" ON public.maintenance
  FOR ALL USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- ─────────────────────────────────────────────
-- SEED DATA
-- ─────────────────────────────────────────────

INSERT INTO public.vehicles
  (name, vin, plate, year, brand, model, engine, transmission, fuel,
   description_json, image_urls, daily_price, is_available)
VALUES
(
  'Porsche Cayenne S',
  'WP1ZZZ9YZJDA12345', '1AA2345', 2023, 'Porsche', 'Cayenne S',
  '2.9L V6 Twin-Turbo 440 hp', 'automatic', 'petrol',
  '{"comfort":["Panoramic roof","Heated & ventilated seats","Air suspension","4-zone climate control"],
    "tech":["PCM 6.0 touchscreen","Night Vision Assist","Head-up display","Bose Surround Sound 14ch"],
    "services":["Full KASKO insurance","24/7 roadside assistance","Concierge delivery"]}',
  ARRAY['/images/cayenne-1.jpg', '/images/cayenne-2.jpg'],
  350.00, true
),
(
  'Mercedes-Benz GLE 63 AMG',
  'WDC1660241A654321', '2BB3456', 2024, 'Mercedes-Benz', 'GLE 63 AMG',
  '4.0L V8 BiTurbo 612 hp', 'automatic', 'petrol',
  '{"comfort":["Burmester 3D Sound 15ch","Executive rear lounge seats","Energizing Comfort","Nappa leather"],
    "tech":["MBUX Hyperscreen 56\"","Active Parking Assist","360° surround camera","AMG Night Package"],
    "services":["Full KASKO insurance","24/7 roadside assistance","VIP airport delivery"]}',
  ARRAY['/images/gle-1.jpg', '/images/gle-2.jpg'],
  420.00, true
),
(
  'BMW X5 M Competition',
  'WBAKS610X0LK98765', '3CC4567', 2024, 'BMW', 'X5 M Competition',
  '4.4L V8 TwinPower 625 hp', 'automatic', 'petrol',
  '{"comfort":["Merino leather","Panoramic Sky Lounge LED","Massage seats","Ambient lighting 30ch"],
    "tech":["BMW Curved Display 12.3\"","Laser headlights","Surround View","Harman Kardon Sound"],
    "services":["Full KASKO insurance","24/7 roadside assistance","Express doorstep delivery"]}',
  ARRAY['/images/x5m-1.jpg', '/images/x5m-2.jpg'],
  395.00, true
);

-- Seed maintenance records
INSERT INTO public.maintenance (vehicle_id, type, expiration_date)
SELECT id, 'STK',     (NOW() + INTERVAL '8 months')::DATE  FROM public.vehicles WHERE vin = 'WP1ZZZ9YZJDA12345'
UNION ALL
SELECT id, 'PZP',     (NOW() + INTERVAL '3 months')::DATE  FROM public.vehicles WHERE vin = 'WP1ZZZ9YZJDA12345'
UNION ALL
SELECT id, 'KASKO',   (NOW() + INTERVAL '20 days')::DATE   FROM public.vehicles WHERE vin = 'WP1ZZZ9YZJDA12345'
UNION ALL
SELECT id, 'STK',     (NOW() + INTERVAL '14 months')::DATE FROM public.vehicles WHERE vin = 'WDC1660241A654321'
UNION ALL
SELECT id, 'SERVICE', (NOW() + INTERVAL '25 days')::DATE   FROM public.vehicles WHERE vin = 'WDC1660241A654321'
UNION ALL
SELECT id, 'TIRES',   (NOW() + INTERVAL '6 months')::DATE  FROM public.vehicles WHERE vin = 'WBAKS610X0LK98765'
UNION ALL
SELECT id, 'TOLL',    (NOW() + INTERVAL '15 days')::DATE   FROM public.vehicles WHERE vin = 'WBAKS610X0LK98765';
