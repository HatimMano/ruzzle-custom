import { useState, useRef, useEffect } from "react";
import { Copy, Home } from "lucide-react";
import { scoreForLen } from "../lib/scoring";
import { scoreForWord } from "../lib/scoring";
import { findWordPath } from "../lib/gridGenerator";
import type { Cell, Grid as GridType } from "../lib/gridGenerator";
import Grid from "./Grid";
import { fetchDailyLeaderboard } from "../lib/api";
import type { LeaderboardEntry } from "../lib/api";
import {
  isPyramidComplete,
  pyramidLevelsFound,
  pyramidRows,
  levelLabel,
  type DailyModeRules,
} from "../lib/dailyModes";

interface Props {
  date: string;
  mode: DailyModeRules;
  elapsedSeconds: number;
  pyramidFound: Record<number, string>;
  foundWords: string[];
  validWords: Set<string>;
  grid: GridType;
  onBack: () => void;
}

type Tab = "pyramide" | "classement" | "tous";

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
}

function PyramidSlotCard({
  letters,
  word,
}: {
  letters: string;
  word?: string;
}) {
  return (
    <div
      style={{
        width: "5.5rem",
        height: "4.25rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "0.875rem",
        border: word
          ? "2px solid rgba(16,185,129,0.4)"
          : "2px solid rgba(71,85,105,0.5)",
        background: word ? "rgba(16,185,129,0.12)" : "rgba(30,41,59,0.9)",
      }}
    >
      {word ? (
        <span
          style={{
            fontSize: "0.78rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            color: "#34d399",
          }}
        >
          {word.toUpperCase()}
        </span>
      ) : (
        <span
          style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}
        >
          {letters}
        </span>
      )}
    </div>
  );
}

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

const SCORE_STYLE: Record<number, { color: string; bg: string }> = {
  1: { color: "#64748b", bg: "rgba(71,85,105,0.2)" },
  2: { color: "#64748b", bg: "rgba(71,85,105,0.2)" },
  4: { color: "#a78bfa", bg: "rgba(109,40,217,0.2)" },
  7: { color: "#fb923c", bg: "rgba(234,88,12,0.2)" },
  12: { color: "#f87171", bg: "rgba(239,68,68,0.2)" },
};

const lenColor = (len: number) =>
  len >= 7 ? "#c084fc" : len >= 5 ? "#60a5fa" : "#94a3b8";

