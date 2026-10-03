# Costi a carico calcolato e volture (roadmap voce 12)

Data: 2026-10-03. Release prevista: v1.9.0, insieme a "Eliminazione degli aggregati utenze" (`2026-10-03-eliminazione-aggregati-utenze-design.md`).

## Obiettivo

`costs_borne_by` è una lista libera ereditata da Access ("comune", "COMUNE C/O ENGIE", "concessionario", "azienda speciale", "GUARDIA COSTIERA", "asl", un caso "il Comune rimborsa") obbligatoria sull'utenza. La sostituiscono:

- un dato reale sull'utenza: **a chi è stata volturata** (soggetto terzo) e quando;
- uno **stato calcolato** che confronta la voltura con i contratti immobiliari attivi, così l'app ricorda da sola le volture da fare quando parte un contratto nuovo e quelle da riprendere quando un contratto finisce.

Tra l'attivazione di un contratto e la voltura effettiva passa sempre del tempo: in quel periodo l'utenza è "da volturare" e paga ancora il Comune.

## Dato salvato

Su `utilities`:

- `transferred_to_third_party_id` int nullable, FK `third_parties` ("Volturata a");
- `transferred_on` date nullable ("Volturata il", facoltativa: per il pregresso la data non è nota).

Validazione: il soggetto deve esistere e non essere cancellato (400 "Soggetto della voltura non trovato."); `transferred_on` senza soggetto è rifiutata (400 "Indicare a chi è stata volturata l'utenza."). Svuotare il soggetto = utenza ripresa dal Comune.

## Stato calcolato

Contratto **attivo** su un immobile dell'utenza (`utility_assets` → `utilizer_grant_assets` → `utilizer_grant`): `deleted = 0`, `status = 'ACTIVE'`, `direction = 'ACTIVE'` (il Comune concede). Contratto **con voltura**: attivo e `utilities_to_be_taken_over = 1`. Si considerano solo immobili e parti non cancellati. Le date del contratto non contano (decide lo stato); gli impianti non contano (sono del Comune).

| Volturata a | Contratti | Stato | Paga |
|---|---|---|---|
| vuoto | nessun contratto con voltura | `COMUNE` | Comune |
| vuoto | almeno un contratto con voltura (con almeno una parte) | `TO_TRANSFER` (da volturare) | Comune, finché il terzo non volta |
| soggetto X | X è parte di un contratto attivo (con o senza voltura) | `TRANSFERRED` (volturata) | X |
| soggetto X | X non è parte di nessun contratto attivo | `TO_RECOVER` (da riprendere) | X, senza titolo: va riportata al Comune o chiusa |

Il controllo "X è parte di un contratto attivo" copre anche i contratti figli (es. assegnazione di alloggio derivata dalla concessione all'Azienda Speciale), perché sono collegati agli stessi immobili. Un cambio di gestore (nuovo contratto con un'altra parte, il vecchio chiuso) porta l'utenza in `TO_RECOVER` se era volturata al vecchio gestore: la si sistema volturandola al nuovo.

## Modifiche

Backend:

- `apis/utility/cost-status.ts`: enum `CostStatus`; funzione pura `costInfo(utility)` sui dati che `findAll`/`findOne`/`findBySafeguard` già caricano (`assets.utilizerGrants.parties`, `transferredTo`), che restituisce `{status, parties, transferred_to, transferred_on}` (`parties` = parti dei contratti con voltura, deduplicate per contratto e parte; nome con `partyName`); `costStatusSql(status)` con la stessa regola in SQL (sotto-query correlate su `Utility.id`), usata da filtro e anomalie.
- `UtilitiesService`: `cost_info` aggiunto a ogni utenza restituita; relazione `transferredTo` caricata; validazione dei due campi in create/update; filtro `cost_status` (uno dei quattro stati); filtro `grant_id` (utenze collegate agli immobili di un contratto immobiliare).
- Anomalie: "Utenze da volturare" (`TO_TRANSFER`, solo `supply_active = 1`, con parti e data di inizio del contratto, ordinate per data di inizio) e "Utenze da riprendere" (`TO_RECOVER`, solo `supply_active = 1`, con il soggetto della voltura).
- Rimossi: modulo `apis/costs-borne-by`, entity `shared/entities/utility_cost_borne_by.entity.ts`, `costs_borne_by_id_fk` (entity, DTO dove era obbligatorio, service), registrazione in `app.module.ts`.

