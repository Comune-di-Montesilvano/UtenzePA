# Entità Contratto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estrarre i dati contrattuali (fornitore, CIG, ordini, date, cauzione, riferimento Consip) da `Utility` in una nuova entità `Contratto`, che può coprire più utenze insieme e si storicizza tramite nuove righe invece di sovrascrivere quelle esistenti; `Invoice` si lega da ora solo al Contratto.

**Architecture:** Nuovo modulo NestJS `contracts/` (stesso pattern CRUD di `suppliers`/`consip-agreement`) con tabella ponte `contract_utilities` (N:N puro verso `Utility`). `Utility` perde tutte le colonne contrattuali; le letture (dashboard, filtro, tabella) restano compatibili perché `UtilityService` allega in risposta i campi del "contratto corrente" (quello con `supply_expiry_date` nulla o ≥ oggi) sotto gli stessi nomi di campo usati oggi — comportamento visibile identico, sorgente dati diversa. `Invoice` perde `utility_id_fk`/`supplier_id_fk`, guadagna `contratto_id_fk`. Frontend: nuova pagina "Contratti" per CRUD dedicato; `UtilityEditDialogComponent` e `InvoiceEditDialogComponent` aggiornati di conseguenza.

**Tech Stack:** NestJS 11 + TypeORM 1.x + MySQL 8 (backend), Angular 22 + Angular Material (frontend), Jest (unit test backend).

**Spec:** `docs/superpowers/specs/2026-09-04-entita-contratto-design.md`

## Global Constraints

- Jest sempre con `--maxWorkers=2` (poche CPU disponibili nel runner).
- Migration TypeORM generate SEMPRE dentro il container `api` (`docker exec utenzepa-api-1 ...`), mai in locale (Node/pnpm versione sbagliata).
- `ng build` reale (non solo `tsc --noEmit`) obbligatorio prima di considerare conclusa una task frontend — il type-checking dei template Angular sfugge a `tsc`.
- Nessun campo "stato" sul Contratto: "corrente" è sempre derivato da `supply_expiry_date IS NULL OR supply_expiry_date >= CURDATE()`.
- Le migration di questa feature sono temporanee (saranno squashate in una baseline futura) — nessuno script di rollback elaborato oltre il `down()` standard generato da TypeORM.
- Mai `git add -A`/`git add .` in questo repo (file scratch non tracciati in root) — elencare sempre i file espliciti.
- Commit message: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` + riga `Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd`.

---

## Task 1: Entity `Contract` + `ContractUtility` e migration additiva

**Files:**
- Create: `backend/src/apis/contracts/entity/contract.entity.ts`
- Create: `backend/src/apis/contracts/entity/contract-utility.entity.ts`
- Modify: `backend/src/apis/invoices/entity/invoice.entity.ts` (aggiunge `contratto_id_fk` + relazione, NON rimuove ancora nulla)
- Modify: `backend/src/apis/utility/entity/utility.entity.ts` (aggiunge relazione `contratti`, NON rimuove ancora nulla)
- Create (generata): `backend/src/database/migrations/<timestamp>-CreateContract.ts`

**Interfaces:**
- Produce: classe `Contract` con proprietà `id, supplier_id_fk, cig_contract, order_number, consip_order, consip_agreement_id, supply_start_date, supply_expiry_date, management_expiry_date, takeover_termination_date, security_deposit, create_date, update_date, created_by_user_id, updated_by_user_id, deleted` + relazioni `supplier`, `consipAgreement`, `utilities: Utility[]` (ManyToMany via `contract_utilities`), `invoices: Invoice[]` (OneToMany)
- Produce: classe `ContractUtility` con `contract_id`, `utility_id` (PK composita), relazioni `contract`/`utility` — stesso pattern di `InvoiceBudgetChapter` (`backend/src/apis/invoices/entity/invoice_budget_chapter.entity.ts`)

- [ ] **Step 1: scrivere `Contract` entity**

```typescript
// backend/src/apis/contracts/entity/contract.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Supplier } from '@apis/shared/entities/supplier.entity';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';

@Entity('contracts')
export class Contract {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int', nullable: true })
  supplier_id_fk: number;

  @Column({ type: 'text', nullable: true })
  cig_contract: string;

  @Column({ type: 'text', nullable: true })
  order_number: string;

  @Column({ length: 100, nullable: true })
  consip_order: string;

  @Column({ type: 'int', nullable: true })
  consip_agreement_id: number;

  @Column({ type: 'date', nullable: true })
  supply_start_date: string;

  @Column({ type: 'date', nullable: true })
  supply_expiry_date: string;

  @Column({ type: 'date', nullable: true })
  management_expiry_date: string;

  @Column({ type: 'date', nullable: true })
  takeover_termination_date: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  security_deposit: number;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: string;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: string;

  @Column({ name: 'created_by_user_id' })
  @Index()
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'boolean', default: false, nullable: true })
  deleted: boolean;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id_fk' })
  supplier: Supplier;

  @OneToOne(() => ConsipAgreement)
  @JoinColumn({ name: 'consip_agreement_id', referencedColumnName: 'id' })
  consipAgreement: ConsipAgreement;

  @ManyToMany(() => Utility, (utility) => utility.contratti)
  @JoinTable({
    name: 'contract_utilities',
    joinColumn: { name: 'contract_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'utility_id', referencedColumnName: 'id' },
  })
  utilities: Utility[];

  @OneToMany(() => Invoice, (invoice) => invoice.contratto)
  invoices: Invoice[];
}
```

- [ ] **Step 2: scrivere `ContractUtility` entity (junction esplicita per gli insert/delete manuali, stesso pattern di `InvoiceBudgetChapter`)**

```typescript
// backend/src/apis/contracts/entity/contract-utility.entity.ts
import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { Utility } from '@apis/utility/entity/utility.entity';

@Entity('contract_utilities')
export class ContractUtility {
  @Exclude()
  @PrimaryColumn({ name: 'contract_id' })
  contract_id: number;

  @Exclude()
  @PrimaryColumn({ name: 'utility_id' })
  utility_id: number;

  @ManyToOne(() => Contract, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'contract_id' })
  contract: Contract;

  @ManyToOne(() => Utility, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'utility_id' })
  utility: Utility;
}
```

- [ ] **Step 3: aggiungere `contratti`/`contratto_id_fk` alle entity esistenti (solo aggiunte, nessuna rimozione)**

In `backend/src/apis/utility/entity/utility.entity.ts`, aggiungere in fondo alla classe (dopo `consipAgreement`):

```typescript
  @ManyToMany(() => Contract, (contract) => contract.utilities)
  contratti: Contract[];
```

e l'import `import { Contract } from '@apis/contracts/entity/contract.entity';` in cima al file.

In `backend/src/apis/invoices/entity/invoice.entity.ts`, aggiungere:

```typescript
  @Column({ type: 'int', nullable: true })
  contratto_id_fk: number;

  @ManyToOne(() => Contract, (contract) => contract.invoices)
  @JoinColumn({ name: 'contratto_id_fk', referencedColumnName: 'id' })
  contratto: Contract;
```

e l'import corrispondente. Non toccare ancora `utility_id_fk`/`supplier_id_fk` (rimossi in Task 8).

- [ ] **Step 4: generare la migration additiva**

```bash
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate src/database/migrations/CreateContract -d src/database/data-source.ts
docker exec -u root utenzepa-api-1 chown -R 1000:1000 src/database/migrations
```

Verificare che il file generato crei SOLO `contracts`, `contract_utilities` e la colonna `contratto_id_fk` su `invoices` (nessun `DROP COLUMN` — quello arriva in Task 8). Se compaiono drop imprevisti, un'entity precedente ha ancora riferimenti sbagliati: correggere prima di procedere.

- [ ] **Step 5: applicare la migration e verificare**

```bash
docker restart utenzepa-api-1
docker logs utenzepa-api-1 --tail 50
```

Atteso: nessun errore di migration nei log, container `api` in stato `running` (non crash-loop).

- [ ] **Step 6: commit**

```bash
git add backend/src/apis/contracts/entity/contract.entity.ts backend/src/apis/contracts/entity/contract-utility.entity.ts backend/src/apis/utility/entity/utility.entity.ts backend/src/apis/invoices/entity/invoice.entity.ts backend/src/database/migrations/
git commit -m "feat(contracts): entity Contract/ContractUtility + migration additiva

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 2: DTO `Contract` (create/update/search)

**Files:**
- Create: `backend/src/apis/contracts/dto/create-contract.dto.ts`
- Create: `backend/src/apis/contracts/dto/update-contract.dto.ts`
- Create: `backend/src/apis/contracts/dto/search-contract.dto.ts`

