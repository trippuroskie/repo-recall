-- Chat sessions: allow multiple conversations per repo/brief
-- Each session groups a set of chat_messages together

-- ============================================================
-- 1. Create chat_sessions table
-- ============================================================
create table public.chat_sessions (
  id text primary key,
  brief_id text references public.briefs(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_sessions_brief_id_idx on public.chat_sessions(brief_id);
create index chat_sessions_user_id_idx on public.chat_sessions(user_id);

alter table public.chat_sessions enable row level security;

create policy "Users can view their own chat sessions"
  on public.chat_sessions for select using (auth.uid() = user_id);

create policy "Users can insert their own chat sessions"
  on public.chat_sessions for insert with check (auth.uid() = user_id);

create policy "Users can update their own chat sessions"
  on public.chat_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own chat sessions"
  on public.chat_sessions for delete using (auth.uid() = user_id);

create trigger chat_sessions_updated_at
  before update on public.chat_sessions
  for each row execute procedure public.update_updated_at();

-- ============================================================
-- 2. Add session_id to chat_messages
-- ============================================================
alter table public.chat_messages
  add column session_id text references public.chat_sessions(id) on delete cascade;

create index chat_messages_session_id_idx on public.chat_messages(session_id);

-- ============================================================
-- 3. Migrate existing messages into sessions
--    Create one session per (brief_id, user_id) for existing messages
-- ============================================================
insert into public.chat_sessions (id, brief_id, user_id, title, created_at)
select
  brief_id || '_default',
  brief_id,
  user_id,
  'Chat',
  min(timestamp)
from public.chat_messages
group by brief_id, user_id;

update public.chat_messages
set session_id = brief_id || '_default'
where session_id is null;

-- ============================================================
-- 4. Make session_id non-nullable now that migration is done
-- ============================================================
alter table public.chat_messages
  alter column session_id set not null;
