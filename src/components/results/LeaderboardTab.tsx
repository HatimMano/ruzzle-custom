import type { LeaderboardEntry } from "../../lib/api";
import { useDailyLeaderboard } from "../../hooks/useDailyLeaderboard";

interface Props {
  date: string;
  modeId: string;
  // Sélecteur du "score à afficher" par entry — utile pour les modes non-standard
  // (ex : Speedle → survivedSecs+bonus). Par défaut on affiche `entry.score`.
  scoreLabel?: (entry: LeaderboardEntry) => { primary: string; secondary?: string };
}

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${s}s`;
}

const defaultScoreLabel = (entry: LeaderboardEntry) => ({
  primary: `${entry.score + Math.max(0, 4 - entry.rank)} pts`,
  secondary: fmtTime(entry.elapsed_secs),
});

export default function LeaderboardTab({ date, modeId, scoreLabel = defaultScoreLabel }: Props) {
  const { leaderboard: entries, loading } = useDailyLeaderboard(date, modeId, true);

  if (loading) {
    return (
      <p style={{ padding: "3rem 0", textAlign: "center", fontSize: "0.875rem", color: "#64748b" }}>
        Chargement…
      </p>
    );
  }
  if (entries.length === 0) {
    return (
      <p style={{ padding: "3rem 0", textAlign: "center", fontSize: "0.875rem", color: "#64748b" }}>
        Aucun résultat pour aujourd'hui
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingTop: "0.5rem", paddingBottom: "0.5rem" }}>
      {entries.map((entry) => {
        const { primary, secondary } = scoreLabel(entry);
        return (
          <div
            key={entry.user_id}
            style={{
              display: "flex", alignItems: "center",
              padding: "0.875rem 1rem", borderRadius: "1rem",
              background: entry.is_me ? "rgba(217,119,6,0.1)" : "rgba(30,41,59,0.8)",
              border: entry.is_me ? "1px solid rgba(217,119,6,0.3)" : "1px solid rgba(71,85,105,0.25)",
              gap: "0.5rem",
            }}
          >
            <span style={{ width: "2rem", fontSize: "1.1rem", flexShrink: 0 }}>
              {RANK_MEDAL[entry.rank] ?? entry.rank}
            </span>
            <span style={{
              flex: 1, fontWeight: 500,
              color: entry.is_me ? "#fbbf24" : "white",
              minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {entry.display_name ?? `Joueur #${entry.rank}`}
              {entry.is_me && (
                <span style={{ marginLeft: "0.4rem", fontSize: "0.7rem", color: "rgba(251,191,36,0.5)" }}>· moi</span>
              )}
            </span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem" }}>
              <p style={{ fontWeight: 600, color: entry.is_me ? "#fbbf24" : "white", fontSize: "0.9rem" }}>
                {primary}
              </p>
              {secondary && <p style={{ fontSize: "0.7rem", color: "#64748b" }}>{secondary}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
