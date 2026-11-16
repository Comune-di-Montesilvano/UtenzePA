import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OFFSET_STATUSES, PaymentStatus } from '@apis/invoices/enum/payment-status.enum';
import { lineFiscalYear } from '@apis/spending/line-year';
import { dbDay } from '@/helpers/date.helpers';
import { allocate, AllocCommitment, AllocInvoice, AllocShare } from './commitment-allocation';
import { idList } from './id-list';
import * as q from './commitment-reconcile.queries';
import { insertAutoShare } from './commitment-reconcile.sql';

interface Share {
  commitment_id: number;
  fiscal_year: number | null;
  amount: number;
}

// JSON da JSON_OBJECT/JSON_ARRAYAGG: mysql2 lo restituisce già decodificato, i mock come stringa.
const parseJson = <T>(v: unknown): T | null =>
  v === null || v === undefined || v === ''
    ? null
    : typeof v === 'string'
      ? (JSON.parse(v) as T)
      : (v as T);

const shareOf = (o: Record<string, unknown> | null): Share | null =>
  o
    ? {
        commitment_id: Number(o.commitment_id),
        fiscal_year: Number(o.fiscal_year),
        amount: Number(o.amount),
      }
    : null;

const sameShare = (a: Share | null, b: Share | null): boolean =>
  a === null || b === null
    ? a === b
    : a.commitment_id === b.commitment_id &&
      a.fiscal_year === b.fiscal_year &&
      Math.round(a.amount * 100) === Math.round(b.amount * 100);

