# Spec Delta

## Purpose

Lega sul client ogni cartella di sorgenti al suo progetto e al token del suo committente, così che
ogni sessione sappia da sola per chi e su cosa lavora, e tiene il server allineato ai change OpenSpec
di quella cartella.

## ADDED Requirements

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

### Requirement: Server MCP per cartella
Il collegamento MUST registrare il server MCP `forgia` per la sola cartella dell'area (`claude mcp
add --scope local`), con URL `<url>/mcp` e il Bearer del committente, sostituendo una registrazione
precedente della stessa cartella. Il token MUST passare solo dallo script.

#### Scenario: Due committenti sulla stessa macchina
- **WHEN** `~/lavori/poker` è collegata con il token di `CVSTUDIO` e `~/lavori/mercurius` con quello di `PRIV`
- **THEN** Claude Code in `~/lavori/poker` usa il server MCP con il token di `CVSTUDIO` e in `~/lavori/mercurius` quello di `PRIV`

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
