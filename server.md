# Prompt per Claude Code — server "cantieri" (MCP + API eventi)

Costruisci un server che raccoglie lo stato di lavoro delle sessioni di Claude Code. Ogni sessione appartiene a un **cantiere**: un'unità di lavoro che può durare più sessioni e coinvolgere più macchine. Le sessioni inviano eventi deterministici tramite hook (API REST) e aggiornamenti semantici tramite tool MCP.

Il plugin client lo sviluppa un'altra sessione, a partire da un altro prompt. Il punto di contatto tra le due parti è il **Contratto v1** qui sotto e va rispettato alla lettera.

## Obiettivo di questa fase

- Server funzionante, esposto su internet dietro un reverse proxy TLS, con autenticazione tramite token per client.
- Storage leggero (SQLite). Dove tenere i dati in via definitiva e cosa mostrare si decide più avanti: per ora basta un'API JSON di lettura minima.
- Fuori ambito per ora: dashboard/UI, PostgreSQL, OAuth.

## Stack e ambiente

- Python 3.12 con l'SDK MCP ufficiale (pacchetto `mcp`, classe `FastMCP`) e transport Streamable HTTP, montato nella stessa app ASGI (Starlette) che espone l'API REST. Uvicorn.
- Ambiente conda dedicato `cantieri-server`, definito in `environment.yml`. Test, server e CLI girano tutti in quell'env, mai con il python di sistema.
- SQLAlchemy Core sopra SQLite in modalità WAL. Lo schema non deve usare funzioni esclusive di SQLite: passare a PostgreSQL deve richiedere solo un altro `DATABASE_URL` e le stesse migrazioni. Migrazioni semplici e versionate (tabella `schema_version` più file numerati); Alembic solo se serve davvero.
- Controlla l'API dell'SDK MCP sulla versione installata (`streamable_http_app()`, modalità stateless, impostazioni di sicurezza del transport) leggendo il codice del pacchetto: non andare a memoria.

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

## Modello dati (indicativo: adattalo senza cambiare il contratto)

- `clienti` (id, nome, token_hash sha256, creato_il, revocato_il)
- `cantieri` (id, nome, slug unico tra i cantieri aperti, descrizione, origine di creazione, stato aperto|chiuso, esito, nota, repo e branch di nascita, creato_il, aggiornato_il, chiuso_il)
- `sessioni` (session_id PK, cliente_id, host, cwd, repo, branch, cantiere_id, origine_associazione, confermato, stato attiva|lavorando|in_attesa|chiusa, turni, hint_inviati, avviata_il, ultimo_evento_il, chiusa_il)
- `eventi` append-only (evento_id unico, ts, ricevuto_il, cliente_id, session_id, cantiere_id, tipo, dati JSON, risposta JSON). L'idempotenza passa da qui.
- `stati` (id, session_id, cantiere_id, ts, fatto, prossimo, bloccato_da, percentuale): storico degli aggiornamenti semantici
- `todo` (session_id, chiave, testo, stato, ordine, aggiornato_il): ultimo stato noto per sessione

Transizioni della sessione: `session_start` → attiva; `prompt` → lavorando (turni + 1); `stop` → in_attesa; `session_end` → chiusa.

Gli invii dal client possono arrivare fuori ordine (alcuni partono da processi staccati). Applica transizioni di stato e snapshot dei todo solo se il `ts` dell'evento è maggiore o uguale all'ultimo applicato; l'evento viene comunque salvato in `eventi`.

Una sessione senza eventi da più di `inattivita_minuti` viene mostrata come `inattiva` nelle letture, senza scriverlo nel database.

## Testo di `contesto`

Lo compone il server; il client lo inietta così com'è. Tienilo corto: ogni riga costa token in ogni sessione.

**`session_start`** (qualsiasi `source`), sempre:

```
[cantieri] session_id=<id>
Cantiere: <nome> (<origine>, <confermato|provvisorio>)
Regole:
- Cantiere provvisorio e lavoro chiaramente diverso? Chiama apri_cantiere (server MCP cantieri, origine "claude") con un nome breve e specifico.
- Se l'utente cambia argomento in modo netto, fai lo stesso.
- Prima di chiudere un turno in cui hai lavorato, chiama aggiorna_stato: fatto, prossimo, bloccato_da. Frasi brevi; mai segreti, dati personali o dati dei clienti.
```

Con `modalita_resoconto = off` l'ultima regola si omette.

**`prompt`**: solo se il cantiere della sessione è provvisorio e `hint_inviati < hint_max`, allora `[cantieri] Cantiere provvisorio: <nome>. Se non corrisponde al lavoro, apri_cantiere.`; altrimenti `null`.

**`apri_cantiere` / `chiudi_cantiere`** ricevuti come eventi: una riga di conferma, per esempio `[cantieri] Comando /cantiere gestito: cantiere "<nome>" aperto (id <id>). Rispondi all'utente con una sola riga di conferma.` Per la chiusura, stesso testo con "chiuso (esito <esito>)". Il prefisso `[cantieri] Comando /cantiere gestito` non va cambiato: è quello che il comando del plugin cerca nel contesto.

Altri tipi: `null`.

## Descrizioni dei tool MCP

Le descrizioni sono ciò che Claude legge: scrivile in italiano, dicendo quando usare ogni tool e quando no.

