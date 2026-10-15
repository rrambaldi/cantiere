window.FORGIA_DATI = {
  connessione: { stato: 'collegato', ultimoInvio: '10:31', macchine: 3 },
  cantieri: [
    { id: 'auth-refactor', progetto: 'webapp', branch: 'main', chi: 'marco', stato: 'in-corso', aperto: '12 ott', ora: '09:42',
      todos: [['Censire gli endpoint di login', true], ['Scrivere l’adattatore OAuth', true], ['Migrare il login a OAuth', true], ['Aggiornare i test', false], ['Rimuovere le vecchie sessioni', false], ['Ruotare i segreti', false], ['Aggiornare la documentazione', false]],
      turni: [
        { giorno: 'oggi', ora: '09:42', mac: 'studio', sess: 'sessione 4', fatto: 'login migrato a OAuth, test verdi', dopo: 'rimuovere le vecchie sessioni', blocca: '' },
        { giorno: 'ieri', ora: '18:10', mac: 'portatile', sess: 'sessione 3', fatto: 'adattatore OAuth scritto', dopo: 'migrare il login', blocca: 'chiave di test scaduta' },
        { giorno: '13 ott', ora: '16:20', mac: 'portatile', sess: 'sessione 2', fatto: 'scelta la libreria OAuth', dopo: 'scrivere l’adattatore', blocca: '' },
        { giorno: '12 ott', ora: '11:05', mac: 'studio', sess: 'sessione 1', fatto: 'endpoint di login censiti', dopo: 'scegliere la libreria', blocca: '' } ] },
    { id: 'fix-timeout-api', progetto: 'api', branch: 'fix/timeout', chi: 'giulia', stato: 'in-corso', aperto: '14 ott', ora: '10:15',
      todos: [['Riprodurre il timeout', true], ['Alzare il limite del pool', false], ['Test di carico', false]],
      turni: [
        { giorno: 'oggi', ora: '10:15', mac: 'studio', sess: 'sessione 2', fatto: 'riprodotto il timeout in locale', dopo: 'alzare il limite del pool', blocca: 'attesa log di produzione' },
        { giorno: 'oggi', ora: '08:50', mac: 'studio', sess: 'sessione 1', fatto: 'raccolti i casi segnalati', dopo: 'riprodurre in locale', blocca: '' } ] },
    { id: 'forgia@main', provvisorio: true, progetto: 'forgia', branch: 'main', chi: 'marco', stato: 'in-corso', aperto: 'oggi', ora: '10:31',
      todos: [],
      turni: [ { giorno: 'oggi', ora: '10:31', mac: 'portatile', sess: 'sessione 1', fatto: 'cantiere provvisorio, da rinominare', dopo: '', blocca: '' } ] },
    { id: 'export-csv', progetto: 'webapp', branch: 'feat/export', chi: 'marco', stato: 'sospeso', aperto: '9 ott', ora: '12 ott',
      todos: [['Definire il formato delle colonne', true], ['Esportare i filtri attivi', true], ['Gestire i campi vuoti', false], ['Codifica UTF-8 con BOM', false], ['Test con 100k righe', false]],
      turni: [
        { giorno: '12 ott', ora: '17:40', mac: 'ufficio', sess: 'sessione 3', fatto: 'filtri attivi esportati', dopo: 'gestire i campi vuoti', blocca: '' },
        { giorno: '10 ott', ora: '15:02', mac: 'ufficio', sess: 'sessione 2', fatto: 'formato colonne definito', dopo: 'esportare i filtri', blocca: '' } ] },
    { id: 'migrazione-db', progetto: 'api', branch: 'main', chi: 'giulia', stato: 'completato', aperto: '2 ott', ora: 'ieri',
      todos: [['Script di migrazione', true], ['Prova su copia', true], ['Esecuzione in produzione', true]],
      turni: [ { giorno: 'ieri', ora: '19:05', mac: 'portatile', sess: 'sessione 6', fatto: 'migrazione eseguita e verificata', dopo: '', blocca: '' } ] },
    { id: 'vecchio-parser', progetto: 'cli', branch: 'main', chi: 'giulia', stato: 'abbandonato', aperto: '20 set', ora: '30 set',
      todos: [['Analisi del formato', true], ['Riscrittura', false]],
      turni: [ { giorno: '30 set', ora: '10:00', mac: 'studio', sess: 'sessione 2', fatto: 'deciso di passare alla libreria standard', dopo: '', blocca: '' } ] }
  ]
};
