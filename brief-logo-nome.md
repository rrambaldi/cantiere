# Brief per nome app e logo

## Cos'è

Un servizio che tiene traccia del lavoro fatto con Claude Code, l'assistente di programmazione da terminale.
Il lavoro si raggruppa in **cantieri**. Un cantiere è un'unità di lavoro (una feature, un bug, una migrazione) che può durare molte sessioni e passare da un computer all'altro.

Ha due parti:
- un **server** online che raccoglie lo stato di tutti i cantieri;
- un **plugin** per Claude Code che manda gli aggiornamenti da solo, in ogni progetto, senza che nessuno ci pensi.

## Come funziona, in breve

- Ogni sessione di lavoro finisce in un cantiere. Se nessuno lo dice, il sistema ne assegna uno provvisorio (`progetto@branch`). Poi Claude o l'utente lo correggono.
- Chi comanda: l'utente prima di Claude, Claude prima dell'automatico.
- A fine turno Claude scrive un resoconto di tre righe: cosa ha **fatto**, cosa viene **dopo**, cosa lo **blocca**.
- Si vedono i cantieri aperti, chi ci lavora, da quale macchina, a che punto è.
- Un cantiere si chiude con un esito: **completato**, **sospeso** o **abbandonato**.
- Si attiva con un solo comando: `/cantiere`.

## Per chi è

Sviluppatori che usano Claude Code tutti i giorni, spesso con più sessioni aperte insieme e su più computer. Vogliono sapere a che punto sono i lavori senza scriverlo a mano e senza perdere il filo tra una sessione e l'altra.

## Carattere del prodotto

- **Discreto.** Lavora in sottofondo, sempre acceso. Se il server non risponde, non blocca mai il lavoro.
- **Rispettoso della privacy.** Non manda mai il testo dei prompt, le conversazioni o l'output dei comandi. Solo stato, todo e conteggi.
- **Leggero e preciso.** Poche righe, niente fronzoli, dati affidabili.
- **Italiano.** Tutto il vocabolario è in italiano: cantiere, fatto, prossimo, bloccato da, esito.
- Tono: tecnico, sobrio, un po' artigianale. Ordine e controllo, non ansia.

## La metafora: il cantiere edile

Sessioni = turni di lavoro. Resoconti = giornale dei lavori. Todo = programma dei lavori. Esito = collaudo o sospensione.
Immagini utili: cartello di cantiere, casco, gru, impalcatura, nastro bianco e rosso, planimetria, mattone, livella, segnaletica di lavori in corso.

## Nome

- Nome provvisorio: **cantieri** (comando `/cantiere`).
- Il nome finisce in comandi e identificativi tecnici: `/nome`, `mcp__nome__strumento`, `nome-admin`. Quindi: **una parola, minuscola, senza spazi né accenti, al massimo 10 lettere**, facile da scrivere nel terminale.
- Deve suonare bene in italiano. Va bene anche il latino: gli altri plugin dello stesso autore hanno nomi latini (per esempio *sine more interposita*, *nec plus quam oportet*).
- Da evitare: "Claude", "Anthropic", "Opus" o altri nomi di modelli, e nomi già usati da prodotti noti per sviluppatori.

## Logo

- Uso: README, icona del plugin, una futura dashboard web. Deve funzionare **piccolo (16 px)**, in **un solo colore** e su sfondo chiaro e scuro.
- Forma semplice e geometrica, leggibile anche come favicon.
- Spunti: un segnale o un cartello di cantiere stilizzato, un casco, una gru fatta di linee, un'impalcatura che forma una lettera, il nastro a strisce.
- Colori possibili: giallo/arancio segnaletica con antracite, oppure un monocromo sobrio.
- Da evitare: robot, cervelli, scintille "AI", e qualunque cosa ricordi il logo o l'arancione di Claude/Anthropic.

## Cosa chiedo

1. 5–8 proposte di nome, ognuna con una riga di motivo e come suona da comando (`/nome`).
2. 3 direzioni di logo per il nome migliore, con variante piccola (16 px) e monocroma.
