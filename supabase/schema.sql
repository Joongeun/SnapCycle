-- RRR2 Supabase schema. Paste into the Supabase SQL editor and run.
-- Row Level Security is enabled on every table so the public anon key can only
-- ever read/write the signed-in user's own rows.

-- ============================================================ profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  username text,
  created_at timestamptz not null default now(),
  total_items int not null default 0,
  donate_count int not null default 0,
  sell_count int not null default 0,
  discard_count int not null default 0,
  default_location text,
  address text,
  zip text,
  onboarding_complete boolean not null default false,
  preferences jsonb not null default '{}'::jsonb
);

-- Backfill for existing deployments (no-op on a fresh DB).
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists zip text;
alter table public.profiles add column if not exists onboarding_complete boolean not null default false;
alter table public.profiles add column if not exists preferences jsonb not null default '{}'::jsonb;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- ============================================================ items
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  photo_url text,
  item_name text not null,
  category text not null,
  condition text not null,
  description text,
  decision text not null check (decision in ('DONATE', 'SELL', 'DISCARD')),
  answers jsonb,
  selected_service jsonb,
  created_at timestamptz not null default now()
);

alter table public.items enable row level security;

drop policy if exists "items_select_own" on public.items;
create policy "items_select_own" on public.items
  for select using (auth.uid() = user_id);

drop policy if exists "items_insert_own" on public.items;
create policy "items_insert_own" on public.items
  for insert with check (auth.uid() = user_id);

drop policy if exists "items_delete_own" on public.items;
create policy "items_delete_own" on public.items
  for delete using (auth.uid() = user_id);

create index if not exists items_user_created_idx
  on public.items (user_id, created_at desc);

-- ============================================================ stats triggers
-- Auto-create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Increment the per-user counters whenever an item is saved.
create or replace function public.bump_item_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.user_id)
  on conflict (id) do nothing;

  update public.profiles set
    total_items = total_items + 1,
    donate_count = donate_count + (case when new.decision = 'DONATE' then 1 else 0 end),
    sell_count = sell_count + (case when new.decision = 'SELL' then 1 else 0 end),
    discard_count = discard_count + (case when new.decision = 'DISCARD' then 1 else 0 end)
  where id = new.user_id;

  return new;
end;
$$;

drop trigger if exists items_bump_stats on public.items;
create trigger items_bump_stats
  after insert on public.items
  for each row execute function public.bump_item_stats();

-- ============================================================ leaderboard
-- Exposes ONLY aggregate counts + a non-PII display handle (no emails).
-- Owned by the definer so it can read across users, but selects no sensitive
-- columns.
create or replace view public.leaderboard
with (security_invoker = off) as
  select
    id,
    coalesce(username, 'User ' || left(id::text, 4)) as display_name,
    total_items,
    donate_count,
    sell_count,
    discard_count
  from public.profiles
  order by total_items desc
  limit 100;

grant select on public.leaderboard to authenticated;

-- ============================================================ storage
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

-- Users may upload only into a folder named after their own uid.
drop policy if exists "item_photos_insert_own" on storage.objects;
create policy "item_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Photos are publicly readable (so the app can render them by URL).
drop policy if exists "item_photos_read" on storage.objects;
create policy "item_photos_read" on storage.objects
  for select using (bucket_id = 'item-photos');
