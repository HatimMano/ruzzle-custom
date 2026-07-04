import { useState } from "react";
import { Home } from "lucide-react";
import type { Grid as GridType } from "../lib/gridGenerator";
import type { SpeedleMode } from "../lib/dailyModes";
import type { SpeedleResult } from "./SpeedleGameScreen";
import { speedleSecsBonus } from "../lib/speedleScoring";
import LeaderboardTab from "./results/LeaderboardTab";
import WordsListTab from "./results/WordsListTab";
import type { LeaderboardEntry } from "../lib/api";

type Tab = "score" | "classement" | "mots";

interface Props {
  mode: SpeedleMode;
  date: string;
  grid: GridType;
  validWords: Set<string>;
  result: SpeedleResult;
  onBack: () => void;
}

function fmtSecs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
}

// Le score Speedle est un composite (survivedSecs*1M + wordCount*100 + maxWordLen).
// Pour l'affichage, on utilise elapsed_secs (= survivedSecs) et levels_found (= wordCount)
// qui sont stockés en clair dans la row.
const speedleLeaderboardLabel = (entry: LeaderboardEntry) => ({
  primary: `${fmtSecs(entry.elapsed_secs)} survie`,
  secondary: `${entry.levels_found} mots`,
});

export default function SpeedleResultsScreen({ mode, date, grid, validWords, result, onBack }: Props) {
  const [tab, setTab] = useState<Tab>("score");

  const bestWord = [...result.foundWords].sort((a, b) => b.length - a.length)[0] ?? null;
  const bestBonus = bestWord ? speedleSecsBonus(bestWord.length) : 0;
  const avgBonus = result.wordCount > 0 ? (result.totalSecsGained / result.wordCount).toFixed(1) : "0";

  return (
    <div style={{
      height: "100dvh", background: "#0b1120",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{
        maxWidth: "28rem", width: "100%", margin: "0 auto",
        flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem",
        overflow: "hidden", padding: "0.75rem 1rem 0",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <p style={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.14em", color: mode.palette.accentSoft, textTransform: "uppercase" }}>
            ⌛ Speedle · {date}
          </p>
          <p style={{ fontSize: "1.9rem", fontWeight: 700, color: "white", lineHeight: 1.1 }}>
            {result.wordCount}
            <span style={{ fontSize: "1rem", color: "#475569", fontWeight: 600 }}> mots</span>
          </p>
          <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
            Survie {fmtSecs(result.survivedSecs)} · +{result.totalSecsGained}s gagnées
          </p>
        </div>

        {/* Tab Bar */}
        <div style={{
          display: "flex", background: "rgba(30,41,59,0.9)",
          borderRadius: "1rem", padding: "0.375rem", gap: "0.375rem",
        }}>
          {([
            ["score", "Score"],
            ["classement", "Classement"],
            ["mots", "Mots"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                flex: 1, padding: "0.625rem 0", borderRadius: "0.75rem",
                fontSize: "0.85rem", fontWeight: 600,
                border: tab === id ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                background: tab === id ? "rgba(255,255,255,0.08)" : "transparent",
                color: tab === id ? "white" : "#475569",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
          {tab === "score" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", paddingTop: "0.75rem" }}>
              {/* Stats principales */}
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <div style={{
                  flex: 1, textAlign: "center", padding: "1rem 0.5rem",
                  background: "rgba(15,23,42,0.6)", borderRadius: "1rem",
                  border: "1px solid rgba(30,41,59,0.8)",
                }}>
                  <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "white", fontVariantNumeric: "tabular-nums" }}>
                    {fmtSecs(result.survivedSecs)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "0.15rem" }}>survie</div>
                </div>
                <div style={{
                  flex: 1, textAlign: "center", padding: "1rem 0.5rem",
                  background: "rgba(15,23,42,0.6)", borderRadius: "1rem",
                  border: "1px solid rgba(30,41,59,0.8)",
                }}>
                  <div style={{ fontSize: "1.8rem", fontWeight: 900, color: mode.palette.accent, fontVariantNumeric: "tabular-nums" }}>
                    +{result.totalSecsGained}s
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "0.15rem" }}>temps gagné</div>
                </div>
              </div>

              {/* Moyenne + meilleur mot */}
              {result.wordCount > 0 && (
                <div style={{
                  padding: "1rem", borderRadius: "1rem",
                  background: "rgba(30,41,59,0.7)", border: "1px solid rgba(71,85,105,0.3)",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "0.65rem", color: "#64748b", marginBottom: "0.4rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Meilleur mot · {avgBonus}s/mot en moyenne
                  </div>
                  {bestWord && (
                    <span style={{
                      padding: "0.4rem 1.1rem", borderRadius: "999px",
                      background: mode.palette.slotBg, border: mode.palette.slotBorder,
                      color: mode.palette.accent, fontSize: "1rem", fontWeight: 700,
                      fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.12em",
                    }}>
                      {bestWord}
                      <span style={{ marginLeft: "0.5rem", opacity: 0.6, fontSize: "0.8rem" }}>
                        +{bestBonus}s
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "classement" && (
            <LeaderboardTab date={date} modeId={mode.id} scoreLabel={speedleLeaderboardLabel} />
          )}

          {tab === "mots" && <WordsListTab grid={grid} validWords={validWords} foundWords={result.foundWords} />}
        </div>
      </div>

      {/* Action bottom */}
      <div style={{ display: "flex", gap: "0.75rem", padding: "0.5rem 1rem 1.25rem", flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
            padding: "0.75rem", borderRadius: "0.875rem",
            background: "#3b82f6", border: "none",
            color: "white", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer",
          }}
        >
          <Home size={14} />
          Accueil
        </button>
      </div>
    </div>
  );
}
