// Colonna sinistra: committenti → progetti → cantieri, filtrati per scheda (aperti, idee, chiusi).
import type { Cantiere, Committente } from "./api.ts";
import { Logo } from "./ds/brand.tsx";
import { Button, Tabs } from "./ds/core.tsx";
import { StatoBadge } from "./ds/feedback.tsx";
import { ora, profondita, VISTA_DI, type Vista } from "./formato.ts";
import { lingua, T, type Lingua } from "./testi.ts";
import { Pallino, Vuoto } from "./ui.tsx";

export type Selezione = { tipo: "committente" | "progetto" | "cantiere"; id: number };

const stessa = (a: Selezione | null, b: Selezione) => a?.tipo === b.tipo && a.id === b.id;

/** Ordine per segmenti, così i figli seguono subito il padre (`a/b` dopo `a`, prima di `a-x`). */
function perPercorso(a: Cantiere, b: Cantiere): number {
  const x = a.percorso.split("/");
  const y = b.percorso.split("/");
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const c = x[i].localeCompare(y[i], lingua);
    if (c) return c;
  }
  return x.length - y.length;
}

const CHIAVE_CHIUSI = "forgia-committenti-chiusi";

function chiusiSalvati(): number[] {
  try {
    const salvati = JSON.parse(localStorage.getItem(CHIAVE_CHIUSI) ?? "[]");
    return Array.isArray(salvati) ? salvati.filter((x) => typeof x === "number") : [];
  } catch {
    return [];
  }
}

/** Dalla pagina di un committente alla home: URL relativo, così regge il prefisso del proxy. */
const tornaAllaHome = () => window.location.assign("./");

function Voce({ attiva, rientro = 0, onClick, onDoppioClick, children, titolo }: {
  attiva: boolean; rientro?: number; onClick: () => void; onDoppioClick?: () => void; children: React.ReactNode; titolo?: string;
}) {
  return (
    <button className={"voce" + (attiva ? " attiva" : "")} style={{ paddingLeft: 16 + rientro * 14 }} onClick={onClick} onDoubleClick={onDoppioClick} title={titolo} aria-current={attiva || undefined}>
      {children}
    </button>
  );
}

export function Indice({ committenti, selezione, onScegli, vista, onVista, ristretta, onNuovoCommittente, aggiornato, release, errore, onLingua }: {
  committenti: Committente[]; selezione: Selezione | null; onScegli: (s: Selezione) => void; vista: Vista;
  onVista: (v: Vista) => void; ristretta: boolean; onNuovoCommittente: () => void; aggiornato: string | null; release: string | null; errore: string | null; onLingua: (l: Lingua) => void;
}) {
  const [chiusi, setChiusi] = React.useState<number[]>(chiusiSalvati);
  const alterna = (id: number) =>
    setChiusi((c) => {
      const nuovi = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
      try {
        localStorage.setItem(CHIAVE_CHIUSI, JSON.stringify(nuovi));
      } catch {
        // niente archivio del browser: la scelta vale fino al ricaricamento
      }
      return nuovi;
    });
  const tutti = committenti.flatMap((c) => c.progetti.flatMap((p) => p.cantieri));
  const conta = (v: Vista) => tutti.filter((c) => VISTA_DI[c.stato] === v).length;
  return (
    <aside className="indice" aria-label={T.indice}>
      <div className="indice-testa">
        <span onDoubleClick={ristretta ? tornaAllaHome : undefined} title={ristretta ? T.tornaAllaHome : undefined}><Logo size={22} wordmark /></span>
        <span role="group" aria-label={T.lingua} style={{ marginLeft: "auto", display: "inline-flex", gap: 2 }}>
          {(["it", "en"] as const).map((l) => (
            <Button key={l} variant={l === lingua ? "secondario" : "fantasma"} size="sm" onClick={() => onLingua(l)}>{l.toUpperCase()}</Button>
          ))}
        </span>
      </div>
      <div style={{ padding: "0 16px" }}>
        <Tabs value={vista} onChange={onVista} items={[
          { id: "aperti", label: T.aperti, count: conta("aperti") },
          { id: "idee", label: T.idee, count: conta("idee") },
          { id: "chiusi", label: T.chiusi, count: conta("chiusi") },
        ]} />
      </div>
      <nav className="albero">
        {committenti.length === 0 && <Vuoto>{T.nessunCommittente} {ristretta ? "" : T.creaPrimoCommittente}</Vuoto>}
        {committenti.map((cm) => (
          <div key={cm.id} className="gruppo">
            <div className="riga-committente">
              <button className="chevron" onClick={() => alterna(cm.id)} aria-expanded={!chiusi.includes(cm.id)}
                aria-label={chiusi.includes(cm.id) ? T.apriGruppo(cm.nome) : T.chiudiGruppo(cm.nome)}>
                <span aria-hidden="true">{chiusi.includes(cm.id) ? "▸" : "▾"}</span>
              </button>
              <Voce attiva={stessa(selezione, { tipo: "committente", id: cm.id })} onClick={() => onScegli({ tipo: "committente", id: cm.id })}
                onDoppioClick={ristretta ? tornaAllaHome : () => window.location.assign(encodeURIComponent(cm.nome))}
                titolo={ristretta ? T.tornaAllaHome : T.paginaCommittente}>
                <span className="nome-committente">{cm.nome}</span>
                <Pallino n={cm.progetti.reduce((n, p) => n + p.domande_in_attesa, 0)} />
              </Voce>
            </div>
            {!chiusi.includes(cm.id) && cm.progetti.map((p) => {
              const visibili = p.cantieri.filter((c) => VISTA_DI[c.stato] === vista).sort(perPercorso);
              const ids = new Set(visibili.map((c) => c.id));
              return (
                <div key={p.id}>
                  <Voce rientro={0.5} attiva={stessa(selezione, { tipo: "progetto", id: p.id })} onClick={() => onScegli({ tipo: "progetto", id: p.id })}>
                    <span className="nome-progetto">{p.nome}</span>
                    <Pallino n={p.domande_in_attesa} />
                    {p.non_censite > 0 && <span className="a-destra" title={T.attivitaNonCensite}>{T.nonCensiteN(p.non_censite)}</span>}
                  </Voce>
                  {visibili.map((c) => {
                    // Un figlio il cui padre sta in un'altra scheda mostra il percorso intero.
                    const orfano = c.padre_id != null && !ids.has(c.padre_id);
                    return (
                      <Voce key={c.id} rientro={1.5 + (orfano ? 0 : profondita(c))} titolo={c.percorso}
                        attiva={stessa(selezione, { tipo: "cantiere", id: c.id })} onClick={() => onScegli({ tipo: "cantiere", id: c.id })}>
                        <StatoBadge stato={c.stato} etichetta={false} />
                        <span className="nome-cantiere">{orfano ? c.percorso : c.nome}</span>
                        <Pallino n={c.domande_in_attesa} />
                        {c.sessioni.length > 0 && <span className="a-destra" title={T.sessioniAttive}>{c.sessioni.length}</span>}
                      </Voce>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="indice-piede">
        {!ristretta && <Button variant="secondario" size="sm" onClick={onNuovoCommittente} style={{ width: "100%" }}>{T.nuovoCommittente}</Button>}
        <span className={"connessione" + (errore ? " errore" : "")} title={aggiornato ? T.aggiornatoAlle(ora(aggiornato)) : undefined}>
          {errore ?? (release ? T.release(release) : T.caricamentoMin)}
        </span>
      </div>
    </aside>
  );
}
