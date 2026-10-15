# forgia — design system

**forgia** tiene traccia del lavoro fatto con Claude Code. Il lavoro si raggruppa in **cantieri**: unità di lavoro (feature, bug, migrazione) che durano molte sessioni e passano da un computer all'altro. Due parti: un **server** che raccoglie lo stato e un **plugin** per Claude Code che manda gli aggiornamenti da solo. Si attiva con `/forgia`.

Per: sviluppatori che usano Claude Code ogni giorno, con più sessioni e più macchine.

Superfici: README e documentazione, icona del plugin, output nel terminale, futura dashboard web.

Fonti (nel progetto di design, non incluse qui): brief interno "Brief per nome app e logo" (incollato in chat), esplorazione `Nome e logo.dc.html` (turni 1–5). Schema scelto: **5b, cianotipia con il giallo come segnale**. Segno: **incudine con il pezzo in lavorazione** (3a). Non esiste ancora codice né interfaccia del prodotto.

---

## Contenuti (CONTENT FUNDAMENTALS)

- **Lingua:** tutto in italiano. Il vocabolario è fisso: *cantiere, sessione, resoconto, fatto, dopo, blocca, todo, esito, completato, sospeso, abbandonato, in corso*.
- **Tono:** tecnico, sobrio, un po' artigianale. Ordine e controllo, mai ansia. Frasi brevi, niente esclamativi.
- **Persona:** si parla del lavoro, non all'utente. Impersonale o seconda persona singolare quando serve un'istruzione ("Chiudi il cantiere con un esito").
- **Maiuscole:** minuscolo per nome prodotto (`forgia`), nomi di cantiere (`auth-refactor`), etichette e stati. Maiuscola solo a inizio frase e nei titoli di pagina.
- **Resoconto:** sempre tre righe, sempre in quest'ordine: `fatto` · `dopo` · `blocca`. Righe vuote si scrivono `—`.
- **Numeri:** conteggi asciutti (`3/7`), date brevi (`14 ott`), orari 24h.
- **Privacy esplicita:** quando si parla di cosa viene inviato, dirlo chiaro: "Solo stato, todo e conteggi. Mai prompt, conversazioni o output."
- **Emoji:** mai. Niente simboli "AI" (scintille, robot, cervelli).
- Esempi:
  - ✓ "Server non raggiungibile. Il lavoro continua; gli aggiornamenti partono appena torna."
  - ✓ "Cantiere provvisorio: `forgia@main`. Rinominalo con `/forgia nome`."
  - ✗ "Oops! Qualcosa è andato storto 🚧"

## Fondamenta visive (VISUAL FOUNDATIONS)

