import { cantieriDi, type Ambito } from "./ambito.ts";
import { mappaPercorsi, percorsoDi, progettoPerNome, type Ambiente } from "./dominio.ts";
import { Rifiuto, segmenti, slugifica } from "./modelli.ts";

/** Un file di un cantiere: della copia del change (`change`) o caricato con l'idea dalla dashboard (`idea`, sotto idee/). */
export interface FileCantiere {
  nome: string;
  origine: "idea" | "change";
  byte: number;
  aggiornato_il: string;
}

const IDEE = "idee/";

/** Testo per confronti senza maiuscole né accenti. */
const piano = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Il cantiere del committente per progetto e percorso, confrontati come slug. Senza progetto lo cerca in
 * tutti i progetti del committente e lo vuole in uno solo. Quello di un altro committente non esiste.
 */
async function cantiereDaLeggere(amb: Ambiente, ambito: Ambito, nomeProgetto: string | undefined, percorso: string) {
  let q = cantieriDi(amb.db, ambito)
    .select(["cantieri.id", "cantieri.stato", "progetti.nome as progetto"])
    .where("cantieri.percorso_slug", "=", segmenti(percorso).map(slugifica).join("/"));
  if (nomeProgetto !== undefined) {
    const progetto = await progettoPerNome(amb.db, ambito, nomeProgetto);
    if (!progetto) throw new Rifiuto(404, `Il progetto "${nomeProgetto}" non esiste.`);
    q = q.where("cantieri.progetto_id", "=", progetto.id);
  }
  const trovati = await q.execute();
  if (!trovati.length) throw new Rifiuto(404, `Il cantiere "${percorso}" non esiste${nomeProgetto === undefined ? "" : ` in ${nomeProgetto}`}.`);
  if (trovati.length > 1) {
    throw new Rifiuto(409, `Il cantiere "${percorso}" c'è in più progetti (${trovati.map((t) => t.progetto).join(", ")}): indica il progetto.`);
  }
  const [c] = trovati;
  return { id: c.id, progetto: c.progetto, percorso: await percorsoDi(amb.db, c.id), stato: c.stato };
}

/**
 * I file del cantiere per nome, con il contenuto: la copia del change vince su un file dell'idea con lo stesso nome.
 * ParceEtRecte: si leggono tutti anche per l'elenco o per un file solo. Il peso ha un tetto: la copia di un change
 * sta in max_openspec (2 MB), i file di un'idea in max_file_idea × max_file.
 */
