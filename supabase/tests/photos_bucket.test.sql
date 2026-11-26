-- photos bucket: private, each user only in their own folder, no overwrites. Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-6666-0000-0000-000000000000', 'pa@test.local'),
  ('bbbbbbbb-6666-0000-0000-000000000000', 'pb@test.local');

select is((select public from storage.buckets where id = 'photos'), false, 'the photos bucket is private');

select pg_temp.as_user('aaaaaaaa-6666-0000-0000-000000000000');
select lives_ok($$ insert into storage.objects (bucket_id, name)
  values ('photos', 'aaaaaaaa-6666-0000-0000-000000000000/11111111-0000-4000-8000-000000000000/full') $$,
  'a user can upload into their own folder');
select throws_ok($$ insert into storage.objects (bucket_id, name)
  values ('photos', 'bbbbbbbb-6666-0000-0000-000000000000/22222222-0000-4000-8000-000000000000/full') $$,
  '42501', null, 'but not into someone else''s');
select is((select count(*)::int from storage.objects where bucket_id = 'photos'), 1, 'the owner sees their photo');
update storage.objects set name = name || 'x' where bucket_id = 'photos';
select is((select count(*)::int from storage.objects where bucket_id = 'photos' and name like '%x'),
  0, 'photos can''t be overwritten (no update policy)');

select pg_temp.as_user('bbbbbbbb-6666-0000-0000-000000000000');
select is((select count(*)::int from storage.objects where bucket_id = 'photos'), 0, 'other users can''t see it');
-- storage guards direct deletes; allow it here so RLS is what's tested
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'photos';

reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'photos' and name like 'aaaaaaaa-6666%'),
  1, 'or delete it');
insert into recipes (id, owner_id, title, source_type)
  values ('cccccccc-6666-0000-0000-000000000000', 'aaaaaaaa-6666-0000-0000-000000000000', 'P', 'manual');
select throws_ok($$ insert into recipe_images (recipe_id, origin, external_url)
  values ('cccccccc-6666-0000-0000-000000000000', 'import', 'javascript:alert(1)') $$,
  '23514', null, 'an imported photo must be an http(s) link');

select * from finish();
rollback;
