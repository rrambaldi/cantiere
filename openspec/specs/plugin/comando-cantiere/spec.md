# plugin/comando-cantiere Specification

## Purpose
Dà all'utente un solo comando, `/cantiere`, per dichiarare il cantiere della sessione, chiuderlo,
vedere lo stato, configurare il plugin e accenderlo o spegnerlo. Apertura e chiusura passano da
un hook in modo deterministico, con il session_id giusto.

## Requirements

### Requirement: Forme del comando
Il plugin MUST offrire `/cantiere` (anche come `/forgia:cantiere`) con queste forme: `[padre/]<nome> [--padre <padre>] [— descrizione]`,
`chiudi [-f|--force] [esito] [nota]`, `stato`, `server <url> [nome]`, `permessi`, `on`, `off` e nessun argomento. Il
comando MUST dichiarare come suggerimento `[[padre/]nome [--padre p] | chiudi [-f] [esito] | stato | server <url> [nome] | permessi | on | off]`.

#### Scenario: Suggerimento degli argomenti
- **WHEN** l'utente digita `/cantiere` nel prompt
- **THEN** Claude Code mostra il suggerimento `[[padre/]nome [--padre p] | chiudi [-f] [esito] | stato | server <url> [nome] | permessi | on | off]`

### Requirement: Strumenti consentiti al comando
Il comando MUST poter usare solo lo script del plugin e i tool `mcp__forgia__apri_cantiere`,
`mcp__forgia__chiudi_cantiere` e `mcp__forgia__stato_sessione`.

#### Scenario: Strumento non previsto
- **WHEN** durante `/cantiere` Claude prova a usare un altro strumento
- **THEN** Claude Code chiede l'approvazione come per qualunque strumento non consentito

### Requirement: Riconoscimento deterministico
Quando il plugin è configurato, l'hook del prompt MUST riconoscere un prompt che corrisponde a
`^/(\S+:)?cantiere(\s|$)`. Con un nome MUST inviare `apri_cantiere` con origine `utente` e la descrizione,
se c'è. Con `chiudi [esito]` MUST inviare `chiudi_cantiere` (esito di default `completato`). Quando la
prima parola è `stato`, `server`, `permessi`, `on` o `off`, o non ci sono argomenti, MUST non fare nulla. Un prompt `/cantiere` MUST non generare
l'evento `prompt`.

#### Scenario: Apertura con descrizione
- **WHEN** l'utente scrive `/cantiere oauth-logiquo — login con Logiquo`
- **THEN** il server riceve `apri_cantiere` con `nome: "oauth-logiquo"`, `descrizione: "login con Logiquo"`, `origine: "utente"`

#### Scenario: Prefisso del plugin
- **WHEN** l'utente scrive `/forgia:cantiere chiudi sospeso`
- **THEN** il server riceve `chiudi_cantiere` con `esito: "sospeso"`

#### Scenario: Comando simile ma diverso
- **WHEN** l'utente scrive `/cantieri` o `/cantiere-x`
- **THEN** l'hook non lo tratta come `/cantiere`

#### Scenario: Padre nel comando
- **WHEN** l'utente scrive `/cantiere oauth --padre logiquo-v2 — login` oppure `/cantiere logiquo-v2/oauth — login`
- **THEN** il server riceve `apri_cantiere` con origine `utente` e descrizione `login`, e il percorso completo è `logiquo-v2/oauth`

#### Scenario: Chiusura forzata
- **WHEN** l'utente scrive `/cantiere chiudi -f sospeso` oppure `/cantiere chiudi --force`
- **THEN** il server riceve `chiudi_cantiere` con `forza: true` (ed esito `sospeso`, o `completato` di default)

#### Scenario: Parola riservata con argomenti
- **WHEN** l'utente scrive `/cantiere server https://forgia.example.org oauth-logiquo`
- **THEN** l'hook non invia nulla: il setup lo fa il comando

#### Scenario: Esito non valido
- **WHEN** l'utente scrive `/cantiere chiudi finito`
- **THEN** l'hook non invia nulla e lascia che il comando spieghi gli esiti ammessi

