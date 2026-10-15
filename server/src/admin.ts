#!/usr/bin/env node
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { creaCliente, elencaClienti, revocaCliente } from "./accesso.ts";
import { leggiConfig } from "./config.ts";
import { apriDb, migra } from "./db.ts";
import { elencaCantieri, elencaSessioni, pulizia } from "./dominio.ts";
import { NOME_VISIBILE } from "./nome.ts";

const AIUTO = `forgia-admin: amministrazione del server ${NOME_VISIBILE}

  migra                          applica le migrazioni mancanti
  token crea --cliente <nome>    crea un cliente e stampa il suo token (una volta sola)
  token elenca                   elenca i clienti
  token revoca --cliente <nome>  revoca il token del cliente
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

async function main(argv: string[]): Promise<number> {
  // Come npm start: legge .env della cartella corrente, e l'ambiente vince sul file.
  if (existsSync(".env")) process.loadEnvFile(".env");
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { cliente: { type: "string" }, help: { type: "boolean", short: "h" } },
  });
  const comando = positionals.join(" ");
  if (values.help || !comando) {
    console.log(AIUTO);
    return values.help ? 0 : 1;
  }
  const config = leggiConfig();
  const db = await apriDb(config.database_url);
  const amb = { db, config };
  const cliente = () => {
    if (!values.cliente) throw new Error("Manca --cliente <nome>.");
    return values.cliente;
  };
  try {
    switch (comando) {
      case "migra": {
        const applicate = await migra(db);
        console.log(applicate.length ? `Applicate: ${applicate.join(", ")}` : "Database già aggiornato.");
        break;
      }
      case "token crea":
        console.log(await creaCliente(db, cliente()));
        console.error("Copia il token adesso: non verrà mostrato di nuovo.");
        break;
      case "token elenca":
        console.log(tabella(await elencaClienti(db)));
        break;
      case "token revoca":
        await revocaCliente(db, cliente());
        console.log(`Cliente "${cliente()}" revocato.`);
        break;
      case "sessioni":
        console.log(
          tabella(
            (await elencaSessioni(amb)).map((s) => ({
              sessione: s.session_id.slice(0, 8),
              cliente: s.cliente,
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
      case "cantieri":
        console.log(
          tabella(
            (await elencaCantieri(amb)).map((c) => ({
              id: c.id,
              percorso: c.percorso,
              stato: c.stato,
              origine: c.origine,
              sessioni_attive: c.sessioni.length,
              aggiornato: c.aggiornato_il,
            })),
          ),
        );
        break;
      case "pulizia": {
        const eliminati = await pulizia(amb);
        console.log(`Eliminati ${eliminati.eventi} eventi e ${eliminati.stati} stati più vecchi di ${config.retention_giorni} giorni.`);
        break;
      }
      default:
        console.error(`Comando sconosciuto: ${comando}\n\n${AIUTO}`);
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
