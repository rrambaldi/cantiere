#!/bin/sh
# Installa o aggiorna il server cantiere forgia come servizio systemd. Il reverse proxy è a parte.
# Uso, da una copia della repo: sudo server/deploy/installa.sh [--host <host pubblico>] [--committente <nome>] [--azzera-v1]
#   --host     host pubblico dietro il proxy (FORGIA_PUBLIC_HOST): obbligatorio la prima volta;
#              va bene anche l'URL intero (https://esempio.it/forgia), si tiene solo il nome
#   --committente  crea un committente e stampa il suo token, una volta sola
#   --azzera-v1    conferma il passaggio da forgia v1: la v2 riparte da un database vuoto
#   -h, --help     mostra questo aiuto
# Rilanciato aggiorna codice, dipendenze e database; configurazione e dati restano, tranne nel
# passaggio da v1 a v2, che senza --azzera-v1 si ferma prima di toccare il servizio.
# Guida completa, con proxy, certificati e plugin: docs/installazione.md
set -eu

UTENTE=forgia
CODICE=/opt/forgia
DATI=/var/lib/forgia
CONF=/etc/forgia/forgia.env
UNIT=/etc/systemd/system
REPO=$(cd "$(dirname "$0")/../.." && pwd)

errore() { echo "errore: $*" >&2; exit 1; }

HOST= COMMITTENTE= AZZERA_V1=
while [ $# -gt 0 ]; do
	case "$1" in
		--host) HOST=${2:?manca il valore di --host}; shift 2 ;;
		--committente) COMMITTENTE=${2:?manca il valore di --committente}; shift 2 ;;
		--azzera-v1) AZZERA_V1=1; shift ;;
		-h | --help) sed -n '2,/^set -eu/s/^# \{0,1\}//p' "$0"; exit 0 ;;
		*) errore "opzione sconosciuta: $1 (vedi --help)" ;;
	esac
