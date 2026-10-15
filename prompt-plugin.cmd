# Prompt per Claude Code — invio dello stato "cantieri" dal mio plugin

In questo plugin (la repo corrente) aggiungi l'invio automatico dello stato di lavoro al server "cantieri". Il server lo sviluppa un'altra sessione; il punto di contatto è il **Contratto v1** qui sotto e va rispettato alla lettera.

Prima di tutto leggi la struttura attuale del plugin (`.claude-plugin/plugin.json`, eventuali `hooks/`, `commands/`, `skills/`, `.mcp.json`) e integrati senza toccare le skill esistenti. Se ci sono già degli hook, unisci i nuovi a quelli esistenti senza sovrascriverli.

## Comportamento atteso

1. **Primo uso.** L'utente lancia `/cantiere`, con o senza nome. Se il plugin non è configurato, il comando chiede URL del server e token, verifica la connessione, salva la configurazione a livello utente e registra il server MCP. Da quel momento il tracciamento resta **sempre attivo**, in ogni sessione e in ogni progetto, finché l'utente non lo spegne.
2. **Caso 1, cantiere dichiarato.** `/cantiere <nome> [— descrizione]` apre quel cantiere, o entra in quello esistente con lo stesso nome, per la sessione corrente, con origine `utente`.
3. **Caso 2, nessuna dichiarazione.** Il server assegna un cantiere provvisorio. Claude lo corregge chiamando il tool MCP `apri_cantiere` quando capisce che il lavoro è un altro; le istruzioni arrivano dal `contesto` restituito dal server.
4. **A ogni turno.** Gli hook inviano gli eventi senza che Claude debba ricordarsene. Il resoconto semantico lo manda Claude con `aggiorna_stato`; se se ne dimentica dopo un turno con lavoro vero, l'hook `Stop` glielo fa fare (modalità `forzato`).

## Privacy (vincolante)

Al server arrivano solo session_id, host, cwd, repo (senza credenziali), branch, todo, conteggi e gli altri campi previsti dal contratto. **Mai** il testo dei prompt, il transcript o l'output dei tool.

Il testo del prompt si legge in locale solo per riconoscere `/cantiere`: non va inviato né scritto nei log.

Esclusioni:

- un file `.cantieri-off` nella cwd o nella radice git disattiva tutti gli hook per quel progetto;
- `CANTIERI_DISABLED=1` fa lo stesso per la singola sessione.

## Contratto v1

> Condiviso tra server e plugin. Non modificarlo unilateralmente.

**Autenticazione.** Ogni richiesta a `/api/v1/*` e a `/mcp` porta `Authorization: Bearer <token>`. Un token sconosciuto o revocato riceve 401.

### `GET /api/v1/salute`

200 → `{"ok": true, "versione_contratto": 1, "cliente": "<nome del cliente associato al token>"}`

### `POST /api/v1/eventi`

Corpo (massimo 64 KB):

```json
{
  "evento_id": "<uuid4 generato dal client>",
  "ts": "<ISO 8601 UTC del momento in cui è avvenuto l'evento>",
  "tipo": "session_start | prompt | todo | stop | session_end | apri_cantiere | chiudi_cantiere",
  "session_id": "<session_id di Claude Code>",
  "host": "<hostname>",
  "cwd": "<directory di lavoro>",
  "repo": "<remote origin normalizzato senza credenziali, es. github.com/org/repo> | null",
  "branch": "<branch corrente> | null",
  "dati": {}
}
```

`dati` per tipo:

| tipo | dati |
|---|---|
| `session_start` | `{"source": "startup" \| "resume" \| "clear" \| "compact" \| "tardivo"}` — `tardivo` indica una sessione vista per la prima volta da un hook diverso da SessionStart |
| `prompt` | `{}` — il testo del prompt non viene mai inviato |
| `todo` | `{"strumento": "<nome del tool>", "completo": true \| false, "todos": [{"id": "<id> \| null", "testo": "...", "stato": "pending \| in_progress \| completed \| deleted"}]}` — con `completo: true` la lista sostituisce per intero la precedente; con `false` sono variazioni da applicare per `id` |
| `stop` | `{"strumenti_nel_turno": <int>, "resoconto_inviato": <bool>, "bloccato": <bool>}` |
| `session_end` | `{"reason": "<motivo fornito da Claude Code>"}` |
| `apri_cantiere` | `{"nome": "...", "descrizione": "... \| null", "origine": "utente" \| "claude"}` |
| `chiudi_cantiere` | `{"esito": "completato" \| "sospeso" \| "abbandonato", "nota": "... \| null"}` |

