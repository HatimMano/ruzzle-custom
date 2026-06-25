import { useEffect, useState } from "react";
import { fetchAggregateLeaderboard } from "../lib/api";
import type { LeaderboardEntry, AggregateLeaderboardEntry } from "../lib/api";
import { modeForDate } from "../lib/dailyModes";
import ProgressStrip from "./leaderboard/ProgressStrip";

type Tab = 'jour' | 'classement';
type Period = 'cumul' | 'mois';

interface Props {
  date: string;
  leaderboard: LeaderboardEntry[];
  leaderboardLoading: boolean;
  onClose: () => void;
}

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function LeaderboardDrawer({
  date,
  leaderboard,
  leaderboardLoading,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('jour');
  const [period, setPeriod] = useState<Period>('cumul');
  const [aggregate, setAggregate] = useState<AggregateLeaderboardEntry[]>([]);
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const [aggregateCache, setAggregateCache] = useState<Record<Period, AggregateLeaderboardEntry[] | null>>({
    cumul: null,
    mois: null,
  });

  const loadAggregate = (p: Period) => {
    if (aggregateCache[p]) {
      setAggregate(aggregateCache[p]!);
      return;
    }
    setAggregateLoading(true);
    const yearMonth = p === 'mois' ? currentYearMonth() : null;
    fetchAggregateLeaderboard(yearMonth, 10)
      .then((rows) => {
        setAggregate(rows);
        setAggregateCache((prev) => ({ ...prev, [p]: rows }));
      })
      .finally(() => setAggregateLoading(false));
  };

  useEffect(() => {
    if (tab === 'classement') loadAggregate(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, period]);

  const mode = modeForDate(date);

  return (
    <div
      className="absolute inset-0 bg-slate-900/80 z-10 flex items-end"
      onClick={onClose}
    >
      <div
        className="w-full bg-slate-900 border-t border-slate-700 rounded-t-3xl p-4 max-h-[80vh] flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-1" />

        {/* Onglets principaux */}
        <div style={{ display: "flex", background: "rgba(30,41,59,0.9)", borderRadius: "999px", padding: "0.25rem", gap: "0.25rem" }}>
          {([['jour', '🏆 Jour'], ['classement', '⭐ Classement']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{ flex: 1, padding: "0.5rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", border: "none", background: tab === id ? "white" : "transparent", color: tab === id ? "#0f172a" : "#64748b", transition: "all 0.15s" }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sous-toggle Cumul / Mois (uniquement onglet Classement) */}
        {tab === 'classement' && (
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {([['cumul', 'Tout'], ['mois', 'Ce mois']] as const).map(([p, label]) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  flex: 1, padding: "0.4rem 0", borderRadius: "0.6rem",
                  fontSize: "0.7rem", fontWeight: 600, cursor: "pointer",
                  border: "1px solid",
                  borderColor: period === p ? "rgba(251,191,36,0.4)" : "rgba(71,85,105,0.3)",
                  background: period === p ? "rgba(251,191,36,0.12)" : "transparent",
                  color: period === p ? "#fbbf24" : "#64748b",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-y-auto flex flex-col gap-2">
          {/* ─── Onglet JOUR ───────────────────────────────────────── */}
          {tab === 'jour' && (<>
            {leaderboardLoading && <p className="text-slate-600 text-sm text-center py-6">Chargement…</p>}
            {!leaderboardLoading && leaderboard.length === 0 && <p className="text-slate-600 text-sm text-center py-6">Aucun résultat pour aujourd'hui</p>}
            {!leaderboardLoading && leaderboard.map((entry) => {
              const displayScore = entry.score + Math.max(0, 4 - entry.rank);
              return (
                <div key={entry.rank} style={{ display: "flex", alignItems: "center", padding: "0.75rem 1rem", borderRadius: "0.875rem", background: entry.is_me ? "rgba(217,119,6,0.1)" : "rgba(30,41,59,0.8)", border: entry.is_me ? "1px solid rgba(217,119,6,0.3)" : "1px solid rgba(71,85,105,0.25)", gap: "0.5rem" }}>
                  <span style={{ width: "2rem", fontSize: "1.1rem", flexShrink: 0 }}>{RANK_MEDAL[entry.rank] ?? entry.rank}</span>
                  <span style={{ flex: 1, fontWeight: 500, color: entry.is_me ? "#fbbf24" : "white", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.display_name ?? `Joueur #${entry.rank}`}
                    {entry.is_me && <span style={{ marginLeft: "0.4rem", fontSize: "0.7rem", color: "rgba(251,191,36,0.5)" }}>· moi</span>}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
                      <p style={{ fontWeight: 600, color: entry.is_me ? "#fbbf24" : "white", fontSize: "0.9rem" }}>{displayScore} pts</p>
                      {entry.rank <= 3 && <span style={{ fontSize: "0.6rem", color: "#475569" }}>+{4 - entry.rank}</span>}
                    </div>
                    <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{fmtTime(entry.elapsed_secs)}</p>
                    <ProgressStrip mode={mode} pyramidFound={entry.pyramid_found} />
                  </div>
                </div>
              );
            })}
          </>)}

          {/* ─── Onglet CLASSEMENT (cumul ou mois) ───────────────── */}
          {tab === 'classement' && (<>
            {aggregateLoading && <p className="text-slate-600 text-sm text-center py-6">Chargement…</p>}
            {!aggregateLoading && aggregate.length === 0 && (
              <p className="text-slate-600 text-sm text-center py-6">
                {period === 'mois' ? 'Aucun classement pour ce mois' : 'Aucun classement encore'}
              </p>
            )}
            {!aggregateLoading && aggregate.map((entry) => (
              <div
                key={entry.user_id}
                style={{
                  display: "flex", alignItems: "center",
                  padding: "0.6rem 0.85rem", borderRadius: "0.75rem",
                  background: entry.is_me ? "rgba(217,119,6,0.1)" : "rgba(30,41,59,0.8)",
                  border: entry.is_me ? "1px solid rgba(217,119,6,0.3)" : "1px solid rgba(71,85,105,0.25)",
                  gap: "0.5rem", fontSize: "0.85rem",
                }}
              >
                <span style={{ width: "1.6rem", flexShrink: 0, color: "#64748b", fontWeight: 700, fontSize: "0.8rem" }}>
                  {RANK_MEDAL[entry.rank] ?? `${entry.rank}.`}
                </span>
                <span style={{
                  flex: 1, fontWeight: 500,
                  color: entry.is_me ? "#fbbf24" : "white",
                  minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {entry.display_name ?? `Joueur ${entry.user_id.slice(0, 4)}`}
                  {entry.is_me && <span style={{ marginLeft: "0.4rem", fontSize: "0.65rem", color: "rgba(251,191,36,0.5)" }}>· moi</span>}
                </span>
                <span style={{
                  fontWeight: 700, fontSize: "0.95rem",
                  color: entry.is_me ? "#fbbf24" : "white",
                  fontVariantNumeric: "tabular-nums",
                  flexShrink: 0,
                }}>
                  {entry.points}<span style={{ fontSize: "0.65rem", color: "#475569", marginLeft: "0.15rem", fontWeight: 600 }}>pts</span>
                </span>
                <span style={{
                  display: "flex", gap: "0.15rem", alignItems: "baseline",
                  fontSize: "0.65rem", color: "#64748b", fontVariantNumeric: "tabular-nums", flexShrink: 0,
                  minWidth: "3.5rem", justifyContent: "flex-end",
                }}>
                  <span title="🥇">{entry.top1}</span>
                  <span>/</span>
                  <span title="🥈">{entry.top2}</span>
                  <span>/</span>
                  <span title="🥉">{entry.top3}</span>
                </span>
                <span style={{ fontSize: "0.65rem", color: "#475569", fontVariantNumeric: "tabular-nums", minWidth: "1.5rem", textAlign: "right", flexShrink: 0 }}>
                  {entry.total_played}j
                </span>
              </div>
            ))}

            {/* Légende discrète sous la liste */}
            {!aggregateLoading && aggregate.length > 0 && (
              <p style={{ fontSize: "0.65rem", color: "#475569", textAlign: "center", padding: "0.5rem 0", fontStyle: "italic" }}>
                Points = 3×🥇 + 2×🥈 + 1×🥉 · format {' '}
                <span style={{ color: "#94a3b8" }}>🥇/🥈/🥉</span> + nombre de défis joués
              </p>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}
