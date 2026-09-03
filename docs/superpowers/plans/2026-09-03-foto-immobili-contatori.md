# Foto immobili/contatori Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Galleria foto (multiple, max 10) per singolo immobile e singolo contatore, caricabile/eliminabile da Admin/Operatore, visibile in un nuovo tab "Foto" dentro i dialog di modifica esistenti.

**Architecture:** Nuovo modulo backend `photos` (entity polimorfica `Photo` con `entity_type`/`entity_id`, storage su volume Docker named, endpoint autenticato dedicato per il serving, conversione HEIC→JPEG lato backend). Nuovo `PhotoGalleryComponent` standalone riusabile lato frontend, integrato via `MatTabGroup` nei dialog `AssetEditDialogComponent`/`UtilityEditDialogComponent` esistenti (tab "Dati" invariato + nuovo tab "Foto").

**Tech Stack:** NestJS 11 + TypeORM (MySQL) backend, Angular 22 + Material frontend, `heic-convert` (nuova dipendenza backend, puro JS/WASM).

**Spec:** `docs/superpowers/specs/2026-09-03-foto-immobili-contatori-design.md`

## Global Constraints

- Limite 10MB per foto, mime allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`.
- Limite 10 foto per entità (asset o utility).
- Upload/eliminazione riservati a ruoli `Admin`/`Operatore` (`Lettore` sola visualizzazione).
- Storage su volume Docker named (`photos_data`), mai bind-mount diretto in produzione, path di default `process.cwd()/photos` in dev.
- Serving foto SEMPRE dietro `JwtAuthGuard` — mai static file serving Express.
- HEIC/HEIF sempre convertiti a JPEG prima della scrittura su disco — mai salvato un file `.heic` sul volume.
- Delete: soft-delete della riga (`deleted=true`, stesso pattern `BaseService.remove()`) + rimozione immediata del file fisico.
- Sempre `docker exec` sul container `api`/`frontend` per comandi pnpm (vedi CLAUDE.md — versioni Node/pnpm host possono differire).
- Sempre `--maxWorkers=2` sui comandi jest.

---

## File Structure

**Backend — nuovo modulo `backend/src/apis/photos/`:**
- `enum/photo-entity-type.enum.ts` — enum `PhotoEntityType` (`ASSET`/`UTILITY`)
- `entity/photo.entity.ts` — entity TypeORM `Photo`
- `dto/create-photo.dto.ts` — DTO body multipart (upload)
- `dto/photo-query.dto.ts` — DTO query string (list)
- `photos.service.ts` + `photos.service.spec.ts` — storage file + logica DB
- `photos.controller.ts` — endpoint REST
- `photos.module.ts` — wiring modulo

**Backend — modifiche a file esistenti:**
- `backend/src/app.module.ts` — registra `PhotosModule`
- `docker-compose.yml` — volume `photos_data` sul servizio `api`
- `docker-compose.override.yml` — bind mount `./backend/photos` sul servizio `api` (dev)
- `backend/package.json` — nuova dipendenza `heic-convert`
- `backend/pnpm-workspace.yaml` — eventuale `allowBuilds` per dipendenze transitive di `heic-convert` (verificato in Task 1)
- `backend/src/database/migrations/` — nuova migration generata (Task 2)

**Frontend — nuovi file:**
- `frontend/src/app/core/entities/photo.entity.ts` — interfaccia `Photo`
- `frontend/src/app/services/photos.service.ts` — `PhotosService` (non estende `AbstractService`, multipart + blob)
- `frontend/src/app/core/components/photo-gallery.component.ts` + `.html` + `.scss` — `PhotoGalleryComponent` standalone riusabile

**Frontend — modifiche a file esistenti:**
- `frontend/src/app/pages/assets/asset-edit-dialog.component.ts` + `.html` — nuovo tab "Foto"
- `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts` + `.html` — nuovo tab "Foto"

---

### Task 1: Volume storage + dipendenza `heic-convert`

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.override.yml`
- Modify: `backend/package.json`
- Modify: `backend/pnpm-workspace.yaml` (solo se necessario, vedi Step 3)

**Interfaces:**
- Produces: volume Docker `photos_data` montato su `/usr/src/app/photos` (prod) e bind mount `./backend/photos` (dev) sul container `api`; pacchetto npm `heic-convert` disponibile per import dinamico in Task 3.

- [ ] **Step 1: Aggiungi il volume a `docker-compose.yml` (produzione)**

In `docker-compose.yml`, nel servizio `api`, sotto `volumes:`:

```yaml
    volumes:
      - backups_data:/usr/src/app/backups
      - photos_data:/usr/src/app/photos
```

E nella sezione top-level `volumes:` a fine file:

```yaml
volumes:
  mysql_data:
  backups_data:
  photos_data:
```

- [ ] **Step 2: Aggiungi il bind mount a `docker-compose.override.yml` (sviluppo)**

