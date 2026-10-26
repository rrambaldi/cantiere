// Scheda «Binari» del committente: ogni cantiere è una linea nel tempo, dalla nascita (o dalla presa) a oggi o alla
// chiusura; gialla finché si aggiorna, a puntini da quando è fermo. I rami stanno sotto il cantiere da cui sono nati.
import type { Cantiere, Committente, Progetto } from "./api.ts";
import { StatoBadge } from "./ds/feedback.tsx";
import { giorno } from "./formato.ts";
import { hashDi } from "./indice.tsx";
import { locale, T } from "./testi.ts";

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

export type Finestra = 12 | 30 | null;
export const FINESTRE: Finestra[] = [12, 30, null];

const ms = (iso: string) => Date.parse(iso);
const mezzanotte = (t: number) => new Date(t).setHours(0, 0, 0, 0);

/**
 * Quando un cantiere è lavoro: dalla nascita, o dalla presa per un'idea della dashboard presa più tardi, fino a oggi
 * o alla chiusura; `mosso` è l'ultimo aggiornamento. Solo per un aperto `stato_il` è la presa: per gli altri è la
 * sospensione o la chiusura. Un completato finisce all'ultimo aggiornamento, perché la data dell'archivio non ha l'ora.
 */
export function intervallo(c: Cantiere, ora: number) {
  const nato = ms(c.creato_il);
  const presa = c.origine === "dashboard" && c.stato === "aperto" && ms(c.stato_il) - nato > PRESA_TARDI_MS ? ms(c.stato_il) : null;
  const fine = c.stato === "completato" ? ms(c.aggiornato_il) : c.stato === "abbandonato" ? ms(c.stato_il) : ora;
  return { nato, presa, inizio: presa ?? nato, mosso: Math.min(ms(c.aggiornato_il), fine), fine };
}

/** Da dove parte una riga annidata: un ramo (citato o registrato) o una fase del padre. */
type Partenza = { id: number; citato: boolean; fase: boolean };

export type Riga =
  | { tipo: "cantiere"; c: Cantiere; livello: number; padre: Partenza | null }
  | { tipo: "moncone"; c: Cantiere; da: Cantiere; citato: boolean };

export interface Corsia {
  p: Progetto;
  righe: Riga[];
  /** Legami che arrivano ai cantieri di questo progetto da altri progetti. */
  ricevuti: number;
}

/** Corsie dei progetti con lavoro nella finestra, dalla più recente; i progetti senza binari a parte. */
export function disponi(cm: Committente, ora: number, finestra: Finestra) {
  const tutti = cm.progetti.flatMap((p) => p.cantieri);
  const lavori = tutti.filter((c) => c.stato !== "idea");
  const inizio = finestra ? mezzanotte(ora) - (finestra - 1) * GIORNO : mezzanotte(Math.min(ora, ...lavori.map((c) => intervallo(c, ora).inizio)));
  const visibili = new Set(lavori.filter((c) => intervallo(c, ora).fine >= inizio).map((c) => c.id));
  const corsie: Corsia[] = [];
  const senza: Progetto[] = [];
  const recente = (a: Cantiere, b: Cantiere) => ms(b.aggiornato_il) - ms(a.aggiornato_il);
  for (const p of cm.progetti) {
    const qui = p.cantieri.filter((c) => visibili.has(c.id)).sort(recente);
    if (!qui.length) {
      senza.push(p);
      continue;
    }
    // Sotto un cantiere vanno le sue fasi e i rami nati da lui nello stesso progetto.
    const figli = new Map<number, { c: Cantiere; citato: boolean; fase: boolean }[]>();
    const sotto = (id: number, f: { c: Cantiere; citato: boolean; fase: boolean }) => qui.some((x) => x.id === id) && figli.set(id, [...(figli.get(id) ?? []), f]);
    for (const c of qui) {
      if (c.padre_id !== null) sotto(c.padre_id, { c, citato: false, fase: true });
      for (const l of c.nato_da) sotto(l.id, { c, citato: l.tipo === "citato", fase: false });
    }
    const righe: Riga[] = [];
    // Un giro di legami resta possibile (design di mappa-cantieri): ogni cantiere si mette una volta sola.
    const visti = new Set<number>();
    const metti = (c: Cantiere, livello: number, padre: Partenza | null) => {
      if (visti.has(c.id)) return;
      visti.add(c.id);
      righe.push({ tipo: "cantiere", c, livello, padre });
      for (const x of tutti) for (const l of x.nato_da) if (l.id === c.id && x.progetto !== p.nome) righe.push({ tipo: "moncone", c: x, da: c, citato: l.tipo === "citato" });
      for (const f of figli.get(c.id) ?? []) metti(f.c, livello + 1, { id: c.id, citato: f.citato, fase: f.fase });
    };
    const conPadre = new Set([...figli.values()].flat().map((f) => f.c.id));
    for (const c of qui) if (!conPadre.has(c.id)) metti(c, 0, null);
    for (const c of qui) metti(c, 0, null);
    const ricevuti = p.cantieri.reduce((n, c) => n + c.nato_da.filter((l) => l.progetto !== p.nome).length, 0);
    corsie.push({ p, righe, ricevuti });
  }
  const ultimo = (k: Corsia) => Math.max(...k.righe.map((r) => ms(r.c.aggiornato_il)));
  corsie.sort((a, b) => ultimo(b) - ultimo(a));
  return { corsie, senza, inizio, fine: mezzanotte(ora) + GIORNO };
}

