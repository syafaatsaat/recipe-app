# Recipe App: Tech Stack & Data Schema (v1 draft)

## 1. Stack (decision)

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js (App Router) + TypeScript** | One codebase and one deploy for UI and backend. Route handlers and server actions run the scraper server-side, which solves CORS. It is the stack a portfolio reviewer recognizes. |
| Hosting | **Vercel Hobby** (free) | Zero-config deploys and preview URL per PR. Hobby is non-commercial only, which is fine for a portfolio. |
| DB + Auth + Files | **Supabase free tier** (Postgres, Auth, Storage) | Relational data (recipes→ingredients→units→pans) needs SQL. You get one vendor for three needs. Row Level Security handles per-user ownership. Built-in full-text search covers search/filter later. |
| ORM | **Drizzle** | SQL-shaped, typed, lightweight migrations, no codegen step or heavy runtime like Prisma. |
| Validation | **Zod** | One schema shared by forms, API inputs and LLM structured output. |
| UI | **Tailwind + shadcn/ui** | Fast and good-looking, and you own the components. |
| Scraping | `fetch` + **cheerio** in a route handler | Order: JSON-LD `Recipe`, then microdata/RDFa, then an LLM fallback (Claude Haiku, structured output against the Zod schema). Cache raw HTML/JSON-LD per URL. |
| Ingredient line parsing | Own regex/lexicon parser, LLM fallback when confidence is low | JSON-LD gives you *strings* (`"1 ½ cups flour, sifted"`), not structure. This parser is the real work of the import feature. |
| Domain logic | Pure TS module `lib/culinary/` (units, density, scaling, rounding, pans) | Runs on both client and server, with no I/O, so it's 100% unit-testable. This is the most portfolio-worthy code in the project, so make it well tested. |
| Tests | **Vitest** (domain), **Playwright** (2–3 e2e flows) | |

**Rejected:**
- Separate FastAPI/Express backend: two deploys, CORS config, no benefit at this scale.
- MongoDB/Firebase: your data is relational, and shopping-list aggregation and logs want joins.
- Pure SPA + serverless scraper: same thing with more moving parts.

**Gotchas to plan for now:**
- **Supabase free projects pause after ~7 days idle.** A dead demo link is bad for a portfolio. Add a daily keep-alive query (Vercel Cron or a GitHub Action).
- **Vercel function timeout** (Hobby default is short). Keep scraping and LLM calls to one request with a hard timeout. Don't chain retries in-request.
- **Supabase image transforms are a paid feature.** Resize client-side before upload (2 sizes: 1600px and 400px, WebP).
- **Some sites block or Cloudflare-challenge server fetches.** Show "couldn't import, paste the text instead" and send the pasted text through the same parser/LLM path. This is also how you get "create your own recipe from text" for free.
- **Imported images:** store the source URL and don't re-host by default (copyright plus storage quota). User photos go to Storage.

## 2. Corrections to the plan

- **"Non-linear scaling for eggs/salt/spices" is mostly wrong as stated.** Salt and spices scale linearly in practice. What's actually needed is (a) **rounding rules** (eggs to whole counts) and (b) **flags**, not silent fudging. The only real non-linear cases are **leavening across large pan or depth changes** and **bake time**. So: scale everything linearly, apply a per-ingredient *rounding/presentation rule*, and show a warning for leavening when the factor is >2× or <0.5×. Silent "smart" adjustment you can't explain is a bug magnet and is impossible to test against a ground truth.
- **Pan scaling by area assumes the same depth.** A 9×13 at 2" deep vs a 9" round at 1.5" is a volume question. Use area by default and switch to volume when both depths are known. Bundt and muffin pans aren't area problems at all (use volume or cup count).
- **Two different "originals" exist.** Keep them distinct in the UI:
  1. **Reset scaling**: factor = 1, units = source system. This is pure view state and touches nothing in the DB.
  2. **Revert edits**: restore an earlier *version* of the recipe after manual edits. This uses version history.
  
  If you conflate these, you'll either mutate stored quantities when scaling (wrong) or lose import fidelity on edit (wrong).
