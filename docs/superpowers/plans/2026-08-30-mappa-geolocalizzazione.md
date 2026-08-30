# Mappa geolocalizzazione immobili/contatori Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar page "Mappa" che geolocalizza immobili (asset) e contatori (utility), con geocoding automatico da indirizzo per chi non ha GPS, e una mini-mappa selezionabile nei dialog di modifica di asset/utility.

**Architecture:** Backend: nuove colonne `geocoded_*` su `Asset`, un `GeocodingModule` (Nominatim client + scan all'avvio + re-geocode su update indirizzo) e un `MapModule` (`GET /api/v1/map/points`) che calcola per ogni asset/utility la posizione effettiva (gps reale > geocoded > nessuna) con l'ereditarietà utility→asset. Frontend: Leaflet+OSM per la pagina mappa in sidebar (clustering, filtri, lista non-geolocalizzabili) e un componente riusabile `LocationMapComponent` per la selezione manuale nei due dialog di edit esistenti.

**Tech Stack:** NestJS 11 / TypeORM 1.x / MySQL (backend); Angular 22 standalone components / Leaflet 1.9 + leaflet.markercluster (frontend).

**Spec:** `docs/superpowers/specs/2026-08-30-mappa-geolocalizzazione-design.md`

## Global Constraints

- Tutti i comandi `pnpm`/build/jest vanno eseguiti dentro il container Docker (Node richiesto: backend ≥24, frontend Angular 22 richiede Node `^22.22.3 || ^24.15.0 || >=26.0.0`), mai sull'host locale.
- Comandi jest sempre con `--maxWorkers=2`.
- Nessuna nuova dipendenza HTTP lato backend: usare `fetch` nativo (Node ≥24) per chiamare Nominatim.
- Nominatim: header `User-Agent` custom obbligatorio, throttle 1.1s tra chiamate sequenziali, nessun retry automatico su fallimento.
- Migrazione TypeORM generata dentro il container con il comando standard da CLAUDE.md, mai scritta a mano.
- `ng build` reale obbligatoria a fine lavoro frontend (il solo `tsc --noEmit` non cattura errori di template type-checking, vedi CLAUDE.md).
- Conventional Commits per ogni commit (commitlint + husky attivi).
- Nessuna API key/servizio a pagamento: Nominatim (gratuito) e Leaflet+OSM (open source), coerente con l'assenza di dipendenze esterne a pagamento nel progetto.

---

### Task 1: Colonne `geocoded_*` su `Asset` + migrazione

**Files:**
- Modify: `backend/src/apis/asset/entity/asset.entity.ts`
- Create: `backend/src/database/migrations/<timestamp>-AddAssetGeocodedColumns.ts` (generata da CLI, non scritta a mano)
- Test: `backend/src/apis/asset/assets.service.spec.ts` (nessuna modifica di logica qui, solo verifica che l'entity compili — copre già `findAll`/`findOne`)

**Interfaces:**
- Produces: `Asset.geocoded_latitude: string | null`, `Asset.geocoded_longitude: string | null`, `Asset.geocoded_at: Date | null` — usati da `GeocodingService` (Task 2) e `MapService` (Task 5).

- [ ] **Step 1: Aggiungi le colonne all'entity**

In `backend/src/apis/asset/entity/asset.entity.ts`, subito dopo la colonna `longitude` esistente (righe 59-60):

```typescript
  @Column({ type: 'varchar', length: 20, nullable: true })
  geocoded_latitude: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  geocoded_longitude: string;

  @Column({ type: 'timestamp', nullable: true })
  geocoded_at: Date;
```

- [ ] **Step 2: Genera la migrazione dentro il container**

```bash
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate src/database/migrations/AddAssetGeocodedColumns -d src/database/data-source.ts
docker exec -u root utenzepa-api-1 chown -R 1000:1000 node_modules .pnpm-store src/database/migrations
```

Verifica che il file generato contenga solo `ADD COLUMN geocoded_latitude`, `geocoded_longitude`, `geocoded_at` su `assets` (nessuna altra modifica accidentale di schema).

- [ ] **Step 3: Riavvia il container e verifica la migration gira pulita**

```bash
docker restart utenzepa-api-1
docker logs utenzepa-api-1 --tail 50
```

Nessun errore di migration nei log; un secondo riavvio non deve rieseguirla (idempotente, pattern già verificato nel progetto).

- [ ] **Step 4: Esegui gli unit test esistenti per accertarti di non aver rotto nulla**

Run: `docker exec utenzepa-api-1 pnpm run test:unit -- --maxWorkers=2 -t AssetsService`
Expected: PASS (nessuna modifica di comportamento, solo nuove colonne nullable)

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/asset/entity/asset.entity.ts backend/src/database/migrations/
git commit -m "feat(asset): aggiunge colonne geocoded_latitude/longitude/at"
```

---

### Task 2: `GeocodingService` — client Nominatim + query building + throttle

**Files:**
- Create: `backend/src/apis/geocoding/geocoding.service.ts`
- Create: `backend/src/apis/geocoding/geocoding.service.spec.ts`

**Interfaces:**
- Consumes: `Asset` entity fields `address`, `civic_number`, `zip_code`, `municipality` (Task 1/esistenti).
- Produces:
  - `GeocodingService.buildQuery(asset: Pick<Asset, 'address' | 'civic_number' | 'zip_code' | 'municipality'>): string | null` — `null` se nessun campo indirizzo compilato.
  - `GeocodingService.geocode(query: string): Promise<{ lat: string; lon: string } | null>` — chiamata HTTP + throttle, `null` su errore/nessun match.
  - Usati da `GeocodingModule` (Task 3) e `AssetsService` (Task 4).

- [ ] **Step 1: Scrivi i test (falliscono, la classe non esiste ancora)**

```typescript
// backend/src/apis/geocoding/geocoding.service.spec.ts
import { GeocodingService } from './geocoding.service';

describe('GeocodingService', () => {
  let service: GeocodingService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new GeocodingService();
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  describe('buildQuery', () => {
    it('combina address, civic_number, zip_code, municipality', () => {
      const query = service.buildQuery({
        address: 'Via Roma',
        civic_number: '10',
        zip_code: '65015',
        municipality: 'Montesilvano',
      } as never);

      expect(query).toBe('Via Roma 10, 65015 Montesilvano');
    });

    it('ritorna null se nessun campo indirizzo è valorizzato', () => {
      const query = service.buildQuery({
        address: null,
        civic_number: null,
        zip_code: null,
        municipality: null,
      } as never);

      expect(query).toBeNull();
    });

    it('omette i campi mancanti senza lasciare separatori vuoti', () => {
      const query = service.buildQuery({
        address: 'Via Roma',
        civic_number: null,
        zip_code: null,
        municipality: 'Montesilvano',
      } as never);

      expect(query).toBe('Via Roma, Montesilvano');
    });
  });

  describe('geocode', () => {
    it('ritorna lat/lon dal primo risultato Nominatim', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [{ lat: '42.5083', lon: '14.1500' }],
      });

      const result = await service.geocode('Via Roma 10, Montesilvano');

      expect(result).toEqual({ lat: '42.5083', lon: '14.1500' });
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain('nominatim.openstreetmap.org/search');
      expect(url).toContain(encodeURIComponent('Via Roma 10, Montesilvano'));
      expect(options.headers['User-Agent']).toContain('UtenzePA');
    });

    it('ritorna null se Nominatim non trova nulla', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

      const result = await service.geocode('indirizzo inesistente');

      expect(result).toBeNull();
    });

    it('ritorna null se la chiamata HTTP fallisce', async () => {
      fetchMock.mockRejectedValue(new Error('network error'));

      const result = await service.geocode('Via Roma 10');

      expect(result).toBeNull();
    });

    it('ritorna null se la risposta HTTP non è ok', async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => [] });

      const result = await service.geocode('Via Roma 10');

      expect(result).toBeNull();
    });
  });

  describe('throttle', () => {
    it('aspetta almeno 1.1s tra due chiamate consecutive', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => [{ lat: '1', lon: '1' }] });
      const start = Date.now();

      await service.geocode('indirizzo 1');
      await service.geocode('indirizzo 2');

      expect(Date.now() - start).toBeGreaterThanOrEqual(1100);
    });
  });
});
```

- [ ] **Step 2: Run test per verificarne il fallimento**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/geocoding/geocoding.service.spec.ts --maxWorkers=2`
Expected: FAIL — `Cannot find module './geocoding.service'`

