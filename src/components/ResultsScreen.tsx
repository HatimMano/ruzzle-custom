import { useRef, useState } from "react";
import Grid from "./Grid";
import { scoreForWord } from "../lib/scoring";
import { findWordPath } from "../lib/gridGenerator";
import type { Cell, Grid as GridType } from "../lib/gridGenerator";

interface Props {
  seed: string;
  score: number;
  foundWords: string[];
  validWords: Set<string>;
  grid: GridType;
  timerDuration: number;
  minLetters: number;
  isNewBest: boolean;
  bestScore: number | null;
  onReplay: () => void;
  onNewGame: () => void;
  onCopyLink: () => void;
}

type Tab = "trouves" | "rates";

const SCORE_STYLE: Record<number, { color: string; bg: string }> = {
  1: { color: "#94a3b8", bg: "rgba(71,85,105,0.25)" },
  2: { color: "#94a3b8", bg: "rgba(71,85,105,0.25)" },
  4: { color: "#a78bfa", bg: "rgba(109,40,217,0.2)" },
  7: { color: "#fbbf24", bg: "rgba(161,98,7,0.25)" },
  12: { color: "#fb923c", bg: "rgba(154,52,18,0.25)" },
};

export default function ResultsScreen({
  seed,
  score,
  foundWords,
  validWords,
  grid,
  timerDuration,
  minLetters,
  isNewBest,
  bestScore,
  onReplay,
  onNewGame,
  onCopyLink,
}: Props) {
  const [tab, setTab] = useState<Tab>("trouves");
  const [discoveryWord, setDiscoveryWord] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number>(0);

  const missed = [...validWords]
    .filter((w) => !foundWords.includes(w))
    .sort((a, b) => scoreForWord(b) - scoreForWord(a) || a.localeCompare(b));

  const pct =
    validWords.size > 0
      ? Math.round((foundWords.length / validWords.size) * 100)
      : 0;
  const discoveryPath: Cell[] | null = discoveryWord
    ? findWordPath(grid, discoveryWord)
    : null;

  const mins = Math.floor(timerDuration / 60);
  const secs = timerDuration % 60;
  const timeStr =
    timerDuration === 0
      ? "∞"
      : mins > 0
      ? `${mins}m${secs > 0 ? secs + "s" : ""}`
      : `${secs}s`;

  const summary = [
    `🎯 Griddle — seed: ${seed}`,
    `⏱ ${timeStr} | 🏆 ${score} pts | 📝 ${foundWords.length}/${validWords.size} mots`,
    "",
    ...foundWords.map((w) => {
      const s = scoreForWord(w);
      return `${
        s >= 12 ? "🔥" : s >= 7 ? "⭐" : s >= 4 ? "✨" : "·"
      } ${w.toUpperCase()} (+${s}pts)`;
    }),
  ].join("\n");

  function copySummary() {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  const scoreStyle = (s: number) => SCORE_STYLE[s] ?? SCORE_STYLE[1];

  return (
    <div
      style={{
        height: "100dvh",
        background: "#0b1120",
        display: "flex",
        flexDirection: "column",
        maxWidth: "28rem",
        margin: "0 auto",
      }}
    >
      {/* Hero header */}
      <div style={{ padding: "1.5rem 1.25rem 1rem", flexShrink: 0 }}>
        {/* Seed + config */}
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
          <span
            style={{
              fontSize: "0.7rem",
              color: "#334155",
              fontFamily: "monospace",
              letterSpacing: "0.08em",
            }}
          >
            SEED : {seed}
          </span>
          <span
            style={{
              fontSize: "0.7rem",
              color: "#1e293b",
              fontFamily: "monospace",
            }}
          >
            {minLetters}L+ · {timeStr}
          </span>
        </div>

        {/* Score row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}
            >
              <span
                style={{
                  fontSize: "3.75rem",
                  fontWeight: 900,
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                  color: isNewBest ? "#fbbf24" : "white",
                }}
              >
                {score}
              </span>
              <span
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 500,
                  color: "#475569",
                }}
              >
                pts
              </span>
            </div>
            {isNewBest ? (
              <p
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "#f59e0b",
                  marginTop: "0.25rem",
                }}
              >
                🏆 Nouveau record !
              </p>
            ) : bestScore !== null ? (
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#334155",
                  marginTop: "0.25rem",
                }}
              >
                record : {bestScore} pts
              </p>
            ) : null}
          </div>

          {/* Progress circle */}
          <div style={{ position: "relative", width: "5rem", height: "5rem" }}>
            <svg
              style={{
                width: "100%",
                height: "100%",
                transform: "rotate(-90deg)",
              }}
              viewBox="0 0 80 80"
            >
              <circle
                cx="40"
                cy="40"
                r="34"
                fill="none"
                stroke="rgba(30,41,59,0.8)"
                strokeWidth="7"
              />
              <circle
                cx="40"
                cy="40"
                r="34"
                fill="none"
                stroke={
                  pct >= 80 ? "#22c55e" : pct >= 50 ? "#3b82f6" : "#475569"
                }
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - pct / 100)}`}
                style={{ transition: "stroke-dashoffset 0.7s ease" }}
              />
            </svg>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  color: "white",
                  fontWeight: 900,
                  fontSize: "1.1rem",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {foundWords.length}
              </span>
              <span style={{ color: "#475569", fontSize: "0.65rem" }}>
                /{validWords.size}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ padding: "0 1.25rem 0.75rem", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            background: "rgba(30,41,59,0.9)",
            borderRadius: "999px",
            padding: "0.3rem",
            gap: "0.25rem",
          }}
        >
          {[
            { id: "trouves" as Tab, label: "Trouvés", n: foundWords.length },
            { id: "rates" as Tab, label: "Ratés", n: missed.length },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setDiscoveryWord(null);
              }}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                padding: "0.6rem 0",
                borderRadius: "999px",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                background: tab === t.id ? "white" : "transparent",
                color: tab === t.id ? "#0f172a" : "#475569",
                border: "none",
              }}
            >
              {t.label}
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  padding: "0.1rem 0.4rem",
                  borderRadius: "999px",
                  background: tab === t.id ? "#e2e8f0" : "rgba(71,85,105,0.4)",
                  color: tab === t.id ? "#475569" : "#64748b",
                }}
              >
                {t.n}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable list */}
      <div
        style={
          {
            flex: 1,
            overflowY: "auto",
            padding: "0 1.25rem",
            WebkitOverflowScrolling: "touch",
          } as React.CSSProperties
        }
      >
        {tab === "trouves" && (
          <div style={{ paddingBottom: "1rem" }}>
            {foundWords.length === 0 && (
              <p
                style={{
                  textAlign: "center",
                  color: "#334155",
                  fontSize: "0.875rem",
                  padding: "3rem 0",
                }}
              >
                Aucun mot trouvé
              </p>
            )}
            {[...foundWords].reverse().map((w, i) => {
              const s = scoreForWord(w);
              const { color, bg } = scoreStyle(s);
              return (
                <div
                  key={w}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.8rem 0",
                    borderTop: i > 0 ? "1px solid rgba(30,41,59,0.8)" : "none",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      color: "white",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      fontSize: "0.95rem",
                    }}
                  >
                    {w}
                  </span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      padding: "0.2rem 0.55rem",
                      borderRadius: "999px",
                      background: bg,
                      color,
                    }}
                  >
                    +{s} pts
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {tab === "rates" && (
          <div style={{ paddingBottom: "1rem" }}>
            {missed.length === 0 && (
              <p
                style={{
                  textAlign: "center",
                  color: "#10b981",
                  fontSize: "0.875rem",
                  padding: "3rem 0",
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
                  gap: "0.5rem",
                  marginBottom: "0.75rem",
                  padding: "1rem",
                  borderRadius: "1.25rem",
                  background: "rgba(30,41,59,0.8)",
                  border: "1px solid rgba(109,40,217,0.2)",
                }}
              >
                <p
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: "#c4b5fd",
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
                  <p style={{ fontSize: "0.875rem", color: "#475569" }}>
                    Chemin non trouvé
                  </p>
                )}
              </div>
            )}

            {missed.map((w, i) => {
              const s = scoreForWord(w);
              const { color, bg } = scoreStyle(s);
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
                      color: active ? "#c4b5fd" : "#64748b",
                      transition: "color 0.15s",
                    }}
                  >
                    {w}
                  </span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      padding: "0.2rem 0.55rem",
                      borderRadius: "999px",
                      background: active ? "rgba(109,40,217,0.2)" : bg,
                      color: active ? "#c4b5fd" : color,
                    }}
                  >
                    +{s} pts
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div
        style={{
          flexShrink: 0,
          padding: "1rem 1.5rem 2rem",
          borderTop: "1px solid rgba(30,41,59,0.8)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-around" }}>
          {[
            {
              icon: copied ? "✓" : "📋",
              label: copied ? "Copié !" : "Résumé",
              onClick: copySummary,
              primary: true,
            },
            {
              icon: "🔗",
              label: "Partager",
              onClick: onCopyLink,
              primary: false,
            },
            { icon: "↺", label: "Rejouer", onClick: onReplay, primary: false },
            {
              icon: "✨",
              label: "Nouvelle",
              onClick: onNewGame,
              primary: false,
            },
          ].map((btn) => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.3rem",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                opacity: 1,
                transition: "opacity 0.15s",
              }}
            >
              <div
                style={{
                  width: "3.5rem",
                  height: "3.5rem",
                  borderRadius: "999px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.4rem",
                  background: btn.primary ? "#3b82f6" : "rgba(30,41,59,0.9)",
                  border: btn.primary
                    ? "none"
                    : "1px solid rgba(71,85,105,0.3)",
                  boxShadow: btn.primary
                    ? "0 0 20px rgba(59,130,246,0.35)"
                    : "none",
                }}
              >
                {btn.icon}
              </div>
              <span
                style={{
                  fontSize: "0.65rem",
                  color: "#475569",
                  fontWeight: 500,
                }}
              >
                {btn.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
