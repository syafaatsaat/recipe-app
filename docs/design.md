# Recipe App: Tech Stack & Data Schema (v1 draft)

## 1. Stack (decision)

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js (App Router) + TypeScript** | One codebase and one deploy for UI and backend. Route handlers and server actions run the scraper server-side, which solves CORS. It is the stack a portfolio reviewer recognizes. |
| Hosting | **Vercel Hobby** (free) | Zero-config deploys and preview URL per PR. Hobby is non-commercial only, which is fine for a portfolio. |
| DB + Auth + Files | **Supabase free tier** (Postgres, Auth, Storage) | Relational data (recipes→ingredients→units→pans) needs SQL. You get one vendor for three needs. Row Level Security handles per-user ownership. Built-in full-text search covers search/filter later. |
| Migrations | **Raw SQL in `supabase/migrations/`** (Supabase CLI) | The single source of truth for tables, constraints, RLS policies and triggers. These all need Postgres/Supabase features (auth schema, `security definer` triggers, policies) that ORM migration tools handle badly. Applied locally with `supabase db reset` and tested with pgTAP (`supabase test db`). |
| ORM | **Drizzle**, for typed queries only | SQL-shaped and typed, with no heavy runtime. `db/schema.ts` is *generated* from the DB (`pnpm db:pull`), and `db/relations.ts` is hand-written because introspection mis-joins composite FKs. Never use `drizzle-kit generate/push`. **Drizzle connects as `postgres`, which bypasses RLS**, so user-scoped queries must go through `db/withUser.ts` (sets role `authenticated` and the JWT claims per transaction). |
| Validation | **Zod** | One schema shared by forms, API inputs and LLM structured output. |
| UI | **Tailwind + shadcn/ui** | Fast and good-looking, and you own the components. |
| Scraping | `fetch` + **cheerio** in a route handler | Order: JSON-LD `Recipe`, then microdata/RDFa, then an LLM fallback (Claude Haiku, currently `claude-haiku-5-5`, structured output against the Zod schema). Cache raw HTML/JSON-LD per URL. |
| Ingredient line parsing | Own regex/lexicon parser, LLM fallback when confidence is low | JSON-LD gives you *strings* (`"1 ½ cups flour, sifted"`), not structure. This parser is the real work of the import feature. |
| Domain logic | Pure TS module `lib/culinary/` (units, density, scaling, rounding, pans) | Runs on both client and server, with no I/O, so it's 100% unit-testable. This is the most portfolio-worthy code in the project, so make it well tested. |
| Tests | **Vitest** (domain), **Playwright** (2–3 e2e flows) | |

**Rejected:**
- Separate FastAPI/Express backend: two deploys, CORS config, no benefit at this scale.
- MongoDB/Firebase: your data is relational, and shopping-list aggregation and logs want joins.
- Pure SPA + serverless scraper: same thing with more moving parts.

