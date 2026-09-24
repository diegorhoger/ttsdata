declare module 'pg' {
  export interface PoolConfig { connectionString?: string; }
  export class Pool {
    constructor(config?: PoolConfig | string);
    query(text: string, params?: any[]): Promise<any>;
    end(): Promise<void>;
    connect(): Promise<any>;
  }
}
