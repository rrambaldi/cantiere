# Tasks

Stesse regole di v1: TypeScript eseguito da Node ≥ 22.18, `npm test` = `tsc --noEmit` + `node --test`.
Server e plugin cambiano insieme (D1).

## 1. Verifiche prima del codice

- [x] 1.1 Registrazione MCP per cartella: in una cartella di prova con un sottocartella, `claude mcp add --scope local --transport http prova http://127.0.0.1:9/mcp` dalla radice, poi `claude mcp list` lanciato dalla radice e dalla sottocartella; annotare in design.md (Risks) se la sottocartella vede il server, e se serve la registrazione extra al `SessionStart`; poi `claude mcp remove prova` e cancellare la cartella; verifica: nota scritta nel design e `claude mcp list` senza `prova`.
- [x] 1.2 Titolo della sessione: su un transcript reale di questa macchina, controllare che `custom-title` (dopo `/rename`) e `ai-title` abbiano i campi `customTitle` e `aiTitle` e in che ordine compaiono; salvare transcript di prova ridotti e anonimi in `plugin/test/dati/titoli.jsonl` (custom ripetuto e ai successivo: vince custom) e `titoli-solo-ai.jsonl`; verifica: i file contengono solo righe di titolo e messaggi finti, nessun testo reale.
- [x] 1.3 React e markdown-it per la dashboard: aggiungere `react` e `react-dom` 18.3.1, `markdown-it` 14 e `@types/react`, `@types/react-dom`, `@types/markdown-it` (sviluppo) al workspace del server, controllare che `node_modules/react/umd/react.production.min.js`, `react-dom/umd/react-dom.production.min.js` e `markdown-it/dist/markdown-it.min.js` esistano e che `tsc` compili un `.tsx` di prova con `jsx: "react"` verso `React.createElement` globale; verifica: file di prova compilato e poi cancellato, `npm ci` pulito.

## 2. Contratto v2

- [x] 2.1 Scrivere `docs/contratto-v2.md` dalle specs di questo change: salute, eventi (campo `progetto`, sei tipi, `titolo` in `stop` e `session_end`, forma della risposta), `GET/POST /api/v1/progetti`, `PUT /api/v1/progetti/<p>/openspec`, `POST .../cantieri/<percorso>/prendi`, letture, i quattro tool MCP, regole su cantieri, stati ed errori; in testa a `docs/contratto-v1.md` una riga che rimanda a v2; verifica: ogni endpoint e campo citato nelle specs compare nel contratto (controllo con `grep` dei nomi).

## 3. Server: schema, ambito, committenti e progetti

- [x] 3.1 Migrazione `0002` con le tabelle di D2 (e indici unici su `nome_chiave`, `token_hash`, `(committente_id, slug)`, `(progetto_id, percorso_slug)`, `(progetto_id, change)`), tipi Kysely aggiornati; verifica: test su database vuoto (0001 + 0002 applicate) e su database v1 con dati (tabelle v1 eliminate, nuove vuote), seconda esecuzione senza effetti.
- [x] 3.2 `slug` e nomi (D4): slug dei segmenti, nome del change dal percorso, validazione dei nomi di committente con i riservati in una costante accanto alle rotte; verifica: test sugli esempi delle specs (`iDOC converter/Pre-prod` → `idoc-converter-pre-prod`, `tassi BCE,BoJ,SNB` → `tassi-bce-boj-snb`, `API` rifiutato, `PRIV/test` rifiutato, vuoto → errore) e confronto con la regola kebab di OpenSpec.
- [x] 3.3 `Ambito` e helper `progettiDi`/`cantieriDi`/`sessioniDi` (D3) più test di architettura che fallisce se il dominio interroga quelle tabelle senza helper; verifica: il test passa, e fallisce su un file di prova con `db.selectFrom("cantieri")` nudo (poi cancellato).
- [x] 3.4 Committenti nel dominio: creazione con token (hash, una volta sola), rigenerazione che revoca il precedente, elenco senza token; verifica: test della spec `server/committenti` (nome con maiuscole diverse, riservati, rigenerazione → 401 sul vecchio).
- [x] 3.5 Progetti nel dominio: creazione esplicita, unicità per committente, elenco con conteggi per stato; verifica: test della spec `server/progetti` (stesso nome in due committenti, `Poker` contro `poker`, conteggi).

