// Dalla dashboard alla sessione: comandi di testo, e «Confermo» / «Non va» su domande in attesa e task di verifica.
import { api, type Comando, type Domanda, type EsitoWeb } from "./api.ts";
import { Button, Input } from "./ds/core.tsx";
import { quando } from "./formato.ts";
import { T } from "./testi.ts";
import { BottoneIcona } from "./ui.tsx";

/** Un invio al server: l'errore resta sotto il campo, così chi scrive dal telefono non perde il testo. */
function useInvio() {
  const [inCorso, setInCorso] = React.useState(false);
  const [errore, setErrore] = React.useState<string | null>(null);
  const invia = async (azione: () => Promise<unknown>) => {
    setInCorso(true);
    setErrore(null);
    try {
      await azione();
      return true;
    } catch (e) {
      setErrore((e as Error).message);
      return false;
    } finally {
      setInCorso(false);
    }
  };
  return { inCorso, errore, invia };
}

const Errore = ({ testo }: { testo: string | null }) => (testo ? <span className="errore-campo" role="alert">{testo}</span> : null);

/** «Confermo» parte subito; «Non va» apre il campo del feedback, che serve. */
function ConfermaONo({ onEsito }: { onEsito: (e: EsitoWeb) => Promise<unknown> }) {
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const { inCorso, errore, invia } = useInvio();
  const manda = async (e: EsitoWeb) => {
    if (await invia(() => onEsito(e))) setFeedback(null);
  };
  return (
    <div className="conferma-o-no">
      {feedback === null ? (
        <span className="azioni-esito">
          <Button size="sm" disabled={inCorso} onClick={() => void manda({ esito: "confermato" })}>{T.confermo}</Button>
          <Button size="sm" variant="secondario" disabled={inCorso} onClick={() => setFeedback("")}>{T.nonVa}</Button>
        </span>
      ) : (
        <>
          <Input label={T.cosaNonVa} value={feedback} onChange={setFeedback} multilinea autoFocus />
          <span className="azioni-esito">
            <Button size="sm" disabled={inCorso || !feedback.trim()} onClick={() => void manda({ esito: "negato", feedback })}>{T.invia}</Button>
            <Button size="sm" variant="fantasma" disabled={inCorso} onClick={() => setFeedback(null)}>{T.annulla}</Button>
          </span>
        </>
      )}
      <Errore testo={errore} />
    </div>
  );
}

/** «Confermo» o «Non va» su una domanda in attesa: la chiude, e l'esito va alla sessione. */
export const EsitoDomanda = ({ d, onAggiorna }: { d: Domanda; onAggiorna: () => Promise<unknown> }) => (
  <ConfermaONo onEsito={(e) => api.esitoDomanda(d, e).then(onAggiorna)} />
);

/** Stato e orari di un comando, con l'annullo finché aspetta. */
function StatoComando({ c, onAggiorna }: { c: Comando; onAggiorna: () => Promise<unknown> }) {
  const { inCorso, errore, invia } = useInvio();
  return (
    <span className="stato-comando">
      <span className="secondario">
        {T.statoComando[c.stato]} · {T.scrittoIl(quando(c.creato_il))}{c.consegnato_il ? ` · ${T.consegnatoIl(quando(c.consegnato_il))}` : ""}
      </span>
      {c.stato === "in_attesa" && (
        <BottoneIcona icona="chiudi" titolo={T.annullaComando} disabled={inCorso} onClick={() => void invia(() => api.annullaComando(c.id).then(onAggiorna))} />
      )}
      <Errore testo={errore} />
    </span>
  );
}

/** Comandi di testo ed esiti delle domande, con stato, orari e annullo. */
export function ListaComandi({ comandi, onAggiorna }: { comandi: Comando[]; onAggiorna: () => Promise<unknown> }) {
  if (!comandi.length) return null;
  return (
    <ul className="lista-comandi">
      {comandi.map((c) => (
        <li key={c.id}>
          <span className="testo-comando">{c.esito ? T.esitoDomanda[c.esito](c.testo) : c.testo}</span>
          <StatoComando c={c} onAggiorna={onAggiorna} />
        </li>
      ))}
    </ul>
  );
}

/** I comandi di una sessione e il campo per scriverne uno: arriva al suo prossimo passo, non a una sessione ferma. */
export function ComandiSessione({ sessionId, comandi, onAggiorna }: { sessionId: string; comandi: Comando[]; onAggiorna: () => Promise<unknown> }) {
  const [testo, setTesto] = React.useState<string | null>(null);
  const { inCorso, errore, invia } = useInvio();
  const scrivi = async () => {
    if (await invia(() => api.scriviComando(sessionId, testo!).then(onAggiorna))) setTesto(null);
  };
  return (
    <div className="comandi">
      <ListaComandi comandi={comandi} onAggiorna={onAggiorna} />
      {testo === null ? (
        <Button size="sm" variant="secondario" onClick={() => setTesto("")}>{T.scriviComando}</Button>
      ) : (
        <>
          <Input label={T.comando} hint={T.notaComando} value={testo} onChange={setTesto} multilinea autoFocus />
          <span className="azioni-esito">
            <Button size="sm" disabled={inCorso || !testo.trim()} onClick={() => void scrivi()}>{T.invia}</Button>
            <Button size="sm" variant="fantasma" disabled={inCorso} onClick={() => setTesto(null)}>{T.annulla}</Button>
          </span>
        </>
      )}
      <Errore testo={errore} />
    </div>
  );
}

/** Un task di verifica: l'ultimo esito dato dal web, che resta finché il tasks.md non smarca il task, e i bottoni per darne uno. */
export function VerificaTask({ cantiere, task, esito, onAggiorna }: {
  cantiere: number; task: string; esito: Comando | undefined; onAggiorna: () => Promise<unknown>;
}) {
  return (
    <div className="verifica-task">
      {esito && (
        <span className="esito-task">
          <span className={esito.esito === "confermato" ? "confermato" : "negato"}>{T.esitoTask[esito.esito!](esito.testo)}</span>
          <StatoComando c={esito} onAggiorna={onAggiorna} />
        </span>
      )}
      <ConfermaONo onEsito={(e) => api.esitoTask(cantiere, task, e).then(onAggiorna)} />
    </div>
  );
}
