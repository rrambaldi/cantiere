# Spec Delta

## MODIFIED Requirements

### Requirement: Chiusura della domanda
Una domanda `in_attesa` MUST passare a `risposta` quando arriva l'evento `risposta` con il suo identificativo, MUST passare a `risposta` anche quando la dashboard la conferma o la nega (vedi `server/comandi`), e MUST essere chiusa quando la sessione manda un nuovo prompt o finisce. Le domande di tipo `attesa` MUST chiudersi anche a un nuovo `stop`.

#### Scenario: Risposta data
- **WHEN** arriva la `risposta` con l'identificativo di una domanda `in_attesa`
- **THEN** la domanda diventa `risposta` e sparisce dalle domande in attesa

#### Scenario: Confermata dalla dashboard
- **WHEN** dalla dashboard si conferma una domanda `in_attesa`
- **THEN** la domanda diventa `risposta` e sparisce dalle domande in attesa

#### Scenario: Nuovo prompt
- **WHEN** una sessione con una domanda `in_attesa` manda un `prompt`
- **THEN** la domanda è chiusa

#### Scenario: Sessione finita
- **WHEN** una sessione con una domanda `in_attesa` manda `session_end`
- **THEN** la domanda è chiusa

#### Scenario: Risposta a una domanda sconosciuta
- **WHEN** arriva una `risposta` con un identificativo che il server non conosce
- **THEN** il server risponde 200 e non cambia nulla

### Requirement: Nessuna risposta dal server
Il server MUST NOT accettare dalla dashboard una risposta libera alla domanda: dalla dashboard si può solo confermarla o negarla con un feedback, come esito (vedi `server/comandi`). Ogni altra chiusura viene dagli eventi della sessione.

#### Scenario: Risposta dalla dashboard
- **WHEN** la dashboard prova a mandare una risposta libera a una domanda
- **THEN** la rotta non esiste e il server risponde 404

#### Scenario: Rifiuto con feedback
- **WHEN** dalla dashboard si nega una domanda scrivendo "il pulsante non si vede al telefono"
- **THEN** la domanda diventa `risposta` e il feedback arriva alla sessione come esito `negato`
