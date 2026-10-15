// Finestre di dialogo delle azioni. Raccolgono i dati e chiamano `esegui`; se fallisce, l'errore resta nella finestra.
import type { ReactNode } from "react";
import type { Azione, Cantiere, Committente, Progetto } from "./api.ts";
import { Button, Input } from "./ds/core.tsx";
import { Dialog } from "./ds/feedback.tsx";
import { finale } from "./formato.ts";
import { ZonaFile } from "./lavori.tsx";

export type Richiesta =
  | { tipo: "committente" }
  | { tipo: "token"; committente: string; token: string }
  | { tipo: "rigenera"; committente: Committente }
  | { tipo: "progetto"; committente: Committente }
  | { tipo: "idea"; progetto: Progetto; padre: Cantiere | null }
  | { tipo: "modifica"; cantiere: Cantiere }
  | { tipo: "esito"; cantiere: Cantiere; azione: Azione; discendenti: string[] }
  | { tipo: "togli"; cantiere: Cantiere; nome: string };

export interface Esecutori {
  creaCommittente: (nome: string) => Promise<void>;
  rigenera: (c: Committente) => Promise<void>;
  creaProgetto: (c: Committente, nome: string) => Promise<void>;
  creaIdea: (p: Progetto, nome: string, descrizione: string | null, padre: number | null, file: File[]) => Promise<void>;
  modifica: (c: Cantiere, nome: string, descrizione: string | null) => Promise<void>;
  esito: (c: Cantiere, a: Azione) => Promise<void>;
  togli: (c: Cantiere, nome: string) => Promise<void>;
}

/** Stato di invio di una finestra: occupata mentre aspetta il server, con l'errore se fallisce. */
function useInvio(onChiudi: () => void) {
  const [occupato, setOccupato] = React.useState(false);
  const [errore, setErrore] = React.useState<string>();
  const invia = async (azione: () => Promise<void>) => {
    setOccupato(true);
    setErrore(undefined);
    try {
      await azione();
      onChiudi();
    } catch (e) {
      setErrore((e as Error).message);
      setOccupato(false);
    }
  };
  return { occupato, errore, invia };
}

function Azioni({ conferma, occupato, onChiudi, onConferma, disabilitato = false }: {
  conferma: string; occupato: boolean; onChiudi: () => void; onConferma: () => void; disabilitato?: boolean;
}) {
  return (
    <>
      <Button variant="fantasma" size="sm" onClick={onChiudi}>Annulla</Button>
      <Button size="sm" disabled={occupato || disabilitato} onClick={onConferma}>{occupato ? "Un momento" : conferma}</Button>
    </>
  );
}

const Errore = ({ testo }: { testo?: string }) => (testo ? <p className="errore-dialogo" role="alert">{testo}</p> : null);

function Nome({ titolo, conferma, iniziale = "", suggerimento, esegui, onChiudi, children }: {
  titolo: string; conferma: string; iniziale?: string; suggerimento?: string; esegui: (nome: string) => Promise<void>;
  onChiudi: () => void; children?: ReactNode;
}) {
  const [nome, setNome] = React.useState(iniziale);
  const { occupato, errore, invia } = useInvio(onChiudi);
  return (
    <Dialog titolo={titolo} onChiudi={onChiudi}
      azioni={<Azioni conferma={conferma} occupato={occupato} disabilitato={!nome.trim()} onChiudi={onChiudi} onConferma={() => invia(() => esegui(nome.trim()))} />}>
      {children}
      <Input label="nome" value={nome} onChange={setNome} hint={suggerimento} error={errore} autoFocus />
    </Dialog>
  );
}

function Token({ committente, token, onChiudi }: { committente: string; token: string; onChiudi: () => void }) {
  const campo = React.useRef<HTMLInputElement>(null);
  const [copiato, setCopiato] = React.useState(false);
  const copia = () =>
    navigator.clipboard.writeText(token).then(() => setCopiato(true), () => campo.current?.select());
  return (
    <Dialog titolo={`Token di ${committente}`} onChiudi={onChiudi}
      azioni={<><Button variant="secondario" size="sm" onClick={copia}>{copiato ? "Copiato" : "Copia"}</Button><Button size="sm" onClick={onChiudi}>Ho copiato il token</Button></>}>
      <p>Copia il token adesso: non verrà mostrato di nuovo.</p>
      <input ref={campo} className="token" readOnly value={token} onFocus={(e) => e.target.select()} aria-label="token" />
      <p>Su ogni macchina che lavora per {committente}: imposta <code>FORGIA_TOKEN</code> con questo valore e lancia <code>/cantiere collega &lt;progetto&gt; &lt;url&gt;</code> nella cartella dei sorgenti.</p>
    </Dialog>
  );
}

