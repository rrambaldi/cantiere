# Design

## Context

Repo nuova, non ancora sotto git: oggi contiene solo i due prompt di partenza (`server.md`,
`prompt-plugin.cmd`), il brief del nome e `openspec/`. Motivazione e perimetro: vedi
`proposal.md`. Requisiti: vedi `specs/`.

I due prompt di partenza chiedevano Python. Il progetto si scrive invece in **TypeScript su Node
22**: i requisiti restano quelli, cambiano stack e strumenti.

Vincoli che pesano sul come:

- **Contratto v1** fisso. Server e plugin si toccano solo lì. Unica modifica: il nome tecnico
  `forgia` al posto di `cantieri` (vedi D2).
- **Node sulla macchina di sviluppo**: 22.22.1 in `/usr/bin/node`, npm 10.9.4. Server e plugin
  chiedono Node ≥ 22.18, la prima 22 che esegue TypeScript senza flag (D3).
- **Provato su questa macchina** (Node 22.22.1): `node main.ts` gira senza flag e senza avvisi
  (`process.features.typescript` = `"strip"`); `enum` dà errore; `node --test` trova da solo i
  `*.test.ts`. Avvio di un file minimo: ~210 ms per `.ts` contro ~110 ms per `.mjs`, e
  `NODE_COMPILE_CACHE` non cambia nulla. Stato delle linee Node al 2026-10-14: 24 Active LTS, 22
  Maintenance fino al 2027-04-30, 26 Current (LTS dal 2026-10-28); 18 e 20 a fine vita.
- **Versioni verificate sui pacchetti pubblicati** (lette dai tarball, non a memoria):
  `@modelcontextprotocol/server` 2.3.1, `@modelcontextprotocol/node` 2.1.1,
  `@modelcontextprotocol/client` 2.3.1 (SDK v2, stabile dal 2026-07-27, protocollo 2026-07-28 più
  i client del 2025), `kysely` 0.29.6, `better-sqlite3` 13.0.3, `zod` 4.6.7, `typescript`
  7.0.2 (la versione nativa, `latest` su npm), `@types/node` 22.20.5, `@types/better-sqlite3`
  9.6.0. Kysely e better-sqlite3 chiedono Node ≥ 22, l'SDK Node ≥ 20.
- **Plugin**: nessuna dipendenza npm, solo moduli interni di Node. Deve girare su
  Linux/macOS/Windows (Git Bash). Claude Code installato: 2.1.299.
- **Accertato con sessioni vere** (task 7.1, `claude -p --plugin-dir plugin`):
  - `UserPromptSubmit.prompt` riceve il testo grezzo: `/cantiere x` e `/forgia:cantiere x`.
    `UserPromptExpansion` scatta solo se il comando esiste e riscrive in `/forgia:cantiere`.
  - Un file in `commands/` risponde solo a `/forgia:cantiere`. Una skill
    (`skills/cantiere/SKILL.md`, `disable-model-invocation: true`) risponde anche a `/cantiere`. Nel
    testo della skill `${CLAUDE_SESSION_ID}`, `${CLAUDE_PLUGIN_ROOT}` e `$ARGUMENTS` vengono
    sostituiti, e `Bash(forgia *)` negli `allowed-tools` funziona.
  - La shell del tool Bash ha `CLAUDE_CODE_SESSION_ID`. Gli hook ricevono anche
    `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`.
  - Payload: `TaskCreate` `tool_input {subject, description}` → `tool_response {task: {id,
    subject}}`; `TaskUpdate` `tool_input {taskId, status}` → `tool_response {success, taskId,
    updatedFields, statusChange}`; `TodoWrite` `tool_input.todos [{content, status, activeForm}]`.
    In `-p` i tool Task ci sono solo con `--tools`.
  - Transcript: un blocco per riga negli `assistant`, `tool_use` paralleli su righe separate,
    `tool_result` dentro righe `user`, molte righe di servizio (`attachment`, `queue-operation`,
    ...), il corpo di una skill come riga `user` con `isMeta: true`.
- **Verifiche già fatte sulla documentazione corrente di Claude Code** (hooks, plugins, slash
  commands, MCP, permessi). Cambiano alcune cose rispetto a `prompt-plugin.cmd`:
  - `TodoWrite` è spento di default: i tool di default sono `TaskCreate`, `TaskUpdate`,
    `TaskGet`, `TaskList`. La forma di `tool_input`/`tool_response` dei Task non è documentata.
  - `SessionStart.source` può valere anche `fork`, che il contratto non prevede.
  - `async: true` sugli hook `command` esiste: l'hook gira in background, la sua decisione non
    conta e l'eventuale output arriva al turno dopo. Con `claude -p` gli hook async ancora vivi
    vengono cancellati alla chiusura.
  - `SessionEnd` ha timeout di default 1,5 s.
  - La `bin/` del plugin è nel PATH della shell del tool Bash. `CLAUDE_PLUGIN_ROOT` arriva agli
    hook ma non ai comandi Bash lanciati da Claude.
  - `${CLAUDE_SESSION_ID}` è sostituito nel contenuto delle skill. Per i comandi la doc non è
    esplicita.
  - Non è documentato se `UserPromptSubmit.prompt` contiene il testo grezzo di `/cantiere ...`.
    Esiste l'evento `UserPromptExpansion`, che lo riceve grezzo.
  - `claude mcp add` fallisce se il nome esiste già nello stesso scope. `claude mcp remove <nome>
    --scope user` esiste.
  - Il permesso `mcp__forgia` copre tutti i tool del server.
  - `Bash(*forgia*)` negli `allowed-tools` non è documentato. `Bash(forgia *)` segue la sintassi
    documentata.

