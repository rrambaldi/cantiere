import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { TUTTI } from "../src/ambito.ts";
import { cambiaEsito } from "../src/dominio.ts";
import { creaIdea } from "../src/idee.ts";
import { apri, avvia, cantiere, changeAttivo, copia, evento, invia, richiesta, type Banco } from "./aiuto.ts";

let b: Banco;
before(async () => (b = await avvia()));
after(() => b.chiudi());
beforeEach(async () => {
  for (const t of ["eventi", "sessioni", "cantieri", "esiti", "change_copie", "change_file", "idee_file"] as const) await b.db.deleteFrom(t).execute();
  await b.db.updateTable("progetti").set({ openspec_il: null }).execute();
});
const vuota = { attivi: [], archiviati: [] };
const file = async (percorso_slug: string) =>
  (await b.db.selectFrom("change_file").select(["percorso", "contenuto"]).where("cantiere_id", "=", (await cantiere(b, percorso_slug)).id).orderBy("percorso").execute());
const letto = async (percorso: string) => ((await richiesta(b, "/api/v1/cantieri")).corpo.cantieri as any[]).find((c) => c.percorso === percorso);

test("prima copia: file conservati per il cantiere del change; stessa copia due volte, stessa risposta", async () => {
  await apri(b, "s1", "idoc-converter");
  const corpo = { attivi: [changeAttivo("idoc-converter", { "proposal.md": "# Proposta", "idee/nota.md": "appunti" })], archiviati: [] };
  const prima = await copia(b, corpo);
  assert.equal(prima.status, 200);
  assert.deepEqual(await file("idoc-converter"), [
    { percorso: "idee/nota.md", contenuto: "appunti" },
    { percorso: "proposal.md", contenuto: "# Proposta" },
  ]);
  const seconda = await copia(b, corpo);
  assert.deepEqual(seconda, prima);
  assert.deepEqual(prima.corpo.cantieri.map((c: any) => [c.percorso, c.stato]), [["idoc-converter", "aperto"]]);
});

test("percorso fuori dal change: 422 e niente salvato della copia", async () => {
  const r = await copia(b, { attivi: [changeAttivo("export-pdf", { "proposal.md": "x", "../../.env": "SEGRETO=1" })], archiviati: [] });
  assert.equal(r.status, 422);
  assert.equal((await b.db.selectFrom("cantieri").select("id").execute()).length, 0);
  assert.equal((await copia(b, { attivi: [{ ...changeAttivo("Non Kebab"), change: "Non Kebab" }], archiviati: [] })).status, 422);
});

test("macchina con un checkout vecchio: resta la copia più recente", async () => {
  await copia(b, { attivi: [changeAttivo("export-pdf", { "tasks.md": "- [x] 1\n- [x] 2" }, "2026-10-15T10:00:00Z")], archiviati: [] });
  await copia(b, { attivi: [changeAttivo("export-pdf", { "tasks.md": "- [ ] 1\n- [ ] 2" }, "2026-10-15T09:00:00Z")], archiviati: [] });
  assert.deepEqual((await letto("export-pdf")).task, { fatti: 2, totali: 2 });
});

test("change senza cantiere: nasce al primo livello, aperto, origine repo", async () => {
  await copia(b, { attivi: [changeAttivo("export-pdf")], archiviati: [] });
  const c = await cantiere(b, "export-pdf");
  assert.deepEqual([c.padre_id, c.stato, c.origine, c.change], [null, "aperto", "repo", "export-pdf"]);
});

