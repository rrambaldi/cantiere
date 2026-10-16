## Why

Un'idea si può costruire solo allegando file `.md` o `.txt`. Per un appunto veloce bisogna prima creare un file. Dalla dashboard si deve poter anche scrivere il testo.

## What Changes

- Nella dashboard, sotto la zona di caricamento, un campo di testo con un nome file: il testo diventa un file `.md` dell'idea.
- Vale sia nella creazione dell'idea sia quando si aggiungono file a un'idea esistente.
- Nessuna modifica al server: il testo viaggia come un normale file `.md`, quindi `/cantiere prendi` lo consegna a Claude insieme agli altri.

## Impact

- `server/ui/src/lavori.tsx` (`ZonaFile`), `server/ui/src/testi.ts`.
- Spec `server/idee`.