// Assegna impegno e annualità alla quota automatica delle fatture
// (commitment-allocation.ts). Le quote scelte a mano (MANUAL/ACCOUNTING) non si
// toccano, consumano solo la rimanenza; scrittura di sistema: nessun audit e
// "Ultima modifica" della fattura invariata (si scrive solo invoice_commitment_shares).
// Le chiamate si accodano: contratti già in attesa non fanno un secondo giro.
@Injectable()
export class CommitmentReconcileService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CommitmentReconcileService.name);
  private chain: Promise<void> = Promise.resolve();
  private readonly pending = new Set<number>();
  private readonly listeners: ((contractIds: number[]) => void)[] = [];

  constructor(private readonly dataSource: DataSource) {}

  private get m() {
    return this.dataSource.manager;
  }

  onApplicationBootstrap(): void {
    void this.reconcileAll().catch((e: Error) =>
      this.logger.error('Consumo impegni all’avvio fallito', e),
    );
  }

  // Chi deve riallinearsi dopo un giro riuscito (fabbisogno delle
  // convenzioni) si registra qui: riceve i contratti ricalcolati. Un
  // ascoltatore che fallisce non tocca la riconciliazione.
  onReconciled(listener: (contractIds: number[]) => void): void {
    this.listeners.push(listener);
  }

  reconcileContracts(contractIds: number[]): Promise<void> {
    contractIds.filter((id) => !!id).forEach((id) => this.pending.add(Number(id)));
    // Un giro fallito non blocca i successivi: la coda riparte dal catch,
    // il chiamante riceve comunque l'esito del proprio giro.
    const next = this.chain
      .catch(() => undefined)
      .then(async () => {
        const batch = [...this.pending];
        this.pending.clear();
        if (batch.length) await this.run(batch);
      });
    this.chain = next;
    return next;
  }

  // Dopo un salvataggio già confermato: un errore non fa fallire la richiesta,
  // il giro all'avvio riallinea.
  async reconcileSafe(contractIds: number[]): Promise<void> {
    try {
      await this.reconcileContracts(contractIds);
    } catch (e) {
      this.logger.error(
        `Consumo impegni fallito per i contratti ${contractIds.join(', ')}`,
        e as Error,
      );
    }
  }

  // Capitolo dell'utenza cambiato: le sue righe automatiche cambiano capitolo.
  async reconcileUtilities(utilityIds: number[]): Promise<void> {
    if (!utilityIds.length) return;
    try {
      const contracts = await q.utilityContracts(this.m, utilityIds);
      if (contracts.length) await this.reconcileContracts(contracts);
    } catch (e) {
      this.logger.error(
        `Consumo impegni fallito per le utenze ${utilityIds.join(', ')}`,
        e as Error,
      );
    }
  }

  async reconcileAll(): Promise<void> {
    await q.dropOrphanAutoShares(this.m);
    await this.reconcileContracts(await q.allContracts(this.m));
  }

  private async closure(start: number[]): Promise<number[]> {
    const all = new Set(start);
    let frontier = [...all];
    while (frontier.length) {
      const found = await q.sharingContracts(this.m, frontier);
      frontier = found.filter((id) => !all.has(id));
      frontier.forEach((id) => all.add(id));
    }
    return [...all].sort((a, b) => a - b);
  }

  private async run(start: number[]): Promise<void> {
    // Contratto tolto dalla fattura: la sua quota automatica sparisce subito
    // (la fattura non rientra più tra quelle dei contratti ricalcolati).
    await q.dropOrphanAutoShares(this.m);
    const contracts = await this.closure(start);
    const commitments: AllocCommitment[] = (await q.contractCommitmentYears(this.m, contracts)).map(
      (r) => ({
        id: Number(r.id),
        year: r.year === null ? null : Number(r.year),
        num: r.num === null ? null : Number(r.num),
        sub: r.sub === null ? null : Number(r.sub),
        amount: r.amount === null ? null : Number(r.amount),
        chapter: Number(r.chapter),
        fiscal_year: Number(r.fiscal_year),
        contract_ids: idList(r.contract_ids),
      }),
    );
    // [-1]: IN () vuoto non è SQL valido.
    const commitmentIds = commitments.length ? [...new Set(commitments.map((c) => c.id))] : [-1];
    const rows = await q.reconcileInvoices(this.m, contracts, commitmentIds);

    const invoices: AllocInvoice[] = [];
    // Quota automatica attuale per fattura (null = nessuna).
    const current = new Map<number, Share | null>();
    for (const r of rows) {
      const id = Number(r.id);
      const fixed = parseJson<Record<string, unknown>[]>(r.fixed) ?? [];
      current.set(id, shareOf(parseJson<Record<string, unknown>>(r.auto_share)));
      const noAmount = r.amount === null || r.amount === undefined;
      // Senza righe e senza totale non c'è un importo da imputare (le quote fisse contano comunque).
      if (noAmount && !fixed.length) continue;
      // Stornata o nota di credito per la contabilità: non pesa sugli impegni, nessuna quota automatica.
      if (OFFSET_STATUSES.includes(r.payment_status as PaymentStatus) && !fixed.length) continue;
      const date = dbDay(r.date) ?? '';
      const chapters = [...new Set((parseJson<unknown[]>(r.chapters) ?? []).map(Number))];
      invoices.push({
        id,
        date,
        amount: noAmount ? 0 : Number(r.amount),
        contract_id: r.contract_id === null ? undefined : Number(r.contract_id),
        // Utenza senza capitolo: 0 = nessun impegno candidato; nessuna utenza o più capitoli: null.
        chapter: chapters.length === 1 ? chapters[0] : null,
        year: lineFiscalYear(dbDay(r.period_start), dbDay(r.period_end), date),
        fixed: fixed.map((f): AllocShare => ({
          commitment_id: Number(f.commitment_id),
          fiscal_year: Number(f.fiscal_year),
          amount: Number(f.amount),
        })),
      });
    }

    const targets = allocate(commitments, invoices);
    const amounts = new Map(invoices.map((i) => [i.id, i.amount]));
    const withFixed = new Set(invoices.filter((i) => i.fixed.length).map((i) => i.id));
    for (const [id, share] of current) {
      if (withFixed.has(id)) {
        // Quote miste: la quota automatica residua si toglie.
        if (share) await q.dropAutoShare(this.m, id);
        continue;
      }
      const target = targets.get(id) ?? null;
      const wanted: Share | null = target
        ? { commitment_id: target.id, fiscal_year: target.fiscal_year, amount: amounts.get(id)! }
        : null;
      if (sameShare(share, wanted)) continue;
      await this.dataSource.transaction(async (m) => {
        await q.dropAutoShare(m, id);
        if (wanted) await insertAutoShare(m, id, wanted);
      });
    }
    for (const listener of this.listeners) {
      try {
        listener(contracts);
      } catch (e) {
        this.logger.error('Avviso di fine riconciliazione fallito', e as Error);
      }
    }
  }
}
