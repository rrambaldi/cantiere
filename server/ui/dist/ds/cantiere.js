// Dal design system forgia (components/cantiere/Nastro.jsx): al massimo uno per schermata.
export function Nastro({ altezza = 8 }) {
    return React.createElement("div", { "aria-hidden": "true", style: { height: altezza, background: "var(--nastro)", flex: "none" } });
}
