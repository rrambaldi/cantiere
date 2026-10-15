// Mostra un file di un change o di un'idea. È l'unico punto della pagina che inserisce HTML (design D6).
const SCHEMI_AMMESSI = /^(https?:|mailto:)/i;
const CASELLA = /^\[([ xX])\]\s+/;
function creaRenderer() {
    // html: false fa diventare testo l'HTML scritto nei file; linkify e typographer restano spenti.
    const md = markdownit({ html: false, linkify: false, typographer: false });
    md.validateLink = (url) => SCHEMI_AMMESSI.test(url.trim());
    // Caselle dei task: "- [x] ..." diventa una casella spuntata, in sola lettura.
    md.core.ruler.push("caselle", (stato) => {
        const t = stato.tokens;
        for (let i = 2; i < t.length; i++) {
            const testo = t[i].children?.[0];
            if (t[i].type !== "inline" || t[i - 1].type !== "paragraph_open" || t[i - 2].type !== "list_item_open")
                continue;
            const trovata = testo?.type === "text" ? CASELLA.exec(testo.content) : null;
            if (!trovata || !testo)
                continue;
            testo.content = testo.content.slice(trovata[0].length);
            const casella = new stato.Token("casella", "input", 0);
            casella.meta = { spuntata: trovata[1] !== " " };
            t[i].children.unshift(casella);
            t[i - 2].attrJoin("class", "voce-casella");
        }
    });
    md.renderer.rules.casella = (tokens, idx) => `<input type="checkbox" class="casella" disabled${tokens[idx].meta.spuntata ? " checked" : ""}> `;
    // I collegamenti esterni si aprono in una scheda nuova, senza accesso alla dashboard.
    const apri = md.renderer.rules.link_open ?? ((tokens, idx, opzioni, _env, self) => self.renderToken(tokens, idx, opzioni));
    md.renderer.rules.link_open = (tokens, idx, opzioni, env, self) => {
        if (/^https?:/i.test(tokens[idx].attrGet("href") ?? "")) {
            tokens[idx].attrSet("target", "_blank");
            tokens[idx].attrSet("rel", "noopener noreferrer");
        }
        return apri(tokens, idx, opzioni, env, self);
    };
    return md;
}
let renderer;
export function rendiMarkdown(testo) {
    renderer ??= creaRenderer();
    return renderer.render(testo);
}
export const eMarkdown = (percorso) => percorso.toLowerCase().endsWith(".md");
/** File formattato se è Markdown, testo semplice con gli a capo del file negli altri casi (.txt, .yaml). */
export function Documento({ percorso, contenuto }) {
    if (!eMarkdown(percorso))
        return React.createElement("pre", { className: "testo-semplice" }, contenuto);
    return React.createElement("div", { className: "md", dangerouslySetInnerHTML: { __html: rendiMarkdown(contenuto) } });
}
