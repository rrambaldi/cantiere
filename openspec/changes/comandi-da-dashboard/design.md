# Design

## Context

Il plugin parla al server solo con eventi HTTP dagli hook, e la risposta di `POST /api/v1/eventi` porta già
`contesto` e `config` che il plugin usa (vedi `docs/contratto-v2.md`). Lo `stop` è sincrono e già sa
bloccare la chiusura (`decision: "block"`), i prompt iniettano contesto dalla cache locale
(`contesto_pendente`). Il server non ha modo di iniziare una conversazione con la sessione: può solo
rispondere. Motivazione in `proposal.md`.

## Goals / Non-Goals

**Goals:**
- Un comando scritto in dashboard arriva a Claude al primo evento utile della sessione.
- Nessuna dipendenza nuova, nessun processo in più, nessuna porta aperta sulla macchina dello sviluppatore.
- Chi non abilita i comandi non cambia comportamento.

**Non-Goals:**
- Svegliare una sessione che aspetta l'utente. Senza hook che scattano, niente arriva.
- Garantire la consegna: è al più una volta.
- Risposte dalla sessione verso la dashboard oltre a quelle che già ci sono (`aggiorna_stato`, titolo).

## Decisions

**D1. Consegna dentro la risposta agli eventi, non un canale nuovo.** Il server aggiunge `comandi` alla
risposta; il plugin lo legge dove già legge `contesto`. Alternative: Channels di Claude Code (sveglia anche
una sessione ferma, ma è sperimentale e il server MCP va eseguito in locale); demone locale con
`claude -p --resume` (funziona a sessione ferma, ma è un processo da installare e tenere acceso, e una
seconda istanza sulla stessa sessione). Si rivedono se servirà svegliare sessioni ferme: la coda e la UI
restano uguali, cambia solo il trasporto.

**D2. Consegna al più una volta, senza ack.** Il comando passa a `consegnato` nella stessa transazione che
costruisce la risposta. Se l'hook muore dopo, il comando è perso ma resta `consegnato`: la dashboard lo
mostra e si riscrive. Alternativa: ack con un evento in più e riconsegna a oltranza, scartata perché
raddoppia gli stati e rischia di eseguire due volte un comando (peggio che perderlo). La risposta salvata
per `evento_id` contiene già i comandi, quindi un reinvio dalla coda locale del plugin li riottiene.

**D3. Opt-in dichiarato dal plugin, per area.** Il plugin manda `comandi: true` solo se l'area lo
abilita; senza, il server non consegna e non cambia stato. Così "spento" è garantito anche con un server
nuovo e un plugin vecchio o configurato diversamente, e un comando non si perde su un client che lo
ignora. L'interruttore sta nella configurazione dell'area (`aree[].comandi`, default assente = spento) e si
cambia con `/cantiere comandi on|off`. Alternativa: opt-in sul committente nel server, scartata perché il
rischio è di chi ha la macchina, non di chi ha il token.

**D4. Percorso di consegna.** `stop` è sincrono: se la risposta ha comandi, il hook risponde `block` con
motivo `[forgia] Comando dalla dashboard (non scritto in questa sessione): <testo>`; Claude esegue e
prosegue. Gli altri eventi sono asincroni, quindi i comandi vanno in cache (accanto a
`contesto_pendente`) e il primo tra `stop` e `prompt` li consegna, senza rete. Nella cache c'è un file per
comando, con il suo id: una risposta ricevuta due volte non lo ripete, e un hook che riscrive il file della
sessione non lo perde. Gli eventi `domanda` e `session_end` non chiedono comandi: la sessione aspetta l'utente
o finisce. Il comando vince sul blocco del resoconto (un solo `block` per stop): il resoconto verrà chiesto
allo stop dopo, che per questo non conta come già bloccato anche se arriva con `stop_hook_active`. `stop_hook_active` non impedisce la consegna del comando: serve a non ripetere il
blocco del resoconto, non a fermare un comando nuovo; il limite di 5 comandi in attesa evita cicli lunghi.

**D5. Etichetta sul testo.** Il testo scritto in dashboard è dato non fidato per Claude quanto per
l'utente: l'etichetta dice che non è stato scritto in sessione, così Claude può chiedere conferma se il
comando è distruttivo. Non è una difesa completa: la difesa vera è l'abilitazione per area più il
certificato client che già protegge la dashboard.

