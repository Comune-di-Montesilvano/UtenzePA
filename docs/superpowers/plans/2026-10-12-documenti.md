# Documenti e riferimenti ad atti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** entità Documento (atto o documento tecnico, con zero o più file) collegabile N-N a immobili, impianti, verifiche, contratti immobiliari e di fornitura, con elenco, scheda, tab nelle schede, scadenze e backup.

**Architecture:** backend NestJS con due moduli nuovi (`apis/document-types/`, `apis/documents/`), collegamenti con `@ManyToMany` + tabelle di join esplicite, file su disco in `DOCUMENTS_DIR` caricati a pezzi con `ChunkedUploadService`; logiche pure (`document-file-policy.ts`, `document-expiry.ts`) testate a parte. Frontend Angular standalone: elenco + scheda che salva da sé (come i complessi), componente `app-entity-documents` riusato nelle quattro schede e nelle verifiche.

**Tech Stack:** NestJS 11, TypeORM (MySQL 8), class-validator, jest; Angular 22 + Material.

**Spec:** `docs/superpowers/specs/2026-10-12-documenti-design.md`

## Global Constraints

- Branch `feat/documenti`; release minor `v1.22.0` (`publiccode.yml` `softwareVersion`/`releaseDate`).
- Comandi Docker uno alla volta; jest sempre `--maxWorkers=2`, solo i file rilevanti: `docker exec utenzepa-api-1 pnpm exec jest <file> --maxWorkers=2`.
- Mai `git add .`/`-A`: file elencati. File CRLF: modifiche con script Python che preservano `\r\n`; dopo `prettier`/`lint` nel container tenere solo i propri file (`git diff --numstat`).
- Niente HTTP 409: conflitti e duplicati → `BadRequestException` (400) con messaggio in italiano.
- Migration: generata nel container (`migration:generate`), tenuti solo gli statement della feature, scritta in uno scratch path e spostata in `backend/src/database/migrations/` a contenuto finale; poi verificare la riga in `migrations` e `schema:log` senza statement sulle tabelle nuove.
- Colonna stringa nullable: `type: 'varchar'` esplicito. Date: `@DateOnly()` nei DTO, `toIsoDate` nel frontend, mai `toISOString()`.
- `invalidWhereValuesBehavior: 'throw'`: mai valori potenzialmente `undefined` in una where object-criteria senza guardia.
- Ruoli scrittura: `@Roles('Admin', 'Operatore')`; download dei file: solo `Admin`, `Operatore`. Tipi documento: scrittura solo `Admin`.
- Tipi file ammessi: `pdf p7m doc docx odt xls xlsx ods csv txt jpg jpeg png tif tiff eml msg`; `DOCUMENT_MAX_SIZE_MB` default 50; `DOCUMENTS_DIR` default `<cwd>/documents`.
- Frontend: componenti `ChangeDetectionStrategy.Eager`, colori solo token (`--entity-document` nuovo), `MatDialog` con `openSheet()`, servizi che non estendono `AbstractService` mettono `Authorization: Bearer` a mano.
- Ogni modifica visibile aggiorna `frontend/public/guida/guida.md` (data in testa); `pnpm run build` esegue `scripts/check-guida.mjs`.
- Nessun dato personale in test, commit, guida: solo nomi fittizi.

## Review Focus

- Nome file originale con `../`, barre, accenti o virgolette → salvato con nome generato, `Content-Disposition` con `filename*` UTF-8, nessun file fuori da `DOCUMENTS_DIR` (test in Task 2 e Task 6).
- File con estensione ammessa ma contenuto diverso (eseguibile rinominato `.pdf`, ZIP rinominato `.pdf`) → 400 «Il contenuto del file non corrisponde al tipo .pdf» (test in Task 2).
- Collegare due volte la stessa entità o un'entità cancellata/inesistente → idempotente / 400 «… non trovato» (test in Task 5).
- Documento cancellato: sparisce dai tab delle schede e dai conteggi, i suoi file non si scaricano (test in Task 5 e Task 6).
- DB ripristinato senza la cartella documenti (backup solo SQL): download di un file mancante → 400 «File non disponibile sul server», non 500 (test in Task 6).

---

### Task 1: Entità, migration e tipi iniziali

**Files:**
- Create: `backend/src/apis/document-types/entity/document-type.entity.ts`
- Create: `backend/src/apis/documents/entity/document.entity.ts`
- Create: `backend/src/apis/documents/entity/document-file.entity.ts`
- Create: `backend/src/database/migrations/1794100000000-Documents.ts`

**Interfaces:**
- Produces: classi `DocumentType`, `Document`, `DocumentFile`; tabelle `document_types`, `documents`, `document_files`, `document_assets`, `document_plants`, `document_plant_inspections`, `document_utilizer_grants`, `document_contracts`; relazioni `Document.documentType`, `Document.files`, `Document.assets`, `Document.plants`, `Document.plantInspections`, `Document.utilizerGrants`, `Document.contracts`.

- [ ] **Step 1: Entità `DocumentType`**

```ts
// backend/src/apis/document-types/entity/document-type.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';

// Tipo di documento (delibera, determina, visura…), modificabile dagli Admin.
// group_name raggruppa i tipi negli elenchi e nei filtri.
@Entity('document_types')
export class DocumentType {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 150 })
  name: string;

  @Column({ length: 100 })
  group_name: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'created_by_user_id' })
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;
}
```

- [ ] **Step 2: Entità `DocumentFile`**

```ts
// backend/src/apis/documents/entity/document-file.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { Document } from './document.entity';

// File di un documento, su disco in <DOCUMENTS_DIR>/<document_id>/<stored_name>.
// stored_name è generato (uuid + estensione): nessun input dell'utente nel path.
@Entity('document_files')
export class DocumentFile {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  document_id: number;

  @ManyToOne(() => Document, (d) => d.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: Document;

  @Column({ length: 255 })
  original_name: string;

  @Column({ length: 255 })
  stored_name: string;

  @Column({ length: 150 })
  mime_type: string;

  @Column({ type: 'int' })
  size_bytes: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'created_by_user_id' })
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;
}
```

- [ ] **Step 3: Entità `Document`**

```ts
// backend/src/apis/documents/entity/document.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { DocumentType } from '@apis/document-types/entity/document-type.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { PlantInspection } from '@apis/plants/entity/plant-inspection.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { DocumentFile } from './document-file.entity';

// Atto o documento (delibera, visura, verbale…): file facoltativi, collegato
// N-N alle entità. Una tabella di join per tipo di entità (FK vere).
@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  document_type_id: number;

  @ManyToOne(() => DocumentType)
  @JoinColumn({ name: 'document_type_id' })
  documentType: DocumentType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  number: string | null;

  @Column({ type: 'date', nullable: true })
  document_date: string | null;

  @Column({ length: 500 })
  subject: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  issuer: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  protocol_number: string | null;

  @Column({ type: 'date', nullable: true })
  protocol_date: string | null;

  // Validità propria (CPI, agibilità, APE, polizze). Le verifiche degli
  // impianti hanno la loro scadenza (plant_inspections.next_date).
  @Column({ type: 'date', nullable: true })
  expires_on: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'created_by_user_id' })
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @OneToMany(() => DocumentFile, (f) => f.document)
  files: DocumentFile[];

  @ManyToMany(() => Asset)
  @JoinTable({
    name: 'document_assets',
    joinColumn: { name: 'document_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'asset_id', referencedColumnName: 'id' },
  })
  assets: Asset[];

  @ManyToMany(() => Plant)
  @JoinTable({
    name: 'document_plants',
    joinColumn: { name: 'document_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'plant_id', referencedColumnName: 'id' },
  })
  plants: Plant[];

  @ManyToMany(() => PlantInspection)
  @JoinTable({
    name: 'document_plant_inspections',
    joinColumn: { name: 'document_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'plant_inspection_id', referencedColumnName: 'id' },
  })
  plantInspections: PlantInspection[];

  @ManyToMany(() => UtilizerGrant)
  @JoinTable({
    name: 'document_utilizer_grants',
    joinColumn: { name: 'document_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'utilizer_grant_id', referencedColumnName: 'id' },
  })
  utilizerGrants: UtilizerGrant[];

  @ManyToMany(() => Contract)
  @JoinTable({
    name: 'document_contracts',
    joinColumn: { name: 'document_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'contract_id', referencedColumnName: 'id' },
  })
  contracts: Contract[];

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;
}
```

- [ ] **Step 4: Generare la migration nel container (scratch)**

Le entità sono già nel glob `src/apis/**/*.entity.ts`.

```bash
docker exec -u root utenzepa-api-1 sh -c "node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate -d src/database/data-source.ts /tmp/Documents" 2>&1 | tail -3
docker exec utenzepa-api-1 sh -c "cat /tmp/*-Documents.ts" > "$SCRATCH/generated.ts"
```

Expected: file generato. Tenere in `up`/`down` solo gli statement che citano `document_types`, `documents`, `document_files`, `document_assets`, `document_plants`, `document_plant_inspections`, `document_utilizer_grants`, `document_contracts` (il resto è drift preesistente).

- [ ] **Step 5: Comporre la migration finale nello scratch**

Classe `Documents1794100000000`, `name = 'Documents1794100000000'`; in `up` gli statement filtrati, poi i tipi iniziali; in `down` prima `DELETE FROM document_types` non serve (drop tabelle in ordine inverso, come generato).

```ts
// in coda a up(), dopo la creazione delle tabelle:
const TYPES: [string, string[]][] = [
  ['Atti amministrativi', ['Delibera di Giunta', 'Delibera di Consiglio', 'Determina dirigenziale',
    'Decreto', 'Ordinanza', 'Autorizzazione / nulla osta / parere']],
  ['Atti contrattuali e notarili', ['Atto notarile', 'Contratto', 'Convenzione',
    'Verbale di consegna / riconsegna', 'Registrazione (F23/F24, Agenzia Entrate)', 'Polizza']],
  ['Tecnici e certificazioni', ['Certificato di agibilità', 'CPI / SCIA antincendio',
    'Attestato di prestazione energetica (APE)', 'Dichiarazione di conformità impianti', 'Collaudo',
    'Verbale di verifica', "Libretto d'impianto", 'Elaborato di progetto', 'Perizia / stima']],
  ['Catasto', ['Visura', 'Planimetria', 'Frazionamento / DOCFA / tipo mappale']],
  ['Economici', ['Fattura', 'Preventivo / offerta']],
  ['Corrispondenza e altro', ['Nota / lettera / PEC', 'Altro']],
];
for (const [group, names] of TYPES) {
  for (const [i, name] of names.entries()) {
    await q.query(
      'INSERT INTO `document_types` (`name`, `group_name`, `sort_order`, `created_by_user_id`, `updated_by_user_id`) VALUES (?, ?, ?, 1, 1)',
      [name, group, (i + 1) * 10],
    );
  }
}
```

Usare `q: QueryRunner` come nome del parametro (stile di `1793900000000-UtilityTransferRequired.ts`).

- [ ] **Step 6: Spostare la migration e verificarla**

```bash
mv "$SCRATCH/1794100000000-Documents.ts" backend/src/database/migrations/
```
Poi: riga `Documents1794100000000` presente in `migrations` (altrimenti `docker restart utenzepa-api-1`); `SELECT group_name, COUNT(*) FROM document_types GROUP BY 1` → 6 gruppi, 28 righe; `schema:log` senza statement sulle 8 tabelle; ciclo `migration:revert` → riavvio → riga di nuovo presente e 28 tipi.

- [ ] **Step 7: Commit**

```bash
git add backend/src/apis/document-types/entity/document-type.entity.ts backend/src/apis/documents/entity/document.entity.ts backend/src/apis/documents/entity/document-file.entity.ts backend/src/database/migrations/1794100000000-Documents.ts
git commit -m "feat(documents): entities, migration and initial document types"
```

---

### Task 2: Regole sui file (tipi, contenuto, nome)

**Files:**
- Create: `backend/src/apis/documents/document-file-policy.ts`
- Test: `backend/src/apis/documents/document-file-policy.spec.ts`

**Interfaces:**
- Produces:
  - `ALLOWED_EXTENSIONS: readonly string[]`
  - `extensionOf(name: string): string` (minuscolo, senza punto, `''` se assente)
  - `checkFile(originalName: string, head: Buffer): { ext: string; mime: string }` — lancia `BadRequestException` con messaggio italiano
  - `contentDisposition(originalName: string, inline: boolean): string`
  - `maxSizeBytes(): number` (da `DOCUMENT_MAX_SIZE_MB`, default 50)

- [ ] **Step 1: Test che falliscono**

```ts
// backend/src/apis/documents/document-file-policy.spec.ts
import { BadRequestException } from '@nestjs/common';
import { checkFile, contentDisposition, extensionOf, maxSizeBytes } from './document-file-policy';

const PDF = Buffer.from('%PDF-1.7\n...');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const EXE = Buffer.from('MZ\x90\x00\x03\x00');

describe('extensionOf', () => {
  it('minuscolo, ultima estensione', () => {
    expect(extensionOf('Delibera 12.2024.PDF')).toBe('pdf');
    expect(extensionOf('atto.pdf.p7m')).toBe('p7m');
    expect(extensionOf('senza_estensione')).toBe('');
  });
});

describe('checkFile', () => {
  it('pdf vero: ok con mime dal server', () => {
    expect(checkFile('atto.pdf', PDF)).toEqual({ ext: 'pdf', mime: 'application/pdf' });
  });

  it.each([
    ['planimetria.docx', ZIP, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['tabella.ods', ZIP, 'application/vnd.oasis.opendocument.spreadsheet'],
    ['vecchio.doc', OLE, 'application/msword'],
    ['email.msg', OLE, 'application/vnd.ms-outlook'],
    ['foto.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    ['scan.tif', Buffer.from([0x49, 0x49, 0x2a, 0x00]), 'image/tiff'],
    ['atto.pdf.p7m', Buffer.from([0x30, 0x80, 0x06, 0x09]), 'application/pkcs7-mime'],
    ['atto.p7m', Buffer.from('MIAGCSqGSIb3DQEHAqCAMIA'), 'application/pkcs7-mime'],
    ['elenco.csv', Buffer.from('a;b;c\n1;2;3\n'), 'text/csv'],
    ['messaggio.eml', Buffer.from('From: a@example.invalid\r\nSubject: x\r\n'), 'message/rfc822'],
  ])('%s ammesso', (name, head, mime) => {
    expect(checkFile(name, head).mime).toBe(mime);
  });

  it('estensione non ammessa: 400 con elenco', () => {
    expect(() => checkFile('archivio.zip', ZIP)).toThrow(BadRequestException);
    expect(() => checkFile('setup.exe', EXE)).toThrow('Tipo di file non ammesso (.exe)');
    expect(() => checkFile('senza_estensione', PDF)).toThrow('Tipo di file non ammesso');
  });

  it('contenuto diverso dall’estensione: 400', () => {
    expect(() => checkFile('finto.pdf', EXE)).toThrow(
      'Il contenuto del file non corrisponde al tipo .pdf',
    );
    expect(() => checkFile('finto.pdf', ZIP)).toThrow('non corrisponde al tipo .pdf');
    expect(() => checkFile('finto.txt', Buffer.from([0x4d, 0x5a, 0x00, 0x00]))).toThrow(
      'non corrisponde al tipo .txt',
    );
  });
});

describe('contentDisposition', () => {
  it('nome con accenti e virgolette: fallback ASCII e filename* UTF-8', () => {
    expect(contentDisposition('Verbale "consegna" è.pdf', false)).toBe(
      `attachment; filename="Verbale _consegna_ _.pdf"; filename*=UTF-8''Verbale%20%22consegna%22%20%C3%A8.pdf`,
    );
  });

  it('inline e barre rimosse dal nome', () => {
    expect(contentDisposition('../../etc/passwd.pdf', true)).toMatch(/^inline; filename="passwd.pdf"/);
  });
});

describe('maxSizeBytes', () => {
  const old = process.env.DOCUMENT_MAX_SIZE_MB;
  afterEach(() => {
    if (old === undefined) delete process.env.DOCUMENT_MAX_SIZE_MB;
    else process.env.DOCUMENT_MAX_SIZE_MB = old;
  });

  it('default 50 MB, configurabile', () => {
    delete process.env.DOCUMENT_MAX_SIZE_MB;
    expect(maxSizeBytes()).toBe(50 * 1024 * 1024);
    process.env.DOCUMENT_MAX_SIZE_MB = '5';
    expect(maxSizeBytes()).toBe(5 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/documents/document-file-policy.spec.ts --maxWorkers=2`
