# Spec Delta

## MODIFIED Requirements

### Requirement: Configurazione da ambiente
Il server MUST leggere la configurazione dalle variabili `FORGIA_<CHIAVE>` in maiuscolo, che possono
arrivare anche da un file `.env`. Una variabile già presente nell'ambiente MUST vincere sul valore del
file. Chiavi e default: `database_url`, `bind` (`127.0.0.1:8765`), `public_host`,
`modalita_resoconto` (`forzato`), `soglia_strumenti` (3), `inattivita_minuti` (30),
`retention_giorni` (180), `rate_limit` (120), `max_body` (65536), `max_openspec` (2097152),
`max_file` (262144), `max_file_idea` (50), `ui_header_certificato` (`X-SSL-Client-Verify`),
`ui_certificato` (`richiesto` | `off`, default `richiesto`).

#### Scenario: Override da ambiente
- **WHEN** il file `.env` ha `FORGIA_SOGLIA_STRUMENTI=3` e l'ambiente ha `FORGIA_SOGLIA_STRUMENTI=5`
- **THEN** il server usa 5 e lo restituisce in `config.soglia_strumenti`

#### Scenario: Valore non valido
- **WHEN** `FORGIA_MODALITA_RESOCONTO` vale `sempre`
- **THEN** il server non parte e dice quale chiave è sbagliata

#### Scenario: Certificato spento
- **WHEN** `FORGIA_UI_CERTIFICATO` vale `off`
- **THEN** la dashboard risponde senza l'header del certificato e il server scrive all'avvio un avviso che vale solo per lo sviluppo

### Requirement: Gestione dei token da CLI
`forgia-admin committente crea <nome>` MUST creare il committente e stampare il suo token una sola
volta. `committente elenca` MUST mostrare committenti, data di creazione e data dell'ultimo token, mai
token o hash. `committente rigenera <nome>` MUST stampare un token nuovo e revocare il precedente con
effetto immediato.

#### Scenario: Revoca
- **WHEN** l'amministratore rigenera il token del committente `PRIV`
- **THEN** la richiesta successiva con il token precedente riceve 401

#### Scenario: Cliente già esistente
- **WHEN** si lancia `committente crea priv` e il committente `PRIV` esiste già
- **THEN** il comando fallisce con un messaggio chiaro e non crea un secondo committente

### Requirement: Tabelle da terminale
`forgia-admin sessioni`, `forgia-admin progetti` e `forgia-admin cantieri` MUST stampare una tabella
leggibile con lo stato corrente, per un controllo rapido.

#### Scenario: Elenco dei cantieri
- **WHEN** si lancia `forgia-admin cantieri`
- **THEN** compare una riga per cantiere con committente, progetto, percorso, stato, change, avanzamento, numero di sessioni attive e ultimo aggiornamento

### Requirement: API di lettura minima
`GET /api/v1/cantieri` e `GET /api/v1/sessioni` MUST restituire JSON con i soli dati del committente
del token, filtrabili per `progetto`. `?aperti=1` MUST restringere ai cantieri `aperto` e
`?attive=1` alle sessioni non chiuse. Senza filtro MUST restituire tutti gli stati.

#### Scenario: Cantieri aperti
- **WHEN** il token di `CVSTUDIO` chiama `GET /api/v1/cantieri?aperti=1`
- **THEN** riceve solo i cantieri aperti di `CVSTUDIO`, ciascuno con progetto, `padre_id`, `percorso`, change, avanzamento e le sue sessioni

#### Scenario: Filtro per progetto
- **WHEN** il token di `PRIV` chiama `GET /api/v1/sessioni?progetto=mercurius`
- **THEN** riceve solo le sessioni di `PRIV` legate a `mercurius`
