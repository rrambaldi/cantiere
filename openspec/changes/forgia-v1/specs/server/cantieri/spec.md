# Spec Delta

## Purpose

Fissa come ogni sessione finisce in un cantiere: assegnazione automatica di un cantiere
provvisorio, correzione da parte di Claude o dell'utente con una precedenza chiara, apertura per
nome condivisa tra macchine e chiusura con esito.

## ADDED Requirements

### Requirement: Cantiere provvisorio agganciato a repo e branch
Una sessione senza cantiere MUST essere associata, al suo evento successivo, al cantiere aperto la cui
sessione più recente aveva lo stesso repo e lo stesso branch, con origine `auto` e
`confermato: false`. Se `repo` è null il confronto MUST usare il nome della cartella di `cwd`.

#### Scenario: Seconda sessione sullo stesso repo e branch
- **WHEN** esiste un cantiere aperto la cui sessione più recente era su `github.com/org/app` branch `main`, e arriva una sessione nuova sullo stesso repo e branch
- **THEN** la sessione nuova entra in quel cantiere con origine `auto` e `confermato: false`

### Requirement: Creazione del cantiere provvisorio
Se nessun cantiere aperto corrisponde, il server MUST creare un cantiere di nome `<nome-repo>@<branch>`
(il nome del repo è l'ultimo segmento di `repo`), oppure il nome della cartella di `cwd` se non c'è
git, con origine `auto` e `confermato: false`.

#### Scenario: Primo lavoro su un repo
- **WHEN** arriva il primo evento di una sessione su `github.com/org/app` branch `feat-x` e non ci sono cantieri aperti per quel repo e branch
- **THEN** il server crea il cantiere `app@feat-x` con origine `auto` e `confermato: false`

#### Scenario: Cartella senza git
- **WHEN** arriva una sessione con `repo: null`, `branch: null` e `cwd: /home/u/appunti`
- **THEN** il cantiere provvisorio si chiama `appunti`

### Requirement: Precedenza tra origini
L'associazione sessione → cantiere MUST seguire la precedenza `utente` > `claude` > `auto`. Una sessione
associata dall'utente MUST cambiare cantiere solo con un altro `apri_cantiere` di origine `utente`.
Un `apri_cantiere` di origine `claude` su una sessione associata dall'utente MUST essere rifiutato senza
effetti.

#### Scenario: Claude prova a cambiare il cantiere scelto dall'utente
- **WHEN** la sessione è stata associata a `oauth-logiquo` con origine `utente` e arriva via REST `apri_cantiere` con origine `claude` e nome `refactoring-db`
- **THEN** il server risponde 409 con `{"errore": "..."}` e la sessione resta in `oauth-logiquo`

#### Scenario: L'utente cambia idea
- **WHEN** la sessione è associata dall'utente e arriva un altro `apri_cantiere` con origine `utente`
- **THEN** la sessione passa al nuovo cantiere

#### Scenario: Claude corregge il provvisorio
- **WHEN** la sessione è in un cantiere `auto` e arriva `apri_cantiere` con origine `claude`
- **THEN** la sessione passa al cantiere indicato con origine `claude`

### Requirement: Apertura per slug condivisa
`apri_cantiere` MUST far entrare la sessione nel cantiere aperto con lo stesso slug del nome indicato,
su qualunque repo; altrimenti MUST crearne uno nuovo con quel nome. In entrambi i casi l'associazione
MUST avere `confermato: true`. Lo slug MUST essere unico tra i cantieri aperti.

#### Scenario: Due macchine sullo stesso cantiere
- **WHEN** una sessione sul portatile ha aperto `OAuth Logiquo` e una sessione sul fisso apre `oauth-logiquo`
- **THEN** le due sessioni condividono lo stesso cantiere, entrambe con `confermato: true`

#### Scenario: Nome nuovo
- **WHEN** arriva `apri_cantiere` con un nome il cui slug non corrisponde a nessun cantiere aperto
- **THEN** il server crea il cantiere con quel nome, la descrizione data e l'origine dell'evento

### Requirement: Chiusura per tutte le sessioni
`chiudi_cantiere` MUST chiudere il cantiere della sessione per tutte le sessioni associate, salvando
esito (`completato`, `sospeso`, `abbandonato`) e nota. La risposta MUST avere `cantiere: null`. Le
sessioni associate MUST restare senza cantiere fino al loro evento successivo, a cui si applicano le
regole del cantiere provvisorio.

#### Scenario: Chiusura seguita da un prompt
- **WHEN** arriva `chiudi_cantiere` con esito `completato` e poi un `prompt` sulla stessa sessione
- **THEN** la risposta alla chiusura ha `cantiere: null` e il `prompt` porta la sessione in un nuovo cantiere provvisorio

#### Scenario: Slug libero dopo la chiusura
- **WHEN** il cantiere `oauth-logiquo` è chiuso e una sessione apre di nuovo `oauth-logiquo`
- **THEN** il server crea un cantiere nuovo e quello chiuso resta nello storico

#### Scenario: Chiusura senza cantiere
- **WHEN** arriva `chiudi_cantiere` su una sessione che non ha un cantiere
- **THEN** il server risponde 200 con `cantiere: null` e non cambia nulla

### Requirement: Padre dal percorso e dal campo padre
`apri_cantiere` MUST leggere il percorso completo come `padre` seguito da `nome`, con i segmenti separati
da `/` e confrontati sullo slug. L'ultimo segmento MUST essere il cantiere a cui si associa la sessione,
e ogni segmento MUST essere figlio del precedente. Lo slug MUST restare unico tra tutti i cantieri
aperti, a qualunque livello.

#### Scenario: Nome a percorso
- **WHEN** arriva `apri_cantiere` con `nome: "logiquo-v2/oauth"` e non ci sono cantieri aperti con quei nomi
- **THEN** il server crea `logiquo-v2` e `oauth` figlio di `logiquo-v2`, e associa la sessione a `oauth`

#### Scenario: Campo padre
- **WHEN** arriva `apri_cantiere` con `nome: "oauth"` e `padre: "logiquo-v2"`
- **THEN** il risultato è lo stesso del nome a percorso `logiquo-v2/oauth`

#### Scenario: Figlio cercato per nome
- **WHEN** `oauth` è aperto come figlio di `logiquo-v2` e un'altra sessione apre `oauth` senza padre
- **THEN** entra nello stesso `oauth`, che resta figlio di `logiquo-v2`

#### Scenario: Segmento vuoto
- **WHEN** arriva `apri_cantiere` con `nome: "logiquo-v2//oauth"`
- **THEN** il server risponde 422

### Requirement: Antenati creati al volo
Ogni antenato del percorso che non esiste aperto MUST essere creato con l'origine dell'evento. Solo
l'ultimo segmento MUST essere associato alla sessione. Un cantiere aperto senza padre MUST prendere il
padre indicato dal percorso.

#### Scenario: Cantiere esistente senza padre
- **WHEN** `oauth` è aperto senza padre e arriva `apri_cantiere` con `nome: "logiquo-v2/oauth"`
- **THEN** `oauth` diventa figlio di `logiquo-v2`, creato se non c'era

### Requirement: Padre diverso o ciclo rifiutati
Un `apri_cantiere` che darebbe a un cantiere un padre diverso da quello che ha già, o che farebbe di un
cantiere l'antenato di sé stesso, MUST essere rifiutato con 409 e `{"errore": "..."}` che nomina il
padre attuale, senza cambiare nulla.

#### Scenario: Padre diverso
- **WHEN** `oauth` è figlio di `logiquo-v2` e arriva `apri_cantiere` con `nome: "altro/oauth"`
- **THEN** il server risponde 409, l'errore dice che `oauth` è figlio di `logiquo-v2`, e nessun cantiere cambia

#### Scenario: Ciclo
- **WHEN** `oauth` è figlio di `logiquo-v2` e arriva `apri_cantiere` con `nome: "oauth/logiquo-v2"`
- **THEN** il server risponde 409 e non cambia nulla

### Requirement: Chiusura di un padre con figli aperti
`chiudi_cantiere` senza `forza` su un cantiere con figli aperti MUST essere rifiutato con 409 e un errore
che elenca i figli aperti. Con `forza: true` MUST chiudere anche tutti i discendenti aperti, con lo
stesso esito e la stessa nota. Chiudere un figlio MUST lasciare aperto il padre.

#### Scenario: Padre con figli aperti
- **WHEN** `logiquo-v2` ha il figlio aperto `oauth` e arriva `chiudi_cantiere` senza `forza` su `logiquo-v2`
- **THEN** il server risponde 409, l'errore nomina `oauth`, ed entrambi restano aperti

#### Scenario: Chiusura forzata
- **WHEN** arriva `chiudi_cantiere` con `forza: true` ed esito `sospeso` su `logiquo-v2`, che ha `oauth`, a sua volta con il figlio aperto `token`
- **THEN** `logiquo-v2`, `oauth` e `token` sono chiusi con esito `sospeso`, e le loro sessioni restano senza cantiere fino all'evento successivo

#### Scenario: Chiusura di un figlio
- **WHEN** arriva `chiudi_cantiere` su `oauth`, figlio di `logiquo-v2`
- **THEN** `oauth` è chiuso e `logiquo-v2` resta aperto

### Requirement: Provvisori senza padre
I cantieri provvisori (`auto`) MUST nascere senza padre. La risposta MUST riportare nel campo `percorso`
la catena dei nomi dal cantiere più alto, separati da `/`.

#### Scenario: Percorso nella risposta
- **WHEN** la sessione è associata a `oauth`, figlio di `logiquo-v2`
- **THEN** la risposta ha `cantiere.nome: "oauth"` e `cantiere.percorso: "logiquo-v2/oauth"`
