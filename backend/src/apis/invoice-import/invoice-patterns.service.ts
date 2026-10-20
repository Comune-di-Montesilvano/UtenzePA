import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InvoicePattern } from './entity/invoice-pattern.entity';
import { SdiMessage } from './entity/sdi-message.entity';
import { ImportIssueType } from './enum/import-issue-type.enum';
import { SdiMessageStatus } from './enum/sdi-message-status.enum';
import { InvoiceImportService } from './invoice-import.service';
import { InvoiceMatcher, type MatchResult } from './invoice-matcher.service';
import {
  buildCatalog,
  fieldKey,
  HEADER_TARGETS,
  LINE_TARGETS,
  rankFor,
  type CatalogField,
  type LineTarget,
  type TargetField,
} from './pattern/field-catalog';
import {
  extract,
  patternMatches,
  PDF_PATH,
  rulePaths,
  structureKey,
  usesPdf,
  WORD_KINDS,
  type ExtractedInvoice,
  type PatternRules,
  type Rule,
} from './pattern/pattern-rules';
import { pdfText } from './sdi/pdf-text';
import { extractPdf } from './sdi/sdi-files';
import {
  toUnknownStructure,
  UNKNOWN_STRUCTURES_SQL,
  type UnknownStructureRow,
} from './pattern/unknown-structures';

export type UnknownStructure = UnknownStructureRow;

export interface PatternCheck {
  field: TargetField;
  tone: 'ok' | 'warn' | 'danger' | 'off';
  text: string;
}

export interface PatternPreview {
  matches: boolean;
  extracted: ExtractedInvoice | null;
  match: MatchResult | null;
  checks: PatternCheck[];
}

export interface PatternEditor {
  message: {
    id: number;
    supplier_id: number;
    supplier: string;
    supplier_vat: string | null;
    file_name: string;
    document_number: string | null;
    document_date: string | null;
    status: string;
    pattern_id: number | null;
  };
  xml: string;
  // Testo del PDF allegato (null se manca): fonte delle regole «parola».
  pdf_text: string | null;
  catalog: CatalogField[];
  ranked: Record<TargetField, string[]>;
  similar: number[];
}

export interface SavePatternInput {
  message_id: number;
  name: string;
  rules: PatternRules;
}

const SUPPLIER_NAME = "COALESCE(tp.company_name, CONCAT_WS(' ', tp.last_name, tp.first_name))";

const LIST_SQL =
  `SELECT p.id, p.name, p.supplier_id_fk AS supplier_id, ${SUPPLIER_NAME} AS supplier, ` +
  'p.ignored, p.structure_key, p.update_date, ' +
  "(SELECT COUNT(*) FROM sdi_messages m WHERE m.pattern_id_fk = p.id AND m.status = 'EXTRACTED') AS extracted, " +
  '(SELECT MAX(m.id) FROM sdi_messages m WHERE m.supplier_id_fk = p.supplier_id_fk ' +
  "AND m.structure_key = p.structure_key AND m.kind = 'INVOICE') AS sample_message_id " +
  'FROM invoice_patterns p JOIN third_parties tp ON tp.id = p.supplier_id_fk ' +
  'WHERE p.deleted = 0 ORDER BY p.ignored, supplier, p.name';

const SUPPLIER_SQL = `SELECT ${SUPPLIER_NAME} AS supplier FROM third_parties tp WHERE tp.id = ?`;

// Simili: fatture del fornitore senza pattern, prima quelle con la stessa struttura.
const SIMILAR_SQL =
  "SELECT id FROM sdi_messages WHERE kind = 'INVOICE' AND supplier_id_fk = ? " +
  "AND status IN ('PENDING', 'LINKED') AND pattern_id_fk IS NULL " +
  'ORDER BY (structure_key = ?) DESC, id DESC LIMIT 200';

