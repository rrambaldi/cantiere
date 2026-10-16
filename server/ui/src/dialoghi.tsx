// Finestre di dialogo delle azioni. Raccolgono i dati e chiamano `esegui`; se fallisce, l'errore resta nella finestra.
import type { ReactNode } from "react";
import type { Azione, Cantiere, Committente, Progetto } from "./api.ts";
import { Button, Input } from "./ds/core.tsx";
import { Dialog } from "./ds/feedback.tsx";
import { finale } from "./formato.ts";
import { CampoTesto, fileDaTesto, ZonaFile } from "./lavori.tsx";
import { T } from "./testi.ts";

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
      <Button variant="fantasma" size="sm" onClick={onChiudi}>{T.annulla}</Button>
      <Button size="sm" disabled={occupato || disabilitato} onClick={onConferma}>{occupato ? T.unMomento : conferma}</Button>
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
      <Input label={T.nome} value={nome} onChange={setNome} hint={suggerimento} error={errore} autoFocus />
    </Dialog>
  );
}

function Token({ committente, token, onChiudi }: { committente: string; token: string; onChiudi: () => void }) {
  const campo = React.useRef<HTMLInputElement>(null);
  const [copiato, setCopiato] = React.useState(false);
  const copia = () =>
    navigator.clipboard.writeText(token).then(() => setCopiato(true), () => campo.current?.select());
  return (
    <Dialog titolo={T.tokenDi(committente)} onChiudi={onChiudi}
      azioni={<><Button variant="secondario" size="sm" onClick={copia}>{copiato ? T.copiato : T.copia}</Button><Button size="sm" onClick={onChiudi}>{T.hoCopiato}</Button></>}>
      <p>{T.copiaOra}</p>
      <input ref={campo} className="token" readOnly value={token} onFocus={(e) => e.target.select()} aria-label="token" />
      <p>{T.tokenIstruzioni(committente)[0]}<code>FORGIA_TOKEN</code>{T.tokenIstruzioni(committente)[1]}<code>/cantiere collega &lt;{T.progetto}&gt; &lt;url&gt;</code>{T.tokenIstruzioni(committente)[2]}</p>
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
  const [scritto, setScritto] = React.useState("");
  const [nomeTesto, setNomeTesto] = React.useState("appunti");
  const { occupato, errore, invia } = useInvio(onChiudi);
  const padri = progetto.cantieri.filter((c) => !finale(c.stato));
  const aggiungi = (nuovi: File[]) => setFile((f) => [...f, ...nuovi.filter((n) => !f.some((v) => v.name === n.name))]);
  return (
    <Dialog titolo={T.nuovaIdeaIn(progetto.nome)} onChiudi={onChiudi} soloPulsanti
      azioni={<Azioni conferma={T.creaIdea} occupato={occupato} disabilitato={!nome.trim()} onChiudi={onChiudi}
        onConferma={() => invia(() => esegui(progetto, nome.trim(), descrizione.trim() || null, padreId,
          scritto.trim() ? [...file.filter((f) => f.name !== fileDaTesto(nomeTesto, "").name), fileDaTesto(nomeTesto, scritto)] : file))} />}>
      <Input label={T.nome} value={nome} onChange={setNome} hint={T.suggIdea} error={errore} autoFocus />
      <Input label={T.descrizione} value={descrizione} onChange={setDescrizione} multilinea />
      <label className="campo-scelta">
        <span className="etichetta">{T.sotto}</span>
        <select value={padreId ?? ""} onChange={(e) => setPadreId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">{T.primoLivelloDi(progetto.nome)}</option>
          {padri.map((c) => <option key={c.id} value={c.id}>{c.percorso}</option>)}
        </select>
      </label>
      <ZonaFile onFile={aggiungi} conTesto={false} />
      <CampoTesto scritto={scritto} setScritto={setScritto} nome={nomeTesto} setNome={setNomeTesto} />
      {file.length > 0 && (
        <ul className="file-scelti">
          {file.map((f) => (
            <li key={f.name}><code>{f.name}</code><Button variant="fantasma" size="sm" onClick={() => setFile(file.filter((v) => v !== f))}>{T.togli}</Button></li>
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
    <Dialog titolo={T.modificaIdea} onChiudi={onChiudi}
      azioni={<Azioni conferma={T.salva} occupato={occupato} disabilitato={!nome.trim()} onChiudi={onChiudi}
        onConferma={() => invia(() => esegui(cantiere, nome.trim(), descrizione.trim() || null))} />}>
      <Input label={T.nome} value={nome} onChange={setNome} hint={T.suggModifica} error={errore} autoFocus />
      <Input label={T.descrizione} value={descrizione} onChange={setDescrizione} multilinea />
    </Dialog>
  );
}

function Esito({ cantiere, azione, discendenti, esegui, onChiudi }: {
  cantiere: Cantiere; azione: Azione; discendenti: string[]; esegui: Esecutori["esito"]; onChiudi: () => void;
}) {
  const { occupato, errore, invia } = useInvio(onChiudi);
  const [titolo, testo, conferma] = T.esitoTesto[azione];
  return (
    <Dialog titolo={titolo} onChiudi={onChiudi}
      azioni={<Azioni conferma={conferma} occupato={occupato} onChiudi={onChiudi} onConferma={() => invia(() => esegui(cantiere, azione))} />}>
      <p><code>{cantiere.percorso}</code> {testo}</p>
      {azione === "abbandona" && discendenti.length > 0 && (
        <p>{T.abbandonatiAnche}{discendenti.map((d, i) => <React.Fragment key={d}>{i ? ", " : ""}<code>{d}</code></React.Fragment>)}.</p>
      )}
      {azione === "abbandona" && cantiere.stato !== "idea" && (
        <p>{T.archiviaProposta(cantiere.progetto)[0]}<code>openspec archive {cantiere.change} --skip-specs</code>{T.archiviaProposta(cantiere.progetto)[1]}</p>
      )}
      <Errore testo={errore} />
    </Dialog>
  );
}

function Togli({ cantiere, nome, esegui, onChiudi }: { cantiere: Cantiere; nome: string; esegui: Esecutori["togli"]; onChiudi: () => void }) {
  const { occupato, errore, invia } = useInvio(onChiudi);
  return (
    <Dialog titolo={T.togliFileTit} onChiudi={onChiudi}
      azioni={<Azioni conferma={T.togli} occupato={occupato} onChiudi={onChiudi} onConferma={() => invia(() => esegui(cantiere, nome))} />}>
      <p><code>{nome}</code>{T.togliTesto[0]}<code>{cantiere.percorso}</code>{T.togliTesto[1]}</p>
      <Errore testo={errore} />
    </Dialog>
  );
}

export function Dialoghi({ r, esecutori, onChiudi }: { r: Richiesta; esecutori: Esecutori; onChiudi: () => void }) {
  switch (r.tipo) {
    case "committente":
      return <Nome titolo={T.nuovoCommittenteTit} conferma={T.crea} esegui={esecutori.creaCommittente} onChiudi={onChiudi}
        suggerimento={T.suggCommittente} />;
    case "token":
      return <Token committente={r.committente} token={r.token} onChiudi={onChiudi} />;
    case "rigenera":
      return <RigeneraConferma committente={r.committente} esegui={esecutori.rigenera} onChiudi={onChiudi} />;
    case "progetto":
      return <Nome titolo={T.nuovoProgettoIn(r.committente.nome)} conferma={T.crea} onChiudi={onChiudi}
        esegui={(nome) => esecutori.creaProgetto(r.committente, nome)} suggerimento={T.suggProgetto} />;
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
    <Dialog titolo={T.rigeneraTit} onChiudi={onChiudi}
      azioni={<Azioni conferma={T.rigenera} occupato={occupato} onChiudi={onChiudi} onConferma={() => invia(() => esegui(committente))} />}>
      <p>{T.rigeneraTesto[0]}<strong>{committente.nome}</strong>{T.rigeneraTesto[1]}</p>
      <Errore testo={errore} />
    </Dialog>
  );
}
