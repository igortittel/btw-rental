-- ── Rename booking statuses ──────────────────
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'active', 'completed', 'cancelled'));

UPDATE public.bookings SET status = 'confirmed' WHERE status = 'approved';
UPDATE public.bookings SET status = 'active'    WHERE status = 'in_service';

-- ── Auto-status function ──────────────────────
-- Called from admin bookings page on load
CREATE OR REPLACE FUNCTION public.update_booking_statuses()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE updated INTEGER := 0;
BEGIN
  -- confirmed + past pickup → active
  UPDATE public.bookings
  SET status = 'active', updated_at = NOW()
  WHERE status = 'confirmed' AND pickup_datetime <= NOW();

  -- active + past dropoff → completed
  UPDATE public.bookings
  SET status = 'completed', updated_at = NOW()
  WHERE status = 'active' AND dropoff_datetime <= NOW();

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

-- ── Remove strict maintenance type constraint ─
-- (allow custom types)
ALTER TABLE public.maintenance DROP CONSTRAINT IF EXISTS maintenance_type_check;

-- ── Vehicle images storage bucket ─────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-images', 'vehicle-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "vehicle_images_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "vehicle_images_admin_write"   ON storage.objects;
DROP POLICY IF EXISTS "vehicle_images_admin_delete"  ON storage.objects;

CREATE POLICY "vehicle_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'vehicle-images');

CREATE POLICY "vehicle_images_admin_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'vehicle-images' AND
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "vehicle_images_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'vehicle-images' AND
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );
