-- EAGLEYE Autopilot — persistence schema (replaces localStorage).
-- Single-tenant: every authenticated EAGLEYE user shares the same clients.
-- Run this once on your Supabase project (SQL editor or `supabase db push`).

-- Ids are generated client-side (components/autopilot/store.js `uid()`) and
-- kept as-is end to end — hence `text`, not `uuid`.
create table if not exists public.businesses (
  id text primary key,
  created_by uuid references auth.users (id) on delete set null,
  name text not null default '',
  city text not null default '',
  activity text not null default '',
  website text not null default '',
  notes text not null default '',
  networks jsonb not null default '[]'::jsonb,
  kit jsonb,
  site jsonb,
  week_start timestamptz,
  channels jsonb not null default '{}'::jsonb,
  auto_approve boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id text primary key,
  business_id text not null references public.businesses (id) on delete cascade,
  network text not null,
  date timestamptz not null,
  pillar text,
  hook text,
  caption text,
  hashtags jsonb not null default '[]'::jsonb,
  visual_prompt text,
  format text,
  media jsonb,
  status text not null default 'draft',
  simulated boolean not null default false,
  postiz_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_business_id_idx on public.posts (business_id);

-- One row per engine; the API key itself is encrypted (AES-256-GCM) by the
-- app before it ever reaches Postgres — see lib/autopilot/credentials.js.
create table if not exists public.api_credentials (
  provider text primary key check (provider in ('anthropic', 'muapi', 'postiz')),
  encrypted_key text,
  postiz_url text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

drop trigger if exists api_credentials_set_updated_at on public.api_credentials;
create trigger api_credentials_set_updated_at
  before update on public.api_credentials
  for each row execute function public.set_updated_at();

-- RLS: EAGLEYE is a single agency team — any authenticated (invited) user
-- can see and edit every client. No public/anon access at all.
alter table public.businesses enable row level security;
alter table public.posts enable row level security;
alter table public.api_credentials enable row level security;

drop policy if exists "authenticated full access" on public.businesses;
create policy "authenticated full access" on public.businesses
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.posts;
create policy "authenticated full access" on public.posts
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.api_credentials;
create policy "authenticated full access" on public.api_credentials
  for all to authenticated using (true) with check (true);
