import { FolderOpen, ShieldCheck, Stethoscope } from "lucide-react";
import { useEffect, useState } from "react";
import {
  checkStorage,
  checkStorageStrict,
  openAllFilesSettings,
  requestLegacyStorage,
  storageReady,
  type StorageState,
} from "../lib/permissions";
import { apiDelete, apiListDir, apiWriteFile } from "../lib/tauri";
import { useIDE } from "../store/useIDE";

/**
 * Android storage-access banner. The #1 source of "os error 13": shared
 * folders are unreadable until the OS grants access, which only native
 * Kotlin code can request — hence this panel.
 */
export default function StorageBanner() {
  const { setRoot, notify, rootPath } = useIDE();
  const [st, setSt] = useState<StorageState | null>(null);
  const [diag, setDiag] = useState<{ label: string; ok: boolean; detail: string }[] | null>(null);
  const [testing, setTesting] = useState(false);

  const refresh = async () => setSt(await checkStorage());

  useEffect(() => {
    refresh();
  }, []);

  // Auto-request once per install: the app itself asks the OS for file
  // access on first launch instead of waiting for the user to find Grant.
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        if (localStorage.getItem("nova-perm-autoasked")) return;
        const s = await checkStorage();
        if (dead) return;
        setSt(s);
        if (s.sdk === 0 || storageReady(s)) return;
        localStorage.setItem("nova-perm-autoasked", "1");
        if (s.sdk >= 30) {
          const opened = await openAllFilesSettings();
          if (!dead) {
            notify(
              "info",
              opened
                ? "Nova needs file access — enable “All files access”, then tap Verify below."
                : "Open Settings → Apps → Nova IDE → Permissions → Files, then tap Verify.",
            );
          }
        } else {
          await requestLegacyStorage();
          // legacy dialog returns immediately; re-check shortly after
          setTimeout(async () => {
            if (dead) return;
            const next = await checkStorage();
            if (!dead) {
              setSt(next);
              if (storageReady(next)) {
                notify("success", "Storage access granted.");
                if (next.externalRoot) setRoot(next.externalRoot);
              }
            }
          }, 2500);
        }
      } catch { /* check unavailable — banner stays manual */ }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // User returns from system settings/dialog → re-verify automatically.
  useEffect(() => {
    const onBack = async () => {
      const next = await checkStorage().catch(() => null);
      if (!next) return;
      setSt((prev) => {
        if (prev && !storageReady(prev) && storageReady(next)) {
          notify("success", "Storage access granted.");
          if (next.externalRoot) setRoot(next.externalRoot);
        }
        return next;
      });
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ground-truth self test ON THIS DEVICE: plugin reachability first
  // (distinguishes "Kotlin bridge dead" from "permission denied"), then
  // permission state, listing, and a real write+delete round-trip.
  const runDiagnosis = async () => {
    setTesting(true);
    const out: { label: string; ok: boolean; detail: string }[] = [];
    try {
      const s = await checkStorageStrict();
      setSt(s);
      out.push({
        label: "Kotlin bridge",
        ok: true,
        detail: `plugin answered (sdk=${s.sdk})`,
      });
    } catch (e) {
      out.push({
        label: "Kotlin bridge",
        ok: false,
        detail: `UNREACHABLE: ${String(e).slice(0, 200)}`,
      });
      setDiag(out);
      setTesting(false);
      return;
    }
    // checkStorageStrict already refreshed state above — reuse it
    {
      const s2 = await checkStorage();
      setSt(s2);
      out.push({
        label: "Permission state",
        ok: s2.sdk === 0 || storageReady(s2),
        detail: s2.sdk === 0 ? "desktop/web — no runtime gate" : `sdk=${s2.sdk} legacy=${s2.legacyGranted} allFiles=${s2.allFilesGranted} root=${s2.externalRoot || "?"}`,
      });
    }
    try {
      const listing = await apiListDir(rootPath);
      out.push({ label: `List ${rootPath}`, ok: true, detail: `${listing.entries.length} items${listing.truncated ? " (truncated)" : ""}` });
    } catch (e) {
      out.push({ label: `List ${rootPath}`, ok: false, detail: String(e).slice(0, 200) });
    }
    const probe = `${rootPath.replace(/\/$/, "")}/.nova-write-test`;
    try {
      await apiWriteFile(probe, "test");
      await apiDelete(probe);
      out.push({ label: "Write + delete probe", ok: true, detail: "round-trip OK" });
    } catch (e) {
      out.push({ label: "Write + delete probe", ok: false, detail: String(e).slice(0, 200) });
    }
    setDiag(out);
    setTesting(false);
  };

  if (!st || st.sdk === 0) return null; // desktop/web: no runtime gate

  const ready = storageReady(st);

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
    <div style={{ padding: "0 4px" }}>
      {ready ? (
        st.externalRoot ? (
          <button
            className="tree-row"
            title="Open shared storage (SD card)"
            onClick={() => setRoot(st.externalRoot)}
          >
            <FolderOpen size={14} color="#9aa1b8" />
            <span className="fname">Shared storage</span>
          </button>
        ) : null
      ) : (
        <div className="storage-banner" role="alert">
          <ShieldCheck size={15} />
          <span>Storage access needed for shared folders (fixes os error 13)</span>
          <button className="btn btn-primary" onClick={grant}>Grant</button>
          <button className="btn" onClick={verify}>Verify</button>
        </div>
      )}
      <button
        className="tree-row"
        title="Run on-device storage diagnosis (permission, listing, write test)"
        onClick={runDiagnosis}
        disabled={testing}
      >
        <Stethoscope size={14} color="#9aa1b8" />
        <span className="fname">{testing ? "Testing…" : "Storage test"}</span>
      </button>
      {diag && (
        <div style={{ padding: "2px 4px 8px" }}>
          {diag.map((d, i) => (
            <div key={i} className="hit" style={{ cursor: "default" }}>
              <div className="hp">{d.ok ? "✓" : "✗"} {d.label}</div>
              <div className="hl" style={{ wordBreak: "break-all" }}>{d.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
