# Allegati e atti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** allegati (file di un'entità, senza scheda) su immobili, impianti, verifiche, contratti immobiliari e di fornitura, e atti ufficiali (entità con estremi, file facoltativi) collegati N-N alle stesse entità.

**Architecture:** backend NestJS con tre moduli nuovi: `apis/attachments/` (tabella polimorfica come le foto, file su `ATTACHMENTS_DIR`, upload a pezzi con `ChunkedUploadService`, regole sui file in `attachment-file-policy.ts`), `apis/act-types/` (anagrafica Admin), `apis/acts/` (`@ManyToMany` con join table esplicite). Gli allegati di un atto sono allegati con `entity_type = 'act'`. Frontend Angular standalone: `app-attachments` riusato ovunque, `app-entity-documents` (Allegati + Atti collegati) nelle quattro schede, elenco e scheda Atti.

**Tech Stack:** NestJS 11, TypeORM (MySQL 8), class-validator, jest; Angular 22 + Material.

**Spec:** `docs/superpowers/specs/2026-10-12-documenti-design.md`

## Global Constraints

- Branch `feat/documenti`; release minor `v1.22.0` (`publiccode.yml` `softwareVersion`/`releaseDate`).
- Comandi Docker uno alla volta; jest sempre `--maxWorkers=2`, solo i file rilevanti: `docker exec utenzepa-api-1 pnpm exec jest <path> --maxWorkers=2`.
- Mai `git add .`/`-A`: file elencati. File CRLF: modifiche con script Python che preservano `\r\n`; dopo `prettier` nel container tenere solo i propri file (`git diff --numstat`).
- Niente HTTP 409: conflitti e duplicati → `BadRequestException` (400) con messaggio in italiano.
- Migration: generata nel container (`migration:generate`), tenuti solo gli statement della feature, composta in uno scratch path e spostata in `backend/src/database/migrations/` a contenuto finale; poi riga in `migrations`, `schema:log` senza statement sulle tabelle nuove, ciclo revert → up.
- Colonna stringa nullable: `type: 'varchar'` esplicito. Date: `@DateOnly()` nei DTO, `toIsoDate` nel frontend, mai `toISOString()`.
- `invalidWhereValuesBehavior: 'throw'`: mai valori potenzialmente `undefined` in una where object-criteria senza guardia.
- Ruoli: scrittura `@Roles('Admin', 'Operatore')`; download file solo `Admin`, `Operatore`; tipi di atto in scrittura solo `Admin`.
- File: tipi `pdf p7m doc docx odt xls xlsx ods csv txt jpg jpeg png tif tiff eml msg`; `ATTACHMENT_MAX_SIZE_MB` default 50; `ATTACHMENTS_DIR` default `<cwd>/attachments`.
- Nomi entità del log attività: `assets`, `plants`, `contract`, `utilizer_grant`, `acts`, `act_types` (una verifica registra sull'impianto).
- Frontend: `ChangeDetectionStrategy.Eager`, colori solo token (nuovo `--entity-act`), schede con `openSheet()`/`EntityNavigatorService`, servizi che non estendono `AbstractService` mettono `Authorization: Bearer` a mano.
- Ogni modifica visibile aggiorna `frontend/public/guida/guida.md` (data in testa); `scripts/check-guida.mjs` controlla le ancore.
- Nessun dato personale in test, commit, guida: solo nomi fittizi.

## Review Focus

- Nome file originale con `../`, barre, accenti o virgolette → salvato con nome generato, `Content-Disposition` con `filename*` UTF-8, nessun file fuori da `ATTACHMENTS_DIR` (test in Task 2 e Task 3).
- Estensione ammessa ma contenuto diverso (eseguibile o ZIP rinominato `.pdf`) → 400 «Il contenuto del file non corrisponde al tipo .pdf», nessun file residuo (test in Task 2 e Task 3).
- Allegato su un'entità inesistente o cancellata (anche un atto cancellato) → 400, niente file orfani su disco (test in Task 3).
- Collegare un atto due volte alla stessa entità o a un'entità cancellata → idempotente / 400 «… non trovato» (test in Task 5).
- Atto o entità cancellati: i loro allegati non si scaricano più (400 «Atto non trovato»), quelli ripristinati tornano scaricabili (test in Task 3).
- DB ripristinato senza la cartella allegati (backup solo SQL): download → 400 «File non disponibile sul server», non 500 (test in Task 3).

---

### Task 1: Entità, migration e tipi di atto

**Files:**
- Create: `backend/src/apis/attachments/enum/attachment-entity-type.enum.ts`
- Create: `backend/src/apis/attachments/entity/attachment.entity.ts`
- Create: `backend/src/apis/act-types/entity/act-type.entity.ts`
- Create: `backend/src/apis/acts/entity/act.entity.ts`
- Create: `backend/src/database/migrations/1794100000000-AttachmentsAndActs.ts`

**Interfaces:**
- Produces: `enum AttachmentEntityType { ASSET='asset', PLANT='plant', PLANT_INSPECTION='plant_inspection', UTILIZER_GRANT='utilizer_grant', CONTRACT='contract', ACT='act' }`; classi `Attachment`, `ActType`, `Act` (relazioni `actType`, `assets`, `plants`, `utilizerGrants`, `contracts`); tabelle `attachments`, `act_types`, `acts`, `act_assets`, `act_plants`, `act_utilizer_grants`, `act_contracts`.

- [ ] **Step 1: Enum e entità `Attachment`**

```ts
// backend/src/apis/attachments/enum/attachment-entity-type.enum.ts
// Entità a cui si allegano file. 'act' = file di un atto (apis/acts).
export enum AttachmentEntityType {
  ASSET = 'asset',
  PLANT = 'plant',
  PLANT_INSPECTION = 'plant_inspection',
  UTILIZER_GRANT = 'utilizer_grant',
  CONTRACT = 'contract',
  ACT = 'act',
}
```

```ts
// backend/src/apis/attachments/entity/attachment.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { AttachmentEntityType } from '../enum/attachment-entity-type.enum';

// File allegato a un'entità (polimorfico, come le foto). Su disco in
// <ATTACHMENTS_DIR>/<entity_type>/<entity_id>/<stored_name>; stored_name è
// generato (uuid + estensione): nessun input dell'utente nel path.
@Entity('attachments')
@Index(['entity_type', 'entity_id', 'deleted'])
export class Attachment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'enum', enum: AttachmentEntityType })
  entity_type: AttachmentEntityType;

  @Column({ type: 'int' })
  entity_id: number;

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

- [ ] **Step 2: Entità `ActType`**

```ts
// backend/src/apis/act-types/entity/act-type.entity.ts
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

// Tipo di atto (delibera, determina, atto notarile…), modificabile dagli Admin.
@Entity('act_types')
export class ActType {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 150 })
  name: string;

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

- [ ] **Step 3: Entità `Act`**

```ts
// backend/src/apis/acts/entity/act.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { ActType } from '@apis/act-types/entity/act-type.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';

// Atto ufficiale (delibera, determina, atto notarile…): estremi, file
// facoltativi (allegati con entity_type 'act'), collegato N-N alle entità.
@Entity('acts')
export class Act {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  act_type_id: number;

  @ManyToOne(() => ActType)
  @JoinColumn({ name: 'act_type_id' })
  actType: ActType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  number: string | null;

  @Column({ type: 'date', nullable: true })
  act_date: string | null;

  @Column({ length: 500 })
  subject: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  issuer: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  protocol_number: string | null;

  @Column({ type: 'date', nullable: true })
  protocol_date: string | null;

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

  @ManyToMany(() => Asset)
  @JoinTable({
    name: 'act_assets',
    joinColumn: { name: 'act_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'asset_id', referencedColumnName: 'id' },
  })
  assets: Asset[];

  @ManyToMany(() => Plant)
  @JoinTable({
    name: 'act_plants',
    joinColumn: { name: 'act_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'plant_id', referencedColumnName: 'id' },
  })
  plants: Plant[];

  @ManyToMany(() => UtilizerGrant)
  @JoinTable({
    name: 'act_utilizer_grants',
    joinColumn: { name: 'act_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'utilizer_grant_id', referencedColumnName: 'id' },
  })
  utilizerGrants: UtilizerGrant[];

  @ManyToMany(() => Contract)
  @JoinTable({
    name: 'act_contracts',
    joinColumn: { name: 'act_id', referencedColumnName: 'id' },
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

- [ ] **Step 4: Generare la migration nel container**

```bash
docker exec -u root utenzepa-api-1 sh -c "node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate -d src/database/data-source.ts /tmp/AttachmentsAndActs" 2>&1 | tail -3
docker exec utenzepa-api-1 sh -c "cat /tmp/*-AttachmentsAndActs.ts" > "$SCRATCH/generated.ts"
```

Expected: file generato. Tenere in `up`/`down` solo gli statement su `attachments`, `act_types`, `acts`, `act_assets`, `act_plants`, `act_utilizer_grants`, `act_contracts`.

- [ ] **Step 5: Comporre la migration nello scratch**

Classe `AttachmentsAndActs1794100000000`, `name = 'AttachmentsAndActs1794100000000'`, parametro `q: QueryRunner` (stile `1793900000000-UtilityTransferRequired.ts`). In coda a `up`:

```ts
// Tipi di atto iniziali (configurazione, modificabili dagli Admin).
const TYPES = [
  'Delibera di Giunta',
  'Delibera di Consiglio',
  'Determina dirigenziale',
  'Decreto',
  'Ordinanza',
  'Atto notarile',
  'Autorizzazione / nulla osta / parere',
];
for (const [i, name] of TYPES.entries()) {
  await q.query(
    'INSERT INTO `act_types` (`name`, `sort_order`, `created_by_user_id`, `updated_by_user_id`) VALUES (?, ?, 1, 1)',
    [name, (i + 1) * 10],
  );
}
```

`down`: drop in ordine inverso come generato.

- [ ] **Step 6: Spostare e verificare**

```bash
mv "$SCRATCH/1794100000000-AttachmentsAndActs.ts" backend/src/database/migrations/
```
Riga `AttachmentsAndActs1794100000000` in `migrations` (altrimenti `docker restart utenzepa-api-1`); `SELECT COUNT(*) FROM act_types` → 7; `schema:log` senza statement sulle 7 tabelle; `migration:revert` → riavvio → di nuovo presente con 7 tipi.

- [ ] **Step 7: Commit**

```bash
git add backend/src/apis/attachments/enum/attachment-entity-type.enum.ts backend/src/apis/attachments/entity/attachment.entity.ts backend/src/apis/act-types/entity/act-type.entity.ts backend/src/apis/acts/entity/act.entity.ts backend/src/database/migrations/1794100000000-AttachmentsAndActs.ts
git commit -m "feat(attachments): entities, migration and initial act types"
```

---

### Task 2: Regole sui file (tipi, contenuto, nome)

**Files:**
- Create: `backend/src/apis/attachments/attachment-file-policy.ts`
- Test: `backend/src/apis/attachments/attachment-file-policy.spec.ts`

**Interfaces:**
- Produces: `ALLOWED_EXTENSIONS: readonly string[]`; `extensionOf(name: string): string`; `checkFile(originalName: string, head: Buffer): { ext: string; mime: string }` (lancia `BadRequestException`); `contentDisposition(originalName: string, inline: boolean): string`; `maxSizeBytes(): number`.

- [ ] **Step 1: Test che falliscono**

```ts
// backend/src/apis/attachments/attachment-file-policy.spec.ts
import { BadRequestException } from '@nestjs/common';
import { checkFile, contentDisposition, extensionOf, maxSizeBytes } from './attachment-file-policy';

const PDF = Buffer.from('%PDF-1.7\n...');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const EXE = Buffer.from('MZ\x90\x00\x03\x00');

