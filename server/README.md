# Server di cantiere forgia

Raccoglie lo stato di lavoro delle sessioni di Claude Code: API REST per gli eventi degli hook e
tool MCP per i resoconti di Claude. Il contratto con il plugin è in
[`../docs/contratto-v1.md`](../docs/contratto-v1.md).

TypeScript eseguito direttamente da Node ≥ 22.18 (niente build), SQLite in modalità WAL.

## Avvio in locale

Dalla radice della repo, che è un workspace npm:

```sh
npm ci
cd server
cp deploy/forgia.env.example .env      # poi rivedi i valori
npx forgia-admin migra
npx forgia-admin token crea --cliente portatile    # stampa il token una volta sola
npm start
```

Il server ascolta su `127.0.0.1:8765`. `npm start` e `forgia-admin` leggono `.env` dalla cartella
corrente; una variabile già presente nell'ambiente vince sul file. Le chiavi sono in
[`deploy/forgia.env.example`](deploy/forgia.env.example).

Prova del flusso completo, con il server avviato:

```sh
FORGIA_TOKEN=<token> scripts/smoke.sh
```

## Test

```sh
npm test        # tsc --noEmit, poi node --test
```

## Amministrazione

```sh
npx forgia-admin token crea --cliente <nome>
npx forgia-admin token elenca
npx forgia-admin token revoca --cliente <nome>
npx forgia-admin sessioni          # tabella delle sessioni
npx forgia-admin cantieri          # tabella dei cantieri
npx forgia-admin pulizia           # elimina eventi e stati oltre FORGIA_RETENTION_GIORNI
```

Letture JSON, con lo stesso token: `GET /api/v1/cantieri?aperti=1` e
`GET /api/v1/sessioni?attive=1`.

## Produzione

Il server ascolta solo in locale; il TLS lo fa il reverse proxy. **Un processo solo**: il rate
limit è in memoria.

Serve Linux con systemd e Node ≥ 22.18 di sistema (consigliato Node 24 LTS). Da una copia della
repo:

```sh
sudo server/deploy/installa.sh --host <host pubblico> --cliente <nome>
```

Lo script crea l'utente `forgia` e la cartella dati `/var/lib/forgia`, scrive
`/etc/forgia/forgia.env` da `deploy/forgia.env.example` (solo la prima volta), copia il codice in
`/opt/forgia` con `npm ci --omit=dev`, applica le migrazioni, avvia `forgia.service` e
`forgia-pulizia.timer` (pulizia giornaliera), controlla che il server risponda e stampa il token
del cliente, una volta sola. `--host` è obbligatorio la prima volta: va in `FORGIA_PUBLIC_HOST`,
che il controllo degli host di `/mcp` richiede. Conta solo il nome del server: con il servizio sotto
un percorso, `https://esempio.it/forgia` e `esempio.it` danno lo stesso risultato. `--cliente` è
facoltativo.

Rilanciato, aggiorna codice, dipendenze e database; configurazione e dati restano. Il codice nuovo
si prepara a parte: se `npm ci` fallisce, il servizio in funzione non viene toccato.

Altri comandi di amministrazione in produzione:

```sh
cd /opt/forgia/server
sudo -u forgia node --env-file=/etc/forgia/forgia.env src/admin.ts token crea --cliente <nome>
```

Il reverse proxy è a parte: deve inoltrare a `127.0.0.1:8765` solo `/api/v1/*` e `/mcp`, senza
buffering (le risposte MCP possono essere stream SSE). Sotto un percorso, per esempio `/forgia`, il
proxy deve toglierlo: il server risponde solo su `/api/v1/*` e `/mcp`. Con nginx basta lo slash
finale in `proxy_pass http://127.0.0.1:8765/;` dentro `location /forgia/`. Nel plugin l'URL è
quello intero: `/cantiere server https://esempio.it/forgia`. Esempio per Caddy in
`deploy/Caddyfile`.

PostgreSQL: `npm install pg` nel workspace del server e `FORGIA_DATABASE_URL=postgres://...`;
le migrazioni sono le stesse.

## Registrare il server in Claude Code a mano

Il plugin lo fa da solo con `/cantiere`. Per le prove:

```sh
claude mcp add --transport http --scope user forgia https://<host>/mcp --header "Authorization: Bearer <token>"
```
