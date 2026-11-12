import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { commitmentLabel } from '@apis/budget-commitments/commitment-label';
import {
  type AgreementForecast,
  agreementForecast,
  type ForecastOrder,
  type ForecastUtility,
} from '@apis/spending/agreement-forecast';
import type { StatsLine } from '@apis/spending/chapter-utility-stats';
import {
  type ConsumptionRecord,
  toDay,
  todayDay,
} from '@apis/utility-consumptions/consumption-calculator';
import type { SupplyEventLike } from '@apis/utility-supply/supply-state';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import * as sql from './agreement-forecast.sql';
import { ConsipAgreementForecast } from './entity/agreement-forecast.entity';
import { ConsipAgreementPrice } from './entity/agreement-price.entity';

type Row = Record<string, unknown>;

export interface ForecastResponse extends AgreementForecast {
  computed_at: string;
  chapters: { id: number; label: string }[];
  // Impegni collegati anche a un'altra convenzione: contano per intero in entrambe.
  shared_commitments: { id: number; label: string }[];
  // Quote di fatture senza righe per utenza sugli impegni della convenzione.
  shares_without_lines: { year: number; amount: number }[];
}

const FAR_FUTURE = '9999-12-31';
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const bool = (v: unknown): boolean => v === true || Number(v) === 1;

