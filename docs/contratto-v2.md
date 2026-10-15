# Contratto v2

Contratto condiviso tra il server e il plugin di cantiere forgia, dal change OpenSpec `forgia-v2`.
Sostituisce il [Contratto v1](contratto-v1.md): server e plugin v2 si installano insieme e non
parlano con la versione 1.

> Condiviso tra server e plugin. Non modificarlo unilateralmente.

## Concetti

- **Committente**: per chi si lavora (PRIV, DGT, CVSTUDIO...). Ha **un token**. Tutto quello che si
  fa con un token riguarda solo quel committente; un oggetto di un altro committente è inesistente.
- **Progetto**: il prodotto (poker, mercurius), sotto un committente. Nome unico nel committente,
  confrontato sullo slug.
- **Cantiere**: un'attività dentro un progetto, con al più un padre (un altro cantiere dello stesso
  progetto). Nome unico tra fratelli. Il **percorso** è la catena dei nomi dal primo livello del
  progetto, separati da `/`.
- **Change**: ogni cantiere ha un change OpenSpec che si chiama come il percorso, con gli slug dei
  segmenti uniti da `-` (`idoc-converter/preprod` → `idoc-converter-preprod`). Unico nel progetto.
- **Stati del cantiere**: `idea`, `aperto`, `sospeso`, `completato`, `abbandonato`.
- **Lavoro diretto**: una sessione legata a un progetto ma a nessun cantiere.

**Slug**: normalizzazione NFKD senza segni diacritici, minuscolo, ogni sequenza fuori da `[a-z0-9]`
diventa `-`, senza `-` in testa e in coda. Uno slug vuoto non è un nome valido.

## Autenticazione

Ogni richiesta a `/api/v1/*` e a `/mcp` porta `Authorization: Bearer <token del committente>`. Un
token sconosciuto o sostituito da una rigenerazione riceve 401. Le rotte della dashboard (`/`,
`/<committente>`, `/ui/*`) non fanno parte di questo contratto e non accettano il Bearer.

## `GET /api/v1/salute`

200 → `{"ok": true, "versione_contratto": 2, "cliente": "<nome del committente>"}`

## `POST /api/v1/eventi`

Corpo (massimo `max_body`, default 64 KB):

```json
{
  "evento_id": "<uuid4 generato dal client>",
  "ts": "<ISO 8601 UTC del momento in cui è avvenuto l'evento>",
  "tipo": "session_start | prompt | todo | stop | session_end | apri_cantiere",
  "session_id": "<session_id di Claude Code>",
  "host": "<hostname>",
  "cwd": "<directory di lavoro>",
  "repo": "<remote origin normalizzato senza credenziali, es. github.com/org/repo> | null",
  "branch": "<branch corrente> | null",
  "progetto": "<nome del progetto dell'area, confrontato sullo slug>",
  "dati": {}
}
```

`dati` per tipo:

| tipo | dati |
|---|---|
| `session_start` | `{"source": "startup" \| "resume" \| "clear" \| "compact" \| "tardivo"}` |
| `prompt` | `{}` — il testo del prompt non viene mai inviato |
| `todo` | `{"strumento": "<nome del tool>", "completo": true \| false, "todos": [{"id": "<id> \| null", "testo": "...", "stato": "pending \| in_progress \| completed \| deleted"}]}` |
| `stop` | `{"strumenti_nel_turno": <int>, "resoconto_inviato": <bool>, "bloccato": <bool>, "titolo": "... \| null"}` |
| `session_end` | `{"reason": "<motivo fornito da Claude Code>", "titolo": "... \| null"}` |
| `apri_cantiere` | `{"nome": "...", "descrizione": "... \| null", "origine": "utente" \| "claude", "padre": "... \| null"}` — `nome` e `padre` possono essere percorsi `a/b`; `padre` può mancare |

`titolo` è il titolo della sessione (quello di `/rename`, altrimenti quello generato da Claude
Code), al massimo 200 caratteri.

Risposta 200:

```json
{
  "progetto": "poker",
  "cantiere": {"id": 12, "nome": "preprod", "percorso": "idoc-converter/preprod", "origine": "utente | claude", "stato": "aperto", "change": "idoc-converter-preprod"},
  "contesto": "<testo da iniettare nel contesto di Claude> | null",
  "config": {"modalita_resoconto": "forzato | leggero | off", "soglia_strumenti": 3}
}
```

