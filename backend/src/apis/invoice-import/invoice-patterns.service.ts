import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
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
  BAND_TARGETS,
  documentTypeOf,
  detectReadingTables,
  extract,
  isCreditNoteType,
  patternMatches,
  PDF_PATH,
  rulePaths,
  structureKey,
  usesPdf,
  wordOccurrences,
  WORD_KINDS,
  type WordOccurrence,
  type DetectedReadingTable,
  type ExtractedInvoice,
  type PatternRules,
  type Rule,
} from './pattern/pattern-rules';
import { pdfText } from './sdi/pdf-text';
import { extractPdf } from './sdi/sdi-files';
import {
  toUnknownStructure,
  UNTYPED_SQL,
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
  // Regole «parola»: dove compare la parola e cosa leggerebbe ogni occorrenza.
  occurrences: Partial<Record<TargetField, WordOccurrence[]>>;
}

// Regole provate su un gruppo di fatture simili: su quante ogni campo mappato ha un valore.
export interface PatternAnalysis {
  analyzed: number;
  // Non più sulla PEC o estrazione non riuscita.
  unavailable: number;
  // Struttura riconosciuta dalle regole (patternMatches).
  matches: number;
  found: Partial<Record<TargetField, number>>;
  // Fatture leggibili dove il campo mappato non ha valore (l'editor le apre).
  notFound: Partial<Record<TargetField, number[]>>;
  // Fatture leggibili con struttura non riconosciuta dalle regole.
  unmatched: number[];
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
    // TipoDocumento del tracciato; nota di credito: pattern a parte, senza consumi.
    document_type: string | null;
    credit_note: boolean;
  };
  xml: string;
  // Testo del PDF allegato (null se manca): fonte delle regole «parola».
  pdf_text: string | null;
  // Tabelle delle letture trovate nel PDF (selettore del modo «Letture del contatore»).
  reading_tables: DetectedReadingTable[];
  catalog: CatalogField[];
  ranked: Record<TargetField, string[]>;
  // Fatture del fornitore senza pattern, raggruppate per variante di struttura
  // (dalla più numerosa).
  similar: number[];
  // Varianti: posizione della prima fattura in similar e quante sono.
  variants: { start: number; count: number }[];
  // Numero documento di ciascuna fattura di similar (stesso indice), per cercarla.
  numbers: (string | null)[];
}

export interface SavePatternInput {
  message_id: number;
  name: string;
  rules: PatternRules;
}

const SUPPLIER_NAME = "COALESCE(tp.company_name, CONCAT_WS(' ', tp.last_name, tp.first_name))";

const LIST_SQL =
  `SELECT p.id, p.name, p.supplier_id_fk AS supplier_id, ${SUPPLIER_NAME} AS supplier, ` +
  'p.ignored, p.document_type, p.structure_key, p.update_date, ' +
  "(SELECT COUNT(*) FROM sdi_messages m WHERE m.pattern_id_fk = p.id AND m.status = 'EXTRACTED') AS extracted, " +
  '(SELECT MAX(m.id) FROM sdi_messages m WHERE m.supplier_id_fk = p.supplier_id_fk ' +
  "AND m.structure_key = p.structure_key AND m.kind = 'INVOICE') AS sample_message_id " +
  'FROM invoice_patterns p JOIN third_parties tp ON tp.id = p.supplier_id_fk ' +
  'WHERE p.deleted = 0 ORDER BY p.ignored, supplier, p.name';

const SUPPLIER_SQL = `SELECT ${SUPPLIER_NAME} AS supplier FROM third_parties tp WHERE tp.id = ?`;

// Simili: fatture del fornitore senza pattern, prima quelle con la stessa struttura.
const SIMILAR_SQL =
  'SELECT m.id, m.structure_key, m.document_number FROM sdi_messages m ' +
  "WHERE m.kind = 'INVOICE' AND m.supplier_id_fk = ? AND IFNULL(m.document_type, '') = ? " +
  "AND m.status IN ('PENDING', 'LINKED') AND m.pattern_id_fk IS NULL " +
  'ORDER BY m.id DESC LIMIT 1000';