Risposta 200:

```json
{
  "cantiere": {"id": 12, "nome": "...", "origine": "auto | claude | utente", "confermato": false},
  "contesto": "<testo da iniettare nel contesto di Claude> | null",
  "config": {"modalita_resoconto": "forzato | leggero | off", "soglia_strumenti": 3}
}
```

- `cantiere` può essere `null` (per esempio subito dopo `chiudi_cantiere`). `origine` indica chi ha associato **questa sessione** al cantiere.
- Stesso `evento_id` ricevuto più volte: nessun duplicato, stessa risposta (idempotenza).
- Un evento con `session_id` sconosciuto crea la sessione al volo, qualunque sia il tipo.
- Errori: 401 token; 409 per `apri_cantiere` con origine `claude` su una sessione associata dall'utente (corpo `{"errore": "..."}`); 413 corpo troppo grande; 422 validazione o tipo sconosciuto; 429 rate limit.
- Il client ignora i campi della risposta che non conosce (compatibilità in avanti).

### Tool MCP (Streamable HTTP su `/mcp`)

Il server viene registrato in Claude Code con il nome `cantieri`, quindi i tool si chiamano `mcp__cantieri__<tool>`.

- `apri_cantiere(session_id, nome, descrizione?, origine="claude")`
- `aggiorna_stato(session_id, fatto, prossimo, bloccato_da?, percentuale?)`
- `chiudi_cantiere(session_id, esito, nota?)`
- `elenca_cantieri(repo?, solo_aperti=true)`
- `stato_sessione(session_id)`

Valgono le stesse regole di `/eventi`. Un `session_id` sconosciuto crea la sessione al volo (serve ai client senza hook, per esempio claude.ai).

### Regole sui cantieri