Expected: FAIL «Cannot find module './document-file-policy'».

- [ ] **Step 3: Implementazione**

```ts
// backend/src/apis/documents/document-file-policy.ts
import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

// Tipi ammessi per i file dei documenti: estensione + firma del contenuto
// (il MIME del browser non conta, lo decide il server). Niente archivi né
// eseguibili; il p7m (firmato digitalmente) si conserva così com'è.
type Kind = 'pdf' | 'zip' | 'ole' | 'p7m' | 'jpeg' | 'png' | 'tiff' | 'text';

const TYPES: Record<string, { mime: string; kind: Kind }> = {
  pdf: { mime: 'application/pdf', kind: 'pdf' },
  p7m: { mime: 'application/pkcs7-mime', kind: 'p7m' },
  doc: { mime: 'application/msword', kind: 'ole' },
  xls: { mime: 'application/vnd.ms-excel', kind: 'ole' },
  msg: { mime: 'application/vnd.ms-outlook', kind: 'ole' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'zip' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'zip' },
  odt: { mime: 'application/vnd.oasis.opendocument.text', kind: 'zip' },
  ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet', kind: 'zip' },
  csv: { mime: 'text/csv', kind: 'text' },
  txt: { mime: 'text/plain', kind: 'text' },
  eml: { mime: 'message/rfc822', kind: 'text' },
  jpg: { mime: 'image/jpeg', kind: 'jpeg' },
  jpeg: { mime: 'image/jpeg', kind: 'jpeg' },
  png: { mime: 'image/png', kind: 'png' },
  tif: { mime: 'image/tiff', kind: 'tiff' },
  tiff: { mime: 'image/tiff', kind: 'tiff' },
};

export const ALLOWED_EXTENSIONS: readonly string[] = Object.keys(TYPES);

const startsWith = (head: Buffer, bytes: number[]) =>
  head.length >= bytes.length && bytes.every((b, i) => head[i] === b);

function matches(kind: Kind, head: Buffer): boolean {
  switch (kind) {
    case 'pdf':
      return head.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'zip':
      return startsWith(head, [0x50, 0x4b, 0x03, 0x04]);
    case 'ole':
      return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    // DER (SEQUENCE) oppure base64 di un DER.
    case 'p7m':
      return head[0] === 0x30 || head.subarray(0, 2).toString('latin1') === 'MI';
    case 'jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47]);
    case 'tiff':
      return startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a]);
    // Testo: nessun byte NUL nei primi 8 KB.
    case 'text':
      return !head.subarray(0, 8192).includes(0);
  }
}

export function extensionOf(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/'));
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function checkFile(originalName: string, head: Buffer): { ext: string; mime: string } {
  const ext = extensionOf(originalName);
  const type = TYPES[ext];
  if (!type) {
    throw new BadRequestException(
      `Tipo di file non ammesso${ext ? ` (.${ext})` : ''}. Ammessi: ${ALLOWED_EXTENSIONS.join(', ')}.`,
    );
  }
  if (!matches(type.kind, head)) {
    throw new BadRequestException(`Il contenuto del file non corrisponde al tipo .${ext}`);
  }
  return { ext, mime: type.mime };
}

// Nome originale senza percorso; fallback ASCII per i client vecchi e
// filename* (RFC 5987) con il nome vero.
export function contentDisposition(originalName: string, inline: boolean): string {
  const base = path.basename(originalName.replace(/\\/g, '/'));
  const ascii = base.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(base).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function maxSizeBytes(): number {
  const mb = parseInt(process.env.DOCUMENT_MAX_SIZE_MB ?? '50', 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
}
```

- [ ] **Step 4: Verificare che passi**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/documents/document-file-policy.spec.ts --maxWorkers=2`
Expected: PASS. Se il test su `"consegna"` fallisce per il fallback, allineare il test all'output reale solo se il nome resta senza `"` e `\`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/documents/document-file-policy.ts backend/src/apis/documents/document-file-policy.spec.ts
git commit -m "feat(documents): file type, signature and name rules"
```

---

### Task 3: Scadenza del documento

**Files:**
- Create: `backend/src/apis/documents/document-expiry.ts`
- Test: `backend/src/apis/documents/document-expiry.spec.ts`

**Interfaces:**
- Produces: `enum ExpiryStatus { EXPIRED = 'EXPIRED', EXPIRING = 'EXPIRING' }`, `EXPIRING_DAYS = 60`, `expiryStatus(expiresOn: string | null | undefined, today: string): ExpiryStatus | null`, `expiryStatusSql(status: ExpiryStatus, alias = 'd'): string`.

- [ ] **Step 1: Test che falliscono**

```ts
// backend/src/apis/documents/document-expiry.spec.ts
import { EXPIRING_DAYS, ExpiryStatus, expiryStatus, expiryStatusSql } from './document-expiry';

describe('expiryStatus', () => {
  const today = '2026-10-12';
  it.each([
    [null, null],
    [undefined, null],
    ['2026-10-11', ExpiryStatus.EXPIRED],
    ['2026-10-12', ExpiryStatus.EXPIRING],
    ['2026-12-11', ExpiryStatus.EXPIRING],
    ['2026-12-12', null],
  ])('%s → %s', (on, expected) => {
    expect(expiryStatus(on as string | null, today)).toBe(expected);
  });

  it('accetta anche datetime ISO', () => {
    expect(expiryStatus('2026-10-01T00:00:00.000Z', today)).toBe(ExpiryStatus.EXPIRED);
  });
});

describe('expiryStatusSql', () => {
  it('stessa regola in SQL', () => {
    expect(expiryStatusSql(ExpiryStatus.EXPIRED)).toBe('(d.expires_on IS NOT NULL AND d.expires_on < CURDATE())');
    expect(expiryStatusSql(ExpiryStatus.EXPIRING, 'x')).toBe(
      `(x.expires_on IS NOT NULL AND x.expires_on >= CURDATE() AND x.expires_on < DATE_ADD(CURDATE(), INTERVAL ${EXPIRING_DAYS} DAY))`,
    );
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/documents/document-expiry.spec.ts --maxWorkers=2`
Expected: FAIL «Cannot find module».

- [ ] **Step 3: Implementazione**

```ts
// backend/src/apis/documents/document-expiry.ts
// Scadenza di un documento (CPI, agibilità, APE, polizze): scaduto se
// expires_on < oggi, in scadenza se entro EXPIRING_DAYS giorni (oggi
// compreso). expiryStatusSql è la stessa regola in SQL: tenerle allineate.
export enum ExpiryStatus {
  EXPIRED = 'EXPIRED',
  EXPIRING = 'EXPIRING',
}

export const EXPIRING_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const utc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export function expiryStatus(expiresOn: string | null | undefined, today: string): ExpiryStatus | null {
  if (!expiresOn) return null;
  const days = (utc(expiresOn) - utc(today)) / DAY_MS;
  if (days < 0) return ExpiryStatus.EXPIRED;
  if (days < EXPIRING_DAYS) return ExpiryStatus.EXPIRING;
  return null;
}

export function expiryStatusSql(status: ExpiryStatus, alias = 'd'): string {
  const col = `${alias}.expires_on`;
  return status === ExpiryStatus.EXPIRED
    ? `(${col} IS NOT NULL AND ${col} < CURDATE())`
    : `(${col} IS NOT NULL AND ${col} >= CURDATE() AND ${col} < DATE_ADD(CURDATE(), INTERVAL ${EXPIRING_DAYS} DAY))`;
}
```

- [ ] **Step 4: Verificare che passi** — stesso comando, Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/documents/document-expiry.ts backend/src/apis/documents/document-expiry.spec.ts
git commit -m "feat(documents): expiry status and SQL twin"
```

---

### Task 4: API tipi di documento

**Files:**
- Create: `backend/src/apis/document-types/dto/create-document-type.dto.ts`
- Create: `backend/src/apis/document-types/dto/update-document-type.dto.ts`
- Create: `backend/src/apis/document-types/document-types.service.ts`
- Create: `backend/src/apis/document-types/document-types.controller.ts`
- Create: `backend/src/apis/document-types/document-types.module.ts`
- Modify: `backend/src/app.module.ts` (import del modulo, accanto a `ComplexesModule`)
- Test: `backend/src/apis/document-types/document-types.service.spec.ts`

**Interfaces:**
- Consumes: `DocumentType`, `Document` (Task 1), `BaseService` (`@apis/shared/base.service`).
- Produces: `DocumentTypesService.findAll(): Promise<DocumentType[]>`, `create(dto, userId)`, `update(id, dto, userId)`, `remove(id, userId)`; rotte `GET/POST /document-types`, `PATCH/DELETE /document-types/:id`.

- [ ] **Step 1: DTO**

```ts
// create-document-type.dto.ts
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateDocumentTypeDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Il nome è obbligatorio' })
  @MaxLength(150)
  name: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Il gruppo è obbligatorio' })
  @MaxLength(100)
  group_name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}
```

```ts
// update-document-type.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateDocumentTypeDto } from './create-document-type.dto';

export class UpdateDocumentTypeDto extends PartialType(CreateDocumentTypeDto) {}
```

Verificare che `@nestjs/mapped-types` sia già usato nel repo (`grep -rn "mapped-types" backend/src | head -1`); se no, usare `@nestjs/swagger` `PartialType` come negli altri DTO di update.

- [ ] **Step 2: Test che falliscono**

```ts
// document-types.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { DocumentTypesService } from './document-types.service';

const repoMock = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn(async (x) => ({ id: 1, ...x })),
  createQueryBuilder: jest.fn(),
});

describe('DocumentTypesService', () => {
  let repo: ReturnType<typeof repoMock>;
  let docs: { count: jest.Mock };
  let service: DocumentTypesService;

  beforeEach(() => {
    repo = repoMock();
    docs = { count: jest.fn().mockResolvedValue(0) };
    service = new DocumentTypesService(repo as never, docs as never);
  });

  it('elenco ordinato per gruppo, ordine, nome, senza cancellati', async () => {
    repo.find.mockResolvedValue([]);
    await service.findAll();
    expect(repo.find).toHaveBeenCalledWith({
      where: { deleted: false },
      order: { group_name: 'ASC', sort_order: 'ASC', name: 'ASC' },
    });
  });

  it('nome già usato da un tipo non cancellato: 400', async () => {
    repo.findOne.mockResolvedValue({ id: 5, name: 'Visura' });
    await expect(service.create({ name: 'visura', group_name: 'Catasto' }, 1)).rejects.toThrow(
      'Esiste già un tipo di documento «Visura»',
    );
  });

  it('rinomina su sé stesso: ammessa', async () => {
    repo.findOne
      .mockResolvedValueOnce({ id: 5, name: 'Visura' }) // assertNameFree
      .mockResolvedValueOnce({ id: 5, name: 'Visura', deleted: false }); // BaseService.update
    repo.findOne.mockResolvedValue({ id: 5, name: 'Visura catastale' });
    await expect(service.update(5, { name: 'Visura' }, 1)).resolves.toBeDefined();
  });

  it('non eliminabile se usato da documenti', async () => {
    repo.findOne.mockResolvedValue({ id: 5, name: 'Visura', deleted: false });
    docs.count.mockResolvedValue(3);
    await expect(service.remove(5, 1)).rejects.toThrow(BadRequestException);
    await expect(service.remove(5, 1)).rejects.toThrow('usato da 3 documenti');
  });
});
```

- [ ] **Step 3: Verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/document-types --maxWorkers=2`
Expected: FAIL «Cannot find module './document-types.service'».

- [ ] **Step 4: Service, controller, modulo**

```ts
// document-types.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Document } from '@apis/documents/entity/document.entity';
import { DocumentType } from './entity/document-type.entity';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';

@Injectable()
export class DocumentTypesService extends BaseService<
  DocumentType,
  CreateDocumentTypeDto,
  UpdateDocumentTypeDto
> {
  protected readonly entityName = 'document_types';
  protected readonly relations: string[] = [];

  constructor(
    @InjectRepository(DocumentType) protected readonly repo: Repository<DocumentType>,
    @InjectRepository(Document) private readonly documentRepo: Repository<Document>,
  ) {
    super();
  }

  findAll(): Promise<DocumentType[]> {
    return this.repo.find({
      where: { deleted: false },
      order: { group_name: 'ASC', sort_order: 'ASC', name: 'ASC' },
    });
  }

  async create(dto: CreateDocumentTypeDto, userId: number): Promise<DocumentType> {
    await this.assertNameFree(dto.name, null);
    return super.create(dto, userId);
  }

  async update(id: number, dto: UpdateDocumentTypeDto, userId: number): Promise<DocumentType> {
    if (dto.name !== undefined) await this.assertNameFree(dto.name, id);
    return super.update(id, dto, userId);
  }

  async remove(id: number, userId: number): Promise<void> {
    const type = await this.repo.findOne({ where: { id, deleted: false } });
    if (!type) throw new BadRequestException('Tipo di documento non trovato');
    const used = await this.documentRepo.count({ where: { document_type_id: id, deleted: false } });
    if (used > 0) {
      throw new BadRequestException(
        `Il tipo «${type.name}» è usato da ${used} documenti: cambiane il tipo prima di eliminarlo`,
      );
    }
    await this.repo.save({ ...type, deleted: true, updated_by_user_id: userId });
    await this.recordAudit(AuditAction.DELETE, id, userId, []);
  }

  // Confronto senza maiuscole (collation MySQL), solo tra i non cancellati.
  private async assertNameFree(name: string, selfId: number | null): Promise<void> {
    const other = await this.repo.findOne({ where: { name: name.trim(), deleted: false } });
    if (other && other.id !== selfId) {
      throw new BadRequestException(`Esiste già un tipo di documento «${other.name}»`);
    }
  }
}
```

```ts
// document-types.controller.ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { DocumentTypesService } from './document-types.service';
import { DocumentType } from './entity/document-type.entity';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';

@Controller('document-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentTypesController {
  constructor(private readonly service: DocumentTypesService) {}

  @Get()
  list(): Promise<DocumentType[]> {
    return this.service.findAll();
  }

  @Roles('Admin')
  @Post()
  create(@Body() dto: CreateDocumentTypeDto, @CurrentUser() user: ICurrentUser): Promise<DocumentType> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentTypeDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<DocumentType> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
```

```ts
// document-types.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '@apis/documents/entity/document.entity';
import { DocumentType } from './entity/document-type.entity';
import { DocumentTypesService } from './document-types.service';
import { DocumentTypesController } from './document-types.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentType, Document])],
  controllers: [DocumentTypesController],
  providers: [DocumentTypesService],
})
export class DocumentTypesModule {}
```

In `app.module.ts`: `import { DocumentTypesModule } from '@apis/document-types/document-types.module';` e aggiunta all'array `imports` accanto a `ComplexesModule`.

- [ ] **Step 5: Verificare che passi**

Run: `docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/document-types --maxWorkers=2; pnpm run type-check"`
Expected: PASS, type-check senza errori. Se il test di rinomina dipende dall'ordine delle chiamate a `findOne` di `BaseService.update`, semplificarlo mockando `super.update` con `jest.spyOn(Object.getPrototypeOf(DocumentTypesService.prototype), 'update')`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/document-types backend/src/app.module.ts
git commit -m "feat(documents): document types API"
```

---

### Task 5: API documenti (anagrafica e collegamenti)

**Files:**
- Create: `backend/src/apis/documents/dto/create-document.dto.ts`
- Create: `backend/src/apis/documents/dto/update-document.dto.ts`
- Create: `backend/src/apis/documents/dto/search-document.dto.ts`
- Create: `backend/src/apis/documents/dto/document-link.dto.ts`
- Create: `backend/src/apis/documents/document-links.ts`
- Create: `backend/src/apis/documents/documents.service.ts`
- Create: `backend/src/apis/documents/documents.controller.ts`
- Create: `backend/src/apis/documents/documents.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/apis/documents/documents.service.spec.ts`

**Interfaces:**
- Consumes: entità Task 1, `expiryStatus`/`ExpiryStatus` (Task 3), `todayIso()` da `@apis/utilizer-grant/real-estate-contract.calc`.
- Produces:
  - `type LinkEntity = 'asset' | 'plant' | 'plant_inspection' | 'utilizer_grant' | 'contract'`
  - `LINKS: Record<LinkEntity, { relation: keyof Document; idsField: string; label: string }>` in `document-links.ts`
  - `type DocumentRow = Document & { expiry_status: ExpiryStatus | null; file_count: number; link_count: number }`
  - `type EntityDocumentRow = DocumentRow & { via_inspection: { id: number; kind: string } | null }`
  - `DocumentsService.findAll(filters)`, `findOneOrFail(id)`, `create(dto, userId)`, `update(id, dto, userId)`, `remove(id, userId)`, `restore(id, userId)`, `link(id, entity, entityId, userId)`, `unlink(id, entity, entityId, userId)`, `byEntity(entity, entityId)`
  - Rotte: `GET /documents`, `GET /documents/by-entity/:entity/:id`, `GET /documents/:id`, `POST /documents`, `PATCH /documents/:id`, `DELETE /documents/:id`, `POST /documents/:id/restore`, `POST /documents/:id/links`, `DELETE /documents/:id/links` (body `{entity, id}`).

- [ ] **Step 1: Tabella dei collegamenti**

```ts
// backend/src/apis/documents/document-links.ts
// Entità collegabili a un documento: relazione TypeORM, campo degli id nei
// DTO, nome per i messaggi e per l'audit.
export const LINK_ENTITIES = ['asset', 'plant', 'plant_inspection', 'utilizer_grant', 'contract'] as const;
export type LinkEntity = (typeof LINK_ENTITIES)[number];

export const LINKS = {
  asset: { relation: 'assets', idsField: 'asset_ids', label: 'Immobile' },
  plant: { relation: 'plants', idsField: 'plant_ids', label: 'Impianto' },
  plant_inspection: { relation: 'plantInspections', idsField: 'plant_inspection_ids', label: 'Verifica' },
  utilizer_grant: { relation: 'utilizerGrants', idsField: 'utilizer_grant_ids', label: 'Contratto immobiliare' },
  contract: { relation: 'contracts', idsField: 'contract_ids', label: 'Contratto di fornitura' },
} as const satisfies Record<LinkEntity, { relation: string; idsField: string; label: string }>;
```

- [ ] **Step 2: DTO**

```ts
// create-document.dto.ts
import { ArrayUnique, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { DateOnly } from '@common/decorators/date-only.decorator';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() ? value.trim() : null) : value;

export class CreateDocumentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  document_type_id: number;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100)
  number?: string | null;

  @IsOptional() @DateOnly()
  document_date?: string | null;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: "L'oggetto è obbligatorio" })
  @MaxLength(500)
  subject: string;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(255)
  issuer?: string | null;

  @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100)
  protocol_number?: string | null;

  @IsOptional() @DateOnly()
  protocol_date?: string | null;

  @IsOptional() @DateOnly()
  expires_on?: string | null;

  @IsOptional() @Transform(trimOrNull) @IsString()
  notes?: string | null;

  @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true })
  asset_ids?: number[];

  @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true })
  plant_ids?: number[];

  @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true })
  plant_inspection_ids?: number[];

  @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true })
  utilizer_grant_ids?: number[];

  @IsOptional() @IsArray() @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true })
  contract_ids?: number[];
}
```

```ts
// update-document.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateDocumentDto } from './create-document.dto';

