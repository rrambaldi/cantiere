# Proposal

## Why

Chi lavora con Claude Code su più sessioni e più computer perde il filo: non sa più a che punto è
ogni lavoro, chi ci sta lavorando e da quale macchina. Serve un registro che si aggiorni da solo,
senza toccare la privacy (mai prompt, transcript o output dei tool) e senza mai bloccare il
lavoro se qualcosa si rompe.

**forgia** è questo registro. Raggruppa le sessioni in **cantieri** (unità di lavoro che durano più
sessioni) e ha due parti che si parlano solo attraverso il **Contratto v1**: un server online e un
plugin per Claude Code. Il progetto parte da zero in questa repo.

## What Changes

- **Contratto v1 in un solo file** (`docs/contratto-v1.md`), copiato dai due prompt di partenza
  (`server.md`, `prompt-plugin.cmd`). Server e plugin lo seguono alla lettera; i due prompt
  smettono di essere la fonte.
- **Nome tecnico `forgia`** al posto di `cantieri` in tutti gli identificativi: server MCP
  `forgia` (tool `mcp__forgia__*`), prefisso del contesto `[forgia]`, variabili `FORGIA_*`, file
  `.forgia-off`, percorsi `~/.config/forgia/` e `~/.cache/forgia/`, CLI `forgia-admin`. Restano uguali i termini di dominio (cantiere, `apri_cantiere`, `/api/v1/eventi`,
  `salute`, `fatto`, `prossimo`...) e il comando `/cantiere` (qualificato: `/forgia:cantiere`).
- **Nome visibile, per ora: "cantiere forgia"**: README, descrizioni di plugin e marketplace,
  messaggi all'utente. Nome tecnico e nome visibile vivono in due costanti per componente:
  cambiare quello visibile non tocca gli identificativi.
- **Tutto in TypeScript su Node 22**, senza build: Node esegue i `.ts` da solo (type stripping,
  attivo di default da Node 22.18). `tsc` serve solo a controllare i tipi.
- **Server** (`server/`): Node ≥ 22.18, `node:http` senza framework, SDK MCP ufficiale per
  TypeScript/JavaScript con Streamable HTTP, Kysely (query builder) su SQLite WAL, zod per la
  validazione, configurazione da variabili `FORGIA_*` (anche da file `.env`). API REST eventi, tool MCP, regole sui cantieri, testo del contesto, autenticazione
  con token per cliente, rate limit, limiti sul corpo, CLI di amministrazione, migrazioni
  versionate, pulizia per retention, API di lettura minima, file di deploy (systemd, Caddyfile),
  smoke test.
- **Plugin** (`plugin/`): plugin Claude Code `forgia` con uno script che usa solo i moduli
  interni di Node ≥ 22.18 (`bin/forgia.ts` più wrapper `bin/forgia`), hook per tutti gli eventi di sessione, comando `/cantiere`,
  setup guidato con registrazione del server MCP, coda locale, operazioni in attesa, blocco
  dello `Stop` per il resoconto forzato.
- **Marketplace** alla radice della repo (`.claude-plugin/marketplace.json`) per installare il
  plugin dalla cartella di sviluppo o da git.

## Capabilities

### New Capabilities

- `server/accesso`: token per cliente, Bearer su REST e MCP, 401, rate limit, limite del corpo,
  `GET /api/v1/salute`, log senza segreti.
- `server/eventi`: `POST /api/v1/eventi`: validazione, idempotenza su `evento_id`, sessioni create
  al volo, transizioni di stato, eventi fuori ordine, todo, forma della risposta.
- `server/cantieri`: associazione sessione → cantiere: precedenza `utente` > `claude` > `auto`,
  cantiere provvisorio `<repo>@<branch>`, apertura per slug, chiusura per tutte le sessioni.
- `server/contesto`: testo di `contesto` composto dal server per ogni tipo di evento, hint del
  cantiere provvisorio, riga di conferma del comando.
- `server/strumenti-mcp`: i cinque tool MCP su `/mcp`, le loro descrizioni e il rifiuto chiaro
  quando la precedenza impedisce il cambio.
- `server/amministrazione`: configurazione, CLI `forgia-admin` (token, migrazioni, pulizia,
  tabelle), API di lettura minima, stato `inattiva` calcolato in lettura.
- `plugin/tracciamento`: hook che inviano gli eventi: fail-open, latenza, invio staccato, coda
  locale, sessione tardiva, operazioni in attesa, normalizzazione del repo, privacy, esclusioni,
  debug.
- `plugin/resoconto`: decisione di blocco dello `Stop` per far chiamare `aggiorna_stato`, lettura
  difensiva del transcript locale.
- `plugin/comando-cantiere`: `/cantiere` nelle sue forme (nome, `chiudi`, `stato`, `server`, `on`,
  `off`), riconosciuto dall'hook del prompt in modo deterministico.
- `plugin/configurazione`: setup (URL, token, verifica, salvataggio 0600, registrazione MCP,
  permessi), override da ambiente, `status`, `on`/`off`, percorsi di config e cache.

### Modified Capabilities

Nessuna: il progetto parte da zero.

## Impact

- **Codice nuovo**: `server/` (pacchetto npm privato `forgia-server`), `plugin/` (plugin Claude Code),
  `docs/contratto-v1.md`, `.claude-plugin/marketplace.json`. La cartella non è ancora una repo
  git: va inizializzata.
- **Dipendenze server**: SDK MCP, `kysely`, il driver SQLite, `zod`, in `node_modules` locale con
  `package-lock.json`. Sviluppo: `typescript` e i tipi di Node. Test con `node:test`, senza
  dipendenze in più. Node 22.22.1 è già installato sulla macchina.
- **Dipendenze plugin**: nessuna a runtime. Solo Node ≥ 22.18 nel PATH dell'utente: senza Node, o
  con un Node più vecchio, il plugin non fa nulla (fail-open) e `/cantiere` lo dice.
- **Sistemi esterni**: il setup del plugin scrive in `~/.config/forgia/`, `~/.cache/forgia/`,
  registra il server MCP con `claude mcp add --scope user` e, solo se l'utente accetta, aggiunge un
  permesso in `~/.claude/settings.json` con backup.
- **Fuori ambito**: dashboard/UI, PostgreSQL in produzione, OAuth, il deploy vero su un host
  pubblico (si consegnano i file di deploy, non la messa online), l'inserimento del plugin nel
  marketplace *armamentarium*, il logo.
