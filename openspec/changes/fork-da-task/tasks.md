# Tasks

## 1. Server

- [ ] 1.1 Migrazione `0007_ritorno.ts` (`legami.ritorno`, 0 per i legami che ci sono) e tipi in `db.ts`
- [ ] 1.2 `apri_cantiere` con `fork`: controlli (cantiere aperto della sessione, task, nome nuovo, task nel `tasks.md` copiato), legame con il ritorno, conferma con il testo del task (`modelli.ts`, `dominio.ts`, `contesto.ts`)
- [ ] 1.3 Ritorno in `cambiaStato`: la sessione del fork torna alla partenza aperta con l'avviso; le altre al lavoro diretto
- [ ] 1.4 `session_id` nella copia dei change e avviso nella risposta, tolto dalla sessione (`openspec.ts`)
- [ ] 1.5 Contratto v2 e test: fork, rifiuti, ritorno da archivio, fork dentro un fork, partenza chiusa, altra sessione, risposta della copia

## 2. Plugin

- [ ] 2.1 `/cantiere fork <nome> --task <N> [— descrizione]` nell'hook del prompt; senza `--task` l'uso del comando
- [ ] 2.2 `session_id` nella copia; contesto e cantiere della risposta nella sessione locale
- [ ] 2.3 `SKILL.md`, `README.md` e test

## 3. Verifica

- [ ] 3.1 Server locale e hook veri: fork da un task, archivio del change, ritorno al prompt dopo con il titolo aggiornato; il fork sta sotto la partenza nei «Binari»
