---
name: cantiere
description: Dichiara, chiude o mostra il cantiere di questa sessione per cantiere forgia, e configura il plugin.
argument-hint: "[[padre/]nome [--padre p] | chiudi [-f] [esito] | stato | server <url> [nome] | permessi | on | off]"
disable-model-invocation: true
allowed-tools: Bash(forgia *), mcp__forgia__apri_cantiere, mcp__forgia__chiudi_cantiere, mcp__forgia__stato_sessione
---
Argomenti: $ARGUMENTS

Fai tutto in questo turno: i comandi `forgia` sono consentiti solo adesso. Non chiedere mai il token in chat.
Se un comando `forgia` fallisce dicendo che serve Node.js, rispondi in una riga che cantiere forgia richiede Node.js ≥ 22.18 e fermati.

1. Se nel contesto c'è `[forgia] Comando /cantiere gestito`, rispondi con una sola riga di conferma e basta.
2. `server <url> [nome] [— descrizione]`: lancia `forgia setup --url <url>`. Se il setup riesce e c'è un nome, lancia `forgia apri "<nome>"` (con `--descrizione "<testo>"` se dopo il nome c'è `—` o `--`). Riassumi l'esito in poche righe: tracciamento attivo, tool MCP dal prossimo avvio di Claude Code, `/cantiere permessi` per usarli senza conferme. Se il setup dice che manca il token, riporta le due strade che indica, con il percorso intero.
3. Ogni altra forma: lancia prima `forgia status --json`. Se `configurato` è false rispondi solo, in una riga, di lanciare `/cantiere server <url>` seguito dal nome degli argomenti se c'è, con `FORGIA_TOKEN` impostata.
4. `permessi`: `forgia permetti-mcp`. `on` / `off`: `forgia on` / `forgia off`. `stato` o nessun argomento: riassumi `forgia status` e, se il tool c'è, `stato_sessione` (session_id `${CLAUDE_SESSION_ID}`), in poche righe. Se `mcp_registrato_il` è null, il server MCP si registra rifacendo `/cantiere server <url>`.
5. `[padre/]<nome> [--padre <padre>]` o `chiudi [-f|--force] [esito] [nota]` senza la conferma del punto 1: usa i tool `apri_cantiere` (con `padre` se c'è `--padre`; un nome a percorso `padre/figlio` passa così com'è) / `chiudi_cantiere` (`forza: true` solo se l'utente ha scritto `-f` o `--force`), con session_id `${CLAUDE_SESSION_ID}` e origine `utente`, se ci sono; altrimenti `forgia apri "<nome>" [--padre <padre>] [--descrizione "<testo>"]` o `forgia chiudi [--esito <esito>] [--nota "<nota>"] [-f]`. Se il rifiuto dice che il cantiere ha figli aperti, rispondi in una riga con i loro nomi e che `/cantiere chiudi -f` chiude anche quelli.
