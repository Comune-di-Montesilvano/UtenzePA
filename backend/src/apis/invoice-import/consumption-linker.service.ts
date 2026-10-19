import { Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { InvoiceLine } from '@apis/invoices/entity/invoice-line.entity';
import { UtilityConsumption } from '@apis/utility-consumptions/entity/utility-consumption.entity';
import {
  ConsumptionKind,
  ConsumptionSource,
} from '@apis/utility-consumptions/enum/consumption-kind.enum';
import { ImportIssueType } from './enum/import-issue-type.enum';
import type { MatchIssue } from './invoice-matcher.service';

interface OwnedRow {
  id: number;
  utility_id_fk: number;
  period_start: string;
  period_end: string;
}

// Il marcatore /* c_… */ identifica la query (anche nei test).
const OWNED_SQL =
  '/* c_owned */ SELECT id, utility_id_fk, period_start, period_end FROM utility_consumptions ' +
  'WHERE id IN (?) AND deleted = 0';
const ADOPT_SQL =
  "/* c_adopt */ SELECT c.id FROM utility_consumptions c WHERE c.utility_id_fk = ? AND c.kind = 'PERIOD' " +
  "AND c.source = 'INVOICE' AND c.deleted = 0 AND c.period_start = ? AND c.period_end = ? " +
  'AND NOT EXISTS (SELECT 1 FROM invoice_lines l WHERE l.consumption_id_fk = c.id) ORDER BY c.id LIMIT 1';
const OVERLAP_SQL =
  "/* c_overlap */ SELECT c.id, c.period_start, c.period_end FROM utility_consumptions c WHERE c.utility_id_fk = ? AND c.kind = 'PERIOD' " +
  'AND c.deleted = 0 AND c.period_start <= ? AND c.period_end >= ? AND c.id NOT IN (?) ORDER BY c.id LIMIT 1';
const LINKED_SQL =
  '/* c_linked */ SELECT DISTINCT c.id, c.utility_id_fk FROM invoice_lines l ' +
  'JOIN utility_consumptions c ON c.id = l.consumption_id_fk WHERE l.invoice_id_fk = ?';

const day = (value: unknown) =>
  value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value);

/**
 * Consumi della fattura nel tab Consumi: una rilevazione di periodo (origine
 * fattura) per utenza e periodo, collegata alle righe. Mai doppioni: una
 * rilevazione da fattura scollegata sullo stesso periodo si adotta, un
 * periodo già coperto da altre rilevazioni diventa una segnalazione.
 */
@Injectable()
export class ConsumptionLinker {
  async link(
    manager: EntityManager,
    invoiceId: number,
    userId: number,
    previousIds: number[],
  ): Promise<{ issues: MatchIssue[]; utilityIds: number[] }> {
    const lines = await manager.find(InvoiceLine, {
      where: { invoice_id_fk: invoiceId },
      order: { id: 'ASC' },
    });
    const owned: OwnedRow[] = previousIds.length
      ? await manager.query(OWNED_SQL, [previousIds])
      : [];
    const utilityIds = new Set<number>(owned.map((o) => Number(o.utility_id_fk)));
    const used = new Set<number>();
    const issues: MatchIssue[] = [];

    const groups = new Map<string, { index: number; lines: InvoiceLine[] }>();
    lines.forEach((l, index) => {
      if (l.consumption === null || !l.utility_id_fk || !l.period_start || !l.period_end) return;
      const key = `${l.utility_id_fk}|${day(l.period_start)}|${day(l.period_end)}`;
      const group = groups.get(key) ?? { index, lines: [] };
      group.lines.push(l);
      groups.set(key, group);
    });

    for (const group of groups.values()) {
      const first = group.lines[0];
      const utilityId = first.utility_id_fk!;
      const start = day(first.period_start);
      const end = day(first.period_end);
      const value =
        Math.round(group.lines.reduce((sum, l) => sum + Number(l.consumption), 0) * 1000) / 1000;

      let consumptionId =
        owned.find(
          (o) =>
            Number(o.utility_id_fk) === utilityId &&
            day(o.period_start) === start &&
            day(o.period_end) === end &&
            !used.has(o.id),
        )?.id ?? null;
      if (consumptionId === null) {
        const [adoptable] = await manager.query(ADOPT_SQL, [utilityId, start, end]);
        consumptionId = adoptable?.id ?? null;
      }
      if (consumptionId === null) {
        const exclude = previousIds.length ? previousIds : [0];
        const [covering] = await manager.query(OVERLAP_SQL, [utilityId, end, start, exclude]);
        if (covering) {
          issues.push({
            type: ImportIssueType.PERIOD_COVERED,
            lineIndex: group.index,
            detail: `Periodo ${start} – ${end} già coperto dalla rilevazione ${covering.id} (${day(covering.period_start)} – ${day(covering.period_end)})`,
          });
          continue;
        }
        const saved = await manager.save(UtilityConsumption, {
          utility_id_fk: utilityId,
          kind: ConsumptionKind.PERIOD,
          source: ConsumptionSource.INVOICE,
          period_start: start,
          period_end: end,
          consumption: value,
          is_estimated: false,
          created_by_user_id: userId,
          updated_by_user_id: userId,
        });
        consumptionId = saved.id;
      } else {
        await manager.update(UtilityConsumption, consumptionId, {
          consumption: value,
          is_estimated: false,
          deleted: false,
        });
      }
      used.add(consumptionId);
      utilityIds.add(utilityId);
      await manager.update(
        InvoiceLine,
        { id: In(group.lines.map((l) => l.id)) },
        { consumption_id_fk: consumptionId },
      );
    }

    const leftovers = owned.map((o) => o.id).filter((id) => !used.has(id));
    if (leftovers.length) {
      await manager.update(
        UtilityConsumption,
        { id: In(leftovers), source: ConsumptionSource.INVOICE },
        { deleted: true },
      );
    }
    return { issues, utilityIds: [...utilityIds] };
  }

  // Fattura rifiutata: nessun effetto sui consumi.
  async unlink(manager: EntityManager, invoiceId: number): Promise<number[]> {
    const rows: { id: number; utility_id_fk: number }[] = await manager.query(LINKED_SQL, [
      invoiceId,
    ]);
    if (rows.length) {
      await manager.update(
        UtilityConsumption,
        { id: In(rows.map((r) => r.id)), source: ConsumptionSource.INVOICE },
        { deleted: true },
      );
    }
    await manager.update(InvoiceLine, { invoice_id_fk: invoiceId }, { consumption_id_fk: null });
    return [...new Set(rows.map((r) => Number(r.utility_id_fk)))];
  }
}
