/** Contenitore con bordo e intestazione opzionale. Niente ombre. */
export interface SchedaProps {
  titolo?: string;
  meta?: string;
  azioni?: React.ReactNode;
  /** Griglia da carta millimetrata nell'intestazione. */
  griglia?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Scheda(props: SchedaProps): JSX.Element;
