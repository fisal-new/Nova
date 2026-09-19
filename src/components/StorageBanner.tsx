import { FolderOpen, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import {
  checkStorage,
  openAllFilesSettings,
  requestLegacyStorage,
  storageReady,
  type StorageState,
} from "../lib/permissions";
import { useIDE } from "../store/useIDE";

/**
 * Android storage-access banner. The #1 source of "os error 13": shared
 * folders are unreadable until the OS grants access, which only native
 * Kotlin code can request — hence this panel.
 */
export default function StorageBanner() {
  const { setRoot, notify } = useIDE();
  const [st, setSt] = useState<StorageState | null>(null);

  const refresh = async () => setSt(await checkStorage());

  useEffect(() => {
    refresh();
  }, []);

  if (!st || st.sdk === 0) return null; // desktop/web: no runtime gate

  if (storageReady(st)) {
    if (!st.externalRoot) return null;
    return (
      <button
        className="tree-row"
        title="Open shared storage (SD card)"
        onClick={() => setRoot(st.externalRoot)}
      >
        <FolderOpen size={14} color="#9aa1b8" />
        <span className="fname">Shared storage</span>
      </button>
    );
  }

  const grant = async () => {
    if (st.sdk >= 30) {
      const opened = await openAllFilesSettings();
      if (!opened) {
        // exotic ROMs (MIUI/EMUI) sometimes block the intent entirely
        notify(
          "error",
          "System refused to open settings — grant access manually: Settings → Apps → Nova IDE → Permissions → Files.",
        );
        return;
      }
      notify("info", "Enable “All files access” for Nova IDE, then tap Verify.");
    } else {
      await requestLegacyStorage();
      notify("info", "Grant storage in the system dialog, then tap Verify.");
    }
  };

  const verify = async () => {
    const next = await checkStorage();
    setSt(next);
    if (storageReady(next)) {
      notify("success", "Storage access granted.");
      if (next.externalRoot) setRoot(next.externalRoot);
    } else {
      notify("error", "Still blocked — enable access in system settings first.");
    }
  };

  return (
    <div className="storage-banner" role="alert">
      <ShieldCheck size={15} />
      <span>Storage access needed for shared folders (fixes os error 13)</span>
      <button className="btn btn-primary" onClick={grant}>Grant</button>
      <button className="btn" onClick={verify}>Verify</button>
    </div>
  );
}
