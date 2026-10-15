/** Stato di un cantiere: distinto per forma (pieno, anello, tratteggio), regge in monocromo. */
export interface StatoBadgeProps {
  stato?: 'in-corso' | 'completato' | 'sospeso' | 'abbandonato';
  /** false = solo il segno (etichetta resta per screen reader). */
  etichetta?: boolean;
}
export declare function StatoBadge(props: StatoBadgeProps): JSX.Element;