test("completato dal repo con la data di archivio; poi visto attivo resta completato", async () => {
  await apri(b, "s1", "export-pdf");
  await copia(b, { attivi: [changeAttivo("export-pdf")], archiviati: [] });
  await copia(b, { attivi: [], archiviati: [{ change: "export-pdf", archiviato_il: "2026-10-20" }] });
  const c = await cantiere(b, "export-pdf");
  assert.deepEqual([c.stato, c.stato_il], ["completato", "2026-10-20"]);
  assert.match((await invia(b, evento("prompt", {}))).corpo.contesto, /export-pdf è completato: ora lavori direttamente su app/);
  await copia(b, { attivi: [changeAttivo("export-pdf", { "proposal.md": "rianimato" }, new Date(Date.now() + 60_000).toISOString())], archiviati: [] });
  assert.equal((await cantiere(b, "export-pdf")).stato, "completato");
  assert.deepEqual(await file("export-pdf"), [{ percorso: "proposal.md", contenuto: "# Proposta" }]);
});

test("archivio dopo un abbandono: resta abbandonato e smette di essere da archiviare", async () => {
  const { id } = (await apri(b, "s1", "vecchio-parser")).corpo.cantiere;
  await cambiaEsito(b, TUTTI, id, "abbandona");
  await copia(b, { attivi: [changeAttivo("vecchio-parser")], archiviati: [] });
  assert.equal((await letto("vecchio-parser")).da_archiviare, true);
  await copia(b, { attivi: [], archiviati: [{ change: "vecchio-parser", archiviato_il: "2026-10-21" }] });
  const dopo = await letto("vecchio-parser");
  assert.deepEqual([dopo.stato, dopo.da_archiviare], ["abbandonato", false]);
});

test("avanzamento: artefatti presenti e task spuntati sul totale", async () => {
  const tasks = Array.from({ length: 12 }, (_, i) => `- [${i < 7 ? "x" : " "}] ${i + 1}.0 task`).join("\n");
  await copia(b, { attivi: [changeAttivo("idoc-converter-prototipo", { "proposal.md": "p", "specs/a/spec.md": "s", "tasks.md": tasks })], archiviati: [] });
  const c = await letto("idoc-converter-prototipo");
  assert.deepEqual([c.task, c.artefatti], [{ fatti: 7, totali: 12 }, { proposal: true, design: false, specs: true, tasks: true }]);
});

test("change quadro: fasi completate sul totale dei figli non abbandonati", async () => {
  for (const fase of ["prototipo", "migrazione-preprod", "preprod", "scartata"]) await apri(b, `s-${fase}`, `idoc-converter/${fase}`);
  await cambiaEsito(b, TUTTI, (await cantiere(b, "idoc-converter/scartata")).id, "abbandona");
  await copia(b, {
    attivi: [],
    archiviati: [
      { change: "idoc-converter-prototipo", archiviato_il: "2026-10-16" },
      { change: "idoc-converter-migrazione-preprod", archiviato_il: "2026-10-17" },
    ],
  });
  assert.deepEqual((await letto("idoc-converter")).fasi, { completate: 2, totali: 3 });
  assert.equal((await letto("idoc-converter/preprod")).fasi, null);
});

test("change mancante: cantiere aperto che l'ultima copia non contiene", async () => {
  await apri(b, "s1", "report");
  assert.equal((await letto("report")).change_mancante, false, "nessuna copia ancora ricevuta");
  await copia(b, vuota);
  const c = await letto("report");
  assert.deepEqual([c.stato, c.change_mancante], ["aperto", true]);
  await copia(b, { attivi: [changeAttivo("report")], archiviati: [] });
  assert.equal((await letto("report")).change_mancante, false);
});

test("un'idea il cui change compare nel repo passa ad aperto", async () => {
  await creaIdea(b, TUTTI, b.progetto.id, { nome: "iDOC converter" });
  await copia(b, { attivi: [changeAttivo("idoc-converter")], archiviati: [] });
  assert.equal((await cantiere(b, "idoc-converter")).stato, "aperto");
});

test("progetto inesistente o di un altro committente: 404", async () => {
  assert.equal((await copia(b, vuota, "pokr")).status, 404);
  const priv = await b.altroCommittente(`PRIV${Date.now()}`, ["segreto"]);
  assert.equal((await copia(b, vuota, "segreto")).status, 404);
  assert.equal((await copia(b, vuota, "segreto", priv.token)).status, 200);
});
