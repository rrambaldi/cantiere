# Spec Delta

## Purpose

Fa sapere al server quando Claude Code aspetta una risposta dell'utente e quando l'attesa finisce, usando solo segnali deterministici degli hook.

## ADDED Requirements

### Requirement: Domanda a scelta
Prima che Claude Code esegua il tool `AskUserQuestion` il plugin MUST mandare una `domanda` di tipo `scelta` con il testo e le opzioni, e con l'identificativo della chiamata del tool come `id`. L'hook MUST NOT cambiare né bloccare la domanda.

#### Scenario: Domanda con due opzioni
- **WHEN** Claude usa `AskUserQuestion` con una domanda e due opzioni
- **THEN** parte una `domanda` con il testo, le due opzioni e l'`id` della chiamata

#### Scenario: Più domande nella stessa chiamata
- **WHEN** la chiamata ha tre domande
- **THEN** il testo riporta le tre domande, ciascuna con le sue opzioni, in una sola `domanda`

### Requirement: Sessione in attesa
Alla notifica `Notification` di tipo permesso richiesto o sessione inattiva il plugin MUST mandare una `domanda` di tipo `attesa` con il testo della notifica. MUST NOT mandarne una nuova se la sessione ha già una domanda aperta, di qualunque tipo: `AskUserQuestion` può far scattare la stessa notifica.

#### Scenario: Richiesta di permesso
- **WHEN** Claude chiede il permesso di eseguire un comando
- **THEN** parte una `domanda` di tipo `attesa` con il testo della notifica

#### Scenario: Notifica ripetuta
- **WHEN** arriva una seconda notifica mentre la prima attesa è aperta
- **THEN** il plugin non manda niente

#### Scenario: Notifica durante una domanda a scelta
- **WHEN** arriva una notifica mentre `AskUserQuestion` è in attesa di risposta
- **THEN** il plugin non manda niente e, dopo la risposta, una nuova notifica parte di nuovo

### Requirement: Fine dell'attesa
Dopo il tool `AskUserQuestion` (`PostToolUse`) il plugin MUST mandare la `risposta` con lo stesso `id`. Le domande di tipo `attesa` si chiudono con il prompt successivo, con lo stop o con la fine della sessione, che il server già riceve.

#### Scenario: Risposta data
- **WHEN** l'utente risponde a `AskUserQuestion` e il tool termina
- **THEN** parte una `risposta` con l'`id` della domanda

#### Scenario: Tool rifiutato
- **WHEN** l'utente interrompe la domanda e il tool non termina
- **THEN** la domanda si chiude al prompt successivo

### Requirement: Fail-open e latenza
Gli hook delle domande MUST essere asincroni, non MUST ritardare Claude Code né dare errore se il server non risponde. Gli eventi MUST passare dalla coda locale come gli altri.

#### Scenario: Server giù
- **WHEN** il server non risponde mentre Claude fa una domanda
- **THEN** la domanda resta nella coda e Claude non aspetta

### Requirement: Esclusioni
Con il tracciamento spento, con la cartella esclusa o senza area configurata il plugin MUST NOT mandare né domande né risposte.

#### Scenario: Cartella esclusa
- **WHEN** la cartella contiene `.forgia-off` e Claude fa una domanda
- **THEN** il plugin non manda nulla
