-- Table privileges for anon/authenticated (migration 007). Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- the app's tables: full CRUD for authenticated (RLS picks the rows)
-- (a list of privileges is true if any is held, so positive checks name one at a time)
select ok(
  (select bool_and(has_table_privilege('authenticated', t, p))
     from unnest(array['ingredients', 'pans', 'recipes', 'recipe_sections', 'recipe_ingredients',
                       'recipe_steps', 'recipe_images', 'import_jobs']) t,
          unnest(array['select', 'insert', 'update', 'delete']) p),
  'authenticated can select, insert, update and delete the app''s tables');
select ok(
  (select not bool_or(has_table_privilege(r, t, 'truncate'))
     from unnest(array['anon', 'authenticated']) r,
          unnest(array['profiles', 'ingredients', 'pans', 'recipes', 'recipe_sections', 'recipe_ingredients',
                       'recipe_steps', 'recipe_images', 'recipe_versions', 'import_jobs', 'llm_calls']) t),
  'no API role can truncate (it bypasses RLS)');

-- profiles: read and update own, rows come from the signup trigger
select ok(has_table_privilege('authenticated', 'profiles', 'select') and has_table_privilege('authenticated', 'profiles', 'update'), 'authenticated reads and updates profiles');
select ok(not has_table_privilege('authenticated', 'profiles', 'insert'), 'authenticated can''t insert profiles');
select ok(not has_table_privilege('authenticated', 'profiles', 'delete'), 'authenticated can''t delete profiles');

-- recipe_versions: immutable history
select ok(has_table_privilege('authenticated', 'recipe_versions', 'select') and has_table_privilege('authenticated', 'recipe_versions', 'insert'), 'authenticated reads and adds versions');
select ok(not has_table_privilege('authenticated', 'recipe_versions', 'update'), 'versions can''t be edited');
select ok(not has_table_privilege('authenticated', 'recipe_versions', 'delete'), 'versions can''t be deleted');

-- llm_calls: read-only for users
select ok(has_table_privilege('authenticated', 'llm_calls', 'select'), 'authenticated reads llm_calls');
select ok(not has_table_privilege('authenticated', 'llm_calls', 'insert, update, delete'), 'authenticated can''t write llm_calls');

-- anon: the global presets only
select ok(has_table_privilege('anon', 'ingredients', 'select') and has_table_privilege('anon', 'pans', 'select'),
  'anon reads ingredients and pans');
select ok(not has_table_privilege('anon', 'pans', 'insert, update, delete'), 'anon can''t write pans');
select ok(
  (select not bool_or(has_table_privilege('anon', t, 'select'))
     from unnest(array['profiles', 'recipes', 'recipe_sections', 'recipe_ingredients', 'recipe_steps',
                       'recipe_images', 'recipe_versions', 'import_jobs', 'llm_calls']) t),
  'anon reads nothing else');

-- a table created later starts with no access, as on hosted projects
create table public.grants_probe (id int generated always as identity primary key);
select ok(not has_table_privilege('authenticated', 'grants_probe', 'select'), 'a new table grants authenticated nothing');
select ok(not has_table_privilege('anon', 'grants_probe', 'select'), 'a new table grants anon nothing');
select ok(not has_sequence_privilege('authenticated', 'grants_probe_id_seq', 'usage'), 'a new sequence grants authenticated nothing');

select * from finish();
rollback;
