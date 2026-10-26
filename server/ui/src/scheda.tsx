// Colonna destra: scheda tecnica del cantiere, del progetto o del committente scelto, con le loro azioni.
import type { Azione, Committente, Dettaglio, Progetto } from "./api.ts";
import { Button, Checkbox } from "./ds/core.tsx";
import { StatoBadge } from "./ds/feedback.tsx";
import { eta, finale, giorno, quando } from "./formato.ts";
import { T } from "./testi.ts";
import { Avanzamento, BottoneIcona, Campi, Etichetta, Vuoto } from "./ui.tsx";

const ARTEFATTI = ["proposal", "design", "specs", "tasks"] as const;

/** «3 subagenti · 2 Explore · 1 general-purpose»: i più usati per primi. */
const subagenti = (conti: Record<string, number>) => {
  const tipi = Object.entries(conti).sort((a, b) => b[1] - a[1]);
  return T.subagentiN(tipi.reduce((n, [, k]) => n + k, 0), tipi.map(([tipo, k]) => `${k} ${tipo}`).join(" · "));
};

/** Al telefono la scheda è un foglio dal basso, sopra un velo; chi lo apre rende inerte il resto della pagina. */
export function Foglio({ onChiudi, esc, children }: { onChiudi: () => void; esc: boolean; children: React.ReactNode }) {
  const chiudi = React.useRef<HTMLDivElement>(null);
  // Aperto, il fuoco entra nel foglio; dove torna alla chiusura lo decide chi lo apre.
  React.useEffect(() => chiudi.current?.querySelector("button")?.focus(), []);
  // Esc lo chiude, salvo con un dialogo aperto sopra: Esc è suo, o di nessuno per quelli che si chiudono coi bottoni.
  React.useEffect(() => {
    if (!esc) return;
    const tasto = (e: KeyboardEvent) => e.key === "Escape" && onChiudi();
    document.addEventListener("keydown", tasto);
    return () => document.removeEventListener("keydown", tasto);
  }, [esc, onChiudi]);
  return (
    <>
      <div className="velo" aria-hidden="true" onClick={onChiudi} />
      <div className="foglio" role="dialog" aria-modal="true" aria-label={T.schedaTecnica}>
        <div ref={chiudi} className="chiudi-foglio"><BottoneIcona icona="chiudi" titolo={T.chiudiScheda} onClick={onChiudi} /></div>
        {children}
      </div>
    </>
  );
}

