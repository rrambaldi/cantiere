// Dalla dashboard alla sessione: comandi di testo, e «Confermo» / «Non va» su domande in attesa e task di verifica.
import { api } from "./api.js";
import { Button, Input } from "./ds/core.js";
import { quando } from "./formato.js";
import { T } from "./testi.js";
import { BottoneIcona } from "./ui.js";
/** Un invio al server: l'errore resta sotto il campo, così chi scrive dal telefono non perde il testo. */
function useInvio() {
    const [inCorso, setInCorso] = React.useState(false);
    const [errore, setErrore] = React.useState(null);
    const invia = async (azione) => {
        setInCorso(true);
        setErrore(null);
        try {
            await azione();
            return true;
        }
        catch (e) {
            setErrore(e.message);
            return false;
        }
        finally {
            setInCorso(false);
        }
    };
    return { inCorso, errore, invia };
}
const Errore = ({ testo }) => (testo ? React.createElement("span", { className: "errore-campo", role: "alert" }, testo) : null);
/** «Confermo» parte subito; «Non va» apre il campo del feedback, che serve. */
function ConfermaONo({ onEsito }) {
    const [feedback, setFeedback] = React.useState(null);
    const { inCorso, errore, invia } = useInvio();
    const manda = async (e) => {
        if (await invia(() => onEsito(e)))
            setFeedback(null);
    };
    return (React.createElement("div", { className: "conferma-o-no" },
        feedback === null ? (React.createElement("span", { className: "azioni-esito" },
            React.createElement(Button, { size: "sm", disabled: inCorso, onClick: () => void manda({ esito: "confermato" }) }, T.confermo),
            React.createElement(Button, { size: "sm", variant: "secondario", disabled: inCorso, onClick: () => setFeedback("") }, T.nonVa))) : (React.createElement(React.Fragment, null,
            React.createElement(Input, { label: T.cosaNonVa, value: feedback, onChange: setFeedback, multilinea: true, autoFocus: true }),
            React.createElement("span", { className: "azioni-esito" },
                React.createElement(Button, { size: "sm", disabled: inCorso || !feedback.trim(), onClick: () => void manda({ esito: "negato", feedback }) }, T.invia),
                React.createElement(Button, { size: "sm", variant: "fantasma", disabled: inCorso, onClick: () => setFeedback(null) }, T.annulla)))),
        React.createElement(Errore, { testo: errore })));
}
/** «Confermo» o «Non va» su una domanda in attesa: la chiude, e l'esito va alla sessione. */
export const EsitoDomanda = ({ d, onAggiorna }) => (React.createElement(ConfermaONo, { onEsito: (e) => api.esitoDomanda(d, e).then(onAggiorna) }));
/** Stato e orari di un comando, con l'annullo finché aspetta. */
function StatoComando({ c, onAggiorna }) {
    const { inCorso, errore, invia } = useInvio();
    return (React.createElement("span", { className: "stato-comando" },
        React.createElement("span", { className: "secondario" },
            T.statoComando[c.stato],
            " \u00B7 ",
            T.scrittoIl(quando(c.creato_il)),
            c.consegnato_il ? ` · ${T.consegnatoIl(quando(c.consegnato_il))}` : ""),
        c.stato === "in_attesa" && (React.createElement(BottoneIcona, { icona: "chiudi", titolo: T.annullaComando, disabled: inCorso, onClick: () => void invia(() => api.annullaComando(c.id).then(onAggiorna)) })),
        React.createElement(Errore, { testo: errore })));
}
/** Comandi di testo ed esiti delle domande, con stato, orari e annullo. */
export function ListaComandi({ comandi, onAggiorna }) {
    if (!comandi.length)
        return null;
    return (React.createElement("ul", { className: "lista-comandi" }, comandi.map((c) => (React.createElement("li", { key: c.id },
        React.createElement("span", { className: "testo-comando" }, c.esito ? T.esitoDomanda[c.esito](c.testo) : c.testo),
        React.createElement(StatoComando, { c: c, onAggiorna: onAggiorna }))))));
}
/** I comandi di una sessione e il campo per scriverne uno: arriva al suo prossimo passo, non a una sessione ferma. */
export function ComandiSessione({ sessionId, comandi, onAggiorna }) {
    const [testo, setTesto] = React.useState(null);
    const { inCorso, errore, invia } = useInvio();
    const scrivi = async () => {
        if (await invia(() => api.scriviComando(sessionId, testo).then(onAggiorna)))
            setTesto(null);
    };
    return (React.createElement("div", { className: "comandi" },
        React.createElement(ListaComandi, { comandi: comandi, onAggiorna: onAggiorna }),
        testo === null ? (React.createElement(Button, { size: "sm", variant: "secondario", onClick: () => setTesto("") }, T.scriviComando)) : (React.createElement(React.Fragment, null,
            React.createElement(Input, { label: T.comando, hint: T.notaComando, value: testo, onChange: setTesto, multilinea: true, autoFocus: true }),
            React.createElement("span", { className: "azioni-esito" },
                React.createElement(Button, { size: "sm", disabled: inCorso || !testo.trim(), onClick: () => void scrivi() }, T.invia),
                React.createElement(Button, { size: "sm", variant: "fantasma", disabled: inCorso, onClick: () => setTesto(null) }, T.annulla)))),
        React.createElement(Errore, { testo: errore })));
}
/** Un task di verifica: l'ultimo esito dato dal web, che resta finché il tasks.md non smarca il task, e i bottoni per darne uno. */
export function VerificaTask({ cantiere, task, esito, onAggiorna }) {
    return (React.createElement("div", { className: "verifica-task" },
        esito && (React.createElement("span", { className: "esito-task" },
            React.createElement("span", { className: esito.esito === "confermato" ? "confermato" : "negato" }, T.esitoTask[esito.esito](esito.testo)),
            React.createElement(StatoComando, { c: esito, onAggiorna: onAggiorna }))),
        React.createElement(ConfermaONo, { onEsito: (e) => api.esitoTask(cantiere, task, e).then(onAggiorna) })));
}
