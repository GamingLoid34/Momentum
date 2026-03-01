-- Hotfix: solve "stack depth limit exceeded" caused by RLS recursion.
-- Run this in Supabase SQL Editor on existing projects.

create or replace function public.user_in_team(check_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = check_team_id
      and tm.user_id = auth.uid()
  );
$$;

create or replace function public.user_is_team_admin(check_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = check_team_id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
  );
$$;

revoke all on function public.user_in_team(uuid) from public;
grant execute on function public.user_in_team(uuid) to authenticated;

revoke all on function public.user_is_team_admin(uuid) from public;
grant execute on function public.user_is_team_admin(uuid) to authenticated;
