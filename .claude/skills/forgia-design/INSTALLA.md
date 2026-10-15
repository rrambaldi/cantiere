# Installazione in Claude Code

Come skill di progetto (consigliato):

```
mkdir -p .claude/skills
unzip forgia-design-system.zip -d .claude/skills/
mv .claude/skills/forgia-design-system .claude/skills/forgia-design
```

Claude Code la trova da `.claude/skills/forgia-design/SKILL.md` e la usa quando lavori su UI, README o asset di forgia. Puoi anche invocarla a mano con `/forgia-design`.

Come skill personale (tutti i progetti): stessa cartella in `~/.claude/skills/forgia-design/`.

Per usare solo i token nel codice: importa `styles.css` (o i singoli file in `tokens/`) e copia i file del logo da `assets/logo/`.

Note:
- i font IBM Plex arrivano da Google Fonts (`tokens/fonts.css`): per l'uso offline sostituisci con file locali;
- `ui_kits/dashboard/index.html` si apre da un server locale (es. `npx serve .`), non da `file://`, perché carica i sorgenti dei componenti.
