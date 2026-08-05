# CORS ristretto, rimozione mailer morto, wizard bootstrap Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restringere il CORS del backend all'origine reale del frontend, rimuovere il modulo email morto (`common/mailer`), e aggiungere un wizard di bootstrap per creare il primo utente Admin (oggi impossibile: creare un utente richiede già un Admin).

**Architecture:** Nuovo modulo NestJS `apis/setup` con tre endpoint (`GET status`, `POST request-otp`, `POST verify`) protetti da un guard che si autodisattiva appena esiste almeno un `SystemUser`. Stato pendente del bootstrap (email/password-hash/OTP) tenuto in memoria di processo, mai persistito prima della verifica. Nuova pagina Angular `pages/setup/` a due step, raggiungibile solo se il backend segnala che il setup è disponibile.

**Tech Stack:** NestJS 11 + TypeORM (MySQL) sul backend, Angular 20 standalone + axios sul frontend, bcrypt per l'hashing, `EMailerService` esistente per l'invio email.

## Global Constraints

- Backend: alias TS `@apis/*` → `src/apis/*`, `@core/*` → `src/core/*`, `@/*` → `src/*` (vedi `backend/tsconfig.json`).
- Ruoli utente: enum `UserRole` in `backend/src/apis/shared/enum/user.enums.ts` — `UserRole.ADMIN = 'Admin'`.
- Entity `SystemUser` (`backend/src/apis/system-users/entity/system-user.entity.ts`): `created_by_user_id`/`updated_by_user_id` sono colonne **NOT NULL con FK self-referenziante** su `system_users.id` — il primo utente in assoluto non può puntare a un id esistente (chicken-and-egg). Va gestito esplicitamente (vedi Task 3).
- Bcrypt: 10 round, stesso valore già usato in `AuthService.resetPassword` (`backend/src/apis/auth/auth.service.ts:83`) — non introdurre un valore diverso.
- Comandi test sempre con `--maxWorkers=2` (vedi CLAUDE.md), eseguiti dentro il container `utenzepa-api-1` via `docker exec` (Node locale è v20, il progetto richiede >=24).
- Stack locale già in piedi: container `utenzepa-api-1` (porta host 3010), `utenzepa-mysql-1`, `utenzepa-frontend-1` (porta 4300), `mailpit` disponibile solo con l'override dev attivo (`docker-compose.override.yml`, UI su `http://localhost:8025`).

---

## File Structure

**Backend — nuovo modulo:**
- Create: `backend/src/apis/setup/setup.module.ts` — dichiara il modulo, importa `TypeOrmModule.forFeature([SystemUser])` ed `EMailerModule`.
- Create: `backend/src/apis/setup/setup.service.ts` — logica: stato pendente in memoria, `isAvailable()`, `requestOtp()`, `verifyOtp()`.
- Create: `backend/src/apis/setup/setup.service.spec.ts` — unit test del service (repo/mailer/dataSource mockati).
- Create: `backend/src/apis/setup/setup.guard.ts` — `CanActivate` che blocca (404) se `isAvailable()` è false.
- Create: `backend/src/apis/setup/setup.controller.ts` — 3 endpoint: `GET status`, `POST request-otp`, `POST verify`.
- Modify: `backend/src/app.module.ts` — registra `SetupModule` negli imports.

**Backend — CORS:**
- Modify: `backend/src/main.ts` — `cors: true` → `cors: { origin: corsOrigins }`.
- Modify: `docker-compose.yml` (root) — aggiunge `CORS_ORIGIN` al servizio `api`.
- Modify: `.env.example` e `.env` (root) — aggiunge `CORS_ORIGIN`.

**Backend — pulizia mailer morto:**
- Delete: `backend/src/common/mailer/mailer.service.ts`
- Delete: `backend/src/common/mailer/mailer.interface.ts`
- Delete: `backend/src/common/mailer/mailer.service.spec.ts`
- Modify: `backend/.env.example` — rimuove `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`EMAIL_FROM` (mai lette da nessun modulo reale).

**Frontend — pagina setup:**
- Create: `frontend/src/app/services/setup.service.ts` — chiamate HTTP (axios, stesso stile di `auth.service.ts`) ai 3 endpoint.
- Create: `frontend/src/app/guards/setup.guard.ts` — `CanActivate` che chiama `GET /setup/status`, redirige a `/login` se non disponibile.
- Create: `frontend/src/app/pages/setup/setup.component.ts`
- Create: `frontend/src/app/pages/setup/setup.component.html`
- Create: `frontend/src/app/pages/setup/setup.component.scss`
- Modify: `frontend/src/app/app.routes.ts` — aggiunge la route `/setup`.

---

### Task 1: SetupModule — scaffolding + `GET /setup/status`

**Files:**
- Create: `backend/src/apis/setup/setup.module.ts`
- Create: `backend/src/apis/setup/setup.service.ts`
- Create: `backend/src/apis/setup/setup.service.spec.ts`
- Create: `backend/src/apis/setup/setup.controller.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Produces: `SetupService.isAvailable(): Promise<boolean>` — usata da Task 2/3/4.
- Produces: `SetupController` montato su `/api/v1/setup` (prefisso globale già impostato in `main.ts`).

