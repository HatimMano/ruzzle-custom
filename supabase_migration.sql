-- ─── Profiles ────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  created_at    timestamptz default now()
);

-- ─── Daily results ────────────────────────────────────────────────────────────
create table if not exists daily_results (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  date          text not null,
  elapsed_secs  int,
  completed     bool not null default false,
  levels_found  int not null default 0,
  found_words   text[] not null default '{}',
  pyramid_found jsonb not null default '{}',
  created_at    timestamptz default now(),
  unique (user_id, date)
);

-- ─── Normal game results ──────────────────────────────────────────────────────
create table if not exists game_results (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  display_name  text,
  seed          text not null,
  score         int not null,
  found_words   text[] not null default '{}',
  min_letters   int not null,
  duration_secs int not null,
  created_at    timestamptz default now()
);

-- Migration : ajouter display_name si la table existe déjà
alter table game_results add column if not exists display_name text;

-- ─── Challenges (future 1v1 async) ───────────────────────────────────────────
create table if not exists challenges (
  id          uuid primary key default gen_random_uuid(),
  seed        text not null,
  created_by  uuid references profiles(id),
  config      jsonb not null default '{}',
  created_at  timestamptz default now()
);

create table if not exists challenge_results (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  score        int not null,
  found_words  text[] not null default '{}',
  created_at   timestamptz default now(),
  unique (challenge_id, user_id)
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table daily_results enable row level security;
alter table game_results enable row level security;
alter table challenges enable row level security;
alter table challenge_results enable row level security;

-- profiles
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- daily_results
create policy "daily_results_select" on daily_results for select using (true);
create policy "daily_results_insert" on daily_results for insert with check (auth.uid() = user_id);

-- game_results
create policy "game_results_select" on game_results for select using (auth.uid() = user_id);
create policy "game_results_insert" on game_results for insert with check (auth.uid() = user_id);

-- challenges
create policy "challenges_select" on challenges for select using (true);
create policy "challenges_insert" on challenges for insert with check (auth.uid() = created_by);

-- challenge_results
create policy "challenge_results_select" on challenge_results for select using (true);
create policy "challenge_results_insert" on challenge_results for insert with check (auth.uid() = user_id);

-- ─── Trigger : créer le profil automatiquement à l'inscription ────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
