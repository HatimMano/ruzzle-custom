import { useCallback, useEffect, useRef, useState } from "react";
import { X, SkipForward } from "lucide-react";
import Grid from "./Grid";
import { isValidWord } from "../lib/dictionary";
import { scoreForLen } from "../lib/scoring";
import {
  pyramidSlotForWord,
  isPyramidComplete,
  type TriddleMode,
} from "../lib/dailyModes";
import { useScoreAnimation } from "../hooks/useScoreAnimation";
import { playValid, playInvalid, playDuplicate } from "../lib/audio";
import { getDailyAbandonMessage } from "../lib/abandonMessages";
import type { Cell, Grid as GridType } from "../lib/gridGenerator";

type FeedbackType = "valid" | "duplicate" | "invalid" | null;

export interface TriddleResult {
  totalScore: number;
  totalElapsedSecs: number;
  foundWordsPerGrid: string[][];
  pyramidFoundPerGrid: Record<number, string>[];
}

interface Props {
  mode: TriddleMode;
  grids: GridType[];
  validWordsPerGrid: Set<string>[];
  onComplete: (result: TriddleResult) => void;
  onAbandon: (partial: TriddleResult) => void;
  // Demande à l'app d'afficher une modal de confirmation. App appelle onYes si l'utilisateur valide.
  onRequestConfirm: (message: string, onYes: () => void) => void;
}

