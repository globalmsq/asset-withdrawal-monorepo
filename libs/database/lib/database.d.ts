export interface DatabaseConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
}
export declare class DatabaseService {
    private prisma;
    constructor(config: DatabaseConfig);
    getClient(): any;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    healthCheck(): Promise<boolean>;
}
