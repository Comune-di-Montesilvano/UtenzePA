import { MigrationInterface, QueryRunner } from 'typeorm';
import { effectiveEndDate, todayIso } from '../../apis/utilizer-grant/real-estate-contract.calc';
import { ContractStatus } from '../../apis/utilizer-grant/enum/real-estate-contract.enum';

// Storico utenze (roadmap voce 22): una riga per ogni cambiamento di un'utenza
// (attivazione, cessazione, voltura, reintestazione) e la decisione per
// contratto immobiliare x utenza. Le colonne attuali (supply_active,
// activated_on, ceased_on, transferred_*) restano e vengono convertite in
// eventi; transfer_required resta finché DTO e service lo usano.
// Prima di ogni DDL (commit implicito in MySQL) si calcola tutto e si ferma con
// l'elenco degli id se i dati non sono convertibili senza cambiare lo stato.

interface UtilityRow {
  id: number;
  supply_active: number | boolean | null;
  activated_on: string | null;
  ceased_on: string | null;
  transferred_to_third_party_id: number | null;
  transferred_on: string | null;
  created_by_user_id: number;
  updated_by_user_id: number;
}

interface EventRow {
  utility: number;
  type: 'ACTIVATION' | 'CESSATION' | 'TRANSFER';
  thirdParty: number | null;
  effectiveOn: string | null;
  dateUnknown: boolean;
  createdBy: number;
  updatedBy: number;
}

interface GrantRow {
  grant_id: number;
  utility_id: number;
  utilities_to_be_taken_over: number | boolean | null;
  end_date: string | null;
  tacit_renewal: number | boolean | null;
  renewal_months: number | null;
  notice_months: number | null;
  status: ContractStatus;
}

const CHUNK = 200;

function convert(u: UtilityRow): EventRow[] {
  const base = { utility: u.id, createdBy: u.created_by_user_id, updatedBy: u.created_by_user_id };
  const events: EventRow[] = [];
  const active = !!Number(u.supply_active ?? 0);
  // Una cessazione presuppone un'attivazione (eventualmente a data non nota).
  const hasCessation = !active || !!u.ceased_on;
  events.push({
    ...base,
    type: 'ACTIVATION',
    thirdParty: null,
    effectiveOn: u.activated_on,
    dateUnknown: !u.activated_on,
  });
  if (hasCessation) {
    events.push({
      ...base,
      type: 'CESSATION',
      thirdParty: null,
      effectiveOn: u.ceased_on,
      dateUnknown: !u.ceased_on,
    });
  }
  if (u.transferred_to_third_party_id !== null && u.transferred_to_third_party_id !== undefined) {
    events.push({
      ...base,
      type: 'TRANSFER',
      thirdParty: u.transferred_to_third_party_id,
      effectiveOn: u.transferred_on,
      dateUnknown: !u.transferred_on,
    });
  }
  return events;
}

export class UtilitySupplyHistory1794700000000 implements MigrationInterface {
  name = 'UtilitySupplyHistory1794700000000';

