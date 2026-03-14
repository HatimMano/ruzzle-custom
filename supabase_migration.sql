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

-- ─── Player Stats ─────────────────────────────────────────────────────────────
create table if not exists player_stats (
  user_id               uuid primary key references profiles(id) on delete cascade,
  -- Général
  games_played          int not null default 0,
  total_score           int not null default 0,
  total_words_found     int not null default 0,
  total_letters_found   int not null default 0,  -- ÷ total_words_found = longueur moyenne
  words_by_length       jsonb not null default '{}',  -- {"3":12,"4":8,...}
  longest_word          text,
  best_word_score       int not null default 0,
  -- Défi du jour
  daily_played          int not null default 0,
  daily_completed       int not null default 0,
  daily_streak          int not null default 0,
  best_daily_streak     int not null default 0,
  last_daily_date       date,
  best_daily_score      int not null default 0,
  fastest_complete_secs int,
  total_pyramid_levels  int not null default 0,
  -- Partie libre
  free_games_played     int not null default 0,
  best_free_score       int not null default 0,
  -- 1v1 (futur)
  challenges_played     int not null default 0,
  challenges_won        int not null default 0,
  updated_at            timestamptz default now()
);

alter table player_stats enable row level security;
create policy "stats_select" on player_stats for select using (true);
create policy "stats_insert" on player_stats for insert with check (auth.uid() = user_id);
create policy "stats_update" on player_stats for update using (auth.uid() = user_id);

-- Helper : fusionner deux jsonb en additionnant les valeurs entières
create or replace function jsonb_sum_counts(a jsonb, b jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(key, val), '{}')
  from (
    select key, sum(value::int) as val
    from (
      select key, value from jsonb_each_text(a)
      union all
      select key, value from jsonb_each_text(b)
    ) t
    group by key
  ) agg;
$$;

-- Trigger : mise à jour des stats après un défi du jour
create or replace function update_stats_on_daily()
returns trigger language plpgsql security definer as $$
declare
  wlen_counts   jsonb := '{}';
  w             text;
  new_longest   text;
  new_streak    int;
  new_best_str  int;
  w_score       int;
  max_w_score   int := 0;
begin
  insert into player_stats (user_id) values (new.user_id) on conflict do nothing;

  -- Comptage par longueur + meilleur score de mot
  foreach w in array new.found_words loop
    wlen_counts := jsonb_set(
      wlen_counts,
      array[length(w)::text],
      to_jsonb(coalesce((wlen_counts->>length(w)::text)::int, 0) + 1)
    );
    -- score approximatif : longueur du mot (scoreForWord côté front, on garde le max longueur ici)
    if length(w) > max_w_score then max_w_score := length(w); end if;
  end loop;

  select w into new_longest
  from unnest(new.found_words) w
  order by length(w) desc, w limit 1;

  -- Calcul de la série de jours consécutifs
  select
    case
      when last_daily_date = new.date::date - 1 then daily_streak + 1
      when last_daily_date = new.date::date     then daily_streak
      else 1
    end,
    greatest(
      best_daily_streak,
      case
        when last_daily_date = new.date::date - 1 then daily_streak + 1
        else 1
      end
    )
  into new_streak, new_best_str
  from player_stats where user_id = new.user_id;

  update player_stats set
    games_played          = games_played + 1,
    daily_played          = daily_played + 1,
    daily_completed       = daily_completed + case when new.completed then 1 else 0 end,
    daily_streak          = new_streak,
    best_daily_streak     = new_best_str,
    last_daily_date       = new.date::date,
    best_daily_score      = greatest(best_daily_score, new.score),
    fastest_complete_secs = case
      when new.completed
        then least(coalesce(fastest_complete_secs, new.elapsed_secs), new.elapsed_secs)
      else fastest_complete_secs
    end,
    total_score           = total_score + new.score,
    total_words_found     = total_words_found + coalesce(array_length(new.found_words, 1), 0),
    total_letters_found   = total_letters_found + coalesce(
      (select sum(length(w)) from unnest(new.found_words) w), 0
    ),
    longest_word          = case
      when longest_word is null or length(new_longest) > length(longest_word)
        then new_longest
      else longest_word
    end,
    total_pyramid_levels  = total_pyramid_levels + new.levels_found,
    words_by_length       = jsonb_sum_counts(words_by_length, wlen_counts),
    updated_at            = now()
  where user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_stats_daily on daily_results;
create trigger trg_stats_daily
  after insert on daily_results
  for each row execute function update_stats_on_daily();

-- Trigger : mise à jour des stats après une partie libre
create or replace function update_stats_on_game()
returns trigger language plpgsql security definer as $$
declare
  wlen_counts jsonb := '{}';
  w           text;
  new_longest text;
begin
  insert into player_stats (user_id) values (new.user_id) on conflict do nothing;

  foreach w in array new.found_words loop
    wlen_counts := jsonb_set(
      wlen_counts,
      array[length(w)::text],
      to_jsonb(coalesce((wlen_counts->>length(w)::text)::int, 0) + 1)
    );
  end loop;

  select w into new_longest
  from unnest(new.found_words) w
  order by length(w) desc, w limit 1;

  update player_stats set
    games_played        = games_played + 1,
    free_games_played   = free_games_played + 1,
    best_free_score     = greatest(best_free_score, new.score),
    total_score         = total_score + new.score,
    total_words_found   = total_words_found + coalesce(array_length(new.found_words, 1), 0),
    total_letters_found = total_letters_found + coalesce(
      (select sum(length(w)) from unnest(new.found_words) w), 0
    ),
    longest_word        = case
      when longest_word is null or length(new_longest) > length(longest_word)
        then new_longest
      else longest_word
    end,
    words_by_length     = jsonb_sum_counts(words_by_length, wlen_counts),
    updated_at          = now()
  where user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_stats_game on game_results;
create trigger trg_stats_game
  after insert on game_results
  for each row execute function update_stats_on_game();

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