## Goals / Non-Goals

**Goals:**

- Un solo punto di verità per il contratto e un solo punto di verità per ogni regola: REST e MCP
  passano dalla stessa funzione di dominio.
- Il plugin non perde eventi anche se viene ucciso a metà (Claude Code che esce, async
  cancellato).
- Le parti non documentate di Claude Code si verificano con un primo esperimento, prima di
  scrivere il codice che ci dipende.
- Nessun passo di build: server e plugin girano dal sorgente TypeScript.

**Non-Goals:**

- Più processi server: il rate limit in memoria presume un solo processo (D8).
- Migrazioni oltre la prima: c'è solo lo schema v1 (D7).
- Dichiarare il server MCP dentro il plugin (`.mcp.json` con `userConfig`): darebbe tool
  `mcp__plugin_forgia_forgia__*`, contro il contratto.

## Decisions

### D1. Monorepo con due parti indipendenti

```
docs/contratto-v1.md              il contratto, unica fonte
.claude-plugin/marketplace.json   marketplace locale: plugin "forgia" da ./plugin
server/                           pacchetto npm privato "forgia-server" + deploy + test
plugin/                           plugin Claude Code "forgia" + test
package.json, tsconfig.base.json  workspace npm: typescript e tipi di Node per tutte e due
```

Server e plugin non condividono codice: il plugin deve restare senza dipendenze e installabile da
solo. Il contratto sta in `docs/` e i due prompt di partenza smettono di essere la fonte.
*Alternativa scartata*: mettere il plugin nel marketplace *armamentarium*
(`~/progetti/claude-plugins`). Lì il pacchetto `omnia` aggrega solo skill e hook, non `bin/` e
`commands/`: si valuta dopo, quando il plugin è stabile.

### D2. Nome tecnico `forgia` in una costante

Ogni identificativo che nel prompt diceva `cantieri` diventa `forgia`: server MCP e tool
`mcp__forgia__*`, prefisso `[forgia]` nel contesto, `FORGIA_*`, `.forgia-off`,
`~/.config/forgia/`, `~/.cache/forgia/`, `bin/forgia`, `forgia-admin`.
Restano i termini di dominio e il comando `/cantiere`, che come comando di plugin è anche
`/forgia:cantiere` (la regex del contratto lo copre già).
Server e plugin hanno ciascuno due costanti:

- `NOME = "forgia"`: da qui derivano prefisso, nomi e percorsi. Gli identificativi devono essere una
  parola sola senza spazi.
