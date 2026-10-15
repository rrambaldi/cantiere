// Colonna destra: scheda tecnica del cantiere, del progetto o del committente scelto, con le loro azioni.
import type { Azione, Committente, Dettaglio, Progetto } from "./api.ts";
import { Button, Checkbox } from "./ds/core.tsx";
import { StatoBadge } from "./ds/feedback.tsx";
import { eta, finale, giorno, quando } from "./formato.ts";
import { Avanzamento, Campi, Etichetta, Vuoto } from "./ui.tsx";

const ARTEFATTI = ["proposal", "design", "specs", "tasks"] as const;

function Blocco({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return <div className="blocco"><Etichetta>{titolo}</Etichetta>{children}</div>;
}

export function SchedaCantiere({ d, onEsito, onModifica, onNuovaIdea }: {
  d: Dettaglio; onEsito: (a: Azione) => void; onModifica: () => void; onNuovaIdea: () => void;
}) {
  const c = d.cantiere;
  return (
    <aside className="scheda" aria-label="Scheda tecnica">
      <Blocco titolo="scheda tecnica">
        <Campi righe={[
          ["progetto", c.progetto],
          ["change", <code>{c.change}</code>],
          ["stato", <StatoBadge stato={c.stato} />],
          ["origine", c.origine],
          ["creato", quando(c.creato_il)],
          ["aggiornato", quando(c.aggiornato_il)],
        ]} />
      </Blocco>
      {c.stato !== "idea" && (
        <Blocco titolo="avanzamento">
          {c.task ? <Campi righe={[["task", <Avanzamento fatti={c.task.fatti} totali={c.task.totali} attivo={c.stato === "aperto"} />]]} />
            : <Vuoto>Nessun tasks.md nella copia del change.</Vuoto>}
          {c.fasi && <Campi righe={[["fasi", <Avanzamento fatti={c.fasi.completate} totali={c.fasi.totali} attivo={c.stato === "aperto"} />]]} />}
          {c.artefatti && (
            <ul className="artefatti">
              {ARTEFATTI.map((a) => <li key={a} className={c.artefatti![a] ? "c-e" : ""}>{c.artefatti![a] ? "✓" : "—"} {a}</li>)}
            </ul>
          )}
        </Blocco>
      )}
      {c.sessioni.length > 0 && (
        <Blocco titolo="sessioni attive">
          <ul className="sessioni">
            {c.sessioni.map((s) => (
              <li key={s.session_id}>
                <span>{s.host}{s.branch ? ` · ${s.branch}` : ""}</span>
                <span className="secondario">{s.titolo ?? s.stato} · {eta(s.eta_secondi)}</span>
              </li>
            ))}
          </ul>
        </Blocco>
      )}
      {d.todo.length > 0 && (
        <Blocco titolo="todo delle sessioni">
          {d.todo.map((t, i) => (
            <Checkbox key={i} checked={t.stato === "completed"}
              label={<span style={{ color: t.stato === "completed" ? "var(--testo-2)" : "var(--testo)" }}>{t.testo}{t.stato === "in_progress" ? " · in corso" : ""}</span>} />
          ))}
        </Blocco>
      )}
      {d.esiti.length > 0 && (
        <Blocco titolo="storico">
          <ul className="storico">{d.esiti.map((e, i) => <li key={i}><StatoBadge stato={e.stato} /> <span className="secondario">{giorno(e.ts)} · {e.da}</span></li>)}</ul>
        </Blocco>
      )}
      <div className="blocco azioni">
        <Etichetta>esito</Etichetta>
        {finale(c.stato) ? <StatoBadge stato={c.stato} /> : (
          <>
            {c.stato === "idea" && <Button variant="secondario" size="sm" onClick={onModifica}>Modifica nome e descrizione</Button>}
            {c.stato === "aperto" && <Button variant="secondario" size="sm" onClick={() => onEsito("sospendi")}>Sospendi</Button>}
            {c.stato === "sospeso" && <Button size="sm" onClick={() => onEsito("riattiva")}>Riattiva</Button>}
            <Button variant="fantasma" size="sm" onClick={() => onEsito("abbandona")}>Abbandona</Button>
            <Button variant="fantasma" size="sm" onClick={onNuovaIdea}>Nuova idea qui sotto</Button>
            <span className="nota">{c.stato === "idea"
              ? <>Si prende in lavorazione da Claude Code con <code>/cantiere prendi {c.percorso}</code>.</>
              : "Completato arriva dal repo, con openspec archive."}</span>
          </>
        )}
      </div>
    </aside>
  );
}

export function SchedaProgetto({ p, committente, onNuovaIdea }: { p: Progetto; committente: string; onNuovaIdea: () => void }) {
  const n = (s: string) => p.cantieri.filter((c) => c.stato === s).length;
  return (
    <aside className="scheda" aria-label="Scheda del progetto">
      <Blocco titolo="progetto">
        <Campi righe={[
          ["committente", committente],
          ["slug", <code>{p.slug}</code>],
          ["creato", quando(p.creato_il)],
          ["in corso", n("aperto")],
          ["idee", n("idea")],
          ["sospesi", n("sospeso")],
          ["completati", n("completato")],
          ["non censite", p.non_censite],
        ]} />
      </Blocco>
      <div className="blocco azioni">
        <Etichetta>azioni</Etichetta>
        <Button size="sm" onClick={onNuovaIdea}>Nuova idea</Button>
        <span className="nota">Un'idea diventa un change OpenSpec con /cantiere prendi da Claude Code.</span>
      </div>
    </aside>
  );
}

export function SchedaCommittente({ cm, onNuovoProgetto, onRigenera }: { cm: Committente; onNuovoProgetto: () => void; onRigenera: () => void }) {
  return (
    <aside className="scheda" aria-label="Scheda del committente">
      <Blocco titolo="committente">
        <Campi righe={[["nome", cm.nome], ["creato", quando(cm.creato_il)], ["token del", quando(cm.token_il)], ["progetti", cm.progetti.length]]} />
      </Blocco>
      <div className="blocco azioni">
        <Etichetta>azioni</Etichetta>
        <Button size="sm" onClick={onNuovoProgetto}>Nuovo progetto</Button>
        <Button variant="secondario" size="sm" onClick={onRigenera}>Rigenera token</Button>
        <span className="nota">Il token serve a /cantiere collega su ogni macchina che lavora per {cm.nome}.</span>
      </div>
    </aside>
  );
}
