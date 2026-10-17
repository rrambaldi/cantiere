# Spec Delta

## ADDED Requirements

### Requirement: Comando issue
Il plugin MUST riconoscere in modo deterministico `/cantiere issue <numeri>`, con `--piano` per indicare il piano e `--togli` per toglierle. Il comando MUST agire sul cantiere della sessione e rispondere in una riga con l'elenco aggiornato. Alla presa, `/cantiere prendi <nome> --issue <numeri>` MUST fare lo stesso.

#### Scenario: Aggiunta di issue
- **WHEN** l'utente scrive `/cantiere issue 42 43` in una sessione sul cantiere `nis2`
- **THEN** le issue 42 e 43 sono aggiunte a `nis2` e la risposta è una riga con le issue del cantiere

#### Scenario: Piano
- **WHEN** l'utente scrive `/cantiere issue 40 --piano`
- **THEN** la issue 40 diventa il piano di `nis2`

#### Scenario: Togliere una issue
- **WHEN** l'utente scrive `/cantiere issue 43 --togli`
- **THEN** la issue 43 esce dal cantiere

#### Scenario: Sessione senza cantiere
- **WHEN** l'utente scrive `/cantiere issue 42` in una sessione che lavora direttamente sul progetto
- **THEN** il plugin risponde in una riga che serve prima un cantiere, e non cambia nulla

#### Scenario: Numero non valido
- **WHEN** l'utente scrive `/cantiere issue abc`
- **THEN** il plugin risponde con la forma del comando, senza chiamare il server
