let databaseInstance: any = null;

export async function initializeDatabase(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}): Promise<any> {
  if (!databaseInstance) {
    const { DatabaseService } = await import('database');
    databaseInstance = new DatabaseService(config);
  }
  return databaseInstance;
}

export function getDatabase(): any {
  if (!databaseInstance) {
    // For testing, initialize with mock config if not already initialized
    if (process.env.NODE_ENV === 'test') {
      throw new Error(
        'Database not initialized. Call initializeDatabase first.'
      );
    } else {
      throw new Error(
        'Database not initialized. Call initializeDatabase first.'
      );
    }
  }
  return databaseInstance;
}
