let databaseInstance: any = null;

export async function initializeDatabase(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}): Promise<any> {
  if (!databaseInstance) {
    const { DatabaseService } = await import('@asset-withdrawal/database');
    databaseInstance = new DatabaseService(config);
  }
  return databaseInstance;
}

export function getDatabase(): any {
  if (!databaseInstance) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return databaseInstance;
}
