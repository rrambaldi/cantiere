# plugin/tracciamento Specification

## Purpose
Fa arrivare al server forgia gli eventi di ogni sessione di Claude Code senza che Claude debba
ricordarsene, senza mai bloccare o rallentare il lavoro e senza mai inviare il contenuto della
conversazione.

## Requirements

### Requirement: Fail-open
Ogni hook MUST terminare con exit 0, senza eccezioni non gestite e senza scrivere su stderr in
condizioni normali, qualunque cosa succeda: server giù, configurazione mancante o rotta, input
inatteso, git assente. In quei casi l'hook MUST limitarsi alla coda locale o non fare nulla.

#### Scenario: Server spento
- **WHEN** il server non risponde e scatta un hook qualsiasi
- **THEN** l'hook esce con 0 in meno di 2 secondi e l'evento resta nella coda locale

#### Scenario: Input non JSON
- **WHEN** l'hook riceve su stdin un testo che non è JSON
- **THEN** esce con 0 senza output

#### Scenario: Node non installato
- **WHEN** nel PATH non c'è `node`, o c'è un Node più vecchio del 20, e scatta un hook qualsiasi
- **THEN** l'hook esce con 0 senza output e senza scrivere su stderr

### Requirement: Latenza
Le chiamate HTTP MUST avere un timeout di 1,5 secondi e le chiamate a git di 1 secondo. L'invio degli
eventi `prompt`, `todo` e `session_end` MUST avvenire senza far aspettare la sessione: l'hook ritorna
subito e il contesto da iniettare si decide dalla cache locale. `session_start`, `stop` e il
riconoscimento di `/cantiere` MUST essere sincroni.

#### Scenario: Prompt con server lento
- **WHEN** il server impiega 3 secondi a rispondere a un `prompt`
- **THEN** il prompt dell'utente parte senza aspettare e la cache viene aggiornata quando arriva la risposta

### Requirement: Campi dell'evento
Ogni evento MUST avere un `evento_id` uuid4 generato all'origine, `ts` in ISO 8601 UTC del momento in
cui l'evento è avvenuto, `session_id`, `host`, `cwd`, `repo`, `branch`, `progetto` (quello dell'area) e
`dati` come da Contratto v2. Un `source` di `SessionStart` che il contratto non prevede (per esempio
`fork`) MUST essere mappato su un valore ammesso.

#### Scenario: Ts del momento dell'evento
- **WHEN** un evento rimasto in coda viene reinviato un'ora dopo
- **THEN** ha lo stesso `evento_id`, lo stesso `ts` e lo stesso `progetto` del primo tentativo

### Requirement: Repo normalizzato senza credenziali
`repo` MUST essere il remote `origin` nella forma `host/percorso` senza schema, senza utente,
password o token, senza porta e senza `.git` finale. Senza git o senza `origin` MUST essere null.

#### Scenario: Token nell'URL
- **WHEN** il remote è `https://user:ghp_abc123@github.com/org/repo.git`
- **THEN** `repo` è `github.com/org/repo`

#### Scenario: Remote SSH
- **WHEN** il remote è `git@github.com:org/repo.git` oppure `ssh://git@github.com:22/org/repo.git`
- **THEN** `repo` è `github.com/org/repo`

### Requirement: Coda locale
Ogni evento MUST essere salvato in una coda locale, con la cartella della sua area e senza token,
prima dell'invio e tolto solo quando il server lo accetta. L'invio MUST usare URL e token attuali di
quell'area; un evento la cui area non esiste più MUST uscire dalla coda. La coda MUST tenere al massimo
500 eventi scartando i più vecchi e MUST svuotarsi in ordine al primo invio riuscito. Un evento rifiutato
in modo definitivo (409, 413, 422) MUST uscire dalla coda.

#### Scenario: Server che torna
- **WHEN** 3 eventi sono rimasti in coda e il server torna raggiungibile
- **THEN** al primo hook successivo i 3 eventi partono in ordine con i loro `evento_id` originali e la coda si svuota

#### Scenario: Coda piena
- **WHEN** la coda ha 500 eventi e ne arriva un altro non consegnabile
- **THEN** il più vecchio viene scartato

#### Scenario: Eventi di due aree
- **WHEN** in coda ci sono eventi di `~/lavori/poker` (CVSTUDIO) e di `~/lavori/mercurius` (PRIV)
- **THEN** ognuno parte con il token della sua area e la coda non contiene token

### Requirement: Sessione vista in ritardo
Ogni hook diverso da `SessionStart` che trova una sessione non presente in cache MUST inviare prima un
`session_start` con `source: "tardivo"` e poi il suo evento.

#### Scenario: Setup a metà sessione
- **WHEN** il plugin viene configurato durante una sessione e scatta il primo `Stop`
- **THEN** il server riceve prima `session_start` con `source: "tardivo"` e poi `stop`

### Requirement: Contesto all'avvio
In un'area, `SessionStart` MUST inviare `session_start` con il suo `source` e iniettare il `contesto`
della risposta se non è null. Con `source` `startup` o `resume` MUST salvare l'istante di avvio reale
della sessione. Se il server non risponde MUST iniettare `[forgia] session_id=<id> (server non
raggiungibile)`.

#### Scenario: Avvio normale
- **WHEN** parte una sessione in un'area e il server risponde con un contesto
- **THEN** quel contesto arriva a Claude così com'è

