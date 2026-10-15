#!/bin/sh
# Installa o aggiorna il server cantiere forgia come servizio systemd. Il reverse proxy è a parte.
# Uso, da una copia della repo: sudo server/deploy/installa.sh [--host <host pubblico>] [--cliente <nome>]
#   --host     host pubblico dietro il proxy (FORGIA_PUBLIC_HOST): obbligatorio la prima volta;
#              va bene anche l'URL intero (https://esempio.it/forgia), si tiene solo il nome
#   --cliente  crea un cliente e stampa il suo token, una volta sola
# Rilanciato aggiorna codice, dipendenze e database; configurazione e dati restano.
set -eu

UTENTE=forgia
CODICE=/opt/forgia
DATI=/var/lib/forgia
CONF=/etc/forgia/forgia.env
UNIT=/etc/systemd/system
REPO=$(cd "$(dirname "$0")/../.." && pwd)

errore() { echo "errore: $*" >&2; exit 1; }

HOST= CLIENTE=
while [ $# -gt 0 ]; do
	case "$1" in
		--host) HOST=${2:?manca il valore di --host}; shift 2 ;;
		--cliente) CLIENTE=${2:?manca il valore di --cliente}; shift 2 ;;
		*) errore "opzione sconosciuta: $1 (l'uso è in testa allo script)" ;;
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

if [ -n "$CLIENTE" ]; then
	echo "== token del cliente $CLIENTE"
	admin token crea --cliente "$CLIENTE"
fi
echo "Altri token: cd $CODICE/server && sudo -u $UTENTE node --env-file=$CONF src/admin.ts token crea --cliente <nome>"
