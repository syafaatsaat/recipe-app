-- Every Claude call the importer makes (doc §3.11): the per-user daily cap is counted
-- here, and the token counts show what imports cost. Owners can read their own rows but
-- not write them (import_jobs is owner-editable, so a cap counted there could be reset).
-- The server writes as postgres, which bypasses RLS.
create table llm_calls (
  id            bigint generated always as identity primary key,
  owner_id      uuid not null references auth.users on delete cascade,
  kind          text not null check (kind in ('recipe','lines')),
  ok            boolean not null,
  input_tokens  integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at    timestamptz not null default now()
);
create index on llm_calls (owner_id, created_at desc);

alter table llm_calls enable row level security;
create policy llm_calls_select on llm_calls for select to authenticated
  using (owner_id = (select auth.uid()));
revoke insert, update, delete, truncate on llm_calls from anon, authenticated;
