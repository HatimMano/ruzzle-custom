-- ═══════════════════════════════════════════════════════════════════════════
-- Classement Semaine | Mois (v2 — all-time supprimé)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- period ∈ ('week', 'month')
--
-- Semaine = lundi 00:00 → dimanche 23:59 (ISO, date_trunc('week') = lundi).
-- Points daily : 3/2/1 pour top1/2/3 par (date, mode).
-- Bonus hebdo (mois uniquement) : +5/+3/+1 pour top1/2/3 de chaque semaine
--   TERMINÉE appartenant au mois courant. La semaine en cours ne donne PAS
--   de bonus tant qu'elle n'est pas close (lundi suivant ≤ today).
-- Tiebreaker classement : points desc, top1 desc, top2 desc, total_played ASC
--   (jouer moins pour le même résultat = mieux classé)
-- Tiebreaker hebdo (au sein d'une semaine) : week_pts desc, wt1 desc, wt2 desc, week_played asc
-- Égalité parfaite acceptée → rank() Olympic (1, 1, 3, 4...) → bonus partagé.

-- Drop des anciennes signatures (retour différent → CREATE OR REPLACE refuse)
drop function if exists top_aggregated_players(text, integer);
drop function if exists my_aggregate_stats(uuid, text);

create or replace function top_aggregated_players(
  period text default 'month',
  lim int default 10
)
returns table (
  rank int,
  user_id uuid,
  display_name text,
  points int,
  top1 int,
  top2 int,
  top3 int,
  total_played int,
  weekly_bonus int
)
language sql
security definer
stable
as $$
  with bounds as (
    select
      case when period = 'week'
        then date_trunc('week', current_date)::date
        else date_trunc('month', current_date)::date
      end as start_d,
      case when period = 'week'
        then (date_trunc('week', current_date) + interval '7 days')::date - 1
        else (date_trunc('month', current_date) + interval '1 month')::date - 1
      end as end_d
  ),
  in_period as (
    select dr.user_id, dr.date, dr.mode, dr.score, dr.elapsed_secs, dr.created_at
    from daily_results dr, bounds b
    where dr.date::date between b.start_d and b.end_d
  ),
  ranked as (
    select user_id, date, mode,
      rank() over (
        partition by date, mode
        order by score desc, elapsed_secs asc, created_at asc
      ) as rk
    from in_period
  ),
  daily_pts as (
    select user_id,
      sum(case when rk=1 then 3 when rk=2 then 2 when rk=3 then 1 else 0 end)::int as daily_points,
      sum(case when rk=1 then 1 else 0 end)::int as t1,
      sum(case when rk=2 then 1 else 0 end)::int as t2,
      sum(case when rk=3 then 1 else 0 end)::int as t3,
      count(*)::int as played
    from ranked
    group by user_id
  ),
  -- ─── Bonus hebdo (mois uniquement, semaines terminées) ────────────────
  weekly_user_pts as (
    select
      r.user_id,
      date_trunc('week', r.date::date) as week_start,
      sum(case when r.rk=1 then 3 when r.rk=2 then 2 when r.rk=3 then 1 else 0 end)::int as week_pts,
      sum(case when r.rk=1 then 1 else 0 end)::int as wt1,
      sum(case when r.rk=2 then 1 else 0 end)::int as wt2,
      count(*)::int as week_played
    from ranked r
    where period = 'month'
      and date_trunc('week', r.date::date) + interval '7 days' <= current_date  -- semaine close
    group by r.user_id, date_trunc('week', r.date::date)
  ),
  weekly_ranked as (
    select user_id, week_start,
      rank() over (
        partition by week_start
        order by week_pts desc, wt1 desc, wt2 desc, week_played asc
      ) as wrk
    from weekly_user_pts
    where week_pts > 0
  ),
  weekly_bonus_calc as (
    select user_id,
      sum(case when wrk=1 then 5 when wrk=2 then 3 when wrk=3 then 1 else 0 end)::int as bonus
    from weekly_ranked
    group by user_id
  ),
  final as (
    select
      dp.user_id,
      p.display_name,
      (dp.daily_points + coalesce(wb.bonus, 0))::int as points,
      dp.t1 as top1,
      dp.t2 as top2,
      dp.t3 as top3,
      dp.played as total_played,
      coalesce(wb.bonus, 0)::int as weekly_bonus
    from daily_pts dp
    left join profiles p on p.id = dp.user_id
    left join weekly_bonus_calc wb on wb.user_id = dp.user_id
    where (dp.daily_points + coalesce(wb.bonus, 0)) > 0
  )
  select
    rank() over (order by points desc, top1 desc, top2 desc, total_played asc)::int as rank,
    user_id, display_name, points, top1, top2, top3, total_played, weekly_bonus
  from final
  order by rank, user_id
  limit lim
$$;


-- ─── Mes stats agrégées (section "Vous" + bandeau accueil) ────────────────
-- period ∈ ('week', 'month', 'all')
-- 'all' = pas de filtre de date, pas de bonus hebdo (sinon massif/incohérent)
create or replace function my_aggregate_stats(
  my_id uuid,
  period text default 'month'
)
returns table (
  rank int,
  points int,
  top1 int,
  top2 int,
  top3 int,
  total_played int,
  total_ranked int,
  weekly_bonus int
)
language sql
security definer
stable
as $$
  with bounds as (
    select
      case when period = 'week' then date_trunc('week', current_date)::date
           when period = 'month' then date_trunc('month', current_date)::date
           else '1970-01-01'::date
      end as start_d,
      case when period = 'week' then (date_trunc('week', current_date) + interval '7 days')::date - 1
           when period = 'month' then (date_trunc('month', current_date) + interval '1 month')::date - 1
           else '2999-12-31'::date
      end as end_d
  ),
  in_period as (
    select dr.user_id, dr.date, dr.mode, dr.score, dr.elapsed_secs, dr.created_at
    from daily_results dr, bounds b
    where dr.date::date between b.start_d and b.end_d
  ),
  ranked as (
    select user_id, date, mode,
      rank() over (
        partition by date, mode
        order by score desc, elapsed_secs asc, created_at asc
      ) as rk
    from in_period
  ),
  daily_pts as (
    select user_id,
      sum(case when rk=1 then 3 when rk=2 then 2 when rk=3 then 1 else 0 end)::int as daily_points,
      sum(case when rk=1 then 1 else 0 end)::int as t1,
      sum(case when rk=2 then 1 else 0 end)::int as t2,
      sum(case when rk=3 then 1 else 0 end)::int as t3,
      count(*)::int as played
    from ranked
    group by user_id
  ),
  weekly_user_pts as (
    select r.user_id,
      date_trunc('week', r.date::date) as week_start,
      sum(case when r.rk=1 then 3 when r.rk=2 then 2 when r.rk=3 then 1 else 0 end)::int as week_pts,
      sum(case when r.rk=1 then 1 else 0 end)::int as wt1,
      sum(case when r.rk=2 then 1 else 0 end)::int as wt2
    from ranked r
    where period = 'month'
      and date_trunc('week', r.date::date) + interval '7 days' <= current_date
    group by r.user_id, date_trunc('week', r.date::date)
  ),
  weekly_ranked as (
    select user_id, week_start,
      rank() over (
        partition by week_start
        order by week_pts desc, wt1 desc, wt2 desc
      ) as wrk
    from weekly_user_pts
    where week_pts > 0
  ),
  weekly_bonus_calc as (
    select user_id,
      sum(case when wrk=1 then 5 when wrk=2 then 3 when wrk=3 then 1 else 0 end)::int as bonus
    from weekly_ranked
    group by user_id
  ),
  aggr as (
    select dp.user_id,
      (dp.daily_points + coalesce(wb.bonus, 0))::int as points,
      dp.t1, dp.t2, dp.t3, dp.played,
      coalesce(wb.bonus, 0)::int as bonus
    from daily_pts dp
    left join weekly_bonus_calc wb on wb.user_id = dp.user_id
  ),
  ranked_pts as (
    select a.*,
      case when a.points > 0
        then rank() over (order by a.points desc, a.t1 desc, a.t2 desc, a.played asc)::int
        else null
      end as rk_global
    from aggr a
  )
  select
    rp.rk_global as rank,
    rp.points,
    rp.t1 as top1,
    rp.t2 as top2,
    rp.t3 as top3,
    rp.played as total_played,
    (select count(*) from aggr where points > 0)::int as total_ranked,
    rp.bonus as weekly_bonus
  from ranked_pts rp
  where rp.user_id = my_id
$$;

-- Tests :
-- select * from top_aggregated_players('week', 10);
-- select * from top_aggregated_players('month', 10);
-- select * from my_aggregate_stats('UUID-USER'::uuid, 'week');
-- select * from my_aggregate_stats('UUID-USER'::uuid, 'month');