### Requirement: Conferma in una riga
Se nel contesto c'è `[forgia] Comando /cantiere gestito`, il comando MUST rispondere solo con una riga di
conferma, senza altre azioni.

#### Scenario: Apertura gestita dall'hook
- **WHEN** l'hook ha aperto il cantiere e il server ha restituito la riga di conferma
- **THEN** Claude risponde con una sola riga, per esempio `Cantiere "oauth-logiquo" aperto.`

### Requirement: Ripiego se l'hook fallisce
Per `<nome>` o `chiudi` senza la conferma dell'hook nel contesto, il comando MUST usare il tool MCP se è
disponibile, altrimenti `forgia apri` o `forgia chiudi`.

#### Scenario: Server giù durante il prompt
- **WHEN** l'hook non è riuscito a inviare `apri_cantiere` e i tool MCP non sono caricati
- **THEN** il comando lancia `forgia apri "<nome>"`, che invia l'operazione o la mette in attesa

### Requirement: Stato in poche righe
`/cantiere stato` e `/cantiere` senza argomenti MUST mostrare lo stato della configurazione e del
server e, se il tool è disponibile, il risultato di `stato_sessione`, in poche righe.

#### Scenario: Stato
- **WHEN** l'utente scrive `/cantiere stato`
- **THEN** vede URL, token mascherato, raggiungibilità del server e cantiere corrente

### Requirement: Accensione, spegnimento e cambio server
`/cantiere on` e `/cantiere off` MUST lanciare `forgia on` e `forgia off`. `/cantiere server <url>` MUST rifare
il setup con un nuovo URL, o con il token nuovo di `FORGIA_TOKEN`. `/cantiere permessi` MUST lanciare
`forgia permetti-mcp`.

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
`/cantiere server <url> [nome]` MUST fare il setup e, se c'è un nome, aprire quel cantiere per la sessione
corrente con origine `utente`, tutto nello stesso turno e senza richieste di approvazione. Alla fine MUST
dire che il tracciamento è attivo, che i tool MCP arrivano dal prossimo avvio e che `/cantiere permessi`
li consente senza conferme. Senza configurazione, ogni altra forma MUST rispondere in una riga con
`/cantiere server <url> [nome]`.

#### Scenario: Primo uso con nome
- **WHEN** il plugin non è configurato, `FORGIA_TOKEN` è impostata e l'utente scrive `/cantiere server https://forgia.example.org oauth-logiquo`
- **THEN** nello stesso turno il setup va a buon fine e il cantiere `oauth-logiquo` viene aperto con origine `utente`

#### Scenario: Comando senza configurazione
- **WHEN** il plugin non è configurato e l'utente scrive `/cantiere oauth-logiquo`
- **THEN** Claude risponde in una riga di lanciare `/cantiere server <url> oauth-logiquo`

### Requirement: Token mai in chat
`/cantiere` MUST non chiedere il token in chat. Senza `FORGIA_TOKEN`, MUST indicare in poche righe le due
strade: impostare `FORGIA_TOKEN` e rilanciare, oppure lanciare il setup da un terminale con il percorso
intero dello script, che chiede il token senza mostrarlo.

#### Scenario: Token mancante
- **WHEN** `FORGIA_TOKEN` non è impostata e l'utente scrive `/cantiere server https://forgia.example.org`
- **THEN** Claude non chiede il token, non salva nulla e indica le due strade

### Requirement: Rifiuto del server riportato all'utente
Quando il server rifiuta con 409 un `apri_cantiere` o un `chiudi_cantiere` mandato dall'hook del prompt,
l'hook MUST iniettare `[forgia] Comando /cantiere gestito: <errore del server> Rispondi all'utente con una
sola riga.`, così che l'utente veda il motivo.

#### Scenario: Padre con figli aperti
- **WHEN** l'utente scrive `/cantiere chiudi` su un cantiere con il figlio aperto `oauth`
- **THEN** Claude risponde in una riga che il cantiere ha figli aperti (`oauth`) e che `/cantiere chiudi -f` chiude anche quelli
