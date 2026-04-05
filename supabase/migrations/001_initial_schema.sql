-- RepoRecall: Initial schema for persistent storage, auth, and billing
-- Run this in Supabase SQL editor or via supabase db push

-- ============================================================
-- 1. Profiles (extends Supabase Auth users)
-- ============================================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  avatar_url text,
  github_username text,
  github_access_token text,
  stripe_customer_id text,
  subscription_status text not null default 'free'
    check (subscription_status in ('free', 'pro', 'cancelled')),
  subscription_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url, github_username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'user_name'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2. Briefs (replaces in-memory store)
-- ============================================================
create table public.briefs (
  id text primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  repo_full_name text not null,
  repo_info jsonb not null,
  overview jsonb not null,
  architecture jsonb not null,
  features jsonb not null,
  business_context jsonb not null,
  timeline jsonb not null,
  entrypoints jsonb not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index briefs_user_id_idx on public.briefs(user_id);
create index briefs_repo_full_name_idx on public.briefs(repo_full_name);

alter table public.briefs enable row level security;

create policy "Users can view their own briefs"
  on public.briefs for select using (auth.uid() = user_id);

create policy "Users can insert their own briefs"
  on public.briefs for insert with check (auth.uid() = user_id);

create policy "Users can update their own briefs"
  on public.briefs for update using (auth.uid() = user_id);

create policy "Users can delete their own briefs"
  on public.briefs for delete using (auth.uid() = user_id);

-- ============================================================
-- 3. Chat messages
-- ============================================================
create table public.chat_messages (
  id text primary key,
  brief_id text references public.briefs(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  timestamp timestamptz not null,
  created_at timestamptz not null default now()
);

create index chat_messages_brief_id_idx on public.chat_messages(brief_id);
create index chat_messages_user_id_idx on public.chat_messages(user_id);

alter table public.chat_messages enable row level security;

create policy "Users can view their own chat messages"
  on public.chat_messages for select using (auth.uid() = user_id);

create policy "Users can insert their own chat messages"
  on public.chat_messages for insert with check (auth.uid() = user_id);

create policy "Users can delete their own chat messages"
  on public.chat_messages for delete using (auth.uid() = user_id);

-- ============================================================
-- 4. Usage tracking (for billing and rate limiting)
-- ============================================================
create table public.usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  action text not null,
  repo_full_name text,
  tokens_used integer not null default 0,
  created_at timestamptz not null default now()
);

create index usage_user_id_idx on public.usage(user_id);
create index usage_user_action_created_idx on public.usage(user_id, action, created_at);

alter table public.usage enable row level security;

create policy "Users can view their own usage"
  on public.usage for select using (auth.uid() = user_id);

create policy "Users can insert their own usage"
  on public.usage for insert with check (auth.uid() = user_id);

-- ============================================================
-- 5. Updated_at trigger
-- ============================================================
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger briefs_updated_at
  before update on public.briefs
  for each row execute procedure public.update_updated_at();

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at();
