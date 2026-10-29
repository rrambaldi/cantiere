# Design

## Context

La UI è React 18 senza bundler: `tsc -p ui` compila `ui/src` in `ui/dist`, che è nel repo (un test
controlla che sia aggiornato). Le stringhe italiane sono nei componenti e in `formato.ts` (mesi, "oggi",
"ieri", età, etichette di stato). Non ci sono librerie i18n e non se ne vuole aggiungere una. La
scelta del committente è già in `localStorage` (`app.tsx`).

## Goals / Non-Goals

**Goals:**
- Dizionario tipizzato: se manca una chiave in una lingua, `tsc` fallisce.
- Cambio lingua immediato, senza ricaricare.

**Non-Goals:**
- Plurali complessi, gender, formati valuta: servono solo frasi con numeri semplici.
- Lingua scelta dal server o per committente.

## Decisions

- **Dizionario in `ui/src/testi.ts`**: due oggetti `it` e `en`; `it` è la fonte del tipo, `en` deve
  averne le stesse chiavi (`satisfies`). Alternativa: JSON caricati a runtime — scartata, perde il
  controllo dei tipi e aggiunge richieste.
- **Dizionario come oggetto, lingua come binding di modulo**: `T` (i testi correnti) e `lingua` sono `export let` in `testi.ts`; `impostaLingua()` li cambia e lo stato di `App` ridisegna tutto l'albero. Niente Provider né hook: i componenti leggono `T.chiave`. Le stringhe con numeri sono funzioni (es. una che costruisce "n min fa"); quelle con `<code>` in mezzo sono coppie/terne da affiancare al codice. Alternativa: libreria i18next — scartata, peso e dipendenza per ~150 stringhe.
- **`formato.ts` prende la lingua**: `giorno`, `eta`, `ETICHETTA_STATO` diventano funzioni di `t`.
  Le date usano `Intl.DateTimeFormat(lingua, …)` al posto dell'elenco `MESI`; `localeCompare` in
  `indice.tsx` usa la lingua corrente.
- **Lingua iniziale**: `localStorage` (chiave `forgia-lingua`), poi `navigator.language` se inizia con
  `en` o `it`, altrimenti `it`. Se `localStorage` non è disponibile, vale la lingua del browser.
- **`<html lang>`** aggiornato da codice al cambio; `index.html` resta `it` come valore iniziale. Il
  titolo della scheda segue la lingua.
- **Messaggi di errore dell'API**: gli errori di rete e di accesso (`api.ts`) sono tradotti; il testo d'errore scritto dal server resta in italiano, perché cambiarlo è fuori scopo.

## Risks / Trade-offs

- [Stringhe dimenticate nei componenti] → ricerca di testo italiano nei `.tsx` come ultimo task e
  prova a mano della UI in inglese.
- [Testo inglese più lungo rompe il layout] → controllo visivo di dialoghi e intestazione in entrambe
  le lingue.
- [`dist/` non aggiornato] → `npm run build:ui` e il test `ui-compilato` nello stesso commit.
