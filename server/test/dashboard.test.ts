import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { CSP } from "../src/ui.ts";
import { apri, avvia, changeAttivo, copia, evento, invia, richiesta, stop, ui, type Banco } from "./aiuto.ts";

let cartella: string;
let b: Banco;
let priv: Awaited<ReturnType<Banco["altroCommittente"]>>;
before(async () => {
  cartella = await mkdtemp(join(tmpdir(), "forgia-ui-"));
  await mkdir(join(cartella, "static"));
  await mkdir(join(cartella, "dist", "ds"), { recursive: true });
  await writeFile(join(cartella, "static", "index.html"), '<meta name="forgia-committente" content="{{COMMITTENTE}}"><script type="module" src="ui/dist/app.js"></script>');
  await writeFile(join(cartella, "static", "forgia.css"), ":root{}");
  await writeFile(join(cartella, "dist", "ds", "Logo.js"), "export {};");
  b = await avvia({}, cartella);
  priv = await b.altroCommittente("PRIV", ["mercurius"]);
});
after(async () => {
  await b.chiudi();
  await rm(cartella, { recursive: true, force: true });
});

const post = (percorso: string, corpo: object, headers: Record<string, string> = {}) => ui(b, percorso, { method: "POST", body: JSON.stringify(corpo), headers });

describe("rotte della dashboard", () => {
  test("certificato: 403 senza header, con NONE, con il solo Bearer; 200 con SUCCESS", async () => {
    assert.equal((await ui(b, "/", { certificato: false })).status, 403);
    assert.equal((await ui(b, "/", { certificato: false, headers: { "x-ssl-client-verify": "NONE" } })).status, 403);
    assert.equal((await ui(b, "/ui/api/albero", { certificato: false, headers: { authorization: `Bearer ${b.token}` } })).status, 403);
    const pagina = await ui(b, "/");
    assert.equal(pagina.status, 200);
    assert.equal(pagina.headers.get("content-security-policy"), CSP);
    assert.match(pagina.corpo, /content=""/);
  });

  test("filtro per committente: maiuscole indifferenti, nome canonico nella pagina; 404 per inesistenti e percorsi profondi", async () => {
    for (const p of ["/PRIV", "/priv"]) assert.match((await ui(b, p)).corpo, /content="PRIV"/);
    assert.equal((await ui(b, "/PRIV/mercurius")).status, 404);
    assert.equal((await ui(b, "/nessuno")).status, 404);
    const conBarra = await ui(b, "/PRIV/");
    assert.deepEqual([conBarra.status, conBarra.headers.get("location")], [301, "../PRIV"]);
  });

  test("file statici, compilati e vendor; niente uscita dalla cartella", async () => {
    const css = await ui(b, "/ui/static/forgia.css");
    assert.deepEqual([css.status, css.headers.get("content-type")], [200, "text/css; charset=utf-8"]);
    assert.equal((await ui(b, "/ui/dist/ds/Logo.js")).headers.get("content-type"), "text/javascript; charset=utf-8");
    for (const nome of ["react.production.min.js", "react-dom.production.min.js", "markdown-it.min.js"]) {
      const r = await ui(b, `/ui/vendor/${nome}`);
      assert.deepEqual([r.status, r.headers.get("content-type")], [200, "text/javascript; charset=utf-8"], nome);
    }
    assert.equal((await ui(b, "/ui/vendor/lodash.js")).status, 404);
    assert.equal((await ui(b, "/ui/static/..%2F..%2Fpackage.json")).status, 404);
    assert.equal((await ui(b, "/ui/static/mancante.css")).status, 404);
  });

  test("scritture solo dalla pagina: JSON, X-Forgia-UI e origine ammessa", async () => {
    const senzaHeader = await ui(b, "/ui/api/committenti", { method: "POST", body: "{}", headers: { "x-forgia-ui": "" } });
    assert.equal(senzaHeader.status, 403);
    const form = await ui(b, "/ui/api/committenti", { method: "POST", body: "nome=X", headers: { "content-type": "application/x-www-form-urlencoded" } });
    assert.equal(form.status, 403);
    assert.equal((await post("/ui/api/committenti", { nome: "Estraneo" }, { origin: "https://attacco.example" })).status, 403);
    assert.equal((await post("/ui/api/committenti", { nome: "Locale" }, { origin: b.url })).status, 200);
  });

  test("certificato spento e header configurabile", async () => {
    const off = await avvia({ ui_certificato: "off" }, cartella);
    const altro = await avvia({ ui_header_certificato: "X-Client-Verify" }, cartella);
    try {
      assert.equal((await ui(off, "/", { certificato: false })).status, 200);
      assert.equal((await ui(altro, "/")).status, 403);
      assert.equal((await ui(altro, "/", { certificato: false, headers: { "x-client-verify": "SUCCESS" } })).status, 200);
    } finally {
      await off.chiudi();
      await altro.chiudi();
    }
  });
});

