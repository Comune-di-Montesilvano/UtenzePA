import { Injectable } from '@nestjs/common';
import { missingInspections } from '@apis/plants/plant.calc';
import { GroundingClass, PlantStatus, PlantType } from '@apis/plants/enum/plant.enum';
import { todayIso } from '@apis/utilizer-grant/real-estate-contract.calc';
import { DataSource } from 'typeorm';
import {
  unknownStructures,
  type UnknownStructureRow,
} from '@apis/invoice-import/pattern/unknown-structures.sql';
import { CostStatus } from '@apis/utility/cost-status';
import { chaptersYearSummary, currentYear } from '@apis/spending/chapter-year';
import { romeDay } from '@apis/utility-supply/supply-reconcile.service';
import { dbDay } from '@/helpers/date.helpers';
import { SupplyEventLike } from '@apis/utility-supply/supply-state';
import { outOfPeriod } from '@apis/utility-supply/out-of-period';
import { SupplyEventType } from '@apis/utility-supply/enum/supply-event-type.enum';
import { imapConfigFromEnv, importForcedOff } from '@apis/invoice-import/pec-imap.client';
import { commitmentLabel } from '@apis/budget-commitments/commitment-label';
import { invoiceCompetenceYear } from '@apis/spending/line-year';
import { inboxDir, inboxPresent } from '@apis/accounting-import/accounting-inbox.files';
import * as q from './anomalies.queries';
import { liquidationsUnmatched, utilityChapterAmbiguous } from './anomalies.sql';

export interface AgreementShortAnomaly {
  id: number;
  label: string;
  missing: number;
  chapters: { id: number | null; label: string; missing: number }[];
  // Impegni della convenzione su quei capitoli nell'esercizio in corso.
  commitment_ids: number[];
}

export interface AnomalyList<T> {
  count: number;
  items: T[];
}

export interface ContractAnomaly {
  id: number;
  supplier: string | null;
  agreement: string | null;
  supply_expiry_date: string | null;
  utilities: number;
}

export interface UtilityAnomaly {
  id: number;
  utility_id: string;
  type: string | null;
  contracts?: string | null;
}