- [ ] **Step 3: Implementa `GeocodingService`**

```typescript
// backend/src/apis/geocoding/geocoding.service.ts
import { Injectable, Logger } from '@nestjs/common';

interface AddressLike {
  address: string | null;
  civic_number: string | null;
  zip_code: string | null;
  municipality: string | null;
}

interface GeocodeResult {
  lat: string;
  lon: string;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'UtenzePA/1.0 (Comune di Montesilvano; gestionale patrimonio interno)';
const MIN_DELAY_MS = 1100;

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private lastCallAt = 0;

  buildQuery(asset: AddressLike): string | null {
    const streetPart = [asset.address, asset.civic_number].filter(Boolean).join(' ');
    const cityPart = [asset.zip_code, asset.municipality].filter(Boolean).join(' ');
    const parts = [streetPart, cityPart].filter((part) => part.trim().length > 0);

    if (parts.length === 0) return null;
    return parts.join(', ');
  }

  async geocode(query: string): Promise<GeocodeResult | null> {
    await this.throttle();

    try {
      const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (!response.ok) {
        this.logger.warn(`Nominatim ha risposto ${response.status} per "${query}"`);
        return null;
      }

      const results = (await response.json()) as Array<{ lat: string; lon: string }>;
      if (results.length === 0) {
        return null;
      }

      return { lat: results[0].lat, lon: results[0].lon };
    } catch (error) {
      this.logger.warn(`Geocoding fallito per "${query}": ${error?.message ?? error}`);
      return null;
    }
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastCallAt;
    if (elapsed < MIN_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
    }
    this.lastCallAt = Date.now();
  }
}
```

- [ ] **Step 4: Run test per verificarne il successo**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/geocoding/geocoding.service.spec.ts --maxWorkers=2`
Expected: PASS (il test del throttle impiega ~1.1s, normale)

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/geocoding/geocoding.service.ts backend/src/apis/geocoding/geocoding.service.spec.ts
git commit -m "feat(geocoding): aggiunge GeocodingService (client Nominatim)"
```

---

### Task 3: `GeocodingModule` — scan all'avvio + wiring

**Files:**
- Create: `backend/src/apis/geocoding/geocoding.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `GeocodingService.buildQuery`/`geocode` (Task 2), `Asset` repo (Task 1).
- Produces: `GeocodingModule` esporta `GeocodingService` (usato da `AssetsModule` nel Task 4).

- [ ] **Step 1: Scrivi `GeocodingModule` con lo scan all'avvio**

```typescript
// backend/src/apis/geocoding/geocoding.module.ts
import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { GeocodingService } from './geocoding.service';

