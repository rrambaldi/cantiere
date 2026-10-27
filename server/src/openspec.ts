import type { Transaction } from "kysely";
import { adesso, type Committente } from "./accesso.ts";
import { cantieriDi, di, sessioniDi } from "./ambito.ts";
import type { DB } from "./db.ts";
import { cambiaStato, cantiereRisposta, cantieriDelProgetto, creaCantiere, leggiCantieri, progettoPerNome, type Ambiente } from "./dominio.ts";
import { contaTask, errore422, Rifiuto, schemaCopia } from "./modelli.ts";

type FileChange = { percorso: string; contenuto: string };

// Un nome di change (kebab-case) tra apici inversi.
const CITAZIONE = /`([a-z0-9]+(?:-[a-z0-9]+)*)`/g;
const RIGA_TASK = /^\s*- \[[^\]]*\]\s+(\d+(?:\.\d+)*)\s/;
const CREATO = /^created:\s*(\d{4}-\d{2}-\d{2})/m;

/**
 * Legami citati (design D7): proposal.md o tasks.md che nominano tra apici inversi il change di un altro
 * cantiere del progetto. Parte il più vecchio, per la data `created` del change, poi per la prima volta
 * che il server l'ha visto, poi per id; il task è quello del tasks.md della partenza, anche dalle righe
 * che lo continuano. Si rifanno a ogni copia: tra padre e figlio basta il padre, e un citato non
 * chiude giri né rovescia un legame che c'è già.
 */
async function aggiornaCitati(trx: Transaction<DB>, committenteId: number, progettoId: number, ora: string) {
  const cantieri = await cantieriDelProgetto(trx, progettoId).execute();
  if (!cantieri.length) return;
  const perId = new Map(cantieri.map((c) => [c.id, c]));
  const perChange = new Map(cantieri.map((c) => [c.change, c]));
  const ids = [...perId.keys()];
  await trx.deleteFrom("legami").where("tipo", "=", "citato").where("a_id", "in", ids).execute();
  const file = await trx.selectFrom("change_file").selectAll().where("cantiere_id", "in", ids).where("percorso", "in", ["proposal.md", "tasks.md", ".openspec.yaml"]).execute();
  const nato = new Map(file.filter((f) => f.percorso === ".openspec.yaml").map((f) => [f.cantiere_id, CREATO.exec(f.contenuto)?.[1]]));
  const ordine = (c: { id: number; creato_il: string }) => [nato.get(c.id) ?? c.creato_il.slice(0, 10), c.creato_il, String(c.id).padStart(12, "0")].join(" ");
  const antenato = (da: number, a: number) => {
    for (let p = perId.get(a)?.padre_id ?? null; p !== null; p = perId.get(p)?.padre_id ?? null) if (p === da) return true;
    return false;
  };
  // I registrati di tutto il committente (un giro può passare da un altro progetto) più i citati via via scelti.
  const archi = new Map<number, number[]>();
  const arco = (da: number, a: number) => archi.set(da, [...(archi.get(da) ?? []), a]);
  const registrati = await cantieriDi(trx, di(committenteId)).innerJoin("legami", "legami.da_id", "cantieri.id").select(["legami.da_id", "legami.a_id"]).execute();
  for (const l of registrati) arco(l.da_id, l.a_id);
  const raggiunge = (da: number, a: number) => {
    const visti = new Set<number>();
    for (const fronte = [da]; fronte.length; ) {
      const x = fronte.pop()!;
      if (x === a) return true;
      if (visti.has(x)) continue;
      visti.add(x);
      fronte.push(...(archi.get(x) ?? []));
    }
    return false;
  };
  const citati = new Map<string, { da_id: number; a_id: number; task: string | null }>();
  for (const f of file.filter((f) => f.percorso !== ".openspec.yaml")) {
    const chi = perId.get(f.cantiere_id)!;
    let task: string | null = null;
    for (const riga of f.contenuto.split("\n")) {
      // Una riga rientrata continua il task di sopra; ogni altra riga che non apre un task lo chiude.
      task = RIGA_TASK.exec(riga)?.[1] ?? (/^\s+\S/.test(riga) ? task : null);
      for (const [, nome] of riga.matchAll(CITAZIONE)) {
        const altro = perChange.get(nome);
        if (!altro || altro.id === chi.id) continue;
        const [da, a] = ordine(chi) < ordine(altro) ? [chi, altro] : [altro, chi];
        const chiave = `${da.id}>${a.id}`;
        const giaScelto = citati.get(chiave);
        if (!giaScelto && (antenato(da.id, a.id) || antenato(a.id, da.id) || archi.get(da.id)?.includes(a.id) || raggiunge(a.id, da.id))) continue;
        const suo = f.percorso === "tasks.md" && da === chi ? task : null;
        if (!giaScelto) arco(da.id, a.id);
        if (!giaScelto?.task) citati.set(chiave, { da_id: da.id, a_id: a.id, task: suo });
      }
    }
  }
  if (!citati.size) return;
  await trx
    .insertInto("legami")
    .values([...citati.values()].map((l) => ({ ...l, tipo: "citato" as const, session_id: null, creato_il: ora })))
    .onConflict((oc) => oc.columns(["da_id", "a_id"]).doNothing())
    .execute();
}

