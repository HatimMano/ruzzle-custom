// Dispatcher du strip de progression dans le classement. Branche par mode.kind.
// Pour ajouter un mode visuel : créer un composant XxxStrip dans ce dossier
// puis ajouter un case ici. Aucun autre fichier à toucher.

import { isMarathonMode, isPyramidMode, type DailyMode } from "../../lib/dailyModes";
import PyramidStrip from "./PyramidStrip";
import MarathonStrip from "./MarathonStrip";

interface Props {
  mode: DailyMode;
  pyramidFound: Record<string, unknown> | null;
}

export default function ProgressStrip({ mode, pyramidFound }: Props) {
  if (isMarathonMode(mode)) return <MarathonStrip mode={mode} pyramidFound={pyramidFound} />;
  if (isPyramidMode(mode)) return <PyramidStrip mode={mode} pyramidFound={pyramidFound} />;
  return null;
}
