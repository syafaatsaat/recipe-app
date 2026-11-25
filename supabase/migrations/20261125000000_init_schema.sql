-- Recipe app schema. Source of truth for the DB (see docs/design.md §4).
-- RLS policies: 20261125000001_rls_policies.sql. Triggers: 20261125000002_triggers.sql.

-- enums
create type recipe_source  as enum ('import','manual','paste');
create type pan_shape      as enum ('round','square','rectangle','loaf','springform',
                                    'sheet','bundt','tube','muffin','skillet','other');
create type scaling_rule   as enum ('linear',      -- default
                                    'count_round', -- eggs, whole items: round to 1 (or 0.5)
                                    'leavening',   -- linear + warning at extreme factors
                                    'to_taste',    -- shown unscaled: "salt, to taste"
                                    'fixed');      -- never scales: "1 bay leaf", "pan spray"

-- users: Supabase auth.users; profile holds preferences (row created by trigger on signup)
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text,
  unit_system   text not null default 'us' check (unit_system in ('us','metric')),
  created_at    timestamptz not null default now()
);

-- ingredient catalog: density + defaults. Global seed rows (owner_id null) + user rows.
create table ingredients (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid references auth.users on delete cascade, -- null = global seed
  name                  text not null,
  aliases               text[] not null default '{}',
  density_g_per_ml      numeric(6,4) check (density_g_per_ml > 0),  -- null = no vol↔mass
  each_g                numeric(7,2) check (each_g > 0),            -- count↔mass
  default_scaling_rule  scaling_rule not null default 'linear',
  prefer_mass_in_metric boolean not null default true,
  shopping_category     text,
  -- NULLS NOT DISTINCT: otherwise two global rows named 'flour' are allowed
  unique nulls not distinct (owner_id, name)
);
create index on ingredients using gin (aliases);

-- pans: global presets (owner_id null) + user-defined. Dimensions in cm.
create table pans (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users on delete cascade,  -- null = preset
  label        text not null,
  shape        pan_shape not null,
  diameter_cm  numeric(5,2) check (diameter_cm > 0),
  width_cm     numeric(5,2) check (width_cm > 0),
  length_cm    numeric(5,2) check (length_cm > 0),
  depth_cm     numeric(5,2) check (depth_cm > 0),             -- optional; enables volume mode
  volume_ml    numeric(8,1) check (volume_ml > 0),            -- bundt/tube
  cup_count    smallint     check (cup_count > 0),            -- muffin tins
  check (
    (shape in ('round','springform','skillet') and diameter_cm is not null) or
    (shape in ('square','rectangle','loaf','sheet') and width_cm is not null and length_cm is not null) or
    (shape in ('bundt','tube') and volume_ml is not null) or
    (shape = 'muffin' and cup_count is not null) or
    shape = 'other'
  )
);
create index on pans (owner_id);

create table recipes (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users on delete cascade,
  title              text not null,
  description        text,
  source_type        recipe_source not null,
  source_url         text,
  source_name        text,
  yield_qty          numeric(7,2) check (yield_qty > 0),
  yield_unit         text,
  pan_id             uuid references pans on delete set null,
  prep_min           int check (prep_min  >= 0),
  cook_min           int check (cook_min  >= 0),
  total_min          int check (total_min >= 0),
  oven_temp_c        numeric(5,1) check (oven_temp_c > 0),
  current_version_id uuid,                                    -- FK added after recipe_versions
  search             tsvector generated always as (
                       to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))
                     ) stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on recipes using gin (search);
create index on recipes (owner_id, updated_at desc);
create index on recipes (pan_id);
create index on recipes (current_version_id);

create table recipe_sections (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipes on delete cascade,
  title      text not null,
  position   int not null,
  unique (id, recipe_id)          -- target for composite FKs: a child's section must be in the same recipe
);
create index on recipe_sections (recipe_id, position);

create table recipe_ingredients (
  id               uuid primary key default gen_random_uuid(),
  recipe_id        uuid not null references recipes on delete cascade,
  section_id       uuid,
  position         int not null,
  raw_text         text,
  quantity         numeric(10,4) check (quantity > 0),        -- null = "salt to taste"
  quantity_max     numeric(10,4),                             -- ranges: '2–3 cloves'
  -- must match UNIT_CODES in lib/culinary/units.ts (a test enforces it). null = count.
  unit_code        text check (unit_code in ('tsp','tbsp','fl_oz','cup','pint','quart',
                                             'ml','l','g','kg','oz','lb')),
  ingredient_id    uuid references ingredients on delete set null,
  name             text not null,
  preparation      text,
  note             text,
  is_optional      boolean not null default false,
  scaling_rule     scaling_rule,                              -- null = inherit ingredients.default
  parse_confidence real check (parse_confidence between 0 and 1),
  check (quantity_max is null or (quantity is not null and quantity_max >= quantity)),
  foreign key (section_id, recipe_id) references recipe_sections (id, recipe_id)
    on delete set null (section_id)
);
create index on recipe_ingredients (recipe_id, position);
create index on recipe_ingredients (section_id);
create index on recipe_ingredients (ingredient_id);

create table recipe_steps (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references recipes on delete cascade,
  section_id  uuid,
  position    int not null,
  body        text not null,
  timers      jsonb not null default '[]',
  unique (id, recipe_id),
  foreign key (section_id, recipe_id) references recipe_sections (id, recipe_id)
    on delete set null (section_id)
);
create index on recipe_steps (recipe_id, position);
create index on recipe_steps (section_id);

create table recipe_images (
  id           uuid primary key default gen_random_uuid(),
  recipe_id    uuid not null references recipes on delete cascade,
  step_id      uuid,                                          -- per-step photos
  origin       text not null check (origin in ('upload','import')),
  storage_path text,
  thumb_path   text,
  external_url text,
  width        int check (width  > 0),
  height       int check (height > 0),
  blurhash     text,
  alt          text,
  is_cover     boolean not null default false,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  check ((origin='upload' and storage_path is not null) or (origin='import' and external_url is not null)),
  foreign key (step_id, recipe_id) references recipe_steps (id, recipe_id)
    on delete set null (step_id)
);
create unique index one_cover_per_recipe on recipe_images (recipe_id) where is_cover;
create index on recipe_images (recipe_id, position);
create index on recipe_images (step_id);

-- version history: snapshot on every save. v1 = as imported/created.
create table recipe_versions (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references recipes on delete cascade,
  version_no  int not null check (version_no >= 1),
  snapshot    jsonb not null,
  change_note text,
  created_at  timestamptz not null default now(),
  unique (recipe_id, version_no),
  unique (id, recipe_id)
);
-- composite: a recipe's current version must belong to that recipe
alter table recipes add foreign key (current_version_id, id)
  references recipe_versions (id, recipe_id) on delete set null (current_version_id);

-- import cache / debugging
create table import_jobs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users on delete cascade,
  url         text not null,
  method      text check (method in ('jsonld','microdata','llm','paste')),
  status      text not null check (status in ('ok','partial','failed')),
  raw_payload jsonb,
  error       text,
  recipe_id   uuid references recipes on delete set null,
  created_at  timestamptz not null default now()
);
create index on import_jobs (owner_id, created_at desc);
create index on import_jobs (recipe_id);