  public async up(q: QueryRunner): Promise<void> {
    const utilities: UtilityRow[] = await q.query(
      "-- utenze da convertire\nSELECT id, supply_active, DATE_FORMAT(activated_on, '%Y-%m-%d') AS activated_on, " +
        "DATE_FORMAT(ceased_on, '%Y-%m-%d') AS ceased_on, transferred_to_third_party_id, " +
        "DATE_FORMAT(transferred_on, '%Y-%m-%d') AS transferred_on, " +
        // L'autore deve esistere (FK di utility_supply_events): se manca, il primo utente.
        'COALESCE((SELECT s.id FROM `system_users` s WHERE s.id = utilities.created_by_user_id), (SELECT MIN(id) FROM `system_users`)) AS created_by_user_id, ' +
        'COALESCE((SELECT s.id FROM `system_users` s WHERE s.id = utilities.created_by_user_id), (SELECT MIN(id) FROM `system_users`)) AS updated_by_user_id ' +
        'FROM `utilities` ORDER BY id',
    );

    // Controlli prima di qualunque DDL.
    const inverted = utilities.filter(
      (u) => u.activated_on && u.ceased_on && u.ceased_on < u.activated_on,
    );
    if (inverted.length) {
      throw new Error(
        `Utenze con data di cessazione precedente all'attivazione (id: ${inverted.map((u) => u.id).join(', ')}). Correggere le date prima di rilanciare la migration.`,
      );
    }
    const changed = utilities.filter((u) => !!Number(u.supply_active ?? 0) !== !convert(u).some((e) => e.type === 'CESSATION'));
    if (changed.length) {
      throw new Error(
        `Utenze attive con data di cessazione, la conversione ne cambierebbe lo stato (id: ${changed.map((u) => u.id).join(', ')}). Sistemare supply_active o ceased_on prima di rilanciare la migration.`,
      );
    }

    const grantRows: GrantRow[] = await q.query(
      "-- contratti attivi\nSELECT g.id AS grant_id, ua.utility_id AS utility_id, g.utilities_to_be_taken_over, " +
        "DATE_FORMAT(g.end_date, '%Y-%m-%d') AS end_date, g.tacit_renewal, g.renewal_months, g.notice_months, g.status " +
        'FROM `utilizer_grant` g ' +
        'JOIN `utilizer_grant_assets` uga ON uga.utilizer_grant_id = g.id ' +
        'JOIN `assets` a ON a.id = uga.asset_id AND a.deleted = 0 ' +
        'JOIN `utility_assets` ua ON ua.asset_id = a.id ' +
        'JOIN `utilities` u ON u.id = ua.utility_id AND u.deleted = 0 ' +
        "WHERE g.deleted = 0 AND g.direction = 'ACTIVE' AND g.status = 'ACTIVE' " +
        'ORDER BY g.id, ua.utility_id',
    );
    const today = todayIso();
    const decisions = new Map<string, [number, number, string | null]>();
    for (const r of grantRows) {
      const end = effectiveEndDate(
        {
          end_date: r.end_date,
          tacit_renewal: !!Number(r.tacit_renewal ?? 0),
          renewal_months: r.renewal_months,
          notice_months: r.notice_months,
          status: r.status,
        },
        today,
      );
      if (end !== null && end < today) continue;
      const key = `${r.grant_id}:${r.utility_id}`;
      if (decisions.has(key)) continue;
      // Con "Utenze da volturare" l'utenza è da decidere (null), altrimenti resta al Comune.
      decisions.set(key, [
        r.grant_id,
        r.utility_id,
        Number(r.utilities_to_be_taken_over ?? 0) ? null : 'STAYS',
      ]);
    }

    await q.query(
      'CREATE TABLE `utility_supply_events` (' +
        '`id` int NOT NULL AUTO_INCREMENT, ' +
        '`utility_id_fk` int NOT NULL, ' +
        '`type` varchar(20) NOT NULL, ' +
        '`third_party_id_fk` int NULL, ' +
        '`requested_on` date NULL, ' +
        '`effective_on` date NULL, ' +
        '`date_unknown` tinyint NOT NULL DEFAULT 0, ' +
        '`cancelled_on` date NULL, ' +
        '`utilizer_grant_id_fk` int NULL, ' +
        '`notes` text NULL, ' +
        '`create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        '`created_by_user_id` int NOT NULL, ' +
        '`updated_by_user_id` int NOT NULL, ' +
        '`deleted` tinyint NOT NULL DEFAULT 0, ' +
        'INDEX `IDX_supply_events_utility` (`utility_id_fk`, `deleted`), ' +
        'PRIMARY KEY (`id`), ' +
        'CONSTRAINT `FK_supply_events_utility` FOREIGN KEY (`utility_id_fk`) REFERENCES `utilities`(`id`), ' +
        'CONSTRAINT `FK_supply_events_third_party` FOREIGN KEY (`third_party_id_fk`) REFERENCES `third_parties`(`id`), ' +
        'CONSTRAINT `FK_supply_events_grant` FOREIGN KEY (`utilizer_grant_id_fk`) REFERENCES `utilizer_grant`(`id`), ' +
        'CONSTRAINT `FK_supply_events_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`), ' +
        'CONSTRAINT `FK_supply_events_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`)' +
        ') ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `utilizer_grant_utility_decisions` (' +
        '`id` int NOT NULL AUTO_INCREMENT, ' +
        '`utilizer_grant_id_fk` int NOT NULL, ' +
        '`utility_id_fk` int NOT NULL, ' +
        '`decision` varchar(20) NULL, ' +
        '`third_party_id_fk` int NULL, ' +
        '`create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        '`updated_by_user_id` int NULL, ' +
        'UNIQUE INDEX `UQ_grant_decisions_grant_utility` (`utilizer_grant_id_fk`, `utility_id_fk`), ' +
        'PRIMARY KEY (`id`), ' +
        'CONSTRAINT `FK_grant_decisions_grant` FOREIGN KEY (`utilizer_grant_id_fk`) REFERENCES `utilizer_grant`(`id`), ' +
        'CONSTRAINT `FK_grant_decisions_utility` FOREIGN KEY (`utility_id_fk`) REFERENCES `utilities`(`id`), ' +
        'CONSTRAINT `FK_grant_decisions_third_party` FOREIGN KEY (`third_party_id_fk`) REFERENCES `third_parties`(`id`), ' +
        'CONSTRAINT `FK_grant_decisions_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`)' +
        ') ENGINE=InnoDB',
    );
    await q.query(
      "ALTER TABLE `utilities` ADD `cost_status` varchar(20) NOT NULL DEFAULT 'COMUNE', ADD `pending_since` date NULL",
    );

    const events = utilities.flatMap(convert);
    for (let i = 0; i < events.length; i += CHUNK) {
      const chunk = events.slice(i, i + CHUNK);
      await q.query(
        'INSERT INTO `utility_supply_events` ' +
          '(`utility_id_fk`, `type`, `third_party_id_fk`, `effective_on`, `date_unknown`, `created_by_user_id`, `updated_by_user_id`) VALUES ' +
          chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', '),
        chunk.flatMap((e) => [
          e.utility,
          e.type,
          e.thirdParty,
          e.effectiveOn,
          e.dateUnknown ? 1 : 0,
          e.createdBy,
          e.updatedBy,
        ]),
      );
    }