async function fileDi(amb: Ambiente, id: number) {
  const idea = await amb.db.selectFrom("idee_file").select(["nome", "contenuto", "creato_il"]).where("cantiere_id", "=", id).execute();
  const change = await amb.db
    .selectFrom("change_file")
    .innerJoin("change_copie", "change_copie.cantiere_id", "change_file.cantiere_id")
    .select(["change_file.percorso", "change_file.contenuto", "change_copie.modificato_il"])
    .where("change_file.cantiere_id", "=", id)
    .execute();
  const file = new Map<string, FileCantiere & { contenuto: string }>();
  const metti = (nome: string, origine: FileCantiere["origine"], contenuto: string, aggiornato_il: string) =>
    file.set(nome, { nome, origine, byte: Buffer.byteLength(contenuto), aggiornato_il, contenuto });
  for (const f of idea) metti(IDEE + f.nome, "idea", f.contenuto, f.creato_il);
  for (const f of change) metti(f.percorso, "change", f.contenuto, f.modificato_il);
  return [...file.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Perché un file non si legge come testo (oltre max_file byte o binario), o null. */
const illeggibile = (f: FileCantiere & { contenuto: string }, massimo: number) =>
  f.byte > massimo ? `Il file "${f.nome}" supera ${massimo} byte: non si legge da qui.`
  : f.contenuto.includes("\0") ? `Il file "${f.nome}" è binario: si leggono solo file di testo.`
  : null;

/**
 * GET /api/v1/progetti/<progetto>/cantieri/<percorso>/file: l'elenco, senza cambiare lo stato del cantiere.
 * Con `contenuto` ogni file ha anche il suo testo, o `errore` se non si legge: tutto il cantiere in una richiesta.
 */
export async function elencoFile(amb: Ambiente, ambito: Ambito, nomeProgetto: string | undefined, percorso: string, contenuto = false) {
  const c = await cantiereDaLeggere(amb, ambito, nomeProgetto, percorso);
  const file = (await fileDi(amb, c.id)).map(({ contenuto: testo, ...f }) => {
    if (!contenuto) return f;
    const motivo = illeggibile({ ...f, contenuto: testo }, amb.config.max_file);
    return motivo ? { ...f, errore: motivo } : { ...f, contenuto: testo };
  });
  return { progetto: c.progetto, percorso: c.percorso, stato: c.stato, file };
}

/** GET .../file?nome=<nome>: il contenuto di un file di testo, al più max_file byte. Il nome di un file dell'idea vale anche senza idee/. */
export async function leggiFile(amb: Ambiente, ambito: Ambito, nomeProgetto: string | undefined, percorso: string, nome: string) {
  const c = await cantiereDaLeggere(amb, ambito, nomeProgetto, percorso);
  const file = await fileDi(amb, c.id);
  const f = file.find((x) => x.nome === nome) ?? file.find((x) => x.nome === IDEE + nome);
  if (!f) throw new Rifiuto(404, `Il file "${nome}" non c'è nel cantiere "${c.percorso}". File: ${file.map((x) => x.nome).join(", ") || "nessuno"}.`);
  const motivo = illeggibile(f, amb.config.max_file);
  if (motivo) throw new Rifiuto(422, motivo);
  return { progetto: c.progetto, percorso: c.percorso, stato: c.stato, ...f };
}

/**
 * GET /api/v1/cerca: i cantieri del committente (in ogni stato) che hanno tutte le parole del testo nel
 * percorso, nella descrizione o nei nomi dei file, senza maiuscole né accenti, con i file il cui nome ha
 * almeno una delle parole. Testo vuoto: tutti, con tutti i file.
 */
export async function cerca(amb: Ambiente, ambito: Ambito, testo: string, nomeProgetto?: string) {
  let q = cantieriDi(amb.db, ambito)
    .select(["cantieri.id", "cantieri.padre_id", "cantieri.nome", "cantieri.descrizione", "cantieri.stato", "progetti.nome as progetto"])
    .orderBy("cantieri.aggiornato_il", "desc");
  if (nomeProgetto !== undefined) q = q.where("progetti.slug", "=", slugifica(nomeProgetto));
  // Tutti i cantieri dei progetti toccati: servono gli antenati per i percorsi.
  const righe = await q.execute();
  const percorsi = mappaPercorsi(righe);
  const ids = righe.map((r) => r.id);
  const nomi = new Map<number, Set<string>>();
  const idea = ids.length ? await amb.db.selectFrom("idee_file").select(["cantiere_id", "nome"]).where("cantiere_id", "in", ids).execute() : [];
  const change = ids.length ? await amb.db.selectFrom("change_file").select(["cantiere_id", "percorso as nome"]).where("cantiere_id", "in", ids).execute() : [];
  for (const f of [...idea.map((f) => ({ ...f, nome: IDEE + f.nome })), ...change]) nomi.set(f.cantiere_id, (nomi.get(f.cantiere_id) ?? new Set()).add(f.nome));
  const parole = piano(testo).split(/[^a-z0-9]+/).filter(Boolean);
  return righe.flatMap((r) => {
    const percorso = percorsi.get(r.id)!;
    const tutti = [...(nomi.get(r.id) ?? [])].sort();
    const dove = piano([percorso, r.descrizione ?? "", ...tutti].join("\n"));
    if (!parole.every((p) => dove.includes(p))) return [];
    const file = parole.length ? tutti.filter((f) => parole.some((p) => piano(f).includes(p))) : tutti;
    return [{ progetto: r.progetto, percorso, stato: r.stato, descrizione: r.descrizione, file }];
  });
}
