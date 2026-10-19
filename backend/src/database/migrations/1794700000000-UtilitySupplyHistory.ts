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
  created_by_user_id: number | null;
}

interface EventRow {
  utility: number;
  type: 'ACTIVATION' | 'CESSATION' | 'TRANSFER';
  thirdParty: number | null;
  effectiveOn: string | null;
  dateUnknown: boolean;
  notes: string | null;
  author: number;
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

const fmt = (iso: string) => iso.split('-').reverse().join('/');

// supply_active e' la verita': lo stato derivato dagli eventi deve coincidere.
// Le date incoerenti non bloccano la migration, finiscono nelle note.
function convert(u: UtilityRow): EventRow[] {
  const author = u.created_by_user_id;
  const ev = (
    type: EventRow['type'],
    effectiveOn: string | null,
    notes: string | null = null,
    thirdParty: number | null = null,
  ): EventRow => ({
    utility: u.id,
    type,
    thirdParty,
    effectiveOn,
    dateUnknown: !effectiveOn,
    notes,
    author,
  });
  const active = !!Number(u.supply_active ?? 0);
  const a = u.activated_on;
  const c = u.ceased_on;
  const events: EventRow[] = [];
  if (a && c && c < a) {
    if (active) {
      // Riattivata: attiva da prima, cessata, poi riattivata.
      events.push(ev('ACTIVATION', null), ev('CESSATION', c), ev('ACTIVATION', a));
    } else {
      events.push(
        ev('ACTIVATION', a),
        ev(
          'CESSATION',
          null,
          `Date incoerenti nei dati di partenza (attivazione ${fmt(a)}, cessazione ${fmt(c)}): da verificare`,
        ),
      );
    }
  } else if (active) {
    events.push(
      ev(
        'ACTIVATION',
        a,
        c ? `Cessazione indicata il ${fmt(c)} ma fornitura attiva: da verificare` : null,
      ),
    );
  } else {
    events.push(ev('ACTIVATION', a), ev('CESSATION', c));
  }
  if (u.transferred_to_third_party_id !== null && u.transferred_to_third_party_id !== undefined) {
    events.push(ev('TRANSFER', u.transferred_on, null, u.transferred_to_third_party_id));
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
        'COALESCE((SELECT s.id FROM `system_users` s WHERE s.id = utilities.created_by_user_id), (SELECT MIN(id) FROM `system_users`)) AS created_by_user_id ' +
        'FROM `utilities` ORDER BY id',
    );

    // Unico controllo bloccante, prima di qualunque DDL (commit implicito):
    // senza autore l'INSERT degli eventi fallirebbe a schema gia' modificato.
    const noAuthor = utilities.filter((u) => u.created_by_user_id === null || u.created_by_user_id === undefined);
    if (noAuthor.length) {
      throw new Error(
        `Utenze senza un autore valido e nessun utente in system_users (id: ${noAuthor.map((u) => u.id).join(', ')}). Creare almeno un utente prima di rilanciare la migration.`,
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
          '(`utility_id_fk`, `type`, `third_party_id_fk`, `effective_on`, `date_unknown`, `notes`, `created_by_user_id`, `updated_by_user_id`) VALUES ' +
          chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', '),
        chunk.flatMap((e) => [
          e.utility,
          e.type,
          e.thirdParty,
          e.effectiveOn,
          e.dateUnknown ? 1 : 0,
          e.notes,
          e.author,
          e.author,
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

    // Solo TRANSFERRED/TO_DECIDE: il servizio di riconciliazione (Task 4) ricalcola tutto.
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
