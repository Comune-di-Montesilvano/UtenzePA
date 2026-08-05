import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ChunkedUploadService } from './chunked-upload.service';

describe('ChunkedUploadService', () => {
  let service: ChunkedUploadService;
  let destDir: string;

  beforeEach(() => {
    service = new ChunkedUploadService();
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chunked-upload-test-'));
  });

  afterEach(() => {
    fs.rmSync(destDir, { recursive: true, force: true });
  });

  it('assembla i chunk nell\'ordine corretto quando tutti sono presenti', () => {
    const uploadId = 'test-upload-1';
    service.saveChunk(uploadId, 0, 3, Buffer.from('AAA'), destDir);
    service.saveChunk(uploadId, 1, 3, Buffer.from('BBB'), destDir);
    service.saveChunk(uploadId, 2, 3, Buffer.from('CCC'), destDir);

    const finalPath = service.assemble(uploadId, 3, destDir, 'result.txt');

    expect(fs.readFileSync(finalPath, 'utf-8')).toBe('AAABBBCCC');
  });

  it('accetta i chunk anche fuori ordine', () => {
    const uploadId = 'test-upload-2';
    service.saveChunk(uploadId, 2, 3, Buffer.from('CCC'), destDir);
    service.saveChunk(uploadId, 0, 3, Buffer.from('AAA'), destDir);
    service.saveChunk(uploadId, 1, 3, Buffer.from('BBB'), destDir);

    const finalPath = service.assemble(uploadId, 3, destDir, 'result.txt');

    expect(fs.readFileSync(finalPath, 'utf-8')).toBe('AAABBBCCC');
  });

  it('isComplete ritorna false se mancano chunk', () => {
    const uploadId = 'test-upload-3';
    service.saveChunk(uploadId, 0, 2, Buffer.from('AAA'), destDir);

    expect(service.isComplete(uploadId, 2, destDir)).toBe(false);
  });

  it('isComplete ritorna true quando tutti i chunk sono presenti', () => {
    const uploadId = 'test-upload-4';
    service.saveChunk(uploadId, 0, 2, Buffer.from('AAA'), destDir);
    service.saveChunk(uploadId, 1, 2, Buffer.from('BBB'), destDir);

    expect(service.isComplete(uploadId, 2, destDir)).toBe(true);
  });

  it('assemble lancia errore se un chunk manca', () => {
    const uploadId = 'test-upload-5';
    service.saveChunk(uploadId, 0, 2, Buffer.from('AAA'), destDir);

    expect(() => service.assemble(uploadId, 2, destDir, 'result.txt')).toThrow(
      'Chunk mancanti per upload test-upload-5',
    );
  });

  it('assemble rimuove i file temporanei dopo il completamento', () => {
    const uploadId = 'test-upload-6';
    service.saveChunk(uploadId, 0, 1, Buffer.from('AAA'), destDir);
    service.assemble(uploadId, 1, destDir, 'result.txt');

    const remaining = fs.readdirSync(destDir).filter((f) => f.includes(uploadId));
    expect(remaining).toEqual([]);
  });
});
