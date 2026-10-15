/** Riga di un cantiere nell'elenco: nome, chi/macchina, avanzamento todo, stato, ultimo aggiornamento. */
export interface CantiereRigaProps {
  nome: string;
  chi?: string;
  macchina?: string;
  fatti?: number;
  totali?: number;
  stato?: 'in-corso' | 'completato' | 'sospeso' | 'abbandonato';
  /** Testo breve, es. "09:42" o "ieri". */
  aggiornato?: string;
  /** Senza bordo inferiore. */
  ultima?: boolean;
}
export declare function CantiereRiga(props: CantiereRigaProps): JSX.Element;
