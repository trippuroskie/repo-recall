-- Prevent duplicate repos per user.
-- First, remove any existing duplicates (keep the most recent brief per user+repo).
delete from public.briefs
where id not in (
  select distinct on (user_id, repo_full_name) id
  from public.briefs
  order by user_id, repo_full_name, generated_at desc
);

-- Now add the unique constraint.
alter table public.briefs
  add constraint briefs_user_repo_unique unique (user_id, repo_full_name);
