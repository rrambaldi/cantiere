---
name: cantiere
description: Collega la cartella a un progetto di cantiere forgia, apre o prende un cantiere per questa sessione, mostra lo stato e configura il plugin.
argument-hint: "[[padre/]nome [--padre p] | prendi <percorso>|#id | dirama <progetto>/<nome> [--task N] | fork <nome> --task N | cerca <parole> | leggi <percorso> [file] | collega <link> | collega <progetto> [url] | stato | permessi | on | off | comandi on|off]"
disable-model-invocation: true
allowed-tools: Bash(forgia *), mcp__plugin_forgia_forgia__apri_cantiere, mcp__plugin_forgia_forgia__elenca_cantieri, mcp__plugin_forgia_forgia__stato_sessione, mcp__forgia__apri_cantiere, mcp__forgia__elenca_cantieri, mcp__forgia__stato_sessione
---
Argomenti: $ARGUMENTS

Fai tutto in questo turno: i comandi `forgia` sono consentiti solo adesso. Non chiedere mai il token in chat.
Se un comando `forgia` fallisce dicendo che serve Node.js, rispondi in una riga che cantiere forgia richiede Node.js ≥ 20 e fermati.

1. Se nel contesto c'è `[forgia] Comando /cantiere gestito`, rispondi con una sola riga: la conferma, o il motivo del rifiuto che contiene. Basta, tranne per la conferma di un fork: dopo la riga scrivi il change come dice.
2. `collega <link>`, con un URL che contiene `/collega#` (il comando copiato dalla dashboard, senza token): lancia `forgia collega --link "<link>" --session-id ${CLAUDE_SESSION_ID}`.
   - Se dice che il link è del committente e serve il progetto: chiedi con una domanda a scelta tra i progetti che elenca (se non ci stanno tutti, scrivili nel testo: l'utente può dare il nome con «Altro») più «crea un progetto con il nome della cartella», poi rilancia con `"<progetto>"` prima di `--link` (e `--crea` se è quello nuovo).
   - Se riesce, riassumi come al punto 2a; se ha preso anche un cantiere, riassumi la presa come al punto 5. Se la presa fallisce la cartella resta collegata: riporta il motivo e `/cantiere prendi #<id>` per riprovare.
   - Ogni altro errore (link già usato o scaduto, progetto diverso da quello del link): riporta il motivo in una riga.
2a. `collega <progetto> [url]`: lancia `forgia collega "<progetto>"`, con `--url <url>` se c'è.
   - Se dice che il progetto non esiste: chiedi all'utente con una domanda a scelta se crearlo, mostrando i progetti esistenti che il messaggio elenca. Solo dopo un sì lancia `forgia collega "<progetto>" --crea` (con lo stesso `--url`). Con un no, dillo in una riga: la cartella resta non collegata.
   - Se riesce, riassumi in poche righe: cartella collegata a committente/progetto, tracciamento attivo in questa cartella, tool MCP già attivi (li dà il plugin, senza riavvio), file dei cantieri leggibili con `forgia cerca` / `forgia leggi`, `/cantiere permessi` per usare tool e lettura senza conferme.
   - Se dice che manca il token, riporta le due strade che indica: impostare `FORGIA_TOKEN` e rilanciare, oppure il comando da terminale con il percorso intero.
3. `chiudi ...` o `server ...` (forme della versione 1): non lanciare nulla. Rispondi in poche righe: completato arriva da `openspec archive <change>`; sospeso e abbandonato si decidono dalla dashboard; per collegare la cartella si usa `/cantiere collega <link>` con il link copiato dalla dashboard, o `/cantiere collega <progetto> <url>`.
4. Ogni altra forma: lancia prima `forgia status --json`. Se `in_area` è false rispondi solo, in una riga, di lanciare `/cantiere collega <link>` con il link copiato dalla dashboard, oppure `/cantiere collega <progetto> <url>` con `FORGIA_TOKEN` impostata.
5. `prendi <percorso>` (anche `prendi #<numero>`, il riferimento copiato dalla dashboard): lancia `forgia prendi "<percorso>" --session-id ${CLAUDE_SESSION_ID}`, con le virgolette. Poi di' in poche righe quale change è nato, quanti file sono finiti in `openspec/changes/<change>/idee/` e come proseguire: partire da quei file con `/opsx:explore` oppure `/opsx:propose <change>`. Se il comando fallisce, riporta il motivo in una riga.
5a. `fork <nome> --task N` senza la conferma del punto 1: non lanciare nulla. Rispondi in una riga che il fork non è partito. Se la conferma arriva più tardi, nel contesto di un prompt dopo, scrivi il change come dice.
5b. `dirama <progetto>/<nome> [--task N]`: lancia `forgia dirama "<progetto>/<nome>" [--task N] --session-id ${CLAUDE_SESSION_ID}`. Rispondi con una riga: la conferma che stampa, o il motivo del rifiuto.
5c. `cerca <parole>` / `leggi <percorso> [file]`: lancia `forgia cerca "<parole>"` / `forgia leggi "<percorso>" [file]`. Riporta i cantieri trovati, o riassumi i file letti; non prendere né aprire niente.
6. `permessi`: `forgia permetti-mcp`. `on` / `off`: `forgia on` / `forgia off`. `comandi on` / `comandi off`: `forgia comandi on|off`, poi riporta in una riga quel che stampa. `stato` o nessun argomento: riassumi `forgia status` (committente/progetto della cartella, server, token mascherato, comandi dalla dashboard accesi o spenti) e, se il tool c'è, `stato_sessione` (session_id `${CLAUDE_SESSION_ID}`): cantiere corrente o lavoro diretto, in poche righe.
7. `[padre/]<nome> [--padre <padre>]` senza la conferma del punto 1: usa il tool `apri_cantiere` (con `padre` se c'è `--padre`; un nome a percorso `padre/figlio` passa così com'è), con session_id `${CLAUDE_SESSION_ID}` e origine `utente`, se c'è; altrimenti `forgia apri "<nome>" [--padre <padre>] [--descrizione "<testo>"]`. Se il rifiuto dice che il cantiere è sospeso, rispondi in una riga che si riattiva dalla dashboard; se è un'idea, che si prende con `/cantiere prendi <percorso>`.