## 4. Server: accesso e CLI

- [x] 4.1 Filtro di accesso: Bearer risolto nel committente e passato come `Ambito`, rate limit per committente, limiti di corpo per rotta (`max_body`, `max_openspec`, `max_file`), `salute` con `versione_contratto: 2` e nome del committente, log con committente e senza testi; verifica: test della spec `server/accesso` (401, 413 a 65 KB su eventi e copia da 300 KB accettata, 429, log senza contenuti della copia).
- [x] 4.2 Configurazione: via `hint_max`, nuove chiavi `max_openspec`, `max_file`, `max_file_idea`, `ui_header_certificato`, `ui_certificato` con avviso all'avvio se `off`; `deploy/forgia.env.example` aggiornato; verifica: test di config (default, override, `ui_certificato` non valido ferma l'avvio).
- [x] 4.3 `forgia-admin committente crea|elenca|rigenera`, `forgia-admin progetti`, tabelle `sessioni` e `cantieri` con le colonne nuove; via `token crea|elenca|revoca`; verifica: test di `admin.test.ts` aggiornati (token stampato una volta, `committente crea priv` con `PRIV` esistente fallisce, rigenera → 401 sul vecchio).

## 5. Server: eventi, sessioni e cantieri

- [x] 5.1 Schemi zod v2 degli eventi: campo `progetto`, sei tipi, `titolo` in `stop` e `session_end`, niente `chiudi_cantiere`; verifica: test 422 per `chiudi_cantiere`, `progetto` mancante, `origine: "dashboard"`, titolo troppo lungo.
- [x] 5.2 Sessioni nel dominio: creata al volo con committente e progetto, progetto inesistente → 422 senza creare nulla, cambio di progetto → lavoro diretto, titolo conservato (ultimo non null), transizioni e fuori ordine come v1; verifica: test della spec `server/eventi` e dei relativi scenari di `server/progetti`.
- [x] 5.3 `apri_cantiere` v2: percorso dal primo livello del progetto, nomi unici tra fratelli, antenati creati `aperto` (un'idea antenata passa ad `aperto`), nome di change e conflitto 409, precedenza `utente` > `claude`, rifiuti per sospeso, chiuso e idea; verifica: test della spec `server/cantieri` (tutti gli scenari di apertura, percorso e precedenza).
- [x] 5.4 Stati ed esiti (D11): sospendi, riattiva, abbandona (con discendenti), storico in `esiti`, transizioni vietate → 409, sessioni rimandate al lavoro diretto con `avviso`; verifica: test degli scenari "Stati del cantiere", "Esiti decisi dalla dashboard", "Abbandono di un padre", "Sessioni di un cantiere non più aperto".
- [x] 5.5 Risposta degli eventi: `progetto`, `cantiere` con `percorso`, `stato`, `change` (null nel lavoro diretto), `config`; verifica: test REST della forma della risposta e dell'idempotenza su `evento_id` con i campi nuovi.

## 6. Server: contesto

- [x] 6.1 `contesto.ts` v2: contesto di avvio (progetto, cantiere o lavoro diretto, cantieri aperti e idee al massimo 10 con `e altri <n>`, da archiviare, regole condizionate, niente `Regole:` vuota), avviso sul primo `prompt` dopo un esito, conferma dell'apertura da comando; verifica: test sui testi esatti della spec `server/contesto`, compresi `resume` senza domanda iniziale e modalità `off`.

## 7. Server: copia dei change e idee

- [x] 7.1 `PUT /api/v1/progetti/<p>/openspec`: validazione dei percorsi ammessi (422 per `..`, assoluti, estensioni fuori elenco), limiti, sostituzione per `modificato_il`, archiviato definitivo, cantiere nato con origine `repo`, completato dall'archivio (abbandonato resta), avanzamento dei task, fasi del change quadro, change mancante, da archiviare; verifica: test di tutti gli scenari della spec `server/openspec`.
- [x] 7.2 `GET/POST /api/v1/progetti`; verifica: test di creazione, elenco e rifiuto del nome già usato con il token di un altro committente che non vede nulla.
- [x] 7.3 Idee nel dominio: creazione sotto progetto o cantiere, file `.md`/`.txt` UTF-8 con limiti `max_file` e `max_file_idea`, modifica solo in stato `idea`; `POST .../cantieri/<percorso>/prendi` con presa idempotente e 409 sui chiusi; verifica: test della spec `server/idee`.
- [x] 7.4 Letture `GET /api/v1/cantieri` e `/sessioni` ristrette al committente, filtri `progetto`, `aperti`, `attive`, con change, avanzamento, idee e titolo; verifica: test della spec `server/amministrazione` (API di lettura) e test di separazione con due committenti.

## 8. Server: tool MCP

- [x] 8.1 Quattro tool con il parametro `progetto` (D13), `elenca_cantieri` con progetto e stati, `stato_sessione` con progetto e change, rifiuti `ok: false` per sospesi, idee, nomi presi e progetto mancante, descrizioni in italiano aggiornate; via `chiudi_cantiere`; verifica: test MCP sui due protocolli come v1 (elenco dei quattro tool, claude.ai senza progetto, idea via MCP, descrizioni) e test di separazione tra committenti.

## 9. Server: dashboard, API e rotte

- [x] 9.1 Rotte della UI (D5): controllo dell'header del certificato, Bearer rifiutato, JSON con `X-Forgia-UI: 1` obbligatorio sulle scritture, controllo di `Origin`, redirect relativo da `/<committente>/` a `../<committente>`, 404 per committente inesistente e percorsi più profondi, file statici con tipi e `Content-Security-Policy`; verifica: test della spec `server/dashboard` (403 senza header, con `NONE`, con Bearer; 200 con `SUCCESS`; `/priv` uguale a `/PRIV`; `/PRIV/mercurius` → 404; scrittura senza header custom rifiutata).
- [x] 9.2 API JSON della UI sotto `/ui/api/`: albero committenti → progetti → cantieri (con ambito ristretto per `/<committente>`), giornale dei turni, copia del change, todo delle sessioni attive, attività non censite, crea committente e rigenera token, crea progetto, crea e modifica idea, carica e togli file, sospendi, riattiva, abbandona (con elenco dei discendenti per la conferma); verifica: test di ogni rotta, compreso il token mostrato una volta sola.
- [x] 9.3 Pagina: porting in TSX dei componenti del design system usati (Logo, Tabs, StatoBadge, Nastro, Checkbox, Button, Dialog, Toast) sotto `server/ui/src/ds/`, token e font in `server/ui/static/`, React da `node_modules` sotto `/ui/vendor/` (D6); verifica: `tsc` compila in `server/ui/dist/` e un test confronta la ricompilazione con i file committati.
- [x] 9.4 Markdown (D6): renderer con markdown-it (`html: false`, `validateLink` ristretto a `http`/`https`/`mailto`, caselle dei task disabilitate, collegamenti in scheda nuova), `markdown.css` dai token del design system, `.txt` in `pre-wrap`; verifica: test che rende i casi della spec `server/dashboard` ("Markdown formattato" e "Markdown senza codice eseguibile": tabella, codice, caselle, `<script>`, `<img onerror>`, `javascript:`) e controlla l'HTML prodotto, più prova nel browser con `proposal.md` e `design.md` di questo change.
- [x] 9.5 Viste: indice (committenti → progetti → cantieri con stato e avanzamento, schede aperti/idee/chiusi), giornale dei turni, scheda tecnica (artefatti del change e file delle idee formattati, task e fasi, todo in sola lettura, esiti con conferma), attività non censite del progetto, vista ristretta senza creazione di committenti; verifica: prova nel browser contro il server locale con dati di prova (committente, progetto, idea con 2 file, cantiere con copia del change, sessione in lavoro diretto), screenshot di ogni vista.
- [x] 9.6 Azioni: creazione di committente con token mostrato una volta, progetto, idea con file trascinati, sospendi/riattiva/abbandona con dialogo; verifica: prova nel browser di ogni azione e controllo del risultato via `GET /api/v1/cantieri` con il token del committente.

## 10. Plugin

- [x] 10.1 Configurazione ad aree (D7): `aree` in `config.json` 0600, config v1 letta come nessuna area, ricerca dell'area per segmenti su `realpath`, `FORGIA_URL`/`FORGIA_TOKEN` solo per `collega`; verifica: test delle specs `plugin/aree` (aree annidate, fuori area nessun evento) e `plugin/configurazione` (token da ambiente in un'altra area).
- [x] 10.2 `forgia collega <progetto> [--url] [--token-stdin] [--crea]`: verifica https, `salute` v2, controllo del progetto con elenco dei progetti se manca, creazione solo con `--crea`, radice git o cwd, `claude mcp add --scope local` dalla cartella dell'area, stampa a mano senza `claude`; verifica: test con server finto e `claude` finto nel PATH (comando registrato con `--scope local` e la cwd giusta).
- [x] 10.3 Eventi v2: campo `progetto`, niente `chiudi_cantiere`, coda con la cartella dell'area e senza token, invio con URL e token dell'area, eventi di aree cancellate scartati; `forgia status` con area e aree; avviso giornaliero solo senza aree; verifica: test della coda con due aree e dei campi dell'evento.
- [x] 10.4 Titolo dal transcript (D12) su `stop` e `session_end`; verifica: test con `plugin/test/dati/titoli.jsonl` (custom vince su ai, solo ai, transcript assente → null).
- [x] 10.5 Copia dei change (D8): lettura dei change attivi e archiviati, file ammessi, `modificato_il`, hash in cache, invio staccato allo `Stop`; verifica: test su una cartella `openspec/` di prova (task spuntato → invio; nulla cambiato → nessun invio; `.env` e `src/` mai inclusi; server giù → exit 0).
- [x] 10.6 `forgia prendi <percorso>` (D9): controllo di `openspec`, presa, `openspec new change`, file in `idee/` con `O_EXCL`; verifica: test con server finto e `openspec` finto nel PATH (file esistente non sovrascritto, `openspec` assente → nessuna chiamata al server).
- [x] 10.7 Comando `/cantiere`: forme nuove (`prendi`, `collega`, percorso), parole riservate (`chiudi` e `server` spiegati), suggerimento degli argomenti, strumenti consentiti, domanda "lo creo?" prima di `--crea`, riga per cartella non collegata; `plugin/skills/cantiere/SKILL.md` e `plugin/README.md` aggiornati; verifica: test del riconoscimento della spec `plugin/comando-cantiere` e rilettura dello SKILL.md contro i suoi scenari.
- [x] 10.8 Ricompilare `plugin/bin/forgia.mjs`; verifica: il test che confronta sorgente e compilato passa, `npm test` del plugin verde.

