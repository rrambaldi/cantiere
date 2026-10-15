/** Campo di testo. Fondo sempre profondo (notte), testo carta: anche nel tema carta. */
export interface InputProps {
  label?: string;
  hint?: string;
  error?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  /** Prefisso in mono, es. "/" o "forgia@". */
  prefix?: string;
  mono?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}
export declare function Input(props: InputProps): JSX.Element;