// Da rielaborare: fatture del fornitore non estratte (senza pattern o ferme per
// una differenza bloccante) e, in modifica, quelle estratte col pattern.
const REPROCESS_SQL =
  "SELECT id FROM sdi_messages WHERE kind = 'INVOICE' AND supplier_id_fk = ? " +
  "AND (status IN ('PENDING', 'LINKED') OR (status = 'EXTRACTED' AND pattern_id_fk = ?)) " +
  'ORDER BY id';

const RULE_KINDS = ['field', ...WORD_KINDS, 'grossAmount', 'fromHeader', 'none'];
const isWordKind = (kind: unknown) => (WORD_KINDS as unknown[]).includes(kind);
// Dal testo del PDF si leggono solo consumo, matricola e consumo stimato.
const PDF_TARGETS: LineTarget[] = ['consumption', 'meter', 'estimated'];
// Consumo stimato: numero «di cui stimati» o parola presente; «presente» solo lì.
const ESTIMATED_KINDS = ['numberAfter', 'contains', 'none'];

const text = (value: unknown, max: number) =>
  value === undefined || (typeof value === 'string' && value.length > 0 && value.length <= max);

function validRule(target: string, rule: unknown): boolean {
  if (!rule || typeof rule !== 'object') return false;
  const r = rule as Record<string, unknown>;
  if (!RULE_KINDS.includes(r.kind as string)) return false;
  if (r.kind === 'field' || r.kind === 'fromHeader' || isWordKind(r.kind)) {
    if (!text(r.path, 255) || r.path === undefined) return false;
  }
  if (isWordKind(r.kind) && (!text(r.word, 50) || r.word === undefined)) return false;
  if (!text(r.anchor, 100) || (r.anchor !== undefined && !isWordKind(r.kind))) return false;
  if (target === 'estimated' ? !ESTIMATED_KINDS.includes(r.kind as string) : r.kind === 'contains')
    return false;
  if (r.path === PDF_PATH && (!isWordKind(r.kind) || !(PDF_TARGETS as string[]).includes(target)))
    return false;
  if (r.where !== undefined) {
    const w = r.where as Record<string, unknown> | null;
    if (!w || !text(w.path, 255) || !text(w.equals, 100) || !w.path || !w.equals) return false;
  }
  return true;
}

function assertValidRules(rules: PatternRules): void {
  const valid =
    rules &&
    typeof rules.header === 'object' &&
    typeof rules.line === 'object' &&
    Object.entries(rules.header ?? {}).every(
      ([k, r]) => (HEADER_TARGETS as string[]).includes(k) && validRule(k, r),
    ) &&
    Object.entries(rules.line ?? {}).every(
      ([k, r]) => (LINE_TARGETS as string[]).includes(k) && validRule(k, r),
    ) &&
    (rules.consumptionLineFilter === undefined || text(rules.consumptionLineFilter, 50));
  if (!valid) throw new BadRequestException('Regole del pattern non valide.');
  const mapped = (r: Rule | undefined) => !!r && r.kind !== 'none';
  if (!mapped(rules.line.utility) || !mapped(rules.line.amount)) {
    throw new BadRequestException('Indica almeno utenza e importo della riga.');
  }
}

// Badge del riscontro per ogni segnalazione dell'abbinamento.
const ISSUE_FIELD: Record<ImportIssueType, TargetField> = {
  [ImportIssueType.UNKNOWN_UTILITY]: 'utility',
  [ImportIssueType.CIG_MISMATCH]: 'cig',
  [ImportIssueType.SUPPLIER_NAME_MISMATCH]: 'supplierName',
  [ImportIssueType.MISSING_COMMITMENT]: 'utility',
  [ImportIssueType.PERIOD_COVERED]: 'consumption',
  [ImportIssueType.MIXED_CONTRACTS]: 'utility',
  [ImportIssueType.BATCH_NOT_SUPPORTED]: 'number',
  [ImportIssueType.METER_MISMATCH]: 'meter',
};

