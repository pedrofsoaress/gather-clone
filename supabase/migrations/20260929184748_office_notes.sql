create table public.office_notes (
  id uuid primary key default gen_random_uuid(),
  realm_id uuid not null references public.realms(id) on delete cascade,
  object_id text not null check (length(object_id) between 1 and 64),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (length(author_name) between 1 and 64),
  body text not null check (length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index office_notes_lookup_idx on public.office_notes(realm_id, object_id, created_at desc);
alter table public.office_notes enable row level security;
revoke all on table public.office_notes from anon, authenticated;
grant select, insert on table public.office_notes to service_role;
