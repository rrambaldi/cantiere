## Context

Il padre di un cantiere entra nel suo percorso (`padre/figlio`) e nel nome del change (`padre-figlio`): serve per le fasi di un lavoro più grande. Un ramo, cioè un'attività nata da un task di un altro cantiere, ha un change suo e a volte sta in un altro progetto. Oggi non c'è dove scriverlo.

## Decisions

### D1. Legame separato dal padre
Tabella `legami` con `da_id`, `a_id`, `tipo`, `task`, `session_id`, `creato_il`, unica per coppia `(da_id, a_id)`. Il padre non cambia significato. Alternativa scartata: riusare `padre_id` tra progetti, che cambierebbe percorso e change dei cantieri esistenti.

### D2. Legame automatico solo alla nascita
Se una sessione sta nel cantiere X e `apri_cantiere` crea Y, si registra X → Y. Entrare in un cantiere che esiste già non lo lega: cambiare lavoro non è far nascere un ramo. Se Y è una fase di X (X è un suo antenato), il legame non si scrive: lo dice già il padre.

### D3. Legame esplicito
`nato_da` (percorso) e `nato_da_progetto` (facoltativo, un altro progetto dello stesso committente) legano anche un cantiere che esiste già. Un cantiere di partenza che non c'è dà un rifiuto 409 con il motivo. Lo stesso legame scritto due volte resta uno.

### D4. Tra progetti, solo nello stesso committente
Il cantiere di partenza si cerca solo tra i progetti del committente del token. Il caso automatico tra progetti nasce quando la sessione apre un cantiere in un altro progetto con il campo `progetto` del tool.

### D5. Task come testo breve
`task` è il numero del task in `tasks.md` del cantiere di partenza (es. `1.1`), al massimo 32 caratteri. Non si controlla sul `tasks.md`: la copia dei change può arrivare dopo.

### D6. Lettura
Ogni cantiere letto ha `nato_da: [{ id, progetto, percorso, task }]`. I rami in uscita li calcola chi legge, dagli stessi dati.

### D7. Tipo del legame (fase 2)
`tipo` è `registrato` (da `apri_cantiere`, da `dirama` o dalla dashboard) o `citato` (dai file del change). La colonna nasce subito per non fare una seconda migrazione; in fase 1 si scrive solo `registrato`. Un legame tolto dalla dashboard resta come `tolto` (D9). Un legame registrato vince su uno citato della stessa coppia.

### D8. Subagenti (fase 2)
Un hook `PreToolUse` sul tool `Agent` manda un evento con il solo tipo del subagente; il server li conta per sessione. Mai il prompt né la descrizione, come per il resto del tracciamento.

### D9. «Nato da» dalla scheda (fase 2)
Nella scheda «Task e rami» si mette un legame scegliendo la partenza tra i cantieri del committente, con il task facoltativo, e si toglie con la ×. Messo dalla dashboard è `registrato`, senza sessione, e il suo task prende il posto di quello che c'era; su un legame registrato che c'è già cambia solo il task, e un fork resta un fork. Tolto non si cancella: diventa `tolto`, che letture e giri ignorano e che la copia dei change non riscrive come citato; un fork tolto non riporta più la sessione alla partenza. Un'idea non ha la scheda: il suo «nato da» si mette e si toglie dopo la presa. Alternativa scartata: cancellare la riga, ma la copia dopo riscriverebbe il citato.

## Risks

- Legami automatici sbagliati: una sessione che apre un cantiere non collegato a quello in cui stava. Mitigazione: la conferma del tool dice da dove è nato, e in fase 2 il legame si toglie dalla scheda.
- Più query nella lettura dei cantieri: i legami sono pochi, si leggono in una query per elenco.
- Giri: un giro di registrati si rifiuta, un citato non ne chiude e un registrato toglie i citati che ne chiuderebbero uno. Due `nato_da` opposti in parallelo su PostgreSQL possono però passare tutti e due il controllo: la dashboard visita i legami ricordando i cantieri già visti.
