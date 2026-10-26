# Tasks

## 1. Server

- [x] 1.1 Migrazione con la tabella `domande` e l'indice, e verificare che `npm test -w server` passi con il database nuovo e con uno già migrato
- [x] 1.2 Validazione in `modelli.ts` degli eventi `domanda` e `risposta`, e verificare con test gli scenari di 422 (tipo, `id` mancante, troppe opzioni)
- [x] 1.3 Registrare, chiudere e far scadere le domande in `dominio.ts` (risposta, nuovo prompt, `stop`, `session_end`, 24 ore, `pulizia`), e verificare con test tutti gli scenari di `server/domande`
- [x] 1.4 `domande_in_attesa` e l'elenco nelle letture dei progetti e dei cantieri, con la somma verso i padri, e verificare con test "figlio e padre", "due domande" e "sessione senza cantiere"
- [x] 1.5 Verificare con un test che non esiste nessuna rotta di risposta dalla dashboard (404)

## 2. Dashboard

- [x] 2.1 Pallino rosso con numero e alternativa testuale nell'indice, sul cantiere, sul padre e sul progetto, e verificare nel browser con `server/ui/dist` ricostruito
- [x] 2.2 Riquadro "In attesa di risposta" nella scheda del cantiere, con la nota che si risponde dal terminale, in italiano e inglese in `testi.ts`; verificare nel browser con una domanda vera e una scaduta
- [x] 2.3 Domande delle sessioni senza cantiere nella pagina del progetto (riquadro e pallino sulla riga delle non censite) e pallino sui filtri e sul titolo del progetto nell'indice, e verificare con test e nel browser

## 3. Plugin

- [x] 3.1 Hook `domanda` su `PreToolUse` con matcher `AskUserQuestion` (testo e opzioni, più domande nella stessa chiamata) e hook `risposta` su `PostToolUse`, asincroni, in `hooks.json` e `forgia.mts`; verificare con test gli scenari della spec
- [x] 3.2 Hook su `Notification` per permesso e inattività, senza duplicati nella sessione, e verificare con test "richiesta di permesso" e "notifica ripetuta"
- [x] 3.3 Fail-open, coda ed esclusioni (`.forgia-off`, tracciamento spento, area assente), e verificare con test "server giù" e "cartella esclusa"

## 4. Documentazione e verifica finale

- [x] 4.1 Aggiornare `docs/contratto-v2.md` (eventi `domanda` e `risposta`), il README del server e quello del plugin, e verificare che i tre testi descrivano gli stessi campi
- [ ] 4.2 Prova di insieme: in una sessione vera fare una domanda con `AskUserQuestion`, vedere il pallino rosso nella dashboard, rispondere e vederlo sparire
