// Nova IDE logic smoke tests — runs against the REAL bundled source
// (esbuild bundle of src/, executed in node). Fails the build on regress.
import assert from "node:assert/strict";
import {
  outlineSymbols,
  detectLanguage,
  languageForPath,
  splitArgs,
  safeWebUrl,
  pageToText,
  shade,
  scrub,
  reportError,
  getQueueLength,
  formatDiscord,
  setReportEndpoint,
  flushQueue,
} from "/tmp/nova-lib.cjs";
import http from "node:http";

// node has no localStorage — stub it so queue persistence is exercised too
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => void _store.set(k, String(v)),
  removeItem: (k) => void _store.delete(k),
};

let n = 0;
const ok = (cond, msg) => {
  n++;
  assert.ok(cond, msg);
};

// --- outlineSymbols: 60-cap actually works (was a real bug once) ---
const big = Array.from({ length: 500 }, (_, i) => `def fn_${i}():\n    pass`).join("\n");
ok(outlineSymbols(big, "python").length <= 60, "outline caps at 60");
const syms = outlineSymbols("def hello():\n    pass\nclass World:\n    pass\n", "python");
ok(syms.some((s) => s.includes("hello")), "finds def");
ok(syms.some((s) => s.includes("World")), "finds class");
ok(syms.every((s) => /^\d+: /.test(s)), "line-prefixed format");

// --- language detection ---
ok(detectLanguage("a.py") === "python", "py");
ok(detectLanguage("a.rs") === "rust", "rs");
ok(detectLanguage("a.tsx") === "typescript", "tsx");
ok(detectLanguage("a.go") === "go", "go");
ok(detectLanguage("a.kt") === "kotlin", "kt");
ok(detectLanguage("a.java") === "java", "java");
ok(detectLanguage("a.xyz") === "plaintext", "unknown falls back");
ok(languageForPath("nope.unknown").id === "plaintext", "info fallback");

// --- splitArgs quoting ---
assert.deepEqual(splitArgs('echo "a b" c'), ["echo", "a b", "c"]);
assert.deepEqual(splitArgs("echo 'a b'"), ["echo", "a b"]);
assert.deepEqual(splitArgs("  git   status  "), ["git", "status"]);
assert.deepEqual(splitArgs('run "a\\"b"'), ["run", 'a"b']);
ok(splitArgs("").length === 0, "empty");

// --- safeWebUrl SSRF guard ---
ok(safeWebUrl("https://example.com/x") !== null, "public https ok");
ok(safeWebUrl("http://example.com/") !== null, "public http ok");
for (const bad of [
  "http://localhost:1420/",
  "http://127.0.0.1/",
  "http://10.0.0.5/",
  "http://192.168.1.1/",
  "http://172.16.0.1/",
  "http://169.254.169.254/",
  "ftp://example.com/",
  "file:///etc/passwd",
  "not a url",
]) {
  ok(safeWebUrl(bad) === null, `blocked: ${bad}`);
}

// --- pageToText ---
const t = pageToText('<html><head><style>a{}</style><script>x</script></head><body><h1>Hi &amp; bye</h1><p>a  b</p></body></html>');
ok(!t.includes("<") && t.includes("Hi & bye"), "strips tags, decodes entities");

// --- shade helper ---
ok(shade("#00d4ff", -45).toLowerCase() !== "#00d4ff", "darkens");
ok(/^#[0-9a-f]{6}$/i.test(shade("#ff0000", -50)), "valid hex out");
ok(shade("nope", -10) === "nope", "passthrough garbage");

// --- reporter: secrets scrubbed, never throws, works without DOM ---
ok(scrub("key sk-or-v1-abc123XYZ hidden").includes("[REDACTED-KEY]"), "scrubs keys");
ok(!scrub("plain text").includes("REDACTED"), "leaves clean text");
ok(typeof getQueueLength() === "number", "queue readable without DOM");

// --- reporter: real POST to a local server (proves the send path) ---
// NOTE: endpoint FIRST — reportError auto-flushes, and with no custom
// endpoint that flush goes to the built-in channel by design.
const received = [];
const srv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push({ url: req.url, body });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
  });
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;
setReportEndpoint(`http://127.0.0.1:${port}/r`);
const rep = reportError("test", new Error("boom"), { by: "smoke" });
ok(rep && rep.level === "test" && rep.message === "boom", "builds report offline");
reportError("error", new Error("smoke-delivery sk-or-v1-SECRET999"), { by: "smoke" });
await new Promise((r) => setTimeout(r, 1500));
const fr = await flushQueue();
ok(received.length >= 1, "server got the POST");
ok(fr.pending === 0, "queue drained");
const payload = JSON.parse(received[received.length - 1].body);
ok(payload.message && !JSON.stringify(payload).includes("SECRET999"), "secret scrubbed in transit");
ok(payload.app && payload.device && payload.state !== undefined, "full detail envelope");
// --- reporter: dead endpoint queues instead of losing ---
setReportEndpoint("http://127.0.0.1:1/closed");
reportError("error", new Error("offline-queue-check"), { by: "smoke" });
await new Promise((r) => setTimeout(r, 800));
const fr2 = await flushQueue();
ok(fr2.pending >= 1 && fr2.sent === 0, "dead endpoint keeps queue");
srv.close();
setReportEndpoint("");

// --- discord formatting ---
const dc = formatDiscord({ level: "fatal", message: "x", app: { version: "0" }, device: {}, state: {} });
ok(typeof dc.content === "string" && dc.content.includes("Nova IDE"), "discord wrap");

console.log(`smoke: ${n} assertions passed`);