**Interfaces:**
- Produce: `CreateContractDto`, `UpdateContractDto` (entrambe con `utility_ids?: number[]`), `SearchContractDto` (con `utility_id?: number` per lo storico contratti di un'utenza)

- [ ] **Step 1: scrivere `CreateContractDto`**

```typescript
// backend/src/apis/contracts/dto/create-contract.dto.ts
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { NormalizeDate } from '@/common/decorators/normalize-date.decorator';

export class CreateContractDto {
  @IsOptional()
  @IsInt()
  supplier_id_fk?: number;

  @IsOptional()
  @IsString()
  cig_contract?: string;

  @IsOptional()
  @IsString()
  order_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  consip_order?: string;

  @IsOptional()
  @IsInt()
  consip_agreement_id?: number;

  @IsOptional()
  @NormalizeDate()
  supply_start_date?: string;

  @IsOptional()
  @NormalizeDate()
  supply_expiry_date?: string;

  @IsOptional()
  @NormalizeDate()
  management_expiry_date?: string;

  @IsOptional()
  @NormalizeDate()
  takeover_termination_date?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  security_deposit?: number;

  @IsOptional()
  @IsArray({ message: 'Le utenze coperte devono essere fornite come un array.' })
  @IsInt({ each: true, message: 'Ogni elemento delle utenze deve essere un ID intero.' })
  utility_ids?: number[];

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}
```

- [ ] **Step 2: scrivere `UpdateContractDto` (stessi campi, tutti opzionali — stesso pattern di `UpdateConsipAgreementDto`, riusa i decorator di `CreateContractDto` con `PartialType`)**

```typescript
// backend/src/apis/contracts/dto/update-contract.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateContractDto } from '@apis/contracts/dto/create-contract.dto';

export class UpdateContractDto extends PartialType(CreateContractDto) {}
```

Verificare prima che `@nestjs/mapped-types` sia già una dipendenza (`grep mapped-types backend/package.json`); se assente, replicare a mano lo stile esplicito di `UpdateInvoiceDto` (stessi decorator di `CreateContractDto`, tutti `@IsOptional`) invece di introdurre una nuova dipendenza.

- [ ] **Step 3: scrivere `SearchContractDto`**

```typescript
// backend/src/apis/contracts/dto/search-contract.dto.ts
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class SearchContractDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  utility_id?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  supplier_id_fk?: number;

  @IsOptional()
  @IsString()
  cig_contract?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return undefined;
  })
  deleted?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    return value.split(',').map((v: string) => v.trim()).filter((v: string) => v !== '');
  })
  supply_expiry_date_range?: string[];
}
```

- [ ] **Step 4: verificare che il progetto compili**

```bash
docker exec utenzepa-api-1 pnpm run type-check
```

Atteso: nessun errore relativo a `apis/contracts/dto`.

- [ ] **Step 5: commit**

```bash
git add backend/src/apis/contracts/dto/
git commit -m "feat(contracts): DTO create/update/search

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 3: `ContractsService`

**Files:**
- Create: `backend/src/apis/contracts/contracts.service.ts`
- Create: `backend/src/apis/contracts/contracts.service.spec.ts`

**Interfaces:**
- Consuma: `Contract`, `ContractUtility` (Task 1), `CreateContractDto`/`UpdateContractDto`/`SearchContractDto` (Task 2), `BaseService`/`toFindOptionsRelations` (`@apis/shared/base.service`, pattern già visto in `ConsipAgreementService`)
- Produce: `ContractsService.findAll(filters?: SearchContractDto): Promise<Contract[]>`, `.create(dto, userId?): Promise<Contract>`, `.update(id, dto, userId?): Promise<Contract>` (override di `BaseService` per gestire `utility_ids`, stesso pattern di `InvoicesService.create/update` con `budget_chapters`/`InvoiceBudgetChapter`)

- [ ] **Step 1: scrivere il test per `findAll` (join fornitore + filtro `utility_id`)**

```typescript
// backend/src/apis/contracts/contracts.service.spec.ts
import { ContractsService } from './contracts.service';
import { Contract } from './entity/contract.entity';
import { ContractUtility } from './entity/contract-utility.entity';

describe('ContractsService', () => {
  let service: ContractsService;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock };
  let contractUtilityRepo: object;
  let dataSource: { transaction: jest.Mock };
  let manager: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock; delete: jest.Mock };
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    leftJoinAndSelect: jest.Mock;
    innerJoin: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    manager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn(async (_entity, data) => data),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    repo = { createQueryBuilder: jest.fn().mockReturnValue(qb), findOne: jest.fn() };
    contractUtilityRepo = {};
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };
    service = new ContractsService(repo as never, contractUtilityRepo as never, dataSource as never);
  });

  describe('findAll', () => {
    it('filtra i soli contratti non cancellati e fa il join col fornitore e le utenze', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('contract.deleted = :deleted', { deleted: false });
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('contract.supplier', 'supplier');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('contract.utilities', 'utilities');
    });

    it('filtra per utility_id (storico contratti di una utenza)', async () => {
      await service.findAll({ utility_id: 42 } as never);

      expect(qb.innerJoin).toHaveBeenCalledWith(
        'contract.utilities',
        'filtered_utility',
        'filtered_utility.id = :utilityId',
        { utilityId: 42 },
      );
    });
  });

  describe('create', () => {
    it('crea il contratto e le associazioni alle utenze in transazione', async () => {
      manager.findOne.mockResolvedValue({ id: 10 } as Contract);

      const result = await service.create({ cig_contract: 'CIG1', utility_ids: [1, 2] } as never, 5);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledWith(
        ContractUtility,
        expect.arrayContaining([
          expect.objectContaining({ utility_id: 1 }),
          expect.objectContaining({ utility_id: 2 }),
        ]),
      );
      expect(result).toEqual({ id: 10 });
    });
  });

  describe('update', () => {
    it('sostituisce le associazioni alle utenze quando fornite', async () => {
      repo.findOne.mockResolvedValue({ id: 20, deleted: false } as Contract);
      manager.findOne.mockResolvedValue({ id: 20 } as Contract);

      await service.update(20, { utility_ids: [3] } as never, 7);

      expect(manager.delete).toHaveBeenCalledWith(ContractUtility, { contract_id: 20 });
      expect(manager.save).toHaveBeenCalledWith(
        ContractUtility,
        expect.arrayContaining([expect.objectContaining({ utility_id: 3 })]),
      );
    });
  });
});
```

- [ ] **Step 2: eseguire il test e verificare che fallisca (il service non esiste ancora)**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/contracts/contracts.service.spec.ts --maxWorkers=2
```

Atteso: FAIL con `Cannot find module './contracts.service'`.

- [ ] **Step 3: implementare `ContractsService`**

```typescript
// backend/src/apis/contracts/contracts.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { ContractUtility } from '@apis/contracts/entity/contract-utility.entity';
import { CreateContractDto } from '@apis/contracts/dto/create-contract.dto';
import { UpdateContractDto } from '@apis/contracts/dto/update-contract.dto';
import { SearchContractDto } from '@apis/contracts/dto/search-contract.dto';
import { BaseService, toFindOptionsRelations } from '@apis/shared/base.service';

@Injectable()
export class ContractsService extends BaseService<Contract, CreateContractDto, UpdateContractDto> {
  protected readonly entityName = 'contract';
  protected readonly relations = ['supplier', 'consipAgreement', 'utilities', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(Contract)
    protected readonly repo: Repository<Contract>,
    @InjectRepository(ContractUtility)
    private readonly contractUtilityRepo: Repository<ContractUtility>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async findAll(filters?: SearchContractDto): Promise<Contract[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.where(`${alias}.deleted = :deleted`, { deleted: false });
    qb.leftJoinAndSelect(`${alias}.supplier`, 'supplier');
    qb.leftJoinAndSelect(`${alias}.utilities`, 'utilities');

    if (filters) {
      if (filters.utility_id) {
        qb.innerJoin(`${alias}.utilities`, 'filtered_utility', 'filtered_utility.id = :utilityId', {
          utilityId: filters.utility_id,
        });
      }
      if (filters.supply_expiry_date_range) {
        const range = filters.supply_expiry_date_range;
        if (range[0]) qb.andWhere(`${alias}.supply_expiry_date >= :expiry_start`, { expiry_start: range[0] });
        if (range[1]) qb.andWhere(`${alias}.supply_expiry_date <= :expiry_end`, { expiry_end: range[1] });
      }
      if (filters.supplier_id_fk) {
        qb.andWhere(`${alias}.supplier_id_fk = :supplier_id_fk`, { supplier_id_fk: filters.supplier_id_fk });
      }
      if (filters.cig_contract) {
        qb.andWhere(`${alias}.cig_contract LIKE :cig_contract`, { cig_contract: `%${filters.cig_contract}%` });
      }
    }

    return qb.orderBy(`${alias}.id`, 'ASC').getMany();
  }

  async create(dto: CreateContractDto, userId?: number): Promise<Contract> {
    const { utility_ids, ...rest } = dto;

    return this.dataSource.transaction(async (manager) => {
      const entity = manager.create(Contract, {
        ...rest,
        ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
      });
      const saved = await manager.save(Contract, entity);

      if (utility_ids && utility_ids.length > 0) {
        const rows = utility_ids.map((utilityId: number) =>
          manager.create(ContractUtility, { contract_id: saved.id, utility_id: utilityId }),
        );
        try {
          await manager.save(ContractUtility, rows);
        } catch (error) {
          throw new BadRequestException(
            'Errore durante il salvataggio delle utenze associate: ' +
              (error instanceof Error ? error.message : String(error)),
          );
        }
      }

      return manager.findOne(Contract, {
        where: { id: saved.id },
        relations: toFindOptionsRelations<Contract>(this.relations),
      });
    });
  }

  async update(id: number, updateDto: UpdateContractDto, userId?: number): Promise<Contract> {
    const { utility_ids, ...rest } = updateDto;

    return this.dataSource.transaction(async (manager) => {
      const entity = await this.repo.findOne({ where: { id } as never });
      if (!entity) throw new BadRequestException('elemento non trovato');
      Object.assign(entity, rest);
      if (userId !== undefined) entity.updated_by_user_id = userId;
      await manager.save(Contract, entity);

      if (utility_ids !== undefined) {
        await manager.delete(ContractUtility, { contract_id: id });
        if (utility_ids.length > 0) {
          const rows = utility_ids.map((utilityId) =>
            manager.create(ContractUtility, { contract_id: id, utility_id: utilityId }),
          );
          await manager.save(ContractUtility, rows);
        }
      }

      return manager.findOne(Contract, {
        where: { id },
        relations: toFindOptionsRelations<Contract>(this.relations),
      });
    });
  }
}
```

- [ ] **Step 4: eseguire il test e verificare che passi**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/contracts/contracts.service.spec.ts --maxWorkers=2
```

Atteso: PASS, tutti i test verdi.

- [ ] **Step 5: commit**

```bash
git add backend/src/apis/contracts/contracts.service.ts backend/src/apis/contracts/contracts.service.spec.ts
git commit -m "feat(contracts): ContractsService CRUD + associazione utenze

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 4: `ContractsController` + `ContractsModule` + registrazione in `AppModule`

