import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useIDE } from "../store/useIDE";

const ICONS = {
  error: <AlertCircle size={15} color="#ff8a8f" />,
  info: <Info size={15} color="#9aa1b8" />,
  success: <CheckCircle2 size={15} color="#3dd68c" />,
};

/** Small auto-dismissing notifications for real errors (not just status text). */
export default function Toasts() {
  const { toasts, dismissToast } = useIDE();
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {ICONS[t.kind]}
          <span>{t.msg}</span>
          <button className="icon-btn" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
