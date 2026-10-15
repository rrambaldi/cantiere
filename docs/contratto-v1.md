# Contratto v1

Contratto condiviso tra il server e il plugin di cantiere forgia. Copiato da `server.md` (identico
in `prompt-plugin.cmd`) con due modifiche, fatte prima del primo rilascio:

- il nome tecnico del server MCP è `forgia` al posto di `cantieri`;
- i cantieri possono avere un padre (campi `padre` e `forza`, sezione "Cantieri padre e figli"). Non modificarlo da una parte sola.

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
| `apri_cantiere` | `{"nome": "...", "descrizione": "... \| null", "origine": "utente" \| "claude", "padre": "... \| null"}` — `nome` e `padre` possono essere percorsi `a/b`; `padre` può mancare |
| `chiudi_cantiere` | `{"esito": "completato" \| "sospeso" \| "abbandonato", "nota": "... \| null", "forza": true \| false}` — `forza` può mancare (vale false) |

Risposta 200:

```json
{
  "cantiere": {"id": 12, "nome": "...", "percorso": "padre/.../nome", "origine": "auto | claude | utente", "confermato": false},
  "contesto": "<testo da iniettare nel contesto di Claude> | null",
  "config": {"modalita_resoconto": "forzato | leggero | off", "soglia_strumenti": 3}
}
```

- `cantiere` può essere `null` (per esempio subito dopo `chiudi_cantiere`). `origine` indica chi ha associato **questa sessione** al cantiere.
- Stesso `evento_id` ricevuto più volte: nessun duplicato, stessa risposta (idempotenza).
- Un evento con `session_id` sconosciuto crea la sessione al volo, qualunque sia il tipo.
- Errori: 401 token; 409 (corpo `{"errore": "..."}`) per `apri_cantiere` con origine `claude` su una sessione associata dall'utente, per un `apri_cantiere` che darebbe a un cantiere un padre diverso da quello che ha o un ciclo, e per `chiudi_cantiere` senza `forza` su un cantiere con figli aperti; 413 corpo troppo grande; 422 validazione o tipo sconosciuto; 429 rate limit.
- Il client ignora i campi della risposta che non conosce (compatibilità in avanti).

### Tool MCP (Streamable HTTP su `/mcp`)

Il server viene registrato in Claude Code con il nome `forgia`, quindi i tool si chiamano `mcp__forgia__<tool>`.

- `apri_cantiere(session_id, nome, descrizione?, origine="claude", padre?)`
- `aggiorna_stato(session_id, fatto, prossimo, bloccato_da?, percentuale?)`
- `chiudi_cantiere(session_id, esito, nota?, forza=false)`
- `elenca_cantieri(repo?, solo_aperti=true)`
- `stato_sessione(session_id)`

Valgono le stesse regole di `/eventi`. Un `session_id` sconosciuto crea la sessione al volo (serve ai client senza hook, per esempio claude.ai).

### Regole sui cantieri

- Precedenza sull'associazione sessione → cantiere: `utente` > `claude` > `auto`. Se una sessione è stata associata dall'utente, solo un altro `apri_cantiere` con origine `utente` può cambiarla.
- Sessione senza cantiere: se esiste un cantiere aperto la cui sessione più recente aveva lo stesso repo+branch, la sessione viene associata a quello con `confermato: false`. Altrimenti si crea `<nome-repo>@<branch>` (o il nome della cartella se non c'è git), con origine `auto` e `confermato: false`.
- `apri_cantiere` con il nome di un cantiere già aperto (confronto sullo slug, su tutti i repo) fa entrare la sessione in quel cantiere; altrimenti lo crea. In entrambi i casi `confermato: true`.
- `chiudi_cantiere` chiude il cantiere per tutte le sessioni. Le sessioni associate restano senza cantiere fino all'evento successivo, a cui si applica la regola della sessione senza cantiere.

### Cantieri padre e figli

- Un cantiere può avere un padre, a sua volta con un padre, senza limite di livelli. Il `percorso` è la catena dei nomi dal cantiere più alto, separati da `/`.
- `apri_cantiere` indica il padre in due modi, che si sommano: `nome` a percorso (`logiquo-v2/oauth`: `oauth` figlio di `logiquo-v2`) e il campo `padre` (anche lui un percorso). Il percorso completo è `padre` seguito da `nome`. L'ultimo segmento è il cantiere a cui si associa la sessione.
- I segmenti si confrontano sullo slug, come i nomi, e lo slug resta unico tra tutti i cantieri aperti: `apri_cantiere("oauth")` entra nel cantiere aperto `oauth` qualunque sia il suo padre.
- Ogni antenato del percorso che non esiste aperto viene creato, con la stessa origine dell'evento; la sessione si associa solo all'ultimo segmento.
- Un cantiere aperto senza padre lo prende dal percorso. Un cantiere che ha già un padre diverso da quello indicato, o un percorso che farebbe di un cantiere l'antenato di sé stesso, dà 409 e non cambia nulla.
- `chiudi_cantiere` su un cantiere con figli aperti dà 409, a meno di `forza: true`: in quel caso chiude anche tutti i discendenti aperti, con lo stesso esito e la stessa nota. Chiudere un figlio non tocca il padre.
- I cantieri provvisori (`auto`) non hanno padre.