**Files:**
- Create: `backend/src/apis/contracts/contracts.controller.ts`
- Create: `backend/src/apis/contracts/contracts.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consuma: `ContractsService` (Task 3), DTO (Task 2)
- Produce: endpoint REST `/api/v1/contracts` (GET lista+filtri, GET :id, POST, PATCH :id, DELETE :id) — stesso schema di `ConsipAgreementController`

- [ ] **Step 1: scrivere il controller**

```typescript
// backend/src/apis/contracts/contracts.controller.ts
import {
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
import { ContractsService } from '@apis/contracts/contracts.service';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { CreateContractDto } from '@apis/contracts/dto/create-contract.dto';
import { UpdateContractDto } from '@apis/contracts/dto/update-contract.dto';
import { SearchContractDto } from '@apis/contracts/dto/search-contract.dto';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';

@Controller('contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  getAll(@Query() filters: SearchContractDto): Promise<Contract[]> {
    return this.service.findAll(filters);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number): Promise<Contract> {
    return this.service.findOne(id);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(
    @Body() dto: CreateContractDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Contract> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateContractDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Contract> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id') id: number, @Body() dto: UpdateContractDto): Promise<void> {
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
```

- [ ] **Step 2: scrivere il modulo**

```typescript
// backend/src/apis/contracts/contracts.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsService } from '@apis/contracts/contracts.service';
import { ContractsController } from '@apis/contracts/contracts.controller';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { ContractUtility } from '@apis/contracts/entity/contract-utility.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Contract, ContractUtility])],
  providers: [ContractsService],
  controllers: [ContractsController],
  exports: [ContractsService],
})
export class ContractsModule {}
```

- [ ] **Step 3: registrare il modulo in `AppModule`**

In `backend/src/app.module.ts`, aggiungere l'import `import { ContractsModule } from '@apis/contracts/contracts.module';` accanto agli altri import di moduli `apis/`, e `ContractsModule` nell'array `imports` accanto a `ConsipAgreementModule`.

- [ ] **Step 4: verificare l'avvio dell'app**

```bash
docker restart utenzepa-api-1
docker logs utenzepa-api-1 --tail 30
curl -s http://localhost:3010/api-docs-json | grep -o '"/contracts[^"]*"' | sort -u
```

(porta 3010 = `DOCKER_API_PORT` da `.env` locale, verificare se diversa). Atteso: nessun errore Nest DI, gli endpoint `/contracts` compaiono nello swagger JSON.

- [ ] **Step 5: commit**

```bash
git add backend/src/apis/contracts/contracts.controller.ts backend/src/apis/contracts/contracts.module.ts backend/src/app.module.ts
git commit -m "feat(contracts): controller REST + registrazione modulo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 5: `UtilitiesModule`/`InvoicesModule` — iniettare `Contract` per i task successivi

**Files:**
- Modify: `backend/src/apis/utility/utility.module.ts`
- Modify: `backend/src/apis/invoices/invoie.module.ts`

**Interfaces:**
- Produce: repository `Contract` disponibile via DI in `UtilitiesService` (Task 7) e `InvoicesService` (Task 9)

- [ ] **Step 1: aggiungere `Contract` a `TypeOrmModule.forFeature` in entrambi i moduli**

```typescript
// backend/src/apis/utility/utility.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilitiesService } from './utility.service';
import { UtilitiesController } from './utility.controller';
import { Utility } from './entity/utility.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Utility, Contract])],
  providers: [UtilitiesService],
  controllers: [UtilitiesController],
  exports: [UtilitiesService],
})
export class UtilitiesModule {}
```

```typescript
// backend/src/apis/invoices/invoie.module.ts — aggiungere Contract all'array esistente
import { Contract } from '@apis/contracts/entity/contract.entity';
// ...
imports: [TypeOrmModule.forFeature([Invoice, BudgetChapter, InvoiceBudgetChapter, Contract])],
```

- [ ] **Step 2: verificare l'avvio dell'app**

```bash
docker restart utenzepa-api-1 && docker logs utenzepa-api-1 --tail 30
```

Atteso: nessun errore DI (repository duplicato/mancante).

- [ ] **Step 3: commit**

```bash
git add backend/src/apis/utility/utility.module.ts backend/src/apis/invoices/invoie.module.ts
git commit -m "chore(contracts): esporre repository Contract a UtilitiesModule/InvoicesModule

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 6: Migration dati — backfill `contracts`/`contract_utilities`/`invoices.contratto_id_fk`

**Files:**
- Create (a mano, non generata): `backend/src/database/migrations/<timestamp>-BackfillContractData.ts`

**Interfaces:**
- Consuma: tabelle `utilities` (colonne contrattuali ancora presenti, rimosse solo in Task 8), `invoices.utility_id_fk` (ancora presente), `contracts`/`contract_utilities`/`invoices.contratto_id_fk` (create in Task 1)

- [ ] **Step 1: generare lo scheletro del file migration con lo stesso naming delle altre**

```bash
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:create src/database/migrations/BackfillContractData
docker exec -u root utenzepa-api-1 chown -R 1000:1000 src/database/migrations
```

(`migration:create`, non `migration:generate` — questa migration non deriva da un diff di entity, va scritta a mano.)

- [ ] **Step 2: scrivere il backfill**

```typescript
// backend/src/database/migrations/<timestamp>-BackfillContractData.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillContractData<TIMESTAMP> implements MigrationInterface {
  name = 'BackfillContractData<TIMESTAMP>';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1 riga Contratto per ogni Utility con almeno un campo contrattuale valorizzato.
    await queryRunner.query(`
      INSERT INTO contracts (
        supplier_id_fk, cig_contract, order_number, consip_order, consip_agreement_id,
        supply_start_date, supply_expiry_date, management_expiry_date, takeover_termination_date,
        security_deposit, created_by_user_id, updated_by_user_id, deleted
      )
      SELECT
        supplier_id_fk, cig_contract, order_number, consip_order, consip_agreement_id,
        supply_start_date, supply_expiry_date, management_expiry_date, takeover_termination_date,
        security_deposit, created_by_user_id, updated_by_user_id, deleted
      FROM utilities
      WHERE supplier_id_fk IS NOT NULL
         OR cig_contract IS NOT NULL
         OR order_number IS NOT NULL
         OR consip_order IS NOT NULL
         OR consip_agreement_id IS NOT NULL
         OR supply_start_date IS NOT NULL
         OR supply_expiry_date IS NOT NULL
         OR management_expiry_date IS NOT NULL
         OR takeover_termination_date IS NOT NULL
         OR security_deposit > 0
    `);

    // Associazione 1:1 contratto↔utenza appena creata: join per posizione tramite
    // una CTE che numera utilities e contracts nello stesso ordine di inserimento
    // (id crescente su entrambi i lati, stesso WHERE della INSERT sopra).
    await queryRunner.query(`
      INSERT INTO contract_utilities (contract_id, utility_id)
      SELECT c.id, u.id
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
        FROM utilities
        WHERE supplier_id_fk IS NOT NULL
           OR cig_contract IS NOT NULL
           OR order_number IS NOT NULL
           OR consip_order IS NOT NULL
           OR consip_agreement_id IS NOT NULL
           OR supply_start_date IS NOT NULL
           OR supply_expiry_date IS NOT NULL
           OR management_expiry_date IS NOT NULL
           OR takeover_termination_date IS NOT NULL
           OR security_deposit > 0
      ) u
      JOIN (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM contracts
      ) c ON c.rn = u.rn
    `);

    // invoices.contratto_id_fk risolto dal contratto appena creato per la stessa utenza.
    await queryRunner.query(`
      UPDATE invoices i
      JOIN contract_utilities cu ON cu.utility_id = i.utility_id_fk
      SET i.contratto_id_fk = cu.contract_id
      WHERE i.utility_id_fk IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE invoices SET contratto_id_fk = NULL`);
    await queryRunner.query(`DELETE FROM contract_utilities`);
    await queryRunner.query(`DELETE FROM contracts`);
  }
}
```

MySQL 8 supporta `ROW_NUMBER()`/window function e CTE (introdotte in 8.0) — verificato compatibile con l'immagine `mysql:8` del progetto.

- [ ] **Step 3: applicare e verificare sul DB dev**

```bash
docker restart utenzepa-api-1
docker exec utenzepa-mysql-1 mysql -uroot -p"$(grep MYSQL_PASSWORD .env | cut -d= -f2)" mydatabase -e "SELECT COUNT(*) FROM contracts; SELECT COUNT(*) FROM contract_utilities; SELECT COUNT(*) FROM invoices WHERE contratto_id_fk IS NOT NULL;"
```

Atteso: `COUNT(*)` su `contracts` e `contract_utilities` pari al numero di `utilities` con almeno un campo contrattuale valorizzato; `invoices.contratto_id_fk` valorizzato per tutte le fatture che avevano `utility_id_fk` valorizzato.

- [ ] **Step 4: commit**

```bash
git add backend/src/database/migrations/
git commit -m "feat(contracts): migration dati backfill da utilities/invoices esistenti

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 7: `UtilityService` — join "contratto corrente" per expiry/safeguard/filtri, invariati nell'output

**Files:**
- Modify: `backend/src/apis/utility/utility.service.ts`
- Modify: `backend/src/apis/utility/utility.service.spec.ts` (se esiste — verificare con `ls`, adattare i test esistenti sui campi spostati)

**Interfaces:**
- Consuma: `Contract` (repo iniettato in Task 5)
- Produce: `UtilitiesService.findAll()`/`.findBySafeguard()`/`.findOne()` continuano a restituire oggetti `Utility` con `supplier`, `supplier_id_fk`, `cig_contract`, `order_number`, `consip_order`, `consip_agreement_id`, `consipAgreement`, `supply_start_date`, `supply_expiry_date`, `management_expiry_date`, `takeover_termination_date`, `security_deposit` popolati (dal contratto corrente), più un nuovo campo `contratti: Contract[]` (tutti i contratti associati, per la sezione storico in UI)

- [ ] **Step 1: leggere i test esistenti per capire cosa deve continuare a valere**

```bash
docker exec utenzepa-api-1 cat src/apis/utility/utility.service.spec.ts
```

Individuare i test che asseriscono su `supply_expiry_date`/`expiryStatus`/`safeguard` — vanno adattati per riflettere che il dato ora arriva dal join, non dalla colonna diretta (stesso comportamento osservabile, query diversa).

- [ ] **Step 2: implementare il join sul "contratto corrente" in `findAll`**

Sostituire in `backend/src/apis/utility/utility.service.ts` il blocco dei join esistente (righe con `Utility.supplier`/`Utility.consipAgreement`) con un join verso una sotto-query correlata che seleziona, per ogni utenza, l'id del contratto associato con `supply_expiry_date` nulla o ≥ oggi (il più recente per `supply_start_date` in caso di più match):

```typescript
  async findAll(filters?: Partial<SearchUtilityDto>): Promise<Utility[]> {
    const qb = this.repo.createQueryBuilder('Utility');
    qb.leftJoinAndSelect('Utility.utilityType', 'utilityType', 'utilityType.deleted = 0');
    qb.leftJoinAndSelect('utilityType.utilityTypePurposes', 'utps');
    qb.leftJoinAndSelect('utps.purpose', 'utpPurpose', 'utpPurpose.deleted = 0');
    qb.leftJoinAndSelect('Utility.asset', 'asset', 'asset.deleted = 0');
    qb.leftJoinAndSelect('asset.utilizerGrants', 'utilizerGrants', 'utilizerGrants.deleted = 0');
    qb.leftJoinAndSelect('utilizerGrants.utilizer', 'utilizer', 'utilizer.deleted = 0');
    qb.leftJoinAndSelect('Utility.costsBorneBy', 'costsBorneBy', 'costsBorneBy.deleted = 0');
    qb.leftJoinAndSelect(
      'Utility.maintenanceManager',
      'maintenanceManager',
      'maintenanceManager.deleted = 0',
    );
    qb.leftJoinAndSelect('Utility.budgetChapter', 'budgetChapter', 'budgetChapter.deleted = 0');
    qb.leftJoinAndSelect(
      'Utility.utilityAggregator',
      'utilityAggregator',
      'utilityAggregator.deleted = 0',
    );
    qb.leftJoinAndSelect('Utility.contratti', 'contratti', 'contratti.deleted = 0');

    // "Contratto corrente": tra i contratti associati (via contract_utilities),
    // quello con supply_expiry_date nulla o >= oggi, il più recente per
    // supply_start_date in caso di più match — stessa definizione decisa in fase
    // di design, nessun campo stato dedicato.
    qb.leftJoin(
      (subQb) =>
        subQb
          .subQuery()
          .select('cu.utility_id', 'utility_id')
          .addSelect('c.id', 'contract_id')
          .from('contract_utilities', 'cu')
          .innerJoin('contracts', 'c', 'c.id = cu.contract_id AND c.deleted = 0')
          .where('c.supply_expiry_date IS NULL OR c.supply_expiry_date >= CURDATE()')
          .orderBy('cu.utility_id', 'ASC')
          .addOrderBy('c.supply_start_date', 'DESC')
          .addOrderBy('c.id', 'DESC'),
      'current_link',
      'current_link.utility_id = Utility.id',
    );
    qb.leftJoinAndSelect('Contract', 'currentContract', 'currentContract.id = current_link.contract_id');
    qb.leftJoinAndSelect('currentContract.supplier', 'currentSupplier', 'currentSupplier.deleted = 0');
    qb.leftJoinAndSelect(
      'currentContract.consipAgreement',
      'currentConsipAgreement',
      'currentConsipAgreement.deleted = 0',
    );

    qb.where('Utility.deleted = :deleted', { deleted: filters?.deleted ?? false });

    if (filters?.safeguard !== undefined && filters.safeguard !== null) {
      const safeguardValue = filters.safeguard.toString();
      qb.andWhere('currentConsipAgreement.safeguard = :safeguard_filter', {
        safeguard_filter: safeguardValue === 'true' || safeguardValue === '1' ? 1 : 0,
      });
    }

    if (filters.user_id_fk) {
      qb.andWhere('utilizer.id = :user_id_fk', { user_id_fk: filters.user_id_fk });
    }

    if (filters.utilityState) {
      this.applyUtilityStateFilter(qb, filters.utilityState);
    }

    // Campi ex-diretti su Utility, ora filtrati sul contratto corrente:
    // esclusi dal generico applyFilters e gestiti esplicitamente.
    const CONTRACT_FILTER_KEYS = [
      'supplier_id_fk', 'cig_contract', 'order_number', 'consip_order', 'consip_agreement_id',
      'security_deposit', 'supply_start_date_range', 'management_expiry_date_range',
      'takeover_termination_date_range',
    ];
    if (filters.supplier_id_fk) {
      qb.andWhere('currentContract.supplier_id_fk = :cf_supplier_id_fk', { cf_supplier_id_fk: filters.supplier_id_fk });
    }
    if (filters.cig_contract) {
      qb.andWhere('currentContract.cig_contract LIKE :cf_cig_contract', { cf_cig_contract: `%${filters.cig_contract}%` });
    }
    if (filters.order_number) {
      qb.andWhere('currentContract.order_number LIKE :cf_order_number', { cf_order_number: `%${filters.order_number}%` });
    }
    if (filters.consip_order) {
      qb.andWhere('currentContract.consip_order LIKE :cf_consip_order', { cf_consip_order: `%${filters.consip_order}%` });
    }
    if (filters.consip_agreement_id) {
      qb.andWhere('currentContract.consip_agreement_id = :cf_consip_agreement_id', { cf_consip_agreement_id: filters.consip_agreement_id });
    }

    this.applyFilters(qb, filters, 'Utility', [
      'deleted', 'safeguard', 'user_id_fk', 'id', 'create_date', 'update_date', 'utilityState',
      ...CONTRACT_FILTER_KEYS,
    ]);

    const utilities = qb.orderBy('Utility.id', 'ASC').getMany();

    return (await utilities).map((utility) => this.withCurrentContractFields(utility));
  }
```