export default function DailyResultsScreen({
  date,
  mode,
  elapsedSeconds,
  pyramidFound,
  foundWords,
  validWords,
  grid,
  onBack,
}: Props) {
  const [tab, setTab] = useState<Tab>("pyramide");
  const [discoveryWord, setDiscoveryWord] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const copiedTimer = useRef<number>(0);

  const completed = isPyramidComplete(mode, pyramidFound);
  const found = pyramidLevelsFound(mode, pyramidFound);
  const totalLevels = mode.pyramidLengths.length;

  const missed = [...validWords]
    .filter((w) => !foundWords.includes(w))
    .sort((a, b) => b.length - a.length || a.localeCompare(b));

  const discoveryPath: Cell[] | null = discoveryWord
    ? findWordPath(grid, discoveryWord)
    : null;

  // Score = score du créneau (pas du mot) — un mot long peut remplir un créneau court
  const score = mode.pyramidLengths.reduce((acc, l) => {
    if (!pyramidFound[l]) return acc;
    return acc + scoreForLen(l);
  }, 0);

  useEffect(() => {
    if (tab !== "classement") return;
    if (leaderboard.length > 0) return;
    setLeaderboardLoading(true);
    fetchDailyLeaderboard(date, mode.id)
      .then(setLeaderboard)
      .finally(() => setLeaderboardLoading(false));
  }, [tab, date, mode.id, leaderboard.length]);

  function copySummary() {
    const lines = [
      `⚡ Ruzzle — ${mode.name} ${date}`,
      completed
        ? `🏆 Pyramide complète en ${fmtTime(elapsedSeconds)} !`
        : `🔶 ${found}/${totalLevels} niveaux — ${fmtTime(elapsedSeconds)}`,
      "",
      ...mode.pyramidLengths.map((l) => {
        const w = pyramidFound[l];
        const lbl = levelLabel(mode, l);
        return `${w ? "✅" : "⬜"} ${lbl}${w ? " · " + w.toUpperCase() : ""}`;
      }),
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "pyramide", label: "Pyramide" },
    { id: "classement", label: "Classement" },
    { id: "tous", label: `Tous les mots` },
  ];

  const birthdayLabel =
    mode.id === "birthday-2026-04-30" ? "Happy 60"
    : mode.id === "birthday-hatim-2026-07-11" ? "Happy 30"
    : null;
  const [birthdayOpen, setBirthdayOpen] = useState(birthdayLabel !== null);

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
        <div
          style={{
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: "0.2rem",
          }}
        >
          <p
            style={{
              fontSize: "0.65rem",
              fontWeight: 500,
              letterSpacing: "0.12em",
              color: "#64748b",
            }}
          >
            DÉFI DU JOUR · {date}
          </p>
          <p
            style={{
              fontSize: "1.9rem",
              fontWeight: 700,
              color: "white",
              lineHeight: 1.1,
            }}
          >
            {score} pts
          </p>
          <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
            {fmtTime(elapsedSeconds)}
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: "0.15rem",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.2rem 0.75rem",
                borderRadius: "999px",
                background: completed
                  ? "rgba(16,185,129,0.12)"
                  : "rgba(30,41,59,0.8)",
                border: completed
                  ? "1px solid rgba(16,185,129,0.3)"
                  : "1px solid rgba(71,85,105,0.4)",
                fontSize: "0.75rem",
                fontWeight: 500,
                color: completed ? "#34d399" : "#64748b",
              }}
            >
              {completed ? "Pyramide complète 🏆" : `${found}/${totalLevels} niveaux`}
            </span>
          </div>
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
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setDiscoveryWord(null);
              }}
              style={{
                flex: 1,
                padding: "0.625rem 0",
                borderRadius: "0.75rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                border:
                  tab === t.id
                    ? "1px solid rgba(255,255,255,0.1)"
                    : "1px solid transparent",
                background:
                  tab === t.id ? "rgba(255,255,255,0.08)" : "transparent",
                color: tab === t.id ? "white" : "#475569",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content — scrollable */}
        <div
          style={
            {
              flex: 1,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            } as React.CSSProperties
          }
        >
          {/* Pyramide */}
          {tab === "pyramide" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.5rem",
                paddingTop: "0.75rem",
              }}
            >
              {pyramidRows(mode).map((row, ri) => (
                <div key={ri} style={{ display: "flex", gap: "0.5rem" }}>
                  {row.map((len) => (
                    <PyramidSlotCard
                      key={len}
                      letters={levelLabel(mode, len)}
                      word={pyramidFound[len]}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Classement */}
          {tab === "classement" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {leaderboardLoading && (
                <p
                  style={{
                    padding: "3rem 0",
                    textAlign: "center",
                    fontSize: "0.875rem",
                    color: "#64748b",
                  }}
                >
                  Chargement…
                </p>
              )}
              {!leaderboardLoading && leaderboard.length === 0 && (
                <p
                  style={{
                    padding: "3rem 0",
                    textAlign: "center",
                    fontSize: "0.875rem",
                    color: "#64748b",
                  }}
                >
                  Aucun résultat pour aujourd'hui
                </p>
              )}
              {!leaderboardLoading &&
                leaderboard.map((entry) => {
                  const displayScore = entry.score + Math.max(0, 4 - entry.rank)
                  return (
                  <div
                    key={entry.rank}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "0.875rem 1rem",
                      borderRadius: "1rem",
                      background: entry.is_me
                        ? "rgba(217,119,6,0.1)"
                        : "rgba(30,41,59,0.8)",
                      border: entry.is_me
                        ? "1px solid rgba(217,119,6,0.3)"
                        : "1px solid rgba(71,85,105,0.25)",
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
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem", flexShrink: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
                        <p style={{ fontWeight: 600, color: entry.is_me ? "#fbbf24" : "white", fontSize: "0.9rem" }}>
                          {displayScore} pts
                        </p>
                        {entry.rank <= 3 && <span style={{ fontSize: "0.6rem", color: "#475569" }}>+{4 - entry.rank}</span>}
                      </div>
                      <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{fmtTime(entry.elapsed_secs)}</p>
                      <div style={{ display: "flex", gap: "3px" }}>
                        {(() => {
                          const max = mode.pyramidLengths[mode.pyramidLengths.length - 1]
                          return mode.pyramidLengths.map(l => (
                            <div
                              key={l}
                              style={{
                                width: "13px",
                                height: "13px",
                                borderRadius: "3px",
                                background: entry.pyramid_found?.[l]
                                  ? l === max ? "rgba(251,191,36,0.85)" : "rgba(16,185,129,0.75)"
                                  : "rgba(71,85,105,0.3)",
                              }}
                            />
                          ))
                        })()}
                      </div>
                    </div>
                  </div>
                )})}
            </div>
          )}

          {/* Tous les mots */}
          {tab === "tous" && (
            <div
              style={{
                paddingBottom: "1rem",
              }}
            >
              {missed.length === 0 && (
                <p style={{ padding: "1rem 0 0.25rem", textAlign: "center", fontSize: "0.875rem", color: "#10b981" }}>
                  🎉 Tu as tout trouvé !
                </p>
              )}
              {discoveryWord && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "1rem",
                    borderRadius: "1.5rem",
                    marginBottom: "0.25rem",
                    background: "rgba(30,41,59,0.8)",
                    border: "1px solid rgba(71,85,105,0.25)",
                  }}
                >
                  <p
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      color: "white",
                    }}
                  >
                    {discoveryWord.toUpperCase()}
                  </p>
                  {discoveryPath ? (
                    <Grid
                      grid={grid}
                      onWordSubmit={() => null}
                      disabled
                      discoveryPath={discoveryPath}
                    />
                  ) : (
                    <p style={{ fontSize: "0.875rem", color: "#64748b" }}>
                      Chemin non trouvé
                    </p>
                  )}
                </div>
              )}
              {[...validWords].sort((a, b) => b.length - a.length || a.localeCompare(b)).map((w, i) => {
                const s = scoreForWord(w);
                const ss = SCORE_STYLE[s] ?? SCORE_STYLE[1];
                const active = discoveryWord === w;
                const isFound = foundWords.includes(w);
                return (
                  <button
                    key={w}
                    onClick={() =>
                      setDiscoveryWord((prev) => (prev === w ? null : w))
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      textAlign: "left",
                      padding: "0.8rem 0",
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
                      <span style={{ fontSize: "0.65rem", color: active ? "#93c5fd" : isFound ? lenColor(w.length) : "#334155", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{w.length}L</span>
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
          )}
        </div>
      </div>
      {/* end scrollable tab content */}

      {/* Action Buttons — fixed at bottom */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          padding: "0.5rem 0 1.25rem",
          flexShrink: 0,
        }}
      >
        <button
          onClick={copySummary}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.4rem",
            padding: "0.65rem",
            borderRadius: "0.875rem",
            background: "rgba(30,41,59,0.9)",
            border: "1px solid rgba(71,85,105,0.35)",
            color: "white",
            fontWeight: 500,
            fontSize: "0.8rem",
            cursor: "pointer",
          }}
        >
          <Copy size={13} />
          {copied ? "Copié !" : "Copier résumé"}
        </button>
        <button
          onClick={onBack}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.4rem",
            padding: "0.65rem",
            borderRadius: "0.875rem",
            background: "#3b82f6",
            border: "none",
            color: "white",
            fontWeight: 600,
            fontSize: "0.8rem",
            cursor: "pointer",
          }}
        >
          <Home size={13} />
          Accueil
        </button>
      </div>
      {birthdayLabel && birthdayOpen && (
        <BirthdayOverlay label={birthdayLabel} onClose={() => setBirthdayOpen(false)} />
      )}
    </div>
  );
}

