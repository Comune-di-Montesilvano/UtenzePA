# Branding ente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere configurabile da UI (pagina Impostazioni) nome/tipo ente, coordinate mappa di default, logo e favicon — oggi hardcoded ("Comune di Montesilvano", `[42.5083, 14.15]`) in più punti frontend/backend. Rinominare il residuo "GUC"/"Gestione Utenze Comunali" nel nome applicativo fisso "UtenzePA".

**Architecture:** Nuova tabella singleton `app_settings` (una riga, id=1) esposta da un nuovo modulo NestJS `settings` (`GET /api/v1/settings/branding` pubblico, `PATCH` solo Admin). Frontend: `BrandingService` con cache in memoria, popolata da un `provideAppInitializer` che blocca il bootstrap finché il branding non è caricato (niente flash del vecchio testo), consumata da header/login/mappa/tab-title/favicon. Nuova pagina `Impostazioni > Branding`.

**Tech Stack:** NestJS 11 + TypeORM (MySQL), Angular 22 standalone components + Angular Material, class-validator DTO.

**Spec:** `docs/superpowers/specs/2026-08-31-branding-settings-design.md`

## Global Constraints

- Cap upload logo/favicon: 2MB per immagine (validato come lunghezza stringa data URI, ~2.8MB testo per 2MB binari dopo inflazione base64).
- Mime whitelist immagini: `image/png`, `image/jpeg`, `image/svg+xml`, `image/x-icon` (favicon).
- `GET /api/v1/settings/branding` è pubblico (nessun guard) — serve alla login page prima dell'autenticazione.
- `PATCH /api/v1/settings/branding` richiede ruolo `Admin` (`JwtAuthGuard` + `RolesGuard` + `@Roles('Admin')`).
- Le query che leggono solo campi testo (`entity_name` per gli oggetti email) devono usare `select` esplicito escludendo `logo`/`favicon` — non trascinare i blob quando non servono.
- Nome applicativo fisso "UtenzePA" (non editabile, non in `app_settings`) sostituisce ogni residuo "GUC"/"Gestione Utenze Comunali".
- Sempre `pnpm exec jest ... --maxWorkers=2` per i test backend (CLAUDE.md, runner con poche CPU).
- Dopo ogni modifica a un'entity: generare la migration dentro il container (`docker exec utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate ...`), mai a mano dall'host.
- Nessuna pagina/modifica frontend è conclusa senza una `ng build` reale (il solo `tsc --noEmit` non cattura errori di template Angular).

---

## Task 1: Entity `AppSettings` + migration + seed

**Files:**
- Create: `backend/src/apis/settings/entity/app-settings.entity.ts`
- Create: `backend/src/database/migrations/<timestamp>-CreateAppSettings.ts` (generata, poi editata a mano per il seed — vedi Step 4)

**Interfaces:**
- Produces: `AppSettings` entity con colonne `id`, `entity_name`, `entity_type`, `default_latitude`, `default_longitude`, `logo`, `logo_mime`, `favicon`, `favicon_mime`, `update_date`, `updated_by_user_id` — usata da tutti i task successivi.

- [ ] **Step 1: Scrivere l'entity**

```typescript
// backend/src/apis/settings/entity/app-settings.entity.ts
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Singleton: una sola riga, id sempre 1. Nessun CRUD multi-riga, nessun
// soft-delete — a differenza delle altre entity di dominio del progetto.
@Entity({ name: 'app_settings' })
export class AppSettings {
  @PrimaryColumn({ default: 1 })
  id: number;

  @Column({ length: 255, default: 'Comune di Montesilvano' })
  entity_name: string;

  @Column({ length: 100, default: 'Comune' })
  entity_type: string;

  @Column({ length: 20, default: '42.5083' })
  default_latitude: string;

  @Column({ length: 20, default: '14.15' })
  default_longitude: string;

  @Column({ type: 'longtext', nullable: true })
  logo: string | null;

  @Column({ length: 50, nullable: true })
  logo_mime: string | null;

  @Column({ type: 'longtext', nullable: true })
  favicon: string | null;

  @Column({ length: 50, nullable: true })
  favicon_mime: string | null;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'updated_by_user_id', nullable: true })
  updated_by_user_id: number | null;
}
```

- [ ] **Step 2: Generare la migration dentro il container**

Run:
```bash
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate src/database/migrations/CreateAppSettings -d src/database/data-source.ts
docker exec -u root utenzepa-api-1 chown -R 1000:1000 /usr/src/app/src/database/migrations
```
Expected: nuovo file `backend/src/database/migrations/<timestamp>-CreateAppSettings.ts` con un `CREATE TABLE app_settings (...)` nel metodo `up()`.

- [ ] **Step 3: Verificare il contenuto generato**

Aprire il file appena creato e controllare che tutte le colonne dell'entity siano presenti con i default corretti (stringhe, non NULL, tranne logo/favicon).

- [ ] **Step 4: Aggiungere il seed della riga id=1 in coda a `up()`**

TypeORM `migration:generate` crea solo lo schema (`CREATE TABLE`), non inserisce righe — va aggiunto a mano subito dopo la `CREATE TABLE` generata, prima della chiusura del metodo `up()`:

