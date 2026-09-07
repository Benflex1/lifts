import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Store } from '../../src/database/contract';
import { SqliteDriver, createNativeStore } from '../../src/database/nativeStore';

export class NodeSqliteDriver implements SqliteDriver {
  private db: DatabaseSync;

  constructor(public readonly filePath: string = ':memory:') {
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, ...params: any[]): Promise<{ changes: number; lastInsertRowId: number }> {
    const stmt = this.db.prepare(sql);
    const safeParams = params.map(p => (p === undefined ? null : p));
    const result = stmt.run(...safeParams);
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const safeParams = params.map(p => (p === undefined ? null : p));
    const row = stmt.get(...safeParams);
    return (row as T) || null;
  }

  async getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const safeParams = params.map(p => (p === undefined ? null : p));
    const rows = stmt.all(...safeParams);
    return (rows as T[]) || [];
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      await task();
      this.db.exec('COMMIT;');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch (_) {
        // Rollback error if already rolled back
      }
      throw err;
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch (_) {}
  }
}

export interface StoreFixture {
  store: Store;
  driver?: NodeSqliteDriver;
  reopen: () => Promise<Store>;
  dispose: () => Promise<void>;
}

export async function createStoreFixture(platform: 'native' | 'web'): Promise<StoreFixture> {
  if (platform === 'native') {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `lifts-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    let driver = new NodeSqliteDriver(tempFile);
    let store = createNativeStore(driver);
    await store.init();

    return {
      store,
      driver,
      reopen: async () => {
        driver.close();
        driver = new NodeSqliteDriver(tempFile);
        store = createNativeStore(driver);
        await store.init();
        return store;
      },
      dispose: async () => {
        driver.close();
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch (_) {}
        }
      },
    };
  }

  throw new Error(`Platform ${platform} not yet implemented in fixture`);
}
