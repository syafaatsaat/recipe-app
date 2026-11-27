# Deploying

The app runs on **Vercel** with a **hosted Supabase** project, which holds Postgres, Auth and the `photos` bucket. Production builds from `main`, and every other pushed branch gets a preview deployment. Both use the same Supabase project.

These steps were checked on the first deploy (2026-11-26). The **Pitfalls** section at the end lists what went wrong then.

## 1. Supabase project

1. Create a project at supabase.com and note its **project ref** (the `<ref>` in `https://<ref>.supabase.co`).
2. Link the repo: `npx supabase login`, then `npx supabase link --project-ref <ref>`.
3. Apply the migrations and seed. **`--remote` is required**, because without it the Supabase CLI (v3) targets the local stack:
   ```sh
   npx supabase db push --remote --include-seed --dry-run   # check the list
   npx supabase db push --remote --include-seed
   npx supabase migration list --remote                     # Local and Remote columns match
   ```
   The seed loads the global ingredients and pan presets. Later pushes don't need `--include-seed`.
4. **Authentication → URL Configuration:**
   - **Site URL:** the production domain, e.g. `https://recipe-app.vercel.app`. This is the app's own address, not the Vercel dashboard. Email links fall back to it.
   - **Redirect URLs:**
     - `https://<production-domain>/**`
     - `https://recipe-app-*-<team-slug>.vercel.app/**` for previews. A `*` doesn't match `.` or `/`, so check the pattern against a real preview address.

   Without the preview pattern, a confirmation link sent from a preview opens production instead.
5. Email confirmation is on by default. Supabase's built-in mailer sends only to the project team's addresses and is rate-limited. Set up custom SMTP before real users sign up.

## 2. Vercel project

Import the GitHub repo, then set these under **Settings → Environment Variables** for **both Production and Preview**. Vercel stores a separate value per environment, so fixing one doesn't fix the other.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API → publishable key (not the secret key) |
| `DATABASE_URL` | the **transaction pooler** string; see below |
| `CRON_SECRET` | a long random string; Vercel Cron sends it to `/api/keep-alive` |
| `ANTHROPIC_API_KEY` | optional, turns on the AI import fallback (doc §3.11); set a spend limit in the Anthropic Console |

Never set `IMPORT_ALLOW_HOSTS`. It lets the importer fetch local addresses, which only the e2e tests need.

**`DATABASE_URL`**: Supabase → **Connect** → Transaction pooler:

```
postgresql://postgres.<ref>:<password>@aws-<n>-<region>.pooler.supabase.com:6543/postgres
```

- Paste the whole string, including the `postgresql://` at the start.
- Use port **6543** (transaction mode). Port 5432 on the same host is session mode, which runs out of connections under serverless. `db.<ref>.supabase.co` is IPv6-only and fails on Vercel. [db/client.ts](../db/client.ts) already sets `prepare: false`, which transaction mode needs.
- Percent-encode any character in the password other than letters, digits and `- . _ ~` (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `%` → `%25`, …). The alternative is a password of letters and digits only.

An env var change applies only to new deployments: **Redeploy** the affected one (Deployments → ⋯ → Redeploy). Redeploying a preview doesn't update production.

The daily keep-alive cron in [vercel.json](../vercel.json) stops the free Supabase project pausing after a week without activity. It needs `CRON_SECRET`.

## 3. Check it

On the deployment's URL:
1. Sign up with a team address. The confirmation link should come back to the **same** deployment, signed in.
2. Create a recipe with a cover photo and a step photo, then save. Check the recipe page and the list thumbnail.
3. Import a recipe link. Its photo shows as the cover.

## Shipping a schema change

Migrations aren't applied by Vercel. For a branch that adds one:
1. Push it to the hosted database: `npx supabase db push --remote`.
2. Merge, since production code expects the new schema.

Migrations must stay compatible with the code already running in production, because previews and production share one database. Don't edit a migration that's already on the hosted project.

New tables get **no privileges** for `anon`/`authenticated` (hosted default, and locally since migration 007). Their migration must `grant` what the RLS policies need; see [migration 007](../supabase/migrations/20261126000007_table_grants.sql).

## Pitfalls hit on the first deploy

To find the real error behind a page error, search **Vercel → Logs** for the page's error code (the Next.js digest).

| What showed | Cause |
|---|---|
| `relation "recipes" does not exist` | `db push` ran without `--remote`, so it went to the local stack. Or `DATABASE_URL` pointed at another project: its username must be `postgres.<ref>`. |
| `permission denied for table …` (before migration 007) | Hosted projects don't grant table access to `authenticated`, which the app switches to per request ([db/withUser.ts](../db/withUser.ts)). |
| `getaddrinfo ENOTFOUND stgres.<ref>` | `DATABASE_URL` without the `postgresql://` at the start. The driver cut the first characters off as the protocol and took the username as the host. |
| Confirmation link opened production, which failed | Preview address missing from Redirect URLs, plus a broken Production `DATABASE_URL` while Preview's was fixed. |
| Saving signs out an account made before the migrations ran | That account has no `profiles` row, because the signup trigger didn't exist yet. Delete the user in Supabase Auth and sign up again. |
