// Dispatcher du strip de progression dans le classement. Branche par mode.kind.
// Pour ajouter un mode visuel : créer un composant XxxStrip dans ce dossier
// puis ajouter un case ici. Aucun autre fichier à toucher.

import { isTriddleMode, isPyramidMode, isRuddleMode, isSpeedleMode, type DailyMode } from "../../lib/dailyModes";
import PyramidStrip from "./PyramidStrip";
import TriddleStrip from "./TriddleStrip";
import WordCountStrip from "./WordCountStrip";

interface Props {
  mode: DailyMode;
  pyramidFound: Record<string, unknown> | null;
  wordCount?: number;  // pour les modes non-pyramide
}

export default function ProgressStrip({ mode, pyramidFound, wordCount }: Props) {
  if (isTriddleMode(mode)) return <TriddleStrip mode={mode} pyramidFound={pyramidFound} />;
  if (isPyramidMode(mode)) return <PyramidStrip mode={mode} pyramidFound={pyramidFound} />;
  if ((isRuddleMode(mode) || isSpeedleMode(mode)) && typeof wordCount === 'number') {
    return <WordCountStrip wordCount={wordCount} />;
  }
  return null;
}