## 11. Deploy e documentazione

- [x] 11.1 `server/README.md`: committenti dalla dashboard o da `forgia-admin committente crea`, blocco nginx di D15 con certificato e header, nota sul `proxy_set_header` nelle `location`, prova con e senza certificato; `deploy/Caddyfile` aggiornato o tolto; README alla radice con il nuovo flusso (committente → `/cantiere collega` → avvio); verifica: ogni comando e percorso citato esiste, e il blocco nginx passa `nginx -t` in una configurazione di prova se nginx è disponibile, altrimenti si dice che non è stato provato.
- [x] 11.2 `installa.sh`: controllare che copi `server/ui/` e che il servizio parta con la `0002`; aggiornare il messaggio finale (token dalla dashboard, non più `--cliente`) e togliere `--cliente` oppure farlo diventare `--committente`; verifica: lo script nella prova con i comandi finti come per v1, fino alla dashboard che risponde 200 con l'header e 403 senza.
- [x] 11.3 `server/scripts/smoke.sh` v2: committente e progetto di prova, sessione in lavoro diretto, apertura di un cantiere, copia dei change, presa di un'idea, letture ristrette; verifica: lo smoke passa contro il server locale.

## 12. Integrazione

- [x] 12.1 Prova end-to-end in locale: server v2, plugin v2 collegato a una cartella di prova con `openspec/`, idea creata dalla dashboard, `/cantiere prendi`, task spuntato, `Stop`, avanzamento visibile nella dashboard, archivio → completato, abbandono dalla dashboard → contesto "da archiviare" nella sessione dopo; verifica: ogni passo osservato nella dashboard e nelle risposte del server, annotato nel resoconto finale.
- [x] 12.2 `openspec validate forgia-v2 --strict` e `npm test` in server e plugin; verifica: tutto verde.

## Workflow follow-up

- Archiviare il change dopo la revisione: `openspec archive forgia-v2`.
- Messa in servizio su `priv.progettazionisoftware.it` secondo il Migration Plan del design.