export interface Anomalies {
  contracts_without_cig: AnomalyList<ContractAnomaly>;
  active_utilities_without_contract: AnomalyList<UtilityAnomaly>;
  active_utilities_without_cig_contract: AnomalyList<UtilityAnomaly>;
  utilities_with_overlapping_contracts: AnomalyList<UtilityAnomaly>;
  duplicate_cigs: AnomalyList<{ cig: string; contracts: number[] }>;
  /** Ordini in bozza con inizio previsto già passato: da emettere o eliminare. */
  contracts_draft_overdue: AnomalyList<{
    id: number;
    cig_contract: string | null;
    supply_start_date: string;
  }>;
  /** Convenzioni con impegni che non basteranno nell'esercizio in corso (cache del fabbisogno). */
  agreements_commitments_short: AnomalyList<AgreementShortAnomaly>;
  /** Capitoli dove l'ammanco previsto supera il «da impegnare»: serve la variazione di bilancio. */
  chapters_variation_needed: AnomalyList<ChapterAnomaly & { missing: number; available: number }>;
  real_estate_contracts_without_assets: AnomalyList<RealEstateContractAnomaly>;
  plants_without_position: AnomalyList<PlantAnomaly>;
  active_utilities_without_position: AnomalyList<UtilityAnomaly>;
  plants_without_asset: AnomalyList<PlantAnomaly>;
  plants_fire_equipment_overdue: AnomalyList<PlantAnomaly>;
  plants_missing_inspections: AnomalyList<PlantAnomaly & { missing: string }>;
  utilities_with_reactive_penalty: AnomalyList<UtilityAnomaly>;
  real_estate_contracts_without_parties: AnomalyList<{ id: number; subject: string | null }>;
  third_parties_without_identifier: AnomalyList<{ id: number; name: string; type: string }>;
  active_utilities_without_arera_category: AnomalyList<UtilityAnomaly>;
  active_gas_utilities_without_use_category: AnomalyList<UtilityAnomaly>;
  utilities_to_transfer: AnomalyList<PendingUtilityAnomaly>;
  utilities_to_recover: AnomalyList<PendingUtilityAnomaly>;
  assets_without_classification: AnomalyList<{ id: number; asset_name: string; missing: string }>;
  rented_assets_without_passive_contract: AnomalyList<{ id: number; asset_name: string }>;
  invoices_outside_supply_periods: AnomalyList<{
    invoice_id: number;
    number: string;
    invoice_date: string;
    utility_id: number;
    utility_code: string;
    // 'gg/mm/aaaa–gg/mm/aaaa'; null = riga senza periodo (conta la data fattura).
    period: string | null;
  }>;
  utilities_with_uncommitted_chapter: AnomalyList<UtilityAnomaly & { chapter: string }>;
  active_utilities_without_chapter: AnomalyList<UtilityAnomaly>;
  chapters_over_budget: AnomalyList<
    ChapterAnomaly & { adjusted_budget: number; committed: number; invoiced: number }
  >;
  chapters_without_budget: AnomalyList<ChapterAnomaly>;
  invoice_lines_without_utility: AnomalyList<{
    invoice_id: number;
    number: string;
    supply_code: string | null;
    amount: number;
  }>;
  assets_without_cadastre: AnomalyList<{ id: number; asset_name: string }>;
  assets_without_mef_id: AnomalyList<{ id: number; asset_name: string }>;
  units_without_subordinate: AnomalyList<{ id: number; asset_name: string }>;
  functions_without_mef_type: AnomalyList<{ id: number; name: string }>;
  utilities_to_decide: AnomalyList<PendingUtilityAnomaly>;
  pending_activations: AnomalyList<PendingUtilityAnomaly>;
  pending_cessations: AnomalyList<PendingUtilityAnomaly>;
  invoice_import_stalled: AnomalyList<{
    last_success_at: string | null;
    last_error: string | null;
  }>;
  invoice_import_pending: AnomalyList<{
    id: number;
    supplier: string | null;
    number: string | null;
    date: string | null;
  }>;
  invoice_sdi_outcome_discarded: AnomalyList<{ invoice_id: number; number: string }>;
  // Fatture senza pattern, per fornitore: l'esempio apre l'editor.
  invoice_patterns_unknown: AnomalyList<UnknownStructureRow>;
  invoice_import_issues: AnomalyList<{
    id: number;
    message_id: number;
    invoice_id: number | null;
    number: string | null;
    type: string;
    detail: string;
    utility_id: number | null;
  }>;
  // Utenze con fatture ferme perché la matricola in fattura è diversa.
  utilities_with_meter_mismatch: AnomalyList<{ id: number; utility_id: string; detail: string }>;
  commitments_overspent: AnomalyList<CommitmentAnomaly>;
  commitments_without_contract: AnomalyList<CommitmentAnomaly>;
  commitments_without_amount: AnomalyList<CommitmentAnomaly>;
  // Fatture divise a mano tra impegni con quote che non sommano al totale.
  invoices_shares_mismatch: AnomalyList<{
    id: number;
    number: string;
    total: number;
    shares: number;
  }>;
  // Import della contabilità: liquidazioni su impegni di UtenzePA senza fattura
  // abbinata, impegni importati senza contratto, utenze con più capitoli.
  accounting_liquidations_unmatched: AnomalyList<{
    id: string;
    number: string;
    date: string | null;
    amount: number;
    supplier_vat: string | null;
    commitment: string;
  }>;
  accounting_commitments_without_contract: AnomalyList<{ id: number; label: string }>;
  accounting_utility_chapter_ambiguous: AnomalyList<{
    id: number;
    utility_id: string;
    chapters: string;
  }>;
  // Container Tinn installato e acceso, ma nessun caricamento riuscito da più di 2 giorni.
  accounting_import_stale: AnomalyList<{ id: number; label: string }>;
  invoices_without_commitment: AnomalyList<{
    id: number;
    number: string;
    date: string;
    contract_id: number;
    amount: number;
    reason: 'NO_COMMITMENTS' | 'AMBIGUOUS';
  }>;
}