// Collegamenti: campo assente = invariati, presente = sostituiti.
export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}
```

```ts
// search-document.dto.ts
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ExpiryStatus } from '../document-expiry';

const bool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class SearchDocumentDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  document_type_id?: number;

  @IsOptional() @IsString()
  group_name?: string;

  @IsOptional() @Type(() => Number) @IsInt()
  year?: number;

  @IsOptional() @IsEnum(ExpiryStatus)
  expiry_status?: ExpiryStatus;

  @IsOptional() @Transform(bool)
  without_files?: boolean;

  // Collegato a: 'asset' | 'plant' | 'utilizer_grant' | 'contract' | 'none'.
  @IsOptional() @IsIn(['asset', 'plant', 'utilizer_grant', 'contract', 'none'])
  linked_to?: string;

  @IsOptional() @Transform(bool)
  deleted?: boolean;
}
```

```ts
// document-link.dto.ts
import { IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { LINK_ENTITIES, LinkEntity } from '../document-links';

export class DocumentLinkDto {
  @IsIn(LINK_ENTITIES as unknown as string[])
  entity: LinkEntity;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id: number;
}
```

- [ ] **Step 3: Test che falliscono**

```ts
// documents.service.spec.ts
import { DocumentsService } from './documents.service';

const repo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  count: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn(async (x) => ({ id: 10, ...x })),
  createQueryBuilder: jest.fn(),
});

const doc = (extra = {}) => ({
  id: 10,
  document_type_id: 1,
  subject: 'Delibera di acquisizione',
  expires_on: null,
  deleted: false,
  files: [],
  assets: [],
  plants: [],
  plantInspections: [],
  utilizerGrants: [],
  contracts: [],
  ...extra,
});

describe('DocumentsService', () => {
  let docs: ReturnType<typeof repo>;
  let types: ReturnType<typeof repo>;
  let targets: Record<string, ReturnType<typeof repo>>;
  let service: DocumentsService;

  beforeEach(() => {
    docs = repo();
    types = repo();
    targets = {
      asset: repo(), plant: repo(), plant_inspection: repo(), utilizer_grant: repo(), contract: repo(),
    };
    service = new DocumentsService(
      docs as never, types as never,
      targets.asset as never, targets.plant as never, targets.plant_inspection as never,
      targets.utilizer_grant as never, targets.contract as never,
    );
    jest.spyOn(service as never, 'today' as never).mockReturnValue('2026-10-12' as never);
    types.findOne.mockResolvedValue({ id: 1, name: 'Delibera di Giunta', deleted: false });
  });

  it('create: tipo inesistente → 400', async () => {
    types.findOne.mockResolvedValue(null);
    await expect(service.create({ document_type_id: 99, subject: 'x' }, 1)).rejects.toThrow(
      'Tipo di documento non trovato',
    );
  });

  it('create: oggetto solo spazi → 400', async () => {
    await expect(service.create({ document_type_id: 1, subject: '   ' }, 1)).rejects.toThrow(
      "L'oggetto è obbligatorio",
    );
  });

  it('create con collegamenti: immobile inesistente o cancellato → 400', async () => {
    targets.asset.count.mockResolvedValue(1);
    await expect(
      service.create({ document_type_id: 1, subject: 'x', asset_ids: [3, 4] }, 1),
    ).rejects.toThrow('Immobile non trovato');
    expect(targets.asset.count).toHaveBeenCalledWith({ where: expect.objectContaining({ deleted: false }) });
  });

  it('create con collegamenti validi: salvati come relazioni', async () => {
    targets.asset.count.mockResolvedValue(2);
    docs.findOne.mockResolvedValue(doc());
    await service.create({ document_type_id: 1, subject: 'x', asset_ids: [3, 4] }, 1);
    const saved = docs.save.mock.calls[0][0];
    expect(saved.assets).toEqual([{ id: 3 }, { id: 4 }]);
    expect(saved.plants).toBeUndefined();
  });

  it('update senza collegamenti: relazioni non toccate', async () => {
    docs.findOne.mockResolvedValue(doc({ assets: [{ id: 3 }] }));
    await service.update(10, { subject: 'Nuovo oggetto' }, 1);
    const saved = docs.save.mock.calls[0][0];
    expect(saved.assets).toBeUndefined();
  });

  it('link: già collegato → nessun salvataggio; unlink di un non collegato → nessun salvataggio', async () => {
    docs.findOne.mockResolvedValue(doc({ assets: [{ id: 3, deleted: false }] }));
    targets.asset.count.mockResolvedValue(1);
    await service.link(10, 'asset', 3, 1);
    await service.unlink(10, 'asset', 4, 1);
    expect(docs.save).not.toHaveBeenCalled();
  });

  it('link su documento cancellato → 400', async () => {
    docs.findOne.mockResolvedValue(null);
    await expect(service.link(10, 'asset', 3, 1)).rejects.toThrow('Documento non trovato');
  });

  it('byEntity(plant): documenti dell’impianto e delle sue verifiche, senza cancellati', async () => {
    docs.find
      .mockResolvedValueOnce([doc({ id: 1 })])
      .mockResolvedValueOnce([
        doc({ id: 2, plantInspections: [{ id: 7, kind: 'Verifica biennale', plant_id: 5, deleted: false }] }),
        doc({ id: 1, plantInspections: [] }),
      ]);
    const rows = await service.byEntity('plant', 5);
    expect(rows.map((r) => [r.id, r.via_inspection])).toEqual([
      [1, null],
      [2, { id: 7, kind: 'Verifica biennale' }],
    ]);
    expect(docs.find.mock.calls[0][0].where).toEqual({ deleted: false, plants: { id: 5 } });
    expect(docs.find.mock.calls[1][0].where).toEqual({
      deleted: false,
      plantInspections: { plant_id: 5, deleted: false },
    });
  });

  it('findAll: conteggi, scadenza e filtri lato server', async () => {
    docs.find.mockResolvedValue([
      doc({ id: 1, expires_on: '2026-10-01', files: [{ id: 1, deleted: false }, { id: 2, deleted: true }], assets: [{ id: 3, deleted: false }] }),
      doc({ id: 2, expires_on: null }),
    ]);
    const all = await service.findAll({});
    expect(all.map((d) => [d.id, d.file_count, d.link_count, d.expiry_status])).toEqual([
      [1, 1, 1, 'EXPIRED'],
      [2, 0, 0, null],
    ]);
    expect((await service.findAll({ without_files: true })).map((d) => d.id)).toEqual([2]);
    expect((await service.findAll({ linked_to: 'none' })).map((d) => d.id)).toEqual([2]);
    expect((await service.findAll({ expiry_status: 'EXPIRED' as never })).map((d) => d.id)).toEqual([1]);
  });
});
```

- [ ] **Step 4: Verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/documents/documents.service.spec.ts --maxWorkers=2`
Expected: FAIL «Cannot find module './documents.service'».

- [ ] **Step 5: Service**

