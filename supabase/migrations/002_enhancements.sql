-- ─────────────────────────────────────────────
-- 002 — ENHANCEMENTS
-- ─────────────────────────────────────────────

-- Vehicles: seats + variable price tiers
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS seats_count      INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS price_tiers_json JSONB   NOT NULL DEFAULT '[]';

-- Bookings: new fields
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_number    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS contact_info_json JSONB         NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS km_driven         INTEGER,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_fee  NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Guest bookings: make user_id nullable
ALTER TABLE public.bookings ALTER COLUMN user_id DROP NOT NULL;

-- ─── Booking number ───────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.booking_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.set_booking_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.booking_number IS NULL THEN
    NEW.booking_number :=
      'BTW-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
      LPAD(NEXTVAL('public.booking_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER before_booking_insert_number
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_number();

-- ─── Guest booking linker ─────────────────────
-- Called from auth callback after OTP verify
CREATE OR REPLACE FUNCTION public.link_user_bookings(p_user_id UUID, p_email TEXT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE linked INTEGER;
BEGIN
  UPDATE public.bookings
  SET user_id = p_user_id, updated_at = NOW()
  WHERE user_id IS NULL
    AND contact_info_json->>'email' = p_email;
  GET DIAGNOSTICS linked = ROW_COUNT;
  RETURN linked;
END;
$$;

-- Also fire on new user creation (magic link first use)
CREATE OR REPLACE FUNCTION public.link_guest_bookings_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.link_user_bookings(NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_new_user_link_bookings
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_guest_bookings_on_signup();

-- ─── Updated RLS for guest bookings ──────────
DROP POLICY IF EXISTS "bookings_own_insert"    ON public.bookings;
DROP POLICY IF EXISTS "bookings_anyone_insert" ON public.bookings;
CREATE POLICY "bookings_anyone_insert" ON public.bookings
  FOR INSERT WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "bookings_own_select" ON public.bookings;
CREATE POLICY "bookings_own_select" ON public.bookings
  FOR SELECT USING (
    auth.uid() = user_id OR
    (user_id IS NULL AND contact_info_json->>'email' = auth.email())
  );

-- ─── Storage bucket for booking documents ─────
INSERT INTO storage.buckets (id, name, public)
VALUES ('booking-documents', 'booking-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "admins_upload_docs"  ON storage.objects;
DROP POLICY IF EXISTS "auth_view_own_docs"  ON storage.objects;

CREATE POLICY "admins_upload_docs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'booking-documents'
    AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "auth_view_own_docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'booking-documents'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "admins_delete_docs" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'booking-documents'
    AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- ─── Seed: update vehicles with new fields ────
UPDATE public.vehicles SET seats_count = 5;

UPDATE public.vehicles SET price_tiers_json = '[
  {"min_days":1,"max_days":2,"price_per_day":350},
  {"min_days":3,"max_days":6,"price_per_day":320},
  {"min_days":7,"max_days":999,"price_per_day":290}
]' WHERE brand = 'Porsche';

UPDATE public.vehicles SET price_tiers_json = '[
  {"min_days":1,"max_days":2,"price_per_day":420},
  {"min_days":3,"max_days":6,"price_per_day":390},
  {"min_days":7,"max_days":999,"price_per_day":350}
]' WHERE brand = 'Mercedes-Benz';

UPDATE public.vehicles SET price_tiers_json = '[
  {"min_days":1,"max_days":2,"price_per_day":395},
  {"min_days":3,"max_days":6,"price_per_day":365},
  {"min_days":7,"max_days":999,"price_per_day":330}
]' WHERE brand = 'BMW';
