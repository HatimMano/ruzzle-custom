import { useEffect, useState } from "react";
import { Home } from "lucide-react";
import { scoreForLen, scoreForWord } from "../lib/scoring";
import {
  pyramidRows,
  levelLabel,
  type TriddleMode,
} from "../lib/dailyModes";
import { findWordPath } from "../lib/gridGenerator";
import type { Grid as GridType } from "../lib/gridGenerator";
import Grid from "./Grid";
import { fetchDailyLeaderboard } from "../lib/api";
import type { LeaderboardEntry } from "../lib/api";
import type { TriddleResult } from "./TriddleGameScreen";

type Tab = "pyramides" | "classement" | "mots";

interface Props {
  mode: TriddleMode;
  date: string;
  result: TriddleResult;
  grids: GridType[];
  validWordsPerGrid: Set<string>[];
  onBack: () => void;
}

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
}

const SCORE_STYLE: Record<number, { color: string; bg: string }> = {
  1: { color: "#64748b", bg: "rgba(71,85,105,0.2)" },
  2: { color: "#64748b", bg: "rgba(71,85,105,0.2)" },
  4: { color: "#a78bfa", bg: "rgba(109,40,217,0.2)" },
  7: { color: "#fb923c", bg: "rgba(234,88,12,0.2)" },
  12: { color: "#f87171", bg: "rgba(239,68,68,0.2)" },
};

