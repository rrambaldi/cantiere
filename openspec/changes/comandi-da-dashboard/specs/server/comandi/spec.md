## ADDED Requirements

### Requirement: Comando dalla dashboard
La dashboard MUST permettere di creare un comando per una sessione non chiusa del proprio ambito. Il testo
MUST avere da 1 a 500 caratteri dopo il trim. Il server MUST rifiutare con 422 un testo vuoto o più lungo,
con 404 una sessione inesistente o di un altro committente, con 409 una sessione chiusa, e con 409 una
sessione che ha già 5 comandi in attesa. Il Bearer MUST NOT bastare a creare un comando: solo le rotte
della dashboard lo creano.

#### Scenario: Comando valido
- **WHEN** dalla dashboard si scrive "continua con i test" per una sessione attiva
- **THEN** il comando nasce `in attesa` e compare nella scheda della sessione

#### Scenario: Sessione chiusa
- **WHEN** si scrive un comando per una sessione chiusa
- **THEN** il server risponde 409 e non salva nulla

#### Scenario: Sessione di un altro committente
- **WHEN** la dashboard filtrata su `CVSTUDIO` scrive un comando per una sessione di `PRIV`
- **THEN** il server risponde 404

#### Scenario: Troppi comandi in attesa
- **WHEN** una sessione ha già 5 comandi in attesa e se ne scrive un sesto
- **THEN** il server risponde 409

#### Scenario: Token Bearer
- **WHEN** arriva una richiesta con il Bearer di un committente alla rotta che crea comandi
- **THEN** il server non la accetta

### Requirement: Consegna nella risposta agli eventi
Un evento che porta `comandi: true` MUST ricevere nella risposta `comandi`, la lista `[{"id", "testo"}]`
dei comandi `in attesa` della sua sessione, dal più vecchio, e quei comandi MUST passare a `consegnato`
nella stessa transazione. Un evento senza `comandi: true` MUST ricevere `comandi: []` e MUST NOT cambiare
lo stato di nessun comando. Lo stesso `evento_id` ricevuto di nuovo MUST ricevere la stessa risposta,
comandi compresi, senza consegnare altro. La consegna è al più una volta: un comando consegnato non torna
nelle risposte successive.

#### Scenario: Consegna una sola volta
- **WHEN** una sessione ha un comando in attesa e arrivano due eventi diversi con `comandi: true`
- **THEN** il primo riceve il comando e il secondo riceve `comandi: []`

#### Scenario: Plugin senza abilitazione
- **WHEN** arriva un evento senza `comandi: true` per una sessione con un comando in attesa
- **THEN** la risposta ha `comandi: []` e il comando resta `in attesa`

#### Scenario: Evento ripetuto
- **WHEN** lo stesso `evento_id` arriva due volte e la prima risposta ha consegnato un comando
- **THEN** la seconda risposta è identica alla prima

### Requirement: Annullamento e scadenza
Un comando `in attesa` MUST poter essere annullato dalla dashboard e passa ad `annullato`; un comando già
`consegnato` MUST NOT poter essere annullato (409). Un comando ancora `in attesa` dopo 24 ore dalla
creazione MUST passare a `scaduto` e MUST NOT essere più consegnato. L'esito di un cantiere MUST NOT scadere
a 24 ore.

#### Scenario: Annullo prima della consegna
- **WHEN** si annulla un comando `in attesa` e poi arriva un evento con `comandi: true`
- **THEN** la risposta non lo contiene

#### Scenario: Comando scaduto
- **WHEN** un comando è in attesa da 25 ore e arriva un evento con `comandi: true`
- **THEN** la risposta non lo contiene e il comando risulta `scaduto`

### Requirement: Esito di una domanda o di una verifica
La dashboard MUST permettere di confermare o negare una domanda in attesa del proprio ambito e un task di
verifica (task aperto del `tasks.md` che comincia con «Verificare» o «Prova») di un cantiere del proprio
ambito. Il rifiuto MUST avere un testo di feedback da 1 a 500 caratteri, altrimenti il server risponde 422;
una domanda non più in attesa MUST dare 409. Un esito su un task MUST nascere anche senza sessioni aperte.
Il limite di 5 comandi in attesa vale solo per i comandi di testo.

#### Scenario: Conferma di una domanda
- **WHEN** dalla dashboard si preme «Confermo» su una domanda in attesa
- **THEN** la domanda passa a `risposta`, il pallino sparisce e nasce l'esito `confermato` in attesa di consegna

#### Scenario: Rifiuto senza testo
- **WHEN** si preme «Non va» senza scrivere il feedback
- **THEN** il server risponde 422 e non salva nulla

#### Scenario: Domanda già chiusa
- **WHEN** si conferma una domanda che nel frattempo è stata chiusa
- **THEN** il server risponde 409

#### Scenario: Verifica confermata senza sessioni aperte
- **WHEN** il cantiere non ha sessioni aperte e si conferma il task "1.3 Verificare nel browser…"
- **THEN** la scheda mostra il task confermato dal web e l'esito resta in attesa di consegna

### Requirement: Consegna dell'esito
L'esito MUST diventare un comando con l'esito, il testo della domanda o del task e la sessione che ha
chiesto. MUST essere consegnato una volta sola alla prima sessione dello stesso cantiere che manda un evento
con `comandi: true`; senza cantiere, solo alla sessione che ha chiesto.

#### Scenario: Consegna alla prossima sessione del cantiere
- **WHEN** la sessione che ha chiesto è ferma e un'altra sessione dello stesso cantiere manda un evento con `comandi: true`
- **THEN** l'altra sessione riceve l'esito con il testo della domanda o del task, e nessuna sessione lo riceve di nuovo

### Requirement: Comandi visibili nella scheda della sessione
La scheda della sessione MUST mostrare i comandi con testo, stato (`in attesa`, `consegnato`, `annullato`,
`scaduto`) e orari di creazione e consegna, e MUST dire che un comando viene consegnato solo quando la
sessione fa il suo prossimo passo (fine turno o nuovo prompt), non a una sessione ferma. Le letture
(`/api/v1/sessioni`) MUST NOT mostrare il testo dei comandi.

#### Scenario: Stato dopo la consegna
- **WHEN** il plugin riceve il comando
- **THEN** la scheda lo mostra `consegnato` con l'ora

### Requirement: Il testo dei comandi non finisce nei log
I log del server MUST NOT contenere il testo dei comandi.

#### Scenario: Log di una richiesta
- **WHEN** si crea un comando
- **THEN** nessuna riga di log contiene il suo testo
