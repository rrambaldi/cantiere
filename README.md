# cantiere forgia

Tiene traccia del lavoro fatto con Claude Code. Le sessioni si raggruppano in **cantieri**: unità
di lavoro (una feature, un bug, una migrazione) che durano più sessioni e passano da un computer
all'altro. Al server arrivano solo stato, todo e conteggi: mai prompt, conversazioni o output dei
comandi.

| Parte | Dove | Cosa fa |
|---|---|---|
| Contratto v1 | [`docs/contratto-v1.md`](docs/contratto-v1.md) | API e tool MCP condivisi tra server e plugin |
| Server | [`server/`](server/README.md) | API REST degli eventi e tool MCP, su SQLite |
| Plugin | [`plugin/`](plugin/README.md) | plugin Claude Code: hook automatici e comando `/cantiere` |

## Installazione del plugin

```
/plugin marketplace add <percorso o URL git di questa repo>
/plugin install forgia@forgia
```

Poi `/cantiere` per collegarlo al server. Dettagli in [`plugin/README.md`](plugin/README.md).

Il server è TypeScript eseguito direttamente da Node ≥ 22.18. Il plugin è scritto in TypeScript e
spedito compilato in JavaScript (`plugin/bin/forgia.mjs`), perché parta in fretta a ogni hook.

Il nome tecnico, usato in comandi e identificativi, è `forgia`: `mcp__forgia__*`, `forgia-admin`,
`FORGIA_*`.
