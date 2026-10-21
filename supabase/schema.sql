-- Run once in the Supabase SQL editor. Only the backend secret key may access this table.
create table if not exists public.micheulcheop_state (
  id text primary key,
  payload jsonb not null,
  revision bigint not null default 0 check (revision >= 0)
);
alter table public.micheulcheop_state enable row level security;
revoke all on public.micheulcheop_state from public, anon, authenticated;
grant select, insert, update on public.micheulcheop_state to service_role;

-- Private media: no public download URLs and no browser write policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('micheulcheop-media', 'micheulcheop-media', false, 3000000,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
