-- Public briefs: pre-indexed open source repos browsable without auth
create table public.public_briefs (
  id text primary key,
  repo_full_name text unique not null,
  repo_info jsonb not null,
  overview jsonb not null,
  architecture jsonb not null,
  features jsonb not null,
  business_context jsonb not null,
  timeline jsonb not null,
  entrypoints jsonb not null,
  codemap jsonb,
  timeline_data jsonb,
  diagrams jsonb,
  overview_explanation jsonb,
  stars integer not null default 0,
  language text,
  topics text[] default '{}',
  is_featured boolean default false,
  indexed_at timestamptz not null,
  last_refreshed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index public_briefs_stars_idx on public.public_briefs(stars desc);
create index public_briefs_featured_idx on public.public_briefs(is_featured) where is_featured = true;
create index public_briefs_repo_name_idx on public.public_briefs(repo_full_name);

alter table public.public_briefs enable row level security;

create policy "Anyone can read public briefs"
  on public.public_briefs for select using (true);

-- Only service_role can write (no insert/update/delete policies for anon)

create trigger public_briefs_updated_at
  before update on public.public_briefs
  for each row execute procedure public.update_updated_at();
