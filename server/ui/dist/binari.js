import { StatoBadge } from "./ds/feedback.js";
import { giorno } from "./formato.js";
import { hashDi } from "./indice.js";
import { locale, T } from "./testi.js";
const GIORNO = 86_400_000;
/** Il disegno prende la larghezza vera del riquadro, al pixel: il testo resta della sua misura. Sotto questa scorre. */
const LARGO_MINIMO = 720;
const ETICHETTE = 300;
const DESTRA = 26;
const TESTA = 36;
const CORSIA = 30;
const RIGA = 24;
const FERMO_DA_GIORNI = 3;
/** Un'idea presa più di un'ora dopo la nascita: rombo alla nascita, linea sottile fino alla presa. */
const PRESA_TARDI_MS = 3_600_000;
const NOME_MAX = 32;
export const FINESTRE = [12, 30, null];
const ms = (iso) => Date.parse(iso);
const mezzanotte = (t) => new Date(t).setHours(0, 0, 0, 0);
/**
 * Quando un cantiere è lavoro: dalla nascita, o dalla presa per un'idea della dashboard presa più tardi, fino a oggi
 * o alla chiusura; `mosso` è l'ultimo aggiornamento. Solo per un aperto `stato_il` è la presa: per gli altri è la
 * sospensione o la chiusura. Un completato finisce all'ultimo aggiornamento, perché la data dell'archivio non ha l'ora.
 */
