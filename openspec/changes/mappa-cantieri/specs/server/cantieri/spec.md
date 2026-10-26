## ADDED Requirements

### Requirement: Legame alla nascita
Il server MUST registrare da quale cantiere è nato un cantiere, separato dal padre, senza cambiare percorso e change. Quando `apri_cantiere` crea un cantiere e la sessione stava in un altro cantiere che non ne è un antenato, il server MUST registrare il legame da quel cantiere al nuovo, con il `task` se c'è. Entrare in un cantiere che esiste già MUST NOT creare legami.

#### Scenario: Ramo nato da un task
- **WHEN** la sessione s1 sta in `multi-instrument-simulations` e chiama `apri_cantiere` con nome `basket-mix` e task `1.1`
- **THEN** nasce il cantiere `basket-mix`, con change `basket-mix`, e la sua lettura ha `nato_da` con `multi-instrument-simulations` e task `1.1`

#### Scenario: Fase, non ramo
- **WHEN** la sessione s1 sta in `idoc-converter` e apre `idoc-converter/prototipo`
- **THEN** `prototipo` ha il padre `idoc-converter` e `nato_da` vuoto

#### Scenario: Cambiare lavoro non è un ramo
- **WHEN** la sessione s1 sta in `a` ed entra nel cantiere `c`, che esiste già
- **THEN** `c` non ha legami

#### Scenario: Tra progetti
- **WHEN** la sessione s1 sta in `app/a` e chiama `apri_cantiere` con nome `x` e progetto `web` dello stesso committente
- **THEN** `web/x` ha `nato_da` con progetto `app` e percorso `a`

### Requirement: Legame dichiarato
Con `nato_da` (e `nato_da_progetto` per un altro progetto dello stesso committente) il server MUST registrare il legame anche verso un cantiere che esiste già. Un cantiere di partenza che non esiste MUST dare un rifiuto 409 che lo nomina. Lo stesso legame MUST restare uno solo.

#### Scenario: Partenza che non c'è
- **WHEN** `apri_cantiere` arriva con `nato_da` `non-esiste`
- **THEN** la risposta è 409 e dice che il cantiere di partenza `non-esiste` non esiste, e nessun cantiere nasce

#### Scenario: Dichiarato due volte
- **WHEN** due `apri_cantiere` con `nato_da` `a` arrivano per lo stesso cantiere `b`
- **THEN** `b` ha un solo legame da `a`

### Requirement: Legami impossibili
Un `task` senza un legame scritto (né `nato_da`, né una sessione in un cantiere che ne apre uno nuovo, o con una partenza che è un antenato o un discendente) MUST dare 409 senza creare nulla. Tra un cantiere e un suo antenato o discendente MUST NOT nascere legami: basta il padre. Un legame dichiarato che chiuderebbe un giro di legami registrati MUST essere rifiutato.

#### Scenario: Task senza partenza
- **WHEN** una sessione in lavoro diretto chiama `apri_cantiere` con nome `nuovo` e task `1.1`, senza `nato_da`
- **THEN** la risposta è 409 e `nuovo` non nasce

#### Scenario: Giro
- **WHEN** `b` è nato da `a` e arriva `apri_cantiere` per `a` con `nato_da` `b`
- **THEN** la richiesta è rifiutata e `a` resta senza legami

#### Scenario: Secondo ramo dallo stesso cantiere
- **WHEN** la sessione sta in `a`, apre `b` (che nasce da `a`) e poi apre `c` con `nato_da` `a`
- **THEN** `b` e `c` sono tutti e due nati da `a`

### Requirement: Rami nella lettura
Ogni cantiere restituito da `GET /api/v1/cantieri`, da `elenca_cantieri` e dall'albero della dashboard MUST avere `nato_da`: l'elenco dei cantieri da cui è nato, ciascuno con `id`, `progetto`, `percorso`, `task` (o `null`) e `tipo` (`registrato` o `citato`). Un cantiere senza legami MUST avere `nato_da` vuoto.

#### Scenario: Lettura con il task
- **WHEN** si leggono i cantieri del progetto dopo lo scenario «Ramo nato da un task»
- **THEN** `basket-mix` ha `nato_da` `[{ id, progetto: "app", percorso: "multi-instrument-simulations", task: "1.1", tipo: "registrato" }]`

### Requirement: Legami citati
A ogni copia dei change di un progetto il server MUST ricavare i legami citati: un `proposal.md` o un `tasks.md` che nomina tra apici inversi il change di un altro cantiere dello stesso progetto lega i due cantieri dal più vecchio (per la data `created` del change, poi per quando il server l'ha visto) al più nuovo, con il numero del task se la citazione sta nel `tasks.md` del più vecchio, anche in una riga che continua il task. Tra un cantiere e un suo antenato MUST NOT nascere legami citati.

#### Scenario: Citato nel task
- **WHEN** il `tasks.md` di `multi-instrument-simulations` dice «- [ ] 1.1 … dipendono da `basket-mix`» e `basket-mix` è più recente
- **THEN** `basket-mix` ha `nato_da` con `multi-instrument-simulations`, task `1.1` e tipo `citato`

### Requirement: Citati sotto i registrati
Una citazione tolta dai file MUST togliere il suo legame citato alla copia dopo. Un legame registrato MUST vincere su uno citato della stessa coppia, anche al contrario, e MUST togliere i citati che con lui chiuderebbero un giro; un citato MUST NOT chiudere giri, anche passando da altri progetti.

#### Scenario: Registrato dopo citato
- **WHEN** un legame citato da `a` a `b` esiste e arriva `apri_cantiere` per `b` con `nato_da` `a` e task `2.1`
- **THEN** il legame diventa `registrato` con task `2.1` e resta così alla copia dopo

#### Scenario: Citazione tolta
- **WHEN** la proposta di un cantiere non cita più `altro`
- **THEN** alla copia dopo `altro` non ha più quel legame citato
