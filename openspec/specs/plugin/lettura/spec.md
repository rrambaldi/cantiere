# plugin/lettura Specification

## Purpose
Fa leggere a Claude e all'utente i file dei cantieri del committente dell'area (idee, appunti della
dashboard, proposal, design, tasks, specs) senza prenderli, anche senza i tool MCP: i comandi `forgia
cerca` e `forgia leggi` e la skill `cantiere-leggi`.

## Requirements

### Requirement: Ricerca da terminale
`forgia cerca <testo> [--progetto <progetto>] [--json]` MUST chiamare `GET /api/v1/cerca` con le
parole e, se c'è, il progetto, con URL e token dell'area, e cercare in tutti i progetti del
committente se il progetto manca. MUST stampare per ogni cantiere `<progetto>/<percorso> (<stato>)`
con la descrizione e sotto i nomi dei file, poi come leggerli. Con `--json` MUST stampare l'elenco del
server. Senza risultati MUST dirlo, con il committente e le parole.

#### Scenario: Cantiere trovato
- **WHEN** in un'area di `PRIV` si lancia `forgia cerca istruzioni adonis --progetto HMS` e il server trova `HMS/adonis`
- **THEN** il server riceve `GET /api/v1/cerca?testo=istruzioni+adonis&progetto=HMS` con il token dell'area e il comando stampa `HMS/adonis (idea): istruzioni`, poi `  idee/istruzioni.md` e `Per leggerli: forgia leggi "<percorso>" [file] --progetto <progetto>`

#### Scenario: Nessun risultato
- **WHEN** si lancia `forgia cerca zebra` e il server non trova nulla
- **THEN** il comando stampa `Nessun cantiere di PRIV con "zebra"`

### Requirement: Lettura da terminale
`forgia leggi <percorso> [file] [--progetto <progetto>] [--json]` MUST leggere i file del cantiere senza
prenderlo, nel progetto dell'area se `--progetto` manca. Con `file` MUST chiederlo con `?nome=` e
stampare solo il suo contenuto; senza, MUST fare una sola richiesta con `?contenuto=1` e stampare
l'elenco dei file e il contenuto di ognuno, e un file che non si legge MUST comparire con il motivo
senza fermare gli altri. `--json` MUST dare gli stessi dati in JSON. Con più di due argomenti MUST
chiedere le virgolette attorno al percorso.

#### Scenario: Tutti i file
- **WHEN** nell'area del progetto `prova` si lancia `forgia leggi adonis` e il server dà `idee/grande.md` con `errore`
- **THEN** il server riceve solo `GET /api/v1/progetti/prova/cantieri/adonis/file?contenuto=1` e il comando stampa `Cantiere "adonis" (prova, idea): 2 file.`, l'elenco con origine e byte, poi `===== idee/grande.md =====` con `(non letto: <motivo>)` e `===== idee/istruzioni.md =====` con il contenuto

#### Scenario: Un file con le barre nel nome
- **WHEN** si lancia `forgia leggi "tassi BCE/fase uno" specs/x/spec.md --progetto mercurius`
- **THEN** il server riceve `GET /api/v1/progetti/mercurius/cantieri/tassi%20BCE/fase%20uno/file?nome=specs%2Fx%2Fspec.md` e il comando stampa solo `## Requisiti`

#### Scenario: Percorso con spazi senza virgolette
- **WHEN** si lancia `forgia leggi tassi BCE x.md`
- **THEN** il comando esce con errore e dice di mettere il percorso tra virgolette

