import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLogService, type RecordChangeInput } from '@apis/audit-log/audit-log.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { CommitmentReconcileService } from '@apis/budget-commitments/commitment-reconcile.service';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { ChapterSource } from './chapter-source.enum';
import {
  DerivationReason,
  DerivationResult,
  DerivationUtility,
  deriveChapters,
} from './chapter-derivation';
import * as q from './chapter-derivation.queries';
import * as sq from '@apis/spending/spending.queries';
import { periodWindows } from '@apis/spending/chapter-utility-stats';
import { fromDay, toDay } from '@apis/utility-consumptions/consumption-calculator';
import { PaidElsewhere, paidElsewhere } from './chapter-info';

export interface ChapterInfo {
  source: ChapterSource;
  reason: DerivationReason | null;
  destination: { id: number; name: string } | null;
  via: { kind: 'asset' | 'plant'; id: number; label: string } | null;
  chapter_label: string | null;
  // Ultimi 12 mesi pagati su capitoli diversi da quello dell'utenza.
  paid_elsewhere: PaidElsewhere[];
}

// Giorno 'AAAA-MM-GG' a Roma (il container gira in UTC).
const ROME_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

type Row = Record<string, unknown>;

const byUtility = (rows: Row[]): Map<number, number[]> => {
  const out = new Map<number, number[]>();
  for (const r of rows) {
    const id = Number(r.utility_id);
    out.set(id, [...(out.get(id) ?? []), Number(r.destination_id)]);
  }
  return out;
};

