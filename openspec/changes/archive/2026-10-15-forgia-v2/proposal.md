# Proposal

## Why

forgia v1 traccia le sessioni in cantieri, ma non sa per chi si lavora né su quale prodotto. Tutti i
cantieri stanno in un mucchio solo, con nomi unici a livello globale e cantieri provvisori
`app@main` nati dal repo. Il lavoro reale è organizzato per **committente** (PRIV, DGT, PENTAQO,
CVSTUDIO...), poi per **progetto** (il prodotto: poker, mercurius, Logiquo), poi per **cantieri**
(le attività: pdfconverter, mailer), a volte divisi in fasi. Inoltre tutti i progetti usano
OpenSpec, e v1 lo ignora: il lavoro vero è nei change, e forgia ne mostra solo un riassunto scritto
a mano.

Manca anche un posto dove vedere tutto e dove far nascere il lavoro: un'idea scritta prima di aprire
Claude Code oggi non ha casa. v1 aveva messo la dashboard fuori ambito; adesso serve.

## What Changes

- **Committenti** (nuovo): anagrafica fissa creata dalla dashboard. Ogni committente ha **un token**,
  che sostituisce i token per macchina e **separa i dati**: con il token di CVSTUDIO si vedono e si
  scrivono solo i progetti di CVSTUDIO. Nomi riservati (`api`, `mcp`, `ui`) rifiutati, maiuscole
  indifferenti. **BREAKING**: spariscono i token per cliente-macchina; `salute` risponde con il
  nome del committente nel campo `cliente`.
- **Progetti** (nuovo): sotto un committente, nome unico nel committente. Si creano dalla dashboard
  o da Claude Code con `/cantiere collega <progetto>`, che chiede conferma se il progetto non esiste.
- **Aree sul client** (nuovo): il plugin collega una cartella di sorgenti (e le sue sottocartelle) a
  un progetto e al token del suo committente. Le cartelle le conosce solo il client. Il server MCP
  viene registrato per cartella, non per utente. Una sessione fuori da ogni area non manda niente.
  **BREAKING**: il setup `/cantiere server <url>` a livello utente lascia il posto a
  `/cantiere collega`.
- **Cantieri dentro i progetti**: albero di cantieri annidati sotto ogni progetto, nome unico tra
  fratelli (`poker/idoc-converter/preprod`). Da quando viene preso in lavorazione, ogni cantiere ha
  **un change OpenSpec**, con nome dato dal percorso sotto il progetto unito da `-`
  (`idoc-converter-preprod`). Il padre di cantieri annidati è un **change quadro**: idee, obiettivo,
  scelte comuni, e i suoi task sono le fasi. **BREAKING**: spariscono i cantieri provvisori `auto`,
  l'aggancio per repo e branch e lo slug unico globale.
- **Ciclo di vita del cantiere**: `idea` → `aperto` → `completato`, con `sospeso` (reversibile) e
  `abbandonato`. Completato lo decide solo il repo (`openspec archive`). Sospeso, riattivato e
  abbandonato li decide la dashboard; dopo un abbandono, alla sessione successiva Claude propone
  `openspec archive --skip-specs`. **BREAKING**: sparisce `chiudi_cantiere` (tool MCP, evento e
  `/cantiere chiudi`).
- **Il repo comanda, il server tiene una copia**: il plugin legge `openspec/changes/` dell'area
  (artefatti, task spuntati, archivio) e ne manda una copia al server quando cambia, senza far
  aspettare la sessione.
- **Idee dalla dashboard**: si crea un cantiere in stato `idea` con nome, descrizione e file `.md`
  o `.txt`. Da Claude Code `/cantiere prendi <percorso>` crea il change e scarica i file in
  `openspec/changes/<change>/idee/`; il cantiere diventa `aperto`.
- **Avvio della sessione in un'area**: la sessione parte come lavoro diretto sul progetto. Al primo
  messaggio Claude chiede: nuovo cantiere, riprendi un cantiere aperto, prendi un'idea, oppure lavoro
  diretto. Il lavoro diretto finisce tra le **attività non censite** del progetto, con il titolo
  della sessione (quello di `/rename`, altrimenti quello generato da Claude Code).
- **Privacy**: oltre a stato, todo e conteggi, al server arrivano il titolo della sessione e i file
  dei change OpenSpec dell'area. Prompt, transcript e output dei tool restano esclusi.