```ts
// backend/src/apis/documents/documents.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { DocumentType } from '@apis/document-types/entity/document-type.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { PlantInspection } from '@apis/plants/entity/plant-inspection.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { todayIso } from '@apis/utilizer-grant/real-estate-contract.calc';
import { Document } from './entity/document.entity';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { SearchDocumentDto } from './dto/search-document.dto';
import { ExpiryStatus, expiryStatus } from './document-expiry';
import { LINK_ENTITIES, LINKS, LinkEntity } from './document-links';

export type DocumentRow = Document & {
  expiry_status: ExpiryStatus | null;
  file_count: number;
  link_count: number;
};
export type EntityDocumentRow = DocumentRow & { via_inspection: { id: number; kind: string } | null };

const RELATIONS = {
  documentType: true,
  files: true,
  assets: true,
  plants: true,
  plantInspections: true,
  utilizerGrants: true,
  contracts: true,
} as const;

const alive = <T extends { deleted?: boolean | number }>(xs: T[] | undefined): T[] =>
  (xs ?? []).filter((x) => !x.deleted);

@Injectable()
export class DocumentsService extends BaseService<Document, CreateDocumentDto, UpdateDocumentDto> {
  protected readonly entityName = 'documents';
  protected readonly relations = ['documentType', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(Document) protected readonly repo: Repository<Document>,
    @InjectRepository(DocumentType) private readonly typeRepo: Repository<DocumentType>,
    @InjectRepository(Asset) private readonly assetRepo: Repository<Asset>,
    @InjectRepository(Plant) private readonly plantRepo: Repository<Plant>,
    @InjectRepository(PlantInspection) private readonly inspectionRepo: Repository<PlantInspection>,
    @InjectRepository(UtilizerGrant) private readonly grantRepo: Repository<UtilizerGrant>,
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
  ) {
    super();
  }

  protected today(): string {
    return todayIso();
  }

  private targetRepo(entity: LinkEntity): Repository<{ id: number; deleted: boolean }> {
    const repos = {
      asset: this.assetRepo,
      plant: this.plantRepo,
      plant_inspection: this.inspectionRepo,
      utilizer_grant: this.grantRepo,
      contract: this.contractRepo,
    };
    return repos[entity] as unknown as Repository<{ id: number; deleted: boolean }>;
  }

  // Collegamenti e file senza i cancellati; conteggi e stato di scadenza.
  private toRow(d: Document): DocumentRow {
    const today = this.today();
    const cleaned = { ...d } as Document;
    for (const e of LINK_ENTITIES) {
      const rel = LINKS[e].relation as keyof Document;
      (cleaned as Record<string, unknown>)[rel] = alive((d as never)[rel]);
    }
    cleaned.files = alive(d.files);
    const linkCount = LINK_ENTITIES.reduce(
      (n, e) => n + ((cleaned as never)[LINKS[e].relation] as unknown[]).length,
      0,
    );
    return {
      ...cleaned,
      expiry_status: expiryStatus(d.expires_on, today),
      file_count: cleaned.files.length,
      link_count: linkCount,
    };
  }

  async findAll(filters: SearchDocumentDto = {}): Promise<DocumentRow[]> {
    const rows = (
      await this.repo.find({
        where: { deleted: !!filters.deleted },
        relations: RELATIONS,
        order: { document_date: 'DESC', id: 'DESC' },
      })
    ).map((d) => this.toRow(d));
    return rows.filter((d) => {
      if (filters.document_type_id && d.document_type_id !== filters.document_type_id) return false;
      if (filters.group_name && d.documentType?.group_name !== filters.group_name) return false;
      if (filters.year && (d.document_date ?? '').slice(0, 4) !== String(filters.year)) return false;
      if (filters.expiry_status && d.expiry_status !== filters.expiry_status) return false;
      if (filters.without_files && d.file_count > 0) return false;
      if (filters.linked_to === 'none' && d.link_count > 0) return false;
      if (filters.linked_to && filters.linked_to !== 'none') {
        const rel = LINKS[filters.linked_to as LinkEntity].relation;
        if (!((d as never)[rel] as unknown[]).length) return false;
      }
      return true;
    });
  }

  async findOneOrFail(id: number): Promise<DocumentRow> {
    const d = await this.repo.findOne({
      where: { id, deleted: false },
      relations: {
        ...RELATIONS,
        files: { created_by: true },
        plantInspections: { plant: true },
        contracts: { supplier: true },
        utilizerGrants: { parties: true },
        created_by: true,
        updated_by: true,
      },
    });
    if (!d) throw new BadRequestException('Documento non trovato');
    return this.toRow(d);
  }

  async byEntity(entity: LinkEntity, entityId: number): Promise<EntityDocumentRow[]> {
    const rel = LINKS[entity].relation;
    const direct = (
      await this.repo.find({
        where: { deleted: false, [rel]: { id: entityId } },
        relations: RELATIONS,
        order: { document_date: 'DESC', id: 'DESC' },
      })
    ).map((d) => ({ ...this.toRow(d), via_inspection: null }));
    if (entity !== 'plant') return direct;
    const seen = new Set(direct.map((d) => d.id));
    const viaInspection = (
      await this.repo.find({
        where: { deleted: false, plantInspections: { plant_id: entityId, deleted: false } },
        relations: RELATIONS,
        order: { document_date: 'DESC', id: 'DESC' },
      })
    )
      .filter((d) => !seen.has(d.id))
      .map((d) => {
        const insp = alive(d.plantInspections).find((i) => i.plant_id === entityId);
        return { ...this.toRow(d), via_inspection: insp ? { id: insp.id, kind: insp.kind } : null };
      });
    return [...direct, ...viaInspection];
  }

  async create(dto: CreateDocumentDto, userId: number): Promise<DocumentRow> {
    await this.assertType(dto.document_type_id);
    const subject = this.assertSubject(dto.subject);
    const links = await this.resolveLinks(dto);
    const { asset_ids, plant_ids, plant_inspection_ids, utilizer_grant_ids, contract_ids, ...rest } = dto;
    void asset_ids; void plant_ids; void plant_inspection_ids; void utilizer_grant_ids; void contract_ids;
    const saved = await this.repo.save(
      this.repo.create({
        ...rest,
        subject,
        ...links,
        created_by_user_id: userId,
        updated_by_user_id: userId,
      } as never),
    );
    const id = (saved as unknown as Document).id;
    await this.recordAudit(AuditAction.CREATE, id, userId, this.linkAudit({}, links));
    return this.findOneOrFail(id);
  }

  async update(id: number, dto: UpdateDocumentDto, userId: number): Promise<DocumentRow> {
    const current = await this.repo.findOne({ where: { id, deleted: false }, relations: RELATIONS });
    if (!current) throw new BadRequestException('Documento non trovato');
    if (dto.document_type_id !== undefined) await this.assertType(dto.document_type_id);
    if (dto.subject !== undefined) dto.subject = this.assertSubject(dto.subject);
    const links = await this.resolveLinks(dto);
    const { asset_ids, plant_ids, plant_inspection_ids, utilizer_grant_ids, contract_ids, ...rest } = dto;
    void asset_ids; void plant_ids; void plant_inspection_ids; void utilizer_grant_ids; void contract_ids;
    await super.update(id, rest as UpdateDocumentDto, userId);
    if (Object.keys(links).length) {
      await this.repo.save({ id, ...links, updated_by_user_id: userId } as never);
      const changes = this.linkAudit(current, links);
      if (changes.length) await this.recordAudit(AuditAction.UPDATE, id, userId, changes);
    }
    return this.findOneOrFail(id);
  }

  async remove(id: number, userId: number): Promise<void> {
    const d = await this.repo.findOne({ where: { id, deleted: false } });
    if (!d) throw new BadRequestException('Documento non trovato');
    await this.repo.save({ id, deleted: true, updated_by_user_id: userId } as never);
    await this.recordAudit(AuditAction.DELETE, id, userId, []);
  }

  async restore(id: number, userId: number): Promise<DocumentRow> {
    const d = await this.repo.findOne({ where: { id, deleted: true } });
    if (!d) throw new BadRequestException('Documento non trovato tra gli eliminati');
    await this.repo.save({ id, deleted: false, updated_by_user_id: userId } as never);
    await this.recordAudit(AuditAction.UPDATE, id, userId, [
      { fieldName: 'deleted', oldValue: true, newValue: false },
    ]);
    return this.findOneOrFail(id);
  }

  async link(id: number, entity: LinkEntity, entityId: number, userId: number): Promise<void> {
    await this.changeLink(id, entity, entityId, userId, true);
  }

  async unlink(id: number, entity: LinkEntity, entityId: number, userId: number): Promise<void> {
    await this.changeLink(id, entity, entityId, userId, false);
  }

  private async changeLink(
    id: number,
    entity: LinkEntity,
    entityId: number,
    userId: number,
    add: boolean,
  ): Promise<void> {
    const d = await this.repo.findOne({ where: { id, deleted: false }, relations: RELATIONS });
    if (!d) throw new BadRequestException('Documento non trovato');
    const rel = LINKS[entity].relation;
    const before = ((d as never)[rel] as { id: number }[]).map((x) => x.id);
    const has = before.includes(entityId);
    if (add === has) return;
    if (add) await this.assertTargets(entity, [entityId]);
    const after = add ? [...before, entityId] : before.filter((x) => x !== entityId);
    await this.repo.save({ id, [rel]: after.map((x) => ({ id: x })), updated_by_user_id: userId } as never);
    await this.recordAudit(AuditAction.UPDATE, id, userId, [
      { fieldName: LINKS[entity].idsField, oldValue: this.sorted(before), newValue: this.sorted(after) },
    ]);
  }

  private sorted(ids: number[]): string {
    return [...ids].sort((a, b) => a - b).join(',');
  }

  private async assertType(typeId: number): Promise<void> {
    const t = await this.typeRepo.findOne({ where: { id: typeId, deleted: false } });
    if (!t) throw new BadRequestException('Tipo di documento non trovato');
  }

  private assertSubject(subject: string | undefined): string {
    const s = (subject ?? '').trim();
    if (!s) throw new BadRequestException("L'oggetto è obbligatorio");
    return s;
  }

  private async assertTargets(entity: LinkEntity, ids: number[]): Promise<void> {
    if (!ids.length) return;
    const unique = [...new Set(ids)];
    const found = await this.targetRepo(entity).count({ where: { id: In(unique), deleted: false } });
    if (found !== unique.length) throw new BadRequestException(`${LINKS[entity].label} non trovato`);
  }

  // Solo i campi *_ids presenti nel DTO diventano relazioni da salvare.
  private async resolveLinks(dto: Partial<CreateDocumentDto>): Promise<Record<string, { id: number }[]>> {
    const out: Record<string, { id: number }[]> = {};
    for (const e of LINK_ENTITIES) {
      const ids = (dto as Record<string, unknown>)[LINKS[e].idsField] as number[] | undefined;
      if (ids === undefined) continue;
      await this.assertTargets(e, ids);
      out[LINKS[e].relation] = [...new Set(ids)].map((id) => ({ id }));
    }
    return out;
  }

  private linkAudit(current: Partial<Document>, links: Record<string, { id: number }[]>) {
    const changes: { fieldName: string; oldValue: unknown; newValue: unknown }[] = [];
    for (const e of LINK_ENTITIES) {
      const rel = LINKS[e].relation;
      if (!(rel in links)) continue;
      const before = this.sorted((((current as never)[rel] as { id: number }[]) ?? []).map((x) => x.id));
      const after = this.sorted(links[rel].map((x) => x.id));
      if (before !== after) changes.push({ fieldName: LINKS[e].idsField, oldValue: before, newValue: after });
    }
    return changes;
  }
}
```

- [ ] **Step 6: Controller e modulo**

```ts
// documents.controller.ts (parte anagrafica; i file arrivano nel Task 6)
import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { DocumentRow, DocumentsService, EntityDocumentRow } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { SearchDocumentDto } from './dto/search-document.dto';
import { DocumentLinkDto } from './dto/document-link.dto';
import { LINK_ENTITIES, LinkEntity } from './document-links';
import { BadRequestException } from '@nestjs/common';

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  list(@Query() filters: SearchDocumentDto): Promise<DocumentRow[]> {
    return this.service.findAll(filters);
  }

  @Get('by-entity/:entity/:id')
  byEntity(
    @Param('entity') entity: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EntityDocumentRow[]> {
    if (!(LINK_ENTITIES as readonly string[]).includes(entity)) {
      throw new BadRequestException('Entità non valida');
    }
    return this.service.byEntity(entity as LinkEntity, id);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<DocumentRow> {
    return this.service.findOneOrFail(id);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: ICurrentUser): Promise<DocumentRow> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<DocumentRow> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Post(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<DocumentRow> {
    return this.service.restore(id, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Post(':id/links')
  link(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DocumentLinkDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<void> {
    return this.service.link(id, dto.entity, dto.id, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id/links')
  unlink(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DocumentLinkDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<void> {
    return this.service.unlink(id, dto.entity, dto.id, user.id);
  }
}
```

Spostare l'import di `BadRequestException` nel primo import da `@nestjs/common`.

```ts
// documents.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentType } from '@apis/document-types/entity/document-type.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { PlantInspection } from '@apis/plants/entity/plant-inspection.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { Document } from './entity/document.entity';
import { DocumentFile } from './entity/document-file.entity';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Document, DocumentFile, DocumentType, Asset, Plant, PlantInspection, UtilizerGrant, Contract,
    ]),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
```

In `app.module.ts`: `DocumentsModule` negli `imports`.

- [ ] **Step 7: Verificare che passi**

Run: `docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/documents --maxWorkers=2; pnpm run type-check"`
Expected: PASS. Nel test `create con collegamenti validi`, `docs.findOne` serve a `findOneOrFail`; se il ritorno di `save` non ha `id`, il mock lo aggiunge (`{ id: 10, ...x }`).

- [ ] **Step 8: Prova via API (utente temporaneo, vedi `docs/claude/testing-e2e.md`)**

```bash
# token con utente temporaneo Admin (creato e poi eliminato insieme ai suoi audit_logs)
curl -s -X POST localhost:3010/api/v1/documents -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"document_type_id":1,"subject":"Prova","asset_ids":[<id immobile>]}'
curl -s localhost:3010/api/v1/documents/by-entity/asset/<id immobile> -H "Authorization: Bearer $T"
```
Expected: 201 con `link_count: 1`; by-entity con il documento. Poi `DELETE` del documento di prova e verifica che sparisca da by-entity. Ripulire: `DELETE FROM documents WHERE subject='Prova'` (cascade sui collegamenti) prima di eliminare l'utente.

- [ ] **Step 9: Commit**

```bash
git add backend/src/apis/documents/document-links.ts backend/src/apis/documents/documents.service.ts backend/src/apis/documents/documents.service.spec.ts backend/src/apis/documents/documents.controller.ts backend/src/apis/documents/documents.module.ts backend/src/apis/documents/dto backend/src/app.module.ts
git commit -m "feat(documents): documents API with links to assets, plants, inspections and contracts"
```

---

### Task 6: File dei documenti (upload a pezzi, download riservato)

**Files:**
- Create: `backend/src/apis/documents/document-files.service.ts`
- Create: `backend/src/apis/documents/dto/document-file-finalize.dto.ts`
- Create: `backend/src/apis/documents/dto/update-document-file.dto.ts`
- Modify: `backend/src/apis/documents/documents.controller.ts`
- Modify: `backend/src/apis/documents/documents.module.ts` (provider `DocumentFilesService`, import `ChunkedUploadModule`)
- Modify: `docker-compose.yml`, `docker-compose.override.yml`, `.env.example`
- Test: `backend/src/apis/documents/document-files.service.spec.ts`

**Interfaces:**
- Consumes: `checkFile`, `contentDisposition`, `maxSizeBytes` (Task 2); `ChunkedUploadService` (`@common/chunked-upload/chunked-upload.service`); `DocumentFile`, `Document` (Task 1).
- Produces:
  - `DocumentFilesService.documentsDir: string`, `saveChunk(dto: UploadChunkDto, buffer: Buffer): void`, `finalize(documentId: number, dto: DocumentFileFinalizeDto, userId: number): Promise<DocumentFile>`, `open(fileId: number): Promise<{ file: DocumentFile; absolutePath: string }>`, `update(fileId, dto, userId)`, `remove(fileId, userId)`
  - Rotte: `POST /documents/:id/files/chunk`, `POST /documents/:id/files/finalize`, `GET /documents/files/:fileId` (`?inline=1`), `PATCH /documents/files/:fileId`, `DELETE /documents/files/:fileId`

- [ ] **Step 1: DTO**

