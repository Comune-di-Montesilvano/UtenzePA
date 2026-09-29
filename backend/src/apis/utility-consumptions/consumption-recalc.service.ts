import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Utility } from '@apis/utility/entity/utility.entity';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { UtilityConsumption } from './entity/utility-consumption.entity';
import {
  buildDailyConsumption,
  computeActual,
  computeSeasonalEstimate,
  decideEstimate,
  todayDay,
} from './consumption-calculator';

// Persiste su utilities i valori calcolati dallo storico consumi.
// Scrittura via repository.update diretto: è un ricalcolo di sistema, non
// una modifica utente — niente audit log e update_date lasciato invariato
// (altrimenti il cron notturno sposterebbe "Ultima modifica" di ogni utenza).
@Injectable()
export class ConsumptionRecalcService {
  private readonly logger = new Logger(ConsumptionRecalcService.name);

  constructor(
    @InjectRepository(UtilityConsumption)
    private readonly consumptionRepo: Repository<UtilityConsumption>,
    @InjectRepository(Utility)
    private readonly utilityRepo: Repository<Utility>,
  ) {}

  async recalcUtility(utilityId: number, now: Date = new Date()): Promise<void> {
    const utility = await this.utilityRepo.findOne({
      where: { id: utilityId },
      relations: { utilityType: true },
    });
    if (!utility || utility.utilityType?.hard_type === HardTypeEnum.INTERNET) return;

    const records = await this.consumptionRepo.find({
      where: { utility_id_fk: utilityId, deleted: false },
    });
    const daily = buildDailyConsumption(records);
    const today = todayDay(now);
    const { actual, coverageDays } = computeActual(daily, today);
    const estimate = decideEstimate(
      {
        source: utility.estimated_consumption_source,
        setAt: utility.estimated_consumption_set_at
          ? new Date(utility.estimated_consumption_set_at)
          : null,
      },
      computeSeasonalEstimate(daily, today),
      now,
    );

    await this.utilityRepo.update(utilityId, {
      actual_consumption: actual,
      actual_consumption_coverage_days: coverageDays,
      ...(estimate ?? {}),
      update_date: () => '`update_date`',
    } as never);
  }

  async recalcAll(now: Date = new Date()): Promise<{ processed: number; failed: number }> {
    const rows: { id: number }[] = await this.utilityRepo
      .createQueryBuilder('u')
      .innerJoin('u.utilityType', 'ut')
      .select('u.id', 'id')
      .where('u.deleted = 0')
      .andWhere('ut.hard_type <> :internet', { internet: HardTypeEnum.INTERNET })
      .getRawMany();

    let processed = 0;
    let failed = 0;
    for (const { id } of rows) {
      try {
        await this.recalcUtility(Number(id), now);
        processed++;
      } catch (error) {
        failed++;
        console.error(`[ConsumptionRecalcService] Ricalcolo fallito per utenza ${id}`, error);
      }
    }
    return { processed, failed };
  }

  async handleNightlyRecalc(): Promise<void> {
    const { processed, failed } = await this.recalcAll();
    this.logger.log(`Ricalcolo consumi notturno: ${processed} utenze aggiornate, ${failed} errori`);
  }
}
