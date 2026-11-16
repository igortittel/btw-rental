-- BTW Rental – password set-up links and rate limiting (Phase 2)
--
-- Supabase's own email OTP/recovery tokens live at most 24 h; the brief asks for a
-- one-time "set password" link valid for 72 h. We therefore issue our own single-use
-- tokens. Only a SHA-256 hash is stored; the raw token exists only in the emailed link.
set search_path = public, extensions;

create type public.auth_token_purpose as enum ('set_password', 'reset_password');

create table public.auth_tokens (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  purpose    public.auth_token_purpose not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_by uuid references public.profiles (id) on delete set null, -- staff who issued it, if any
  created_at timestamptz not null default now()
);
create index auth_tokens_profile_idx on public.auth_tokens (profile_id, created_at desc);
create index auth_tokens_created_by_idx on public.auth_tokens (created_by);

-- Fixed-window counters for login / password-reset throttling.
create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 1,
  primary key (key, window_start)
);

-- Both tables are reachable by the service role only: RLS on, no policies, no grants.
alter table public.auth_tokens enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.auth_tokens, public.rate_limits from anon, authenticated;

-- Atomically marks a token as used and returns its owner; NULL when the token is
-- unknown, expired or already used.
create or replace function public.consume_auth_token(p_token_hash text)
returns table (profile_id uuid, purpose public.auth_token_purpose)
language sql security definer set search_path = '' as $$
  update public.auth_tokens t
     set used_at = now()
   where t.token_hash = p_token_hash and t.used_at is null and t.expires_at > now()
  returning t.profile_id, t.purpose;
$$;

-- Counts a hit and returns TRUE while the caller is within `p_max` hits per window.
create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning count into v_count;
  -- Opportunistic clean-up of old windows.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_count <= p_max;
end;
$$;

revoke execute on function public.consume_auth_token(text) from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_auth_token(text) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
