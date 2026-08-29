-- Lock down profiles so authenticated clients cannot:
--   1. Read GitHub OAuth tokens or Stripe customer IDs (XSS / session leak)
--   2. Write billing fields (would let anyone SET subscription_status = 'pro')
-- Privileged columns are only readable/writable via the service role.

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
revoke all on table public.profiles from public;

grant select (
  id,
  email,
  display_name,
  avatar_url,
  github_username,
  subscription_status,
  subscription_period_end,
  subscription_period_start,
  created_at,
  updated_at
) on table public.profiles to authenticated;

grant update (
  display_name,
  avatar_url,
  github_username
) on table public.profiles to authenticated;

grant insert (
  id,
  email,
  display_name,
  avatar_url,
  github_username
) on table public.profiles to authenticated;

-- Defense in depth: even if column grants are widened later, strip privileged
-- writes that do not come from the service role.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  new.github_access_token := old.github_access_token;
  new.stripe_customer_id := old.stripe_customer_id;
  new.subscription_status := old.subscription_status;
  new.subscription_period_end := old.subscription_period_end;
  new.subscription_period_start := old.subscription_period_start;
  new.email := old.email;
  new.id := old.id;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_columns on public.profiles;

create trigger protect_profile_privileged_columns
  before update on public.profiles
  for each row execute procedure public.protect_profile_privileged_columns();
