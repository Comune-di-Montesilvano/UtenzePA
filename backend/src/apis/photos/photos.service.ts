import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Photo } from './entity/photo.entity';
import { PhotoEntityType } from './enum/photo-entity-type.enum';
import { CreatePhotoDto } from './dto/create-photo.dto';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const HEIC_MIME_TYPES = ['image/heic', 'image/heif'];
const MAX_PHOTOS_PER_ENTITY = 10;

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);
  readonly photosDir: string;

  constructor(
    @InjectRepository(Photo) private readonly repo: Repository<Photo>,
    @InjectRepository(Asset) private readonly assetRepo: Repository<Asset>,
    @InjectRepository(Utility) private readonly utilityRepo: Repository<Utility>,
  ) {
    this.photosDir = process.env.PHOTOS_DIR ?? path.join(process.cwd(), 'photos');
    fs.mkdirSync(this.photosDir, { recursive: true });
  }

  async create(dto: CreatePhotoDto, file: Express.Multer.File, userId: number): Promise<Photo> {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Formato immagine non supportato (ammessi: jpeg, png, webp, heic)',
      );
    }
    await this.assertEntityExists(dto.entityType, dto.entityId);

    const count = await this.repo.count({
      where: { entity_type: dto.entityType, entity_id: dto.entityId, deleted: false },
    });
    if (count >= MAX_PHOTOS_PER_ENTITY) {
      throw new BadRequestException(
        `Limite di ${MAX_PHOTOS_PER_ENTITY} foto per elemento raggiunto`,
      );
    }

    let buffer = file.buffer;
    let mimeType = file.mimetype;
    if (HEIC_MIME_TYPES.includes(mimeType)) {
      try {
        buffer = await this.convertHeicToJpeg(buffer);
      } catch (error) {
        this.logger.warn(`Conversione HEIC fallita: ${(error as Error)?.message ?? error}`);
        throw new BadRequestException('Immagine HEIC non valida o non convertibile');
      }
      mimeType = 'image/jpeg';
    }

    const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
    const relativePath = path.join(dto.entityType, String(dto.entityId), `${randomUUID()}.${ext}`);
    const absolutePath = path.join(this.photosDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, buffer);

    const photo = this.repo.create({
      entity_type: dto.entityType,
      entity_id: dto.entityId,
      file_path: relativePath,
      mime_type: mimeType,
      original_filename: file.originalname,
      file_size: buffer.length,
      created_by_user_id: userId,
      updated_by_user_id: userId,
    });
    return this.repo.save(photo);
  }

  async findAll(entityType: PhotoEntityType, entityId: number): Promise<Photo[]> {
    return this.repo.find({
      where: { entity_type: entityType, entity_id: entityId, deleted: false },
      order: { create_date: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Photo> {
    const photo = await this.repo.findOne({ where: { id, deleted: false } });
    if (!photo) throw new NotFoundException('Foto non trovata');
    return photo;
  }

  getAbsolutePath(photo: Photo): string {
    return path.join(this.photosDir, photo.file_path);
  }

  async remove(id: number, updatedByUserId: number): Promise<void> {
    const photo = await this.findOne(id);
    const absolutePath = this.getAbsolutePath(photo);
    try {
      fs.unlinkSync(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.logger.warn(
        `File foto ${absolutePath} già assente su disco, procedo comunque con la rimozione della riga`,
      );
    }
    photo.deleted = true;
    photo.updated_by_user_id = updatedByUserId;
    await this.repo.save(photo);
  }

  private async assertEntityExists(entityType: PhotoEntityType, entityId: number): Promise<void> {
    const exists =
      entityType === PhotoEntityType.ASSET
        ? await this.assetRepo.exists({ where: { id: entityId, deleted: false } })
        : await this.utilityRepo.exists({ where: { id: entityId, deleted: false } });
    if (!exists) {
      const label = entityType === PhotoEntityType.ASSET ? 'Immobile' : 'Contatore';
      throw new BadRequestException(`${label} non trovato`);
    }
  }

  private async convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
    // heic-convert è CommonJS puro (module.exports = fn, nessun __esModule) e con
    // "module": "commonjs" in tsconfig il dynamic import() viene compilato a un
    // require() semplice: niente wrapping .default garantito dall'interop ESM reale.
    // Copre sia questo caso sia un eventuale reale default export.
    const heicConvertModule = (await import('heic-convert')) as unknown as
      typeof import('heic-convert') | ((...args: unknown[]) => unknown);
    const convert = (
      typeof heicConvertModule === 'function'
        ? heicConvertModule
        : (heicConvertModule as { default: typeof import('heic-convert').default }).default
    ) as typeof import('heic-convert').default;
    const output = await convert({ buffer, format: 'JPEG', quality: 0.9 });
    return Buffer.from(output);
  }
}
