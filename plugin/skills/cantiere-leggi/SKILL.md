---
name: cantiere-leggi
description: Legge i file dei cantieri di cantiere forgia (idee e appunti caricati dalla dashboard, proposal, design, tasks, specs) senza prenderli. Usala quando l'utente dice che qualcosa è nel cantiere, in un'idea o negli appunti della dashboard, per esempio «li trovi nel cantiere», «è nell'idea adonis», «leggi gli appunti su forgia».
allowed-tools: Bash(forgia cerca:*), Bash(forgia leggi:*), Bash(forgia status:*), mcp__plugin_forgia_forgia__cerca_cantieri, mcp__plugin_forgia_forgia__leggi_cantiere, mcp__forgia__cerca_cantieri, mcp__forgia__leggi_cantiere
---
Leggere non prende il cantiere: niente `/cantiere prendi`, niente change OpenSpec, lo stato non cambia.

1. Se ci sono i tool `cerca_cantieri` e `leggi_cantiere` di forgia (`mcp__plugin_forgia_forgia__*`, o `mcp__forgia__*`), usa quelli: `cerca_cantieri` con le parole dell'utente, poi `leggi_cantiere` con il percorso (e il progetto, se lo stesso percorso c'è in più progetti) per l'elenco dei file, e con `file` per ognuno di quelli che servono.
2. Altrimenti, da terminale: `forgia cerca "<parole dell'utente>"`, poi `forgia leggi "<percorso>" --progetto <progetto>`, che stampa l'elenco e il contenuto di tutti i file; `forgia leggi "<percorso>" <file> --progetto <progetto>` per uno solo.
3. Se un tool risponde che la cartella non è collegata, o `forgia status --json` dice `in_area: false`, dillo in una riga e indica `/cantiere collega <progetto> <url>`. Non cercare mai token, configurazioni o impostazioni di Claude Code.

Se la ricerca non trova nulla, riprova con meno parole o con `forgia cerca ""` (tutti i cantieri del committente), poi chiedi all'utente quale cantiere intende.
