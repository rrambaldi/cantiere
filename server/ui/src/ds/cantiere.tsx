// Dal design system forgia (components/cantiere/Nastro.jsx): al massimo uno per schermata.
export function Nastro({ altezza = 8 }: { altezza?: number }) {
  return <div aria-hidden="true" style={{ height: altezza, background: "var(--nastro)", flex: "none" }} />;
}