Nel servizio `api`, sotto `volumes:` (accanto a `./backend/backups:/usr/src/app/backups`):

```yaml
    volumes:
      - ./backend:/usr/src/app
      - ./backend/backups:/usr/src/app/backups
      - ./backend/photos:/usr/src/app/photos
      - api_node_modules:/usr/src/app/node_modules
```

- [ ] **Step 3: Installa `heic-convert` dentro il container**

```bash
docker exec utenzepa-api-1 pnpm add heic-convert
```

Se l'output mostra `ERR_PNPM_IGNORED_BUILDS` o un warning su script di build ignorati per una dipendenza transitiva di `heic-convert`, aggiungi la voce in `backend/pnpm-workspace.yaml` sotto `allowBuilds:` (es. `nome-pacchetto: true`), poi rilancia `pnpm install` dentro il container. Se invece l'install è pulita, nessuna modifica a `pnpm-workspace.yaml`.

- [ ] **Step 4: Sistema permessi post-install**

```bash
docker exec -u root utenzepa-api-1 chown -R 1000:1000 node_modules .pnpm-store
```

(vedi CLAUDE.md — necessario dopo qualunque comando pnpm nel container dev)

- [ ] **Step 5: Verifica build**

```bash
docker exec utenzepa-api-1 pnpm run build
```