// Capitolo delle utenze ricavato dalla destinazione di spesa dell'immobile o
// dell'impianto (chapter-derivation.ts). Scrittura di sistema (utente -1,
// "Ultima modifica" invariata) con audit solo quando cambia il capitolo; poi
// le quote automatiche si riallineano. Le richieste si accodano: quelle che
// arrivano durante un giro ne fanno partire uno solo dopo.
@Injectable()
export class ChapterDerivationService {
  private readonly logger = new Logger(ChapterDerivationService.name);
  private chain: Promise<void> = Promise.resolve();
  private queued: Promise<void> | null = null;
  private results = new Map<number, DerivationResult>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
    @Optional() private readonly reconcile?: CommitmentReconcileService,
  ) {}

  requestAll(): Promise<void> {
    if (this.queued) return this.queued;
    const next = this.chain
      .catch(() => undefined)
      .then(() => {
        this.queued = null;
        return this.run();
      });
    this.queued = next;
    this.chain = next;
    return next;
  }

  // Dopo un salvataggio già confermato: un errore non fa fallire la richiesta,
  // il giro notturno riallinea.
  async requestAllSafe(): Promise<void> {
    try {
      await this.requestAll();
    } catch (e) {
      this.logger.error('Ricalcolo dei capitoli per destinazione fallito', e as Error);
    }
  }

  // Esito dell'ultimo giro per utenza (anomalie, scheda utenza).
  lastResults(): Map<number, DerivationResult> {
    return this.results;
  }

  // Come lastResults, ma con un giro se non ne è ancora stato fatto nessuno.
  async currentResults(): Promise<Map<number, DerivationResult>> {
    if (!this.results.size) await this.requestAll();
    return this.results;
  }

  // Da dove viene il capitolo dell'utenza (scheda utenza).
  async chapterInfo(utilityId: number): Promise<ChapterInfo | null> {
    const m = this.dataSource.manager;
    const row = await q.utilityChapterRow(m, utilityId);
    if (!row) return null;
    const result = (await this.currentResults()).get(utilityId);
    const destinationId = result?.destination_id ?? null;
    let via: ChapterInfo['via'] = null;
    let destination: ChapterInfo['destination'] = null;
    if (destinationId !== null) {
      const d = await q.destinationName(m, destinationId);
      destination = d ? { id: Number(d.id), name: String(d.name) } : null;
      const sources: ['asset' | 'plant', Row[]][] = [
        ['asset', await q.assetDestinations(m, utilityId)],
        ['plant', await q.plantDestinations(m, utilityId)],
        ['plant', await q.plantAssetDestinations(m, utilityId)],
      ];
      for (const [kind, rows] of sources) {
        const hit = rows.find((r) => Number(r.destination_id) === destinationId);
        if (hit) {
          via = { kind, id: Number(hit.link_id), label: String(hit.link_label) };
          break;
        }
      }
    }
    const today = toDay(ROME_DAY.format(new Date()));
    const { current } = periodWindows('last12', today);
    const chapterId = row.chapter_id == null ? null : Number(row.chapter_id);
    const lines = (
      await sq.utilityLinesByChapter(m, utilityId, fromDay(current.start), fromDay(current.end))
    )
      .filter((l) => Number(l.chapter_id) !== chapterId)
      .map((l) => ({
        amount: Number(l.amount),
        period_start: (l.period_start as string) ?? null,
        period_end: (l.period_end as string) ?? null,
        invoice_date: String(l.invoice_date),
        chapter_label: String(l.chapter_label),
        share: Number(l.share),
      }));
    return {
      source: row.source as ChapterSource,
      reason: result?.reason ?? null,
      destination,
      via,
      chapter_label: (row.chapter_label as string) ?? null,
      paid_elsewhere: paidElsewhere(lines, current),
    };
  }

  private async run(): Promise<void> {
    const m = this.dataSource.manager;
    const [utilities, assets, plants, plantAssets, chapters] = await Promise.all([
      q.derivationUtilities(m),
      q.assetDestinations(m),
      q.plantDestinations(m),
      q.plantAssetDestinations(m),
      q.destinationChapters(m),
    ]);
    const a = byUtility(assets);
    const p = byUtility(plants);
    const pa = byUtility(plantAssets);
    const input: DerivationUtility[] = utilities.map((u) => {
      const id = Number(u.id);
      return {
        id,
        hard_type: (u.hard_type as HardTypeEnum) ?? null,
        chapter_id: u.chapter_id == null ? null : Number(u.chapter_id),
        source: u.source as ChapterSource,
        asset_destinations: a.get(id) ?? [],
        plant_destinations: p.get(id) ?? [],
        plant_asset_destinations: pa.get(id) ?? [],
      };
    });
    const current = new Map(input.map((u) => [u.id, u]));
    const results = deriveChapters(
      input,
      chapters.map((c) => ({
        id: Number(c.id),
        destination_id: Number(c.destination_id),
        hard_type: (c.hard_type as HardTypeEnum) ?? null,
      })),
    );

    const changed = results.filter((r) => {
      const u = current.get(r.id)!;
      return u.chapter_id !== r.chapter_id || u.source !== r.source;
    });
    const audits: RecordChangeInput[] = [];
    if (changed.length) {
      await this.dataSource.transaction(async (tm) => {
        for (const r of changed) {
          await q.setDerivedChapter(tm, r.id, r.chapter_id, r.source);
          const before = current.get(r.id)!.chapter_id;
          if (before !== r.chapter_id) {
            audits.push({
              entityName: 'utilities',
              entityId: r.id,
              action: AuditAction.UPDATE,
              userId: SYSTEM_USER_ID,
              fields: [
                { fieldName: 'budget_chapter_code_fk', oldValue: before, newValue: r.chapter_id },
              ],
            });
          }
        }
      });
    }
    for (const entry of audits) await this.audit.record(entry);
    this.results = new Map(results.map((r) => [r.id, r]));
    const moved = audits.map((x) => x.entityId);
    if (moved.length) await this.reconcile?.reconcileUtilities(moved);
    if (changed.length) {
      this.logger.log(
        `Capitoli per destinazione: ${changed.length} utenze aggiornate, ${moved.length} cambi di capitolo`,
      );
    }
  }
}
