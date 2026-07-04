// Écran plein pour le countdown 3-2-1-Go avant démarrage d'un défi.
// Cache toute l'UI du jeu (grille / score / timer) pour laisser au joueur
// le temps de se préparer. Style aligné sur celui de HomeScreen.

interface Props {
  value: number
}

export default function CountdownScreen({ value }: Props) {
  return (
    <div className="h-dvh bg-slate-900 flex flex-col max-w-md mx-auto overflow-hidden">
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          key={value}
          className="animate-pop"
          style={{
            fontSize: "8rem",
            fontWeight: 900,
            color: "white",
            lineHeight: 1,
          }}
        >
          {value === 0 ? "Go" : value}
        </span>
      </div>
    </div>
  )
}