#### Scenario: Server irraggiungibile all'avvio
- **WHEN** parte una sessione in un'area e il server non risponde
- **THEN** Claude riceve solo `[forgia] session_id=<id> (server non raggiungibile)`

### Requirement: Contesto sui prompt
Per un prompt che non è `/cantiere`, l'hook MUST inviare l'evento `prompt` con `dati: {}` e iniettare il
`contesto` dell'ultima risposta in cache solo se non è null e non è già stato iniettato.

#### Scenario: Hint provvisorio
- **WHEN** l'ultima risposta in cache ha un contesto non ancora iniettato
- **THEN** il prompt corrente lo riceve una volta, e il prompt dopo no

### Requirement: Todo dai tool di Claude Code
Dopo `TodoWrite` il plugin MUST inviare un evento `todo` con la lista intera e `completo: true`. Dopo
`TaskCreate` e `TaskUpdate` MUST inviare le variazioni per id con `completo: false`, prendendo l'id di
una task appena creata dalla risposta del tool.

#### Scenario: Nuova task
- **WHEN** Claude crea una task "aggiungere i test" e il tool le assegna l'id `7`
- **THEN** il server riceve `{"strumento": "TaskCreate", "completo": false, "todos": [{"id": "7", "testo": "aggiungere i test", "stato": "pending"}]}`

### Requirement: Fine sessione
`SessionEnd` MUST inviare `session_end` con il `reason` ricevuto da Claude Code e il titolo della
sessione, senza ritardare l'uscita.

#### Scenario: Uscita
- **WHEN** l'utente chiude Claude Code
- **THEN** il server riceve `session_end` con `reason` e `titolo`, oppure lo riceve al primo hook successivo dalla coda

### Requirement: Privacy
Al server MUST arrivare solo quello che prevede il contratto: oltre a stato, todo e conteggi, il titolo
della sessione e i file ammessi dei change OpenSpec dell'area. Il testo dei prompt, il resto del
transcript, i messaggi dell'assistente e l'output dei tool MUST non essere mai inviati né scritti nei
log. Il testo del prompt MUST essere letto solo in locale per riconoscere `/cantiere`.

#### Scenario: Prompt con dati sensibili
- **WHEN** l'utente scrive un prompt con una password
- **THEN** il server riceve un `prompt` con `dati: {}` e nessun file locale contiene quel testo

#### Scenario: File fuori dai change
- **WHEN** l'area contiene `.env` e `src/config.ts`
- **THEN** la copia dei change non li contiene

### Requirement: Esclusioni
Un file `.forgia-off` nella cwd o nella radice git MUST disattivare tutti gli hook per quel progetto.
`FORGIA_DISABLED=1` MUST fare lo stesso per la sessione. Con il tracciamento spento (`forgia off`)
nessun hook MUST inviare nulla.

#### Scenario: Progetto escluso
- **WHEN** la radice git contiene `.forgia-off` e l'utente lavora in una sua sottocartella
- **THEN** nessun hook invia eventi né inietta contesto

### Requirement: Operazioni in attesa
`forgia apri` lanciato senza session_id MUST salvare l'operazione legata alla cwd, con scadenza di 10
minuti. Il primo hook con la stessa cwd MUST inviarla con il proprio session_id prima del suo evento.
Un'operazione scaduta MUST essere scartata.

#### Scenario: Apertura dopo il setup
- **WHEN** il comando lancia `forgia apri "pdfconverter"` senza session_id e poi scatta lo `Stop` dello stesso turno
- **THEN** lo `Stop` invia `apri_cantiere` con origine `utente` per la sua sessione e poi `stop`

#### Scenario: Operazione scaduta
- **WHEN** l'operazione in attesa ha più di 10 minuti
- **THEN** il primo hook la scarta senza inviarla

### Requirement: Log di debug
Con `FORGIA_DEBUG=1` il plugin MUST scrivere in un log locale l'input degli hook e le risposte del server,
con `prompt` e `last_assistant_message` oscurati. Senza la variabile MUST non scrivere log.

#### Scenario: Debug di un prompt
- **WHEN** `FORGIA_DEBUG=1` e scatta l'hook del prompt
- **THEN** il log contiene l'input con il campo `prompt` oscurato

### Requirement: Pulizia della cache
I file di sessione in cache più vecchi di 7 giorni MUST essere eliminati.

#### Scenario: Sessione di due settimane fa
- **WHEN** scatta un hook e in cache c'è il file di una sessione vista l'ultima volta 14 giorni fa
- **THEN** quel file viene eliminato

### Requirement: Titolo della sessione dal transcript
Allo `Stop` e al `SessionEnd` il plugin MUST leggere dal transcript locale l'ultima riga `custom-title`
(il nome dato con `/rename`), altrimenti l'ultima `ai-title`, e mandarne il testo in `dati.titolo`. Un
transcript assente o di forma inattesa MUST dare `titolo: null`, senza altri effetti.

#### Scenario: Sessione rinominata
- **WHEN** il transcript ha una riga `ai-title` "Correzione login" e poi una `custom-title` "fix login mobile"
- **THEN** lo `stop` porta `titolo: "fix login mobile"`

#### Scenario: Solo titolo generato
- **WHEN** il transcript ha solo righe `ai-title`, l'ultima "Aggiornamento dipendenze"
- **THEN** lo `stop` porta `titolo: "Aggiornamento dipendenze"`

#### Scenario: Transcript illeggibile
- **WHEN** il transcript non esiste
- **THEN** lo `stop` porta `titolo: null` e l'hook esce con 0