- **Never persist scaled quantities.** Scaling is a pure function at render: `render(baseRecipe, scaleState)`. The stored recipe is always the base, so "keep originals" is automatic.

## 3. Core modelling decisions

1. **Store quantities as entered** (`quantity` + `unit_code` in the source unit) and convert at render. You don't store a canonical copy, because it's derivable and drifts on edit.
2. **Units are a TS constant, not a DB table.** They're static and code-owned. The DB stores `unit_code text` with a CHECK constraint. Densities live in the DB because they're data that grows.
3. **Base dimensions:** volume in **ml**, mass in **g**, length in **cm**. Display converts to the chosen system.
4. **`raw_text` is kept on every imported ingredient line.** The parser will be wrong sometimes, and the user needs to see the source while fixing it.
5. **Scale state lives in the URL** (`?mode=pan&pan=9x13&units=metric`). It's shareable, survives refresh, and needs no table. It only gets persisted in cook logs.

## 4. Schema (Postgres)

```sql
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
```

**Why snapshots and not diffs for versions:** recipes are small (a few KB), and restore becomes a single read. It also doubles as an immutable "original import" (v1). The normalized tables stay the source of truth for queries. The snapshot is only for history and restore.

**RLS:** every user table gets `owner_id = auth.uid()`. Global `ingredients`/`pans` (`owner_id is null`) are readable by everyone.

### Future tables (schema already accommodates them)

```sql
create table tags (id uuid primary key default gen_random_uuid(), owner_id uuid, name text, unique(owner_id,name));
create table recipe_tags (recipe_id uuid references recipes on delete cascade, tag_id uuid references tags on delete cascade, primary key (recipe_id, tag_id));

create table cook_logs (                       -- cooking log; also records scale used
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null, recipe_id uuid not null references recipes on delete cascade,
  version_id uuid references recipe_versions,  -- exactly what was cooked
  cooked_at timestamptz not null default now(),
  scale_state jsonb,                           -- {mode:'pan', factor:1.84, pan_id:…, units:'metric'}
  rating smallint check (rating between 1 and 5),
  notes text, image_id uuid references recipe_images
);

create table shopping_lists (id uuid primary key default gen_random_uuid(), owner_id uuid not null, name text, created_at timestamptz default now());
create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references shopping_lists on delete cascade,
  ingredient_id uuid references ingredients,   -- enables merging "flour" across recipes
  source_recipe_id uuid references recipes on delete set null,
  name text not null, quantity numeric(10,4), unit_code text,
  checked boolean not null default false, position int
);
```

**Cook-mode ingredient checkboxes** are ephemeral. Keep them in `localStorage` keyed by `recipeId`, not in the DB.

## 5. Domain types (`lib/culinary/`)

```ts
type Dimension = 'volume' | 'mass' | 'count';
type UnitSystem = 'us' | 'metric';

interface UnitDef {
  code: string;            // 'cup'
  dimension: Dimension;
  toBase: number;          // ml for volume, g for mass; cup = 236.588
  system: UnitSystem | 'both';
  aliases: string[];       // ['c','cups','C.']
  fractions: boolean;      // US units display ⅓ ½ ¼; metric decimals
}
// UNITS: tsp 4.929 · tbsp 14.787 · fl_oz 29.574 · cup 236.588 · pint 473.18 · quart 946.35
//        ml 1 · l 1000 · g 1 · kg 1000 · oz 28.3495 · lb 453.592

type ScaleState =
  | { mode: 'none' }
  | { mode: 'factor'; factor: number }                 // "×2", "½"
  | { mode: 'yield';  targetQty: number }              // 24 cookies → 36
  | { mode: 'pan';    targetPanId: string; useDepth: boolean };

interface ScaleResult {
  factor: number;
  warnings: Warning[];   // 'BAKE_TIME_CHANGES' | 'LEAVENING_EXTREME' | 'SHAPE_CHANGE' | 'DEPTH_UNKNOWN'
  bakeHint?: string;     // "Shallower pan: start checking ~25% earlier"
}

render(recipe, scale: ScaleState, units: UnitSystem): RenderedRecipe  // pure; never mutates
```

