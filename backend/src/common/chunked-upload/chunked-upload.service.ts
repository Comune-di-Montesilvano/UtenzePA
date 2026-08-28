import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ChunkedUploadService {
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

    if (maxSizeBytes !== undefined) {
      const totalSize = this.uploadedSize(uploadId, destDir);
      if (totalSize > maxSizeBytes) {
        this.cleanup(uploadId, totalChunks, destDir);
        throw new Error(
          `Dimensione totale upload (${totalSize} byte) supera il limite consentito (${maxSizeBytes} byte)`,
        );
      }
    }
  }

  private uploadedSize(uploadId: string, destDir: string): number {
    const prefix = `${uploadId}.chunk`;
    let total = 0;
    let entries: string[];
    try {
      entries = fs.readdirSync(destDir);
    } catch {
      return 0;
    }
    for (const entry of entries) {
      if (entry.startsWith(prefix)) {
        const stat = fs.statSync(path.join(destDir, entry));
        total += stat.size;
      }
    }
    return total;
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
      }
      fs.closeSync(writeStream);
      return finalPath;
    } finally {
      this.cleanup(uploadId, totalChunks, destDir);
    }
  }

  cleanup(uploadId: string, totalChunks: number, destDir: string): void {
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(destDir, this.chunkFileName(uploadId, i));
      if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
    }
  }
}
