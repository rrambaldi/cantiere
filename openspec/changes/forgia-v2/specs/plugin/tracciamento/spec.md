# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Campi dell'evento
Ogni evento MUST avere un `evento_id` uuid4 generato all'origine, `ts` in ISO 8601 UTC del momento in
cui l'evento è avvenuto, `session_id`, `host`, `cwd`, `repo`, `branch`, `progetto` (quello dell'area) e
`dati` come da Contratto v2. Un `source` di `SessionStart` che il contratto non prevede (per esempio
`fork`) MUST essere mappato su un valore ammesso.

#### Scenario: Ts del momento dell'evento
- **WHEN** un evento rimasto in coda viene reinviato un'ora dopo
- **THEN** ha lo stesso `evento_id`, lo stesso `ts` e lo stesso `progetto` del primo tentativo

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
