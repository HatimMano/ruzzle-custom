import { useState, useEffect, useRef } from "react";

interface PseudoModalProps {
  isOpen?: boolean;
  currentUsername?: string;
  isFirstVisit?: boolean;
  onSave?: (username: string) => void;
  onCancel?: () => void;
}

export function PseudoModal({
  isOpen = true,
  currentUsername = "",
  isFirstVisit = false,
  onSave,
  onCancel,
}: PseudoModalProps) {
  const [username, setUsername] = useState(currentUsername);
  const [visible, setVisible] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const isValid = username.trim().length > 0;
  const showCancelButton = !isFirstVisit && currentUsername.length > 0;

  // Suit le clavier iOS via visualViewport
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setBottomOffset(Math.max(0, offset));
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setUsername(currentUsername);
      requestAnimationFrame(() => {
        setVisible(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      });
    } else {
      setVisible(false);
    }
  }, [isOpen, currentUsername]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && showCancelButton) onCancel?.();
      }}
    >
      {/* Sheet */}
      <div
        style={{
          width: "100%",
          borderRadius: "1.5rem 1.5rem 0 0",
          padding: "1.25rem 1.25rem 2rem",
          background: "rgba(15,23,42,0.97)",
          border: "1px solid rgba(71,85,105,0.35)",
          borderBottom: "none",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          marginBottom: bottomOffset,
          transitionProperty: "transform, margin-bottom",
          transitionDuration: "0.28s, 0.18s",
          transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1), ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div
          style={{
            width: "2.5rem",
            height: "4px",
            borderRadius: "999px",
            background: "rgba(71,85,105,0.5)",
            margin: "0 auto 1.5rem",
          }}
        />

        <h2
          style={{
            textAlign: "center",
            fontSize: "1.25rem",
            fontWeight: 800,
            color: "white",
            marginBottom: "0.3rem",
            letterSpacing: "-0.01em",
          }}
        >
          Ton pseudo
        </h2>
        <p
          style={{
            textAlign: "center",
            fontSize: "0.85rem",
            color: "#475569",
            marginBottom: "1.5rem",
          }}
        >
          Visible dans le classement
        </p>

        <input
          ref={inputRef}
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isValid) onSave?.(username.trim());
          }}
          placeholder="Entre ton pseudo…"
          maxLength={20}
          style={{
            width: "100%",
            padding: "0.9rem 1rem",
            borderRadius: "0.875rem",
            background: "rgba(30,41,59,0.9)",
            border: `1px solid ${
              username.length > 0
                ? "rgba(59,130,246,0.55)"
                : "rgba(71,85,105,0.4)"
            }`,
            color: "white",
            fontSize: "16px",
            textAlign: "center",
            fontWeight: 600,
            outline: "none",
            marginBottom: "1rem",
            boxSizing: "border-box",
            caretColor: "#3b82f6",
            transition: "border-color 0.15s",
          }}
        />

        <div style={{ display: "flex", gap: "0.75rem" }}>
          {showCancelButton && (
            <button
              onClick={onCancel}
              style={{
                flex: 1,
                padding: "0.9rem",
                borderRadius: "0.875rem",
                background: "rgba(30,41,59,0.8)",
                border: "1px solid rgba(71,85,105,0.35)",
                color: "#64748b",
                fontSize: "0.95rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Annuler
            </button>
          )}
          <button
            onClick={() => isValid && onSave?.(username.trim())}
            style={{
              flex: showCancelButton ? 1 : undefined,
              width: showCancelButton ? undefined : "100%",
              padding: "0.9rem",
              borderRadius: "0.875rem",
              background: isValid ? "#3b82f6" : "rgba(30,41,59,0.6)",
              border: isValid ? "none" : "1px solid rgba(71,85,105,0.2)",
              color: isValid ? "white" : "#334155",
              fontSize: "0.95rem",
              fontWeight: 700,
              cursor: isValid ? "pointer" : "not-allowed",
              boxShadow: isValid ? "0 0 20px rgba(59,130,246,0.35)" : "none",
              transition: "all 0.2s",
            }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
