## Why

Dalla dashboard non si vede a che punto sono i progetti né cosa è partito da cosa. Analisi in `docs/ux/analisi-2026-10-26.md`: i rami non vengono registrati (in PRIV 0 cantieri su 30 hanno un padre, in tutti i committenti uno solo), perché il padre è una fase ed entra nel nome del change; tra progetti diversi un legame non si può proprio dire. I legami veri restano nel testo dei file (il task 1.1 di multi-instrument-simulations cita `basket-mix`) o in due cantieri con lo stesso nome in due progetti (`politiche e controllo dei backup` in NIS2 e digithera).

Direzione scelta: prima i legami nel server e nel plugin, poi la vista «Dal task ai rami» nel cantiere e i «Binari nel tempo» del committente, con il quadro ad albero come forma dei binari al telefono. Tavole sulla tela https://claude.ai/artifact/BAFGvGafLts3RnVWBL8DCA.

## What Changes

- Server: una tabella `legami` (da, a, tipo, task, sessione, ora), anche tra progetti dello stesso committente. Il padre resta la fase.
- `apri_cantiere` (evento REST e tool MCP) accetta `nato_da`, `nato_da_progetto` e `task`. Una sessione che sta in un cantiere e ne crea un altro lo lega da sola al cantiere di partenza.
- Le letture dei cantieri (`GET /api/v1/cantieri`, `elenca_cantieri`, albero della dashboard) danno a ogni cantiere `nato_da`.
- Fase 2: legami citati dai file dei change; `/cantiere dirama`; subagenti contati da un hook sul tool `Agent`; «nato da» modificabile dalla scheda.
- Fase 3: dashboard con «Task e rami», «Binari» e, al telefono, il quadro ad albero.

## Impact

- `server/src/migrazioni/0004_legami.ts`, `db.ts`, `modelli.ts`, `dominio.ts`, `strumenti.ts`, `contesto.ts`; `docs/contratto-v2.md`.
- Fase 2: `server/src/openspec.ts`, `plugin/bin/forgia.mts`, `plugin/hooks/hooks.json`, `plugin/skills/cantiere/SKILL.md`; «nato da» dalla scheda in `server/src/idee.ts` e `server/src/ui.ts`.
- Fase 3: `server/ui/src`, `server/ui/static/forgia.css`, `server/ui/dist`.
- Spec `server/cantieri`, `server/strumenti-mcp`, `server/dashboard`, `plugin/comando-cantiere`, `plugin/tracciamento`.
- Compatibile: i campi nuovi sono facoltativi, i plugin di oggi continuano a funzionare.
