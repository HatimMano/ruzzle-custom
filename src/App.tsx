import { useCallback, useEffect, useRef, useState } from "react";
import { getFreeAbandonMessage } from "./lib/abandonMessages";
import ResultsScreen from "./components/ResultsScreen";
import DailyIntroModal from "./components/DailyIntroModal";
import HomeScreen from "./components/HomeScreen";
import PlayingScreen from "./components/PlayingScreen";
import ConfirmModal from "./components/ConfirmModal";
import { PseudoModal } from "./components/PseudoModal";
import { loadDictionary, isValidWord, getTrie } from "./lib/dictionary";
import { generateGrid } from "./lib/gridGenerator";
import type { Cell, Grid as GridType } from "./lib/gridGenerator";
import {
  modeForDate,
  isPyramidMode,
  type DailyMode,
} from "./lib/dailyModes";
import { getAdapter } from "./lib/modes/registry";
import { scoreForWord } from "./lib/scoring";
import { randomSeed } from "./lib/prng";
import { saveToHistory, getHistory } from "./lib/history";
import type { HistoryEntry } from "./lib/history";
import { getDailyDate, getSeedFromURL, getConfigFromURL, setURLParams, buildShareURL, getModeOverride } from "./lib/url";
import { getBestScore, saveBestScore } from "./lib/bestScore";
import { loadDailySession } from "./lib/dailySession";
import { useScoreAnimation } from "./hooks/useScoreAnimation";
import { useStreakFlash, streakBonus } from "./hooks/useStreakFlash";
import {
  playValid,
  playInvalid,
  playDuplicate,
  playCountdown,
  playGo,
} from "./lib/audio";
import {
  ensureAuth,
  submitDailyResult,
  submitGameResult,
  setDisplayName,
} from "./lib/api";

interface GameConfig {
  minLetters: 3 | 4 | 5 | 6 | 7;
  duration: 30 | 60 | 120 | 0;
}

const DEFAULT_CONFIG: GameConfig = { minLetters: 5, duration: 60 };

type GameState = "loading" | "ready" | "playing" | "finished";
type FeedbackType = "valid" | "duplicate" | "invalid" | null;