// Import fatture fermo: nessun giro riuscito da più di 2 ore (giro ogni 15 minuti).
const IMPORT_STALLED_MS = 2 * 60 * 60 * 1000;

// Contabilità dal container Tinn: giro ogni notte, segnalata dopo 2 giorni senza caricamento.
const DAY_MS = 24 * 60 * 60 * 1000;
const ACCOUNTING_STALE_MS = 2 * DAY_MS;

// Pratica in sospeso: giorni dalla data evento (giorno di Roma).
export type PendingUtilityAnomaly = UtilityAnomaly & { pending_days: number };

export interface ChapterAnomaly {
  id: number;
  chapter: string;
  description: string | null;
}

export interface PlantAnomaly {
  id: number;
  code: string;
  name: string;
  type: string;
}

export interface RealEstateContractAnomaly {
  id: number;
  counterparty: string | null;
  subject: string | null;
}

const list = <T>(items: T[]): AnomalyList<T> => ({ count: items.length, items });

// Righe grezze del driver lette con la forma attesa.
const typed = <T>(rows: Promise<Record<string, unknown>[]>): Promise<T[]> =>
  rows as unknown as Promise<T[]>;
type PlantRow = { id: unknown; code: string; name: string; type: string };
type AssetRow = { id: unknown; asset_name: string };

export interface CommitmentAnomaly {
  id: number;
  label: string;
  chapter: string;
  fiscal_year: number;
  amount: number | null;
  remaining: number | null;
}