function Blocco({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return <div className="blocco"><Etichetta>{titolo}</Etichetta>{children}</div>;
}

export function SchedaCantiere({ d, onEsito, onModifica, onNuovaIdea }: {
  d: Dettaglio; onEsito: (a: Azione) => void; onModifica: () => void; onNuovaIdea: () => void;
}) {
  const c = d.cantiere;
  return (
    <aside className="scheda" aria-label={T.schedaTecnica}>
      <Blocco titolo={T.schedaTecnicaEt}>
        <Campi righe={[
          [T.progetto, c.progetto],
          [T.change, <code>{c.change}</code>],
          [T.stato_, <StatoBadge stato={c.stato} />],
          [T.origine, T.origini[c.origine]],
          [T.creato, quando(c.creato_il)],
          [T.aggiornato, quando(c.aggiornato_il)],
        ]} />
      </Blocco>
      {c.stato !== "idea" && (
        <Blocco titolo={T.avanzamento}>
          {c.task ? <Campi righe={[[T.task, <Avanzamento fatti={c.task.fatti} totali={c.task.totali} attivo={c.stato === "aperto"} />]]} />
            : <Vuoto>{T.nessunTasks}</Vuoto>}
          {/* DefunctumEst: elenco dei task da fare qui, sostituito dalla scheda «Da fare» in lavori.tsx */}
          {c.fasi && <Campi righe={[[T.fasi, <Avanzamento fatti={c.fasi.completate} totali={c.fasi.totali} attivo={c.stato === "aperto"} />]]} />}
          {c.artefatti && (
            <ul className="artefatti">
              {ARTEFATTI.map((a) => <li key={a} className={c.artefatti![a] ? "c-e" : ""}>{c.artefatti![a] ? "✓" : "—"} {a}</li>)}
            </ul>
          )}
        </Blocco>
      )}
      {c.sessioni.length > 0 && (
        <Blocco titolo={T.sessioniAttive}>
          <ul className="sessioni">
            {c.sessioni.map((s) => (
              <li key={s.session_id}>
                <span>{s.host}{s.branch ? ` · ${s.branch}` : ""}</span>
                <span className="secondario">{s.titolo ?? T.statoSessione[s.stato]} · {eta(s.eta_secondi)}</span>
                {Object.keys(s.subagenti).length > 0 && <span className="secondario">{subagenti(s.subagenti)}</span>}
              </li>
            ))}
          </ul>
        </Blocco>
      )}
      {d.todo.length > 0 && (
        <Blocco titolo={T.todoSessioni}>
          {d.todo.map((t, i) => (
            <Checkbox key={i} checked={t.stato === "completed"}
              label={<span style={{ color: t.stato === "completed" ? "var(--testo-2)" : "var(--testo)" }}>{t.testo}{t.stato === "in_progress" ? T.inCorsoTodo : ""}</span>} />
          ))}
        </Blocco>
      )}
      {d.esiti.length > 0 && (
        <Blocco titolo={T.storico}>
          <ul className="storico">{d.esiti.map((e, i) => <li key={i}><StatoBadge stato={e.stato} /> <span className="secondario">{giorno(e.ts)} · {T.origini[e.da]}</span></li>)}</ul>
        </Blocco>
      )}
      <div className="blocco azioni">
        <Etichetta>{T.esito}</Etichetta>
        {finale(c.stato) ? <StatoBadge stato={c.stato} /> : (
          <>
            {c.stato === "idea" && <Button variant="secondario" size="sm" onClick={onModifica}>{T.modificaNomeDescr}</Button>}
            {c.stato === "aperto" && <Button variant="secondario" size="sm" onClick={() => onEsito("sospendi")}>{T.sospendi}</Button>}
            {c.stato === "sospeso" && <Button size="sm" onClick={() => onEsito("riattiva")}>{T.riattiva}</Button>}
            <Button variant="fantasma" size="sm" onClick={() => onEsito("abbandona")}>{T.abbandona}</Button>
            <Button variant="fantasma" size="sm" onClick={onNuovaIdea}>{T.nuovaIdeaSotto}</Button>
            <span className="nota">{c.stato === "idea"
              ? <>{T.notaIdea[0]}<code>/cantiere prendi {c.percorso}</code>{T.notaIdea[1]}</>
              : T.notaCompletato}</span>
          </>
        )}
      </div>
    </aside>
  );
}

export function SchedaProgetto({ p, committente, onNuovaIdea }: { p: Progetto; committente: string; onNuovaIdea: () => void }) {
  const n = (s: string) => p.cantieri.filter((c) => c.stato === s).length;
  return (
    <aside className="scheda" aria-label={T.schedaProgetto}>
      <Blocco titolo={T.progetto}>
        <Campi righe={[
          [T.committente, committente],
          [T.slug, <code>{p.slug}</code>],
          [T.creato, quando(p.creato_il)],
          [T.inCorso, n("aperto")],
          [T.idee.toLowerCase(), n("idea")],
          [T.sospesi, n("sospeso")],
          [T.completati, n("completato")],
          [T.nonCensite, p.non_censite],
        ]} />
      </Blocco>
      <div className="blocco azioni">
        <Etichetta>{T.azioni}</Etichetta>
        <Button size="sm" onClick={onNuovaIdea}>{T.nuovaIdea}</Button>
        <span className="nota">{T.notaProgetto}</span>
      </div>
    </aside>
  );
}

export function SchedaCommittente({ cm, onNuovoProgetto, onRigenera }: { cm: Committente; onNuovoProgetto: () => void; onRigenera: () => void }) {
  return (
    <aside className="scheda" aria-label={T.schedaCommittente}>
      <Blocco titolo={T.committente}>
        <Campi righe={[[T.nome, cm.nome], [T.creato, quando(cm.creato_il)], [T.tokenDel, quando(cm.token_il)], [T.progetti, cm.progetti.length]]} />
      </Blocco>
      <div className="blocco azioni">
        <Etichetta>{T.azioni}</Etichetta>
        <Button size="sm" onClick={onNuovoProgetto}>{T.nuovoProgetto}</Button>
        <Button variant="secondario" size="sm" onClick={onRigenera}>{T.rigeneraToken}</Button>
        <span className="nota">{T.notaCommittente(cm.nome)}</span>
      </div>
    </aside>
  );
}