export function intervallo(c, ora) {
    const nato = ms(c.creato_il);
    const presa = c.origine === "dashboard" && c.stato === "aperto" && ms(c.stato_il) - nato > PRESA_TARDI_MS ? ms(c.stato_il) : null;
    const fine = c.stato === "completato" ? ms(c.aggiornato_il) : c.stato === "abbandonato" ? ms(c.stato_il) : ora;
    return { nato, presa, inizio: presa ?? nato, mosso: Math.min(ms(c.aggiornato_il), fine), fine };
}
/** Corsie dei progetti con lavoro nella finestra, dalla più recente; i progetti senza binari a parte. */
export function disponi(cm, ora, finestra) {
    const tutti = cm.progetti.flatMap((p) => p.cantieri);
    const lavori = tutti.filter((c) => c.stato !== "idea");
    const inizio = finestra ? mezzanotte(ora) - (finestra - 1) * GIORNO : mezzanotte(Math.min(ora, ...lavori.map((c) => intervallo(c, ora).inizio)));
    const visibili = new Set(lavori.filter((c) => intervallo(c, ora).fine >= inizio).map((c) => c.id));
    const corsie = [];
    const senza = [];
    const recente = (a, b) => ms(b.aggiornato_il) - ms(a.aggiornato_il);
    for (const p of cm.progetti) {
        const qui = p.cantieri.filter((c) => visibili.has(c.id)).sort(recente);
        if (!qui.length) {
            senza.push(p);
            continue;
        }
        // Sotto un cantiere vanno le sue fasi e i rami nati da lui nello stesso progetto.
        const figli = new Map();
        const sotto = (id, f) => qui.some((x) => x.id === id) && figli.set(id, [...(figli.get(id) ?? []), f]);
        for (const c of qui) {
            if (c.padre_id !== null)
                sotto(c.padre_id, { c, citato: false, fase: true });
            for (const l of c.nato_da)
                sotto(l.id, { c, citato: l.tipo === "citato", fase: false });
        }
        const righe = [];
        // Un giro di legami resta possibile (design di mappa-cantieri): ogni cantiere si mette una volta sola.
        const visti = new Set();
        const metti = (c, livello, padre) => {
            if (visti.has(c.id))
                return;
            visti.add(c.id);
            righe.push({ tipo: "cantiere", c, livello, padre });
            for (const x of tutti)
                for (const l of x.nato_da)
                    if (l.id === c.id && x.progetto !== p.nome)
                        righe.push({ tipo: "moncone", c: x, da: c, citato: l.tipo === "citato" });
            for (const f of figli.get(c.id) ?? [])
                metti(f.c, livello + 1, { id: c.id, citato: f.citato, fase: f.fase });
        };
        const conPadre = new Set([...figli.values()].flat().map((f) => f.c.id));
        for (const c of qui)
            if (!conPadre.has(c.id))
                metti(c, 0, null);
        for (const c of qui)
            metti(c, 0, null);
        const ricevuti = p.cantieri.reduce((n, c) => n + c.nato_da.filter((l) => l.progetto !== p.nome).length, 0);
        corsie.push({ p, righe, ricevuti });
    }
    const ultimo = (k) => Math.max(...k.righe.map((r) => ms(r.c.aggiornato_il)));
    corsie.sort((a, b) => ultimo(b) - ultimo(a));
    return { corsie, senza, inizio, fine: mezzanotte(ora) + GIORNO };
}
const taglia = (s, max) => (s.length > max ? s.slice(0, max - 1) + "…" : s);
const conta = (p, stato) => p.cantieri.filter((c) => c.stato === stato).length;
const riepilogo = (p) => [T.riepilogoProgetto(conta(p, "aperto"), conta(p, "idea"), conta(p, "completato")), ...(p.non_censite ? [T.nonCensiteN(p.non_censite)] : [])].join(" · ");
/** Quello che dice una riga, nel disegno e nel quadro: da quanti giorni è fermo e la sessione da mostrare. */
function statoRiga(c, ora) {
    const t = intervallo(c, ora);
    const aperto = c.stato === "aperto" || c.stato === "sospeso";
    const giorniFermo = Math.floor((ora - t.mosso) / GIORNO);
    return {
        t,
        aperto,
        fermo: aperto && giorniFermo >= FERMO_DA_GIORNI ? giorniFermo : null,
        sessione: c.sessioni.find((s) => s.stato === "lavorando") ?? c.sessioni.find((s) => s.stato === "in_attesa"),
    };
}
/** Rombo, pallino pieno o anello come negli StatoBadge, in SVG. */
function Forma({ c, x, y }) {
    if (c.stato === "idea")
        return React.createElement("polygon", { className: "forma-idea", points: `${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}` });
    return React.createElement("circle", { className: `forma-${c.stato}`, cx: x, cy: y, r: c.stato === "aperto" || c.stato === "completato" ? 4.5 : 4 });
}
export function Binari({ cm, ora = Date.now() }) {
    const [finestra, setFinestra] = React.useState(12);
    const [largo, setLargo] = React.useState(1240);
    const scatola = React.useRef(null);
    const { corsie, senza, inizio, fine } = disponi(cm, ora, finestra);
    React.useEffect(() => {
        const el = scatola.current;
        if (!el)
            return;
        const misura = () => setLargo(Math.max(LARGO_MINIMO, Math.floor(el.clientWidth)));
        misura();
        const osservatore = new ResizeObserver(misura);
        osservatore.observe(el);
        return () => osservatore.disconnect();
    }, [corsie.length > 0]);
    const x = (t) => ETICHETTE + ((Math.min(Math.max(t, inizio), fine) - inizio) / (fine - inizio)) * (largo - ETICHETTE - DESTRA);
    const progettoDi = (c) => cm.progetti.find((p) => p.nome === c.progetto);
    const indirizzo = (c) => hashDi({ tipo: "cantiere", cm, p: progettoDi(c), c });
    const adesso = x(ora);
    const giorni = [];
    for (let g = inizio; g < fine; g = mezzanotte(g + GIORNO * 1.5))
        giorni.push(g);
    // Un'etichetta ogni quanti giorni ci stanno, a circa 44 px l'una.
    const passo = Math.max(1, Math.ceil(44 / ((largo - ETICHETTE - DESTRA) / giorni.length)));
    let y = TESTA;
    const blocchi = corsie.map((k) => {
        const cima = y;
        y += CORSIA + k.righe.length * RIGA;
        return { k, cima };
    });
    const altezza = y + (senza.length ? 36 : 8);
    const centro = new Map();
    for (const { k, cima } of blocchi)
        k.righe.forEach((r, i) => r.tipo === "cantiere" && centro.set(r.c.id, cima + CORSIA + i * RIGA + RIGA / 2));
    return (React.createElement("div", { className: "binari" },
        React.createElement("div", { className: "barra-binari" },
            React.createElement("div", { className: "scelte", role: "group", "aria-label": T.finestraBinari }, FINESTRE.map((f) => (React.createElement("button", { key: String(f), "aria-pressed": f === finestra, onClick: () => setFinestra(f) }, f ? T.giorniN(f) : T.tutto)))),
            React.createElement("span", { className: "legenda" },
                React.createElement("span", { className: "segno si-muove", "aria-hidden": "true" }),
                T.siLavora),
            React.createElement("span", { className: "legenda" },
                React.createElement("span", { className: "segno fermo", "aria-hidden": "true" }),
                T.fermoDaUltimo),
            React.createElement("span", { className: "legenda" },
                React.createElement("span", { className: "segno finito", "aria-hidden": "true" }),
                T.stato.completato)),
        corsie.length === 0 ? React.createElement("p", { className: "vuoto" }, T.nessunBinario) : (React.createElement(React.Fragment, null,
            React.createElement(Quadro, { corsie: corsie, senza: senza, ora: ora, indirizzo: indirizzo }),
            React.createElement("div", { className: "scorre-binari", ref: scatola },
                React.createElement("svg", { width: largo, height: altezza, viewBox: `0 0 ${largo} ${altezza}`, role: "group", "aria-label": T.binariDi(cm.nome) },
                    React.createElement("g", { className: "griglia", "aria-hidden": "true" }, giorni.map((g) => React.createElement("line", { key: g, x1: x(g), y1: TESTA, x2: x(g), y2: y }))),
                    React.createElement("g", { className: "giorni", "aria-hidden": "true" }, giorni.map((g, i) => {
                        if (i % passo)
                            return null;
                        const d = new Date(g);
                        const testo = i === 0 || d.getDate() <= passo ? d.toLocaleDateString(locale, { day: "numeric", month: "short" }) : String(d.getDate());
                        return React.createElement("text", { key: g, x: x(g) + 6, y: 26 }, testo);
                    })),
                    React.createElement("text", { className: "testo-oggi", x: adesso, y: 26, textAnchor: "middle", "aria-hidden": "true" }, T.oggi),
                    blocchi.map(({ k, cima }) => (React.createElement("g", { key: k.p.id },
                        React.createElement("rect", { className: "corsia", x: 0, y: cima, width: largo, height: CORSIA }),
                        React.createElement("text", { className: "nome-progetto", x: 16, y: cima + 20 }, k.p.nome),
                        React.createElement("text", { className: "riepilogo", x: 180, y: cima + 20 }, riepilogo(k.p)),
                        k.ricevuti > 0 && React.createElement("text", { className: "riepilogo", x: largo - 16, y: cima + 20, textAnchor: "end" }, T.ricevutiDa(k.ricevuti)),
                        k.righe.map((r, i) => {
                            const yc = cima + CORSIA + i * RIGA + RIGA / 2;
                            return r.tipo === "moncone"
                                ? React.createElement(Moncone, { key: `m${r.c.id}-${r.da.id}`, r: r, yc: yc, largo: largo, xDa: x(intervallo(r.c, ora).nato), yDa: centro.get(r.da.id), href: indirizzo(r.c) })
                                : React.createElement(Binario, { key: r.c.id, r: r, yc: yc, largo: largo, x: x, ora: ora, adesso: adesso, yPadre: r.padre ? centro.get(r.padre.id) : undefined, href: indirizzo(r.c) });
                        })))),
                    React.createElement("line", { className: "oggi", x1: adesso, y1: TESTA, x2: adesso, y2: y, "aria-hidden": "true" }),
                    senza.length > 0 && (React.createElement(React.Fragment, null,
                        React.createElement("rect", { className: "corsia", x: 0, y: y, width: largo, height: 36 }),
                        React.createElement("text", { className: "riepilogo", x: 16, y: y + 23 }, T.senzaBinari(senza.map((p) => p.nome).join(", ")))))))))));
}
/** Al telefono, al posto del disegno (la soglia è in forgia.css): una riga per cantiere, rami e fasi rientrati come in tree. */
function Quadro({ corsie, senza, ora, indirizzo }) {
    return (React.createElement("div", { className: "quadro-binari" },
        corsie.map((k) => (React.createElement("section", { key: k.p.id },
            React.createElement("h3", null,
                k.p.nome,
                " ",
                React.createElement("span", { className: "secondario" }, riepilogo(k.p))),
            React.createElement("ul", null, k.righe.map((r) => {
                if (r.tipo === "moncone") {
                    return (React.createElement("li", { key: `m${r.c.id}-${r.da.id}`, className: "livello-1" },
                        React.createElement("a", { href: indirizzo(r.c) },
                            React.createElement("span", { className: "nome" },
                                React.createElement("span", { "aria-hidden": "true" }, "\u2514\u2500 "),
                                `${r.c.progetto} / ${r.c.percorso}`),
                            React.createElement("span", { className: "dati" },
                                React.createElement(StatoBadge, { stato: r.c.stato }),
                                React.createElement("span", null, T.ramoIn(r.c.progetto))))));
                }
                const { fermo, sessione } = statoRiga(r.c, ora);
                return (React.createElement("li", { key: r.c.id, className: `livello-${Math.min(r.livello, 3)}` },
                    React.createElement("a", { href: indirizzo(r.c) },
                        React.createElement("span", { className: "nome" },
                            r.livello > 0 && React.createElement("span", { "aria-hidden": "true" }, "\u2514\u2500 "),
                            r.padre?.fase ? r.c.nome : r.c.percorso),
                        React.createElement("span", { className: "dati" },
                            React.createElement(StatoBadge, { stato: r.c.stato }),
                            r.c.task && React.createElement("span", null,
                                r.c.task.fatti,
                                "/",
                                r.c.task.totali),
                            React.createElement("span", { className: fermo !== null ? "fermo" : undefined }, fermo !== null ? T.fermoG(fermo) : giorno(r.c.aggiornato_il)),
                            sessione && React.createElement("span", { className: sessione.stato === "lavorando" ? "lavora" : undefined },
                                sessione.host,
                                " \u00B7 ",
                                T.statoSessione[sessione.stato])))));
            }))))),
        senza.length > 0 && React.createElement("p", { className: "nota" }, T.senzaBinari(senza.map((p) => p.nome).join(", ")))));
}
function Binario({ r, yc, largo, x, ora, adesso, yPadre, href }) {
    const c = r.c;
    const { t, aperto, fermo, sessione } = statoRiga(c, ora);
    const [xi, xm, xf] = [x(t.inizio), x(t.mosso), x(t.fine)];
    // Una fase sotto il suo padre: basta il nome, il percorso lo dice già la riga sopra.
    const nome = (r.livello ? "↳ " : "") + taglia(r.padre?.fase ? c.nome : c.percorso, NOME_MAX - 2 * r.livello);
    return (React.createElement("a", { href: href, className: `riga-binario${aperto ? "" : " chiusa"}`, "aria-label": `${c.percorso}, ${T.stato[c.stato]}${fermo !== null ? ", " + T.fermoG(fermo) : ""}` },
        React.createElement("title", null, c.percorso),
        React.createElement("rect", { className: "sfondo-riga", x: 0, y: yc - RIGA / 2, width: largo, height: RIGA }),
        React.createElement("text", { className: "nome", x: 16 + 12 * r.livello, y: yc + 4 }, nome),
        c.task && React.createElement("text", { className: "conteggio", x: ETICHETTE - 4, y: yc + 4, textAnchor: "end" },
            c.task.fatti,
            "/",
            c.task.totali),
        yPadre !== undefined && React.createElement("line", { className: r.padre.citato ? "legame citato" : "legame", x1: xi, y1: yPadre, x2: xi, y2: yc }),
        t.presa !== null && (React.createElement(React.Fragment, null,
            React.createElement("line", { className: "attesa", x1: x(t.nato), y1: yc, x2: xi, y2: yc }),
            React.createElement("polygon", { className: "forma-idea", points: `${x(t.nato)},${yc - 5} ${x(t.nato) + 5},${yc} ${x(t.nato)},${yc + 5} ${x(t.nato) - 5},${yc}` }))),
        c.stato === "abbandonato"
            ? React.createElement("line", { className: "binario abbandonato", x1: xi, y1: yc, x2: Math.max(xf, xi + 0.5), y2: yc })
            : React.createElement("line", { className: `binario ${aperto ? (c.stato === "sospeso" ? "sospeso" : "si-muove") : "finito"}`, x1: xi, y1: yc, x2: Math.max(xm, xi + 0.5), y2: yc }),
        aperto && React.createElement("line", { className: "binario fermo", x1: xm, y1: yc, x2: adesso, y2: yc }),
        fermo !== null && (React.createElement(React.Fragment, null,
            React.createElement("rect", { className: "sotto-etichetta", x: adesso - 86, y: yc - 7, width: 74, height: 14 }),
            React.createElement("text", { className: "etichetta-fermo", x: adesso - 16, y: yc + 4, textAnchor: "end" }, T.fermoG(fermo)))),
        sessione && (React.createElement(React.Fragment, null,
            React.createElement("circle", { className: sessione.stato === "lavorando" ? "anello-sessione lavora" : "anello-sessione", cx: adesso, cy: yc, r: 9 }),
            React.createElement("text", { className: sessione.stato === "lavorando" ? "etichetta-sessione lavora" : "etichetta-sessione", x: adesso - 16, y: yc + 4, textAnchor: "end" },
                sessione.host,
                " \u00B7 ",
                T.statoSessione[sessione.stato]))),
        React.createElement(Forma, { c: c, x: aperto ? adesso : xf, y: yc })));
}
/** Un ramo in un altro progetto: un tratto dal binario del cantiere di partenza e il nome, senza attraversare le corsie. */
function Moncone({ r, yc, largo, xDa, yDa, href }) {
    return (React.createElement("a", { href: href, className: "riga-binario moncone", "aria-label": `${T.ramoIn(r.c.progetto)}: ${r.c.percorso}` },
        React.createElement("title", null, `${r.c.progetto} / ${r.c.percorso}`),
        React.createElement("rect", { className: "sfondo-riga", x: 0, y: yc - RIGA / 2, width: largo, height: RIGA }),
        React.createElement("text", { className: "nome secondario", x: 28, y: yc + 4 }, "↳ " + T.ramoIn(r.c.progetto)),
        React.createElement("line", { className: r.citato ? "legame citato" : "legame", x1: xDa, y1: yDa, x2: xDa, y2: yc - 6 }),
        React.createElement(Forma, { c: r.c, x: xDa, y: yc }),
        React.createElement("text", { className: "nome", x: xDa + 14, y: yc + 4 }, taglia(`${r.c.progetto} / ${r.c.percorso}`, 48))));
}
