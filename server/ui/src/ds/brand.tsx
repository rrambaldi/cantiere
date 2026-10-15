// Dal design system forgia (components/brand/Logo.jsx).
const A48 = "M3 20L44 20L44 26L35 26L31 33L37 39L40 39L40 44L12 44L12 39L15 39L21 33L17 26Z";

export function Logo({ size = 32, wordmark = false }: { size?: number; wordmark?: boolean }) {
  const svg = (
    <svg viewBox="0 0 48 48" width={size} height={size} style={{ display: "block", flex: "none" }} aria-hidden="true">
      <path fill="var(--segno)" d={A48} />
      <rect x="17" y="12" width="18" height="5" fill="var(--segnale)" />
    </svg>
  );
  if (!wordmark) return <span role="img" aria-label="forgia" style={{ display: "inline-flex" }}>{svg}</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.25) }}>
      {svg}
      <span style={{ font: `600 ${Math.round(size * 0.72)}px/1 var(--font-mono)`, letterSpacing: "-.04em", color: "var(--testo)" }}>forgia</span>
    </span>
  );
}
