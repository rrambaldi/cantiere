import { Button, Input } from "./ds/core.js";
import { Dialog } from "./ds/feedback.js";
import { finale } from "./formato.js";
import { ZonaFile } from "./lavori.js";
/** Stato di invio di una finestra: occupata mentre aspetta il server, con l'errore se fallisce. */
function useInvio(onChiudi) {
    const [occupato, setOccupato] = React.useState(false);
    const [errore, setErrore] = React.useState();
    const invia = async (azione) => {
        setOccupato(true);
        setErrore(undefined);
        try {
            await azione();
            onChiudi();
        }
        catch (e) {
            setErrore(e.message);
            setOccupato(false);
        }
    };
    return { occupato, errore, invia };
}
function Azioni({ conferma, occupato, onChiudi, onConferma, disabilitato = false }) {
    return (React.createElement(React.Fragment, null,
        React.createElement(Button, { variant: "fantasma", size: "sm", onClick: onChiudi }, "Annulla"),
        React.createElement(Button, { size: "sm", disabled: occupato || disabilitato, onClick: onConferma }, occupato ? "Un momento" : conferma)));
}
const Errore = ({ testo }) => (testo ? React.createElement("p", { className: "errore-dialogo", role: "alert" }, testo) : null);
function Nome({ titolo, conferma, iniziale = "", suggerimento, esegui, onChiudi, children }) {
    const [nome, setNome] = React.useState(iniziale);
    const { occupato, errore, invia } = useInvio(onChiudi);
    return (React.createElement(Dialog, { titolo: titolo, onChiudi: onChiudi, azioni: React.createElement(Azioni, { conferma: conferma, occupato: occupato, disabilitato: !nome.trim(), onChiudi: onChiudi, onConferma: () => invia(() => esegui(nome.trim())) }) },
        children,
        React.createElement(Input, { label: "nome", value: nome, onChange: setNome, hint: suggerimento, error: errore, autoFocus: true })));
}
function Token({ committente, token, onChiudi }) {
    const campo = React.useRef(null);
    const [copiato, setCopiato] = React.useState(false);
    const copia = () => navigator.clipboard.writeText(token).then(() => setCopiato(true), () => campo.current?.select());
    return (React.createElement(Dialog, { titolo: `Token di ${committente}`, onChiudi: onChiudi, azioni: React.createElement(React.Fragment, null,
            React.createElement(Button, { variant: "secondario", size: "sm", onClick: copia }, copiato ? "Copiato" : "Copia"),
            React.createElement(Button, { size: "sm", onClick: onChiudi }, "Ho copiato il token")) },
        React.createElement("p", null, "Copia il token adesso: non verr\u00E0 mostrato di nuovo."),
        React.createElement("input", { ref: campo, className: "token", readOnly: true, value: token, onFocus: (e) => e.target.select(), "aria-label": "token" }),
        React.createElement("p", null,
            "Su ogni macchina che lavora per ",
            committente,
            ": imposta ",
            React.createElement("code", null, "FORGIA_TOKEN"),
            " con questo valore e lancia ",
            React.createElement("code", null, "/cantiere collega <progetto> <url>"),
            " nella cartella dei sorgenti.")));
}
function Idea({ progetto, padre, esegui, onChiudi }) {
    const [nome, setNome] = React.useState("");
    const [descrizione, setDescrizione] = React.useState("");
    const [padreId, setPadreId] = React.useState(padre?.id ?? null);
    const [file, setFile] = React.useState([]);
    const { occupato, errore, invia } = useInvio(onChiudi);
    const padri = progetto.cantieri.filter((c) => !finale(c.stato));
    const aggiungi = (nuovi) => setFile((f) => [...f, ...nuovi.filter((n) => !f.some((v) => v.name === n.name))]);
    return (React.createElement(Dialog, { titolo: `Nuova idea in ${progetto.nome}`, onChiudi: onChiudi, azioni: React.createElement(Azioni, { conferma: "Crea l'idea", occupato: occupato, disabilitato: !nome.trim(), onChiudi: onChiudi, onConferma: () => invia(() => esegui(progetto, nome.trim(), descrizione.trim() || null, padreId, file)) }) },
        React.createElement(Input, { label: "nome", value: nome, onChange: setNome, hint: "Breve e specifico: diventa il nome del change.", error: errore, autoFocus: true }),
        React.createElement(Input, { label: "descrizione", value: descrizione, onChange: setDescrizione, multilinea: true }),
        React.createElement("label", { className: "campo-scelta" },
            React.createElement("span", { className: "etichetta" }, "sotto"),
            React.createElement("select", { value: padreId ?? "", onChange: (e) => setPadreId(e.target.value ? Number(e.target.value) : null) },
                React.createElement("option", { value: "" },
                    "primo livello di ",
                    progetto.nome),
                padri.map((c) => React.createElement("option", { key: c.id, value: c.id }, c.percorso)))),
        React.createElement(ZonaFile, { onFile: aggiungi }),
        file.length > 0 && (React.createElement("ul", { className: "file-scelti" }, file.map((f) => (React.createElement("li", { key: f.name },
            React.createElement("code", null, f.name),
            React.createElement(Button, { variant: "fantasma", size: "sm", onClick: () => setFile(file.filter((v) => v !== f)) }, "Togli"))))))));
}
function Modifica({ cantiere, esegui, onChiudi }) {
    const [nome, setNome] = React.useState(cantiere.nome);
    const [descrizione, setDescrizione] = React.useState(cantiere.descrizione ?? "");
    const { occupato, errore, invia } = useInvio(onChiudi);
    return (React.createElement(Dialog, { titolo: "Modifica l'idea", onChiudi: onChiudi, azioni: React.createElement(Azioni, { conferma: "Salva", occupato: occupato, disabilitato: !nome.trim(), onChiudi: onChiudi, onConferma: () => invia(() => esegui(cantiere, nome.trim(), descrizione.trim() || null)) }) },
        React.createElement(Input, { label: "nome", value: nome, onChange: setNome, hint: "Cambia anche il nome del change.", error: errore, autoFocus: true }),
        React.createElement(Input, { label: "descrizione", value: descrizione, onChange: setDescrizione, multilinea: true })));
}
const FRASI = {
    sospendi: ["Sospendere il cantiere?", "resta tra gli aperti, fermo. Le sessioni che ci lavorano tornano al lavoro diretto sul progetto e Claude non lo propone all'avvio finché è sospeso.", "Sospendi"],
    riattiva: ["Riattivare il cantiere?", "torna in corso e Claude lo propone di nuovo all'avvio delle sessioni.", "Riattiva"],
    abbandona: ["Abbandonare il cantiere?", "passa tra i chiusi con esito abbandonato. Il giornale resta consultabile.", "Abbandona"],
};
function Esito({ cantiere, azione, discendenti, esegui, onChiudi }) {
    const { occupato, errore, invia } = useInvio(onChiudi);
    const [titolo, testo, conferma] = FRASI[azione];
    return (React.createElement(Dialog, { titolo: titolo, onChiudi: onChiudi, azioni: React.createElement(Azioni, { conferma: conferma, occupato: occupato, onChiudi: onChiudi, onConferma: () => invia(() => esegui(cantiere, azione)) }) },
        React.createElement("p", null,
            React.createElement("code", null, cantiere.percorso),
            " ",
            testo),
        azione === "abbandona" && discendenti.length > 0 && (React.createElement("p", null,
            "Vengono abbandonati anche: ",
            discendenti.map((d, i) => React.createElement(React.Fragment, { key: d },
                i ? ", " : "",
                React.createElement("code", null, d))),
            ".")),
        azione === "abbandona" && cantiere.stato !== "idea" && (React.createElement("p", null,
            "Alla prossima sessione in ",
            cantiere.progetto,
            " Claude proporr\u00E0 di archiviare il change con ",
            React.createElement("code", null,
                "openspec archive ",
                cantiere.change,
                " --skip-specs"),
            ".")),
        React.createElement(Errore, { testo: errore })));
}
function Togli({ cantiere, nome, esegui, onChiudi }) {
    const { occupato, errore, invia } = useInvio(onChiudi);
    return (React.createElement(Dialog, { titolo: "Togliere il file?", onChiudi: onChiudi, azioni: React.createElement(Azioni, { conferma: "Togli", occupato: occupato, onChiudi: onChiudi, onConferma: () => invia(() => esegui(cantiere, nome)) }) },
        React.createElement("p", null,
            React.createElement("code", null, nome),
            " esce dall'idea ",
            React.createElement("code", null, cantiere.percorso),
            "."),
        React.createElement(Errore, { testo: errore })));
}
export function Dialoghi({ r, esecutori, onChiudi }) {
    switch (r.tipo) {
        case "committente":
            return React.createElement(Nome, { titolo: "Nuovo committente", conferma: "Crea", esegui: esecutori.creaCommittente, onChiudi: onChiudi, suggerimento: "Lettere, cifre, - e _. Per esempio PRIV o CVSTUDIO." });
        case "token":
            return React.createElement(Token, { committente: r.committente, token: r.token, onChiudi: onChiudi });
        case "rigenera":
            return React.createElement(RigeneraConferma, { committente: r.committente, esegui: esecutori.rigenera, onChiudi: onChiudi });
        case "progetto":
            return React.createElement(Nome, { titolo: `Nuovo progetto in ${r.committente.nome}`, conferma: "Crea", onChiudi: onChiudi, esegui: (nome) => esecutori.creaProgetto(r.committente, nome), suggerimento: "Il prodotto, per esempio poker o mercurius." });
        case "idea":
            return React.createElement(Idea, { progetto: r.progetto, padre: r.padre, esegui: esecutori.creaIdea, onChiudi: onChiudi });
        case "modifica":
            return React.createElement(Modifica, { cantiere: r.cantiere, esegui: esecutori.modifica, onChiudi: onChiudi });
        case "esito":
            return React.createElement(Esito, { cantiere: r.cantiere, azione: r.azione, discendenti: r.discendenti, esegui: esecutori.esito, onChiudi: onChiudi });
        case "togli":
            return React.createElement(Togli, { cantiere: r.cantiere, nome: r.nome, esegui: esecutori.togli, onChiudi: onChiudi });
    }
}
function RigeneraConferma({ committente, esegui, onChiudi }) {
    const { occupato, errore, invia } = useInvio(onChiudi);
    return (React.createElement(Dialog, { titolo: "Rigenerare il token?", onChiudi: onChiudi, azioni: React.createElement(Azioni, { conferma: "Rigenera", occupato: occupato, onChiudi: onChiudi, onConferma: () => invia(() => esegui(committente)) }) },
        React.createElement("p", null,
            "Il token attuale di ",
            React.createElement("strong", null, committente.nome),
            " smette di funzionare subito, su tutte le macchine. Andr\u00E0 ricollegata ogni cartella con il token nuovo."),
        React.createElement(Errore, { testo: errore })));
}
