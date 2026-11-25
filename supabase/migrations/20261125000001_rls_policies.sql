-- Row Level Security. Supabase exposes every public table through the Data API
-- with the anon key, so every table must have RLS enabled.
-- `(select auth.uid())` instead of `auth.uid()` lets Postgres evaluate it once per query.

alter table profiles           enable row level security;
alter table ingredients        enable row level security;
alter table pans               enable row level security;
alter table recipes            enable row level security;
alter table recipe_sections    enable row level security;
alter table recipe_ingredients enable row level security;
alter table recipe_steps       enable row level security;
alter table recipe_images      enable row level security;
alter table recipe_versions    enable row level security;
alter table import_jobs        enable row level security;

-- profiles: rows are created by the on-signup trigger; users read/update their own.
create policy profiles_select_own on profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ingredients / pans: global rows (owner_id null) readable by everyone, writable by no one
-- through the API (seeded by migrations). Users manage their own rows.
create policy ingredients_select on ingredients for select to anon, authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy ingredients_insert_own on ingredients for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy ingredients_update_own on ingredients for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy ingredients_delete_own on ingredients for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy pans_select on pans for select to anon, authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy pans_insert_own on pans for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy pans_update_own on pans for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy pans_delete_own on pans for delete to authenticated
  using (owner_id = (select auth.uid()));

-- recipes: owner only. A referenced pan must be one the user can see (FK checks ignore RLS).
create policy recipes_owner on recipes for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (pan_id is null or exists (select 1 from pans p where p.id = pan_id))
  );

-- child tables have no owner_id: ownership goes through the parent recipe.
-- The subquery on recipes is itself filtered by recipes_owner.
create policy recipe_sections_owner on recipe_sections for all to authenticated
  using      (exists (select 1 from recipes r where r.id = recipe_id))
  with check (exists (select 1 from recipes r where r.id = recipe_id));

create policy recipe_ingredients_owner on recipe_ingredients for all to authenticated
  using (exists (select 1 from recipes r where r.id = recipe_id))
  with check (
    exists (select 1 from recipes r where r.id = recipe_id)
    and (ingredient_id is null or exists (select 1 from ingredients i where i.id = ingredient_id))
  );

create policy recipe_steps_owner on recipe_steps for all to authenticated
  using      (exists (select 1 from recipes r where r.id = recipe_id))
  with check (exists (select 1 from recipes r where r.id = recipe_id));

create policy recipe_images_owner on recipe_images for all to authenticated
  using      (exists (select 1 from recipes r where r.id = recipe_id))
  with check (exists (select 1 from recipes r where r.id = recipe_id));

-- versions are immutable history: select + insert only (restore = insert a new version).
create policy recipe_versions_select on recipe_versions for select to authenticated
  using (exists (select 1 from recipes r where r.id = recipe_id));
create policy recipe_versions_insert on recipe_versions for insert to authenticated
  with check (exists (select 1 from recipes r where r.id = recipe_id));

create policy import_jobs_owner on import_jobs for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
