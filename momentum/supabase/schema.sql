-- Momentum + Koll unified schema
-- Run this entire file in Supabase SQL Editor.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'member');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('todo', 'in_progress', 'done');
  end if;
end
$$;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  theme text not null default 'ocean' check (theme in ('ocean', 'berry', 'clean')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'member',
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (team_id, user_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0 and char_length(name) <= 50),
  color text not null default '#7C3AED',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (team_id, name)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 200),
  description text not null default '',
  category_id uuid references public.categories(id) on delete set null,
  start_date date,
  deadline date,
  status public.task_status not null default 'todo',
  source text not null default 'app',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz
);

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_main boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (task_id, user_id)
);

create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 200),
  is_completed boolean not null default false,
  estimated_minutes integer not null default 10 check (estimated_minutes between 5 and 15),
  ai_motivation text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz
);

create index if not exists idx_team_members_user on public.team_members(user_id);
create index if not exists idx_tasks_team_created on public.tasks(team_id, created_at desc);
create index if not exists idx_subtasks_task_created on public.subtasks(task_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

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

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.team_members enable row level security;
alter table public.categories enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.subtasks enable row level security;

drop policy if exists "Profiles can read own row" on public.profiles;
create policy "Profiles can read own row"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "Profiles can update own row" on public.profiles;
create policy "Profiles can update own row"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Profiles can insert own row" on public.profiles;
create policy "Profiles can insert own row"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "Members can read their teams" on public.teams;
create policy "Members can read their teams"
on public.teams
for select
using (public.user_in_team(id));

drop policy if exists "Members can read team memberships" on public.team_members;
create policy "Members can read team memberships"
on public.team_members
for select
using (public.user_in_team(team_id));

drop policy if exists "Admins can manage team memberships" on public.team_members;
create policy "Admins can manage team memberships"
on public.team_members
for all
using (public.user_is_team_admin(team_id))
with check (public.user_is_team_admin(team_id));

drop policy if exists "Team members can read categories" on public.categories;
create policy "Team members can read categories"
on public.categories
for select
using (public.user_in_team(team_id));

drop policy if exists "Team members can create categories" on public.categories;
create policy "Team members can create categories"
on public.categories
for insert
with check (public.user_in_team(team_id));

drop policy if exists "Team members can update categories" on public.categories;
create policy "Team members can update categories"
on public.categories
for update
using (public.user_in_team(team_id))
with check (public.user_in_team(team_id));

drop policy if exists "Team members can delete categories" on public.categories;
create policy "Team members can delete categories"
on public.categories
for delete
using (public.user_in_team(team_id));

drop policy if exists "Team members can read tasks" on public.tasks;
create policy "Team members can read tasks"
on public.tasks
for select
using (public.user_in_team(team_id));

drop policy if exists "Team members can create tasks" on public.tasks;
create policy "Team members can create tasks"
on public.tasks
for insert
with check (public.user_in_team(team_id) and created_by = auth.uid());

drop policy if exists "Team members can update tasks" on public.tasks;
create policy "Team members can update tasks"
on public.tasks
for update
using (public.user_in_team(team_id))
with check (public.user_in_team(team_id));

drop policy if exists "Team members can delete tasks" on public.tasks;
create policy "Team members can delete tasks"
on public.tasks
for delete
using (public.user_in_team(team_id));

drop policy if exists "Team members can read task assignees" on public.task_assignees;
create policy "Team members can read task assignees"
on public.task_assignees
for select
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and public.user_in_team(t.team_id)
  )
);

drop policy if exists "Team members can manage task assignees" on public.task_assignees;
create policy "Team members can manage task assignees"
on public.task_assignees
for all
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and public.user_in_team(t.team_id)
  )
)
with check (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and public.user_in_team(t.team_id)
  )
);

drop policy if exists "Team members can read subtasks" on public.subtasks;
create policy "Team members can read subtasks"
on public.subtasks
for select
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and public.user_in_team(t.team_id)
  )
);

drop policy if exists "Team members can manage subtasks" on public.subtasks;
create policy "Team members can manage subtasks"
on public.subtasks
for all
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and public.user_in_team(t.team_id)
  )
)
with check (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and public.user_in_team(t.team_id)
  )
);

create or replace function public.ensure_user_bootstrap(input_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  existing_team_id uuid;
  created_team_id uuid;
  fallback_name text;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select email into current_email
  from auth.users
  where id = current_user_id;

  insert into public.profiles (id, email, display_name)
  values (
    current_user_id,
    coalesce(current_email, 'unknown@example.com'),
    nullif(trim(input_display_name), '')
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = coalesce(public.profiles.display_name, excluded.display_name),
      updated_at = timezone('utc'::text, now());

  select tm.team_id
  into existing_team_id
  from public.team_members tm
  where tm.user_id = current_user_id
  limit 1;

  if existing_team_id is null then
    fallback_name := coalesce(nullif(split_part(coalesce(current_email, ''), '@', 1), ''), 'Team');
    insert into public.teams(name)
    values (fallback_name || '''s Team')
    returning id into created_team_id;

    insert into public.team_members(team_id, user_id, role)
    values (created_team_id, current_user_id, 'admin');

    insert into public.categories(team_id, name, color, created_by)
    values
      (created_team_id, 'STRATEGY', '#7C3AED', current_user_id),
      (created_team_id, 'HR', '#0EA5E9', current_user_id),
      (created_team_id, 'ADMIN', '#EF4444', current_user_id),
      (created_team_id, 'PROCESS', '#14B8A6', current_user_id),
      (created_team_id, 'GENERAL', '#6B7280', current_user_id)
    on conflict (team_id, name) do nothing;

    existing_team_id := created_team_id;
  end if;

  return existing_team_id;
end
$$;

revoke all on function public.ensure_user_bootstrap(text) from public;
grant execute on function public.ensure_user_bootstrap(text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.subtasks;
exception
  when duplicate_object then null;
end
$$;
