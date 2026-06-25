-- Fonction RPC pour le classement cumul / mensuel.
-- Filtre optionnel sur year_month ('YYYY-MM'). null = all-time.
-- Tri : points DESC, puis top1 DESC, puis top2 DESC, puis nb défis DESC.
-- Tiebreaker rank() inclut created_at (microseconde) → quasi pas d'ex-aequo en pratique.

create or replace function top_aggregated_players(
  year_month text default null,
  lim int default 10
)
returns table (
  user_id uuid,
  display_name text,
  points int,
  top1 int,
  top2 int,
  top3 int,
  total_played int
)
language sql
security definer
stable
as $$
  with ranked as (
    select
      dr.user_id,
      dr.date,
      dr.mode,
      rank() over (
        partition by dr.date, dr.mode
        order by dr.score desc, dr.elapsed_secs asc, dr.created_at asc
      ) as rk
    from daily_results dr
    where (year_month is null or dr.date like year_month || '-%')
  )
  select
    r.user_id,
    p.display_name,
    sum(case when r.rk = 1 then 3 when r.rk = 2 then 2 when r.rk = 3 then 1 else 0 end)::int as points,
    sum(case when r.rk = 1 then 1 else 0 end)::int as top1,
    sum(case when r.rk = 2 then 1 else 0 end)::int as top2,
    sum(case when r.rk = 3 then 1 else 0 end)::int as top3,
    count(*)::int as total_played
  from ranked r
  left join profiles p on p.id = r.user_id
  group by r.user_id, p.display_name
  having sum(case when r.rk = 1 then 3 when r.rk = 2 then 2 when r.rk = 3 then 1 else 0 end) > 0
  order by points desc, top1 desc, top2 desc, total_played desc
  limit lim
$$;

-- Test rapide :
-- select * from top_aggregated_players(null, 10);          -- all-time top 10
-- select * from top_aggregated_players('2026-06', 10);     -- juin 2026 top 10


-- ─── Stats personnelles ─────────────────────────────────────────────────────
-- Renvoie le rang + stats d'un user dans le classement (cumul ou mensuel).
-- Si le user n'a aucun podium, rank est null mais points/top1/2/3/total_played
-- sont quand même renvoyés (avec valeurs 0 / leur valeur réelle).
-- total_ranked = nombre total de joueurs avec au moins 1 podium (pour afficher "#23 / 47").

create or replace function my_aggregate_stats(
  my_id uuid,
  year_month text default null
)
returns table (
  rank int,
  points int,
  top1 int,
  top2 int,
  top3 int,
  total_played int,
  total_ranked int
)
language sql
security definer
stable
as $$
  with ranked as (
    select
      dr.user_id, dr.date, dr.mode,
      rank() over (
        partition by dr.date, dr.mode
        order by dr.score desc, dr.elapsed_secs asc, dr.created_at asc
      ) as rk
    from daily_results dr
    where (year_month is null or dr.date like year_month || '-%')
  ),
  aggr as (
    select
      r.user_id,
      sum(case when r.rk = 1 then 3 when r.rk = 2 then 2 when r.rk = 3 then 1 else 0 end)::int as points,
      sum(case when r.rk = 1 then 1 else 0 end)::int as top1,
      sum(case when r.rk = 2 then 1 else 0 end)::int as top2,
      sum(case when r.rk = 3 then 1 else 0 end)::int as top3,
      count(*)::int as total_played
    from ranked r
    group by r.user_id
  ),
  ranked_pts as (
    select
      a.*,
      case when a.points > 0
        then rank() over (
          order by a.points desc, a.top1 desc, a.top2 desc, a.total_played desc
        )::int
        else null
      end as rk_global
    from aggr a
  )
  select
    rp.rk_global as rank,
    rp.points,
    rp.top1,
    rp.top2,
    rp.top3,
    rp.total_played,
    (select count(*) from aggr where points > 0)::int as total_ranked
  from ranked_pts rp
  where rp.user_id = my_id
$$;

-- Test :
-- select * from my_aggregate_stats('UUID-USER-ICI', null);
-- select * from my_aggregate_stats('UUID-USER-ICI', '2026-06');
