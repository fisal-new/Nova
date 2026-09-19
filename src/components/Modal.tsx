import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useIDE } from "../store/useIDE";

/** In-app prompt/confirm dialog — native prompt()/confirm() are broken
 *  or missing in Android WebViews, so we never use them. */
export default function Modal() {
  const { modal, resolveModal } = useIDE();
  const [val, setVal] = useState("");

  useEffect(() => {
    setVal(modal?.initial ?? "");
  }, [modal]);

  if (!modal) return null;
  const isPrompt = modal.kind === "prompt";

  const submit = () => {
    if (isPrompt) resolveModal(val.trim() === "" ? null : val.trim());
    else resolveModal(true);
  };

  // NOTE: no overlay-tap / Escape dismiss on purpose — an accidental tap
  // outside used to silently DENY AI approvals and file deletes.
  return (
    <div className="overlay">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={modal.title}
      >
        {modal.danger && <AlertTriangle size={20} color="#ff6369" />}
        <h3>{modal.title}</h3>
        {isPrompt && (
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              // destructive confirms need an explicit button (no accidents);
              // plain prompts keep keyboard-cancel for desktop users
              if (e.key === "Escape" && (isPrompt || !modal.danger)) {
                resolveModal(isPrompt ? null : false);
              }
            }}
            spellCheck={false}
          />
        )}
        <div className="modal-actions">
          <button className="btn" onClick={() => resolveModal(isPrompt ? null : false)}>
            Cancel
          </button>
          <button
            className={`btn ${modal.danger ? "btn-danger" : "btn-primary"}`}
            onClick={submit}
          >
            {isPrompt ? "Create" : modal.danger ? "Delete" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
