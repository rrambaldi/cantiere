# Spec Delta

## Purpose

Lega un cantiere ai repo, alle issue e ai commit del suo lavoro, così che il giornale racconti cosa è stato fatto e dove. Il server conserva solo dati non segreti: le chiavi restano sulle macchine.

## ADDED Requirements

### Requirement: Configurazione git del cantiere
Un cantiere MUST poter avere una lista di repo, uno solo principale. Per ogni repo il server MUST conservare l'URL normalizzato, il forge (`github` o `gitea`), l'URL dell'API e il nome di una variabile d'ambiente. Il cantiere MUST ereditare la configurazione dal padre se non ne ha una. Senza configurazione vale il `repo` della sessione.

#### Scenario: Eredità dal padre
- **WHEN** `nis2` ha il repo `git.example.it/dgt/nis2` e il figlio `nis2/criteri` non ha configurazione
- **THEN** la lettura di `nis2/criteri` riporta il repo di `nis2`

#### Scenario: Senza configurazione
- **WHEN** un cantiere non ha repo e la sua sessione arriva con `repo: "github.com/a/b"`
- **THEN** il cantiere usa `github.com/a/b` come repo, con forge `github`

#### Scenario: Forge sconosciuto
- **WHEN** si configura il forge `gitlab`
- **THEN** il server risponde 422 e dice che sono ammessi `github` e `gitea`

### Requirement: Nessun segreto sul server
Il server MUST NOT accettare né salvare token, password o chiavi. Il campo della variabile d'ambiente MUST contenere solo un nome (lettere maiuscole, cifre e trattino basso).

#### Scenario: Token al posto del nome
- **WHEN** si configura come variabile d'ambiente il valore `ghp_abc123xyz...`
- **THEN** il server risponde 422 e non salva nulla

#### Scenario: URL con credenziali
- **WHEN** si configura un repo con un URL che contiene utente e password prima del nome del server
- **THEN** il server salva l'URL senza credenziali, oppure risponde 422

### Requirement: Issue del cantiere
Un cantiere MUST poter avere da zero a venti issue, ciascuna identificata da un numero intero positivo. Al massimo una MUST essere il piano. Un numero MUST comparire una volta sola per cantiere.

#### Scenario: Aggiunta di issue
- **WHEN** a `nis2` si aggiungono le issue 42 e 43
- **THEN** la lettura di `nis2` riporta le issue 42 e 43, senza piano

#### Scenario: Due piani
- **WHEN** `nis2` ha la issue 40 come piano e si indica la 42 come piano
- **THEN** il piano diventa la 42 e la 40 resta tra le altre issue

#### Scenario: Numero non valido
- **WHEN** si aggiunge la issue `0` o `abc`
- **THEN** il server risponde 422

#### Scenario: Numero ripetuto
- **WHEN** si aggiunge la issue 42 a un cantiere che già la ha
- **THEN** la richiesta riesce e la issue resta una sola

### Requirement: Issue nella risposta e nel contesto
La risposta a ogni evento MUST riportare le issue del cantiere, il piano per primo. Il contesto di avvio MUST elencarle e MUST dire a Claude di citarle tutte con `Refs` nei commit.

#### Scenario: Contesto con piano
- **WHEN** parte una sessione su `nis2`, che ha il piano 40 e le issue 42 e 43
- **THEN** il contesto contiene `Refs #40 #42 #43`, con il 40 per primo

#### Scenario: Cantiere senza issue
- **WHEN** parte una sessione su un cantiere senza issue
- **THEN** il contesto non contiene nessuna riga sulle issue

### Requirement: Avviso di piano mancante
Se un cantiere ha più di una issue e nessun piano, le letture MUST segnalarlo con un campo dedicato, e la dashboard MUST mostrarlo come avviso leggero. L'avviso MUST NOT bloccare nessuna operazione.

#### Scenario: Due issue senza piano
- **WHEN** un cantiere ha le issue 42 e 43 e nessun piano
- **THEN** la lettura riporta `piano_mancante: true`

### Requirement: Commit registrati
Il server MUST registrare per ogni commit: hash, data, numero di file, righe aggiunte e tolte, sessione, branch e numeri delle issue citate. Titolo e corpo MUST essere registrati solo se l'evento li porta. Lo stesso hash per lo stesso cantiere MUST essere registrato una volta sola.

#### Scenario: Commit senza messaggio
- **WHEN** arriva un commit con hash, 3 file, 40 righe aggiunte, 5 tolte e senza titolo
- **THEN** il server lo registra senza titolo né corpo e la dashboard mostra hash e conteggi

#### Scenario: Commit ripetuto
- **WHEN** lo stesso hash arriva due volte, da due sessioni dello stesso cantiere
- **THEN** il server conserva una sola riga

#### Scenario: Messaggio non richiesto
- **WHEN** `messaggi_commit` è spento e arriva un commit con il titolo
- **THEN** il server scarta titolo e corpo e registra il resto

### Requirement: Messaggi dei commit su richiesta
La configurazione del server MUST avere `messaggi_commit` (booleano, spento di default), riportata nel campo `config` della risposta agli eventi. Solo se acceso il server MUST accettare e mostrare titolo e corpo dei commit.

#### Scenario: Opzione accesa
- **WHEN** `messaggi_commit` è acceso e arriva un commit con titolo e corpo
- **THEN** la dashboard li mostra nella scheda del cantiere

### Requirement: Titolo e stato delle issue
Il server MUST accettare titolo e stato (`aperta` o `chiusa`) di una issue, mandati dal plugin, e MUST mostrarli accanto al numero. Senza questi dati la dashboard MUST mostrare solo il numero. Il server MUST NOT chiamare il forge.

#### Scenario: Titolo ricevuto
- **WHEN** il plugin manda per la issue 42 il titolo `Criteri di conservazione` e lo stato `aperta`
- **THEN** la scheda mostra `#42 Criteri di conservazione`

#### Scenario: Nessun dato dal forge
- **WHEN** nessun plugin ha mandato il titolo della issue 43
- **THEN** la scheda mostra `#43` con il link al forge

### Requirement: Link al forge
Il server MUST costruire il link a un repo, a un commit e a una issue dall'URL del repo: `<repo>/issues/<N>` e `<repo>/commit/<hash>`, uguali per GitHub e Gitea.

#### Scenario: Link a una issue
- **WHEN** il repo è `https://git.example.it/dgt/nis2` e la issue è la 42
- **THEN** il link è `https://git.example.it/dgt/nis2/issues/42`
