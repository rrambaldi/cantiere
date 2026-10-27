# cantiere forgia: plugin per Claude Code

Manda al server di cantiere forgia lo stato delle sessioni di Claude Code nelle cartelle che colleghi
a un progetto, senza che nessuno ci pensi: sessioni, turni, todo, il titolo della sessione, un
resoconto di tre righe a fine turno e una copia dei change OpenSpec della cartella. Mai il testo dei
prompt, il resto del transcript o l'output dei tool. Se il server non risponde, il lavoro non si
ferma: gli eventi aspettano in una coda locale.

Richiede **Node.js ≥ 20** nel PATH. Senza Node il plugin non fa nulla e `/cantiere` lo dice.

## Installazione

La guida completa, server e proxy compresi, è in [`../docs/installazione.md`](../docs/installazione.md).

1. In Claude Code: `/plugin marketplace add <percorso o URL git di questa repo>`
2. `/plugin install forgia@forgia`, poi riavvia Claude Code.
3. Nella cartella dei sorgenti di un progetto, con `FORGIA_TOKEN` impostata al token del committente:
   `/cantiere collega <progetto> <url>`, per esempio
   `/cantiere collega poker https://priv.progettazionisoftware.it/cantiere`. Verifica URL e token,
   salva l'area (la radice git, o la cartella se non c'è git), registra il server MCP `forgia` per
   quella cartella. Se il progetto non esiste nel committente, Claude chiede se crearlo.
4. Riavvia Claude Code: da qui i tool `mcp__forgia__*` sono disponibili in quella cartella.
   `/cantiere permessi` li consente senza conferme.
5. Da ora ogni sessione aperta lì dentro è tracciata, con il token del suo committente. Fuori dalle
   cartelle collegate il plugin non manda nulla. `/cantiere stato` per controllare.

Ogni cartella ha il suo committente e il suo progetto: sulla stessa macchina `~/lavori/poker` può
andare con il token di CVSTUDIO e `~/lavori/mercurius` con quello di PRIV. Il token non passa mai
dalla chat. Senza `FORGIA_TOKEN`, lancia da un terminale
`<cartella del plugin>/bin/forgia collega <progetto> --url <url>`, che lo chiede senza mostrarlo
(`/cantiere collega` ti dice il percorso intero). In un repo git le sottocartelle usano il server MCP
della radice; in una cartella senza git, da una sottocartella si rilancia `/cantiere collega`.

## Il comando `/cantiere`

