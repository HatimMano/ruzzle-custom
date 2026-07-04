interface Props {
  wordCount: number
}

// Strip d'affichage pour les modes non-pyramide (Ruddle, Speedle).
// Affiche simplement "{N} mots" — même style visuel que les strips pyramide.
export default function WordCountStrip({ wordCount }: Props) {
  return (
    <span style={{
      fontSize: "0.7rem",
      color: "#94a3b8",
      fontWeight: 600,
      letterSpacing: "0.02em",
    }}>
      {wordCount} mot{wordCount > 1 ? 's' : ''}
    </span>
  )
}
