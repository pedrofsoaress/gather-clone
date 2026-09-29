create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  skin text not null default '009',
  visited_realms text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.realms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 32),
  map_data jsonb not null default '{"rooms":[{"name":"Home","tilemap":{}}],"spawnpoint":{"roomIndex":0,"x":0,"y":0}}'::jsonb,
  share_id uuid not null default gen_random_uuid() unique,
  only_owner boolean not null default false,
  created_at timestamptz not null default now()
);

create index realms_owner_id_idx on public.realms (owner_id);
alter table public.realms replica identity full;

alter table public.profiles enable row level security;
alter table public.realms enable row level security;

revoke all on public.profiles, public.realms from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.realms to authenticated;

create policy "profile_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);
create policy "profile_insert_own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "profile_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "realm_select_own" on public.realms
  for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "realm_insert_own" on public.realms
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "realm_update_own" on public.realms
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "realm_delete_own" on public.realms
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

alter publication supabase_realtime add table public.realms;
