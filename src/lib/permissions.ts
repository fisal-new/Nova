import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri";

export interface StorageState {
  sdk: number;
  legacyGranted: boolean;
  allFilesGranted: boolean;
  externalRoot: string;
}

const OFF: StorageState = { sdk: 0, legacyGranted: false, allFilesGranted: false, externalRoot: "" };

/** Raw plugin calls — the Rust side forwards to Kotlin on Android. */
export async function checkStorage(): Promise<StorageState> {
  if (!isTauri) return OFF;
  try {
    const s = await invoke<StorageState>("plugin:permissions|check_storage", {});
    return { ...OFF, ...s };
  } catch {
    return OFF;
  }
}

export async function requestLegacyStorage(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    await invoke("plugin:permissions|request_legacy_storage", {});
    return true;
  } catch {
    return false;
  }
}

export async function openAllFilesSettings(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    const r = await invoke<boolean>("plugin:permissions|open_all_files_settings", {});
    return r === true;
  } catch {
    return false;
  }
}

/** True when the app can freely read outside its own folder. */
export function storageReady(s: StorageState): boolean {
  if (s.sdk === 0) return true; // desktop / unknown: no runtime gate
  if (s.sdk >= 30) return s.allFilesGranted;
  return s.legacyGranted;
}
