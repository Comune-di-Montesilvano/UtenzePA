import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ChunkedUploadService {
  // Dimensione dei pezzi ricevuti per upload: ricalcolarla dal disco a ogni
  // pezzo costava una lettura della cartella per pezzo (backup da GB = decine
  // di migliaia di pezzi). Persa al riavvio: si ricostruisce dal disco una volta.
  private readonly sizes = new Map<string, Map<number, number>>();

  private chunkFileName(uploadId: string, chunkIndex: number): string {
    return `${uploadId}.chunk${chunkIndex}`;
  }

  private validateUploadId(uploadId: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(uploadId)) {
      throw new Error('uploadId non valido');
    }
  }

  saveChunk(
    uploadId: string,
    chunkIndex: number,
    totalChunks: number,
    buffer: Buffer,
    destDir: string,
    maxSizeBytes?: number,
  ): void {
    this.validateUploadId(uploadId);
    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      throw new Error(`chunkIndex ${chunkIndex} fuori range (totalChunks=${totalChunks})`);
    }
    fs.mkdirSync(destDir, { recursive: true });
    const chunkPath = path.join(destDir, this.chunkFileName(uploadId, chunkIndex));
    fs.writeFileSync(chunkPath, buffer);
    const sizes = this.chunkSizes(uploadId, destDir);
    sizes.set(chunkIndex, buffer.length);

    if (maxSizeBytes !== undefined) {
      let totalSize = 0;
      for (const size of sizes.values()) totalSize += size;
      if (totalSize > maxSizeBytes) {
        this.cleanup(uploadId, totalChunks, destDir);
        throw new Error(
          `Dimensione totale upload (${totalSize} byte) supera il limite consentito (${maxSizeBytes} byte)`,
        );
      }
    }
  }

  private sizesKey(uploadId: string, destDir: string): string {
    return `${destDir}|${uploadId}`;
  }

  private chunkSizes(uploadId: string, destDir: string): Map<number, number> {
    const key = this.sizesKey(uploadId, destDir);
    let sizes = this.sizes.get(key);
    if (!sizes) {
      sizes = new Map();
      const prefix = `${uploadId}.chunk`;
      for (const entry of fs.readdirSync(destDir)) {
        if (entry.startsWith(prefix)) {
          const index = Number(entry.slice(prefix.length));
          if (Number.isInteger(index)) {
            sizes.set(index, fs.statSync(path.join(destDir, entry)).size);
          }
        }
      }
      this.sizes.set(key, sizes);
    }
    return sizes;
  }

  isComplete(uploadId: string, totalChunks: number, destDir: string): boolean {
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(destDir, this.chunkFileName(uploadId, i));
      if (!fs.existsSync(chunkPath)) return false;
    }
    return true;
  }

  assemble(uploadId: string, totalChunks: number, destDir: string, finalFileName: string): string {
    this.validateUploadId(uploadId);
    if (!this.isComplete(uploadId, totalChunks, destDir)) {
      throw new Error(`Chunk mancanti per upload ${uploadId}`);
    }

    const finalPath = path.join(destDir, finalFileName);
    try {
      const writeStream = fs.openSync(finalPath, 'w');
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(destDir, this.chunkFileName(uploadId, i));
        const chunkBuffer = fs.readFileSync(chunkPath);
        fs.writeSync(writeStream, chunkBuffer);
        // Subito, non a fine ciclo: con file da GB pezzi + file intero
        // occuperebbero il doppio del disco.
        fs.unlinkSync(chunkPath);
      }
      fs.closeSync(writeStream);
      return finalPath;
    } finally {
      this.cleanup(uploadId, totalChunks, destDir);
    }
  }

  cleanup(uploadId: string, totalChunks: number, destDir: string): void {
    this.sizes.delete(this.sizesKey(uploadId, destDir));
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(destDir, this.chunkFileName(uploadId, i));
      if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
    }
  }
}
