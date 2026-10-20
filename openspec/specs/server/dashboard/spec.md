# server/dashboard Specification

## Purpose
Dà all'amministratore una pagina web per vedere committenti, progetti e cantieri con lo stato vero
dei loro change, e per far nascere il lavoro: committenti, token, progetti e idee.

## Requirements

### Requirement: Dashboard servita dal server
Il server MUST servire la dashboard su `/` (tutti i committenti) e su `/<committente>` (un
committente solo), i suoi file statici sotto `/ui/` e le sue API JSON sotto `/ui/api/`. La pagina
MUST funzionare anche quando il reverse proxy la pubblica sotto un prefisso e lo toglie.

#### Scenario: Pubblicata sotto un prefisso
- **WHEN** nginx pubblica il server su `https://priv.progettazionisoftware.it/cantiere/` togliendo `/cantiere`
- **THEN** la dashboard si apre su `/cantiere/` e carica file e dati sotto `/cantiere/ui/`

### Requirement: Certificato confermato dal proxy
Ogni richiesta alla dashboard e alle sue API MUST portare l'header configurato in
`ui_header_certificato` (default `X-SSL-Client-Verify`) con valore `SUCCESS`, altrimenti MUST
ricevere 403. Un Bearer token MUST non bastare per la dashboard.

#### Scenario: Senza certificato
- **WHEN** arriva `GET /` senza l'header, oppure con l'header a `NONE`
- **THEN** il server risponde 403

#### Scenario: Token di un committente sulla dashboard
- **WHEN** arriva `GET /ui/api/committenti` con il Bearer di `PRIV` e senza l'header del certificato
- **THEN** il server risponde 403

#### Scenario: Certificato confermato
- **WHEN** arriva `GET /` con `X-SSL-Client-Verify: SUCCESS`
- **THEN** il server risponde 200 con la dashboard

### Requirement: Filtro per committente
`/<committente>` MUST aprire la dashboard ristretta a quel committente, con il nome confrontato
senza distinzione di maiuscole. Un committente inesistente o un percorso più profondo MUST dare 404.
Nella vista ristretta MUST non comparire la creazione di committenti.

#### Scenario: Committente in minuscolo
- **WHEN** si apre `/cantiere/priv` e il committente si chiama `PRIV`
- **THEN** la dashboard mostra solo i progetti e i cantieri di `PRIV`

#### Scenario: Percorso sotto il committente
- **WHEN** si apre `/cantiere/PRIV/mercurius`
- **THEN** il server risponde 404

### Requirement: Viste
La dashboard MUST mostrare l'albero committenti → progetti → cantieri con stato e avanzamento, il
giornale dei turni di un cantiere, gli artefatti del suo change e i file delle idee in sola lettura,
i todo delle sue sessioni attive in sola lettura e, per ogni progetto, le attività non censite.

#### Scenario: Giornale di un cantiere
- **WHEN** si sceglie `poker/idoc-converter/prototipo`, con tre resoconti da due macchine
- **THEN** il giornale mostra i tre turni dal più recente, con ora, host, fatto, prossimo e blocco

#### Scenario: Ultimo stato di un'attività non censita
- **WHEN** si fa doppio click (o Invio) sulla riga di un'attività non censita
- **THEN** sotto la riga compare l'ultimo messaggio di stato della sessione, con ora, fatto, prossimo e blocco, oppure la nota che non ce n'è ancora; un altro doppio click lo chiude
- **AND** la colonna dello stato dice con forma e parola se la sessione è al lavoro, ha finito il turno, è pronta, è ferma o è terminata

#### Scenario: Change di un cantiere
- **WHEN** si sceglie un cantiere con una copia del change
- **THEN** la dashboard mostra proposal, design, specs e tasks formattati, con il contenuto dell'ultima copia del repo, e i task spuntati sul totale

