# Tracciamento modifiche (audit log) — design

Data: 2026-09-17

## Obiettivo

Tracciare le modifiche (create/update/delete) su tutte le entity di dominio gestite da `BaseService` (14 servizi: asset, asset-aggregators, utility, utility-types, utility-aggregators, utilizer, utilizer-grant, suppliers, purpose, invoices, contracts, consip-agreement, budget-chapters, system-users). Due superfici UI:

1. **Widget nei dettagli** di ogni entity (immobile, utenza, ecc.): storico ultimi 10 eventi, espandibile per vedere diff campo vecchio→nuovo, più "ultima modifica: utente/data" sempre visibile in testa.
2. **Log globale** (Impostazioni → Log modifiche), solo Admin, con filtro per entità/tabella e utente.

## Vincoli decisi

- **Retention**: log dettagliato (diff) purge automatico dopo 60 giorni (cronjob). Il riepilogo "ultima modifica" (chi + quando) resta per sempre — già coperto dalle colonne esistenti `updated_by_user_id`/`update_date` su ogni entity, nessun lavoro aggiuntivo per quello.
- **Eventi tracciati**: CREATE, UPDATE (diff per campo), DELETE (soft-delete, evento singolo senza diff campi).
- **FK**: nel diff, i campi che referenziano un'altra entity (es. `asset_type_id`) mostrano un'etichetta leggibile risolta **a scrittura** (snapshot del testo al momento del cambio, non a lettura) — mai euristica automatica su nomi di colonna. Vedi nota bug reale sotto.
- **Accesso log globale**: solo ruolo `Admin` (`UserRole.ADMIN`, enum già esistente in `apis/shared/enum/user.enums.ts`), tramite `RolesGuard`/`@Roles()` già presenti in `core/auth/`.
- **Campi mai loggati** (blocklist esplicita per entity, non euristica): `password_hash`, `otp`, `otp_expiry` su `system-users`. Sempre esclusi dal diff anche: `id`, `create_date`, `update_date`, `deleted` (il cambio di `deleted` è già coperto dall'evento DELETE separato, non va duplicato come diff campo).

## Perché hook in `BaseService`, non `EntitySubscriberInterface`

Alternativa scartata: subscriber TypeORM globale (`EntitySubscriberInterface`, hook `afterInsert`/`afterUpdate`/`afterRemove`) — zero modifiche per servizio, ma non ha accesso a "chi" ha fatto la modifica senza aggiungere `AsyncLocalStorage`/request-context plumbing per propagare lo `userId` della richiesta HTTP fino al livello ORM.

`BaseService.create/update/remove` (`backend/src/apis/shared/base.service.ts`) riceve **già** `userId` esplicito da ogni controller (es. `AssetsService.update` chiama `super.update(id, payload, userId)`, vedi `backend/src/apis/asset/assets.service.ts:126`). Hookare direttamente lì significa zero plumbing aggiuntivo, e resta coerente col pattern già in uso nel codebase (`created_by_user_id`/`updated_by_user_id` popolati nello stesso modo).

Contro: solo i servizi che passano da `BaseService.update/create/remove` (o chiamano `super.x()`) sono coperti. Verificato: tutti i 14 servizi di dominio estendono `BaseService` (grep `extends BaseService` su `backend/src/apis`); `AssetsService.update` override ma chiama `super.update()` — pattern già corretto, da verificare caso per caso per gli altri override esistenti in fase di implementazione.

## Schema DB

Nuova tabella `audit_logs` (migration TypeORM, pattern esistente in `src/database/migrations/`):

| colonna | tipo | note |
|---|---|---|
| `id` | int, PK autoincrement | |
| `entity_name` | varchar(100) | nome tabella/modulo, es. `'assets'` (stesso valore di `BaseService.entityName`) |
| `entity_id` | int | id della riga modificata |
| `action` | enum(`CREATE`,`UPDATE`,`DELETE`) | |
| `field_name` | varchar(100), nullable | null per CREATE/DELETE |
| `old_value` | text, nullable | valore grezzo precedente (stringificato) |
| `new_value` | text, nullable | valore grezzo nuovo |
| `old_label` | text, nullable | label risolta, solo per campi FK mappati |
| `new_label` | text, nullable | label risolta, solo per campi FK mappati |
| `user_id` | int, FK `system_users.id` | chi ha fatto la modifica |
| `created_at` | timestamp | default now |

Indici: `(entity_name, entity_id)` (query widget dettaglio), `(entity_name, user_id)` (query log globale filtrato).

## Risoluzione label FK — mappa esplicita, non euristica

CLAUDE.md documenta un bug reale: in `AssetAggregator`, `code` è la label breve corretta mostrata ovunque, `description` è una nota libera quasi sempre vuota — usarla come label ha prodotto righe vuote in `asset-filter-dialog.component.ts`. Qualunque euristica automatica ("prendi la prima colonna `name`/`description`-simile") riprodurrebbe lo stesso bug al primo giro qui.

Design: ogni service che vuole label leggibili per un campo FK dichiara una mappa esplicita:

```ts
protected readonly auditLabelResolvers?: Partial<Record<string, {
  repo: Repository<any>;
  field: string; // es. 'code' per AssetAggregator, non 'description'
}>> = {
  asset_type_id: { repo: this.assetAggregatorRepo, field: 'code' },
};
```

`BaseService` usa questa mappa (se presente per il campo cambiato) per risolvere `old_label`/`new_label` al momento della scrittura del diff — un lookup per id nella repo indicata. Campi non mappati: solo `old_value`/`new_value` grezzi (es. id numerico), niente label.

Snapshot a scrittura (non a lettura): la label resta storicamente accurata anche se l'entity collegata viene rinominata o cancellata in seguito — evita anche N+1 lookup a ogni view del log.

## Retention: cronjob imperativo, non `@Cron()`

CLAUDE.md documenta: `@nestjs/schedule@12` pubblica solo ESM, un import statico in un file coperto da spec Jest rompe la suite (`SyntaxError: Unexpected token export`). Fix già in uso nel repo: pattern "Dynamic schedule module", `SchedulerRegistry.addCronJob()` dentro `onModuleInit()`, import di `@nestjs/schedule` confinato al solo `.module.ts` (mai caricato dagli spec) — vedi `cronjobs.module.ts`/`backup.module.ts`.

Nuovo modulo `audit-log.module.ts` segue lo stesso pattern: cronjob giornaliero che esegue `DELETE FROM audit_logs WHERE field_name IS NOT NULL AND created_at < NOW() - INTERVAL 60 DAY` (righe UPDATE con diff). Le righe CREATE/DELETE (senza `field_name`, eventi "leggeri", un record per operazione) possono restare fuori dalla purge o seguire la stessa regola — da confermare in fase di implementazione, non impatta lo schema.

## API

Un solo endpoint generico (evita 14x duplicazione tra i moduli):

```
GET /api/v1/audit-log?entity=assets&entityId=42&userId=&page=1&pageSize=10
```

- `entity` + `entityId`: uso widget dettaglio (limit 10 default, paginabile).
- Solo `entity` (senza `entityId`) + `userId` opzionale + range date: uso log globale, admin-only (`@Roles(UserRole.ADMIN)`).
- Risposta: lista eventi con `entity_name, entity_id, action, field_name, old_value, new_value, old_label, new_label, user (nome risolto), created_at`, paginata.

## Frontend

### Widget storico (dettaglio entity)

Nuovo componente standalone riusabile, es. `frontend/src/app/core/components/entity-history.component.ts`. Input: `entity: string`, `entityId: number`. Comportamento:

- Header sempre visibile: "Ultima modifica: [nome utente] il [data]" — letto direttamente da `updated_by`/`update_date` dell'entity già caricata (nessuna chiamata HTTP aggiuntiva).
- Lista ultimi 10 eventi (chiamata a `GET /audit-log?entity=&entityId=&pageSize=10`), un item per evento: icona azione, data, autore, riepilogo (es. "3 campi modificati" per UPDATE, "creato" per CREATE).
- Click su un evento UPDATE espande i campi cambiati, ognuno con vecchio→nuovo valore (o label se risolta).
- Integrazione nei dialog esistenti (`AssetEditDialogComponent` e affini): sezione/tab dedicato — disposizione esatta (tab vs sezione fissa in fondo) da rifinire in implementazione, non bloccante per questo spec.

### Log globale (Impostazioni → Log modifiche)

Nuova pagina, route protetta da guard Admin (pattern esistente `guards/`), tabella con:

- Filtro: select entità/tabella, select utente, range date.
- Colonne: data, entità, id record, utente, azione, riepilogo campo/valori.
- Paginazione, riusa lo stesso endpoint generico.

## Testing

- Backend: unit test su generazione diff in `BaseService` (campi esclusi da blocklist, risoluzione label via `auditLabelResolvers`, eventi CREATE/UPDATE/DELETE), unit test sul cronjob di retention (righe più vecchie di 60gg vengono rimosse, righe più recenti no).
- Frontend: verifica end-to-end reale in browser (Angular template type-checking sfugge a `tsc --noEmit`, va sempre confermato con `ng build`/`ng serve` reale, non solo type-check) — apertura dialog con storico popolato, espansione diff, pagina log globale con filtri, controllo che un utente non-Admin non veda/acceda alla pagina log globale.

## Fuori scope (non richiesto in questo giro)

- Tracciamento modifiche su relazioni many-to-many pure (es. cambi di riga in tabelle di join senza propria entity/BaseService) — non emerso come richiesto, i 14 servizi coperti bastano.
- Ripristino/rollback di un valore precedente da UI (solo visualizzazione storico, nessuna azione di "annulla modifica").
- Export del log (CSV/PDF) — non richiesto, valutabile in giro successivo se serve.