- `NOME_VISIBILE = "cantiere forgia"` (scelto dall'utente, per ora): messaggi all'utente
  (`cantiere forgia non configurato: lancia /cantiere`, `cantiere forgia richiede Node.js ≥
  22.18`), `title` del server MCP, output della CLI. README e descrizioni di `plugin.json` e
  `marketplace.json` lo scrivono a mano.

Cambiare uno dei due nomi è una riga per parte. Il prefisso `[forgia]` nel contesto resta tecnico:
lo legge Claude, non l'utente, e deve costare pochi token.

### D3. TypeScript eseguito da Node, senza build

Il server è fatto di file `.ts` ESM che Node 22.18+ esegue direttamente: toglie le annotazioni
di tipo e lancia il resto (type stripping). Non c'è `dist/` e non c'è un passo di build.

**Il plugin invece si spedisce compilato.** La misura del task 8.3 ha superato la soglia: l'hook
sincrono `prompt` in `.ts` aveva una mediana di ~415 ms (325–568), lo stesso codice in `.js` ~130 ms.
Il sorgente è `plugin/bin/forgia.mts`; `npx tsc -p plugin/tsconfig.build.json` genera
`plugin/bin/forgia.mjs`, che sta in git ed è quello che gli hook lanciano. Un test fallisce se il
`.mjs` non corrisponde al sorgente.

Regole che il type stripping impone, fissate nel `tsconfig.base.json`:

- solo sintassi cancellabile (`erasableSyntaxOnly`): niente `enum`, `namespace`, parameter
  properties. Al posto degli `enum` si usano unioni di stringhe e oggetti `as const`;
- import relativi con estensione `.ts` (`allowImportingTsExtensions`), import di soli tipi con
  `import type` (`verbatimModuleSyntax`);
- `module: "nodenext"`, `strict`, `noEmit`, `types: ["node"]`, `skipLibCheck`.

`tsc --noEmit` controlla i tipi ed è il primo passo di `npm test`. Il workspace alla radice
(`workspaces: ["server"]`) porta `typescript` e `@types/node` per server e plugin. Il plugin non ha
un `package.json` suo e nessuna dipendenza a runtime.

**TypeScript 7.** È la `latest` su npm, ed è il compilatore riscritto in Go. Se dà problemi su
queste opzioni, si fissa `typescript@^6` senza toccare il codice.

**Avvio più lento.** Un `.ts` parte in ~210 ms contro ~110 ms di un `.mjs`: per il server, che
parte una volta, non conta; per il plugin sì (vedi sopra).
*Alternativa scartata*: JavaScript con JSDoc, più veloce ma senza i tipi che servono a tenere in
riga contratto, dominio e schema del database.

### D4. Server: una sola funzione di dominio per REST e MCP

```
server/
  package.json        "type": "module", engines node >=22.18, bin forgia-admin, script start/test
  tsconfig.json       estende ../tsconfig.base.json
  src/
    nome.ts           NOME, VERSIONE_CONTRATTO
    config.ts         FORGIA_* da process.env, default, validazione con zod
    db.ts             istanza Kysely tipizzata (interfaccia delle tabelle), WAL, migrator
    migrazioni/0001_iniziale.ts
    modelli.ts        schemi zod dell'input (e tipi derivati con z.infer), limiti di lunghezza
    dominio.ts        riceviEvento, apri, chiudi, associazione, todo, stati, letture
    contesto.ts       testi di contesto (funzioni pure)
    accesso.ts        Bearer, rate limit, lettura del corpo con limite
    api.ts            handler REST
    strumenti.ts      server MCP e i cinque tool
    app.ts            creaApp(): server node:http, smistamento /api/v1/* e /mcp
    admin.ts          CLI forgia-admin (util.parseArgs), con shebang node
    main.ts           avvio
  test/               *.test.ts
  deploy/             forgia.service, Caddyfile, forgia.env.example
  scripts/smoke.sh
```

`dominio.riceviEvento(cliente, evento) -> {codice, risposta}` è l'unico posto dove vivono
precedenza, associazione, transizioni e contesto. I tool MCP costruiscono un evento interno (id e
`ts` generati dal server) e chiamano le stesse funzioni. Così i test sulle regole valgono per
entrambe le strade.

**`node:http` senza framework.** Le route REST sono quattro, e il transport MCP per Node lavora
direttamente su `IncomingMessage`/`ServerResponse`. Un framework aggiungerebbe una dipendenza per
uno smistamento di dieci righe.

**Configurazione solo da ambiente.** `config.ts` legge `FORGIA_*` da `process.env`. Il file
`.env` lo carica Node stesso: `node --env-file-if-exists=.env src/main.ts` in sviluppo,
`EnvironmentFile=` nella unit systemd. Con `--env-file` una variabile già presente nell'ambiente
vince sul file, come chiede la spec. Niente `config.toml`: Node non ha un parser TOML interno, e
le chiavi sono tutte valori semplici.

### D5. Idempotenza con l'archivio degli eventi

In una sola transazione: insert in `eventi` (indice unico su `evento_id`), applicazione degli
effetti, calcolo della risposta, salvataggio di codice HTTP e risposta sulla riga. Se l'insert
viola l'unicità, rollback e si restituiscono codice e risposta salvati. La violazione si
riconosce dal codice d'errore del driver (`SQLITE_CONSTRAINT_UNIQUE`, `23505` su PostgreSQL).
Anche un 409 viene salvato, così il reinvio riceve di nuovo 409.

### D6. Regole sui cantieri: scelte di dettaglio

- **Slug**: minuscolo, accenti tolti (`normalize("NFKD")`), tutto ciò che non è alfanumerico
  diventa `-`. L'unicità tra i cantieri aperti usa una colonna `slug_aperto`, unica e nullable:
  vale lo slug finché il cantiere è aperto e diventa NULL alla chiusura. È portabile, senza
  indici parziali.
- **Sessione senza cantiere**: la regola si applica a ogni evento tranne `apri_cantiere` (che
  associa da sé) e `chiudi_cantiere` (senza cantiere non c'è niente da chiudere: 200 con
  `cantiere: null`). La ricerca del cantiere da agganciare scorre nel codice i cantieri aperti
  e la loro sessione più recente: sono pochi, e una query con finestre non serve.
- **Senza git**: il nome della cartella è l'ultimo segmento di `cwd`. Una sessione creata da MCP
  non ha host né cwd: si salvano `host = "mcp"`, `cwd = ""`, e il provvisorio si chiama
  `senza-cartella`.
- **Fuori ordine**: due "ultimo ts applicato" separati sulla sessione, uno per lo stato e uno per
  lo snapshot dei todo, così un `todo` in ritardo non blocca uno `stop`. Le variazioni per id
  usano il `ts` di ogni todo. `turni` cresce a ogni `prompt` nuovo anche se arriva in ritardo: il
  turno c'è stato. `apri_cantiere` e `chiudi_cantiere` si applicano sempre.
- **Hint**: `hint_inviati` cresce solo quando il server restituisce l'hint. I reinvii
  restituiscono la risposta salvata e non lo contano due volte.
- **Casi limite decisi in implementazione**: `chiudi_cantiere` senza cantiere risponde con il
  contesto `[forgia] Comando /cantiere gestito: nessun cantiere da chiudere. ...`; un provvisorio
  il cui slug coincide con un cantiere aperto entra in quel cantiere; una variazione di todo senza
  id si ignora, e in uno snapshot una voce senza id prende la chiave `#<posizione>`; i 422 hanno
  corpo `{"errore": <messaggio>}`; `?attive=1` ed `elenca_cantieri` mostrano solo sessioni attive
  (non chiuse e non `inattiva`).

### D7. Schema e migrazioni con Kysely

Kysely è un query builder, non un ORM: è l'equivalente di SQLAlchemy Core. Con TypeScript
un'interfaccia delle tabelle in `db.ts` rende tipizzate tutte le query. Il suo schema builder
genera il DDL giusto per SQLite e per PostgreSQL, quindi le stesse migrazioni valgono per tutti e
due. Si cambia solo `FORGIA_DATABASE_URL`, che sceglie il dialetto.

Tabelle come nel modello indicativo di `server.md`, più: `eventi.codice_http`,
`cantieri.slug_aperto`, `sessioni.ultimo_ts_stato`, `sessioni.ultimo_ts_todo`. Tempi come testo
ISO 8601 UTC a lunghezza fissa (`toISOString()`): l'ordine alfabetico è quello cronologico, su
tutti e due i database. `dati` e `risposta` sono testo JSON. Nessuna funzione SQL specifica di
SQLite. WAL e `busy_timeout` impostati all'apertura.

Migrazioni: il `Migrator` di Kysely con file numerati `NNNN_nome.ts` (`up`/`down`).
`FileMigrationProvider` carica con `import()` e accetta solo `.js`/`.mjs`/`.cjs`: per i `.ts` si
passa un provider di poche righe che legge la cartella e importa i file. Lo verifica il task 2.3. Kysely tiene
il registro delle migrazioni nelle sue tabelle (`kysely_migration`, `kysely_migration_lock`) al
posto di `schema_version`: è lo stesso meccanismo, già pronto. La 0001 crea le tabelle v1.

Dettagli verificati su Kysely 0.29.6:

- `Migrator` e `FileMigrationProvider` si importano da `kysely/migration` (dall'entry principale
  fallisce). La cartella delle migrazioni va passata con percorso assoluto
  (`fileURLToPath(new URL("./migrazioni", import.meta.url))`): un percorso relativo verrebbe
  risolto rispetto ai file di Kysely.
- Su SQLite le migrazioni **non** girano in una transazione (DDL non transazionale per Kysely). La
  0001 crea solo tabelle su un database vuoto: se fallisce a metà si cancella il file e si
  riparte. Su PostgreSQL sono transazionali.
- Una sola connessione con mutex: dentro `db.transaction().execute(trx => ...)` si usa sempre
  `trx`. Una query sul `db` esterno dentro la callback resta in attesa del mutex per sempre.

Il server non migra da solo: se mancano migrazioni all'avvio esce con 1 e dice di lanciare
`forgia-admin migra`. `forgia-admin` carica `.env` dalla cartella corrente
(`process.loadEnvFile`), come `npm start`. PostgreSQL passa da un `import("pg")` dinamico: `pg`
non è tra le dipendenze e quella strada non è ancora provata.

Driver SQLite: `better-sqlite3` 13 con il `SqliteDialect` di Kysely. I binari precompilati sono
dentro il pacchetto (Node-API v10: Node 22.14+, 24, 26 senza ricompilare; su Linux x64 serve glibc
≥ 2.34). *Alternativa scartata*: `node:sqlite`. In Node 22 stampa un ExperimentalWarning, Kysely
non ha un dialetto ufficiale per lui (servirebbe un adattatore), e in Node 26 le sue classi
cambiano nome.

### D8. Concorrenza: un processo solo

Node esegue il JavaScript su un solo thread, e il dialetto SQLite di Kysely usa una sola
connessione con un mutex: le transazioni non si intrecciano. Non servono lock né threadpool.
Il rate limit in memoria vale perché il processo è uno solo, ed è scritto nel README e nella unit
systemd. Con PostgreSQL e più processi il rate limit andrà spostato (fuori ambito).

Con `SIGTERM`/`SIGINT` il server chiude anche le connessioni ancora aperte
(`closeAllConnections`): uno stream MCP tenuto aperto dal client lo bloccherebbe fino al `kill -9`
di systemd. Un evento interrotto torna dalla coda del plugin, e l'`evento_id` lo rende
idempotente. Trovato nella prova end-to-end, coperto da `test/avvio.test.ts`.

### D9. Accesso: un filtro unico davanti a REST e MCP

In `app.ts`, per ogni richiesta su `/api/v1/*` e `/mcp`, prima dello smistamento:

1. **Bearer**: hash SHA-256 del token, lookup del cliente, `crypto.timingSafeEqual` sull'hash,
   401 con corpo vuoto. Il cliente viene attaccato alla richiesta, da dove lo leggono handler e
   tool.
2. **Rate limit**: finestra fissa di un minuto per cliente, `Map` in memoria, 429.
3. **Corpo**: rifiuto subito se `Content-Length` supera `max_body`. Altrimenti si leggono i chunk
   contando i byte, e si interrompe appena si supera. 413.

**Validazione**: schemi zod con unione discriminata su `tipo` e oggetti `strict` (un campo in più
è un errore di validazione, 422), come chiede la validazione stretta. zod serve comunque all'SDK
MCP per gli schemi dei tool: una libreria sola per tutte e due le strade. Limiti di lunghezza in
costanti di `modelli.ts`: nome 80, descrizione e nota 500, testo todo 500,
`fatto`/`prossimo`/`bloccato_da` 400 (la descrizione del tool chiede ~200: il limite duro
tollera), `cwd` 1024, host/repo/branch 255, `session_id` 128, al massimo 200 todo per evento.

**Log**: una riga JSON per richiesta su stdout, con solo tipo, session_id, cliente ed esito. Il
journal di systemd la raccoglie.

### D10. MCP nello stesso server, con l'SDK v2

SDK MCP ufficiale v2: `@modelcontextprotocol/server` e `@modelcontextprotocol/node`. La v1
(`@modelcontextprotocol/sdk` 1.32) è ormai solo in manutenzione e si ferma al protocollo
2025-11-25.

- **Handler.** `createMcpHandler(fabbrica)` avvolto una volta da
  `toNodeHandler(...)` e chiamato sulla route `/mcp` del server `node:http`. La fabbrica crea un
  `McpServer` (`name: "forgia"`, `title: "cantiere forgia"`) con i cinque tool a ogni richiesta HTTP: nessuno stato MCP in memoria.
  Serve il protocollo 2026-07-28 e, in modalità stateless, i client del 2025 (`legacy:
  "stateless"`, il default). GET e DELETE rispondono già 405. `responseMode` resta al default
  `auto`: con `"json"` l'SDK installato stampa un avviso a ogni avvio, e i tool non mandano
  notifiche, quindi le risposte sono comunque JSON.
  *Alternativa scartata*: `NodeStreamableHTTPServerTransport` con server e transport nuovi per
  ogni richiesta. Parla solo il protocollo del 2025, e GET e DELETE vanno chiusi a mano.
- **Host e origin.** `createMcpHandler` non controlla host e origin, e le opzioni
  `allowedHosts`/`allowedOrigins` del transport sono deprecate. Prima dell'handler si chiamano le
  guardie di `@modelcontextprotocol/node`: `hostHeaderValidation([public_host, "127.0.0.1",
  "localhost", "[::1]"])` e `originValidation(["https://<public_host>"])` più quelle
  `localhost*`. Quando rifiutano rispondono già 403. `hostHeaderValidation` ignora la porta
  (verificato sui tipi installati), quindi `127.0.0.1:<porta>` passa.
- **Cliente nei tool.** Il filtro di D9 imposta `req.auth = { token: "", clientId:
  String(cliente.id), scopes: [] }`. `toNodeHandler` lo inoltra e la fabbrica lo riceve come
  `authInfo`: il server MCP di quella richiesta nasce già legato al cliente, e i tool non leggono
  `ctx`. Il token in chiaro non passa oltre il filtro.
- **Registrazione.** `server.registerTool(nome, { description, inputSchema: z.object({...}),
  outputSchema }, (args, ctx) => ...)`. Descrizioni in italiano. Parametri descritti con
  `.describe()` negli schemi zod 4 (l'SDK vuole zod ≥ 4.2; la forma "raw shape" è deprecata).
- **Risultati.** L'SDK non trasforma da solo `structuredContent` in testo: ogni tool restituisce
  `{ content: [{ type: "text", text: <una riga> }], structuredContent: <oggetto> }`.
  `outputSchema` c'è su `apri_cantiere`, `aggiorna_stato` e `chiudi_cantiere` (`{ ok, cantiere,
  motivo }`). `elenca_cantieri` e `stato_sessione` restituiscono strutture lunghe senza schema. Il rifiuto
  per precedenza è un risultato normale `{ ok: false, motivo }` che rispetta l'`outputSchema`:
  senza `isError`, uno `structuredContent` fuori schema verrebbe sostituito dall'SDK con un
  errore di validazione. Un'eccezione nel tool diventa `isError` con il suo messaggio, che arriva
  al client così com'è: il dominio lancia solo messaggi in italiano pensati per Claude, mai
  dettagli interni.
- **Header.** Le POST MCP vogliono `Content-Type: application/json` e `Accept` con
  `application/json` e `text/event-stream`. Claude Code e il client dell'SDK li mandano già.

### D11. Plugin: uno script, hook nativi async, coda come outbox

```
plugin/
  .claude-plugin/plugin.json
  hooks/hooks.json
  skills/cantiere/SKILL.md   il comando /cantiere (skill: così risponde anche senza prefisso)
  tsconfig.json              estende ../tsconfig.base.json (controllo dei tipi)
  tsconfig.build.json        compila forgia.mts in forgia.mjs
  bin/forgia                 wrapper sh
  bin/forgia.mts             tutto il plugin, solo moduli interni di Node
  bin/forgia.mjs             il compilato, quello che gira
  test/                      *.test.ts + payload e transcript registrati (dati/)
```

**Node ≥ 22.18.** È la linea LTS più vecchia ancora supportata, e la prima 22 che esegue
TypeScript senza flag. Ha tutto quello che serve: `fetch`, `AbortSignal.timeout`, `randomUUID`,
`util.parseArgs`, `node:test`.

**Costo dell'avvio.** Con il `.mjs` compilato (D3), misurato dal wrapper: `prompt` 87–154 ms,
`session_start` 194–308 ms (mediane, su una macchina a 2 core già carica).

**Wrapper `bin/forgia`.** Gli utenti di Claude Code installato con l'installer nativo possono non
avere Node. Lancia `node bin/forgia.mjs`. Per `hook ...` esce con 0 in silenzio se `node` manca,
e lancia lo script con stderr scartato ed exit 0 comunque: anche un Node troppo vecchio non
produce errori visibili. Per gli altri sottocomandi controlla la versione (≥ 22.18), e se non va
stampa `cantiere forgia richiede Node.js ≥ 22.18` ed esce con 127: è il messaggio che `/cantiere`
gira all'utente. Il JavaScript compilato girerebbe anche su Node 22.0; il minimo resta 22.18 come
dice la spec.

**Coda come outbox.** Ogni evento viene scritto in coda *prima* dell'invio: un file per evento in
`<cache>/coda/<ts_ns>-<evento_id>.json`, scritto su file temporaneo e poi rinominato. Ogni invio
manda prima il proprio evento, poi il resto della coda in ordine, entro un tetto di 1,5 s: così un
hook sincrono riceve subito la sua risposta, e il server riordina comunque per `ts`. Un hook ucciso a
metà non perde nulla, e non servono lock: due hook che svuotano insieme mandano al massimo lo stesso evento due
volte, e l'idempotenza del server lo assorbe. 401, 429, 5xx e rete giù lasciano l'evento in coda;
409, 413 e 422 lo tolgono (rifiuto definitivo).

**Async al posto del processo staccato.** La doc conferma `async: true`, quindi niente processi
figli staccati:

| Evento | Hook | Cosa fa |
|---|---|---|
| `SessionStart` | sync, timeout 5 | invia, inietta il contesto |
| `UserPromptSubmit` | sync, timeout 5: `hook prompt` | riconosce `/cantiere` (e lo invia, sync); altrimenti inietta il contesto in cache, senza rete |
| `UserPromptSubmit` | async: `hook prompt_invio` | invia `prompt` (salta i `/cantiere`), aggiorna la cache |
| `PostToolUse` `TodoWrite\|TaskCreate\|TaskUpdate` | async | invia `todo` |
| `Stop` | sync, timeout 10 | decide il blocco, invia `stop` |
| `SessionEnd` | async | invia `session_end` (se viene cancellato, l'evento resta in coda) |

Il contesto restituito per un `prompt` si inietta al prompt successivo. È lo stesso ritardo del
disegno originale con il processo staccato, ed è anche la strada con cui arrivano le regole dopo
un `session_start` tardivo.

**Riconoscimento di `/cantiere`.** Su `UserPromptSubmit`, che riceve il testo grezzo (task 7.1).

**Cache per sessione.** `<cache>/sessioni/<session_id>.json` con `primo_visto`,
`avvio_reale_il`, `cantiere`, `config` dell'ultima risposta, `contesto_pendente` (scritto da chi
riceve una risposta con contesto a `session_start` o `prompt`, svuotato da chi lo inietta; più
contesti in attesa si uniscono con un a capo). Scritture atomiche.
`<cache>/attesa/` contiene le operazioni in attesa, una per cwd. `<cache>/avvisi` ricorda l'ultimo
avviso "non configurato".

**`source` fuori contratto.** `fork`, o un valore futuro che il contratto non conosce, si manda come
`resume` (la sessione continua una conversazione esistente). Il contratto resta com'è.

**Operazioni in attesa e session_id.** `forgia apri|chiudi` prendono il session_id da
`--session-id` o da `CLAUDE_CODE_SESSION_ID`, che la shell del tool Bash ha già (task 7.1), e
inviano subito. L'attesa legata alla cwd resta solo per chi lancia `forgia apri` da un terminale.

**Niente `<cache>/plugin_root`.** La `bin/` del plugin è già nel PATH del tool Bash: il comando
chiama `forgia` e basta. È una deviazione voluta da `prompt-plugin.cmd`.

**Todo.** `TodoWrite`: `tool_input.todos` (`content`, `status`), snapshot completo. `TaskCreate`:
testo da `tool_input.subject`, id da `tool_response.task.id`. `TaskUpdate`: `taskId` e `status` da
`tool_input` (testo vuoto se non cambia: il server tiene quello che ha). Forme accertate nel task
7.1, payload in `plugin/test/dati/`.

**Transcript nello Stop.** Si legge il JSONL dalla fine all'indietro fino all'ultimo messaggio
`user` il cui contenuto non è solo `tool_result`, e si contano i blocchi `tool_use` dei messaggi
`assistant`. Qualunque riga illeggibile o forma inattesa rende il conteggio non affidabile: si
manda `stop` con `strumenti_nel_turno: 0` e non si blocca.

**Git.** `execFileSync("git", ...)` con `timeout: 1000` e stderr scartato, per remote `origin` e
branch, solo quando un evento parte davvero. La radice del repo (per `.forgia-off`) si trova
salendo le cartelle fino a `.git`, senza lanciare git.

**Setup senza `claude` nel PATH.** Stampa la configurazione MCP da aggiungere a mano con
`Bearer <token>` al posto del token vero, e lascia `mcp_registrato_il` a null: finché non si rifà
il setup con `claude` disponibile, lo `Stop` non blocca.

**Setup in un turno.** Gli `allowed-tools` della skill valgono solo nel turno in cui parte (prova
end-to-end): un setup che chiede l'URL e poi lo usa al turno dopo fa partire una richiesta di
approvazione, e in `claude -p` si blocca. Per questo tutto quello che il setup deve sapere arriva
con il comando: `/cantiere server <url> [nome]` fa setup e apertura nello stesso turno, e
`/cantiere permessi` è una forma a parte. Il token non passa mai dalla chat: arriva da
`FORGIA_TOKEN`, oppure l'utente lancia `forgia setup` da un terminale, che lo chiede senza
mostrarlo (`readline` con l'eco spento). `--token-stdin` resta per gli script. Senza
configurazione, ogni altra forma di `/cantiere` risponde in una riga con la forma giusta.
Registrazione MCP: `claude mcp remove forgia --scope user` (errore ignorato), poi `claude mcp add
--transport http --scope user forgia <url>/mcp --header "Authorization: Bearer <token>"`, con
`execFileSync` e argomenti separati (niente shell). Il permesso si aggiunge con un sottocomando a
parte, `forgia permetti-mcp`, che parte solo con `/cantiere permessi`: backup
`settings.json.bak-<data>` e unione di `permissions.allow`.

**Comando.** È una skill (vedi Context): `disable-model-invocation: true`, `argument-hint`,
`allowed-tools: Bash(forgia *)` più i tre tool MCP. Corpo corto: le quattro regole di
`prompt-plugin.cmd`, sezione 3, più il caso "Node mancante".

### D12. Test

Runner interno di Node (`node --test`, che trova da solo i `*.test.ts`) e `node:assert`, per
server e plugin: nessuna dipendenza di test. `npm test` = `tsc --noEmit` e poi `node --test`.

- **Server**: un database SQLite temporaneo e un `creaApp()` nuovo per test, in ascolto sulla
  porta 0 (il sistema ne sceglie una libera). REST con `fetch`. MCP con `Client` e
  `StreamableHTTPClientTransport` di `@modelcontextprotocol/client` (dipendenza di sviluppo),
  token in `requestInit.headers`. I tool si provano due volte: con la negoziazione di default
  (handshake del 2025) e con il protocollo 2026-07-28 fissato (`versionNegotiation`), perché non
  sappiamo quale usa Claude Code. Si testa il vero server HTTP, filtro compreso.
- **Plugin**: test sotto il Node di sistema (22.22.1) con `node --test "plugin/**/*.test.ts"`
  (`node --test plugin/` in Node 22 prende la cartella per un file). Server finto con
  `node:http`, oppure una porta chiusa per il fail-open.
- **End-to-end**: server locale, `claude --plugin-dir plugin` con `XDG_CONFIG_HOME` e
  `XDG_CACHE_HOME` temporanei. `claude mcp add --scope user` scrive invece nella config reale di
  Claude Code dell'utente: la registrazione di prova va tolta alla fine.

### D13. Cantieri padre e figli

Chiesto dall'utente dopo la prova end-to-end, prima di qualunque rilascio: per questo entra nel
Contratto v1 (`docs/contratto-v1.md`, sezione "Cantieri padre e figli") invece di aprire una v1.1.
Le regole sono nella spec `server/cantieri`; qui le scelte di come.

- **Schema.** Una colonna `cantieri.padre_id`, nullable, che punta a `cantieri.id`. Nessun
  database esiste ancora fuori dai test, quindi la colonna entra nella `0001` invece che in una
  `0002`. Il `percorso` non si salva: si ricostruisce salendo i `padre_id` (pochi livelli).
- **Slug globale.** Lo slug resta unico tra tutti i cantieri aperti, a qualunque livello: un figlio
  si trova anche solo per nome, e `slug_aperto` funziona com'è. Un percorso `a/b` dice solo che `b`
  è figlio di `a`; il padre di `a` non conta.
- **Due fasi, una transazione.** `apri_cantiere` prima controlla tutto in sola lettura (segmenti
  vuoti, padre diverso, cicli: salendo dal padre indicato non si deve incontrare il figlio), e solo se
  non c'è conflitto crea gli antenati mancanti e aggiorna i `padre_id`. Così un 409 non lascia
  cantieri creati a metà, e la riga dell'evento salva il 409 come per la precedenza (D5).
- **Chiusura.** I discendenti aperti si trovano scendendo i `padre_id` nel codice. Senza `forza`,
  409 con i nomi dei figli diretti aperti. Con `forza`, tutti i discendenti si chiudono nella stessa
  transazione con lo stesso esito e la stessa nota, e la riga di conferma li elenca.
- **MCP.** `apri_cantiere` prende `padre` (facoltativo) e `chiudi_cantiere` prende `forza` (default
  false). La descrizione dice di usare `forza` solo se l'utente l'ha chiesto. I rifiuti sono
  risultati normali `{ ok: false, motivo }`, come per la precedenza. `percorso` compare nel
  cantiere di ogni risultato e in `elenca_cantieri`.
- **Letture.** `GET /api/v1/cantieri` e `elenca_cantieri` danno `padre_id` e `percorso`;
  `forgia-admin cantieri` mostra il percorso al posto del nome.
- **Plugin.** `riconosci` toglie dagli argomenti `--padre <p>` e, dopo `chiudi`, `-f`/`--force`;
  il resto si legge come prima. Il percorso nel nome passa al server così com'è: lo risolve lui. Se il
  server risponde 409 a un `/cantiere` sincrono, l'hook inietta `[forgia] Comando /cantiere gestito:
  <errore> Rispondi all'utente con una sola riga.`; il 409 resta un rifiuto definitivo per la coda.
  `forgia apri --padre` e `forgia chiudi --forza|-f` fanno lo stesso da terminale.

## Risks / Trade-offs

- [Utenti senza Node, o con Node < 22.18: l'installer nativo di Claude Code non lo porta] → il
  plugin resta muto (fail-open) e `/cantiere` dice di installare Node ≥ 22.18. È il costo della
  scelta di Node e TypeScript per il plugin.
- [Il `.mjs` compilato può restare indietro rispetto al sorgente `.mts`] → un test lo
  ricompila e lo confronta, e fallisce se diverge.
- [TypeScript 7 appena uscito (compilatore in Go)] → serve solo per `tsc --noEmit`; ripiego su
  `typescript@^6` (D3).
- [Node non esegue TypeScript dentro `node_modules`] → `forgia-admin` è un bin del workspace, che
  punta alla cartella `server/` reale; il task 2.1 verifica che `npx forgia-admin` parta.
- [`better-sqlite3` è un modulo nativo] → la 13 porta i binari per Linux, macOS e Windows dentro
  il pacchetto; l'host di deploy deve avere Node ≥ 22.18 (per TypeScript) e, su Linux x64,
  glibc ≥ 2.34.
- [SDK MCP v2 giovane (stabile dal 2026-07-27)] → le API usate sono poche (D10) e coperte dai
  test sui due protocolli. La v1 resta come ripiego.
- [Query sul `db` esterno dentro una transazione Kysely: blocco per sempre su SQLite] → regola in
  D7, e un test di carico leggero con richieste concorrenti nel task 4.6.
- [Forma dei payload Task e testo grezzo dei comandi non documentati] → esperimento con
  `FORGIA_DEBUG=1` prima del parser (task 7.1); parser difensivo che salta ciò che non riconosce.
- [`/resume` dentro un processo già avviato dopo il setup: `avvio_reale_il` dice "tool caricati"
  ma non lo sono] → al massimo un turno sprecato. Il blocco successivo arriva con
  `stop_hook_active` e non blocca.
- [Due hook che scrivono la stessa cache di sessione: un aggiornamento può andare perso] → i campi
  sono idempotenti e il prossimo evento li riscrive. Un contesto pendente perso è un hint in meno.
- [Oggetti zod `strict` rifiutano un plugin più nuovo che manda un campo in più] → il campo nuovo
  richiede comunque una versione nuova del contratto. Il plugin tratta il 422 come rifiuto
  definitivo e non riempie la coda.
- [Token nell'argomento di `claude mcp add`, visibile per un attimo nella lista dei processi
  locali] → è il comando documentato. L'alternativa (scrivere a mano `~/.claude.json`) è più
  fragile.
- [Token incollato in chat che finisce nella conversazione] → il comando avvisa e propone
  `FORGIA_TOKEN` o `forgia setup` da terminale.
- [Gli `allowed-tools` della skill valgono solo nel turno in cui parte] → setup in un turno solo,
  con l'URL negli argomenti (D11).
- [Rate limit in memoria: un secondo processo lo romperebbe] → un processo solo, scritto nel
  README e nella unit systemd.

## Migration Plan

Progetto nuovo, niente da migrare. Messa in servizio:

1. `git init` della repo.
2. Server: `npm ci` in `server/`, `forgia-admin migra`, `forgia-admin token crea --cliente
   <nome>`, avvio locale, test e `scripts/smoke.sh`.
3. Plugin: test unitari, prova end-to-end contro il server locale.
4. Deploy su un host (fuori da questo change): Node 24 LTS consigliato (≥ 22.18 minimo), unit
   systemd e Caddyfile dai file in
   `server/deploy/`, poi `/cantiere server` per puntare il plugin all'URL pubblico.

Rollback: `forgia off` o `.forgia-off` spengono il plugin senza disinstallarlo. `claude mcp
remove forgia --scope user` toglie i tool. Il server si ferma con systemd senza effetti sulle
sessioni: il plugin è fail-open.

## Open Questions


- `source: "fork"` mandato come `resume`: va bene così, o il contratto passa a v1.1 con `fork`? Per
  ora il contratto non cambia.
