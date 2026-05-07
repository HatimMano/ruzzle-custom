import type { DailyModeRules } from "../lib/dailyModes";

interface Props {
  mode: DailyModeRules;
  onClose: () => void;
}

export default function DailyIntroModal({ mode, onClose }: Props) {
  if (!mode.intro) return null;
  const { title, tagline, bullets, cta } = mode.intro;
  const { accent, accentSoft, cardBg, cardBorder, buttonBg, buttonBorder } = mode.palette;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        backdropFilter: "blur(6px)",
        animation: "modalFadeIn 0.25s ease-out",
      }}
    >
      <style>{`
        @keyframes modalFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes modalSlideUp {
          0% { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          width: "100%",
          maxWidth: "26rem",
          background: cardBg,
          border: cardBorder,
          borderRadius: "1.5rem",
          padding: "1.75rem 1.5rem 1.5rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          animation: "modalSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
        }}
      >
        <p
          style={{
            fontSize: "0.7rem",
            fontWeight: 600,
            letterSpacing: "0.14em",
            color: accentSoft,
            marginBottom: "0.5rem",
            textTransform: "uppercase",
          }}
        >
          Nouveau mode
        </p>
        <p
          style={{
            fontSize: "2.1rem",
            fontWeight: 900,
            letterSpacing: "0.02em",
            color: "white",
            lineHeight: 1.05,
            marginBottom: "0.35rem",
          }}
        >
          {title}
        </p>
        <p
          style={{
            fontSize: "0.95rem",
            fontWeight: 600,
            color: accentSoft,
            marginBottom: "1.5rem",
          }}
        >
          {tagline}
        </p>

        <ul
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            margin: 0,
            padding: 0,
            listStyle: "none",
            marginBottom: "1.75rem",
          }}
        >
          {bullets.map((b, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "flex-start",
                fontSize: "0.92rem",
                lineHeight: 1.4,
                color: "rgba(241,245,249,0.95)",
              }}
            >
              <span
                style={{
                  color: accent,
                  fontWeight: 700,
                  lineHeight: 1.4,
                  flexShrink: 0,
                  marginTop: "1px",
                }}
              >
                ●
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "0.95rem",
            background: buttonBg,
            border: buttonBorder,
            borderRadius: "1rem",
            color: "white",
            fontSize: "1rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "transform 0.1s ease",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {cta}
        </button>
      </div>
    </div>
  );
}