- `apri_cantiere`: origine `utente` solo se l'utente ha nominato esplicitamente il cantiere nel turno corrente, altrimenti `claude`. Nome specifico (es. `oauth-logiquo`), non generico (es. `refactoring`). Se la precedenza impedisce il cambio, restituisci un messaggio chiaro che dice a Claude di non insistere, non un errore generico.
- `aggiorna_stato`: al massimo ~200 caratteri per campo; niente segreti, dati personali o dati dei clienti; `bloccato_da` solo se c'è davvero un blocco.
- `elenca_cantieri`: serve a coordinarsi. Per ogni cantiere aperto riporta le sessioni attive con host, branch, stato, ultimo `fatto`/`prossimo` ed età dell'ultimo evento.
- `stato_sessione`: cantiere corrente, ultimo stato, todo. Utile dopo una compattazione.

I tool restituiscono JSON compatto (structured output, se l'SDK lo supporta) insieme a un breve testo leggibile.

## Configurazione

`config.toml`, con override dalle variabili d'ambiente `CANTIERI_*`:

- `database_url`
- `bind` (default `127.0.0.1:8765`)
- `public_host`, per le impostazioni di sicurezza host/origin del transport MCP
- `modalita_resoconto` (default `forzato`)
- `soglia_strumenti` (default 3)
- `hint_max` (default 3)
- `inattivita_minuti` (default 30)
- `retention_giorni` (default 180)
- `rate_limit` (default 120 richieste/minuto per token)
- `max_body` (default 64 KB)

## Sicurezza (il server è pubblico)

- Un unico middleware ASGI per `/api/v1/*` e `/mcp`: Bearer obbligatorio, confronto a tempo costante sull'hash, 401 senza dettagli.
- Token generati con `secrets.token_urlsafe(32)`, mostrati una sola volta, salvati solo come hash.
- Limite sulla dimensione del corpo, rate limit per token (in memoria per ora), validazione stretta con pydantic su ogni input, lunghezze massime su tutti i campi di testo.
- I log applicativi non contengono token né il contenuto dei campi di testo: solo tipo, session_id, cliente ed esito.
- Il server ascolta solo su localhost; il TLS lo gestisce il reverse proxy. Configura il transport MCP perché accetti l'host pubblico dietro il proxy (protezione DNS-rebinding dell'SDK, se presente) senza disattivarla del tutto.
- Comando di pulizia che elimina eventi e stati più vecchi di `retention_giorni`.

## CLI di amministrazione

`python -m cantieri admin ...` (o entry point `cantieri-admin`):

- `token crea --cliente <nome>`: stampa il token una sola volta
- `token elenca`, `token revoca --cliente <nome>`
- `migra`, `pulizia`
- `sessioni`, `cantieri`: tabella leggibile per un controllo rapido da terminale

## API di lettura minima (provvisoria)

`GET /api/v1/cantieri?aperti=1` e `GET /api/v1/sessioni?attive=1`: JSON, stessi token. Niente di più finché non si decide la visualizzazione.

## Deploy

- `README.md`: installazione dell'env, migrazione, creazione del primo token, avvio, test.
- Unit systemd che lancia uvicorn con il percorso assoluto del python dell'env conda (non `conda run`).
- Esempio di `Caddyfile`: TLS automatico, reverse proxy su `/api/v1/*` e `/mcp`, buffering disattivato per lo streaming.
- Comando per registrare il server in Claude Code a mano, per le prove:
  `claude mcp add --transport http --scope user cantieri https://<host>/mcp --header "Authorization: Bearer <token>"`

## Test (obbligatori, tutti verdi prima di chiudere)

pytest nell'env conda:

1. Autenticazione: senza token o con token revocato → 401, sia su REST sia su `/mcp`.
2. Idempotenza: lo stesso `evento_id` inviato due volte produce un solo evento e la stessa risposta.
3. Sessione nuova su un repo+branch senza cantieri aperti → cantiere auto `<repo>@<branch>`, `confermato: false`, `contesto` conforme al modello.
4. Seconda sessione sullo stesso repo+branch → si aggancia allo stesso cantiere, `confermato: false`.
5. `apri_cantiere` con origine `utente`, poi con origine `claude` sulla stessa sessione → 409 via REST e messaggio di rifiuto via MCP; il cantiere resta quello scelto dall'utente.
6. `apri_cantiere` con il nome di un cantiere già aperto da un'altra macchina → le due sessioni condividono il cantiere.
7. Todo: lo snapshot completo sostituisce la lista; le variazioni per id si applicano; uno snapshot più vecchio arrivato in ritardo viene ignorato.
8. Hint del cantiere provvisorio presente nei primi `hint_max` eventi `prompt`, poi `null`.
9. Tool MCP end-to-end con il client dell'SDK su Streamable HTTP (in-process), compreso il caso di `session_id` sconosciuto (sessione creata).
10. 413 e 422 sui casi limite; `chiudi_cantiere` seguito da `prompt` → nuovo cantiere provvisorio.

Aggiungi `scripts/smoke.sh`: curl contro un server avviato, che percorre l'intero flusso di una sessione.

## Modo di lavorare

- Se una parte del Contratto v1 risulta ambigua o impossibile da rispettare, fermati e chiedimi: il plugin client viene scritto sullo stesso contratto.
- Codice pulito, commenti solo dove servono, nomi di dominio in italiano come nel contratto.
- Alla fine: riepilogo di cosa è stato fatto, come avviarlo e cosa resta aperto.


