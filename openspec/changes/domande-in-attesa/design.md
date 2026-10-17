# Design

## Context

Gli hook del plugin sono già asincroni dove non serve rispondere subito (`prompt_invio`, `todo`, `session_end`) e passano da una coda locale con eventi idempotenti. Il server tiene le sessioni, il loro stato e una pulizia periodica. La dashboard legge progetti e cantieri con i conteggi. Vedi proposal.md per il perché.

## Goals / Non-Goals

**Goals:**
- Mostrare nella dashboard, con un pallino rosso, che una sessione aspetta una risposta, e quale.
- Usare solo segnali deterministici di Claude Code, senza indovinare dal testo.

**Non-Goals:**
- Rispondere dal web: sta in `comandi-da-dashboard`.
- Notifiche fuori dalla dashboard (push, e-mail).
- Riconoscere le domande scritte nel testo della risposta.

## Decisions

**1. Tre segnali, in ordine di affidabilità.**
`PreToolUse` su `AskUserQuestion` dà testo e opzioni; `Notification` dà solo che la sessione aspetta (permesso o inattività); le domande nel testo si escludono. Alternativa scartata: leggere l'ultima riga di Claude allo `Stop` e cercare un punto interrogativo, che darebbe falsi pallini rossi e toglierebbe fiducia al segnale.

**2. L'`id` della domanda a scelta è l'id della chiamata del tool.**
`PreToolUse` e `PostToolUse` portano lo stesso `tool_use_id`, quindi la `risposta` si lega alla `domanda` senza stato nel plugin. Per le notifiche l'`id` è generato dal plugin e salvato nel file di sessione, per non mandarne due insieme.

**3. L'attesa generica si chiude con eventi che il server già riceve.**
Un `prompt`, uno `stop` o un `session_end` chiudono le domande `attesa` della sessione, e un `prompt` o un `session_end` chiudono anche quelle `scelta` rimaste aperte (per esempio se l'utente interrompe). Così non servono hook nuovi per la fine.

**4. Scadenza a 24 ore, come i comandi.**
Se la sessione muore senza `session_end` (rete, kill), la domanda non resta rossa per sempre: scade in lettura e la `pulizia` la toglie. Stessa durata di `comandi-da-dashboard`, che ha lo stesso problema in direzione opposta.

**5. Conteggio calcolato, non memorizzato.**
`domande_in_attesa` si calcola in lettura con una query sulle domande `in_attesa` non scadute, raggruppata per cantiere, e sale ai padri e al progetto sommando. Nessuna colonna da tenere allineata.

**6. Pallino aggiornato dal polling già presente.**
La dashboard rilegge i dati a intervalli; il pallino compare con il prossimo aggiornamento. Alternativa scartata: SSE o WebSocket, che per una cosa di pochi secondi di ritardo non vale un canale nuovo.

**7. Dati.**
Tabella `domande` (id, sessione, tipo, testo, opzioni come JSON, host, creata_il, stato `in_attesa`/`risposta`/`chiusa`, chiusa_il). Indice su `(sessione, stato)`. Migrazione dopo quelle già previste da `integrazione-git` e `comandi-da-dashboard`: ognuno prende il primo numero libero al momento di scriverla.

## Risks / Trade-offs

- [Pallino rosso fermo se arriva `domanda` ma non la chiusura] → scadenza a 24 ore; chiusura anche da `prompt` e `session_end`.
- [`Notification` scatta per eventi che non sono domande] → solo i tipi permesso e inattività; se un altro tipo compare, si ignora.
- [L'elenco dei tipi di evento è modificato anche da `integrazione-git`] → archiviare questo change dopo di quello, oppure tenere i due elenchi uguali; i test sulla validazione coprono tutti i tipi.
- [Testo della domanda lungo o con dati sensibili] → lunghezza massima come gli altri campi di testo; la riservatezza è garantita dal server dietro SSH, come deciso.
- [Plugin vecchio e server nuovo] → il plugin vecchio non manda `domanda`, quindi nessun pallino; nessuna rottura.

## Migration Plan

Migrazione additiva. Si rilascia prima il server, poi il plugin. Rollback del plugin: nessuna domanda arriva più. Rollback del server: il plugin nuovo riceve 422 su `domanda` e `risposta`, che la coda scarta come rifiuto definitivo senza bloccare il resto.
