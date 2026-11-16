-- BTW Rental – storage buckets (Phase 1)
--   vehicle-images   public  (catalogue photos)
--   protocols        private (signed protocol PDFs)
--   protocol-media   private (damage/angle photos, signatures)
--   documents        private (invoices and other accounting PDFs)
-- Customers never get direct access to private buckets: the server issues short-lived
-- signed URLs after checking booking ownership.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('vehicle-images', 'vehicle-images', true, 10485760, array['image/webp', 'image/jpeg', 'image/png', 'image/avif']),
  ('protocols', 'protocols', false, 20971520, array['application/pdf']),
  ('protocol-media', 'protocol-media', false, 10485760, array['image/webp', 'image/jpeg', 'image/png']),
  ('documents', 'documents', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- vehicle-images: public bucket serves files by URL without a policy; managers manage.
create policy btw_vehicle_images_staff_select on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-images' and (select private.is_staff('operator')));
create policy btw_vehicle_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-images' and (select private.is_staff('manager')));
create policy btw_vehicle_images_update on storage.objects for update to authenticated
  using (bucket_id = 'vehicle-images' and (select private.is_staff('manager')))
  with check (bucket_id = 'vehicle-images' and (select private.is_staff('manager')));
create policy btw_vehicle_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-images' and (select private.is_staff('manager')));

-- protocols + protocol-media: any staff member (filled in at the car).
create policy btw_protocols_select on storage.objects for select to authenticated
  using (bucket_id in ('protocols', 'protocol-media') and (select private.is_staff('operator')));
create policy btw_protocols_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('protocols', 'protocol-media') and (select private.is_staff('operator')));
create policy btw_protocol_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'protocol-media' and (select private.is_staff('operator')));

-- documents: managers upload, all staff read.
create policy btw_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (select private.is_staff('operator')));
create policy btw_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (select private.is_staff('manager')));
create policy btw_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (select private.is_staff('manager')));
