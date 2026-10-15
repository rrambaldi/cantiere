#!/bin/sh
# Smoke test: percorre il flusso di una sessione contro un server avviato.
# Uso: FORGIA_TOKEN=<token> [FORGIA_URL=http://127.0.0.1:8765] scripts/smoke.sh
set -eu
URL=${FORGIA_URL:-http://127.0.0.1:8765}
: "${FORGIA_TOKEN:?imposta FORGIA_TOKEN con un token creato da forgia-admin}"

uuid() { cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen | tr 'A-Z' 'a-z'; }
SESSIONE="smoke-$(uuid)"

# richiesta METODO PERCORSO [CORPO]: stampa il corpo della risposta, esce se il codice non è 200.
richiesta() {
	if [ $# -ge 3 ]; then
		r=$(curl -sS -X "$1" -H "Authorization: Bearer $FORGIA_TOKEN" -H "Content-Type: application/json" --data "$3" -w '\n%{http_code}' "$URL$2")
	else
		r=$(curl -sS -X "$1" -H "Authorization: Bearer $FORGIA_TOKEN" -w '\n%{http_code}' "$URL$2")
	fi
	codice=$(printf '%s' "$r" | tail -n 1)
	corpo=$(printf '%s' "$r" | sed '$d')
	[ "$codice" = 200 ] || { echo "FALLITO $1 $2: HTTP $codice $corpo" >&2; exit 1; }
	printf '%s\n' "$corpo"
}

evento() { # TIPO DATI [EVENTO_ID]
	printf '{"evento_id":"%s","ts":"%s","tipo":"%s","session_id":"%s","host":"smoke","cwd":"/tmp/smoke","repo":null,"branch":null,"dati":%s}' \
		"${3:-$(uuid)}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$SESSIONE" "$2"
}

# atteso DESCRIZIONE TESTO SOTTOSTRINGA
atteso() {
	case "$2" in *"$3"*) echo "ok  $1" ;; *) echo "FALLITO $1: manca $3 in $2" >&2; exit 1 ;; esac
}

atteso "salute" "$(richiesta GET /api/v1/salute)" '"versione_contratto":1'
atteso "session_start: cantiere provvisorio" "$(richiesta POST /api/v1/eventi "$(evento session_start '{"source":"startup"}')")" "session_id=$SESSIONE"

PROMPT_ID=$(uuid)
PRIMA=$(richiesta POST /api/v1/eventi "$(evento prompt '{}' "$PROMPT_ID")")
DOPO=$(richiesta POST /api/v1/eventi "$(evento prompt '{}' "$PROMPT_ID")")
atteso "prompt: hint del provvisorio" "$PRIMA" "Cantiere provvisorio"
[ "$PRIMA" = "$DOPO" ] && echo "ok  prompt: reinvio idempotente" || { echo "FALLITO reinvio: risposte diverse" >&2; exit 1; }

atteso "todo" "$(richiesta POST /api/v1/eventi "$(evento todo '{"strumento":"TodoWrite","completo":true,"todos":[{"id":null,"testo":"prova smoke","stato":"in_progress"}]}')")" '"contesto":null'
atteso "apri_cantiere" "$(richiesta POST /api/v1/eventi "$(evento apri_cantiere '{"nome":"smoke-test","descrizione":null,"origine":"utente"}')")" "Comando /cantiere gestito"
atteso "stop" "$(richiesta POST /api/v1/eventi "$(evento stop '{"strumenti_nel_turno":3,"resoconto_inviato":false,"bloccato":false}')")" '"confermato":true'
atteso "sessioni attive" "$(richiesta GET '/api/v1/sessioni?attive=1')" "$SESSIONE"
atteso "cantieri aperti" "$(richiesta GET '/api/v1/cantieri?aperti=1')" '"nome":"smoke-test"'
atteso "chiudi_cantiere" "$(richiesta POST /api/v1/eventi "$(evento chiudi_cantiere '{"esito":"completato","nota":"smoke"}')")" '"cantiere":null'
atteso "session_end" "$(richiesta POST /api/v1/eventi "$(evento session_end '{"reason":"other"}')")" '"contesto":null'
echo "smoke ok: sessione $SESSIONE"
