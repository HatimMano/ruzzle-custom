import { useState } from "react";
import { fetchStreakLeaderboard } from "../lib/api";
import type { LeaderboardEntry, StreakEntry } from "../lib/api";
import { modeForDate, isMarathonMode, type DailyMode } from "../lib/dailyModes";

type Tab = 'classement' | 'streaks';

interface Props {
  date: string;
  leaderboard: LeaderboardEntry[];
  leaderboardLoading: boolean;
  initialStreaks: StreakEntry[];
  onClose: () => void;
}

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
}

const COLOR_GOLD = "rgba(251,191,36,0.85)"
const COLOR_GREEN = "rgba(16,185,129,0.75)"
const COLOR_EMPTY = "rgba(71,85,105,0.3)"

// Strip de progression : pyramide = dots par créneau ; marathon = dot par grille.
function ProgressStrip({
  mode,
  pyramidFound,
}: {
  mode: DailyMode;
  pyramidFound: Record<string, unknown> | null;
}) {
  if (isMarathonMode(mode)) {
    // Marathon : 3 cases, doré si grille complète, vert si partielle, vide sinon
    const nested = (pyramidFound ?? {}) as Record<string, Record<number, string>>
    return (
      <div style={{ display: "flex", gap: "3px" }}>
        {Array.from({ length: mode.gridCount }, (_, i) => {
          const gridPyramid = nested[String(i)] ?? {}
          const filled = mode.pyramidLengths.filter((l) => !!gridPyramid[l]).length
          const total = mode.pyramidLengths.length
          const bg = filled === total ? COLOR_GOLD : filled > 0 ? COLOR_GREEN : COLOR_EMPTY
          return <div key={i} style={{ width: "13px", height: "13px", borderRadius: "3px", background: bg }} />
        })}
      </div>
    )
  }
  // Pyramide : 1 dot par créneau, doré si c'est le cap, vert sinon
  const lens = mode.pyramidLengths
  const maxLen = lens[lens.length - 1]
  const flat = (pyramidFound ?? {}) as Record<string, string>
  return (
    <div style={{ display: "flex", gap: "3px" }}>
      {lens.map((l) => {
        const filled = !!flat[String(l)] || !!flat[l as unknown as string]
        const bg = filled ? (l === maxLen ? COLOR_GOLD : COLOR_GREEN) : COLOR_EMPTY
        return <div key={l} style={{ width: "13px", height: "13px", borderRadius: "3px", background: bg }} />
      })}
    </div>
  )
}

export default function LeaderboardDrawer({
  date,
  leaderboard,
  leaderboardLoading,
  initialStreaks,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('classement');
  const [streaks, setStreaks] = useState<StreakEntry[]>(initialStreaks);
  const [streaksLoading, setStreaksLoading] = useState(false);

  const handleTabChange = (id: Tab) => {
    setTab(id);
    if (id === 'streaks' && streaks.length === 0) {
      setStreaksLoading(true);
      fetchStreakLeaderboard()
        .then(setStreaks)
        .finally(() => setStreaksLoading(false));
    }
  };

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

        {/* Tabs */}
        <div style={{ display: "flex", background: "rgba(30,41,59,0.9)", borderRadius: "999px", padding: "0.25rem", gap: "0.25rem" }}>
          {([['classement', '🏆 Jour'], ['streaks', '🔥 Séries']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              style={{ flex: 1, padding: "0.5rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", border: "none", background: tab === id ? "white" : "transparent", color: tab === id ? "#0f172a" : "#64748b", transition: "all 0.15s" }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex flex-col gap-2">
          {tab === 'classement' && (<>
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

          {tab === 'streaks' && (<>
            {streaksLoading && <p className="text-slate-600 text-sm text-center py-6">Chargement…</p>}
            {!streaksLoading && streaks.length === 0 && <p className="text-slate-600 text-sm text-center py-6">Aucune série pour l'instant</p>}
            {!streaksLoading && streaks.slice(0, 3).map((entry, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "0.7rem 1rem", borderRadius: "0.875rem", background: "rgba(30,41,59,0.6)", border: "1px solid rgba(71,85,105,0.15)", gap: "0.75rem" }}>
                <span style={{ fontSize: "1rem", flexShrink: 0 }}>{['🥇','🥈','🥉'][i]}</span>
                <span style={{ flex: 1, fontWeight: 500, color: "#e2e8f0", fontSize: "0.9rem", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.display_name ?? 'Anonyme'}
                </span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.15rem", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.3rem" }}>
                    <span style={{ fontWeight: 700, color: "white", fontSize: "0.9rem", fontVariantNumeric: "tabular-nums" }}>{entry.best_daily_streak}</span>
                    <span style={{ fontSize: "0.65rem", color: "#475569" }}>jours</span>
                  </div>
                  <span style={{ fontSize: "0.65rem", color: "#334155" }}>{entry.daily_played} défis</span>
                </div>
              </div>
            ))}
          </>)}

        </div>
      </div>
    </div>
  );
}
