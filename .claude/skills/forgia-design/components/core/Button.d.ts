/**
 * Pulsante. Primario = giallo segnale (uno per vista); secondario = bordo; fantasma = solo testo.
 * @startingPoint section="Core" subtitle="Pulsanti" viewport="700x220"
 */
export interface ButtonProps {
  variant?: 'primario' | 'secondario' | 'fantasma';
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Testo in IBM Plex Mono, per comandi (es. "/forgia chiudi"). */
  mono?: boolean;
  type?: 'button' | 'submit';
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Button(props: ButtonProps): JSX.Element;
