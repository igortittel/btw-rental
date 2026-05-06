-- Drop old constraint and add new one with approved + in_service
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'approved', 'in_service', 'completed', 'cancelled'));

-- Rename existing confirmed → approved
UPDATE public.bookings SET status = 'approved' WHERE status = 'confirmed';

-- Update RLS cancel policy (customers can cancel pending)
DROP POLICY IF EXISTS "bookings_own_cancel" ON public.bookings;
CREATE POLICY "bookings_own_cancel" ON public.bookings
  FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');

-- Update admin status API to allow new statuses
-- (no SQL needed — handled in app code)
