# Dati: correzioni one-off e fonti esterne

Dettaglio delle regole riassunte in `CLAUDE.md` (sezione "Dati"). Le correzioni si fanno dalla UI o con interventi one-off sul DB locale (produzione = export + import), mai con codice di import nel repo (importatore Access/CSV rimosso il 2026-10-02).

## Export da Access (`.accdb`) con mdbtools

- Alpine: il pacchetto `mdbtools` installa solo le librerie, i binari CLI sono in `mdbtools-utils`.
- Debian (`node:24`): le flag corte (`-d`, `-D`) falliscono, usare le lunghe (`--delimiter=`, `--date-format=`, `--datetime-format=`).
- Colonne lookup di Access (mostrano testo, salvano l'id FK): l'export dà l'id numerico. Verificare sempre contro la tabella lookup.
- `iconv` BusyBox (Alpine) sostituisce gli apostrofi tipografici con `*`: serve GNU `iconv` (Debian) con `//TRANSLIT`.

## Fonti esterne

- POD in TINN/ordini CONSIP a volte a 15 caratteri (14 + cifra di controllo): normalizzare a 14 (`IT\d{3}E\d{8}`) prima di confrontare con il DB.
- Fatture ACA (`.audit-w/aca_*`): codice servizio = `utilities.utility_id` (utenze vecchie: `utility_code`), capitolo = `codice/articolo` (es. `12333/2`); totali a 3 decimali, salvati arrotondati a 2.
- Capitoli di spesa rinumerati negli anni (11201→11407, 11218→11408, 11188→14091, 14521/0→14521/20): dati contabili storici abbinati per descrizione, non per codice, e confermati con la ragioneria (mai capitolo "provvisorio" a mano).

## Interventi già fatti

- Presidi antincendio (`plant_fire_equipment`): l'import una tantum aveva creato righe spurie (nota "(collaudo ogni 6 anni…)" spezzata in 2 "estintori" per impianto, più la tabella superfici/piani dell'impianto 354). Criterio: `equipment_type='EXTINGUISHER' AND (agent IS NULL OR agent NOT IN ('polvere','co2')) AND capacity IS NULL` (88 righe). Soft-deleted solo nel DB locale (2026-10-02); produzione da verificare.
- `utilities.meter_verified` ("Contatore verificato", flag del vecchio software = utenza localizzata) rimosso in v1.16.0: sostituito dall'anomalia calcolata `active_utilities_without_position`.