- `cantiere` è `null` per il lavoro diretto. `origine` dice chi ha associato **questa sessione** al
  cantiere.
- Stesso `evento_id` ricevuto più volte: nessun duplicato, stessa risposta (idempotenza).
- Un evento con `session_id` sconosciuto crea la sessione al volo, legata al committente del token e
  al progetto dell'evento. Un evento con un progetto diverso da quello della sessione la sposta sul
  nuovo progetto, in lavoro diretto.
- Errori: 401 token; 409 (corpo `{"errore": "..."}`) per `apri_cantiere` rifiutato per precedenza,
  per un cantiere `sospeso`, `completato` o `abbandonato`, per un'idea, o per un nome di change già
  preso; 413 corpo troppo grande; 422 validazione, tipo sconosciuto o progetto inesistente; 429 rate
  limit.
- Il client ignora i campi della risposta che non conosce.

## Progetti

### `GET /api/v1/progetti`

200 → `{"progetti": [{"id": 3, "nome": "poker", "slug": "poker", "creato_il": "...", "cantieri": {"idea": 1, "aperto": 2, "sospeso": 0, "completato": 5, "abbandonato": 0}}]}`

### `POST /api/v1/progetti`

Corpo `{"nome": "poker"}`. 200 → `{"progetto": {...come sopra}}`. 409 se lo slug è già usato nel
committente; 422 se il nome non è valido.

## Copia dei change OpenSpec

### `PUT /api/v1/progetti/<progetto>/openspec`

Il plugin manda lo stato di `openspec/changes/` dell'area. Corpo (massimo `max_openspec`, default
2 MB):

```json
{
  "attivi": [
    {"change": "idoc-converter", "modificato_il": "<ISO 8601 UTC, mtime più recente tra i file>",
     "file": [{"percorso": "proposal.md", "contenuto": "..."}, {"percorso": "idee/nota.md", "contenuto": "..."}]}
  ],
  "archiviati": [{"change": "export-pdf", "archiviato_il": "2026-10-20", "file": [{"percorso": "proposal.md", "contenuto": "..."}]}]
}
```

- `percorso` è relativo alla cartella del change. Ammessi solo `.openspec.yaml`, `proposal.md`,
  `design.md`, `tasks.md`, i `.md` sotto `specs/`, i `.md` e `.txt` sotto `idee/`; ciascuno al
  massimo `max_file` byte (default 256 KB). Un percorso assoluto, con `..` o fuori elenco dà 422 e
  non si salva nulla.
- `archiviati` viene dai nomi `AAAA-MM-GG-<change>` di `openspec/changes/archive/`. `file` è facoltativo,
  con gli stessi limiti degli attivi: il server lo tiene come copia finale del change, così specifiche e
  avanzamento restano visibili dopo l'archiviazione. Il plugin lo manda dai più recenti, finché stanno in 1 MB.
- Il server sostituisce la copia di un change solo con una più recente (`modificato_il`). Un change
  archiviato resta archiviato. Un change attivo senza cantiere fa nascere un cantiere `aperto` al
  primo livello, con origine `repo`. Un change archiviato porta il suo cantiere `aperto` o `sospeso` a
  `completato`; un `abbandonato` resta `abbandonato`.

200 → `{"cantieri": [<cantiere come in GET /api/v1/cantieri, senza sessioni>]}` per tutti i
cantieri del progetto. 404 progetto inesistente; 413; 422.

## Presa di un'idea

### `POST /api/v1/progetti/<progetto>/cantieri/<percorso>/prendi`

`<percorso>` sono i segmenti del cantiere separati da `/`, ciascuno codificato con
`encodeURIComponent`. Corpo:

```json
{"session_id": "...", "host": "...", "cwd": "...", "repo": "... | null", "branch": "... | null"}
```

Porta un'idea ad `aperto` e associa la sessione al cantiere con origine `utente` (creandola al volo
se serve). Su un cantiere già `aperto` associa la sessione e risponde allo stesso modo.

