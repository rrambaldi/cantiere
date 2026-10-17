# Design

## Context

Il plugin legge già `repo` e `branch` (`leggiGit` in `plugin/bin/forgia.mts`) e il server li tiene sulla sessione. Il contesto arriva a Claude con `session_start` e con il contesto pendente sui prompt. Il server ha già una `config` per risposta (`modalita_resoconto`, `soglia_strumenti`), un'eredità padre-figlio per i cantieri e una coda locale nel plugin. Vedi proposal.md per il perché.

## Goals / Non-Goals

**Goals:**
- Commit e issue legati al cantiere, visibili nella dashboard, senza nuovi segreti sul server.
- Messaggi di commit con titolo, spiegazione e `Refs`, imposti da regola e controllo.
- Tutto opzionale e a degradazione: senza token, senza git o senza forge il plugin lavora come oggi.

**Non-Goals:**
- PR, merge, chiusura del cantiere da git, GitLab, creazione di issue.
- Un hook `commit-msg` dentro il repo dell'utente.
- Chiamate al forge dal server.

## Decisions

**1. Le chiavi restano sul plugin (scelta B).**
Il server salva il nome della variabile (`token_env`), mai il valore, e valida il formato. Il plugin legge `process.env[token_env]` solo quando serve chiamare il forge. Alternativa scartata: token cifrato sul server, che lo renderebbe un deposito di chiavi di repo accanto ai dati dei clienti, con cifratura a riposo e rotazione da gestire.

**2. Il server non chiama il forge.**
Titoli e stato arrivano da un evento `issue` mandato dal plugin. Il server resta senza dipendenze di rete in uscita e senza credenziali. Costo: ogni macchina deve avere il token per vedere i titoli. Senza, la dashboard mostra solo il numero con il link.

**3. Link costruiti dall'URL del repo.**
GitHub e Gitea usano `/issues/N` e `/commit/<hash>`. Il campo `forge` serve solo al plugin per scegliere la forma dell'API (`/api/v3` o `/api/v1`), non ai link.

**4. Rilevare i commit con `git log` dall'ultimo hash visto.**
Il plugin tiene nel file di sessione l'ultimo `HEAD` visto e allo stop esegue `git log <ultimo>..HEAD --numstat`. Alternativa scartata: leggere i comandi `git commit` dal transcript, che perde i commit fatti da altri processi e dipende dal formato del transcript. Al primo stop senza ultimo hash si registra solo `HEAD` e non si manda nulla, per non importare la storia vecchia.

**5. Regola nel contesto più controllo `PreToolUse`.**
La regola da sola può essere dimenticata da Claude. Il controllo prima del commit dà la garanzia. Alternativa scartata: hook `commit-msg` di git, perché tocca il repo dell'utente e vale anche per i commit a mano. Il controllo lascia passare se non legge il messaggio (`-F`, editor, `--amend` senza `-m`): meglio un commit fuori regola che bloccare il lavoro.

**6. Piano come issue marcata, non come livello a parte.**
Una tabella di issue per cantiere con `numero` e `piano` (0/1, un solo 1 per cantiere, con indice parziale). Il `Refs` elenca tutte, il piano per primo, come deciso. Il piano serve alla dashboard (evidenza, avviso se manca) e non cambia le regole dei commit.

**7. Messaggi dei commit dietro un'opzione del server.**
`messaggi_commit` sta nella configurazione del server e viaggia nella `config` della risposta, come `modalita_resoconto`. Il plugin la rispetta e il server la fa rispettare anche in ricezione, scartando titolo e corpo se spenta. Il doppio controllo evita che un plugin vecchio o diverso mandi testo non voluto.

**8. Dati.**
Tre tabelle: `cantiere_repo` (cantiere, url, forge, api, token_env, principale), `cantiere_issue` (cantiere, numero, piano, titolo, stato, aggiornata_il) e `commit` (cantiere, hash, ts, file, aggiunte, tolte, sessione, branch, issue, titolo, corpo), con unicità su `(cantiere, hash)`. Migrazione `0003`. Il change `comandi-da-dashboard` ne prevede una con lo stesso numero: la seconda a essere scritta prende il numero seguente.

## Risks / Trade-offs

- [Il messaggio di commit può contenere dati dei clienti] → spento di default; l'utente ha dichiarato che il server gira sotto chiave SSH, ma l'opzione resta per scelta.
- [Il controllo prima del commit rifiuta un messaggio valido per un caso non previsto] → lascia passare se non capisce il formato, e il motivo del rifiuto dice cosa manca.
- [Chiamate al forge lente in un hook] → solo da hook asincroni o dallo stop con timeout corto, al più una volta ogni dieci minuti per issue; mai nell'hook sincrono del prompt.
- [Rate limit del forge] → la cache di dieci minuti e i soli numeri del cantiere tengono le chiamate poche.
- [Due macchine mandano lo stesso commit] → unicità su `(cantiere, hash)`.
- [Il repo della sessione cambia da una macchina all'altra (SSH contro HTTPS)] → `normalizzaRepo` già li porta alla stessa forma.

## Migration Plan

Migrazione additiva `0003`, senza toccare le tabelle esistenti. I plugin vecchi continuano a funzionare: non mandano `commit` né `issue`, e la dashboard mostra le sezioni git vuote. Rollback: le tabelle nuove si possono ignorare senza altri effetti. Il plugin nuovo con un server vecchio riceve 422 su `commit` e `issue`: gli eventi sono tra quelli che la coda scarta per sempre (rifiuto definitivo), e non bloccano il resto.
