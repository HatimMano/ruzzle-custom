interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

export default function ConfirmModal({
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Oui, je pars",
  cancelLabel = "Continuer",
}: Props) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      padding: "0 1rem 2rem",
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        width: "100%", maxWidth: "28rem",
        background: "#111827",
        border: "1px solid rgba(71,85,105,0.4)",
        borderRadius: "1.5rem",
        padding: "1.5rem",
        display: "flex", flexDirection: "column", gap: "1.25rem",
      }}>
        <p style={{ fontSize: "1rem", fontWeight: 600, color: "white", lineHeight: 1.5, textAlign: "center" }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "0.85rem",
              borderRadius: "1rem",
              background: "rgba(30,41,59,0.8)",
              border: "1px solid rgba(71,85,105,0.4)",
              color: "#94a3b8", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: "0.85rem",
              borderRadius: "1rem",
              background: "rgba(185,28,28,0.3)",
              border: "1px solid rgba(185,28,28,0.5)",
              color: "#fca5a5", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
