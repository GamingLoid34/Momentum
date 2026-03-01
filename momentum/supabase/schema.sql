-- Momentum: Supabase schema and policies
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.micro_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 200),
  estimated_minutes integer not null default 10 check (estimated_minutes between 5 and 15),
  status text not null default 'todo' check (status in ('todo', 'done')),
  ai_motivation text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz
);

create index if not exists micro_tasks_user_created_idx
  on public.micro_tasks (user_id, created_at desc);

alter table public.micro_tasks enable row level security;

create policy "Users can read own micro tasks"
  on public.micro_tasks
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own micro tasks"
  on public.micro_tasks
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own micro tasks"
  on public.micro_tasks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own micro tasks"
  on public.micro_tasks
  for delete
  using (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table public.micro_tasks;
exception
  when duplicate_object then null;
end
$$;
