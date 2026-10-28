## Context

`apri_cantiere` con `task` registra già il legame dal cantiere della sessione al cantiere nuovo (change `mappa-cantieri`, D2 e D5). Quando un cantiere smette di essere aperto, `cambiaStato` rimanda le sue sessioni al lavoro diretto con un avviso per il prompt dopo. La copia dei change arriva al server dall'hook `Stop` (asincrono), quindi l'archivio di un change chiude il cantiere alla fine del turno in cui Claude lo archivia.

## Decisions

### D1. Il ritorno sta sul legame
Colonna `legami.ritorno` (0/1). Un fork è un legame registrato con task, `session_id` e `ritorno = 1`. Alternativa scartata: una colonna sulla sessione con il cantiere a cui tornare, che regge un livello solo; sul legame la pila viene da sé (P → F, F → G: chiuso G si torna a F, chiuso F a P).

### D2. Condizioni del fork
`apri_cantiere` con `fork: true` richiede: la sessione sta in un cantiere aperto (la partenza), `task` presente, nome di un cantiere che non esiste ancora nello stesso progetto. Ognuna che manca dà 409 con il motivo, e niente viene creato. Il task si cerca nel `tasks.md` della copia della partenza, per metterne il testo nella conferma: un numero che la copia non ha non blocca, perché la copia arriva solo allo Stop e può essere indietro, ma la conferma dice di controllarlo con l'utente. Il fork sta nello stesso progetto: la sessione lavora nella cartella del suo progetto.

### D3. Chi torna
Quando F smette di essere aperto, ogni sessione ancora in F che ha un legame P → F con `ritorno = 1` e il proprio `session_id` torna in P, se P è aperto, con origine `utente` e un avviso: «il fork F è <stato>: sei di nuovo in P, riprendi dal task N "<testo>"». Le altre sessioni in F, o tutte se P non è più aperto, vanno al lavoro diretto come oggi.

### D4. Saperlo subito
`PUT /api/v1/progetti/<p>/openspec?session_id=<s>`: la sessione sta nell'indirizzo, non nel corpo, perché lo schema del corpo è rigido e un server non ancora aggiornato rifiuterebbe la copia con 422; un parametro sconosciuto lo ignora. Se la copia ha spostato o chiuso il cantiere di quella sessione, la risposta porta l'avviso in `contesto` con il `cantiere` della sessione. Il server non lo toglie: lo ridà alla risposta del prompt dopo, così una risposta della copia persa (timeout, due hook che scrivono la stessa sessione) non lo perde. Il plugin lo mette nel contesto pendente, aggiorna il cantiere locale (quindi anche il titolo) e ricorda l'avviso: quando torna con il prompt non lo ripete. Senza `session_id` la risposta resta com'è.

### D5. Contesto del fork
La conferma del fork nomina la partenza, il task col suo testo e il change da scrivere: «scrivi openspec/changes/<change>/ con proposal.md e tasks.md a partire da questo task, come /opsx:propose, poi lavoraci; quando lo archivi la sessione torna a P, task N». Il change resta piccolo: niente design né spec se il task non li chiede.

### D6. Comando nel plugin
`/cantiere fork <nome> --task <N> [— descrizione]` lo gestisce l'hook del prompt, sincrono come `/cantiere <nome>`, con `{ nome, descrizione, origine: "utente", padre: null, task, fork: true }`. Senza `--task` non manda niente e risponde con l'uso del comando. Un fork senza risposta resta in coda come ogni evento: un timeout non dice se il server l'ha applicato, e con lo stesso `evento_id` il server ridà la risposta salvata. Il server però applica un fork solo se arriva entro 5 minuti dal comando (`ts` dell'evento), altrimenti 409: più tardi la sessione può essere altrove. Claude sa che il fork parte solo entro quei 5 minuti; la conferma di un `/cantiere` partito dalla coda aspetta il prompt dopo. Il motivo di un 409 o di un 422 arriva a Claude. Il contesto in attesa (il ritorno da un fork) va prima della risposta a un `/cantiere`, e un comando riuscito, che ha consumato l'avviso sul server, fa dimenticare l'avviso ricordato.

## Risks / Trade-offs

- [Archivio in un'altra sessione] Se F lo archivia un'altra sessione, la sessione del fork torna a P all'evento successivo senza saperlo dalla copia: l'avviso arriva al suo prompt dopo, come oggi per un cantiere chiuso.
- [Migrazione dopo un'altra] `0006` è del change `comandi-da-dashboard`: questa è `0007` e va committata dopo.
