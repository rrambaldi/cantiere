/** Notifica breve. "attenzione" porta una fascia di nastro; "errore" un bordo. Mai rosso pieno. */
export interface ToastProps {
  tono?: 'info' | 'attenzione' | 'errore';
  titolo?: string;
  children?: React.ReactNode;
  onChiudi?: () => void;
}
export declare function Toast(props: ToastProps): JSX.Element;
