-- enums
create type recipe_source  as enum ('import','manual','paste');
create type pan_shape      as enum ('round','square','rectangle','loaf','springform',
                                    'sheet','bundt','tube','muffin','skillet','other');
create type scaling_rule   as enum ('linear',      -- default
                                    'count_round', -- eggs, whole items: round to 1 (or 0.5)
                                    'leavening',   -- linear + warning at extreme factors
                                    'to_taste',    -- shown unscaled: "salt, to taste"
                                    'fixed');      -- never scales: "1 bay leaf", "pan spray"

-- users: Supabase auth.users; profile holds preferences
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text,
  unit_system   text not null default 'us' check (unit_system in ('us','metric')),
  created_at    timestamptz not null default now()
);

-- ingredient catalog: density + defaults. Seed ~150 common items; user rows allowed.
create table ingredients (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid references auth.users,           -- null = global seed
  name                  text not null,                        -- 'all-purpose flour'
  aliases               text[] not null default '{}',         -- {'ap flour','plain flour'}
  density_g_per_ml      numeric(6,4),                         -- flour ≈ 0.5072 (120 g/cup). null = no vol↔mass
  each_g                numeric(7,2),                         -- 1 large egg ≈ 50; enables count↔mass
  default_scaling_rule  scaling_rule not null default 'linear',
  prefer_mass_in_metric boolean not null default true,        -- metric view shows flour in g, milk in ml
  shopping_category     text,                                 -- 'baking','dairy' (shopping list later)
  unique (owner_id, name)
);
create index on ingredients using gin (aliases);

-- pans: global presets + user-defined. Dimensions in cm.
create table pans (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users,                    -- null = preset
  label        text not null,                                 -- '9×13 in rectangle'
  shape        pan_shape not null,
  diameter_cm  numeric(5,2),                                  -- round/springform/skillet
  width_cm     numeric(5,2),                                  -- square/rect/loaf/sheet
  length_cm    numeric(5,2),
  depth_cm     numeric(5,2),                                  -- optional; enables volume mode
  volume_ml    numeric(8,1),                                  -- bundt/tube (area meaningless)
  cup_count    smallint,                                      -- muffin tins
  check (
    (shape in ('round','springform','skillet') and diameter_cm is not null) or
    (shape in ('square','rectangle','loaf','sheet') and width_cm is not null and length_cm is not null) or
    (shape in ('bundt','tube') and volume_ml is not null) or
    (shape = 'muffin' and cup_count is not null) or
    shape = 'other'
  )
);

create table recipes (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users on delete cascade,
  title              text not null,
  description        text,
  source_type        recipe_source not null,
  source_url         text,
  source_name        text,                                    -- site / author for attribution
  yield_qty          numeric(7,2),                            -- 24
  yield_unit         text,                                    -- 'cookies','servings','loaf'
  pan_id             uuid references pans,                    -- original pan; null = not pan-based
  prep_min           int, cook_min int, total_min int,
  oven_temp_c        numeric(5,1),                            -- display converts to °F
  current_version_id uuid,                                    -- FK added after recipe_versions
  search             tsvector generated always as (
                       to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))
                     ) stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on recipes using gin (search);
create index on recipes (owner_id, updated_at desc);

-- optional sections: "Dough", "Filling", "Frosting"
create table recipe_sections (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipes on delete cascade,
  title      text not null,
  position   int not null
);

create table recipe_ingredients (
  id               uuid primary key default gen_random_uuid(),
  recipe_id        uuid not null references recipes on delete cascade,
  section_id       uuid references recipe_sections on delete set null,
  position         int not null,
  raw_text         text,                                      -- '1 ½ cups flour, sifted' (import source)
  quantity         numeric(10,4),                             -- 1.5 ; null = "salt to taste"
  quantity_max     numeric(10,4),                             -- ranges: '2–3 cloves'
  unit_code        text,                                      -- 'cup' | 'g' | 'tbsp' | null (count)
  ingredient_id    uuid references ingredients,               -- link → density; null if unmatched
  name             text not null,                             -- display name as written
  preparation      text,                                      -- 'sifted', 'finely chopped'
  note             text,                                      -- 'or substitute X'
  is_optional      boolean not null default false,
  scaling_rule     scaling_rule,                              -- null = inherit ingredients.default
  parse_confidence real,                                      -- <0.8 → highlight for review
  check (quantity_max is null or quantity_max >= quantity)
);
create index on recipe_ingredients (recipe_id, position);

create table recipe_steps (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references recipes on delete cascade,
  section_id  uuid references recipe_sections on delete set null,
  position    int not null,
  body        text not null,
  -- future cook mode: [{label:'bake', seconds:1500, offset:[start,end]}] parsed from text
  timers      jsonb not null default '[]'
);

create table recipe_images (
  id           uuid primary key default gen_random_uuid(),
  recipe_id    uuid not null references recipes on delete cascade,
  step_id      uuid references recipe_steps on delete set null, -- per-step photos
  origin       text not null check (origin in ('upload','import')),
  storage_path text,                                          -- 'u/{uid}/{recipe}/{id}.webp' (uploads)
  thumb_path   text,                                          -- 400px variant
  external_url text,                                          -- imports: hotlinked source image
  width        int, height int,
  blurhash     text,                                          -- placeholder while loading
  alt          text,
  is_cover     boolean not null default false,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  check ((origin='upload' and storage_path is not null) or (origin='import' and external_url is not null))
);
create unique index one_cover_per_recipe on recipe_images (recipe_id) where is_cover;

-- version history: snapshot on every save. v1 = as imported/created.
create table recipe_versions (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references recipes on delete cascade,
  version_no  int not null,
  snapshot    jsonb not null,                                 -- full recipe+ingredients+steps (Zod-typed)
  change_note text,
  created_at  timestamptz not null default now(),
  unique (recipe_id, version_no)
);
alter table recipes add foreign key (current_version_id) references recipe_versions;

-- import cache / debugging
create table import_jobs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users,
  url         text not null,
  method      text check (method in ('jsonld','microdata','llm','paste')),
  status      text not null check (status in ('ok','partial','failed')),
  raw_payload jsonb,                                          -- extracted JSON-LD / LLM output
  error       text,
  recipe_id   uuid references recipes on delete set null,
  created_at  timestamptz not null default now()
);
