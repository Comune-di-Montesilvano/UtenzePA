# Costi a carico calcolato (roadmap voce 12)

Data: 2026-10-03. Release prevista: v1.9.0, insieme a "Eliminazione degli aggregati utenze" (`2026-10-03-eliminazione-aggregati-utenze-design.md`).

## Obiettivo

`costs_borne_by` è una lista libera ereditata da Access ("comune", "COMUNE C/O ENGIE", "concessionario", "azienda speciale", "GUARDIA COSTIERA", "asl", un caso "il Comune rimborsa") obbligatoria sull'utenza. Diventa un valore **calcolato** dal registro dei contratti immobiliari: nessun campo da tenere allineato a mano.

## Regola

Un'utenza è **a carico di terzi** se è collegata (`utility_assets`) ad almeno un immobile che ha un contratto immobiliare (`utilizer_grant_assets` → `utilizer_grant`) con:

- `deleted = 0`;
- `status = 'ACTIVE'`;
- `direction = 'ACTIVE'` (il Comune concede);
- `utilities_to_be_taken_over = 1` ("Utenze da volturare").

I paganti sono le parti (`utilizer_grant_parties` → `third_parties`, non cancellate) di quei contratti. In ogni altro caso paga il **Comune**. Le date del contratto non contano (decide lo stato, così i rinnovi taciti restano coperti). I collegamenti a impianti non contano: gli impianti sono tutti del Comune.

"C/O ENGIE" (125 utenze di pubblica illuminazione, attive) è già rappresentato dal contratto di fornitura Engie: calcolato = Comune, nessuna perdita.

## Approccio

Calcolo a ogni lettura (scelto), non colonna salvata, sui contratti immobiliari già caricati con l'utenza: con circa 660 utenze il costo è trascurabile e non servono agganci ai salvataggi di contratti, immobili e utenze.

## Modifiche

Backend:

- funzione pura `costPayers(utility)` in `apis/utility/cost-payers.ts`: lavora sui dati che `findAll`/`findOne`/`findBySafeguard` già caricano (`assets.utilizerGrants.parties`, relazioni reali) e restituisce `cost_payers: {grant_id, third_party_id, name}[]`; nome con `partyName` (ragione sociale o "cognome nome"). Duplicati (stessa parte su due immobili dello stesso contratto) rimossi. Nessuna query in più.
- `withCurrentContractFields` aggiunge `cost_payers` (array vuoto = Comune) a ogni utenza restituita.
- Filtro di ricerca `cost_payer`: `COMUNE` (`NOT EXISTS` sulla catena) o `THIRD_PARTY` (`EXISTS`).
- Rimossi: modulo `apis/costs-borne-by`, entity `shared/entities/utility_cost_borne_by.entity.ts`, `costs_borne_by_id_fk` da entity, DTO (era obbligatorio) e service, registrazione in `app.module.ts`.

Frontend:

- rimossi pagina `pages/costs-borne-by/`, route e voce della sidebar;
- scheda utenza: rimossa la select obbligatoria "Costi a carico" e il tab **Controparti**; nel Riepilogo un riquadro "A carico di" con badge "Comune" o "Terzi" e, per i terzi, nomi con link alla scheda del contratto immobiliare (`EntityNavigatorService`);
- elenco utenze: colonna "A carico di" (Comune oppure nomi separati da virgola); nel dialog filtri select "A carico di" (Tutti / Comune / Terzi).

Migration `DropCostsBorneBy` (nessun dato spostato, quindi nessun controllo preliminare):

- `up()`: drop FK `FK_ac19dbfc5a05c425d326d14548e`, indice e colonna `utilities.costs_borne_by_id_fk`, tabella `costs_borne_by`;
- `down()`: ricrea la tabella vuota e la colonna come nullable con FK; i valori vecchi non si ricostruiscono.

## Dati da sistemare prima della migration

Solo sul DB locale, una lista alla volta con conferma dell'utente:

Intervento one-shot: SQL eseguito a mano sul DB locale, mai nel repo né dentro la migration (la migration tocca solo lo schema).

1. utenze "comune" che il calcolo assegnerebbe a terzi (14, di cui 8 attive): correggere il flag "Utenze da volturare" del contratto o accettare il nuovo valore;
2. utenze "concessionario" senza contratto attivo con voltura (33, di cui 25 attive): aggiungere o riattivare il contratto nel registro, oppure accettare Comune;
3. utenze con valore "GUARDIA COSTIERA", "asl", "azienda speciale" o il caso "il Comune rimborsa" (16, tutte disattivate): in coda alle note `Ex costi a carico Access: <valore>`.

Le altre ("comune" senza contratto o con contratto senza voltura, "C/O ENGIE", "concessionario" coerenti) non richiedono interventi.

## Test

- Calcolo `cost_payers`: contratto attivo con voltura → parti; senza voltura → Comune; cessato (`RETURNED`/`TERMINATED`) → Comune; `PASSIVE` → Comune; contratto cancellato → Comune; due contratti sullo stesso immobile → entrambe le parti; utenza solo su impianti → Comune; parte presente su due immobili dello stesso contratto → una sola volta.
- Filtro `cost_payer` `COMUNE`/`THIRD_PARTY`: condizione `EXISTS`/`NOT EXISTS` attesa.
- Migration: ciclo reale up → down → up sul DB locale.
- E2E (Playwright): scheda di un'utenza a carico di un concessionario mostra il riquadro con il link al contratto; filtro Terzi nell'elenco.

## Documentazione

- `CLAUDE.md`: togliere `costs-borne-by` dall'elenco moduli; nota sulla regola di calcolo.
- Roadmap: voce 12 fatta (v1.9.0), con l'esito delle liste dati.
