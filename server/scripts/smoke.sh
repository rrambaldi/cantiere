#!/bin/sh
# Smoke test: percorre il flusso di forgia v2 contro un server locale avviato.
# Uso: FORGIA_TOKEN=<token di un committente> [FORGIA_URL=http://127.0.0.1:8765] scripts/smoke.sh
# Le chiamate alla dashboard mandano da sé X-SSL-Client-Verify: SUCCESS, come farebbe nginx:
# per questo lo smoke va lanciato contro il server locale, non attraverso il proxy.
# Lascia nel database un progetto e un committente di prova con il prefisso "smoke".
set -eu
URL=${FORGIA_URL:-http://127.0.0.1:8765}
: "${FORGIA_TOKEN:?imposta FORGIA_TOKEN con il token di un committente}"

uuid() { cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen | tr 'A-Z' 'a-z'; }
ID=$(uuid | cut -c1-8)
PROGETTO="smoke-$ID"
SESSIONE="smoke-$(uuid)"
ORA=$(date -u +%Y-%m-%dT%H:%M:%SZ)
OGGI=$(date -u +%Y-%m-%d)

# richiesta METODO PERCORSO [CORPO] [HEADER...]: stampa il corpo, esce se il codice non è 200.
# Con TOKEN vuoto la richiesta va alla dashboard, con gli header del certificato e della UI.
TOKEN=$FORGIA_TOKEN
richiesta() {
	metodo=$1 percorso=$2 corpo=${3:-}
	if [ -n "$TOKEN" ]; then set -- -H "Authorization: Bearer $TOKEN"; else set -- -H "X-SSL-Client-Verify: SUCCESS" -H "X-Forgia-UI: 1"; fi
	[ -z "$corpo" ] || set -- "$@" -H "Content-Type: application/json" --data "$corpo"
	r=$(curl -sS -X "$metodo" "$@" -w '\n%{http_code}' "$URL$percorso")
	codice=$(printf '%s' "$r" | tail -n 1)
	risposta=$(printf '%s' "$r" | sed '$d')
	[ "$codice" = 200 ] || { echo "FALLITO $metodo $percorso: HTTP $codice $risposta" >&2; exit 1; }
	printf '%s\n' "$risposta"
}
ui() ( TOKEN=; richiesta "$@" ) # subshell: in sh un'assegnazione davanti a una funzione resterebbe dopo

# campo JSON ESPRESSIONE: valuta ESPRESSIONE su `j` (il JSON letto da stdin) e la stampa.
campo() { node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(eval(process.argv[1]))})' "$1"; }

evento() { # TIPO DATI [EVENTO_ID]
	printf '{"evento_id":"%s","ts":"%s","tipo":"%s","session_id":"%s","host":"smoke","cwd":"/tmp/smoke","repo":null,"branch":null,"progetto":"%s","dati":%s}' \
		"${3:-$(uuid)}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$SESSIONE" "$PROGETTO" "$2"
}

# atteso DESCRIZIONE VALORE ATTESO
atteso() {
	[ "$2" = "$3" ] && echo "ok  $1" || { echo "FALLITO $1: atteso $3, trovato $2" >&2; exit 1; }
}

atteso "salute v2" "$(richiesta GET /api/v1/salute | campo j.versione_contratto)" 2
atteso "dashboard senza certificato" "$(curl -s -o /dev/null -w '%{http_code}' "$URL/")" 403
atteso "progetto creato" "$(richiesta POST /api/v1/progetti "{\"nome\":\"$PROGETTO\"}" | campo j.progetto.slug)" "$PROGETTO"

AVVIO=$(richiesta POST /api/v1/eventi "$(evento session_start '{"source":"startup"}')")
atteso "avvio in lavoro diretto" "$(printf '%s' "$AVVIO" | campo 'j.cantiere === null && j.contesto.includes("lavoro diretto sul progetto")')" true

PROMPT_ID=$(uuid)
PRIMA=$(richiesta POST /api/v1/eventi "$(evento prompt '{}' "$PROMPT_ID")")
DOPO=$(richiesta POST /api/v1/eventi "$(evento prompt '{}' "$PROMPT_ID")")
atteso "prompt: reinvio idempotente" "$([ "$PRIMA" = "$DOPO" ] && echo uguali)" uguali