`applyUtilityStateFilter` e `getExpiryStatus`/`getDaysToExpiry` (già esistenti) vanno adattati a leggere `currentContract.supply_expiry_date` invece di `Utility.supply_expiry_date` — sostituire ogni occorrenza di `Utility.supply_expiry_date` con `currentContract.supply_expiry_date` in `applyUtilityStateFilter`.

Aggiungere il metodo privato che flatte i campi del contratto corrente sull'oggetto restituito, sotto i nomi legacy (compatibilità con frontend/dashboard invariati):

```typescript
  private withCurrentContractFields(utility: Utility): Utility {
    const current = (utility as unknown as { currentContract?: Contract }).currentContract;
    return {
      ...utility,
      supplier: current?.supplier ?? null,
      supplier_id_fk: current?.supplier_id_fk ?? null,
      cig_contract: current?.cig_contract ?? null,
      order_number: current?.order_number ?? null,
      consip_order: current?.consip_order ?? null,
      consip_agreement_id: current?.consip_agreement_id ?? null,
      consipAgreement: current?.consipAgreement ?? null,
      supply_start_date: current?.supply_start_date ?? null,
      supply_expiry_date: current?.supply_expiry_date ?? null,
      management_expiry_date: current?.management_expiry_date ?? null,
      takeover_termination_date: current?.takeover_termination_date ?? null,
      security_deposit: current?.security_deposit ?? 0,
      expiryStatus: this.getExpiryStatus(this.toDate(current?.supply_expiry_date ?? null)),
      aggregator: utility.utilityAggregator ?? null,
      utilityType: utility.utilityType
        ? {
            ...utility.utilityType,
            purposes: utility.utilityType.utilityTypePurposes?.map((utp) => utp.purpose) ?? [],
            utilityTypePurposes: undefined,
          }
        : null,
    } as Utility;
  }
```

Questo sostituisce il `.map()` finale già esistente in `findAll` — rimuoverlo e usare `this.withCurrentContractFields(utility)` al suo posto (vedi sopra, già integrato).

Applicare la stessa sostituzione (join `currentContract` + `withCurrentContractFields`) a `findBySafeguard()` e `findOne()`, seguendo lo stesso pattern (in `findBySafeguard` il join `innerJoin` su `consipAgreement.safeguard` diventa `innerJoin` su `currentConsipAgreement.safeguard`; in `findOne`, aggiungere `contratti: true` e risolvere `currentContract` con una query separata o lo stesso subquery join).

- [ ] **Step 3: aggiornare/aggiungere gli unit test**

Adattare `utility.service.spec.ts`: dove i test creavano un mock di `Utility` con `supply_expiry_date` diretto, verificare invece che il join `currentContract` sia stato costruito e che `withCurrentContractFields` proietti correttamente i campi (mock del risultato `getMany()` con un oggetto che include `currentContract: {...}`).

- [ ] **Step 4: eseguire i test**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/utility --maxWorkers=2
```

Atteso: PASS.

- [ ] **Step 5: verifica manuale con dati reali**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3010/api/v1/utilities?safeguard=true" | jq '.[0] | {id, supply_expiry_date, expiryStatus, consipAgreement}'
```

Atteso: stessa forma di risposta di prima della migrazione (stessi nomi di campo), valori coerenti col contratto corrente.

- [ ] **Step 6: commit**

```bash
git add backend/src/apis/utility/utility.service.ts backend/src/apis/utility/utility.service.spec.ts
git commit -m "feat(contracts): UtilityService deriva campi contrattuali dal contratto corrente

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 8: Rimuovere i campi contrattuali da `Utility`/`Invoice` (entity + DTO) e generare la migration di drop

**Files:**
- Modify: `backend/src/apis/utility/entity/utility.entity.ts`
- Modify: `backend/src/apis/utility/dto/create-utility.dto.ts`
- Modify: `backend/src/apis/utility/dto/update-utility.dto.ts`
- Modify: `backend/src/apis/utility/dto/search-utility.dto.ts`
- Modify: `backend/src/apis/invoices/entity/invoice.entity.ts`
- Modify: `backend/src/apis/invoices/dto/create-invoice.dto.ts`
- Modify: `backend/src/apis/invoices/dto/update-invoice.dto.ts`
- Modify: `backend/src/apis/invoices/dto/search-invoice.dto.ts`
- Modify: `backend/src/apis/invoices/invoice.service.ts` (rimuove i join/filtri su `utility`/`supplier`, aggiunge join su `contratto`+`contratto.supplier`)
- Modify: `backend/src/apis/invoices/invoice.service.spec.ts`
- Create (generata): `backend/src/database/migrations/<timestamp>-DropUtilityInvoiceContractColumns.ts`

**Interfaces:**
- Produce: `Utility` senza `supplier_id_fk, cig_contract, order_number, consip_order, consip_agreement_id, supply_start_date, supply_expiry_date, management_expiry_date, takeover_termination_date, security_deposit` come colonne DB (restano solo come campi calcolati response-side da Task 7); `Invoice` senza `utility_id_fk`/`supplier_id_fk`, con `contratto_id_fk` obbligatorio nel flusso applicativo (nullable a DB per compatibilità storica)

- [ ] **Step 1: rimuovere i campi da `Utility` entity**

In `backend/src/apis/utility/entity/utility.entity.ts`, eliminare le `@Column` e relazioni: `costs_borne_by_id_fk` RESTA (non è un campo contrattuale spostato), rimuovere `supplier_id_fk`, `consip_order`, `supply_start_date`, `supply_expiry_date`, `consip_agreement_id`, `management_expiry_date`, `takeover_termination_date`, `security_deposit`, `order_number`, `cig_contract`, e le relazioni `supplier`, `consipAgreement`. La relazione `contratti` (aggiunta in Task 1) resta.

- [ ] **Step 2: rimuovere gli stessi campi da `CreateUtilityDto`/`UpdateUtilityDto`/`SearchUtilityDto`**

Rimuovere da `create-utility.dto.ts`: `supplier_id_fk`, `consip_order`, `supply_start_date`, `supply_expiry_date`, `consip_agreement_id`, `management_expiry_date`, `takeover_termination_date`, `security_deposit`, `order_number`, `cig_contract`.

`UpdateUtilityDto` (verificare se estende `PartialType(CreateUtilityDto)` o è dichiarato a mano — allineare di conseguenza, stessa lista di rimozioni).

In `search-utility.dto.ts` RESTANO (letti dal join sul contratto corrente in Task 7, stessi nomi): `supply_expiry_date_range`, `management_expiry_date_range`, `takeover_termination_date_range`, `safeguard`, `utilityState`, `supplier_id_fk`, `consip_agreement_id`, `consip_order`, `order_number`, `cig_contract`, `security_deposit`. Rimuovere invece `supply_start_date_range` dai filtri se non copre nessun caso reale d'uso residuo — verificare in `utility-filter-dialog.component.ts` (Task 13) prima di deciderlo, altrimenti lasciarlo (già gestito dal ramo `CONTRACT_FILTER_KEYS`+filtro esplicito di Task 7, aggiungere lì `supply_start_date_range` se mancante).

- [ ] **Step 3: rimuovere `utility_id_fk`/`supplier_id_fk` da `Invoice` entity, mantenere `contratto_id_fk`**

In `backend/src/apis/invoices/entity/invoice.entity.ts`, eliminare la colonna `utility_id_fk`, la relazione `@ManyToOne(() => Utility, ...) utility`, la colonna `supplier_id_fk`, la relazione `@ManyToOne(() => Supplier) supplier`. La relazione `contratto`/`contratto_id_fk` (Task 1) resta.

- [ ] **Step 4: aggiornare i DTO `Invoice`**

`create-invoice.dto.ts`: sostituire

```typescript
  @IsNotEmpty({ message: "L'utenza di riferimento è obbligatoria." })
  @IsInt()
  utility_id_fk: number;
```

con

```typescript
  @IsNotEmpty({ message: 'Il contratto di riferimento è obbligatorio.' })
  @IsInt()
  contratto_id_fk: number;
```

e rimuovere `supplier_id_fk`. Stessa sostituzione in `update-invoice.dto.ts` (lì entrambi opzionali, sostituire `utility_id_fk`/`supplier_id_fk` con `contratto_id_fk?: number`). In `search-invoice.dto.ts`, sostituire `utility_id_fk`/`supplier_id_fk` con `contratto_id_fk?: number` (stesso decorator `@IsInt() @Type(() => Number)`).

- [ ] **Step 5: aggiornare `InvoicesService`**

In `backend/src/apis/invoices/invoice.service.ts`:
- `relations`: sostituire `'utility'`, `'supplier'` con `'contratto'`, `'contratto.supplier'`
- `findAll`: sostituire `qb.leftJoinAndSelect('Invoice.utility', ...)`/`qb.leftJoinAndSelect('Invoice.supplier', ...)` con `qb.leftJoinAndSelect('Invoice.contratto', 'contratto', 'contratto.deleted = 0')` + `qb.leftJoinAndSelect('contratto.supplier', 'supplier', 'supplier.deleted = 0')`
- filtro `filters.contratto_id_fk` al posto di eventuali filtri diretti su `utility_id_fk`/`supplier_id_fk` (gestiti già genericamente da `applyFilters` con la nuova chiave, nessun codice aggiuntivo necessario oltre non escluderla)

- [ ] **Step 6: aggiornare `invoice.service.spec.ts`**

Sostituire nei mock/asserzioni i riferimenti a `utility_id_fk`/`supplier_id_fk` con `contratto_id_fk` dove pertinente (i test su `budget_chapters`/transazione restano invariati, non toccano questi campi).

- [ ] **Step 7: eseguire i test**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/invoices apis/utility --maxWorkers=2
```

Atteso: PASS.

- [ ] **Step 8: generare la migration di drop**

```bash
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate src/database/migrations/DropUtilityInvoiceContractColumns -d src/database/data-source.ts
docker exec -u root utenzepa-api-1 chown -R 1000:1000 src/database/migrations
```

Verificare che il file generato contenga SOLO `DROP COLUMN`/`DROP FOREIGN KEY` sulle colonne elencate sopra (nessun `CREATE TABLE` imprevisto — quelle sono già a posto dal Task 1).

- [ ] **Step 9: applicare e verificare**

```bash
docker restart utenzepa-api-1
docker logs utenzepa-api-1 --tail 50
```

Atteso: nessun errore, container `running`. Se crash-loop per FK residue non pulite dal backfill (Task 6), investigare con `docker exec utenzepa-mysql-1 mysql ...` prima di ritentare — non fare drop manuali fuori migration.

- [ ] **Step 10: eseguire i test di build backend completi**

```bash
docker exec utenzepa-api-1 pnpm run build
docker exec utenzepa-api-1 pnpm run test:unit -- --maxWorkers=2
```

- [ ] **Step 11: commit**

