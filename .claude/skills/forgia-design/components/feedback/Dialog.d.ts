/** Dialogo modale. Unico elemento con ombra. */
export interface DialogProps {
  aperto?: boolean;
  titolo?: string;
  children?: React.ReactNode;
  /** Pulsanti in basso a destra. */
  azioni?: React.ReactNode;
  onChiudi?: () => void;
  /** Rende senza velo e senza posizione fissa (anteprime). */
  inline?: boolean;
}
export declare function Dialog(props: DialogProps): JSX.Element | null;
