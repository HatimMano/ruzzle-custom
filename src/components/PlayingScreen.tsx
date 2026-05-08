import { RefreshCw, X } from "lucide-react";
import Grid from "./Grid";
import Timer from "./Timer";
import { scoreForWord } from "../lib/scoring";
import type { Cell, Grid as GridType } from "../lib/gridGenerator";
import type { DailyModeRules } from "../lib/dailyModes";

type FeedbackType = 'valid' | 'duplicate' | 'invalid' | null;

interface GameConfig {
  minLetters: 3 | 4 | 5 | 6 | 7;
  duration: 30 | 60 | 120 | 0;
}

interface Props {
  isDailyChallenge: boolean;
  dailyMode: DailyModeRules;
  seed: string;
  score: number;
  streak: number;
  streakFlash: string | null;
  scoreAnim: { pts: number; id: number } | null;
  countdown: number | null;
  foundWords: string[];
  validWords: Set<string>;
  pyramidFound: Record<number, string>;
  grid: GridType | null;
  config: GameConfig;
  elapsed: number;
  timerKey: number;
  timerRunning: boolean;
  onConfirmAndStop: () => void;
  onNewGame: () => void;
  onWordSubmit: (cells: Cell[]) => FeedbackType;
  onEndGame: () => void;
}

