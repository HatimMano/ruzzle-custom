import { useCallback, useEffect, useRef, useState } from "react";
import { User, History, Play, RefreshCw, Trophy, X } from "lucide-react";
import { getDailyAbandonMessage, getFreeAbandonMessage } from "./lib/abandonMessages";
import Grid from "./components/Grid";
import Timer from "./components/Timer";
import ResultsScreen from "./components/ResultsScreen";
import DailyResultsScreen from "./components/DailyResultsScreen";
import DailyIntroModal from "./components/DailyIntroModal";
import { PseudoModal } from "./components/PseudoModal";
import { loadDictionary, isValidWord, getTrie } from "./lib/dictionary";
import { generateGrid, findWordPath } from "./lib/gridGenerator";
import type { Cell, Grid as GridType } from "./lib/gridGenerator";
import {
  modeForDate,
  pyramidLevelKey,
  isPyramidComplete,
  pyramidLevelsFound,
  levelLabel,
  pyramidRows,
  type DailyModeRules,
} from "./lib/dailyModes";
import { scoreForWord } from "./lib/scoring";
import { randomSeed } from "./lib/prng";
import { saveToHistory, getHistory, clearHistory } from "./lib/history";
import type { HistoryEntry } from "./lib/history";
import {
  playValid,
  playInvalid,
  playDuplicate,
  playStreak,
  playCountdown,
  playGo,
} from "./lib/audio";
import {
  ensureAuth,
  submitDailyResult,
  submitGameResult,
  setDisplayName,
  fetchDailyLeaderboard,
  fetchLongestWords,
  fetchStreakLeaderboard,
} from "./lib/api";
import type { LeaderboardEntry, LongestWordEntry, StreakEntry } from "./lib/api";

interface GameConfig {
  minLetters: 3 | 4 | 5 | 6 | 7;
  duration: 30 | 60 | 120 | 0;
}

const DEFAULT_CONFIG: GameConfig = { minLetters: 5, duration: 60 };

const STREAK_BONUSES: [number, number][] = [
  [7, 5],
  [5, 3],
  [3, 1],
];
function streakBonus(streak: number): number {
  for (const [threshold, bonus] of STREAK_BONUSES) {
    if (streak >= threshold) return bonus;
  }
  return 0;
}

type GameState = "loading" | "ready" | "playing" | "finished";
type FeedbackType = "valid" | "duplicate" | "invalid" | null;

