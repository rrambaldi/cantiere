# Tasks

## 1. Server: dati e validazione

- [ ] 1.1 Migrazione con le tabelle `cantiere_repo`, `cantiere_issue` e `commit`, e verificare che `npm test -w server` passi con il database nuovo e con uno già migrato
- [ ] 1.2 Validazione in `modelli.ts` dei tipi `commit` e `issue` e dei campi di configurazione (forge, nome della variabile, numeri di issue), e verificare con test gli scenari di 422 (hash, stato, forge, token al posto del nome)
- [ ] 1.3 Campo `messaggi_commit` nella configurazione e nella `config` della risposta, e verificare con un test che con l'opzione spenta titolo e corpo sono scartati

## 2. Server: logica

- [ ] 2.1 Registrare i commit in `dominio.ts`, una volta sola per `(cantiere, hash)`, e verificare con test "commit ripetuto" e "commit senza messaggio"
- [ ] 2.2 Issue del cantiere con piano unico, eredità di repo dal padre e ripiego sul repo della sessione, e verificare con test i cinque scenari di issue e quelli di eredità
- [ ] 2.3 Titolo e stato delle issue da evento `issue`, e verificare con un test che il server non fa chiamate in uscita
- [ ] 2.4 Issue e regola dei commit nel contesto di avvio e nella risposta (`Refs`, piano per primo, `piano_mancante`), e verificare con test i contesti con e senza issue
- [ ] 2.5 Link al forge per repo, commit e issue, e verificare con un test su un URL Gitea e uno GitHub

## 3. Server: dashboard

- [ ] 3.1 Rotte della dashboard per repo e issue (aggiungi, togli, piano, principale), che non accettano il Bearer, e verificare con test gli errori 404 e 422
- [ ] 3.2 Scheda del cantiere con repo, issue (piano evidenziato, avviso) e commit, e modulo di configurazione git con il testo sul token, in italiano e inglese in `testi.ts`; verificare nel browser con `server/ui/dist` ricostruito
- [ ] 3.3 La modifica dal web arriva alla sessione al prompt successivo, e verificare con un test che il contesto pendente contiene le issue nuove

## 4. Plugin

- [ ] 4.1 Lettura dei commit allo stop (`git log` dall'ultimo hash, `--numstat`) con fail-open, e verificare con un repo di prova gli scenari "commit nel turno", "nessun commit" e "git assente"
- [ ] 4.2 Titolo e corpo solo con `messaggi_commit` acceso, e verificare con test i due casi
- [ ] 4.3 Hook `pre_commit` su `PreToolUse` per `Bash` in `hooks.json`, con il controllo del messaggio e dei `Refs`, e verificare con test tutti gli scenari della spec (rifiuti, via libera, `-F`, fuori dai cantieri)
- [ ] 4.4 Lettura del token dalla variabile d'ambiente e chiamata al forge (GitHub e Gitea) per titolo e stato, con cache di dieci minuti; verificare con un server finto gli scenari "issue esistente", "404" e "irraggiungibile", e con un test che il token non compare in log, coda e file di sessione
- [ ] 4.5 Comando `/cantiere issue` (con `--piano`, `--togli`) e `--issue` alla presa, e verificare con test di `riconosci` e dei casi "sessione senza cantiere" e "numero non valido"

## 5. Documentazione e verifica finale

- [ ] 5.1 Aggiornare `docs/contratto-v2.md` (eventi `commit` e `issue`, campo `config.messaggi_commit`), il README del server e quello del plugin, e verificare che i tre testi descrivano gli stessi campi
- [ ] 5.2 Prova di insieme con un repo vero: configurare il cantiere, fare un commit con `Refs`, e verificare che compare nella dashboard con link e conteggi
