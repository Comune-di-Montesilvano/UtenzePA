# Backend: migration e insidie note

Dettaglio delle regole riassunte in `CLAUDE.md` (sezioni "Migration DB" e "Backend").

## Migration

- `migrationsRun: true` in `mysql.module.ts`: le migration pendenti girano da sole a ogni avvio (dev e prod). `SYNCHRONIZE=true`/`DROPSCHEMA=true` restano come escape hatch dev, mai in produzione.
- Generazione (sempre nel container):
  ```
  docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate src/database/migrations/NomeMigration -d src/database/data-source.ts
  ```
- `migration:generate` include drift preesistente non correlato (indici/FK/narrowing su `system_users`, `utilizer`, `invoice_budget_chapter`, `contract_utilities`, `utilities.actual_consumption`…), eredità di un vecchio `SYNCHRONIZE=true`. Prima di committare: rigenerare con le proprie modifiche stashate, confrontare che il drift sia identico, poi scrivere a mano la migration finale solo con gli statement della feature.
- Verifica entity ↔ migration scritta a mano:
  ```
  docker exec utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js schema:log -d src/database/data-source.ts
  ```
  Nessuno statement sulle tabelle toccate = allineate (il resto è drift preesistente).
- **Scrivere la migration in uno scratch path** fuori da `src/database/migrations/` e spostarla solo a contenuto finale: `nest start --watch` + `migrationsRun` può eseguirla appena la vede, anche a metà. Le DDL MySQL fanno commit implicito, la transazione TypeORM non le annulla. Se è già partita a metà: pulire a mano lo schema (colonne/tabelle orfane) e la riga in `migrations`.
- Il watcher non sempre riavvia l'app dopo aver compilato una migration nuova (osservato in v1.16.0: "Found 0 errors" ma migration non applicata). Verificare la riga in `migrations`; se manca, `docker restart utenzepa-api-1`. Dopo un restart la migration gira solo a ricompilazione finita: una query subito dopo può non vederla.
- Rinominare/sostituire una migration già applicata in locale: aggiornare `migrations.name`, poi `rm -rf dist tsconfig.build.tsbuildinfo` + `docker restart` (il `.js` vecchio in `dist` verrebbe rieseguito).
- Migration che spostano dati: controlli preliminari (SELECT) prima di ogni DDL, con errore leggibile (esempio: `1791500000000-ThirdParties.ts`). Testarle con un `QueryRunner` simulato in uno spec **fuori** da `src/database/migrations/` (il glob `*.{ts,js}` caricherebbe lo spec come migration), poi ciclo reale up → down → up confrontando i dati, non solo i conteggi (un `down()` che altera dati viene ricopiato dal successivo `up()`).
- Colonna stringa nullable in entity (`string | null`): `type: 'varchar'` esplicito, altrimenti reflect-metadata dà `Object` e TypeORM non ricava il tipo.
- Lo storico della baseline: `InitialSchema` generata dallo schema esistente; testati due riavvii consecutivi puliti.

## TypeORM

- `leftJoinAndSelect` su un'entity "libera" (join per classe con sotto-query custom, non un path di relazione) non idrata il risultato se nella stessa query ci sono altri join one-to-many: nessun errore, campo sempre `null`. Trovato solo con una chiamata HTTP reale, mai con test a querybuilder mockato. Fix: quel join solo per `WHERE`, dati risolti con una query batched separata sull'entity target.
- `findOne()` spesso joina relazioni che `findAll()` non joina (visto su `utilityType`, poi `created_by`/`updated_by` in `AssetsService`/`UtilitiesService`). I dialog si aprono dalla riga già caricata in tabella: prima di bindare un campo relazione, verificare che `findAll()` lo joini.
- `invalidWhereValuesBehavior` è il default `'throw'`: ogni valore in una where object-criteria dev'essere una costante, un parametro validato da DTO o un lookup con guardia `if (!value)`. Un `undefined` lancia (invece di diventare "nessun filtro", che farebbe match su una riga qualsiasi). Opzione solo a livello DataSource.
- MySQL 8: in una `SELECT DISTINCT` l'`ORDER BY` può usare solo colonne/alias selezionati.
- Scrittura di sistema (ricalcoli/cron) che non deve spostare "Ultima modifica": `repo.update(id, {..., update_date: () => '`update_date`'})` — esclude sia `@UpdateDateColumn` sia `ON UPDATE` MySQL (vedi `ConsumptionRecalcService`).

## Varie

- Body-parser di default: limite 100KB. Un DTO con data URI base64 (logo/favicon, `MAX_DATA_URI_LENGTH` in `update-branding.dto.ts`) fallisce con `PayloadTooLargeError` **prima** della validazione, senza indizi nei log. Serve `app.use(json({limit:'Nmb'}))` in `main.ts`, allineato al DTO.
- Lib TS < ES2022: niente `Array.prototype.at()` (TS2550 in jest), usare `arr.slice(-1)[0]`.
- `deleted` nei DTO di ricerca: `Transform` esplicito, mai `@Type(() => Boolean)` (`Boolean('false')` è `true`).
- Spec di `AnomaliesService`: molti test usano mock posizionali (`mockResolvedValueOnce` in ordine di query). Query nuove in fondo a `getAnomalies()` oppure test con `mockImplementation` filtrato sull'SQL, e aggiornare il `toHaveBeenCalledTimes`.
- Geocodifica (`apis/geocoding/`): `GeocodingModule.onModuleInit()` scansiona a ogni avvio gli asset senza `geocoded_latitude`, un riavvio basta. Tasto manuale in Impostazioni → Backup e manutenzione → Geocodifica per forzare anche i già geocodificati. Nominatim pubblico: `Retry-After` può essere `0` mentre risponde ancora 429, quindi sempre `max(Retry-After, backoff esponenziale)` e budget lungo (15 minuti in `GeocodingService`).
- Restore backup (`BackupService.restoreFromFile`) accetta `excludeTables` (UI: "non ripristinare utenti/branding"): filtra il dump a livello di blocco usando `DROP TABLE IF EXISTS` come delimitatore (non split su `;`), non tocca le FK verso le tabelle escluse.

## Storia: allineamento agli standard interni

Primo giro "soft" verso le convenzioni di `comunicaPA`: workflow `.github/` (`tests.yml`, `release.yml`, `publiccode-validate.yml`), split `docker-compose.yml`/`docker-compose.override.yml`, `.env.example` root, `publiccode.yml`. Gap analysis completa in `docs/superpowers/specs/2026-08-03-allineamento-standard-interni-design.md`.

- Corretto: `mysql.module.ts` ignorava le variabili del compose (dev hardcoded, prod con nomi `DB_*` diversi da `MYSQL_*`, DB sempre `'mydatabase'`): una `MYSQL_PASSWORD` forte veniva ignorata. Ora legge sempre `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DB` con gli stessi fallback.
- Risolti: CORS ristretto via `CORS_ORIGIN`; un solo sistema email (`core/email/email.service.ts`); bootstrap primo Admin (wizard `/setup` + `POST /api/v1/setup/{request-otp,verify}`, OTP email **e** `SETUP_BOOTSTRAP_TOKEN` comunicato fuori banda); Mongoose/Redis/cache-manager rimossi.
- Aperto: `backend/.env.example` non riflette le variabili lette dal codice (elenca `MONGODB_URI`, `SMTP_HOST`…, non `MYSQL_*`), da riscrivere.
