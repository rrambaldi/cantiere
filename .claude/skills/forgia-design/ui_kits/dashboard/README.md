# Dashboard · giornale dei lavori

Layout scelto: **1d** (`Layout UI.dc.html`). Tre colonne a tutta altezza:

- **Indice** (`Indice.jsx`, 232 px, notte): logo, schede Aperti/Chiusi, elenco cantieri con stato per forma, stato della connessione.
- **Giornale** (`Giornale.jsx`, fluido): nastro (unico della schermata), intestazione su griglia, cronologia dei turni dal più recente; nodo pieno giallo, nodo a strisce se il turno ha un blocco. Avviso per i cantieri provvisori.
- **Scheda tecnica** (`SchedaTecnica.jsx`, 268 px): progetto/branch/chi/todo, programma dei lavori spuntabile, scelta dell'esito.

Interazioni: scegli un cantiere; spunta i todo; chiudi / sospendi / abbandona con dialogo di conferma e notifica; riapri dai chiusi. Il cantiere selezionato resta in localStorage.

Componenti dal design system: Logo, Tabs, StatoBadge, Nastro, Checkbox, Button, Dialog, Toast. `loader.js` usa `_ds_bundle.js` se c'è, altrimenti compila i sorgenti in `components/`.

Dati finti in `dati.js`. Non è un prodotto esistente: è la proposta di riferimento.
