// Le skill del plugin e il server MCP che dichiara: i nomi dei tool nelle skill devono essere quelli che Claude Code dà.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PREFISSI_MCP } from "../bin/forgia.mts";

const leggi = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// Le righe `chiave: valore` del frontmatter.
function frontmatter(skill: string): Record<string, string> {
  const [, testa] = /^---\n([\s\S]*?)\n---\n/.exec(leggi(`skills/${skill}/SKILL.md`)) ?? assert.fail(`${skill}: frontmatter mancante`);
  return Object.fromEntries(testa.split("\n").map((r) => [r.slice(0, r.indexOf(":")), r.slice(r.indexOf(":") + 1).trim()]));
}
const strumenti = (fm: Record<string, string>) => fm["allowed-tools"].split(/,\s*/);
const PLUGIN = JSON.parse(leggi(".claude-plugin/plugin.json"));

test("il plugin dichiara un solo server MCP, forgia mcp, che dà i tool con il primo prefisso", () => {
  assert.deepEqual(PLUGIN.mcpServers, { forgia: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/bin/forgia.mjs", "mcp"] } });
  assert.equal(PREFISSI_MCP[0], `mcp__plugin_${PLUGIN.name}_${Object.keys(PLUGIN.mcpServers)[0]}__`);
});

test("cantiere la lancia solo l'utente; cantiere-leggi anche Claude, con cerca, leggi, status e i due tool", () => {
  const cantiere = frontmatter("cantiere");
  assert.equal(cantiere["disable-model-invocation"], "true");
  const leggere = frontmatter("cantiere-leggi");
  assert.equal(leggere.name, "cantiere-leggi");
  assert.equal(leggere["disable-model-invocation"], undefined);
  assert.match(leggere.description, /nel cantiere/);
  assert.deepEqual(strumenti(leggere), [
    "Bash(forgia cerca:*)", "Bash(forgia leggi:*)", "Bash(forgia status:*)",
    ...PREFISSI_MCP.flatMap((p) => [`${p}cerca_cantieri`, `${p}leggi_cantiere`]),
  ]);
});

test("ogni tool MCP nelle skill ha uno dei prefissi del plugin e c'è con tutti e due", () => {
  for (const skill of ["cantiere", "cantiere-leggi"]) {
    const mcp = strumenti(frontmatter(skill)).filter((s) => s.startsWith("mcp__"));
    const nomi = new Set(mcp.map((s) => PREFISSI_MCP.find((p) => s.startsWith(p))?.length ?? assert.fail(`${skill}: ${s}`)).map((n, i) => mcp[i].slice(n)));
    assert.deepEqual(mcp.sort(), PREFISSI_MCP.flatMap((p) => [...nomi].map((n) => p + n)).sort(), skill);
  }
});