```typescript
        await queryRunner.query(
            `INSERT INTO \`app_settings\` (\`id\`, \`entity_name\`, \`entity_type\`, \`default_latitude\`, \`default_longitude\`) VALUES (1, 'Comune di Montesilvano', 'Comune', '42.5083', '14.15')`,
        );
```

E nel metodo `down()`, prima del `DROP TABLE` generato, non serve nulla in più (il `DROP TABLE` elimina anche la riga).

- [ ] **Step 5: Riavviare il container api e verificare la migration**

Run:
```bash
docker restart utenzepa-api-1
sleep 5
docker exec utenzepa-mysql-1 mysql -uroot -p"$(grep MYSQL_PASSWORD .env|cut -d= -f2)" mydatabase -e "SELECT * FROM app_settings"
```
Expected: una riga, id=1, `entity_name='Comune di Montesilvano'`, `entity_type='Comune'`, `default_latitude='42.5083'`, `default_longitude='14.15'`, `logo`/`favicon` NULL.

- [ ] **Step 6: Riavviare di nuovo per verificare l'idempotenza**

Run: `docker restart utenzepa-api-1` e controllare i log (`docker logs utenzepa-api-1 --tail 30`) — nessun errore, la migration non deve rieseguirsi (TypeORM la traccia come già applicata).

- [ ] **Step 7: Commit**

```bash
git add backend/src/apis/settings/entity/app-settings.entity.ts backend/src/database/migrations/
git commit -m "feat(settings): entity AppSettings + migration con seed"
```

---

## Task 2: `SettingsService` — lettura/scrittura branding con helper data URI

**Files:**
- Create: `backend/src/apis/settings/settings.service.ts`
- Create: `backend/src/apis/settings/dto/update-branding.dto.ts`
- Create: `backend/src/apis/settings/settings.service.spec.ts`

**Interfaces:**
- Consumes: `AppSettings` entity (Task 1).
- Produces:
  - `SettingsService.getBranding(): Promise<AppSettings>` — tutti i campi, inclusi i blob.
  - `SettingsService.getBrandingSummary(): Promise<Pick<AppSettings, 'entity_name' | 'entity_type' | 'default_latitude' | 'default_longitude'>>` — `select` esplicito, mai i blob. Usata da Task 4.
  - `SettingsService.updateBranding(dto: UpdateBrandingDto, userId: number): Promise<AppSettings>`.
  - `UpdateBrandingDto` — usata dal controller in Task 3.

- [ ] **Step 1: Scrivere il DTO**

```typescript
// backend/src/apis/settings/dto/update-branding.dto.ts
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon'];
// 2MB binari ~= 2.8MB di testo base64 (inflazione ~4/3 + margine per l'header "data:...;base64,").
export const MAX_DATA_URI_LENGTH = 2_800_000;

export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  entity_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entity_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  default_latitude?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  default_longitude?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DATA_URI_LENGTH, { message: 'Immagine troppo grande (max 2MB)' })
  logo?: string;

  @IsOptional()
  @IsBoolean()
  removeLogo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DATA_URI_LENGTH, { message: 'Immagine troppo grande (max 2MB)' })
  favicon?: string;

  @IsOptional()
  @IsBoolean()
  removeFavicon?: boolean;
}

export { ALLOWED_MIME };
```

- [ ] **Step 2: Scrivere i test del service (falliranno finché non esiste)**

```typescript
// backend/src/apis/settings/settings.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AppSettings } from './entity/app-settings.entity';

