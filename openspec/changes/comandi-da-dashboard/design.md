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
prosegue. Gli altri eventi sono asincroni, quindi i comandi vanno in cache (`comandi_pendenti`, come
`contesto_pendente`) e il `prompt` sincrono li inietta senza rete. Il comando vince sul blocco del
resoconto (un solo `block` per stop): il resoconto verrà chiesto allo stop dopo, perché `decidiBlocco` si
rivaluta a ogni stop. `stop_hook_active` non impedisce la consegna del comando: serve a non ripetere il
blocco del resoconto, non a fermare un comando nuovo; il limite di 5 comandi in attesa evita cicli lunghi.

**D5. Etichetta sul testo.** Il testo scritto in dashboard è dato non fidato per Claude quanto per
l'utente: l'etichetta dice che non è stato scritto in sessione, così Claude può chiedere conferma se il
comando è distruttivo. Non è una difesa completa: la difesa vera è l'abilitazione per area più il
certificato client che già protegge la dashboard.

**D6. Dati.** Tabella `comandi` (migrazione `0003`): `id`, `committente_id`, `session_id`, `testo`,
`stato` (`in_attesa`, `consegnato`, `annullato`, `scaduto`), `creato_il`, `consegnato_il`. Indice su
(`session_id`, `stato`). La scadenza si applica in lettura e alla consegna (`creato_il` più vecchio di
24 ore) e la `pulizia` esistente toglie le righe vecchie insieme agli eventi. Nessun testo nei log né nelle
letture `/api/v1`.

**D7. Limiti.** 500 caratteri, 5 in attesa per sessione, solo sessioni non chiuse. Niente rate limit
nuovo: la creazione passa dalle rotte della dashboard, che hanno già il loro controllo.

## Risks / Trade-offs

- [Sessione ferma: il comando non arriva] → la scheda lo dice ("consegnato al prossimo passo della
  sessione") e mostra lo stato `in attesa`; scade dopo 24 ore.
- [Comando perso se l'hook muore dopo la consegna] → visibile come `consegnato` in dashboard; si riscrive.
- [Un comando fa fare a Claude cose pericolose] → opt-in per area, etichetta, certificato client; Claude
  mantiene i suoi permessi e le sue richieste di conferma.
- [Più `block` in fila allo stop] → un comando solo per volta non serve: arrivano insieme nella stessa
  risposta, in un unico `block`.
- [Plugin vecchio e server nuovo] → il campo è opzionale in entrambe le direzioni, quindi nessuna rottura;
  il plugin vecchio non manda `comandi: true` e non riceve niente.

## Migration Plan

Si rilascia prima il server (migrazione `0003`, campo opzionale), poi il plugin (nuova versione). Rollback
del plugin: i comandi smettono di arrivare, quelli in coda scadono. Rollback del server: la tabella
`comandi` resta inutilizzata.