// Fabbisogno della convenzione CONSIP: carica i dati, calcola con le funzioni
// pure di spending/agreement-forecast.ts e tiene una cache per capitolo ed
// esercizio, letta dalle segnalazioni. Scrittura di sistema: nessun audit,
// la convenzione non viene toccata.
@Injectable()
export class AgreementForecastService {
  private readonly logger = new Logger(AgreementForecastService.name);
  private chain: Promise<unknown> = Promise.resolve();
  private readonly pending = new Set<number>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ConsipAgreementPrice)
    private readonly priceRepo: Repository<ConsipAgreementPrice>,
  ) {}

  private q(text: string, params: unknown[] = []): Promise<Row[]> {
    return this.dataSource.query(text, params);
  }

  // Con asOf il calcolo è «come se fosse» quel giorno (prova di validità):
  // dati successivi ignorati, cache non scritta.
  async compute(agreementId: number, opts: { asOf?: string } = {}): Promise<ForecastResponse> {
    if (!(await this.q(sql.AGREEMENT_SQL, [agreementId])).length) {
      throw new BadRequestException('Convenzione non trovata');
    }
    const cutoff = opts.asOf ?? FAR_FUTURE;
    const today = opts.asOf ? toDay(opts.asOf) : todayDay();

    const orderRows = await this.q(sql.ORDERS_SQL, [agreementId]);
    const links = await this.q(sql.ORDER_UTILITIES_SQL, [agreementId]);
    const orders: ForecastOrder[] = orderRows.map((o) => ({
      id: Number(o.id),
      draft: bool(o.draft),
      closed: bool(o.closed),
      start: (o.supply_start as string | null) ?? null,
      end: (o.supply_end as string | null) ?? null,
      utility_ids: links
        .filter((l) => Number(l.contract_id) === Number(o.id))
        .map((l) => Number(l.utility_id)),
    }));
    const ids = [...new Set(links.map((l) => Number(l.utility_id)))];

    const [utilityRows, lines, consumptions, events] = ids.length
      ? await Promise.all([
          this.q(sql.UTILITIES_SQL, [ids]),
          this.q(sql.LINES_SQL, [ids, cutoff]),
          this.q(sql.CONSUMPTIONS_SQL, [ids, cutoff]),
          this.q(sql.EVENTS_SQL, [ids]),
        ])
      : [[], [], [], []];
    const group = (rows: Row[]): Map<number, Row[]> => {
      const map = new Map<number, Row[]>();
      for (const r of rows) {
        const key = Number(r.utility_id);
        const list = map.get(key);
        if (list) list.push(r);
        else map.set(key, [r]);
      }
      return map;
    };
    const linesBy = group(lines);
    const consumptionsBy = group(consumptions);
    const eventsBy = group(events);
    const utilities: ForecastUtility[] = utilityRows.map((u) => {
      const id = Number(u.id);
      return {
        id,
        utility_code: (u.utility_code as string | null) ?? null,
        hard_type: (u.hard_type as HardTypeEnum | null) ?? null,
        chapter_id: num(u.chapter_id),
        estimated_annual_consumption: num(u.estimated_annual_consumption),
        lines: (linesBy.get(id) ?? []).map((l): StatsLine => ({
          amount: Number(l.amount),
          period_start: (l.period_start as string | null) ?? null,
          period_end: (l.period_end as string | null) ?? null,
          invoice_date: l.invoice_date as string,
        })),
        consumptions: (consumptionsBy.get(id) ?? []) as unknown as ConsumptionRecord[],
        events: (eventsBy.get(id) ?? []).map(
          (e) =>
            ({
              ...e,
              id: Number(e.id),
              third_party_id_fk: num(e.third_party_id_fk),
              date_unknown: bool(e.date_unknown),
              deleted: bool(e.deleted),
              utilizer_grant_id_fk: num(e.utilizer_grant_id_fk),
              create_date: String(e.create_date),
            }) as unknown as SupplyEventLike,
        ),
      };
    });

    const committed = (await this.q(sql.COMMITTED_SQL, [agreementId])).map((c) => ({
      chapter_id: num(c.chapter_id),
      year: Number(c.year),
      committed: Number(c.committed),
      remaining: Number(c.remaining),
      without_amount: Number(c.without_amount),
    }));
    const manualPrices: Partial<Record<HardTypeEnum, number>> = {};
    for (const p of await this.priceRepo.find({ where: { consip_agreement_id_fk: agreementId } })) {
      manualPrices[p.hard_type as HardTypeEnum] = Number(p.unit_price);
    }

    const forecast = agreementForecast({ today, orders, utilities, committed, manualPrices });

    const chapterIds = [
      ...new Set(forecast.rows.map((r) => r.chapter_id).filter((id): id is number => id !== null)),
    ];
    const chapters = chapterIds.length
      ? (await this.q(sql.CHAPTERS_SQL, [chapterIds])).map((c) => ({
          id: Number(c.id),
          label: `${String(c.chapter_code)}/${String(c.article ?? 0)} — ${String(c.description ?? '')}`,
        }))
      : [];
    const shared = (await this.q(sql.SHARED_COMMITMENTS_SQL, [agreementId, agreementId])).map(
      (c) => ({
        id: Number(c.id),
        label: commitmentLabel(
          num(c.commitment_year),
          num(c.commitment_num),
          num(c.commitment_sub),
        ),
      }),
    );
    const sharesWithoutLines = (await this.q(sql.SHARES_WITHOUT_LINES_SQL, [agreementId])).map(
      (s) => ({ year: Number(s.year), amount: Number(s.amount) }),
    );

    const computedAt = new Date();
    if (!opts.asOf) await this.writeCache(agreementId, forecast, computedAt);
    return {
      ...forecast,
      computed_at: computedAt.toISOString(),
      chapters,
      shared_commitments: shared,
      shares_without_lines: sharesWithoutLines,
    };
  }

  private async writeCache(
    agreementId: number,
    forecast: AgreementForecast,
    computedAt: Date,
  ): Promise<void> {
    const rows = forecast.rows.map((r) => ({
      consip_agreement_id_fk: agreementId,
      budget_chapter_id_fk: r.chapter_id,
      fiscal_year: r.year,
      utilities: r.utilities,
      invoiced: r.invoiced,
      to_invoice: r.to_invoice,
      committed: r.committed,
      remaining: r.remaining,
      difference: r.difference,
      coverage: r.coverage,
      shortfall: r.shortfall,
      alert: r.alert,
      computed_at: computedAt,
    }));
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(ConsipAgreementForecast, { consip_agreement_id_fk: agreementId });
      if (rows.length) await manager.insert(ConsipAgreementForecast, rows);
    });
  }

  // Costo unitario a mano per tipo di utenza; null = torna al proposto.
  async setPrice(
    agreementId: number,
    hardType: HardTypeEnum,
    price: number | null,
    userId: number,
  ): Promise<ForecastResponse> {
    if (!(await this.q(sql.AGREEMENT_SQL, [agreementId])).length) {
      throw new BadRequestException('Convenzione non trovata');
    }
    if (price === null) {
      await this.priceRepo.delete({ consip_agreement_id_fk: agreementId, hard_type: hardType });
    } else {
      await this.priceRepo.upsert(
        {
          consip_agreement_id_fk: agreementId,
          hard_type: hardType,
          unit_price: price,
          updated_by_user_id: userId,
        },
        ['consip_agreement_id_fk', 'hard_type'],
      );
    }
    return this.compute(agreementId);
  }

  // In coda, una convenzione alla volta e senza doppioni: un calcolo fallito
  // non blocca gli altri.
  refreshAgreements(ids: number[]): Promise<void> {
    ids.filter((id) => !!id).forEach((id) => this.pending.add(Number(id)));
    const next = this.chain
      .catch(() => undefined)
      .then(async () => {
        const batch = [...this.pending];
        this.pending.clear();
        await this.runBatch(batch);
      });
    this.chain = next;
    return next;
  }

  async refreshForContracts(contractIds: number[]): Promise<void> {
    const ids = contractIds.filter((id) => !!id);
    if (!ids.length) return;
    const agreements = await this.q(sql.AGREEMENTS_OF_CONTRACTS_SQL, [ids]);
    if (agreements.length) await this.refreshAgreements(agreements.map((a) => Number(a.id)));
  }

  refreshAll(): Promise<{ processed: number; failed: number }> {
    const next = this.chain
      .catch(() => undefined)
      .then(async () => {
        const agreements = await this.q(sql.OPEN_AGREEMENTS_SQL);
        return this.runBatch(agreements.map((a) => Number(a.id)));
      });
    this.chain = next;
    return next;
  }

  private async runBatch(ids: number[]): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await this.compute(id);
        processed++;
      } catch (e) {
        failed++;
        this.logger.error(`Fabbisogno della convenzione ${id} non calcolato`, e as Error);
      }
    }
    return { processed, failed };
  }
}