done
# Il controllo degli host di /mcp confronta solo il nome: schema e percorso (/forgia) li toglie il proxy.
NOME_HOST=${HOST#*://}
NOME_HOST=${NOME_HOST%%/*}
[ "$NOME_HOST" = "$HOST" ] || echo "--host: uso solo il nome del server, $NOME_HOST"
HOST=$NOME_HOST

[ "$(id -u)" -eq 0 ] || errore "serve root: lancia con sudo"
command -v systemctl >/dev/null || errore "serve systemd"
command -v npm >/dev/null || errore "npm non trovato"
NODE=$(command -v node) || errore "Node non trovato: installa Node >= 22.18 di sistema (consigliato 24 LTS)"
# ProtectHome nella unit: un Node installato in una home (nvm) il servizio non lo vede.
case "$NODE" in /home/* | /root/*) errore "Node è in $NODE: il servizio non vede le home, installalo di sistema" ;; esac
"$NODE" -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 18) ? 0 : 1)' ||
	errore "serve Node >= 22.18, trovato $("$NODE" --version)"
[ -f "$CONF" ] || [ -n "$HOST" ] || errore "prima installazione: serve --host <host pubblico>"

echo "== utente $UTENTE e cartella dati $DATI"
id -u "$UTENTE" >/dev/null 2>&1 ||
	useradd --system --user-group --home-dir "$DATI" --no-create-home --shell /usr/sbin/nologin "$UTENTE"
install -d -o "$UTENTE" -g "$UTENTE" -m 750 "$DATI"

echo "== configurazione $CONF"
if [ ! -f "$CONF" ]; then
	install -d -m 755 "$(dirname "$CONF")"
	sed -e "s|^FORGIA_DATABASE_URL=.*|FORGIA_DATABASE_URL=sqlite:$DATI/forgia.db|" \
		"$REPO/server/deploy/forgia.env.example" >"$CONF"
	chown root:"$UTENTE" "$CONF"
	chmod 640 "$CONF"
fi
[ -z "$HOST" ] || sed -i "s|^FORGIA_PUBLIC_HOST=.*|FORGIA_PUBLIC_HOST=$HOST|" "$CONF"

# Il codice nuovo si prepara a parte: se npm ci fallisce, il servizio in funzione resta com'è.
echo "== codice e dipendenze"
rm -rf "$CODICE.nuovo"
mkdir -p "$CODICE.nuovo"
tar -C "$REPO" --exclude=node_modules --exclude=.env --exclude='*.db*' -cf - package.json package-lock.json server |
	tar -C "$CODICE.nuovo" --no-same-owner -xf -
(cd "$CODICE.nuovo" && npm ci --omit=dev --no-audit --no-fund)
chmod -R a+rX "$CODICE.nuovo"

# Da v1 a v2 la migrazione 0002 svuota il database: senza conferma ci si ferma qui, a servizio intatto.
DB=$(sed -n 's/^FORGIA_DATABASE_URL=sqlite://p' "$CONF")
if [ -z "$AZZERA_V1" ] && [ -n "$DB" ] && [ -f "$DB" ] &&
	"$NODE" -e 'const Db = require(process.argv[1]); const db = new Db(process.argv[2], { readonly: true });
		process.exit(db.prepare("select 1 from sqlite_master where name = ?").get("clienti") ? 0 : 1)' \
		"$CODICE.nuovo/node_modules/better-sqlite3" "$DB"; then
	errore "$DB è un database di forgia v1: la v2 riparte da zero e i suoi dati si perdono. Copia il file (con -wal e -shm, se ci sono), poi rilancia con --azzera-v1"
fi

echo "== unit systemd"
for unit in forgia.service forgia-pulizia.service forgia-pulizia.timer; do
	sed "s|/usr/bin/node|$NODE|" "$REPO/server/deploy/$unit" >"$UNIT/$unit"
done
systemctl daemon-reload

echo "== sostituzione del codice e migrazioni"
systemctl stop forgia.service
rm -rf "$CODICE.vecchio"
[ ! -d "$CODICE" ] || mv "$CODICE" "$CODICE.vecchio"
mv "$CODICE.nuovo" "$CODICE"
rm -rf "$CODICE.vecchio"
cd "$CODICE/server"
admin() { runuser -u "$UTENTE" -- "$NODE" --env-file="$CONF" src/admin.ts "$@"; }
admin migra

echo "== avvio"
systemctl enable --now forgia.service forgia-pulizia.timer
BIND=$(sed -n 's/^FORGIA_BIND=//p' "$CONF")
URL="http://${BIND:-127.0.0.1:8765}/api/v1/salute"
# Senza token il server acceso risponde 401: basta per sapere che è su.
for tentativo in 1 2 3 4 5 6 7 8 9 10; do
	"$NODE" -e 'fetch(process.argv[1]).then((r) => process.exit(r.status === 401 ? 0 : 1), () => process.exit(1))' "$URL" && break
	if [ "$tentativo" -eq 10 ]; then
		journalctl -u forgia.service -n 20 --no-pager >&2
		errore "il servizio non risponde su $URL"
	fi
	sleep 1
done
echo "forgia attivo su ${BIND:-127.0.0.1:8765}; pulizia giornaliera con forgia-pulizia.timer."

# Senza l'header del certificato la dashboard deve rispondere 403; 200 vuol dire FORGIA_UI_CERTIFICATO=off.
DASHBOARD=$("$NODE" -e 'fetch(process.argv[1]).then((r) => console.log(r.status), () => console.log(0))' "http://${BIND:-127.0.0.1:8765}/")
case "$DASHBOARD" in
	403) echo "Dashboard attiva, aperta solo col certificato client: configura il proxy come nel README." ;;
	200) echo "attenzione: la dashboard risponde senza certificato (FORGIA_UI_CERTIFICATO=off), va bene solo in sviluppo" >&2 ;;
	*) errore "la dashboard risponde $DASHBOARD invece di 403" ;;
esac

if [ -n "$COMMITTENTE" ]; then
	echo "== committente $COMMITTENTE e il suo token"
	admin committente crea "$COMMITTENTE"
fi
echo "Altri committenti: dalla dashboard, oppure cd $CODICE/server && sudo -u $UTENTE node --env-file=$CONF src/admin.ts committente crea <nome>"
