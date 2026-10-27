## Context

`apri_cantiere` con `task` registra già il legame dal cantiere della sessione al cantiere nuovo (change `mappa-cantieri`, D2 e D5). Quando un cantiere smette di essere aperto, `cambiaStato` rimanda le sue sessioni al lavoro diretto con un avviso per il prompt dopo. La copia dei change arriva al server dall'hook `Stop` (asincrono), quindi l'archivio di un change chiude il cantiere alla fine del turno in cui Claude lo archivia.

## Decisions

### D1. Il ritorno sta sul legame
Colonna `legami.ritorno` (0/1). Un fork è un legame registrato con task, `session_id` e `ritorno = 1`. Alternativa scartata: una colonna sulla sessione con il cantiere a cui tornare, che regge un livello solo; sul legame la pila viene da sé (P → F, F → G: chiuso G si torna a F, chiuso F a P).

### D2. Condizioni del fork
`apri_cantiere` con `fork: true` richiede: la sessione sta in un cantiere aperto (la partenza), `task` presente, nome di un cantiere che non esiste ancora nello stesso progetto. Ognuna che manca dà 409 con il motivo, e niente viene creato. Il task si controlla sul `tasks.md` della copia della partenza, se c'è: un numero che non c'è dà 409 (un errore di battitura costerebbe un ritorno al task sbagliato). Senza copia il task resta com'è scritto. Il fork sta nello stesso progetto: la sessione lavora nella cartella del suo progetto.

### D3. Chi torna
Quando F smette di essere aperto, ogni sessione ancora in F che ha un legame P → F con `ritorno = 1` e il proprio `session_id` torna in P, se P è aperto, con origine `utente` e un avviso: «il fork F è <stato>: sei di nuovo in P, riprendi dal task N "<testo>"». Le altre sessioni in F, o tutte se P non è più aperto, vanno al lavoro diretto come oggi.

### D4. Saperlo subito
Il corpo di `PUT /api/v1/progetti/<p>/openspec` accetta `session_id` (facoltativo). Se quella sessione ha un avviso in sospeso dopo la copia, la risposta lo porta in `contesto` con il `cantiere` della sessione, e il server lo toglie: non si ripete al prompt dopo. Il plugin lo mette nel contesto pendente e aggiorna il cantiere locale, quindi anche il titolo. Senza `session_id` la risposta resta com'è.

### D5. Contesto del fork
La conferma del fork nomina la partenza, il task col suo testo e il change da scrivere: «scrivi openspec/changes/<change>/ con proposal.md e tasks.md a partire da questo task, come /opsx:propose, poi lavoraci; quando lo archivi la sessione torna a P, task N». Il change resta piccolo: niente design né spec se il task non li chiede.

### D6. Comando nel plugin
`/cantiere fork <nome> --task <N> [— descrizione]` lo gestisce l'hook del prompt, sincrono come `/cantiere <nome>`, con `{ nome, descrizione, origine: "utente", padre: null, task, fork: true }`. Senza `--task` non manda niente e risponde con l'uso del comando.

## Risks / Trade-offs

- [Archivio in un'altra sessione] Se F lo archivia un'altra sessione, la sessione del fork torna a P all'evento successivo senza saperlo dalla copia: l'avviso arriva al suo prompt dopo, come oggi per un cantiere chiuso.
- [Migrazione dopo un'altra] `0006` è del change `comandi-da-dashboard`: questa è `0007` e va committata dopo.
