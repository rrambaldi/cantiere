## Why

Lavorando a un task capita di dover fare prima un'altra cosa, con un piano suo. Oggi ci sono due strade, e nessuna torna indietro: `/cantiere <nome>` sposta la sessione nel cantiere nuovo e la lascia lì; `/cantiere dirama` fa nascere un'idea ma la sessione resta dov'era. Chiuso il lavoro di mezzo, tocca all'utente ricordare da quale cantiere e da quale task ripartire.

Nasce da `mappa-cantieri`: il legame con il task c'è già (`legami`, `nato_da`, i rami nei «Binari»), manca il ritorno.

## What Changes

- Nuovo comando `/cantiere fork <nome> --task <N> [— descrizione]`: dal cantiere della sessione nasce un cantiere nuovo, legato al task N, e la sessione ci entra. Il contesto dice a Claude di scrivere un change piccolo (proposal e tasks) dal testo del task, come `/opsx:propose`.
- Il legame del fork porta il ritorno: quando il fork smette di essere aperto (archiviato, sospeso, abbandonato), la sessione che l'ha aperto torna da sola al cantiere di partenza e Claude riprende dal task N. Un fork dentro un fork torna un livello alla volta.
- La copia dei change (`PUT /openspec?session_id=`) dice chi la manda: la risposta dice a quella sessione dove è tornata, così lo sa già al prompt dopo.
- Nei «Binari» e in «Task e rami» il fork è un ramo come gli altri, accanto al suo task.

## Impact

- Server: migrazione `0007_ritorno.ts` (colonna `legami.ritorno`), `db.ts`, `modelli.ts`, `dominio.ts`, `openspec.ts`, `app.ts`, `contesto.ts`; `docs/contratto-v2.md`.
- Plugin: `plugin/bin/forgia.mts` (riconoscimento di `/cantiere fork`, `session_id` nella copia), `plugin/skills/cantiere/SKILL.md`, `plugin/README.md`.
- Spec `server/cantieri`, `plugin/comando-cantiere`.
