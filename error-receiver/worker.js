/**
 * Nova IDE error-report receiver — Cloudflare Worker (free).
 *
 * The app POSTs every error as JSON (see src/lib/reporter.ts). This worker
 * optionally checks a shared secret and forwards to Discord (or any
 * webhook), so "send me the full error" is one tap in the app.
 *
 * Deploy:
 *   1. Workers & Pages → Create Worker → paste this file → Deploy
 *   2. Settings → Variables → secrets:
 *        APP_SECRET = any random string (must match what users type? No —
 *                     the Nova app sends none; this secret is for YOUR dashboard
 *                     calls only. Leave unset to accept all app reports.)
 *        DISCORD_WEBHOOK = https://discord.com/api/webhooks/… (optional;
 *                     without it, reports are only logged `console.log`)
 *   3. In Nova IDE: Settings → Error reports → Server URL =
 *        https://<your-worker>.workers.dev/report
 *   4. Press "Send test" in the app — it should arrive in Discord/logs.
 */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
    if (url.pathname !== "/report" || req.method !== "POST") {
      return new Response("nova error receiver: POST /report", { status: 404 });
    }
    // Active by default: forged reports cost quota and can mention-spam
    // Discord, so requests without the shared secret are rejected whenever
    // the worker owner configured one (header first, JSON field fallback).
    if (env.APP_SECRET) {
      const headerSecret = req.headers.get("X-App-Secret") ?? "";
      const text = await req.text();
      let bodySecret = "";
      try {
        bodySecret = JSON.parse(text)?.appSecret ?? "";
      } catch { /* fall through to 403 */ }
      if (headerSecret !== env.APP_SECRET && bodySecret !== env.APP_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      try {
        report = JSON.parse(text);
      } catch {
        return new Response("bad json", { status: 400 });
      }
    } else {
      try {
        report = await req.json();
      } catch {
        return new Response("bad json", { status: 400 });
      }
    }
    console.log("NOVA-REPORT", JSON.stringify(report).slice(0, 8000));

    if (env.DISCORD_WEBHOOK) {
      const level = report.level || "error";
      const emoji = level === "fatal" ? "🔥" : level === "test" ? "🧪" : "🚨";
      await fetch(env.DISCORD_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // allowed_mentions.parse: [] — report text is untrusted; a forged
          // report must never be able to ping @everyone/@here.
          allowed_mentions: { parse: [] },
          content:
            `${emoji} Nova IDE [${level}] v${report?.app?.version ?? "?"} — ` +
            `${report?.device?.platform ?? "?"} — ${report?.at ?? ""}\n` +
            "```" +
            `${String(report?.message ?? "").slice(0, 1500)}\n` +
            `state: ${JSON.stringify(report?.state ?? {}).slice(0, 500)}` +
            "```",
        }),
      }).catch(() => {});
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
