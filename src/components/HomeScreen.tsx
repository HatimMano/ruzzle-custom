import { useEffect, useState } from "react";
import { User, History, Play, Trophy } from "lucide-react";
import { fetchDailyLeaderboard, fetchModeRecord } from "../lib/api";
import type { LeaderboardEntry, ModeRecord } from "../lib/api";
import {
  pyramidRows,
  levelLabel,
  type DailyMode,
} from "../lib/dailyModes";
import HistoryDrawer from "./HistoryDrawer";
import LeaderboardDrawer from "./LeaderboardDrawer";
import type { HistoryEntry } from "../lib/history";

interface GameConfig {
  minLetters: 3 | 4 | 5 | 6 | 7;
  duration: 30 | 60 | 120 | 0;
}

interface Props {
  date: string;
  todayMode: DailyMode;
  countdown: number | null;
  config: GameConfig;
  setConfig: (updater: (prev: GameConfig) => GameConfig) => void;
  displayName: string;
  dailyPlayedToday: boolean;
  history: HistoryEntry[];
  onOpenName: () => void;
  onRequestStartDaily: () => void;
  onStartFreeGame: () => void;
  onClearHistory: () => void;
  onSelectHistoryEntry: (seed: string) => void;
}

const DURATIONS = ["30s", "1min", "2min", "∞"] as const;
const DURATION_MAP: Record<string, GameConfig["duration"]> = {
  "30s": 30,
  "1min": 60,
  "2min": 120,
  "∞": 0,
};
const MIN_LETTERS = [3, 4, 5, 6, 7] as const;

export default function HomeScreen({
  date,
  todayMode,
  countdown,
  config,
  setConfig,
  displayName,
  dailyPlayedToday,
  history,
  onOpenName,
  onRequestStartDaily,
  onStartFreeGame,
  onClearHistory,
  onSelectHistoryEntry,
}: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [modeRecord, setModeRecord] = useState<ModeRecord | null>(null);

  useEffect(() => {
    fetchModeRecord(todayMode.id).then(setModeRecord);
  }, [todayMode.id]);

  const fmtRecordTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
  };

  const selectedDuration =
    config.duration === 0
      ? "∞"
      : config.duration < 60
      ? `${config.duration}s`
      : `${config.duration / 60}min`;

  const handleOpenLeaderboard = () => {
    const opening = !showLeaderboard;
    setShowLeaderboard((v) => !v);
    if (opening) {
      setLeaderboard([]);
      setLeaderboardLoading(true);
      fetchDailyLeaderboard(date)
        .then(setLeaderboard)
        .finally(() => setLeaderboardLoading(false));
    }
  };

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
              onClick={onOpenName}
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
              onClick={handleOpenLeaderboard}
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
                <p style={{ fontSize: "0.75rem", fontWeight: 600, color: accentSoft, marginBottom: modeRecord ? "0.5rem" : "1rem" }}>
                  {todayMode.subtitle}
                </p>
                {modeRecord && (
                  <p style={{
                    fontSize: "0.7rem", fontWeight: 600,
                    color: accentSoft, opacity: 0.85,
                    marginBottom: "0.9rem",
                    display: "flex", alignItems: "center", gap: "0.3rem",
                  }}>
                    <span>🏆</span>
                    <span>Record :</span>
                    <span style={{ color: "white", fontVariantNumeric: "tabular-nums" }}>
                      {fmtRecordTime(modeRecord.elapsed_secs)}
                    </span>
                    <span>·</span>
                    <span style={{ color: "white", maxWidth: "10rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {modeRecord.display_name ?? 'Anonyme'}
                    </span>
                  </p>
                )}
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
                onClick={onRequestStartDaily}
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

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.875rem" }}>
                  <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Durée</p>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    {DURATIONS.map((duration) => (
                      <button
                        key={duration}
                        onClick={() => setConfig((prev) => ({ ...prev, duration: DURATION_MAP[duration] }))}
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

                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Lettres min</p>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    {MIN_LETTERS.map((letters) => (
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
                onClick={onStartFreeGame}
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

        {showHistory && (
          <HistoryDrawer
            history={history}
            onSelectEntry={(seedToReplay) => { setShowHistory(false); onSelectHistoryEntry(seedToReplay); }}
            onClear={onClearHistory}
            onClose={() => setShowHistory(false)}
          />
        )}
        {showLeaderboard && (
          <LeaderboardDrawer
            date={date}
            leaderboard={leaderboard}
            leaderboardLoading={leaderboardLoading}
            onClose={() => setShowLeaderboard(false)}
          />
        )}
      </div>
    </div>
  );
}
