import { useState } from "react";
import { languageForPath, languageInfo } from "../lib/tauri";

// Bundled official colored logos (devicons, MIT) — offline-safe.
const modules = import.meta.glob<string>("../assets/logos/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});
const LOGOS: Record<string, string> = {};
for (const [p, url] of Object.entries(modules)) {
  const id = p.split("/").pop()?.replace(/\.svg$/, "");
  if (id && typeof url === "string") LOGOS[id] = url;
}

const MONOGRAM: Record<string, string> = {
  ini: "⚙",
  plaintext: "T",
};

/** Real colored language logo on a soft tile; monogram badge fallback. */
export default function LanguageIcon({
  path,
  lang,
  size = 20,
}: {
  path?: string;
  lang?: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const id = lang ?? (path ? languageForPath(path).id : "plaintext");
  const info = languageInfo(id) ?? languageInfo("plaintext")!;
  const logo = LOGOS[id];

  if (logo && !broken) {
    return (
      <img
        src={logo}
        alt={info.name}
        title={info.name}
        width={size}
        height={size}
        draggable={false}
        onError={() => setBroken(true)}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          background: "linear-gradient(180deg, #ffffff, #dde2ef)",
          padding: size * 0.14,
          boxShadow: "0 3px 10px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.7)",
          flexShrink: 0,
          userSelect: "none",
        }}
      />
    );
  }

  const label = MONOGRAM[id] ?? id.slice(0, 2).toUpperCase();
  const fs = size < 18 ? 8 : 10;
  return (
    <span
      title={info.name}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        background: `linear-gradient(135deg, ${info.color}cc, ${info.color}55)`,
        boxShadow: `0 3px 10px ${info.color}44, inset 0 1px 0 rgba(255,255,255,.35)`,
        color: "#fff",
        fontSize: fs,
        fontWeight: 800,
        display: "inline-grid",
        placeItems: "center",
        flexShrink: 0,
        textShadow: "0 1px 3px rgba(0,0,0,.5)",
      }}
    >
      {label}
    </span>
  );
}
