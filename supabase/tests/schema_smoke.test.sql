-- Schema, constraint, RLS and trigger tests. Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ── helpers ─────────────────────────────────────────────────────────────
create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('role', 'anon', true),
         set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

create function pg_temp.affected(q text) returns int language plpgsql as $f$
declare n int; begin execute q; get diagnostics n = row_count; return n; end $f$;

-- ── fixtures (as postgres) ──────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a@test.local', '{"display_name":"Alice"}'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b@test.local', '{}');

-- 1–2 signup trigger
select is((select count(*)::int from profiles where id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')), 2,
  'signup trigger creates a profile per user');
select is((select display_name from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000000'), 'Alice',
  'profile takes display_name from signup metadata');

insert into recipes (id, owner_id, title, description, source_type) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Fudgy Brownies', 'Dense chocolate squares', 'manual'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'Bob Bread', null, 'manual');
insert into recipe_sections (id, recipe_id, title, position) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Batter', 0),
  ('b5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Dough', 0);
insert into recipe_ingredients (recipe_id, section_id, position, name, quantity, unit_code) values
  ('a0000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 0, 'flour', 1.5, 'cup'),
  ('b0000000-0000-0000-0000-000000000001', null, 0, 'flour', 500, 'g');
insert into recipe_steps (recipe_id, position, body) values
  ('b0000000-0000-0000-0000-000000000001', 0, 'Knead');
insert into recipe_versions (id, recipe_id, version_no, snapshot) values
  ('a7000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1, '{}'),
  ('b7000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1, '{}');
insert into ingredients (id, owner_id, name) values
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'bob secret spice');

-- ── constraints ─────────────────────────────────────────────────────────
-- 3 global ingredient names are unique (NULLS NOT DISTINCT)
select throws_ok($$ insert into ingredients (name) values ('egg') $$, '23505', null,
  'duplicate global ingredient name is rejected');
-- 4 but a user may shadow a global name
select lives_ok($$ insert into ingredients (owner_id, name) values ('aaaaaaaa-0000-0000-0000-000000000000', 'egg') $$,
  'user ingredient may reuse a global name');
-- 5–6 unit_code
select throws_ok($$ insert into recipe_ingredients (recipe_id, position, name, quantity, unit_code)
  values ('a0000000-0000-0000-0000-000000000001', 1, 'x', 1, 'cups') $$, '23514', null, 'unknown unit_code is rejected');
select lives_ok($$ insert into recipe_ingredients (recipe_id, position, name, quantity, unit_code)
  values ('a0000000-0000-0000-0000-000000000001', 1, 'egg', 2, null) $$, 'null unit_code (count) is allowed');
-- 7–9 quantities
select throws_ok($$ insert into recipe_ingredients (recipe_id, position, name, quantity)
  values ('a0000000-0000-0000-0000-000000000001', 2, 'x', -1) $$, '23514', null, 'negative quantity is rejected');
select throws_ok($$ insert into recipe_ingredients (recipe_id, position, name, quantity, quantity_max)
  values ('a0000000-0000-0000-0000-000000000001', 2, 'x', 3, 2) $$, '23514', null, 'quantity_max < quantity is rejected');
select throws_ok($$ insert into recipe_ingredients (recipe_id, position, name, quantity_max)
  values ('a0000000-0000-0000-0000-000000000001', 2, 'x', 2) $$, '23514', null, 'quantity_max without quantity is rejected');
-- 10–14 pans
select throws_ok($$ insert into pans (label, shape, width_cm) values ('x', 'rectangle', 20) $$, '23514', null,
  'rectangle without length is rejected');
select throws_ok($$ insert into pans (label, shape, width_cm, length_cm) values ('x', 'round', 20, 20) $$, '23514', null,
  'round without diameter is rejected');
select throws_ok($$ insert into pans (label, shape) values ('x', 'bundt') $$, '23514', null, 'bundt without volume is rejected');
select throws_ok($$ insert into pans (label, shape) values ('x', 'muffin') $$, '23514', null, 'muffin without cup_count is rejected');
select throws_ok($$ insert into pans (label, shape, diameter_cm) values ('x', 'round', -5) $$, '23514', null,
  'negative pan dimension is rejected');
-- 15–16 images
select throws_ok($$ insert into recipe_images (recipe_id, origin) values ('a0000000-0000-0000-0000-000000000001', 'upload') $$,
  '23514', null, 'upload image without storage_path is rejected');
insert into recipe_images (recipe_id, origin, external_url, is_cover) values ('a0000000-0000-0000-0000-000000000001', 'import', 'https://x/1.jpg', true);
select throws_ok($$ insert into recipe_images (recipe_id, origin, external_url, is_cover)
  values ('a0000000-0000-0000-0000-000000000001', 'import', 'https://x/2.jpg', true) $$, '23505', null, 'second cover image is rejected');
-- 17–19 cross-recipe references (composite FKs)
select throws_ok($$ insert into recipe_ingredients (recipe_id, section_id, position, name)
  values ('a0000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', 3, 'x') $$, '23503', null,
  'ingredient cannot reference a section of another recipe');
select throws_ok($$ update recipes set current_version_id = 'b7000000-0000-0000-0000-000000000001'
  where id = 'a0000000-0000-0000-0000-000000000001' $$, '23503', null,
  'current_version_id cannot point at another recipe''s version');
select lives_ok($$ update recipes set current_version_id = 'a7000000-0000-0000-0000-000000000001'
  where id = 'a0000000-0000-0000-0000-000000000001' $$, 'current_version_id accepts own version');
-- 20 deleting a section keeps the ingredient (section_id → null, recipe_id kept)
savepoint s;
delete from recipe_sections where id = 'a5000000-0000-0000-0000-000000000001';
select is((select count(*)::int from recipe_ingredients where recipe_id = 'a0000000-0000-0000-0000-000000000001' and section_id is null and name = 'flour'), 1,
  'deleting a section nulls section_id and keeps the ingredient');
rollback to savepoint s;

-- 21 search
select is((select count(*)::int from recipes where search @@ websearch_to_tsquery('english', 'chocolate brownie')), 1,
  'full-text search matches title + description with stemming');

-- 22 updated_at trigger
update recipes set updated_at = '2000-01-01' where id = 'a0000000-0000-0000-0000-000000000001';
select ok((select updated_at > now() - interval '1 minute' from recipes where id = 'a0000000-0000-0000-0000-000000000001'),
  'updated_at is set by trigger on update');

-- ── RLS: every public table has it ──────────────────────────────────────
-- 23
select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity), 0,
  'every public table has RLS enabled');

-- ── RLS as Alice ────────────────────────────────────────────────────────
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');
-- 24–29 reads
select is((select count(*)::int from recipes), 1, 'Alice sees only her recipes');
select is((select count(*)::int from recipe_ingredients where recipe_id = 'b0000000-0000-0000-0000-000000000001'), 0, 'Alice cannot see Bob''s ingredients');
select is((select count(*)::int from recipe_steps), 0, 'Alice cannot see Bob''s steps');
select is((select count(*)::int from recipe_versions), 1, 'Alice sees only her versions');
select is((select count(*)::int from profiles), 1, 'Alice sees only her profile');
select is((select count(*)::int from ingredients where owner_id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0, 'Alice cannot see Bob''s private ingredients');
-- 30 globals visible
select ok((select count(*) from ingredients where owner_id is null) >= 10, 'Alice sees global ingredients');
-- 31–33 writes to Bob's data silently affect 0 rows
select is(pg_temp.affected($q$update recipes set title = 'pwned' where id = 'b0000000-0000-0000-0000-000000000001'$q$), 0,
  'Alice cannot update Bob''s recipe');
select is(pg_temp.affected($q$delete from recipe_ingredients where recipe_id = 'b0000000-0000-0000-0000-000000000001'$q$), 0,
  'Alice cannot delete Bob''s ingredients');
select is(pg_temp.affected($q$update ingredients set name = 'x' where owner_id is null$q$), 0,
  'Alice cannot modify global ingredients');
-- 34–37 inserts that would escape ownership are rejected
select throws_ok($$ insert into recipes (owner_id, title, source_type) values ('bbbbbbbb-0000-0000-0000-000000000000', 'x', 'manual') $$,
  '42501', null, 'Alice cannot create a recipe owned by Bob');
select throws_ok($$ insert into recipe_steps (recipe_id, position, body) values ('b0000000-0000-0000-0000-000000000001', 1, 'x') $$,
  '42501', null, 'Alice cannot add a step to Bob''s recipe');
select throws_ok($$ insert into ingredients (owner_id, name) values (null, 'fake global') $$,
  '42501', null, 'Alice cannot create a global ingredient');
select throws_ok($$ insert into recipe_ingredients (recipe_id, position, name, ingredient_id)
  values ('a0000000-0000-0000-0000-000000000001', 9, 'x', 'b1000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'Alice cannot link Bob''s private ingredient');
-- 38 versions are immutable
select is(pg_temp.affected($q$update recipe_versions set change_note = 'x'$q$), 0,
  'versions cannot be updated through the API');
-- 39 own writes work
select lives_ok($$ insert into recipes (owner_id, title, source_type) values ('aaaaaaaa-0000-0000-0000-000000000000', 'Mine', 'paste') $$,
  'Alice can create her own recipe');

-- ── RLS as anon ─────────────────────────────────────────────────────────
select pg_temp.as_anon();
-- 40–41
select is((select count(*)::int from recipes), 0, 'anon sees no recipes');
select ok((select count(*) from pans) >= 8, 'anon can read global pan presets');

-- ── account deletion cascades ───────────────────────────────────────────
select pg_temp.as_admin();
insert into import_jobs (owner_id, url, status) values ('bbbbbbbb-0000-0000-0000-000000000000', 'https://x', 'ok');
-- 42
select lives_ok($$ delete from auth.users where id = 'bbbbbbbb-0000-0000-0000-000000000000' $$,
  'deleting a user with recipes, private ingredients and import jobs succeeds');

select * from finish();
rollback;