### Requirement: Markdown formattato
I file `.md` dei change e delle idee MUST comparire formattati: titoli, paragrafi, elenchi, tabelle,
grassetto e corsivo, codice in linea e a blocchi, citazioni, collegamenti e le caselle dei task come
caselle spuntate o vuote, in sola lettura. I file `.txt` MUST comparire come testo semplice che
conserva gli a capo.

#### Scenario: Design di un change
- **WHEN** si apre il `design.md` di un change con titoli, una tabella, un blocco di codice e un elenco
- **THEN** la dashboard li mostra come titoli, tabella, blocco di codice ed elenco, non come testo con i simboli Markdown

#### Scenario: Task di un change
- **WHEN** si apre un `tasks.md` con `- [x] 1.1 ...` e `- [ ] 1.2 ...`
- **THEN** la 1.1 compare con la casella spuntata e la 1.2 con la casella vuota, e cliccarle non cambia nulla

#### Scenario: Copia e salva di un file
- **WHEN** si apre un file di un change o di un'idea, per esempio `specs/server/git/spec.md`
- **THEN** sopra il file ci sono due pulsanti a icona, con il nome nel tooltip: "Copia negli appunti" copia il testo così com'è, con i simboli Markdown, e "Salva sul computer" lo scarica come `specs-server-git-spec.md`
- **AND** non c'è il pulsante "Modifica" sui file di un change, che sono la copia del repo

#### Scenario: File di testo di un'idea
- **WHEN** si apre il file `appunti.txt` di un'idea
- **THEN** compare come testo semplice con gli stessi a capo del file

### Requirement: Markdown senza codice eseguibile
La formattazione MUST mostrare come testo l'HTML scritto nei file, MUST non rendere attivi i
collegamenti con schema diverso da `http`, `https` e `mailto` e MUST aprire i collegamenti esterni in
una scheda nuova senza dare accesso alla dashboard.

#### Scenario: Script in un file
- **WHEN** un `proposal.md` contiene `<script>alert(1)</script>` e `<img src=x onerror=alert(1)>`
- **THEN** la dashboard mostra quei caratteri come testo e nessuno script parte

#### Scenario: Collegamento javascript
- **WHEN** un file contiene `[clic](javascript:alert(1))`
- **THEN** il collegamento non è attivo

### Requirement: Committenti e token dalla dashboard
La dashboard MUST permettere di creare un committente e di rigenerarne il token, e MUST mostrare il
token una sola volta, subito dopo la creazione o la rigenerazione, con l'invito a copiarlo.

#### Scenario: Nuovo committente
- **WHEN** si crea il committente `CVSTUDIO`
- **THEN** la dashboard mostra il token una volta e, dopo aver chiuso la finestra, non lo mostra più

### Requirement: Progetti e idee dalla dashboard
La dashboard MUST permettere di creare un progetto sotto un committente e un'idea sotto un progetto o
un cantiere, con nome, descrizione e file caricati dal browser, e di modificare un'idea finché è in
stato `idea`.

#### Scenario: Idea con file
- **WHEN** in `poker` si crea l'idea `iDOC converter` trascinando 10 file `.md`
- **THEN** compare `idoc-converter` in stato `idea` con i suoi 10 file

#### Scenario: Modifica di un file di un'idea
- **WHEN** sul file `appunti.md` di un'idea si preme "Modifica", si cambia il testo e si preme "Salva le modifiche"
- **THEN** il file sul server ha il testo nuovo e la dashboard lo mostra formattato; se il salvataggio non riesce il testo scritto resta nel campo

### Requirement: Esiti dalla dashboard
La dashboard MUST permettere di sospendere, riattivare e abbandonare un cantiere, ciascuno dopo una
conferma che nomina il cantiere. MUST non permettere di segnarlo completato.

#### Scenario: Abbandono confermato
- **WHEN** si sceglie "abbandona" su `vecchio-parser` e si conferma
- **THEN** il cantiere diventa `abbandonato` e la dashboard dice che alla prossima sessione Claude proporrà di archiviarlo

#### Scenario: Annullato
- **WHEN** si sceglie "sospendi" e poi "annulla" nella conferma
- **THEN** il cantiere non cambia
