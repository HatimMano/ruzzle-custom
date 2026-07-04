import { useCallback, useEffect, useRef, useState } from "react";
import PlayingScreen from "./PlayingScreen";
import CountdownScreen from "./CountdownScreen";
import type { Cell, Grid as GridType } from "../lib/gridGenerator";
import { isValidWord } from "../lib/dictionary";
import { scoreForLen } from "../lib/scoring";
import { pyramidSlotForWord, isPyramidComplete, type PyramidMode } from "../lib/dailyModes";
import { useScoreAnimation } from "../hooks/useScoreAnimation";
import { useCountdown } from "../hooks/useCountdown";
import { useTimeReminder } from "../hooks/useTimeReminder";
import { getDailyAbandonMessage } from "../lib/abandonMessages";
import { getDailyDate } from "../lib/url";
import { saveDailySession, clearDailySession } from "../lib/dailySession";
import { playValid, playInvalid, playDuplicate } from "../lib/audio";

type FeedbackType = "valid" | "duplicate" | "invalid" | null;

export interface PyramidResult {
  foundWords: string[];
  pyramidFound: Record<number, string>;
  score: number;
  elapsedSecs: number;
}

interface Props {
  mode: PyramidMode;
  grid: GridType;
  validWords: Set<string>;
  initialFoundWords?: string[];
  initialPyramidFound?: Record<number, string>;
  initialStartedAt?: number;
  onComplete: (result: PyramidResult) => void;
  onAbandon: (result: PyramidResult) => void;
  onRequestConfirm: (message: string, onYes: () => void) => void;
}

export default function PyramidGameScreen({
  mode,
  grid,
  validWords,
  initialFoundWords,
  initialPyramidFound,
  initialStartedAt,
  onComplete,
  onAbandon,
  onRequestConfirm,
}: Props) {
  const isResume = initialStartedAt !== undefined;
  const [foundWords, setFoundWords] = useState<string[]>(initialFoundWords ?? []);
  const [pyramidFound, setPyramidFound] = useState<Record<number, string>>(initialPyramidFound ?? {});
  const [score, setScore] = useState(() =>
    Object.keys(initialPyramidFound ?? {}).reduce((acc, k) => acc + scoreForLen(parseInt(k)), 0),
  );
  const [elapsed, setElapsed] = useState(0);
  const [isDone, setIsDone] = useState(false);

  const { anim: scoreAnim, trigger: triggerScoreAnim } = useScoreAnimation();

  const startedAtRef = useRef<number>(initialStartedAt ?? 0);
  const elapsedIntervalRef = useRef<number>(0);
  const foundWordsRef = useRef<string[]>(foundWords);
  const pyramidFoundRef = useRef<Record<number, string>>(pyramidFound);
  const scoreRef = useRef(score);
  const doneRef = useRef(false);
  foundWordsRef.current = foundWords;
  pyramidFoundRef.current = pyramidFound;
  scoreRef.current = score;

  const buildResult = useCallback((): PyramidResult => ({
    foundWords: foundWordsRef.current,
    pyramidFound: pyramidFoundRef.current,
    score: scoreRef.current,
    elapsedSecs: Math.floor((Date.now() - startedAtRef.current) / 1000),
  }), []);

  // Elapsed timer — démarre quand startedAtRef est set
  const startElapsedTimer = useCallback((startedAt: number) => {
    clearInterval(elapsedIntervalRef.current);
    startedAtRef.current = startedAt;
    const tick = () => {
      const e = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(e);
    };
    tick();
    elapsedIntervalRef.current = window.setInterval(tick, 1000);
  }, []);

  // Reprise de session : démarre le timer immédiatement
  useEffect(() => {
    if (isResume) startElapsedTimer(initialStartedAt);
    return () => clearInterval(elapsedIntervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown 3-2-1-Go (skip si reprise de session)
  const countdown = useCountdown(!isResume, () => {
    const startedAt = Date.now();
    startElapsedTimer(startedAt);
    saveDailySession({
      date: getDailyDate(),
      startedAt,
      foundWords: [],
      pyramidFound: {},
    });
  });

  // Auto-complete quand la pyramide est finie
  useEffect(() => {
    if (isDone) return;
    if (isPyramidComplete(mode, pyramidFound)) {
      doneRef.current = true;
      setIsDone(true);
      clearInterval(elapsedIntervalRef.current);
      clearDailySession(getDailyDate());
      window.setTimeout(() => onComplete(buildResult()), 700);
    }
  }, [pyramidFound, mode, isDone, buildResult, onComplete]);

  // Rappel de temps long (30/60min)
  useTimeReminder({
    active: !isDone && countdown === null,
    elapsedSecs: elapsed,
    onRemind: (message) =>
      onRequestConfirm(message, () => finish(true)),
  });

  const finish = useCallback((abandon: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setIsDone(true);
    clearInterval(elapsedIntervalRef.current);
    clearDailySession(getDailyDate());
    if (abandon) onAbandon(buildResult());
    else onComplete(buildResult());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildResult, onAbandon, onComplete]);

  const handleWordSubmit = useCallback((cells: Cell[]): FeedbackType => {
    if (isDone) return null;
    const word = cells.map((c) => c.letter).join("").toLowerCase();
    if (word.length < 3) return null;

    if (foundWordsRef.current.includes(word)) {
      playDuplicate();
      if ("vibrate" in navigator) navigator.vibrate(80);
      return "duplicate";
    }
    if (!isValidWord(word)) {
      playInvalid();
      if ("vibrate" in navigator) navigator.vibrate([30, 30, 30]);
      return "invalid";
    }

    // Score = score du créneau pyramide rempli (0 si rien à remplir).
    // Un 10L peut remplir un créneau 6L vide.
    const slot = pyramidSlotForWord(mode, word, pyramidFoundRef.current);
    const total = slot !== null ? scoreForLen(slot) : 0;

    setFoundWords((prev) => [...prev, word]);
    if (total > 0) setScore((prev) => prev + total);
    if (slot !== null) setPyramidFound((prev) => ({ ...prev, [slot]: word }));

    // Persist session à chaque mot (refresh-proof)
    const nextFoundWords = [...foundWordsRef.current, word];
    const nextPyramid = slot !== null
      ? { ...pyramidFoundRef.current, [slot]: word }
      : pyramidFoundRef.current;
    saveDailySession({
      date: getDailyDate(),
      startedAt: startedAtRef.current,
      foundWords: nextFoundWords,
      pyramidFound: nextPyramid,
    });

    if (total > 0) triggerScoreAnim(total);
    playValid();
    if ("vibrate" in navigator) navigator.vibrate(40);
    return "valid";
  }, [isDone, mode, triggerScoreAnim]);

  if (countdown !== null) return <CountdownScreen value={countdown} />;

  return (
    <PlayingScreen
      isDailyChallenge={true}
      dailyMode={mode}
      seed={getDailyDate()}
      score={score}
      streak={0}
      streakFlash={null}
      scoreAnim={scoreAnim}
      countdown={null}
      foundWords={foundWords}
      validWords={validWords}
      pyramidFound={pyramidFound}
      grid={grid}
      config={{ minLetters: 3, duration: 0 }}
      elapsed={elapsed}
      timerKey={0}
      timerRunning={false}
      onConfirmAndStop={() =>
        onRequestConfirm(getDailyAbandonMessage(), () => finish(true))
      }
      onNewGame={() => {}}
      onWordSubmit={handleWordSubmit}
      onEndGame={() => finish(true)}
    />
  );
}
