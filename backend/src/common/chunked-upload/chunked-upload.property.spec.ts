import fc from 'fast-check';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ChunkedUploadService } from './chunked-upload.service';

// Test di proprietà (fuzzing con fast-check): uploadId e nome finale arrivano dal client.
// Nessun file viene scritto: senza pezzi salvati assemble si ferma dopo i controlli.
describe('ChunkedUploadService: proprietà dei percorsi', () => {
  let service: ChunkedUploadService;
  let destDir: string;

  beforeAll(() => {
    service = new ChunkedUploadService();
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chunked-upload-prop-'));
  });

  afterAll(() => fs.rmSync(destDir, { recursive: true, force: true }));

  const anyString = fc.string({ unit: 'binary', maxLength: 40 });
  const pathLike = fc
    .array(fc.constantFrom('..', '.', '/', '\\', 'a', 'b-1', '_', '%2e', '\u0000', ':'), {
      maxLength: 8,
    })
    .map((parts) => parts.join(''));

  it('un nome finale accettato resta un file diretto della cartella', () => {
    fc.assert(
      fc.property(fc.oneof(anyString, pathLike), (name) => {
        let error = '';
        try {
          service.assemble('up-1', 1, destDir, name);
        } catch (e) {
          error = (e as Error).message;
        }
        if (error === 'nome file non valido') return;
        // Accettato: si ferma solo perché mancano i pezzi, e il percorso non esce.
        expect(error).toMatch(/Chunk mancanti/);
        const resolved = path.resolve(destDir, name);
        expect(path.dirname(resolved)).toBe(path.resolve(destDir));
        expect(path.basename(resolved)).toBe(name);
      }),
      { numRuns: 500 },
    );
  });

  it('un uploadId accettato non contiene separatori né punti', () => {
    fc.assert(
      fc.property(fc.oneof(anyString, pathLike), (uploadId) => {
        try {
          service.isComplete(uploadId, 1, destDir);
        } catch (e) {
          expect((e as Error).message).toBe('uploadId non valido');
          return;
        }
        expect(uploadId).toMatch(/^[A-Za-z0-9_-]+$/);
      }),
      { numRuns: 500 },
    );
  });
});