// Simili per variante, dalla più numerosa (a parità la più recente): numerazione
// stabile qualunque fattura sia aperta. Dentro la variante dalla più recente.
export function groupVariants(
  rows: { id: number | string; structure_key: string | null; document_number?: string | null }[],
): {
  similar: number[];
  variants: { start: number; count: number }[];
  numbers: (string | null)[];
} {
  const groups = new Map<string, number[]>();
  const numberOf = new Map<number, string | null>();
  for (const r of rows) {
    const key = r.structure_key ?? '';
    groups.set(key, [...(groups.get(key) ?? []), Number(r.id)]);
    numberOf.set(Number(r.id), r.document_number ?? null);
  }
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length || b[0] - a[0]);
  const similar: number[] = [];
  const variants = ordered.map((ids) => {
    const start = similar.length;
    similar.push(...ids);
    return { start, count: ids.length };
  });
  return { similar, variants, numbers: similar.map((id) => numberOf.get(id) ?? null) };
}

// Da rielaborare: fatture del fornitore non estratte (senza pattern o ferme per
// una differenza bloccante) e, in modifica, quelle estratte col pattern.
const REPROCESS_SQL =
  "SELECT id FROM sdi_messages WHERE kind = 'INVOICE' AND supplier_id_fk = ? " +
  "AND (status IN ('PENDING', 'LINKED') OR (status = 'EXTRACTED' AND pattern_id_fk = ?)) " +
  'ORDER BY id';

const RULE_KINDS = ['field', ...WORD_KINDS, 'grossAmount', 'fromHeader', 'none'];
const isWordKind = (kind: unknown) => (WORD_KINDS as unknown[]).includes(kind);
// Campi che si possono leggere dal testo del PDF: tutti tranne la P.IVA del
// fornitore, che lo identifica, e il tipo documento, sempre dal tracciato
// (fornitori senza dati utili nell'XML, es. ACA).
// L'importo di riga dal PDF vale per fatture di una riga o con più utenze (ogni
// riga legge il tratto dopo il codice della sua utenza).
const PDF_TARGETS: TargetField[] = [
  'supplierName',
  'number',
  'date',
  'total',
  'netAmount',
  'cig',
  'contractRef',
  'utility',
  'periodStart',
  'periodEnd',
  'amount',
  'consumption',
  ...BAND_TARGETS,
  'unit',
  'meter',
  'estimated',
];
// Nel PDF il dato di solito c'è solo per questi (il riferimento contratto non è
// mai nell'XML): il campo PDF va in cima, per gli altri in fondo.
// Posizione del campo PDF per gli altri: dopo i campi XML più probabili.
const PDF_AFTER = 3;
const PDF_FIRST: TargetField[] = [
  'contractRef',
  'consumption',
  ...BAND_TARGETS,
  'meter',
  'estimated',
];
// Fatture per chiamata di analisi: il frontend le manda a gruppi.
const ANALYZE_MAX = 25;
// File riletti dalla PEC tenuti in memoria (l'editor torna sulle stesse fatture).
const CACHE_MAX = 200;
const CACHE_TTL_MS = 30 * 60_000;

interface CachedFile {
  content: Buffer;
  // Testo del PDF, letto alla prima regola che lo usa (null = nessun PDF).
  pdf?: string | null;
  at: number;
}
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
  if (
    r.occurrence !== undefined &&
    (!isWordKind(r.kind) ||
      !Number.isInteger(r.occurrence) ||
      (r.occurrence as number) < 1 ||
      (r.occurrence as number) > 50)
  )
    return false;
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