function Idea({ progetto, padre, esegui, onChiudi }: {
  progetto: Progetto; padre: Cantiere | null; esegui: Esecutori["creaIdea"]; onChiudi: () => void;
}) {
  const [nome, setNome] = React.useState("");
  const [descrizione, setDescrizione] = React.useState("");
  const [padreId, setPadreId] = React.useState<number | null>(padre?.id ?? null);
  const [file, setFile] = React.useState<File[]>([]);
  const { occupato, errore, invia } = useInvio(onChiudi);
  const padri = progetto.cantieri.filter((c) => !finale(c.stato));
  const aggiungi = (nuovi: File[]) => setFile((f) => [...f, ...nuovi.filter((n) => !f.some((v) => v.name === n.name))]);
  return (
    <Dialog titolo={`Nuova idea in ${progetto.nome}`} onChiudi={onChiudi}
      azioni={<Azioni conferma="Crea l'idea" occupato={occupato} disabilitato={!nome.trim()} onChiudi={onChiudi}
        onConferma={() => invia(() => esegui(progetto, nome.trim(), descrizione.trim() || null, padreId, file))} />}>
      <Input label="nome" value={nome} onChange={setNome} hint="Breve e specifico: diventa il nome del change." error={errore} autoFocus />
      <Input label="descrizione" value={descrizione} onChange={setDescrizione} multilinea />
      <label className="campo-scelta">
        <span className="etichetta">sotto</span>
        <select value={padreId ?? ""} onChange={(e) => setPadreId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">primo livello di {progetto.nome}</option>
          {padri.map((c) => <option key={c.id} value={c.id}>{c.percorso}</option>)}
        </select>
      </label>
      <ZonaFile onFile={aggiungi} />
      {file.length > 0 && (
        <ul className="file-scelti">
          {file.map((f) => (
            <li key={f.name}><code>{f.name}</code><Button variant="fantasma" size="sm" onClick={() => setFile(file.filter((v) => v !== f))}>Togli</Button></li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function Modifica({ cantiere, esegui, onChiudi }: { cantiere: Cantiere; esegui: Esecutori["modifica"]; onChiudi: () => void }) {
  const [nome, setNome] = React.useState(cantiere.nome);
  const [descrizione, setDescrizione] = React.useState(cantiere.descrizione ?? "");
  const { occupato, errore, invia } = useInvio(onChiudi);
  return (
    <Dialog titolo="Modifica l'idea" onChiudi={onChiudi}
      azioni={<Azioni conferma="Salva" occupato={occupato} disabilitato={!nome.trim()} onChiudi={onChiudi}
        onConferma={() => invia(() => esegui(cantiere, nome.trim(), descrizione.trim() || null))} />}>
      <Input label="nome" value={nome} onChange={setNome} hint="Cambia anche il nome del change." error={errore} autoFocus />
      <Input label="descrizione" value={descrizione} onChange={setDescrizione} multilinea />
    </Dialog>
  );
}

const FRASI: Record<Azione, [string, string, string]> = {
  sospendi: ["Sospendere il cantiere?", "resta tra gli aperti, fermo. Le sessioni che ci lavorano tornano al lavoro diretto sul progetto e Claude non lo propone all'avvio finché è sospeso.", "Sospendi"],
  riattiva: ["Riattivare il cantiere?", "torna in corso e Claude lo propone di nuovo all'avvio delle sessioni.", "Riattiva"],
  abbandona: ["Abbandonare il cantiere?", "passa tra i chiusi con esito abbandonato. Il giornale resta consultabile.", "Abbandona"],
};

function Esito({ cantiere, azione, discendenti, esegui, onChiudi }: {
  cantiere: Cantiere; azione: Azione; discendenti: string[]; esegui: Esecutori["esito"]; onChiudi: () => void;
}) {
  const { occupato, errore, invia } = useInvio(onChiudi);
  const [titolo, testo, conferma] = FRASI[azione];
  return (
    <Dialog titolo={titolo} onChiudi={onChiudi}
      azioni={<Azioni conferma={conferma} occupato={occupato} onChiudi={onChiudi} onConferma={() => invia(() => esegui(cantiere, azione))} />}>
      <p><code>{cantiere.percorso}</code> {testo}</p>
      {azione === "abbandona" && discendenti.length > 0 && (
        <p>Vengono abbandonati anche: {discendenti.map((d, i) => <React.Fragment key={d}>{i ? ", " : ""}<code>{d}</code></React.Fragment>)}.</p>
      )}
      {azione === "abbandona" && cantiere.stato !== "idea" && (
        <p>Alla prossima sessione in {cantiere.progetto} Claude proporrà di archiviare il change con <code>openspec archive {cantiere.change} --skip-specs</code>.</p>
      )}
      <Errore testo={errore} />
    </Dialog>
  );
}

function Togli({ cantiere, nome, esegui, onChiudi }: { cantiere: Cantiere; nome: string; esegui: Esecutori["togli"]; onChiudi: () => void }) {
  const { occupato, errore, invia } = useInvio(onChiudi);
  return (
    <Dialog titolo="Togliere il file?" onChiudi={onChiudi}
      azioni={<Azioni conferma="Togli" occupato={occupato} onChiudi={onChiudi} onConferma={() => invia(() => esegui(cantiere, nome))} />}>
      <p><code>{nome}</code> esce dall'idea <code>{cantiere.percorso}</code>.</p>
      <Errore testo={errore} />
    </Dialog>
  );
}

export function Dialoghi({ r, esecutori, onChiudi }: { r: Richiesta; esecutori: Esecutori; onChiudi: () => void }) {
  switch (r.tipo) {
    case "committente":
      return <Nome titolo="Nuovo committente" conferma="Crea" esegui={esecutori.creaCommittente} onChiudi={onChiudi}
        suggerimento="Lettere, cifre, - e _. Per esempio PRIV o CVSTUDIO." />;
    case "token":
      return <Token committente={r.committente} token={r.token} onChiudi={onChiudi} />;
    case "rigenera":
      return <RigeneraConferma committente={r.committente} esegui={esecutori.rigenera} onChiudi={onChiudi} />;
    case "progetto":
      return <Nome titolo={`Nuovo progetto in ${r.committente.nome}`} conferma="Crea" onChiudi={onChiudi}
        esegui={(nome) => esecutori.creaProgetto(r.committente, nome)} suggerimento="Il prodotto, per esempio poker o mercurius." />;
    case "idea":
      return <Idea progetto={r.progetto} padre={r.padre} esegui={esecutori.creaIdea} onChiudi={onChiudi} />;
    case "modifica":
      return <Modifica cantiere={r.cantiere} esegui={esecutori.modifica} onChiudi={onChiudi} />;
    case "esito":
      return <Esito cantiere={r.cantiere} azione={r.azione} discendenti={r.discendenti} esegui={esecutori.esito} onChiudi={onChiudi} />;
    case "togli":
      return <Togli cantiere={r.cantiere} nome={r.nome} esegui={esecutori.togli} onChiudi={onChiudi} />;
  }
}

function RigeneraConferma({ committente, esegui, onChiudi }: { committente: Committente; esegui: Esecutori["rigenera"]; onChiudi: () => void }) {
  const { occupato, errore, invia } = useInvio(onChiudi);
  return (
    <Dialog titolo="Rigenerare il token?" onChiudi={onChiudi}
      azioni={<Azioni conferma="Rigenera" occupato={occupato} onChiudi={onChiudi} onConferma={() => invia(() => esegui(committente))} />}>
      <p>Il token attuale di <strong>{committente.nome}</strong> smette di funzionare subito, su tutte le macchine. Andrà ricollegata ogni cartella con il token nuovo.</p>
      <Errore testo={errore} />
    </Dialog>
  );
}
