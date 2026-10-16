import { Button, Input } from "./ds/core.js";
import { Dialog } from "./ds/feedback.js";
import { finale } from "./formato.js";
import { CampoTesto, fileDaTesto, ZonaFile } from "./lavori.js";
import { T } from "./testi.js";
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
        React.createElement(Button, { variant: "fantasma", size: "sm", onClick: onChiudi }, T.annulla),
        React.createElement(Button, { size: "sm", disabled: occupato || disabilitato, onClick: onConferma }, occupato ? T.unMomento : conferma)));
}
const Errore = ({ testo }) => (testo ? React.createElement("p", { className: "errore-dialogo", role: "alert" }, testo) : null);
function Nome({ titolo, conferma, iniziale = "", suggerimento, esegui, onChiudi, children }) {
    const [nome, setNome] = React.useState(iniziale);
    const { occupato, errore, invia } = useInvio(onChiudi);
    return (React.createElement(Dialog, { titolo: titolo, onChiudi: onChiudi, azioni: React.createElement(Azioni, { conferma: conferma, occupato: occupato, disabilitato: !nome.trim(), onChiudi: onChiudi, onConferma: () => invia(() => esegui(nome.trim())) }) },
        children,
        React.createElement(Input, { label: T.nome, value: nome, onChange: setNome, hint: suggerimento, error: errore, autoFocus: true })));
}
function Token({ committente, token, onChiudi }) {
    const campo = React.useRef(null);
    const [copiato, setCopiato] = React.useState(false);
    const copia = () => navigator.clipboard.writeText(token).then(() => setCopiato(true), () => campo.current?.select());
    return (React.createElement(Dialog, { titolo: T.tokenDi(committente), onChiudi: onChiudi, azioni: React.createElement(React.Fragment, null,
            React.createElement(Button, { variant: "secondario", size: "sm", onClick: copia }, copiato ? T.copiato : T.copia),
            React.createElement(Button, { size: "sm", onClick: onChiudi }, T.hoCopiato)) },
        React.createElement("p", null, T.copiaOra),
        React.createElement("input", { ref: campo, className: "token", readOnly: true, value: token, onFocus: (e) => e.target.select(), "aria-label": "token" }),
        React.createElement("p", null,
            T.tokenIstruzioni(committente)[0],
            React.createElement("code", null, "FORGIA_TOKEN"),
            T.tokenIstruzioni(committente)[1],
            React.createElement("code", null,
                "/cantiere collega <",
                T.progetto,
                "> <url>"),
            T.tokenIstruzioni(committente)[2])));
}
function Idea({ progetto, padre, esegui, onChiudi }) {
    const [nome, setNome] = React.useState("");
    const [descrizione, setDescrizione] = React.useState("");
    const [padreId, setPadreId] = React.useState(padre?.id ?? null);
    const [file, setFile] = React.useState([]);
    const [scritto, setScritto] = React.useState("");
    const [nomeTesto, setNomeTesto] = React.useState("appunti");
    const { occupato, errore, invia } = useInvio(onChiudi);
    const padri = progetto.cantieri.filter((c) => !finale(c.stato));
    const aggiungi = (nuovi) => setFile((f) => [...f, ...nuovi.filter((n) => !f.some((v) => v.name === n.name))]);
    return (React.createElement(Dialog, { titolo: T.nuovaIdeaIn(progetto.nome), onChiudi: onChiudi, soloPulsanti: true, azioni: React.createElement(Azioni, { conferma: T.creaIdea, occupato: occupato, disabilitato: !nome.trim(), onChiudi: onChiudi, onConferma: () => invia(() => esegui(progetto, nome.trim(), descrizione.trim() || null, padreId, scritto.trim() ? [...file.filter((f) => f.name !== fileDaTesto(nomeTesto, "").name), fileDaTesto(nomeTesto, scritto)] : file)) }) },
        React.createElement(Input, { label: T.nome, value: nome, onChange: setNome, hint: T.suggIdea, error: errore, autoFocus: true }),
        React.createElement(Input, { label: T.descrizione, value: descrizione, onChange: setDescrizione, multilinea: true }),
        React.createElement("label", { className: "campo-scelta" },
            React.createElement("span", { className: "etichetta" }, T.sotto),
            React.createElement("select", { value: padreId ?? "", onChange: (e) => setPadreId(e.target.value ? Number(e.target.value) : null) },
                React.createElement("option", { value: "" }, T.primoLivelloDi(progetto.nome)),
                padri.map((c) => React.createElement("option", { key: c.id, value: c.id }, c.percorso)))),
        React.createElement(ZonaFile, { onFile: aggiungi, conTesto: false }),
        React.createElement(CampoTesto, { scritto: scritto, setScritto: setScritto, nome: nomeTesto, setNome: setNomeTesto }),
        file.length > 0 && (React.createElement("ul", { className: "file-scelti" }, file.map((f) => (React.createElement("li", { key: f.name },
            React.createElement("code", null, f.name),
            React.createElement(Button, { variant: "fantasma", size: "sm", onClick: () => setFile(file.filter((v) => v !== f)) }, T.togli))))))));
}
function Modifica({ cantiere, esegui, onChiudi }) {
    const [nome, setNome] = React.useState(cantiere.nome);
    const [descrizione, setDescrizione] = React.useState(cantiere.descrizione ?? "");
    const { occupato, errore, invia } = useInvio(onChiudi);
    return (React.createElement(Dialog, { titolo: T.modificaIdea, onChiudi: onChiudi, azioni: React.createElement(Azioni, { conferma: T.salva, occupato: occupato, disabilitato: !nome.trim(), onChiudi: onChiudi, onConferma: () => invia(() => esegui(cantiere, nome.trim(), descrizione.trim() || null)) }) },
        React.createElement(Input, { label: T.nome, value: nome, onChange: setNome, hint: T.suggModifica, error: errore, autoFocus: true }),
        React.createElement(Input, { label: T.descrizione, value: descrizione, onChange: setDescrizione, multilinea: true })));
}
function Esito({ cantiere, azione, discendenti, esegui, onChiudi }) {
    const { occupato, errore, invia } = useInvio(onChiudi);
    const [titolo, testo, conferma] = T.esitoTesto[azione];
    return (React.createElement(Dialog, { titolo: titolo, onChiudi: onChiudi, azioni: React.createElement(Azioni, { conferma: conferma, occupato: occupato, onChiudi: onChiudi, onConferma: () => invia(() => esegui(cantiere, azione)) }) },
        React.createElement("p", null,
            React.createElement("code", null, cantiere.percorso),
            " ",
            testo),
        azione === "abbandona" && discendenti.length > 0 && (React.createElement("p", null,
            T.abbandonatiAnche,
            discendenti.map((d, i) => React.createElement(React.Fragment, { key: d },
                i ? ", " : "",
                React.createElement("code", null, d))),
            ".")),
        azione === "abbandona" && cantiere.stato !== "idea" && (React.createElement("p", null,
            T.archiviaProposta(cantiere.progetto)[0],
            React.createElement("code", null,
                "openspec archive ",
                cantiere.change,
                " --skip-specs"),
            T.archiviaProposta(cantiere.progetto)[1])),
        React.createElement(Errore, { testo: errore })));
}
function Togli({ cantiere, nome, esegui, onChiudi }) {
    const { occupato, errore, invia } = useInvio(onChiudi);
    return (React.createElement(Dialog, { titolo: T.togliFileTit, onChiudi: onChiudi, azioni: React.createElement(Azioni, { conferma: T.togli, occupato: occupato, onChiudi: onChiudi, onConferma: () => invia(() => esegui(cantiere, nome)) }) },
        React.createElement("p", null,
            React.createElement("code", null, nome),
            T.togliTesto[0],
            React.createElement("code", null, cantiere.percorso),
            T.togliTesto[1]),
        React.createElement(Errore, { testo: errore })));
}
export function Dialoghi({ r, esecutori, onChiudi }) {
    switch (r.tipo) {
        case "committente":
            return React.createElement(Nome, { titolo: T.nuovoCommittenteTit, conferma: T.crea, esegui: esecutori.creaCommittente, onChiudi: onChiudi, suggerimento: T.suggCommittente });
        case "token":
            return React.createElement(Token, { committente: r.committente, token: r.token, onChiudi: onChiudi });
        case "rigenera":
            return React.createElement(RigeneraConferma, { committente: r.committente, esegui: esecutori.rigenera, onChiudi: onChiudi });
        case "progetto":
            return React.createElement(Nome, { titolo: T.nuovoProgettoIn(r.committente.nome), conferma: T.crea, onChiudi: onChiudi, esegui: (nome) => esecutori.creaProgetto(r.committente, nome), suggerimento: T.suggProgetto });
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
    return (React.createElement(Dialog, { titolo: T.rigeneraTit, onChiudi: onChiudi, azioni: React.createElement(Azioni, { conferma: T.rigenera, occupato: occupato, onChiudi: onChiudi, onConferma: () => invia(() => esegui(committente)) }) },
        React.createElement("p", null,
            T.rigeneraTesto[0],
            React.createElement("strong", null, committente.nome),
            T.rigeneraTesto[1]),
        React.createElement(Errore, { testo: errore })));
}
