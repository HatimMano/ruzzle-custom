import { clearHistory } from "../lib/history";
import type { HistoryEntry } from "../lib/history";

interface Props {
  history: HistoryEntry[];
  onSelectEntry: (seed: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export default function HistoryDrawer({ history, onSelectEntry, onClear, onClose }: Props) {
  return (
    <div
      className="absolute inset-0 bg-slate-900/80 z-10 flex items-end"
      onClick={onClose}
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
                onClear();
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
              onClick={() => onSelectEntry(entry.seed)}
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
                  <span className="text-xs text-yellow-600 font-normal"> pts</span>
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
}