- [ ] **Step 1: Scrivere il test di `isAvailable()`**

Crea `backend/src/apis/setup/setup.service.spec.ts`:

```ts
import { SetupService } from './setup.service';
import { SystemUser } from '../system-users/entity/system-user.entity';

describe('SetupService', () => {
  let service: SetupService;
  let userRepository: { count: jest.Mock; findOne: jest.Mock };
  let mailer: { sendMail: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    userRepository = { count: jest.fn(), findOne: jest.fn() };
    mailer = { sendMail: jest.fn().mockResolvedValue(true) };
    dataSource = { transaction: jest.fn() };

    service = new SetupService(
      userRepository as never,
      mailer as never,
      dataSource as never,
    );
  });

  describe('isAvailable', () => {
    it('restituisce true se non esiste nessun utente', async () => {
      userRepository.count.mockResolvedValue(0);

      const result = await service.isAvailable();

      expect(result).toBe(true);
    });

    it('restituisce false se esiste almeno un utente', async () => {
      userRepository.count.mockResolvedValue(1);

      const result = await service.isAvailable();

      expect(result).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Eseguire il test, verificare che fallisca**

```
docker exec utenzepa-api-1 npx jest src/apis/setup/setup.service.spec.ts --maxWorkers=2
```
Atteso: FAIL, `Cannot find module './setup.service'`.

- [ ] **Step 3: Implementare `SetupService` (solo `isAvailable`)**

Crea `backend/src/apis/setup/setup.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SystemUser } from '../system-users/entity/system-user.entity';
import { EMailerService } from '@/core/email/email.service';

@Injectable()
export class SetupService {
  constructor(
    @InjectRepository(SystemUser)
    private readonly userRepository: Repository<SystemUser>,
    private readonly mailer: EMailerService,
    private readonly dataSource: DataSource,
  ) {}

  async isAvailable(): Promise<boolean> {
    return (await this.userRepository.count()) === 0;
  }
}
```

- [ ] **Step 4: Eseguire il test, verificare che passi**

```
docker exec utenzepa-api-1 npx jest src/apis/setup/setup.service.spec.ts --maxWorkers=2
```
Atteso: PASS, 2 test.

- [ ] **Step 5: Creare guard, controller e modulo**

Crea `backend/src/apis/setup/setup.guard.ts`:

```ts
import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { SetupService } from './setup.service';

// 404 (non 403): non deve rivelare che l'endpoint di setup sia mai esistito
// una volta creato il primo admin.
@Injectable()
export class SetupGuard implements CanActivate {
  constructor(private readonly setupService: SetupService) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.setupService.isAvailable())) {
      throw new NotFoundException();
    }
    return true;
  }
}
```

Crea `backend/src/apis/setup/setup.controller.ts`:

```ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SetupService } from './setup.service';
import { SetupGuard } from './setup.guard';

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  async status() {
    return { available: await this.setupService.isAvailable() };
  }

  @UseGuards(SetupGuard)
  @Post('request-otp')
  async requestOtp(
    @Body() body: { email: string; firstName: string; lastName: string; password: string },
  ) {
    return { status: 'ok' };
  }

  @UseGuards(SetupGuard)
  @Post('verify')
  async verify(@Body() body: { email: string; otp: string }) {
    return { status: 'ok' };
  }
}
```

Crea `backend/src/apis/setup/setup.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemUser } from '../system-users/entity/system-user.entity';
import { EMailerModule } from '@/core/email/mailer.module';
import { SetupService } from './setup.service';
import { SetupGuard } from './setup.guard';
import { SetupController } from './setup.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SystemUser]), EMailerModule],
  controllers: [SetupController],
  providers: [SetupService, SetupGuard],
})
export class SetupModule {}
```

In `backend/src/app.module.ts`, aggiungi l'import e registra il modulo:

```ts
import { SetupModule } from '@apis/setup/setup.module';
```
Nell'array `imports`, subito dopo `AuthMysqlModule,`:
```ts
    AuthMysqlModule,
    SetupModule,