APERTO=$(richiesta POST /api/v1/eventi "$(evento apri_cantiere '{"nome":"fase/uno","descrizione":null,"origine":"utente"}')")
atteso "apri_cantiere: change dal percorso" "$(printf '%s' "$APERTO" | campo j.cantiere.change)" fase-uno
atteso "apri_cantiere: conferma" "$(printf '%s' "$APERTO" | campo 'j.contesto.startsWith("[forgia] Comando /cantiere gestito")')" true

COPIA="{\"attivi\":[{\"change\":\"fase-uno\",\"modificato_il\":\"$ORA\",\"file\":[{\"percorso\":\"tasks.md\",\"contenuto\":\"- [x] 1.1 a\\n- [ ] 1.2 b\\n\"}]}],\"archiviati\":[]}"
richiesta PUT "/api/v1/progetti/$PROGETTO/openspec" "$COPIA" >/dev/null
CANTIERI=$(richiesta GET "/api/v1/cantieri?progetto=$PROGETTO")
atteso "copia: task 1 su 2" "$(printf '%s' "$CANTIERI" | campo 'j.cantieri.find((c) => c.change === "fase-uno").task.fatti + "/" + j.cantieri.find((c) => c.change === "fase-uno").task.totali')" 1/2
atteso "fasi del padre" "$(printf '%s' "$CANTIERI" | campo 'JSON.stringify(j.cantieri.find((c) => c.change === "fase").fasi)')" '{"completate":0,"totali":1}'

ALBERO=$(ui GET /ui/api/albero)
ID_PROGETTO=$(printf '%s' "$ALBERO" | campo "j.committenti.flatMap((c) => c.progetti).find((p) => p.slug === \"$PROGETTO\").id")
ID_IDEA=$(ui POST "/ui/api/progetti/$ID_PROGETTO/idee" '{"nome":"Idea Smoke","descrizione":"prova"}' | campo j.cantiere.id)
ui POST "/ui/api/cantieri/$ID_IDEA/file" '{"nome":"nota.md","contenuto":"# nota\n"}' >/dev/null
PRESA=$(richiesta POST "/api/v1/progetti/$PROGETTO/cantieri/idea-smoke/prendi" "{\"session_id\":\"$SESSIONE\",\"host\":\"smoke\",\"cwd\":\"/tmp/smoke\",\"repo\":null,\"branch\":null}")
atteso "presa dell'idea" "$(printf '%s' "$PRESA" | campo 'j.change + " " + j.file.map((f) => f.nome).join(",") + " " + j.cantiere.stato')" "idea-smoke nota.md aperto"

ARCHIVIO="{\"attivi\":[{\"change\":\"idea-smoke\",\"modificato_il\":\"$ORA\",\"file\":[{\"percorso\":\"idee/nota.md\",\"contenuto\":\"# nota\\n\"}]}],\"archiviati\":[{\"change\":\"fase-uno\",\"archiviato_il\":\"$OGGI\"}]}"
richiesta PUT "/api/v1/progetti/$PROGETTO/openspec" "$ARCHIVIO" >/dev/null
atteso "archivio: completato" "$(richiesta GET "/api/v1/cantieri?progetto=$PROGETTO" | campo 'j.cantieri.find((c) => c.change === "fase-uno").stato')" completato

ui POST "/ui/api/cantieri/$ID_IDEA/esito" '{"azione":"abbandona"}' >/dev/null
AVVISO=$(richiesta POST /api/v1/eventi "$(evento prompt '{}')")
atteso "avviso di abbandono" "$(printf '%s' "$AVVISO" | campo 'j.cantiere === null && j.contesto.includes("Idea Smoke è abbandonato")')" true
atteso "da archiviare" "$(richiesta GET "/api/v1/cantieri?progetto=$PROGETTO" | campo 'j.cantieri.find((c) => c.change === "idea-smoke").da_archiviare')" true

ALTRO=$(ui POST /ui/api/committenti "{\"nome\":\"smoke2-$ID\"}" | campo j.token)
atteso "altro committente: nessun progetto" "$(TOKEN=$ALTRO richiesta GET /api/v1/progetti | campo j.progetti.length)" 0
atteso "altro committente: nessun cantiere" "$(TOKEN=$ALTRO richiesta GET /api/v1/cantieri | campo j.cantieri.length)" 0

richiesta POST /api/v1/eventi "$(evento session_end '{"reason":"other","titolo":"smoke"}')" >/dev/null
atteso "titolo della sessione" "$(richiesta GET "/api/v1/sessioni?progetto=$PROGETTO" | campo 'j.sessioni[0].titolo')" smoke
echo "smoke ok: progetto $PROGETTO, sessione $SESSIONE"
