import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface IStorageProvider {
  storeFile(storageKey: string, content: Buffer): Promise<string>;
  readFile(storageKey: string): Promise<Buffer>;
  deleteFile(storageKey: string): Promise<void>;
}

@Injectable()
export class StorageService implements IStorageProvider {
  private readonly uploadDir = path.join(process.cwd(), 'uploads');

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async storeFile(storageKey: string, content: Buffer): Promise<string> {
    const baseKey = path.basename(storageKey);
    const sanitizedKey = baseKey.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = path.join(this.uploadDir, sanitizedKey);
    await fs.promises.writeFile(filePath, content);
    return `/uploads/${sanitizedKey}`;
  }

  async readFile(storageKey: string): Promise<Buffer> {
    const baseKey = path.basename(storageKey);
    const sanitizedKey = baseKey.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = path.join(this.uploadDir, sanitizedKey);
    if (!fs.existsSync(filePath)) {
      return Buffer.from('');
    }
    return fs.promises.readFile(filePath);
  }

  async deleteFile(storageKey: string): Promise<void> {
    const baseKey = path.basename(storageKey);
    const sanitizedKey = baseKey.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = path.join(this.uploadDir, sanitizedKey);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}