const daysSince = (since: string | null, today: string): number =>
  since
    ? Math.max(
        0,
        Math.round(
          (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000,
        ),
      )
    : 0;

const itDate = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

// Anomalie dei dati contrattuali mostrate in dashboard. Regola di fondo: un
// contratto senza CIG (e non esplicitamente escluso) è di fatto inesistente.
@Injectable()
export class AnomaliesService {
  constructor(private readonly dataSource: DataSource) {}

  // Sostituibile nei test.
  now: () => Date = () => new Date();
  inboxPresent: () => boolean = () => inboxPresent(inboxDir());

  private accountingStale(
    row: Record<string, unknown> | undefined,
  ): { id: number; label: string }[] {
    if (!row || !Number(row.enabled) || process.env.ACCOUNTING_IMPORT_DISABLED === 'true')
      return [];
    if (!this.inboxPresent()) return [];
    if (!row.last_success_at) return [{ id: 1, label: 'Contabilità mai caricata' }];
    const age = this.now().getTime() - new Date(row.last_success_at as string | Date).getTime();
    if (age <= ACCOUNTING_STALE_MS) return [];
    return [{ id: 1, label: `Contabilità non aggiornata da ${Math.floor(age / DAY_MS)} giorni` }];
  }

  async getAnomalies(): Promise<Anomalies> {
    const m = this.dataSource.manager;
    const today = romeDay(this.now());
    const contractsWithoutCig = await q.contractsWithoutCig(m);
    const withoutContract = await typed<UtilityAnomaly>(q.utilitiesWithoutContract(m));
    const withoutCigContract = await typed<UtilityAnomaly>(q.utilitiesWithoutCigContract(m));
    const overlapping = await typed<UtilityAnomaly>(q.utilitiesWithOverlappingContracts(m));
    const duplicateCigs = await q.duplicateCigs(m);
    const contractsWithoutAssets = await typed<{
      id: unknown;
      counterparty: string | null;
      subject: string | null;
    }>(q.grantsWithoutAssets(m));
    const plantsWithoutPosition = await typed<PlantRow>(q.plantsWithoutPosition(m));
    const plantsWithoutAsset = await typed<PlantRow>(q.plantsWithoutAsset(m));
    const contractsWithoutParties = await typed<{ id: unknown; subject: string | null }>(
      q.grantsWithoutParties(m),
    );
    const partiesWithoutIdentifier = await typed<{ id: unknown; name: string; type: string }>(
      q.partiesWithoutIdentifier(m),
    );
    const withoutAreraCategory = await typed<UtilityAnomaly>(q.utilitiesWithoutAreraCategory(m));
    const gasWithoutUseCategory = await typed<UtilityAnomaly>(q.gasWithoutUseCategory(m));
    const toTransfer = await q.utilitiesByCostStatus(m, CostStatus.TO_TRANSFER, today);
    const toRecover = await q.utilitiesByCostStatus(m, CostStatus.TO_RECOVER, today);
    const assetsWithoutClassification = await typed<{
      id: unknown;
      asset_name: string;
      missing: string;
    }>(q.assetsWithoutClassification(m));
    const rentedWithoutPassive = await typed<AssetRow>(q.rentedWithoutPassive(m));
    const uncommitted = await q.utilitiesWithUncommittedChapter(m);
    const withoutChapter = await q.utilitiesWithoutChapter(m);
    const withoutUtility = await q.linesWithoutUtility(m);

    // Capitoli sull'esercizio in corso (scheda capitolo, roadmap voce 20).
    const year = currentYear();
    const summary = await chaptersYearSummary(m, year);
    const over = summary.filter((r) => r.over_budget);
    const overLabels = over.length
      ? await q.chapterLabels(
          m,
          over.map((r) => r.budget_chapter_id),
        )
      : [];
    const labelOf = new Map(overLabels.map((b) => [Number(b.id), b] as const));
    const withoutBudget = await q.chaptersWithoutBudget(m, year);
    const chapterLabel = (b: Record<string, unknown>): ChapterAnomaly => ({
      id: Number(b.id),
      chapter: `${b.chapter_code}/${b.article}`,
      description: (b.description as string) ?? null,
    });

    const utilitiesWithoutPosition = await typed<UtilityAnomaly>(q.utilitiesWithoutPosition(m));
    const withoutCadastre = await typed<AssetRow>(q.assetsWithoutCadastre(m));
    const withoutMefId = await typed<AssetRow>(q.assetsWithoutMefId(m));
    const withoutSubordinate = await typed<AssetRow>(q.unitsWithoutSubordinate(m));
    const functionsWithoutMefType = await typed<{ id: unknown; name: string }>(
      q.functionsWithoutMefType(m),
    );
    const fireOverdue = await typed<PlantRow>(q.fireEquipmentOverdue(m, todayIso()));
    const reactivePenalty = await typed<UtilityAnomaly>(q.reactivePenalty(m, todayIso()));
    // Verifiche obbligatorie per legge (plant.calc missingInspections): si
    // leggono i dati che le determinano e i nomi delle verifiche con data, il
    // confronto è in Node come nella scheda impianto.
    const requiredCandidates = await typed<{
      id: unknown;
      code: string;
      name: string;
      type: PlantType;
      status: PlantStatus;
      grounding_class: GroundingClass | null;
      lightning_protection: unknown;
      power_kw: string | number | null;
      dated_kinds: string | null;
    }>(q.inspectionCandidates(m));
    const missingRequired = requiredCandidates
      .map((p) => ({
        p,
        missing: missingInspections(
          {
            type: p.type,
            status: p.status,
            electrical: {
              grounding_class: p.grounding_class,
              lightning_protection: !!Number(p.lightning_protection),
            },
            thermal: { power_kw: p.power_kw },
          },
          (p.dated_kinds ?? '')
            .split('\n')
            .filter(Boolean)
            .map((kind) => ({ kind, last_date: 'x' })),
        ),
      }))
      .filter((x) => x.missing.length > 0);
    const toDecide = await q.utilitiesByCostStatus(m, CostStatus.TO_DECIDE, today);

    // Attivazioni e cessazioni manuali in sospeso; data evento = richiesta,
    // altrimenti giorno di inserimento (Roma). Una per utenza, la più vecchia.
    const pendingSupply = await q.pendingSupplyEvents(m);
    const pendingOf = (type: SupplyEventType): PendingUtilityAnomaly[] => {
      const oldest = new Map<number, { item: UtilityAnomaly; since: string }>();
      for (const r of pendingSupply) {
        if (r.event_type !== type) continue;
        const since =
          dbDay(r.requested_on) ?? romeDay((r.create_date as Date | string) ?? this.now());
        const id = Number(r.utility_pk);
        const seen = oldest.get(id);
        if (seen && seen.since <= since) continue;
        oldest.set(id, {
          item: { id, utility_id: String(r.utility_id), type: (r.type as string) ?? null },
          since,
        });
      }
      return [...oldest.values()]
        .sort((p, q) => (p.since < q.since ? -1 : p.since > q.since ? 1 : 0))
        .map(({ item, since }) => ({ ...item, pending_days: daysSince(since, today) }));
    };

    // Fatture fuori dai periodi di attività: righe degli ultimi 12 mesi con
    // utenza, poi lo storico di quelle utenze; il confronto è in Node.
    const invoiceLines = await q.recentUtilityLines(m, today);
    const lineUtilityIds = [...new Set(invoiceLines.map((r) => Number(r.utility_id)))];
    const eventRows = lineUtilityIds.length ? await q.supplyEvents(m, lineUtilityIds) : [];
    const eventsByUtility = new Map<number, SupplyEventLike[]>();
    for (const r of eventRows) {
      const id = Number(r.utility_id_fk);
      const bucket = eventsByUtility.get(id) ?? [];
      bucket.push({
        id: Number(r.id),
        type: r.type as SupplyEventType,
        third_party_id_fk: r.third_party_id_fk == null ? null : Number(r.third_party_id_fk),
        requested_on: dbDay(r.requested_on),
        effective_on: dbDay(r.effective_on),
        date_unknown: !!Number(r.date_unknown),
        cancelled_on: dbDay(r.cancelled_on),
        deleted: !!Number(r.deleted),
        utilizer_grant_id_fk:
          r.utilizer_grant_id_fk == null ? null : Number(r.utilizer_grant_id_fk),
        create_date: romeDay((r.create_date as Date | string) ?? this.now()),
      });
      eventsByUtility.set(id, bucket);
    }
    const outside = new Map<
      string,
      Anomalies['invoices_outside_supply_periods']['items'][number]
    >();
    for (const r of invoiceLines) {
      const invoiceDate = dbDay(r.invoice_date) as string;
      const start = dbDay(r.period_start);
      const end = dbDay(r.period_end);
      const utilityId = Number(r.utility_id);
      const line = { period_start: start, period_end: end, invoice_date: invoiceDate };
      if (!outOfPeriod(line, eventsByUtility.get(utilityId) ?? [])) continue;
      const from = start ?? end;
      const period = from ? `${itDate(from)}–${itDate(end ?? from)}` : null;
      const item = {
        invoice_id: Number(r.invoice_id),
        number: String(r.number),
        invoice_date: invoiceDate,
        utility_id: utilityId,
        utility_code: String(r.utility_code),
        period,
      };
      outside.set(`${item.invoice_id}|${utilityId}|${period}`, item);
    }
    const invoicesOutside = [...outside.values()].sort(
      (p, q) =>
        (p.invoice_date < q.invoice_date ? 1 : p.invoice_date > q.invoice_date ? -1 : 0) ||
        p.invoice_id - q.invoice_id,
    );
    const pendingItems = (rows: Record<string, unknown>[]): PendingUtilityAnomaly[] =>
      rows.map((r) => ({
        id: Number(r.id),
        utility_id: String(r.utility_id),
        type: (r.type as string) ?? null,
        contracts: (r.contracts as string) ?? null,
        pending_days: daysSince(dbDay(r.pending_since), today),
      }));

    // Import fatture dalla PEC dello SDI.
    const importState = await q.invoiceImportState(m);
    const importPending = await q.pendingSdiMessages(m);
    const outcomeDiscarded = await q.outcomeDiscarded(m);
    const patternsUnknown = await unknownStructures(m);
    const importIssues = await q.importIssues(m);
    const commitmentRows = await q.commitmentsCheck(m, year);
    const sharesMismatch = await q.sharesMismatch(m);
    const withoutCommitment = await q.invoicesWithoutCommitment(m);
    const accLiquidations = await liquidationsUnmatched(m);
    const accCommitments = await q.accountingCommitmentsWithoutContract(m);
    const accUtilityChapters = await utilityChapterAmbiguous(m);
    const accState = await q.accountingImportState(m);
    const draftOverdue = await q.draftsOverdue(m);
    const agreementsShort = await q.agreementsShort(m);
    const variationNeeded = await q.chaptersVariationNeeded(m);
    const agreementsShortItems: AgreementShortAnomaly[] = [];
    for (const r of agreementsShort) {
      const id = Number(r.id);
      let item = agreementsShortItems.find((a) => a.id === id);
      if (!item) {
        item = { id, label: String(r.name ?? ''), missing: 0, chapters: [], commitment_ids: [] };
        agreementsShortItems.push(item);
      }
      const missing = Number(r.shortfall);
      const description = ((r.description as string) ?? '').trim();
      item.missing = Math.round((item.missing + missing) * 100) / 100;
      item.chapters.push({
        id: r.chapter_id == null ? null : Number(r.chapter_id),
        label:
          r.chapter_id == null
            ? 'Senza capitolo'
            : `${r.chapter_code}/${r.article}${description ? ` — ${description}` : ''}`,
        missing,
      });
      const linked = r.commitment_ids ? String(r.commitment_ids).split(',').map(Number) : [];
      item.commitment_ids = [...new Set([...item.commitment_ids, ...linked])];
    }

    const commitments = commitmentRows.map((r) => {
      const amount = r.amount == null ? null : Number(r.amount);
      return {
        item: {
          id: Number(r.id),
          label: commitmentLabel(
            r.commitment_year == null ? null : Number(r.commitment_year),
            r.commitment_num == null ? null : Number(r.commitment_num),
            r.commitment_sub == null ? null : Number(r.commitment_sub),
          ),
          chapter: String(r.chapter),
          fiscal_year: Number(r.fiscal_year),
          amount,
          remaining:
            amount === null ? null : Math.round((amount - Number(r.spent ?? 0)) * 100) / 100,
        } as CommitmentAnomaly,
        contracts: Number(r.contracts ?? 0),
      };
    });
    const lastSuccess = importState?.last_success_at
      ? new Date(importState.last_success_at as string | Date)
      : null;
    const importStalled =
      !!importState &&
      !!Number(importState.enabled) &&
      imapConfigFromEnv(process.env) !== null &&
      !importForcedOff(process.env) &&
      (lastSuccess
        ? this.now().getTime() - lastSuccess.getTime() > IMPORT_STALLED_MS
        : importState.last_run_at != null);

    const assetItems = (rows: { id: unknown; asset_name: string }[]) =>
      list(rows.map((a) => ({ id: Number(a.id), asset_name: a.asset_name })));

    return {
      invoice_import_stalled: list(
        importStalled
          ? [
              {
                last_success_at: lastSuccess ? lastSuccess.toISOString() : null,
                last_error: (importState.last_error as string) ?? null,
              },
            ]
          : [],
      ),
      invoice_import_pending: list(
        importPending.map((r) => ({
          id: Number(r.id),
          supplier: (r.supplier as string) ?? null,
          number: (r.document_number as string) ?? null,
          date: dbDay(r.document_date),
        })),
      ),
      invoice_sdi_outcome_discarded: list(
        outcomeDiscarded.map((r) => ({
          invoice_id: Number(r.invoice_id),
          number: String(r.number),
        })),
      ),
      invoice_patterns_unknown: list(patternsUnknown),
      invoice_import_issues: list(
        importIssues.map((r) => ({
          id: Number(r.id),
          message_id: Number(r.message_id),
          invoice_id: r.invoice_id == null ? null : Number(r.invoice_id),
          number: (r.number as string) ?? null,
          type: String(r.type),
          detail: String(r.detail),
          utility_id: r.utility_id == null ? null : Number(r.utility_id),
        })),
      ),
      commitments_overspent: list(
        commitments
          .filter(
            (c) => c.item.fiscal_year === year && c.item.remaining !== null && c.item.remaining < 0,
          )
          .map((c) => c.item),
      ),
      // Un pluriennale compare una volta, con la prima annualità (righe in ordine di esercizio).
      commitments_without_contract: list(
        commitments
          .filter(
            (c, i) =>
              c.contracts === 0 && commitments.findIndex((o) => o.item.id === c.item.id) === i,
          )
          .map((c) => c.item),
      ),
      commitments_without_amount: list(
        commitments.filter((c) => c.item.amount === null).map((c) => c.item),
      ),
      invoices_shares_mismatch: list(
        sharesMismatch.map((r) => ({
          id: Number(r.id),
          number: String(r.number),
          total: Number(r.total),
          shares: Number(r.shares),
        })),
      ),
      accounting_liquidations_unmatched: list(
        accLiquidations.map((r) => ({
          id: String(r.id),
          number: String(r.number),
          date: r.date ? dbDay(r.date) : null,
          amount: Number(r.amount),
          supplier_vat: (r.supplier_vat as string) ?? null,
          commitment: String(r.commitment),
        })),
      ),
      accounting_commitments_without_contract: list(
        accCommitments.map((r) => ({
          id: Number(r.id),
          label: commitmentLabel(
            Number(r.commitment_year),
            Number(r.commitment_num),
            Number(r.commitment_sub),
          ),
        })),
      ),
      accounting_utility_chapter_ambiguous: list(
        accUtilityChapters.map((r) => ({
          id: Number(r.id),
          utility_id: String(r.utility_id),
          chapters: String(r.chapters),
        })),
      ),
      accounting_import_stale: list(this.accountingStale(accState)),
      invoices_without_commitment: list(
        withoutCommitment.map((r) => {
          const date = dbDay(r.date);
          const competence = invoiceCompetenceYear(
            [
              {
                period_start: r.period_start ? dbDay(r.period_start) : null,
                period_end: r.period_end ? dbDay(r.period_end) : null,
              },
            ],
            date,
          );
          const years = String(r.years ?? '')
            .split(',')
            .filter(Boolean)
            .map(Number);
          return {
            id: Number(r.id),
            number: String(r.number),
            date,
            contract_id: Number(r.contract_id),
            amount: Number(r.amount),
            reason: years.includes(competence)
              ? ('AMBIGUOUS' as const)
              : ('NO_COMMITMENTS' as const),
          };
        }),
      ),
      utilities_with_meter_mismatch: list([
        ...new Map(
          importIssues
            .filter((r) => r.type === 'METER_MISMATCH' && r.utility_id != null)
            .map((r) => [
              Number(r.utility_id),
              {
                id: Number(r.utility_id),
                utility_id: String(r.utility_code),
                detail: String(r.detail),
              },
            ]),
        ).values(),
      ]),
      assets_without_cadastre: assetItems(withoutCadastre),
      assets_without_mef_id: assetItems(withoutMefId),
      units_without_subordinate: assetItems(withoutSubordinate),
      functions_without_mef_type: list(
        functionsWithoutMefType.map((f) => ({ id: Number(f.id), name: f.name })),
      ),
      chapters_over_budget: list(
        over
          .filter((r) => labelOf.has(r.budget_chapter_id))
          .map((r) => ({
            ...chapterLabel(labelOf.get(r.budget_chapter_id)),
            adjusted_budget: r.adjusted_budget as number,
            committed: r.committed,
            invoiced: r.invoiced,
          })),
      ),
      chapters_without_budget: list(withoutBudget.map(chapterLabel)),
      invoices_outside_supply_periods: list(invoicesOutside),
      utilities_with_uncommitted_chapter: list(
        uncommitted.map((r) => ({
          id: Number(r.id),
          utility_id: String(r.utility_id),
          type: (r.type as string) ?? null,
          contracts: (r.contracts as string) ?? null,
          chapter: String(r.chapter),
        })),
      ),
      active_utilities_without_chapter: list(
        withoutChapter.map((r) => ({
          id: Number(r.id),
          utility_id: String(r.utility_id),
          type: (r.type as string) ?? null,
          contracts: (r.contracts as string) ?? null,
        })),
      ),
      invoice_lines_without_utility: list(
        withoutUtility.map((r) => ({
          invoice_id: Number(r.invoice_id),
          number: String(r.number),
          supply_code: (r.supply_code as string) ?? null,
          amount: Number(r.amount),
        })),
      ),
      assets_without_classification: list(
        assetsWithoutClassification.map((a) => ({
          id: Number(a.id),
          asset_name: a.asset_name,
          missing: a.missing,
        })),
      ),
      rented_assets_without_passive_contract: list(
        rentedWithoutPassive.map((a) => ({ id: Number(a.id), asset_name: a.asset_name })),
      ),
      utilities_to_transfer: list(pendingItems(toTransfer)),
      utilities_to_recover: list(pendingItems(toRecover)),
      utilities_to_decide: list(pendingItems(toDecide)),
      pending_activations: list(pendingOf(SupplyEventType.ACTIVATION)),
      pending_cessations: list(pendingOf(SupplyEventType.CESSATION)),
      real_estate_contracts_without_parties: list(
        contractsWithoutParties.map((c) => ({ id: Number(c.id), subject: c.subject ?? null })),
      ),
      third_parties_without_identifier: list(
        partiesWithoutIdentifier.map((p) => ({ id: Number(p.id), name: p.name, type: p.type })),
      ),
      plants_without_asset: list(
        plantsWithoutAsset.map((p) => ({
          id: Number(p.id),
          code: p.code,
          name: p.name,
          type: p.type,
        })),
      ),
      utilities_with_reactive_penalty: list(
        reactivePenalty.map((u) => ({ id: Number(u.id), utility_id: u.utility_id, type: u.type })),
      ),
      plants_fire_equipment_overdue: list(
        fireOverdue.map((p) => ({ id: Number(p.id), code: p.code, name: p.name, type: p.type })),
      ),
      plants_missing_inspections: list(
        missingRequired.map(({ p, missing }) => ({
          id: Number(p.id),
          code: p.code,
          name: p.name,
          type: p.type,
          missing: missing.map((m) => m.kind).join(', '),
        })),
      ),
      plants_without_position: list(
        plantsWithoutPosition.map((p) => ({
          id: Number(p.id),
          code: p.code,
          name: p.name,
          type: p.type,
        })),
      ),
      active_utilities_without_position: list(utilitiesWithoutPosition),
      real_estate_contracts_without_assets: list(
        contractsWithoutAssets.map((c) => ({
          id: Number(c.id),
          counterparty: c.counterparty ?? null,
          subject: c.subject ?? null,
        })),
      ),
      contracts_without_cig: list(
        contractsWithoutCig.map((c) => ({
          id: Number(c.id),
          supplier: (c.supplier as string) ?? null,
          agreement: (c.agreement as string) ?? null,
          supply_expiry_date: (c.supply_expiry_date as string) ?? null,
          utilities: Number(c.utilities),
        })),
      ),
      active_utilities_without_contract: list(withoutContract),
      active_utilities_without_arera_category: list(withoutAreraCategory),
      active_gas_utilities_without_use_category: list(gasWithoutUseCategory),
      active_utilities_without_cig_contract: list(withoutCigContract),
      utilities_with_overlapping_contracts: list(overlapping),
      duplicate_cigs: list(
        duplicateCigs.map((d) => ({
          cig: d.cig,
          contracts: String(d.contracts).split(',').map(Number),
        })),
      ),
      contracts_draft_overdue: list(
        draftOverdue.map((c) => ({
          id: Number(c.id),
          cig_contract: ((c.cig_contract as string) ?? '').trim() || null,
          supply_start_date: String(c.supply_start_date),
        })),
      ),
      agreements_commitments_short: list(agreementsShortItems),
      chapters_variation_needed: list(
        variationNeeded.map((c) => ({
          ...chapterLabel(c),
          missing: Number(c.missing),
          available: Number(c.available),
        })),
      ),
    };
  }
}
