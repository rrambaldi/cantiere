# Installazione di cantiere forgia

Tre parti, in quest'ordine: il **server** (una volta, sulla macchina che lo ospita), il **proxy** con
il certificato client per la dashboard, il **plugin** su ogni macchina dove si lavora con Claude
Code. Ogni passo finisce con una verifica: se non torna, guarda [Problemi comuni](#problemi-comuni)
prima di andare avanti.

Negli esempi il server è pubblicato su `https://priv.progettazionisoftware.it/cantiere/`.

## Cosa serve

**Sul server**
- Linux con systemd.
- Node.js ≥ 22.18 installato di sistema (per esempio in `/usr/bin`), non con nvm in una home: il
  servizio non vede le home. Consigliato Node 24 LTS.
- nginx con HTTPS già funzionante per l'host.
- Una CA per i certificati client. Se il server ha già l'autenticazione con certificati, usa quella.

**Su ogni macchina di lavoro**
- Claude Code.
- Node.js ≥ 20 nel PATH.
- git e la CLI di OpenSpec (`openspec --version`), che serve a `/cantiere prendi`.

## 1. Server

```sh
git clone https://github.com/rrambaldi/cantiere.git
cd cantiere
sudo server/deploy/installa.sh --host priv.progettazionisoftware.it --committente PRIV
```

Alla fine lo script stampa il token di `PRIV`, **una volta sola**: copialo. `--host` vuole il nome del
server; va bene anche l'URL intero, il percorso `/cantiere` lo toglie da sé. Le opzioni sono in
`sudo server/deploy/installa.sh --help`, i dettagli in [`server/README.md`](../server/README.md).

**Verifica**, sul server:

```sh
systemctl status forgia          # active (running)
journalctl -u forgia -n 20       # l'ultima riga di avvio è {"tipo":"avvio",...}
```

### Aggiornare

```sh
git pull
sudo server/deploy/installa.sh
```

Configurazione (`/etc/forgia/forgia.env`) e dati (`/var/lib/forgia`) restano. Il codice nuovo si
prepara a parte: se qualcosa fallisce prima delle migrazioni, il servizio in funzione non cambia.

### Passaggio da forgia v1

La v2 riparte da un database vuoto. Se lo script trova un database v1 si ferma prima di toccare il
servizio. Per andare avanti:

```sh
sudo systemctl stop forgia
sudo cp -a /var/lib/forgia /var/lib/forgia.v1      # copia dei dati v1, con -wal e -shm
sudo server/deploy/installa.sh --azzera-v1 --committente PRIV
```

Il plugin v1 smette di funzionare finché non lo aggiorni (passo 6). Su ogni macchina togli anche la
vecchia registrazione a livello utente: `claude mcp remove forgia --scope user`.

## 2. Certificato client per la dashboard

La dashboard si apre solo con un certificato client firmato dalla CA che nginx conosce. API e tool
MCP non lo chiedono: usano il token del committente.

Se hai già una CA, ti servono il suo certificato (per nginx) e un certificato client firmato da lei,
in formato `.p12` (per il browser). Se non ce l'hai, questi comandi creano tutto:

```sh
# la CA: tieni ca.key in un posto sicuro, fuori dal server
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=CA forgia" -keyout ca.key -out ca-client.pem

# un certificato client per persona, qui per "admin"
openssl req -newkey rsa:2048 -nodes -subj "/CN=admin" -keyout client.key -out client.csr
openssl x509 -req -in client.csr -CA ca-client.pem -CAkey ca.key -CAcreateserial -days 825 -out client.pem

# il file da importare nel browser (chiede una password)
openssl pkcs12 -export -in client.pem -inkey client.key -name "forgia admin" -out client.p12
```

Copia `ca-client.pem` sul server (per esempio in `/etc/nginx/ca-client.pem`) e importa `client.p12`
nel browser, tra i certificati personali.

## 3. nginx

Il blocco da aggiungere è in [`server/README.md`, "Reverse proxy e certificato
client"](../server/README.md#reverse-proxy-e-certificato-client). I punti che contano:

- `proxy_pass http://127.0.0.1:8765/;` con lo slash finale, che toglie `/cantiere`;
- `ssl_verify_client optional;` e `ssl_client_certificate` con la CA del passo 2;
- `proxy_set_header X-SSL-Client-Verify $ssl_client_verify;` dentro **un solo** blocco
  `location /cantiere/`, che inoltra tutto;
- `proxy_buffering off;` e `client_max_body_size 3m;`.

```sh
sudo nginx -t && sudo systemctl reload nginx
```

## 4. Verifica dall'esterno

Da una macchina qualsiasi, con il token del passo 1 e i file del passo 2:

```sh
H=https://priv.progettazionisoftware.it/cantiere
curl -s -o /dev/null -w '%{http_code}\n' $H/                                            # 403
curl -s -o /dev/null -w '%{http_code}\n' --cert client.pem --key client.key $H/         # 200
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-SSL-Client-Verify: SUCCESS' $H/          # 403
curl -s -H "Authorization: Bearer <token di PRIV>" $H/api/v1/salute
# {"ok":true,"versione_contratto":2,"cliente":"PRIV"}
```

Il terzo comando è il più importante: un header falsificato senza certificato deve restare fuori.
Poi apri `https://priv.progettazionisoftware.it/cantiere/` nel browser con il certificato.

## 5. Committenti

Dalla dashboard: **Nuovo committente**, il nome (per esempio `CVSTUDIO`), **Crea**. Il token compare
una volta sola: copialo e passalo a chi lavora per quel committente. Ogni committente ha un token, e
quel token vede solo i suoi dati. **Rigenera token** lo sostituisce: il vecchio smette subito di
valere, e le macchine vanno ricollegate (passo 7).

Da terminale, sul server:

```sh
cd /opt/forgia/server
sudo -u forgia node --env-file=/etc/forgia/forgia.env src/admin.ts committente crea CVSTUDIO
```

## 6. Plugin, su ogni macchina

In Claude Code:

```
/plugin marketplace add rrambaldi/cantiere
/plugin install forgia@forgia
```

Poi riavvia Claude Code. Il marketplace legge il branch principale della repo: la v2 arriva da lì
quando `forgia-v2` è unito in `main`. Se avevi la v1, aggiornala dal menu `/plugin`.

**Verifica**: `node --version` dà almeno 20 sulla macchina di lavoro (22.18 sul server) e `openspec --version` risponde.

## 7. Collegare le cartelle dei sorgenti

Una volta per ogni cartella di progetto, con il token del suo committente:

```sh
cd ~/lavori/poker
FORGIA_TOKEN=<token di CVSTUDIO> claude
```

e in Claude Code:

```
/cantiere collega poker https://priv.progettazionisoftware.it/cantiere
```

Se il progetto non esiste nel committente, Claude chiede se crearlo. Poi riavvia Claude Code in
quella cartella, così arrivano i tool MCP, e lancia una volta `/cantiere permessi` per usarli senza
conferme.

Il token non va scritto in chat. Senza `FORGIA_TOKEN`, `/cantiere collega` ti dà il comando da
lanciare in un terminale, che chiede il token senza mostrarlo.

- La cartella collegata è la radice git, se c'è: le sottocartelle sono comprese.
- In una cartella senza git, se apri Claude Code in una sottocartella, rilancia lì
  `/cantiere collega`: altrimenti gli eventi arrivano ma i tool MCP no.
- Sulla stessa macchina cartelle diverse possono andare con committenti diversi.

**Verifica**: `/cantiere stato` mostra `CVSTUDIO/poker`, il server raggiungibile e il token
mascherato.

## 8. Primo uso

Apri Claude Code nella cartella collegata e scrivi il primo messaggio: Claude chiede dove va la
sessione (un cantiere aperto, un'idea, un cantiere nuovo, oppure lavoro diretto sul progetto). Le
idee nascono dalla dashboard e si prendono con `/cantiere prendi <percorso>`, che crea il change
OpenSpec con i file dell'idea in `idee/`. Il resto è in [`plugin/README.md`](../plugin/README.md).

## Problemi comuni

| Sintomo | Causa probabile | Cosa fare |
|---|---|---|
| `installa.sh`: "Node è in /home/..." | Node installato con nvm | Installa Node di sistema (pacchetti della distribuzione o NodeSource) |
| `installa.sh`: "è un database di forgia v1" | passaggio da v1 a v2 | [Passaggio da forgia v1](#passaggio-da-forgia-v1) |
| Dashboard 403 anche con il certificato | l'header non arriva al server: un altro `proxy_set_header` in una `location` cancella quello ereditato, oppure la CA non è quella del certificato | Un solo `location /cantiere/` con tutti i `proxy_set_header`; controlla `ssl_client_certificate` |
| Dashboard 200 senza certificato | `FORGIA_UI_CERTIFICATO=off` in `/etc/forgia/forgia.env` | Toglilo: vale solo per lo sviluppo |
| Pagina bianca o 404 sotto `/cantiere` | `proxy_pass` senza slash finale, o manca il redirect di `/cantiere` | Copia il blocco del README così com'è |
| `/mcp` risponde 403 | `FORGIA_PUBLIC_HOST` diverso dal nome del server | Rilancia `installa.sh --host <nome>` |
| `/cantiere collega`: "il server usa la versione 1 del contratto, serve la 2" | il server è ancora v1 | Aggiorna il server (passo 1) |
| 401 dopo aver rigenerato un token | le macchine usano il token vecchio | `/cantiere collega` con il token nuovo, in ogni cartella |
| Nessun tool `mcp__forgia__*` | Claude Code non riavviato dopo il collegamento, o sottocartella senza git | Riavvia; senza git rilancia `/cantiere collega` dalla sottocartella |
| Nessun evento da una cartella | cartella non collegata, `.forgia-off`, oppure `forgia off` | `/cantiere stato` |
| Un file di un change non arriva in dashboard | supera 256 KB: il plugin non lo manda | Dividilo in file più piccoli |
| Nessun change di un progetto arriva in dashboard | la copia supera 2 MB | Alza `FORGIA_MAX_OPENSPEC` sul server e `client_max_body_size` in nginx |
