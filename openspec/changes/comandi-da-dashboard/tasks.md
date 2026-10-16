# Tasks

## 1. Server: dati e consegna

- [ ] 1.1 Migrazione `0003` con la tabella `comandi` e l'indice, e verificare che `npm test -w server` passi con il database nuovo e con uno già migrato a `0002`
- [ ] 1.2 Accettare `comandi` (boolean, opzionale) nella validazione dell'evento in `modelli.ts` e verificare con un test che un valore non boolean dà 422
- [ ] 1.3 In `riceviEvento` (`dominio.ts`): con `comandi: true` mettere nella risposta i comandi `in_attesa` non scaduti e segnarli `consegnato` nella stessa transazione; senza, rispondere `comandi: []` senza toccare nulla; verificare con test gli scenari "consegna una sola volta", "plugin senza abilitazione" ed "evento ripetuto"
- [ ] 1.4 Scadenza a 24 ore (in lettura, alla consegna e nella `pulizia`) e verificare con un test lo scenario "comando scaduto"

## 2. Server: dashboard

- [ ] 2.1 Rotte della dashboard per creare e annullare un comando, con i controlli della spec (422, 404, 409 per chiusa, 409 per cinque in attesa, 409 per annullo di un consegnato), che non accettano il Bearer; verificare con test su ognuno degli scenari
- [ ] 2.2 Campo di scrittura e lista dei comandi con stato e orari nella scheda della sessione (`server/ui/src`), con il testo "consegnato al prossimo passo della sessione"; verificare nel browser (`server/ui/dist` ricostruito) scrivendo e annullando un comando
- [ ] 2.3 Verificare che il testo dei comandi non compaia nei log né in `/api/v1/sessioni`, con un test che cerca il testo nell'output
- [ ] 2.4 Aggiornare `docs/contratto-v2.md` (campo `comandi` nella richiesta e nella risposta, consegna al più una volta) e il README del server, e verificare che i due testi descrivano gli stessi campi

## 3. Plugin

- [ ] 3.1 Campo `comandi` nella configurazione dell'area (default spento), invio di `comandi: true` negli eventi solo se acceso e ignorare il campo nelle risposte se spento; verificare con test che gli eventi di un'area di default non lo portano
- [ ] 3.2 Comando `/cantiere comandi on|off` e riga in `/cantiere stato`; verificare con i test del comando in `plugin/test/comandi.test.ts`
- [ ] 3.3 Consegna a `stop`: `block` con l'etichetta, precedenza sul blocco del resoconto, valida anche con `stop_hook_active`; verificare con test in `plugin/test/hook.test.ts` gli scenari "comando a fine turno" e "comando e resoconto insieme"
- [ ] 3.4 Consegna al prompt: i comandi arrivati con eventi asincroni vanno in cache e si iniettano una volta sola senza rete; verificare con test lo scenario "arrivato con un todo" e che il prompt dopo non li ripeta
- [ ] 3.5 Fail-open: `comandi` malformato o cache illeggibile non cambiano l'exit code né scrivono su stderr; verificare con test
- [ ] 3.6 Ricompilare `plugin/bin/forgia.mjs`, alzare la versione in `plugin/.claude-plugin/plugin.json`, aggiornare il README del plugin e lanciare `npm run typecheck`

## 4. Integrazione

- [ ] 4.1 Prova end to end locale: server e plugin su una cartella con `/cantiere comandi on`, comando scritto in dashboard, consegnato a fine turno; poi la stessa prova con i comandi spenti, e verificare che non arrivi nulla

## Workflow follow-up

- Archiviare il change dopo la revisione (`/opsx:archive`) e verificare che le spec `server/comandi` e `plugin/comandi` compaiano in `openspec/specs/`.
