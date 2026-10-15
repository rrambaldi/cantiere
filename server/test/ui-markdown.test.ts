// Renderer dei file nella dashboard: spec server/dashboard, "Markdown formattato" e "Markdown senza codice eseguibile".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, test } from "node:test";

const richiedi = createRequire(import.meta.url);
// Nel browser arrivano come script UMD da /ui/vendor/.
Object.assign(globalThis, { markdownit: richiedi("markdown-it"), React: richiedi("react") });
const { renderToStaticMarkup } = richiedi("react-dom/server");
const { rendiMarkdown, Documento } = await import(new URL("../ui/dist/documento.js", import.meta.url).href);
const React = richiedi("react");

describe("Markdown formattato", () => {
  test("titoli, tabella, codice ed elenco diventano HTML", () => {
    const html = rendiMarkdown("## Decisioni\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```sh\nnpm ci\n```\n\n- uno\n- due\n");
    assert.match(html, /<h2>Decisioni<\/h2>/);
    assert.match(html, /<table>[\s\S]*<td>1<\/td>/);
    assert.match(html, /<pre><code class="language-sh">npm ci\n<\/code><\/pre>/);
    assert.match(html, /<li>uno<\/li>/);
    assert.doesNotMatch(html, /\|---\||```|## /);
  });

  test("le caselle dei task sono spuntate o vuote, in sola lettura", () => {
    const html = rendiMarkdown("- [x] 1.1 fatto\n- [ ] 1.2 da fare\n");
    assert.match(html, /<li class="voce-casella"><input type="checkbox" class="casella" disabled checked> 1\.1 fatto<\/li>/);
    assert.match(html, /<li class="voce-casella"><input type="checkbox" class="casella" disabled> 1\.2 da fare<\/li>/);
    assert.doesNotMatch(html, /\[x\]|\[ \]/);
  });

  test("le caselle valgono anche negli elenchi con paragrafi", () => {
    const html = rendiMarkdown("- [x] primo\n\n- [ ] secondo\n");
    assert.match(html, /<li class="voce-casella">\s*<p><input type="checkbox" class="casella" disabled checked> primo<\/p>/);
  });

  test("un .txt è testo semplice con gli a capo del file", () => {
    const html = renderToStaticMarkup(React.createElement(Documento, { percorso: "idee/appunti.txt", contenuto: "riga 1\nriga 2\n<b>x</b>" }));
    assert.equal(html, '<pre class="testo-semplice">riga 1\nriga 2\n&lt;b&gt;x&lt;/b&gt;</pre>');
    assert.match(readFileSync(new URL("../ui/static/markdown.css", import.meta.url), "utf8"), /\.testo-semplice\{[^}]*white-space:pre-wrap/);
  });

  test("un .md passa dal renderer", () => {
    const html = renderToStaticMarkup(React.createElement(Documento, { percorso: "proposal.md", contenuto: "# Proposta" }));
    assert.equal(html, '<div class="md"><h1>Proposta</h1>\n</div>');
  });
});

describe("Markdown senza codice eseguibile", () => {
  test("l'HTML dei file resta testo", () => {
    const html = rendiMarkdown("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n");
    assert.doesNotMatch(html, /<script|<img/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });

  test("un collegamento javascript: non è attivo", () => {
    const html = rendiMarkdown("[clic](javascript:alert(1)) [dati](data:text/html,x) [file](file:///etc/passwd)");
    assert.doesNotMatch(html, /<a /);
  });

  test("i collegamenti http si aprono in una scheda nuova, mailto resta com'è", () => {
    const html = rendiMarkdown("[sito](https://example.org) [posta](mailto:a@example.org)");
    assert.match(html, /<a href="https:\/\/example\.org" target="_blank" rel="noopener noreferrer">sito<\/a>/);
    assert.match(html, /<a href="mailto:a@example\.org">posta<\/a>/);
  });
});
