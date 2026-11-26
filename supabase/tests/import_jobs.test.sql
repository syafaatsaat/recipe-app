-- import_jobs: paste without a URL, link imports with one, private per user. Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-1111-0000-0000-000000000000', 'ia@test.local'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'ib@test.local');

select pg_temp.as_user('aaaaaaaa-1111-0000-0000-000000000000');
select lives_ok($$ insert into import_jobs (owner_id, method, status, raw_payload)
  values ('aaaaaaaa-1111-0000-0000-000000000000', 'paste', 'ok', '{"text":"x"}') $$,
  'a paste import needs no URL');
select throws_ok($$ insert into import_jobs (owner_id, method, status)
  values ('aaaaaaaa-1111-0000-0000-000000000000', 'jsonld', 'ok') $$,
  '23514', null, 'a link import must have a URL');
select lives_ok($$ insert into import_jobs (owner_id, url, method, status)
  values ('aaaaaaaa-1111-0000-0000-000000000000', 'https://example.com/cake', 'jsonld', 'ok') $$,
  'a link import with a URL is fine');

select pg_temp.as_user('bbbbbbbb-1111-0000-0000-000000000000');
select is((select count(*)::int from import_jobs), 0, 'another user sees none of them');
select throws_ok($$ insert into import_jobs (owner_id, method, status)
  values ('aaaaaaaa-1111-0000-0000-000000000000', 'paste', 'ok') $$,
  '42501', null, 'nobody can create a job for someone else');

select * from finish();
rollback;
