import { useCallback, useEffect, useRef, useState } from "react";
import { User, History, Play, RefreshCw, Trophy } from "lucide-react";
import Grid from "./components/Grid";
import Timer from "./components/Timer";
import ResultsScreen from "./components/ResultsScreen";
import DailyResultsScreen from "./components/DailyResultsScreen";
import { PseudoModal } from "./components/PseudoModal";
import { loadDictionary, isValidWord, getTrie } from "./lib/dictionary";
import { generateGrid, generateDailyGrid } from "./lib/gridGenerator";
import type { Cell, Grid as GridType } from "./lib/gridGenerator";
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
} from "./lib/api";
import type { LeaderboardEntry } from "./lib/api";

interface GameConfig {
  minLetters: 3 | 4 | 5 | 6 | 7;
  duration: 30 | 60 | 120 | 0;
}

const DEFAULT_CONFIG: GameConfig = { minLetters: 5, duration: 60 };
const PYRAMID_LENGTHS = [3, 4, 5, 6, 7, 8] as const;

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

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showNameModal, setShowNameModal] = useState(false);
  const [displayName, setDisplayNameState] = useState(
    () => localStorage.getItem("griddle:display_name") ?? ""
  );

  // Daily challenge state
  const [isDailyChallenge, setIsDailyChallenge] = useState(false);
  const [pyramidFound, setPyramidFound] = useState<Record<number, string>>({});
  const [elapsed, setElapsed] = useState(0);

  // Leaderboard drawer
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

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

  scoreRef.current = score;
  foundWordsRef.current = foundWords;
  configRef.current = config;
  isDailyChallengeRef.current = isDailyChallenge;
  pyramidFoundRef.current = pyramidFound;
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
      submitDailyResult({
        date: getDailyDate(),
        elapsedSecs: elapsedRef.current,
        completed: PYRAMID_LENGTHS.every((l) => !!pf[l]),
        levelsFound: PYRAMID_LENGTHS.filter((l) => !!pf[l]).length,
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

  // Auto-complete daily challenge when all 6 levels found
  useEffect(() => {
    if (!isDailyChallenge || gameState !== "playing") return;
    if (PYRAMID_LENGTHS.every((l) => !!pyramidFound[l])) {
      clearInterval(elapsedIntervalRef.current);
      window.setTimeout(() => {
        setGameState("finished");
      }, 700);
    }
  }, [pyramidFound, isDailyChallenge, gameState]);

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

  const startDailyChallenge = () => {
    prevConfigRef.current = configRef.current;
    clearInterval(elapsedIntervalRef.current);
    elapsedRef.current = 0;
    setElapsed(0);
    setPyramidFound({});
    setIsDailyChallenge(true);
    const dailyDate = getDailyDate();
    const trie = getTrie();
    if (!trie) return;
    const { grid: g, validWords: vw } = generateDailyGrid(dailyDate, trie);
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

  const stopGame = () => {
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

      const dailyLevelKey = isDailyChallengeRef.current ? Math.min(word.length, 8) : null;
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

  const LeaderboardDrawer = () => (
    <div
      className="absolute inset-0 bg-slate-900/80 z-10 flex items-end"
      onClick={() => setShowLeaderboard(false)}
    >
      <div
        className="w-full bg-slate-900 border-t border-slate-700 rounded-t-3xl p-4 max-h-[75vh] flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-1" />
        <div className="flex items-center gap-2">
          <Trophy size={16} style={{ color: "#fbbf24" }} />
          <span className="font-bold text-white text-base">Classement du jour</span>
        </div>
        <div className="overflow-y-auto flex flex-col gap-2">
          {leaderboardLoading && (
            <p className="text-slate-600 text-sm text-center py-6">Chargement…</p>
          )}
          {!leaderboardLoading && leaderboard.length === 0 && (
            <p className="text-slate-600 text-sm text-center py-6">Aucun résultat pour aujourd'hui</p>
          )}
          {!leaderboardLoading && leaderboard.map((entry) => (
            <div
              key={entry.rank}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0.75rem 1rem",
                borderRadius: "0.875rem",
                background: entry.is_me ? "rgba(217,119,6,0.1)" : "rgba(30,41,59,0.8)",
                border: entry.is_me ? "1px solid rgba(217,119,6,0.3)" : "1px solid rgba(71,85,105,0.25)",
                gap: "0.5rem",
              }}
            >
              <span style={{ width: "2rem", fontSize: "1.1rem", flexShrink: 0 }}>
                {RANK_MEDAL[entry.rank] ?? entry.rank}
              </span>
              <span style={{ flex: 1, fontWeight: 500, color: entry.is_me ? "#fbbf24" : "white", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.display_name ?? `Joueur #${entry.rank}`}
                {entry.is_me && <span style={{ marginLeft: "0.4rem", fontSize: "0.7rem", color: "rgba(251,191,36,0.5)" }}>· moi</span>}
              </span>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem", flexShrink: 0 }}>
                <p style={{ fontWeight: 600, color: entry.is_me ? "#fbbf24" : "white", fontSize: "0.9rem" }}>{entry.score} pts</p>
                <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{fmtTime(entry.elapsed_secs)}</p>
                <div style={{ display: "flex", gap: "3px" }}>
                  {[3,4,5,6,7,8].map(l => (
                    <div
                      key={l}
                      style={{
                        width: "13px",
                        height: "13px",
                        borderRadius: "3px",
                        background: entry.pyramid_found?.[l] ? "rgba(16,185,129,0.75)" : "rgba(71,85,105,0.3)",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

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
                  setShowLeaderboard((v) => !v);
                  if (!showLeaderboard && leaderboard.length === 0) {
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
              <div
                style={{
                  borderRadius: "1.5rem",
                  background: "linear-gradient(135deg, rgba(217,119,6,0.3) 0%, rgba(234,179,8,0.1) 100%)",
                  border: "1px solid rgba(217,119,6,0.45)",
                  boxShadow: "0 0 28px rgba(217,119,6,0.12)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "1.25rem 1.25rem 1rem" }}>
                  <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", color: "rgba(251,191,36,0.6)", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                    Défi du jour · {getDailyDate()}
                  </p>
                  <p style={{ fontSize: "1.2rem", fontWeight: 800, color: "white", marginBottom: "1rem" }}>
                    Complète la pyramide
                  </p>
                  {/* Mini pyramide */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem", marginBottom: "1.1rem" }}>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      {(["8L+"] as const).map((l) => (
                        <div key={l} style={{ padding: "0.3rem 0.9rem", borderRadius: "0.5rem", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", fontSize: "0.75rem", fontWeight: 700, color: "#fbbf24" }}>{l}</div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      {(["6L", "7L"] as const).map((l) => (
                        <div key={l} style={{ padding: "0.3rem 0.75rem", borderRadius: "0.5rem", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", fontSize: "0.75rem", fontWeight: 700, color: "#fbbf24" }}>{l}</div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      {(["3L", "4L", "5L"] as const).map((l) => (
                        <div key={l} style={{ padding: "0.3rem 0.7rem", borderRadius: "0.5rem", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", fontSize: "0.75rem", fontWeight: 700, color: "#fbbf24" }}>{l}</div>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={startDailyChallenge}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    padding: "0.9rem",
                    background: "rgba(217,119,6,0.5)",
                    border: "none",
                    borderTop: "1px solid rgba(217,119,6,0.3)",
                    color: "white",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <Play size={16} fill="white" style={{ color: "white" }} />
                  Jouer
                </button>
              </div>

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
                  <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", color: "#475569", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                    Partie libre
                  </p>
                  <p style={{ fontSize: "1.2rem", fontWeight: 800, color: "white", marginBottom: "1rem" }}>
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
        <button
          onClick={newGame}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.5rem 0.875rem",
            borderRadius: "0.75rem",
            background: "rgba(30,41,59,0.9)",
            border: "1px solid rgba(71,85,105,0.4)",
            color: "#94a3b8",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <RefreshCw size={13} />
          Nouvelle
        </button>
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
            {(PYRAMID_LENGTHS as unknown as number[]).map((len) => {
              const word = pyramidFound[len];
              const label = len === 8 ? "8+" : `${len}L`;
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

      {/* Bouton terminer */}
      <div style={{ padding: "0.5rem 1.25rem 2rem" }}>
        <button
          onClick={stopGame}
          style={{
            width: "100%",
            padding: "1rem",
            borderRadius: "1rem",
            background: "rgba(30,41,59,0.7)",
            border: "1px solid rgba(71,85,105,0.3)",
            color: "#475569",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.background = "rgba(30,41,59,0.95)";
            e.currentTarget.style.color = "#94a3b8";
          }}
          onTouchEnd={(e) => {
            e.currentTarget.style.background = "rgba(30,41,59,0.7)";
            e.currentTarget.style.color = "#475569";
          }}
        >
          {isDailyChallenge ? "Abandonner la pyramide" : "Terminer la partie"}
        </button>
      </div>

      {showHistory && <HistoryDrawer />}
    </div>
  );
}
