# Design

## Context

Il perché è in `proposal.md`; i requisiti nelle specs. Qui lo stato di partenza che conta per il
come.

- **v1 è completo e archiviato** (`openspec/changes/archive/2026-10-15-forgia-v1`), ma non è mai
  andato in produzione: esistono solo database di sviluppo e di test.
- **Server**: TypeScript eseguito da Node ≥ 22.18 senza build, `node:http`, Kysely su SQLite WAL,
  zod, SDK MCP v2, un processo solo (rate limit in memoria). Una sola funzione di dominio serve REST
  e MCP (v1, D4). Migrazioni numerate in `server/src/migrazioni/`.
- **Plugin**: uno script `plugin/bin/forgia.mts` compilato in `forgia.mjs`, solo moduli interni di
  Node, hook fail-open, coda locale come outbox, configurazione in `~/.config/forgia/config.json`.
- **Design system**: `.claude/skills/forgia-design/` ha token CSS, componenti JSX (Logo, Tabs,
  StatoBadge, Nastro, Checkbox, Button, Dialog, Toast, Scheda, Resoconto) e un prototipo della
  dashboard a tre colonne (indice, giornale, scheda tecnica) con dati finti, React 18 e Babel da CDN.
- **OpenSpec 1.14.1**: i change di un progetto stanno tutti allo stesso livello in
  `openspec/changes/`; gli archiviati in `openspec/changes/archive/AAAA-MM-GG-<change>/`. Non c'è più
  un legame tra change (`--initiative is no longer supported`). Nomi kebab-case. `validate` e
  `archive` accettano cartelle in più nel change (provato con `idee/`: valido, e conservato
  nell'archivio). `archive --skip-specs` archivia senza toccare le specifiche.
- **Claude Code 2.1.300**: `claude mcp add` registra per default con `--scope local`, cioè per la
  cartella del progetto, in `~/.claude.json` sotto `projects[<percorso>]`. Il transcript di ogni
  sessione ha righe `{"type":"ai-title","aiTitle":...}` e, dopo `/rename`,
  `{"type":"custom-title","customTitle":...}`: formato interno, non documentato.
- **Pubblicazione**: `priv.progettazionisoftware.it/cantiere/` dietro nginx, che toglie il prefisso;
  nginx fa già autenticazione con certificati client per altri servizi.

## Goals / Non-Goals

**Goals**
- Un solo passo di installazione sul server, come oggi: la dashboard è servita dallo stesso
  processo e non chiede build sul server.
- Nessun dato di un committente raggiungibile con il token di un altro, per costruzione e non per
  attenzione nelle singole query.
- Gli hook restano veloci e fail-open anche con la copia dei change e il titolo.

**Non-Goals**
- Compatibilità con plugin v1: server e plugin v2 si installano insieme.
- Modificare i change dalla dashboard, rendere i todo spuntabili, gestire persone e ruoli.

## Decisions

### D1. Contratto v2 in un file nuovo, nessuna compatibilità con v1

`docs/contratto-v2.md` diventa la fonte; `docs/contratto-v1.md` resta come storico. Il server v2
risponde `versione_contratto: 2` e rifiuta con 422 gli eventi v1 (manca `progetto`, c'è
`chiudi_cantiere`); il plugin v2 rifiuta un server v1 al collegamento. *Alternativa scartata*:
accettare entrambe le versioni per un periodo. Non c'è nessuna installazione v1 da tenere viva, e due
versioni raddoppierebbero i test.

### D2. Schema: migrazione 0002 che riparte da zero

La `0002` elimina le tabelle di v1 e crea:

```
committenti   id, nome, nome_chiave (minuscolo, unico), token_hash (unico), token_il, creato_il
progetti      id, committente_id, nome, slug, creato_il          unico (committente_id, slug)
cantieri      id, progetto_id, padre_id, nome, slug, percorso_slug, change, descrizione,
              stato, origine, creato_il, aggiornato_il, stato_il
              unico (progetto_id, percorso_slug), unico (progetto_id, change)
esiti         cantiere_id, stato, ts, da (dashboard | repo | presa)        storico degli stati
sessioni      session_id, committente_id, progetto_id, cantiere_id, origine_associazione,
              stato, turni, titolo, avviso, host, cwd, repo, branch, avviata_il,
              ultimo_evento_il, chiusa_il, ts_stato, ts_todo
eventi        come v1, più committente_id e progetto_id
stati         come v1, più progetto_id; cantiere_id nullable (lavoro diretto)
todo          come v1
change_copie  cantiere_id, modificato_il, archiviato_il, artefatti, task_fatti, task_totali, hash
change_file   cantiere_id, percorso, contenuto                               unico (cantiere_id, percorso)
idee_file     cantiere_id, nome, contenuto, byte, creato_il                   unico (cantiere_id, nome)
```

- **Unicità tra fratelli senza NULL nelle chiavi.** Un indice unico su `(progetto_id, padre_id,
  slug)` non funziona al primo livello: sia SQLite sia PostgreSQL considerano diversi due `NULL`.
  `percorso_slug` (`idoc-converter/preprod`) è unico per progetto e copre lo stesso vincolo; regge
  perché un cantiere non cambia mai padre né nome (spec `server/cantieri`).
- **`change`** è `percorso_slug` con `/` → `-`, salvato e con indice unico: il conflitto
  `idoc-converter-preprod` contro `idoc-converter/preprod` lo ferma il database oltre al codice.
- **File come testo nel database**, non su disco: sono solo `.md` e `.txt` sotto 256 KB, il backup
  resta un file solo, e la stessa colonna `text` funziona su PostgreSQL. *Alternativa scartata*:
  `/var/lib/forgia/idee/`, che chiede un secondo posto da salvare e da tenere coerente.
- **Dati di v1**: si perdono, scritto nel Migration Plan. *Alternativa scartata*: convertire
  clienti in committenti; i cantieri v1 non hanno un progetto e non c'è niente da salvare.

### D3. Separazione dei dati con un ambito obbligatorio

Il filtro di accesso risolve il token in un `committente_id` e lo passa al dominio in un oggetto
`Ambito`. Ogni funzione di dominio prende `Ambito` come primo argomento, e le query partono da
helper che aggiungono sempre il join su `progetti.committente_id` (`progettiDi(ambito)`,
`cantieriDi(ambito)`, `sessioniDi(ambito)`). Nessuna query del dominio parte da `db.selectFrom` nudo
su quelle tabelle: un test di architettura legge i sorgenti del dominio e fallisce se lo trova. La
dashboard usa un `Ambito` amministratore (tutti i committenti) o ristretto (`/<committente>`).
*Alternativa scartata*: un database per committente; più isolato, ma moltiplica migrazioni e file, e
la dashboard deve comunque vedere tutto.

### D4. Nomi, slug e nomi di change

- Slug: normalizzazione NFKD, via i segni diacritici, minuscolo, ogni sequenza fuori da `[a-z0-9]`
  diventa `-`, via i `-` in testa e in coda. Vuoto → 422. Il risultato rispetta la regola kebab di
  OpenSpec (`isKebabId`), verificata da un test sugli esempi della spec.
- Committenti: `[A-Za-z0-9_-]+`, confronto su `nome_chiave` minuscolo, riservati `api`, `mcp`, `ui`.
  I riservati vivono in una costante accanto alle rotte del server, così una rotta nuova non può
  dimenticarli.

### D5. Rotte e controllo d'accesso

```
/api/v1/*            Bearer del committente       REST: eventi, letture, progetti, prendi, openspec
/mcp                 Bearer del committente       tool MCP
/ui/api/*            certificato (header nginx)   JSON della dashboard
/ui/*                certificato                  file statici della dashboard
/                    certificato                  pagina, tutti i committenti
/<committente>       certificato                  pagina, un committente
```

- **Certificato**: il server non vede il TLS; controlla l'header `ui_header_certificato` uguale a
  `SUCCESS`, che nginx imposta da `$ssl_client_verify`. Senza la configurazione giusta di nginx
  l'header manca e la UI risponde 403: l'errore di configurazione chiude invece di aprire.
- **Header falsificato dal client**: nginx deve sovrascriverlo sempre (`proxy_set_header ...
  $ssl_client_verify`). Attenzione: in nginx un `proxy_set_header` dentro una `location` cancella
  quelli ereditati, quindi il README dà un solo blocco `location /cantiere/` che inoltra tutto.
- **CSRF**: il browser manda il certificato client anche a richieste partite da altri siti. Le API
  della UI accettano solo `Content-Type: application/json` con l'header `X-Forgia-UI: 1`: da un'altra
  origine servirebbe un preflight CORS, che il server non concede. Inoltre `Origin`, se presente, deve
  avere l'host `public_host`.
- **Bearer sulla UI e certificato sulle API**: mai. Due mondi separati.

### D6. Dashboard: TSX compilato con tsc e committato, React da node_modules

- Sorgenti in `server/ui/src/*.tsx`, compilati con `tsc` (già nel progetto) in `server/ui/dist/` e
  **committati**, come il `.mjs` del plugin: `installa.sh` non costruisce nulla. Un test ricompila e
  confronta, come per il plugin.
- React e ReactDOM 18.3.1 come dipendenze del server; il server serve i loro file UMD da
  `node_modules` sotto `/ui/vendor/`. Niente CDN a runtime: la pagina sta dietro certificato su un
  host privato, e una CDN irraggiungibile la lascerebbe bianca.
- I componenti del design system (`.claude/skills/forgia-design/components/`) vengono portati in TSX
  sotto `server/ui/src/ds/`, con i token copiati in `server/ui/static/` (file e rotte in D16). Il layout parte dal
  prototipo a tre colonne: indice (committenti → progetti → cantieri), giornale, scheda tecnica (change,
  avanzamento, todo, esiti).
- **Percorsi relativi**: la pagina carica `ui/...` relativo. Da `/cantiere/` e da `/cantiere/PRIV`
  risolve in `/cantiere/ui/...`. Per `/cantiere/PRIV/` (con lo slash) il server risponde con un
  redirect relativo a `../PRIV`; per `/cantiere` senza slash il redirect lo fa nginx. Il server non
  conosce mai il prefisso.
- **Caricamento dei file**: un file per richiesta, JSON `{nome, contenuto}` letto dal browser come
  testo; limite `max_file`. Niente multipart.
- **Markdown formattato con markdown-it 14** nel browser, servito da `node_modules` sotto
  `/ui/vendor/` come React. Opzioni: `html: false` (l'HTML dei file diventa testo), `linkify: false`,
  `typographer: false`; tabelle e codice sono nel nucleo. Due regole piccole nostre: caselle dei task
  (`[x]`/`[ ]` in testa a una voce di elenco → `<input type="checkbox" disabled>`), e collegamenti con
  `target="_blank" rel="noopener noreferrer"`. markdown-it scarta già da solo gli schemi
  `javascript:`, `vbscript:`, `file:` e i `data:` non immagine; noi restringiamo a `http`, `https`,
  `mailto` con `validateLink`. L'HTML prodotto entra nella pagina solo da questo renderer, l'unico
  punto con `dangerouslySetInnerHTML`, e la `Content-Security-Policy` (`script-src 'self'`) blocca
  comunque script in linea. Stili da token e tipografia del design system (`tipo-titoli`,
  `tipo-corpo`, `tipo-mono`), in un solo foglio `ui/static/markdown.css`. I `.txt` vanno in un `<pre>`
  con `white-space: pre-wrap`.
- *Alternative scartate per il Markdown*: `marked` (non sanifica: servirebbe anche DOMPurify, due
  dipendenze invece di una); rendering sul server (stesso HTML, ma le API smetterebbero di dare il
  file com'è, che serve anche a `forgia prendi`); testo monospazio (non si legge bene, ed è quello
  che l'utente ha chiesto di evitare).
- *Alternative scartate*: Babel nel browser (come il prototipo: lento, e dipende da una CDN); esbuild
  o Vite (strumenti nuovi per un risultato che `tsc` già dà); Preact con `htm` (si riscrivono tutti i
  componenti del design system).

### D7. Plugin: aree

- `config.json` passa da `url`/`token` a `aree: [{cartella, url, token, committente, progetto,
  mcp_registrato_il}]`. Un `config.json` v1 viene letto come "nessuna area": il plugin dice di
  ricollegare con `/cantiere collega`.
- Cercare l'area: `realpath` della cwd, poi l'area con la `cartella` più lunga che la contiene
  (confronto per segmenti, così `~/lavori/pok` non contiene `~/lavori/poker`).
- `forgia collega` registra il server MCP lanciando `claude mcp add --scope local` con la cwd uguale
  alla cartella dell'area.
- La coda salva per ogni evento la `cartella` dell'area, non il token; all'invio rilegge URL e token
  dell'area. Un'area cancellata svuota i suoi eventi.
- `FORGIA_URL` e `FORGIA_TOKEN` valgono solo per `forgia collega`.

### D8. Copia dei change: il plugin legge i file, non lancia OpenSpec

- Allo `Stop`, in un'area con `openspec/changes/`, il plugin elenca le cartelle dei change attivi
  (tutte tranne `archive/`) e i nomi in `archive/` (`AAAA-MM-GG-<change>`). Per ogni change legge solo
  i file ammessi (spec `server/openspec`), calcola `modificato_il` = mtime più recente tra i suoi file,
  e conta le caselle di `tasks.md` come fa OpenSpec (`- [x]`, `- [ ]`).
- Un hash della copia per area sta nella cache: se non cambia, non parte nulla. L'invio è staccato,
  come quelli di `prompt` e `todo`: lo `Stop` non aspetta. Niente coda: la copia è uno snapshot, il
  prossimo `Stop` la rimanda intera.
- Lato server, per ogni change: sostituito solo se `modificato_il` è più recente; archiviato è
  definitivo. Il cantiere che non esiste nasce con origine `repo` (spec).
- *Alternativa scartata*: lanciare `openspec status`/`list --json` dagli hook. Ogni chiamata avvia un
  processo Node da centinaia di millisecondi, e OpenSpec potrebbe non essere installato: gli hook
  devono restare veloci e fail-open. `openspec new change` si usa solo in `forgia prendi`, che parte
  da un comando dell'utente.

### D9. Presa di un'idea

`forgia prendi <percorso>`: (1) controlla che `openspec` ci sia; (2) chiama `POST .../prendi` con la
sessione corrente (presa dalla cache dell'ultima sessione vista per la cwd, come le operazioni in
attesa di v1); (3) `openspec new change <change>` se la cartella non c'è; (4) scrive i file in
`idee/` con `O_EXCL`, saltando quelli esistenti; (5) stampa change e file scritti. Se il server
risponde ma `openspec new change` fallisce, il cantiere resta `aperto` con il change mancante (spec
`server/openspec`) e il comando lo dice: rilanciare `forgia prendi` completa il lavoro, perché la presa
è idempotente.

### D10. Avvio della sessione e domanda iniziale

Il server compone il contesto di avvio dai cantieri del progetto (spec `server/contesto`). La domanda
la fa Claude con il suo strumento di domanda a scelta, guidato dalla regola nel contesto: gli hook non
possono fare domande all'utente. Con `source` `resume` o `compact` la sessione ha già il suo cantiere
e la regola non compare. Per le altre fonti compare se la sessione è in lavoro diretto.

### D11. Esiti dalla dashboard e avviso alle sessioni

Sospendere, riattivare e abbandonare passano da una funzione di dominio sola, in una transazione:
cambia lo stato (e quello dei discendenti per l'abbandono), scrive `esiti`, e per le sessioni del
cantiere imposta `cantiere_id = null` e `avviso` con il testo per Claude. Il primo `prompt` di quelle
sessioni restituisce l'avviso come contesto e lo cancella (spec `server/contesto`).

### D12. Titolo della sessione

Allo `Stop` e al `SessionEnd` il plugin legge il transcript dalla fine, a finestre crescenti come per
il conteggio dei tool, cercando l'ultima riga `custom-title` e, se non c'è, l'ultima `ai-title`. Il
titolo viaggia in `dati.titolo` (massimo 200 caratteri, troncato dal plugin). Qualunque errore → null.

### D13. Tool MCP

Quattro tool (spec `server/strumenti-mcp`). Il `progetto` serve per le sessioni mai viste: i client
con hook lo hanno già mandato con `session_start`, claude.ai lo deve dire. Il risultato di
`apri_cantiere` riporta il `change` e, nel testo, il comando `openspec new change <change>` se la
copia del progetto non lo contiene.

### D14. Test

Come v1: `node:test`, server in ascolto sulla porta 0 con `fetch` e client MCP. In più:
- separazione dei dati: ogni API e ogni tool chiamati con il token di un altro committente;
- test di architettura sull'`Ambito` (D3);
- rotte della UI con e senza header del certificato, con Bearer, con `Origin` estraneo, senza
  `X-Forgia-UI`;
- copia dei change: percorsi vietati, ordine per `modificato_il`, archiviato definitivo;
- plugin: aree annidate, coda con due aree, lettura dei change da una cartella di prova, titolo da un
  transcript di prova;
- dashboard: `tsc` sul sorgente TSX, confronto con `dist/`, e una prova nel browser della pagina reale
  contro il server locale prima di chiudere il change.

### D15. Deploy

`installa.sh` non cambia nei passi (copia, `npm ci --omit=dev`, migrazioni, unit, controllo di
salute). Il README del server aggiunge il blocco nginx:

```nginx
ssl_client_certificate /etc/nginx/ca-client.pem;   # la CA dei certificati client
ssl_verify_client optional;

location = /cantiere { return 301 /cantiere/; }
location /cantiere/ {
    proxy_pass http://127.0.0.1:8765/;
    proxy_set_header Host $host;
    proxy_set_header X-SSL-Client-Verify $ssl_client_verify;
    proxy_buffering off;
    client_max_body_size 3m;
}
```

Il Caddyfile si aggiorna con lo stesso schema (`client_auth` in modalità `verify_if_given` e header
dal placeholder `{tls_client_*}`), oppure si toglie se nessuno lo usa.

### D16. API e file della dashboard

Interne al server: non fanno parte del contratto con il plugin. Tutte sotto `/ui/api/`, JSON, con il
certificato confermato (D5); le scritture sono `POST` con `Content-Type: application/json` e
`X-Forgia-UI: 1`. Errori: 4xx con `{"errore": "..."}`. Un `cantiere` ha la stessa forma di
`GET /api/v1/cantieri` del Contratto v2 (`sessioni` comprese).

```
GET  /ui/api/albero[?committente=<nome>]   {"committenti": [{id, nome, creato_il, token_il,
                                              progetti: [{id, nome, slug, creato_il, non_censite: <n>,
                                                          cantieri: [<cantiere>]}]}]}
GET  /ui/api/cantieri/<id>                  {"cantiere", "turni": [{ts, session_id, host, titolo, fatto,
                                              prossimo, bloccato_da, percentuale}] (dal più recente),
                                              "file": [{percorso, contenuto}],   copia del change, o idee/<nome>
                                                                                  per un'idea
                                              "todo": [{session_id, host, testo, stato}],
                                              "esiti": [{stato, ts, da}],
                                              "discendenti_attivi": [<percorso>]}  per la conferma di abbandono
GET  /ui/api/progetti/<id>/non-censite      {"sessioni": [{session_id, titolo, host, avviata_il,
                                              ultimo_evento_il, turni, stato}]}
POST /ui/api/committenti                    {nome}                → {"committente", "token"}
POST /ui/api/committenti/<id>/rigenera      {}                    → {"token"}
POST /ui/api/committenti/<id>/progetti      {nome}                → {"progetto"}
POST /ui/api/progetti/<id>/idee             {nome, descrizione?, padre_id?}  → {"cantiere"}
POST /ui/api/cantieri/<id>/modifica         {nome?, descrizione?} → {"cantiere"}      solo in stato idea
POST /ui/api/cantieri/<id>/file             {nome, contenuto}     → {"file": {nome, byte}}
POST /ui/api/cantieri/<id>/file/elimina     {nome}                → {}
POST /ui/api/cantieri/<id>/esito            {azione: sospendi | riattiva | abbandona} → {"cantieri": [<cantiere>]}
```

Con la vista ristretta (`/<committente>`) la pagina passa `committente` ad `albero`, e il server usa
un `Ambito` ristretto anche per le altre rotte quando la richiesta porta l'header
`X-Forgia-Committente`: la pagina lo manda sempre nella vista ristretta.

File:

```
server/ui/src/*.tsx, ds/*.tsx     sorgenti (tsconfig in server/ui/tsconfig.json)
server/ui/dist/*.js               compilati e committati; ingresso dist/app.js (modulo ES)
server/ui/static/index.html       la pagina, con <meta name="forgia-committente" content="{{COMMITTENTE}}">
server/ui/static/*.css            forgia.css (token e base del design system), markdown.css
```

Il server serve `index.html` per `/` e `/<committente>` sostituendo `{{COMMITTENTE}}` con il nome
canonico (vuoto per `/`), e sotto `/ui/` i file di `ui/static/` (`/ui/static/...`), `ui/dist/`
(`/ui/dist/...`) e tre file di `node_modules` (`/ui/vendor/react.production.min.js`,
`react-dom.production.min.js`, `markdown-it.min.js`). La pagina usa solo URL relativi senza `/`
iniziale. Caratteri IBM Plex da Google Fonts, come nel design system, con ripiego di sistema.
`Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self'
https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src
'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`.

## Risks / Trade-offs

- [Server MCP registrato per cartella e sessioni aperte in una sottocartella] → verificato con Claude
  Code 2.1.300 (task 1.1): in un repo git il progetto è la radice git, e una sottocartella vede il
  server registrato sulla radice; in una cartella senza git conta la cartella esatta, e la
  sottocartella no. Siccome l'area è la radice git quando c'è, il caso normale funziona. Senza git, la
  sessione aperta in una sottocartella manda comunque gli eventi (l'area la trova il plugin per
  prefisso) ma non ha i tool MCP: basta lanciare `/cantiere collega <progetto>` anche da lì, che crea
  un'area più specifica con lo stesso progetto. Nessuna registrazione automatica dagli hook: `claude
  mcp add` costa più di un secondo e gli hook devono restare veloci.
- [Titolo letto da un formato interno di Claude Code] → lettura difensiva; se il formato cambia, il
  titolo diventa null e le attività non censite mostrano data e host.
- [mtime falsati da `git checkout` di un ramo vecchio: la copia vecchia sembra la più recente] → la
  copia giusta torna al primo `Stop` sulla macchina aggiornata che tocca quel change. Il repo resta la
  verità; il server è una vista.
- [Header del certificato falsificabile se nginx non lo sovrascrive] → blocco nginx unico nel README;
  il default senza header chiude.
- [CSRF tramite certificato client] → header custom e JSON obbligatori (D5).
- [Script dentro un file `.md` di un repo o di un'idea] → `html: false`, schemi dei collegamenti
  ristretti, un solo punto che inserisce HTML, CSP senza script in linea, e un test con i casi della
  spec "Markdown senza codice eseguibile".
- [Copia dei change grande, per esempio specifiche lunghe] → limiti `max_file` e `max_openspec`; oltre,
  413 e la copia di quel progetto resta indietro, segnalato da `forgia status`.
- [Due macchine prendono la stessa idea insieme] → la presa è idempotente; la seconda riceve gli
  stessi file e `O_EXCL` evita sovrascritture.
- [Un abbandonato resta nel repo se nessuno archivia] → resta "da archiviare" nel contesto di ogni
  sessione di quel progetto finché qualcuno lo fa.
- [Dati di sviluppo di v1 persi] → accettato: nessuna installazione in produzione.

## Migration Plan

1. Server: `installa.sh` con il codice v2 (la `0002` svuota e ricrea le tabelle).
2. nginx: blocco di D15 con la CA dei certificati client; prova `GET /cantiere/` dal browser con il
   certificato (200) e senza (403).
3. Dalla dashboard: creare i committenti (PRIV, DGT, PENTAQO, CVSTUDIO...) e copiare i token.
4. Su ogni macchina: aggiornare il plugin, poi in ogni cartella di sorgenti `/cantiere collega
   <progetto> https://priv.progettazionisoftware.it/cantiere` con `FORGIA_TOKEN` del committente.
5. Rimuovere a mano la vecchia registrazione utente: `claude mcp remove forgia --scope user`.

Rollback: il plugin si spegne con `forgia off`; il server v1 si rimette con la sua copia del codice e
un database vuoto (la `0002` non è reversibile, e non c'è nulla di v1 da ritrovare).

## Open Questions

- Ordine dell'indice nella dashboard (per committente e progetto alfabetico, o per ultima attività):
  si decide guardando la pagina con i dati veri.