```bash
git add backend/src/apis/utility/entity/utility.entity.ts backend/src/apis/utility/dto/ backend/src/apis/invoices/entity/invoice.entity.ts backend/src/apis/invoices/dto/ backend/src/apis/invoices/invoice.service.ts backend/src/apis/invoices/invoice.service.spec.ts backend/src/database/migrations/
git commit -m "feat(contracts): rimuovi campi contrattuali da Utility/Invoice, migration drop

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 9: `DataImporterService` — import Access crea `Contratto` invece di popolare `Utility`, import fatture risolve `contratto_id_fk`

**Files:**
- Modify: `backend/src/data-importer/data-importer.service.ts`
- Modify: `backend/src/data-importer/data-importer.module.ts`
- Modify: `backend/src/data-importer/data-importer.service.spec.ts`

**Interfaces:**
- Consuma: `Contract`, `ContractUtility` (Task 1)
- Produce: `DataImporterService` con `contractRepo`/`contractUtilityRepo` iniettati, import utenze crea anche il contratto associato, import fatture risolve `contratto_id_fk` invece di `supplier_id_fk`

- [ ] **Step 1: aggiungere `Contract`/`ContractUtility` al modulo e al costruttore del service**

In `data-importer.module.ts`, aggiungere `Contract` e `ContractUtility` all'array `TypeOrmModule.forFeature([...])` (con i relativi import).

In `data-importer.service.ts`, aggiungere ai parametri del costruttore:

```typescript
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    @InjectRepository(ContractUtility)
    private readonly contractUtilityRepo: Repository<ContractUtility>,
```

e i relativi import in cima al file.

- [ ] **Step 2: separare la costruzione dell'entity Utility dai campi contrattuali**

Nel metodo che crea `entity = this.utilityRepo.create({...})` (righe 703-741 circa), rimuovere da quell'oggetto: `supply_start_date`, `consip_order`, `supply_expiry_date`, `supplier_id_fk`, `consip_agreement_id`, `management_expiry_date`, `takeover_termination_date`, `security_deposit`. Dopo il salvataggio dell'utenza (`await this.utilityRepo.save(entity)` o equivalente — verificare il punto esatto più sotto nel metodo), aggiungere:

```typescript
      const hasContractData = supplier_id_fk || consip_agreement_id || row['ordine consip']?.trim()
        || supply_start_date || supply_expiry_date || management_expiry_date
        || takeover_termination_date;

      if (hasContractData) {
        const savedContract = await this.contractRepo.save(
          this.contractRepo.create({
            supplier_id_fk,
            consip_order: row['ordine consip']?.trim() || null,
            consip_agreement_id,
            supply_start_date,
            supply_expiry_date,
            management_expiry_date,
            takeover_termination_date,
            security_deposit: parseDecimal(row['deposito cauzionale versato']) ?? 0,
            created_by_user_id: SYSTEM_USER_ID,
            updated_by_user_id: SYSTEM_USER_ID,
          }),
        );
        await this.contractUtilityRepo.save(
          this.contractUtilityRepo.create({ contract_id: savedContract.id, utility_id: savedEntity.id }),
        );
      }
```

(`savedEntity`/il nome esatto della variabile che riceve il risultato di `utilityRepo.save(entity)` va allineato al codice reale del metodo — leggerlo con `Read` prima di applicare la modifica, la porzione già letta in fase di piano si ferma a riga 741).

- [ ] **Step 3: aggiornare la cache utilities→contratto nell'import fatture**

Sostituire (attorno alla riga 882-884):

```typescript
    const utilities = await this.utilityRepo.find({ where: { deleted: false } });
    const utilityMap = new Map(utilities.map((u) => [u.utility_id?.toLowerCase(), u]));
```

con una mappa che include anche il contratto associato:

```typescript
    const utilities = await this.utilityRepo.find({
      where: { deleted: false },
      relations: { contratti: true },
    });
    const utilityMap = new Map(
      utilities.map((u) => [u.utility_id?.toLowerCase(), { id: u.id, contractId: u.contratti?.[0]?.id ?? null }]),
    );
```

(l'import Access popola sempre 1 contratto per utenza in questa fase iniziale — `contratti[0]` è corretto qui, coerente con l'ipotesi di Task 6).

E sostituire (attorno alla riga 929-932):

```typescript
      const utilityRaw = row['ID_utenza']?.trim().toLowerCase();
      const utility = utilityRaw ? (utilityMap.get(utilityRaw) ?? null) : null;
      const contratto_id_fk = utility?.contractId ?? null;
```

rimuovendo `utility_id_fk`/`supplier_id_fk` dall'oggetto passato a `this.invoiceRepo.create({...})` (righe 934-945), sostituendo con `contratto_id_fk`.

- [ ] **Step 4: eseguire i test esistenti**

```bash
docker exec utenzepa-api-1 pnpm exec jest data-importer --maxWorkers=2
```

Atteso: PASS (i test esistenti sono strutturali, sul path dei file — non asseriscono sul dettaglio dei campi importati, quindi nessuna modifica ai test richiesta oltre l'eventuale aggiornamento dei mock dei repository iniettati nel costruttore, se il test costruisce `DataImporterService` a mano).

- [ ] **Step 5: commit**

```bash
git add backend/src/data-importer/data-importer.service.ts backend/src/data-importer/data-importer.module.ts backend/src/data-importer/data-importer.service.spec.ts
git commit -m "feat(contracts): importer Access crea Contratto invece di popolare Utility

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 10: Frontend — entity + service `Contract`

**Files:**
- Create: `frontend/src/app/pages/contracts/entity/contract.interface.ts`
- Create: `frontend/src/app/pages/contracts/entity/contract.entity.ts`
- Create: `frontend/src/app/pages/contracts/contract.service.ts`

**Interfaces:**
- Produce: classe `Contract extends AbstractEntity`, `ContractsService extends AbstractService<Contract>` — stesso pattern di `Supplier`/`SuppliersService`

- [ ] **Step 1: scrivere l'interfaccia**

```typescript
// frontend/src/app/pages/contracts/entity/contract.interface.ts
export interface IContract {
  supplier_id_fk?: number | null;
  cig_contract?: string;
  order_number?: string;
  consip_order?: string;
  consip_agreement_id?: number | null;
  supply_start_date?: Date | null;
  supply_expiry_date?: Date | null;
  management_expiry_date?: Date | null;
  takeover_termination_date?: Date | null;
  security_deposit?: number;
  utility_ids?: number[];
}
```

- [ ] **Step 2: scrivere l'entity**

```typescript
// frontend/src/app/pages/contracts/entity/contract.entity.ts
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {IContract} from './contract.interface';
import {plainToInstance, Exclude} from 'class-transformer';
import {Supplier} from '../../suppliers/entity/supplier.entity';
import {ConsipAgreement} from '../../consip-agreement/entity/consip-agreement.entity';
import {Utility} from '../../utilities/entity/utility.entity';

export class Contract extends AbstractEntity implements IContract {
  supplier_id_fk?: number | null;
  cig_contract?: string;
  order_number?: string;
  consip_order?: string;
  consip_agreement_id?: number | null;
  supply_start_date?: Date | null;
  supply_expiry_date?: Date | null;
  management_expiry_date?: Date | null;
  takeover_termination_date?: Date | null;
  security_deposit?: number;
  utility_ids?: number[];

  @Exclude({toPlainOnly: true})
  supplier?: Supplier;

  @Exclude({toPlainOnly: true})
  consipAgreement?: ConsipAgreement;

  @Exclude({toPlainOnly: true})
  utilities?: Utility[];

  get isCurrent(): boolean {
    if (!this.supply_expiry_date) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(this.supply_expiry_date);
    expiry.setHours(0, 0, 0, 0);
    return expiry >= today;
  }

  static create(data?: Partial<Contract>): Contract {
    return plainToInstance(Contract, {id: 0, security_deposit: 0, deleted: false, ...data});
  }
}
```

- [ ] **Step 3: scrivere il service**

```typescript
// frontend/src/app/pages/contracts/contract.service.ts
import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {Contract} from './entity/contract.entity';

@Injectable({providedIn: 'root'})
export class ContractsService extends AbstractService<Contract> {
  protected override readonly BASE_URL = environment.apiUrl + '/contracts';
  protected override readonly entityClass = Contract;
}
```

- [ ] **Step 4: verificare la build**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```

Atteso: nessun errore su `pages/contracts`.

- [ ] **Step 5: commit**

```bash
git add frontend/src/app/pages/contracts/entity/ frontend/src/app/pages/contracts/contract.service.ts
git commit -m "feat(contracts): entity/service frontend Contract

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 11: Frontend — pagina "Contratti" (lista/ricerca/filtro/CRUD) + rotta + menu

**Files:**
- Create: `frontend/src/app/pages/contracts/contracts.component.ts`
- Create: `frontend/src/app/pages/contracts/contracts.component.html`
- Create: `frontend/src/app/pages/contracts/search-contracts.component.ts`
- Create: `frontend/src/app/pages/contracts/search-contracts.component.html`
- Create: `frontend/src/app/pages/contracts/contract-filter-dialog.component.ts`
- Create: `frontend/src/app/pages/contracts/data-table-contracts.component.ts`
- Create: `frontend/src/app/pages/contracts/data-table-contracts.component.html`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/comp/sidebar/sidebar.component.ts`

**Interfaces:**
- Consuma: `Contract`/`ContractsService` (Task 10), `ContractEditDialogComponent` (Task 12, riferimento in avanti — creare come stub minimo in questo task se Task 12 non è ancora fatto, altrimenti ordinare l'esecuzione con Task 12 prima di questo)
- Produce: rotta `/contracts`, voce menu "Contratti"

- [ ] **Step 1: `ContractsComponent` (pagina contenitore, stesso pattern di `SuppliersComponent`)**

```typescript
// frontend/src/app/pages/contracts/contracts.component.ts
import {Component, ChangeDetectionStrategy} from '@angular/core';
import {DataTableContractsComponent} from './data-table-contracts.component';
import {SearchContractsComponent} from './search-contracts.component';
import {ContractsService} from './contract.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Contract} from './entity/contract.entity';

@Component({
  selector: 'app-contracts',
  standalone: true,
  imports: [DataTableContractsComponent, SearchContractsComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './contracts.component.html'
})
export class ContractsComponent extends AbstractComponent<Contract> {

  constructor(protected override service: ContractsService) {
    super();
  }

  protected override getEntityIdentifier(entity: Contract): string {
    return entity.cig_contract ?? `#${entity.id}`;
  }

  protected override entityLabel(): string {
    return 'Contratto';
  }
}
```

```html
<!-- frontend/src/app/pages/contracts/contracts.component.html -->
<div style="padding: 1rem;">
  <div>
    <h1>Contratti</h1>
    <p style="color: #6A7282;">Gestisci i contratti di fornitura e le utenze che coprono</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-contracts (search)="onSearch($event)"></app-search-contracts>
  </div>
  <div style="margin-top: 1.5rem;">
    <app-data-table-contracts
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-contracts>
  </div>
</div>
```

- [ ] **Step 2: `SearchContractsComponent`**

```typescript
// frontend/src/app/pages/contracts/search-contracts.component.ts
import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {ContractFilterDialogComponent} from './contract-filter-dialog.component';

@Component({
  selector: 'app-search-contracts',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './search-contracts.component.html',
})
export class SearchContractsComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      cig_contract: [''],
      order_number: [''],
      supplier_id_fk: [null],
      supply_expiry_date_range: [null],
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return ContractFilterDialogComponent;
  }
}
```

(`search-contracts.component.html`: copiare `frontend/src/app/pages/suppliers/search-suppliers.component.html` senza modifiche — stesso markup generico.)

- [ ] **Step 3: `ContractFilterDialogComponent`**

```typescript
// frontend/src/app/pages/contracts/contract-filter-dialog.component.ts
import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {TOption} from '../../core/types/option.interface';
import {SuppliersService} from '../suppliers/suppliers.service';

