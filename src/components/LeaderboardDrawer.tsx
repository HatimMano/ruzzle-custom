import { useEffect, useMemo, useState } from "react";
import { fetchAggregateLeaderboard, fetchMyAggregateStats, fetchMyStats } from "../lib/api";
import type { LeaderboardEntry, AggregateLeaderboardEntry, MyAggregateStats, PlayerStats } from "../lib/api";
import { modeForDate, isMarathonMode, isPyramidMode } from "../lib/dailyModes";
import { getTrie } from "../lib/dictionary";
import { scoreForLen } from "../lib/scoring";
import ProgressStrip from "./leaderboard/ProgressStrip";

type Tab = 'jour' | 'classement' | 'mots';
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
  const [classementSeen, setClassementSeen] = useState<boolean>(
    () => localStorage.getItem('griddle:seen_classement_v1') === '1'
  );
  const [aggregate, setAggregate] = useState<AggregateLeaderboardEntry[]>([]);
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const [aggregateCache, setAggregateCache] = useState<Record<Period, AggregateLeaderboardEntry[] | null>>({
    cumul: null,
    mois: null,
  });
  const [myStats, setMyStats] = useState<MyAggregateStats | null>(null);
  const [myStatsCache, setMyStatsCache] = useState<Record<Period, MyAggregateStats | null>>({
    cumul: null,
    mois: null,
  });
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);

  const loadAggregate = (p: Period) => {
    if (aggregateCache[p]) setAggregate(aggregateCache[p]!);
    else {
      setAggregateLoading(true);
      const yearMonth = p === 'mois' ? currentYearMonth() : null;
      fetchAggregateLeaderboard(yearMonth, 10)
        .then((rows) => {
          setAggregate(rows);
          setAggregateCache((prev) => ({ ...prev, [p]: rows }));
        })
        .finally(() => setAggregateLoading(false));
    }
    if (myStatsCache[p]) setMyStats(myStatsCache[p]);
    else {
      const yearMonth = p === 'mois' ? currentYearMonth() : null;
      fetchMyAggregateStats(yearMonth).then((stats) => {
        setMyStats(stats);
        setMyStatsCache((prev) => ({ ...prev, [p]: stats }));
      });
    }
  };

  useEffect(() => {
    if (tab === 'classement') {
      loadAggregate(period);
      if (!playerStats) fetchMyStats().then(setPlayerStats);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, period]);

  const mode = modeForDate(date);

  // Mots possibles du défi du jour — génération déterministe à partir de date + mode.
  // useMemo car la génération coûte 50-200ms (DFS sur la grille avec le trie complet).
  const allWords = useMemo(() => {
    if (tab !== 'mots') return []
    const trie = getTrie()
    if (!trie) return []
    try {
      if (isPyramidMode(mode)) {
        const { validWords } = mode.generate(date, trie)
        return [...validWords].sort((a, b) => b.length - a.length || a.localeCompare(b))
      }
      if (isMarathonMode(mode)) {
        const { validWordsPerGrid } = mode.generate(date, trie)
        const merged = new Set<string>()
        for (const s of validWordsPerGrid) for (const w of s) merged.add(w)
        return [...merged].sort((a, b) => b.length - a.length || a.localeCompare(b))
      }
    } catch (e) {
      console.error('Mots tab:', e)
    }
    return []
  }, [tab, date, mode])

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
          {([['jour', '🏆 Jour'], ['classement', '⭐ Classement'], ['mots', '🔤 Mots']] as const).map(([id, label]) => {
            const showBadge = id === 'classement' && !classementSeen;
            return (
              <button
                key={id}
                onClick={() => {
                  setTab(id);
                  if (id === 'classement' && !classementSeen) {
                    localStorage.setItem('griddle:seen_classement_v1', '1');
                    setClassementSeen(true);
                  }
                }}
                style={{ position: 'relative', flex: 1, padding: "0.5rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", border: "none", background: tab === id ? "white" : "transparent", color: tab === id ? "#0f172a" : "#64748b", transition: "all 0.15s" }}
              >
                {label}
                {showBadge && (
                  <span style={{
                    position: 'absolute', top: 2, right: 8,
                    background: '#ef4444',
                    color: 'white',
                    fontSize: '0.5rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.35rem',
                    borderRadius: '999px',
                    letterSpacing: '0.04em',
                    boxShadow: '0 0 8px rgba(239,68,68,0.6)',
                  }}>NEW</span>
                )}
              </button>
            );
          })}
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

            {/* Section "Vous" — toujours visible en haut du Classement */}
            <div style={{
              borderRadius: "0.875rem",
              background: "rgba(217,119,6,0.08)",
              border: "1px solid rgba(217,119,6,0.25)",
              padding: "0.6rem 0.85rem",
              display: "flex", flexDirection: "column", gap: "0.25rem",
              marginBottom: "0.5rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#fbbf24", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  👤 Vous
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "white", fontVariantNumeric: "tabular-nums" }}>
                  {myStats && myStats.rank
                    ? <>#{myStats.rank} <span style={{ color: "#64748b", fontWeight: 500 }}>/ {myStats.total_ranked}</span></>
                    : myStats && myStats.total_played > 0
                      ? <span style={{ color: "#64748b" }}>Pas encore classé</span>
                      : <span style={{ color: "#475569" }}>Aucun défi joué</span>}
                </span>
              </div>
              {myStats && myStats.total_played > 0 && (
                <div style={{
                  display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.5rem",
                  fontSize: "0.7rem", color: "#94a3b8", fontVariantNumeric: "tabular-nums",
                }}>
                  <span>
                    <span style={{ color: "white", fontWeight: 700, fontSize: "0.85rem" }}>{myStats.points}</span>
                    <span style={{ color: "#64748b" }}> pts</span>
                  </span>
                  <span>
                    {myStats.top1}<span style={{ color: "#475569" }}>/</span>{myStats.top2}<span style={{ color: "#475569" }}>/</span>{myStats.top3}
                  </span>
                  <span>{myStats.total_played} défis</span>
                  {playerStats?.best_daily_streak ? (
                    <span>🔥 {playerStats.best_daily_streak}j</span>
                  ) : null}
                  {playerStats?.fastest_complete_secs ? (
                    <span>⚡ {fmtTime(playerStats.fastest_complete_secs)}</span>
                  ) : null}
                </div>
              )}
            </div>

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

          {/* ─── Onglet MOTS — liste des mots possibles du jour ───────── */}
          {tab === 'mots' && (<>
            {allWords.length === 0 && (
              <p className="text-slate-600 text-sm text-center py-6">Chargement…</p>
            )}
            {allWords.length > 0 && (
              <>
                <p style={{ fontSize: "0.65rem", color: "#64748b", textAlign: "center", padding: "0.3rem 0 0.5rem", fontStyle: "italic" }}>
                  {allWords.length} mots trouvables sur la grille du jour
                </p>
                {allWords.map((w, i) => {
                  const s = scoreForLen(w.length);
                  return (
                    <div
                      key={w}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "0.55rem 0.8rem",
                        borderTop: i > 0 ? "1px solid rgba(30,41,59,0.6)" : "none",
                      }}
                    >
                      <span style={{
                        fontWeight: 600, textTransform: "uppercase",
                        letterSpacing: "0.04em", fontSize: "0.9rem", color: "white",
                      }}>
                        {w}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                        <span style={{
                          fontSize: "0.65rem", color: "#475569",
                          fontWeight: 700, fontVariantNumeric: "tabular-nums",
                        }}>
                          {w.length}L
                        </span>
                        <span style={{
                          fontSize: "0.7rem", fontWeight: 700,
                          padding: "0.15rem 0.45rem", borderRadius: "999px",
                          background: s >= 12 ? "rgba(239,68,68,0.2)" : s >= 7 ? "rgba(234,88,12,0.2)" : s >= 4 ? "rgba(109,40,217,0.2)" : "rgba(71,85,105,0.2)",
                          color: s >= 12 ? "#f87171" : s >= 7 ? "#fb923c" : s >= 4 ? "#a78bfa" : "#64748b",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          +{s}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}
