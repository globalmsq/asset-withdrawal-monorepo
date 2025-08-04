import type { DatabaseService } from '@asset-withdrawal/database';

let databaseInstance: DatabaseService | null = null;

export async function initializeDatabase(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}): Promise<DatabaseService> {
  if (!databaseInstance) {
    const { DatabaseService } = await import('@asset-withdrawal/database');
    databaseInstance = new DatabaseService(config);
  }
  return databaseInstance;
}

export function getDatabase(): DatabaseService {
  if (!databaseInstance) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return databaseInstance;
}
