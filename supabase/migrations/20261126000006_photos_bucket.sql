-- Recipe photos (doc §3.12): a private bucket the browser uploads to directly, one
-- folder per user ({user_id}/{photo_id}/full|thumb). The server signs short-lived URLs
-- to show them. No update policy: a photo is never overwritten, only added or removed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

create policy photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- uploads are resized to a 1600 px long edge in the browser; imported photos are links
alter table recipe_images
  add constraint recipe_images_max_size check (width <= 1600 and height <= 1600),
  add constraint recipe_images_external_http check (external_url is null or external_url ~* '^https?://'),
  add constraint recipe_images_external_len check (char_length(external_url) <= 2000);
