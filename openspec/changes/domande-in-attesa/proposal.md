# Proposal

## Why

Quando Claude Code fa una domanda all'utente, la sessione si ferma finché qualcuno non risponde. Chi guarda la dashboard non lo sa: il cantiere sembra fermo senza un motivo, e la domanda si scopre solo tornando al terminale. Una domanda in attesa è la cosa più urgente che una sessione può avere, e oggi è l'unica che il web non mostra.

## What Changes

- Il plugin manda al server una domanda quando Claude usa `AskUserQuestion` (testo e opzioni) e quando la sessione resta ferma in attesa (hook `Notification`). Manda anche la fine dell'attesa: la risposta, un nuovo prompt, la fine della sessione.
- Il server tiene le domande in attesa per sessione, le chiude da solo dopo 24 ore e le riporta nelle letture.
- La dashboard mostra un pallino rosso sul cantiere e sul progetto che lo contiene, con il numero se sono più di una, e nella scheda del cantiere un riquadro "In attesa di risposta" con la domanda, le opzioni, la sessione, la macchina e da quanto tempo aspetta.
- La domanda parte per intero: il server gira dietro SSH e l'utente ha escluso il problema della riservatezza.
- Solo lettura: la risposta dal web non è in questo change, sta in `comandi-da-dashboard`.

Fuori da questo change: rispondere dal web, domande scritte nel testo della risposta di Claude (non si riconoscono in modo affidabile), notifiche fuori dalla dashboard.

## Capabilities

### New Capabilities
- `server/domande`: domande in attesa per sessione, scadenza, chiusura e lettura.
- `plugin/domande`: riconoscimento della domanda e della fine dell'attesa dagli hook di Claude Code.

### Modified Capabilities
- `server/eventi`: nuovi tipi di evento `domanda` e `risposta`.
- `server/dashboard`: pallino rosso e riquadro delle domande in attesa.

## Impact

- Server: migrazione del database (tabella `domande`), validazione in `modelli.ts`, `dominio.ts`, letture dei progetti e dei cantieri con il conteggio.
- Plugin: `plugin/bin/forgia.mts` (hook `domanda`, `risposta`), `plugin/hooks/hooks.json` (`PreToolUse` e `PostToolUse` con matcher `AskUserQuestion`, `Notification`).
- UI: `server/ui/src` (indice, scheda del cantiere, testi in italiano e inglese).
- Contratto: `docs/contratto-v2.md` e README di server e plugin.
- Dipendenza: l'elenco dei tipi di evento in `server/eventi` è modificato anche da `integrazione-git`. Va archiviato dopo di lui, oppure i due elenchi vanno tenuti uguali.
