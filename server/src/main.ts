import { leggiConfig } from "./config.ts";
import { apriDb, migrazioniMancanti } from "./db.ts";
import { creaApp } from "./app.ts";

let config;
try {
  config = leggiConfig();
} catch (errore) {
  console.error((errore as Error).message);
  process.exit(1);
}

const db = await apriDb(config.database_url);
const mancanti = await migrazioniMancanti(db);
if (mancanti.length) {
  console.error(`Database non aggiornato (mancano ${mancanti.join(", ")}): lancia forgia-admin migra`);
  process.exit(1);
}

const separatore = config.bind.lastIndexOf(":");
const server = creaApp({ db, config });
server.listen(Number(config.bind.slice(separatore + 1)), config.bind.slice(0, separatore), () =>
  console.log(JSON.stringify({ tipo: "avvio", bind: config.bind })),
);
// Alla chiusura si tagliano anche le connessioni ancora aperte (stream MCP, keep-alive):
// un evento perso torna dalla coda del plugin, e l'evento_id lo rende idempotente.
for (const segnale of ["SIGINT", "SIGTERM"] as const) {
  process.on(segnale, () => {
    server.close(() => void db.destroy());
    server.closeAllConnections();
  });
}
