/** Interruttore squadrato (niente pillole). */
export interface SwitchProps {
  on?: boolean;
  onChange?: (on: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}
export declare function Switch(props: SwitchProps): JSX.Element;