/** Quali artefatti del change esistono e quanti task sono spuntati. */
function riassunto(file: FileChange[]) {
  const ha = (p: string) => file.some((f) => f.percorso === p);
  const tasks = file.find((f) => f.percorso === "tasks.md");
  const task = tasks ? contaTask(tasks.contenuto) : null;
  return {
    artefatti: JSON.stringify({ proposal: ha("proposal.md"), design: ha("design.md"), specs: file.some((f) => f.percorso.startsWith("specs/")), tasks: !!tasks }),
    task_fatti: task?.fatti ?? null,
    task_totali: task?.totali ?? null,
  };
}

/**
 * PUT /api/v1/progetti/<progetto>/openspec: la copia di openspec/changes/ mandata dal plugin. Il repo
 * comanda: una copia sostituisce quella di un change solo se è più recente, un change archiviato
 * resta archiviato e porta il suo cantiere a completato. Se la copia sposta o chiude il cantiere della
 * sessione che la manda, la risposta le porta subito l'avviso e il suo cantiere (fork-da-task, D4).
 * L'avviso resta anche per il prompt dopo: una risposta persa non lo perde, e il plugin non lo ripete.
 */
export async function riceviCopia(amb: Ambiente, committente: Committente, nomeProgetto: string, corpo: unknown, sessionId: string | null = null) {
  const ambito = di(committente.id);
  const progetto = await progettoPerNome(amb.db, ambito, nomeProgetto);
  if (!progetto) throw new Rifiuto(404, `Il progetto "${nomeProgetto}" non esiste.`);
  const valido = schemaCopia(amb.config.max_file).safeParse(corpo);
  if (!valido.success) throw errore422(valido.error);
  const copia = valido.data;

  return amb.db.transaction().execute(async (trx) => {
    const ora = adesso();
    const perChange = (change: string) => cantieriDelProgetto(trx, progetto.id).where("cantieri.change", "=", change).executeTakeFirst();
    const copiaDi = (id: number) => trx.selectFrom("change_copie").selectAll().where("cantiere_id", "=", id).executeTakeFirst();
    const sessione = async () => (sessionId ? sessioniDi(trx, ambito).selectAll().where("session_id", "=", sessionId).executeTakeFirst() : undefined);
    const prima = await sessione();

    for (const a of copia.attivi) {
      const c =
        (await perChange(a.change)) ??
        (await creaCantiere(trx, { progetto_id: progetto.id, padre_id: null, nome: a.change, slugPercorso: [a.change], descrizione: null, stato: "aperto", origine: "repo" }, ora));
      // Un'idea il cui change compare già nel repo è in lavorazione.
      if (c.stato === "idea") await cambiaStato(trx, c, "aperto", "repo", ora);
      const salvata = await copiaDi(c.id);
      if (!salvata?.archiviato_il && (!salvata || a.modificato_il > salvata.modificato_il)) {
        await trx.deleteFrom("change_file").where("cantiere_id", "=", c.id).execute();
        if (a.file.length) await trx.insertInto("change_file").values(a.file.map((f) => ({ cantiere_id: c.id, ...f }))).execute();
        const dati = { modificato_il: a.modificato_il, visto_il: ora, ...riassunto(a.file) };
        if (salvata) await trx.updateTable("change_copie").set(dati).where("cantiere_id", "=", c.id).execute();
        else await trx.insertInto("change_copie").values({ cantiere_id: c.id, archiviato_il: null, ...dati }).execute();
        await trx.updateTable("cantieri").set({ aggiornato_il: ora }).where("id", "=", c.id).execute();
      } else {
        await trx.updateTable("change_copie").set({ visto_il: ora }).where("cantiere_id", "=", c.id).execute();
      }
    }

    for (const a of copia.archiviati) {
      // ParceEtRecte: un change archiviato che forgia non ha mai visto resta solo nel repo.
      const c = await perChange(a.change);
      if (!c) continue;
      const salvata = await copiaDi(c.id);
      // La copia dell'archivio è l'ultima: sostituisce quella presa quando il change era attivo.
      if (a.file) {
        await trx.deleteFrom("change_file").where("cantiere_id", "=", c.id).execute();
        if (a.file.length) await trx.insertInto("change_file").values(a.file.map((f) => ({ cantiere_id: c.id, ...f }))).execute();
      }
      const dati = riassunto(a.file ?? []);
      if (salvata) {
        // Senza file nel corpo (plugin vecchio, budget finito) il riassunto della copia salvata resta.
        await trx.updateTable("change_copie").set({ archiviato_il: salvata.archiviato_il ?? a.archiviato_il, visto_il: ora, ...(a.file && dati) }).where("cantiere_id", "=", c.id).execute();
      } else {
        await trx
          .insertInto("change_copie")
          .values({ cantiere_id: c.id, modificato_il: ora, archiviato_il: a.archiviato_il, visto_il: ora, ...dati })
          .execute();
      }
      if (c.stato === "aperto" || c.stato === "sospeso") await cambiaStato(trx, c, "completato", "repo", ora, a.archiviato_il);
    }

    await aggiornaCitati(trx, committente.id, progetto.id, ora);
    await trx.updateTable("progetti").set({ openspec_il: ora }).where("id", "=", progetto.id).execute();
    const cantieri = await leggiCantieri(trx, amb.config, ambito, { progettoId: progetto.id, sessioni: false });
    const dopo = await sessione();
    if (!prima || !dopo?.avviso || dopo.cantiere_id === prima.cantiere_id) return { cantieri };
    return { cantieri, contesto: dopo.avviso, cantiere: await cantiereRisposta(trx, dopo) };
  });
}
