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
import { ALLOWED_EXTENSIONS, checkFile, maxSizeBytes } from './attachment-file-policy';
import { userRef } from '@apis/shared/user-ref';

export type AttachmentRow = Attachment & { inspection: { id: number; kind: string } | null };

const HEAD_BYTES = 8192;
// Pezzi di upload interrotti (rete caduta, scheda chiusa): eliminati dopo un giorno.
const STALE_CHUNK_MS = 24 * 60 * 60 * 1000;

// Proprietario: tabella per il controllo di esistenza, entità del log attività,
// etichetta nei messaggi. La verifica registra sull'impianto.
const OWNERS: Record<T, { table: string; audit: string; label: string }> = {
  [T.ASSET]: { table: 'assets', audit: 'assets', label: 'Immobile' },
  [T.PLANT]: { table: 'plants', audit: 'plants', label: 'Impianto' },
  [T.PLANT_INSPECTION]: { table: 'plant_inspections', audit: 'plants', label: 'Verifica' },
  [T.UTILIZER_GRANT]: {
    table: 'utilizer_grant',
    audit: 'utilizer_grant',
    label: 'Contratto immobiliare',
  },
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
    // Verifica: vale solo se anche il suo impianto non è cancellato.
    const sql =
      type === T.PLANT_INSPECTION
        ? 'SELECT i.id, i.plant_id, i.kind FROM `plant_inspections` i JOIN `plants` p ON p.id = i.plant_id WHERE i.id = ? AND i.deleted = 0 AND p.deleted = 0'
        : `SELECT id FROM \`${o.table}\` WHERE id = ? AND deleted = 0`;
    const rows: Owner[] = await this.dataSource.query(sql, [id]);
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
    const rows: AttachmentRow[] = own.map((a) => this.withAuthor({ ...a, inspection: null }));
    if (type !== T.PLANT) return rows;
    const inspections: { id: number; kind: string }[] = await this.dataSource.query(
      'SELECT id, kind FROM plant_inspections WHERE plant_id = ? AND deleted = 0',
      [id],
    );
    if (!inspections.length) return rows;
    const kindOf = new Map(inspections.map((i) => [Number(i.id), i.kind]));
    const fromInspections = await this.repo.find({
      where: {
        entity_type: T.PLANT_INSPECTION,
        entity_id: In([...kindOf.keys()]),
        deleted: false,
      },
      relations: { created_by: true },
      order,
    });
    return [
      ...rows,
      ...fromInspections.map((a) =>
        this.withAuthor({
          ...a,
          inspection: { id: a.entity_id, kind: kindOf.get(a.entity_id) ?? '' },
        }),
      ),
    ];
  }

  private withAuthor(a: AttachmentRow): AttachmentRow {
    return { ...a, created_by: userRef(a.created_by) as never };
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

  // Per l'interfaccia: limite e tipi letti dalla configurazione del server.
  limits(): { max_size_mb: number; extensions: readonly string[] } {
    return {
      max_size_mb: Math.round(maxSizeBytes() / 1024 / 1024),
      extensions: ALLOWED_EXTENSIONS,
    };
  }

  saveChunk(dto: UploadChunkDto, buffer: Buffer): void {
    const max = maxSizeBytes();
    if (dto.chunkIndex === 0) this.sweepStaleChunks();
    try {
      this.chunkedUpload.saveChunk(
        dto.uploadId,
        dto.chunkIndex,
        dto.totalChunks,
        buffer,
        this.tmpDir,
        max,
      );
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('supera il limite')) {
        throw new BadRequestException(
          `File troppo grande (massimo ${Math.round(max / 1024 / 1024)} MB)`,
        );
      }
      throw new BadRequestException(msg);
    }
  }

  private sweepStaleChunks(): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(this.tmpDir);
    } catch {
      return;
    }
    const limit = Date.now() - STALE_CHUNK_MS;
    for (const name of entries) {
      const file = path.join(this.tmpDir, name);
      try {
        if (fs.statSync(file).mtimeMs < limit) fs.unlinkSync(file);
      } catch {
        // già rimosso da un'altra richiesta
      }
    }
  }

  async finalize(dto: AttachmentFinalizeDto, userId: number): Promise<Attachment> {
    let assembled: string;
    try {
      assembled = this.chunkedUpload.assemble(
        dto.uploadId,
        dto.totalChunks,
        this.tmpDir,
        `${dto.uploadId}.upload`,
      );
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
      const target = this.pathOf({
        entity_type: dto.entity_type,
        entity_id: dto.entity_id,
        stored_name: storedName,
      });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const size = fs.statSync(assembled).size;
      fs.renameSync(assembled, target);
      let saved: Attachment;
      try {
        saved = await this.repo.save(
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
      } catch (e) {
        // Senza la riga il file sarebbe irraggiungibile: si toglie.
        fs.rmSync(target, { force: true });
        throw e;
      }
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
    if (!fs.existsSync(absolutePath)) {
      throw new BadRequestException('File non disponibile sul server');
    }
    return { attachment, absolutePath };
  }

  async update(id: number, dto: UpdateAttachmentDto, userId: number): Promise<Attachment> {
    const a = await this.repo.findOne({ where: { id, deleted: false } });
    if (!a) throw new BadRequestException('Allegato non trovato');
    const description = dto.description?.trim() || null;
    if (description !== a.description) {
      const owner = await this.owner(a.entity_type, a.entity_id);
      await this.audit(
        a.entity_type,
        owner,
        userId,
        'attachment_description',
        a.description,
        description,
      );
    }
    return this.repo.save({ ...a, description, updated_by_user_id: userId });
  }

  async remove(id: number, userId: number): Promise<void> {
    const a = await this.repo.findOne({ where: { id, deleted: false } });
    if (!a) throw new BadRequestException('Allegato non trovato');
    await this.repo.save({ ...a, deleted: true, updated_by_user_id: userId });
    const owner = await this.owner(a.entity_type, a.entity_id).catch(() => null);
    if (owner) {
      await this.audit(a.entity_type, owner, userId, 'attachment_removed', a.original_name, null);
    }
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