### Requirement: Elenco dei cantieri con i loro stati
`forgia list [stati] [--progetto <p> | --ovunque] [--json]` MUST elencare, con il token dell'area e
`GET /api/v1/cantieri`, i cantieri del progetto dell'area (di un altro con `--progetto`, di tutti quelli
del committente con `--ovunque`) divisi per stato: aperti, idee, sospesi, completati, abbandonati. Senza
stati MUST mostrare idee, aperti e sospesi e dire quanti sono negli altri stati. Gli stati MUST
accettare singolare e plurale, più `chiusi` (completati e abbandonati) e `tutti`. Ogni riga MUST avere
`#<id>`, il percorso, task, fasi, sessioni attive, domande in attesa e file dell'idea quando ci sono, e
da quando è in quello stato. `forgia list #<id>` MUST mostrare la scheda del cantiere, cercata in tutto il
committente: stato e da quando, change, descrizione, task, fasi con il loro stato, «nato da», sessioni
attive con fatto e prossimo, domande, file dell'idea, `/cantiere prendi #<id>` per un'idea o un aperto
(dalla cartella del suo progetto) e `/cantiere leggi`. `/cantiere list` MUST lanciarlo e mostrarne
l'uscita senza prendere né aprire nulla.

#### Scenario: Elenco del progetto
- **WHEN** in una cartella di `PRIV/prova` si lancia `forgia list`, con l'aperto `analisi`, l'idea `analisi/fase` e il completato `vecchio`
- **THEN** l'uscita ha «Aperti» con `#12 analisi · task 3/7 · …`, «Idee» con `#13 analisi/fase · …` e dice che 1 altro è in altri stati

#### Scenario: Scheda di un cantiere
- **WHEN** si lancia `forgia list #12`
- **THEN** l'uscita ha stato e data, la fase `#13 analisi/fase (idea)`, la sessione attiva con fatto e prossimo e `Per entrarci: /cantiere prendi #12`

#### Scenario: Stato sconosciuto
- **WHEN** si lancia `forgia list finiti`
- **THEN** il comando esce con 1 ed elenca le parole ammesse

### Requirement: Errori della lettura senza token
Fuori da un'area `forgia cerca` e `forgia leggi` MUST uscire con errore e indicare `/cantiere collega
<progetto> <url>`, senza chiamare il server. Un rifiuto del server MUST arrivare all'utente con il
codice e il motivo. Il token MUST NOT comparire nell'output.

#### Scenario: Cartella non collegata
- **WHEN** si lancia `forgia cerca x` o `forgia leggi x` in una cartella che non sta in nessuna area
- **THEN** il comando esce con 1 e `questa cartella non è collegata a cantiere forgia: lancia /cantiere collega <progetto> <url>`, e il server non riceve nulla

#### Scenario: Cantiere inesistente
- **WHEN** si lancia `forgia leggi x` e il server risponde 404
- **THEN** il comando esce con `il server risponde 404: Il cantiere "x" non esiste in prova.`, senza il token

#### Scenario: Token rifiutato
- **WHEN** il server risponde 401
- **THEN** il comando esce con `token non valido: il server risponde 401`, senza il token

### Requirement: Skill cantiere-leggi
Il plugin MUST offrire la skill `cantiere-leggi`, che Claude può usare da solo quando l'utente dice che
qualcosa è nel cantiere, in un'idea o negli appunti della dashboard. La skill MUST consentire solo
`forgia cerca`, `forgia leggi`, `forgia status` e i tool `cerca_cantieri` e `leggi_cantiere` con i due
nomi. MUST far usare i tool se ci sono, altrimenti i comandi, e MUST NOT prendere il cantiere.

#### Scenario: Skill del plugin
- **WHEN** Claude Code carica le skill del plugin
- **THEN** `cantiere-leggi` non ha `disable-model-invocation` e consente solo `Bash(forgia cerca:*)`, `Bash(forgia leggi:*)`, `Bash(forgia status:*)`, `mcp__plugin_forgia_forgia__cerca_cantieri`, `mcp__plugin_forgia_forgia__leggi_cantiere`, `mcp__forgia__cerca_cantieri` e `mcp__forgia__leggi_cantiere`, mentre `cantiere` ha `disable-model-invocation: true`