describe("API della dashboard", () => {
  test("committenti: token mostrato una volta, rigenerazione, niente creazione nella vista ristretta", async () => {
    const creato = await post("/ui/api/committenti", { nome: "DGT" });
    assert.equal(creato.status, 200);
    const { committente, token } = creato.corpo;
    assert.equal((await richiesta(b, "/api/v1/salute", {}, token)).corpo.cliente, "DGT");
    const albero = JSON.stringify((await ui(b, "/ui/api/albero")).corpo);
    assert.ok(!albero.includes(token));
    assert.equal((await post("/ui/api/committenti", { nome: "dgt" })).status, 409);
    assert.equal((await post("/ui/api/committenti", { nome: "api" })).status, 422);
    const nuovo = (await post(`/ui/api/committenti/${committente.id}/rigenera`, {})).corpo.token;
    assert.equal((await richiesta(b, "/api/v1/salute", {}, token)).status, 401);
    assert.equal((await richiesta(b, "/api/v1/salute", {}, nuovo)).status, 200);
    assert.equal((await post("/ui/api/committenti", { nome: "Altro" }, { "x-forgia-committente": "PRIV" })).status, 403);
    assert.equal((await post(`/ui/api/committenti/${committente.id}/rigenera`, {}, { "x-forgia-committente": "PRIV" })).status, 404);
  });

  test("albero, idee con file, dettaglio, attività non censite, esiti", async () => {
    const progetto = (await post(`/ui/api/committenti/${b.committente.id}/progetti`, { nome: "poker" })).corpo.progetto;
    assert.deepEqual([progetto.nome, progetto.slug], ["poker", "poker"]);
    const idea = (await post(`/ui/api/progetti/${progetto.id}/idee`, { nome: "iDOC converter", descrizione: "conversione" })).corpo.cantiere;
    assert.deepEqual([idea.stato, idea.change], ["idea", "idoc-converter"]);
    assert.deepEqual((await post(`/ui/api/cantieri/${idea.id}/file`, { nome: "nota.md", contenuto: "# Nota" })).corpo, { file: { nome: "nota.md", byte: 6 } });
    await post(`/ui/api/cantieri/${idea.id}/file`, { nome: "via.txt", contenuto: "x" });
    assert.deepEqual((await post(`/ui/api/cantieri/${idea.id}/file/elimina`, { nome: "via.txt" })).corpo, {});
    assert.equal((await post(`/ui/api/cantieri/${idea.id}/modifica`, { descrizione: "conversione dei PDF" })).corpo.cantiere.descrizione, "conversione dei PDF");
    const fase = (await post(`/ui/api/progetti/${progetto.id}/idee`, { nome: "prototipo", padre_id: idea.id })).corpo.cantiere;
    assert.equal(fase.percorso, "iDOC converter/prototipo");

    const dettaglioIdea = (await ui(b, `/ui/api/cantieri/${idea.id}`)).corpo;
    assert.deepEqual(dettaglioIdea.file, [{ percorso: "idee/nota.md", contenuto: "# Nota" }]);
    assert.deepEqual(dettaglioIdea.discendenti_attivi, ["iDOC converter/prototipo"]);

    const inPoker = { progetto: "poker" };
    await apri(b, "s1", "export-pdf", "utente", inPoker);
    await invia(b, evento("todo", { strumento: "TodoWrite", completo: true, todos: [{ id: null, testo: "rendere i PDF", stato: "in_progress" }] }, { session_id: "s1", ...inPoker }));
    await copia(b, { attivi: [changeAttivo("export-pdf", { "proposal.md": "# Export", "tasks.md": "- [x] a" })], archiviati: [] }, "poker");
    await invia(b, evento("stop", stop("lavoro sciolto"), { session_id: "s2", ...inPoker }));

    const albero = (await ui(b, "/ui/api/albero")).corpo.committenti;
    const cv = albero.find((c: any) => c.nome === "CVSTUDIO");
    const poker = cv.progetti.find((p: any) => p.nome === "poker");
    assert.deepEqual(Object.keys(cv).sort(), ["creato_il", "id", "nome", "progetti", "token_il"]);
    assert.equal(poker.non_censite, 1);
    assert.deepEqual(poker.cantieri.map((c: any) => c.percorso).sort(), ["export-pdf", "iDOC converter", "iDOC converter/prototipo"]);
    const ristretto = (await ui(b, "/ui/api/albero?committente=priv")).corpo.committenti;
    assert.deepEqual(ristretto.map((c: any) => c.nome), ["PRIV"]);

    const exportPdf = poker.cantieri.find((c: any) => c.percorso === "export-pdf");
    const dettaglio = (await ui(b, `/ui/api/cantieri/${exportPdf.id}`)).corpo;
    assert.deepEqual(dettaglio.file.map((f: any) => f.percorso), ["proposal.md", "tasks.md"]);
    assert.deepEqual(dettaglio.todo.map((t: any) => [t.testo, t.host]), [["rendere i PDF", "portatile"]]);
    assert.deepEqual(dettaglio.esiti.map((e: any) => e.stato), ["aperto"]);
    assert.equal((await ui(b, `/ui/api/cantieri/${exportPdf.id}`, { headers: { "x-forgia-committente": "PRIV" } })).status, 404);

    const sciolte = (await ui(b, `/ui/api/progetti/${progetto.id}/non-censite`)).corpo.sessioni;
    assert.deepEqual(sciolte.map((s: any) => [s.session_id, s.titolo]), [["s2", "lavoro sciolto"]]);

    const sospeso = await post(`/ui/api/cantieri/${exportPdf.id}/esito`, { azione: "sospendi" });
    assert.deepEqual(sospeso.corpo.cantieri.map((c: any) => [c.percorso, c.stato]), [["export-pdf", "sospeso"]]);
    assert.equal((await post(`/ui/api/cantieri/${exportPdf.id}/esito`, { azione: "completa" })).status, 422);
    assert.equal((await post(`/ui/api/cantieri/${exportPdf.id}/esito`, { azione: "sospendi" })).status, 409);
    const abbandono = await post(`/ui/api/cantieri/${idea.id}/esito`, { azione: "abbandona" });
    assert.deepEqual(abbandono.corpo.cantieri.map((c: any) => c.stato), ["abbandonato", "abbandonato"]);
    assert.equal((await ui(b, "/ui/api/inesistente")).status, 404);
    assert.equal((await post(`/ui/api/progetti/${progetto.id}/idee`, { nome: "x" }, { "x-forgia-committente": "PRIV" })).status, 404);
  });
});