| Forma | Cosa fa |
|---|---|
| `/cantiere <nome> [— descrizione]` | apre il cantiere nel progetto della cartella, o entra in quello aperto con lo stesso nome |
| `/cantiere padre/figlio` o `/cantiere figlio --padre padre` | apre `figlio` sotto `padre` (creato se non c'è); il percorso parte dal primo livello del progetto |
| `/cantiere prendi <percorso>` | prende un'idea della dashboard: crea il change OpenSpec e scrive i suoi file in `openspec/changes/<change>/idee/` |
| `/cantiere dirama <progetto>/<nome> [--task N]` | fa partire un ramo senza lasciare il cantiere: un'idea in quel progetto, legata al cantiere della sessione e al suo task |
| `/cantiere fork <nome> --task N [— descrizione]` | lascia il cantiere per un lavoro nato dal task N: un cantiere nuovo con il suo change piccolo; quando lo archivi la sessione torna da sola al cantiere di partenza, al task N |
| `/cantiere collega <progetto> [url]` | collega la cartella (o cambia URL e token di un'area già collegata) |
| `/cantiere` o `/cantiere stato` | area della cartella, server, ultima sessione |
| `/cantiere permessi` | aggiunge `mcp__forgia` ai permessi consentiti, con un backup di `settings.json` |
| `/cantiere on` / `off` | accende o spegne il tracciamento, in modo persistente |
| `/cantiere comandi on` / `off` | accetta o no i comandi scritti nella dashboard, per l'area della cartella (spenti di default) |

Funziona anche come `/forgia:cantiere`. Un cantiere non si chiude da qui: completato arriva da
`openspec archive`, sospeso e abbandonato si decidono dalla dashboard.

## Comandi dalla dashboard

Con `/cantiere comandi on` gli eventi dell'area portano `comandi: true`, e il server mette nella risposta
i comandi scritti nella dashboard per la sessione, una volta sola. Arrivano anche gli esiti di «Confermo» e
«Non va» dati dal web a una domanda in attesa o a un task di verifica: quelli di un cantiere li riceve la
prima sessione del cantiere che accetta comandi. Il plugin li passa a Claude con l'etichetta
`[forgia] Comando dalla dashboard (non scritto in questa sessione):`: a fine turno bloccando la chiusura
(il comando vince sul blocco per il resoconto, che arriva allo stop dopo), altrimenti nel contesto del
prompt successivo. Una sessione ferma non riceve nulla finché non fa il suo prossimo passo. Spenti (il
default), il plugin non li chiede e ignora quelli che trova in una risposta.

## Cosa arriva al server

- Eventi della sessione (avvio, prompt senza testo, todo, fine turno, fine sessione), con il
  progetto della cartella.
- Il titolo della sessione: quello di `/rename`, altrimenti quello generato da Claude Code. Viene
  dal transcript locale (righe `custom-title` e `ai-title`, formato interno di Claude Code).
- Le domande che Claude fa all'utente e che aspettano risposta: il testo e le opzioni di `AskUserQuestion`,
  e il testo delle notifiche di permesso richiesto o di sessione ferma. La dashboard le mostra con un
  pallino rosso sul cantiere; la risposta si dà dal terminale, oppure dal web con «Confermo» o «Non va»
  se l'area accetta i comandi. Con le esclusioni sotto non parte nulla.
- Dopo ogni turno, se è cambiata, la copia di `openspec/changes/`: per ogni change solo
  `.openspec.yaml`, `proposal.md`, `design.md`, `tasks.md`, i `.md` sotto `specs/` e i `.md`/`.txt`
  sotto `idee/` (fino a 256 KB l'uno), più i nomi dei change archiviati. Nient'altro della cartella.

## Esclusioni e variabili

- Un file `.forgia-off` nella cartella o nella radice git spegne il plugin per quel progetto.
- `FORGIA_DISABLED=1` lo spegne per la sessione.
- `FORGIA_URL` e `FORGIA_TOKEN` servono solo a `/cantiere collega`: gli hook usano sempre il token
  dell'area, così i dati di un committente non partono con il token di un altro.
- `FORGIA_DEBUG=1` scrive input degli hook e risposte del server in `debug.log` nella cache, con
  prompt e messaggi dell'assistente oscurati.

Configurazione: `$XDG_CONFIG_HOME/forgia/config.json` (di default `~/.config/forgia/`, su Windows
`%APPDATA%\forgia\`), permessi 0600, con le aree collegate. Una configurazione della versione 1 vale
come "nessuna area": si ricollega con `/cantiere collega`. Cache, coda e log:
`$XDG_CACHE_HOME/forgia/` (di default `~/.cache/forgia/`, su Windows `%LOCALAPPDATA%\forgia\`). La
coda tiene la cartella dell'area di ogni evento, mai il token.

## Sviluppo

Il sorgente è `bin/forgia.mts`. Si spedisce compilato in `bin/forgia.mjs`, perché il type stripping
di Node costava circa 280 ms a ogni hook. Dalla radice della repo:

```sh
npx tsc -p plugin/tsconfig.build.json   # rigenera bin/forgia.mjs: un test controlla che sia aggiornato
npx tsc -p plugin                       # controllo dei tipi
node --test "plugin/**/*.test.ts"       # test
claude --plugin-dir plugin              # prova del plugin dalla cartella di sviluppo
```

`test/dati/` contiene i payload degli hook e un transcript registrati con Claude Code 2.1.299, più
due transcript di soli titoli, con testi e percorsi sostituiti.
