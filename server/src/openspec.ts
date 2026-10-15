import { adesso, type Committente } from "./accesso.ts";
import { di } from "./ambito.ts";
import { cambiaStato, cantieriDelProgetto, creaCantiere, leggiCantieri, progettoPerNome, type Ambiente } from "./dominio.ts";
import { contaTask, errore422, Rifiuto, schemaCopia } from "./modelli.ts";

type FileChange = { percorso: string; contenuto: string };

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
 * resta archiviato e porta il suo cantiere a completato.
 */
export async function riceviCopia(amb: Ambiente, committente: Committente, nomeProgetto: string, corpo: unknown) {
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
      if (salvata) {
        await trx.updateTable("change_copie").set({ archiviato_il: salvata.archiviato_il ?? a.archiviato_il, visto_il: ora }).where("cantiere_id", "=", c.id).execute();
      } else {
        await trx
          .insertInto("change_copie")
          .values({ cantiere_id: c.id, modificato_il: ora, archiviato_il: a.archiviato_il, visto_il: ora, ...riassunto([]) })
          .execute();
      }
      if (c.stato === "aperto" || c.stato === "sospeso") await cambiaStato(trx, c, "completato", "repo", ora, a.archiviato_il);
    }

    await trx.updateTable("progetti").set({ openspec_il: ora }).where("id", "=", progetto.id).execute();
    return leggiCantieri(trx, amb.config, ambito, { progettoId: progetto.id, sessioni: false });
  });
}