describe('SettingsService', () => {
  let service: SettingsService;
  let repo: { findOneOrFail: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    repo = { findOneOrFail: jest.fn(), save: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingsService, { provide: getRepositoryToken(AppSettings), useValue: repo }],
    }).compile();
    service = module.get(SettingsService);
  });

  it('getBranding ritorna la riga id=1', async () => {
    const row = { id: 1, entity_name: 'Comune di Montesilvano' } as AppSettings;
    repo.findOneOrFail.mockResolvedValue(row);

    await expect(service.getBranding()).resolves.toEqual(row);
    expect(repo.findOneOrFail).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('updateBranding valida il mime e salva logo come data URI', async () => {
    const existing = { id: 1, entity_name: 'x' } as AppSettings;
    repo.findOneOrFail.mockResolvedValue(existing);
    repo.save.mockImplementation(async (e) => e);

    const dataUri = 'data:image/png;base64,QUJD';
    const result = await service.updateBranding({ logo: dataUri }, 7);

    expect(result.logo).toBe(dataUri);
    expect(result.logo_mime).toBe('image/png');
    expect(result.updated_by_user_id).toBe(7);
  });

  it('updateBranding rifiuta un mime non in whitelist', async () => {
    repo.findOneOrFail.mockResolvedValue({ id: 1 } as AppSettings);

    await expect(
      service.updateBranding({ logo: 'data:image/gif;base64,QUJD' }, 1),
    ).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('updateBranding con removeLogo azzera logo e logo_mime', async () => {
    const existing = { id: 1, logo: 'data:image/png;base64,X', logo_mime: 'image/png' } as AppSettings;
    repo.findOneOrFail.mockResolvedValue(existing);
    repo.save.mockImplementation(async (e) => e);

    const result = await service.updateBranding({ removeLogo: true }, 1);

    expect(result.logo).toBeNull();
    expect(result.logo_mime).toBeNull();
  });
});
```

- [ ] **Step 3: Eseguire i test per verificare che falliscano**

Run: `docker exec utenzepa-api-1 pnpm exec jest settings.service.spec.ts --maxWorkers=2`
Expected: FAIL — `Cannot find module './settings.service'`.

- [ ] **Step 4: Scrivere `SettingsService`**

```typescript
// backend/src/apis/settings/settings.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettings } from './entity/app-settings.entity';
import { ALLOWED_MIME, UpdateBrandingDto } from './dto/update-branding.dto';

const SETTINGS_ID = 1;
const DATA_URI_PATTERN = /^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/;

function parseDataUri(dataUri: string): { mime: string; } {
  const match = DATA_URI_PATTERN.exec(dataUri);
  if (!match) throw new BadRequestException('Formato immagine non valido');
  const mime = match[1];
  if (!ALLOWED_MIME.includes(mime)) {
    throw new BadRequestException(
      `Formato immagine non supportato: ${mime}. Ammessi: ${ALLOWED_MIME.join(', ')}`,
    );
  }
  return { mime };
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSettings)
    private readonly repo: Repository<AppSettings>,
  ) {}

  getBranding(): Promise<AppSettings> {
    return this.repo.findOneOrFail({ where: { id: SETTINGS_ID } });
  }

  // Solo i campi testuali — mai logo/favicon (select esplicito, vedi Global
  // Constraints: non trascinare i blob dove non servono, es. subject email).
  getBrandingSummary(): Promise<
    Pick<AppSettings, 'entity_name' | 'entity_type' | 'default_latitude' | 'default_longitude'>
  > {
    return this.repo.findOneOrFail({
      where: { id: SETTINGS_ID },
      select: ['entity_name', 'entity_type', 'default_latitude', 'default_longitude'],
    });
  }

  async updateBranding(dto: UpdateBrandingDto, userId: number): Promise<AppSettings> {
    const existing = await this.repo.findOneOrFail({ where: { id: SETTINGS_ID } });

    if (dto.entity_name !== undefined) existing.entity_name = dto.entity_name;
    if (dto.entity_type !== undefined) existing.entity_type = dto.entity_type;
    if (dto.default_latitude !== undefined) existing.default_latitude = dto.default_latitude;
    if (dto.default_longitude !== undefined) existing.default_longitude = dto.default_longitude;

    if (dto.removeLogo) {
      existing.logo = null;
      existing.logo_mime = null;
    } else if (dto.logo !== undefined) {
      const { mime } = parseDataUri(dto.logo);
      existing.logo = dto.logo;
      existing.logo_mime = mime;
    }

    if (dto.removeFavicon) {
      existing.favicon = null;
      existing.favicon_mime = null;
    } else if (dto.favicon !== undefined) {
      const { mime } = parseDataUri(dto.favicon);
      existing.favicon = dto.favicon;
      existing.favicon_mime = mime;
    }

    existing.updated_by_user_id = userId;
    return this.repo.save(existing);
  }
}
```

- [ ] **Step 5: Eseguire i test e verificare che passino**

Run: `docker exec utenzepa-api-1 pnpm exec jest settings.service.spec.ts --maxWorkers=2`
Expected: PASS, 4 test.

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/settings/settings.service.ts backend/src/apis/settings/dto/update-branding.dto.ts backend/src/apis/settings/settings.service.spec.ts
git commit -m "feat(settings): SettingsService get/update branding con validazione data URI"
```

---

## Task 3: `SettingsController` + `SettingsModule` + wiring in `app.module.ts`

