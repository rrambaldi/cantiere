/** Schede di navigazione con sottolineatura gialla. */
export interface TabItem { id: string; label: string; count?: number; }
export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange?: (id: string) => void;
}
export declare function Tabs(props: TabsProps): JSX.Element;
