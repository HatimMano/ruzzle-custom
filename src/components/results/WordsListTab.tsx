import { useState } from "react";
import { scoreForWord } from "../../lib/scoring";
import { findWordPath } from "../../lib/gridGenerator";
import type { Grid as GridType } from "../../lib/gridGenerator";
import Grid from "../Grid";

interface Props {
  grid: GridType;
  validWords: Set<string>;
  foundWords: string[];
}

const SCORE_STYLE: Record<number, { color: string; bg: string }> = {
  1: { color: "#64748b", bg: "rgba(71,85,105,0.2)" },
  2: { color: "#64748b", bg: "rgba(71,85,105,0.2)" },
  4: { color: "#a78bfa", bg: "rgba(109,40,217,0.2)" },
  7: { color: "#fb923c", bg: "rgba(234,88,12,0.2)" },
  12: { color: "#f87171", bg: "rgba(239,68,68,0.2)" },
};

// Liste triée des mots valides de la grille, clic → aperçu du chemin sur la grille.
export default function WordsListTab({ grid, validWords, foundWords }: Props) {
  const [discoveryWord, setDiscoveryWord] = useState<string | null>(null);
  const foundSet = new Set(foundWords);
  const discoveryPath = discoveryWord ? findWordPath(grid, discoveryWord) : null;
  const sorted = [...validWords].sort((a, b) => b.length - a.length || a.localeCompare(b));

  if (sorted.length === 0) {
    return (
      <p style={{ padding: "2rem 0", textAlign: "center", fontSize: "0.85rem", color: "#475569" }}>
        Aucun mot disponible
      </p>
    );
  }

  return (
    <div style={{ paddingBottom: "0.5rem" }}>
      {discoveryWord && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem",
          padding: "1rem", borderRadius: "1.5rem", marginBottom: "0.25rem",
          background: "rgba(30,41,59,0.8)", border: "1px solid rgba(71,85,105,0.25)",
        }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.1em", color: "white" }}>
            {discoveryWord.toUpperCase()}
          </p>
          {discoveryPath ? (
            <Grid grid={grid} onWordSubmit={() => null} disabled discoveryPath={discoveryPath} />
          ) : (
            <p style={{ fontSize: "0.875rem", color: "#64748b" }}>Chemin non trouvé</p>
          )}
        </div>
      )}
      {sorted.map((w, i) => {
        const s = scoreForWord(w);
        const ss = SCORE_STYLE[s] ?? SCORE_STYLE[1];
        const isFound = foundSet.has(w);
        const active = discoveryWord === w;
        return (
          <button
            key={w}
            onClick={() => setDiscoveryWord((prev) => (prev === w ? null : w))}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", textAlign: "left",
              padding: "0.7rem 0",
              borderTop: i > 0 ? "1px solid rgba(30,41,59,0.8)" : "none",
              background: "transparent", border: "none", cursor: "pointer",
            }}
          >
            <span style={{
              fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: "0.95rem",
              color: active ? "#93c5fd" : isFound ? "white" : "#475569",
              transition: "color 0.15s",
            }}>
              {w}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{
                fontSize: "0.65rem",
                color: active ? "#93c5fd" : isFound ? "#cbd5e1" : "#334155",
                fontWeight: 700, fontVariantNumeric: "tabular-nums",
              }}>
                {w.length}L
              </span>
              <span style={{
                fontSize: "0.75rem", fontWeight: 700, padding: "0.2rem 0.55rem",
                borderRadius: "999px", fontVariantNumeric: "tabular-nums",
                background: active ? "rgba(59,130,246,0.2)" : isFound ? ss.bg : "rgba(30,41,59,0.6)",
                color: active ? "#93c5fd" : isFound ? ss.color : "#334155",
              }}>
                +{s}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
