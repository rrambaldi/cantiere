## ADDED Requirements

### Requirement: Abilitazione per area
Il plugin MUST accettare comandi dalla dashboard solo nelle aree con `comandi` acceso. Il valore di
default MUST essere spento. `/cantiere comandi on` e `/cantiere comandi off` MUST cambiarlo per l'area
della cartella corrente, e `/cantiere stato` MUST mostrarne il valore. Un'area con i comandi spenti MUST
NOT inviare `comandi: true` e MUST ignorare un eventuale campo `comandi` nelle risposte.

#### Scenario: Area di default
- **WHEN** si collega una cartella e non si tocca nulla
- **THEN** gli eventi non portano `comandi: true`

#### Scenario: Accensione
- **WHEN** nella cartella collegata si lancia `/cantiere comandi on`
- **THEN** da quel momento gli eventi dell'area, salvo `domanda` e `session_end`, portano `comandi: true` e `/cantiere stato` dice che i comandi sono accesi

### Requirement: Consegna a fine turno
All'evento `stop`, se la risposta contiene comandi o ne sono arrivati con eventi precedenti, il plugin MUST impedire la chiusura del turno con
`decision: "block"` e come motivo un testo che comincia con `[forgia] Comando dalla dashboard (non scritto
in questa sessione):`, seguito dai comandi nell'ordine e da una riga che chiede di eseguirli e poi di
terminare. La consegna MUST valere anche con `stop_hook_active` vero. Se nello stesso stop scatterebbe
anche il blocco per il resoconto, MUST vincere il comando e il resoconto MUST essere chiesto allo stop
successivo.

#### Scenario: Comando a fine turno
- **WHEN** la sessione finisce un turno e il server risponde con il comando "esegui i test"
- **THEN** Claude non si ferma, riceve il comando con l'etichetta della dashboard e lo esegue

#### Scenario: Comando e resoconto insieme
- **WHEN** allo stesso stop servirebbe il resoconto e c'è un comando
- **THEN** il blocco porta il comando, e il resoconto viene chiesto allo stop dopo

### Requirement: Consegna al prossimo prompt
Se la risposta a un evento diverso da `stop` contiene comandi, il plugin MUST tenerli nella cache locale
della sessione e iniettarli, con la stessa etichetta, come contesto del prossimo prompt dell'utente.
L'iniezione MUST avvenire senza rete e una sola volta.

#### Scenario: Comando arrivato con un todo
- **WHEN** la risposta a un evento `todo` porta un comando e l'utente scrive un nuovo prompt
- **THEN** il prompt parte con il comando aggiunto al contesto, e il prompt seguente non lo ripete

### Requirement: Fail-open dei comandi
Un campo `comandi` malformato, un testo non stringa o una cache illeggibile MUST NOT far fallire l'hook:
l'hook esce con 0 e ignora i comandi che non capisce.

#### Scenario: Risposta malformata
- **WHEN** il server risponde con `comandi: "boh"`
- **THEN** l'hook esce con 0, senza output sul comando e senza errori su stderr
