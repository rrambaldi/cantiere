/** Casella di spunta: usata per i todo del programma dei lavori. */
export interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}
export declare function Checkbox(props: CheckboxProps): JSX.Element;