**D6. Dati.** Tabella `comandi` (la prossima migrazione libera, oggi `0006`): `id`, `committente_id`,
`session_id`, `testo`, `stato` (`in_attesa`, `consegnato`, `annullato`, `scaduto`), `creato_il`,
`consegnato_il`, e per gli esiti `cantiere_id`, `domanda_id`, `task` ed `esito` (`confermato`, `negato`);
`session_id` è vuoto per l'esito di un task. Indice su (`session_id`, `stato`) e su (`cantiere_id`, `stato`). La scadenza si applica in lettura e alla consegna (`creato_il` più vecchio di
24 ore) e la `pulizia` esistente toglie le righe vecchie insieme agli eventi. Nessun testo nei log né nelle
letture `/api/v1`.

**D7. Limiti.** 500 caratteri, 5 in attesa per sessione, solo sessioni non chiuse. Niente rate limit
nuovo: la creazione passa dalle rotte della dashboard, che hanno già il loro controllo.

**D8. Risposta a una domanda in attesa.** Il change `domande-in-attesa` mostra nella dashboard le domande di
Claude, senza rispondere. Dal web una domanda si conferma o si nega con un feedback: l'esito porta l'`id`
della domanda e la chiude subito come `risposta`, così il pallino sparisce senza aspettare il prompt
successivo. Una risposta libera resta un comando di testo e non chiude la domanda. Limite: un
`AskUserQuestion` aperto blocca il turno e l'esito arriva solo al passo successivo, quindi non riempie la
domanda aperta: Claude lo legge dopo, come un nuovo prompt.

**D9. Task di verifica.** Un task è di verifica se è aperto e il suo testo comincia con «Verificare» o
«Prova» (come "Verificare nel browser…" o "Prova di insieme…"). Alternativa: un segno nel `tasks.md`,
scartata per ora perché i task esistenti non lo hanno. Il server non scrive nel repo: il task resta
«confermato dal web» nella scheda finché la copia del `tasks.md` non lo mostra smarcato; con «Non va» resta
aperto e mostra il feedback.

**D10. Chi riceve l'esito.** Lo riceve la prima sessione dello stesso cantiere che manda un evento con
`comandi: true`, quella che ha chiesto o un'altra: una verifica fatta dal telefono di solito risponde a una
sessione ferma. L'esito di un cantiere non scade a 24 ore e resta finché una sessione lo riceve o lo si
annulla. Senza cantiere valgono le regole del comando: solo quella sessione, 24 ore. Una sessione già chiusa non
riceve nulla, nemmeno da un evento arrivato tardi dalla coda.

## Risks / Trade-offs

- [Un esito arriva a una sessione che non ha fatto la domanda] → il testo dice quale domanda o task, e di
  quale sessione e macchina.
- [Sessione ferma: il comando non arriva] → la scheda lo dice ("consegnato al prossimo passo della
  sessione") e mostra lo stato `in attesa`; scade dopo 24 ore.
- [Comando perso se l'hook muore dopo la consegna] → visibile come `consegnato` in dashboard; si riscrive.
- [Un comando fa fare a Claude cose pericolose] → opt-in per area, etichetta, certificato client; Claude
  mantiene i suoi permessi e le sue richieste di conferma.
- [Chi ha il token di un committente può farsi consegnare i comandi di una sua sessione con un evento] → è
  già una credenziale che scrive eventi a nome delle sessioni; i comandi non compaiono comunque nelle letture.
- [Più `block` in fila allo stop] → un comando solo per volta non serve: arrivano insieme nella stessa
  risposta, in un unico `block`.
- [Plugin vecchio e server nuovo] → il campo è opzionale in entrambe le direzioni, quindi nessuna rottura;
  il plugin vecchio non manda `comandi: true` e non riceve niente.

## Migration Plan

Si rilascia prima il server (migrazione nuova, campo opzionale), poi il plugin (nuova versione). Rollback
del plugin: i comandi smettono di arrivare, quelli in coda scadono. Rollback del server: la tabella
`comandi` resta inutilizzata.
