-- recipes.oven_temp_unit: 'F' or 'C', only with a temperature. Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values ('aaaaaaaa-4444-0000-0000-000000000000', 'oven@test.local');

select lives_ok($$ insert into recipes (owner_id, title, source_type, oven_temp_c, oven_temp_unit)
  values ('aaaaaaaa-4444-0000-0000-000000000000', 'C', 'manual', 180, 'C') $$,
  'a temperature entered in °C keeps its unit');
select lives_ok($$ insert into recipes (owner_id, title, source_type, oven_temp_c)
  values ('aaaaaaaa-4444-0000-0000-000000000000', 'old', 'manual', 176.7) $$,
  'the unit may be unknown (recipes saved before it was kept)');
select throws_ok($$ insert into recipes (owner_id, title, source_type, oven_temp_c, oven_temp_unit)
  values ('aaaaaaaa-4444-0000-0000-000000000000', 'K', 'manual', 300, 'K') $$,
  '23514', null, 'only F or C');
select throws_ok($$ insert into recipes (owner_id, title, source_type, oven_temp_unit)
  values ('aaaaaaaa-4444-0000-0000-000000000000', 'none', 'manual', 'C') $$,
  '23514', null, 'no unit without a temperature');

select * from finish();
rollback;
