## Cosa cambia

<!-- Descrizione breve del cambiamento e perché serve -->

## Come è stato testato

<!-- Comandi eseguiti, ambiente (locale/CI), esito -->

## Checklist

- [ ] Lint passa (backend `pnpm run lint:ci`, frontend `pnpm run lint`)
- [ ] Test passano (spec toccati in locale, o CI verde su questa PR)
- [ ] Nuova funzionalità o bugfix coperti da test automatici (bugfix: test di regressione), oppure motivato sopra perché no
- [ ] `pnpm run build` passa (backend e frontend)
- [ ] Se ho toccato un `package.json`, ho aggiornato il relativo `pnpm-lock.yaml`
- [ ] Se ho aggiunto una migration, `schema:log` è pulito sulle tabelle toccate (vedi `docs/claude/backend.md`)
- [ ] Se la modifica è visibile all'utente, ho aggiornato `frontend/public/guida/guida.md` (con la data in testa)
- [ ] Nessun segreto o dato reale dell'ente nel codice, nei test o nelle fixture
- [ ] Ho letto `CLAUDE.md` per pattern/gotcha noti prima di riproporre un bug già risolto
