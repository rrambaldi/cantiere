# Proposal

## Why

Oggi git è solo un'etichetta: il plugin legge `repo` e `branch` a ogni evento e la dashboard mostra il branch nella scheda della sessione. Il lavoro vero di un cantiere, cioè i commit e le issue che lo guidano, non compare nel giornale e non è legato al cantiere. I commit di Claude hanno messaggi di forma libera, spesso senza spiegazione e senza il riferimento alla issue.

## What Changes

- Ogni cantiere può avere una configurazione git: una lista di repo (uno principale), il forge (`github` o `gitea`), l'URL dell'API e il **nome** della variabile d'ambiente che contiene il token. Il cantiere figlio eredita dal padre. Senza configurazione vale il `repo` della sessione.
- Ogni cantiere può avere zero o più issue, per numero. Al massimo una è il **piano**, che riassume le altre. Si indicano da console con `/cantiere issue` e dalla dashboard.
- Il plugin manda al server i commit fatti in sessione: hash, data, numero di file e di righe, issue citate. Il titolo e il corpo del messaggio partono solo con l'opzione `messaggi_commit`, spenta di default.
- Il plugin dà a Claude la regola per i commit (titolo breve, riga vuota, spiegazione di 1-3 righe, `Refs` con tutte le issue del cantiere, il piano per primo) e controlla il formato prima del commit. Claude non scrive mai `Closes`.
- Con il token nella variabile d'ambiente il plugin legge titolo e stato delle issue dal forge e li manda al server. Il token non lascia mai la macchina.
- La dashboard mostra repo, issue (con link al forge) e commit nella scheda del cantiere, e permette di modificare repo e issue.

Fuori da questo change: PR, chiusura del cantiere dal merge, GitLab, creazione di issue dal cantiere.

## Capabilities

### New Capabilities
- `server/git`: configurazione dei repo di un cantiere, issue con piano, commit registrati e link al forge.
- `plugin/git`: lettura dei commit in sessione, regola e controllo del messaggio di commit, token solo sulla macchina, titoli e stato delle issue dal forge.

### Modified Capabilities
- `server/eventi`: nuovi tipi di evento `commit` e `issue`.
- `server/dashboard`: repo, issue e commit nella scheda del cantiere, con modifica.
- `plugin/comando-cantiere`: il comando `/cantiere issue`.

## Impact

- Server: migrazione del database (repo, issue, commit), validazione in `modelli.ts`, `dominio.ts`, rotte della dashboard, `config` nella risposta (`messaggi_commit`).
- Plugin: `plugin/bin/forgia.mts` (hook `stop`, `pre_commit`, comando `issue`), `plugin/hooks/hooks.json` (nuovo hook `PreToolUse` su `Bash`), skill `cantiere`.
- UI: `server/ui/src` (scheda del cantiere, testi in italiano e inglese).
- Nessuna dipendenza nuova: le chiamate al forge usano `fetch` di Node.
- Contratto: `docs/contratto-v2.md` e README di server e plugin.