function validReadingTable(table: unknown): boolean {
  if (table === undefined) return true;
  if (!table || typeof table !== 'object') return false;
  const t = table as Record<string, unknown>;
  return (
    (t.layout === 'columns' || t.layout === 'rows') &&
    typeof t.label === 'string' &&
    !!t.label.trim() &&
    text(t.label, 80) &&
    (t.occurrence === undefined ||
      (Number.isInteger(t.occurrence) &&
        (t.occurrence as number) >= 1 &&
        (t.occurrence as number) <= 20))
  );
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
    (rules.consumptionLineFilter === undefined || text(rules.consumptionLineFilter, 50)) &&
    validReadingTable(rules.readingTable);
  if (!valid) throw new BadRequestException('Regole del pattern non valide.');
  const mapped = (r: Rule | undefined) => !!r && r.kind !== 'none';
  // Importo senza regola = imponibile × IVA (come in extract), purché non sia «Non presente».
  if (!mapped(rules.line.utility) || rules.line.amount?.kind === 'none') {
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
  [ImportIssueType.PDF_DATA_MISSING]: 'readings',
};

// Fonte «Testo del PDF allegato» nelle select di consumo e matricola.
const pdfField = (): CatalogField => ({
  key: fieldKey('header', PDF_PATH),
  scope: 'header',
  label: 'Testo del PDF allegato',
  path: PDF_PATH,
  sample: null,
});

const isHeaderTarget = (t: TargetField) => (HEADER_TARGETS as string[]).includes(t);

// Il campo ha un valore nella fattura estratta (di riga: su almeno una riga).
function hasValue(extracted: ExtractedInvoice, t: TargetField): boolean {
  const present = (v: unknown) => v !== null && v !== undefined && v !== '' && v !== false;
  if (isHeaderTarget(t)) return present(extracted[t as keyof ExtractedInvoice]);
  if (t === 'readings') return extracted.lines.some((l) => l.readings.length > 0);
  // Fasce: una fattura con solo il consumo totale (fasce non tutte presenti) conta come trovata.
  if ((BAND_TARGETS as TargetField[]).includes(t) && totalOnly(extracted)) return true;
  return extracted.lines.some((l) => present(l[t as Exclude<LineTarget, 'readings'>]));
}

// Consumo letto ma nessuna fascia: fasce non tutte presenti (vedi extractInvoice).
function totalOnly(extracted: ExtractedInvoice): boolean {
  return (
    extracted.lines.some((l) => l.consumption !== null) &&
    extracted.lines.every((l) => BAND_TARGETS.every((b) => l[b] === null))
  );
}

const number = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 6 });
const rows = (n: number) => (n === 1 ? '1 riga' : `${n} righe`);

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

  private readonly files = new Map<number, CachedFile>();

  private cached(id: number): CachedFile | undefined {
    const hit = this.files.get(id);
    if (!hit) return undefined;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
      this.files.delete(id);
      return undefined;
    }
    return hit;
  }

  private remember(id: number, content: Buffer): CachedFile {
    const entry: CachedFile = { content, at: Date.now() };
    this.files.delete(id);
    this.files.set(id, entry);
    while (this.files.size > CACHE_MAX) this.files.delete(this.files.keys().next().value!);
    return entry;
  }

  private async file(row: SdiMessage): Promise<CachedFile> {
    return (
      this.cached(row.id) ??
      this.remember(row.id, (await this.importer.readMessageFile(row)).content)
    );
  }

  private async pdfOf(entry: CachedFile): Promise<string | null> {
    if (entry.pdf === undefined) entry.pdf = await pdfText(entry.content);
    return entry.pdf;
  }

  async unknown(): Promise<UnknownStructure[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(UNKNOWN_STRUCTURES_SQL);
    const result = rows.map(toUnknownStructure);
    if (result.some((r) => !r.document_type)) this.fillDocumentTypes();
    return result;
  }

  private typing = false;

  // Completa in background il tipo delle fatture senza pattern registrate prima
  // della v1.40.0, rileggendo la PEC (sola lettura) anche a import spento: l'elenco
  // le divide per tipo man mano. File sparito = tipo vuoto.
  private fillDocumentTypes(): void {
    if (this.typing || !this.importer.configured) return;
    this.typing = true;
    void (async () => {
      for (;;) {
        const ids: { id: number }[] = await this.dataSource.query(UNTYPED_SQL);
        if (!ids.length) break;
        const rows = await this.messagesRepo.findBy({ id: In(ids.map((r) => Number(r.id))) });
        const files = await this.importer.readMessageFiles(rows);
        for (const row of rows) {
          const content = files.get(row.id);
          const type = content ? documentTypeOf(content) : null;
          await this.messagesRepo.update(row.id, { document_type: type ?? '' });
        }
      }
    })()
      .catch(() => undefined)
      .finally(() => (this.typing = false));
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
    const entry = await this.file(row);
    const xml = entry.content;
    const catalog = buildCatalog(xml);
    const ranked = Object.fromEntries(
      [...HEADER_TARGETS, ...LINE_TARGETS].map((t) => [t, rankFor(t, catalog).map((f) => f.key)]),
    ) as Record<TargetField, string[]>;
    const pdf = await this.pdfOf(entry);
    if (pdf !== null) {
      const field = pdfField();
      catalog.push(field);
      // In fondo a decine di campi XML non si vedeva (es. utenza): dopo i primi tre.
      for (const t of PDF_TARGETS) {
        ranked[t].splice(PDF_FIRST.includes(t) ? 0 : PDF_AFTER, 0, field.key);
      }
    }
    const [supplier] = await this.dataSource.query(SUPPLIER_SQL, [row.supplier_id_fk]);
    const documentType = await this.documentTypeFor(row, xml);
    const { similar, variants, numbers } = groupVariants(
      row.structure_key
        ? await this.dataSource.query(SIMILAR_SQL, [row.supplier_id_fk, documentType])
        : [],
    );
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
        document_type: documentType || null,
        credit_note: isCreditNoteType(documentType),
      },
      xml: xml.toString('utf8'),
      pdf_text: pdf,
      reading_tables: detectReadingTables(pdf),
      catalog,
      ranked,
      similar: similar.length ? similar : [row.id],
      variants: variants.length ? variants : [{ start: 0, count: 1 }],
      numbers: similar.length ? numbers : [row.document_number],
    };
  }

  // Tipo del documento dal tracciato; completa document_type sui messaggi registrati prima.
  private async documentTypeFor(row: SdiMessage, xml: Buffer): Promise<string> {
    if (row.document_type === null || row.document_type === undefined) {
      const type = documentTypeOf(xml);
      if (type) {
        row.document_type = type;
        await this.messagesRepo.update(row.id, { document_type: type });
      }
    }
    return row.document_type ?? '';
  }

  async pdf(messageId: number): Promise<{ fileName: string; data: Buffer }> {
    const row = await this.message(messageId);
    const pdf = extractPdf((await this.file(row)).content);
    if (!pdf) throw new BadRequestException('La fattura non contiene un PDF.');
    return {
      fileName: pdf.name || `${row.file_name.replace(/\.xml(\.p7m)?$/i, '')}.pdf`,
      data: pdf.data,
    };
  }

  // Nessuna scrittura: estrazione e abbinamento in sola lettura.
  async preview(messageId: number, rules: PatternRules): Promise<PatternPreview> {
    const row = await this.message(messageId);
    const entry = await this.file(row);
    const xml = entry.content;
    const pdf = usesPdf(rules) ? await this.pdfOf(entry) : null;
    let extracted: ExtractedInvoice;
    try {
      extracted = extract(xml, rules, pdf);
    } catch {
      return { matches: false, extracted: null, match: null, checks: [], occurrences: {} };
    }
    const match = await this.matcher.match(extracted, row.supplier_id_fk!);
    return {
      matches: patternMatches(xml, rules),
      extracted,
      match,
      checks: this.checks(rules, extracted, match, row, usesPdf(rules) && pdf === null),
      occurrences: Object.fromEntries(
        [...HEADER_TARGETS, ...LINE_TARGETS]
          .map((t) => [t, wordOccurrences(xml, rules, t, pdf)] as const)
          .filter(([, list]) => list.length),
      ),
    };
  }

  // Regole provate su un gruppo di fatture dello stesso fornitore, in sola lettura.
  async analyze(messageId: number, ids: number[], rules: PatternRules): Promise<PatternAnalysis> {
    const row = await this.message(messageId);
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > ANALYZE_MAX ||
      !ids.every(Number.isInteger)
    ) {
      throw new BadRequestException(`Indica da 1 a ${ANALYZE_MAX} fatture da analizzare.`);
    }
    const rows = await this.messagesRepo.findBy({
      id: In(ids),
      kind: 'INVOICE',
      supplier_id_fk: row.supplier_id_fk!,
    });
    const missing = rows.filter((r) => !this.cached(r.id));
    if (missing.length) {
      const read = await this.importer.readMessageFiles(missing);
      for (const [id, content] of read) this.remember(id, content);
    }
    const mapped: TargetField[] = [...HEADER_TARGETS, ...LINE_TARGETS].filter((t) => {
      const rule = isHeaderTarget(t)
        ? rules.header[t as keyof PatternRules['header']]
        : rules.line[t as keyof PatternRules['line']];
      return !!rule && rule.kind !== 'none';
    });
    if (rules.readingTable) mapped.push('readings');
    const pdfNeeded = usesPdf(rules);
    const result: PatternAnalysis = {
      analyzed: ids.length,
      unavailable: 0,
      matches: 0,
      found: {},
      notFound: {},
      unmatched: [],
    };
    for (const id of ids) {
      const entry = rows.some((r) => r.id === id) ? this.cached(id) : undefined;
      if (!entry) {
        result.unavailable++;
        continue;
      }
      let extracted: ExtractedInvoice;
      try {
        extracted = extract(entry.content, rules, pdfNeeded ? await this.pdfOf(entry) : null);
      } catch {
        result.unavailable++;
        continue;
      }
      if (patternMatches(entry.content, rules)) result.matches++;
      else result.unmatched.push(id);
      for (const t of mapped) {
        if (hasValue(extracted, t)) result.found[t] = (result.found[t] ?? 0) + 1;
        else (result.notFound[t] ??= []).push(id);
      }
    }
    return result;
  }

  // Segnalazione «dati dal PDF non trovati» silenziata: non compare più tra le anomalie.
  async muteIssue(id: number): Promise<void> {
    const [issue] = await this.dataSource.query(
      'SELECT id, type FROM invoice_import_issues WHERE id = ?',
      [id],
    );
    if (!issue) throw new BadRequestException('Segnalazione non trovata.');
    if (issue.type !== ImportIssueType.PDF_DATA_MISSING) {
      throw new BadRequestException('Si possono silenziare solo i dati dal PDF non trovati.');
    }
    await this.dataSource.query('UPDATE invoice_import_issues SET muted = 1 WHERE id = ?', [id]);
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
      document_type: documentTypeOf(xml) ?? '',
      created_by_user_id: userId,
      updated_by_user_id: userId,
    });
    return { pattern, reprocessing: await this.reprocessFor(row.supplier_id_fk!, 0) };
  }

  async update(id: number, input: SavePatternInput, userId: number) {
    const existing = await this.findOne(id);
    if (existing.ignored) throw new BadRequestException('Un pattern ignorato non ha regole.');
    const { row, xml } = await this.validated(input);
    if (row.supplier_id_fk !== existing.supplier_id_fk) {
      throw new BadRequestException('La fattura è di un altro fornitore.');
    }
    if ((documentTypeOf(xml) ?? '') !== existing.document_type) {
      throw new BadRequestException(
        `Il pattern è per i documenti ${existing.document_type}: scegline uno dello stesso tipo, per gli altri tipi salva un pattern a parte.`,
      );
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
      document_type: row.document_type ?? '',
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
    // Il tipo documento si legge sempre dal tracciato: un'eventuale regola si scarta.
    delete input.rules.header.documentType;
    const row = await this.message(input.message_id);
    const xml = (await this.file(row)).content;
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

    const read = extracted.lines.filter((l) => l.consumption !== null);
    const consumptions = read.length;
    // Valori letti (i primi tre), così si vede subito se la regola prende il numero giusto.
    const values = read
      .slice(0, 3)
      .map((l) => `${number(l.consumption!)}${l.unit ? ` ${l.unit}` : ''}`)
      .join(', ');
    const bandsMapped = BAND_TARGETS.some((t) => rules.line[t] && rules.line[t].kind !== 'none');
    const consumptionMapped = !!rules.line.consumption || bandsMapped;
    add(
      'consumption',
      consumptionMapped ? (consumptions ? 'ok' : 'warn') : 'off',
      consumptionMapped
        ? consumptions
          ? `Consumo letto: ${values}${consumptions > 3 ? '…' : ''} (${rows(consumptions)})`
          : 'Nessun consumo letto'
        : 'Non mappato',
    );
    // Fasce: valore di ciascuna; col totale letto la somma deve tornare (entro 1 kWh).
    for (const [i, t] of BAND_TARGETS.entries()) {
      const rule = rules.line[t];
      if (!rule || rule.kind === 'none') continue;
      const band = extracted.lines.find((l) => l[t] !== null);
      const onlyTotal = !band && totalOnly(extracted);
      add(
        t,
        band || onlyTotal ? 'ok' : 'warn',
        band
          ? `F${i + 1} letta: ${number(band[t] as number)}${band.unit ? ` ${band.unit}` : ''}`
          : onlyTotal
            ? 'Fasce non tutte presenti: solo il consumo totale'
            : 'Nessun valore letto',
      );
    }
    if (bandsMapped && rules.line.consumption) {
      const off = extracted.lines.find((l) => {
        const bands = BAND_TARGETS.map((t) => l[t]).filter((b): b is number => b !== null);
        const sum = bands.reduce((s, b) => s + b, 0);
        return l.consumption !== null && bands.length > 0 && Math.abs(sum - l.consumption) > 1;
      });
      if (off)
        add(
          'consumption',
          'warn',
          `La somma delle fasce non coincide col totale ${number(off.consumption!)}`,
        );
    }
    // Senza utenza riconosciuta o periodo il consumo non entra nello storico (ConsumptionLinker).
    const unusable = extracted.lines.filter(
      (l, i) =>
        l.consumption !== null &&
        (!l.periodStart || !l.periodEnd || !match.lines[i]?.utility_id_fk),
    ).length;
    if (unusable) {
      add(
        'consumption',
        'warn',
        `${rows(unusable)} senza utenza riconosciuta o senza periodo: il consumo non entra nello storico`,
      );
    }

    // Tabella delle letture: quante colonne complete e se le righe tornano.
    if (rules.readingTable) {
      const cells = extracted.lines.find((l) => l.readingCells)?.readingCells ?? null;
      if (!cells) {
        add('readings', 'warn', 'Tabella delle letture non trovata in questa fattura');
      } else {
        const complete = Math.min(cells.dates.length, cells.values.length);
        const counts = [cells.dates.length, cells.values.length];
        if (cells.types.length) counts.push(cells.types.length);
        if (!complete) {
          add('readings', 'warn', 'Nessuna lettura completa (data e valore)');
        } else if (new Set(counts).size > 1) {
          add(
            'readings',
            'warn',
            `Colonne diverse (date ${cells.dates.length}, valori ${cells.values.length}` +
              `${cells.types.length ? `, tipi ${cells.types.length}` : ''}): ` +
              `si importano le prime ${complete}`,
          );
        } else {
          add('readings', 'ok', complete === 1 ? '1 lettura letta' : `${complete} letture lette`);
        }
      }
      const readingsWithoutUtility = extracted.lines.filter(
        (l, i) => l.readings.length && !match.lines[i]?.utility_id_fk,
      ).length;
      if (readingsWithoutUtility) {
        add(
          'readings',
          'warn',
          `${rows(readingsWithoutUtility)} senza utenza riconosciuta: le letture non entrano nello storico`,
        );
      }
    }

    if (missingPdf && rules.readingTable) {
      add('readings', 'warn', 'La fattura non ha un PDF leggibile: letture non lette');
    }
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
        estimated ? `Consumo stimato (${rows(estimated)})` : 'Consumo reale (non stimato)',
      );
    }
    if (rules.header.cig && extracted.cig) add('cig', 'ok', `CIG ${extracted.cig}`);
    for (const issue of match.issues) add(ISSUE_FIELD[issue.type], 'warn', issue.detail);
    // Bloccanti: la fattura non si importa finché non si sistema l'anagrafica.
    for (const issue of match.blocking)
      add(ISSUE_FIELD[issue.type], 'danger', `${issue.detail}: import fermo`);
    // Matricola in fattura accanto a quella attuale dell'utenza: verde se coincidono,
    // gialla se l'import la completa o la aggiorna (la fattura fa fede).
    const fills = new Set(match.meterFills.map((m) => m.utilityId));
    for (const m of match.meters) {
      const current = `attuale ${m.previous || 'nessuna'} (utenza ${m.utilityId})`;
      if (!fills.has(m.utilityId))
        add('meter', 'ok', `Matricola ${m.meter}: coincide con l'${current}`);
      else if (m.previous)
        add('meter', 'warn', `Matricola ${m.meter}, ${current}: verrà aggiornata`);
      else add('meter', 'warn', `Matricola ${m.meter}, ${current}: verrà completata`);
    }
    if (rules.line.meter && rules.line.meter.kind !== 'none' && !match.meters.length) {
      // La matricola della fattura si scrive sull'utenza della riga: senza utenza trovata non c'è dove.
      const read = extracted.lines.find((l) => l.meter);
      const unmapped = !rules.line.utility || rules.line.utility.kind === 'none';
      add(
        'meter',
        'warn',
        !read
          ? 'Nessuna matricola letta'
          : unmapped
            ? `Matricola ${read.meter} letta: mappa il campo Utenza, la matricola si scrive sull'utenza della riga`
            : `Matricola ${read.meter} letta, ma l'utenza della riga${read.utility ? ` (${read.utility})` : ''} non è in anagrafica: non c'è dove scriverla`,
      );
    }
    return checks;
  }
}