export default function App() {
  // === Common ===
  const [gameState, setGameState] = useState<GameState>("loading");
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [displayName, setDisplayNameState] = useState(
    () => localStorage.getItem("griddle:display_name") ?? "",
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // === Free game state ===
  const [seed, setSeed] = useState<string>("");
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);
  const [grid, setGrid] = useState<GridType | null>(null);
  const [validWords, setValidWords] = useState<Set<string>>(new Set());
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const { anim: scoreAnim, trigger: triggerScoreAnim, clear: clearScoreAnim } = useScoreAnimation();
  const { flash: streakFlash, trigger: triggerStreakFlash, clear: clearStreakFlash } = useStreakFlash();

  // === Daily state ===
  const [isDailyChallenge, setIsDailyChallenge] = useState(false);
  const [dailyMode, setDailyMode] = useState<DailyMode>(() => modeForDate(getDailyDate(), getModeOverride()));
  const [introModalMode, setIntroModalMode] = useState<DailyMode | null>(null);
  // State et Result du mode courant : opaques (dépendent de l'adapter).
  const [modeState, setModeState] = useState<unknown>(null);
  const [modeResult, setModeResult] = useState<unknown>(null);
  const [dailyPlayedToday] = useState(() => localStorage.getItem('griddle:daily') === getDailyDate());

  // Refs pour lire depuis useEffect / callbacks sans dépendances circulaires
  const seedRef = useRef<string>("");
  const scoreRef = useRef(0);
  const foundWordsRef = useRef<string[]>([]);
  const configRef = useRef<GameConfig>(config);
  const prevConfigRef = useRef<GameConfig>(DEFAULT_CONFIG);
  const dailyModeRef = useRef<DailyMode>(dailyMode);
  const isDailyChallengeRef = useRef(false);
  const modeResultRef = useRef<unknown>(null);
  scoreRef.current = score;
  foundWordsRef.current = foundWords;
  configRef.current = config;
  seedRef.current = seed;
  dailyModeRef.current = dailyMode;
  isDailyChallengeRef.current = isDailyChallenge;
  modeResultRef.current = modeResult;

  const saveDisplayName = (name: string) => {
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) return;
    localStorage.setItem("griddle:display_name", trimmed);
    setDisplayNameState(trimmed);
    setDisplayName(trimmed).catch(console.error);
    setShowNameModal(false);
  };

  // === Boot : load dict + resume pyramide session ===
  useEffect(() => {
    loadDictionary().then(() => {
      ensureAuth()
        .then(() => {
          if (!localStorage.getItem("griddle:display_name")) setShowNameModal(true);
        })
        .catch(console.error);
      setHistory(getHistory());

      // Reprise d'un défi pyramide en cours (refresh / fermeture-onglet).
      // Les autres modes (Triddle/Ruddle/Speedle) ne supportent pas la reprise.
      const dailyDate = getDailyDate();
      const trie = getTrie();
      const mode = modeForDate(dailyDate, getModeOverride());
      if (trie && isPyramidMode(mode) && loadDailySession(dailyDate)) {
        const state = getAdapter(mode).init(mode, dailyDate, trie);
        setDailyMode(mode);
        setIsDailyChallenge(true);
        setModeState(state);
        setModeResult(null);
        setGameState("playing");
        return;
      }

      const s = getSeedFromURL() || randomSeed();
      const cfg = getConfigFromURL();
      setConfig(cfg);
      initGame(s, cfg);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === Free game countdown 3-2-1-Go ===
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      setGameState("playing");
      if (configRef.current.duration > 0) setTimerRunning(true);
      playGo();
      return;
    }
    playCountdown();
    const t = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // === Submit to Supabase quand une partie se termine ===
  useEffect(() => {
    if (gameState !== "finished") return;
    if (isDailyChallengeRef.current) {
      const result = modeResultRef.current;
      if (result === null) return;
      localStorage.setItem('griddle:daily', getDailyDate());
      const adapter = getAdapter(dailyModeRef.current);
      const payload = adapter.buildSubmitPayload(result, dailyModeRef.current, getDailyDate());
      if (payload) submitDailyResult(payload).catch(console.error);
    } else {
      submitGameResult({
        seed: seedRef.current,
        score: scoreRef.current,
        foundWords: foundWordsRef.current,
        minLetters: configRef.current.minLetters,
        durationSecs: configRef.current.duration,
      }).catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // === Free game ===
  const initGame = (s: string, cfg: GameConfig = config) => {
    const trie = getTrie();
    if (!trie) return;
    setURLParams(s, cfg);
    setSeed(s);
    setConfig(cfg);
    setBestScore(getBestScore(s));
    setIsNewBest(false);
    const { grid: g, validWords: vw } = generateGrid(s, trie, cfg.minLetters);
    setGrid(g);
    setValidWords(vw);
    setFoundWords([]);
    setScore(0);
    setStreak(0);
    clearStreakFlash();
    clearScoreAnim();
    setTimerRunning(false);
    setTimerKey((k) => k + 1);
    setCountdown(null);
    setGameState("ready");
  };

  const startGame = () => setCountdown(3);

  // === Daily orchestration ===
  const requestStartDaily = () => {
    const mode = modeForDate(getDailyDate(), getModeOverride());
    if (mode.intro && !localStorage.getItem(`griddle:intro_seen:${mode.id}`)) {
      setIntroModalMode(mode);
      return;
    }
    startDailyChallenge();
  };

  const closeIntroAndStart = () => {
    if (introModalMode) localStorage.setItem(`griddle:intro_seen:${introModalMode.id}`, '1');
    setIntroModalMode(null);
    startDailyChallenge();
  };

  const startDailyChallenge = () => {
    prevConfigRef.current = configRef.current;
    const dailyDate = getDailyDate();
    const mode = modeForDate(dailyDate, getModeOverride());
    const trie = getTrie();
    if (!trie) return;
    setDailyMode(mode);
    setIsDailyChallenge(true);
    const state = getAdapter(mode).init(mode, dailyDate, trie);
    setModeState(state);
    setModeResult(null);
    setGameState("playing");
  };

  const exitDaily = () => {
    setIsDailyChallenge(false);
    setModeState(null);
    setModeResult(null);
    initGame(randomSeed(), prevConfigRef.current);
  };

  const handleDailyComplete = (result: unknown) => {
    setModeResult(result);
    setGameState("finished");
  };

  // === Free word submit (streak scoring classique) ===
  const handleFreeWordSubmit = useCallback((cells: Cell[]): FeedbackType => {
    const word = cells.map((c) => c.letter).join("").toLowerCase();
    const minLetters = configRef.current.minLetters;

    if (foundWords.includes(word)) {
      playDuplicate();
      if ("vibrate" in navigator) navigator.vibrate(80);
      setStreak(0);
      return "duplicate";
    }
    if (!isValidWord(word) || word.length < minLetters) {
      playInvalid();
      if ("vibrate" in navigator) navigator.vibrate([30, 30, 30]);
      setStreak(0);
      return "invalid";
    }

    const newStreak = streak + 1;
    const bonus = streakBonus(newStreak);
    const total = scoreForWord(word) + bonus;
    setStreak(newStreak);
    setFoundWords((prev) => [...prev, word]);
    setScore((prev) => prev + total);
    if (total > 0) triggerScoreAnim(total);
    if (bonus > 0) triggerStreakFlash(newStreak, bonus);
    else playValid();
    if ("vibrate" in navigator) navigator.vibrate(40);
    return "valid";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foundWords, streak]);

  const finishFreeGame = useCallback((finalScore: number, finalWords: string[]) => {
    setTimerRunning(false);
    setGameState("finished");
    const newBest = saveBestScore(seed, finalScore);
    setIsNewBest(newBest);
    setBestScore(getBestScore(seed));
    saveToHistory({ seed, score: finalScore, words: finalWords, possible: 0, date: new Date().toISOString() });
    setHistory(getHistory());
  }, [seed]);

  const endGame = useCallback(() => finishFreeGame(scoreRef.current, foundWordsRef.current), [finishFreeGame]);

  const stopFreeGame = () => {
    setTimerRunning(false);
    setGameState("finished");
    const newBest = saveBestScore(seed, score);
    setIsNewBest(newBest);
    setBestScore(getBestScore(seed));
    saveToHistory({ seed, score, words: foundWords, possible: validWords.size, date: new Date().toISOString() });
    setHistory(getHistory());
  };

  const confirmAndStopFree = () =>
    setConfirmModal({ message: getFreeAbandonMessage(), onConfirm: stopFreeGame });

  const newGame = () => {
    if (gameState === "playing" && !confirm("Abandonner la partie en cours ?")) return;
    setIsDailyChallenge(false);
    initGame(randomSeed(), prevConfigRef.current);
  };

  const replayGame = () => initGame(seed, config);
  const copyLink = () => navigator.clipboard.writeText(buildShareURL(seed, config));

  // === Renders ===

  if (gameState === "loading") {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-900">
        <div className="text-slate-400 text-lg animate-pulse">
          Chargement du dictionnaire…
        </div>
      </div>
    );
  }

  // Daily : le mode Adapter fournit GameScreen (playing) et ResultsScreen (finished).
  if (isDailyChallenge && modeState !== null) {
    const adapter = getAdapter(dailyMode);
    if (gameState === "playing") {
      const GameScreen = adapter.GameScreen;
      return (
        <>
          <GameScreen
            state={modeState}
            mode={dailyMode}
            onComplete={handleDailyComplete}
            onAbandon={handleDailyComplete}
            onRequestConfirm={(msg, onYes) => setConfirmModal({ message: msg, onConfirm: onYes })}
          />
          {confirmModal && (
            <ConfirmModal
              message={confirmModal.message}
              onConfirm={() => { const fn = confirmModal.onConfirm; setConfirmModal(null); fn(); }}
              onCancel={() => setConfirmModal(null)}
            />
          )}
        </>
      );
    }
    if (gameState === "finished" && modeResult !== null) {
      const ResultsScreenComponent = adapter.ResultsScreen;
      return (
        <ResultsScreenComponent
          state={modeState}
          mode={dailyMode}
          date={getDailyDate()}
          result={modeResult}
          onBack={exitDaily}
        />
      );
    }
  }

  // Free game finished
  if (gameState === "finished" && grid) {
    return (
      <ResultsScreen
        seed={seed}
        score={score}
        foundWords={foundWords}
        validWords={validWords}
        grid={grid}
        timerDuration={config.duration}
        minLetters={config.minLetters}
        isNewBest={isNewBest}
        bestScore={bestScore}
        onReplay={replayGame}
        onNewGame={newGame}
        onCopyLink={copyLink}
      />
    );
  }

  // Home screen
  if (gameState === "ready") {
    return (
      <>
        <HomeScreen
          date={getDailyDate()}
          todayMode={modeForDate(getDailyDate(), getModeOverride())}
          countdown={countdown}
          config={config}
          setConfig={setConfig}
          displayName={displayName}
          dailyPlayedToday={dailyPlayedToday}
          history={history}
          onOpenName={() => setShowNameModal(true)}
          onRequestStartDaily={requestStartDaily}
          onStartFreeGame={startGame}
          onClearHistory={() => setHistory([])}
          onSelectHistoryEntry={(s) => initGame(s, configRef.current)}
        />
        <PseudoModal
          isOpen={showNameModal}
          currentUsername={displayName}
          isFirstVisit={!displayName}
          onSave={saveDisplayName}
          onCancel={() => setShowNameModal(false)}
        />
        {introModalMode && (
          <DailyIntroModal mode={introModalMode} onClose={closeIntroAndStart} />
        )}
      </>
    );
  }

  // Free game playing
  return (
    <>
      <PlayingScreen
        isDailyChallenge={false}
        seed={seed}
        score={score}
        streak={streak}
        streakFlash={streakFlash}
        scoreAnim={scoreAnim}
        countdown={countdown}
        foundWords={foundWords}
        validWords={validWords}
        pyramidFound={{}}
        grid={grid}
        config={config}
        elapsed={0}
        timerKey={timerKey}
        timerRunning={timerRunning}
        onConfirmAndStop={confirmAndStopFree}
        onNewGame={newGame}
        onWordSubmit={handleFreeWordSubmit}
        onEndGame={endGame}
      />
      {confirmModal && (
        <ConfirmModal
          message={confirmModal.message}
          onConfirm={() => { const fn = confirmModal.onConfirm; setConfirmModal(null); fn(); }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </>
  );
}
