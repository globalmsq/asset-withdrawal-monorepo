import { DatabaseService, DatabaseConfig } from 'database';

let databaseInstance: DatabaseService | null = null;

export function initializeDatabase(config: DatabaseConfig): DatabaseService {
  if (!databaseInstance) {
    databaseInstance = new DatabaseService(config);
  }
  return databaseInstance;
}

export function getDatabase(): DatabaseService {
  if (!databaseInstance) {
    // For testing, initialize with mock config if not already initialized
    if (process.env.NODE_ENV === 'test') {
      const mockConfig = {
        host: 'localhost',
        port: 3306,
        user: 'test',
        password: 'test',
        database: 'test_db',
      };
      databaseInstance = new DatabaseService(mockConfig);
    } else {
      throw new Error(
        'Database not initialized. Call initializeDatabase first.'
      );
    }
  }
  return databaseInstance;
}
