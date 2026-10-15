# cantiere forgia: plugin per Claude Code

Manda al server di cantiere forgia lo stato di ogni sessione di Claude Code, in ogni progetto,
senza che nessuno ci pensi: sessioni, turni, todo e un resoconto di tre righe a fine turno. Mai il
testo dei prompt, il transcript o l'output dei tool. Se il server non risponde, il lavoro non si
ferma: gli eventi aspettano in una coda locale.

Richiede **Node.js ≥ 22.18** nel PATH. Senza Node il plugin non fa nulla e `/cantiere` lo dice.

## Installazione

1. In Claude Code: `/plugin marketplace add <percorso o URL git di questa repo>`
2. `/plugin install forgia@forgia`, poi riavvia Claude Code.
3. Con `FORGIA_TOKEN` impostata: `/cantiere server <url> [nome]`. Verifica URL e token, salva la
   configurazione, registra il server MCP `forgia` e, se c'è, apre il cantiere `nome`.
4. Riavvia Claude Code: da qui i tool `mcp__forgia__*` sono disponibili. `/cantiere permessi` li
   consente senza conferme.
5. Da ora il tracciamento è attivo in ogni sessione. `/cantiere stato` per controllare.

Il token non passa mai dalla chat. Senza `FORGIA_TOKEN`, lancia da un terminale
`<cartella del plugin>/bin/forgia setup --url <url>`, che lo chiede senza mostrarlo (`forgia` è nel
PATH solo dentro Claude Code; `/cantiere server` ti dice il percorso intero).

## Il comando `/cantiere`

| Forma | Cosa fa |
|---|---|
| `/cantiere <nome> [— descrizione]` | apre il cantiere, o entra in quello aperto con lo stesso nome |
| `/cantiere padre/figlio` o `/cantiere figlio --padre padre` | apre `figlio` come figlio di `padre` (creato se non c'è) |
| `/cantiere chiudi [completato\|sospeso\|abbandonato] [nota]` | chiude il cantiere per tutte le sessioni; rifiutato se ha figli aperti |
| `/cantiere chiudi -f [esito] [nota]` | chiude il cantiere e tutti i suoi figli aperti, con lo stesso esito |
| `/cantiere` o `/cantiere stato` | configurazione, server, ultima sessione |
| `/cantiere server <url> [nome]` | setup (o nuovo URL/token), poi apre `nome` se c'è; tutto in un turno |
| `/cantiere permessi` | aggiunge `mcp__forgia` ai permessi consentiti, con un backup di `settings.json` |
| `/cantiere on` / `off` | accende o spegne il tracciamento, in modo persistente |

Funziona anche come `/forgia:cantiere`.

## Esclusioni e variabili

- Un file `.forgia-off` nella cartella o nella radice git spegne il plugin per quel progetto.
- `FORGIA_DISABLED=1` lo spegne per la sessione.
- `FORGIA_URL` e `FORGIA_TOKEN` hanno la precedenza sulla configurazione salvata.
- `FORGIA_DEBUG=1` scrive input degli hook e risposte del server in `debug.log` nella cache, con
  prompt e messaggi dell'assistente oscurati.

Configurazione: `$XDG_CONFIG_HOME/forgia/config.json` (di default `~/.config/forgia/`, su Windows
`%APPDATA%\forgia\`), permessi 0600. Cache, coda e log: `$XDG_CACHE_HOME/forgia/` (di default
`~/.cache/forgia/`, su Windows `%LOCALAPPDATA%\forgia\`).

## Sviluppo

Il sorgente è `bin/forgia.mts`. Si spedisce compilato in `bin/forgia.mjs`, perché il type stripping
di Node costava circa 280 ms a ogni hook. Dalla radice della repo:

```sh
npx tsc -p plugin/tsconfig.build.json   # rigenera bin/forgia.mjs: un test controlla che sia aggiornato
npx tsc -p plugin                       # controllo dei tipi
node --test "plugin/**/*.test.ts"       # test
claude --plugin-dir plugin              # prova del plugin dalla cartella di sviluppo
```

`test/dati/` contiene i payload degli hook e un transcript registrati con Claude Code 2.1.299, con
testi e percorsi sostituiti.
