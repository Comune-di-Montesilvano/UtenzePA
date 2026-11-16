import { DataSource } from 'typeorm';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insertAttachment,
  insertContract,
  insertPlant,
  insertPlantInspection,
} from '../../test/integration/fixtures';
import { AttachmentsService } from './attachments.service';
import { Attachment } from './entity/attachment.entity';
import { AttachmentEntityType as T } from './enum/attachment-entity-type.enum';

describe('AttachmentsService (integrazione)', () => {
  let ds: DataSource;
  let service: AttachmentsService;

  beforeAll(async () => {
    ds = await itDataSource();
    service = new AttachmentsService(ds.getRepository(Attachment), ds, {} as never, {} as never);
  });

  afterAll(() => ds.destroy());

  beforeEach(() => resetTables(ds, ['attachments', 'plant_inspections', 'plants', 'contracts']));

  describe('list di un impianto', () => {
    it('aggiunge i documenti delle verifiche non cancellate, con il tipo di verifica', async () => {
      const plant = await insertPlant(ds);
      const own = await insertAttachment(ds, T.PLANT, plant);
      const inspection = await insertPlantInspection(ds, plant, { kind: 'Verifica biennale' });
      const fromInspection = await insertAttachment(ds, T.PLANT_INSPECTION, inspection);
      const deletedInspection = await insertPlantInspection(ds, plant, { deleted: 1 });
      await insertAttachment(ds, T.PLANT_INSPECTION, deletedInspection);
      // Verifica di un altro impianto: mai qui.
      const other = await insertPlantInspection(ds, await insertPlant(ds));
      await insertAttachment(ds, T.PLANT_INSPECTION, other);

      const rows = await service.list(T.PLANT, plant);
      expect(rows.map((r) => [r.id, r.inspection])).toEqual([
        [own, null],
        [fromInspection, { id: inspection, kind: 'Verifica biennale' }],
      ]);
    });
  });

  describe('open: proprietario non cancellato', () => {
    // Proprietario valido = si arriva al controllo del file (assente nei test).
    const FILE_MISSING = 'File non disponibile sul server';

    it('contratto presente: passa il controllo del proprietario', async () => {
      const a = await insertAttachment(ds, T.CONTRACT, await insertContract(ds));
      await expect(service.open(a)).rejects.toThrow(FILE_MISSING);
    });

    it('contratto cancellato: proprietario non trovato', async () => {
      const a = await insertAttachment(ds, T.CONTRACT, await insertContract(ds, { deleted: 1 }));
      await expect(service.open(a)).rejects.toThrow('Contratto di fornitura non trovato');
    });

    it('verifica: vale solo se anche il suo impianto non è cancellato', async () => {
      const live = await insertPlantInspection(ds, await insertPlant(ds));
      const orphan = await insertPlantInspection(ds, await insertPlant(ds, { deleted: 1 }));
      const deleted = await insertPlantInspection(ds, await insertPlant(ds), { deleted: 1 });
      await expect(
        service.open(await insertAttachment(ds, T.PLANT_INSPECTION, live)),
      ).rejects.toThrow(FILE_MISSING);
      await expect(
        service.open(await insertAttachment(ds, T.PLANT_INSPECTION, orphan)),
      ).rejects.toThrow('Verifica non trovato');
      await expect(
        service.open(await insertAttachment(ds, T.PLANT_INSPECTION, deleted)),
      ).rejects.toThrow('Verifica non trovato');
    });
  });
});