export interface ContractFilterValues {
  cig_contract: string | null;
  order_number: string | null;
  supplier_id_fk: number | null;
  supply_expiry_date_range: (string | null)[] | null;
}

@Component({
  selector: 'app-contract-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-wrap: wrap; gap: 1rem;">
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>CIG</mat-label>
          <input matInput formControlName="cig_contract">
        </mat-form-field>
        <mat-form-field style="flex: 1 1 45%;">
          <mat-label>Numero Ordine</mat-label>
          <input matInput formControlName="order_number">
        </mat-form-field>
        <div style="flex: 1 1 45%;">
          <app-filterable-select label="Fornitore" placeholder="Cerca fornitore..." [options]="supplierOptions" formControlName="supplier_id_fk"></app-filterable-select>
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
      <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
    </mat-dialog-actions>
  `
})
export class ContractFilterDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ContractFilterDialogComponent, ContractFilterValues | 'clear'>);
  private suppliersService = inject(SuppliersService);
  protected data = inject<FilterDialogData<ContractFilterValues>>(MAT_DIALOG_DATA);

  supplierOptions: TOption[] = [];

  form = this.fb.group({
    cig_contract: [this.data.values.cig_contract ?? ''],
    order_number: [this.data.values.order_number ?? ''],
    supplier_id_fk: [this.data.values.supplier_id_fk ?? null],
    supply_expiry_date_range: [this.data.values.supply_expiry_date_range ?? null],
  });

  ngOnInit(): void {
    this.suppliersService.search({deleted: false}).subscribe({
      next: data => this.supplierOptions = data
        .map(s => ({label: s.supplier_id, value: s.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei fornitori:', err)
    });
  }

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

- [ ] **Step 4: `DataTableContractsComponent`**

```typescript
// frontend/src/app/pages/contracts/data-table-contracts.component.ts
import {Component, Type, ChangeDetectionStrategy} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {DatePipe} from '@angular/common';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {Contract} from './entity/contract.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {ContractEditDialogComponent} from './contract-edit-dialog.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';

@Component({
  selector: 'app-data-table-contracts',
  standalone: true,
  imports: [
    MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatProgressBarModule, DatePipe, HasRoleDirective
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-contracts.component.html'
})
export class DataTableContractsComponent extends AbstractDataTableComponent<Contract> {

  displayedColumns = ['actions', 'id', 'cig_contract', 'order_number', 'supplier', 'supply_start_date', 'supply_expiry_date', 'utilities'];

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): Contract {
    return Contract.create();
  }

  override editDialogComponent(): Type<unknown> {
    return ContractEditDialogComponent;
  }

  protected override editDialogWidth(): string {
    return '900px';
  }

  protected override entityLabel(): string {
    return 'contratto';
  }

  override openDeleteDialog(entity: Contract): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Elimina contratto',
        message: `Disattiva il contratto ${entity.cig_contract ?? '#' + entity.id}?`,
        confirmLabel: 'Elimina',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }

  override restoreItem(entity: Contract): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {
        title: 'Ripristina contratto',
        message: `Riattiva il contratto ${entity.cig_contract ?? '#' + entity.id}?`,
        confirmLabel: 'Ripristina'
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onRestore.emit(entity);
    });
  }
}
```

```html
<!-- frontend/src/app/pages/contracts/data-table-contracts.component.html -->
<div style="display: flex; justify-content: space-between; align-items: center;">
  <h3>Elenco ({{data.length}})</h3>
  <button mat-flat-button (click)="openCreateDialog()" [appHasRole]="['Admin', 'Operatore']">
    <mat-icon>add</mat-icon>
    Aggiungi Contratto
  </button>
</div>

@if (loading) {
  <mat-progress-bar mode="indeterminate"></mat-progress-bar>
}

<table mat-table [dataSource]="dataSource" matSort #sort="matSort" class="mat-elevation-z1">

  <ng-container matColumnDef="actions">
    <th mat-header-cell *matHeaderCellDef>Azioni</th>
    <td mat-cell *matCellDef="let item">
      @if (!item.deleted) {
        <button mat-icon-button (click)="openEditDialog(item)" [appHasRole]="['Admin', 'Operatore', 'Lettore']" matTooltip="Modifica">
          <mat-icon>edit</mat-icon>
        </button>
      }
      <button mat-icon-button
              [class.mat-action-success]="item.deleted"
              [class.mat-action-danger]="!item.deleted"
              (click)="item.deleted ? restoreItem(item) : openDeleteDialog(item)"
              [appHasRole]="['Admin', 'Operatore']"
              [matTooltip]="item.deleted ? 'Ripristina' : 'Elimina'">
        <mat-icon>{{ item.deleted ? 'restore' : 'delete' }}</mat-icon>
      </button>
    </td>
  </ng-container>

  <ng-container matColumnDef="id">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>ID</th>
    <td mat-cell *matCellDef="let item">{{ item.id }}</td>
  </ng-container>

  <ng-container matColumnDef="cig_contract">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>CIG</th>
    <td mat-cell *matCellDef="let item">{{ item.cig_contract || 'N/D' }}</td>
  </ng-container>

  <ng-container matColumnDef="order_number">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Numero Ordine</th>
    <td mat-cell *matCellDef="let item">{{ item.order_number || 'N/D' }}</td>
  </ng-container>

  <ng-container matColumnDef="supplier">
    <th mat-header-cell *matHeaderCellDef>Fornitore</th>
    <td mat-cell *matCellDef="let item">{{ item.supplier?.supplier_id || 'N/D' }}</td>
  </ng-container>

  <ng-container matColumnDef="supply_start_date">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Decorrenza</th>
    <td mat-cell *matCellDef="let item">{{ item.supply_start_date | date: 'dd/MM/yyyy' }}</td>
  </ng-container>

  <ng-container matColumnDef="supply_expiry_date">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Scadenza</th>
    <td mat-cell *matCellDef="let item">
      {{ item.supply_expiry_date ? (item.supply_expiry_date | date: 'dd/MM/yyyy') : 'N/D' }}
      @if (item.isCurrent) { <span class="mat-action-success" style="margin-left: 0.5rem;">Corrente</span> }
    </td>
  </ng-container>

  <ng-container matColumnDef="utilities">
    <th mat-header-cell *matHeaderCellDef>Utenze coperte</th>
    <td mat-cell *matCellDef="let item">{{ item.utilities?.length ?? 0 }}</td>
  </ng-container>

  <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
  <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.row-deleted]="row.deleted"></tr>

  <tr class="mat-row" *matNoDataRow>
    <td class="mat-cell" [attr.colspan]="displayedColumns.length">Nessun contratto trovato.</td>
  </tr>
</table>

<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="10"></mat-paginator>
```

- [ ] **Step 5: rotta + menu**

In `frontend/src/app/app.routes.ts`, aggiungere l'import `import {ContractsComponent} from "./pages/contracts/contracts.component";` e la rotta `{path: 'contracts', component: ContractsComponent},` nell'array `children` (accanto a `invoices`).

In `frontend/src/app/comp/sidebar/sidebar.component.ts`, aggiungere una voce top-level (accanto a `Fatture`): `{label: 'Contratti', icon: 'description', route: '/contracts'},`.

- [ ] **Step 6: build reale**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```

Atteso: nessun errore (`ContractEditDialogComponent`, creato nel Task 12, deve esistere prima di questa build — eseguire Task 12 subito dopo, o come parte dello stesso ciclo di verifica, prima del commit finale di questo task).

- [ ] **Step 7: commit**

```bash
git add frontend/src/app/pages/contracts/contracts.component.ts frontend/src/app/pages/contracts/contracts.component.html frontend/src/app/pages/contracts/search-contracts.component.ts frontend/src/app/pages/contracts/search-contracts.component.html frontend/src/app/pages/contracts/contract-filter-dialog.component.ts frontend/src/app/pages/contracts/data-table-contracts.component.ts frontend/src/app/pages/contracts/data-table-contracts.component.html frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts
git commit -m "feat(contracts): pagina Contratti (lista/ricerca/filtro) + rotta + menu

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 12: Frontend — `ContractEditDialogComponent` (form + multi-select utenze)

**Files:**
- Create: `frontend/src/app/pages/contracts/contract-edit-dialog.component.ts`
- Create: `frontend/src/app/pages/contracts/contract-edit-dialog.component.html`

**Interfaces:**
- Consuma: `Contract` (Task 10), `UtilityService`, `SuppliersService`, `ConsipAgreementService` (esistenti)
- Produce: dialog di create/edit riusato sia dalla pagina Contratti (Task 11) sia dall'azione "+ Nuovo contratto" nel dettaglio Utenza (Task 13)

- [ ] **Step 1: componente**

```typescript
// frontend/src/app/pages/contracts/contract-edit-dialog.component.ts
import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule, MatSelectChange} from '@angular/material/select';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {Contract} from './entity/contract.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {TOption} from '../../core/types/option.interface';
import {SuppliersService} from '../suppliers/suppliers.service';
import {ConsipAgreementService} from '../consip-agreement/consip-agreement.service';
import {UtilityService} from '../utilities/utility.service';
import {ConsipAgreement} from '../consip-agreement/entity/consip-agreement.entity';

/** Precompila l'associazione utenze quando aperto dal dettaglio Utenza (Task 13, "+ Nuovo contratto"). */
export interface ContractDialogExtra {
  preselectedUtilityIds?: number[];
}

