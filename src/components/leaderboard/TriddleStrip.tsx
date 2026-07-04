// Strip de progression dans le classement pour Triddle (3 grilles pyramide).
// 1 dot par grille : doré si grille complète, vert si partielle, gris si vide.

import type { TriddleMode } from "../../lib/dailyModes";

const COLOR_GOLD = "rgba(251,191,36,0.85)";
const COLOR_GREEN = "rgba(16,185,129,0.75)";
const COLOR_EMPTY = "rgba(71,85,105,0.3)";

interface Props {
  mode: TriddleMode;
  pyramidFound: Record<string, unknown> | null;
}

export default function TriddleStrip({ mode, pyramidFound }: Props) {
  // Triddle stocke pyramid_found nested : { "0": {3:..., 4:...}, "1": {...}, "2": {...} }
  const nested = (pyramidFound ?? {}) as Record<string, Record<number, string>>;
  const total = mode.pyramidLengths.length;
  return (
    <div style={{ display: "flex", gap: "3px" }}>
      {Array.from({ length: mode.gridCount }, (_, i) => {
        const gridPyramid = nested[String(i)] ?? {};
        const filled = mode.pyramidLengths.filter((l) => !!gridPyramid[l]).length;
        const bg = filled === total ? COLOR_GOLD : filled > 0 ? COLOR_GREEN : COLOR_EMPTY;
        return (
          <div
            key={i}
            style={{
              width: "13px",
              height: "13px",
              borderRadius: "3px",
              background: bg,
            }}
          />
        );
      })}
    </div>
  );
}
