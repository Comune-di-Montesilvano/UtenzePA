# Eliminazione degli aggregati utenze (roadmap voce 11)

Data: 2026-10-03. Release prevista: v1.9.0, insieme a "Costi a carico calcolato" (`2026-10-03-costi-a-carico-calcolato-design.md`).

## Obiettivo

Gli aggregati utenze (`utility_aggregators`, 22 categorie libere ereditate da Access, assegnate a 632 utenze su 664) duplicano informazioni già presenti altrove. Si eliminano dal modello dati e dalla UI; il filtro per categoria dell'elenco utenze viene sostituito da filtri sugli oggetti collegati.

## Verifica dei dati (DB locale, 2026-10-03)

- Ogni utenza è collegata a un immobile o a un impianto, tranne 2 che non hanno nemmeno un aggregato.
- "pubblica illuminazione" (125), "pompe sollevamento" (16), "semafori" (13), "mobilità urbana" (10): tutte collegate a impianti, il tipo d'impianto porta la stessa informazione.
- "scuole", "sport", "istituzionali", "cimitero", "sanitarie", "sprar": l'immobile collegato ha già tipo (`asset_aggregators`) o funzione (`asset_functions`) corrispondente.
- "ex da verificare_disattivato" (48): tutte già con `supply_active = 0`.
- "sprar" (38): 28 sul capitolo 15048 (`supply_type = SPRAR_UTILITIES`), 10 no (9 senza capitolo, 1 su capitolo acqua).
- "punto presa … GENERICO" (68 + 59), "locali generali" (16), "attività sociali", "servizi sociali", "informativi", "strutture …": nessun contenuto informativo oltre a quanto detto dai collegamenti.

## Dati da sistemare prima della migration

Solo sul DB locale (la produzione si allinea con export/import):

- alle 10 utenze "sprar" fuori dal capitolo 15048 si aggiunge in coda alle note `Ex aggregato Access: SPRAR`;
- l'elenco di queste 10 (id e POD) va alla ragioneria per l'eventuale capitolo: il capitolo non si assegna d'ufficio;
- tutte le altre assegnazioni si scartano.

## Modifiche

Backend:

- rimosso il modulo `apis/utility-aggregators` (controller, service, DTO, entity, spec) e la sua registrazione in `app.module.ts`;
- `Utility`: rimossi `aggregator_id_fk` e la relazione; rimossi dai DTO create/update/search e da join e filtri di `UtilityService`;
- nuovi filtri di ricerca utenze, a scelta multipla:
  - `asset_type_ids`: utenze collegate (`utility_assets`) ad almeno un immobile non cancellato con `asset_type_id` nell'elenco;
  - `plant_types`: utenze collegate (`utility_plants`) ad almeno un impianto non cancellato con `type` nell'elenco (enum `PlantType`);
  - implementati con `EXISTS`, mai con join `...AndSelect`.

Frontend:

- rimossi pagina `pages/utility-aggregator/`, route e voce della sidebar;
- scheda utenza: rimossa la select Aggregato;
- elenco utenze: rimossi colonna e filtro Aggregato; aggiunti nel dialog filtri "Tipo immobile" (opzioni da `asset_aggregators`, label = `code`) e "Tipo impianto" (opzioni dai tipi d'impianto del frontend).

Migration `DropUtilityAggregators` (additiva solo in negativo, nessun dato spostato, quindi nessun controllo preliminare):

- `up()`: drop FK `FK_dba61ce41b0c75fe41d95eb23e5`, indice e colonna `utilities.aggregator_id_fk`, tabella `utility_aggregators`;
- `down()`: ricrea tabella (vuota) e colonna nullable con FK; i valori non si ricostruiscono.

## Test

- `UtilityService`: filtro `asset_type_ids` e `plant_types` generano la condizione `EXISTS` attesa; parametri vuoti = nessun filtro.
- Migration: ciclo reale up → down → up sul DB locale.
- E2E (Playwright): filtro Tipo immobile = SCUOLE restituisce le utenze delle scuole; la scheda utenza non mostra più Aggregato.

## Documentazione

- `CLAUDE.md`: togliere `utility-aggregators` dall'elenco moduli.
- Roadmap: voce 11 fatta (v1.9.0), con lo stato della lista SPRAR per la ragioneria.
