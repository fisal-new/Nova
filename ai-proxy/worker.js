/**
 * Nova AI proxy — Cloudflare Worker (free tier is enough).
 *
 * Why: an API key shipped inside an APK/JS bundle can be extracted in
 * seconds, so it can never be "invisible" there. This worker keeps the
 * OpenRouter key server-side; the app talks to the worker instead.
 *
 * Deploy (2 minutes, free):
 *   1. https://dash.cloudflare.com → Workers & Pages → Create Worker
 *   2. Paste this file → Deploy
 *   3. Worker Settings → Variables → add secrets:
 *        OPENROUTER_KEY = sk-or-v1-… (required)
 *        APP_SECRET = any random string (optional but recommended —
 *                     the app sends it as X-App-Secret when set in
 *                     Settings → AI → App secret)
 *   4. In Nova IDE: Settings → AI endpoint = https://<your-worker>.workers.dev/v1
 *
 * Security notes:
 * - Without APP_SECRET, anyone with the worker URL can use your quota.
 *   With it set, requests without the matching header get 403.
 *   Add Cloudflare rate limiting for public launches.
 * - Rotate the OpenRouter key if it ever leaked (dashboard → Keys).
 */

const UPSTREAM = "https://openrouter.ai/api/v1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Secret, HTTP-Referer, X-Title",
};

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    // Shared-secret auth: active whenever APP_SECRET is set server-side.
    // The app sends it as X-App-Secret (Settings → AI → App secret).
    if (env.APP_SECRET) {
      if (req.headers.get("X-App-Secret") !== env.APP_SECRET) {
        return new Response("forbidden", { status: 403, headers: CORS });
      }
    }

    // Only proxy the two endpoints the app needs — nothing else.
    const allowed =
      (url.pathname === "/v1/models" && req.method === "GET") ||
      (url.pathname === "/v1/chat/completions" && req.method === "POST");
    if (!allowed) return new Response("not found", { status: 404, headers: CORS });

    const headers = new Headers(req.headers);
    headers.set("Authorization", `Bearer ${env.OPENROUTER_KEY}`);
    headers.set("HTTP-Referer", "https://nova-ide.local");
    headers.set("X-Title", "Nova IDE (proxy)");
    headers.delete("X-App-Secret");

    const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
      method: req.method,
      headers,
      body: req.method === "POST" ? req.body : undefined,
    });

    const out = new Headers(upstream.headers);
    Object.entries(CORS).forEach(([k, v]) => out.set(k, v));
    out.delete("content-encoding");
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
