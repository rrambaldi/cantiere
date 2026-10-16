# Server di cantiere forgia

Raccoglie lo stato di lavoro delle sessioni di Claude Code, organizzato per committente, progetto e
cantiere: API REST per gli eventi degli hook, copia dei change OpenSpec, tool MCP per i resoconti di
Claude e una dashboard web. Il contratto con il plugin è in
[`../docs/contratto-v2.md`](../docs/contratto-v2.md).

TypeScript eseguito direttamente da Node ≥ 22.18 (niente build), SQLite in modalità WAL. La
dashboard è React compilato in `ui/dist/` e committato: anche lei non chiede build sul server.

## Avvio in locale

Dalla radice della repo, che è un workspace npm:

```sh
npm ci
cd server
cp deploy/forgia.env.example .env      # poi rivedi i valori
npx forgia-admin migra
npx forgia-admin committente crea PRIV  # stampa il token del committente una volta sola
npm start
```

Il server ascolta su `127.0.0.1:8765`. `npm start` e `forgia-admin` leggono `.env` dalla cartella
corrente; una variabile già presente nell'ambiente vince sul file. Le chiavi sono in
[`deploy/forgia.env.example`](deploy/forgia.env.example).

In locale la dashboard vuole l'header del certificato come in produzione. Per aprirla dal browser
senza nginx, solo in sviluppo: `FORGIA_UI_CERTIFICATO=off` nel `.env`, poi `http://127.0.0.1:8765/`.

Prova del flusso completo, con il server avviato:

```sh
FORGIA_TOKEN=<token del committente> scripts/smoke.sh
```

## Test

```sh
npm test            # tsc --noEmit, poi node --test
npx tsc -p ui       # ricompila la dashboard in ui/dist/ dopo aver toccato ui/src/
```

## Amministrazione

Committenti e progetti si creano anche dalla dashboard. La dashboard è in italiano (predefinito) e in inglese: il selettore IT/EN è in cima all'indice; la scelta resta nel browser e, senza scelta, vale la lingua del browser.

```sh
npx forgia-admin committente crea <nome>      # stampa il token una volta sola
npx forgia-admin committente elenca
npx forgia-admin committente rigenera <nome>  # token nuovo, il vecchio smette subito di valere
npx forgia-admin progetti                      # tabella dei progetti
npx forgia-admin sessioni                      # tabella delle sessioni
npx forgia-admin cantieri                      # tabella dei cantieri
npx forgia-admin pulizia                       # elimina eventi e stati oltre FORGIA_RETENTION_GIORNI
```

Letture JSON con il token di un committente, che vede solo i suoi dati:
`GET /api/v1/progetti`, `GET /api/v1/cantieri?aperti=1&progetto=<nome>`,
`GET /api/v1/sessioni?attive=1&progetto=<nome>`.

## Produzione

Il server ascolta solo in locale; il TLS e il certificato client li fa il reverse proxy. **Un
processo solo**: il rate limit è in memoria.

Serve Linux con systemd e Node ≥ 22.18 di sistema (consigliato Node 24 LTS). Da una copia della
repo:

```sh
sudo server/deploy/installa.sh --host <host pubblico> --committente <nome>
```

Lo script crea l'utente `forgia` e la cartella dati `/var/lib/forgia`, scrive
`/etc/forgia/forgia.env` da `deploy/forgia.env.example` (solo la prima volta), copia il codice in
`/opt/forgia` con `npm ci --omit=dev`, applica le migrazioni, avvia `forgia.service` e
`forgia-pulizia.timer` (pulizia giornaliera), controlla che API e dashboard rispondano e, con
`--committente`, crea il primo committente e stampa il suo token, una volta sola. `--host` è
obbligatorio la prima volta: va in `FORGIA_PUBLIC_HOST`, che il controllo degli host di `/mcp`
richiede. Conta solo il nome del server: con il servizio sotto un percorso,
`https://esempio.it/cantiere` e `esempio.it` danno lo stesso risultato.

Rilanciato, aggiorna codice, dipendenze e database; configurazione e dati restano. Il codice nuovo
si prepara a parte: se `npm ci` fallisce, il servizio in funzione non viene toccato. Da forgia v1 la
v2 riparte da un database vuoto: lo script se ne accorge, si ferma prima di toccare il servizio e
chiede `--azzera-v1` (dopo una copia di `/var/lib/forgia`). Tutte le opzioni con `--help`; la guida
completa, con certificati, plugin e problemi comuni, è in
[`../docs/installazione.md`](../docs/installazione.md).

Altri comandi di amministrazione in produzione:

```sh
cd /opt/forgia/server
sudo -u forgia node --env-file=/etc/forgia/forgia.env src/admin.ts committente crea <nome>
```

### Reverse proxy e certificato client

Il proxy deve:

- inoltrare tutto il percorso pubblico al server, togliendo il prefisso: il server risponde su
  `/api/v1/*` e `/mcp` (Bearer del committente), `/`, `/<committente>` e `/ui/*` (dashboard);
- non bufferizzare le risposte, perché quelle MCP possono essere stream SSE;
- chiedere il certificato client in modo **facoltativo** e passare l'esito al server
  nell'header `X-SSL-Client-Verify`, **sovrascrivendolo sempre**: il server apre la dashboard solo
  con `SUCCESS`, e un client non deve poterlo scrivere da sé.

Esempio nginx per `https://priv.progettazionisoftware.it/cantiere/`, dentro il blocco `server` che
ha già `ssl_certificate`:

```nginx
ssl_client_certificate /etc/nginx/ca-client.pem;   # la CA che firma i certificati client
ssl_verify_client optional;

location = /cantiere { return 301 /cantiere/; }
location /cantiere/ {
    proxy_pass http://127.0.0.1:8765/;               # lo slash finale toglie /cantiere
    proxy_set_header Host $host;
    proxy_set_header X-SSL-Client-Verify $ssl_client_verify;
    proxy_buffering off;
    client_max_body_size 3m;                         # la copia dei change arriva a 2 MB
}
```

Attenzione: in nginx un `proxy_set_header` dentro una `location` cancella quelli ereditati. Tieni
**un solo** blocco `location /cantiere/` che inoltra tutto, così l'header del certificato vale per
ogni rotta. Prova dal browser: `https://<host>/cantiere/` con il certificato risponde 200, senza
risponde 403; `/cantiere/PRIV` apre la dashboard filtrata su PRIV.

Per Caddy c'è un esempio equivalente, non provato, in [`deploy/Caddyfile`](deploy/Caddyfile).

PostgreSQL: `npm install pg` nel workspace del server e `FORGIA_DATABASE_URL=postgres://...`;
le migrazioni sono le stesse.

## Registrare il server in Claude Code a mano

Il plugin lo fa da solo con `/cantiere collega <progetto> <url>`, per la cartella del progetto. Per
le prove, dalla cartella del progetto:

```sh
claude mcp add --transport http --scope local forgia https://<host>/cantiere/mcp --header "Authorization: Bearer <token del committente>"
```
