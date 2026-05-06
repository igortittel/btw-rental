ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'first_class'
  CHECK (category IN ('first_class', 'business_class', 'business_van'));

UPDATE public.vehicles SET category = 'first_class'    WHERE brand IN ('Porsche', 'Mercedes-Benz');
UPDATE public.vehicles SET category = 'business_class' WHERE brand = 'BMW';