function BirthdayOverlay({ label, onClose }: { label: string; onClose: () => void }) {
  const colors = ["#fbbf24", "#f472b6", "#60a5fa", "#34d399", "#a78bfa", "#f87171"];
  const confetti = Array.from({ length: 80 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 1.5,
    duration: 2.5 + Math.random() * 2,
    color: colors[i % colors.length],
    size: 6 + Math.random() * 8,
    rotate: Math.random() * 360,
  }));
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,17,32,0.92)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        overflow: "hidden",
        padding: "1rem",
      }}
    >
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-20vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.8; }
        }
        @keyframes sixty-pop {
          0% { transform: scale(0.2) rotate(-15deg); opacity: 0; }
          60% { transform: scale(1.15) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes sixty-glow {
          0%, 100% { filter: drop-shadow(0 0 25px rgba(251,191,36,0.6)); }
          50% { filter: drop-shadow(0 0 50px rgba(251,191,36,1)); }
        }
        @keyframes msg-fade {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {confetti.map((c, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${c.left}%`,
            top: 0,
            width: `${c.size}px`,
            height: `${c.size * 0.4}px`,
            background: c.color,
            transform: `rotate(${c.rotate}deg)`,
            animation: `confetti-fall ${c.duration}s ${c.delay}s linear infinite`,
            borderRadius: "1px",
          }}
        />
      ))}
      <div
        style={{
          fontSize: "clamp(5rem, 22vw, 9rem)",
          fontWeight: 900,
          background: "linear-gradient(135deg, #fbbf24 0%, #f472b6 50%, #60a5fa 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          lineHeight: 1,
          letterSpacing: "-0.02em",
          animation: "sixty-pop 0.9s cubic-bezier(0.34,1.56,0.64,1) both, sixty-glow 2.5s ease-in-out 0.9s infinite",
        }}
      >
        {label}
      </div>
      <button
        onClick={onClose}
        style={{
          marginTop: "0.5rem",
          padding: "0.75rem 2rem",
          borderRadius: "999px",
          background: "white",
          color: "#0b1120",
          border: "none",
          fontWeight: 700,
          fontSize: "0.95rem",
          cursor: "pointer",
          animation: "msg-fade 0.6s ease-out 1.1s both",
          zIndex: 1,
        }}
      >
        Voir mes résultats
      </button>
    </div>
  );
}
