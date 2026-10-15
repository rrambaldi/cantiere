#!/usr/bin/env node
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { creaCommittente, elencaCommittenti, rigeneraToken } from "./accesso.ts";
import { progettiDi, TUTTI } from "./ambito.ts";
import { leggiConfig } from "./config.ts";
import { apriDb, migra } from "./db.ts";
import { elencaProgetti, elencaSessioni, leggiCantieri, pulizia } from "./dominio.ts";
import { NOME_VISIBILE } from "./nome.ts";

const AIUTO = `forgia-admin: amministrazione del server ${NOME_VISIBILE}

  migra                          applica le migrazioni mancanti
  committente crea <nome>        crea un committente e stampa il suo token (una volta sola)
  committente elenca             elenca i committenti
  committente rigenera <nome>    stampa un token nuovo e revoca il precedente
  progetti                       tabella dei progetti
  sessioni                       tabella delle sessioni
  cantieri                       tabella dei cantieri
  pulizia                        elimina eventi e stati più vecchi di FORGIA_RETENTION_GIORNI

Configurazione da FORGIA_* nell'ambiente o in .env della cartella corrente
(vedi deploy/forgia.env.example).`;

/** Tabella a colonne allineate, per un controllo rapido da terminale. */
export function tabella(righe: Record<string, unknown>[]): string {
  if (!righe.length) return "(vuoto)";
  const colonne = Object.keys(righe[0]);
  const celle = righe.map((r) => colonne.map((c) => String(r[c] ?? "-")));
  const larghezze = colonne.map((c, i) => Math.max(c.length, ...celle.map((r) => r[i].length)));
  return [colonne, ...celle].map((r) => r.map((v, i) => v.padEnd(larghezze[i])).join("  ").trimEnd()).join("\n");
}

const TOKEN_UNA_VOLTA = "Copia il token adesso: non verrà mostrato di nuovo.";

async function main(argv: string[]): Promise<number> {
  // Come npm start: legge .env della cartella corrente, e l'ambiente vince sul file.
  if (existsSync(".env")) process.loadEnvFile(".env");
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { help: { type: "boolean", short: "h" } } });
  if (values.help || !positionals.length) {
    console.log(AIUTO);
    return values.help ? 0 : 1;
  }
  const config = leggiConfig();
  const db = await apriDb(config.database_url);
  const amb = { db, config };
  const nome = () => {
    if (!positionals[2]) throw new Error("Manca il nome del committente.");
    return positionals[2];
  };
  const committenti = async () => new Map((await elencaCommittenti(db)).map((c) => [c.id, c.nome]));
  const progetti = async () => {
    const perCommittente = await committenti();
    const righe = await progettiDi(db, TUTTI).select(["progetti.id", "progetti.committente_id"]).execute();
    return new Map(righe.map((p) => [p.id, perCommittente.get(p.committente_id)]));
  };
  try {
    switch (positionals.slice(0, 2).join(" ")) {
      case "migra": {
        const applicate = await migra(db);
        console.log(applicate.length ? `Applicate: ${applicate.join(", ")}` : "Database già aggiornato.");
        break;
      }
      case "committente crea":
        console.log((await creaCommittente(db, nome())).token);
        console.error(TOKEN_UNA_VOLTA);
        break;
      case "committente elenca":
        console.log(tabella((await elencaCommittenti(db)).map((c) => ({ committente: c.nome, creato: c.creato_il, ultimo_token: c.token_il }))));
        break;
      case "committente rigenera":
        console.log(await rigeneraToken(db, { nome: nome() }));
        console.error(TOKEN_UNA_VOLTA);
        break;
      case "progetti": {
        const committenteDi = await progetti();
        console.log(tabella((await elencaProgetti(db, TUTTI)).map((p) => ({ committente: committenteDi.get(p.id), progetto: p.nome, ...p.cantieri }))));
        break;
      }
      case "sessioni": {
        const committenteDi = await progetti();
        console.log(
          tabella(
            (await elencaSessioni(db, config, TUTTI)).map((s) => ({
              sessione: s.session_id.slice(0, 8),
              committente: committenteDi.get(s.progetto_id),
              progetto: s.progetto,
              host: s.host,
              branch: s.branch,
              cantiere: s.cantiere,
              stato: s.stato,
              turni: s.turni,
              ultimo_evento: s.ultimo_evento_il,
            })),
          ),
        );
        break;
      }
      case "cantieri": {
        const committenteDi = await progetti();
        console.log(
          tabella(
            (await leggiCantieri(db, config, TUTTI)).map((c) => ({
              id: c.id,
              committente: committenteDi.get(c.progetto_id),
              progetto: c.progetto,
              percorso: c.percorso,
              stato: c.stato,
              change: c.change,
              avanzamento: c.fasi ? `${c.fasi.completate}/${c.fasi.totali} fasi` : c.task ? `${c.task.fatti}/${c.task.totali}` : null,
              sessioni_attive: c.sessioni?.length ?? 0,
              aggiornato: c.aggiornato_il,
            })),
          ),
        );
        break;
      }
      case "pulizia": {
        const eliminati = await pulizia(amb);
        console.log(`Eliminati ${eliminati.eventi} eventi e ${eliminati.stati} stati più vecchi di ${config.retention_giorni} giorni.`);
        break;
      }
      default:
        console.error(`Comando sconosciuto: ${positionals.join(" ")}\n\n${AIUTO}`);
        return 1;
    }
    return 0;
  } finally {
    await db.destroy();
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (errore) {
  console.error((errore as Error).message);
  process.exitCode = 1;
}
