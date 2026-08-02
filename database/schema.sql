create table if not exists public.watch_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  item_id text not null,
  title text not null default '',
  poster text not null default '',
  type text not null default 'movie',
  season integer not null default 0,
  episode integer not null default 0,
  duration integer not null default 0,
  watched integer not null default 0,
  status text not null default 'watching',
  updated_at timestamptz not null default now(),
  unique (user_id, item_id, season, episode)
);

create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  item_id text not null,
  title text not null default '',
  poster text not null default '',
  type text not null default 'movie',
  added_at timestamptz not null default now(),
  unique (user_id, item_id)
);

alter table public.watch_progress enable row level security;
alter table public.watchlist enable row level security;

create policy "watch_progress_select_own"
  on public.watch_progress for select
  using (auth.uid() = user_id);

create policy "watch_progress_insert_own"
  on public.watch_progress for insert
  with check (auth.uid() = user_id);

create policy "watch_progress_update_own"
  on public.watch_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "watch_progress_delete_own"
  on public.watch_progress for delete
  using (auth.uid() = user_id);

create policy "watchlist_select_own"
  on public.watchlist for select
  using (auth.uid() = user_id);

create policy "watchlist_insert_own"
  on public.watchlist for insert
  with check (auth.uid() = user_id);

create policy "watchlist_update_own"
  on public.watchlist for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "watchlist_delete_own"
  on public.watchlist for delete
  using (auth.uid() = user_id);
