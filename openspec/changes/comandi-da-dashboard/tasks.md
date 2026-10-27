# Tasks

## 1. Server: dati e consegna

- [x] 1.1 Prossima migrazione libera (oggi `0006`) con la tabella `comandi` e gli indici, e verificare che `npm test -w server` passi con il database nuovo e con uno già migrato
- [x] 1.2 Accettare `comandi` (boolean, opzionale) nella validazione dell'evento in `modelli.ts` e verificare con un test che un valore non boolean dà 422
- [x] 1.3 In `riceviEvento` (`dominio.ts`): con `comandi: true` mettere nella risposta i comandi `in_attesa` non scaduti e segnarli `consegnato` nella stessa transazione; senza, rispondere `comandi: []` senza toccare nulla; verificare con test gli scenari "consegna una sola volta", "plugin senza abilitazione" ed "evento ripetuto"
- [x] 1.4 Scadenza a 24 ore (in lettura, alla consegna e nella `pulizia`) e verificare con un test lo scenario "comando scaduto"
- [x] 1.5 Esiti: colonne `cantiere_id`, `domanda_id`, `task` ed `esito`, consegna alla prima sessione del cantiere con `comandi: true` (senza cantiere solo a quella che ha chiesto), nessuna scadenza sul cantiere; verificare con test gli scenari "consegna alla prossima sessione del cantiere" e "verifica confermata senza sessioni aperte"

## 2. Server: dashboard

- [x] 2.1 Rotte della dashboard per creare e annullare un comando, con i controlli della spec (422, 404, 409 per chiusa, 409 per cinque in attesa, 409 per annullo di un consegnato), che non accettano il Bearer; verificare con test su ognuno degli scenari
- [x] 2.2 Campo di scrittura e lista dei comandi con stato e orari nella scheda della sessione (`server/ui/src`), con il testo "consegnato al prossimo passo della sessione"; verificare nel browser (`server/ui/dist` ricostruito) scrivendo e annullando un comando
- [x] 2.3 Verificare che il testo dei comandi non compaia nei log né in `/api/v1/sessioni`, con un test che cerca il testo nell'output
- [x] 2.4 Aggiornare `docs/contratto-v2.md` (campo `comandi` nella richiesta e nella risposta, consegna al più una volta) e il README del server, e verificare che i due testi descrivano gli stessi campi
- [x] 2.5 Rotte della dashboard per confermare o negare una domanda in attesa o un task di verifica (422 senza feedback nel rifiuto, 409 domanda già chiusa, 404 fuori ambito), con la domanda che passa a `risposta`; verificare con test gli scenari dell'esito
- [x] 2.6 «Confermo» e «Non va» con il campo del feedback nel riquadro delle domande in attesa e sui task di verifica della scheda del cantiere, con lo stato «confermato dal web» o il feedback finché il `tasks.md` non cambia; verificare nel browser, anche a 390 px

## 3. Plugin

- [x] 3.1 Campo `comandi` nella configurazione dell'area (default spento), invio di `comandi: true` negli eventi solo se acceso e ignorare il campo nelle risposte se spento; verificare con test che gli eventi di un'area di default non lo portano
- [x] 3.2 Comando `/cantiere comandi on|off` e riga in `/cantiere stato`; verificare con i test del comando in `plugin/test/comandi.test.ts`
- [x] 3.3 Consegna a `stop`: `block` con l'etichetta, precedenza sul blocco del resoconto, valida anche con `stop_hook_active`; verificare con test in `plugin/test/hook.test.ts` gli scenari "comando a fine turno" e "comando e resoconto insieme"
- [x] 3.4 Consegna al prompt: i comandi arrivati con eventi asincroni vanno in cache e si iniettano una volta sola senza rete; verificare con test lo scenario "arrivato con un todo" e che il prompt dopo non li ripeta
- [x] 3.5 Fail-open: `comandi` malformato o cache illeggibile non cambiano l'exit code né scrivono su stderr; verificare con test
- [x] 3.6 Ricompilare `plugin/bin/forgia.mjs`, alzare la versione in `plugin/.claude-plugin/plugin.json`, aggiornare il README del plugin e lanciare `npm run typecheck`

## 4. Integrazione

- [x] 4.1 Prova end to end locale: server e plugin su una cartella con `/cantiere comandi on`, comando scritto in dashboard, consegnato a fine turno; poi la stessa prova con i comandi spenti, e verificare che non arrivi nulla
- [ ] 4.2 Prova end to end: con la sessione ferma, confermare dal web un task di verifica; la sessione successiva dello stesso cantiere riceve l'esito e smarca il task, e la dashboard lo mostra smarcato

## Workflow follow-up

- Archiviare il change dopo la revisione (`/opsx:archive`) e verificare che le spec `server/comandi` e `plugin/comandi` compaiano in `openspec/specs/`.