@Component({
  selector: 'app-contract-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatButtonModule, HasRoleDirective, ReadOnlyDirective, FilterableSelectComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './contract-edit-dialog.component.html'
})
export class ContractEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ContractEditDialogComponent, Contract | undefined>);
  private authService = inject(AuthService);
  private suppliersService = inject(SuppliersService);
  private consipService = inject(ConsipAgreementService);
  private utilityService = inject(UtilityService);
  protected data = inject<EditDialogData<Contract> & ContractDialogExtra>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';

  supplierOptions: TOption[] = [];
  consipAgreementOptions: ConsipAgreement[] = [];
  utilityOptions: TOption[] = [];

  private toDate(v: unknown): Date | null {
    return v ? new Date(v as string) : null;
  }

  form = this.fb.group({
    cig_contract: [this.data.item.cig_contract ?? ''],
    order_number: [this.data.item.order_number ?? ''],
    consip_order: [this.data.item.consip_order ?? ''],
    consip_agreement_id: [this.data.item.consip_agreement_id ?? null],
    supplier_id_fk: [this.data.item.supplier_id_fk ?? null],
    supply_start_date: [this.toDate(this.data.item.supply_start_date)],
    supply_expiry_date: [this.toDate(this.data.item.supply_expiry_date)],
    management_expiry_date: [this.toDate(this.data.item.management_expiry_date)],
    takeover_termination_date: [this.toDate(this.data.item.takeover_termination_date)],
    security_deposit: [this.data.item.security_deposit ?? 0],
    utility_ids: [
      this.data.item.utilities?.map(u => u.id) ?? this.data.preselectedUtilityIds ?? []
    ],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.suppliersService.search({deleted: false}).subscribe({
      next: data => this.supplierOptions = data
        .map(s => ({label: s.supplier_id, value: s.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei fornitori:', err)
    });
    this.consipService.search({deleted: false}).subscribe({
      next: data => this.consipAgreementOptions = data.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      error: err => console.error('Errore nel caricamento delle convenzioni CONSIP:', err)
    });
    this.utilityService.search({deleted: false}).subscribe({
      next: data => this.utilityOptions = data
        .map(u => ({label: u.utility_id, value: u.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento delle utenze:', err)
    });
  }

  onConsipAgreementChange(event: MatSelectChange): void {
    const selectedAgreementId: number | null = event.value;
    if (selectedAgreementId) {
      const agreement = this.consipAgreementOptions.find(a => a.id === selectedAgreementId);
      if (agreement?.supplier_id) {
        this.form.patchValue({supplier_id_fk: agreement.supplier_id});
      }
    }
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(Contract, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
```

- [ ] **Step 2: template**

```html
<!-- frontend/src/app/pages/contracts/contract-edit-dialog.component.html -->
<h2 mat-dialog-title>{{ isNew ? 'Aggiungi Contratto' : 'Modifica Contratto: ' + (data.item.cig_contract || '#' + data.item.id) }}</h2>

<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-wrap: wrap; gap: 1rem;">

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>CIG</mat-label>
      <input matInput formControlName="cig_contract">
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Numero Ordine</mat-label>
      <input matInput formControlName="order_number">
    </mat-form-field>

    <div style="flex: 1 1 45%;">
      <app-filterable-select label="Fornitore" placeholder="Cerca fornitore..." [options]="supplierOptions" formControlName="supplier_id_fk"></app-filterable-select>
    </div>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Convenzione CONSIP</mat-label>
      <mat-select formControlName="consip_agreement_id" (selectionChange)="onConsipAgreementChange($event)">
        <mat-option [value]="null">Nessuna</mat-option>
        @for (opt of consipAgreementOptions; track opt.id) {
          <mat-option [value]="opt.id">{{ opt.name }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Ordine CONSIP</mat-label>
      <input matInput formControlName="consip_order">
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Decorrenza Fornitura</mat-label>
      <input matInput [matDatepicker]="startPicker" formControlName="supply_start_date">
      <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
      <mat-datepicker #startPicker></mat-datepicker>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Scadenza Fornitura</mat-label>
      <input matInput [matDatepicker]="expiryPicker" formControlName="supply_expiry_date">
      <mat-datepicker-toggle matIconSuffix [for]="expiryPicker"></mat-datepicker-toggle>
      <mat-datepicker #expiryPicker></mat-datepicker>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Scadenza Gestione</mat-label>
      <input matInput [matDatepicker]="managementPicker" formControlName="management_expiry_date">
      <mat-datepicker-toggle matIconSuffix [for]="managementPicker"></mat-datepicker-toggle>
      <mat-datepicker #managementPicker></mat-datepicker>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Data Voltura/Cessazione</mat-label>
      <input matInput [matDatepicker]="takeoverPicker" formControlName="takeover_termination_date">
      <mat-datepicker-toggle matIconSuffix [for]="takeoverPicker"></mat-datepicker-toggle>
      <mat-datepicker #takeoverPicker></mat-datepicker>
    </mat-form-field>

    <mat-form-field style="flex: 1 1 45%;">
      <mat-label>Deposito Cauzionale (€)</mat-label>
      <input matInput type="number" step="0.01" formControlName="security_deposit">
    </mat-form-field>

    <mat-form-field style="flex: 1 1 100%;">
      <mat-label>Utenze coperte</mat-label>
      <mat-select formControlName="utility_ids" multiple>
        @for (opt of utilityOptions; track opt.value) {
          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid" [appHasRole]="['Admin','Operatore']">
    {{ isNew ? 'Crea Contratto' : 'Salva Contratto' }}
  </button>
</mat-dialog-actions>
```

- [ ] **Step 3: build reale (copre anche Task 11, `ContractEditDialogComponent` ora esiste)**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```

Atteso: nessun errore.

- [ ] **Step 4: verifica manuale in browser**

Login, `/contracts`, "Aggiungi Contratto": compilare CIG + selezionare 2 utenze, salvare, verificare che compaia in lista con "Utenze coperte: 2". Riaprire in edit: verificare che il multi-select utenze sia precompilato.

- [ ] **Step 5: commit**

```bash
git add frontend/src/app/pages/contracts/contract-edit-dialog.component.ts frontend/src/app/pages/contracts/contract-edit-dialog.component.html
git commit -m "feat(contracts): ContractEditDialogComponent con associazione multi-utenza

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 13: Frontend — `UtilityEditDialogComponent`: rimuovere i campi contrattuali, aggiungere sezione "Contratti"

**Files:**
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.html`
- Modify: `frontend/src/app/pages/utilities/entity/utility.entity.ts` (marcare `@Exclude({toPlainOnly: true})` i campi ex-contrattuali, mai più inviati al backend in save)
- Modify: `frontend/src/app/pages/utilities/entity/utility.interface.ts`

**Interfaces:**
- Consuma: `Contract`/`ContractsService` (Task 10), `ContractEditDialogComponent` (Task 12)
- Produce: `UtilityEditDialogComponent` senza i FormControl `cig_contract`, `consip_agreement_id`, `consip_order`, `order_number`, `supplier_id_fk`, `supply_start_date`, `supply_expiry_date`, `management_expiry_date`, `takeover_termination_date`, `security_deposit`; nuova sezione "Contratti"

- [ ] **Step 1: marcare i campi ex-contrattuali come read-only sull'entity frontend `Utility`**

In `frontend/src/app/pages/utilities/entity/utility.entity.ts`, applicare `@Exclude({toPlainOnly: true})` (stesso pattern già usato per `expiryStatus`/`consipAgreement`/`remainingDays`) a: `supplier_id_fk`, `consip_order`, `consip_agreement_id`, `security_deposit`, `order_number`, `cig_contract`, `supply_start_date`, `supply_expiry_date`, `management_expiry_date`, `takeover_termination_date`, e alla relazione `supplier` (già assente da questa entity — verificare, se assente aggiungerla come `@Exclude({toPlainOnly:true}) supplier?: Supplier;` per completezza di lettura). Questi campi restano leggibili (popolati dal backend via Task 7) ma non vengono mai serializzati in `parseCreate`/`parseUpdate` — niente proprietà sconosciute rifiutate da `forbidNonWhitelisted` lato backend dopo Task 8. Aggiungere in fondo alla classe:

```typescript
  @Exclude({toPlainOnly: true})
  @Type(() => Contract)
  contratti?: Contract[];

  get currentContract(): Contract | null {
    return this.contratti?.find(c => c.isCurrent) ?? null;
  }
```

con l'import `import {Contract} from '../../contracts/entity/contract.entity';` in cima al file.

- [ ] **Step 2: rimuovere i FormControl contrattuali dal form**

In `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`, rimuovere dal `form = this.fb.group({...})`: `cig_contract`, `consip_agreement_id`, `consip_order`, `order_number`, `security_deposit`, `supplier_id_fk`, `supply_active` RESTA (non è un campo spostato — è "fornitura attiva", indipendente dal contratto), `supply_expiry_date`, `supply_start_date`, `takeover_termination_date`, `management_expiry_date`.

Rimuovere anche: `supplierOptions`, `consipAgreementOptions` (proprietà e relative `.subscribe()` in `ngOnInit`), `onConsipAgreementChange()` (metodo intero — non più necessario, quella logica ora vive in `ContractEditDialogComponent`, Task 12).

Aggiungere l'iniezione di `ContractsService` e `MatDialog` (già iniettato) per l'azione "+ Nuovo contratto":

```typescript
  private contractsService = inject(ContractsService);
```

con l'import `import {ContractsService} from '../contracts/contract.service';` e `import {ContractEditDialogComponent} from '../contracts/contract-edit-dialog.component';`.

Aggiungere il metodo per aprire il dialog contratto precompilato con l'utenza corrente:

```typescript
  openNewContractDialog(): void {
    this.dialog.open(ContractEditDialogComponent, {
      width: '900px',
      maxWidth: '900px',
      position: EDIT_DIALOG_POSITION,
      data: {mode: 'create', item: Contract.create(), preselectedUtilityIds: [this.data.item.id]},
    }).afterClosed().subscribe(result => {
      if (result) {
        this.contractsService.create(result).subscribe(() => {
          // Ricarica i contratti dell'utenza per aggiornare subito la sezione in questo dialog.
          this.contractsService.search({utility_id: this.data.item.id} as never).subscribe(
            contratti => this.data.item.contratti = contratti
          );
        });
      }
    });
  }
```

con l'import `import {Contract} from '../contracts/entity/contract.entity';`.

- [ ] **Step 3: template — rimuovere i campi, aggiungere la sezione "Contratti"**

In `frontend/src/app/pages/utilities/utility-edit-dialog.component.html`, individuare e rimuovere i blocchi `<mat-form-field>`/`<app-filterable-select>` legati a `formControlName="cig_contract"`, `"consip_agreement_id"`, `"consip_order"`, `"order_number"`, `"security_deposit"`, `"supplier_id_fk"`, `"supply_expiry_date"`, `"supply_start_date"`, `"takeover_termination_date"`, `"management_expiry_date"` (leggere il file per individuare i blocchi esatti: non ancora letto in fase di piano, il component TS sì — leggerlo con `Read` prima di questo step).

Aggiungere, in un punto coerente col resto del layout a tab (probabilmente un nuovo tab "Contratti" accanto agli esistenti, dato l'uso di `MatTabsModule` nel component):

```html
<div style="display: flex; flex-direction: column; gap: 0.75rem;">
  <div style="display: flex; justify-content: space-between; align-items: center;">
    <h3 style="margin: 0;">Contratti</h3>
    <button mat-stroked-button type="button" (click)="openNewContractDialog()" [appHasRole]="['Admin', 'Operatore']">
      <mat-icon>add</mat-icon>
      Nuovo contratto
    </button>
  </div>
  @if (!data.item.contratti?.length) {
    <p style="color: #6A7282;">Nessun contratto associato.</p>
  }
  @for (contratto of data.item.contratti; track contratto.id) {
    <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border: 1px solid #E5E7EB; border-radius: 4px;">
      <span>{{ contratto.cig_contract || ('Contratto #' + contratto.id) }} — {{ contratto.supplier?.supplier_id || 'N/D' }}</span>
      @if (contratto.isCurrent) { <span class="mat-action-success">Corrente</span> }
      <span style="color: #6A7282;">
        {{ contratto.supply_start_date ? (contratto.supply_start_date | date: 'dd/MM/yyyy') : 'N/D' }}
        →
        {{ contratto.supply_expiry_date ? (contratto.supply_expiry_date | date: 'dd/MM/yyyy') : 'N/D' }}
      </span>
    </div>
  }
</div>
```

(la gestione "disassociare" un'utenza da un contratto — lato bidirezionale — resta demandata al multi-select `utility_ids` nel dialog Contratto stesso, Task 12: togliere l'utenza da lì è l'azione simmetrica. Questa sezione nel dialog Utenza è quindi di sola visualizzazione + creazione di un nuovo contratto, non un secondo multi-select duplicato — più semplice e senza doppia fonte di verità sull'associazione.)

`DatePipe` va importato nel component se non già presente (`imports: [..., DatePipe]`).

- [ ] **Step 4: `utility.interface.ts` — rimuovere gli stessi campi dall'interfaccia, aggiungere `contratti`**

Allineare `IUtility` alle stesse rimozioni/aggiunte fatte sull'entity in Step 1.

- [ ] **Step 5: build reale**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```

Atteso: nessun errore — questo è il punto in cui il type-checking dei template Angular cattura eventuali `formControlName` orfani non rimossi dal template.

- [ ] **Step 6: verifica manuale in browser**

Aprire un'utenza esistente: verificare che il form non mostri più i campi contrattuali, che la sezione "Contratti" mostri il contratto migrato (Task 6) con badge "Corrente" se applicabile, che "+ Nuovo contratto" apra il dialog Task 12 con questa utenza già preselezionata.

- [ ] **Step 7: commit**

```bash
git add frontend/src/app/pages/utilities/utility-edit-dialog.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.html frontend/src/app/pages/utilities/entity/utility.entity.ts frontend/src/app/pages/utilities/entity/utility.interface.ts
git commit -m "feat(contracts): UtilityEditDialogComponent rimuove campi contrattuali, aggiunge sezione Contratti

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 14: Frontend — `InvoiceEditDialogComponent` e tabella fatture: picker Contratto unico

**Files:**
- Modify: `frontend/src/app/pages/invoices/invoice-edit-dialog.component.ts`
- Modify: `frontend/src/app/pages/invoices/invoice-edit-dialog.component.html`
- Modify: `frontend/src/app/pages/invoices/entity/invoice.entity.ts`
- Modify: `frontend/src/app/pages/invoices/data-table-invoices.component.ts`
- Modify: `frontend/src/app/pages/invoices/data-table-invoices.component.html`
- Modify: `frontend/src/app/pages/invoices/invoice-filter-dialog.component.ts`
- Modify: `frontend/src/app/pages/invoices/search-invoices.component.ts`

**Interfaces:**
- Consuma: `Contract`/`ContractsService` (Task 10)
- Produce: `Invoice` con `contratto_id_fk`/`contratto: Contract` al posto di `utility_id_fk`/`supplier_id_fk`/`utility`/`supplier`

- [ ] **Step 1: `Invoice` entity frontend**

In `frontend/src/app/pages/invoices/entity/invoice.entity.ts`, sostituire `utility_id_fk!: number;` con `contratto_id_fk!: number;`, rimuovere `supplier_id_fk?: number;` e la proprietà `supplier?: Supplier;` (con relativo import, se non riusato altrove nel file), aggiungere:

```typescript
  @Exclude({toPlainOnly: true})
  @Type(() => Contract)
  contratto?: Contract;
```

con l'import `import {Contract} from '../../contracts/entity/contract.entity';`. Aggiornare il default in `static create()`: `contratto_id_fk: null` al posto di `utility_id_fk: null, supplier_id_fk: null`.

- [ ] **Step 2: `InvoiceEditDialogComponent`**

Sostituire l'iniezione `private utilityService = inject(UtilityService);`/`private suppliersService = inject(SuppliersService);` con `private contractsService = inject(ContractsService);` (import `from '../contracts/contract.service'`).

Sostituire nel form:

```typescript
    utility_id_fk: [this.data.item.utility_id_fk ?? null, Validators.required],
    supplier_id_fk: [this.data.item.supplier != null ? (this.data.item.supplier_id_fk ?? null) : null],
```

con:

```typescript
    contratto_id_fk: [this.data.item.contratto_id_fk ?? null, Validators.required],
```

Sostituire `utilityOptions`/`supplierOptions` con:

```typescript
  contractOptions: TOption[] = [];
  selectedContractSupplierLabel: string | null = this.data.item.contratto?.supplier?.supplier_id ?? null;
```

In `ngOnInit`, sostituire il caricamento di `utilityService.search`/`suppliersService.search` con:

```typescript
    this.contractsService.search({deleted: false}).subscribe({
      next: data => {
        this.contractOptions = data
          .map(c => ({label: c.cig_contract || `Contratto #${c.id}`, value: c.id}))
          .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
      },
      error: err => console.error('Errore nel caricamento dei contratti:', err)
    });
    this.form.controls.contratto_id_fk.valueChanges.subscribe(id => {
      const contract = (this.contractsService as any).lastSearchResult?.find((c: Contract) => c.id === id);
      this.selectedContractSupplierLabel = contract?.supplier?.supplier_id ?? null;
    });
```

(nota: `lastSearchResult` non esiste su `ContractsService` — più semplice e corretto: mantenere una proprietà locale `contracts: Contract[] = []` popolata nello stesso `.subscribe()` sopra invece di `contractOptions` mappato al volo, e derivare `contractOptions` da quella. Sostituire quindi con:)

```typescript
  contracts: Contract[] = [];
  contractOptions: TOption[] = [];
  selectedContractSupplierLabel: string | null = this.data.item.contratto?.supplier?.supplier_id ?? null;

  ngOnInit(): void {
    this.contractsService.search({deleted: false}).subscribe({
      next: data => {
        this.contracts = data;
        this.contractOptions = data
          .map(c => ({label: c.cig_contract || `Contratto #${c.id}`, value: c.id}))
          .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
      },
      error: err => console.error('Errore nel caricamento dei contratti:', err)
    });
    this.form.controls.contratto_id_fk.valueChanges.subscribe(id => {
      this.selectedContractSupplierLabel = this.contracts.find(c => c.id === id)?.supplier?.supplier_id ?? null;
    });
    this.budgetChapterService.search({deleted: false}).subscribe({
      next: data => this.budgetChapterOptions = data.sort((a, b) => (a.chapter_code ?? '').localeCompare(b.chapter_code ?? '')),
      error: err => console.error('Errore nel caricamento dei Capitoli di Spesa:', err)
    });
  }
```

(rimuovere la vecchia doppia dichiarazione di `ngOnInit` — questo blocco la sostituisce interamente, `budgetChapterService`/`budgetChapterOptions` restano invariati dal codice esistente.)

- [ ] **Step 3: template**

In `frontend/src/app/pages/invoices/invoice-edit-dialog.component.html`, sostituire i due blocchi:

```html
    <div style="flex: 1 1 21%;">
      <app-filterable-select
        label="Utenza Associata *"
        placeholder="Cerca utenza..."
        [options]="utilityOptions"
        formControlName="utility_id_fk"
        [errorMessage]="form.controls.utility_id_fk.invalid && form.controls.utility_id_fk.touched ? 'Obbligatorio' : null">
      </app-filterable-select>
    </div>

    <div style="flex: 1 1 21%;">
      <app-filterable-select
        label="Fornitore"
        placeholder="Cerca fornitore..."
        [options]="supplierOptions"
        formControlName="supplier_id_fk">
      </app-filterable-select>
    </div>
```

con:

```html
    <div style="flex: 1 1 21%;">
      <app-filterable-select
        label="Contratto *"
        placeholder="Cerca contratto..."
        [options]="contractOptions"
        formControlName="contratto_id_fk"
        [errorMessage]="form.controls.contratto_id_fk.invalid && form.controls.contratto_id_fk.touched ? 'Obbligatorio' : null">
      </app-filterable-select>
    </div>

    <mat-form-field style="flex: 1 1 21%;">
      <mat-label>Fornitore</mat-label>
      <input matInput [value]="selectedContractSupplierLabel || 'N/D'" disabled>
    </mat-form-field>
```

- [ ] **Step 4: tabella fatture — colonne**

In `frontend/src/app/pages/invoices/data-table-invoices.component.ts`, sostituire in `allColumns`/`defaultVisibleFields`:

```typescript
    {field: 'utility.utility_id', header: 'Utenza (POD/PDR)', minWidth: '200px'},
    {field: 'supplier.supplier_id', header: 'Fornitore', minWidth: '150px'},
```

con:

```typescript
    {field: 'contratto.cig_contract', header: 'Contratto (CIG)', minWidth: '200px'},
    {field: 'contratto.supplier.supplier_id', header: 'Fornitore', minWidth: '150px'},
```

(stessa sostituzione nella `Set` di `defaultVisibleFields`).

In `data-table-invoices.component.html`, sostituire:

```html
    <ng-container matColumnDef="utility.utility_id">
      <th mat-header-cell *matHeaderCellDef mat-sort-header>Utenza (POD/PDR)</th>
      <td mat-cell *matCellDef="let item">{{ item.utility?.utility_id || 'N/D' }}</td>
    </ng-container>

    <ng-container matColumnDef="supplier.supplier_id">
      <th mat-header-cell *matHeaderCellDef mat-sort-header>Fornitore</th>
      <td mat-cell *matCellDef="let item">{{ item.supplier?.supplier_id || 'N/D' }}</td>
    </ng-container>
```

con:

```html
    <ng-container matColumnDef="contratto.cig_contract">
      <th mat-header-cell *matHeaderCellDef mat-sort-header>Contratto (CIG)</th>
      <td mat-cell *matCellDef="let item">{{ item.contratto?.cig_contract || ('#' + item.contratto?.id) || 'N/D' }}</td>
    </ng-container>

    <ng-container matColumnDef="contratto.supplier.supplier_id">
      <th mat-header-cell *matHeaderCellDef mat-sort-header>Fornitore</th>
      <td mat-cell *matCellDef="let item">{{ item.contratto?.supplier?.supplier_id || 'N/D' }}</td>
    </ng-container>
```

- [ ] **Step 5: filtro fatture e search**

In `invoice-filter-dialog.component.ts`, sostituire `utility_id_fk`/`supplier_id_fk` (interfaccia `InvoiceFilterValues` + FormGroup) con `contratto_id_fk: number | null`, rimuovendo il caricamento di `utilityOptions`/`supplierOptions` e sostituendolo con `contractOptions` (stesso pattern di caricamento del Task 12/14 Step 2, via `ContractsService`).

In `search-invoices.component.ts`, sostituire `utility_id_fk: [null], supplier_id_fk: [null],` con `contratto_id_fk: [null],`.

- [ ] **Step 6: build reale**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```

- [ ] **Step 7: verifica manuale**

Login, `/invoices`, "Aggiungi Fattura": verificare che il picker "Contratto" carichi le opzioni e che il campo "Fornitore" si popoli automaticamente in sola lettura alla selezione. Salvare e verificare in tabella le colonne "Contratto (CIG)"/"Fornitore".

- [ ] **Step 8: commit**

```bash
git add frontend/src/app/pages/invoices/
git commit -m "feat(contracts): InvoiceEditDialogComponent e tabella fatture usano Contratto

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019M1orgQo8m3LTWUcFy2mFd"
```

---

## Task 15: Verifica end-to-end e regressione

**Files:** nessuno (solo verifica)

- [ ] **Step 1: suite backend completa**

```bash
docker exec utenzepa-api-1 pnpm run test -- --maxWorkers=2
docker exec utenzepa-api-1 pnpm run build
```

- [ ] **Step 2: build frontend completa**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```

- [ ] **Step 3: verifica manuale in browser (login reale)**

- Dashboard: "contratti in scadenza" e navigazione da lì a `/utilities` con filtro data preselezionato — invariato.
- Dashboard: click sul contatore "salvaguardia" → `/utilities?safeguard=true` popolato correttamente.
- `/utilities`: filtro dialog con CIG/fornitore/date — risultati coerenti col contratto corrente.
- `/contracts`: creazione contratto multi-utenza, verifica che compaia nel dettaglio di ciascuna utenza selezionata.
- `/invoices`: creazione fattura da contratto, fornitore derivato corretto.
- Backup/importazione (`Impostazioni → Backup e Importazione`): un giro di import Access su un file di test (o verifica a codice, se non disponibile un file reale) conferma che vengano creati sia `Utility` sia `Contratto`+associazione.

- [ ] **Step 4: push branch e apertura PR**

```bash
git push -u origin feature/entita-contratto
gh pr create --title "feat: entità Contratto" --body "$(cat <<'EOF'
## Cosa cambia
Estrae i dati contrattuali da Utility in una nuova entità Contratto, che può coprire più utenze insieme e si storicizza tramite nuove righe (nessuna sovrascrittura in-place). Invoice si lega ora solo al Contratto.

Spec: docs/superpowers/specs/2026-09-04-entita-contratto-design.md
Piano: docs/superpowers/plans/2026-09-04-entita-contratto.md

## Migration
Migration temporanee (verranno squashate in una baseline futura, come da nota nel piano). Include backfill dati da utilities/invoices esistenti.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Attendere `gh pr checks --watch` per il verde CI (rif. nota progetto: non fidarsi della sola verifica locale Docker per il gate finale).

---
