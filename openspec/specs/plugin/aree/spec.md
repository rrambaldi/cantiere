# plugin/aree Specification

## Purpose
Lega sul client ogni cartella di sorgenti al suo progetto e al token del suo committente, così che
ogni sessione sappia da sola per chi e su cosa lavora, e tiene il server allineato ai change OpenSpec
di quella cartella.

## Requirements

### Requirement: Collegamento di una cartella
`forgia collega <progetto> [--url <url>] [--token-stdin]` MUST verificare URL e token con `salute`
(`versione_contratto: 2`), controllare che il progetto esista nel committente del token e salvare
l'area: la radice git della cwd, o la cwd se non c'è git, con URL, token, committente e progetto.

#### Scenario: Collegamento riuscito
- **WHEN** in `~/lavori/poker`, con il token di `CVSTUDIO`, si lancia `forgia collega poker --url https://priv.progettazionisoftware.it/cantiere`
- **THEN** l'area `~/lavori/poker` viene salvata con committente `CVSTUDIO` e progetto `poker`

#### Scenario: Sottocartella di un repo
- **WHEN** si lancia `forgia collega poker` da `~/lavori/poker/src` e la radice git è `~/lavori/poker`
- **THEN** l'area salvata è `~/lavori/poker`

### Requirement: Progetto inesistente con conferma
Se il progetto non esiste nel committente, `forgia collega` MUST uscire senza salvare e dire che il
progetto non esiste, con i progetti del committente. Solo `forgia collega <progetto> --crea` MUST
creare il progetto e poi collegare la cartella.

#### Scenario: Errore di battitura
- **WHEN** si lancia `forgia collega pokr` e `CVSTUDIO` ha solo `poker`
- **THEN** il comando non salva nulla, dice che `pokr` non esiste ed elenca `poker`

#### Scenario: Progetto nuovo confermato
- **WHEN** l'utente conferma e si lancia `forgia collega mercurius --crea` con il token di `PRIV`
- **THEN** il progetto `mercurius` nasce sotto `PRIV` e la cartella viene collegata

### Requirement: Collegamento con il link della dashboard
`forgia collega --link <url>/collega#<codice> [<progetto>] [--crea]` MUST collegare la cartella senza token:
leggere il link con `POST <url>/api/v1/collegamenti/leggi` e `{codice}`, che non lo consuma, poi scambiarlo
con `POST <url>/api/v1/collegamenti/usa` e `{codice, macchina, host}` per un token di questa macchina, tutte e
due senza `Authorization` e con il codice solo nel corpo, e salvare l'area dopo `salute`. Il token MUST NOT finire nell'output, il codice MUST NOT finire nei log.

#### Scenario: Link di un progetto
- **WHEN** in `~/lavori/poker` si lancia `forgia collega --link https://priv.progettazionisoftware.it/cantiere/collega#<codice>` con il link del progetto `poker` di `PRIV`
- **THEN** l'area `~/lavori/poker` viene salvata con committente `PRIV`, progetto `poker` e il token dello scambio, che non compare nell'output

#### Scenario: Link già usato o scaduto
- **WHEN** il server risponde 404 al link
- **THEN** il comando esce con il messaggio del server e non salva nulla

### Requirement: Progetto di un link di committente
Il progetto è quello del link. Per un link di committente `forgia collega` MUST avere `<progetto>`, tra i
progetti del committente o con `--crea`; altrimenti MUST uscire con i progetti del committente prima dello
scambio, così che il link resti valido.

#### Scenario: Link di un committente senza progetto
- **WHEN** il link è del committente `PRIV`, che ha `poker` e `admin`, e si lancia `forgia collega --link <link>` senza progetto
- **THEN** il comando esce con errore, elenca `poker` e `admin` e dice di rilanciare con il progetto; il link resta valido

### Requirement: Token della macchina in tutte le sue aree
Il server tiene un token per committente e macchina, e lo scambio sostituisce quello di prima. Subito dopo
lo scambio, prima di `salute` e della creazione del progetto, `forgia collega` MUST mettere il token nuovo
in tutte le aree con lo stesso URL e committente.

#### Scenario: Altre aree dello stesso committente
- **WHEN** `~/lavori/admin` è collegata allo stesso server con `PRIV` e si collega `~/lavori/poker` con un link di `PRIV`
- **THEN** anche `~/lavori/admin` ha il token nuovo, e le aree di altri committenti o di altri server restano com'erano

### Requirement: Presa del cantiere del link
Per un link di cantiere, dopo il collegamento `forgia collega` MUST prendere il cantiere come `forgia prendi
#<id>`, con `--session-id` se c'è. Se la presa fallisce la cartella MUST restare collegata e l'errore MUST
indicare `/cantiere prendi #<id>`.

#### Scenario: Presa che non riesce
- **WHEN** il link è del cantiere `#42` di `poker` e la cartella non ha `openspec/`
- **THEN** l'area resta salvata e l'errore dice che manca `openspec/` e di riprovare con `/cantiere prendi #42`

### Requirement: Area della sessione
Ogni hook MUST cercare l'area della cwd: l'area la cui cartella contiene la cwd, la più specifica se
sono più d'una. Gli eventi della sessione MUST usare URL e token di quell'area e portare il suo
progetto.