export default function TriddleResultsScreen({
  mode,
  date,
  result,
  grids,
  validWordsPerGrid,
  onBack,
}: Props) {
  const [tab, setTab] = useState<Tab>("pyramides");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [activeGridTab, setActiveGridTab] = useState<number>(0);
  const [discoveryWord, setDiscoveryWord] = useState<string | null>(null);

  const activeGrid = grids[activeGridTab];
  const discoveryPath = discoveryWord && activeGrid ? findWordPath(activeGrid, discoveryWord) : null;

  const { totalScore, totalElapsedSecs, foundWordsPerGrid, pyramidFoundPerGrid } = result;
  const maxPerGrid = mode.pyramidLengths.reduce((s, l) => s + scoreForLen(l), 0);
  const maxTotal = maxPerGrid * mode.gridCount;

  useEffect(() => {
    if (tab !== "classement") return;
    if (leaderboard.length > 0) return;
    setLeaderboardLoading(true);
    fetchDailyLeaderboard(date, mode.id)
      .then(setLeaderboard)
      .finally(() => setLeaderboardLoading(false));
  }, [tab, date, mode.id, leaderboard.length]);

  return (
    <div
      style={{
        height: "100dvh",
        background: "#0b1120",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          maxWidth: "28rem",
          width: "100%",
          margin: "0 auto",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          overflow: "hidden",
          padding: "0.75rem 1rem 0",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <p style={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.14em", color: mode.palette.accentSoft, textTransform: "uppercase" }}>
            🏃 Triddle · {date}
          </p>
          <p style={{ fontSize: "1.9rem", fontWeight: 700, color: "white", lineHeight: 1.1 }}>
            {totalScore}
            <span style={{ fontSize: "1rem", color: "#475569", fontWeight: 600 }}> / {maxTotal} pts</span>
          </p>
          <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
            Temps total · {fmtTime(totalElapsedSecs)}
          </p>
        </div>

        {/* Tab Bar */}
        <div
          style={{
            display: "flex",
            background: "rgba(30,41,59,0.9)",
            borderRadius: "1rem",
            padding: "0.375rem",
            gap: "0.375rem",
          }}
        >
          {([
            ["pyramides", "Pyramides"],
            ["classement", "Classement"],
            ["mots", "Mots"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                flex: 1,
                padding: "0.625rem 0",
                borderRadius: "0.75rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                border: tab === id ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                background: tab === id ? "rgba(255,255,255,0.08)" : "transparent",
                color: tab === id ? "white" : "#475569",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
          {/* Pyramides tab */}
          {tab === "pyramides" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingTop: "0.5rem", paddingBottom: "0.5rem" }}>
              {pyramidFoundPerGrid.map((pyramid, gi) => {
                const gridScore = mode.pyramidLengths.reduce(
                  (s, l) => s + (pyramid[l] ? scoreForLen(l) : 0),
                  0
                );
                const filled = mode.pyramidLengths.filter((l) => !!pyramid[l]).length;
                const total = mode.pyramidLengths.length;
                const isPerfect = gridScore === maxPerGrid;
                return (
                  <div
                    key={gi}
                    style={{
                      borderRadius: "1rem",
                      background: "rgba(30,41,59,0.7)",
                      border: isPerfect ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(71,85,105,0.3)",
                      padding: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "white" }}>
                        Grille {gi + 1}
                      </span>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                        <span style={{ fontSize: "1.1rem", fontWeight: 800, color: isPerfect ? "#34d399" : "white", fontVariantNumeric: "tabular-nums" }}>
                          {gridScore}
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "#64748b" }}>/ {maxPerGrid} pts</span>
                        <span style={{ fontSize: "0.7rem", color: "#475569", marginLeft: "0.4rem" }}>
                          {filled}/{total} niv.
                        </span>
                      </div>
                    </div>

                    {/* Mini-pyramide */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem" }}>
                      {pyramidRows(mode).map((row, ri) => (
                        <div key={ri} style={{ display: "flex", gap: "0.3rem" }}>
                          {row.map((len) => {
                            const word = pyramid[len];
                            return (
                              <div
                                key={len}
                                style={{
                                  width: "4.5rem",
                                  height: "2.6rem",
                                  borderRadius: "0.5rem",
                                  background: word ? "rgba(16,185,129,0.12)" : "rgba(15,23,42,0.6)",
                                  border: word ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(71,85,105,0.3)",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "0.05rem",
                                }}
                              >
                                {word ? (
                                  <span
                                    style={{
                                      fontSize: "0.65rem",
                                      fontWeight: 700,
                                      letterSpacing: "0.04em",
                                      color: "#34d399",
                                      textTransform: "uppercase",
                                      fontFamily: "monospace",
                                    }}
                                  >
                                    {word}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#475569" }}>
                                    {levelLabel(mode, len)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Classement tab */}
          {tab === "classement" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingTop: "0.5rem", paddingBottom: "0.5rem" }}>
              {leaderboardLoading && (
                <p style={{ padding: "3rem 0", textAlign: "center", fontSize: "0.875rem", color: "#64748b" }}>
                  Chargement…
                </p>
              )}
              {!leaderboardLoading && leaderboard.length === 0 && (
                <p style={{ padding: "3rem 0", textAlign: "center", fontSize: "0.875rem", color: "#64748b" }}>
                  Aucun résultat pour aujourd'hui
                </p>
              )}
              {!leaderboardLoading &&
                leaderboard.map((entry) => {
                  const displayScore = entry.score + Math.max(0, 4 - entry.rank);
                  return (
                    <div
                      key={entry.rank}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "0.875rem 1rem",
                        borderRadius: "1rem",
                        background: entry.is_me ? "rgba(217,119,6,0.1)" : "rgba(30,41,59,0.8)",
                        border: entry.is_me ? "1px solid rgba(217,119,6,0.3)" : "1px solid rgba(71,85,105,0.25)",
                        gap: "0.5rem",
                      }}
                    >
                      <span style={{ width: "2rem", fontSize: "1.1rem", flexShrink: 0 }}>
                        {RANK_MEDAL[entry.rank] ?? entry.rank}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          fontWeight: 500,
                          color: entry.is_me ? "#fbbf24" : "white",
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry.display_name ?? `Joueur #${entry.rank}`}
                        {entry.is_me && (
                          <span style={{ marginLeft: "0.4rem", fontSize: "0.7rem", color: "rgba(251,191,36,0.5)" }}>
                            · moi
                          </span>
                        )}
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
                          <p style={{ fontWeight: 600, color: entry.is_me ? "#fbbf24" : "white", fontSize: "0.9rem" }}>
                            {displayScore} pts
                          </p>
                          {entry.rank <= 3 && <span style={{ fontSize: "0.6rem", color: "#475569" }}>+{4 - entry.rank}</span>}
                        </div>
                        <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{fmtTime(entry.elapsed_secs)}</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Mots tab — sous-onglets par grille */}
          {tab === "mots" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingTop: "0.5rem" }}>
              {/* Sub-tabs G1 / G2 / G3 */}
              <div style={{ display: "flex", gap: "0.3rem", padding: "0.25rem", background: "rgba(30,41,59,0.6)", borderRadius: "0.75rem" }}>
                {pyramidFoundPerGrid.map((_, gi) => (
                  <button
                    key={gi}
                    onClick={() => { setActiveGridTab(gi); setDiscoveryWord(null); }}
                    style={{
                      flex: 1,
                      padding: "0.4rem 0",
                      borderRadius: "0.5rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      border: "none",
                      background: activeGridTab === gi ? "rgba(255,255,255,0.08)" : "transparent",
                      color: activeGridTab === gi ? "white" : "#64748b",
                      cursor: "pointer",
                    }}
                  >
                    Grille {gi + 1}
                  </button>
                ))}
              </div>

              {/* Aperçu du chemin du mot sélectionné */}
              {discoveryWord && activeGrid && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "1rem",
                    borderRadius: "1rem",
                    background: "rgba(30,41,59,0.8)",
                    border: "1px solid rgba(71,85,105,0.25)",
                  }}
                >
                  <p style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.1em", color: "white" }}>
                    {discoveryWord.toUpperCase()}
                  </p>
                  {discoveryPath ? (
                    <Grid
                      grid={activeGrid}
                      onWordSubmit={() => null}
                      disabled
                      discoveryPath={discoveryPath}
                    />
                  ) : (
                    <p style={{ fontSize: "0.875rem", color: "#64748b" }}>Chemin non trouvé</p>
                  )}
                </div>
              )}

              {/* Liste des mots de la grille active */}
              {(() => {
                const valid = validWordsPerGrid[activeGridTab] ?? new Set<string>();
                const found = new Set(foundWordsPerGrid[activeGridTab] ?? []);
                const sorted = [...valid].sort((a, b) => b.length - a.length || a.localeCompare(b));
                if (sorted.length === 0) {
                  return (
                    <p style={{ padding: "2rem 0", textAlign: "center", fontSize: "0.85rem", color: "#475569" }}>
                      Aucun mot disponible
                    </p>
                  );
                }
                return (
                  <div style={{ paddingBottom: "0.5rem" }}>
                    {sorted.map((w, i) => {
                      const s = scoreForWord(w);
                      const ss = SCORE_STYLE[s] ?? SCORE_STYLE[1];
                      const isFound = found.has(w);
                      const active = discoveryWord === w;
                      return (
                        <button
                          key={w}
                          onClick={() => setDiscoveryWord((prev) => (prev === w ? null : w))}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            textAlign: "left",
                            padding: "0.7rem 0",
                            borderTop: i > 0 ? "1px solid rgba(30,41,59,0.8)" : "none",
                            background: "transparent",
                            border: "none",
                            borderTopStyle: i > 0 ? "solid" : undefined,
                            cursor: "pointer",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              fontSize: "0.95rem",
                              color: active ? "#93c5fd" : isFound ? "white" : "#475569",
                              transition: "color 0.15s",
                            }}
                          >
                            {w}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <span style={{ fontSize: "0.65rem", color: active ? "#93c5fd" : isFound ? "#cbd5e1" : "#334155", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                              {w.length}L
                            </span>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                padding: "0.2rem 0.55rem",
                                borderRadius: "999px",
                                fontVariantNumeric: "tabular-nums",
                                background: active ? "rgba(59,130,246,0.2)" : isFound ? ss.bg : "rgba(30,41,59,0.6)",
                                color: active ? "#93c5fd" : isFound ? ss.color : "#334155",
                              }}
                            >
                              +{s}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Action — fixed bottom */}
      <div style={{ display: "flex", gap: "0.75rem", padding: "0.5rem 1rem 1.25rem", flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.4rem",
            padding: "0.75rem",
            borderRadius: "0.875rem",
            background: "#3b82f6",
            border: "none",
            color: "white",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: "pointer",
          }}
        >
          <Home size={14} />
          Accueil
        </button>
      </div>
    </div>
  );
}
