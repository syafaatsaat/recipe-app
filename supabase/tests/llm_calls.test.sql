-- llm_calls: readable by its owner only, never writable by users. Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('aaaaaaaa-5555-0000-0000-000000000000', 'la@test.local'),
  ('bbbbbbbb-5555-0000-0000-000000000000', 'lb@test.local');
insert into llm_calls (owner_id, kind, ok, input_tokens, output_tokens)
  values ('aaaaaaaa-5555-0000-0000-000000000000', 'recipe', true, 1200, 300);

select pg_temp.as_user('aaaaaaaa-5555-0000-0000-000000000000');
select is((select count(*)::int from llm_calls), 1, 'the owner sees their calls');
select throws_ok($$ insert into llm_calls (owner_id, kind, ok)
  values ('aaaaaaaa-5555-0000-0000-000000000000', 'lines', true) $$,
  '42501', null, 'users can''t add calls');
select throws_ok($$ delete from llm_calls $$, '42501', null, 'users can''t delete calls (and so reset the cap)');
select throws_ok($$ update llm_calls set ok = false $$, '42501', null, 'users can''t edit calls');

select pg_temp.as_user('bbbbbbbb-5555-0000-0000-000000000000');
select is((select count(*)::int from llm_calls), 0, 'other users see none');

select * from finish();
rollback;
