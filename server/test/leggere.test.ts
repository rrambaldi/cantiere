import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { di } from "../src/ambito.ts";
import { creaProgetto } from "../src/dominio.ts";
import { aggiungiFile, creaIdea } from "../src/idee.ts";
import { apertura, apri, avvia, cantiere, changeAttivo, copia, evento, invia, richiesta, type Banco } from "./aiuto.ts";

const file = (progetto: string, percorso: string, nome?: string) =>
  `/api/v1/progetti/${progetto}/cantieri/${percorso.split("/").map(encodeURIComponent).join("/")}/file${nome === undefined ? "" : `?nome=${encodeURIComponent(nome)}`}`;

describe("lettura dei file e ricerca", () => {
  let b: Banco;
  let altro: { token: string };
  let client: Client;
  before(async () => {
    b = await avvia({ max_file: 1000 });
    const ambito = di(b.committente.id);
    const mercurius = await creaProgetto(b.db, b.committente.id, "mercurius");
    const adonis = await creaIdea(b, ambito, b.progetto.id, { nome: "Adonis", descrizione: "Già discusse con il cliente" });
    await aggiungiFile(b, ambito, adonis.id, { nome: "Istruzioni.md", contenuto: "# Istruzioni\nusa la coda" });
    await aggiungiFile(b, ambito, adonis.id, { nome: "note.txt", contenuto: "due note" });
    await apri(b, "s1", "parser");
    await copia(b, { attivi: [changeAttivo("parser", { "proposal.md": "# Parser", "specs/lettore/spec.md": "## Requisiti", "idee/note.txt": "dal repo" })], archiviati: [] });
    await aggiungiFile(b, ambito, (await creaIdea(b, ambito, mercurius.id, { nome: "parser" })).id, { nome: "a.md", contenuto: "di mercurius" });
    altro = await b.altroCommittente("PRIV", ["app"]);
    await invia(b, evento("apri_cantiere", apertura("segreto"), { session_id: "p1" }), altro.token);
    client = new Client({ name: "test", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${b.url}/mcp`), { requestInit: { headers: { authorization: `Bearer ${b.token}` } } }));
  });
  after(async () => {
    await client.close();
    await b.chiudi();
  });
  const chiama = async (name: string, args: Record<string, unknown>) =>
    ((await client.callTool({ name, arguments: args })) as { content: { text: string }[]; structuredContent: Record<string, any> });

  test("elenco dei file di un'idea: nomi sotto idee/, origine, byte; lo stato non cambia e non nasce nessun change", async () => {
    const r = await richiesta(b, file("app", "adonis"));
    assert.equal(r.status, 200);
    assert.deepEqual([r.corpo.progetto, r.corpo.percorso, r.corpo.stato], ["app", "Adonis", "idea"]);
    assert.deepEqual(r.corpo.file.map((f: any) => [f.nome, f.origine, f.byte]), [["idee/Istruzioni.md", "idea", 24], ["idee/note.txt", "idea", 8]]);
    assert.ok(r.corpo.file.every((f: any) => typeof f.aggiornato_il === "string" && !("contenuto" in f)));
    const c = await cantiere(b, "adonis");
    assert.equal(c.stato, "idea");
    assert.equal(await b.db.selectFrom("change_copie").select("cantiere_id").where("cantiere_id", "=", c.id).executeTakeFirst(), undefined);
  });

  test("contenuto di un file nella query, anche senza idee/ e con le barre nel nome; il change vince sull'idea con lo stesso nome", async () => {
    const istruzioni = await richiesta(b, file("app", "Adonis", "idee/Istruzioni.md"));
    assert.deepEqual([istruzioni.status, istruzioni.corpo.contenuto, istruzioni.corpo.origine], [200, "# Istruzioni\nusa la coda", "idea"]);
    assert.equal((await richiesta(b, file("app", "adonis", "note.txt"))).corpo.contenuto, "due note");
    const spec = await richiesta(b, file("app", "parser", "specs/lettore/spec.md"));
    assert.deepEqual([spec.corpo.contenuto, spec.corpo.origine], ["## Requisiti", "change"]);
    // Il file dell'idea rimasto dopo la presa e la sua copia nel change: uno solo, quello del change.
    const { id } = await cantiere(b, "parser");
    await b.db.insertInto("idee_file").values({ cantiere_id: id, nome: "note.txt", contenuto: "dall'idea", byte: 9, creato_il: new Date().toISOString() }).execute();
    try {
      const parser = await richiesta(b, file("app", "parser"));
      assert.deepEqual(parser.corpo.file.map((f: any) => [f.nome, f.origine]), [["idee/note.txt", "change"], ["proposal.md", "change"], ["specs/lettore/spec.md", "change"]]);
      const note = await richiesta(b, file("app", "parser", "note.txt"));
      assert.deepEqual([note.corpo.contenuto, note.corpo.origine], ["dal repo", "change"]);
    } finally {
      await b.db.deleteFrom("idee_file").where("cantiere_id", "=", id).execute();
    }
  });

  test("rifiuti: file assente con l'elenco, cantiere o progetto inesistente, cantiere di un altro committente come inesistente", async () => {
    const assente = await richiesta(b, file("app", "adonis", "x.md"));
    assert.deepEqual([assente.status, assente.corpo.errore], [404, 'Il file "x.md" non c\'è nel cantiere "Adonis". File: idee/Istruzioni.md, idee/note.txt.']);
    assert.equal((await richiesta(b, file("app", "nessuno"))).status, 404);
    assert.equal((await richiesta(b, file("poker", "adonis"))).status, 404);
    const suo = await richiesta(b, file("app", "segreto"), {}, altro.token);
    assert.equal(suo.status, 200);
    const mio = await richiesta(b, file("app", "segreto"));
    const inventato = await richiesta(b, file("app", "inventato"));
    assert.deepEqual([mio.status, mio.corpo.errore.replace("segreto", "X")], [inventato.status, inventato.corpo.errore.replace("inventato", "X")]);
    assert.equal((await richiesta(b, file("app", "adonis"), {}, altro.token)).status, 404);
  });

  test("un file oltre max_file o binario si rifiuta con il motivo; con contenuto=1 tutto il cantiere in una richiesta", async () => {
    const { id } = await cantiere(b, "adonis");
    const ora = new Date().toISOString();
    await b.db.insertInto("idee_file").values([
      { cantiere_id: id, nome: "grande.md", contenuto: "x".repeat(1001), byte: 1001, creato_il: ora },
      { cantiere_id: id, nome: "binario.md", contenuto: "a\0b", byte: 3, creato_il: ora },
    ]).execute();
    try {
      const tutti = await richiesta(b, `${file("app", "adonis")}?contenuto=1`);
      assert.deepEqual(tutti.corpo.file.map((f: any) => [f.nome, f.contenuto ?? f.errore]), [
        ["idee/binario.md", 'Il file "idee/binario.md" è binario: si leggono solo file di testo.'],
        ["idee/grande.md", 'Il file "idee/grande.md" supera 1000 byte: non si legge da qui.'],
        ["idee/Istruzioni.md", "# Istruzioni\nusa la coda"],
        ["idee/note.txt", "due note"],
      ]);
      const grande = await richiesta(b, file("app", "adonis", "grande.md"));
      assert.deepEqual([grande.status, grande.corpo.errore], [422, 'Il file "idee/grande.md" supera 1000 byte: non si legge da qui.']);
      const binario = await richiesta(b, file("app", "adonis", "binario.md"));
      assert.deepEqual([binario.status, binario.corpo.errore], [422, 'Il file "idee/binario.md" è binario: si leggono solo file di testo.']);
    } finally {
      await b.db.deleteFrom("idee_file").where("nome", "in", ["grande.md", "binario.md"]).execute();
    }
  });

  test("ricerca senza maiuscole né accenti su percorso, descrizione e nomi dei file, con i file che combaciano, filtro per progetto, solo il committente del token", async () => {
    const cerca = async (q: string, token = b.token) => (await richiesta(b, `/api/v1/cerca?${q}`, {}, token)).corpo.cantieri;
    const [adonis] = await cerca("testo=istruzioni%20ADONIS");
    assert.deepEqual(adonis, { progetto: "app", percorso: "Adonis", stato: "idea", descrizione: "Già discusse con il cliente", file: ["idee/Istruzioni.md"] });
    assert.deepEqual((await cerca("testo=")).find((c: any) => c.percorso === "Adonis").file, ["idee/Istruzioni.md", "idee/note.txt"]);
    assert.deepEqual((await cerca("testo=gia%20cliente")).map((c: any) => c.percorso), ["Adonis"]);
    assert.deepEqual((await cerca("testo=lettore")).map((c: any) => [c.percorso, c.file]), [["parser", ["specs/lettore/spec.md"]]]);
    assert.deepEqual((await cerca("testo=parser")).map((c: any) => c.progetto).sort(), ["app", "mercurius"]);
    assert.deepEqual((await cerca("testo=parser&progetto=Mercurius")).map((c: any) => c.progetto), ["mercurius"]);
    assert.deepEqual(await cerca("testo=adonis%20zebra"), []);
    assert.equal((await cerca("")).length, 3);
    assert.deepEqual(await cerca("testo=adonis", altro.token), []);
    assert.deepEqual((await cerca("testo=segreto", altro.token)).map((c: any) => c.percorso), ["segreto"]);
  });

  test("elenca i cantieri con i nomi dei file dell'idea", async () => {
    const tutti = (await richiesta(b, "/api/v1/cantieri?progetto=app")).corpo.cantieri;
    const adonis = tutti.find((c: any) => c.percorso === "Adonis");
    assert.deepEqual([adonis.file_idea, adonis.file_idea_nomi, adonis.descrizione], [2, ["Istruzioni.md", "note.txt"], "Già discusse con il cliente"]);
  });

  test("tool MCP: cerca_cantieri e leggi_cantiere, rifiuti con ok false", async () => {
    const trovati = await chiama("cerca_cantieri", { testo: "istruzioni adonis" });
    assert.deepEqual(trovati.structuredContent.cantieri.map((c: any) => c.percorso), ["Adonis"]);
    const elenco = await chiama("leggi_cantiere", { percorso: "adonis" });
    assert.equal(elenco.structuredContent.ok, true);
    assert.deepEqual(elenco.structuredContent.file.map((f: any) => f.nome), ["idee/Istruzioni.md", "idee/note.txt"]);
    const letto = await chiama("leggi_cantiere", { percorso: "adonis", file: "Istruzioni.md" });
    assert.deepEqual([letto.content[0].text, letto.structuredContent.contenuto], ["# Istruzioni\nusa la coda", "# Istruzioni\nusa la coda"]);
    const ambiguo = await chiama("leggi_cantiere", { percorso: "parser" });
    assert.deepEqual([ambiguo.structuredContent.ok, ambiguo.structuredContent.motivo], [false, 'Il cantiere "parser" c\'è in più progetti (app, mercurius): indica il progetto.']);
    const diMercurius = await chiama("leggi_cantiere", { percorso: "parser", file: "a.md", progetto: "mercurius" });
    assert.equal(diMercurius.structuredContent.contenuto, "di mercurius");
    const assente = await chiama("leggi_cantiere", { percorso: "segreto" });
    assert.deepEqual([assente.structuredContent.ok, assente.structuredContent.motivo], [false, 'Il cantiere "segreto" non esiste.']);
    assert.equal((await cantiere(b, "adonis")).stato, "idea");
  });
});