- Precedenza sull'associazione sessione → cantiere: `utente` > `claude` > `auto`. Se una sessione è stata associata dall'utente, solo un altro `apri_cantiere` con origine `utente` può cambiarla.
- Sessione senza cantiere: se esiste un cantiere aperto la cui sessione più recente aveva lo stesso repo+branch, la sessione viene associata a quello con `confermato: false`. Altrimenti si crea `<nome-repo>@<branch>` (o il nome della cartella se non c'è git), con origine `auto` e `confermato: false`.
- `apri_cantiere` con il nome di un cantiere già aperto (confronto sullo slug, su tutti i repo) fa entrare la sessione in quel cantiere; altrimenti lo crea. In entrambi i casi `confermato: true`.
- `chiudi_cantiere` chiude il cantiere per tutte le sessioni. Le sessioni associate restano senza cantiere fino all'evento successivo, a cui si applica la regola della sessione senza cantiere.

## Componenti da creare

### 1. `bin/cantieri.py`: un solo script, solo stdlib, Python ≥ 3.8

Nessuna dipendenza e nessun ambiente da attivare: è tooling del plugin, non codice di progetto. Accanto va un wrapper `bin/cantieri` (sh: prova `python3`, poi `python`, poi `py -3`), usato da hook e comando, così funziona anche su Windows con Git Bash.

Sottocomandi:

- `hook <session_start|prompt|todo|stop|session_end>`: legge l'input JSON dell'hook da stdin.
- `setup --url <url> [--token-stdin]`: configurazione (vedi sezione 4). Senza `--token-stdin` e con un terminale interattivo chiede il token con `getpass`.
- `status [--json]`: configurazione con token mascherato, raggiungibilità del server, ultima sessione vista per la cwd.
- `apri <nome> [--descrizione ...]` e `chiudi [--esito ...] [--nota ...]`: operazioni in attesa (vedi "Operazioni in attesa").
- `on`, `off`: abilitano o disabilitano il tracciamento, in modo persistente.

Requisiti non negoziabili per `hook`:

- **Fail-open.** Exit 0 sempre, nessuna eccezione non gestita, niente su stderr in condizioni normali. Se il server è giù o la configurazione manca, l'hook non fa nulla (a parte la coda locale).
- **Latenza.** Timeout HTTP 1,5 s, git 1 s. Per `prompt`, `todo` e `session_end` l'invio parte in un processo figlio staccato (fire-and-forget) e l'hook ritorna subito, decidendo il contesto dalla cache locale; il figlio aggiorna la cache con la risposta del server. `session_start`, `stop` e il riconoscimento di `/cantiere` sono sincroni perché servono la risposta o la decisione.
- **Coda locale.** Gli eventi non consegnati finiscono in uno spool (massimo 500, si scartano i più vecchi) che si svuota al primo invio riuscito. L'`evento_id` generato all'origine rende i reinvii idempotenti.
- **Sessione sconosciuta.** Ogni hook diverso da `session_start` che trova una sessione non in cache invia prima `session_start` con `source: "tardivo"`, poi procede. Succede dopo un setup a metà sessione o se l'hook di avvio è fallito.
- **Repo.** Remote `origin` normalizzato (`github.com/org/repo`), **senza** utente o token anche se compaiono nell'URL. Senza git si manda `null` e il server usa il nome della cartella.
- **Debug.** Con `CANTIERI_DEBUG=1` scrive input degli hook e risposte in un log locale, con il campo `prompt` oscurato.

Percorsi:

- **Config:** `$XDG_CONFIG_HOME/cantieri/config.json` (default `~/.config/cantieri/`; su Windows `%APPDATA%\cantieri\config.json`), permessi 0600. Campi: `url`, `token`, `abilitato`, `nome_server_mcp` (default `cantieri`), `modalita_resoconto` (`null` = usa quella del server), `mcp_registrato_il`.
- **Override da ambiente:** `CANTIERI_URL`, `CANTIERI_TOKEN` (per chi non vuole incollare il token in chat), `CANTIERI_DISABLED`.
- **Cache:** `$XDG_CACHE_HOME/cantieri/` (su Windows `%LOCALAPPDATA%\cantieri\`). Contiene un file per sessione (primo_visto, avvio_reale_il, cantiere, ultima risposta del server, contesto già iniettato), lo spool, le operazioni in attesa e il log di debug. I file di sessione più vecchi di 7 giorni vengono eliminati.
- Ogni esecuzione dell'hook scrive `CLAUDE_PLUGIN_ROOT` in `<cache>/plugin_root`, così il comando trova lo script anche se la variabile non gli arriva.

**Operazioni in attesa.** `cantieri apri|chiudi` lanciati dal comando non conoscono il session_id. Salvano l'operazione in cache, legata alla cwd e con scadenza di 10 minuti; il primo hook con la stessa cwd la invia con il proprio session_id.

### 2. Hook: `hooks/hooks.json` (o dove il plugin li dichiara già)

```json
{
  "hooks": {
    "SessionStart":     [{"hooks": [{"type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/bin/cantieri\" hook session_start", "timeout": 5}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/bin/cantieri\" hook prompt", "timeout": 5}]}],
    "PostToolUse":      [{"matcher": "TodoWrite|TaskCreate|TaskUpdate", "hooks": [{"type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/bin/cantieri\" hook todo", "timeout": 5}]}],
    "Stop":             [{"hooks": [{"type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/bin/cantieri\" hook stop", "timeout": 10}]}],
    "SessionEnd":       [{"hooks": [{"type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/bin/cantieri\" hook session_end", "timeout": 5}]}]
  }
}
```

Logica per evento:

**session_start**

- Invia `session_start` con il `source` ricevuto. Se il source è `startup` o `resume`, salva `avvio_reale_il` nella cache della sessione: serve allo `Stop` per sapere se i tool MCP sono caricati.
- Se `contesto` non è null stampa `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "<contesto>"}}`.
- Server irraggiungibile: contesto minimo locale, `[cantieri] session_id=<id> (server non raggiungibile)`.
- Plugin non configurato: nessun contesto. Al massimo un avviso all'utente fuori dal contesto (`systemMessage`, se supportato), una volta al giorno: "cantieri non configurato: lancia /cantiere".

**prompt**

- Se il prompt corrisponde a `^/(\S+:)?cantiere(\s|$)` e il plugin è configurato, gestisci il comando qui, in modo deterministico e con il session_id giusto:
  - `<nome>` → evento `apri_cantiere` con origine `utente`;
  - `chiudi [esito]` → `chiudi_cantiere`;
  - `stato`, `server`, `on`, `off` o nessun argomento → non fare nulla, ci pensa il comando.
- Altrimenti invia l'evento `prompt` in un processo staccato e inietta il `contesto` dell'ultima risposta in cache, solo se non è null e non è già stato iniettato.
- Per iniettare usa `{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "..."}}`.

**todo**

- Costruisci `todos` da `tool_input` e `tool_response`.
- `TodoWrite` → lista intera, `completo: true`.
- `TaskCreate` / `TaskUpdate` → variazioni per id, `completo: false` (l'id di una task appena creata sta nella risposta del tool).
- Prima di scrivere il parser registra in debug qualche payload reale e scrivilo su quelli.

**stop**

1. Se `stop_hook_active` è true, invia `stop` con `bloccato: false` ed esci: mai due blocchi di fila.
2. Leggi il transcript locale (`transcript_path`, JSONL) a partire dall'ultimo messaggio reale dell'utente, cioè non un tool_result. Conta i `tool_use` escludendo `TodoWrite`, `Task*` e `mcp__<nome_server_mcp>__*`. `resoconto_inviato` è vero se c'è un `tool_use` di nome `mcp__<nome_server_mcp>__aggiorna_stato`. Il formato del transcript non è documentato: il parser deve essere difensivo, e se qualcosa non torna non si blocca.
3. Blocca solo se valgono tutte e quattro le condizioni:
   - modalità `forzato` (config locale, altrimenti l'ultima ricevuta dal server, altrimenti `forzato`);
   - strumenti contati ≥ `soglia_strumenti`;
   - resoconto non inviato;
   - tool MCP disponibili in questa sessione, cioè `avvio_reale_il` presente e successivo a `mcp_registrato_il`. Prima di un riavvio i tool non ci sono, e bloccare sprecherebbe un turno.
4. Invia `stop` con il valore reale di `bloccato`. Se blocca, stampa:
   `{"decision": "block", "reason": "[cantieri] Prima di chiudere chiama aggiorna_stato (session_id=<id>): fatto, prossimo, bloccato_da in frasi brevi. Poi termina senza ripetere la risposta."}`

Con `leggero` e con `off` non si blocca mai. Il server registra `bloccato` a ogni `stop`: servirà a misurare quanto costa davvero la modalità forzata.

**session_end**

- Invia `session_end` con `reason`, in un processo staccato.

### 3. Comando: `commands/cantiere.md`

Tienilo corto, perché viene caricato come prompt a ogni uso.

- `argument-hint: [nome | chiudi [esito] | stato | server | on | off]`.
- `allowed-tools` limitati allo script (`Bash(*cantieri*)` o la sintassi equivalente, da verificare) e ai tool `mcp__cantieri__apri_cantiere`, `mcp__cantieri__chiudi_cantiere`, `mcp__cantieri__stato_sessione`.

Istruzioni per il modello:

1. Se nel contesto c'è `[cantieri] Comando /cantiere gestito`, rispondi con una riga di conferma e basta.
2. Se il plugin non è configurato (`cantieri status --json`, con il percorso preso da `<cache>/plugin_root`), fai il **setup**:
   - chiedi l'URL del server;
   - token: se `CANTIERI_TOKEN` è impostata usa quella. Altrimenti chiedilo, avvisando in una riga che se viene incollato in chat resta nella conversazione; le alternative sono impostare `CANTIERI_TOKEN` o lanciare `cantieri setup --url <url>` da un terminale, dove il token si inserisce senza mostrarlo;
   - esegui `cantieri setup --url <url> --token-stdin` passando il token su stdin;
   - se l'utente aveva dato un nome, esegui `cantieri apri "<nome>"`: l'operazione resta in attesa e la invia il primo hook di questa sessione (lo `Stop` di questo stesso turno);
   - chiudi dicendo che il tracciamento è già attivo e che i tool MCP saranno disponibili dal prossimo avvio di Claude Code.
3. `server` → ripeti il setup con un nuovo URL o token. `on` / `off` → `cantieri on|off`. `stato` o nessun argomento → `cantieri status`, più `stato_sessione` se il tool è disponibile; poche righe.
4. `<nome>` o `chiudi` senza la conferma dell'hook nel contesto (l'hook è fallito) → tool MCP se disponibile, altrimenti `cantieri apri|chiudi`.

### 4. `setup` nello script

1. Normalizza l'URL: https obbligatorio, http ammesso solo per localhost.
2. Chiama `GET /api/v1/salute` con il token. Se non risponde 200 e `versione_contratto: 1`, dai un errore chiaro e non salvare nulla.
3. Scrivi la config con permessi 0600 e `abilitato: true`.
4. Registra il server MCP a livello utente, sostituendo un'eventuale registrazione precedente con lo stesso nome:
   `claude mcp add --transport http --scope user <nome_server_mcp> <url>/mcp --header "Authorization: Bearer <token>"`
   Lo fa lo script con un subprocess, così il token non compare nei comandi scritti da Claude. Se `claude` non è nel PATH, stampa la configurazione JSON da aggiungere a mano. Salva `mcp_registrato_il`.
5. Proponi all'utente (il comando gli gira la domanda) di aggiungere `mcp__<nome_server_mcp>` ai permessi consentiti in `~/.claude/settings.json`. Se accetta: unione del JSON con backup, mai sovrascrittura.

## Verifiche su Claude Code prima di implementare

Non andare a memoria: controlla la documentazione corrente (code.claude.com/docs, sezioni hooks e plugins reference) e la versione installata per:

- i campi su stdin di ogni hook usato (`session_id`, `transcript_path`, `cwd`, `source`, `prompt`, `stop_hook_active`, `tool_input`, `tool_response`, `reason`), e se `UserPromptSubmit` riceve il testo grezzo dei comandi slash;
- la forma esatta di `additionalContext`, `decision: "block"` e `systemMessage`;
- il supporto di `async: true` negli hook: se c'è, usalo al posto del processo staccato per `todo` e `session_end`;
- la sintassi di `claude mcp add` con `--header` e `--scope user`, e quella dei permessi `mcp__<server>`;
- le variabili disponibili nei comandi del plugin (`${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_SESSION_ID}`). Se `${CLAUDE_SESSION_ID}` funziona nei comandi, usalo e semplifica le operazioni in attesa.

Se qualcosa differisce da quanto scritto qui, adatta l'implementazione e dimmelo. Il Contratto v1 invece non si tocca senza chiedermelo.

## Test

- Unit test dello script (stdlib `unittest`, nessuna dipendenza) con payload di hook registrati e transcript di esempio:
  - normalizzazione del repo con credenziali nell'URL;
  - riconoscimento di `/cantiere`, anche con il prefisso del plugin;
  - decisione di blocco in tutte le combinazioni: `stop_hook_active`, modalità, soglia, resoconto già inviato, MCP non ancora disponibile;
  - fail-open con server spento: exit 0 e tempo sotto i 2 s;
  - coda locale e reinvio idempotente;
  - operazioni in attesa inviate dal primo hook con la stessa cwd.
- Prova end-to-end contro il server in locale (avviato seguendo il suo README), con una sessione reale di Claude Code e il plugin caricato dalla cartella di sviluppo. Verifica sul server sessione, cantiere provvisorio, `/cantiere <nome>`, todo, stop ed eventuale blocco.
- Alla fine: elenco dei file creati o modificati e istruzioni di installazione per l'utente in cinque righe.


