import { useState, useRef, useEffect } from "react";
import { Copy, Home } from "lucide-react";
import { scoreForWord } from "../lib/scoring";
import { findWordPath } from "../lib/gridGenerator";
import type { Cell, Grid as GridType } from "../lib/gridGenerator";
import Grid from "./Grid";
import { fetchDailyLeaderboard } from "../lib/api";
import type { LeaderboardEntry } from "../lib/api";

const PYRAMID_LENGTHS = [3, 4, 5, 6, 7, 8] as const;

interface Props {
  date: string;
  elapsedSeconds: number;
  pyramidFound: Record<number, string>;
  foundWords: string[];
  validWords: Set<string>;
  grid: GridType;
  onBack: () => void;
}

type Tab = "pyramide" | "classement" | "rates";

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

export default function DailyResultsScreen({
  date,
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

  const completed = PYRAMID_LENGTHS.every((l) => !!pyramidFound[l]);
  const found = PYRAMID_LENGTHS.filter((l) => !!pyramidFound[l]).length;

  const missed = [...validWords]
    .filter((w) => !foundWords.includes(w))
    .sort((a, b) => scoreForWord(b) - scoreForWord(a) || a.localeCompare(b));

  const discoveryPath: Cell[] | null = discoveryWord
    ? findWordPath(grid, discoveryWord)
    : null;

  const score = PYRAMID_LENGTHS.reduce((acc, l) => {
    if (!pyramidFound[l]) return acc;
    return acc + scoreForWord(pyramidFound[l]);
  }, 0);

  useEffect(() => {
    if (tab !== "classement") return;
    if (leaderboard.length > 0) return;
    setLeaderboardLoading(true);
    fetchDailyLeaderboard(date)
      .then(setLeaderboard)
      .finally(() => setLeaderboardLoading(false));
  }, [tab, date, leaderboard.length]);

  function copySummary() {
    const lines = [
      `⚡ Ruzzle — Défi du jour ${date}`,
      completed
        ? `🏆 Pyramide complète en ${fmtTime(elapsedSeconds)} !`
        : `🔶 ${found}/6 niveaux — ${fmtTime(elapsedSeconds)}`,
      "",
      ...PYRAMID_LENGTHS.map((l) => {
        const w = pyramidFound[l];
        const lbl = l === 8 ? "8L+" : `${l}L`;
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
    { id: "rates", label: `Ratés (${missed.length})` },
  ];

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
          gap: "0.75rem",
          overflow: "hidden",
          padding: "1.25rem 1rem 0",
        }}
      >
        {/* Header */}
        <div
          style={{
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
          }}
        >
          <p
            style={{
              fontSize: "0.7rem",
              fontWeight: 500,
              letterSpacing: "0.12em",
              color: "#64748b",
            }}
          >
            DÉFI DU JOUR · {date}
          </p>
          <p
            style={{
              fontSize: "2.5rem",
              fontWeight: 700,
              color: "white",
              lineHeight: 1.1,
            }}
          >
            {score} pts
          </p>
          <p style={{ fontSize: "1rem", color: "#64748b" }}>
            {fmtTime(elapsedSeconds)}
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: "0.25rem",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.3rem 1rem",
                borderRadius: "999px",
                background: completed
                  ? "rgba(16,185,129,0.12)"
                  : "rgba(30,41,59,0.8)",
                border: completed
                  ? "1px solid rgba(16,185,129,0.3)"
                  : "1px solid rgba(71,85,105,0.4)",
                fontSize: "0.85rem",
                fontWeight: 500,
                color: completed ? "#34d399" : "#64748b",
              }}
            >
              {completed ? "Pyramide complète 🏆" : `${found}/6 niveaux`}
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
              <PyramidSlotCard letters="8L+" word={pyramidFound[8]} />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <PyramidSlotCard letters="6L" word={pyramidFound[6]} />
                <PyramidSlotCard letters="7L" word={pyramidFound[7]} />
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <PyramidSlotCard letters="3L" word={pyramidFound[3]} />
                <PyramidSlotCard letters="4L" word={pyramidFound[4]} />
                <PyramidSlotCard letters="5L" word={pyramidFound[5]} />
              </div>
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
                leaderboard.map((entry) => (
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
                    }}
                  >
                    <span style={{ width: "2.5rem", fontSize: "1.1rem" }}>
                      {RANK_MEDAL[entry.rank] ?? entry.rank}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontWeight: 500,
                        color: entry.is_me ? "#fbbf24" : "white",
                      }}
                    >
                      {entry.display_name ?? `Joueur #${entry.rank}`}
                      {entry.is_me && (
                        <span
                          style={{
                            marginLeft: "0.4rem",
                            fontSize: "0.7rem",
                            color: "rgba(251,191,36,0.5)",
                          }}
                        >
                          · moi
                        </span>
                      )}
                    </span>
                    <div style={{ textAlign: "right" }}>
                      <p
                        style={{
                          fontWeight: 600,
                          color: entry.is_me ? "#fbbf24" : "white",
                        }}
                      >
                        {entry.score} pts
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {fmtTime(entry.elapsed_secs)}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Ratés */}
          {tab === "rates" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {missed.length === 0 && (
                <p
                  style={{
                    padding: "3rem 0",
                    textAlign: "center",
                    fontSize: "0.875rem",
                    color: "#10b981",
                  }}
                >
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
              {missed.map((w) => {
                const s = scoreForWord(w);
                const active = discoveryWord === w;
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
                      padding: "0.875rem 1rem",
                      borderRadius: "1rem",
                      background: active
                        ? "rgba(59,130,246,0.1)"
                        : "rgba(30,41,59,0.8)",
                      border: active
                        ? "1px solid rgba(59,130,246,0.3)"
                        : "1px solid rgba(71,85,105,0.25)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 500,
                        color: active ? "#93c5fd" : "white",
                      }}
                    >
                      {w.toUpperCase()}
                    </span>
                    <span
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        padding: "0.2rem 0.6rem",
                        borderRadius: "0.5rem",
                        background: "rgba(71,85,105,0.3)",
                        color: "#94a3b8",
                      }}
                    >
                      +{s}
                    </span>
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
          padding: "1rem 0 2rem",
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
            gap: "0.5rem",
            padding: "1rem",
            borderRadius: "1rem",
            background: "rgba(30,41,59,0.9)",
            border: "1px solid rgba(71,85,105,0.35)",
            color: "white",
            fontWeight: 500,
            fontSize: "0.9rem",
            cursor: "pointer",
          }}
        >
          <Copy size={15} />
          {copied ? "Copié !" : "Copier résumé"}
        </button>
        <button
          onClick={onBack}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            padding: "1rem",
            borderRadius: "1rem",
            background: "#3b82f6",
            border: "none",
            color: "white",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: "pointer",
          }}
        >
          <Home size={15} />
          Accueil
        </button>
      </div>
    </div>
  );
}