const taglia = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);
const conta = (p: Progetto, stato: Cantiere["stato"]) => p.cantieri.filter((c) => c.stato === stato).length;
const riepilogo = (p: Progetto) =>
  [T.riepilogoProgetto(conta(p, "aperto"), conta(p, "idea"), conta(p, "completato")), ...(p.non_censite ? [T.nonCensiteN(p.non_censite)] : [])].join(" · ");

/** Quello che dice una riga, nel disegno e nel quadro: da quanti giorni è fermo e la sessione da mostrare. */
function statoRiga(c: Cantiere, ora: number) {
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
function Forma({ c, x, y }: { c: Cantiere; x: number; y: number }) {
  if (c.stato === "idea") return <polygon className="forma-idea" points={`${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}`} />;
  return <circle className={`forma-${c.stato}`} cx={x} cy={y} r={c.stato === "aperto" || c.stato === "completato" ? 4.5 : 4} />;
}

export function Binari({ cm, ora = Date.now() }: { cm: Committente; ora?: number }) {
  const [finestra, setFinestra] = React.useState<Finestra>(12);
  const [largo, setLargo] = React.useState(1240);
  const scatola = React.useRef<HTMLDivElement>(null);
  const { corsie, senza, inizio, fine } = disponi(cm, ora, finestra);
  React.useEffect(() => {
    const el = scatola.current;
    if (!el) return;
    const misura = () => setLargo(Math.max(LARGO_MINIMO, Math.floor(el.clientWidth)));
    misura();
    const osservatore = new ResizeObserver(misura);
    osservatore.observe(el);
    return () => osservatore.disconnect();
  }, [corsie.length > 0]);
  const x = (t: number) => ETICHETTE + ((Math.min(Math.max(t, inizio), fine) - inizio) / (fine - inizio)) * (largo - ETICHETTE - DESTRA);
  const progettoDi = (c: Cantiere) => cm.progetti.find((p) => p.nome === c.progetto)!;
  const indirizzo = (c: Cantiere) => hashDi({ tipo: "cantiere", cm, p: progettoDi(c), c });
  const adesso = x(ora);
  const giorni: number[] = [];
  for (let g = inizio; g < fine; g = mezzanotte(g + GIORNO * 1.5)) giorni.push(g);
  // Un'etichetta ogni quanti giorni ci stanno, a circa 44 px l'una.
  const passo = Math.max(1, Math.ceil(44 / ((largo - ETICHETTE - DESTRA) / giorni.length)));
  let y = TESTA;
  const blocchi = corsie.map((k) => {
    const cima = y;
    y += CORSIA + k.righe.length * RIGA;
    return { k, cima };
  });
  const altezza = y + (senza.length ? 36 : 8);
  const centro = new Map<number, number>();
  for (const { k, cima } of blocchi) k.righe.forEach((r, i) => r.tipo === "cantiere" && centro.set(r.c.id, cima + CORSIA + i * RIGA + RIGA / 2));

  return (
    <div className="binari">
      <div className="barra-binari">
        <div className="scelte" role="group" aria-label={T.finestraBinari}>
          {FINESTRE.map((f) => (
            <button key={String(f)} aria-pressed={f === finestra} onClick={() => setFinestra(f)}>{f ? T.giorniN(f) : T.tutto}</button>
          ))}
        </div>
        <span className="legenda"><span className="segno si-muove" aria-hidden="true" />{T.siLavora}</span>
        <span className="legenda"><span className="segno fermo" aria-hidden="true" />{T.fermoDaUltimo}</span>
        <span className="legenda"><span className="segno finito" aria-hidden="true" />{T.stato.completato}</span>
      </div>
      {corsie.length === 0 ? <p className="vuoto">{T.nessunBinario}</p> : (
        <>
        <Quadro corsie={corsie} senza={senza} ora={ora} indirizzo={indirizzo} />
        <div className="scorre-binari" ref={scatola}>
          <svg width={largo} height={altezza} viewBox={`0 0 ${largo} ${altezza}`} role="group" aria-label={T.binariDi(cm.nome)}>
            <g className="griglia" aria-hidden="true">
              {giorni.map((g) => <line key={g} x1={x(g)} y1={TESTA} x2={x(g)} y2={y} />)}
            </g>
            <g className="giorni" aria-hidden="true">
              {giorni.map((g, i) => {
                if (i % passo) return null;
                const d = new Date(g);
                const testo = i === 0 || d.getDate() <= passo ? d.toLocaleDateString(locale, { day: "numeric", month: "short" }) : String(d.getDate());
                return <text key={g} x={x(g) + 6} y={26}>{testo}</text>;
              })}
            </g>
            <text className="testo-oggi" x={adesso} y={26} textAnchor="middle" aria-hidden="true">{T.oggi}</text>
            {blocchi.map(({ k, cima }) => (
              <g key={k.p.id}>
                <rect className="corsia" x={0} y={cima} width={largo} height={CORSIA} />
                <text className="nome-progetto" x={16} y={cima + 20}>{k.p.nome}</text>
                <text className="riepilogo" x={180} y={cima + 20}>{riepilogo(k.p)}</text>
                {k.ricevuti > 0 && <text className="riepilogo" x={largo - 16} y={cima + 20} textAnchor="end">{T.ricevutiDa(k.ricevuti)}</text>}
                {k.righe.map((r, i) => {
                  const yc = cima + CORSIA + i * RIGA + RIGA / 2;
                  return r.tipo === "moncone"
                    ? <Moncone key={`m${r.c.id}-${r.da.id}`} r={r} yc={yc} largo={largo} xDa={x(intervallo(r.c, ora).nato)} yDa={centro.get(r.da.id)!} href={indirizzo(r.c)} />
                    : <Binario key={r.c.id} r={r} yc={yc} largo={largo} x={x} ora={ora} adesso={adesso} yPadre={r.padre ? centro.get(r.padre.id) : undefined} href={indirizzo(r.c)} />;
                })}
              </g>
            ))}
            <line className="oggi" x1={adesso} y1={TESTA} x2={adesso} y2={y} aria-hidden="true" />
            {senza.length > 0 && (
              <>
                <rect className="corsia" x={0} y={y} width={largo} height={36} />
                <text className="riepilogo" x={16} y={y + 23}>{T.senzaBinari(senza.map((p) => p.nome).join(", "))}</text>
              </>
            )}
          </svg>
        </div>
        </>
      )}
    </div>
  );
}

/** Al telefono, al posto del disegno (la soglia è in forgia.css): una riga per cantiere, rami e fasi rientrati come in tree. */
function Quadro({ corsie, senza, ora, indirizzo }: { corsie: Corsia[]; senza: Progetto[]; ora: number; indirizzo: (c: Cantiere) => string }) {
  return (
    <div className="quadro-binari">
      {corsie.map((k) => (
        <section key={k.p.id}>
          <h3>{k.p.nome} <span className="secondario">{riepilogo(k.p)}</span></h3>
          <ul>
            {k.righe.map((r) => {
              if (r.tipo === "moncone") {
                return (
                  <li key={`m${r.c.id}-${r.da.id}`} className="livello-1">
                    <a href={indirizzo(r.c)}>
                      <span className="nome"><span aria-hidden="true">└─ </span>{`${r.c.progetto} / ${r.c.percorso}`}</span>
                      <span className="dati"><StatoBadge stato={r.c.stato} /><span>{T.ramoIn(r.c.progetto)}</span></span>
                    </a>
                  </li>
                );
              }
              const { fermo, sessione } = statoRiga(r.c, ora);
              return (
                <li key={r.c.id} className={`livello-${Math.min(r.livello, 3)}`}>
                  <a href={indirizzo(r.c)}>
                    <span className="nome">{r.livello > 0 && <span aria-hidden="true">└─ </span>}{r.padre?.fase ? r.c.nome : r.c.percorso}</span>
                    <span className="dati">
                      <StatoBadge stato={r.c.stato} />
                      {r.c.task && <span>{r.c.task.fatti}/{r.c.task.totali}</span>}
                      <span className={fermo !== null ? "fermo" : undefined}>{fermo !== null ? T.fermoG(fermo) : giorno(r.c.aggiornato_il)}</span>
                      {sessione && <span className={sessione.stato === "lavorando" ? "lavora" : undefined}>{sessione.host} · {T.statoSessione[sessione.stato]}</span>}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {senza.length > 0 && <p className="nota">{T.senzaBinari(senza.map((p) => p.nome).join(", "))}</p>}
    </div>
  );
}

function Binario({ r, yc, largo, x, ora, adesso, yPadre, href }: {
  r: Extract<Riga, { tipo: "cantiere" }>; yc: number; largo: number; x: (t: number) => number; ora: number; adesso: number; yPadre?: number; href: string;
}) {
  const c = r.c;
  const { t, aperto, fermo, sessione } = statoRiga(c, ora);
  const [xi, xm, xf] = [x(t.inizio), x(t.mosso), x(t.fine)];
  // Una fase sotto il suo padre: basta il nome, il percorso lo dice già la riga sopra.
  const nome = (r.livello ? "↳ " : "") + taglia(r.padre?.fase ? c.nome : c.percorso, NOME_MAX - 2 * r.livello);
  return (
    <a href={href} className={`riga-binario${aperto ? "" : " chiusa"}`} aria-label={`${c.percorso}, ${T.stato[c.stato]}${fermo !== null ? ", " + T.fermoG(fermo) : ""}`}>
      <title>{c.percorso}</title>
      <rect className="sfondo-riga" x={0} y={yc - RIGA / 2} width={largo} height={RIGA} />
      <text className="nome" x={16 + 12 * r.livello} y={yc + 4}>{nome}</text>
      {c.task && <text className="conteggio" x={ETICHETTE - 4} y={yc + 4} textAnchor="end">{c.task.fatti}/{c.task.totali}</text>}
      {yPadre !== undefined && <line className={r.padre!.citato ? "legame citato" : "legame"} x1={xi} y1={yPadre} x2={xi} y2={yc} />}
      {t.presa !== null && (
        <>
          <line className="attesa" x1={x(t.nato)} y1={yc} x2={xi} y2={yc} />
          <polygon className="forma-idea" points={`${x(t.nato)},${yc - 5} ${x(t.nato) + 5},${yc} ${x(t.nato)},${yc + 5} ${x(t.nato) - 5},${yc}`} />
        </>
      )}
      {c.stato === "abbandonato"
        ? <line className="binario abbandonato" x1={xi} y1={yc} x2={Math.max(xf, xi + 0.5)} y2={yc} />
        : <line className={`binario ${aperto ? (c.stato === "sospeso" ? "sospeso" : "si-muove") : "finito"}`} x1={xi} y1={yc} x2={Math.max(xm, xi + 0.5)} y2={yc} />}
      {aperto && <line className="binario fermo" x1={xm} y1={yc} x2={adesso} y2={yc} />}
      {fermo !== null && (
        <>
          <rect className="sotto-etichetta" x={adesso - 86} y={yc - 7} width={74} height={14} />
          <text className="etichetta-fermo" x={adesso - 16} y={yc + 4} textAnchor="end">{T.fermoG(fermo)}</text>
        </>
      )}
      {sessione && (
        <>
          <circle className={sessione.stato === "lavorando" ? "anello-sessione lavora" : "anello-sessione"} cx={adesso} cy={yc} r={9} />
          <text className={sessione.stato === "lavorando" ? "etichetta-sessione lavora" : "etichetta-sessione"} x={adesso - 16} y={yc + 4} textAnchor="end">
            {sessione.host} · {T.statoSessione[sessione.stato]}
          </text>
        </>
      )}
      <Forma c={c} x={aperto ? adesso : xf} y={yc} />
    </a>
  );
}

/** Un ramo in un altro progetto: un tratto dal binario del cantiere di partenza e il nome, senza attraversare le corsie. */
function Moncone({ r, yc, largo, xDa, yDa, href }: { r: Extract<Riga, { tipo: "moncone" }>; yc: number; largo: number; xDa: number; yDa: number; href: string }) {
  return (
    <a href={href} className="riga-binario moncone" aria-label={`${T.ramoIn(r.c.progetto)}: ${r.c.percorso}`}>
      <title>{`${r.c.progetto} / ${r.c.percorso}`}</title>
      <rect className="sfondo-riga" x={0} y={yc - RIGA / 2} width={largo} height={RIGA} />
      <text className="nome secondario" x={28} y={yc + 4}>{"↳ " + T.ramoIn(r.c.progetto)}</text>
      <line className={r.citato ? "legame citato" : "legame"} x1={xDa} y1={yDa} x2={xDa} y2={yc - 6} />
      <Forma c={r.c} x={xDa} y={yc} />
      <text className="nome" x={xDa + 14} y={yc + 4}>{taglia(`${r.c.progetto} / ${r.c.percorso}`, 48)}</text>
    </a>
  );
}
