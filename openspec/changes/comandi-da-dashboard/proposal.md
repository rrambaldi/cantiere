## Why

Oggi il flusso è a senso unico: la sessione di Claude Code manda stato al server e la dashboard lo mostra, ma
da lì non si può dire niente alla sessione. Chi guarda la dashboard e vede una sessione ferma o fuori strada
deve tornare al terminale. Serve un modo per mandare una riga di istruzioni dalla dashboard alla sessione.

## What Changes

- La dashboard permette di scrivere un comando di testo (massimo 500 caratteri) per una sessione non chiusa.
- Il server tiene i comandi in una coda per sessione e li mette nella risposta agli eventi della sessione,
  una sola volta, solo se il plugin ha dichiarato di accettarli.
- Il plugin, se l'area è abilitata ai comandi, consegna il comando a Claude: all'evento `stop` bloccando la
  chiusura con il comando come motivo (Claude lo esegue e continua), agli altri eventi come contesto del
  prossimo prompt.
- L'abilitazione è per area, spenta di default (`/cantiere comandi on|off`).
- Un comando non consegnato entro 24 ore scade; finché non è consegnato si può annullare.
- Il testo di un comando è sempre presentato a Claude come arrivato dalla dashboard, non come scritto
  dall'utente in sessione.
- Contratto v2: campo opzionale `comandi` nella richiesta di evento e nella risposta (compatibile, il client
  ignora i campi che non conosce).

Fuori da questo change: svegliare una sessione ferma (nessun hook scatta finché non succede qualcosa),
canali push (Channels di Claude Code), un demone locale, comandi liberi da altri client che non siano la
dashboard.

## Capabilities

### New Capabilities
- `server/comandi`: coda dei comandi per sessione, scrittura e annullamento dalla dashboard, consegna nella
  risposta agli eventi, scadenza.
- `plugin/comandi`: abilitazione per area e consegna del comando a Claude a `stop` e a `prompt`.

### Modified Capabilities

(nessuna: la risposta di `/api/v1/eventi` guadagna un campo opzionale, descritto nella nuova spec
`server/comandi` e nel Contratto v2)

## Impact

- `server/src`: nuova migrazione `0003` (tabella `comandi`), `dominio.ts` (consegna nella risposta agli
  eventi), `modelli.ts` (validazione del campo `comandi`), `ui.ts` e `server/ui/src` (campo e lista nella
  scheda della sessione), pulizia dei comandi scaduti.
- `plugin/bin/forgia.mts` e `forgia.mjs` compilato: invio di `comandi: true`, consegna a `stop` e `prompt`,
  comando `/cantiere comandi`; versione del plugin.
- `docs/contratto-v2.md`, README di server e plugin.
- Sicurezza: la dashboard diventa un canale che scrive prompt su una macchina con accesso al codice. Lo
  limitano l'abilitazione per area (spenta di default), il certificato client della dashboard e l'etichetta
  sul testo consegnato.