**Gotchas to plan for now:**
- **Supabase free projects pause after 1 week of inactivity** (verified). A dead demo link is bad for a portfolio. Add a daily keep-alive query. Vercel Cron on Hobby allows exactly this: at most once a day, fired anywhere within the scheduled hour.
- **Vercel function timeout:** Hobby is 300 s, as both default and maximum (verified, with Fluid compute). That's no longer tight, but still put a hard timeout (~20 s) on each outbound fetch/LLM call so a hung site can't hold a request for 5 minutes. Don't chain retries in-request.
- **Supabase image transforms are paid (Pro and up)** (verified). Resize client-side before upload (2 sizes: 1600px and 400px, WebP).
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
6. **"Stick" of butter is converted at parse time to oz** (decided 2026-11-25). `stick`/`sticks` before butter or margarine becomes `4 oz` per stick ("1½ sticks butter" → 6 oz), stored as `unit_code = 'oz'`, with `raw_text` keeping the original words. It is **not** a `UNIT_CODES` entry, so there's no schema change. Before any other ingredient, "stick" is an unknown unit: low confidence, flagged on the review screen. Because oz is mass, the US view shows oz/lb (rule 3) and Metric shows grams with no density needed: 4 oz → **115 g**, 8 oz → 225 g (checked against `render()`). Built in M5 with a parser test.
7. **Users can add their own ingredients** (decided 2026-11-25). When a line doesn't match the catalog, the editor and import review offer "Add to my ingredients": an `ingredients` row with the user's `owner_id` (already allowed by schema and RLS). Density is optional. The form asks for "weight of 1 cup in grams", the friendlier question, and stores `g ÷ 236.588` as `density_g_per_ml`. Without a density the line still scales and converts within its own dimension, but never volume↔mass. Built in M3 (editor) and M5 (import review).
8. **Auth: email + password** (decided 2026-11-25; easy to test, and the public demo account is just a known login). Supabase Auth via `@supabase/ssr`:
   - `proxy.ts` (Next 16's renamed middleware) refreshes the session cookie on every request with `getClaims()` and does optimistic redirects only, for page loads (GET/HEAD). Server Actions are never redirected there: they expect an RSC reply, so they check the user themselves and use `redirect("/login")`.
   - **The security boundary is `lib/auth.ts`** (`getUser()` / `requireUserId()`, which verify the JWT with `getClaims()`; never `getSession()` on the server) **plus RLS**. Every page, Server Action and route that touches user data calls it.
   - `getUser()` calls `await connection()` first: `getClaims()` reads the clock, which Next forbids while prerendering.
   - Email links (sign-up confirmation, password reset) land on `/auth/confirm`, which accepts both the PKCE `?code=` and the `?token_hash=&type=` styles.

## 4. Schema (Postgres)

**The schema lives in [`supabase/migrations/`](../supabase/migrations/). Don't copy SQL back into this doc, because it will drift.**

| Migration | Contents |
|---|---|
| `…000_init_schema.sql` | enums (`recipe_source`, `pan_shape`, `scaling_rule`), tables `profiles`, `ingredients`, `pans`, `recipes`, `recipe_sections`, `recipe_ingredients`, `recipe_steps`, `recipe_images`, `recipe_versions`, `import_jobs`, plus indexes |
| `…001_rls_policies.sql` | RLS on every table, plus policies |
| `…002_triggers.sql` | profile row on signup, `recipes.updated_at` |

Tests: [`supabase/tests/schema_smoke.test.sql`](../supabase/tests/schema_smoke.test.sql) (42 pgTAP checks). Seed: [`supabase/seed.sql`](../supabase/seed.sql).

**What changed from the v1 draft SQL, and why.** The draft applied cleanly, but probing it found the following. The verbatim draft is in git history (commit `50eeb88`).
- **No RLS at all.** Supabase exposes `public` tables through the Data API with the public anon key, so with RLS off, anyone could read and write every table. Every table now has RLS. Child tables have no `owner_id`, so their policies check ownership through `recipes`. Global `ingredients`/`pans` are readable by `anon` and `authenticated` and writable by no one through the API. `recipe_versions` is select/insert only, so history can't be edited. Insert/update policies also check that a linked `pan_id`/`ingredient_id` is one the user can see, because FK checks ignore RLS.
- **Duplicate global ingredients were allowed.** `unique (owner_id, name)` treats NULL owners as distinct. Now `unique nulls not distinct`.
- **No `unit_code` CHECK** although §3 promised one. It's now present, and the list must equal `UNIT_CODES` in `lib/culinary/units.ts` (a test enforces this).
- **Cross-recipe references were possible.** `section_id`, `step_id` and `current_version_id` could point at another recipe's rows. These are now composite FKs (`(section_id, recipe_id) → recipe_sections(id, recipe_id)`, etc.) with `on delete set null (col)`.
- **Deleting a user failed.** `import_jobs`/`ingredients`/`pans.owner_id` had no `on delete cascade`. `recipes.pan_id` and `recipe_ingredients.ingredient_id` are now `on delete set null`.
- **Negative values were accepted** (quantities, pan dimensions, yields, times, densities). Positivity checks were added, `parse_confidence` is limited to 0–1, and `quantity_max` now requires `quantity`.
- **Missing triggers:** profile-on-signup (`security definer`, empty `search_path`) and `updated_at`.
- **11 unindexed foreign keys.** All are now indexed.

**Snapshot format:** `{ schema: 1, draft: RecipeDraft }` (`lib/recipes/schema.ts`). `RecipeDraft` is also the editor's data and the save action's input, so restoring a version is one parse. Changing `RecipeDraft` means bumping `schema` and keeping a reader for old snapshots.

**Sections:** a recipe with one untitled section stores its lines with `section_id` null and no `recipe_sections` row.

**Why snapshots and not diffs for versions:** recipes are small (a few KB), and restore becomes a single read. It also doubles as an immutable "original import" (v1). The normalized tables stay the source of truth for queries. The snapshot is only for history and restore.

**RLS:** see the list above and `…001_rls_policies.sql`. Server code that uses Drizzle must go through `withUser` or RLS is silently bypassed.

### Future tables (schema already accommodates them)

*Sketch only: not yet migrated or validated. These need the same fixes (RLS, FK cascades, indexes) when they're added.*

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
  bakeHint?: { direction: 'shallower' | 'deeper' };  // UI writes the wording
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
   - `count_round`: eggs round to the nearest 1. If the remainder is ¼–¾, show it as beaten egg (≈1 tbsp per ¼ egg), e.g. "2 eggs + 1 tbsp beaten egg" (or grams using `each_g`).
5. Show the original under the scaled value whenever the displayed amount differs from what was entered, using a muted "(orig. 1 cup)" label. The **Reset** button sets `ScaleState` to `none` and units to the source system.

### Display rules (decided 2026-11-25)
These settle what the pipeline above left open. `lib/culinary/` tests encode every rule. Change a rule here first, then its tests.

1. **US fractions:** snap to the nearest of 0 ⅛ ¼ ⅓ ½ ⅔ ¾ 1 (no ⅜, so ⅓ wins between them). Display as glyphs: "1½", "⅓".
2. **US volume ladder:** tsp below 1 tbsp, tbsp below ¼ cup, then cup. Snap first, then pick the unit, so 2.95 tsp → 3 tsp → **1 tbsp**. No pints/quarts/fl oz in display.
3. **US mass:** oz below 1 lb, then lb.
4. **Metric:** g/ml below 1000 (steps: 0.5 below 10, 1 below 100, 5 below 1000), then kg/L at 10 g/10 ml steps shown as decimals with at most 2 places, trailing zeros trimmed ("1.25 kg").
5. **Two parts** ("⅓ cup + 2 tsp", "1 lb + 4 oz") only when the single snapped unit is off by more than 5%. The first part is the largest allowed fraction ≤ the value. The remainder goes through the ladder, limited to smaller units, and snaps to **whole or ½ units only** (so "¾ cup + 2½ tbsp", never "¾ cup + 2¾ tbsp"); a remainder that snaps to 0 is dropped. Never more than 2 parts. Metric and ranges never use two parts.
6. **Eggs** (the catalog egg, `isEgg`): a remainder of ¼–¾ becomes whole eggs plus beaten egg (≈1 tbsp per ¼ egg, shown in US fractions of tbsp/tsp, or grams via `each_g` in metric). Otherwise round to the nearest whole. **With 3 or more whole eggs, always round to the nearest whole egg** (no beaten remainder: nobody measures 2¾ tbsp of egg into a big batch). Never "0 eggs": below ¼ egg, show beaten egg only.
7. **Other `count_round` items** round to the nearest ½ ("2½ bananas").
8. **Tiny amounts:** a value that snaps to 0 shows as "pinch" (US) or "<0.5 g" / "<0.5 ml" (metric), never "0". Counts without a unit (linear) use US fractions and bottom out at ⅛ ("⅛ onion").
9. **Factor 1 in the source unit system** shows quantities exactly as entered (no re-laddering), so Reset is the true original. The source system is the majority system of the recipe's entered units.
10. **`to_taste` / `fixed`** skip scaling but are still unit-converted.
11. **Ranges** scale both ends and share one unit, picked from the larger end.
12. **Leavening warning** fires only when the factor is > 2 or < 0.5 (exactly 2× and 0.5× don't warn).
13. **Factor** must be finite and within 0.01–100. This is `lib/culinary`'s hard limit, so any URL in that range renders. The scale sheet's "Multiply by" input accepts only **0.1–20** (decided 2026-11-26, matching the canvas), the realistic range for home cooking.
14. **Pans:** muffin ↔ non-muffin is unsupported (no reliable cup volume), and so is `other` without `volume_ml`. The UI disables those options. The bake hint is structured (`{ direction: 'shallower' | 'deeper' }`), and the UI writes the wording, with no invented percentages.

## 6. Build order
1. Domain module plus tests (units, density seed, pan math, rounding). This has no UI dependency, so it can start before any design work.
2. ✅ **Done 2026-11-25, see §8.** **Design pass 1: UX wireframes (½–1 day, low-fi).** Cover the 4 screens that drive structure: recipe view with scale/unit controls and the "orig." display, structured ingredient editor, import review/fix, and recipe list. Do it here because these screens decide component boundaries and the editor's data flow. Pick a shadcn theme, type scale and colour tokens. Skip pixel polish.
3. ✅ **Done 2026-11-25 (M3).** Schema, auth, manual recipe CRUD with structured ingredient editor. Add the daily Supabase keep-alive cron (Vercel Cron hitting a route that runs `select 1`) as soon as the project is deployed. (Built: `/api/keep-alive` and `vercel.json`, daily at 09:00 UTC; it needs `CRON_SECRET` set in Vercel.)
4. ✅ **Done 2026-11-26 (M4).** Render with scaling, unit toggle and URL state. Built: `ScaleBar`, `UnitToggle` with Reset, `WarningList`, "orig." labels, and the `ScaleSheet` (Factor / Yield / Pan with `PanDiagram`s), plus "Copy link to this view". The view renders on the client from `?mode=…&units=…` and updates the URL with `history.replaceState`, so taps are instant and Back leaves the recipe; a shared link is server-rendered already scaled. Wording for warnings and pan options lives in `lib/recipes/scale-view.ts`.
5. Importer: JSON-LD, then the ingredient-line parser, then the review/fix screen (low-confidence lines highlighted), then the LLM fallback.
6. Photo upload (client resize, Storage, cover/per-step).
7. **Design pass 2: visual polish (2–3 days).** Do this once real recipes and photos exist, because you can't judge a design against lorem ipsum. Covers the landing/demo page, empty states, mobile layout (people cook from phones), loading skeletons, dark mode. Then seed a public demo account and launch the portfolio here, since this is the first shippable version.
8. Version history, then cook mode, then search/tags, then shopping list, then cook log. Each feature gets a quick wireframe before you build it, not a separate design phase.

## 7. Verified facts (checked 2026-11-25)

Recheck these before relying on them. Limits change.

**Hosting limits**

| Fact | Value | Source |
|---|---|---|
| Vercel Hobby function duration | 300 s default and maximum (Fluid compute) | [vercel.com/docs/functions/limitations](https://vercel.com/docs/functions/limitations) |
| Vercel Hobby Cron Jobs | 100 per project, **at most once per day**, fires anywhere within the hour (±59 min). Cron Jobs is marked "legacy", to be migrated to *Schedules* (beta, Hobby min interval 15 min). | [cron usage & pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), [schedules limits](https://vercel.com/docs/schedules/limits) |
| Supabase Free | 500 MB database, 1 GB file storage, 50,000 MAU, 5 GB egress, 2 active projects, **paused after 1 week of inactivity** | [supabase.com/pricing](https://supabase.com/pricing) |
| Supabase image transformations | Pro plan and above only | [image transformations docs](https://supabase.com/docs/guides/storage/serving/image-transformations) |
| Postgres version | Local stack (CLI 3.3.0) runs **Postgres 17** (`supabase/config.toml`). The docs don't state the hosted default for new projects, so check it on the dashboard when the project is created. The schema needs ≥15 (`NULLS NOT DISTINCT`, `SET NULL (col)`). | `supabase/config.toml` |
| Claude Haiku model ID | `claude-haiku-5-5` | [models overview](https://platform.claude.com/docs/en/about-claude/models/overview) |

**Pinned versions** (exact, no ranges; see `package.json`)

| Package | Version | Note |
|---|---|---|
| next / eslint-config-next | 16.4.6 | |
| react / react-dom | 19.3.1 | |
| typescript | 5.9.3 | The latest is 7.0.2 (the native Go port). Stayed on 5.x, the major create-next-app 16.4.6 targets. Revisit once Next documents TS 7 support. |
| eslint | 10.15.0 | 9.x is deprecated. Lint passes on 10. |
| tailwindcss / @tailwindcss/turbopack | 4.3.5 | |
| zod | 4.6.7 | |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 | |
| postgres (driver) | 4.1.1 | |
| vitest / @vitest/coverage-v8 | 5.1.1 | |
| fast-check | 4.11.0 | |
| supabase (CLI) | 3.3.0 | 3.4.0 was <24 h old and blocked by pnpm's `minimumReleaseAge`. Bump later. |
| @types/react | 19.3.0 | 19.3.1 was blocked the same way. |
| @supabase/ssr / @supabase/supabase-js | 0.12.7 / 2.119.2 | Added in M3. |
| shadcn (CLI + `shadcn/tailwind.css`) | 4.23.0 | radix base, nova preset. Pulled in radix-ui 1.8.1, cmdk 1.1.1, sonner 2.0.8, lucide-react 1.79.0, class-variance-authority 0.7.1, cn 0.5.2 (shadcn's own class merger), tw-animate-css 1.4.0. next-themes was removed (no dark mode yet). Controls were resized to the §8 rules. |
| @playwright/test | 1.65.1 | Chromium only, phone viewport. |
| @types/node | 24.19.2 | Unverified: match it to the Node version Vercel runs when deploying (local dev is Node 26). |

Not installed yet (added at their milestone): cheerio 1.2.0, @anthropic-ai/sdk 1.14.0. Re-check versions when installing.

## 8. Design (pass 1, decided 2026-11-25)

The source is the Design canvas in `docs/design/canvas/`, with a live private copy at https://claude.ai/artifact/GR9Agyh1n1Wb99F4EZ3NEz. Page "Style directions" has the five looks that were compared; page "Screens (style E)" has the four approved screens. Every recipe amount on the canvas is real `render()` output.

### Direction: E, "Japandi with notebook numbers"
Five directions were tried on the same brownie recipe: A Japandi + wabi-sabi, B mid-century riso, C test-kitchen notebook, D recipe-box cottage, and E. **E won.** It takes A's calm (warm off-white, one muted accent, thin rules, lots of space) and adds C's precision where it matters: monospaced amounts so fractions line up, a large ×factor readout, numbered steps, and pan diagrams with their areas in the scale sheet. Texture (paper grain) appears only on photo placeholders and empty states.

### Colour tokens → shadcn variables
Contrast is measured against `--background` (#F3EFE7) unless noted. All text pairs pass WCAG AA (4.5:1).

| Role | Hex | shadcn variable | Contrast |
|---|---|---|---|
| Page background | #F3EFE7 | `--background` | |
| Surface: cards, sheets, bars, inputs | #FBF9F4 | `--card`, `--popover` | |
| Text | #2A2622 | `--foreground`, `--card-foreground` | 13.1:1 (14.3 on surface) |
| Muted text | #6A6158 | `--muted-foreground` | 5.3:1 (5.8 on surface) |
| Accent (matcha): primary buttons, active chips, ×factor, step numbers | #56633F | `--primary`, `--ring` | 5.6:1 |
| Text on accent | #FBF9F4 | `--primary-foreground` | 6.1:1 |
| Warning (clay): bake/leavening notes, unmatched lines, delete | #8F4329 | `--destructive` | 6.1:1 (6.0 on its tint) |
| Warning tint: row behind a flagged line | #F6ECE6 | (custom `--warning-muted`) | |
| Matched-chip tint | #E8EBE0 | `--accent` | text 12.4:1 |
| Placeholder fill (grain base) | #E7E0D3 | `--muted` | |
| Divider rules | #DDD5C8 / #E5DED2 | `--border` | decorative only |
| **Control outline**: inputs, outline buttons, chips | **#928778** | `--input` | 3.07:1 |

**Fix found while recording this:** the canvas draws control outlines in #CFC6B8, which is only 1.47:1. WCAG 1.4.11 asks for 3:1 on the boundary of an input or button. The app uses #928778 for `--input`; the canvas wasn't redrawn for it.

Dark mode isn't designed yet (pass 2).

### Type
All three fonts are on Google Fonts under the SIL Open Font License, loaded with `next/font/google` (self-hosted at build time, no runtime request to Google).

| Use | Font | Weights | Sizes (px) |
|---|---|---|---|
| Recipe title | Shippori Mincho | 600 | 30 |
| Section headings, sheet titles | Shippori Mincho | 500 | 20–22 |
| Card titles in the list | Shippori Mincho | 500 | 18 |
| Body, labels, buttons | DM Sans | 400 / 500 | 15 (labels 13, meta 12–13) |
| Amounts, ×factor, step numbers, "orig.", chip quantities | DM Mono | 500 / 400 | 14.5 amounts, 22 factor, 12 "orig." |
| Eyebrow labels ("SCALE") | DM Sans | 400, uppercase, +0.12em | 12 |

### Shape and spacing
- Phone first. Designed at 390 × 844, with 24 px side padding.
- Pills (radius = height ÷ 2) for buttons, chips and segmented controls. 10–12 px radius for inputs and option cards. 22 px top corners on bottom sheets. Photo placeholders use slightly uneven radii (6/22/8/18) as the one wabi-sabi touch.
- Touch targets are at least 44 px tall.
- Lists are separated by 1 px rules, not boxed cards.

### The four screens and their components
| Screen | Components | State |
|---|---|---|
| **Recipe list** | `SearchField`, `NewRecipeMenu` (import link / paste text / write), `RecipeCard`, `EmptyState` (the same three ways in) | Search text in the URL (`?q=`) |
| **Recipe view** | `ScaleBar` (½× 1× 2× 3× chips, "More", ×factor readout), `UnitToggle`, `WarningList`, `IngredientLine` (amount, name, prep, "orig." label, leavening note), `ScaleSheet` (Factor / Yield / Pan tabs; `PanPicker` with `PanDiagram`), `RecipeMenu` | Scale and units in the URL (`lib/culinary/url.ts`); sheet and menu open in component state |
| **Ingredient editor** | `RecipeMetaForm`, `SectionList` (drag to reorder), `ParsedLineEditor` (type a line, see chips live), `ChipPicker` (unit / ingredient), `AddIngredientForm` (§3.7), `SaveBar` | Draft in component state. Save writes the normalized rows plus a new version snapshot. |
| **Import review** | `SourceCard` (title, site, attribution; the photo stays linked), `ReviewLine` (`raw_text` above the chips; confidence < 0.8 highlighted with a one-tap fix), `PasteFallback`, `ImportBar` | `import_jobs` row on the server; edits in component state until Import |

Decisions shown in the screens:
- When the chosen pan is active, the "More" chip shows its name ("9×13").
- **Reset to original** sits next to the unit toggle and only changes the view. **Version history** lives in the ⋯ menu, because it changes data (§2).
- Bake-time and leavening warnings sit between the scale bar and the ingredients, in clay with an icon, never as a modal.
- Import never blocks on flagged lines: "You can import now and fix them later."

### Not decided yet (design pass 2, §6 step 7)
Dark mode, tablet and desktop layouts, the landing/demo page, loading skeletons, cook mode, and photo treatment once real photos exist. Also: adding your own pans (M4 offers the presets plus any user pans already in the table, but no form to add one), and whether numbers inside step text ("bake 25 min", "a 9-inch pan") should follow the scale.
