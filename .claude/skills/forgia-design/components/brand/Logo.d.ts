/**
 * Segno di forgia (incudine con il pezzo in lavorazione), opzionalmente con logotipo.
 * Usa i token del tema: --segno per l'incudine, --segnale per il pezzo.
 * @startingPoint section="Brand" subtitle="Segno e logotipo" viewport="700x200"
 */
export interface LogoProps {
  /** Lato in px. Sotto i 20 px usa il disegno dedicato a 16. */
  size?: number;
  /** Mostra il logotipo "forgia" accanto al segno. */
  wordmark?: boolean;
  /** Pezzo dello stesso colore dell'incudine. */
  mono?: boolean;
  style?: React.CSSProperties;
}
export declare function Logo(props: LogoProps): JSX.Element;
