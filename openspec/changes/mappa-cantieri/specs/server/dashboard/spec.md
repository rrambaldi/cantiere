## ADDED Requirements

### Requirement: Task e rami
La pagina di un cantiere MUST avere una scheda «Task e rami» con i task del suo `tasks.md` e, accanto a ciascuno, i cantieri nati da quel task con stato e avanzamento; in testa MUST dire da quale cantiere è nato e quali rami ha, e MUST permettere di mettere e togliere un «nato da». Un ramo senza task MUST stare in testa, non accanto a un task.

#### Scenario: Ramo accanto al suo task
- **WHEN** si apre `multi-instrument-simulations` e `basket-mix` è nato dal suo task 1.1
- **THEN** accanto al task 1.1 c'è `basket-mix` con il suo stato e 7/8, e un clic lo apre

#### Scenario: Nato da messo e tolto dalla scheda
- **WHEN** in «Task e rami» di `b` si sceglie `a`, si scrive il task `2.1` e si preme «Lega», poi si preme la × accanto ad `a`
- **THEN** prima `a` compare in «nato da» con «dal task 2.1», poi sparisce

### Requirement: Binari nel tempo
La pagina di un committente MUST avere una scheda «Binari»: un asse dei giorni e, per ogni cantiere non idea, una linea dalla nascita (o dalla presa, per un'idea presa più tardi) all'ultimo aggiornamento, poi a puntini fino a oggi o alla chiusura. Un cantiere aperto fermo da 3 giorni o più MUST dire da quanti giorni. Le ore MUST essere quelle locali del browser.

#### Scenario: Cantiere fermo
- **WHEN** un cantiere aperto ha l'ultimo aggiornamento di 9 giorni fa
- **THEN** la sua linea è gialla fino a quel giorno, poi a puntini fino a oggi con «fermo 9 g»

### Requirement: Rami nei binari
Nei binari un ramo MUST stare sotto il cantiere da cui è nato e partire dalla sua linea nel momento in cui è nato. Un ramo verso un altro progetto MUST restare un moncone con il nome, e il progetto che lo riceve MUST contarlo nella sua testata.

#### Scenario: Ramo nello stesso progetto
- **WHEN** `basket-mix` è nato da `multi-instrument-simulations` il 20 ottobre
- **THEN** la riga di `basket-mix` sta sotto quella di `multi-instrument-simulations` e la sua linea parte dal 20 ottobre con un tratto verticale dalla linea del padre

### Requirement: Binari al telefono
A 720 px o meno la scheda «Binari» MUST mostrare il quadro ad albero: una riga per cantiere con rientro per i rami, stato, task, sessioni e ultimo aggiornamento.

#### Scenario: Telefono
- **WHEN** si apre «Binari» a 390×844
- **THEN** si vede il quadro ad albero, senza scorrimento orizzontale