- **Idea:** la cianotipia, cioè la copia di un progetto in bianco su blu di Prussia, con il **giallo segnaletica** che indica dove si sta lavorando.
- **Colori:** il blu di Prussia `#1E3F73` è il fondo d'identità, la notte `#142B52` è il fondo profondo (terminale, barre) e la carta `#F2F4F7` serve per segno e testo. Il giallo `#F2C230` è l'**unico** accento. Si usa per: il pezzo sull'incudine, le etichette del resoconto, lo stato *in corso*, il nastro, il focus. Su fondo chiaro il giallo va solo in campitura, mai come colore del testo.
- **Temi:** la *cianotipia* (scura, predefinita) per la dashboard, l'icona e il terminale; la *carta* (`data-tema="carta"`) per il README, la documentazione e la stampa. Il terminale resta sempre scuro.
- **Tipografia:** IBM Plex Sans per l'interfaccia e il testo, IBM Plex Mono per il logotipo, il codice, le etichette, i nomi dei cantieri e i conteggi. Il logotipo va sempre in minuscolo, Mono 600, con spaziatura −0,04em.
- **Sfondi:** tinta piatta. In copertine, intestazioni e icona si può usare una griglia da carta millimetrata con passo di 16 px (`--griglia`), mai sotto il testo lungo. Niente immagini, foto, sfumature o texture.
- **Motivo nastro:** una fascia a strisce a 45°, giallo e Prussia, alta 8 px. Al massimo **una per schermata**, in cima o a segnalare un blocco. Mai come decorazione diffusa.
- **Stati del cantiere:** si distinguono per **forma**, non per colore, e reggono anche in monocromo. *In corso*: pieno giallo. *Completato*: pieno carta o Prussia. *Sospeso*: anello. *Abbandonato*: anello tratteggiato.
- **Angoli:** 2 px per campioni e chip, 4 px per pulsanti, campi e terminale, 8 px per le schede, 14 px per l'icona da 64 px. Niente forme a pillola.
- **Bordi e ombre:** si separa con un bordo da 1 px (`--linea`). Le ombre sono solo per i dialoghi (`--ombra-dialogo`). Niente bagliori, niente trasparenze o sfocature, tranne il velo scuro dietro un dialogo.
- **Schede:** fondo `--superficie`, bordo da 1 px, angolo da 8 px, nessuna ombra. Non si usa mai una barra colorata solo sul bordo sinistro.
- **Hover:** le superfici schiariscono di un gradino (`--superficie-alta`) e il giallo scurisce (`--segnale-hover`). Alla pressione nessuno scale, solo un gradino in più.
- **Animazioni:** minime: dissolvenze e scorrimenti brevi di 120–200 ms con `--curva`. Niente rimbalzi. Il lavoro in sottofondo non si anima, si aggiorna e basta.
- **Layout:** denso e allineato alla griglia di 4 px. Le tabelle e gli elenchi contano più delle schede. Si usano colonne in monospazio per i conteggi.

## Iconografia

- **Logo principale:** il segno in bianco con il pezzo giallo e il logotipo `forgia` in Plex Mono 600 color carta, su fondo Prussia con griglia e nastro in cima. Spazio tra segno e nome: 1/4 dell'altezza del segno. Riferimento: `guidelines/brand-logo-principale.html`.
- Il **segno** è l'incudine con il pezzo sopra. I file sono in `assets/logo/`: a colori (`forgia.svg`), su scuro (`forgia-scuro.svg`), monocromo, monocromo bianco, le versioni da 16 px e l'icona dell'app su fondo Prussia (`forgia-icona.svg`).
- Il segno è fatto di forme piatte e geometriche. Non si ricolora fuori dalla palette e non gli si aggiungono scintille o fiamme.
- **Icone dell'interfaccia:** non c'è un set proprietario. Si usa **Lucide** da CDN, con tratto da 1,5 px, in `currentColor` e a 16 o 20 px. È una sostituzione, da confermare.
- Al posto delle icone, dove basta, si usano caratteri unicode in monospazio: `—` per un campo vuoto, `·` come separatore, `→` per un passaggio. Mai emoji.

## Indice

- `styles.css`: punto d'ingresso, con i soli `@import`.
- `tokens/`: `colors.css`, `typography.css`, `spacing.css`, `fonts.css`, `base.css`.
- `assets/logo/`: tutti i file del segno.
- `guidelines/`: le schede di specimen per colori, tipografia, spazi e brand.
- `components/`:
  - `brand/`: `Logo`
  - `core/`: `Button`, `Input`, `Checkbox`, `Switch`, `Tabs`
  - `feedback/`: `StatoBadge`, `Toast`, `Dialog`
  - `cantiere/`: `Resoconto`, `CantiereRiga`, `Nastro`, `Scheda`
- `ui_kits/dashboard/`: dashboard interattiva con il layout 1d (indice, giornale dei lavori, scheda tecnica).
- `SKILL.md`: per usare il sistema come skill in Claude Code.

### Aggiunte intenzionali

Non c'è un inventario di componenti preesistente, quindi il set è quello standard, ridotto a quello che serve al prodotto. A questo si aggiungono quattro componenti di dominio (`Resoconto`, `CantiereRiga`, `StatoBadge`, `Nastro`), perché descrivono gli oggetti centrali del brief.

### Da confermare

- Font: IBM Plex viene caricato da Google Fonts e non c'è nessun file locale.
- Icone: Lucide è una sostituzione.
- Il kit della dashboard è una proposta, non la copia di un prodotto esistente.
