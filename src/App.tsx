import { useCallback, useEffect, useRef, useState } from "react";
import { getDailyAbandonMessage, getFreeAbandonMessage } from "./lib/abandonMessages";
import ResultsScreen from "./components/ResultsScreen";
import DailyResultsScreen from "./components/DailyResultsScreen";
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
  pyramidLevelKey,
  isPyramidComplete,
  pyramidLevelsFound,
  type DailyModeRules,
} from "./lib/dailyModes";
import { scoreForWord } from "./lib/scoring";
import { randomSeed } from "./lib/prng";
import { saveToHistory, getHistory } from "./lib/history";
import type { HistoryEntry } from "./lib/history";
import { getDailyDate, getSeedFromURL, getConfigFromURL, setURLParams, buildShareURL } from "./lib/url";
import { getBestScore, saveBestScore } from "./lib/bestScore";
import { loadDailySession, saveDailySession, clearDailySession } from "./lib/dailySession";
import { useScoreAnimation } from "./hooks/useScoreAnimation";
import { useStreakFlash, streakBonus } from "./hooks/useStreakFlash";
import { useTimeReminder } from "./hooks/useTimeReminder";
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
  const [gameState, setGameState] = useState<GameState>("loading");
  const [seed, setSeed] = useState<string>("");
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);
  const [grid, setGrid] = useState<GridType | null>(null);
  const [validWords, setValidWords] = useState<Set<string>>(new Set());
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const { anim: scoreAnim, trigger: triggerScoreAnim, clear: clearScoreAnim } = useScoreAnimation();
  const { flash: streakFlash, trigger: triggerStreakFlash, clear: clearStreakFlash } = useStreakFlash();

  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showNameModal, setShowNameModal] = useState(false);
  const [displayName, setDisplayNameState] = useState(
    () => localStorage.getItem("griddle:display_name") ?? ""
  );

  // Daily challenge state
  const [isDailyChallenge, setIsDailyChallenge] = useState(false);
  const [dailyMode, setDailyMode] = useState<DailyModeRules>(() => modeForDate(getDailyDate()));
  const [introModalMode, setIntroModalMode] = useState<DailyModeRules | null>(null);
  const [pyramidFound, setPyramidFound] = useState<Record<number, string>>({});
  const [elapsed, setElapsed] = useState(0);

  // Daily already played
  const [dailyPlayedToday] = useState(() => localStorage.getItem('griddle:daily') === getDailyDate())

  const seedRef = useRef<string>("");
  const elapsedIntervalRef = useRef<number>(0);
  const elapsedRef = useRef(0);
  const dailyStartedAtRef = useRef<number>(0);
  const scoreRef = useRef(0);
  const foundWordsRef = useRef<string[]>([]);
  const configRef = useRef<GameConfig>(config);
  const prevConfigRef = useRef<GameConfig>(DEFAULT_CONFIG);
  const isDailyChallengeRef = useRef(false);
  const pyramidFoundRef = useRef<Record<number, string>>({});
  const dailyModeRef = useRef<DailyModeRules>(dailyMode);
  const stopGameRef = useRef<() => void>(() => {});

  scoreRef.current = score;
  foundWordsRef.current = foundWords;
  configRef.current = config;
  isDailyChallengeRef.current = isDailyChallenge;
  pyramidFoundRef.current = pyramidFound;
  dailyModeRef.current = dailyMode;
  seedRef.current = seed;

  function saveDisplayName(name: string) {
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) return;
    localStorage.setItem("griddle:display_name", trimmed);
    setDisplayNameState(trimmed);
    setDisplayName(trimmed).catch(console.error);
    setShowNameModal(false);
  }

  useEffect(() => {
    loadDictionary().then(() => {
      ensureAuth()
        .then(() => {
          if (!localStorage.getItem("griddle:display_name"))
            setShowNameModal(true);
        })
        .catch(console.error);
      setHistory(getHistory());

      // Reprise d'un défi du jour en cours (refresh / fermeture-onglet)
      const dailyDate = getDailyDate();
      const session = loadDailySession(dailyDate);
      const trie = getTrie();
      if (session && trie) {
        const mode = modeForDate(dailyDate);
        const { grid: g, validWords: vw } = mode.generate(dailyDate, trie);
        setSeed(dailyDate);
        setConfig({ minLetters: 3, duration: 0 });
        setDailyMode(mode);
        setIsDailyChallenge(true);
        setGrid(g);
        setValidWords(vw);
        setFoundWords(session.foundWords);
        setPyramidFound(session.pyramidFound);
        const restoredScore = Object.values(session.pyramidFound).reduce(
          (acc, w) => acc + scoreForWord(w),
          0
        );
        setScore(restoredScore);
        setStreak(0);
        setTimerRunning(false);
        setCountdown(null);
        setGameState("playing");
        startElapsedTimer(session.startedAt);
        return;
      }

      const s = getSeedFromURL() || randomSeed();
      const cfg = getConfigFromURL();
      setConfig(cfg);
      initGame(s, cfg);
    });
  }, []);

  const startElapsedTimer = (startedAt: number) => {
    clearInterval(elapsedIntervalRef.current);
    dailyStartedAtRef.current = startedAt;
    const tick = () => {
      const e = Math.floor((Date.now() - startedAt) / 1000);
      elapsedRef.current = e;
      setElapsed(e);
    };
    tick();
    elapsedIntervalRef.current = window.setInterval(tick, 1000);
  };

  // Countdown + start stopwatch for daily
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      setGameState("playing");
      if (isDailyChallengeRef.current) {
        const startedAt = Date.now();
        startElapsedTimer(startedAt);
        // Persiste la session dès le démarrage : refresh = reprise au même chrono
        saveDailySession({
          date: getDailyDate(),
          startedAt,
          foundWords: [],
          pyramidFound: {},
        });
      } else if (configRef.current.duration > 0) {
        setTimerRunning(true);
      }
      playGo();
      return;
    }
    playCountdown();
    const t = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Submit result to Supabase when game finishes
  useEffect(() => {
    if (gameState !== "finished") return;
    if (isDailyChallengeRef.current) {
      const pf = pyramidFoundRef.current;
      const mode = dailyModeRef.current;
      localStorage.setItem('griddle:daily', getDailyDate())
      clearDailySession(getDailyDate())
      submitDailyResult({
        date: getDailyDate(),
        mode: mode.id,
        elapsedSecs: elapsedRef.current,
        completed: isPyramidComplete(mode, pf),
        levelsFound: pyramidLevelsFound(mode, pf),
        score: scoreRef.current,
        foundWords: foundWordsRef.current,
        pyramidFound: pf,
      }).catch(console.error);
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

  // Auto-complete daily challenge when all pyramid levels found
  useEffect(() => {
    if (!isDailyChallenge || gameState !== "playing") return;
    if (isPyramidComplete(dailyMode, pyramidFound)) {
      clearInterval(elapsedIntervalRef.current);
      window.setTimeout(() => {
        setGameState("finished");
      }, 700);
    }
  }, [pyramidFound, isDailyChallenge, gameState, dailyMode]);

  useTimeReminder({
    active: isDailyChallenge && gameState === "playing",
    elapsedSecs: elapsed,
    onRemind: (message) => setConfirmModal({ message, onConfirm: stopGameRef.current }),
  });

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

  const requestStartDaily = () => {
    const mode = modeForDate(getDailyDate());
    if (mode.intro && !localStorage.getItem(`griddle:intro_seen:${mode.id}`)) {
      setIntroModalMode(mode);
      return;
    }
    startDailyChallenge();
  };

  const closeIntroAndStart = () => {
    if (introModalMode) {
      localStorage.setItem(`griddle:intro_seen:${introModalMode.id}`, '1');
    }
    setIntroModalMode(null);
    startDailyChallenge();
  };

  const startDailyChallenge = () => {
    prevConfigRef.current = configRef.current;
    clearInterval(elapsedIntervalRef.current);
    elapsedRef.current = 0;
    setElapsed(0);
    setPyramidFound({});
    setIsDailyChallenge(true);
    const dailyDate = getDailyDate();
    const mode = modeForDate(dailyDate);
    setDailyMode(mode);
    const trie = getTrie();
    if (!trie) return;
    const { grid: g, validWords: vw } = mode.generate(dailyDate, trie);
    setGrid(g);
    setValidWords(vw);
    setFoundWords([]);
    setScore(0);
    setStreak(0);
    clearStreakFlash();
    clearScoreAnim();
    setTimerRunning(false);
    setTimerKey((k) => k + 1);
    setSeed(dailyDate);
    setConfig({ minLetters: 3, duration: 0 });
    setGameState("ready");
    setCountdown(3);
  };

  const finishGame = useCallback(
    (finalScore: number, finalWords: string[]) => {
      clearInterval(elapsedIntervalRef.current);
      setTimerRunning(false);
      setGameState("finished");
      const newBest = saveBestScore(seed, finalScore);
      setIsNewBest(newBest);
      setBestScore(getBestScore(seed));
      const entry: HistoryEntry = {
        seed,
        score: finalScore,
        words: finalWords,
        possible: 0,
        date: new Date().toISOString(),
      };
      saveToHistory(entry);
      setHistory(getHistory());
    },
    [seed]
  );

  const endGame = useCallback(() => {
    finishGame(scoreRef.current, foundWordsRef.current);
  }, [finishGame]);

  const confirmAndStop = () => {
    const msg = isDailyChallengeRef.current ? getDailyAbandonMessage() : getFreeAbandonMessage()
    setConfirmModal({ message: msg, onConfirm: stopGame })
  }

  const stopGame: () => void = () => {
    clearInterval(elapsedIntervalRef.current);
    setTimerRunning(false);
    setGameState("finished");
    const newBest = saveBestScore(seed, score);
    setIsNewBest(newBest);
    setBestScore(getBestScore(seed));
    saveToHistory({
      seed,
      score,
      words: foundWords,
      possible: validWords.size,
      date: new Date().toISOString(),
    });
    setHistory(getHistory());
  };
  stopGameRef.current = stopGame;

  const newGame = () => {
    if (gameState === "playing" && !confirm("Abandonner la partie en cours ?"))
      return;
    clearInterval(elapsedIntervalRef.current);
    setIsDailyChallenge(false);
    initGame(randomSeed(), prevConfigRef.current);
  };

  const replayGame = () => {
    clearInterval(elapsedIntervalRef.current);
    initGame(seed, config);
  };

  const handleWordSubmit = useCallback(
    (cells: Cell[]): FeedbackType => {
      const word = cells
        .map((c) => c.letter)
        .join("")
        .toLowerCase();
      const minLetters = isDailyChallengeRef.current
        ? 3
        : configRef.current.minLetters;

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

      const pts = scoreForWord(word);

      const dailyLevelKey = isDailyChallengeRef.current
        ? pyramidLevelKey(dailyModeRef.current, word)
        : null;
      const levelAlreadyFilled = dailyLevelKey !== null && !!pyramidFoundRef.current[dailyLevelKey];

      let bonus = 0;
      let newStreak = streak;
      let total: number;

      if (isDailyChallengeRef.current) {
        // Défi du jour : pas de bonus de série, points seulement si niveau pyramide nouveau
        total = levelAlreadyFilled ? 0 : pts;
      } else {
        newStreak = streak + 1;
        bonus = streakBonus(newStreak);
        total = pts + bonus;
        setStreak(newStreak);
      }

      setFoundWords((prev) => [...prev, word]);
      if (total > 0) setScore((prev) => prev + total);

      // Daily challenge: track pyramid levels
      if (dailyLevelKey !== null && !pyramidFoundRef.current[dailyLevelKey]) {
        setPyramidFound((prev) => ({ ...prev, [dailyLevelKey]: word }));
      }

      // Persiste la session daily à chaque mot trouvé (refresh-proof)
      if (isDailyChallengeRef.current) {
        const nextFoundWords = [...foundWordsRef.current, word];
        const nextPyramid =
          dailyLevelKey !== null && !pyramidFoundRef.current[dailyLevelKey]
            ? { ...pyramidFoundRef.current, [dailyLevelKey]: word }
            : pyramidFoundRef.current;
        saveDailySession({
          date: getDailyDate(),
          startedAt: dailyStartedAtRef.current,
          foundWords: nextFoundWords,
          pyramidFound: nextPyramid,
        });
      }

      if (total > 0) triggerScoreAnim(total);

      if (bonus > 0) {
        triggerStreakFlash(newStreak, bonus);
      } else {
        playValid();
      }
      if ("vibrate" in navigator) navigator.vibrate(40);

      return "valid";
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [foundWords, streak]
  );

  const copyLink = () => {
    navigator.clipboard.writeText(buildShareURL(seed, config));
  };

  // === LOADING ===
  if (gameState === "loading") {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-900">
        <div className="text-slate-400 text-lg animate-pulse">
          Chargement du dictionnaire…
        </div>
      </div>
    );
  }

  // === FINISHED (daily) ===
  if (gameState === "finished" && isDailyChallenge) {
    return (
      <DailyResultsScreen
        date={getDailyDate()}
        mode={dailyMode}
        elapsedSeconds={elapsedRef.current}
        pyramidFound={pyramidFound}
        foundWords={foundWords}
        validWords={validWords}
        grid={grid!}
        onBack={() => {
          setIsDailyChallenge(false);
          initGame(randomSeed(), prevConfigRef.current);
        }}
      />
    );
  }

  // === FINISHED (normal) ===
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


  // === READY ===
  if (gameState === "ready") {
    return (
      <>
        <HomeScreen
          date={getDailyDate()}
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
          onSelectHistoryEntry={(seed) => initGame(seed, configRef.current)}
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

  // === PLAYING ===
  return (
    <>
      <PlayingScreen
        isDailyChallenge={isDailyChallenge}
        dailyMode={dailyMode}
        seed={seed}
        score={score}
        streak={streak}
        streakFlash={streakFlash}
        scoreAnim={scoreAnim}
        countdown={countdown}
        foundWords={foundWords}
        validWords={validWords}
        pyramidFound={pyramidFound}
        grid={grid}
        config={config}
        elapsed={elapsed}
        timerKey={timerKey}
        timerRunning={timerRunning}
        onConfirmAndStop={confirmAndStop}
        onNewGame={newGame}
        onWordSubmit={handleWordSubmit}
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