// Fonte «Testo del PDF allegato» nelle select di consumo e matricola.
const pdfField = (): CatalogField => ({
  key: fieldKey('header', PDF_PATH),
  scope: 'header',
  label: 'Testo del PDF allegato',
  path: PDF_PATH,
  sample: null,
});

const euro = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 });

/**
 * Pattern delle fatture per fornitore: strutture ancora da mappare, editor
 * (catalogo dei campi, anteprima senza scritture), salvataggio e rielaborazione.
 */
@Injectable()
export class InvoicePatternsService {
  constructor(
    @InjectRepository(InvoicePattern)
    private readonly patternsRepo: Repository<InvoicePattern>,
    @InjectRepository(SdiMessage)
    private readonly messagesRepo: Repository<SdiMessage>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly importer: InvoiceImportService,
    private readonly matcher: InvoiceMatcher,
  ) {}

  async unknown(): Promise<UnknownStructure[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(UNKNOWN_STRUCTURES_SQL);
    return rows.map(toUnknownStructure);
  }

  async list(): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(LIST_SQL);
    return rows.map((r) => ({
      ...r,
      supplier_id: Number(r.supplier_id),
      ignored: !!Number(r.ignored),
      extracted: Number(r.extracted),
      sample_message_id: r.sample_message_id === null ? null : Number(r.sample_message_id),
    }));
  }

  async findOne(id: number): Promise<InvoicePattern> {
    const pattern = await this.patternsRepo.findOneBy({ id, deleted: false });
    if (!pattern) throw new BadRequestException('Pattern non trovato.');
    return pattern;
  }

  async editor(messageId: number): Promise<PatternEditor> {
    const row = await this.message(messageId);
    const xml = (await this.importer.readMessageFile(row)).content;
    const catalog = buildCatalog(xml);
    const ranked = Object.fromEntries(
      [...HEADER_TARGETS, ...LINE_TARGETS].map((t) => [t, rankFor(t, catalog).map((f) => f.key)]),
    ) as Record<TargetField, string[]>;
    const pdf = await pdfText(xml);
    if (pdf !== null) {
      const field = pdfField();
      catalog.push(field);
      for (const t of PDF_TARGETS) ranked[t].unshift(field.key);
    }
    const [supplier] = await this.dataSource.query(SUPPLIER_SQL, [row.supplier_id_fk]);
    const similar: { id: number }[] = row.structure_key
      ? await this.dataSource.query(SIMILAR_SQL, [row.supplier_id_fk, row.structure_key])
      : [];
    return {
      message: {
        id: row.id,
        supplier_id: row.supplier_id_fk!,
        supplier: supplier?.supplier ?? '',
        supplier_vat: row.supplier_vat,
        file_name: row.file_name,
        document_number: row.document_number,
        document_date: row.document_date,
        status: row.status,
        pattern_id: row.pattern_id_fk,
      },
      xml: xml.toString('utf8'),
      pdf_text: pdf,
      catalog,
      ranked,
      similar: similar.length ? similar.map((s) => Number(s.id)) : [row.id],
    };
  }

  async pdf(messageId: number): Promise<{ fileName: string; data: Buffer }> {
    const row = await this.message(messageId);
    const pdf = extractPdf((await this.importer.readMessageFile(row)).content);
    if (!pdf) throw new BadRequestException('La fattura non contiene un PDF.');
    return {
      fileName: pdf.name || `${row.file_name.replace(/\.xml(\.p7m)?$/i, '')}.pdf`,
      data: pdf.data,
    };
  }

  // Nessuna scrittura: estrazione e abbinamento in sola lettura.
  async preview(messageId: number, rules: PatternRules): Promise<PatternPreview> {
    const row = await this.message(messageId);
    const xml = (await this.importer.readMessageFile(row)).content;
    const pdf = usesPdf(rules) ? await pdfText(xml) : null;
    let extracted: ExtractedInvoice;
    try {
      extracted = extract(xml, rules, pdf);
    } catch {
      return { matches: false, extracted: null, match: null, checks: [] };
    }
    const match = await this.matcher.match(extracted, row.supplier_id_fk!);
    return {
      matches: patternMatches(xml, rules),
      extracted,
      match,
      checks: this.checks(rules, extracted, match, row, usesPdf(rules) && pdf === null),
    };
  }

  async create(input: SavePatternInput, userId: number) {
    const { row, xml } = await this.validated(input);
    const pattern = await this.patternsRepo.save({
      supplier_id_fk: row.supplier_id_fk!,
      name: input.name.trim(),
      ignored: false,
      rules: input.rules,
      structure_key: structureKey(xml),
      paths_count: rulePaths(input.rules).length,
      created_by_user_id: userId,
      updated_by_user_id: userId,
    });
    return { pattern, reprocessing: await this.reprocessFor(row.supplier_id_fk!, 0) };
  }

  async update(id: number, input: SavePatternInput, userId: number) {
    const existing = await this.findOne(id);
    if (existing.ignored) throw new BadRequestException('Un pattern ignorato non ha regole.');
    const { row } = await this.validated(input);
    if (row.supplier_id_fk !== existing.supplier_id_fk) {
      throw new BadRequestException('La fattura è di un altro fornitore.');
    }
    await this.patternsRepo.update(id, {
      name: input.name.trim(),
      rules: input.rules,
      paths_count: rulePaths(input.rules).length,
      updated_by_user_id: userId,
    });
    return {
      pattern: await this.findOne(id),
      reprocessing: await this.reprocessFor(existing.supplier_id_fk, id),
    };
  }

  async ignore(input: { message_id: number; name: string }, userId: number) {
    const row = await this.message(input.message_id);
    if (!row.structure_key)
      throw new BadRequestException('Struttura della fattura non ancora nota.');
    const existing = await this.patternsRepo.findOneBy({
      supplier_id_fk: row.supplier_id_fk!,
      structure_key: row.structure_key,
      ignored: true,
      deleted: false,
    });
    if (existing) throw new BadRequestException('Struttura già ignorata.');
    const pattern = await this.patternsRepo.save({
      supplier_id_fk: row.supplier_id_fk!,
      name: input.name.trim(),
      ignored: true,
      rules: null,
      structure_key: row.structure_key,
      paths_count: 0,
      created_by_user_id: userId,
      updated_by_user_id: userId,
    });
    return { pattern, reprocessing: await this.reprocessFor(row.supplier_id_fk!, 0) };
  }

  // Le fatture già estratte restano; una struttura non più ignorata torna da mappare.
  async remove(id: number, userId: number): Promise<void> {
    const pattern = await this.findOne(id);
    await this.patternsRepo.update(id, { deleted: true, updated_by_user_id: userId });
    if (pattern.ignored) {
      await this.messagesRepo.update(
        {
          supplier_id_fk: pattern.supplier_id_fk,
          structure_key: pattern.structure_key,
          status: SdiMessageStatus.IGNORED,
        },
        { status: SdiMessageStatus.PENDING },
      );
    }
  }

  private async message(id: number): Promise<SdiMessage> {
    const row = await this.messagesRepo.findOneBy({ id });
    if (!row || row.kind !== 'INVOICE' || !row.supplier_id_fk) {
      throw new BadRequestException('Fattura non trovata tra quelle dei fornitori in anagrafica.');
    }
    return row;
  }

  private async validated(input: SavePatternInput): Promise<{ row: SdiMessage; xml: Buffer }> {
    if (!input.name?.trim()) throw new BadRequestException('Indica il nome del pattern.');
    assertValidRules(input.rules);
    const row = await this.message(input.message_id);
    const xml = (await this.importer.readMessageFile(row)).content;
    if (!patternMatches(xml, input.rules)) {
      throw new BadRequestException('Il pattern non riconosce la fattura di partenza.');
    }
    return { row, xml };
  }

  // Rielaborazione in background: la risposta arriva subito col numero di fatture.
  private async reprocessFor(supplierId: number, patternId: number): Promise<number> {
    const rows: { id: number }[] = await this.dataSource.query(REPROCESS_SQL, [
      supplierId,
      patternId,
    ]);
    const ids = rows.map((r) => Number(r.id));
    if (ids.length) void this.importer.reprocess(ids);
    return ids.length;
  }

  private checks(
    rules: PatternRules,
    extracted: ExtractedInvoice,
    match: MatchResult,
    row: SdiMessage,
    missingPdf: boolean,
  ): PatternCheck[] {
    const checks: PatternCheck[] = [];
    const add = (field: TargetField, tone: PatternCheck['tone'], text: string) =>
      checks.push({ field, tone, text });

    add(
      'supplierVat',
      extracted.supplierVat === row.supplier_vat ? 'ok' : 'warn',
      extracted.supplierVat === row.supplier_vat
        ? `P.IVA ${extracted.supplierVat} → fornitore ${row.supplier_id_fk}`
        : `P.IVA ${extracted.supplierVat || '—'} diversa da quella del messaggio`,
    );
    add(
      'number',
      'ok',
      match.existingInvoiceId
        ? `Fattura già presente: verrà arricchita (id ${match.existingInvoiceId})`
        : 'Nuova fattura: verrà creata',
    );

    const withCode = extracted.lines.filter((l) => l.utility).length;
    const found = [...new Set(match.lines.map((l) => l.utility_id_fk).filter((id) => id !== null))];
    if (!rules.line.utility) add('utility', 'off', 'Non mappato');
    else if (found.length) add('utility', 'ok', `Utenze riconosciute: ${found.join(', ')}`);
    else
      add(
        'utility',
        'warn',
        withCode ? 'Nessuna utenza riconosciuta' : 'Nessun codice utenza letto',
      );

    if (extracted.total !== null) {
      const sum = Math.round(extracted.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
      const ok = Math.abs(sum - extracted.total) < 0.05;
      add(
        'amount',
        ok ? 'ok' : 'warn',
        ok
          ? `Somma delle righe = totale (${euro(sum)} €)`
          : `Somma delle righe ${euro(sum)} € ≠ totale ${euro(extracted.total)} €`,
      );
    } else {
      add('amount', 'ok', `${extracted.lines.length} righe lette`);
    }

    const consumptions = extracted.lines.filter((l) => l.consumption !== null).length;
    add(
      'consumption',
      rules.line.consumption ? (consumptions ? 'ok' : 'warn') : 'off',
      rules.line.consumption
        ? consumptions
          ? `Consumo su ${consumptions} righe`
          : 'Nessun consumo letto'
        : 'Non mappato',
    );

    if (missingPdf) {
      for (const t of PDF_TARGETS) {
        const rule = rules.line[t];
        if (rule && 'path' in rule && rule.path === PDF_PATH)
          add(t, 'warn', 'La fattura non ha un PDF leggibile: dato non letto');
      }
    }
    if (rules.line.estimated && rules.line.estimated.kind !== 'none' && consumptions) {
      const estimated = extracted.lines.filter((l) => l.estimated).length;
      add(
        'estimated',
        'ok',
        estimated ? `Consumo stimato su ${estimated} righe` : 'Consumo reale (non stimato)',
      );
    }
    if (rules.header.cig && extracted.cig) add('cig', 'ok', `CIG ${extracted.cig}`);
    for (const issue of match.issues) add(ISSUE_FIELD[issue.type], 'warn', issue.detail);
    // Bloccanti: la fattura non si importa finché non si sistema l'anagrafica.
    for (const issue of match.blocking)
      add(ISSUE_FIELD[issue.type], 'danger', `${issue.detail}: import fermo`);
    for (const fill of match.meterFills)
      add('meter', 'ok', `Matricola ${fill.meter} da completare sull'utenza ${fill.utilityId}`);
    return checks;
  }
}
