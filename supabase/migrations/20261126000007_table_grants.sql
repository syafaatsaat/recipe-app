-- Table privileges for the API roles, stated explicitly instead of relying on project defaults.
--
-- Local Supabase grants anon/authenticated everything on new public tables. Newer hosted
-- projects grant only REFERENCES/TRIGGER/TRUNCATE/MAINTAIN, so the app (which switches to
-- `authenticated` in db/withUser.ts) couldn't read or write anything there. RLS decides
-- which rows; these grants decide which statements. Each table gets only what its policies
-- in 001/005 need: no TRUNCATE (it bypasses RLS), and anon reads only the global presets.

revoke all on table
  profiles, ingredients, pans, recipes, recipe_sections, recipe_ingredients,
  recipe_steps, recipe_images, recipe_versions, import_jobs, llm_calls
from anon, authenticated;

grant select, insert, update, delete on table
  ingredients, pans, recipes, recipe_sections, recipe_ingredients,
  recipe_steps, recipe_images, import_jobs
to authenticated;

-- rows come from the on-signup trigger
grant select, update on table profiles to authenticated;
-- history is immutable: restoring inserts a new version
grant select, insert on table recipe_versions to authenticated;
-- written by the server as postgres, so users can't reset their own cap
grant select on table llm_calls to authenticated;

grant select on table ingredients, pans to anon;

-- Future tables start with no access locally too, as on hosted, so a missing grant
-- shows up in local tests instead of after a deploy. New tables must grant here.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
