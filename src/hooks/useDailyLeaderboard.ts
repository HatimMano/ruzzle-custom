import { useEffect, useRef, useState } from "react";
import { fetchDailyLeaderboard } from "../lib/api";
import type { LeaderboardEntry } from "../lib/api";

const RETRY_DELAY_MS = 2500;
const MAX_RETRIES = 4;

// Leaderboard du jour pour les écrans de résultats.
// La soumission passe par l'edge function (régénération de grille serveur =
// plusieurs secondes) : au premier fetch, la row du joueur n'existe souvent
// pas encore. Tant que `is_me` est absent du top, on re-fetch (max 4×/2.5s)
// pour que le joueur voie son propre rang sans repasser par l'accueil.
export function useDailyLeaderboard(date: string, modeId: string, active: boolean) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const startedRef = useRef(false);
  const timerRef = useRef(0);

  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    const load = (attempt: number) => {
      if (attempt === 0) setLoading(true);
      fetchDailyLeaderboard(date, modeId)
        .then((rows) => {
          if (cancelled) return;
          setLeaderboard(rows);
          setLoading(false);
          if (!rows.some((r) => r.is_me) && attempt < MAX_RETRIES) {
            timerRef.current = window.setTimeout(() => load(attempt + 1), RETRY_DELAY_MS);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load(0);

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [active, date, modeId]);

  return { leaderboard, loading };
}