describe('extensionOf', () => {
  it('minuscolo, ultima estensione', () => {
    expect(extensionOf('Delibera 12.2024.PDF')).toBe('pdf');
    expect(extensionOf('atto.pdf.p7m')).toBe('p7m');
    expect(extensionOf('senza_estensione')).toBe('');
    expect(extensionOf('cartella\\file.docx')).toBe('docx');
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

  it('estensione non ammessa: 400', () => {
    expect(() => checkFile('archivio.zip', ZIP)).toThrow(BadRequestException);
    expect(() => checkFile('setup.exe', EXE)).toThrow('Tipo di file non ammesso (.exe)');
    expect(() => checkFile('senza_estensione', PDF)).toThrow('Tipo di file non ammesso');
  });

  it('contenuto diverso dall’estensione: 400', () => {
    expect(() => checkFile('finto.pdf', EXE)).toThrow('Il contenuto del file non corrisponde al tipo .pdf');
    expect(() => checkFile('finto.pdf', ZIP)).toThrow('non corrisponde al tipo .pdf');
    expect(() => checkFile('finto.txt', Buffer.from([0x4d, 0x5a, 0x00, 0x00]))).toThrow('non corrisponde al tipo .txt');
  });
});

describe('contentDisposition', () => {
  it('accenti e virgolette: fallback ASCII e filename* UTF-8', () => {
    expect(contentDisposition('Verbale "consegna" è.pdf', false)).toBe(
      `attachment; filename="Verbale _consegna_ _.pdf"; filename*=UTF-8''Verbale%20%22consegna%22%20%C3%A8.pdf`,
    );
  });

  it('inline e percorso rimosso dal nome', () => {
    expect(contentDisposition('../../etc/passwd.pdf', true)).toMatch(/^inline; filename="passwd.pdf"/);
  });
});

describe('maxSizeBytes', () => {
  const old = process.env.ATTACHMENT_MAX_SIZE_MB;
  afterEach(() => {
    if (old === undefined) delete process.env.ATTACHMENT_MAX_SIZE_MB;
    else process.env.ATTACHMENT_MAX_SIZE_MB = old;
  });

  it('default 50 MB, configurabile, valori non validi → default', () => {
    delete process.env.ATTACHMENT_MAX_SIZE_MB;
    expect(maxSizeBytes()).toBe(50 * 1024 * 1024);
    process.env.ATTACHMENT_MAX_SIZE_MB = '5';
    expect(maxSizeBytes()).toBe(5 * 1024 * 1024);
    process.env.ATTACHMENT_MAX_SIZE_MB = 'abc';
    expect(maxSizeBytes()).toBe(50 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/attachments/attachment-file-policy.spec.ts --maxWorkers=2`
Expected: FAIL «Cannot find module './attachment-file-policy'».

- [ ] **Step 3: Implementazione**

```ts
// backend/src/apis/attachments/attachment-file-policy.ts
import { BadRequestException } from '@nestjs/common';
import * as path from 'path';

// Tipi ammessi per gli allegati: estensione + firma del contenuto (il MIME del
// browser non conta, lo decide il server). Niente archivi né eseguibili; il
// p7m (firmato digitalmente) si conserva così com'è.
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
  const base = path.posix.basename(name.replace(/\\/g, '/'));
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
  const base = path.posix.basename(originalName.replace(/\\/g, '/'));
  const ascii = base.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(base).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function maxSizeBytes(): number {
  const mb = parseInt(process.env.ATTACHMENT_MAX_SIZE_MB ?? '50', 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
}
```

- [ ] **Step 4: Verificare che passi** — stesso comando, Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/attachments/attachment-file-policy.ts backend/src/apis/attachments/attachment-file-policy.spec.ts
git commit -m "feat(attachments): file type, signature and name rules"
```

---

### Task 3: API allegati

**Files:**
- Create: `backend/src/apis/attachments/dto/attachment-query.dto.ts`
- Create: `backend/src/apis/attachments/dto/attachment-finalize.dto.ts`
- Create: `backend/src/apis/attachments/dto/update-attachment.dto.ts`
- Create: `backend/src/apis/attachments/attachments.service.ts`
- Create: `backend/src/apis/attachments/attachments.controller.ts`
- Create: `backend/src/apis/attachments/attachments.module.ts`
- Modify: `backend/src/app.module.ts`, `docker-compose.yml`, `docker-compose.override.yml`, `.env.example`
- Test: `backend/src/apis/attachments/attachments.service.spec.ts`

**Interfaces:**
- Consumes: `Attachment`, `AttachmentEntityType` (Task 1); `checkFile`, `contentDisposition`, `maxSizeBytes` (Task 2); `ChunkedUploadModule`/`ChunkedUploadService`; `AuditLogService` (globale).
- Produces:
  - `type AttachmentRow = Attachment & { inspection: { id: number; kind: string } | null }`
  - `AttachmentsService.dir: string`, `list(type, id): Promise<AttachmentRow[]>`, `saveChunk(dto: UploadChunkDto, buffer: Buffer): void`, `finalize(dto: AttachmentFinalizeDto, userId: number): Promise<Attachment>`, `open(id): Promise<{ attachment: Attachment; absolutePath: string }>`, `update(id, dto, userId)`, `remove(id, userId)`, `countByEntity(type, ids: number[]): Promise<Map<number, number>>`
  - Rotte: `GET /attachments`, `POST /attachments/chunk`, `POST /attachments/finalize`, `GET /attachments/:id/file`, `PATCH /attachments/:id`, `DELETE /attachments/:id`

- [ ] **Step 1: DTO**

```ts
// attachment-query.dto.ts
import { IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AttachmentEntityType } from '../enum/attachment-entity-type.enum';

export class AttachmentQueryDto {
  @IsEnum(AttachmentEntityType)
  entity_type: AttachmentEntityType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  entity_id: number;
}
```

```ts
// attachment-finalize.dto.ts
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AttachmentQueryDto } from './attachment-query.dto';

export class AttachmentFinalizeDto extends AttachmentQueryDto {
  @IsNotEmpty()
  @IsString()
  uploadId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalChunks: number;

  @IsNotEmpty({ message: 'Nome del file mancante' })
  @IsString()
  @MaxLength(255)
  originalFilename: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;
}
```

```ts
// update-attachment.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAttachmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;
}
```

- [ ] **Step 2: Test che falliscono**

```ts
// attachments.service.spec.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';
import { AttachmentsService } from './attachments.service';
import { AttachmentEntityType as T } from './enum/attachment-entity-type.enum';

describe('AttachmentsService', () => {
  let dir: string;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let query: jest.Mock;
  let audit: { record: jest.Mock };
  let service: AttachmentsService;

  const upload = (id: string, content: Buffer) =>
    service.saveChunk({ uploadId: id, chunkIndex: 0, totalChunks: 1 }, content);
  const finalize = (id: string, name: string, type = T.CONTRACT, entityId = 3) =>
    service.finalize(
      { uploadId: id, totalChunks: 1, originalFilename: name, entity_type: type, entity_id: entityId },
      1,
    );

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attachments-'));
    process.env.ATTACHMENTS_DIR = dir;
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 7, ...x })),
    };
    // Esistenza del proprietario: SELECT ... FROM <tabella> WHERE id = ? AND deleted = 0
    query = jest.fn().mockResolvedValue([{ id: 3, plant_id: 5, kind: 'Verifica biennale' }]);
    audit = { record: jest.fn() };
    service = new AttachmentsService(repo as never, { query } as never, new ChunkedUploadService(), audit as never);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.ATTACHMENTS_DIR;
    delete process.env.ATTACHMENT_MAX_SIZE_MB;
  });

  it('finalize: pdf sotto <dir>/<tipo>/<id>/ con nome generato, audit sul proprietario', async () => {
    upload('u1', Buffer.from('%PDF-1.7 contenuto'));
    const a = await finalize('u1', '../../Contratto firmato.pdf');
    expect(a.original_name).toBe('Contratto firmato.pdf');
    expect(a.mime_type).toBe('application/pdf');
    expect(a.stored_name).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(fs.existsSync(path.join(dir, 'contract', '3', a.stored_name))).toBe(true);
    expect(fs.readdirSync(path.join(dir, 'tmp'))).toEqual([]);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ entityName: 'contract', entityId: 3 }));
  });

  it('verifica: audit sull’impianto', async () => {
    upload('u5', Buffer.from('%PDF-1.7'));
    await finalize('u5', 'verbale.pdf', T.PLANT_INSPECTION, 3);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ entityName: 'plants', entityId: 5 }));
  });

  it('contenuto non valido → 400, nessun file residuo', async () => {
    upload('u2', Buffer.from('MZ eseguibile'));
    await expect(finalize('u2', 'atto.pdf')).rejects.toThrow('non corrisponde al tipo .pdf');
    expect(fs.existsSync(path.join(dir, 'contract'))).toBe(false);
    expect(fs.readdirSync(path.join(dir, 'tmp'))).toEqual([]);
  });

  it('proprietario inesistente o cancellato → 400, nessun file residuo', async () => {
    query.mockResolvedValue([]);
    upload('u3', Buffer.from('%PDF-1.7'));
    await expect(finalize('u3', 'a.pdf', T.ACT, 9)).rejects.toThrow('Atto non trovato');
    expect(fs.readdirSync(path.join(dir, 'tmp'))).toEqual([]);
  });

  it('chunk oltre la dimensione massima → 400', () => {
    process.env.ATTACHMENT_MAX_SIZE_MB = '1';
    expect(() => upload('u4', Buffer.alloc(1024 * 1024 + 1))).toThrow('File troppo grande (massimo 1 MB)');
  });

  it('open: allegato cancellato → 400; proprietario cancellato → 400; file mancante → 400 leggibile', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    await expect(service.open(9)).rejects.toThrow('Allegato non trovato');
    repo.findOne.mockResolvedValueOnce({ id: 9, entity_type: 'act', entity_id: 4, stored_name: 'x.pdf', deleted: false });
    query.mockResolvedValueOnce([]);
    await expect(service.open(9)).rejects.toThrow('Atto non trovato');
    repo.findOne.mockResolvedValueOnce({ id: 9, entity_type: 'contract', entity_id: 3, stored_name: 'x.pdf', deleted: false });
    await expect(service.open(9)).rejects.toThrow('File non disponibile sul server');
  });

  it('list(plant): allegati dell’impianto e delle sue verifiche non cancellate', async () => {
    query.mockResolvedValue([{ id: 11, kind: 'Verifica biennale' }]);
    repo.find
      .mockResolvedValueOnce([{ id: 1, entity_type: 'plant', entity_id: 5 }])
      .mockResolvedValueOnce([{ id: 2, entity_type: 'plant_inspection', entity_id: 11 }]);
    const rows = await service.list(T.PLANT, 5);
    expect(rows.map((r) => [r.id, r.inspection])).toEqual([
      [1, null],
      [2, { id: 11, kind: 'Verifica biennale' }],
    ]);
  });
});
```

- [ ] **Step 3: Verificare che fallisca**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/attachments/attachments.service.spec.ts --maxWorkers=2`
Expected: FAIL «Cannot find module './attachments.service'».

- [ ] **Step 4: Service**

```ts
// backend/src/apis/attachments/attachments.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';
import { UploadChunkDto } from '@common/chunked-upload/dto/upload-chunk.dto';
import { AuditLogService } from '@apis/audit-log/audit-log.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Attachment } from './entity/attachment.entity';
import { AttachmentEntityType as T } from './enum/attachment-entity-type.enum';
import { AttachmentFinalizeDto } from './dto/attachment-finalize.dto';
import { UpdateAttachmentDto } from './dto/update-attachment.dto';
import { checkFile, maxSizeBytes } from './attachment-file-policy';

export type AttachmentRow = Attachment & { inspection: { id: number; kind: string } | null };

const HEAD_BYTES = 8192;

// Proprietario: tabella per il controllo di esistenza, entità del log attività,
// etichetta nei messaggi. La verifica registra sull'impianto.
const OWNERS: Record<T, { table: string; audit: string; label: string }> = {
  [T.ASSET]: { table: 'assets', audit: 'assets', label: 'Immobile' },
  [T.PLANT]: { table: 'plants', audit: 'plants', label: 'Impianto' },
  [T.PLANT_INSPECTION]: { table: 'plant_inspections', audit: 'plants', label: 'Verifica' },
  [T.UTILIZER_GRANT]: { table: 'utilizer_grant', audit: 'utilizer_grant', label: 'Contratto immobiliare' },
  [T.CONTRACT]: { table: 'contracts', audit: 'contract', label: 'Contratto di fornitura' },
  [T.ACT]: { table: 'acts', audit: 'acts', label: 'Atto' },
};

type Owner = { id: number; plant_id?: number; kind?: string };

// Allegati su disco: <ATTACHMENTS_DIR>/<entity_type>/<entity_id>/<uuid>.<ext>,
// pezzi temporanei in <ATTACHMENTS_DIR>/tmp. Nessun input dell'utente nei path.
@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment) private readonly repo: Repository<Attachment>,
    private readonly dataSource: DataSource,
    private readonly chunkedUpload: ChunkedUploadService,
    private readonly auditLog: AuditLogService,
  ) {}

  get dir(): string {
    return process.env.ATTACHMENTS_DIR ?? path.join(process.cwd(), 'attachments');
  }

  private get tmpDir(): string {
    return path.join(this.dir, 'tmp');
  }

  private pathOf(a: Pick<Attachment, 'entity_type' | 'entity_id' | 'stored_name'>): string {
    return path.join(this.dir, a.entity_type, String(a.entity_id), path.basename(a.stored_name));
  }

  // Proprietario non cancellato; per una verifica anche impianto e tipo.
  private async owner(type: T, id: number): Promise<Owner> {
    const o = OWNERS[type];
    const cols = type === T.PLANT_INSPECTION ? 'id, plant_id, kind' : 'id';
    const rows: Owner[] = await this.dataSource.query(
      `SELECT ${cols} FROM \`${o.table}\` WHERE id = ? AND deleted = 0`,
      [id],
    );
    if (!rows.length) throw new BadRequestException(`${o.label} non trovato`);
    return rows[0];
  }

  async list(type: T, id: number): Promise<AttachmentRow[]> {
    const order = { create_date: 'DESC' as const, id: 'DESC' as const };
    const own = await this.repo.find({
      where: { entity_type: type, entity_id: id, deleted: false },
      relations: { created_by: true },
      order,
    });
    const rows: AttachmentRow[] = own.map((a) => ({ ...a, inspection: null }));
    if (type !== T.PLANT) return rows;
    const inspections: { id: number; kind: string }[] = await this.dataSource.query(
      'SELECT id, kind FROM plant_inspections WHERE plant_id = ? AND deleted = 0',
      [id],
    );
    if (!inspections.length) return rows;
    const kindOf = new Map(inspections.map((i) => [Number(i.id), i.kind]));
    const fromInspections = await this.repo.find({
      where: { entity_type: T.PLANT_INSPECTION, entity_id: In([...kindOf.keys()]), deleted: false },
      relations: { created_by: true },
      order,
    });
    return [
      ...rows,
      ...fromInspections.map((a) => ({
        ...a,
        inspection: { id: a.entity_id, kind: kindOf.get(a.entity_id) ?? '' },
      })),
    ];
  }

  async countByEntity(type: T, ids: number[]): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    if (!ids.length) return out;
    const rows = await this.repo.find({
      where: { entity_type: type, entity_id: In(ids), deleted: false },
      select: { id: true, entity_id: true },
    });
    for (const r of rows) out.set(r.entity_id, (out.get(r.entity_id) ?? 0) + 1);
    return out;
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

  async finalize(dto: AttachmentFinalizeDto, userId: number): Promise<Attachment> {
    let assembled: string;
    try {
      assembled = this.chunkedUpload.assemble(dto.uploadId, dto.totalChunks, this.tmpDir, `${dto.uploadId}.upload`);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    try {
      const owner = await this.owner(dto.entity_type, dto.entity_id);
      const originalName = path.posix.basename(dto.originalFilename.replace(/\\/g, '/'));
      const fd = fs.openSync(assembled, 'r');
      const head = Buffer.alloc(HEAD_BYTES);
      const read = fs.readSync(fd, head, 0, HEAD_BYTES, 0);
      fs.closeSync(fd);
      const { ext, mime } = checkFile(originalName, head.subarray(0, read));
      const storedName = `${randomUUID()}.${ext}`;
      const target = this.pathOf({ entity_type: dto.entity_type, entity_id: dto.entity_id, stored_name: storedName });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const size = fs.statSync(assembled).size;
      fs.renameSync(assembled, target);
      const saved = await this.repo.save(
        this.repo.create({
          entity_type: dto.entity_type,
          entity_id: dto.entity_id,
          original_name: originalName,
          stored_name: storedName,
          mime_type: mime,
          size_bytes: size,
          description: dto.description?.trim() || null,
          created_by_user_id: userId,
          updated_by_user_id: userId,
        }),
      );
      await this.audit(dto.entity_type, owner, userId, 'attachment_added', null, originalName);
      return saved;
    } finally {
      if (fs.existsSync(assembled)) fs.unlinkSync(assembled);
    }
  }

  async open(id: number): Promise<{ attachment: Attachment; absolutePath: string }> {
    const attachment = await this.repo.findOne({ where: { id, deleted: false } });
    if (!attachment) throw new BadRequestException('Allegato non trovato');
    // Proprietario cancellato (es. atto eliminato): file non più scaricabili.
    await this.owner(attachment.entity_type, attachment.entity_id);
    const absolutePath = this.pathOf(attachment);
    if (!fs.existsSync(absolutePath)) throw new BadRequestException('File non disponibile sul server');
    return { attachment, absolutePath };
  }

  async update(id: number, dto: UpdateAttachmentDto, userId: number): Promise<Attachment> {
    const a = await this.repo.findOne({ where: { id, deleted: false } });
    if (!a) throw new BadRequestException('Allegato non trovato');
    const description = dto.description?.trim() || null;
    if (description !== a.description) {
      const owner = await this.owner(a.entity_type, a.entity_id);
      await this.audit(a.entity_type, owner, userId, 'attachment_description', a.description, description);
    }
    return this.repo.save({ ...a, description, updated_by_user_id: userId });
  }

  async remove(id: number, userId: number): Promise<void> {
    const a = await this.repo.findOne({ where: { id, deleted: false } });
    if (!a) throw new BadRequestException('Allegato non trovato');
    await this.repo.save({ ...a, deleted: true, updated_by_user_id: userId });
    const owner = await this.owner(a.entity_type, a.entity_id).catch(() => null);
    if (owner) await this.audit(a.entity_type, owner, userId, 'attachment_removed', a.original_name, null);
  }

  // Audit sul proprietario (per la verifica: sull'impianto, con il tipo di verifica).
  private async audit(
    type: T,
    owner: Owner,
    userId: number,
    field: string,
    oldValue: string | null,
    newValue: string | null,
  ): Promise<void> {
    const inspection = type === T.PLANT_INSPECTION;
    const label = (v: string | null) => (v && inspection ? `${owner.kind}: ${v}` : v);
    try {
      await this.auditLog.record({
        entityName: OWNERS[type].audit,
        entityId: inspection ? Number(owner.plant_id) : owner.id,
        action: AuditAction.UPDATE,
        userId,
        fields: [{ fieldName: field, oldValue: label(oldValue), newValue: label(newValue) }],
      });
    } catch (error) {
      console.error(`[AttachmentsService] Errore audit ${type} ${owner.id}`, error);
    }
  }
}
```

- [ ] **Step 5: Controller e modulo**

```ts
// attachments.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { UploadChunkDto } from '@common/chunked-upload/dto/upload-chunk.dto';
import { AttachmentRow, AttachmentsService } from './attachments.service';
import { Attachment } from './entity/attachment.entity';
import { AttachmentQueryDto } from './dto/attachment-query.dto';
import { AttachmentFinalizeDto } from './dto/attachment-finalize.dto';
import { UpdateAttachmentDto } from './dto/update-attachment.dto';
import { contentDisposition } from './attachment-file-policy';

@Controller('attachments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Get()
  list(@Query() q: AttachmentQueryDto): Promise<AttachmentRow[]> {
    return this.service.list(q.entity_type, q.entity_id);
  }

  @Roles('Admin', 'Operatore')
  @Post('chunk')
  @UseInterceptors(FileInterceptor('chunk'))
  chunk(@UploadedFile() chunk: Express.Multer.File, @Body() dto: UploadChunkDto): { received: boolean } {
    if (!chunk) throw new BadRequestException('Parte del file mancante');
    this.service.saveChunk(dto, chunk.buffer);
    return { received: true };
  }

  @Roles('Admin', 'Operatore')
  @Post('finalize')
  finalize(@Body() dto: AttachmentFinalizeDto, @CurrentUser() user: ICurrentUser): Promise<Attachment> {
    return this.service.finalize(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Get(':id/file')
  async file(
    @Param('id', ParseIntPipe) id: number,
    @Query('inline') inline: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { attachment, absolutePath } = await this.service.open(id);
    const preview =
      inline === '1' &&
      (attachment.mime_type === 'application/pdf' || attachment.mime_type.startsWith('image/'));
    res.set({
      'Content-Type': attachment.mime_type,
      'Content-Disposition': contentDisposition(attachment.original_name, preview),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(fs.createReadStream(absolutePath));
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttachmentDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Attachment> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
```

```ts
// attachments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChunkedUploadModule } from '@common/chunked-upload/chunked-upload.module';
import { Attachment } from './entity/attachment.entity';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment]), ChunkedUploadModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
```

`app.module.ts`: `AttachmentsModule` negli `imports`, accanto a `ComplexesModule`. `DataSource` si inietta senza decoratore, come in `AnomaliesService`.

- [ ] **Step 6: Volume e variabili**

`docker-compose.yml`, servizio `api`, accanto a `photos_data:/usr/src/app/photos`: `      - attachments_data:/usr/src/app/attachments`; in fondo a `volumes:` `  attachments_data:`. Stessa cosa in `docker-compose.override.yml` se ridefinisce i volumi dell'`api` (`grep -n photos docker-compose.override.yml`). `.env.example` sotto `PHOTO_MAX_SIZE_MB`:
```
# Allegati: cartella e dimensione massima per file (MB)
# ATTACHMENTS_DIR=/usr/src/app/attachments
# ATTACHMENT_MAX_SIZE_MB=50
```
Applicare in dev: `docker compose up -d` (un solo comando), poi `docker exec utenzepa-api-1 ls -ld /usr/src/app/attachments`.

- [ ] **Step 7: Verificare**

Run: `docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/attachments src/common/chunked-upload --maxWorkers=2; pnpm run type-check"`
Expected: PASS. Prova API (utente temporaneo Admin + uno in sola lettura, vedi `docs/claude/testing-e2e.md`): PDF piccolo in due chunk su un contratto di fornitura → 201; `GET /attachments?entity_type=contract&entity_id=<id>` lo elenca; download con `curl -D -` → `Content-Disposition` con `filename*`; stesso download con l'utente in sola lettura → 403; `.exe` rinominato `.pdf` → 400. Pulizia: righe di prova, cartella `attachments/contract/<id>` nel container, `audit_logs` e utenti temporanei.

- [ ] **Step 8: Commit**

```bash
git add backend/src/apis/attachments/dto backend/src/apis/attachments/attachments.service.ts backend/src/apis/attachments/attachments.service.spec.ts backend/src/apis/attachments/attachments.controller.ts backend/src/apis/attachments/attachments.module.ts backend/src/app.module.ts docker-compose.yml docker-compose.override.yml .env.example
git commit -m "feat(attachments): chunked upload, listing and restricted download"
```

---

### Task 4: API tipi di atto

**Files:**
- Create: `backend/src/apis/act-types/dto/create-act-type.dto.ts`, `update-act-type.dto.ts`
- Create: `backend/src/apis/act-types/act-types.service.ts`, `act-types.controller.ts`, `act-types.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/apis/act-types/act-types.service.spec.ts`

**Interfaces:**
- Consumes: `ActType`, `Act` (Task 1), `BaseService`.
- Produces: `ActTypesService.findAll()`, `create`, `update`, `remove`; rotte `GET/POST /act-types`, `PATCH/DELETE /act-types/:id` (scrittura solo Admin).

- [ ] **Step 1: DTO**

```ts
// create-act-type.dto.ts
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateActTypeDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Il nome è obbligatorio' })
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}
```

```ts
// update-act-type.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateActTypeDto } from './create-act-type.dto';

export class UpdateActTypeDto extends PartialType(CreateActTypeDto) {}
```

Prima di scrivere: `grep -rn "PartialType" backend/src/apis --include=*.dto.ts | head -2` e usare lo stesso import degli altri DTO di update.

- [ ] **Step 2: Test che falliscono**

```ts
// act-types.service.spec.ts
import { ActTypesService } from './act-types.service';

describe('ActTypesService', () => {
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let acts: { count: jest.Mock };
  let service: ActTypesService;

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 1, ...x })),
    };
    acts = { count: jest.fn().mockResolvedValue(0) };
    service = new ActTypesService(repo as never, acts as never);
  });

  it('elenco ordinato, senza cancellati', async () => {
    await service.findAll();
    expect(repo.find).toHaveBeenCalledWith({ where: { deleted: false }, order: { sort_order: 'ASC', name: 'ASC' } });
  });

  it('nome già usato da un tipo non cancellato: 400', async () => {
    repo.findOne.mockResolvedValue({ id: 5, name: 'Decreto' });
    await expect(service.create({ name: 'decreto' }, 1)).rejects.toThrow('Esiste già un tipo di atto «Decreto»');
  });

  it('non eliminabile se usato', async () => {
    repo.findOne.mockResolvedValue({ id: 5, name: 'Decreto', deleted: false });
    acts.count.mockResolvedValue(3);
    await expect(service.remove(5, 1)).rejects.toThrow('usato da 3 atti');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('eliminabile se non usato: cancellazione logica', async () => {
    repo.findOne.mockResolvedValue({ id: 5, name: 'Decreto', deleted: false });
    await service.remove(5, 1);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 5, deleted: true, updated_by_user_id: 1 }));
  });
});
```

- [ ] **Step 3: Verificare che fallisca** — `docker exec utenzepa-api-1 pnpm exec jest src/apis/act-types --maxWorkers=2` → FAIL «Cannot find module».

- [ ] **Step 4: Service, controller, modulo**

```ts
// act-types.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Act } from '@apis/acts/entity/act.entity';
import { ActType } from './entity/act-type.entity';
import { CreateActTypeDto } from './dto/create-act-type.dto';
import { UpdateActTypeDto } from './dto/update-act-type.dto';

@Injectable()
export class ActTypesService extends BaseService<ActType, CreateActTypeDto, UpdateActTypeDto> {
  protected readonly entityName = 'act_types';
  protected readonly relations: string[] = [];

  constructor(
    @InjectRepository(ActType) protected readonly repo: Repository<ActType>,
    @InjectRepository(Act) private readonly actRepo: Repository<Act>,
  ) {
    super();
  }

  findAll(): Promise<ActType[]> {
    return this.repo.find({ where: { deleted: false }, order: { sort_order: 'ASC', name: 'ASC' } });
  }

  async create(dto: CreateActTypeDto, userId: number): Promise<ActType> {
    await this.assertNameFree(dto.name, null);
    return super.create(dto, userId);
  }

  async update(id: number, dto: UpdateActTypeDto, userId: number): Promise<ActType> {
    if (dto.name !== undefined) await this.assertNameFree(dto.name, id);
    return super.update(id, dto, userId);
  }

  async remove(id: number, userId: number): Promise<void> {
    const type = await this.repo.findOne({ where: { id, deleted: false } });
    if (!type) throw new BadRequestException('Tipo di atto non trovato');
    const used = await this.actRepo.count({ where: { act_type_id: id, deleted: false } });
    if (used > 0) {
      throw new BadRequestException(
        `Il tipo «${type.name}» è usato da ${used} atti: cambiane il tipo prima di eliminarlo`,
      );
    }
    await this.repo.save({ ...type, deleted: true, updated_by_user_id: userId });
    await this.recordAudit(AuditAction.DELETE, id, userId, []);
  }

  // Confronto senza maiuscole (collation MySQL), solo tra i non cancellati.
  private async assertNameFree(name: string, selfId: number | null): Promise<void> {
    const other = await this.repo.findOne({ where: { name: name.trim(), deleted: false } });
    if (other && other.id !== selfId) {
      throw new BadRequestException(`Esiste già un tipo di atto «${other.name}»`);
    }
  }
}
```

```ts
// act-types.controller.ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { ActTypesService } from './act-types.service';
import { ActType } from './entity/act-type.entity';
import { CreateActTypeDto } from './dto/create-act-type.dto';
import { UpdateActTypeDto } from './dto/update-act-type.dto';

@Controller('act-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActTypesController {
  constructor(private readonly service: ActTypesService) {}

  @Get()
  list(): Promise<ActType[]> {
    return this.service.findAll();
  }

  @Roles('Admin')
  @Post()
  create(@Body() dto: CreateActTypeDto, @CurrentUser() user: ICurrentUser): Promise<ActType> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActTypeDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ActType> {
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
// act-types.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Act } from '@apis/acts/entity/act.entity';
import { ActType } from './entity/act-type.entity';
import { ActTypesService } from './act-types.service';
import { ActTypesController } from './act-types.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ActType, Act])],
  controllers: [ActTypesController],
  providers: [ActTypesService],
})
export class ActTypesModule {}
```

`app.module.ts`: `ActTypesModule` negli `imports`.

- [ ] **Step 5: Verificare** — `docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/act-types --maxWorkers=2; pnpm run type-check"` → PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/act-types backend/src/app.module.ts
git commit -m "feat(acts): act types API"
```

---

### Task 5: API atti (anagrafica e collegamenti)

**Files:**
- Create: `backend/src/apis/acts/act-links.ts`
- Create: `backend/src/apis/acts/dto/create-act.dto.ts`, `update-act.dto.ts`, `search-act.dto.ts`, `act-link.dto.ts`
- Create: `backend/src/apis/acts/acts.service.ts`, `acts.controller.ts`, `acts.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/apis/acts/acts.service.spec.ts`

**Interfaces:**
- Consumes: `Act`, `ActType` (Task 1); `AttachmentsService.countByEntity` e `AttachmentEntityType.ACT` (Task 3).
- Produces:
  - `LINK_ENTITIES = ['asset', 'plant', 'utilizer_grant', 'contract'] as const`; `type ActLinkEntity`; `LINKS: Record<ActLinkEntity, { relation; idsField; label }>`
  - `type ActRow = Act & { file_count: number; link_count: number }`
  - `ActsService.findAll(filters)`, `findOneOrFail(id)`, `byEntity(entity, id)`, `create`, `update`, `remove`, `restore`, `link`, `unlink`
  - Rotte: `GET /acts`, `GET /acts/by-entity/:entity/:id`, `GET /acts/:id`, `POST /acts`, `PATCH /acts/:id`, `DELETE /acts/:id`, `POST /acts/:id/restore`, `POST /acts/:id/links`, `DELETE /acts/:id/links`

- [ ] **Step 1: Collegamenti e DTO**

```ts
// act-links.ts
// Entità collegabili a un atto: relazione TypeORM, campo degli id nei DTO,
// etichetta nei messaggi.
export const LINK_ENTITIES = ['asset', 'plant', 'utilizer_grant', 'contract'] as const;
export type ActLinkEntity = (typeof LINK_ENTITIES)[number];

export const LINKS = {
  asset: { relation: 'assets', idsField: 'asset_ids', label: 'Immobile' },
  plant: { relation: 'plants', idsField: 'plant_ids', label: 'Impianto' },
  utilizer_grant: { relation: 'utilizerGrants', idsField: 'utilizer_grant_ids', label: 'Contratto immobiliare' },
  contract: { relation: 'contracts', idsField: 'contract_ids', label: 'Contratto di fornitura' },
} as const satisfies Record<ActLinkEntity, { relation: string; idsField: string; label: string }>;
```

```ts
// create-act.dto.ts
import { ArrayUnique, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { DateOnly } from '@common/decorators/date-only.decorator';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() ? value.trim() : null) : value;

export class CreateActDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  act_type_id: number;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100)
  number?: string | null;

  @IsOptional()
  @DateOnly()
  act_date?: string | null;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: "L'oggetto è obbligatorio" })
  @MaxLength(500)
  subject: string;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(255)
  issuer?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100)
  protocol_number?: string | null;

  @IsOptional()
  @DateOnly()
  protocol_date?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  asset_ids?: number[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  plant_ids?: number[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  utilizer_grant_ids?: number[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  contract_ids?: number[];
}
```

Verificare con `grep -n "DateOnly" backend/src/apis/utility/dto/create-utility.dto.ts | head -2` che `@DateOnly()` si usi insieme a `@IsOptional()` come sopra.

```ts
// update-act.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateActDto } from './create-act.dto';

// Collegamenti: campo assente = invariati, presente = sostituiti.
export class UpdateActDto extends PartialType(CreateActDto) {}
```

```ts
// search-act.dto.ts
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const bool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class SearchActDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  act_type_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Transform(bool)
  without_files?: boolean;

  @IsOptional()
  @IsIn(['asset', 'plant', 'utilizer_grant', 'contract', 'none'])
  linked_to?: string;

  @IsOptional()
  @Transform(bool)
  deleted?: boolean;
}
```

```ts
// act-link.dto.ts
import { IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ActLinkEntity, LINK_ENTITIES } from '../act-links';

export class ActLinkDto {
  @IsIn(LINK_ENTITIES as unknown as string[])
  entity: ActLinkEntity;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id: number;
}
```

- [ ] **Step 2: Test che falliscono**

```ts
// acts.service.spec.ts
import { ActsService } from './acts.service';

const repo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  count: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn(async (x) => ({ id: 10, ...x })),
});

const act = (extra = {}) => ({
  id: 10,
  act_type_id: 1,
  subject: 'Acquisizione immobili',
  act_date: '2024-04-03',
  deleted: false,
  assets: [],
  plants: [],
  utilizerGrants: [],
  contracts: [],
  ...extra,
});

describe('ActsService', () => {
  let acts: ReturnType<typeof repo>;
  let types: ReturnType<typeof repo>;
  let targets: Record<string, ReturnType<typeof repo>>;
  let attachments: { countByEntity: jest.Mock };
  let service: ActsService;

  beforeEach(() => {
    acts = repo();
    types = repo();
    targets = { asset: repo(), plant: repo(), utilizer_grant: repo(), contract: repo() };
    attachments = { countByEntity: jest.fn().mockResolvedValue(new Map()) };
    service = new ActsService(
      acts as never,
      types as never,
      targets.asset as never,
      targets.plant as never,
      targets.utilizer_grant as never,
      targets.contract as never,
      attachments as never,
    );
    types.findOne.mockResolvedValue({ id: 1, name: 'Delibera di Giunta', deleted: false });
  });

  it('create: tipo inesistente → 400', async () => {
    types.findOne.mockResolvedValue(null);
    await expect(service.create({ act_type_id: 99, subject: 'x' }, 1)).rejects.toThrow('Tipo di atto non trovato');
  });

  it('create: oggetto solo spazi → 400', async () => {
    await expect(service.create({ act_type_id: 1, subject: '   ' }, 1)).rejects.toThrow("L'oggetto è obbligatorio");
  });

  it('create: immobile inesistente o cancellato → 400', async () => {
    targets.asset.count.mockResolvedValue(1);
    await expect(service.create({ act_type_id: 1, subject: 'x', asset_ids: [3, 4] }, 1)).rejects.toThrow(
      'Immobile non trovato',
    );
    expect(targets.asset.count).toHaveBeenCalledWith({ where: expect.objectContaining({ deleted: false }) });
  });

  it('create con collegamenti validi: solo le relazioni inviate', async () => {
    targets.asset.count.mockResolvedValue(2);
    acts.findOne.mockResolvedValue(act());
    await service.create({ act_type_id: 1, subject: 'x', asset_ids: [3, 4] }, 1);
    const saved = acts.save.mock.calls[0][0];
    expect(saved.assets).toEqual([{ id: 3 }, { id: 4 }]);
    expect(saved.plants).toBeUndefined();
  });

  it('update senza collegamenti: relazioni non toccate', async () => {
    acts.findOne.mockResolvedValue(act({ assets: [{ id: 3 }] }));
    jest.spyOn(Object.getPrototypeOf(ActsService.prototype), 'update').mockResolvedValue(act() as never);
    await service.update(10, { subject: 'Nuovo oggetto' }, 1);
    expect(acts.save).not.toHaveBeenCalled();
  });

  it('link già presente e unlink assente: nessun salvataggio', async () => {
    acts.findOne.mockResolvedValue(act({ assets: [{ id: 3, deleted: false }] }));
    targets.asset.count.mockResolvedValue(1);
    await service.link(10, 'asset', 3, 1);
    await service.unlink(10, 'asset', 4, 1);
    expect(acts.save).not.toHaveBeenCalled();
  });

  it('link su atto cancellato → 400', async () => {
    acts.findOne.mockResolvedValue(null);
    await expect(service.link(10, 'asset', 3, 1)).rejects.toThrow('Atto non trovato');
  });

  it('findAll: conteggi (file, collegamenti non cancellati) e filtri', async () => {
    acts.find.mockResolvedValue([
      act({ id: 1, assets: [{ id: 3, deleted: false }, { id: 4, deleted: true }] }),
      act({ id: 2, act_date: '2019-01-10' }),
    ]);
    attachments.countByEntity.mockResolvedValue(new Map([[1, 2]]));
    const all = await service.findAll({});
    expect(all.map((a) => [a.id, a.file_count, a.link_count])).toEqual([
      [1, 2, 1],
      [2, 0, 0],
    ]);
    expect((await service.findAll({ without_files: true })).map((a) => a.id)).toEqual([2]);
    expect((await service.findAll({ linked_to: 'none' })).map((a) => a.id)).toEqual([2]);
    expect((await service.findAll({ linked_to: 'asset' })).map((a) => a.id)).toEqual([1]);
    expect((await service.findAll({ year: 2019 })).map((a) => a.id)).toEqual([2]);
  });

  it('byEntity: atti non cancellati collegati all’entità', async () => {
    await service.byEntity('contract', 7);
    expect(acts.find.mock.calls[0][0].where).toEqual({ deleted: false, contracts: { id: 7 } });
  });
});
```

- [ ] **Step 3: Verificare che fallisca** — `docker exec utenzepa-api-1 pnpm exec jest src/apis/acts --maxWorkers=2` → FAIL «Cannot find module».

- [ ] **Step 4: Service**

```ts
// backend/src/apis/acts/acts.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { ActType } from '@apis/act-types/entity/act-type.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { AttachmentsService } from '@apis/attachments/attachments.service';
import { AttachmentEntityType } from '@apis/attachments/enum/attachment-entity-type.enum';
import { Act } from './entity/act.entity';
import { CreateActDto } from './dto/create-act.dto';
import { UpdateActDto } from './dto/update-act.dto';
import { SearchActDto } from './dto/search-act.dto';
import { ActLinkEntity, LINK_ENTITIES, LINKS } from './act-links';

export type ActRow = Act & { file_count: number; link_count: number };

const RELATIONS = { actType: true, assets: true, plants: true, utilizerGrants: true, contracts: true } as const;
const LINK_FIELDS: string[] = LINK_ENTITIES.map((e) => LINKS[e].idsField);

const alive = <X extends { deleted?: boolean | number }>(xs: X[] | undefined): X[] =>
  (xs ?? []).filter((x) => !x.deleted);

@Injectable()
export class ActsService extends BaseService<Act, CreateActDto, UpdateActDto> {
  protected readonly entityName = 'acts';
  protected readonly relations = ['actType', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(Act) protected readonly repo: Repository<Act>,
    @InjectRepository(ActType) private readonly typeRepo: Repository<ActType>,
    @InjectRepository(Asset) private readonly assetRepo: Repository<Asset>,
    @InjectRepository(Plant) private readonly plantRepo: Repository<Plant>,
    @InjectRepository(UtilizerGrant) private readonly grantRepo: Repository<UtilizerGrant>,
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    private readonly attachments: AttachmentsService,
  ) {
    super();
  }

  private targetRepo(entity: ActLinkEntity): Repository<{ id: number; deleted: boolean }> {
    const repos = {
      asset: this.assetRepo,
      plant: this.plantRepo,
      utilizer_grant: this.grantRepo,
      contract: this.contractRepo,
    };
    return repos[entity] as unknown as Repository<{ id: number; deleted: boolean }>;
  }

  // Collegamenti senza i cancellati, conteggi di file e collegamenti.
  private async toRows(list: Act[]): Promise<ActRow[]> {
    const files = await this.attachments.countByEntity(
      AttachmentEntityType.ACT,
      list.map((a) => a.id),
    );
    return list.map((a) => {
      const cleaned = { ...a } as Record<string, unknown>;
      let links = 0;
      for (const e of LINK_ENTITIES) {
        const rel = LINKS[e].relation;
        const kept = alive((a as never)[rel]);
        cleaned[rel] = kept;
        links += kept.length;
      }
      return { ...(cleaned as unknown as Act), file_count: files.get(a.id) ?? 0, link_count: links };
    });
  }

  async findAll(filters: SearchActDto = {}): Promise<ActRow[]> {
    const rows = await this.toRows(
      await this.repo.find({
        where: { deleted: !!filters.deleted },
        relations: RELATIONS,
        order: { act_date: 'DESC', id: 'DESC' },
      }),
    );
    return rows.filter((a) => {
      if (filters.act_type_id && a.act_type_id !== filters.act_type_id) return false;
      if (filters.year && (a.act_date ?? '').slice(0, 4) !== String(filters.year)) return false;
      if (filters.without_files && a.file_count > 0) return false;
      if (filters.linked_to === 'none' && a.link_count > 0) return false;
      if (filters.linked_to && filters.linked_to !== 'none') {
        const rel = LINKS[filters.linked_to as ActLinkEntity].relation;
        if (!((a as never)[rel] as unknown[]).length) return false;
      }
      return true;
    });
  }

  async findOneOrFail(id: number): Promise<ActRow> {
    const a = await this.repo.findOne({
      where: { id, deleted: false },
      relations: {
        ...RELATIONS,
        contracts: { supplier: true },
        utilizerGrants: { parties: true },
        created_by: true,
        updated_by: true,
      },
    });
    if (!a) throw new BadRequestException('Atto non trovato');
    return (await this.toRows([a]))[0];
  }

  async byEntity(entity: ActLinkEntity, entityId: number): Promise<ActRow[]> {
    const rel = LINKS[entity].relation;
    return this.toRows(
      await this.repo.find({
        where: { deleted: false, [rel]: { id: entityId } },
        relations: RELATIONS,
        order: { act_date: 'DESC', id: 'DESC' },
      }),
    );
  }

  private withoutLinks<D extends object>(dto: D): Partial<D> {
    const rest: Record<string, unknown> = { ...dto };
    for (const f of LINK_FIELDS) delete rest[f];
    return rest as Partial<D>;
  }

  async create(dto: CreateActDto, userId: number): Promise<ActRow> {
    await this.assertType(dto.act_type_id);
    const subject = this.assertSubject(dto.subject);
    const links = await this.resolveLinks(dto);
    const saved = await this.repo.save(
      this.repo.create({
        ...this.withoutLinks(dto),
        subject,
        ...links,
        created_by_user_id: userId,
        updated_by_user_id: userId,
      } as never),
    );
    const id = (saved as unknown as Act).id;
    await this.recordAudit(AuditAction.CREATE, id, userId, this.linkAudit({}, links));
    return this.findOneOrFail(id);
  }

  async update(id: number, dto: UpdateActDto, userId: number): Promise<ActRow> {
    const current = await this.repo.findOne({ where: { id, deleted: false }, relations: RELATIONS });
    if (!current) throw new BadRequestException('Atto non trovato');
    if (dto.act_type_id !== undefined) await this.assertType(dto.act_type_id);
    if (dto.subject !== undefined) dto.subject = this.assertSubject(dto.subject);
    const links = await this.resolveLinks(dto);
    await super.update(id, this.withoutLinks(dto) as UpdateActDto, userId);
    if (Object.keys(links).length) {
      await this.repo.save({ id, ...links, updated_by_user_id: userId } as never);
      const changes = this.linkAudit(current, links);
      if (changes.length) await this.recordAudit(AuditAction.UPDATE, id, userId, changes);
    }
    return this.findOneOrFail(id);
  }

  async remove(id: number, userId: number): Promise<void> {
    const a = await this.repo.findOne({ where: { id, deleted: false } });
    if (!a) throw new BadRequestException('Atto non trovato');
    await this.repo.save({ id, deleted: true, updated_by_user_id: userId } as never);
    await this.recordAudit(AuditAction.DELETE, id, userId, []);
  }

  async restore(id: number, userId: number): Promise<ActRow> {
    const a = await this.repo.findOne({ where: { id, deleted: true } });
    if (!a) throw new BadRequestException('Atto non trovato tra gli eliminati');
    await this.repo.save({ id, deleted: false, updated_by_user_id: userId } as never);
    await this.recordAudit(AuditAction.UPDATE, id, userId, [
      { fieldName: 'deleted', oldValue: true, newValue: false },
    ]);
    return this.findOneOrFail(id);
  }

  link(id: number, entity: ActLinkEntity, entityId: number, userId: number): Promise<void> {
    return this.changeLink(id, entity, entityId, userId, true);
  }

  unlink(id: number, entity: ActLinkEntity, entityId: number, userId: number): Promise<void> {
    return this.changeLink(id, entity, entityId, userId, false);
  }

  private async changeLink(
    id: number,
    entity: ActLinkEntity,
    entityId: number,
    userId: number,
    add: boolean,
  ): Promise<void> {
    const a = await this.repo.findOne({ where: { id, deleted: false }, relations: RELATIONS });
    if (!a) throw new BadRequestException('Atto non trovato');
    const rel = LINKS[entity].relation;
    const before = ((a as never)[rel] as { id: number }[]).map((x) => x.id);
    if (add === before.includes(entityId)) return;
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
    if (!t) throw new BadRequestException('Tipo di atto non trovato');
  }

  private assertSubject(subject: string | undefined): string {
    const s = (subject ?? '').trim();
    if (!s) throw new BadRequestException("L'oggetto è obbligatorio");
    return s;
  }

  private async assertTargets(entity: ActLinkEntity, ids: number[]): Promise<void> {
    if (!ids.length) return;
    const unique = [...new Set(ids)];
    const found = await this.targetRepo(entity).count({ where: { id: In(unique), deleted: false } });
    if (found !== unique.length) throw new BadRequestException(`${LINKS[entity].label} non trovato`);
  }

  // Solo i campi *_ids presenti nel DTO diventano relazioni da salvare.
  private async resolveLinks(dto: Partial<CreateActDto>): Promise<Record<string, { id: number }[]>> {
    const out: Record<string, { id: number }[]> = {};
    for (const e of LINK_ENTITIES) {
      const ids = (dto as Record<string, unknown>)[LINKS[e].idsField] as number[] | undefined;
      if (ids === undefined) continue;
      await this.assertTargets(e, ids);
      out[LINKS[e].relation] = [...new Set(ids)].map((id) => ({ id }));
    }
    return out;
  }

  private linkAudit(current: Partial<Act>, links: Record<string, { id: number }[]>) {
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

- [ ] **Step 5: Controller e modulo**

```ts
// acts.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { ActRow, ActsService } from './acts.service';
import { CreateActDto } from './dto/create-act.dto';
import { UpdateActDto } from './dto/update-act.dto';
import { SearchActDto } from './dto/search-act.dto';
import { ActLinkDto } from './dto/act-link.dto';
import { ActLinkEntity, LINK_ENTITIES } from './act-links';

@Controller('acts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActsController {
  constructor(private readonly service: ActsService) {}

  @Get()
  list(@Query() filters: SearchActDto): Promise<ActRow[]> {
    return this.service.findAll(filters);
  }

  @Get('by-entity/:entity/:id')
  byEntity(@Param('entity') entity: string, @Param('id', ParseIntPipe) id: number): Promise<ActRow[]> {
    if (!(LINK_ENTITIES as readonly string[]).includes(entity)) {
      throw new BadRequestException('Entità non valida');
    }
    return this.service.byEntity(entity as ActLinkEntity, id);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<ActRow> {
    return this.service.findOneOrFail(id);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateActDto, @CurrentUser() user: ICurrentUser): Promise<ActRow> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ActRow> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Post(':id/restore')
  restore(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<ActRow> {
    return this.service.restore(id, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Post(':id/links')
  link(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActLinkDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<void> {
    return this.service.link(id, dto.entity, dto.id, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id/links')
  unlink(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActLinkDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<void> {
    return this.service.unlink(id, dto.entity, dto.id, user.id);
  }
}
```

```ts
// acts.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActType } from '@apis/act-types/entity/act-type.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { AttachmentsModule } from '@apis/attachments/attachments.module';
import { Act } from './entity/act.entity';
import { ActsService } from './acts.service';
import { ActsController } from './acts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Act, ActType, Asset, Plant, UtilizerGrant, Contract]),
    AttachmentsModule,
  ],
  controllers: [ActsController],
  providers: [ActsService],
})
export class ActsModule {}
```

`app.module.ts`: `ActsModule` negli `imports`.

- [ ] **Step 6: Verificare**

Run: `docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/acts --maxWorkers=2; pnpm run type-check"` → PASS.
Prova API con utente temporaneo Admin: `POST /acts` `{"act_type_id":1,"subject":"Prova","asset_ids":[<a>,<b>]}` → `link_count: 2`; `GET /acts/by-entity/asset/<a>` lo elenca; `DELETE /acts/<id>` → sparisce da by-entity. Pulizia: `DELETE FROM acts WHERE subject='Prova'` (cascade sui collegamenti), `audit_logs` e utente.

- [ ] **Step 7: Commit**

```bash
git add backend/src/apis/acts backend/src/app.module.ts
git commit -m "feat(acts): acts API with links to assets, plants and contracts"
```

---

### Task 6: Backup con gli allegati

**Files:**
- Modify: `backend/src/apis/backup/backup.service.ts`, `backend/src/apis/backup/dto/create-backup.dto.ts`, `backend/src/apis/backup/backup.controller.ts:44`
- Test: `backend/src/apis/backup/backup.service.spec.ts`

**Interfaces:**
- Produces: `createBackup(includePhotos = false, includeAttachments = false)`; DTO `includeAttachments?: boolean`.

- [ ] **Step 1: Test che falliscono**

In `backup.service.spec.ts`, sul modello del test esistente con `PHOTOS_DIR` (righe ~171–200), con lo stesso stub di `writeDump`:

```ts
it('createBackup con allegati: archivio con attachments/ senza tmp/ e senza photos/', async () => {
  const attDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-service-att-'));
  process.env.ATTACHMENTS_DIR = attDir;
  fs.mkdirSync(path.join(attDir, 'contract', '3'), { recursive: true });
  fs.writeFileSync(path.join(attDir, 'contract', '3', 'a.pdf'), '%PDF-1.7');
  fs.mkdirSync(path.join(attDir, 'tmp'), { recursive: true });
  fs.writeFileSync(path.join(attDir, 'tmp', 'x.chunk0'), 'pezzo');
  const info = await service.createBackup(false, true);
  expect(info.filename.endsWith('.tar.gz')).toBe(true);
  const listed: string[] = [];
  await tar.list({ file: path.join(backupDir, info.filename), onentry: (e) => listed.push(e.path) });
  expect(listed).toEqual(expect.arrayContaining(['dump.sql', 'attachments/contract/3/a.pdf']));
  expect(listed.some((p) => p.startsWith('attachments/tmp'))).toBe(false);
  expect(listed.some((p) => p.startsWith('photos'))).toBe(false);
  fs.rmSync(attDir, { recursive: true, force: true });
  delete process.env.ATTACHMENTS_DIR;
});
```

E un test di ripristino copiato dal test di restore delle foto (stesso stub di `restoreSqlFile`), con `attachments/act/5/b.pdf` nell'archivio e verifica `fs.existsSync(path.join(process.env.ATTACHMENTS_DIR, 'act', '5', 'b.pdf'))`. Usare il nome dell'opzione di `tar.list` presente nella versione installata (`grep -rn "onentry\|onReadEntry" backend/node_modules/tar/dist/commonjs/options.d.ts | head -3`) e i nomi `backupDir`/`service` del file di test.

- [ ] **Step 2: Verificare che fallisca** — `docker exec utenzepa-api-1 pnpm exec jest src/apis/backup/backup.service.spec.ts --maxWorkers=2` → FAIL (niente `attachments/`).

- [ ] **Step 3: Implementazione**

```ts
private resolveAttachmentsDir(): string {
  return process.env.ATTACHMENTS_DIR ?? path.join(process.cwd(), 'attachments');
}

// includePhotos/includeAttachments: solo sui backup manuali; lo schedulato
// resta solo SQL (retention 30 giorni, niente crescita incontrollata).
async createBackup(includePhotos = false, includeAttachments = false): Promise<BackupInfo> {
  const archive = includePhotos || includeAttachments;
  const ext = archive ? 'tar.gz' : 'sql';
  // ... come ora, con `if (!archive)` al posto di `if (!includePhotos)`; nel ramo archivio:
  if (includePhotos) {
    const photosDir = this.resolvePhotosDir();
    if (fs.existsSync(photosDir)) fs.cpSync(photosDir, path.join(stagingDir, 'photos'), { recursive: true });
  }
  if (includeAttachments) {
    const attachmentsDir = this.resolveAttachmentsDir();
    if (fs.existsSync(attachmentsDir)) {
      // I pezzi di upload in corso (tmp/) non vanno nel backup.
      fs.cpSync(attachmentsDir, path.join(stagingDir, 'attachments'), {
        recursive: true,
        filter: (src) => path.relative(attachmentsDir, src).split(path.sep)[0] !== 'tmp',
      });
    }
  }
}
```

In `restoreFromFile`, dopo il blocco delle foto:

```ts
const archivedAttachmentsDir = path.join(extractDir, 'attachments');
if (fs.existsSync(archivedAttachmentsDir)) {
  const attachmentsDir = this.resolveAttachmentsDir();
  fs.mkdirSync(attachmentsDir, { recursive: true });
  fs.cpSync(archivedAttachmentsDir, attachmentsDir, { recursive: true });
  this.logger.log(`Restore: allegati ripristinati da ${archivedAttachmentsDir}`);
}
```

DTO:
```ts
@IsOptional()
@IsBoolean({ message: 'Il campo includeAttachments deve essere booleano' })
includeAttachments?: boolean;
```
Controller: `return this.service.createBackup(dto.includePhotos ?? false, dto.includeAttachments ?? false);`

- [ ] **Step 4: Verificare** — `docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/backup --maxWorkers=2; pnpm run type-check"` → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/backup/backup.service.ts backend/src/apis/backup/backup.service.spec.ts backend/src/apis/backup/dto/create-backup.dto.ts backend/src/apis/backup/backup.controller.ts
git commit -m "feat(attachments): attachments in manual backups"
```

---

### Task 7: Frontend — modelli, servizi, tipi di atto

**Files:**
- Create: `frontend/src/app/pages/attachments/attachment.model.ts`, `attachment.service.ts`
- Create: `frontend/src/app/pages/acts/act.model.ts`, `act.service.ts`
- Create: `frontend/src/app/pages/act-types/act-types.component.ts`
- Modify: `frontend/src/app/app.routes.ts`, `frontend/src/app/comp/sidebar/sidebar.component.ts`, `frontend/src/styles.scss`

**Interfaces:**
- Produces:

```ts
// attachment.model.ts
export type AttachmentEntityType = 'asset' | 'plant' | 'plant_inspection' | 'utilizer_grant' | 'contract' | 'act';
export interface Attachment {
  id: number; entity_type: AttachmentEntityType; entity_id: number; original_name: string; mime_type: string;
  size_bytes: number; description: string | null; create_date: string;
  created_by?: {firstName?: string | null; lastName?: string | null} | null;
  inspection?: {id: number; kind: string} | null;
}
export const ALLOWED_EXTENSIONS: string[];
export function extensionOf(name: string): string;
export function formatBytes(n: number): string;
export const isPreviewable: (a: Attachment) => boolean;

// AttachmentService
list(type: AttachmentEntityType, id: number): Observable<Attachment[]>
upload(type: AttachmentEntityType, id: number, file: File, description?: string | null): Observable<Attachment>
blob(id: number, inline: boolean): Observable<Blob>
update(id: number, description: string | null): Observable<Attachment>
delete(id: number): Observable<void>
```

```ts
// act.model.ts
export type ActLinkEntity = 'asset' | 'plant' | 'utilizer_grant' | 'contract';
export interface ActType { id: number; name: string; sort_order: number; }
export interface Act {
  id: number; act_type_id: number; actType?: ActType; number: string | null; act_date: string | null;
  subject: string; issuer: string | null; protocol_number: string | null; protocol_date: string | null;
  notes: string | null; deleted?: boolean;
  assets?: {id: number; asset_name: string | null; address?: string | null}[];
  plants?: {id: number; code: string; name: string}[];
  utilizerGrants?: {id: number; subject: string | null; kind?: string | null}[];
  contracts?: {id: number; cig_contract: string | null; supplier?: {type?: string; company_name?: string | null; last_name?: string | null; first_name?: string | null} | null}[];
  file_count: number; link_count: number;
  update_date?: string; updated_by?: {firstName?: string | null; lastName?: string | null} | null;
}
export interface ActPayload {
  act_type_id: number; number: string | null; act_date: string | null; subject: string; issuer: string | null;
  protocol_number: string | null; protocol_date: string | null; notes: string | null;
  asset_ids?: number[]; plant_ids?: number[]; utilizer_grant_ids?: number[]; contract_ids?: number[];
}
export const LINK_IDS_FIELD: Record<ActLinkEntity, keyof ActPayload>;
export function actTitle(a: Pick<Act, 'actType' | 'number' | 'act_date'>): string;

// ActService
list(filters?: Record<string, string | number | boolean | null | undefined>): Observable<Act[]>
get(id: number): Observable<Act>
create(p: ActPayload): Observable<Act>
update(id: number, p: Partial<ActPayload>): Observable<Act>
delete(id: number): Observable<void>
restore(id: number): Observable<Act>
byEntity(entity: ActLinkEntity, id: number): Observable<Act[]>
link(id: number, entity: ActLinkEntity, entityId: number): Observable<void>
unlink(id: number, entity: ActLinkEntity, entityId: number): Observable<void>
types(): Observable<ActType[]>
createType(p: {name: string; sort_order?: number}): Observable<ActType>
updateType(id: number, p: Partial<{name: string; sort_order: number}>): Observable<ActType>
deleteType(id: number): Observable<void>
```

- [ ] **Step 1: `attachment.model.ts`**

```ts
// Gemello di backend/src/apis/attachments/attachment-file-policy.ts (estensioni ammesse).
export const ALLOWED_EXTENSIONS = ['pdf', 'p7m', 'doc', 'docx', 'odt', 'xls', 'xlsx', 'ods', 'csv', 'txt',
  'jpg', 'jpeg', 'png', 'tif', 'tiff', 'eml', 'msg'];

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString('it-IT', {maximumFractionDigits: 0})} KB`;
  return `${(n / 1024 / 1024).toLocaleString('it-IT', {maximumFractionDigits: 1})} MB`;
}

export const isPreviewable = (a: Attachment): boolean =>
  a.mime_type === 'application/pdf' || a.mime_type.startsWith('image/');
```
più i tipi elencati sopra.

- [ ] **Step 2: `attachment.service.ts`**

Schema di `ComplexService` (`HttpClient`, `AuthService`, header `Authorization` a mano):

```ts
private readonly api = `${environment.apiUrl}/attachments`;
private chunked = inject(ChunkedUploadService);

list(type: AttachmentEntityType, id: number): Observable<Attachment[]> {
  const params = new HttpParams().set('entity_type', type).set('entity_id', String(id));
  return this.http.get<Attachment[]>(this.api, {headers: this.headers(), params});
}
upload(type: AttachmentEntityType, id: number, file: File, description: string | null = null): Observable<Attachment> {
  return this.chunked.uploadFile(file, `${this.api}/chunk`, `${this.api}/finalize`,
    {entity_type: type, entity_id: id, originalFilename: file.name, description});
}
blob(id: number, inline: boolean): Observable<Blob> {
  return this.http.get(`${this.api}/${id}/file${inline ? '?inline=1' : ''}`, {headers: this.headers(), responseType: 'blob'});
}
update(id: number, description: string | null): Observable<Attachment> {
  return this.http.patch<Attachment>(`${this.api}/${id}`, {description}, {headers: this.headers()});
}
delete(id: number): Observable<void> {
  return this.http.delete<void>(`${this.api}/${id}`, {headers: this.headers()});
}
```

Import: `ChunkedUploadService` da `../../services/chunked-upload.service`.

- [ ] **Step 3: `act.model.ts` e `act.service.ts`**

```ts
export const LINK_IDS_FIELD: Record<ActLinkEntity, keyof ActPayload> = {
  asset: 'asset_ids', plant: 'plant_ids', utilizer_grant: 'utilizer_grant_ids', contract: 'contract_ids',
};

const dateIt = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

// «Delibera di Giunta n. 12 del 03/04/2024»
export function actTitle(a: Pick<Act, 'actType' | 'number' | 'act_date'>): string {
  return [a.actType?.name ?? 'Atto', a.number ? `n. ${a.number}` : '', a.act_date ? `del ${dateIt(a.act_date)}` : '']
    .filter(Boolean).join(' ');
}
```

`ActService`: `list/get/create/update/delete` identici a `ComplexService` su `${environment.apiUrl}/acts`; inoltre

```ts
restore(id: number): Observable<Act> {
  return this.http.post<Act>(`${this.api}/${id}/restore`, {}, {headers: this.headers()});
}
byEntity(entity: ActLinkEntity, id: number): Observable<Act[]> {
  return this.http.get<Act[]>(`${this.api}/by-entity/${entity}/${id}`, {headers: this.headers()});
}
link(id: number, entity: ActLinkEntity, entityId: number): Observable<void> {
  return this.http.post<void>(`${this.api}/${id}/links`, {entity, id: entityId}, {headers: this.headers()});
}
unlink(id: number, entity: ActLinkEntity, entityId: number): Observable<void> {
  return this.http.delete<void>(`${this.api}/${id}/links`, {headers: this.headers(), body: {entity, id: entityId}});
}
```
e `types/createType/updateType/deleteType` su `${environment.apiUrl}/act-types`.

- [ ] **Step 4: Pagina «Tipi di atto»**

`act-types.component.ts` standalone, template inline: tabella (Nome, Ordine, azioni), riga di modifica in linea (nome required, ordine numerico), «Nuovo tipo», «Elimina» con `ConfirmDialogComponent` e toast dell'errore 400 (`err.error?.message`); pulsanti di scrittura con `[appHasRole]="['Admin']"`. Form inline sul modello di `PlantInspectionsTabComponent`. Rotta `{path: 'act-types', component: ActTypesComponent}`; voce Impostazioni dopo «Tipologie uso contatore»: `{label: 'Tipi di atto', icon: 'gavel', route: '/act-types'}`.

- [ ] **Step 5: Token colore** — `styles.scss`, dopo `--entity-chapter`: `  --entity-act: light-dark(#475569, #94a3b8);`.

- [ ] **Step 6: Build** — `docker exec utenzepa-frontend-1 npx ng build --configuration production 2>&1 | grep -E "ERROR|Application bundle"` → bundle ok.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/pages/attachments/attachment.model.ts frontend/src/app/pages/attachments/attachment.service.ts frontend/src/app/pages/acts/act.model.ts frontend/src/app/pages/acts/act.service.ts frontend/src/app/pages/act-types/act-types.component.ts frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts frontend/src/styles.scss
git commit -m "feat(attachments): frontend models, services and act types page"
```

---

### Task 8: Frontend — componente `app-attachments`

**Files:**
- Create: `frontend/src/app/pages/attachments/attachments.component.ts`

**Interfaces:**
- Consumes: `AttachmentService`, `attachment.model` (Task 7); `AuthService` + `isEditorRole`; `ConfirmDialogComponent`.
- Produces: `<app-attachments [entityType]="'contract'" [entityId]="id" [readOnly]="!canEdit" (countChange)="n = $event">`; metodo pubblico `reload()`.

- [ ] **Step 1: Componente**

Standalone, `ChangeDetectionStrategy.Eager`, imports `MatButtonModule`, `MatIconModule`, `MatTooltipModule`, `MatProgressBarModule`, `MatFormFieldModule`, `MatInputModule`. Comportamento:

- `@Input({required: true}) entityType!: AttachmentEntityType; @Input({required: true}) entityId!: number; @Input() readOnly = false; @Output() countChange = new EventEmitter<number>();`
- `ngOnChanges` → `reload()`: `service.list(entityType, entityId)` → `rows`, `countChange.emit(rows.length)`.
- `canDownload = isEditorRole(inject(AuthService).getCurrentUser()?.role)` (Admin, Operatore).
- Con `!readOnly`: area tratteggiata «Trascina qui i file o **scegli**» (`(dragover)`/`(dragleave)`/`(drop)` con `preventDefault`, classe `.drag` durante il trascinamento), `<input type="file" multiple hidden #picker [accept]="accept">` con `accept = ALLOWED_EXTENSIONS.map(e => '.' + e).join(',')`.
- `addFiles(files: File[])`: scarta subito quelli con estensione non ammessa (`errors.push(\`${f.name}: tipo di file non ammesso\`)`), poi coda sequenziale:

```ts
from(accepted).pipe(
  concatMap(f => {
    this.uploading = f.name;
    return this.service.upload(this.entityType, this.entityId, f).pipe(
      catchError((err: HttpErrorResponse) => {
        this.errors.push(`${f.name}: ${err.error?.message ?? 'caricamento non riuscito'}`);
        return of(null);
      }),
    );
  }),
  finalize(() => {
    this.uploading = null;
    this.reload();
  }),
).subscribe();
```

- Tabella: icona (`picture_as_pdf` per PDF, `image` per immagini, `description` altrimenti), nome, descrizione (con `!readOnly` input in linea salvato on blur se cambiata: `service.update`), dimensione `formatBytes`, «caricato da Nome Cognome il gg/mm/aaaa»; per le righe con `inspection` un'etichetta piccola «verifica: {{ r.inspection.kind }}».
- Azioni: con `canDownload` «Apri» (solo `isPreviewable`) e «Scarica»; senza, icona `lock` con tooltip «Download riservato ad Amministratori e Operatori»; con `!readOnly` «Elimina» → `ConfirmDialogComponent` `{title: 'Elimina allegato', message: \`Eliminare «${r.original_name}»?\`, confirmLabel: 'Elimina', danger: true}` → `service.delete` → `reload()`.
- Apertura e scaricamento:

```ts
open(r: Attachment, inline: boolean): void {
  // Il token va nell'header: si scarica il blob e si apre un object URL. La
  // finestra si apre subito, prima della richiesta, per non farla bloccare.
  const win = inline ? window.open('', '_blank') : null;
  this.service.blob(r.id, inline).subscribe({
    next: blob => {
      const url = URL.createObjectURL(blob);
      if (win) {
        win.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = r.original_name;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    error: async (err: HttpErrorResponse) => {
      win?.close();
      let message = 'File non disponibile.';
      try {
        if (err.error instanceof Blob) message = JSON.parse(await err.error.text()).message ?? message;
      } catch {
        // risposta non JSON
      }
      this.errors.push(`${r.original_name}: ${message}`);
    },
  });
}
```

- `errors` mostrati sopra la tabella (colore `var(--app-error)`) con «Chiudi» che li svuota. Testo vuoto: «Nessun allegato.».
- Stili con soli token (`var(--app-border)`, `var(--app-muted)`, `var(--app-surface-2)`).

- [ ] **Step 2: Build** — come nel Task 7.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/pages/attachments/attachments.component.ts
git commit -m "feat(attachments): reusable attachments component with drag and drop"
```

---

### Task 9: Frontend — scheda atto

**Files:**
- Create: `frontend/src/app/pages/acts/act-edit-dialog.component.ts`, `act-edit-dialog.component.html`
- Modify: `frontend/src/app/core/services/entity-navigator.service.ts`

**Interfaces:**
- Consumes: `ActService`, `act.model` (Task 7), `AttachmentsComponent` (Task 8), shell e componenti di `core/components/entity-sheet/`, `toIsoDate` (`../utilities/consumptions/consumption.model`).
- Produces: `interface ActEditDialogData { actId: number | null; prefill?: Partial<ActPayload> }` (il dialog salva da sé e chiude con `Act | null`); `EntityNavigatorService.openAct(id): Observable<boolean>`, `createAct(prefill: Partial<ActPayload>): Observable<Act | null>`.

- [ ] **Step 1: Dialog**

Struttura di `complex-edit-dialog.component.ts`/`.html` (salva da sé, resta aperto dopo la creazione):

```ts
form = this.fb.group({
  act_type_id: [this.data.prefill?.act_type_id ?? null as number | null, Validators.required],
  number: [''],
  act_date: [null as Date | null],
  subject: [this.data.prefill?.subject ?? '', [Validators.required, Validators.maxLength(500)]],
  issuer: [''],
  protocol_number: [''],
  protocol_date: [null as Date | null],
  notes: [''],
});
readonly canEdit = isEditorRole(inject(AuthService).getCurrentUser()?.role);
readonly isAdmin = inject(AuthService).getCurrentUser()?.role === 'Admin';
```

- Header `app-entity-sheet` `icon="gavel"`, `color="var(--entity-act)"`, titolo `actTitle(...)` o «Nuovo atto», sottotitolo = oggetto, badge «N file».
- Tab «Riepilogo»: tipo con `app-filterable-select` (opzioni dai tipi ordinati; `createLabel` solo per Admin → prompt nome → `createType` → ricarica e seleziona), numero, data (datepicker), oggetto `span-2`, emesso da, protocollo numero e data, `sheet-hint` «Il testo dell'atto è facoltativo: se lo hai, caricalo nel tab Allegati.».
- Tab «Allegati» (solo atto salvato, altrimenti `sheet-hint` «Salva l'atto per caricare i file»): `<app-attachments entityType="act" [entityId]="act.id" [readOnly]="!canEdit" (countChange)="fileCount = $event">`.
- Tab «Collegamenti» (solo atto salvato): quattro sezioni `app-linked-table` (Immobili, Impianti, Contratti immobiliari, Contratti di fornitura), righe in campi cache aggiornati da `refreshLinks()`; `addOptions` caricate una volta (`AssetService.search({deleted: false})`, servizio impianti, `UtilizerGrantService.search`, `ContractsService.search` — prima `grep -n "search\|list(" frontend/src/app/pages/plants/plant.service.ts frontend/src/app/pages/utilizer-grant/utilizer-grant.service.ts frontend/src/app/pages/contracts/contract.service.ts` per i nomi esatti); `(add)` → `service.link` + ricarica; `(unlink)` → `service.unlink` + ricarica; `(open)` → `navigator.openAsset/openPlant/openGrant/openSupplyContract`. Etichette: immobile `asset_name`; impianto `code — name`; contratto immobiliare oggetto o `#id`; contratto di fornitura fornitore (`partyName`) + CIG.
- Tab «Note», tab «Storico» (`app-entity-history [entity]="'acts'"`).
- `save()`: date con `toIsoDate`, testi `trim() || null`; create → `service.create({...payload, ...collegamenti del prefill})`; update senza campi `*_ids`; errore → `err.error?.message ?? 'Salvataggio non riuscito.'`.

- [ ] **Step 2: Navigator**

```ts
const ACT_DIALOG = () => import('../../pages/acts/act-edit-dialog.component').then(m => m.ActEditDialogComponent);

// Il dialog atto salva da sé e chiude con l'atto se ha salvato.
openAct(id: number): Observable<boolean> {
  return this.sheet<{actId: number}, Act | null>(ACT_DIALOG, {actId: id}).pipe(map(saved => !!saved));
}

createAct(prefill: Partial<ActPayload> = {}): Observable<Act | null> {
  return this.sheet<{actId: null; prefill: Partial<ActPayload>}, Act | null>(ACT_DIALOG, {actId: null, prefill})
    .pipe(map(a => a ?? null));
}
```
Import di tipo: `import type {Act, ActPayload} from '../../pages/acts/act.model';`.

- [ ] **Step 3: Build** — come nel Task 7.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pages/acts/act-edit-dialog.component.ts frontend/src/app/pages/acts/act-edit-dialog.component.html frontend/src/app/core/services/entity-navigator.service.ts
git commit -m "feat(acts): act sheet with attachments and links"
```

---

### Task 10: Frontend — elenco Atti

**Files:**
- Create: `frontend/src/app/pages/acts/acts.component.ts`, `acts-filters.ts`
- Modify: `frontend/src/app/app.routes.ts`, `frontend/src/app/comp/sidebar/sidebar.component.ts`, `frontend/src/app/pages/audit-log/audit-log-page.component.ts`, `frontend/src/app/pages/guida/guida.ts`

**Interfaces:**
- Consumes: Task 7 e 9.
- Produces: rotta `/acts` con `?selectedId=`.

- [ ] **Step 1: Filtri**

```ts
// acts-filters.ts
import {FilterDef} from '../../core/components/list/filter-def';
import type {ActType} from './act.model';

// Filtri dell'elenco atti (lato server); la ricerca libera resta lato client.
export function actFilters(types: ActType[]): FilterDef[] {
  const year = new Date().getFullYear();
  return [
    {key: 'act_type_id', label: 'Tipo', type: 'select', inline: true, options: types.map(t => ({label: t.name, value: t.id}))},
    {key: 'linked_to', label: 'Collegato a', type: 'select', inline: true, options: [
      {label: 'Immobili', value: 'asset'}, {label: 'Impianti', value: 'plant'},
      {label: 'Contratti immobiliari', value: 'utilizer_grant'}, {label: 'Contratti di fornitura', value: 'contract'},
      {label: 'Nessuna entità', value: 'none'}]},
    {key: 'year', label: 'Anno', type: 'select', inline: true,
      options: Array.from({length: 60}, (_, i) => ({label: String(year - i), value: year - i}))},
    {key: 'without_files', label: 'Senza file', type: 'toggle'},
  ];
}
```

Prima di scrivere: `grep -n "type" frontend/src/app/core/components/list/filter-def.ts` per i tipi di filtro supportati (sostituire `'toggle'` con il nome esistente per un booleano) e aggiungere in fondo il filtro dei cancellati usato negli altri elenchi (`grep -rn "DELETED_FILTER" frontend/src/app | head -2`).

- [ ] **Step 2: Componente elenco**

Copia strutturale di `complexes.component.ts`:
- `COLUMNS_KEY = 'columns:acts'`, `PAGE_SIZE_KEY = 'list-page-size:Atti'`, titolo «Atti», sottotitolo «Delibere, determine, decreti, atti notarili e altri atti ufficiali, con o senza il testo.»;
- colonne: Tipo, Numero, Data (`gg/mm/aaaa`), Oggetto, Emesso da, File (`file_count`), Collegamenti (`link_count`);
- `filterDefs` costruiti dopo `service.types()`, poi primo `reload()`;
- ricerca libera lato client su tipo, numero, oggetto, emesso da, protocollo, note;
- azioni riga: «Dettaglio», «Elimina» con conferma; con il filtro cancellati attivo «Ripristina» (`service.restore`);
- `openDialog` con `openSheet(this.dialog, ActEditDialogComponent, {actId})`, ricarica se salvato; «Nuovo atto» dalla toolbar;
- export CSV con le stesse colonne (`atti_<data>.csv`).

Rotta `{path: 'acts', component: ActsComponent}`; voce di menu nel gruppo Patrimonio dopo «Contratti immobiliari»: `{label: 'Atti', icon: 'gavel', route: '/acts'}`. `audit-log-page.component.ts` `ENTITY_OPTIONS`: `{label: 'Atti', value: 'acts'}`, `{label: 'Tipi di atto', value: 'act_types'}`. `guida.ts`: `'acts': 'registrare-un-atto'`.

- [ ] **Step 3: Build** — come nel Task 7.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pages/acts/acts.component.ts frontend/src/app/pages/acts/acts-filters.ts frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts frontend/src/app/pages/audit-log/audit-log-page.component.ts frontend/src/app/pages/guida/guida.ts
git commit -m "feat(acts): acts list with filters"
```

---

### Task 11: Frontend — tab «Documenti» nelle schede e allegati delle verifiche

**Files:**
- Create: `frontend/src/app/pages/acts/entity-documents.component.ts`
- Create: `frontend/src/app/pages/attachments/inspection-attachments-dialog.component.ts`
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.html` + `.ts`
- Modify: `frontend/src/app/pages/plants/plant-edit-dialog.component.html` + `.ts`
- Modify: `frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.html` + `.ts`
- Modify: `frontend/src/app/pages/contracts/contract-edit-dialog.component.html` + `.ts`
- Modify: `frontend/src/app/pages/plants/plant-inspections-tab.component.ts`

**Interfaces:**
- Consumes: `AttachmentsComponent` (Task 8), `ActService.byEntity/list/link/unlink`, `EntityNavigatorService.openAct/createAct`, `LINK_IDS_FIELD`, `actTitle`.
- Produces: `<app-entity-documents [entity]="'asset'" [entityId]="id" [readOnly]="!canEdit" (countChange)="documentCount = $event">`; `InspectionAttachmentsDialogComponent` con data `{inspectionId: number; title: string; readOnly: boolean}`.

- [ ] **Step 1: `entity-documents.component.ts`**

```ts
// Tab «Documenti» di una scheda: allegati dell'entità e atti collegati.
@Component({
  selector: 'app-entity-documents',
  standalone: true,
  imports: [AttachmentsComponent, LinkedTableComponent, MatIconModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="sheet-section-title"><mat-icon>attach_file</mat-icon>Allegati</div>
    <app-attachments [entityType]="entity" [entityId]="entityId" [readOnly]="readOnly"
                     (countChange)="files = $event; emitCount()"></app-attachments>

    <div class="sheet-section-title"><mat-icon>gavel</mat-icon>Atti collegati</div>
    <app-linked-table
      [columns]="columns"
      [rows]="acts"
      [addOptions]="readOnly ? null : options"
      addLabel="Collega atto"
      itemLabel="l'atto"
      [unlinkable]="!readOnly"
      emptyText="Nessun atto collegato."
      [createLabel]="readOnly ? null : 'Nuovo atto'"
      (create)="create()"
      (add)="link($event)"
      (unlink)="unlink($event)"
      (open)="open($event.id)"></app-linked-table>
  `,
})
export class EntityDocumentsComponent implements OnChanges {
  @Input({required: true}) entity!: ActLinkEntity;
  @Input({required: true}) entityId!: number;
  @Input() readOnly = false;
  @Output() countChange = new EventEmitter<number>();

  private service = inject(ActService);
  private navigator = inject(EntityNavigatorService);
  private toast = inject(ToastService);

  acts: Act[] = [];
  options: TOption[] = [];
  files = 0;

  readonly columns: LinkedColumn<Act>[] = [
    {label: 'Atto', value: a => actTitle(a)},
    {label: 'Oggetto', value: a => a.subject},
    {label: 'File', value: a => String(a.file_count)},
  ];

  ngOnChanges(): void {
    if (this.entityId) this.reload();
  }

  emitCount(): void {
    this.countChange.emit(this.files + this.acts.length);
  }

  reload(): void {
    this.service.byEntity(this.entity, this.entityId).subscribe(rows => {
      this.acts = rows;
      this.emitCount();
      if (!this.readOnly) this.loadOptions();
    });
  }

  private loadOptions(): void {
    const linked = new Set(this.acts.map(a => a.id));
    this.service.list().subscribe(all => this.options = all
      .filter(a => !linked.has(a.id))
      .map(a => ({value: a.id, label: actTitle(a), sublabel: a.subject, searchText: `${actTitle(a)} ${a.subject}`})));
  }

  link(actId: number): void {
    this.service.link(actId, this.entity, this.entityId).subscribe({next: () => this.reload(), error: e => this.fail(e)});
  }

  unlink(actId: number): void {
    this.service.unlink(actId, this.entity, this.entityId).subscribe({next: () => this.reload(), error: e => this.fail(e)});
  }

  create(): void {
    this.navigator.createAct({[LINK_IDS_FIELD[this.entity]]: [this.entityId]}).subscribe(a => {
      if (a) this.reload();
    });
  }

  open(id: number): void {
    this.navigator.openAct(id).subscribe(() => this.reload());
  }

  private fail(err: HttpErrorResponse): void {
    this.toast.add({severity: 'error', summary: 'Operazione non riuscita', detail: err.error?.message ?? 'Errore imprevisto.'});
  }
}
```

`ActLinkEntity` è un sottoinsieme di `AttachmentEntityType`: il binding `[entityType]="entity"` compila.

- [ ] **Step 2: Tab nelle quattro schede**

In ognuna, prima di «Storico», solo per entità già salvate:

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

`entity` = `asset` / `plant` / `utilizer_grant` / `contract`; condizione e id propri di ogni scheda (leggere ciascun `.html`: es. `!isNew` e `data.item.id` nell'immobile, `plant` e `plant.id` nell'impianto). Nel `.ts`: `documentCount: number | null = null;` e `EntityDocumentsComponent` negli `imports` (verificare che `app-tab-label` accetti `null` come count; altrimenti `undefined`). Il conteggio compare dopo la prima apertura del tab (accettato: evita due chiamate per ogni scheda aperta). Nell'impianto la sezione Allegati include quelli delle verifiche (etichetta «verifica: …», gestita da `app-attachments`).

- [ ] **Step 3: Allegati delle verifiche**

`inspection-attachments-dialog.component.ts`: dialog con titolo «Allegati della verifica: {{ data.title }}», `<app-attachments entityType="plant_inspection" [entityId]="data.inspectionId" [readOnly]="data.readOnly">`, «Chiudi».

In `plant-inspections-tab.component.ts`:
- `attachmentService.list('plant', plantId)` all'init e dopo ogni `changed` → `counts = Map<inspectionId, number>` dalle righe con `inspection`;
- colonna prima delle azioni: `<button mat-icon-button type="button" (click)="openAttachments(r)" matTooltip="Allegati della verifica (es. verbale)"><mat-icon [matBadge]="counts.get(r.id) || null" matBadgeSize="small">attach_file</mat-icon></button>` (`MatBadgeModule`, `MatDialog` iniettato);
- `openAttachments(r)`: `this.dialog.open(InspectionAttachmentsDialogComponent, {width: '760px', maxWidth: '95vw', data: {inspectionId: r.id, title: r.kind, readOnly: this.readOnly}})`, alla chiusura ricarica i conteggi.

- [ ] **Step 4: Build** — come nel Task 7.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/acts/entity-documents.component.ts frontend/src/app/pages/attachments/inspection-attachments-dialog.component.ts frontend/src/app/pages/assets/asset-edit-dialog.component.html frontend/src/app/pages/assets/asset-edit-dialog.component.ts frontend/src/app/pages/plants/plant-edit-dialog.component.html frontend/src/app/pages/plants/plant-edit-dialog.component.ts frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.html frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.ts frontend/src/app/pages/contracts/contract-edit-dialog.component.html frontend/src/app/pages/contracts/contract-edit-dialog.component.ts frontend/src/app/pages/plants/plant-inspections-tab.component.ts
git commit -m "feat(attachments): documents tab in sheets and inspection attachments"
```

---

### Task 12: Backup UI, guida, documentazione, E2E, rilascio

**Files:**
- Modify: `frontend/src/app/pages/backup-import/backup-import.component.html`, `.ts`, `backup.service.ts`
- Modify: `frontend/public/guida/guida.md`, `CLAUDE.md`, `docs/roadmap-patrimonio.md`, `publiccode.yml`

- [ ] **Step 1: Casella nel backup**

`backup.service.ts` frontend: `create(includePhotos = false, includeAttachments = false)` con body `{includePhotos, includeAttachments}`. Componente: `includeAttachmentsInBackup = false;`, sotto la casella delle foto `<mat-checkbox [(ngModel)]="includeAttachmentsInBackup" [disabled]="creatingBackup">Includi gli allegati</mat-checkbox>`, chiamata `create(this.includePhotosInBackup, this.includeAttachmentsInBackup)`.

- [ ] **Step 2: Guida**

`guida.md` (data in testa aggiornata):
- «Operazioni frequenti», dopo «Gestire i complessi»:
  - `### Allegare un file a un immobile, impianto o contratto`: tab Documenti → Allegati → trascina o scegli; descrizione facoltativa; tipi ammessi e 50 MB; i verbali delle verifiche si allegano dall'icona graffetta nella riga della verifica e compaiono anche nel tab dell'impianto.
  - `### Registrare un atto`: cos'è un atto (delibera, determina, decreto, ordinanza, atto notarile, autorizzazione) e perché si registra anche senza testo; menu Atti → Nuovo atto, oppure tab Documenti → Atti collegati → Nuovo atto (nasce già collegato); un atto per più entità (es. una delibera per più immobili: si registra una volta e si collega dalle altre schede con «Collega atto»); il testo, se c'è, va nel tab Allegati dell'atto.
- «Regole e riferimenti»: `### Chi può scaricare gli allegati`: schede e nomi dei file visibili a tutti, scaricamento solo per Amministratori e Operatori (dati personali).
- «Problemi frequenti»: `### «Tipo di file non ammesso» o «Il contenuto del file non corrisponde al tipo»` con **Causa**, **Soluzione** (convertire in PDF, non rinominare le estensioni, comprimere oltre 50 MB) e **Apri un ticket se**.
- «Fare un backup»: una riga sulla casella «Includi gli allegati».

Verificare l'ancora `registrare-un-atto` usata in `guida.ts`: `docker exec utenzepa-frontend-1 node scripts/check-guida.mjs`.

- [ ] **Step 3: CLAUDE.md, roadmap, versione**

- `CLAUDE.md`, elenco moduli `src/apis/`: aggiungere `attachments`, `act-types`, `acts`. Sezione Dominio, nuova voce **Allegati e atti** (v1.22.0): allegati polimorfici (`attachments`, `entity_type` asset/plant/plant_inspection/utilizer_grant/contract/act) su `ATTACHMENTS_DIR` (volume `attachments_data`, upload a pezzi, tipi e firme in `attachment-file-policy.ts`, download solo Admin/Operatore, audit sul proprietario, verifiche sull'impianto); atti (`acts`, tipi in `act_types` gestiti dagli Admin) collegati N-N con `act_assets`/`act_plants`/`act_utilizer_grants`/`act_contracts`, file dell'atto = allegati `act`; nessuna scadenza; backup manuale «Includi gli allegati».
- `docs/roadmap-patrimonio.md`: voce 19 → «fatto, v1.22.0 (allegati e atti; utenze e complessi, ricerca nei PDF e firma digitale rimandati)» nella tabella e nota nella sezione 19; nuova voce «Scadenzario degli obblighi dell'immobile» (CPI, APE e simili, sul modello delle verifiche degli impianti, con gli allegati sulla singola scadenza).
- `publiccode.yml`: `softwareVersion: "v1.22.0"`, `releaseDate` = data del giorno.

- [ ] **Step 4: E2E (Playwright, utente temporaneo Admin + uno in sola lettura)**

1. `/contracts?selectedId=<id>` → tab Documenti → trascinare un PDF reale (copiato da `W:\CONTRATTI` in una cartella di lavoro) → riga presente; «Apri» mostra l'anteprima.
2. Tab Documenti di un immobile → «Nuovo atto»: Delibera di Giunta, n. 12/2024, oggetto di prova, senza file → salvato e già collegato; da un secondo immobile «Collega atto» → in `/acts` Collegamenti = 2, File = 0; filtro «Senza file» lo mostra.
3. Impianto con verifiche: graffetta su una verifica → caricare un PDF → nel tab Documenti dell'impianto la riga ha «verifica: …».
4. Utente in sola lettura: tab Documenti visibile, icona lucchetto al posto di Apri/Scarica, nessuna area di caricamento.
5. Backup manuale con «Includi gli allegati» → file `.tar.gz` (non ripristinarlo; eliminarlo dopo).

Screenshot solo in `.playwright-mcp/`. Pulizia: atti e allegati di prova (`DELETE FROM acts WHERE subject LIKE 'Prova%'`, `DELETE FROM attachments WHERE id IN (...)`), cartelle di prova in `/usr/src/app/attachments`, `audit_logs` e utenti temporanei, backup di prova.

- [ ] **Step 5: Verifica finale**

```bash
docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/attachments src/apis/act-types src/apis/acts src/apis/backup src/common/chunked-upload --maxWorkers=2; pnpm run type-check"
docker exec utenzepa-frontend-1 sh -c "node scripts/check-guida.mjs && npx ng build --configuration production 2>&1 | grep -E 'ERROR|Application bundle'"
```
Expected: test verdi, type-check pulito, build ok. `prettier --write` solo sui file nuovi o modificati, poi `git diff --numstat` per scartare il rumore CRLF.

- [ ] **Step 6: Commit e PR**

```bash
git add frontend/src/app/pages/backup-import/backup-import.component.html frontend/src/app/pages/backup-import/backup-import.component.ts frontend/src/app/pages/backup-import/backup.service.ts frontend/public/guida/guida.md CLAUDE.md docs/roadmap-patrimonio.md publiccode.yml
git commit -m "feat(attachments): backup option, guide and release v1.22.0"
git push -u origin feat/documenti
gh pr create --title "feat: allegati e atti (v1.22.0)" --body-file <scratchpad>/pr-allegati-atti.md --base main
```

Corpo della PR: sintesi, migration `1794100000000-AttachmentsAndActs` (7 tabelle + 7 tipi di atto), **nota di rilascio: aggiungere il volume `attachments_data` al `docker-compose.yml` di produzione prima di caricare allegati**, verifica fatta, `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Merge e tag solo su indicazione dell'utente.
