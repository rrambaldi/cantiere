# server/amministrazione Specification

## Purpose
Copre quello che serve a far girare e controllare il server forgia: configurazione, CLI di
amministrazione, migrazioni dello schema, pulizia per retention e API di lettura minima.

## Requirements

### Requirement: Configurazione da ambiente
Il server MUST leggere la configurazione dalle variabili `FORGIA_<CHIAVE>` in maiuscolo, che possono
arrivare anche da un file `.env`. Una variabile già presente nell'ambiente MUST vincere sul valore del
file. Chiavi e default: `database_url`, `bind` (`127.0.0.1:8765`),
`public_host`, `modalita_resoconto` (`forzato`), `soglia_strumenti` (3), `hint_max` (3),
`inattivita_minuti` (30), `retention_giorni` (180), `rate_limit` (120), `max_body` (65536).

#### Scenario: Override da ambiente
- **WHEN** il file `.env` ha `FORGIA_SOGLIA_STRUMENTI=3` e l'ambiente ha `FORGIA_SOGLIA_STRUMENTI=5`
- **THEN** il server usa 5 e lo restituisce in `config.soglia_strumenti`

#### Scenario: Valore non valido
- **WHEN** `FORGIA_MODALITA_RESOCONTO` vale `sempre`
- **THEN** il server non parte e dice quale chiave è sbagliata

### Requirement: Gestione dei token da CLI
`forgia-admin token crea --cliente <nome>` MUST creare il cliente e stampare il suo token una sola
volta. `token elenca` MUST mostrare clienti, data di creazione e revoca, mai token o hash.
`token revoca --cliente <nome>` MUST revocare il cliente con effetto immediato.

#### Scenario: Revoca
- **WHEN** l'amministratore revoca il cliente `portatile`
- **THEN** la richiesta successiva con quel token riceve 401

#### Scenario: Cliente già esistente
- **WHEN** si lancia `token crea --cliente portatile` e il cliente attivo `portatile` esiste già
- **THEN** il comando fallisce con un messaggio chiaro e non crea un secondo token

### Requirement: Migrazioni versionate e portabili
`forgia-admin migra` MUST applicare in ordine i file di migrazione numerati non ancora applicati e
registrare nel database quali ha applicato. Lo schema MUST usare solo costrutti portabili, così che
lo stesso comando funzioni su PostgreSQL cambiando solo `database_url`. SQLite MUST girare in
modalità WAL.

#### Scenario: Database nuovo
- **WHEN** si lancia `migra` su un database vuoto
- **THEN** tutte le migrazioni vengono applicate e il database registra l'ultima

#### Scenario: Seconda esecuzione
- **WHEN** si lancia `migra` due volte
- **THEN** la seconda non cambia nulla

### Requirement: Pulizia per retention
`forgia-admin pulizia` MUST eliminare eventi e stati più vecchi di `retention_giorni` e dire quanti
ne ha eliminati. Sessioni, cantieri e todo correnti MUST restare.

#### Scenario: Eventi vecchi
- **WHEN** con `retention_giorni = 180` ci sono eventi di 200 giorni fa e di ieri
- **THEN** `pulizia` elimina solo quelli di 200 giorni fa

### Requirement: Tabelle da terminale
`forgia-admin sessioni` e `forgia-admin cantieri` MUST stampare una tabella leggibile con lo stato
corrente, per un controllo rapido.

#### Scenario: Elenco dei cantieri
- **WHEN** si lancia `forgia-admin cantieri`
- **THEN** compare una riga per cantiere con percorso, stato, origine, numero di sessioni attive e ultimo aggiornamento

### Requirement: API di lettura minima
`GET /api/v1/cantieri?aperti=1` e `GET /api/v1/sessioni?attive=1` MUST restituire JSON, con lo stesso
token delle altre API. Senza filtro MUST restituire anche i cantieri chiusi e le sessioni chiuse.

#### Scenario: Cantieri aperti
- **WHEN** un cliente chiama `GET /api/v1/cantieri?aperti=1`
- **THEN** riceve solo i cantieri aperti, ciascuno con `padre_id`, `percorso` e le sue sessioni

### Requirement: Sessione inattiva calcolata in lettura
Una sessione non chiusa senza eventi da più di `inattivita_minuti` MUST comparire come `inattiva` in
ogni lettura (API, tool MCP, CLI), senza che lo stato salvato cambi.

#### Scenario: Sessione dimenticata aperta
- **WHEN** l'ultimo evento di una sessione `in_attesa` è di 45 minuti fa e `inattivita_minuti = 30`
- **THEN** `GET /api/v1/sessioni` la mostra `inattiva` e nel database resta `in_attesa`