Frontend:

- rimossi pagina `pages/costs-borne-by/`, route, voce della sidebar;
- scheda utenza: rimossi la select "Costi a carico" e il tab **Controparti**; nel Riepilogo un riquadro "A carico di" con badge dello stato (Comune / Da volturare / Volturata / Da riprendere), le parti dei contratti con voltura con link alla scheda del contratto, e i campi "Volturata a" (select tra le parti dei contratti attivi e il soggetto attuale) e "Volturata il" (data); pulsante "Segna volturata oggi" quando lo stato è Da volturare e c'è una sola parte; "Ripresa dal Comune" svuota i due campi. Si salvano con il Salva della scheda;
- scheda contratto immobiliare: tab **Utenze** (sola lettura) con le utenze degli immobili del contratto e il loro stato; il click apre la scheda utenza, dove si segna la voltura;
- elenco utenze: colonna "A carico di" (stato + nome); nel dialog filtri select "A carico di" con i quattro stati;
- dashboard: due pannelli nella card anomalie.

Migration:

- `AddUtilityTransfer` (additiva): colonne `transferred_to_third_party_id` (con FK) e `transferred_on`;
- `DropCostsBorneBy`: drop FK `FK_ac19dbfc5a05c425d326d14548e`, colonna `utilities.costs_borne_by_id_fk`, tabella `costs_borne_by`; `down()` ricrea tabella vuota e colonna nullable con FK, i valori vecchi non si ricostruiscono.

## Dati da sistemare (DB locale, dopo `AddUtilityTransfer` e prima di `DropCostsBorneBy`)

Intervento one-shot: SQL eseguito a mano sul DB locale, mai nel repo né dentro una migration. Una lista alla volta con conferma dell'utente.

1. "concessionario" e "azienda speciale" (le utenze di oggi sono considerate già volturate): `transferred_to_third_party_id` = la parte del contratto attivo sull'immobile, senza data; più parti o nessun contratto → lista da decidere;
2. "concessionario" senza contratto attivo (circa 33): aggiungere il contratto nel registro e volturare alla sua parte, oppure lasciare al Comune;
3. "GUARDIA COSTIERA", "asl", "il Comune rimborsa" (tutte disattivate): in coda alle note `Ex costi a carico Access: <valore>`;
4. "comune" su contratti con voltura (14, es. Azienda Speciale): nessun intervento, finiscono in "Da volturare" e l'utente le verifica dall'anomalia.

"C/O ENGIE" (pubblica illuminazione, contratto di fornitura Engie) e il resto di "comune" non richiedono interventi.

## Test

- `costInfo`: ognuna delle quattro righe della tabella; contratto con voltura senza parti → Comune; flag `1`/`0` da MySQL; contratto `RETURNED`/`TERMINATED`/`DISPUTED`/`PASSIVE`/cancellato non conta; parte cancellata non conta; due contratti → entrambe le parti; stesso contratto su due immobili → una volta; volturata a una parte di un contratto senza voltura → Volturata; solo impianti → Comune.
- `costStatusSql`: per ogni stato, condizione su `transferred_to_third_party_id` ed `EXISTS`/`NOT EXISTS` attesi.
- Validazione dei campi voltura in update (soggetto inesistente, data senza soggetto).
- Migration: ciclo reale up → down → up sul DB locale.
- E2E: utenza Da volturare → "Segna volturata oggi" → Salva → stato Volturata; tab Utenze del contratto; anomalie in dashboard; nuova utenza salvata senza costi a carico.

## Documentazione

- `CLAUDE.md`: togliere `costs-borne-by` dall'elenco moduli; nota sulla regola (`cost-status.ts`, gemella SQL).
- Roadmap: voce 12 fatta (v1.9.0), con l'esito delle liste dati.