@Module({
  imports: [TypeOrmModule.forFeature([Asset])],
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeocodingModule implements OnModuleInit {
  private readonly logger = new Logger(GeocodingModule.name);

  constructor(
    @InjectRepository(Asset) private readonly assetRepo: Repository<Asset>,
    private readonly geocodingService: GeocodingService,
  ) {}

  onModuleInit(): void {
    // Non await: lo scan gira in background e non deve ritardare il boot.
    this.runStartupScan().catch((error) =>
      this.logger.error(`Scan geocoding all'avvio fallito: ${error?.message ?? error}`),
    );
  }

  private async runStartupScan(): Promise<void> {
    const pending = await this.assetRepo.find({
      where: {
        latitude: IsNull(),
        geocoded_latitude: IsNull(),
        address: Not(IsNull()),
        deleted: false,
      },
    });

    if (pending.length === 0) {
      this.logger.log('Scan geocoding all\'avvio: nessun asset da geocodificare.');
      return;
    }

    this.logger.log(`Scan geocoding all'avvio: ${pending.length} asset da elaborare.`);
    let succeeded = 0;
    let failed = 0;

    for (const asset of pending) {
      const query = this.geocodingService.buildQuery(asset);
      if (!query) continue;

      const result = await this.geocodingService.geocode(query);
      if (result) {
        asset.geocoded_latitude = result.lat;
        asset.geocoded_longitude = result.lon;
        asset.geocoded_at = new Date();
        await this.assetRepo.save(asset);
        succeeded++;
      } else {
        failed++;
      }
    }

    this.logger.log(`Scan geocoding all'avvio completato: ${succeeded} ok, ${failed} falliti.`);
  }
}
```

- [ ] **Step 2: Registra il modulo in `AppModule`**

In `backend/src/app.module.ts`, aggiungi l'import:

```typescript
import { GeocodingModule } from '@apis/geocoding/geocoding.module';
```

e aggiungi `GeocodingModule,` all'array `imports` (subito dopo `AssetsModule,`).

- [ ] **Step 3: Verifica manuale con Docker (avvio reale)**

```bash
docker compose restart api
docker compose logs api --tail 80 -f
```

Attendi il log `Scan geocoding all'avvio: N asset da elaborare.` seguito da `Scan geocoding all'avvio completato: ...` (o `nessun asset da geocodificare` se il DB di dev non ha asset con indirizzo senza gps). Verifica anche con una query diretta:

```bash
docker exec utenzepa-mysql-1 mysql -uroot -p'<MYSQL_PASSWORD>' mydatabase -e "SELECT id, address, geocoded_latitude, geocoded_longitude, geocoded_at FROM assets WHERE geocoded_at IS NOT NULL LIMIT 5;"
```

- [ ] **Step 4: Run build per accertarti che il modulo compili nel grafo Nest**

Run: `docker exec utenzepa-api-1 pnpm run build`
Expected: build pulita, nessun errore di dependency injection

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/geocoding/geocoding.module.ts backend/src/app.module.ts
git commit -m "feat(geocoding): scan geocoding automatico all'avvio dell'app"
```

---

### Task 4: `AssetsService` — reset e re-geocode su update indirizzo

**Files:**
- Modify: `backend/src/apis/asset/assets.service.ts`
- Modify: `backend/src/apis/asset/assets.module.ts`
- Modify: `backend/src/apis/asset/assets.service.spec.ts`

**Interfaces:**
- Consumes: `GeocodingService.buildQuery`/`geocode` (Task 2, esportato da `GeocodingModule`).
- Produces: `AssetsService.update(id, dto, userId)` con lo stesso signature di prima (override di `BaseService.update`), nessun cambio visibile ai chiamanti (`AssetsController`, Task 4 non tocca il controller).

- [ ] **Step 1: Scrivi i test per il nuovo comportamento (falliscono, override non esiste ancora)**

Aggiungi in `backend/src/apis/asset/assets.service.spec.ts`, dentro il `describe('AssetsService', ...)` esistente:

```typescript
describe('update', () => {
  let geocodingService: { buildQuery: jest.Mock; geocode: jest.Mock };

  beforeEach(() => {
    geocodingService = {
      buildQuery: jest.fn().mockReturnValue('Via Roma 1, Montesilvano'),
      geocode: jest.fn().mockResolvedValue({ lat: '42.5', lon: '14.1' }),
    };
    (repo as any).findOne = jest.fn().mockResolvedValue({ id: 1, address: 'Via Roma 1' } as Asset);
    (repo as any).save = jest.fn().mockResolvedValue(undefined);
    (repo as any).update = jest.fn().mockResolvedValue(undefined);
    qb.getOne.mockResolvedValue({ id: 1, address: 'Via Vecchia 2' } as Asset);
    service = new AssetsService(repo as never, geocodingService as never);
  });

  it('azzera i campi geocoded e rilancia il geocoding se cambia l\'indirizzo senza gps manuale', async () => {
    await service.update(1, { address: 'Via Nuova 5' } as never);

    const savedEntity = (repo.save as jest.Mock).mock.calls[0][0];
    expect(savedEntity.geocoded_latitude).toBeNull();
    expect(savedEntity.geocoded_longitude).toBeNull();
    expect(savedEntity.geocoded_at).toBeNull();
    expect(geocodingService.geocode).toHaveBeenCalledWith('Via Roma 1, Montesilvano');
  });

  it('non tocca i campi geocoded se viene fornito un gps manuale insieme al nuovo indirizzo', async () => {
    await service.update(1, { address: 'Via Nuova 5', latitude: '42.1', longitude: '14.2' } as never);

    const savedEntity = (repo.save as jest.Mock).mock.calls[0][0];
    expect(savedEntity.geocoded_latitude).toBeUndefined();
    expect(geocodingService.geocode).not.toHaveBeenCalled();
  });

  it('non rilancia il geocoding se l\'indirizzo non cambia', async () => {
    await service.update(1, { ownership: 1 } as never);

    expect(geocodingService.geocode).not.toHaveBeenCalled();
  });

  it('non fa fallire il save se il geocoding va in errore', async () => {
    geocodingService.geocode.mockRejectedValue(new Error('nominatim down'));

    await expect(service.update(1, { address: 'Via Nuova 5' } as never)).resolves.toBeDefined();
  });
});
```

Nota: il costruttore di `AssetsService` cambia firma (aggiunge `GeocodingService`) — questo test guida anche quella modifica.

- [ ] **Step 2: Run test per verificarne il fallimento**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/asset/assets.service.spec.ts --maxWorkers=2`
Expected: FAIL — `AssetsService` non accetta un secondo argomento / `update` non azzera i campi

- [ ] **Step 3: Implementa l'override in `AssetsService`**

In `backend/src/apis/asset/assets.service.ts`, aggiungi l'import e modifica costruttore + aggiungi `update`:

```typescript
import { GeocodingService } from '@apis/geocoding/geocoding.service';

const ADDRESS_FIELDS = ['toponym', 'address', 'civic_number', 'zip_code', 'municipality'] as const;

@Injectable()
export class AssetsService extends BaseService<Asset, CreateAssetDto, UpdateAssetDto> {
  protected readonly entityName = 'assets';
  protected readonly relations = ['assetAggregator', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(Asset)
    protected readonly repo: Repository<Asset>,
    private readonly geocodingService: GeocodingService,
  ) {
    super();
  }

  async update(id: number, updateDto: UpdateAssetDto, userId?: number): Promise<Asset> {
    const addressChanged = ADDRESS_FIELDS.some((field) => field in updateDto);
    const manualCoordsProvided = updateDto.latitude !== undefined || updateDto.longitude !== undefined;
    const shouldRegeocode = addressChanged && !manualCoordsProvided;

    const payload: UpdateAssetDto & {
      geocoded_latitude?: string | null;
      geocoded_longitude?: string | null;
      geocoded_at?: Date | null;
    } = { ...updateDto };

    if (shouldRegeocode) {
      payload.geocoded_latitude = null;
      payload.geocoded_longitude = null;
      payload.geocoded_at = null;
    }

    const result = await super.update(id, payload as UpdateAssetDto, userId);

    if (shouldRegeocode) {
      await this.regeocode(result).catch(() => undefined);
    }

    return result;
  }

  private async regeocode(asset: Asset): Promise<void> {
    const query = this.geocodingService.buildQuery(asset);
    if (!query) return;

    const geocoded = await this.geocodingService.geocode(query);
    if (!geocoded) return;

    await this.repo.update(asset.id, {
      geocoded_latitude: geocoded.lat,
      geocoded_longitude: geocoded.lon,
      geocoded_at: new Date(),
    } as never);
  }

  // ... resto della classe invariato (findAll, findOne)
```

- [ ] **Step 4: Wiring: importa `GeocodingModule` in `AssetsModule`**

```typescript
// backend/src/apis/asset/assets.module.ts
import { GeocodingModule } from '@apis/geocoding/geocoding.module';

@Module({
  imports: [TypeOrmModule.forFeature([Asset]), GeocodingModule],
  providers: [AssetsService],
  controllers: [AssetsController],
  exports: [AssetsService],
})
export class AssetsModule {}
```

- [ ] **Step 5: Run test per verificarne il successo**

Run: `docker exec utenzepa-api-1 pnpm run test:unit -- --maxWorkers=2 -t AssetsService`
Expected: PASS

- [ ] **Step 6: Run build completa (verifica DI graph: `AssetsModule` importa `GeocodingModule`, entrambi in `AppModule`)**

Run: `docker exec utenzepa-api-1 pnpm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/apis/asset/assets.service.ts backend/src/apis/asset/assets.module.ts backend/src/apis/asset/assets.service.spec.ts
git commit -m "feat(asset): re-geocode automatico su modifica indirizzo"
```

---

### Task 5: `MapModule` — endpoint `GET /api/v1/map/points`

**Files:**
- Create: `backend/src/apis/map/map.module.ts`
- Create: `backend/src/apis/map/map.service.ts`
- Create: `backend/src/apis/map/map.controller.ts`
- Create: `backend/src/apis/map/dto/map-query.dto.ts`
- Create: `backend/src/apis/map/map.service.spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `Asset` (Task 1), `Utility` entity esistente.
- Produces:
  - `MapService.getPoints(filters: MapQueryDto): Promise<{ points: MapPoint[]; ungeolocated: UngeolocatedItem[] }>`
  - `MapPoint = { id: number; type: 'asset' | 'utility'; name: string; address: string | null; lat: string; lng: string; source: 'gps' | 'geocoded' }`
  - `UngeolocatedItem = { id: number; type: 'asset' | 'utility'; name: string; reason: 'no_address' | 'geocode_failed' }`
  - Consumati dal frontend `MapService` (Task 6).

- [ ] **Step 1: DTO filtri**

```typescript
// backend/src/apis/map/dto/map-query.dto.ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';

export class MapQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === undefined ? undefined : value === true || value === 'true')
  showAssets?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === undefined ? undefined : value === true || value === 'true')
  showUtilities?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsInt()
  assetAggregatorId?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsInt()
  utilityTypeId?: number;
}
```

- [ ] **Step 2: Scrivi i test per `MapService` (falliscono, la classe non esiste)**

```typescript
// backend/src/apis/map/map.service.spec.ts
import { MapService } from './map.service';

describe('MapService', () => {
  let service: MapService;
  let assetRepo: { find: jest.Mock };
  let utilityRepo: { find: jest.Mock };

  beforeEach(() => {
    assetRepo = { find: jest.fn() };
    utilityRepo = { find: jest.fn() };
    service = new MapService(assetRepo as never, utilityRepo as never);
  });

  it('un asset con gps reale produce un punto source=gps', async () => {
    assetRepo.find.mockResolvedValue([
      { id: 1, asset_name: 'Scuola A', address: 'Via Roma 1', latitude: '42.5', longitude: '14.1', geocoded_latitude: null, geocoded_longitude: null, asset_type_id: 3 },
    ]);
    utilityRepo.find.mockResolvedValue([]);

    const { points, ungeolocated } = await service.getPoints({});

    expect(points).toEqual([
      { id: 1, type: 'asset', name: 'Scuola A', address: 'Via Roma 1', lat: '42.5', lng: '14.1', source: 'gps' },
    ]);
    expect(ungeolocated).toEqual([]);
  });

  it('un asset senza gps ma con geocoded produce un punto source=geocoded', async () => {
    assetRepo.find.mockResolvedValue([
      { id: 2, asset_name: 'Scuola B', address: 'Via Milano 2', latitude: null, longitude: null, geocoded_latitude: '42.6', geocoded_longitude: '14.2', asset_type_id: 3 },
    ]);
    utilityRepo.find.mockResolvedValue([]);

    const { points } = await service.getPoints({});

    expect(points[0].source).toBe('geocoded');
    expect(points[0].lat).toBe('42.6');
  });

  it('un asset senza indirizzo né gps finisce in ungeolocated con reason no_address', async () => {
    assetRepo.find.mockResolvedValue([
      { id: 3, asset_name: 'Scuola C', address: null, latitude: null, longitude: null, geocoded_latitude: null, geocoded_longitude: null, asset_type_id: 3 },
    ]);
    utilityRepo.find.mockResolvedValue([]);

    const { points, ungeolocated } = await service.getPoints({});

    expect(points).toEqual([]);
    expect(ungeolocated).toEqual([{ id: 3, type: 'asset', name: 'Scuola C', reason: 'no_address' }]);
  });

  it('un asset con indirizzo ma geocoding fallito finisce in ungeolocated con reason geocode_failed', async () => {
    assetRepo.find.mockResolvedValue([
      { id: 4, asset_name: 'Scuola D', address: 'Via Ignota 9', latitude: null, longitude: null, geocoded_latitude: null, geocoded_longitude: null, asset_type_id: 3 },
    ]);
    utilityRepo.find.mockResolvedValue([]);

    const { ungeolocated } = await service.getPoints({});

    expect(ungeolocated).toEqual([{ id: 4, type: 'asset', name: 'Scuola D', reason: 'geocode_failed' }]);
  });

  it('una utility con gps proprio produce un punto indipendente', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 10, utility_id: 'UT-1', latitude: '42.9', longitude: '14.9', asset: { id: 1, asset_name: 'Scuola A', latitude: null, longitude: null, geocoded_latitude: null, geocoded_longitude: null } },
    ]);

    const { points } = await service.getPoints({});

    expect(points).toEqual([
      { id: 10, type: 'utility', name: 'UT-1', address: null, lat: '42.9', lng: '14.9', source: 'gps' },
    ]);
  });

  it('una utility senza gps eredita la posizione (reale) dell\'asset collegato', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 11, utility_id: 'UT-2', latitude: null, longitude: null, asset: { id: 1, asset_name: 'Scuola A', address: 'Via Roma 1', latitude: '42.5', longitude: '14.1', geocoded_latitude: null, geocoded_longitude: null } },
    ]);

    const { points } = await service.getPoints({});

    expect(points).toEqual([
      { id: 11, type: 'utility', name: 'UT-2', address: 'Via Roma 1', lat: '42.5', lng: '14.1', source: 'gps' },
    ]);
  });

  it('una utility senza gps il cui asset non ha posizione finisce in ungeolocated ereditando la reason', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 12, utility_id: 'UT-3', latitude: null, longitude: null, asset: { id: 1, asset_name: 'Scuola A', address: null, latitude: null, longitude: null, geocoded_latitude: null, geocoded_longitude: null } },
    ]);

    const { points, ungeolocated } = await service.getPoints({});

    expect(points).toEqual([]);
    expect(ungeolocated).toEqual([{ id: 12, type: 'utility', name: 'UT-3', reason: 'no_address' }]);
  });

  it('showAssets=false esclude gli asset dai risultati', async () => {
    assetRepo.find.mockResolvedValue([
      { id: 1, asset_name: 'Scuola A', address: 'Via Roma 1', latitude: '42.5', longitude: '14.1', geocoded_latitude: null, geocoded_longitude: null, asset_type_id: 3 },
    ]);
    utilityRepo.find.mockResolvedValue([]);

    const { points } = await service.getPoints({ showAssets: false });

    expect(assetRepo.find).not.toHaveBeenCalled();
    expect(points).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test per verificarne il fallimento**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/map/map.service.spec.ts --maxWorkers=2`
Expected: FAIL — `Cannot find module './map.service'`

- [ ] **Step 4: Implementa `MapService`**

```typescript
// backend/src/apis/map/map.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { MapQueryDto } from './dto/map-query.dto';

export interface MapPoint {
  id: number;
  type: 'asset' | 'utility';
  name: string;
  address: string | null;
  lat: string;
  lng: string;
  source: 'gps' | 'geocoded';
}

export interface UngeolocatedItem {
  id: number;
  type: 'asset' | 'utility';
  name: string;
  reason: 'no_address' | 'geocode_failed';
}

interface Position {
  lat: string;
  lng: string;
  source: 'gps' | 'geocoded';
}

const isSet = (v: string | null | undefined): v is string => v != null && v.trim() !== '';

@Injectable()
export class MapService {
  constructor(
    @InjectRepository(Asset) private readonly assetRepo: Repository<Asset>,
    @InjectRepository(Utility) private readonly utilityRepo: Repository<Utility>,
  ) {}

  async getPoints(filters: MapQueryDto): Promise<{ points: MapPoint[]; ungeolocated: UngeolocatedItem[] }> {
    const showAssets = filters.showAssets !== false;
    const showUtilities = filters.showUtilities !== false;

    const points: MapPoint[] = [];
    const ungeolocated: UngeolocatedItem[] = [];

    if (showAssets) {
      const assets = await this.assetRepo.find({
        where: { deleted: false, ...(filters.assetAggregatorId ? { asset_type_id: filters.assetAggregatorId } : {}) },
      });

      for (const asset of assets) {
        const position = this.resolveAssetPosition(asset);
        if (position) {
          points.push({
            id: asset.id,
            type: 'asset',
            name: asset.asset_name,
            address: asset.address ?? null,
            lat: position.lat,
            lng: position.lng,
            source: position.source,
          });
        } else {
          ungeolocated.push({
            id: asset.id,
            type: 'asset',
            name: asset.asset_name,
            reason: isSet(asset.address) ? 'geocode_failed' : 'no_address',
          });
        }
      }
    }

    if (showUtilities) {
      const utilities = await this.utilityRepo.find({
        where: {
          deleted: false,
          ...(filters.utilityTypeId ? { utility_type_id_fk: filters.utilityTypeId } : {}),
        },
        relations: { asset: true },
      });

      for (const utility of utilities) {
        const position = this.resolveUtilityPosition(utility);
        if (position) {
          points.push({
            id: utility.id,
            type: 'utility',
            name: utility.utility_id,
            address: utility.asset?.address ?? null,
            lat: position.lat,
            lng: position.lng,
            source: position.source,
          });
        } else {
          ungeolocated.push({
            id: utility.id,
            type: 'utility',
            name: utility.utility_id,
            reason: isSet(utility.asset?.address) ? 'geocode_failed' : 'no_address',
          });
        }
      }
    }

    return { points, ungeolocated };
  }

  private resolveAssetPosition(asset: Asset): Position | null {
    if (isSet(asset.latitude) && isSet(asset.longitude)) {
      return { lat: asset.latitude, lng: asset.longitude, source: 'gps' };
    }
    if (isSet(asset.geocoded_latitude) && isSet(asset.geocoded_longitude)) {
      return { lat: asset.geocoded_latitude, lng: asset.geocoded_longitude, source: 'geocoded' };
    }
    return null;
  }

  private resolveUtilityPosition(utility: Utility): Position | null {
    if (isSet(utility.latitude) && isSet(utility.longitude)) {
      return { lat: utility.latitude, lng: utility.longitude, source: 'gps' };
    }
    return utility.asset ? this.resolveAssetPosition(utility.asset) : null;
  }
}
```

- [ ] **Step 5: Run test per verificarne il successo**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/map/map.service.spec.ts --maxWorkers=2`
Expected: PASS

- [ ] **Step 6: Controller + Module**

```typescript
// backend/src/apis/map/map.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { MapService } from './map.service';
import { MapQueryDto } from './dto/map-query.dto';

@Controller('map')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MapController {
  constructor(private readonly service: MapService) {}

  @Get('points')
  getPoints(@Query() filters: MapQueryDto) {
    return this.service.getPoints(filters);
  }
}
```

```typescript
// backend/src/apis/map/map.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { MapService } from './map.service';
import { MapController } from './map.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, Utility])],
  providers: [MapService],
  controllers: [MapController],
})
export class MapModule {}
```

- [ ] **Step 7: Wiring in `AppModule`**

In `backend/src/app.module.ts`: aggiungi `import { MapModule } from '@apis/map/map.module';` e `MapModule,` nell'array `imports` (dopo `GeocodingModule,`).

- [ ] **Step 8: Run build + test completi**

Run: `docker exec utenzepa-api-1 pnpm run build`
Run: `docker exec utenzepa-api-1 pnpm run test:unit -- --maxWorkers=2`
Expected: entrambi PASS

- [ ] **Step 9: Verifica manuale endpoint**

```bash
docker exec utenzepa-api-1 curl -s -H "Authorization: Bearer <token>" "http://localhost:3000/api/v1/map/points" | head -c 500
```

(un token valido si ottiene da un login reale via `/api/v1/auth/login` nell'ambiente dev)

- [ ] **Step 10: Commit**

```bash
git add backend/src/apis/map backend/src/app.module.ts
git commit -m "feat(map): endpoint GET /map/points con fallback gps/geocoded/eredita-da-asset"
```

---

### Task 6: Frontend — pagina Mappa in sidebar (Leaflet + clustering + filtri)

**Files:**
- Modify: `frontend/package.json` (dipendenze)
- Modify: `frontend/src/app/comp/sidebar/sidebar.component.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Create: `frontend/src/app/pages/map/map-point.entity.ts`
- Create: `frontend/src/app/pages/map/map.service.ts`
- Create: `frontend/src/app/pages/map/map.component.ts`
- Create: `frontend/src/app/pages/map/map.component.html`
- Create: `frontend/src/app/pages/map/map.component.scss`

**Interfaces:**
- Consumes: `GET /api/v1/map/points` (Task 5) → `{ points: MapPoint[]; ungeolocated: UngeolocatedItem[] }`.
- Consumes: `AssetEditDialogComponent`/`UtilityEditDialogComponent` (esistenti) per l'apertura al click su un pin, stesso pattern di apertura usato nelle tabelle esistenti (`MatDialog.open(...)`, vedi `data-table-assets.component.ts`/`data-table-utilities.component.ts`).
- Produces: route `/map`, voce sidebar "Mappa".

- [ ] **Step 1: Installa le dipendenze Leaflet dentro il container**

```bash
docker exec utenzepa-frontend-1 pnpm add leaflet@^1.9.4 leaflet.markercluster@^1.5.3
docker exec utenzepa-frontend-1 pnpm add -D @types/leaflet@^1.9.12 @types/leaflet.markercluster@^1.5.4
docker exec -u root utenzepa-frontend-1 chown -R 1000:1000 node_modules package.json pnpm-lock.yaml
```

Verifica in `frontend/package.json` che le 4 righe siano state aggiunte (2 in `dependencies`, 2 in `devDependencies`).

- [ ] **Step 2: Entity dei punti mappa**

```typescript
// frontend/src/app/pages/map/map-point.entity.ts
export type MapPointType = 'asset' | 'utility';
export type MapPointSource = 'gps' | 'geocoded';
export type UngeolocatedReason = 'no_address' | 'geocode_failed';

export interface MapPoint {
  id: number;
  type: MapPointType;
  name: string;
  address: string | null;
  lat: string;
  lng: string;
  source: MapPointSource;
}

export interface UngeolocatedItem {
  id: number;
  type: MapPointType;
  name: string;
  reason: UngeolocatedReason;
}

export interface MapPointsResponse {
  points: MapPoint[];
  ungeolocated: UngeolocatedItem[];
}

export const UNGEOLOCATED_REASON_LABELS: Record<UngeolocatedReason, string> = {
  no_address: 'Nessun indirizzo inserito',
  geocode_failed: 'Indirizzo non geolocalizzabile',
};
```

- [ ] **Step 3: Service frontend**

```typescript
// frontend/src/app/pages/map/map.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { MapPointsResponse } from './map-point.entity';

export interface MapPointsFilters {
  showAssets?: boolean;
  showUtilities?: boolean;
  assetAggregatorId?: number | null;
  utilityTypeId?: number | null;
}

@Injectable({ providedIn: 'root' })
export class MapService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly BASE_URL = environment.apiUrl + '/map';

  getPoints(filters: MapPointsFilters): Observable<MapPointsResponse> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    });

    const headers = new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken() || ''}` });
    return this.http.get<MapPointsResponse>(`${this.BASE_URL}/points`, { headers, params });
  }
}
```

- [ ] **Step 4: Componente mappa**

```typescript
// frontend/src/app/pages/map/map.component.ts
import { Component, OnInit, AfterViewInit, OnDestroy, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { MapService } from './map.service';
import { MapPoint, UngeolocatedItem, UNGEOLOCATED_REASON_LABELS } from './map-point.entity';
import { FilterableSelectComponent } from '../../core/components/filterable-select.component';
import { AssetAggregatorsService } from '../asset-aggregator/asset-aggregator.service';
import { UtilityTypesService } from '../utility-types/utility-types.service';
import { AssetService } from '../assets/asset.service';
import { UtilityService } from '../utilities/utility.service';
import { AssetEditDialogComponent } from '../assets/asset-edit-dialog.component';
import { UtilityEditDialogComponent } from '../utilities/utility-edit-dialog.component';
import { TOption } from '../../core/types/option.interface';

const ICON_COLORS: Record<MapPoint['source'], string> = {
  gps: '#1565c0',
  geocoded: '#ef6c00',
};

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatCheckboxModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  private mapService = inject(MapService);
  private dialog = inject(MatDialog);
  private assetAggregatorsService = inject(AssetAggregatorsService);
  private utilityTypesService = inject(UtilityTypesService);
  private assetService = inject(AssetService);
  private utilityService = inject(UtilityService);

  private map: L.Map | null = null;
  private clusterGroup: L.MarkerClusterGroup | null = null;

  showAssets = new FormControl(true, { nonNullable: true });
  showUtilities = new FormControl(true, { nonNullable: true });
  assetAggregatorId = new FormControl<number | null>(null);
  utilityTypeId = new FormControl<number | null>(null);

  assetAggregatorOptions: TOption[] = [];
  utilityTypeOptions: TOption[] = [];
  ungeolocated: UngeolocatedItem[] = [];
  reasonLabels = UNGEOLOCATED_REASON_LABELS;

  ngOnInit(): void {
    this.assetAggregatorsService.search({ deleted: false }).subscribe({
      next: (data) => (this.assetAggregatorOptions = data.map((a) => ({ label: a.code, value: a.id }))),
    });
    this.utilityTypesService.search({ deleted: false }).subscribe({
      next: (data) => (this.utilityTypeOptions = data.map((t) => ({ label: t.name, value: t.id }))),
    });

    [this.showAssets, this.showUtilities, this.assetAggregatorId, this.utilityTypeId].forEach((control) =>
      control.valueChanges.subscribe(() => this.reload()),
    );
  }

  ngAfterViewInit(): void {
    this.map = L.map('map-canvas').setView([42.5083, 14.15], 13); // Montesilvano
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);
    this.clusterGroup = L.markerClusterGroup();
    this.map.addLayer(this.clusterGroup);
    this.reload();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private reload(): void {
    this.mapService
      .getPoints({
        showAssets: this.showAssets.value,
        showUtilities: this.showUtilities.value,
        assetAggregatorId: this.assetAggregatorId.value,
        utilityTypeId: this.utilityTypeId.value,
      })
      .subscribe({
        next: (response) => {
          this.renderPoints(response.points);
          this.ungeolocated = response.ungeolocated;
        },
        error: (err) => console.error('Errore nel caricamento dei punti mappa:', err),
      });
  }

  private renderPoints(points: MapPoint[]): void {
    if (!this.clusterGroup) return;
    this.clusterGroup.clearLayers();

    for (const point of points) {
      const lat = parseFloat(point.lat);
      const lng = parseFloat(point.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

      const icon = L.divIcon({
        className: '',
        html: `<span class="map-pin map-pin--${point.type}" style="background:${ICON_COLORS[point.source]}"></span>`,
        iconSize: [24, 24],
      });

      const marker = L.marker([lat, lng], { icon });
      marker.on('click', () => this.openDetail(point));
      this.clusterGroup.addLayer(marker);
    }
  }

  openDetail(point: MapPoint | UngeolocatedItem): void {
    if (point.type === 'asset') {
      this.assetService.getById(point.id).subscribe((asset) => {
        this.dialog.open(AssetEditDialogComponent, {
          width: '900px',
          maxWidth: '900px',
          data: { item: asset, mode: 'edit' },
        });
      });
    } else {
      this.utilityService.getById(point.id).subscribe((utility) => {
        this.dialog.open(UtilityEditDialogComponent, {
          width: '900px',
          maxWidth: '900px',
          data: { item: utility, mode: 'edit' },
        });
      });
    }
  }
}
```

- [ ] **Step 5: Template**

```html
<!-- frontend/src/app/pages/map/map.component.html -->
<div class="map-page">
  <aside class="map-sidebar">
    <h3>Filtri</h3>
    <mat-checkbox [formControl]="showAssets">Immobili</mat-checkbox>
    <mat-checkbox [formControl]="showUtilities">Contatori</mat-checkbox>

    <app-filterable-select
      label="Aggregato immobile"
      [options]="assetAggregatorOptions"
      [formControl]="assetAggregatorId">
    </app-filterable-select>

    <app-filterable-select
      label="Tipo utenza"
      [options]="utilityTypeOptions"
      [formControl]="utilityTypeId">
    </app-filterable-select>

    <div class="map-legend">
      <div><span class="map-pin map-pin--asset" style="background:#1565c0"></span> Immobile — GPS reale</div>
      <div><span class="map-pin map-pin--asset" style="background:#ef6c00"></span> Immobile — stimato</div>
      <div><span class="map-pin map-pin--utility" style="background:#1565c0"></span> Contatore — GPS reale</div>
      <div><span class="map-pin map-pin--utility" style="background:#ef6c00"></span> Contatore — stimato</div>
    </div>

    @if (ungeolocated.length > 0) {
      <h3>Non geolocalizzabili ({{ ungeolocated.length }})</h3>
      <ul class="map-ungeolocated-list">
        @for (item of ungeolocated; track item.id + item.type) {
          <li (click)="openDetail(item)">
            {{ item.name }}
            <span class="map-reason">{{ reasonLabels[item.reason] }}</span>
          </li>
        }
      </ul>
    }
  </aside>

  <div id="map-canvas" class="map-canvas"></div>
</div>
```

- [ ] **Step 6: Stili**

```scss
// frontend/src/app/pages/map/map.component.scss
.map-page {
  display: flex;
  height: calc(100vh - 64px);
}

.map-sidebar {
  width: 280px;
  padding: 1rem;
  overflow-y: auto;
  border-right: 1px solid #e5e7eb;
}

.map-canvas {
  flex: 1;
}

.map-pin {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
}

.map-pin--utility {
  border-radius: 3px;
}

.map-legend {
  margin-top: 1rem;
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.map-ungeolocated-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.85rem;

  li {
    cursor: pointer;
    padding: 0.4rem 0;
    border-bottom: 1px solid #f0f0f0;

    &:hover {
      background: #f7f7f7;
    }
  }

  .map-reason {
    display: block;
    color: #9e9e9e;
    font-size: 0.75rem;
  }
}
```

- [ ] **Step 7: Route + voce sidebar**

In `frontend/src/app/app.routes.ts`, aggiungi l'import `import {MapComponent} from "./pages/map/map.component";` e la rotta, subito dopo `{path: 'dashboard', component: DashboardComponent},`:

```typescript
{path: 'map', component: MapComponent},
```

In `frontend/src/app/comp/sidebar/sidebar.component.ts`, aggiungi la voce subito dopo `Dashboard`:

```typescript
{label: 'Mappa', icon: 'map', route: '/map'},
```

- [ ] **Step 8: Import CSS Leaflet globale**

In `frontend/angular.json`, nell'array `styles` del progetto (dentro `architect.build.options.styles`), aggiungi:

```json
"node_modules/leaflet/dist/leaflet.css",
"node_modules/leaflet.markercluster/dist/MarkerCluster.css",
"node_modules/leaflet.markercluster/dist/MarkerCluster.Default.css"
```

- [ ] **Step 9: Build reale**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: PASS, nessun errore di template type-checking o di risoluzione moduli Leaflet

- [ ] **Step 10: Verifica manuale in browser**

Apri `http://localhost:4300/map`: mappa visibile, pin colorati per gps/geocoded, click su pin apre il dialog corretto, checkbox e select filtrano, lista "non geolocalizzabili" popolata se pertinente.

- [ ] **Step 11: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/angular.json frontend/src/app/pages/map frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts
git commit -m "feat(map): pagina Mappa in sidebar con Leaflet, clustering e filtri"
```

---

### Task 7: Frontend — `LocationMapComponent` nei dialog edit

**Files:**
- Create: `frontend/src/app/core/components/location-map.component.ts`
- Create: `frontend/src/app/core/components/location-map.component.html`
- Create: `frontend/src/app/core/components/location-map.component.scss`
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.ts`
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.html`
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.html`

**Interfaces:**
- Consumes: nessuna dipendenza da Task 6 (componente indipendente, stesso Leaflet installato al Task 6).
- Produces: `LocationMapComponent` — `@Input() latitude: string | null`, `@Input() longitude: string | null`, `@Input() previewOnly = false` (true quando mostra un valore ereditato, non impostabile), `@Output() positionSelected = new EventEmitter<{ lat: string; lng: string }>()`.

- [ ] **Step 1: Componente**

```typescript
// frontend/src/app/core/components/location-map.component.ts
import { Component, Input, Output, EventEmitter, AfterViewInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import * as L from 'leaflet';

let instanceCounter = 0;

@Component({
  selector: 'app-location-map',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './location-map.component.html',
  styleUrls: ['./location-map.component.scss'],
})
export class LocationMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() latitude: string | null = null;
  @Input() longitude: string | null = null;
  @Input() previewOnly = false;
  @Output() positionSelected = new EventEmitter<{ lat: string; lng: string }>();
  @Output() positionCleared = new EventEmitter<void>();

  readonly canvasId = `location-map-${instanceCounter++}`;
  private map: L.Map | null = null;
  private marker: L.Marker | null = null;

  private readonly DEFAULT_CENTER: L.LatLngExpression = [42.5083, 14.15]; // Montesilvano

  ngAfterViewInit(): void {
    this.map = L.map(this.canvasId).setView(this.currentLatLng() ?? this.DEFAULT_CENTER, this.currentLatLng() ? 16 : 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    this.renderMarker();

    if (!this.previewOnly) {
      this.map.on('click', (event: L.LeafletMouseEvent) => {
        this.positionSelected.emit({
          lat: event.latlng.lat.toFixed(6),
          lng: event.latlng.lng.toFixed(6),
        });
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;
    if (changes['latitude'] || changes['longitude']) {
      this.renderMarker();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  clearPosition(): void {
    this.positionCleared.emit();
  }

  private currentLatLng(): L.LatLngExpression | null {
    const lat = parseFloat(this.latitude ?? '');
    const lng = parseFloat(this.longitude ?? '');
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return [lat, lng];
  }

  private renderMarker(): void {
    if (!this.map) return;
    if (this.marker) {
      this.map.removeLayer(this.marker);
      this.marker = null;
    }
    const latLng = this.currentLatLng();
    if (!latLng) return;
    this.marker = L.marker(latLng).addTo(this.map);
    this.map.setView(latLng, 16);
  }
}
```

- [ ] **Step 2: Template**

```html
<!-- frontend/src/app/core/components/location-map.component.html -->
<div class="location-map-wrapper">
  <div [id]="canvasId" class="location-map-canvas"></div>
  @if (!previewOnly && latitude && longitude) {
    <button mat-stroked-button type="button" class="location-map-clear" (click)="clearPosition()">
      Cancella posizione manuale
    </button>
  }
  @if (previewOnly && latitude && longitude) {
    <div class="location-map-hint">Posizione ereditata dall'immobile collegato</div>
  }
</div>
```

- [ ] **Step 3: Stili**

```scss
// frontend/src/app/core/components/location-map.component.scss
.location-map-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.location-map-canvas {
  height: 220px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.location-map-hint {
  font-size: 0.8rem;
  color: #757575;
}
```

- [ ] **Step 4: Integra in `AssetEditDialogComponent`**

In `frontend/src/app/pages/assets/asset-edit-dialog.component.ts`, aggiungi `LocationMapComponent` all'array `imports` e un metodo:

```typescript
onPositionSelected(coords: { lat: string; lng: string }): void {
  this.form.patchValue({ latitude: coords.lat, longitude: coords.lng });
}

onPositionCleared(): void {
  this.form.patchValue({ latitude: null, longitude: null });
}
```

In `frontend/src/app/pages/assets/asset-edit-dialog.component.html`, subito dopo il campo `longitude` (righe 90-93 come letto — dopo il blocco `mat-form-field` di Longitudine, prima della chiusura del `div` che li contiene):

```html
<div style="flex: 1 1 100%;">
  <app-location-map
    [latitude]="form.controls.latitude.value"
    [longitude]="form.controls.longitude.value"
    (positionSelected)="onPositionSelected($event)"
    (positionCleared)="onPositionCleared()">
  </app-location-map>
</div>
```

- [ ] **Step 5: Integra in `UtilityEditDialogComponent`**

Riusa `resolveMapCoordsFromForm()`/`isMapCoordsFromAsset()` già presenti nel componente (righe 231-248): sono esattamente la logica "gps proprio o eredita dall'asset" che serve alla preview.

In `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`, aggiungi `LocationMapComponent` a `imports` e i due metodi (uguali a quelli dell'asset):

```typescript
onPositionSelected(coords: { lat: string; lng: string }): void {
  this.form.patchValue({ latitude: coords.lat, longitude: coords.lng });
}

onPositionCleared(): void {
  this.form.patchValue({ latitude: null, longitude: null });
}
```

In `frontend/src/app/pages/utilities/utility-edit-dialog.component.html`, subito dopo il campo `longitude` (righe 85-88):

```html
<div style="flex: 1 1 100%;">
  <app-location-map
    [latitude]="resolveMapCoordsFromForm()?.lat ?? null"
    [longitude]="resolveMapCoordsFromForm()?.lon ?? null"
    [previewOnly]="isMapCoordsFromAsset()"
    (positionSelected)="onPositionSelected($event)"
    (positionCleared)="onPositionCleared()">
  </app-location-map>
</div>
```

- [ ] **Step 6: Build reale**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: PASS

- [ ] **Step 7: Verifica manuale in browser**

Apri il dialog edit di un immobile: mappa visibile con pin se presente, click sulla mappa aggiorna i campi lat/long, bottone "Cancella posizione manuale" li azzera. Ripeti sul dialog edit di un contatore: se il contatore non ha gps proprio, la mappa mostra (in preview) la posizione dell'asset collegato con l'hint "Posizione ereditata"; click sulla mappa imposta un gps proprio e la preview scompare a favore del pin editabile.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/core/components/location-map.component.ts frontend/src/app/core/components/location-map.component.html frontend/src/app/core/components/location-map.component.scss frontend/src/app/pages/assets/asset-edit-dialog.component.ts frontend/src/app/pages/assets/asset-edit-dialog.component.html frontend/src/app/pages/utilities/utility-edit-dialog.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.html
git commit -m "feat(map): mini-mappa selezionabile nei dialog edit asset/utility"
```

---

### Task 8: Verifica finale end-to-end

**Files:** nessuna modifica — solo verifica.

- [ ] **Step 1: Suite completa backend**

Run: `docker exec utenzepa-api-1 pnpm run test -- --maxWorkers=2`
Expected: PASS

- [ ] **Step 2: Build completa backend**

Run: `docker exec utenzepa-api-1 pnpm run build`
Expected: PASS

- [ ] **Step 3: Build completa frontend**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: PASS

- [ ] **Step 4: Percorso utente completo in browser**

1. Vai su `/map`: pin di immobili/contatori con colori corretti, filtri funzionanti, click su pin apre il dialog giusto.
2. Modifica l'indirizzo di un immobile senza gps: verifica nei log backend che parta un nuovo geocode, e che il pin sulla mappa si aggiorni al refresh.
3. Apri il dialog di un contatore senza gps proprio collegato a un immobile con posizione nota: la mini-mappa mostra la posizione ereditata; clicca per impostarne una propria, salva, riapri e verifica sia persistita come gps proprio (non più ereditata).
4. Verifica un immobile senza indirizzo e senza gps: compare nella lista "Non geolocalizzabili" della pagina mappa.

- [ ] **Step 5: Aggiorna CLAUDE.md se emergono learning non ovvi**

Se durante l'esecuzione emergono gotcha non documentati (es. comportamento di Nominatim, quirk di Leaflet in Angular standalone/SSR, dettagli di clustering), invoca la skill `claude-md-management:revise-claude-md` per registrarli.
