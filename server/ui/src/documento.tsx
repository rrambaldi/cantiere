// Mostra un file di un change o di un'idea, e lo modifica. È l'unico punto della pagina che inserisce HTML (design D6).
import { lingua, T } from "./testi.ts";
import { Icona } from "./ui.tsx";

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
      if (t[i].type !== "inline" || t[i - 1].type !== "paragraph_open" || t[i - 2].type !== "list_item_open") continue;
      const trovata = testo?.type === "text" ? CASELLA.exec(testo.content) : null;
      if (!trovata || !testo) continue;
      testo.content = testo.content.slice(trovata[0].length);
      const casella = new stato.Token("casella", "input", 0);
      casella.meta = { spuntata: trovata[1] !== " " };
      t[i].children!.unshift(casella);
      t[i - 2].attrJoin("class", "voce-casella");
    }
  });
  md.renderer.rules.casella = (tokens, idx) =>
    `<input type="checkbox" class="casella" disabled${tokens[idx].meta.spuntata ? " checked" : ""}> `;

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

let renderer: ReturnType<typeof creaRenderer> | undefined;
const md = () => (renderer ??= creaRenderer());

export function rendiMarkdown(testo: string): string {
  return md().render(testo);
}

export const eMarkdown = (percorso: string) => percorso.toLowerCase().endsWith(".md");

/** File formattato se è Markdown, testo semplice con gli a capo del file negli altri casi (.txt, .yaml). */
export function Documento({ percorso, contenuto }: { percorso: string; contenuto: string }) {
  if (!eMarkdown(percorso)) return <pre className="testo-semplice">{contenuto}</pre>;
  return <div className="md" dangerouslySetInnerHTML={{ __html: rendiMarkdown(contenuto) }} />;
}

/** Una riga di Markdown senza blocchi, per esempio il testo di un task. */
export function RigaMarkdown({ testo }: { testo: string }) {
  return <span dangerouslySetInnerHTML={{ __html: md().renderInline(testo) }} />;
}

/** Azioni statiche di EasyMDE che lavorano sull'editor, per nome. */
type AzioneEasyMDE = { [K in keyof typeof EasyMDE]: (typeof EasyMDE)[K] extends (e: EasyMDE) => void ? K : never }[keyof typeof EasyMDE];
type Voce = keyof typeof T.barra;
/** Azione, nome del pulsante per EasyMDE (lo usa per accenderlo e per trovarlo) e voce: icona e titolo. */
const BARRA: ([AzioneEasyMDE, string, Voce] | "|")[] = [
  ["toggleBold", "bold", "grassetto"], ["toggleItalic", "italic", "corsivo"], ["toggleHeadingSmaller", "heading-smaller", "titolo"], "|",
  ["toggleUnorderedList", "unordered-list", "elenco"], ["toggleOrderedList", "ordered-list", "elencoNumerato"],
  ["toggleCheckList", "check-list", "caselle"], ["toggleBlockquote", "quote", "citazione"], ["toggleCodeBlock", "code", "codice"],
  ["drawLink", "link", "collegamento"], "|", ["togglePreview", "preview", "anteprima"], ["toggleSideBySide", "side-by-side", "affiancato"],
];
const VOCI = BARRA.filter((v) => v !== "|");
// Come in EasyMDE: durante l'anteprima restano attivi solo questi, per poterne uscire.
const ATTIVI_IN_ANTEPRIMA = ["preview", "side-by-side"];

/**
 * Il campo per modificare un file: EasyMDE lo trasforma in editor con barra e anteprima, e l'anteprima passa da
 * rendiMarkdown come il documento mostrato. Senza EasyMDE (nei test, o se lo script non arriva) resta il textarea.
 */
export function EditorMarkdown({ valore, onCambia, fermo, etichetta }: {
  valore: string; onCambia: (testo: string) => void; fermo: boolean; etichetta: string;
}) {
  const campo = React.useRef<HTMLTextAreaElement>(null);
  const [editor, setEditor] = React.useState<EasyMDE | null>(null);
  const cambia = React.useRef(onCambia);
  cambia.current = onCambia;
  // Cambiando lingua l'editor si ricrea con i titoli nuovi; il testo resta, passa dal textarea.
  React.useEffect(() => {
    if (typeof EasyMDE === "undefined") return;
    const e = new EasyMDE({
      element: campo.current!, autofocus: true, minHeight: "50vh", status: false, sideBySideFullscreen: false,
      // FontAwesome e i dizionari del correttore arriverebbero da CDN: la CSP li blocca. Le icone le mette React.
      autoDownloadFontAwesome: false, spellChecker: false, nativeSpellcheck: true,
      previewClass: ["editor-preview", "md"], previewRender: rendiMarkdown,
      // Schermo intero e immagini non sono nella barra: niente scorciatoie nascoste.
      shortcuts: { toggleFullScreen: null, drawImage: null },
      toolbar: BARRA.map((v) => (v === "|" ? v
        : { name: v[1], action: EasyMDE[v[0]], className: v[1], title: T.barra[v[2]], noDisable: ATTIVI_IN_ANTEPRIMA.includes(v[1]) })),
    });
    // Tab e Shift-Tab spostano il fuoco come in un campo normale, invece di rientrare il testo: niente trappola per la tastiera.
    e.codemirror.setOption("extraKeys", { ...(e.codemirror.getOption("extraKeys") as object), Tab: false, "Shift-Tab": false });
    e.codemirror.on("change", () => cambia.current(e.value()));
    e.codemirror.getInputField().setAttribute("aria-label", etichetta);
    setEditor(e);
    return () => {
      e.cleanup();
      e.toTextArea();
    };
  }, [lingua]);
  React.useEffect(() => editor?.codemirror.setOption("readOnly", fermo), [editor, fermo]);
  const bottoni = editor ? [...editor.codemirror.getWrapperElement().parentElement!.querySelectorAll(".editor-toolbar button")] : [];
  // EasyMDE aggiunge i suoi nodi accanto al textarea: il div resta di React, così React lo toglie intero.
  return (
    <div className="editor-markdown" aria-busy={fermo}>
      <textarea ref={campo} className="modifica-documento" aria-label={etichetta} value={valore} readOnly={fermo}
        onChange={(e) => onCambia(e.target.value)} autoFocus />
      {bottoni.map((b, i) => ReactDOM.createPortal(<Icona nome={VOCI[i][2]} />, b, VOCI[i][2]))}
    </div>
  );
}