```ts
// document-file-finalize.dto.ts
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class DocumentFileFinalizeDto {
  @IsNotEmpty() @IsString()
  uploadId: string;

  @Type(() => Number) @IsInt() @Min(1)
  totalChunks: number;

  @IsNotEmpty({ message: 'Nome del file mancante' }) @IsString() @MaxLength(255)
  originalFilename: string;

  @IsOptional() @IsString() @MaxLength(255)
  description?: string | null;
}
```

```ts
// update-document-file.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDocumentFileDto {
  @IsOptional() @IsString() @MaxLength(255)
  description?: string | null;
}
```

- [ ] **Step 2: Test che falliscono**

```ts
// document-files.service.spec.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DocumentFilesService } from './document-files.service';
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';

describe('DocumentFilesService', () => {
  let dir: string;
  let files: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let docs: { findOne: jest.Mock };
  let audit: { record: jest.Mock };
  let service: DocumentFilesService;

  const upload = (id: string, content: Buffer) => {
    service.saveChunk({ uploadId: id, chunkIndex: 0, totalChunks: 1 }, content);
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'documents-'));
    process.env.DOCUMENTS_DIR = dir;
    files = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 7, ...x })),
    };
    docs = { findOne: jest.fn().mockResolvedValue({ id: 3, deleted: false }) };
    audit = { record: jest.fn() };
    service = new DocumentFilesService(files as never, docs as never, new ChunkedUploadService(), audit as never);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.DOCUMENTS_DIR;
  });

  it('finalize: pdf salvato sotto <dir>/<documento>/ con nome generato', async () => {
    upload('u1', Buffer.from('%PDF-1.7 contenuto'));
    const f = await service.finalize(3, { uploadId: 'u1', totalChunks: 1, originalFilename: '../../evil.pdf' }, 1);
    expect(f.original_name).toBe('evil.pdf');
    expect(f.mime_type).toBe('application/pdf');
    expect(f.stored_name).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(fs.existsSync(path.join(dir, '3', f.stored_name))).toBe(true);
    expect(fs.readdirSync(path.join(dir, 'tmp'))).toEqual([]);
  });

  it('finalize: contenuto non valido → 400 e nessun file rimasto', async () => {
    upload('u2', Buffer.from('MZ eseguibile'));
    await expect(
      service.finalize(3, { uploadId: 'u2', totalChunks: 1, originalFilename: 'atto.pdf' }, 1),
    ).rejects.toThrow('non corrisponde al tipo .pdf');
    expect(fs.existsSync(path.join(dir, '3'))).toBe(false);
    expect(fs.readdirSync(path.join(dir, 'tmp'))).toEqual([]);
  });

  it('finalize su documento cancellato → 400', async () => {
    docs.findOne.mockResolvedValue(null);
    upload('u3', Buffer.from('%PDF-1.7'));
    await expect(
      service.finalize(3, { uploadId: 'u3', totalChunks: 1, originalFilename: 'a.pdf' }, 1),
    ).rejects.toThrow('Documento non trovato');
  });

  it('chunk oltre la dimensione massima → 400', () => {
    process.env.DOCUMENT_MAX_SIZE_MB = '1';
    expect(() => upload('u4', Buffer.alloc(1024 * 1024 + 1))).toThrow('File troppo grande (massimo 1 MB)');
    delete process.env.DOCUMENT_MAX_SIZE_MB;
  });

  it('open: file cancellato o di documento cancellato → 400', async () => {
    files.findOne.mockResolvedValue(null);
    await expect(service.open(9)).rejects.toThrow('File non trovato');
  });

  it('open: file mancante su disco → 400 leggibile', async () => {
    files.findOne.mockResolvedValue({ id: 9, document_id: 3, stored_name: 'x.pdf', deleted: false, document: { deleted: false } });
    await expect(service.open(9)).rejects.toThrow('File non disponibile sul server');
  });
});
```

- [ ] **Step 3: Verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/documents/document-files.service.spec.ts --maxWorkers=2`
Expected: FAIL «Cannot find module './document-files.service'».

- [ ] **Step 4: Service**

```ts
// backend/src/apis/documents/document-files.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';
import { UploadChunkDto } from '@common/chunked-upload/dto/upload-chunk.dto';
import { AuditLogService } from '@apis/audit-log/audit-log.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Document } from './entity/document.entity';
import { DocumentFile } from './entity/document-file.entity';
import { DocumentFileFinalizeDto } from './dto/document-file-finalize.dto';
import { UpdateDocumentFileDto } from './dto/update-document-file.dto';
import { checkFile, maxSizeBytes } from './document-file-policy';

const HEAD_BYTES = 8192;

// File dei documenti su disco: <DOCUMENTS_DIR>/<document_id>/<uuid>.<ext>,
// pezzi temporanei in <DOCUMENTS_DIR>/tmp. Nessun input dell'utente nei path.
@Injectable()
export class DocumentFilesService {
  constructor(
    @InjectRepository(DocumentFile) private readonly repo: Repository<DocumentFile>,
    @InjectRepository(Document) private readonly documentRepo: Repository<Document>,
    private readonly chunkedUpload: ChunkedUploadService,
    private readonly auditLog: AuditLogService,
  ) {}

  get documentsDir(): string {
    return process.env.DOCUMENTS_DIR ?? path.join(process.cwd(), 'documents');
  }

  private get tmpDir(): string {
    return path.join(this.documentsDir, 'tmp');
  }

