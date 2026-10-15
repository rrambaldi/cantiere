# plugin/comando-cantiere Specification

## Purpose
Dà all'utente un solo comando, `/cantiere`, per dichiarare il cantiere della sessione, chiuderlo,
vedere lo stato, configurare il plugin e accenderlo o spegnerlo. Apertura e chiusura passano da
un hook in modo deterministico, con il session_id giusto.

## Requirements

### Requirement: Forme del comando
Il plugin MUST offrire `/cantiere` (anche come `/forgia:cantiere`) con queste forme: `[padre/]<nome> [--padre <padre>] [— descrizione]`,
`prendi <percorso>`, `collega <progetto> [url]`, `stato`, `permessi`, `on`, `off` e nessun argomento. Il
comando MUST dichiarare come suggerimento `[[padre/]nome [--padre p] | prendi <percorso> | collega <progetto> [url] | stato | permessi | on | off]`.

#### Scenario: Suggerimento degli argomenti
- **WHEN** l'utente digita `/cantiere` nel prompt
- **THEN** Claude Code mostra il suggerimento `[[padre/]nome [--padre p] | prendi <percorso> | collega <progetto> [url] | stato | permessi | on | off]`

### Requirement: Strumenti consentiti al comando
Il comando MUST poter usare solo lo script del plugin e i tool `mcp__forgia__apri_cantiere`,
`mcp__forgia__elenca_cantieri` e `mcp__forgia__stato_sessione`.

#### Scenario: Strumento non previsto
- **WHEN** durante `/cantiere` Claude prova a usare un altro strumento
- **THEN** Claude Code chiede l'approvazione come per qualunque strumento non consentito

### Requirement: Riconoscimento deterministico
In un'area, l'hook del prompt MUST riconoscere un prompt che corrisponde a `^/(\S+:)?cantiere(\s|$)`.
Con un nome MUST inviare `apri_cantiere` con origine `utente`, il progetto dell'area e la descrizione,
se c'è. Quando la prima parola è `prendi`, `collega`, `chiudi`, `server`, `stato`, `permessi`, `on` o
`off`, o non ci sono argomenti, MUST non fare nulla. Un prompt `/cantiere` MUST non generare l'evento
`prompt`.

#### Scenario: Apertura con descrizione
- **WHEN** l'utente scrive `/cantiere pdfconverter — conversione dei PDF caricati`
- **THEN** il server riceve `apri_cantiere` con `nome: "pdfconverter"`, `descrizione: "conversione dei PDF caricati"`, `origine: "utente"` e il progetto dell'area

#### Scenario: Prefisso del plugin
- **WHEN** l'utente scrive `/forgia:cantiere idoc-converter/preprod`
- **THEN** il server riceve `apri_cantiere` con il percorso `idoc-converter/preprod`

#### Scenario: Comando simile ma diverso
- **WHEN** l'utente scrive `/cantieri` o `/cantiere-x`
- **THEN** l'hook non lo tratta come `/cantiere`

#### Scenario: Padre nel comando
- **WHEN** l'utente scrive `/cantiere preprod --padre idoc-converter — verso il server di prova` oppure `/cantiere idoc-converter/preprod — verso il server di prova`
- **THEN** il server riceve `apri_cantiere` con origine `utente` e descrizione `verso il server di prova`, e il percorso completo è `idoc-converter/preprod`

#### Scenario: Chiusura forzata
- **WHEN** l'utente scrive `/cantiere chiudi -f sospeso`
- **THEN** l'hook non invia nulla e il comando spiega che completato arriva da `openspec archive` e che sospeso e abbandonato si decidono dalla dashboard

#### Scenario: Parola riservata con argomenti
- **WHEN** l'utente scrive `/cantiere collega poker https://priv.progettazionisoftware.it/cantiere`
- **THEN** l'hook non invia nulla: il collegamento lo fa il comando

#### Scenario: Esito non valido
- **WHEN** l'utente scrive `/cantiere chiudi finito`
- **THEN** l'hook non invia nulla e il comando dà la stessa spiegazione della chiusura

### Requirement: Conferma in una riga
Se nel contesto c'è `[forgia] Comando /cantiere gestito`, il comando MUST rispondere solo con una riga di
conferma, senza altre azioni.

#### Scenario: Apertura gestita dall'hook
- **WHEN** l'hook ha aperto il cantiere e il server ha restituito la riga di conferma
- **THEN** Claude risponde con una sola riga, per esempio `Cantiere "oauth-logiquo" aperto.`

### Requirement: Ripiego se l'hook fallisce
Per `<nome>` senza la conferma dell'hook nel contesto, il comando MUST usare il tool MCP se è
disponibile, altrimenti `forgia apri`.

#### Scenario: Server giù durante il prompt
- **WHEN** l'hook non è riuscito a inviare `apri_cantiere` e i tool MCP non sono caricati
- **THEN** il comando lancia `forgia apri "<nome>"`, che invia l'operazione o la mette in attesa

