// Smoke-test entry: pure logic only (no DOM, no Tauri invoke at import).
// Bundled with esbuild, executed with plain node + assert.
export { outlineSymbols, detectLanguage, languageForPath } from "../src/lib/tauri";
export { splitArgs } from "../src/store/useIDE";
export { safeWebUrl, pageToText } from "../src/store/useAI";
export { shade } from "../src/store/useIDE";
export { scrub, reportError, getQueueLength, formatDiscord, setReportEndpoint, flushQueue } from "../src/lib/reporter";
