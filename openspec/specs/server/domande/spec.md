# server/domande Specification

## Purpose
Tiene traccia delle domande che una sessione ha fatto all'utente e che aspettano risposta, così che la dashboard le mostri e nessuna sessione resti ferma senza che nessuno lo sappia.

## Requirements

### Requirement: Domanda in attesa
Il server MUST registrare ogni evento `domanda` come domanda `in_attesa` della sua sessione, con identificativo, tipo (`scelta` o `attesa`), testo, opzioni (anche nessuna), host e orario. Lo stesso identificativo MUST essere registrato una volta sola.

#### Scenario: Domanda a scelta
- **WHEN** arriva una `domanda` di tipo `scelta` con il testo `Quale branch?` e due opzioni
- **THEN** la sessione ha una domanda `in_attesa` con testo e opzioni

#### Scenario: Sessione ferma
- **WHEN** arriva una `domanda` di tipo `attesa` con il testo della notifica
- **THEN** la sessione ha una domanda `in_attesa` senza opzioni

#### Scenario: Domanda ripetuta
- **WHEN** la stessa domanda arriva due volte con lo stesso identificativo
- **THEN** il server conserva una sola domanda

### Requirement: Chiusura della domanda
Una domanda `in_attesa` MUST passare a `risposta` quando arriva l'evento `risposta` con il suo identificativo, e MUST essere chiusa quando la sessione manda un nuovo prompt o finisce. Le domande di tipo `attesa` MUST chiudersi anche a un nuovo `stop`.

#### Scenario: Risposta data
- **WHEN** arriva la `risposta` con l'identificativo di una domanda `in_attesa`
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

### Requirement: Scadenza delle domande
Una domanda `in_attesa` MUST scadere dopo 24 ore e MUST smettere di comparire nelle letture. La pulizia esistente MUST togliere le domande chiuse o scadute insieme agli eventi vecchi.

#### Scenario: Domanda vecchia
- **WHEN** una domanda è `in_attesa` da più di 24 ore
- **THEN** non compare nelle letture e il conteggio del cantiere non la include

### Requirement: Domande nelle letture
Le letture dei progetti e dei cantieri MUST riportare il numero di domande in attesa, e quella di un cantiere MUST elencare le domande con testo, opzioni, sessione, host e orario. Le domande di una sessione senza cantiere MUST contare per il progetto.

#### Scenario: Due domande nello stesso cantiere
- **WHEN** due sessioni di `nis2` hanno una domanda in attesa ciascuna
- **THEN** la lettura di `nis2` riporta `domande_in_attesa: 2` e le elenca, e il progetto riporta almeno 2

#### Scenario: Sessione senza cantiere
- **WHEN** una sessione in lavoro diretto su `poker` ha una domanda in attesa
- **THEN** la lettura di `poker` conta una domanda e nessun cantiere ne ha

### Requirement: Nessuna risposta dal server
Il server MUST NOT accettare una risposta alla domanda dalla dashboard: la domanda si chiude solo per gli eventi della sessione.

#### Scenario: Risposta dalla dashboard
- **WHEN** la dashboard prova a rispondere a una domanda
- **THEN** la rotta non esiste e il server risponde 404
