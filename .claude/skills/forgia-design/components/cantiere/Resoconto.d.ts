/**
 * Resoconto di fine turno: tre righe fisse (fatto, dopo, blocca). Sempre su fondo notte.
 * @startingPoint section="Cantiere" subtitle="Resoconto di fine turno" viewport="700x200"
 */
export interface ResocontoProps {
  cantiere?: string;
  chi?: string;
  branch?: string;
  fatto?: string;
  dopo?: string;
  /** Vuoto = "—". */
  blocca?: string;
}
export declare function Resoconto(props: ResocontoProps): JSX.Element;