  saveChunk(dto: UploadChunkDto, buffer: Buffer): void {
    const max = maxSizeBytes();
    try {
      this.chunkedUpload.saveChunk(dto.uploadId, dto.chunkIndex, dto.totalChunks, buffer, this.tmpDir, max);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('supera il limite')) {
        throw new BadRequestException(`File troppo grande (massimo ${Math.round(max / 1024 / 1024)} MB)`);
      }
      throw new BadRequestException(msg);
    }
  }

  async finalize(documentId: number, dto: DocumentFileFinalizeDto, userId: number): Promise<DocumentFile> {
    let assembled: string;
    try {
      assembled = this.chunkedUpload.assemble(dto.uploadId, dto.totalChunks, this.tmpDir, `${dto.uploadId}.upload`);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    try {
      const doc = await this.documentRepo.findOne({ where: { id: documentId, deleted: false } });
      if (!doc) throw new BadRequestException('Documento non trovato');
      const originalName = path.basename(dto.originalFilename.replace(/\\/g, '/'));
      const fd = fs.openSync(assembled, 'r');
      const head = Buffer.alloc(HEAD_BYTES);
      const read = fs.readSync(fd, head, 0, HEAD_BYTES, 0);
      fs.closeSync(fd);
      const { ext, mime } = checkFile(originalName, head.subarray(0, read));
      const size = fs.statSync(assembled).size;
      const storedName = `${randomUUID()}.${ext}`;
      const targetDir = path.join(this.documentsDir, String(documentId));
      fs.mkdirSync(targetDir, { recursive: true });
      fs.renameSync(assembled, path.join(targetDir, storedName));
      const saved = await this.repo.save(
        this.repo.create({
          document_id: documentId,
          original_name: originalName,
          stored_name: storedName,
          mime_type: mime,
          size_bytes: size,
          description: dto.description?.trim() || null,
          created_by_user_id: userId,
          updated_by_user_id: userId,
        }),
      );
      await this.audit(documentId, userId, 'file_added', null, originalName);
      return saved;
    } finally {
      if (fs.existsSync(assembled)) fs.unlinkSync(assembled);
    }
  }

  async open(fileId: number): Promise<{ file: DocumentFile; absolutePath: string }> {
    const file = await this.repo.findOne({
      where: { id: fileId, deleted: false, document: { deleted: false } },
      relations: { document: true },
    });
    if (!file) throw new BadRequestException('File non trovato');
    const absolutePath = path.join(this.documentsDir, String(file.document_id), path.basename(file.stored_name));
    if (!fs.existsSync(absolutePath)) throw new BadRequestException('File non disponibile sul server');
    return { file, absolutePath };
  }

  async update(fileId: number, dto: UpdateDocumentFileDto, userId: number): Promise<DocumentFile> {
    const file = await this.repo.findOne({ where: { id: fileId, deleted: false } });
    if (!file) throw new BadRequestException('File non trovato');
    const description = dto.description?.trim() || null;
    if (description !== file.description) {
      await this.audit(file.document_id, userId, 'file_description', file.description, description);
    }
    return this.repo.save({ ...file, description, updated_by_user_id: userId });
  }

  async remove(fileId: number, userId: number): Promise<void> {
    const file = await this.repo.findOne({ where: { id: fileId, deleted: false } });
    if (!file) throw new BadRequestException('File non trovato');
    await this.repo.save({ ...file, deleted: true, updated_by_user_id: userId });
    await this.audit(file.document_id, userId, 'file_removed', file.original_name, null);
  }

  // Audit sul documento (best-effort).
  private async audit(documentId: number, userId: number, field: string, oldValue: unknown, newValue: unknown) {
    try {
      await this.auditLog.record({
        entityName: 'documents',
        entityId: documentId,
        action: AuditAction.UPDATE,
        userId,
        fields: [{ fieldName: field, oldValue, newValue }],
      });
    } catch (error) {
      console.error(`[DocumentFilesService] Errore audit documento ${documentId}`, error);
    }
  }
}
```

Verificare con `grep -n "record(" backend/src/apis/audit-log/audit-log.service.ts` la firma di `record` (stessa usata in `ComplexesService.auditOn`) e che `AuditLogModule` esporti `AuditLogService` (se non è globale, importarlo in `DocumentsModule`). Verificare il nome del modulo dei chunk: `grep -n "export class" backend/src/common/chunked-upload/chunked-upload.module.ts`.

- [ ] **Step 5: Rotte dei file nel controller**

```ts
// in documents.controller.ts: import aggiuntivi
import { Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs';
import { UploadChunkDto } from '@common/chunked-upload/dto/upload-chunk.dto';
import { DocumentFilesService } from './document-files.service';
import { DocumentFileFinalizeDto } from './dto/document-file-finalize.dto';
import { UpdateDocumentFileDto } from './dto/update-document-file.dto';
import { DocumentFile } from './entity/document-file.entity';
import { contentDisposition } from './document-file-policy';

// costruttore:
constructor(
  private readonly service: DocumentsService,
  private readonly files: DocumentFilesService,
) {}

// Le rotte 'files/:fileId' vanno PRIMA di ':id' (stesso segmento).
@Roles('Admin', 'Operatore')
@Get('files/:fileId')
async download(
  @Param('fileId', ParseIntPipe) fileId: number,
  @Query('inline') inline: string | undefined,
  @Res({ passthrough: true }) res: Response,
): Promise<StreamableFile> {
  const { file, absolutePath } = await this.files.open(fileId);
  const preview = inline === '1' && (file.mime_type === 'application/pdf' || file.mime_type.startsWith('image/'));
  res.set({
    'Content-Type': file.mime_type,
    'Content-Disposition': contentDisposition(file.original_name, preview),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  return new StreamableFile(fs.createReadStream(absolutePath));
}

@Roles('Admin', 'Operatore')
@Patch('files/:fileId')
updateFile(
  @Param('fileId', ParseIntPipe) fileId: number,
  @Body() dto: UpdateDocumentFileDto,
  @CurrentUser() user: ICurrentUser,
): Promise<DocumentFile> {
  return this.files.update(fileId, dto, user.id);
}

@Roles('Admin', 'Operatore')
@Delete('files/:fileId')
removeFile(@Param('fileId', ParseIntPipe) fileId: number, @CurrentUser() user: ICurrentUser): Promise<void> {
  return this.files.remove(fileId, user.id);
}

@Roles('Admin', 'Operatore')
@Post(':id/files/chunk')
@UseInterceptors(FileInterceptor('chunk'))
uploadChunk(@UploadedFile() chunk: Express.Multer.File, @Body() dto: UploadChunkDto): { received: boolean } {
  if (!chunk) throw new BadRequestException('Parte del file mancante');
  this.files.saveChunk(dto, chunk.buffer);
  return { received: true };
}

@Roles('Admin', 'Operatore')
@Post(':id/files/finalize')
finalize(
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: DocumentFileFinalizeDto,
  @CurrentUser() user: ICurrentUser,
): Promise<DocumentFile> {
  return this.files.finalize(id, dto, user.id);
}
```

Nel modulo: `providers: [DocumentsService, DocumentFilesService]`, `imports` con `ChunkedUploadModule` (o, se il modulo non esporta il service, `providers` aggiunge `ChunkedUploadService` come fa `PhotosModule`: `grep -n "ChunkedUpload" backend/src/apis/photos/photos.module.ts`).

- [ ] **Step 6: Volume e variabili**

`docker-compose.yml`, servizio `api`: aggiungere accanto a `photos_data:/usr/src/app/photos`
```yaml
      - documents_data:/usr/src/app/documents
```
e nella sezione `volumes:` in fondo `  documents_data:`. Stessa cosa in `docker-compose.override.yml` se lì il servizio ridefinisce i volumi (controllare con `grep -n photos docker-compose.override.yml`). In `.env.example` sotto `PHOTO_MAX_SIZE_MB`:
```
# Documenti: cartella e dimensione massima per file (MB)
# DOCUMENTS_DIR=/usr/src/app/documents
# DOCUMENT_MAX_SIZE_MB=50
```
Applicare in dev: `docker compose up -d` (un solo comando), poi `docker exec utenzepa-api-1 ls -ld /usr/src/app/documents`.

- [ ] **Step 7: Verificare**

Run: `docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/documents src/common/chunked-upload --maxWorkers=2; pnpm run type-check"`
Expected: PASS. Prova API con utente temporaneo Admin: caricamento di un PDF piccolo in due chunk, download (`curl -D -` → `Content-Disposition` con `filename*`), download con un utente temporaneo di ruolo in sola lettura → 403; caricamento di un `.exe` rinominato `.pdf` → 400. Pulizia: righe di prova, cartella del documento di prova, utenti temporanei.

- [ ] **Step 8: Commit**

```bash
git add backend/src/apis/documents/document-files.service.ts backend/src/apis/documents/document-files.service.spec.ts backend/src/apis/documents/dto/document-file-finalize.dto.ts backend/src/apis/documents/dto/update-document-file.dto.ts backend/src/apis/documents/documents.controller.ts backend/src/apis/documents/documents.module.ts docker-compose.yml docker-compose.override.yml .env.example
git commit -m "feat(documents): chunked file upload and restricted download"
```

---

### Task 7: Backup con documenti e segnalazioni di scadenza

**Files:**
- Modify: `backend/src/apis/backup/backup.service.ts` (`createBackup`, `restoreFromFile`, `resolveDocumentsDir`)
- Modify: `backend/src/apis/backup/dto/create-backup.dto.ts`
- Modify: `backend/src/apis/backup/backup.controller.ts:44`
- Modify: `backend/src/apis/backup/backup.service.spec.ts`
- Modify: `backend/src/apis/anomalies/anomalies.service.ts` (interfaccia `Anomalies`, due query in fondo a `getAnomalies()`)
- Modify: `backend/src/apis/anomalies/anomalies.service.spec.ts` (mock posizionali: due risultati in più in coda)

**Interfaces:**
- Consumes: `expiryStatusSql`, `ExpiryStatus` (Task 3).
- Produces: `createBackup(includePhotos = false, includeDocuments = false)`; DTO `includeDocuments?: boolean`; anomalie `documents_expired`, `documents_expiring`: `AnomalyList<{ id: number; subject: string; expires_on: string }>`.

- [ ] **Step 1: Test di backup che falliscono**

Aggiungere in `backup.service.spec.ts`, sul modello del test esistente con `PHOTOS_DIR` (righe ~171–200):

```ts
it('createBackup con documenti: archivio con documents/ e senza photos/ se non richieste', async () => {
  const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-service-docs-'));
  process.env.DOCUMENTS_DIR = docsDir;
  fs.mkdirSync(path.join(docsDir, '3'), { recursive: true });
  fs.writeFileSync(path.join(docsDir, '3', 'a.pdf'), '%PDF-1.7');
  fs.mkdirSync(path.join(docsDir, 'tmp'), { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'tmp', 'x.chunk0'), 'pezzo');
  // stesso stub di writeDump usato dal test delle foto
  const info = await service.createBackup(false, true);
  expect(info.filename.endsWith('.tar.gz')).toBe(true);
  const listed: string[] = [];
  await tar.list({ file: path.join(backupDir, info.filename), onReadEntry: (e) => listed.push(e.path) });
  expect(listed).toEqual(expect.arrayContaining(['dump.sql', 'documents/3/a.pdf']));
  expect(listed.some((p) => p.startsWith('documents/tmp'))).toBe(false);
  expect(listed.some((p) => p.startsWith('photos'))).toBe(false);
  fs.rmSync(docsDir, { recursive: true, force: true });
  delete process.env.DOCUMENTS_DIR;
});

it('restoreFromFile: documents/ dell’archivio copiata in DOCUMENTS_DIR', async () => {
  // costruire un .tar.gz con dump.sql + documents/5/b.pdf come nel test di restore delle foto
  // e verificare fs.existsSync(path.join(process.env.DOCUMENTS_DIR, '5', 'b.pdf')) === true
});
```

Scrivere il secondo test copiando la struttura esatta del test di restore delle foto (stesso stub di `restoreSqlFile`), cambiando `photos` in `documents` e `PHOTOS_DIR` in `DOCUMENTS_DIR`. Se `tar.list` con `onReadEntry` non esiste nella versione installata, usare `onentry` (verificare con `grep -n "onentry\|onReadEntry" backend/node_modules/tar/dist/commonjs/list.d.ts`).

- [ ] **Step 2: Verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/backup/backup.service.spec.ts --maxWorkers=2`
Expected: FAIL (il secondo parametro di `createBackup` è ignorato: niente `documents/`).

- [ ] **Step 3: Implementazione backup**

In `backup.service.ts`:

```ts
private resolveDocumentsDir(): string {
  return process.env.DOCUMENTS_DIR ?? path.join(process.cwd(), 'documents');
}

// firma
async createBackup(includePhotos = false, includeDocuments = false): Promise<BackupInfo> {
  const archive = includePhotos || includeDocuments;
  const ext = archive ? 'tar.gz' : 'sql';
  // ... come ora, con `if (!archive)` al posto di `if (!includePhotos)` e nel ramo archivio:
  if (includePhotos) {
    const photosDir = this.resolvePhotosDir();
    if (fs.existsSync(photosDir)) {
      fs.cpSync(photosDir, path.join(stagingDir, 'photos'), { recursive: true });
    }
  }
  if (includeDocuments) {
    const documentsDir = this.resolveDocumentsDir();
    if (fs.existsSync(documentsDir)) {
      // I pezzi di upload in corso (tmp/) non vanno nel backup.
      fs.cpSync(documentsDir, path.join(stagingDir, 'documents'), {
        recursive: true,
        filter: (src) => path.relative(documentsDir, src).split(path.sep)[0] !== 'tmp',
      });
    }
  }
}
```

In `restoreFromFile`, dopo il blocco delle foto:

```ts
const archivedDocumentsDir = path.join(extractDir, 'documents');
if (fs.existsSync(archivedDocumentsDir)) {
  const documentsDir = this.resolveDocumentsDir();
  fs.mkdirSync(documentsDir, { recursive: true });
  fs.cpSync(archivedDocumentsDir, documentsDir, { recursive: true });
  this.logger.log(`Restore: documenti ripristinati da ${archivedDocumentsDir}`);
}
```

Aggiornare il commento sopra `createBackup` («includePhotos/includeDocuments: solo sui backup manuali…»). DTO:

```ts
@IsOptional()
@IsBoolean({ message: 'Il campo includeDocuments deve essere booleano' })
includeDocuments?: boolean;
```

Controller: `return this.service.createBackup(dto.includePhotos ?? false, dto.includeDocuments ?? false);`

- [ ] **Step 4: Segnalazioni di scadenza (test prima)**

In `anomalies.service.spec.ts` aggiungere un test che, con `query.mockImplementation` che risponde per commento SQL (come i test delle righe 15–60), verifica:

```ts
it('documenti scaduti e in scadenza', async () => {
  query.mockImplementation(async (sql: string) =>
    sql.includes('/* documents_expired */')
      ? [{ id: '4', subject: 'CPI palestra', expires_on: '2026-09-30' }]
      : sql.includes('/* documents_expiring */')
        ? [{ id: '5', subject: 'APE scuola', expires_on: '2026-11-15' }]
        : [],
  );
  const a = await service.getAnomalies();
  expect(a.documents_expired).toEqual({ count: 1, items: [{ id: 4, subject: 'CPI palestra', expires_on: '2026-09-30' }] });
  expect(a.documents_expiring.items[0].id).toBe(5);
  const sql = query.mock.calls.map(([s]) => String(s)).find((s) => s.includes('/* documents_expired */'));
  expect(sql).toContain('d.deleted = 0');
  expect(sql).toContain('d.expires_on < CURDATE()');
});
```

Poi controllare i test a mock posizionali (`mockResolvedValueOnce` in sequenza, righe ~67–83): se l'ultimo valore della catena viene riusato dalle query nuove, aggiungere in coda `.mockResolvedValueOnce([]).mockResolvedValueOnce([])`.

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies --maxWorkers=2` → FAIL (`documents_expired` undefined).

- [ ] **Step 5: Implementazione anomalie**

Nell'interfaccia `Anomalies`:
```ts
documents_expired: AnomalyList<DocumentAnomaly>;
documents_expiring: AnomalyList<DocumentAnomaly>;
```
```ts
export interface DocumentAnomaly {
  id: number;
  subject: string;
  expires_on: string;
}
```
In fondo a `getAnomalies()`, prima del `return`:
```ts
const documentRows = (status: ExpiryStatus, tag: string) =>
  this.dataSource.query(
    `/* ${tag} */ SELECT d.id, d.subject, DATE_FORMAT(d.expires_on, '%Y-%m-%d') AS expires_on
       FROM documents d WHERE d.deleted = 0 AND ${expiryStatusSql(status, 'd')}
      ORDER BY d.expires_on`,
  ) as Promise<{ id: unknown; subject: string; expires_on: string }[]>;
const expired = await documentRows(ExpiryStatus.EXPIRED, 'documents_expired');
const expiring = await documentRows(ExpiryStatus.EXPIRING, 'documents_expiring');
const documentItems = (rows: { id: unknown; subject: string; expires_on: string }[]) =>
  list(rows.map((r) => ({ id: Number(r.id), subject: r.subject, expires_on: r.expires_on })));
```
e nel `return`: `documents_expired: documentItems(expired), documents_expiring: documentItems(expiring),`. Import: `import { ExpiryStatus, expiryStatusSql } from '@apis/documents/document-expiry';`.

- [ ] **Step 6: Verificare**

Run: `docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/backup src/apis/anomalies --maxWorkers=2; pnpm run type-check"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/apis/backup/backup.service.ts backend/src/apis/backup/backup.service.spec.ts backend/src/apis/backup/dto/create-backup.dto.ts backend/src/apis/backup/backup.controller.ts backend/src/apis/anomalies/anomalies.service.ts backend/src/apis/anomalies/anomalies.service.spec.ts
git commit -m "feat(documents): documents in manual backups and expiry anomalies"
```

---

### Task 8: Frontend — modello, servizio, tipi di documento

**Files:**
- Create: `frontend/src/app/pages/documents/document.model.ts`
- Create: `frontend/src/app/pages/documents/document.service.ts`
- Create: `frontend/src/app/pages/document-types/document-types.component.ts`
- Modify: `frontend/src/app/app.routes.ts` (rotta `document-types`)
- Modify: `frontend/src/app/comp/sidebar/sidebar.component.ts` (voce Impostazioni)
- Modify: `frontend/src/styles.scss` (token `--entity-document`)
- Modify: `frontend/src/app/core/services/anomalies.service.ts` (interfaccia `Anomalies` gemella: `documents_expired`, `documents_expiring`)

**Interfaces:**
- Produces (TypeScript, usati dai Task 9–11):

```ts
export type LinkEntity = 'asset' | 'plant' | 'plant_inspection' | 'utilizer_grant' | 'contract';
export type ExpiryStatus = 'EXPIRED' | 'EXPIRING';
export interface DocumentType { id: number; name: string; group_name: string; sort_order: number; }
export interface DocumentFile {
  id: number; document_id: number; original_name: string; mime_type: string; size_bytes: number;
  description: string | null; create_date: string; created_by?: {firstName?: string | null; lastName?: string | null} | null;
}
export interface Document {
  id: number; document_type_id: number; documentType?: DocumentType; number: string | null;
  document_date: string | null; subject: string; issuer: string | null; protocol_number: string | null;
  protocol_date: string | null; expires_on: string | null; notes: string | null; deleted?: boolean;
  files?: DocumentFile[];
  assets?: {id: number; asset_name: string | null; address?: string | null}[];
  plants?: {id: number; code: string; name: string}[];
  plantInspections?: {id: number; kind: string; plant_id: number; plant?: {id: number; code: string; name: string}}[];
  utilizerGrants?: {id: number; subject: string | null; kind?: string | null}[];
  contracts?: {id: number; cig_contract: string | null; supplier?: {company_name?: string | null; last_name?: string | null; first_name?: string | null} | null}[];
  expiry_status: ExpiryStatus | null; file_count: number; link_count: number;
  via_inspection?: {id: number; kind: string} | null;
  update_date?: string; updated_by?: {firstName?: string | null; lastName?: string | null} | null;
}
export interface DocumentPayload {
  document_type_id: number; number: string | null; document_date: string | null; subject: string;
  issuer: string | null; protocol_number: string | null; protocol_date: string | null;
  expires_on: string | null; notes: string | null;
  asset_ids?: number[]; plant_ids?: number[]; plant_inspection_ids?: number[];
  utilizer_grant_ids?: number[]; contract_ids?: number[];
}
export const LINK_IDS_FIELD: Record<LinkEntity, keyof DocumentPayload>;
export function expiryBadge(s: ExpiryStatus | null): StatusInfo | null;
export function documentTitle(d: Pick<Document, 'documentType' | 'number' | 'document_date'>): string;
export function formatBytes(n: number): string;
```

```ts
// DocumentService
list(filters?: Record<string, string | number | boolean | null | undefined>): Observable<Document[]>
get(id: number): Observable<Document>
create(p: DocumentPayload): Observable<Document>
update(id: number, p: Partial<DocumentPayload>): Observable<Document>
delete(id: number): Observable<void>
restore(id: number): Observable<Document>
byEntity(entity: LinkEntity, id: number): Observable<Document[]>
link(id: number, entity: LinkEntity, entityId: number): Observable<void>
unlink(id: number, entity: LinkEntity, entityId: number): Observable<void>
uploadFile(documentId: number, file: File, description?: string | null): Observable<DocumentFile>
fileBlob(fileId: number, inline: boolean): Observable<Blob>
updateFile(fileId: number, description: string | null): Observable<DocumentFile>
deleteFile(fileId: number): Observable<void>
types(): Observable<DocumentType[]>
createType(p: {name: string; group_name: string; sort_order?: number}): Observable<DocumentType>
updateType(id: number, p: Partial<{name: string; group_name: string; sort_order: number}>): Observable<DocumentType>
deleteType(id: number): Observable<void>
```

- [ ] **Step 1: `document.model.ts`**

Scrivere le interfacce sopra più:

```ts
import type {StatusInfo} from '../../core/helpers/entity-status';

export const LINK_IDS_FIELD: Record<LinkEntity, keyof DocumentPayload> = {
  asset: 'asset_ids', plant: 'plant_ids', plant_inspection: 'plant_inspection_ids',
  utilizer_grant: 'utilizer_grant_ids', contract: 'contract_ids',
};

// Gemello di backend/src/apis/documents/document-expiry.ts (EXPIRING_DAYS = 60).
export function expiryBadge(s: ExpiryStatus | null): StatusInfo | null {
  if (s === 'EXPIRED') return {tone: 'danger', label: 'Scaduto', icon: 'event_busy'};
  if (s === 'EXPIRING') return {tone: 'warn', label: 'In scadenza', icon: 'schedule'};
  return null;
}

const dateIt = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

// «Delibera di Giunta n. 12 del 03/04/2024»
export function documentTitle(d: Pick<Document, 'documentType' | 'number' | 'document_date'>): string {
  return [d.documentType?.name ?? 'Documento', d.number ? `n. ${d.number}` : '', d.document_date ? `del ${dateIt(d.document_date)}` : '']
    .filter(Boolean).join(' ');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString('it-IT', {maximumFractionDigits: 0})} KB`;
  return `${(n / 1024 / 1024).toLocaleString('it-IT', {maximumFractionDigits: 1})} MB`;
}

export const ALLOWED_EXTENSIONS = ['pdf', 'p7m', 'doc', 'docx', 'odt', 'xls', 'xlsx', 'ods', 'csv', 'txt',
  'jpg', 'jpeg', 'png', 'tif', 'tiff', 'eml', 'msg'];
```

Verificare il nome e i campi di `StatusInfo` (`grep -n "export interface StatusInfo" -A6 frontend/src/app/core/helpers/entity-status.ts`) e i toni ammessi (`'danger' | 'warn' | …`).

- [ ] **Step 2: `document.service.ts`**

Stesso schema di `ComplexService` (header `Authorization` a mano, `HttpParams` dai filtri). Metodi:

```ts
private readonly api = `${environment.apiUrl}/documents`;
private readonly typesApi = `${environment.apiUrl}/document-types`;
private chunked = inject(ChunkedUploadService);

byEntity(entity: LinkEntity, id: number): Observable<Document[]> {
  return this.http.get<Document[]>(`${this.api}/by-entity/${entity}/${id}`, {headers: this.headers()});
}
link(id: number, entity: LinkEntity, entityId: number): Observable<void> {
  return this.http.post<void>(`${this.api}/${id}/links`, {entity, id: entityId}, {headers: this.headers()});
}
unlink(id: number, entity: LinkEntity, entityId: number): Observable<void> {
  return this.http.delete<void>(`${this.api}/${id}/links`, {headers: this.headers(), body: {entity, id: entityId}});
}
restore(id: number): Observable<Document> {
  return this.http.post<Document>(`${this.api}/${id}/restore`, {}, {headers: this.headers()});
}
uploadFile(documentId: number, file: File, description: string | null = null): Observable<DocumentFile> {
  return this.chunked.uploadFile(file, `${this.api}/${documentId}/files/chunk`, `${this.api}/${documentId}/files/finalize`,
    {originalFilename: file.name, description});
}
fileBlob(fileId: number, inline: boolean): Observable<Blob> {
  return this.http.get(`${this.api}/files/${fileId}${inline ? '?inline=1' : ''}`, {headers: this.headers(), responseType: 'blob'});
}
updateFile(fileId: number, description: string | null): Observable<DocumentFile> {
  return this.http.patch<DocumentFile>(`${this.api}/files/${fileId}`, {description}, {headers: this.headers()});
}
deleteFile(fileId: number): Observable<void> {
  return this.http.delete<void>(`${this.api}/files/${fileId}`, {headers: this.headers()});
}
```

più `list/get/create/update/delete` identici a `ComplexService` e `types/createType/updateType/deleteType` su `typesApi`. Import `ChunkedUploadService` da `../../services/chunked-upload.service`.

- [ ] **Step 3: Pagina «Tipi di documento»**

`document-types.component.ts` standalone (template inline), solo Admin per la scrittura (`HasRoleDirective` con `['Admin']`): tabella raggruppata per `group_name` (colonne Nome, Gruppo, Ordine, azioni), riga di modifica in linea con tre campi (`name` required, `group_name` con `mat-autocomplete` sui gruppi esistenti, `sort_order` numerico), «Nuovo tipo», «Elimina» con `ConfirmDialogComponent` e toast dell'errore 400 (`err.error?.message`). Struttura del form e della tabella come `PlantInspectionsTabComponent` (form inline + tabella HTML semplice). Rotta `{path: 'document-types', component: DocumentTypesComponent}`; voce in Impostazioni dopo «Tipologie uso contatore»: `{label: 'Tipi di documento', icon: 'folder_special', route: '/document-types'}`.

- [ ] **Step 4: Token colore e anomalie gemelle**

In `styles.scss`, dopo `--entity-chapter`: `  --entity-document: light-dark(#475569, #94a3b8);`. In `core/services/anomalies.service.ts` aggiungere all'interfaccia `Anomalies`:
```ts
documents_expired: AnomalyList<{id: number; subject: string; expires_on: string}>;
documents_expiring: AnomalyList<{id: number; subject: string; expires_on: string}>;
```
(verificare il nome del tipo `AnomalyList` nel file).

- [ ] **Step 5: Build**

Run: `docker exec utenzepa-frontend-1 npx ng build --configuration production 2>&1 | grep -E "ERROR|Application bundle"`
Expected: «Application bundle generation complete».

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/documents/document.model.ts frontend/src/app/pages/documents/document.service.ts frontend/src/app/pages/document-types/document-types.component.ts frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts frontend/src/styles.scss frontend/src/app/core/services/anomalies.service.ts
git commit -m "feat(documents): frontend model, service and document types page"
```

---

### Task 9: Frontend — scheda documento

**Files:**
- Create: `frontend/src/app/pages/documents/document-edit-dialog.component.ts`
- Create: `frontend/src/app/pages/documents/document-edit-dialog.component.html`
- Create: `frontend/src/app/pages/documents/document-files-tab.component.ts`
- Modify: `frontend/src/app/core/services/entity-navigator.service.ts` (`openDocument`, `createDocument`)

**Interfaces:**
- Consumes: `DocumentService`, modello (Task 8); `EntitySheetComponent`, `LinkedTableComponent`, `TabLabelComponent`, `StatusBadgeComponent`, `EntityHistoryComponent`, `openSheet`, `isEditorRole`, `hasInvalid`, `lastModifiedLabel`; `toIsoDate` da `../utilities/consumptions/consumption.model`.
- Produces:
  - `interface DocumentEditDialogData { documentId: number | null; prefill?: Partial<DocumentPayload> }`; il dialog salva da sé e chiude con `Document | null` (come `ComplexEditDialogComponent`).
  - `EntityNavigatorService.openDocument(id: number): Observable<boolean>`; `createDocument(prefill: Partial<DocumentPayload>): Observable<Document | null>`.
  - `<app-document-files-tab [documentId] [files] [canEdit] [canDownload] (changed)>`.

- [ ] **Step 1: Tab «File»**

Componente standalone con:
- area di trascinamento (`(dragover)`/`(drop)` con `preventDefault`) + `<input type="file" multiple hidden #picker [accept]="accept">` dove `accept = ALLOWED_EXTENSIONS.map(e => '.' + e).join(',')`; visibile solo con `canEdit`;
- controllo lato client dell'estensione (stessa lista) prima dell'upload: file non ammesso → messaggio «Tipo di file non ammesso (.zip)» senza chiamare l'API;
- upload sequenziale con `concatMap` su `service.uploadFile(documentId, file)`, `mat-progress-bar` indeterminata e nome del file in corso; errore → `err.error?.message ?? 'Caricamento non riuscito.'`; a fine coda `changed.emit()`;
- tabella: nome originale, descrizione (modificabile in linea con `canEdit`, salvata on blur con `updateFile`), dimensione (`formatBytes`), «caricato da / il»;
- azioni per riga: con `canDownload` «Apri» (solo `application/pdf` e `image/*`) e «Scarica»; senza `canDownload` testo «Download riservato» con tooltip «Solo Amministratori e Operatori scaricano i file»; con `canEdit` «Elimina» con `ConfirmDialogComponent` (`{title: 'Elimina file', message: \`Eliminare «${f.original_name}»?\`, confirmLabel: 'Elimina', danger: true}`);
- apertura/scaricamento:

```ts
open(f: DocumentFile, inline: boolean): void {
  // Il token va nell'header: si scarica il blob e si apre un object URL.
  const win = inline ? window.open('', '_blank') : null;
  this.service.fileBlob(f.id, inline).subscribe({
    next: blob => {
      const url = URL.createObjectURL(blob);
      if (win) {
        win.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = f.original_name;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    error: async (err: HttpErrorResponse) => {
      win?.close();
      const text = err.error instanceof Blob ? await err.error.text() : '';
      this.error = (text && JSON.parse(text).message) || 'File non disponibile.';
    },
  });
}
```

`window.open` prima della richiesta: evita il blocco dei popup.

- [ ] **Step 2: Dialog**

Struttura e stile di `complex-edit-dialog.component.ts`/`.html` (salva da sé, resta aperto dopo la creazione). Specifiche:

```ts
form = this.fb.group({
  document_type_id: [this.data.prefill?.document_type_id ?? null as number | null, Validators.required],
  number: [''],
  document_date: [null as Date | null],
  subject: [this.data.prefill?.subject ?? '', [Validators.required, Validators.maxLength(500)]],
  issuer: [''],
  protocol_number: [''],
  protocol_date: [null as Date | null],
  expires_on: [null as Date | null],
  notes: [''],
});
readonly canEdit = isEditorRole(inject(AuthService).getCurrentUser()?.role);
readonly canDownload = this.canEdit; // stessi ruoli: Admin, Operatore
```

- Header `app-entity-sheet` con `icon="description"`, `color="var(--entity-document)"`, titolo = `documentTitle(...)` (o «Nuovo documento»), sottotitolo = oggetto, badge `expiryBadge(document.expiry_status)` se presente, badge conteggio file.
- Tab «Riepilogo»: `app-filterable-select` del tipo (opzioni `label = name`, `sublabel = group_name`, ordinate per gruppo; `createLabel` solo se l'utente è Admin, che apre un piccolo prompt nome + gruppo e chiama `createType`), numero, data, oggetto (`span-2`), emesso da, protocollo numero/data, scadenza con `mat-hint` «Solo per atti con validità propria (CPI, agibilità, APE, polizze). Le verifiche degli impianti hanno la loro scadenza.», note.
- Tab «File» (solo dopo il primo salvataggio, altrimenti `sheet-hint` «Salva il documento per caricare i file»): `<app-document-files-tab>`; `(changed)` ricarica il documento.
- Tab «Collegamenti» (solo dopo il primo salvataggio): cinque `app-linked-table` in sezioni con titolo (Immobili, Impianti, Verifiche, Contratti immobiliari, Contratti di fornitura); righe = campi cache aggiornati in `refreshLinks()`; «Collega» con `addOptions` caricate una volta (immobili via `AssetService.search({deleted:false})`, impianti via `PlantService`, contratti immobiliari via `UtilizerGrantService.search`, contratti di fornitura via `ContractsService.search`; verifiche: opzioni dagli impianti già collegati, `plant.inspections` caricate con `PlantService.get`), `(add)` → `service.link(...)` e ricarica, `(unlink)` → `service.unlink(...)` (la tabella chiede già conferma con `itemLabel`), `(open)` → `navigator.openAsset/openPlant/openGrant/openSupplyContract`.
- Tab «Note» e «Storico» (`app-entity-history [entity]="'documents'"`).
- `save()`: payload con `toIsoDate` per le tre date, testi `trim() || null`; create → `service.create({...payload, ...prefillLinks})` dove `prefillLinks` sono i campi `*_ids` di `data.prefill`; update senza campi `*_ids` (i collegamenti si modificano dal tab).

Leggere `grep -n "search\|getById\|get(" frontend/src/app/pages/plants/plant.service.ts` per i nomi esatti dei metodi impianto prima di scrivere le chiamate.

- [ ] **Step 3: Navigator**

```ts
const DOCUMENT_DIALOG = () => import('../../pages/documents/document-edit-dialog.component').then(m => m.DocumentEditDialogComponent);

// Il dialog documento salva da sé e chiude con il documento se ha salvato.
openDocument(id: number): Observable<boolean> {
  return this.sheet<{documentId: number}, Document | null>(DOCUMENT_DIALOG, {documentId: id}).pipe(map(saved => !!saved));
}

createDocument(prefill: Partial<DocumentPayload> = {}): Observable<Document | null> {
  return this.sheet<{documentId: null; prefill: Partial<DocumentPayload>}, Document | null>(
    DOCUMENT_DIALOG, {documentId: null, prefill},
  ).pipe(map(d => d ?? null));
}
```

Import di tipo: `import type {Document, DocumentPayload} from '../../pages/documents/document.model';`.

- [ ] **Step 4: Build**

Run: `docker exec utenzepa-frontend-1 npx ng build --configuration production 2>&1 | grep -E "ERROR|Application bundle"`
Expected: build ok.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/documents/document-edit-dialog.component.ts frontend/src/app/pages/documents/document-edit-dialog.component.html frontend/src/app/pages/documents/document-files-tab.component.ts frontend/src/app/core/services/entity-navigator.service.ts
git commit -m "feat(documents): document sheet with files and links"
```

---

### Task 10: Frontend — elenco Documenti

**Files:**
- Create: `frontend/src/app/pages/documents/documents.component.ts`
- Create: `frontend/src/app/pages/documents/documents-filters.ts`
- Modify: `frontend/src/app/app.routes.ts`, `frontend/src/app/comp/sidebar/sidebar.component.ts`
- Modify: `frontend/src/app/pages/audit-log/audit-log-page.component.ts` (`ENTITY_OPTIONS`: `{label: 'Documenti', value: 'documents'}`, `{label: 'Tipi di documento', value: 'document_types'}`)
- Modify: `frontend/src/app/pages/guida/guida.ts` (`'documents': 'registrare-un-documento-o-un-atto'`)

**Interfaces:**
- Consumes: Task 8–9.
- Produces: rotta `/documents` con `?selectedId=`; `DOCUMENT_SIGNALS: SignalDef[]`.

- [ ] **Step 1: Filtri e segnalazioni**

```ts
// documents-filters.ts
import {FilterDef} from '../../core/components/list/filter-def';
import type {SignalDef} from '../../core/components/list/list-signals.component';
import type {DocumentType} from './document.model';

export function documentFilters(types: DocumentType[]): FilterDef[] {
  const groups = [...new Set(types.map(t => t.group_name))];
  const year = new Date().getFullYear();
  return [
    {key: 'document_type_id', label: 'Tipo', type: 'select', inline: true,
      options: types.map(t => ({label: t.name, value: t.id}))},
    {key: 'group_name', label: 'Gruppo', type: 'select', inline: true, options: groups.map(g => ({label: g, value: g}))},
    {key: 'linked_to', label: 'Collegato a', type: 'select', inline: true, options: [
      {label: 'Immobili', value: 'asset'}, {label: 'Impianti', value: 'plant'},
      {label: 'Contratti immobiliari', value: 'utilizer_grant'}, {label: 'Contratti di fornitura', value: 'contract'},
      {label: 'Nessuna entità', value: 'none'}]},
    {key: 'year', label: 'Anno', type: 'select',
      options: Array.from({length: 40}, (_, i) => ({label: String(year - i), value: year - i}))},
    {key: 'expiry_status', label: 'Scadenza', type: 'select',
      options: [{label: 'Scaduti', value: 'EXPIRED'}, {label: 'In scadenza (60 giorni)', value: 'EXPIRING'}]},
    {key: 'without_files', label: 'Senza file', type: 'toggle'},
  ];
}

export const DOCUMENT_SIGNALS: SignalDef[] = [
  {key: 'documents_expired', label: 'Documenti scaduti'},
  {key: 'documents_expiring', label: 'Documenti in scadenza entro 60 giorni'},
];
```

Prima di scrivere: `grep -n "type:" frontend/src/app/core/components/list/filter-def.ts` per i tipi di filtro esistenti (`select`, `toggle`/`boolean`, ecc.) e il filtro «cancellati» comune (`DELETED_FILTER` in `assets-filters.ts`): aggiungerlo in fondo.

- [ ] **Step 2: Componente elenco**

Copia strutturale di `complexes.component.ts` con:
- `COLUMNS_KEY = 'columns:documents'`, `PAGE_SIZE_KEY = 'list-page-size:Documenti'`;
- colonne: Tipo (`documentType.name`), Numero, Data (`dd/mm/yyyy`), Oggetto, Emesso da, File (`file_count`), Collegamenti (`link_count`), Scadenza (badge `app-status-badge` da `expiryBadge`);
- `filterDefs` costruiti dopo `service.types()` (prima del primo `reload`);
- ricerca libera lato client su tipo, numero, oggetto, emesso da, protocollo, note;
- segnalazioni: `<app-list-signals [signals]="signals" [reloadToken]="signalsToken" [activeKey]="signal?.key ?? null" (selected)="onSignal($event)">` come in `assets.component.html`; `onSignal` tiene gli id e il `filterPredicate` li applica;
- azioni riga: «Dettaglio», «Elimina» (conferma), in vista cancellati «Ripristina» (`service.restore`);
- `openDialog` con `openSheet(this.dialog, DocumentEditDialogComponent, {documentId})`, ricarica e `signalsToken++` se salvato;
- export CSV con le stesse colonne.

Rotta `{path: 'documents', component: DocumentsComponent}`; voce di menu nel gruppo Patrimonio dopo «Contratti immobiliari»: `{label: 'Documenti', icon: 'folder_open', route: '/documents'}`.

- [ ] **Step 3: Build** — come nei task precedenti.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pages/documents/documents.component.ts frontend/src/app/pages/documents/documents-filters.ts frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts frontend/src/app/pages/audit-log/audit-log-page.component.ts frontend/src/app/pages/guida/guida.ts
git commit -m "feat(documents): documents list with filters and expiry signals"
```

---

### Task 11: Frontend — tab «Documenti» nelle schede e verbali delle verifiche

**Files:**
- Create: `frontend/src/app/pages/documents/entity-documents.component.ts`
- Create: `frontend/src/app/pages/documents/inspection-documents-dialog.component.ts`
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.html` + `.ts`
- Modify: `frontend/src/app/pages/plants/plant-edit-dialog.component.html` + `.ts`
- Modify: `frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.html` + `.ts`
- Modify: `frontend/src/app/pages/contracts/contract-edit-dialog.component.html` + `.ts`
- Modify: `frontend/src/app/pages/plants/plant-inspections-tab.component.ts`

**Interfaces:**
- Consumes: `DocumentService.byEntity/link/unlink/list`, `EntityNavigatorService.openDocument/createDocument`, `LINK_IDS_FIELD`, `expiryBadge`, `documentTitle`.
- Produces: `<app-entity-documents [entity]="'asset'" [entityId]="id" [readOnly]="!canEdit" (countChange)="docCount = $event">`; `InspectionDocumentsDialogComponent` con data `{inspectionId: number; title: string; readOnly: boolean}`.

- [ ] **Step 1: `entity-documents.component.ts`**

```ts
// Tab «Documenti» di una scheda: documenti collegati all'entità (per un
// impianto anche quelli delle sue verifiche, scollegabili solo dalla verifica).
@Component({
  selector: 'app-entity-documents',
  standalone: true,
  imports: [LinkedTableComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-linked-table
      [columns]="columns"
      [rows]="rows"
      [rowStatus]="statusOf"
      [addOptions]="readOnly ? null : options"
      addLabel="Collega documento"
      itemLabel="il documento"
      [unlinkable]="!readOnly"
      emptyText="Nessun documento collegato."
      [createLabel]="readOnly ? null : 'Nuovo documento'"
      (create)="create()"
      (add)="link($event)"
      (unlink)="unlink($event)"
      (open)="open($event.id)"></app-linked-table>
  `,
})
export class EntityDocumentsComponent implements OnChanges {
  @Input({required: true}) entity!: LinkEntity;
  @Input({required: true}) entityId!: number;
  @Input() readOnly = false;
  @Output() countChange = new EventEmitter<number>();

  private service = inject(DocumentService);
  private navigator = inject(EntityNavigatorService);
  private toast = inject(ToastService);

  rows: Document[] = [];
  options: TOption[] = [];

  readonly columns: LinkedColumn<Document>[] = [
    {label: 'Documento', value: d => documentTitle(d)},
    {label: 'Oggetto', value: d => d.subject + (d.via_inspection ? ` — da verifica: ${d.via_inspection.kind}` : '')},
    {label: 'File', value: d => String(d.file_count)},
  ];
  readonly statusOf = (d: Document): StatusInfo | null => expiryBadge(d.expiry_status);

  ngOnChanges(): void {
    if (this.entityId) this.reload();
  }

  reload(): void {
    this.service.byEntity(this.entity, this.entityId).subscribe(rows => {
      this.rows = rows;
      this.countChange.emit(rows.length);
      if (!this.readOnly) this.loadOptions();
    });
  }

  private loadOptions(): void {
    const linked = new Set(this.rows.map(r => r.id));
    this.service.list().subscribe(all => this.options = all
      .filter(d => !linked.has(d.id))
      .map(d => ({value: d.id, label: documentTitle(d), sublabel: d.subject, searchText: `${documentTitle(d)} ${d.subject}`})));
  }

  link(documentId: number): void {
    this.service.link(documentId, this.entity, this.entityId).subscribe({next: () => this.reload(), error: e => this.fail(e)});
  }

  // Riga «da verifica»: si scollega dalla verifica, non dall'impianto.
  unlink(documentId: number): void {
    const row = this.rows.find(r => r.id === documentId);
    const [entity, id] = row?.via_inspection ? ['plant_inspection' as LinkEntity, row.via_inspection.id] : [this.entity, this.entityId];
    this.service.unlink(documentId, entity, id).subscribe({next: () => this.reload(), error: e => this.fail(e)});
  }

  create(): void {
    this.navigator.createDocument({[LINK_IDS_FIELD[this.entity]]: [this.entityId]}).subscribe(d => {
      if (d) this.reload();
    });
  }

  open(id: number): void {
    this.navigator.openDocument(id).subscribe(() => this.reload());
  }

  private fail(err: HttpErrorResponse): void {
    this.toast.add({severity: 'error', summary: 'Operazione non riuscita', detail: err.error?.message ?? 'Errore imprevisto.'});
  }
}
```

- [ ] **Step 2: Tab nelle quattro schede**

In ognuna, dopo il tab dei collegamenti principali e prima di «Storico», solo per entità già salvate:

```html
@if (<entità salvata>) {
  <mat-tab aria-label="Documenti">
    <ng-template mat-tab-label>
      <app-tab-label icon="folder_open" label="Documenti" [count]="documentCount"></app-tab-label>
    </ng-template>
    <ng-template matTabContent>
      <app-entity-documents entity="asset" [entityId]="<id>" [readOnly]="!canEdit"
                            (countChange)="documentCount = $event"></app-entity-documents>
    </ng-template>
  </mat-tab>
}
```

con `entity` = `asset` / `plant` / `utilizer_grant` / `contract` e la condizione/id propri di ogni scheda (leggere ciascun `.html` per il nome della variabile dell'entità e della condizione «non nuovo»: es. `!isNew` e `data.item.id` nell'immobile, `plant` e `plant.id` nell'impianto). Nel `.ts`: `documentCount = 0;` e `EntityDocumentsComponent` negli `imports`. `matTabContent` evita la chiamata finché il tab non si apre; il conteggio si vede dopo la prima apertura (accettato).

- [ ] **Step 3: Verbali delle verifiche**

`inspection-documents-dialog.component.ts`: dialog piccolo (`maxWidth` come da regola `MatDialog` > 560px) con titolo «Documenti della verifica: <tipo>» e `<app-entity-documents entity="plant_inspection" [entityId]="data.inspectionId" [readOnly]="data.readOnly">`, pulsante «Chiudi».

In `plant-inspections-tab.component.ts`:
- `@Input() plantId` già presente; al `ngOnInit` e dopo ogni `changed`, `documentService.byEntity('plant', plantId)` → `docCounts = Map<inspectionId, number>` contando le righe con `via_inspection`;
- nuova colonna prima delle azioni: `<button mat-icon-button type="button" (click)="openDocuments(r)" [matTooltip]="'Documenti della verifica'"><mat-icon [matBadge]="docCounts.get(r.id) || null" matBadgeSize="small">folder_open</mat-icon></button>` (aggiungere `MatBadgeModule`);
- `openDocuments(r)` apre `InspectionDocumentsDialogComponent` con `this.dialog.open(..., {width: '720px', maxWidth: '95vw', data: {inspectionId: r.id, title: r.kind, readOnly: this.readOnly}})` e alla chiusura ricarica i conteggi.

- [ ] **Step 4: Build** — come nei task precedenti.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/documents/entity-documents.component.ts frontend/src/app/pages/documents/inspection-documents-dialog.component.ts frontend/src/app/pages/assets/asset-edit-dialog.component.html frontend/src/app/pages/assets/asset-edit-dialog.component.ts frontend/src/app/pages/plants/plant-edit-dialog.component.html frontend/src/app/pages/plants/plant-edit-dialog.component.ts frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.html frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.ts frontend/src/app/pages/contracts/contract-edit-dialog.component.html frontend/src/app/pages/contracts/contract-edit-dialog.component.ts frontend/src/app/pages/plants/plant-inspections-tab.component.ts
git commit -m "feat(documents): documents tab in asset, plant, contract sheets and inspection documents"
```

---

### Task 12: Backup UI, guida, documentazione, verifica E2E, rilascio

**Files:**
- Modify: `frontend/src/app/pages/backup-import/backup-import.component.html`, `.ts`, `backup.service.ts`
- Modify: `frontend/public/guida/guida.md`
- Modify: `CLAUDE.md`, `docs/roadmap-patrimonio.md`, `publiccode.yml`

- [ ] **Step 1: Casella nel backup**

In `backup.service.ts` frontend: `create(includePhotos = false, includeDocuments = false)` con body `{includePhotos, includeDocuments}`. Nel componente: `includeDocumentsInBackup = false;` e, sotto la casella delle foto, `<mat-checkbox [(ngModel)]="includeDocumentsInBackup" [disabled]="creatingBackup">Includi i documenti</mat-checkbox>`; chiamata `this.backupService.create(this.includePhotosInBackup, this.includeDocumentsInBackup)`. Aggiornare l'eventuale testo d'aiuto accanto alla casella delle foto («il file può diventare grande»).

- [ ] **Step 2: Guida**

In `guida.md` (data in testa `_Ultimo aggiornamento: <data del giorno>_`):
- in «Operazioni frequenti», dopo «Gestire i complessi», sezione `### Registrare un documento o un atto`: cosa è un documento (atto con o senza file), passi (menu Documenti → Nuovo documento, oppure tab Documenti di immobile/impianto/contratto → Nuovo documento o Collega documento), file (trascina o scegli; tipi ammessi; massimo 50 MB), un documento per più entità (es. una delibera per più immobili: si registra una volta e si collega), verbali delle verifiche (icona cartella nella riga della verifica), scadenza (solo atti con validità propria; badge e segnalazioni);
- in «Regole e riferimenti» sezione `### Chi può scaricare i file dei documenti`: schede visibili a tutti, file scaricabili solo da Amministratori e Operatori (dati personali negli atti);
- in «Problemi frequenti» sezione `### «Tipo di file non ammesso» o «Il contenuto del file non corrisponde al tipo»` con Causa / Soluzione / Apri un ticket se;
- in «Fare un backup» una riga sulla casella «Includi i documenti».

Verificare l'ancora `registrare-un-documento-o-un-atto` usata in `guida.ts` (Task 10) con `node scripts/check-guida.mjs` nel container frontend.

- [ ] **Step 3: CLAUDE.md, roadmap, versione**

- `CLAUDE.md`, sezione Dominio: voce **Documenti** (v1.22.0): entità `documents` con tipi (`document_types`, Admin), file su `DOCUMENTS_DIR` (volume `documents_data`, upload a pezzi, tipi in `document-file-policy.ts`, download solo Admin/Operatore), collegamenti N-N (`document_assets`, `document_plants`, `document_plant_inspections`, `document_utilizer_grants`, `document_contracts`), scadenza (`document-expiry.ts`, gemella SQL), backup manuale con «Includi i documenti». Aggiungere `document-types`, `documents` all'elenco dei moduli in `src/apis/`.
- `docs/roadmap-patrimonio.md`: voce 19 → «fatto, v1.22.0 (documenti e riferimenti ad atti; utenze e complessi, ricerca nei PDF e firma digitale rimandati)» nella tabella e nota nella sezione 19.
- `publiccode.yml`: `softwareVersion: "v1.22.0"`, `releaseDate` = data del giorno.

- [ ] **Step 4: Verifica E2E (Playwright, utente temporaneo Admin)**

1. `/building?selectedId=<immobile>` → tab Documenti → «Nuovo documento»: tipo Delibera di Giunta, numero «12/2024», oggetto di prova, Salva; tab File: caricare un PDF reale da `W:\PATRIMONIO\4_IMMOBILIARE` (copiarlo prima in una cartella di lavoro); «Apri» apre l'anteprima.
2. Dalla scheda di un secondo immobile: «Collega documento» → stesso documento; in `/documents` la riga ha Collegamenti = 2.
3. `/plants?…` impianto con verifiche: icona cartella su una verifica → «Nuovo documento» tipo Verbale di verifica; nel tab Documenti dell'impianto la riga mostra «da verifica: …»; «Scollega» la toglie dalla verifica.
4. Documento con scadenza ieri → badge «Scaduto» e segnalazione «Documenti scaduti» in `/documents`.
5. Utente temporaneo con ruolo in sola lettura: la scheda si apre, il tab File mostra «Download riservato».
6. Backup manuale con «Includi i documenti»: il file è `.tar.gz` (non ripristinarlo).

Screenshot solo in `.playwright-mcp/`. Pulizia: documenti di prova (`DELETE FROM documents WHERE subject LIKE 'Prova%'`, cascade su file e collegamenti), cartelle `documents/<id>` di prova nel container, `audit_logs` e utenti temporanei, backup di prova.

- [ ] **Step 5: Verifica finale**

```bash
docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/documents src/apis/document-types src/apis/backup src/apis/anomalies src/common/chunked-upload --maxWorkers=2; pnpm run type-check"
docker exec utenzepa-frontend-1 sh -c "node scripts/check-guida.mjs && npx ng build --configuration production 2>&1 | grep -E 'ERROR|Application bundle'"
```
Expected: test verdi, type-check pulito, build ok. Lint/prettier sui soli file nuovi o modificati (`pnpm exec prettier --write <file>`, poi `git diff --numstat` per scartare il rumore CRLF).

- [ ] **Step 6: Commit e PR**

```bash
git add frontend/src/app/pages/backup-import/backup-import.component.html frontend/src/app/pages/backup-import/backup-import.component.ts frontend/src/app/pages/backup-import/backup.service.ts frontend/public/guida/guida.md CLAUDE.md docs/roadmap-patrimonio.md publiccode.yml
git commit -m "feat(documents): backup option, guide and release v1.22.0"
git push -u origin feat/documenti
gh pr create --title "feat: documenti e riferimenti ad atti (v1.22.0)" --body-file <scratchpad>/pr-documenti.md --base main
```

Corpo della PR: sintesi della funzione, migration `1794100000000-Documents` (8 tabelle + 28 tipi), **nota di rilascio: aggiungere il volume `documents_data` al `docker-compose.yml` di produzione prima di caricare documenti**, verifica fatta, `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Merge e tag solo su indicazione dell'utente.
