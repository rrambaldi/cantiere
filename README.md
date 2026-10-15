# cantiere forgia

Tiene traccia del lavoro fatto con Claude Code, organizzato come il lavoro vero: per **committente**
(per chi si lavora), **progetto** (il prodotto) e **cantiere** (un'attività, a volte divisa in
fasi). Ogni cantiere è un change OpenSpec nella cartella del progetto: il repo resta la verità, il
server ne tiene una copia per la dashboard.

Al server arrivano stato, todo, conteggi, il titolo della sessione e i file dei change OpenSpec. Mai
prompt, conversazioni o output dei comandi.

| Parte | Dove | Cosa fa |
|---|---|---|
| Contratto v2 | [`docs/contratto-v2.md`](docs/contratto-v2.md) | API e tool MCP condivisi tra server e plugin |
| Server | [`server/`](server/README.md) | API REST, tool MCP e dashboard web, su SQLite |
| Plugin | [`plugin/`](plugin/README.md) | plugin Claude Code: hook automatici e comando `/cantiere` |

## Come si usa

1. **Server**: installalo con `server/deploy/installa.sh` dietro un reverse proxy con certificato
   client per la dashboard (dettagli in [`server/README.md`](server/README.md)).
2. **Committenti**: creali dalla dashboard; ognuno ha il suo token, che vede solo i suoi dati.
3. **Plugin**, su ogni macchina:

   ```
   /plugin marketplace add <percorso o URL git di questa repo>
   /plugin install forgia@forgia
   ```

4. **Cartelle**: in ogni cartella di sorgenti, con `FORGIA_TOKEN` del suo committente,
   `/cantiere collega <progetto> <url>`. Da lì ogni sessione sa per chi e su cosa lavora, e al primo
   messaggio Claude chiede se continuare un cantiere, prendere un'idea, aprirne uno nuovo o lavorare
   direttamente sul progetto.
5. **Idee**: dalla dashboard si crea un cantiere in stato idea con i suoi file `.md`; da Claude Code
   `/cantiere prendi <percorso>` ne fa un change OpenSpec e si parte con `/opsx:propose`.

Dettagli del plugin in [`plugin/README.md`](plugin/README.md).

Il server è TypeScript eseguito direttamente da Node ≥ 22.18. Il plugin è scritto in TypeScript e
spedito compilato in JavaScript (`plugin/bin/forgia.mjs`), perché parta in fretta a ogni hook.

Il nome tecnico, usato in comandi e identificativi, è `forgia`: `mcp__forgia__*`, `forgia-admin`,
`FORGIA_*`.