Expected: build pulita, nessun errore.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml docker-compose.override.yml backend/package.json backend/pnpm-lock.yaml
# se modificato:
git add backend/pnpm-workspace.yaml
git commit -m "chore(photos): volume storage foto + dipendenza heic-convert"
```

---

### Task 2: Entity `Photo` + enum + migration

**Files:**
- Create: `backend/src/apis/photos/enum/photo-entity-type.enum.ts`
- Create: `backend/src/apis/photos/entity/photo.entity.ts`
- Create: `backend/src/database/migrations/*.ts` (generata, non scritta a mano)

**Interfaces:**
- Produces: enum `PhotoEntityType` (`ASSET = 'asset'`, `UTILITY = 'utility'`); entity `Photo` con campi `id: number`, `entity_type: PhotoEntityType`, `entity_id: number`, `file_path: string`, `mime_type: string`, `original_filename: string | null`, `file_size: number`, `create_date: Date`, `update_date: Date`, `created_by_user_id: number`, `updated_by_user_id: number`, `deleted: boolean`.

- [ ] **Step 1: Crea l'enum**

`backend/src/apis/photos/enum/photo-entity-type.enum.ts`:

```typescript
export enum PhotoEntityType {
  ASSET = 'asset',
  UTILITY = 'utility',
}
```

- [ ] **Step 2: Crea l'entity**

`backend/src/apis/photos/entity/photo.entity.ts`:

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PhotoEntityType } from '../enum/photo-entity-type.enum';

@Entity('photos')
@Index(['entity_type', 'entity_id'])
export class Photo {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'enum', enum: PhotoEntityType })
  entity_type: PhotoEntityType;

  @Column({ type: 'int' })
  entity_id: number;

  @Column({ length: 500 })
  file_path: string;

  @Column({ length: 50 })
  mime_type: string;

  @Column({ length: 255, nullable: true })
  original_filename: string;

  @Column({ type: 'int' })
  file_size: number;

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
}
```

- [ ] **Step 3: Genera la migration dentro il container**

```bash
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate src/database/migrations/CreatePhotos -d src/database/data-source.ts
docker exec -u root utenzepa-api-1 chown -R 1000:1000 node_modules .pnpm-store src/database/migrations
```

- [ ] **Step 4: Verifica la migration generata**

Apri il file generato in `backend/src/database/migrations/` e conferma che crea la tabella `photos` con tutte le colonne sopra (incluso l'indice su `entity_type, entity_id`). Nessuna modifica manuale necessaria se il generato è corretto.

- [ ] **Step 5: Riavvia il container e verifica che la migration giri pulita**

```bash
docker restart utenzepa-api-1
docker logs utenzepa-api-1 --tail 40
```

Expected: nessun errore di migration nei log, tabella `photos` presente.

```bash
docker exec utenzepa-mysql-1 mysql -uroot -p"$MYSQL_PASSWORD" mydatabase -e "DESCRIBE photos;"
```

Expected: colonne come da entity.

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/photos/enum/photo-entity-type.enum.ts backend/src/apis/photos/entity/photo.entity.ts backend/src/database/migrations/
git commit -m "feat(photos): entity Photo polimorfica + migration"
```

---

### Task 3: `PhotosService` — storage file + logica DB

**Files:**
- Create: `backend/src/apis/photos/dto/create-photo.dto.ts`
- Create: `backend/src/apis/photos/dto/photo-query.dto.ts`
- Create: `backend/src/apis/photos/photos.service.ts`
- Test: `backend/src/apis/photos/photos.service.spec.ts`

**Interfaces:**
- Consumes: `PhotoEntityType` (Task 2, enum), `Photo` entity (Task 2), `Asset`/`Utility` entity (`@apis/asset/entity/asset.entity`, `@apis/utility/entity/utility.entity`, già esistenti).
- Produces: `PhotosService` con metodi `create(dto: CreatePhotoDto, file: Express.Multer.File, userId: number): Promise<Photo>`, `findAll(entityType: PhotoEntityType, entityId: number): Promise<Photo[]>`, `findOne(id: number): Promise<Photo>`, `getAbsolutePath(photo: Photo): string`, `remove(id: number, updatedByUserId: number): Promise<void>` — usati da `PhotosController` in Task 4.

- [ ] **Step 1: Crea i DTO**

`backend/src/apis/photos/dto/create-photo.dto.ts` (letto da query string come `PhotoQueryDto` sotto — vedi nota nel Task 4 sul perché `entity_type`/`entity_id` viaggiano come query param anche sulla `POST`; stessa convenzione camelCase quindi, non lo snake_case dei DTO body-JSON):

```typescript
import { IsEnum, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { PhotoEntityType } from '../enum/photo-entity-type.enum';

export class CreatePhotoDto {
  @IsEnum(PhotoEntityType, { message: 'entityType deve essere "asset" o "utility"' })
  entityType: PhotoEntityType;

  @Transform(({ value }) => Number(value))
  @IsInt({ message: 'entityId deve essere un intero' })
  @Min(1)
  entityId: number;
}
```

`backend/src/apis/photos/dto/photo-query.dto.ts` (query string GET, camelCase come `MapQueryDto`):

```typescript
import { IsEnum, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { PhotoEntityType } from '../enum/photo-entity-type.enum';

export class PhotoQueryDto {
  @IsEnum(PhotoEntityType, { message: 'entityType deve essere "asset" o "utility"' })
  entityType: PhotoEntityType;

  @Transform(({ value }) => Number(value))
  @IsInt({ message: 'entityId deve essere un intero' })
  @Min(1)
  entityId: number;
}
```

- [ ] **Step 2: Scrivi i test falliti per `PhotosService`**

`backend/src/apis/photos/photos.service.spec.ts`:

```typescript
import * as fs from 'fs';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PhotosService } from './photos.service';
import { PhotoEntityType } from './enum/photo-entity-type.enum';

jest.mock('fs');

describe('PhotosService', () => {
  let service: PhotosService;
  let photoRepo: { count: jest.Mock; create: jest.Mock; save: jest.Mock; findOne: jest.Mock; remove: jest.Mock };
  let assetRepo: { exists: jest.Mock };
  let utilityRepo: { exists: jest.Mock };

  beforeEach(() => {
    (fs.mkdirSync as jest.Mock).mockReset();
    (fs.writeFileSync as jest.Mock).mockReset();
    (fs.unlinkSync as jest.Mock).mockReset();

    photoRepo = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => ({ id: 1, ...data })),
      findOne: jest.fn(),
      remove: jest.fn(async (photo) => photo),
    };
    assetRepo = { exists: jest.fn().mockResolvedValue(true) };
    utilityRepo = { exists: jest.fn().mockResolvedValue(true) };

    service = new PhotosService(photoRepo as never, assetRepo as never, utilityRepo as never);
  });

  describe('create', () => {
    it('rifiuta un mime type non in allowlist', async () => {
      const file = { mimetype: 'application/pdf', buffer: Buffer.from(''), originalname: 'f.pdf' } as Express.Multer.File;

      await expect(
        service.create({ entityType: PhotoEntityType.ASSET, entityId: 1 }, file, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rifiuta se l\'entità collegata non esiste', async () => {
      assetRepo.exists.mockResolvedValue(false);
      const file = { mimetype: 'image/jpeg', buffer: Buffer.from('x'), originalname: 'f.jpg' } as Express.Multer.File;

      await expect(
        service.create({ entityType: PhotoEntityType.ASSET, entityId: 999 }, file, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rifiuta se è già stato raggiunto il limite di 10 foto', async () => {
      photoRepo.count.mockResolvedValue(10);
      const file = { mimetype: 'image/jpeg', buffer: Buffer.from('x'), originalname: 'f.jpg' } as Express.Multer.File;

      await expect(
        service.create({ entityType: PhotoEntityType.ASSET, entityId: 1 }, file, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('salva il file jpeg così com\'è e crea la riga DB', async () => {
      const buffer = Buffer.from('jpeg-bytes');
      const file = { mimetype: 'image/jpeg', buffer, originalname: 'foto.jpg' } as Express.Multer.File;

      const result = await service.create({ entityType: PhotoEntityType.UTILITY, entityId: 42 }, file, 7);

      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), buffer);
      expect(photoRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: PhotoEntityType.UTILITY,
          entity_id: 42,
          mime_type: 'image/jpeg',
          original_filename: 'foto.jpg',
          created_by_user_id: 7,
          updated_by_user_id: 7,
        }),
      );
      expect(result.id).toBe(1);
    });

    it('converte heic a jpeg prima di scrivere su disco', async () => {
      const converted = Buffer.from('converted-jpeg');
      jest.doMock('heic-convert', () => jest.fn().mockResolvedValue(converted), { virtual: true });
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PhotosService: FreshPhotosService } = require('./photos.service');
      const freshService = new FreshPhotosService(photoRepo as never, assetRepo as never, utilityRepo as never);

      const file = { mimetype: 'image/heic', buffer: Buffer.from('heic-bytes'), originalname: 'foto.heic' } as Express.Multer.File;

      await freshService.create({ entityType: PhotoEntityType.ASSET, entityId: 1 }, file, 1);

      expect(photoRepo.save).toHaveBeenCalledWith(expect.objectContaining({ mime_type: 'image/jpeg' }));
      jest.dontMock('heic-convert');
    });
  });

  describe('findAll', () => {
    it('filtra per entity_type/entity_id e deleted=false', async () => {
      const repoFindAll = { ...photoRepo, find: jest.fn().mockResolvedValue([]) };
      const svc = new PhotosService(repoFindAll as never, assetRepo as never, utilityRepo as never);

      await svc.findAll(PhotoEntityType.ASSET, 5);

      expect(repoFindAll.find).toHaveBeenCalledWith({
        where: { entity_type: PhotoEntityType.ASSET, entity_id: 5, deleted: false },
        order: { create_date: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('lancia NotFoundException se la foto non esiste', async () => {
      photoRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('rimuove il file fisico e soft-elimina la riga', async () => {
      const photo = { id: 1, file_path: 'asset/1/x.jpg', deleted: false };
      photoRepo.findOne.mockResolvedValue(photo);

      await service.remove(1, 9);

      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(photoRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ deleted: true, updated_by_user_id: 9 }),
      );
    });

    it('procede comunque se il file è già assente su disco (ENOENT)', async () => {
      const photo = { id: 1, file_path: 'asset/1/x.jpg', deleted: false };
      photoRepo.findOne.mockResolvedValue(photo);
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {
        const err = new Error('not found') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      });

      await expect(service.remove(1, 9)).resolves.toBeUndefined();
      expect(photoRepo.save).toHaveBeenCalledWith(expect.objectContaining({ deleted: true }));
    });
  });
});
```

- [ ] **Step 3: Esegui i test — devono fallire (PhotosService non esiste ancora)**

```bash
docker exec utenzepa-api-1 pnpm exec jest src/apis/photos/photos.service.spec.ts --maxWorkers=2
```

Expected: FAIL — `Cannot find module './photos.service'`.

- [ ] **Step 4: Implementa `PhotosService`**

`backend/src/apis/photos/photos.service.ts`:

```typescript
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
      throw new BadRequestException('Formato immagine non supportato (ammessi: jpeg, png, webp, heic)');
    }
    await this.assertEntityExists(dto.entityType, dto.entityId);

    const count = await this.repo.count({
      where: { entity_type: dto.entityType, entity_id: dto.entityId, deleted: false },
    });
    if (count >= MAX_PHOTOS_PER_ENTITY) {
      throw new BadRequestException(`Limite di ${MAX_PHOTOS_PER_ENTITY} foto per elemento raggiunto`);
    }

    let buffer = file.buffer;
    let mimeType = file.mimetype;
    if (HEIC_MIME_TYPES.includes(mimeType)) {
      buffer = await this.convertHeicToJpeg(buffer);
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
      this.logger.warn(`File foto ${absolutePath} già assente su disco, procedo comunque con la rimozione della riga`);
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
    const convert = (await import('heic-convert')).default;
    const output = await convert({ buffer, format: 'JPEG', quality: 0.9 });
    return Buffer.from(output);
  }
}
```

- [ ] **Step 5: Esegui i test — devono passare**

```bash
docker exec utenzepa-api-1 pnpm exec jest src/apis/photos/photos.service.spec.ts --maxWorkers=2
```

Expected: PASS, tutti i test verdi.

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/photos/dto/ backend/src/apis/photos/photos.service.ts backend/src/apis/photos/photos.service.spec.ts
git commit -m "feat(photos): PhotosService - storage file + validazioni + conversione HEIC"
```

---

### Task 4: `PhotosController` + `PhotosModule` + wiring

**Files:**
- Create: `backend/src/apis/photos/photos.controller.ts`
- Create: `backend/src/apis/photos/photos.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `PhotosService` (Task 3, metodi `create`/`findAll`/`findOne`/`getAbsolutePath`/`remove`), `CreatePhotoDto`/`PhotoQueryDto` (Task 3), `JwtAuthGuard`/`RolesGuard`/`Roles`/`CurrentUser`/`ICurrentUser` (`@core/auth/...`, già esistenti).
- Produces: endpoint REST `GET /api/v1/photos`, `GET /api/v1/photos/:id/file`, `POST /api/v1/photos`, `DELETE /api/v1/photos/:id` — usati dal `PhotosService` (Angular, Task 5).

- [ ] **Step 1: Implementa il controller**

`backend/src/apis/photos/photos.controller.ts`:

```typescript
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
import { PhotosService } from './photos.service';
import { CreatePhotoDto } from './dto/create-photo.dto';
import { PhotoQueryDto } from './dto/photo-query.dto';
import { Photo } from './entity/photo.entity';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@core/auth/decorators/current-user.decorator';

const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

@Controller('photos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PhotosController {
  constructor(private readonly service: PhotosService) {}

  @Get()
  list(@Query() query: PhotoQueryDto): Promise<Photo[]> {
    return this.service.findAll(query.entityType, query.entityId);
  }

  @Get(':id/file')
  async getFile(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const photo = await this.service.findOne(id);
    res.set({ 'Content-Type': photo.mime_type });
    return new StreamableFile(fs.createReadStream(this.service.getAbsolutePath(photo)));
  }

  @Roles('Admin', 'Operatore')
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_SIZE_BYTES } }))
  create(
    @Query() dto: CreatePhotoDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Photo> {
    if (!file) throw new BadRequestException('File mancante');
    return this.service.create(dto, file, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
```

> Nota: `entityType`/`entityId` in `create()` sono letti da `@Query()` (query string sull'URL), non da `@Body()` — con `multipart/form-data` NestJS non applica la validation pipe automaticamente ai campi non-file del body a meno di parsing extra; passarli come query param sulla stessa richiesta POST evita quel problema ed è coerente col fatto che sono metadati di instradamento, non contenuto del form (stessa convenzione camelCase di `PhotoQueryDto`, non lo snake_case dei DTO body-JSON). Il frontend (Task 5) chiama quindi `POST /photos?entityType=...&entityId=...` con solo il file nel body multipart.

- [ ] **Step 2: Implementa il modulo**

`backend/src/apis/photos/photos.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Photo } from './entity/photo.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Photo, Asset, Utility])],
  providers: [PhotosService],
  controllers: [PhotosController],
})
export class PhotosModule {}
```

- [ ] **Step 3: Registra il modulo in `app.module.ts`**

Aggiungi l'import in cima al file:

```typescript
import { PhotosModule } from '@apis/photos/photos.module';
```

E nell'array `imports:` del `@Module`, dopo `ImportModule,`:

```typescript
    ImportModule,
    PhotosModule,
```

- [ ] **Step 4: Verifica build e avvio**

```bash
docker exec utenzepa-api-1 pnpm run build
docker restart utenzepa-api-1
docker logs utenzepa-api-1 --tail 40
```

Expected: build pulita, avvio senza errori, nessuna migration pendente (già applicata in Task 2).

- [ ] **Step 5: Verifica manuale endpoint (curl con token)**

Ottieni un token valido (login con un utente esistente), poi:

```bash
TOKEN="<jwt ottenuto dal login>"
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3010/api/v1/photos?entityType=asset&entityId=1"
```

Expected: `[]` (nessuna foto ancora caricata per l'asset 1) oppure `401` se il token non è valido — mai `500`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/photos/photos.controller.ts backend/src/apis/photos/photos.module.ts backend/src/app.module.ts
git commit -m "feat(photos): PhotosController + PhotosModule + wiring app.module"
```

---

### Task 5: Frontend `PhotosService`

**Files:**
- Create: `frontend/src/app/core/entities/photo.entity.ts`
- Create: `frontend/src/app/services/photos.service.ts`

**Interfaces:**
- Produces: interfaccia `Photo` (`id`, `entity_type: 'asset'|'utility'`, `entity_id`, `file_path`, `mime_type`, `original_filename`, `file_size`, `create_date`); `PhotosService` con metodi `list(entityType, entityId): Observable<Photo[]>`, `upload(entityType, entityId, file: File): Observable<Photo>`, `getFileBlob(id: number): Observable<Blob>`, `delete(id: number): Observable<void>` — usati da `PhotoGalleryComponent` (Task 6).

- [ ] **Step 1: Crea l'entity/interfaccia**

`frontend/src/app/core/entities/photo.entity.ts`:

```typescript
export type PhotoEntityType = 'asset' | 'utility';

export interface Photo {
  id: number;
  entity_type: PhotoEntityType;
  entity_id: number;
  file_path: string;
  mime_type: string;
  original_filename: string | null;
  file_size: number;
  create_date: string;
}
```

- [ ] **Step 2: Crea il servizio**

`frontend/src/app/services/photos.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { Photo, PhotoEntityType } from '../core/entities/photo.entity';

@Injectable({ providedIn: 'root' })
export class PhotosService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly BASE_URL = `${environment.apiUrl}/photos`;

  private getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken() || ''}` });
  }

  list(entityType: PhotoEntityType, entityId: number): Observable<Photo[]> {
    const params = new HttpParams().set('entityType', entityType).set('entityId', String(entityId));
    return this.http.get<Photo[]>(this.BASE_URL, { headers: this.getAuthHeaders(), params });
  }

  upload(entityType: PhotoEntityType, entityId: number, file: File): Observable<Photo> {
    const formData = new FormData();
    formData.append('file', file);
    const params = new HttpParams().set('entityType', entityType).set('entityId', String(entityId));
    return this.http.post<Photo>(this.BASE_URL, formData, { headers: this.getAuthHeaders(), params });
  }

  getFileBlob(id: number): Observable<Blob> {
    return this.http.get(`${this.BASE_URL}/${id}/file`, {
      headers: this.getAuthHeaders(),
      responseType: 'blob',
    });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.BASE_URL}/${id}`, { headers: this.getAuthHeaders() });
  }
}
```

- [ ] **Step 3: Verifica build**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```

Expected: build pulita, nessun errore TypeScript.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/core/entities/photo.entity.ts frontend/src/app/services/photos.service.ts
git commit -m "feat(photos): PhotosService frontend (upload/list/delete/blob)"
```

---

### Task 6: `PhotoGalleryComponent`

**Files:**
- Create: `frontend/src/app/core/components/photo-gallery.component.ts`
- Create: `frontend/src/app/core/components/photo-gallery.component.html`
- Create: `frontend/src/app/core/components/photo-gallery.component.scss`

**Interfaces:**
- Consumes: `PhotosService` (Task 5), `ConfirmDialogComponent`/`ConfirmDialogData` (`./confirm-dialog.component`, già esistente), `HasRoleDirective` (`../directives/has-role.directive`, già esistente), `ToastService` (`../services/toast.service`, già esistente).
- Produces: componente standalone `app-photo-gallery`, `@Input({required:true}) entityType: PhotoEntityType`, `@Input({required:true}) entityId: number` — usato dai dialog edit (Task 7, Task 8).

- [ ] **Step 1: Crea il template**

`frontend/src/app/core/components/photo-gallery.component.html`:

```html
<div class="photo-gallery">
  @if (photos.length === 0) {
    <p class="photo-gallery-empty">Nessuna foto caricata.</p>
  }

  <div class="photo-gallery-grid">
    @for (photo of photos; track photo.id) {
      <div class="photo-gallery-item">
        @if (thumbnailUrls.get(photo.id); as url) {
          <img [src]="url" [alt]="photo.original_filename ?? 'Foto'">
        } @else {
          <div class="photo-gallery-loading"></div>
        }
        <button mat-icon-button class="photo-gallery-delete" matTooltip="Elimina foto"
                [appHasRole]="['Admin','Operatore']" (click)="confirmDelete(photo)">
          <mat-icon>delete</mat-icon>
        </button>
      </div>
    }
  </div>

  <div class="photo-gallery-actions" [appHasRole]="['Admin','Operatore']">
    <input #fileInput type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
           multiple hidden (change)="onFilesSelected($event)">
    <button mat-stroked-button type="button" [disabled]="uploading || photos.length >= maxPhotos"
            (click)="fileInput.click()">
      <mat-icon>add_photo_alternate</mat-icon>
      Carica foto
    </button>
    <span class="photo-gallery-count">{{ photos.length }}/{{ maxPhotos }}</span>
  </div>

  @if (uploading) {
    <mat-progress-bar mode="indeterminate"></mat-progress-bar>
  }
</div>
```

- [ ] **Step 2: Crea lo stile**

`frontend/src/app/core/components/photo-gallery.component.scss`:

```scss
.photo-gallery {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.photo-gallery-empty {
  color: #6A7282;
  font-style: italic;
  margin: 0;
}

.photo-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
}

.photo-gallery-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  background: #f3f4f6;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.photo-gallery-loading {
  width: 100%;
  height: 100%;
  background: #e5e7eb;
}

.photo-gallery-delete {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(255, 255, 255, 0.85);
}

.photo-gallery-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.photo-gallery-count {
  color: #6A7282;
  font-size: 0.85rem;
}
```

- [ ] **Step 3: Implementa il componente**

`frontend/src/app/core/components/photo-gallery.component.ts`:

```typescript
import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { PhotosService } from '../../services/photos.service';
import { Photo, PhotoEntityType } from '../entities/photo.entity';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';
import { HasRoleDirective } from '../directives/has-role.directive';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-photo-gallery',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule, MatProgressBarModule, HasRoleDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './photo-gallery.component.html',
  styleUrls: ['./photo-gallery.component.scss'],
})
export class PhotoGalleryComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) entityType!: PhotoEntityType;
  @Input({ required: true }) entityId!: number;

  private photosService = inject(PhotosService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);

  photos: Photo[] = [];
  thumbnailUrls = new Map<number, string>();
  uploading = false;
  readonly maxPhotos = 10;

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entityId'] && !changes['entityId'].firstChange) {
      this.load();
    }
  }

  ngOnDestroy(): void {
    this.thumbnailUrls.forEach((url) => URL.revokeObjectURL(url));
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (this.photos.length >= this.maxPhotos) {
        this.toast.add({ severity: 'warn', summary: 'Limite raggiunto', detail: 'Massimo 10 foto per elemento.' });
        break;
      }
      this.upload(file);
    }
    input.value = '';
  }

  confirmDelete(photo: Photo): void {
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        width: '350px',
        data: { title: 'Elimina foto', message: 'Eliminare questa foto?', confirmLabel: 'Elimina', danger: true },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.delete(photo);
      });
  }

  private load(): void {
    this.photosService.list(this.entityType, this.entityId).subscribe({
      next: (photos) => {
        this.photos = photos;
        this.loadThumbnails();
      },
      error: () => this.toast.add({ severity: 'error', summary: 'Errore nel caricamento delle foto' }),
    });
  }

  private loadThumbnails(): void {
    for (const photo of this.photos) {
      if (this.thumbnailUrls.has(photo.id)) continue;
      this.photosService.getFileBlob(photo.id).subscribe({
        next: (blob) => this.thumbnailUrls.set(photo.id, URL.createObjectURL(blob)),
        error: () => {
          // Anteprima non caricata: la foto resta comunque elencata/eliminabile.
        },
      });
    }
  }

  private upload(file: File): void {
    this.uploading = true;
    this.photosService.upload(this.entityType, this.entityId, file).subscribe({
      next: () => {
        this.uploading = false;
        this.load();
      },
      error: (err) => {
        this.uploading = false;
        this.toast.add({
          severity: 'error',
          summary: 'Errore upload',
          detail: err?.error?.message ?? 'Riprova.',
        });
      },
    });
  }

  private delete(photo: Photo): void {
    this.photosService.delete(photo.id).subscribe({
      next: () => {
        const url = this.thumbnailUrls.get(photo.id);
        if (url) URL.revokeObjectURL(url);
        this.thumbnailUrls.delete(photo.id);
        this.load();
      },
      error: () => this.toast.add({ severity: 'error', summary: 'Errore durante l\'eliminazione' }),
    });
  }
}
```

- [ ] **Step 4: Verifica build**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```

Expected: build pulita.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/components/photo-gallery.component.ts frontend/src/app/core/components/photo-gallery.component.html frontend/src/app/core/components/photo-gallery.component.scss
git commit -m "feat(photos): PhotoGalleryComponent standalone riusabile"
```

---

### Task 7: Tab "Foto" in `AssetEditDialogComponent`

**Files:**
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.ts`
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.html`

**Interfaces:**
- Consumes: `PhotoGalleryComponent` (Task 6, selector `app-photo-gallery`, input `entityType`/`entityId`).

- [ ] **Step 1: Aggiungi l'import e registralo negli `imports` del componente**

In `asset-edit-dialog.component.ts`, aggiungi l'import (il file importa già `MatTabsModule`, nessuna modifica a quello):

```typescript
import { PhotoGalleryComponent } from '../../core/components/photo-gallery.component';
```

Nell'array `imports:` del `@Component`, aggiungi `PhotoGalleryComponent` (accanto a `LocationMapComponent`, ultimo import della lista).

- [ ] **Step 2: Avvolgi il form esistente in un tab "Dati" + aggiungi il tab "Foto"**

In `asset-edit-dialog.component.html`, subito dopo l'apertura del form:

```html
<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-direction: column; gap: 1rem;">
```

sostituisci con:

```html
<mat-dialog-content>
  <mat-tab-group>
    <mat-tab label="Dati">
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-direction: column; gap: 1rem;">
```

E subito prima della chiusura:

```html
  </form>
</mat-dialog-content>
```

sostituisci con:

```html
  </form>
    </mat-tab>
    <mat-tab label="Foto" [disabled]="isNew">
      <div style="padding: 1rem 0;">
        <app-photo-gallery [entityType]="'asset'" [entityId]="data.item.id"></app-photo-gallery>
      </div>
    </mat-tab>
  </mat-tab-group>
</mat-dialog-content>
```

- [ ] **Step 3: Verifica build**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```

Expected: build pulita.

- [ ] **Step 4: Verifica manuale in browser**

Apri l'app, vai su Immobili, apri "Modifica" su un immobile esistente: deve comparire il tab "Foto" (abilitato), cliccandolo si vede la galleria (vuota o con foto esistenti). Apri "Aggiungi Immobile": il tab "Foto" deve essere presente ma disabilitato (grigio, non cliccabile) finché non si salva.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/assets/asset-edit-dialog.component.ts frontend/src/app/pages/assets/asset-edit-dialog.component.html
git commit -m "feat(photos): tab Foto in AssetEditDialogComponent"
```

---

### Task 8: Tab "Foto" in `UtilityEditDialogComponent`

**Files:**
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.html`

**Interfaces:**
- Consumes: `PhotoGalleryComponent` (Task 6, selector `app-photo-gallery`, input `entityType`/`entityId`).

- [ ] **Step 1: Aggiungi gli import e registrali negli `imports` del componente**

In `utility-edit-dialog.component.ts`, aggiungi (questo dialog NON importa ancora `MatTabsModule`, va aggiunto):

```typescript
import { MatTabsModule } from '@angular/material/tabs';
import { PhotoGalleryComponent } from '../../core/components/photo-gallery.component';
```

Nell'array `imports:` del `@Component` (subito dopo `MatDatepickerModule,`), aggiungi `MatTabsModule,` e, in coda alla lista (dopo `LocationMapComponent`), `PhotoGalleryComponent`.

- [ ] **Step 2: Avvolgi il form esistente in un tab "Dati" + aggiungi il tab "Foto"**

In `utility-edit-dialog.component.html`, subito dopo l'apertura del form:

```html
<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-direction: column; gap: 1.5rem;">
```

sostituisci con:

```html
<mat-dialog-content>
  <mat-tab-group>
    <mat-tab label="Dati">
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-direction: column; gap: 1.5rem;">
```

E subito prima della chiusura:

```html
  </form>
</mat-dialog-content>
```

sostituisci con:

```html
  </form>
    </mat-tab>
    <mat-tab label="Foto" [disabled]="isNew">
      <div style="padding: 1rem 0;">
        <app-photo-gallery [entityType]="'utility'" [entityId]="data.item.id"></app-photo-gallery>
      </div>
    </mat-tab>
  </mat-tab-group>
</mat-dialog-content>
```

- [ ] **Step 3: Verifica build**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```

Expected: build pulita.

- [ ] **Step 4: Verifica manuale in browser**

Stessa verifica del Task 7 ma sulla pagina Utenze: tab "Foto" abilitato su "Modifica Utenza", disabilitato su "Aggiungi Utenza". Upload di una foto reale (jpeg/png), verifica che compaia in griglia, elimina, verifica che scompaia. Se disponibile, prova anche un file `.heic` e verifica che l'anteprima si carichi comunque (conferma la conversione lato backend).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/utilities/utility-edit-dialog.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.html
git commit -m "feat(photos): tab Foto in UtilityEditDialogComponent"
```

---

## Deviazioni dalla spec

- La spec (sezione Testing) menziona "Test e2e ... con DB seedato (pattern
  esistente nel progetto)". Verificato durante la stesura del piano:
  `backend/test/jest-e2e.json` **non esiste** nel repo e nessun file
  `*.e2e-spec.ts` è presente in nessun modulo — lo script `test:e2e` in
  `package.json` punta a una config inesistente, non funzionante allo stato
  attuale (non è uno strumento realmente in uso, a differenza di
  `test:unit`). Questo piano si ferma quindi a unit test (Task 3) + verifica
  manuale in browser (Task 4/7/8), coerente con la pratica reale del
  progetto (vedi commit "aggiunge unit test ai moduli dominio senza
  copertura", nessun e2e). Aggiungere e2e reali per questo modulo — o
  sistemare `test:e2e` a livello di progetto — è fuori scope di questo piano.

## Self-Review Notes (per l'esecutore)

- Il backend legge `entityType`/`entityId` come **query string** su `POST /photos` (non dal body multipart) — vedi nota nel Task 4, Step 1. Il frontend (Task 5) è già coerente con questa scelta.
- Il limite Multer `fileSize` (Task 4) è una rete di sicurezza; se un file oltre 10MB dovesse comunque raggiungere `PhotosService.create()` (non dovrebbe succedere con multer configurato correttamente), non c'è un controllo esplicito di `file.buffer.length` lì — se durante il Task 4/Step 5 si osserva un errore 500 invece di un rifiuto pulito su un file grande, aggiungere un controllo `if (file.size > MAX_PHOTO_SIZE_BYTES) throw new BadRequestException(...)` in cima a `PhotosService.create()` come difesa aggiuntiva.
- Dopo il Task 8, fare un giro end-to-end completo (upload, delete, limite 10 foto, ruolo Lettore senza bottoni) prima di aprire la PR — vedi `superpowers:verification-before-completion`.