#### Scenario: Aree annidate
- **WHEN** esistono le aree `~/lavori` (PRIV, `cantiere`) e `~/lavori/poker` (CVSTUDIO, `poker`) e la sessione parte in `~/lavori/poker/web`
- **THEN** gli eventi vanno con il token di `CVSTUDIO` e `progetto: "poker"`

### Requirement: Fuori da ogni area
In una cwd che non sta in nessuna area, gli hook MUST non mandare eventi e non iniettare contesto.
`/cantiere` senza argomenti MUST dire in una riga che la cartella non è collegata e come collegarla.

#### Scenario: Cartella non collegata
- **WHEN** l'utente apre Claude Code in `~/tmp/prova`, che non sta in nessuna area
- **THEN** il server non riceve nulla e Claude non riceve contesto da forgia

### Requirement: Server MCP per area
Il server MCP del plugin (`forgia mcp`, uno per sessione di Claude Code) MUST cercare a ogni richiesta
l'area della cartella della sessione e inoltrare `tools/list` e `tools/call` a `<url>/mcp` di quell'area,
con il suo token, accettando la risposta in JSON o in SSE, e rispondere a Claude Code con l'id della sua
richiesta e solo il `result` o l'`error` del server. Fuori da ogni area, con il server che non risponde
o con un rifiuto HTTP (per esempio 429 o il 403 della guardia sull'host), `tools/call` MUST rispondere
con un risultato non di errore con `ok: false` e il motivo, mai con il token.

#### Scenario: Chiamata in un'area
- **WHEN** in `~/lavori/poker`, collegata con il token di `CVSTUDIO`, Claude chiama `leggi_cantiere`
- **THEN** la chiamata arriva a `<url>/mcp` con il token di `CVSTUDIO` e Claude riceve il risultato del server

#### Scenario: Cartella non collegata
- **WHEN** Claude chiama un tool di forgia in una cartella che non sta in nessuna area
- **THEN** il tool risponde `ok: false` con il motivo `questa cartella non è collegata a cantiere forgia: lancia /cantiere collega <progetto> <url>`

#### Scenario: Server giù
- **WHEN** il server dell'area non risponde
- **THEN** la chiamata risponde `ok: false` con `server non raggiungibile: <url>`, senza il token

#### Scenario: Troppe richieste
- **WHEN** il server risponde 429 con `{"errore": "Troppe richieste: riprova tra un minuto."}`
- **THEN** la chiamata risponde, con l'id della richiesta, `ok: false` e `il server risponde 429: Troppe richieste: riprova tra un minuto.`

### Requirement: Elenco dei tool del server MCP
L'elenco dei tool del server MCP del plugin MUST essere quello del server dell'area (fuori dalle aree,
di un'area qualunque della configurazione: sono solo definizioni), altrimenti l'ultimo visto, altrimenti
vuoto. Quando cambia il file di configurazione MUST mandare
`notifications/tools/list_changed`, così che Claude Code lo chieda di nuovo.

#### Scenario: Ultimo elenco visto
- **WHEN** una sessione in un'area ha già ricevuto l'elenco dal server e un'altra parte con il server giù
- **THEN** la seconda riceve lo stesso elenco

#### Scenario: Cartella non collegata
- **WHEN** una sessione parte in una cartella non collegata e la configurazione ha un'area
- **THEN** riceve l'elenco del server di quell'area, e i tool rispondono `ok: false` con il motivo

#### Scenario: Cartella collegata a sessione aperta
- **WHEN** la sessione è già aperta e l'utente collega la cartella
- **THEN** Claude Code riceve `notifications/tools/list_changed` e le chiamate dopo partono verso il server dell'area

### Requirement: Presa di un'idea
`forgia prendi <percorso>` MUST chiamare la presa in lavorazione con la sessione corrente, creare il
change con `openspec new change` se nella cartella non c'è, e scrivere i file dell'idea in
`openspec/changes/<change>/idee/` senza sovrascrivere file esistenti.

#### Scenario: Idea presa
- **WHEN** in `~/lavori/poker` si lancia `forgia prendi idoc-converter` e l'idea ha 10 file
- **THEN** esiste `openspec/changes/idoc-converter/` creato da OpenSpec, con i 10 file in `idee/`

#### Scenario: File già presente
- **WHEN** `idee/nota.md` esiste già nel change e l'idea ha un file `nota.md`
- **THEN** il file locale resta com'è e il comando lo segnala

#### Scenario: OpenSpec non installato
- **WHEN** il comando `openspec` non si trova
- **THEN** `forgia prendi` non chiama il server e dice di installare OpenSpec

### Requirement: Copia dei change dopo ogni turno
Allo `Stop`, in un'area con `openspec/changes/`, il plugin MUST mandare la copia dei change (file
ammessi e istante dell'ultima modifica per change, nomi e date degli archiviati) solo se è cambiata
dall'ultimo invio riuscito, senza far aspettare la sessione.

#### Scenario: Task spuntato
- **WHEN** nel turno Claude spunta un task in `openspec/changes/export-pdf/tasks.md`
- **THEN** il server riceve la copia aggiornata di `poker` e lo `Stop` non aspetta la risposta

#### Scenario: Nulla di cambiato
- **WHEN** il turno non tocca `openspec/changes/`
- **THEN** il plugin non manda la copia

#### Scenario: Server giù
- **WHEN** il server non risponde all'invio della copia
- **THEN** l'hook esce con 0 e la copia parte al primo `Stop` successivo