200 → `{"cantiere": {...come nella risposta degli eventi}, "change": "idoc-converter", "file": [{"nome": "nota.md", "contenuto": "..."}]}`

404 progetto o cantiere inesistente; 409 (`{"errore": "..."}`) se il cantiere è `sospeso`,
`completato` o `abbandonato`.

## Letture

### `GET /api/v1/cantieri`

Filtri: `progetto=<nome>`, `aperti=1` (solo `aperto`). Senza filtri, tutti gli stati.

```json
{"cantieri": [{
  "id": 12, "progetto": "poker", "nome": "preprod", "percorso": "idoc-converter/preprod",
  "padre_id": 10, "stato": "aperto", "origine": "utente | claude | repo | dashboard",
  "change": "idoc-converter-preprod", "descrizione": "... | null",
  "creato_il": "...", "aggiornato_il": "...",
  "artefatti": {"proposal": true, "design": false, "specs": true, "tasks": true} ,
  "task": {"fatti": 7, "totali": 12},
  "fasi": {"completate": 2, "totali": 3},
  "change_mancante": false, "da_archiviare": false, "file_idea": 0,
  "sessioni": [{"session_id": "...", "host": "...", "branch": "... | null", "stato": "...", "titolo": "... | null", "fatto": "... | null", "prossimo": "... | null", "eta_secondi": 42}]
}]}
```

`artefatti` e `task` sono `null` senza una copia del change; `fasi` è `null` senza figli; `sessioni`
elenca le sessioni attive.

### `GET /api/v1/sessioni`

Filtri: `progetto=<nome>`, `attive=1` (non chiuse). Ogni sessione ha `session_id`, `progetto`,
`cantiere` (percorso o `null` per il lavoro diretto), `host`, `cwd`, `repo`, `branch`, `stato`
(`attiva`, `lavorando`, `in_attesa`, `chiusa`, oppure `inattiva` calcolato in lettura),
`origine_associazione`, `turni`, `titolo`, `avviata_il`, `ultimo_evento_il`, `eta_secondi`.

## Tool MCP (Streamable HTTP su `/mcp`)

Il server viene registrato in Claude Code con il nome `forgia`, quindi i tool si chiamano
`mcp__forgia__<tool>`.

- `apri_cantiere(session_id, nome, descrizione?, origine="claude", padre?, progetto?)`
- `aggiorna_stato(session_id, fatto, prossimo, bloccato_da?, percentuale?, progetto?)`
- `elenca_cantieri(progetto?, stati?)` — default stati `idea`, `aperto`, `sospeso`
- `stato_sessione(session_id)`

Valgono le stesse regole di `/api/v1/eventi`. Per una sessione mai vista `progetto` è obbligatorio
(serve ai client senza hook, per esempio claude.ai). I rifiuti (precedenza, sospeso, idea, nome di
change preso, progetto mancante) sono risultati normali con `ok: false` e un `motivo`. Ogni tool
restituisce JSON strutturato e una riga di testo.

## Regole sui cantieri

- Precedenza sull'associazione sessione → cantiere: `utente` > `claude`. Una sessione associata
  dall'utente cambia cantiere solo con un altro `apri_cantiere` di origine `utente`.
- Una sessione nuova parte in lavoro diretto. Nessun cantiere nasce da solo per una sessione.
- `apri_cantiere` legge `padre` seguito da `nome` come percorso dal primo livello del progetto: entra
  nel cantiere `aperto` indicato, oppure lo crea `aperto` insieme agli antenati che mancano. Un
  antenato in stato `idea` passa ad `aperto`. Un cantiere esistente non cambia mai padre.
- Sospendere, riattivare e abbandonare si fanno solo dalla dashboard; completato arriva solo dal repo
  (`openspec archive`). Abbandonare un padre abbandona anche i discendenti non finali.
- Quando un cantiere smette di essere `aperto`, le sue sessioni tornano al lavoro diretto al loro
  evento successivo, e il primo `prompt` riceve un avviso nel `contesto`.

## Testo di `contesto`

Lo compone il server; il client lo inietta così com'è. I testi esatti sono nella spec
`server/contesto` del change `forgia-v2`. Il prefisso `[forgia] Comando /cantiere gestito` della
conferma di `apri_cantiere` resta quello che il comando del plugin cerca nel contesto.
