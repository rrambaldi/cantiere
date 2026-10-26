## ADDED Requirements

### Requirement: Navigazione a livelli
La colonna di sinistra MUST mostrare un livello alla volta (committenti, progetti di un committente, cantieri di un progetto) con un comando per tornare al livello sopra. Al livello dei cantieri MUST filtrare per aperti, idee e chiusi con i conteggi del progetto. La colonna e la scheda tecnica MUST potersi chiudere e riaprire, e il loro stato MUST restare al ricaricamento. Sopra il titolo del centro MUST esserci il percorso della scelta (committente, progetto, padri del cantiere, cantiere), con un segmento cliccabile per ognuno tranne l'ultimo.

#### Scenario: Risalire dal cantiere
- **WHEN** è scelto `PRIV / cantiere / navigazione-dashboard` e si clicca il segmento `cantiere` del percorso
- **THEN** il centro mostra il progetto `cantiere` e la colonna, aperta, i suoi cantieri

#### Scenario: Colonna che si chiude da sola
- **WHEN** la puntina è spenta e si sceglie un cantiere nella colonna
- **THEN** il cantiere si apre al centro e la colonna diventa la rotaia «sfoglia»; con la puntina accesa resta aperta

#### Scenario: Tornare su
- **WHEN** la colonna mostra i cantieri di `mercurius` e si clicca «‹ PRIV»
- **THEN** la colonna mostra i progetti di `PRIV`, senza cambiare quello che c'è al centro

### Requirement: Scelta nell'indirizzo
La scelta corrente MUST stare nell'indirizzo della pagina (`#/committente/progetto/padre/cantiere`). Una scelta nuova MUST aggiungere un passo alla cronologia del browser; Indietro e Avanti MUST riportare alle scelte di quei passi. Aprendo la pagina, l'indirizzo MUST vincere sulla scelta ricordata dal browser. Un indirizzo che non porta a niente MUST lasciare la scelta corrente e tornare il suo indirizzo.

#### Scenario: Indietro
- **WHEN** si sceglie il progetto `mercurius`, poi `AI-Berkshire`, poi il committente `PRIV`, e si preme tre volte Indietro
- **THEN** la pagina mostra `AI-Berkshire`, poi `mercurius`, poi la scelta di partenza

#### Scenario: Link
- **WHEN** si apre `#/PRIV/parity-deriva/multi-instrument-simulations/basket-mix` con un'altra scelta ricordata
- **THEN** la pagina mostra `basket-mix` con il suo percorso

### Requirement: Telefono
A 720 px o meno la dashboard MUST mostrare una schermata alla volta: la colonna aperta prende tutto lo schermo e nasconde il centro, chiusa è una barra in cima con «sfoglia». La scheda tecnica MUST aprirsi come un foglio dal basso sopra un velo, con la pagina sotto inerte, e MUST chiudersi con il suo bottone, con un tocco sul velo o con Esc (salvo un dialogo aperto sopra). All'apertura, e stringendo la finestra sotto quella soglia, la colonna e la scheda MUST essere chiuse; quello che si apre al telefono MUST NOT cambiare lo stato ricordato per il desktop, che torna allargando la finestra.

#### Scenario: Dal cantiere a un'idea
- **WHEN** a 390×844 si tocca «sfoglia», poi «‹ PRIV», `mercurius`, «Idee» e un'idea
- **THEN** ogni tocco mostra un livello a tutto schermo, e l'idea si apre al centro con la colonna chiusa

#### Scenario: Foglio della scheda
- **WHEN** a 390×844 si apre la scheda tecnica dalla testata
- **THEN** la scheda sale dal basso sopra un velo, il fuoco va al suo bottone di chiusura e resta nel foglio; un tocco sul velo la chiude e il fuoco torna al bottone della testata