```

- [ ] **Step 6: Verificare che l'app compili e parta**

```
docker exec utenzepa-api-1 npx jest src/apis/setup --maxWorkers=2
docker restart utenzepa-api-1
```
Poi controllare i log fino a `Nest application successfully started` senza errori:
```
docker logs utenzepa-api-1 --tail 20
```

- [ ] **Step 7: Verificare manualmente l'endpoint**

```
curl -s http://localhost:3010/api/v1/setup/status
```
Atteso: `{"available":false}` (il DB locale ha già un admin? Verifica con `docker exec utenzepa-mysql-1 mysql -uroot -p'change-me-in-production-openssl-rand-hex-24' -e "SELECT COUNT(*) FROM system_users;" mydatabase` — se il conteggio è 0, atteso `{"available":true}`).

- [ ] **Step 8: Commit**

```bash
git add backend/src/apis/setup backend/src/app.module.ts
git commit -m "feat(setup): scaffolding modulo bootstrap admin, endpoint status"
```

---

### Task 2: `POST /setup/request-otp` — genera OTP e invia email

**Files:**
- Modify: `backend/src/apis/setup/setup.service.ts`
- Modify: `backend/src/apis/setup/setup.service.spec.ts`
- Modify: `backend/src/apis/setup/setup.controller.ts`

**Interfaces:**
- Consumes: `EMailerService.sendMail(to: string, subject: string, text: string, html?: string): Promise<boolean>` (`backend/src/core/email/email.service.ts`).
- Produces: `SetupService.requestOtp(dto: { email: string; firstName: string; lastName: string; password: string }): Promise<boolean>` — usata da Task 4 (controller) e Task 3 (verify legge lo stesso stato pendente).
- Produces: proprietà privata `pending: PendingSetup | null` sull'istanza di `SetupService` — Task 3 la consuma per la verifica.

- [ ] **Step 1: Scrivere i test di `requestOtp`**

Aggiungi a `backend/src/apis/setup/setup.service.spec.ts`, dentro il blocco `describe('SetupService', ...)`:

```ts
  describe('requestOtp', () => {
    it('genera un OTP a 6 cifre, hasha la password e invia l\'email se non esiste nessun admin', async () => {
      userRepository.count.mockResolvedValue(0);

      const result = await service.requestOtp({
        email: 'admin@comune.it',
        firstName: 'Mario',
        lastName: 'Rossi',
        password: 'PasswordForte123!',
      });

      expect(result).toBe(true);
      expect(mailer.sendMail).toHaveBeenCalledTimes(1);
      const [to, , text] = mailer.sendMail.mock.calls[0];
      expect(to).toBe('admin@comune.it');
      expect(text).toMatch(/\d{6}/);
    });

    it('rifiuta la richiesta se esiste già un utente', async () => {
      userRepository.count.mockResolvedValue(1);

      const result = await service.requestOtp({
        email: 'admin@comune.it',
        firstName: 'Mario',
        lastName: 'Rossi',
        password: 'PasswordForte123!',
      });

      expect(result).toBe(false);
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Eseguire i test, verificare che falliscano**

```
docker exec utenzepa-api-1 npx jest src/apis/setup/setup.service.spec.ts --maxWorkers=2
```
Atteso: FAIL, `service.requestOtp is not a function`.

- [ ] **Step 3: Implementare `requestOtp`**

In `backend/src/apis/setup/setup.service.ts`, aggiungi in testa (sotto gli import esistenti):

```ts
import * as bcrypt from 'bcrypt';

interface PendingSetup {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  otp: string;
  otpExpiry: Date;
}
```

Aggiungi il campo privato e il metodo alla classe `SetupService`:

```ts
  private pending: PendingSetup | null = null;

  async requestOtp(dto: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }): Promise<boolean> {
    if (!(await this.isAvailable())) return false;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 60);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    this.pending = {
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash,
      otp,
      otpExpiry,
    };

    await this.mailer.sendMail(
      dto.email,
      'Attivazione account amministratore - Gestione Utenze Comunali',
      `Il tuo codice di verifica per completare la configurazione iniziale è: ${otp}`,
      `<p>Il tuo codice di verifica per completare la configurazione iniziale è: <b>${otp}</b></p>`,
    );

    return true;
  }
```

- [ ] **Step 4: Eseguire i test, verificare che passino**

```
docker exec utenzepa-api-1 npx jest src/apis/setup/setup.service.spec.ts --maxWorkers=2
```
Atteso: PASS, 4 test totali.

- [ ] **Step 5: Collegare il controller**

In `backend/src/apis/setup/setup.controller.ts`, sostituisci il corpo di `requestOtp`:

```ts
  @UseGuards(SetupGuard)
  @Post('request-otp')
  async requestOtp(
    @Body() body: { email: string; firstName: string; lastName: string; password: string },
  ) {
    const success = await this.setupService.requestOtp(body);
    return { status: success ? 'ok' : 'error' };
  }
```

- [ ] **Step 6: Verifica manuale con mailpit**

Assicurarsi che l'override dev sia attivo (`COMPOSE_FILE` decommentato in `.env`, `mailpit` in piedi — vedi `docker ps | grep mailpit`; se assente: `docker compose up -d mailpit`), poi:

```
docker restart utenzepa-api-1
curl -s -X POST http://localhost:3010/api/v1/setup/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@comune.it","firstName":"Mario","lastName":"Rossi","password":"PasswordForte123!"}'
```
Atteso: `{"status":"ok"}`. Poi aprire `http://localhost:8025` (UI mailpit) e verificare che sia arrivata un'email con un codice a 6 cifre.

- [ ] **Step 7: Commit**

```bash
git add backend/src/apis/setup
git commit -m "feat(setup): request-otp genera codice, hasha password, invia email"
```

---

### Task 3: `POST /setup/verify` — crea il primo Admin

**Files:**
- Modify: `backend/src/apis/setup/setup.service.ts`
- Modify: `backend/src/apis/setup/setup.service.spec.ts`
- Modify: `backend/src/apis/setup/setup.controller.ts`

**Interfaces:**
- Consumes: `PendingSetup` (Task 2), `this.dataSource.transaction()` (TypeORM `DataSource`, già iniettabile globalmente perché `MySqlModule` è `@Global()`).
- Consumes: entity `SystemUser` — colonne `created_by_user_id`/`updated_by_user_id` NOT NULL con FK self-referenziante (vedi Global Constraints).
- Produces: `SetupService.verifyOtp(email: string, otp: string): Promise<boolean>`.

**Nota tecnica**: `created_by_user_id`/`updated_by_user_id` sono FK NOT NULL su `system_users.id` — il primissimo utente non può referenziare un id esistente al momento dell'INSERT. Soluzione: dentro la transazione, disabilitare temporaneamente `FOREIGN_KEY_CHECKS` per la sola connessione della transazione (scope di sessione MySQL, non tocca altre connessioni concorrenti), inserire la riga, poi fare un UPDATE che la fa puntare a se stessa, poi riabilitare i check.

- [ ] **Step 1: Scrivere i test di `verifyOtp`**

Aggiungi a `backend/src/apis/setup/setup.service.spec.ts`:

```ts
  describe('verifyOtp', () => {
    const requestValidPending = async (manager: {
      query: jest.Mock;
      insert: jest.Mock;
      update: jest.Mock;
    }) => {
      userRepository.count.mockResolvedValue(0);
      await service.requestOtp({
        email: 'admin@comune.it',
        firstName: 'Mario',
        lastName: 'Rossi',
        password: 'PasswordForte123!',
      });
      const otp = mailer.sendMail.mock.calls[0][2].match(/\d{6}/)[0];
      dataSource.transaction.mockImplementation((cb) => cb(manager));
      return otp;
    };

    it('crea l\'admin se OTP corretto e nessun utente esiste ancora', async () => {
      const manager = {
        query: jest.fn(),
        insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 1 }] }),
        update: jest.fn(),
      };
      const otp = await requestValidPending(manager);
      userRepository.count.mockResolvedValue(0); // ricontrollo anti-race dentro verify

      const result = await service.verifyOtp('admin@comune.it', otp);

      expect(result).toBe(true);
      expect(manager.query).toHaveBeenCalledWith('SET FOREIGN_KEY_CHECKS=0');
      expect(manager.insert).toHaveBeenCalledWith(
        SystemUser,
        expect.objectContaining({ email: 'admin@comune.it', role: 'Admin' }),
      );
      expect(manager.update).toHaveBeenCalledWith(SystemUser, 1, {
        created_by_user_id: 1,
        updated_by_user_id: 1,
      });
      expect(manager.query).toHaveBeenCalledWith('SET FOREIGN_KEY_CHECKS=1');
    });

    it('rifiuta un OTP sbagliato', async () => {
      const manager = { query: jest.fn(), insert: jest.fn(), update: jest.fn() };
      await requestValidPending(manager);

      const result = await service.verifyOtp('admin@comune.it', '000000');

      expect(result).toBe(false);
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('rifiuta se nel frattempo esiste già un utente (anti-race)', async () => {
      const manager = { query: jest.fn(), insert: jest.fn(), update: jest.fn() };
      const otp = await requestValidPending(manager);
      userRepository.count.mockResolvedValue(1); // un'altra richiesta ha vinto la race

      const result = await service.verifyOtp('admin@comune.it', otp);

      expect(result).toBe(false);
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('rifiuta se non c\'è nessuna richiesta pendente', async () => {
      const result = await service.verifyOtp('nessuno@comune.it', '123456');

      expect(result).toBe(false);
    });
  });
```

- [ ] **Step 2: Eseguire i test, verificare che falliscano**

```
docker exec utenzepa-api-1 npx jest src/apis/setup/setup.service.spec.ts --maxWorkers=2
```
Atteso: FAIL, `service.verifyOtp is not a function`.

- [ ] **Step 3: Implementare `verifyOtp`**

In `backend/src/apis/setup/setup.service.ts`, aggiungi il metodo alla classe:

```ts
  async verifyOtp(email: string, otp: string): Promise<boolean> {
    if (!this.pending || this.pending.email !== email) return false;
    if (this.pending.otp !== otp) return false;
    if (new Date() > this.pending.otpExpiry) return false;

    // Anti-race: un'altra richiesta potrebbe aver creato l'admin nel
    // frattempo (due bootstrap in parallelo).
    if (!(await this.isAvailable())) return false;

    const { firstName, lastName, passwordHash } = this.pending;

    await this.dataSource.transaction(async (manager) => {
      // created_by_user_id/updated_by_user_id sono NOT NULL con FK
      // self-referenziante su system_users.id: il primissimo utente non
      // può puntare a un id esistente. Si disabilitano i check FK per la
      // sola connessione di questa transazione, si inserisce, si fa
      // puntare la riga a se stessa, si riabilitano i check.
      await manager.query('SET FOREIGN_KEY_CHECKS=0');
      const insertResult = await manager.insert(SystemUser, {
        firstName,
        lastName,
        email,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ATTIVO,
        created_by_user_id: 0,
        updated_by_user_id: 0,
      });
      const newId = insertResult.identifiers[0].id as number;
      await manager.update(SystemUser, newId, {
        created_by_user_id: newId,
        updated_by_user_id: newId,
      });
      await manager.query('SET FOREIGN_KEY_CHECKS=1');
    });

    this.pending = null;
    return true;
  }
```

Aggiungi l'import mancante in testa al file:

```ts
import { UserRole, UserStatus } from '../shared/enum/user.enums';
```

- [ ] **Step 4: Eseguire i test, verificare che passino**

```
docker exec utenzepa-api-1 npx jest src/apis/setup/setup.service.spec.ts --maxWorkers=2
```
Atteso: PASS, 8 test totali.

- [ ] **Step 5: Collegare il controller**

In `backend/src/apis/setup/setup.controller.ts`, sostituisci il corpo di `verify`:

```ts
  @UseGuards(SetupGuard)
  @Post('verify')
  async verify(@Body() body: { email: string; otp: string }) {
    const success = await this.setupService.verifyOtp(body.email, body.otp);
    return { status: success ? 'ok' : 'error' };
  }
```

- [ ] **Step 6: Verifica manuale end-to-end (richiede DB pulito)**

Se il DB locale ha già utenti da test precedenti di questo piano, ripulire la tabella prima di procedere:
```
docker exec utenzepa-mysql-1 mysql -uroot -p'change-me-in-production-openssl-rand-hex-24' -e "DELETE FROM system_users;" mydatabase
```

Poi:
```
docker restart utenzepa-api-1
curl -s http://localhost:3010/api/v1/setup/status
# atteso: {"available":true}

curl -s -X POST http://localhost:3010/api/v1/setup/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@comune.it","firstName":"Mario","lastName":"Rossi","password":"PasswordForte123!"}'
# atteso: {"status":"ok"}
```
Aprire `http://localhost:8025`, copiare il codice OTP dall'email ricevuta, poi:
```
curl -s -X POST http://localhost:3010/api/v1/setup/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@comune.it","otp":"<CODICE_DALLA_MAIL>"}'
# atteso: {"status":"ok"}

curl -s http://localhost:3010/api/v1/setup/status
# atteso: {"available":false}

curl -s -X POST http://localhost:3010/api/v1/authModule/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@comune.it","password":"PasswordForte123!"}'
# atteso: {"status":"ok", "user": {...,"role":"Admin"}, "token": {...}}
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/apis/setup
git commit -m "feat(setup): verify-otp crea il primo admin, gestisce FK self-referenziante"
```

---

### Task 4: CORS ristretto a `CORS_ORIGIN`

**Files:**
- Modify: `backend/src/main.ts`
- Modify: `docker-compose.yml` (root)
- Modify: `.env.example` (root)
- Modify: `.env` (root)

**Interfaces:**
- Nessuna nuova interfaccia esposta ad altri task — modifica isolata a `main.ts`.

- [ ] **Step 1: Modificare `main.ts`**

In `backend/src/main.ts`, trova:

```ts
  const options: NestApplicationOptions = {
    cors: true,
    logger: logLevels,
    ...(httpsOptions.key && httpsOptions.cert && { httpsOptions }),
  };
```

Sostituisci con:

```ts
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:4300')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const options: NestApplicationOptions = {
    cors: { origin: corsOrigins },
    logger: logLevels,
    ...(httpsOptions.key && httpsOptions.cert && { httpsOptions }),
  };
```

- [ ] **Step 2: Verificare che l'app compili e parta**

```
docker restart utenzepa-api-1
docker logs utenzepa-api-1 --tail 15
```
Atteso: `Nest application successfully started`, nessun errore.

- [ ] **Step 3: Verifica manuale CORS**

```
curl -s -i -X OPTIONS http://localhost:3010/api/v1/health \
  -H "Origin: http://localhost:4300" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control-allow-origin
```
Atteso: `Access-Control-Allow-Origin: http://localhost:4300`.

```
curl -s -i -X OPTIONS http://localhost:3010/api/v1/health \
  -H "Origin: http://evil.example.com" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control-allow-origin
```
Atteso: nessun header `Access-Control-Allow-Origin` in risposta (origine non in lista).

- [ ] **Step 4: Aggiungere `CORS_ORIGIN` a compose ed env**

In `docker-compose.yml` (root), nel servizio `api`, dopo la riga `- LOG_LEVEL=${LOG_LEVEL:-info}`:

```yaml
      - CORS_ORIGIN=${CORS_ORIGIN:-http://localhost:4300}
```

In `.env.example` (root), dopo il blocco `SWAGGER`/`LOG_LEVEL`:

```
# Origini ammesse per CORS, separate da virgola (es. https://utenze.comune.montesilvano.pe.it).
CORS_ORIGIN=http://localhost:4300
```

Stessa riga in `.env` (root, valore locale invariato `http://localhost:4300`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main.ts docker-compose.yml .env.example
git commit -m "fix(security): restringe CORS a CORS_ORIGIN invece di cors:true"
```

---

### Task 5: Rimozione modulo email morto (`common/mailer`)

**Files:**
- Delete: `backend/src/common/mailer/mailer.service.ts`
- Delete: `backend/src/common/mailer/mailer.interface.ts`
- Delete: `backend/src/common/mailer/mailer.service.spec.ts`
- Modify: `backend/.env.example`

**Interfaces:** Nessuna — verificato in fase di spec che `MailerModule`/`MailerService` non sono importati da `app.module.ts` né da nessun altro modulo registrato.

- [ ] **Step 1: Confermare che non ci siano riferimenti residui**

```
docker exec utenzepa-api-1 grep -rn "common/mailer\|MailerService\|MailerModule" src --include="*.ts" -l
```
Atteso: solo i 3 file dentro `src/common/mailer/` stesso (nessun consumer esterno). Se emergono altri file, FERMARSI e capire perché prima di cancellare.

- [ ] **Step 2: Cancellare i file**

```bash
git rm backend/src/common/mailer/mailer.service.ts backend/src/common/mailer/mailer.interface.ts backend/src/common/mailer/mailer.service.spec.ts
rmdir backend/src/common/mailer 2>/dev/null || true
```

- [ ] **Step 3: Rimuovere le variabili morte da `backend/.env.example`**

Cancellare il blocco:
```
# ============================================
# EMAIL SMTP CONFIGURATION (Optional)
# ============================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourdomain.com
```
(`SMTP_SECURE` va rimossa insieme — nome diverso dalla `SMTP_SECURE_PROTOCOL` realmente usata da `core/email/email.service.ts`, altra variabile morta).

- [ ] **Step 4: Eseguire l'intera suite unit per conferma**

```
docker exec utenzepa-api-1 npm run test:unit -- --maxWorkers=2
```
Atteso: PASS, tutte le suite (una in meno rispetto a prima: `mailer.service.spec.ts` non esiste più).

- [ ] **Step 5: Verificare che l'app compili e parta**

```
docker restart utenzepa-api-1
docker logs utenzepa-api-1 --tail 15
```
Atteso: `Nest application successfully started`.

- [ ] **Step 6: Commit**

```bash
git add -A backend/src/common/mailer backend/.env.example
git commit -m "chore: rimuove common/mailer (mai wired, dead code)"
```

---

### Task 6: Frontend — `SetupService` e `SetupGuard`

**Files:**
- Create: `frontend/src/app/services/setup.service.ts`
- Create: `frontend/src/app/guards/setup.guard.ts`

**Interfaces:**
- Consumes: `environment.apiUrl` (`frontend/src/environments/environment.ts`).
- Produces: `SetupService.getStatus(): Promise<boolean>`, `SetupService.requestOtp(email, firstName, lastName, password): Promise<boolean>`, `SetupService.verifyOtp(email, otp): Promise<boolean>` — consumate da `SetupComponent` (Task 7).
- Produces: `SetupGuard` (classe `CanActivate`) — consumata da `app.routes.ts` (Task 7).

- [ ] **Step 1: Creare `SetupService`**

Crea `frontend/src/app/services/setup.service.ts` (stesso stile di `auth.service.ts`: axios diretto, nessun `HttpClient`):

```ts
import { Injectable } from '@angular/core';
import axios from 'axios';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SetupService {
  private BASE_URL = environment.apiUrl;

  async getStatus(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.BASE_URL}/setup/status`);
      return response.data?.available === true;
    } catch (error) {
      return false;
    }
  }

  async requestOtp(email: string, firstName: string, lastName: string, password: string): Promise<boolean> {
    try {
      const response = await axios.post(`${this.BASE_URL}/setup/request-otp`, {
        email, firstName, lastName, password
      });
      return response.data?.status === 'ok';
    } catch (error) {
      return false;
    }
  }

  async verifyOtp(email: string, otp: string): Promise<boolean> {
    try {
      const response = await axios.post(`${this.BASE_URL}/setup/verify`, { email, otp });
      return response.data?.status === 'ok';
    } catch (error) {
      return false;
    }
  }
}
```

- [ ] **Step 2: Creare `SetupGuard`**

Crea `frontend/src/app/guards/setup.guard.ts` (stesso stile di `auth.guard.ts`):

```ts
import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { SetupService } from '../services/setup.service';

@Injectable({
  providedIn: 'root'
})
export class SetupGuard implements CanActivate {
  constructor(private setup: SetupService, private router: Router) {}

  async canActivate(): Promise<boolean> {
    const available = await this.setup.getStatus();
    if (!available) {
      this.router.navigate(['/login']);
      return false;
    }
    return true;
  }
}
```

- [ ] **Step 3: Verificare che il frontend compili**

```
docker logs utenzepa-frontend-1 --tail 20
```
(la build in watch mode di `ng serve` ricompila da sola al salvataggio file, grazie al bind mount). Atteso: `Application bundle generation complete`, nessun errore TypeScript.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/services/setup.service.ts frontend/src/app/guards/setup.guard.ts
git commit -m "feat(setup): SetupService e SetupGuard frontend"
```

---

### Task 7: Frontend — pagina `SetupComponent` a due step

**Files:**
- Create: `frontend/src/app/pages/setup/setup.component.ts`
- Create: `frontend/src/app/pages/setup/setup.component.html`
- Create: `frontend/src/app/pages/setup/setup.component.scss`
- Modify: `frontend/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `SetupService` (Task 6).

- [ ] **Step 1: Creare il componente**

Crea `frontend/src/app/pages/setup/setup.component.ts`:

```ts
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SetupService } from '../../services/setup.service';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterModule],
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.scss']
})
export class SetupComponent {
  form: FormGroup;
  otpForm: FormGroup;
  showOtp = false;
  error = '';
  otpError = '';

  constructor(private fb: FormBuilder, private router: Router, private setup: SetupService) {
    this.form = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]]
    });

    this.otpForm = this.fb.group({
      otp: ['', Validators.required]
    });
  }

  async requestOtp() {
    if (!this.form.valid) {
      this.error = 'Compilare tutti i campi richiesti.';
      return;
    }
    const { firstName, lastName, email, password } = this.form.value;
    const success = await this.setup.requestOtp(email, firstName, lastName, password);
    if (success) {
      this.showOtp = true;
      this.error = '';
    } else {
      this.error = 'Impossibile avviare la configurazione. Riprova.';
    }
  }

  async verifyOtp() {
    if (!this.otpForm.valid) {
      this.otpError = 'Inserire il codice ricevuto via email.';
      return;
    }
    const { email } = this.form.value;
    const { otp } = this.otpForm.value;
    const success = await this.setup.verifyOtp(email, otp);
    if (success) {
      this.router.navigate(['/login']);
    } else {
      this.otpError = 'Codice non valido o scaduto.';
    }
  }
}
```

- [ ] **Step 2: Creare il template**

Crea `frontend/src/app/pages/setup/setup.component.html`:

```html
<div class="setup-container">
  <h1>Configurazione iniziale</h1>
  <p>Crea il primo utente amministratore per iniziare a usare il sistema.</p>

  <form *ngIf="!showOtp" [formGroup]="form" (ngSubmit)="requestOtp()">
    <label>Nome
      <input type="text" formControlName="firstName">
    </label>
    <label>Cognome
      <input type="text" formControlName="lastName">
    </label>
    <label>Email
      <input type="email" formControlName="email">
    </label>
    <label>Password
      <input type="password" formControlName="password">
    </label>
    <p class="error" *ngIf="error">{{ error }}</p>
    <button type="submit">Invia codice di verifica</button>
  </form>

  <form *ngIf="showOtp" [formGroup]="otpForm" (ngSubmit)="verifyOtp()">
    <p>Ti abbiamo inviato un codice di verifica via email.</p>
    <label>Codice OTP
      <input type="text" formControlName="otp">
    </label>
    <p class="error" *ngIf="otpError">{{ otpError }}</p>
    <button type="submit">Conferma e crea l'account</button>
  </form>
</div>
```

- [ ] **Step 3: Creare lo stylesheet**

Crea `frontend/src/app/pages/setup/setup.component.scss`:

```scss
.setup-container {
  max-width: 420px;
  margin: 4rem auto;
  padding: 2rem;

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .error {
    color: #c0392b;
  }
}
```

- [ ] **Step 4: Aggiungere la route**

In `frontend/src/app/app.routes.ts`, aggiungi gli import:

```ts
import {SetupComponent} from "./pages/setup/setup.component";
import {SetupGuard} from "./guards/setup.guard";
```

Aggiungi la route prima di `{path: 'login', component: LoginComponent},`:

```ts
  {path: 'setup', component: SetupComponent, canActivate: [SetupGuard]},
```

- [ ] **Step 5: Verificare che il frontend compili**

```
docker logs utenzepa-frontend-1 --tail 20
```
Atteso: `Application bundle generation complete`, nessun errore.

- [ ] **Step 6: Verifica manuale end-to-end nel browser**

Con il DB pulito (`DELETE FROM system_users;`, vedi Task 3 Step 6) e i container in piedi, aprire `http://localhost:4300/setup`: deve mostrare il form. Compilarlo, verificare che appaia il form OTP, prendere il codice da `http://localhost:8025`, inserirlo, verificare il redirect a `/login`, poi fare login con le credenziali create. Ricaricare `http://localhost:4300/setup`: deve reindirizzare a `/login` (setup non più disponibile).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/pages/setup frontend/src/app/app.routes.ts
git commit -m "feat(setup): pagina wizard bootstrap admin a due step"
```

---

## Self-Review

**Copertura spec**: sezione 1 (CORS) → Task 4; sezione 2 (mailer morto) → Task 5; sezione 3 (wizard) → Task 1-3 (backend) + Task 6-7 (frontend). Verifica end-to-end richiesta dallo spec → Task 3 Step 6 e Task 7 Step 6.

**Nota per chi esegue**: Task 1-3 modificano lo stesso file (`setup.service.ts`) in sequenza — se eseguiti da subagent diversi, l'ordine 1→2→3 va rispettato rigidamente (Task 2 assume che Task 1 sia già committato, Task 3 assume Task 2). Task 4 e 5 sono indipendenti tra loro e dal wizard, possono girare in qualunque ordine rispetto a 1-3. Task 6-7 dipendono dal backend di Task 1-3 essere già funzionante (chiamano gli endpoint reali).