### Requirement: Stato in poche righe
`/cantiere stato` e `/cantiere` senza argomenti MUST mostrare l'area della cartella (committente,
progetto), lo stato del server e, se il tool è disponibile, il risultato di `stato_sessione`, in poche
righe. Fuori da un'area MUST dire come collegare la cartella.

#### Scenario: Stato
- **WHEN** l'utente scrive `/cantiere stato` in `~/lavori/poker`
- **THEN** vede `CVSTUDIO/poker`, URL, token mascherato, raggiungibilità del server e cantiere corrente o lavoro diretto

### Requirement: Accensione, spegnimento e cambio server
`/cantiere on` e `/cantiere off` MUST lanciare `forgia on` e `forgia off`. `/cantiere collega <progetto>
[url]` MUST lanciare `forgia collega`, anche per cambiare URL o token di un'area già collegata.
`/cantiere permessi` MUST lanciare `forgia permetti-mcp`.

#### Scenario: Spegnimento
- **WHEN** l'utente scrive `/cantiere off`
- **THEN** il tracciamento si spegne in modo persistente e lo conferma in una riga

### Requirement: Node mancante
Se lo script del plugin non parte perché manca Node.js ≥ 20, `/cantiere` MUST dirlo all'utente in
una riga, con la versione minima richiesta, invece di tentare il setup.

#### Scenario: Node assente
- **WHEN** l'utente scrive `/cantiere` su una macchina senza `node` nel PATH
- **THEN** Claude risponde che cantiere forgia richiede Node.js ≥ 20 e non fa altro

### Requirement: Primo uso in un turno
`/cantiere collega <progetto> <url>` MUST collegare la cartella nello stesso turno e senza richieste di
approvazione, salvo la domanda sul progetto inesistente. Alla fine MUST dire che il tracciamento è
attivo nella cartella, che i tool MCP arrivano dal prossimo avvio e che `/cantiere permessi` li
consente senza conferme. Fuori da un'area, ogni altra forma MUST rispondere in una riga con
`/cantiere collega <progetto> <url>`.

#### Scenario: Primo uso con nome
- **WHEN** la cartella non è collegata, `FORGIA_TOKEN` contiene il token di `CVSTUDIO` e l'utente scrive `/cantiere collega poker https://priv.progettazionisoftware.it/cantiere`
- **THEN** nello stesso turno la cartella viene collegata a `CVSTUDIO/poker` e Claude lo conferma

#### Scenario: Comando senza configurazione
- **WHEN** la cartella non è collegata e l'utente scrive `/cantiere pdfconverter`
- **THEN** Claude risponde in una riga di lanciare `/cantiere collega <progetto> <url>`

### Requirement: Token mai in chat
`/cantiere` MUST non chiedere il token in chat. Senza `FORGIA_TOKEN`, MUST indicare in poche righe le due
strade: impostare `FORGIA_TOKEN` e rilanciare, oppure lanciare `forgia collega` da un terminale con il
percorso intero dello script, che chiede il token senza mostrarlo.

#### Scenario: Token mancante
- **WHEN** `FORGIA_TOKEN` non è impostata e l'utente scrive `/cantiere collega poker https://priv.progettazionisoftware.it/cantiere`
- **THEN** Claude non chiede il token, non salva nulla e indica le due strade

### Requirement: Presa di un'idea da comando
`/cantiere prendi <percorso>` MUST lanciare `forgia prendi <percorso>` per la sessione corrente e poi
dire in poche righe quale change è nato, quanti file sono finiti in `idee/` e come proseguire: partire
dai file di `idee/` con `/opsx:explore` o `/opsx:propose <change>`.

#### Scenario: Idea presa da comando
- **WHEN** in `~/lavori/poker` l'utente scrive `/cantiere prendi idoc-converter`
- **THEN** il change `idoc-converter` esiste con i file in `idee/`, e Claude lo dice e propone `/opsx:propose idoc-converter`

### Requirement: Progetto inesistente al collegamento
Quando `forgia collega` dice che il progetto non esiste, il comando MUST chiedere all'utente se crearlo,
mostrando i progetti esistenti del committente, e MUST lanciare `forgia collega <progetto> --crea` solo
dopo un sì.

#### Scenario: Utente conferma
- **WHEN** l'utente scrive `/cantiere collega mercurius`, il progetto non esiste e l'utente risponde sì
- **THEN** il comando lancia `forgia collega mercurius --crea` e conferma in una riga

#### Scenario: Utente rifiuta
- **WHEN** il progetto non esiste e l'utente risponde no
- **THEN** non nasce nessun progetto e la cartella resta non collegata

### Requirement: Rifiuto del server mostrato all'utente
Quando il server rifiuta con 409 un `apri_cantiere` mandato dall'hook del prompt, l'hook MUST
iniettare `[forgia] Comando /cantiere gestito: <errore del server> Rispondi all'utente con una sola
riga.`, così che l'utente veda il motivo.

#### Scenario: Cantiere sospeso
- **WHEN** l'utente scrive `/cantiere export-pdf` e `export-pdf` è sospeso
- **THEN** Claude risponde in una riga che il cantiere è sospeso e si riattiva dalla dashboard
