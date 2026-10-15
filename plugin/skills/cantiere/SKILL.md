---
name: cantiere
description: Collega la cartella a un progetto di cantiere forgia, apre o prende un cantiere per questa sessione, mostra lo stato e configura il plugin.
argument-hint: "[[padre/]nome [--padre p] | prendi <percorso> | collega <progetto> [url] | stato | permessi | on | off]"
disable-model-invocation: true
allowed-tools: Bash(forgia *), mcp__forgia__apri_cantiere, mcp__forgia__elenca_cantieri, mcp__forgia__stato_sessione
---
Argomenti: $ARGUMENTS

Fai tutto in questo turno: i comandi `forgia` sono consentiti solo adesso. Non chiedere mai il token in chat.
Se un comando `forgia` fallisce dicendo che serve Node.js, rispondi in una riga che cantiere forgia richiede Node.js ≥ 22.18 e fermati.

1. Se nel contesto c'è `[forgia] Comando /cantiere gestito`, rispondi con una sola riga: la conferma, o il motivo del rifiuto che contiene. Basta.
2. `collega <progetto> [url]`: lancia `forgia collega "<progetto>"`, con `--url <url>` se c'è.
   - Se dice che il progetto non esiste: chiedi all'utente con una domanda a scelta se crearlo, mostrando i progetti esistenti che il messaggio elenca. Solo dopo un sì lancia `forgia collega "<progetto>" --crea` (con lo stesso `--url`). Con un no, dillo in una riga: la cartella resta non collegata.
   - Se riesce, riassumi in poche righe: cartella collegata a committente/progetto, tracciamento attivo in questa cartella, tool MCP dal prossimo avvio di Claude Code, `/cantiere permessi` per usarli senza conferme.
   - Se dice che manca il token, riporta le due strade che indica: impostare `FORGIA_TOKEN` e rilanciare, oppure il comando da terminale con il percorso intero.
3. `chiudi ...` o `server ...` (forme della versione 1): non lanciare nulla. Rispondi in poche righe: completato arriva da `openspec archive <change>`; sospeso e abbandonato si decidono dalla dashboard; per collegare la cartella si usa `/cantiere collega <progetto> <url>`.
4. Ogni altra forma: lancia prima `forgia status --json`. Se `in_area` è false rispondi solo, in una riga, di lanciare `/cantiere collega <progetto> <url>` con `FORGIA_TOKEN` impostata.
5. `prendi <percorso>`: lancia `forgia prendi "<percorso>" --session-id ${CLAUDE_SESSION_ID}`. Poi di' in poche righe quale change è nato, quanti file sono finiti in `openspec/changes/<change>/idee/` e come proseguire: partire da quei file con `/opsx:explore` oppure `/opsx:propose <change>`. Se il comando fallisce, riporta il motivo in una riga.
6. `permessi`: `forgia permetti-mcp`. `on` / `off`: `forgia on` / `forgia off`. `stato` o nessun argomento: riassumi `forgia status` (committente/progetto della cartella, server, token mascherato) e, se il tool c'è, `stato_sessione` (session_id `${CLAUDE_SESSION_ID}`): cantiere corrente o lavoro diretto, in poche righe. Se il server MCP dell'area non è registrato, si registra rifacendo `/cantiere collega <progetto>`.
7. `[padre/]<nome> [--padre <padre>]` senza la conferma del punto 1: usa il tool `apri_cantiere` (con `padre` se c'è `--padre`; un nome a percorso `padre/figlio` passa così com'è), con session_id `${CLAUDE_SESSION_ID}` e origine `utente`, se c'è; altrimenti `forgia apri "<nome>" [--padre <padre>] [--descrizione "<testo>"]`. Se il rifiuto dice che il cantiere è sospeso, rispondi in una riga che si riattiva dalla dashboard; se è un'idea, che si prende con `/cantiere prendi <percorso>`.
