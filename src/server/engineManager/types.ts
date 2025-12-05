export interface EngineInstance {
  id: string;
  name: string;
  type: 'mysql' | 'postgres';
  version: string;
  port: number;
  status: 'stopped' | 'running' | 'starting' | 'error';
  dataDir: string;
  binaryPath: string; // Path to mysqld or postgres executable
  pid?: number;
}

export interface EngineConfig {
  instances: EngineInstance[];
}