function fmtTimer(secs: number): string {
  const m = Math.floor(Math.max(0, secs) / 60);
  const s = Math.max(0, secs) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pyramidScore(pyramid: Record<number, string>): number {
  return Object.keys(pyramid).reduce((acc, k) => acc + scoreForLen(parseInt(k)), 0);
}

export default function TriddleGameScreen({ mode, grids, onComplete, onAbandon, onRequestConfirm }: Props) {
  const [currentGridIndex, setCurrentGridIndex] = useState(0);
  const [currentFoundWords, setCurrentFoundWords] = useState<string[]>([]);
  const [currentPyramidFound, setCurrentPyramidFound] = useState<Record<number, string>>({});
  const [pastResults, setPastResults] = useState<{ foundWords: string[]; pyramidFound: Record<number, string> }[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(mode.perGridDurationSecs);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionInfo, setTransitionInfo] = useState<{ next: number; gridScore: number } | null>(null);

  const { anim: scoreAnim, trigger: triggerScoreAnim } = useScoreAnimation();

  const gridStartedAtRef = useRef<number>(Date.now());
  const sessionStartedAtRef = useRef<number>(Date.now());
  const tickerRef = useRef<number>(0);
  const advancingRef = useRef(false); // protège contre double appel pendant transition

  const currentScore = pyramidScore(currentPyramidFound);
  const totalScore = currentScore + pastResults.reduce((acc, r) => acc + pyramidScore(r.pyramidFound), 0);

  const finishTriddle = useCallback(
    (allResults: { foundWords: string[]; pyramidFound: Record<number, string> }[]) => {
      clearInterval(tickerRef.current);
      const totalElapsedSecs = Math.floor((Date.now() - sessionStartedAtRef.current) / 1000);
      onComplete({
        totalScore: allResults.reduce((acc, r) => acc + pyramidScore(r.pyramidFound), 0),
        totalElapsedSecs,
        foundWordsPerGrid: allResults.map((r) => r.foundWords),
        pyramidFoundPerGrid: allResults.map((r) => r.pyramidFound),
      });
    },
    [onComplete]
  );

  const advanceGrid = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    clearInterval(tickerRef.current);

    const completedResult = { foundWords: currentFoundWords, pyramidFound: currentPyramidFound };
    const allResults = [...pastResults, completedResult];

    if (currentGridIndex >= grids.length - 1) {
      finishTriddle(allResults);
      return;
    }

    setTransitionInfo({ next: currentGridIndex + 2, gridScore: pyramidScore(completedResult.pyramidFound) });
    setIsTransitioning(true);

    window.setTimeout(() => {
      setPastResults(allResults);
      setCurrentGridIndex((i) => i + 1);
      setCurrentFoundWords([]);
      setCurrentPyramidFound({});
      gridStartedAtRef.current = Date.now();
      setTimeRemaining(mode.perGridDurationSecs);
      setIsTransitioning(false);
      setTransitionInfo(null);
      advancingRef.current = false;
    }, 1500);
  }, [currentFoundWords, currentPyramidFound, currentGridIndex, grids.length, mode.perGridDurationSecs, pastResults, finishTriddle]);

  // Auto-complétion : si la pyramide de la grille courante est pleine
  useEffect(() => {
    if (isTransitioning) return;
    if (isPyramidComplete(mode, currentPyramidFound)) {
      advanceGrid();
    }
  }, [currentPyramidFound, mode, isTransitioning, advanceGrid]);

  // Timer par grille
  useEffect(() => {
    if (isTransitioning) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - gridStartedAtRef.current) / 1000);
      const remaining = mode.perGridDurationSecs - elapsed;
      setTimeRemaining(remaining);
      if (remaining <= 0) {
        advanceGrid();
      }
    };
    tick();
    tickerRef.current = window.setInterval(tick, 250);
    return () => clearInterval(tickerRef.current);
  }, [currentGridIndex, isTransitioning, mode.perGridDurationSecs, advanceGrid]);

  const handleWordSubmit = useCallback(
    (cells: Cell[]): FeedbackType => {
      if (isTransitioning) return null;
      const word = cells.map((c) => c.letter).join("").toLowerCase();
      if (word.length < 3) return null;

      if (currentFoundWords.includes(word)) {
        playDuplicate();
        if ("vibrate" in navigator) navigator.vibrate(80);
        return "duplicate";
      }
      if (!isValidWord(word)) {
        playInvalid();
        if ("vibrate" in navigator) navigator.vibrate([30, 30, 30]);
        return "invalid";
      }

      const slot = pyramidSlotForWord(mode, word, currentPyramidFound);
      const pts = slot !== null ? scoreForLen(slot) : 0;

      setCurrentFoundWords((prev) => [...prev, word]);
      if (slot !== null) {
        setCurrentPyramidFound((prev) => ({ ...prev, [slot]: word }));
      }
      if (pts > 0) triggerScoreAnim(pts);
      playValid();
      if ("vibrate" in navigator) navigator.vibrate(40);
      return "valid";
    },
    [currentFoundWords, currentPyramidFound, mode, isTransitioning, triggerScoreAnim]
  );

  const grid = grids[currentGridIndex];
  const maxLen = mode.pyramidLengths[mode.pyramidLengths.length - 1];

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
          <span style={{ color: mode.palette.accent }}>🏃 MARATHON · {currentGridIndex + 1}/{grids.length}</span>
        </h1>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button
            onClick={() => {
              if (advancingRef.current || isTransitioning) return;
              const remaining = grids.length - 1 - currentGridIndex;
              const message = remaining > 0
                ? `Passer à la grille ${currentGridIndex + 2}/${grids.length} ? Pas de retour possible.`
                : "Terminer le Triddle maintenant ? Pas de retour possible.";
              onRequestConfirm(message, () => advanceGrid());
            }}
            style={{
              display: "flex", alignItems: "center", gap: "0.3rem",
              padding: "0.45rem 0.6rem", borderRadius: "0.75rem",
              background: "rgba(30,41,59,0.9)",
              border: "1px solid rgba(71,85,105,0.4)",
              color: "#cbd5e1", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            <SkipForward size={12} />
            Passer
          </button>
        <button
          onClick={() => {
            onRequestConfirm(getDailyAbandonMessage(), () => {
              clearInterval(tickerRef.current);
              const allResults = [
                ...pastResults,
                { foundWords: currentFoundWords, pyramidFound: currentPyramidFound },
              ];
              while (allResults.length < grids.length) {
                allResults.push({ foundWords: [], pyramidFound: {} });
              }
              const totalElapsedSecs = Math.floor((Date.now() - sessionStartedAtRef.current) / 1000);
              onAbandon({
                totalScore: allResults.reduce((acc, r) => acc + pyramidScore(r.pyramidFound), 0),
                totalElapsedSecs,
                foundWordsPerGrid: allResults.map((r) => r.foundWords),
                pyramidFoundPerGrid: allResults.map((r) => r.pyramidFound),
              });
            });
          }}
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.1rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
            <span style={{ fontSize: "2rem", fontWeight: 900, color: "white", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {currentScore}
            </span>
            <span style={{ fontSize: "0.75rem", color: "#475569", fontWeight: 500 }}>pts grille</span>
          </div>
          <span style={{ fontSize: "0.65rem", color: "#64748b", fontWeight: 500 }}>
            Total : <span style={{ color: "#cbd5e1", fontVariantNumeric: "tabular-nums" }}>{totalScore}</span>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.1rem", minWidth: "4.5rem" }}>
          <span
            style={{
              fontSize: "1.5rem", fontWeight: 700,
              color: timeRemaining <= 30 ? "#ef4444" : timeRemaining <= 60 ? "#fb923c" : "#fbbf24",
              fontVariantNumeric: "tabular-nums", lineHeight: 1,
            }}
          >
            {fmtTimer(timeRemaining)}
          </span>
          <span style={{ fontSize: "0.6rem", color: "#475569", fontWeight: 500 }}>restant</span>
        </div>
      </div>

      {/* Grille */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
        <div className="relative">
          {grid && (
            <Grid grid={grid} onWordSubmit={handleWordSubmit} disabled={isTransitioning} minLetters={3} />
          )}
          {scoreAnim && (
            <div
              key={scoreAnim.id}
              className="absolute -top-10 left-1/2 -translate-x-1/2 text-green-400 font-black text-2xl animate-floatScore pointer-events-none whitespace-nowrap"
            >
              +{scoreAnim.pts}
            </div>
          )}
        </div>

        {/* Pyramid strip de la grille courante */}
        <div className="flex gap-1.5 w-full">
          {mode.pyramidLengths.map((len) => {
            const word = currentPyramidFound[len];
            const label = len === maxLen ? `${len}+` : `${len}L`;
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
      </div>

      {/* Transition overlay */}
      {isTransitioning && transitionInfo && (
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
            gap: "1rem",
          }}
        >
          <p style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.18em", color: mode.palette.accentSoft, textTransform: "uppercase" }}>
            Grille terminée · +{transitionInfo.gridScore} pts
          </p>
          <p style={{ fontSize: "3.5rem", fontWeight: 900, color: "white", lineHeight: 1 }}>
            Grille {transitionInfo.next}/{grids.length}
          </p>
          <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
            Prête dans un instant…
          </p>
        </div>
      )}

      {/* Avertissement si on est sous 30s — discret en bas */}
      {timeRemaining <= 30 && timeRemaining > 0 && !isTransitioning && (
        <div
          style={{
            position: "absolute",
            bottom: "5rem",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "0.4rem 0.9rem",
            borderRadius: "999px",
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.4)",
            color: "#fca5a5",
            fontSize: "0.75rem",
            fontWeight: 700,
            pointerEvents: "none",
          }}
        >
          ⏱ {timeRemaining}s
        </div>
      )}
    </div>
  );
}
