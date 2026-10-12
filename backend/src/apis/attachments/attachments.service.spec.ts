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
    service = new AttachmentsService(
      repo as never,
      { query } as never,
      new ChunkedUploadService(),
      audit as never,
    );
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
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'contract', entityId: 3 }),
    );
  });

  it('verifica: audit sull’impianto', async () => {
    upload('u5', Buffer.from('%PDF-1.7'));
    await finalize('u5', 'verbale.pdf', T.PLANT_INSPECTION, 3);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'plants', entityId: 5 }),
    );
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
    expect(() => upload('u4', Buffer.alloc(1024 * 1024 + 1))).toThrow(
      'File troppo grande (massimo 1 MB)',
    );
  });

  it('open: allegato cancellato → 400; proprietario cancellato → 400; file mancante → 400 leggibile', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    await expect(service.open(9)).rejects.toThrow('Allegato non trovato');
    repo.findOne.mockResolvedValueOnce({
      id: 9,
      entity_type: 'act',
      entity_id: 4,
      stored_name: 'x.pdf',
      deleted: false,
    });
    query.mockResolvedValueOnce([]);
    await expect(service.open(9)).rejects.toThrow('Atto non trovato');
    repo.findOne.mockResolvedValueOnce({
      id: 9,
      entity_type: 'contract',
      entity_id: 3,
      stored_name: 'x.pdf',
      deleted: false,
    });
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