- **Dashboard web** (nuovo): servita dallo stesso server sotto il percorso pubblico (per esempio
  `priv.progettazionisoftware.it/cantiere/`), protetta dal **certificato client** che controlla
  nginx; il server rifiuta la UI se nginx non conferma il certificato. `/cantiere/<COMMITTENTE>`
  apre la dashboard filtrata su quel committente. Mostra committenti, progetti, cantieri, giornale
  dei turni, avanzamento, attività non censite, e fa leggere **formattati** i file `.md` dei change
  (proposal, design, specs, tasks) e delle idee; crea committenti, token, progetti e idee; sospende,
  riattiva, abbandona.
- **Contratto v2** (`docs/contratto-v2.md`): nuove forme di eventi e tool, nuove API per progetti,
  idee e copia dei change. `versione_contratto: 2`. Server e plugin cambiano insieme.
- **Installazione**: lo script `server/deploy/installa.sh` resta l'unico passo sul server; la
  dashboard non chiede nulla in più. Il README spiega la configurazione di nginx con il certificato.

## Capabilities

### New Capabilities

- `server/committenti`: anagrafica dei committenti, token per committente, separazione dei dati,
  nomi riservati, rigenerazione del token.
- `server/progetti`: progetti sotto un committente, creazione con conferma, attività non censite.
- `server/openspec`: copia dei change OpenSpec ricevuta dal plugin, legame cantiere ↔ change,
  stati derivati dal repo, change quadro e fasi.
- `server/idee`: cantieri in stato `idea` con i loro file, presa in lavorazione da Claude Code.
- `server/dashboard`: UI web e sue API, controllo del certificato, filtro per committente, viste
  e azioni.
- `plugin/aree`: collegamento cartella → progetto e token, registrazione MCP per cartella, presa
  di un'idea, copia dei change OpenSpec.

### Modified Capabilities

- `server/accesso`: Bearer del committente al posto del cliente-macchina; `salute` con
  `versione_contratto: 2`; rotte della UI fuori dal Bearer.
- `server/cantieri`: cantieri dentro un progetto, nome unico tra fratelli, niente provvisori né
  aggancio per repo, sessione senza cantiere = lavoro diretto, stati nuovi, niente chiusura da
  Claude Code.
- `server/eventi`: campo `progetto` e titolo della sessione negli eventi, niente
  `chiudi_cantiere`, sessioni legate al committente.
- `server/contesto`: contesto di avvio con progetto, cantieri aperti, idee e domanda iniziale;
  niente hint del provvisorio né conferme di chiusura.
- `server/strumenti-mcp`: `apri_cantiere` relativo al progetto, niente `chiudi_cantiere`,
  `elenca_cantieri` ristretto al committente e con le idee.
- `server/amministrazione`: CLI per committenti e progetti, letture ristrette al committente,
  chiavi di configurazione nuove.
- `plugin/configurazione`: setup per area al posto del setup utente, MCP per cartella, tracciamento
  solo nelle aree.
- `plugin/comando-cantiere`: forme `collega`, `prendi` e percorso relativo al progetto; niente
  `chiudi` né `server`.
- `plugin/tracciamento`: eventi solo nelle aree, titolo della sessione, privacy aggiornata.

## Impact

- **Server** (`server/`): migrazione `0002` (committenti, progetti, cantieri ristrutturati, change,
  idee e loro file, salvati nel database), dominio, API nuove, tool MCP, contesto, CLI, dashboard
  sotto `server/ui/` (React servito dal server, nessuna CDN).
- **Plugin** (`plugin/`): configurazione per area, lettura di `openspec/changes/`, titolo dal
  transcript (righe `custom-title` e `ai-title`, formato interno di Claude Code), comando
  `/cantiere` rivisto, `.mjs` ricompilato.
- **Contratto**: `docs/contratto-v2.md` nuovo; `docs/contratto-v1.md` resta come storico.
- **Deploy**: `installa.sh` e unit invariati nella sostanza; README con la configurazione di nginx
  (certificato su UI, Bearer su `api/v1` e `mcp`) e il Caddyfile aggiornato.
- **Dati**: v1 non è mai andato in produzione; la `0002` riparte da tabelle vuote per committenti,
  progetti e cantieri. I dati di sviluppo si perdono.
- **Fuori ambito**: certificati legati a un committente (oggi un certificato vede tutto), persone
  e ruoli, modifica dei change dalla dashboard dopo la presa in lavorazione, todo spuntabili dalla
  dashboard, eliminazione dei committenti, PostgreSQL in produzione.
