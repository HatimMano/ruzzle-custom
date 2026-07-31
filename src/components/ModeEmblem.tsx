import { Pyramid, Mountain, Grid2x2, Zap, Hourglass, RotateCw, Cake } from "lucide-react";
import type { EmblemId } from "../lib/dailyModes";

// Un emblème par mode, pour l'identifier d'un coup d'œil sur l'accueil.
// Les icônes viennent de lucide-react (déjà une dépendance) : traits homogènes,
// rien à redessiner. Ajouter un mode = 1 EmblemId + 1 entrée ici.
const ICONS: Record<EmblemId, typeof Pyramid> = {
  pyramid: Pyramid,       // Pyramiddle
  bigpyramid: Mountain,   // BiGriddle — la même idée, en plus grand
  triple: Grid2x2,        // Triddle — plusieurs grilles
  bolt: Zap,              // Ruddle — le chrono court (ex-Éclair)
  hourglass: Hourglass,   // Speedle — le sablier
  spin: RotateCw,         // Spinddle — le plateau qui bascule
  cake: Cake,             // anniversaires
};

interface Props {
  emblem: EmblemId;
  color: string;
  size?: number;
  /** Anime l'emblème (Spinddle : le pictogramme tourne, comme le plateau). */
  animate?: boolean;
}

export default function ModeEmblem({ emblem, color, size = 28, animate = false }: Props) {
  const Icon = ICONS[emblem];
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: `${size * 1.6}px`,
        height: `${size * 1.6}px`,
        borderRadius: "0.85rem",
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 38%, transparent)`,
        flexShrink: 0,
      }}
    >
      <Icon
        size={size}
        color={color}
        strokeWidth={2}
        style={animate ? { animation: "emblemSpin 6s linear infinite" } : undefined}
      />
    </span>
  );
}