**Files:**
- Create: `backend/src/apis/settings/settings.controller.ts`
- Create: `backend/src/apis/settings/settings.module.ts`
- Create: `backend/src/apis/settings/settings.controller.spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `SettingsService` (Task 2).
- Produces: `SettingsModule` (esportato, usato da Task 4), route `GET/PATCH /api/v1/settings/branding`.

- [ ] **Step 1: Scrivere i test del controller (falliranno finché non esiste)**

```typescript
// backend/src/apis/settings/settings.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { AppSettings } from './entity/app-settings.entity';

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: jest.Mocked<SettingsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        {
          provide: SettingsService,
          useValue: { getBranding: jest.fn(), updateBranding: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(SettingsController);
    service = module.get(SettingsService);
  });

  it('getBranding delega a service.getBranding senza richiedere utente', async () => {
    const branding = { id: 1, entity_name: 'Comune di Montesilvano' } as AppSettings;
    service.getBranding.mockResolvedValue(branding);

    await expect(controller.getBranding()).resolves.toEqual(branding);
  });

  it('updateBranding delega a service.updateBranding con l\'id dell\'utente corrente', async () => {
    const updated = { id: 1, entity_name: 'Nuovo nome' } as AppSettings;
    service.updateBranding.mockResolvedValue(updated);

    const result = await controller.updateBranding(
      { entity_name: 'Nuovo nome' },
      { id: 7, email: 'admin@example.com', role: 'Admin' },
    );

    expect(service.updateBranding).toHaveBeenCalledWith({ entity_name: 'Nuovo nome' }, 7);
    expect(result).toEqual(updated);
  });
});
```

- [ ] **Step 2: Eseguire i test per verificare che falliscano**

Run: `docker exec utenzepa-api-1 pnpm exec jest settings.controller.spec.ts --maxWorkers=2`
Expected: FAIL — `Cannot find module './settings.controller'`.

- [ ] **Step 3: Scrivere il controller**

```typescript
// backend/src/apis/settings/settings.controller.ts
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { SettingsService } from './settings.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { AppSettings } from './entity/app-settings.entity';

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  // Pubblico: serve alla login page (prima dell'autenticazione) e al
  // title/favicon del tab browser, caricati a bootstrap dell'app.
  @Get('branding')
  getBranding(): Promise<AppSettings> {
    return this.service.getBranding();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  @Patch('branding')
  updateBranding(
    @Body() dto: UpdateBrandingDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<AppSettings> {
    return this.service.updateBranding(dto, user.id);
  }
}
```

- [ ] **Step 4: Scrivere il modulo**

```typescript
// backend/src/apis/settings/settings.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { AppSettings } from './entity/app-settings.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AppSettings])],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
```

- [ ] **Step 5: Registrare `SettingsModule` in `app.module.ts`**

Aggiungere l'import (vicino agli altri moduli `@apis/*`) e nell'array `imports` del `@Module`:

```typescript
import { SettingsModule } from '@apis/settings/settings.module';
```
... e nell'array `imports`, vicino a `PurposeModule`:
```typescript
    SettingsModule,
```

- [ ] **Step 6: Eseguire i test e verificare che passino**

Run: `docker exec utenzepa-api-1 pnpm exec jest settings.controller.spec.ts --maxWorkers=2`
Expected: PASS, 2 test.

- [ ] **Step 7: Verifica manuale end-to-end**

Run:
```bash
curl -s http://localhost:3010/api/v1/settings/branding
```
Expected: JSON con `entity_name: "Comune di Montesilvano"`, nessun errore 401 (endpoint pubblico).

- [ ] **Step 8: Commit**

```bash
git add backend/src/apis/settings/settings.controller.ts backend/src/apis/settings/settings.module.ts backend/src/apis/settings/settings.controller.spec.ts backend/src/app.module.ts
git commit -m "feat(settings): SettingsController (GET pubblico, PATCH Admin) + wiring modulo"
```

---

## Task 4: Email dinamiche — `EMailerService`, `auth.service.ts`, `setup.service.ts`

**Files:**
- Modify: `backend/src/core/email/email.service.ts`
- Modify: `backend/src/apis/auth/auth.service.ts`
- Modify: `backend/src/apis/auth/auth.module.ts`
- Modify: `backend/src/apis/setup/setup.service.ts`
- Modify: `backend/src/apis/setup/setup.module.ts`
- Modify: `backend/src/apis/auth/auth.service.spec.ts` (aggiungere mock `SettingsService`)
- Modify: `backend/src/apis/setup/setup.service.spec.ts` (aggiungere mock `SettingsService`)

**Interfaces:**
- Consumes: `SettingsService.getBrandingSummary()` (Task 2).
- Produces: `EMailerService.sendMail(to, subject, text, html?, fromName?)` — `fromName` opzionale, fallback `'UtenzePA'` se omesso.

- [ ] **Step 1: Aggiungere `fromName` a `EMailerService.sendMail`**

```typescript
// backend/src/core/email/email.service.ts — sostituisce il metodo sendMail esistente
  async sendMail(to: string, subject: string, text: string, html?: string, fromName = 'UtenzePA') {
    try {
      const info = await this.transporter.sendMail({
        from: `${fromName} <${USERNAME_EMAIL}>`,
        to,
        subject,
        text,
        html,
      });

      console.log('Email inviata: %s', info.messageId);
      return true;
    } catch (error) {
      console.error('Errore invio email:', error);
      return false;
    }
  }
```

- [ ] **Step 2: Wiring `SettingsModule` in `AuthMysqlModule` e `SetupModule`**

In `backend/src/apis/auth/auth.module.ts`, aggiungere l'import e inserirlo nell'array `imports`:
```typescript
import { SettingsModule } from '@apis/settings/settings.module';
```
```typescript
    EMailerModule,
    SettingsModule,
```

In `backend/src/apis/setup/setup.module.ts`, stessa cosa:
```typescript
import { SettingsModule } from '@apis/settings/settings.module';
```
```typescript
  imports: [TypeOrmModule.forFeature([SystemUser]), EMailerModule, SettingsModule],
```

- [ ] **Step 3: Aggiornare i test esistenti di `auth.service.spec.ts` per iniettare `SettingsService`**

Trovare il blocco `providers` in `Test.createTestingModule` (dentro `beforeEach`) e aggiungere:
```typescript
        {
          provide: SettingsService,
          useValue: { getBrandingSummary: jest.fn().mockResolvedValue({ entity_name: 'Comune di Montesilvano' }) },
        },
```
E l'import in testa al file:
```typescript
import { SettingsService } from '@apis/settings/settings.service';
```

- [ ] **Step 4: Aggiornare `auth.service.ts` — oggetto email dinamico**

```typescript
// backend/src/apis/auth/auth.service.ts
import { SettingsService } from '@apis/settings/settings.service';
// ... nel costruttore, aggiungere il parametro:
    private settings: SettingsService,
// ... sostituire sendOtpEmail:
  async sendOtpEmail(user: SystemUser, otp: string) {
    const { entity_name } = await this.settings.getBrandingSummary();
    const subject = `Reset password OTP UtenzePA - ${entity_name}`;
    const text = `Il tuo codice OTP per il reset della password è: ${otp}`;
    const html = `<p>Il tuo codice OTP per il reset della password è: <b>${otp}</b></p>`;

    // fromName: mittente email = nome ente (non "UtenzePA", quello resta
    // solo nell'oggetto) — vedi spec, riga email.service.ts.
    return this.mailer.sendMail(user.email, subject, text, html, entity_name);
  }
```

- [ ] **Step 5: Eseguire i test di auth e verificare che passino**

Run: `docker exec utenzepa-api-1 pnpm exec jest auth.service.spec.ts --maxWorkers=2`
Expected: PASS (nessuna regressione).

- [ ] **Step 6: Stesso aggiornamento per `setup.service.spec.ts` e `setup.service.ts`**

In `setup.service.spec.ts`, stesso pattern del passo 3 (mock `SettingsService` con `getBrandingSummary`).

In `setup.service.ts`:
```typescript
import { SettingsService } from '@apis/settings/settings.service';
// costruttore:
    private readonly settings: SettingsService,
// dentro requestOtp(), sostituire la chiamata a sendMail:
    const { entity_name } = await this.settings.getBrandingSummary();
    await this.mailer.sendMail(
      dto.email,
      `Attivazione account amministratore - UtenzePA (${entity_name})`,
      `Il tuo codice di verifica per completare la configurazione iniziale è: ${otp}`,
      `<p>Il tuo codice di verifica per completare la configurazione iniziale è: <b>${otp}</b></p>`,
      entity_name,
    );
```

- [ ] **Step 7: Eseguire i test di setup e verificare che passino**

Run: `docker exec utenzepa-api-1 pnpm exec jest setup.service.spec.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 8: Eseguire l'intera suite backend**

Run: `docker exec utenzepa-api-1 pnpm run test:unit -- --maxWorkers=2`
Expected: PASS, nessuna regressione altrove.

- [ ] **Step 9: Commit**

```bash
git add backend/src/core/email/email.service.ts backend/src/apis/auth/ backend/src/apis/setup/
git commit -m "feat(settings): email dinamiche (mittente/oggetto) da branding, rename GUC->UtenzePA"
```

---

## Task 5: Frontend — `Branding` model + `BrandingService`

**Files:**
- Create: `frontend/src/app/services/branding.service.ts`
- Create: `frontend/src/app/services/branding.service.spec.ts`

**Interfaces:**
- Produces:
  - `interface Branding { entity_name: string; entity_type: string; default_latitude: string; default_longitude: string; logo: string | null; logo_mime: string | null; favicon: string | null; favicon_mime: string | null; }`
  - `BrandingService.load(): Observable<Branding>` — chiama il backend e aggiorna la cache interna.
  - `BrandingService.current(): Branding` — valore sincrono corrente (throw se `load()` non è mai stato chiamato/completato — usato solo dopo l'`APP_INITIALIZER`, Task 6).
  - `BrandingService.current$: Observable<Branding>` — per componenti che vogliono reagire a un eventuale refresh futuro (non usato in questo piano, ma coerente con l'interfaccia).
  - `BrandingService.update(dto: Partial<Branding> & { removeLogo?: boolean; removeFavicon?: boolean }): Observable<Branding>`.

- [ ] **Step 1: Scrivere il test (fallirà finché il service non esiste)**

```typescript
// frontend/src/app/services/branding.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { BrandingService, Branding } from './branding.service';
import { environment } from '../../environments/environment';

const SAMPLE: Branding = {
  entity_name: 'Comune di Montesilvano',
  entity_type: 'Comune',
  default_latitude: '42.5083',
  default_longitude: '14.15',
  logo: null,
  logo_mime: null,
  favicon: null,
  favicon_mime: null,
};

describe('BrandingService', () => {
  let service: BrandingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), BrandingService],
    });
    service = TestBed.inject(BrandingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('load() chiama GET /settings/branding e popola current()', () => {
    service.load().subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/settings/branding`);
    expect(req.request.method).toBe('GET');
    req.flush(SAMPLE);

    expect(service.current()).toEqual(SAMPLE);
  });

  it('current() lancia se load() non è mai stato completato', () => {
    expect(() => service.current()).toThrowError();
  });
});
```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

Run: `ng test --watch=false --include='**/branding.service.spec.ts'` (dentro il container frontend, `docker exec utenzepa-frontend-1 pnpm exec ng test --watch=false --include='**/branding.service.spec.ts'`)
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Scrivere `BrandingService`**

```typescript
// frontend/src/app/services/branding.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Branding {
  entity_name: string;
  entity_type: string;
  default_latitude: string;
  default_longitude: string;
  logo: string | null;
  logo_mime: string | null;
  favicon: string | null;
  favicon_mime: string | null;
}

export interface UpdateBrandingPayload extends Partial<Branding> {
  removeLogo?: boolean;
  removeFavicon?: boolean;
}

@Injectable({ providedIn: 'root' })
export class BrandingService {
  private http = inject(HttpClient);
  private readonly BASE_URL = `${environment.apiUrl}/settings/branding`;

  private value: Branding | null = null;
  private subject = new BehaviorSubject<Branding | null>(null);
  readonly current$: Observable<Branding | null> = this.subject.asObservable();

  // GET pubblico — nessun header di auth necessario (endpoint senza guard,
  // vedi backend SettingsController). Chiamato una sola volta all'avvio
  // dell'app tramite APP_INITIALIZER (vedi app.config.ts).
  load(): Observable<Branding> {
    return this.http.get<Branding>(this.BASE_URL).pipe(
      tap((branding) => {
        this.value = branding;
        this.subject.next(branding);
      }),
    );
  }

  current(): Branding {
    if (!this.value) {
      throw new Error('BrandingService.current() chiamato prima di load() — verifica APP_INITIALIZER');
    }
    return this.value;
  }

  update(payload: UpdateBrandingPayload): Observable<Branding> {
    return this.http.patch<Branding>(this.BASE_URL, payload).pipe(
      tap((branding) => {
        this.value = branding;
        this.subject.next(branding);
      }),
    );
  }
}
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `docker exec utenzepa-frontend-1 pnpm exec ng test --watch=false --include='**/branding.service.spec.ts'`
Expected: PASS, 2 test.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/services/branding.service.ts frontend/src/app/services/branding.service.spec.ts
git commit -m "feat(branding): BrandingService (load/current/update)"
```

---

## Task 6: `APP_INITIALIZER` + title/favicon dinamici

**Files:**
- Modify: `frontend/src/app/app.config.ts`
- Modify: `frontend/src/index.html`

**Interfaces:**
- Consumes: `BrandingService.load()` (Task 5).
- Produces: al bootstrap, `document.title` e `link[rel=icon]` aggiornati; `BrandingService.current()` disponibile in modo sincrono per tutti i componenti da qui in poi.

- [ ] **Step 1: Aggiornare il `<title>` statico in `index.html`**

Il tag `<title>` in `index.html` è il fallback mostrato prima che il JS carichi il branding (o se JS disabilitato) — deve essere il nome applicativo fisso, non più il vecchio "GUC Montesilvano":

```html
<!-- riga 5, sostituisce <title>GUC Montesilvano</title> -->
<title>UtenzePA</title>
```

- [ ] **Step 2: Aggiungere l'inizializzazione branding in `app.config.ts`**

Aggiungere l'import in testa al file:
```typescript
import { BrandingService } from './services/branding.service';
import { firstValueFrom } from 'rxjs';
```

Aggiungere un secondo `provideAppInitializer` nell'array `providers` (dopo quello esistente per `Sentry.TraceService` — l'ordine tra i due non è rilevante, sono indipendenti):