### Pan factor
- Area: round `π·(d/2)²`, rect `w·l`, loaf/sheet the same as rect. 9" round → 9×13: 63.6 → 117 in² = **1.84×** ✓.
- When both pans have a depth, use the volume ratio. If the shape class changes (round→rect) or the depth ratio is off by more than 20%, emit `BAKE_TIME_CHANGES` plus a direction hint (shallower means faster, deeper means slower and maybe lower temp).
- Bundt/tube use the `volume_ml` ratio. Muffin uses the `cup_count` ratio. Mixing area pans with volume pans requires depth, otherwise show `DEPTH_UNKNOWN` and fall back to an assumed 5 cm depth.
- Yield mode for pan recipes: if the recipe has `pan_id` and a yield, both modes are offered. They are mutually exclusive, and the last one chosen wins.

### Render pipeline per ingredient
1. `q × factor` (ranges scale both ends). `to_taste`/`fixed` skip this.
2. **Unit system conversion**:
   - US→metric: volume plus known density plus `prefer_mass_in_metric` gives **g**. Liquids give ml.
   - Metric→US: mass gives cups/tbsp when density is known, otherwise oz/lb.
   - Unknown density: convert within the same dimension only, never across.
3. **Pick the best unit**: walk the ladder (tsp→tbsp→¼ cup→cup) so 0.0625 cup shows as "1 tbsp", and 18 tsp shows as "⅓ cup + 2 tsp" (allow at most 2 parts).
4. **Kitchen rounding**:
   - US fractions snap to ⅛ ¼ ⅓ ½ ⅔ ¾.
   - Grams: <10 g to 0.5 g, <100 g to 1 g, <1000 g to 5 g, then 10 g.
   - ml: same steps.
   - `count_round`: eggs round to the nearest 1. If the remainder is ≥0.25, show it as beaten egg (≈1 tbsp per ¼ egg), e.g. "2 eggs + 1 tbsp beaten egg" (or grams using `each_g`).
5. Show the original under the scaled value when factor ≠ 1, using a muted "(orig. 1 cup)" label. The **Reset** button sets `ScaleState` to `none` and units to the source system.

## 6. Build order
1. Domain module plus tests (units, density seed, pan math, rounding). This has no UI dependency, so it can start before any design work.
2. **Design pass 1: UX wireframes (½–1 day, low-fi).** Cover the 4 screens that drive structure: recipe view with scale/unit controls and the "orig." display, structured ingredient editor, import review/fix, and recipe list. Do it here because these screens decide component boundaries and the editor's data flow. Pick a shadcn theme, type scale and colour tokens. Skip pixel polish.
3. Schema, auth, manual recipe CRUD with structured ingredient editor. Add the daily Supabase keep-alive cron (Vercel Cron hitting a route that runs `select 1`) as soon as the project is deployed.
4. Render with scaling, unit toggle and URL state.
5. Importer: JSON-LD, then the ingredient-line parser, then the review/fix screen (low-confidence lines highlighted), then the LLM fallback.
6. Photo upload (client resize, Storage, cover/per-step).
7. **Design pass 2: visual polish (2–3 days).** Do this once real recipes and photos exist, because you can't judge a design against lorem ipsum. Covers the landing/demo page, empty states, mobile layout (people cook from phones), loading skeletons, dark mode. Then seed a public demo account and launch the portfolio here, since this is the first shippable version.
8. Version history, then cook mode, then search/tags, then shopping list, then cook log. Each feature gets a quick wireframe before you build it, not a separate design phase.