function getDailyDate(): string {
  const param = new URLSearchParams(window.location.search).get("daily");
  if (param) return param;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtStopwatch(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getSeedFromURL(): string | null {
  return new URLSearchParams(window.location.search).get("seed");
}

function getConfigFromURL(): GameConfig {
  const params = new URLSearchParams(window.location.search);
  const min = parseInt(params.get("min") || "5");
  const dur = parseInt(params.get("dur") || "60");
  return {
    minLetters: ([3, 4, 5, 6, 7].includes(min)
      ? min
      : 5) as GameConfig["minLetters"],
    duration: ([30, 60, 120, 0].includes(dur)
      ? dur
      : 60) as GameConfig["duration"],
  };
}

function setURLParams(seed: string, config: GameConfig) {
  const url = new URL(window.location.href);
  url.searchParams.set("seed", seed);
  url.searchParams.set("min", String(config.minLetters));
  url.searchParams.set("dur", String(config.duration));
  window.history.replaceState({}, "", url);
}

function getBestScore(seed: string): number | null {
  const raw = localStorage.getItem(`ruzzle:best:${seed}`);
  return raw ? parseInt(raw) : null;
}

function saveBestScore(seed: string, score: number): boolean {
  const prev = getBestScore(seed);
  if (prev === null || score > prev) {
    localStorage.setItem(`ruzzle:best:${seed}`, String(score));
    return true;
  }
  return false;
}

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
  const [streakFlash, setStreakFlash] = useState<string | null>(null);
  const [scoreAnim, setScoreAnim] = useState<{
    pts: number;
    id: number;
  } | null>(null);

  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [showHistory, setShowHistory] = useState(false);
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

  // Leaderboard drawer
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<'classement' | 'records' | 'streaks'>('classement')
  const [longestWords, setLongestWords] = useState<LongestWordEntry[]>([])
  const [longestWordsLoading, setLongestWordsLoading] = useState(false)
  const [recordsDiscovery, setRecordsDiscovery] = useState<LongestWordEntry | null>(null)
  const [streaks, setStreaks] = useState<StreakEntry[]>([])
  const [streaksLoading, setStreaksLoading] = useState(false)

  const seedRef = useRef<string>("");
  const streakTimer = useRef<number>(0);
  const scoreAnimTimer = useRef<number>(0);
  const elapsedIntervalRef = useRef<number>(0);
  const elapsedRef = useRef(0);
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
      const s = getSeedFromURL() || randomSeed();
      const cfg = getConfigFromURL();
      setConfig(cfg);
      initGame(s, cfg);
    });
  }, []);

  // Countdown + start stopwatch for daily
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      setGameState("playing");
      if (isDailyChallengeRef.current) {
        elapsedRef.current = 0;
        setElapsed(0);
        elapsedIntervalRef.current = window.setInterval(() => {
          elapsedRef.current += 1;
          setElapsed(elapsedRef.current);
        }, 1000);
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

  // Rappel de temps : à 10min, puis tous les 5min, propose au joueur d'arrêter
  // (le défi est censé être rapide, certains joueurs restent 30min)
  const lastReminderAtRef = useRef(0);
  useEffect(() => {
    if (!isDailyChallenge || gameState !== "playing") return;
    if (elapsed < 600) return;
    if ((elapsed - 600) % 300 !== 0) return;
    if (lastReminderAtRef.current === elapsed) return;
    lastReminderAtRef.current = elapsed;
    const minutes = Math.floor(elapsed / 60);
    const message = elapsed === 600
      ? `Ça fait déjà ${minutes} min... ça commence à faire long. Continuer ?`
      : `Toujours là ? ${minutes} min au compteur. Continuer ?`;
    setConfirmModal({ message, onConfirm: stopGameRef.current });
  }, [elapsed, isDailyChallenge, gameState]);

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
    setStreakFlash(null);
    setScoreAnim(null);
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
    setStreakFlash(null);
    setScoreAnim(null);
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

      if (total > 0) {
        clearTimeout(scoreAnimTimer.current);
        setScoreAnim({ pts: total, id: Date.now() });
        scoreAnimTimer.current = window.setTimeout(() => setScoreAnim(null), 700);
      }

      if (bonus > 0) {
        playStreak();
        clearTimeout(streakTimer.current);
        setStreakFlash(`🔥 Série ×${newStreak} ! +${bonus}pts bonus`);
        streakTimer.current = window.setTimeout(
          () => setStreakFlash(null),
          1500
        );
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
    const url = new URL(window.location.href);
    url.searchParams.set("seed", seed);
    url.searchParams.set("min", String(config.minLetters));
    url.searchParams.set("dur", String(config.duration));
    navigator.clipboard.writeText(url.toString());
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

  const HistoryDrawer = () => (
    <div
      className="absolute inset-0 bg-slate-900/80 z-10 flex items-end"
      onClick={() => setShowHistory(false)}
    >
      <div
        className="w-full bg-slate-900 border-t border-slate-700 rounded-t-3xl p-4 max-h-[70vh] flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-1" />
        <div className="flex justify-between items-center">
          <span className="font-bold text-white text-base">Historique</span>
          {history.length > 0 && (
            <button
              onClick={() => {
                clearHistory();
                setHistory([]);
              }}
              className="text-xs text-red-400 py-1 px-2"
            >
              Effacer tout
            </button>
          )}
        </div>
        <div className="overflow-y-auto flex flex-col gap-2">
          {history.length === 0 && (
            <p className="text-slate-600 text-sm text-center py-6">
              Aucune partie jouée
            </p>
          )}
          {history.map((entry, i) => (
            <button
              key={i}
              onClick={() => {
                setShowHistory(false);
                initGame(entry.seed, configRef.current);
              }}
              className="flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-800 active:bg-slate-700 text-left w-full transition-colors"
            >
              <div>
                <p className="font-mono text-slate-300 text-sm">{entry.seed}</p>
                <p className="text-slate-600 text-xs mt-0.5">
                  {new Date(entry.date).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="text-right">
                <p className="font-black text-yellow-400 text-lg">
                  {entry.score}
                  <span className="text-xs text-yellow-600 font-normal">
                    {" "}
                    pts
                  </span>
                </p>
                <p className="text-slate-600 text-xs">
                  {entry.words.length} mots · Rejouer →
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
  function fmtTime(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
  }

  const LeaderboardDrawer = () => {
    const trie = getTrie()
    const recordGrid = recordsDiscovery && trie
      ? (recordsDiscovery.is_daily
          ? modeForDate(recordsDiscovery.seed).generate(recordsDiscovery.seed, trie).grid
          : generateGrid(recordsDiscovery.seed, trie).grid)
      : null
    const recordPath = recordGrid && recordsDiscovery
      ? findWordPath(recordGrid, recordsDiscovery.word)
      : null

    return (
      <div
        className="absolute inset-0 bg-slate-900/80 z-10 flex items-end"
        onClick={() => { setShowLeaderboard(false); setRecordsDiscovery(null) }}
      >
        <div
          className="w-full bg-slate-900 border-t border-slate-700 rounded-t-3xl p-4 max-h-[80vh] flex flex-col gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-1" />

          {/* Tabs */}
          <div style={{ display: "flex", background: "rgba(30,41,59,0.9)", borderRadius: "999px", padding: "0.25rem", gap: "0.25rem" }}>
            {([['classement', '🏆 Jour'], ['records', '⭐ Records'], ['streaks', '🔥 Séries']] as const).map(([id, label]) => (
              <button key={id} onClick={() => {
                setLeaderboardTab(id); setRecordsDiscovery(null)
                if (id === 'records' && longestWords.length === 0) { setLongestWordsLoading(true); fetchLongestWords().then(setLongestWords).finally(() => setLongestWordsLoading(false)) }
                if (id === 'streaks' && streaks.length === 0) { setStreaksLoading(true); fetchStreakLeaderboard().then(setStreaks).finally(() => setStreaksLoading(false)) }
              }}
                style={{ flex: 1, padding: "0.5rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", border: "none", background: leaderboardTab === id ? "white" : "transparent", color: leaderboardTab === id ? "#0f172a" : "#64748b", transition: "all 0.15s" }}>
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto flex flex-col gap-2">
            {/* Classement tab */}
            {leaderboardTab === 'classement' && (<>
              {leaderboardLoading && <p className="text-slate-600 text-sm text-center py-6">Chargement…</p>}
              {!leaderboardLoading && leaderboard.length === 0 && <p className="text-slate-600 text-sm text-center py-6">Aucun résultat pour aujourd'hui</p>}
              {!leaderboardLoading && leaderboard.map((entry) => {
                const displayScore = entry.score + Math.max(0, 4 - entry.rank)
                return (
                  <div key={entry.rank} style={{ display: "flex", alignItems: "center", padding: "0.75rem 1rem", borderRadius: "0.875rem", background: entry.is_me ? "rgba(217,119,6,0.1)" : "rgba(30,41,59,0.8)", border: entry.is_me ? "1px solid rgba(217,119,6,0.3)" : "1px solid rgba(71,85,105,0.25)", gap: "0.5rem" }}>
                    <span style={{ width: "2rem", fontSize: "1.1rem", flexShrink: 0 }}>{RANK_MEDAL[entry.rank] ?? entry.rank}</span>
                    <span style={{ flex: 1, fontWeight: 500, color: entry.is_me ? "#fbbf24" : "white", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.display_name ?? `Joueur #${entry.rank}`}
                      {entry.is_me && <span style={{ marginLeft: "0.4rem", fontSize: "0.7rem", color: "rgba(251,191,36,0.5)" }}>· moi</span>}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem", flexShrink: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
                        <p style={{ fontWeight: 600, color: entry.is_me ? "#fbbf24" : "white", fontSize: "0.9rem" }}>{displayScore} pts</p>
                        {entry.rank <= 3 && <span style={{ fontSize: "0.6rem", color: "#475569" }}>+{4 - entry.rank}</span>}
                      </div>
                      <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{fmtTime(entry.elapsed_secs)}</p>
                      <div style={{ display: "flex", gap: "3px" }}>
                        {(() => {
                          const lens = modeForDate(getDailyDate()).pyramidLengths
                          const max = lens[lens.length - 1]
                          return lens.map(l => (
                            <div key={l} style={{ width: "13px", height: "13px", borderRadius: "3px", background: entry.pyramid_found?.[l] ? l === max ? "rgba(251,191,36,0.85)" : "rgba(16,185,129,0.75)" : "rgba(71,85,105,0.3)" }} />
                          ))
                        })()}
                      </div>
                    </div>
                  </div>
                )
              })}
            </>)}

            {/* Streaks tab */}
            {leaderboardTab === 'streaks' && (<>
              {streaksLoading && <p className="text-slate-600 text-sm text-center py-6">Chargement…</p>}
              {!streaksLoading && streaks.length === 0 && <p className="text-slate-600 text-sm text-center py-6">Aucune série pour l'instant</p>}
              {!streaksLoading && streaks.slice(0, 3).map((entry, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", padding: "0.7rem 1rem", borderRadius: "0.875rem", background: "rgba(30,41,59,0.6)", border: "1px solid rgba(71,85,105,0.15)", gap: "0.75rem" }}>
                  <span style={{ fontSize: "1rem", flexShrink: 0 }}>{['🥇','🥈','🥉'][i]}</span>
                  <span style={{ flex: 1, fontWeight: 500, color: "#e2e8f0", fontSize: "0.9rem", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.display_name ?? 'Anonyme'}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.15rem", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.3rem" }}>
                      <span style={{ fontWeight: 700, color: "white", fontSize: "0.9rem", fontVariantNumeric: "tabular-nums" }}>{entry.best_daily_streak}</span>
                      <span style={{ fontSize: "0.65rem", color: "#475569" }}>jours</span>
                    </div>
                    <span style={{ fontSize: "0.65rem", color: "#334155" }}>{entry.daily_played} défis</span>
                  </div>
                </div>
              ))}
            </>)}

            {/* Records tab */}
            {leaderboardTab === 'records' && (<>
              {longestWordsLoading && <p className="text-slate-600 text-sm text-center py-6">Chargement…</p>}
              {!longestWordsLoading && longestWords.length === 0 && <p className="text-slate-600 text-sm text-center py-6">Aucun record pour l'instant</p>}
              {!longestWordsLoading && longestWords.slice(0, 3).map((entry, i) => {
                const active = recordsDiscovery?.word === entry.word && recordsDiscovery?.seed === entry.seed
                return (
                  <div key={i}>
                    <button
                      onClick={() => setRecordsDiscovery(active ? null : entry)}
                      style={{ display: "flex", alignItems: "center", width: "100%", padding: "0.75rem 1rem", borderRadius: "0.875rem", background: active ? "rgba(109,40,217,0.15)" : "rgba(30,41,59,0.8)", border: active ? "1px solid rgba(109,40,217,0.3)" : "1px solid rgba(71,85,105,0.25)", gap: "0.75rem", cursor: "pointer" }}
                    >
                      <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{['🥇','🥈','🥉'][i]}</span>
                      <span style={{ flex: 1, fontWeight: 700, color: active ? "#c4b5fd" : "white", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.95rem", textAlign: "left" }}>{entry.word}</span>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.15rem", flexShrink: 0 }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.15rem 0.45rem", borderRadius: "999px", background: "rgba(109,40,217,0.2)", color: "#c4b5fd" }}>{entry.word.length}L</span>
                        <span style={{ fontSize: "0.65rem", color: "#475569" }}>{entry.display_name ?? 'Anonyme'}</span>
                      </div>
                    </button>
                    {active && recordGrid && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", padding: "0.75rem", borderRadius: "0.875rem", background: "rgba(15,23,42,0.8)", marginTop: "0.25rem" }}>
                        <Grid grid={recordGrid} onWordSubmit={() => null} disabled discoveryPath={recordPath ?? undefined} />
                        {!recordPath && <p style={{ fontSize: "0.8rem", color: "#475569" }}>Chemin non trouvé</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </>)}
          </div>
        </div>
      </div>
    )
  };

  // === READY ===
  if (gameState === "ready") {
    const durations = ["30s", "1min", "2min", "∞"];
    const minLetters = [3, 4, 5, 6, 7];
    const durationMap: Record<string, GameConfig["duration"]> = {
      "30s": 30,
      "1min": 60,
      "2min": 120,
      "∞": 0,
    };
    const selectedDuration =
      config.duration === 0
        ? "∞"
        : config.duration < 60
        ? `${config.duration}s`
        : `${config.duration / 60}min`;

    return (
      <div
        style={{
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          background: "#0b1120",
          padding: "0 1rem",
          position: "relative",
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
            gap: "1.25rem",
            paddingTop: "3.5rem",
            paddingBottom: "1.5rem",
          }}
        >
          {/* Header */}
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h1
              style={{
                fontSize: "1.75rem",
                fontWeight: 900,
                letterSpacing: "0.08em",
                color: "white",
              }}
            >
              GRIDDLE
            </h1>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => setShowNameModal(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.6rem 1rem",
                  borderRadius: "0.875rem",
                  background: "rgba(30,41,59,0.9)",
                  border: "1px solid rgba(71,85,105,0.5)",
                  color: "white",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <User size={16} />
                <span
                  style={{
                    maxWidth: "90px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {displayName || "Joueur"}
                </span>
              </button>
              <button
                onClick={() => {
                  const opening = !showLeaderboard;
                  setShowLeaderboard((v) => !v);
                  if (opening) {
                    setLeaderboard([]);
                    setStreaks([]);
                    setLongestWords([]);
                    setLeaderboardLoading(true);
                    fetchDailyLeaderboard(getDailyDate())
                      .then(setLeaderboard)
                      .finally(() => setLeaderboardLoading(false));
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "2.6rem",
                  height: "2.6rem",
                  borderRadius: "0.875rem",
                  background: "rgba(30,41,59,0.9)",
                  border: "1px solid rgba(71,85,105,0.5)",
                  color: "#fbbf24",
                  cursor: "pointer",
                }}
              >
                <Trophy size={17} />
              </button>
              <button
                onClick={() => setShowHistory((h) => !h)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "2.6rem",
                  height: "2.6rem",
                  borderRadius: "0.875rem",
                  background: "rgba(30,41,59,0.9)",
                  border: "1px solid rgba(71,85,105,0.5)",
                  color: "#94a3b8",
                  cursor: "pointer",
                }}
              >
                <History size={17} />
              </button>
            </div>
          </header>

          {countdown !== null ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                className="animate-pop"
                style={{
                  fontSize: "8rem",
                  fontWeight: 900,
                  color: "white",
                  lineHeight: 1,
                }}
              >
                {countdown}
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", flex: 1 }}>

              {/* Carte Défi du jour */}
              {(() => {
                const todayMode = modeForDate(getDailyDate());
                const { cardBg, cardBorder, cardShadow, accent, accentSoft, slotBg, slotBorder, buttonBg, buttonBorder } = todayMode.palette;
                const isBirthday = todayMode.id === "birthday-2026-04-30";
                const sixties = isBirthday
                  ? Array.from({ length: 14 }, (_, i) => ({
                      top: (i * 37 + 13) % 90,
                      left: (i * 53 + 7) % 92,
                      size: 1.4 + ((i * 7) % 5) * 0.35,
                      rotate: ((i * 41) % 60) - 30,
                      opacity: 0.07 + ((i * 13) % 5) * 0.02,
                    }))
                  : [];
                return (
              <div
                style={{
                  position: "relative",
                  borderRadius: "1.5rem",
                  background: cardBg,
                  border: cardBorder,
                  boxShadow: cardShadow,
                  overflow: "hidden",
                }}
              >
                {sixties.map((s, i) => (
                  <span
                    key={i}
                    style={{
                      position: "absolute",
                      top: `${s.top}%`,
                      left: `${s.left}%`,
                      fontSize: `${s.size}rem`,
                      fontWeight: 900,
                      color: accent,
                      opacity: s.opacity,
                      transform: `rotate(${s.rotate}deg)`,
                      pointerEvents: "none",
                      lineHeight: 1,
                      userSelect: "none",
                    }}
                  >
                    60
                  </span>
                ))}
                <div style={{ padding: "1.25rem 1.25rem 1rem", position: "relative" }}>
                  <p style={{ fontSize: "1.6rem", fontWeight: 900, letterSpacing: "0.04em", color: "white", marginBottom: "0.2rem" }}>
                    {todayMode.name.toUpperCase()}
                  </p>
                  <p style={{ fontSize: "0.75rem", fontWeight: 600, color: accentSoft, marginBottom: "1rem" }}>
                    {todayMode.subtitle}
                  </p>
                  {/* Mini pyramide */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem", marginBottom: "1.1rem" }}>
                    {pyramidRows(todayMode).map((row, ri) => (
                      <div key={ri} style={{ display: "flex", gap: "0.4rem" }}>
                        {row.map((len) => (
                          <div key={len} style={{ padding: "0.3rem 0.7rem", borderRadius: "0.5rem", background: slotBg, border: slotBorder, fontSize: "0.75rem", fontWeight: 700, color: accent }}>
                            {levelLabel(todayMode, len)}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={requestStartDaily}
                  style={{
                    position: "relative",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    padding: "0.9rem",
                    background: buttonBg,
                    border: "none",
                    borderTop: buttonBorder,
                    color: "white",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <Play size={16} fill="white" style={{ color: "white" }} />
                  Jouer
                  {dailyPlayedToday && <span style={{ fontSize: "0.7rem", fontWeight: 600, opacity: 0.6, marginLeft: "0.25rem" }}>· déjà soumis</span>}
                </button>
              </div>
                );
              })()}

              {/* Carte Partie libre */}
              <div
                style={{
                  borderRadius: "1.5rem",
                  background: "rgba(30,41,59,0.8)",
                  border: "1px solid rgba(71,85,105,0.35)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "1.25rem 1.25rem 1rem" }}>
                  <p style={{ fontSize: "1.6rem", fontWeight: 900, letterSpacing: "0.04em", color: "white", marginBottom: "0.2rem" }}>
                    PARTIE LIBRE
                  </p>
                  <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(148,163,184,0.7)", marginBottom: "1rem" }}>
                    Joue à ton rythme
                  </p>

                  {/* Durée */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.875rem" }}>
                    <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Durée</p>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      {durations.map((duration) => (
                        <button
                          key={duration}
                          onClick={() => setConfig((prev) => ({ ...prev, duration: durationMap[duration] }))}
                          style={{
                            flex: 1, padding: "0.55rem 0", borderRadius: "0.75rem",
                            fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                            background: selectedDuration === duration ? "white" : "rgba(15,23,42,0.7)",
                            color: selectedDuration === duration ? "#0f172a" : "#64748b",
                            border: selectedDuration === duration ? "none" : "1px solid rgba(71,85,105,0.3)",
                          }}
                        >{duration}</button>
                      ))}
                    </div>
                  </div>

                  {/* Lettres min */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Lettres min</p>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      {minLetters.map((letters) => (
                        <button
                          key={letters}
                          onClick={() => setConfig((prev) => ({ ...prev, minLetters: letters as GameConfig["minLetters"] }))}
                          style={{
                            flex: 1, padding: "0.55rem 0", borderRadius: "0.75rem",
                            fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                            background: config.minLetters === letters ? "white" : "rgba(15,23,42,0.7)",
                            color: config.minLetters === letters ? "#0f172a" : "#64748b",
                            border: config.minLetters === letters ? "none" : "1px solid rgba(71,85,105,0.3)",
                          }}
                        >{letters}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={startGame}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    padding: "0.9rem",
                    background: "#3b82f6",
                    border: "none",
                    borderTop: "1px solid rgba(59,130,246,0.3)",
                    color: "white",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <Play size={16} fill="white" style={{ color: "white" }} />
                  Jouer · {config.minLetters}L · {selectedDuration}
                </button>
              </div>

            </div>
          )}

          {showHistory && <HistoryDrawer />}
          {showLeaderboard && <LeaderboardDrawer />}
        </div>

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
      </div>
    );
  }

  // === PLAYING ===
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
        <h1
          style={{
            fontSize: "1.1rem",
            fontWeight: 900,
            letterSpacing: "0.05em",
          }}
        >
          {isDailyChallenge ? (
            <span style={{ color: "#fbbf24" }}>⚡ DÉFI DU JOUR</span>
          ) : (
            <span style={{ color: "white" }}>
              GRIDDLE{" "}
              <span
                style={{
                  fontSize: "0.6rem",
                  color: "#334155",
                  fontFamily: "monospace",
                  letterSpacing: "0.1em",
                  fontWeight: 400,
                }}
              >
                {seed}
              </span>
            </span>
          )}
        </h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={confirmAndStop}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "0.45rem 0.75rem",
              borderRadius: "0.75rem",
              background: "rgba(185,28,28,0.2)",
              border: "1px solid rgba(185,28,28,0.35)",
              color: "#fca5a5",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <X size={13} />
            Quit
          </button>
          <button
            onClick={newGame}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "0.45rem 0.75rem",
              borderRadius: "0.75rem",
              background: "rgba(30,41,59,0.9)",
              border: "1px solid rgba(71,85,105,0.4)",
              color: "#94a3b8",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
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
          display: "flex",
          alignItems: "center",
          padding: "0.75rem 1.25rem",
          gap: "1rem",
          background: "rgba(15,23,42,0.6)",
          borderBottom: "1px solid rgba(30,41,59,0.6)",
        }}
      >
        {/* Score + minLetters badge */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "baseline",
            gap: "0.4rem",
          }}
        >
          <span
            style={{
              fontSize: "2.5rem",
              fontWeight: 900,
              color: "white",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {score}
          </span>
          <span
            style={{ fontSize: "0.85rem", color: "#475569", fontWeight: 500 }}
          >
            pts
          </span>
          {!isDailyChallenge && (
            <span
              style={{
                marginLeft: "0.25rem",
                fontSize: "0.7rem",
                fontWeight: 700,
                padding: "0.15rem 0.45rem",
                borderRadius: "999px",
                background: "rgba(59,130,246,0.15)",
                color: "#60a5fa",
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
        <div
          style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}
        >
          <span
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#cbd5e1",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {foundWords.length}
          </span>
          <span style={{ fontSize: "0.8rem", color: "#334155" }}>
            /{validWords.size}
          </span>
        </div>
        {isDailyChallenge ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "4rem",
            }}
          >
            <span
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "#fbbf24",
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
            onEnd={endGame}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "3rem",
            }}
          >
            <span
              style={{ fontSize: "1.5rem", fontWeight: 700, color: "#334155" }}
            >
              ∞
            </span>
          </div>
        )}
      </div>

      {/* Grille */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
        <div className="relative">
          {grid && (
            <Grid
              grid={grid}
              onWordSubmit={handleWordSubmit}
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
                    word
                      ? "bg-green-500/20 border-green-500/40"
                      : "bg-slate-800/60 border-slate-700"
                  }`}
                >
                  <span
                    className={`text-[10px] font-bold ${
                      word ? "text-green-400" : "text-slate-600"
                    }`}
                  >
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
          <div
            className="w-full overflow-x-auto flex gap-2 pb-0.5"
            style={{ scrollbarWidth: "none" }}
          >
            {[...foundWords]
              .reverse()
              .slice(0, 12)
              .map((w, i) => {
                const s = scoreForWord(w);
                const color =
                  s >= 12
                    ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
                    : s >= 7
                    ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                    : s >= 4
                    ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
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


      {showHistory && <HistoryDrawer />}

      {/* Modal de confirmation abandon */}
      {confirmModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          padding: "0 1rem 2rem",
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            width: "100%", maxWidth: "28rem",
            background: "#111827",
            border: "1px solid rgba(71,85,105,0.4)",
            borderRadius: "1.5rem",
            padding: "1.5rem",
            display: "flex", flexDirection: "column", gap: "1.25rem",
          }}>
            <p style={{ fontSize: "1rem", fontWeight: 600, color: "white", lineHeight: 1.5, textAlign: "center" }}>
              {confirmModal.message}
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => setConfirmModal(null)}
                style={{
                  flex: 1, padding: "0.85rem",
                  borderRadius: "1rem",
                  background: "rgba(30,41,59,0.8)",
                  border: "1px solid rgba(71,85,105,0.4)",
                  color: "#94a3b8", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer",
                }}
              >
                Continuer
              </button>
              <button
                onClick={() => { setConfirmModal(null); confirmModal.onConfirm() }}
                style={{
                  flex: 1, padding: "0.85rem",
                  borderRadius: "1rem",
                  background: "rgba(185,28,28,0.3)",
                  border: "1px solid rgba(185,28,28,0.5)",
                  color: "#fca5a5", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer",
                }}
              >
                Oui, je pars
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
