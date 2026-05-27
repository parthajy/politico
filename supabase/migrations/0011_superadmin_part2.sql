-- Superadmin — part 2: helpers + RLS adjustments.
-- All comparisons cast to ::text so we don't depend on the enum value being
-- committed in the same transaction.

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_role()::text = 'superadmin';
$$;

-- Superadmin counts as 'firm' for all the firm-side data they need to see.
create or replace function public.is_firm()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_role()::text in ('firm_admin', 'firm_analyst', 'firm_intern', 'superadmin');
$$;

-- Users table: superadmin can read + write everyone. Existing self-read policy
-- still applies for the rest.
drop policy if exists users_superadmin_all on users;
create policy users_superadmin_all on users
  for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());
