-- Add subscription_period_start to profiles for billing period alignment
-- Previously only subscription_period_end was stored, making it impossible
-- to accurately count usage within the actual Stripe billing cycle.

alter table public.profiles
  add column subscription_period_start timestamptz;