function fmtStopwatch(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PlayingScreen({
  isDailyChallenge,
  dailyMode,
  seed,
  score,
  streak,
  streakFlash,
  scoreAnim,
  countdown,
  foundWords,
  validWords,
  pyramidFound,
  grid,
  config,
  elapsed,
  timerKey,
  timerRunning,
  onConfirmAndStop,
  onNewGame,
  onWordSubmit,
  onEndGame,
}: Props) {
  return (
    <div className="h-dvh bg-slate-900 flex flex-col max-w-md mx-auto overflow-hidden">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.25rem 0.875rem",
          borderBottom: "1px solid rgba(30,41,59,0.8)",
        }}
      >
        <h1 style={{ fontSize: "1.1rem", fontWeight: 900, letterSpacing: "0.05em" }}>
          {isDailyChallenge ? (
            <span style={{ color: "#fbbf24" }}>⚡ DÉFI DU JOUR</span>
          ) : (
            <span style={{ color: "white" }}>
              GRIDDLE{" "}
              <span style={{ fontSize: "0.6rem", color: "#334155", fontFamily: "monospace", letterSpacing: "0.1em", fontWeight: 400 }}>
                {seed}
              </span>
            </span>
          )}
        </h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={onConfirmAndStop}
            style={{
              display: "flex", alignItems: "center", gap: "0.3rem",
              padding: "0.45rem 0.75rem", borderRadius: "0.75rem",
              background: "rgba(185,28,28,0.2)",
              border: "1px solid rgba(185,28,28,0.35)",
              color: "#fca5a5", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            <X size={13} />
            Quit
          </button>
          <button
            onClick={onNewGame}
            style={{
              display: "flex", alignItems: "center", gap: "0.3rem",
              padding: "0.45rem 0.75rem", borderRadius: "0.75rem",
              background: "rgba(30,41,59,0.9)",
              border: "1px solid rgba(71,85,105,0.4)",
              color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            <RefreshCw size={13} />
            New
          </button>
        </div>
      </div>

      {/* Score bar */}
      <div
        style={{
          display: "flex", alignItems: "center",
          padding: "0.75rem 1.25rem", gap: "1rem",
          background: "rgba(15,23,42,0.6)",
          borderBottom: "1px solid rgba(30,41,59,0.6)",
        }}
      >
        <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
          <span
            style={{
              fontSize: "2.5rem", fontWeight: 900, color: "white",
              fontVariantNumeric: "tabular-nums", lineHeight: 1,
            }}
          >
            {score}
          </span>
          <span style={{ fontSize: "0.85rem", color: "#475569", fontWeight: 500 }}>pts</span>
          {!isDailyChallenge && (
            <span
              style={{
                marginLeft: "0.25rem", fontSize: "0.7rem", fontWeight: 700,
                padding: "0.15rem 0.45rem", borderRadius: "999px",
                background: "rgba(59,130,246,0.15)", color: "#60a5fa",
                border: "1px solid rgba(59,130,246,0.25)",
              }}
            >
              {config.minLetters}L+
            </span>
          )}
        </div>
        {streak >= 3 && (
          <div className="flex items-center gap-1 text-orange-400 font-bold animate-pop">
            <span>🔥</span>
            <span style={{ fontSize: "0.875rem" }}>×{streak}</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
          <span
            style={{
              fontSize: "1.5rem", fontWeight: 700, color: "#cbd5e1",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {foundWords.length}
          </span>
          <span style={{ fontSize: "0.8rem", color: "#334155" }}>/{validWords.size}</span>
        </div>
        {isDailyChallenge ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: "4rem" }}>
            <span
              style={{
                fontSize: "1.25rem", fontWeight: 700, color: "#fbbf24",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtStopwatch(elapsed)}
            </span>
          </div>
        ) : config.duration > 0 ? (
          <Timer
            key={timerKey}
            duration={config.duration}
            running={timerRunning}
            onEnd={onEndGame}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: "3rem" }}>
            <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "#334155" }}>∞</span>
          </div>
        )}
      </div>

      {/* Grille */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
        <div className="relative">
          {grid && (
            <Grid
              grid={grid}
              onWordSubmit={onWordSubmit}
              disabled={false}
              minLetters={isDailyChallenge ? 3 : config.minLetters}
            />
          )}
          {scoreAnim && (
            <div
              key={scoreAnim.id}
              className="absolute -top-10 left-1/2 -translate-x-1/2 text-green-400 font-black text-2xl animate-floatScore pointer-events-none whitespace-nowrap"
            >
              +{scoreAnim.pts}
            </div>
          )}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/85 rounded-2xl">
              <span className="text-9xl font-black text-white animate-pop tabular-nums">
                {countdown === 0 ? "Go" : countdown}
              </span>
            </div>
          )}
        </div>

        {streakFlash && (
          <div className="px-5 py-2 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-300 text-sm font-bold animate-pop">
            {streakFlash}
          </div>
        )}

        {/* Pyramid strip (daily) or found words strip (normal) */}
        {isDailyChallenge ? (
          <div className="flex gap-1.5 w-full">
            {dailyMode.pyramidLengths.map((len) => {
              const word = pyramidFound[len];
              const max = dailyMode.pyramidLengths[dailyMode.pyramidLengths.length - 1];
              const label = len === max ? `${len}+` : `${len}L`;
              return (
                <div
                  key={len}
                  className={`flex-1 flex flex-col items-center py-2 rounded-xl border transition-all duration-300 ${
                    word ? "bg-green-500/20 border-green-500/40" : "bg-slate-800/60 border-slate-700"
                  }`}
                >
                  <span className={`text-[10px] font-bold ${word ? "text-green-400" : "text-slate-600"}`}>
                    {label}
                  </span>
                  {word ? (
                    <span className="text-[8px] text-green-300 uppercase font-mono mt-0.5 w-full text-center px-0.5 truncate">
                      {word}
                    </span>
                  ) : (
                    <span className="text-slate-700 text-xs mt-0.5">·</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : foundWords.length > 0 ? (
          <div className="w-full overflow-x-auto flex gap-2 pb-0.5" style={{ scrollbarWidth: "none" }}>
            {[...foundWords]
              .reverse()
              .slice(0, 12)
              .map((w, i) => {
                const s = scoreForWord(w);
                const color =
                  s >= 12 ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
                  : s >= 7 ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                  : s >= 4 ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
                  : "bg-slate-800 text-slate-400 border-slate-700";
                return (
                  <span
                    key={w}
                    className={`flex-none px-2.5 py-1 rounded-full border text-[11px] font-mono uppercase whitespace-nowrap ${color} ${
                      i === 0 ? "animate-slideIn" : ""
                    }`}
                  >
                    {w} <span className="opacity-50">+{s}</span>
                  </span>
                );
              })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
