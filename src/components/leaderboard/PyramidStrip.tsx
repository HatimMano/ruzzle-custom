// Strip de progression dans le classement pour les modes pyramide (classic, bigriddle, birthday).
// 1 dot par créneau pyramide : doré si c'est le cap (8L+/10L+/...), vert sinon, gris si vide.

import type { PyramidMode } from "../../lib/dailyModes";

const COLOR_GOLD = "rgba(251,191,36,0.85)";
const COLOR_GREEN = "rgba(16,185,129,0.75)";
const COLOR_EMPTY = "rgba(71,85,105,0.3)";

interface Props {
  mode: PyramidMode;
  pyramidFound: Record<string, unknown> | null;
}

export default function PyramidStrip({ mode, pyramidFound }: Props) {
  const lens = mode.pyramidLengths;
  const maxLen = lens[lens.length - 1];
  // Le jsonb peut arriver avec clés numériques OU stringifiées selon la source
  const flat = (pyramidFound ?? {}) as Record<string, string>;
  return (
    <div style={{ display: "flex", gap: "3px" }}>
      {lens.map((l) => {
        const filled = !!flat[String(l)] || !!flat[l as unknown as string];
        const bg = filled ? (l === maxLen ? COLOR_GOLD : COLOR_GREEN) : COLOR_EMPTY;
        return (
          <div
            key={l}
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
