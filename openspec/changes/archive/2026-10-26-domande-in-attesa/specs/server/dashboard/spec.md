# Spec Delta

## ADDED Requirements

### Requirement: Pallino delle domande in attesa
La dashboard MUST mostrare un pallino rosso sul cantiere con almeno una domanda in attesa, e sul progetto e sui cantieri padre che lo contengono, con il numero se sono più di una. Nell'indice MUST mostrarlo anche sul filtro (aperti, idee, chiusi) che contiene il cantiere, contando solo le domande proprie dei suoi cantieri. Il pallino MUST avere un'alternativa testuale per gli screen reader e MUST sparire quando le domande si chiudono, al successivo aggiornamento della vista.

#### Scenario: Una domanda in un cantiere figlio
- **WHEN** `nis2/criteri` ha una domanda in attesa
- **THEN** il pallino compare su `nis2/criteri`, su `nis2` e sul progetto

#### Scenario: Più domande
- **WHEN** un progetto ha tre domande in attesa in cantieri diversi
- **THEN** il pallino del progetto mostra `3`

#### Scenario: Domanda in un altro filtro
- **WHEN** un cantiere completato ha una domanda in attesa e nell'indice è scelto il filtro degli aperti
- **THEN** il pallino compare sul filtro dei chiusi

#### Scenario: Domanda chiusa
- **WHEN** la domanda si chiude
- **THEN** al prossimo aggiornamento il pallino non c'è più

### Requirement: Riquadro delle domande in attesa
La scheda di un cantiere con domande in attesa MUST mostrare in alto il riquadro "In attesa di risposta" con, per ogni domanda, il testo, le opzioni, la sessione, la macchina e da quanto tempo aspetta. Il riquadro MUST dire che la risposta si dà dal terminale, finché i comandi dalla dashboard non la permettono.

#### Scenario: Domanda a scelta
- **WHEN** il cantiere ha una domanda con due opzioni, in attesa da 5 minuti
- **THEN** il riquadro mostra il testo, le due opzioni, la sessione, la macchina e `da 5 minuti`

#### Scenario: Nessuna domanda
- **WHEN** il cantiere non ha domande in attesa
- **THEN** il riquadro non compare

### Requirement: Domande del lavoro senza cantiere
La pagina di un progetto MUST mostrare in alto il riquadro "In attesa di risposta" con le domande delle sue sessioni senza cantiere, e il pallino sulla riga di quelle sessioni in "Attività non censite". Nell'indice, al livello dei cantieri, il pallino di queste domande MUST stare sul titolo del progetto.

#### Scenario: Lavoro diretto sul progetto
- **WHEN** una sessione senza cantiere aspetta una risposta
- **THEN** la pagina del progetto mostra la domanda nel riquadro e il pallino sulla riga della sessione, e nell'indice il pallino sta sul titolo del progetto
