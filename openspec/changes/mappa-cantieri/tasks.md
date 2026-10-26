# Tasks

## 1. Legami nel server

- [x] 1.1 Migrazione `0004_legami.ts` e tipi in `db.ts`
- [x] 1.2 `apri_cantiere`: `nato_da`, `nato_da_progetto` e `task` nell'evento REST e nel tool MCP; legame automatico alla nascita (`dominio.ts`, `modelli.ts`, `strumenti.ts`)
- [x] 1.3 `nato_da` nelle letture dei cantieri (`leggiCantieri`: API, MCP, albero)
- [x] 1.4 Regola nel contesto di avvio e conferma del tool che nomina il cantiere di partenza
- [x] 1.5 Contratto v2 e test

## 2. Plugin e legami citati

- [x] 2.1 Legami citati dai file dei change (`openspec.ts`), sotto quelli registrati
- [x] 2.2 `/cantiere dirama <progetto>/<nome> [--task N]`, legame conservato da `/cantiere prendi`
- [x] 2.3 Hook sul tool `Agent`: evento con il solo tipo, conteggio per sessione
- [ ] 2.4 «Nato da» da mettere e togliere dalla scheda del cantiere

## 3. Dashboard

- [ ] 3.1 Scheda «Task e rami» del cantiere
- [ ] 3.2 Scheda «Binari» del committente: fermi, idee prese, rami e monconi tra progetti; visite dei legami con i cantieri già visti, perché un giro resta possibile (design, rischi)
- [ ] 3.3 Al telefono il quadro ad albero
- [ ] 3.4 Subagenti contati accanto a ogni sessione del cantiere
- [ ] 3.5 Testi IT/EN, build della UI, verifica nel browser a 1440, 1100 e 390 px