```typescript
    provideAppInitializer(async () => {
      const branding = await firstValueFrom(inject(BrandingService).load());
      document.title = `${branding.entity_name} · UtenzePA`;
      if (branding.favicon) {
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (link) link.href = branding.favicon;
      }
      // favicon null -> resta il favicon.ico statico di index.html, nessun
      // fallback aggiuntivo necessario qui.
    }),
```

- [ ] **Step 3: Verificare con `ng build` reale**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: build completata senza errori (solo i warning preesistenti già noti — bundle budget, moduli non-ESM).

- [ ] **Step 4: Verifica manuale in dev**

Aprire `http://localhost:4300` nel browser, controllare il tab: titolo deve essere "Comune di Montesilvano · UtenzePA" (visibile prima ancora del login, dato che l'initializer blocca il bootstrap).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/app.config.ts frontend/src/index.html
git commit -m "feat(branding): APP_INITIALIZER carica branding, title/favicon dinamici"
```

---

## Task 7: Header e login dinamici

**Files:**
- Modify: `frontend/src/app/layout/main-layout.component.html`
- Modify: `frontend/src/app/layout/main-layout.component.ts`
- Modify: `frontend/src/app/pages/login/login.component.html`
- Modify: `frontend/src/app/pages/login/login.component.ts`

**Interfaces:**
- Consumes: `BrandingService.current()` (Task 5/6 — già popolato all'avvio, lettura sincrona sicura in questi componenti).

- [ ] **Step 1: `main-layout.component.ts` — esporre `entityName`**

Aggiungere l'import e la property (adattare al costruttore/`inject()` già presente nel file — leggere il file prima di editare per capire lo stile usato):
```typescript
import { BrandingService } from '../../services/branding.service';
// ...
  entityName = inject(BrandingService).current().entity_name;
```

- [ ] **Step 2: `main-layout.component.html` — sostituire il testo hardcoded**

```html
<!-- riga 6, sostituisce <p>Comune di Montesilvano</p> -->
<p>{{ entityName }}</p>
```

- [ ] **Step 3: `login.component.ts` — esporre `entityName`**

```typescript
import { BrandingService } from '../../services/branding.service';
// ... nella classe:
  entityName = inject(BrandingService).current().entity_name;
```
(Il componente usa già `private fb`/`private router`/`private auth` iniettati via costruttore — usare `inject()` per la nuova dipendenza è coerente con `app.config.ts`/altri service standalone del progetto, non richiede toccare il costruttore esistente.)

- [ ] **Step 4: `login.component.html` — sostituire i testi hardcoded**

```html
<!-- riga 7-8, sostituisce h2 "Gestione Utenze Comunali" e <p>Comune di Montesilvano</p> -->
<h2 style="font-size: 30px;">UtenzePA</h2>
<p>{{ entityName }}</p>
```

- [ ] **Step 5: Verificare con `ng build` reale**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: build completata senza errori.

- [ ] **Step 6: Verifica manuale in dev**

Aprire `/login`, controllare che il testo mostri "UtenzePA" / "Comune di Montesilvano"; fare login e controllare l'header del layout principale mostri "Comune di Montesilvano".

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/layout/main-layout.component.html frontend/src/app/layout/main-layout.component.ts frontend/src/app/pages/login/login.component.html frontend/src/app/pages/login/login.component.ts
git commit -m "feat(branding): header e login usano entity_name dinamico, rename GUC->UtenzePA"
```

---

## Task 8: Centro mappa di default dinamico

**Files:**
- Modify: `frontend/src/app/pages/map/map.component.ts`
- Modify: `frontend/src/app/core/components/location-map.component.ts`

**Interfaces:**
- Consumes: `BrandingService.current()` (Task 5/6).

- [ ] **Step 1: `map.component.ts` — sostituire il centro hardcoded**

```typescript
// aggiungere import in testa
import { BrandingService } from '../../services/branding.service';
// nella classe, aggiungere il campo iniettato (vicino agli altri service iniettati con `inject`)
  private brandingService = inject(BrandingService);
```
Poi, dentro `ngAfterViewInit()`, sostituire:
```typescript
    this.map = L.map('map-canvas').setView([42.5083, 14.15], 13); // Montesilvano
```
con:
```typescript
    const branding = this.brandingService.current();
    const defaultCenter: L.LatLngExpression = [
      parseFloat(branding.default_latitude),
      parseFloat(branding.default_longitude),
    ];
    this.map = L.map('map-canvas').setView(defaultCenter, 13);
```

- [ ] **Step 2: `location-map.component.ts` — sostituire `DEFAULT_CENTER`**

```typescript
// aggiungere import in testa
import { BrandingService } from '../../services/branding.service';
```
Sostituire:
```typescript
  private readonly DEFAULT_CENTER: L.LatLngExpression = [42.5083, 14.15]; // Montesilvano
```
con (property che legge il branding al momento dell'accesso, coerente con l'uso in `ngAfterViewInit()` più sotto nel file):
```typescript
  private brandingService = inject(BrandingService);

  private get DEFAULT_CENTER(): L.LatLngExpression {
    const branding = this.brandingService.current();
    return [parseFloat(branding.default_latitude), parseFloat(branding.default_longitude)];
  }
```
(Verificare che `inject` sia già importato da `@angular/core` in cima al file — se non lo è, aggiungerlo all'import esistente.)

- [ ] **Step 3: Verificare con `ng build` reale**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: build completata senza errori.

- [ ] **Step 4: Verifica manuale in dev**

Aprire `/map`, controllare che la mappa si apra centrata su Montesilvano (comportamento invariato, dato che il seed DB usa le stesse coordinate).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/map/map.component.ts frontend/src/app/core/components/location-map.component.ts
git commit -m "feat(branding): centro mappa default da branding invece di hardcoded"
```

---

## Task 9: Pagina `Impostazioni > Branding`

**Files:**
- Create: `frontend/src/app/pages/branding-settings/branding-settings.component.ts`
- Create: `frontend/src/app/pages/branding-settings/branding-settings.component.html`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/comp/sidebar/sidebar.component.ts`

**Interfaces:**
- Consumes: `BrandingService.current()`/`.update()` (Task 5), `LocationMapComponent` (già esistente, riuso diretto), `AuthService.getCurrentUser()` (pattern esistente per readonly non-Admin, vedi `AssetEditDialogComponent`).

- [ ] **Step 1: Scrivere il componente**

```typescript
// frontend/src/app/pages/branding-settings/branding-settings.component.ts
import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { LocationMapComponent } from '../../core/components/location-map.component';
import { BrandingService } from '../../services/branding.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-branding-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    LocationMapComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './branding-settings.component.html',
})
export class BrandingSettingsComponent {
  private fb = inject(FormBuilder);
  private brandingService = inject(BrandingService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  current = this.brandingService.current();
  logoPreview: string | null = this.current.logo;
  faviconPreview: string | null = this.current.favicon;
  saving = false;

  form = this.fb.group({
    entity_name: [this.current.entity_name, Validators.required],
    entity_type: [this.current.entity_type, Validators.required],
    default_latitude: [this.current.default_latitude],
    default_longitude: [this.current.default_longitude],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (role !== 'Admin') this.form.disable();
  }

  onPositionSelected(coords: { lat: string; lng: string }): void {
    this.form.patchValue({ default_latitude: coords.lat, default_longitude: coords.lng });
  }

  onLogoSelected(event: Event): void {
    this.readFileAsDataUri(event, (dataUri) => (this.logoPreview = dataUri));
  }

  onFaviconSelected(event: Event): void {
    this.readFileAsDataUri(event, (dataUri) => (this.faviconPreview = dataUri));
  }

  private readFileAsDataUri(event: Event, onLoaded: (dataUri: string) => void): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoaded(reader.result as string);
    reader.readAsDataURL(file);
  }

  removeLogo(): void {
    this.logoPreview = null;
  }

  removeFavicon(): void {
    this.faviconPreview = null;
  }

  save(): void {
    if (!this.form.valid) return;
    this.saving = true;

    const raw = this.form.getRawValue();
    this.brandingService
      .update({
        entity_name: raw.entity_name ?? undefined,
        entity_type: raw.entity_type ?? undefined,
        default_latitude: raw.default_latitude ?? undefined,
        default_longitude: raw.default_longitude ?? undefined,
        logo: this.logoPreview !== this.current.logo ? (this.logoPreview ?? undefined) : undefined,
        removeLogo: this.logoPreview === null && this.current.logo !== null,
        favicon:
          this.faviconPreview !== this.current.favicon ? (this.faviconPreview ?? undefined) : undefined,
        removeFavicon: this.faviconPreview === null && this.current.favicon !== null,
      })
      .subscribe({
        next: (branding) => {
          this.current = branding;
          this.saving = false;
          this.toastService.add({ severity: 'success', summary: 'Branding aggiornato' });
        },
        error: () => {
          this.saving = false;
          this.toastService.add({ severity: 'error', summary: 'Errore nel salvataggio' });
        },
      });
  }
}
```

- [ ] **Step 2: Scrivere il template**

```html
<!-- frontend/src/app/pages/branding-settings/branding-settings.component.html -->
<h2>Branding ente</h2>

<form [formGroup]="form" (ngSubmit)="save()">
  <mat-form-field appearance="outline">
    <mat-label>Nome ente</mat-label>
    <input matInput formControlName="entity_name" placeholder="Es. Comune di Montesilvano">
  </mat-form-field>

  <mat-form-field appearance="outline">
    <mat-label>Tipo ente</mat-label>
    <input matInput formControlName="entity_type" placeholder="Es. Comune">
  </mat-form-field>

  <h3>Coordinate mappa di default</h3>
  <app-location-map
    [latitude]="form.controls.default_latitude.value"
    [longitude]="form.controls.default_longitude.value"
    (positionSelected)="onPositionSelected($event)">
  </app-location-map>

  <h3>Logo</h3>
  @if (logoPreview) {
    <img [src]="logoPreview" alt="Logo ente" style="max-height:80px; display:block; margin-bottom:8px;">
    <button mat-stroked-button type="button" (click)="removeLogo()">Rimuovi logo</button>
  }
  <input type="file" accept="image/png,image/jpeg,image/svg+xml" (change)="onLogoSelected($event)">

  <h3>Favicon</h3>
  @if (faviconPreview) {
    <img [src]="faviconPreview" alt="Favicon" style="max-height:32px; display:block; margin-bottom:8px;">
    <button mat-stroked-button type="button" (click)="removeFavicon()">Rimuovi favicon</button>
  }
  <input type="file" accept="image/png,image/x-icon" (change)="onFaviconSelected($event)">

  <div style="margin-top:16px;">
    <button mat-raised-button color="primary" type="submit" [disabled]="!form.valid || saving">
      Salva
    </button>
  </div>
</form>
```

- [ ] **Step 3: Aggiungere la route**

In `frontend/src/app/app.routes.ts`, aggiungere l'import:
```typescript
import {BrandingSettingsComponent} from "./pages/branding-settings/branding-settings.component";
```
E nell'array `children` (vicino a `backup-import`):
```typescript
      {path: 'branding', component: BrandingSettingsComponent},
```

- [ ] **Step 4: Aggiungere la voce al submenu "Impostazioni" della sidebar**

In `frontend/src/app/comp/sidebar/sidebar.component.ts`, dentro l'array `submenu` di "Impostazioni" (vicino a "Backup e Importazione"):
```typescript
        {label: 'Branding', icon: 'palette', route: '/branding'},
```

- [ ] **Step 5: Verificare con `ng build` reale**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: build completata senza errori.

- [ ] **Step 6: Verifica manuale end-to-end in dev**

1. Login come Admin, aprire `Impostazioni > Branding`.
2. Cambiare `entity_name` in un valore di prova, cliccare "Salva" — deve comparire il toast di successo.
3. Ricaricare la pagina (F5) — l'header deve mostrare il nuovo nome (branding ricaricato dall'`APP_INITIALIZER`).
4. Riportare `entity_name` al valore originale "Comune di Montesilvano" e salvare di nuovo.
5. Login come utente non-Admin (se disponibile) — verificare che il form sia in sola lettura.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/pages/branding-settings/ frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts
git commit -m "feat(branding): pagina Impostazioni > Branding"
```

---

## Task 10: Pulizia finale — verifica completa e CI

**Files:** nessuno (solo verifica)

- [ ] **Step 1: Suite backend completa**

Run: `docker exec utenzepa-api-1 pnpm run test:unit -- --maxWorkers=2`
Expected: PASS, tutti i test verdi (inclusi quelli nuovi dei Task 2-4).

- [ ] **Step 2: Lint backend**

Run: `docker exec utenzepa-api-1 pnpm run lint`
Expected: nessun errore.

- [ ] **Step 3: Build backend**

Run: `docker exec utenzepa-api-1 pnpm run build`
Expected: build completata senza errori.

- [ ] **Step 4: Build frontend reale**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: build completata senza errori (solo warning preesistenti).

- [ ] **Step 5: Push e verifica CI**

```bash
git push
gh pr checks 78
```
Expected: check `backend` e `frontend` verdi.

- [ ] **Step 6: Nessun commit in questo step** (solo verifica) — se tutto verde, la PR #78 è pronta per il merge finale (richiesto esplicitamente dall'utente prima di procedere, come da convenzione: merge sempre manuale, mai `--auto`).
