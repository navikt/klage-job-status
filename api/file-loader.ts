import { join } from 'node:path';
import { LOGS } from '@api/logging';
import { getSpanId, getTraceId } from '@api/trace-id';
import type { BunFile } from 'bun';

export class FileLoader {
  #path: string;
  #file: BunFile | null = null;

  constructor(path: string) {
    this.#path = path;
    this.#init();
  }

  async #init() {
    const path = join(process.cwd(), this.#path);
    const file = Bun.file(path);
    const exists = await file.exists();

    if (!exists) {
      LOGS.error(`File at path "${path}" was not found`, getTraceId(), getSpanId(), 'file-loader');
    }

    this.#file = exists ? file : null;
  }

  public get isReady() {
    return this.#file !== null;
  }

  public get content() {
    if (this.#file === null) {
      throw new Error(`File at path "${this.#path}" is not loaded`);
    }

    return this.#file;
  }
}
