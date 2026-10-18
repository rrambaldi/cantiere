// Versione di rilascio AA.MM.N: anno a due cifre, mese, numero progressivo nel mese (da 0).
// Uso: node scripts/rilascia.mjs [--dry]   (npm run release)
import { readFileSync, writeFileSync } from "node:fs";

const FILE = ["plugin/.claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "server/package.json"];
const RE = /("version":\s*")[^"]+(")/;

/** Mese senza zero iniziale (26.1.0, non 26.01.0): semver non ammette zeri iniziali. */
export function prossima(corrente, data = new Date()) {
  const [aa, mm] = [data.getFullYear() % 100, data.getMonth() + 1];
  const [a, m, n] = corrente.split(".").map(Number);
  return a === aa && m === mm ? `${aa}.${mm}.${n + 1}` : `${aa}.${mm}.0`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const radice = new URL("../", import.meta.url);
  const corrente = RE.exec(readFileSync(new URL(FILE[0], radice), "utf8"))?.[0].match(/\d+\.\d+\.\d+/)?.[0];
  if (!corrente) throw new Error(`versione non trovata in ${FILE[0]}`);
  const nuova = prossima(corrente);
  console.log(`${corrente} -> ${nuova}`);
  if (!process.argv.includes("--dry")) {
    for (const f of FILE) {
      const testo = readFileSync(new URL(f, radice), "utf8");
      if (!RE.test(testo)) throw new Error(`manca "version" in ${f}`);
      writeFileSync(new URL(f, radice), testo.replace(RE, `$1${nuova}$2`));
    }
  }
}
