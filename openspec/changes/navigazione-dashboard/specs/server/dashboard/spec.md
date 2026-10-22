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
