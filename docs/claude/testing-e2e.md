# Verifica reale: utente temporaneo, API, Playwright

Dettaglio delle regole riassunte in `CLAUDE.md` (sezione "Verifica").

## Utente temporaneo

Nessuna credenziale dev/seed documentata. Per un test one-off creare un utente via query su `system_users`, verificare, poi **eliminarlo subito** (mai account di test in un DB con dati reali).

- Hash: `docker exec utenzepa-api-1 node -e "require('bcrypt').hash('pwd', 10).then(console.log)"`.
- Colonne: password in `password_hash` (non `password`); NOT NULL anche `first_name`, `last_name`, `status` (enum `Attivo`/`Disattivo`), `created_by_user_id`, `updated_by_user_id` (usare `1`, l'admin seed). Valorizzare `username` (il login è per username) e `auth_provider='local'`.
- Il ripristino del backup esclude `system_users`: i dati portano id di utenti di produzione che in locale non esistono (es. 23, migliaia di righe di audit, allegati, consumi). Un utente temporaneo con id automatico può prendere uno di quegli id e diventarne l'autore: inserirlo con un `id` esplicito alto e libero (es. `90001`). Alla pulizia eliminare solo le proprie righe di audit (per `created_at`) e mai riassegnare quelle altrui a `1`.
- Pulizia: prima `DELETE FROM audit_logs WHERE user_id=<id>` (FK). Se l'utente ha creato master data (capitolo, fornitore…), riassegnarle a `created_by_user_id=1`. Le FK verso `system_users` sono su ~17 tabelle:
  ```
  SELECT CONCAT(TABLE_NAME,'.',COLUMN_NAME) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='mydatabase' AND REFERENCED_TABLE_NAME='system_users';
  ```
- Per test E2E di salvataggio scegliere record completi (capitolo dell'utenza facoltativo dalla v1.13.0).

## Login via API

`POST /api/v1/authModule/login` (non `/auth/login`) con `{"email":"<username>","password":"..."}`: il campo `email` accetta lo username, un campo `username` extra → 400 (forbidNonWhitelisted). Risposta `{status,user,token:{access_token}}` (token annidato).

## Playwright

- Nessun browser nel container `frontend` (Karma/`ng test` non eseguibile, la CI non lo lancia): verifica = compilazione + E2E Playwright MCP dall'host.
- Su macchina carica, al posto di `pnpm run build` a ogni modifica: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"` (ng serve ricompila da solo).
- Ogni file salvato fa ricaricare la pagina e chiudere i dialog: aspettare "generation complete" nei log prima di riaprire. Subito dopo `navigate` la pagina può essere bianca: `browser_wait_for` su un testo, mai screenshot immediato.
- Liste con ricerca libera: dopo un Salva la lista si ricarica senza filtro, ricercare prima di riaprire (successo: salvata la fattura sbagliata).
- `?selectedId=<id>` apre il dialog su `/utilities`, `/building` (immobili, non `/assets`), `/contracts`; `/budget-chapter` (singolare) non lo supporta, aprire dalla riga.
- Datepicker Material: digitare `gg/mm/aaaa` (ISO → campo invalido, Salva disabilitato).
- Screenshot: solo dentro il repo (`.playwright-mcp/…`), lo scratchpad è fuori dalle root consentite.
- Viewport di default troppo stretto: form compresso, input larghi 0 e `fill` che fallisce con «element is not visible». Prima di provare pagine larghe (editor pattern): `browser_resize` 1500×950.
- `mat-select` in un `mat-form-field` outline: il click sul trigger viene intercettato dal `mat-label`. Cliccare `mat-label:text-is("<etichetta>")`, poi `role=option[name=/…/]`.

## Prove reali senza UI

- Script `.ts` in `backend/.cache/` (git-ignorata: può contenere POD e matricole): `docker exec utenzepa-api-1 sh -c 'cd /usr/src/app && pnpm exec ts-node -T -r tsconfig-paths/register .cache/<script>.ts'`.
- Connessione MySQL dal container: variabili `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DB` (non `DB_*`). Per provare un ripristino usare un DB temporaneo (`CREATE DATABASE tmp_…`) ed eliminarlo subito.

## Render di un SVG senza browser MCP

Edge headless: `msedge.exe --headless=new --disable-gpu --hide-scrollbars --screenshot=<png> --window-size=W,H <url>`. Aprire l'SVG direttamente lo inquadra male: caricarlo in un HTML wrapper con `<img width height>` fisso. Output PNG nello scratchpad (path Windows `cygpath -w`).

## Debug "il wizard/login non risponde" su un deploy

Quasi sempre `CORS_ORIGIN`/`API_URL` non allineati all'origine reale del browser (`SetupService.getStatus()` in errore di rete ritorna `false`, indistinguibile da "admin già esiste" senza la Network tab), oppure c'è già un admin in `system_users`. Controllare questi due prima di sospettare un bug.
