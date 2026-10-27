# Tasks

## 1. Server

- [x] 1.1 Migrazione `0007_ritorno.ts` (`legami.ritorno`, 0 per i legami che ci sono) e tipi in `db.ts`
- [x] 1.2 `apri_cantiere` con `fork`: controlli (cantiere aperto della sessione, task, nome nuovo, entro 5 minuti dal comando), legame con il ritorno, conferma con il testo del task dal `tasks.md` copiato o l'avviso che non c'è (`modelli.ts`, `dominio.ts`, `contesto.ts`)
- [x] 1.3 Ritorno in `cambiaStato`: la sessione del fork torna alla partenza aperta con l'avviso; le altre al lavoro diretto
- [x] 1.4 `?session_id=` nella copia dei change e avviso nella risposta, che resta anche per il prompt dopo (`app.ts`, `openspec.ts`)
- [x] 1.5 Contratto v2 e test: fork, rifiuti, ritorno da archivio, fork dentro un fork, partenza chiusa, altra sessione, risposta della copia

## 2. Plugin

- [x] 2.1 `/cantiere fork <nome> --task <N> [— descrizione]` nell'hook del prompt; senza `--task` l'uso del comando
- [x] 2.2 `session_id` nella copia; contesto e cantiere della risposta nella sessione locale, senza ripeterlo quando torna con il prompt; il contesto in attesa prima della risposta a un `/cantiere`
- [x] 2.3 `SKILL.md`, `README.md` e test

## 3. Verifica

- [x] 3.1 Server locale e hook veri: fork da un task, archivio del change, ritorno al prompt dopo con il titolo aggiornato; il fork sta sotto la partenza nei «Binari»