    const rows = [...decisions.values()];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await q.query(
        'INSERT INTO `utilizer_grant_utility_decisions` ' +
          '(`utilizer_grant_id_fk`, `utility_id_fk`, `decision`) VALUES ' +
          chunk.map(() => '(?, ?, ?)').join(', '),
        chunk.flat(),
      );
    }

    // Stato iniziale di "A carico di" (il servizio dello storico lo ricalcola
    // sempre): intestate a un terzo = TRANSFERRED, decisione vuota = TO_DECIDE.
    await q.query(
      "UPDATE `utilities` SET `cost_status` = 'TRANSFERRED' WHERE `transferred_to_third_party_id` IS NOT NULL",
    );
    await q.query(
      "UPDATE `utilities` SET `cost_status` = 'TO_DECIDE' WHERE `id` IN " +
        '(SELECT `utility_id_fk` FROM `utilizer_grant_utility_decisions` WHERE `decision` IS NULL)',
    );
  }

  // transfer_required non si tocca qui: i dati originali (supply_active,
  // activated_on, ceased_on, transferred_*) sono rimasti sull'utenza.
  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE `utilizer_grant_utility_decisions`');
    await q.query('DROP TABLE `utility_supply_events`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `pending_since`, DROP COLUMN `cost_status`');
  }
}
