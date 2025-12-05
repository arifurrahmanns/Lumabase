import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { EngineConfig, EngineInstance } from './types';

const CONFIG_FILENAME = 'engines.json';

// In production, store in userData. In dev, maybe project root or userData.
// Let's use userData for consistency.
const getConfigPath = () => path.join(app.getPath('userData'), CONFIG_FILENAME);

const DEFAULT_CONFIG: EngineConfig = {
  instances: []
};

export class EngineConfigManager {
  private configPath: string;

  constructor() {
    this.configPath = getConfigPath();
    this.ensureConfig();
  }

  private ensureConfig() {
    if (!fs.existsSync(this.configPath)) {
      this.saveConfig(DEFAULT_CONFIG);
    }
  }

  private readConfig(): EngineConfig {
    try {
      const data = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to read engine config:', error);
      return DEFAULT_CONFIG;
    }
  }

  private saveConfig(config: EngineConfig) {
    try {
      console.log('Saving config:', JSON.stringify(config, null, 2));
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Failed to save engine config:', error);
    }
  }

  getInstances(): EngineInstance[] {
    const config = this.readConfig();
    return config.instances;
  }

  addInstance(instance: EngineInstance) {
    const config = this.readConfig();
    config.instances.push(instance);
    this.saveConfig(config);
  }

  removeInstance(id: string) {
    const config = this.readConfig();
    config.instances = config.instances.filter(i => i.id !== id);
    this.saveConfig(config);
  }

  updateInstance(id: string, updates: Partial<EngineInstance>) {
    const config = this.readConfig();
    const index = config.instances.findIndex(i => i.id === id);
    if (index !== -1) {
      config.instances[index] = { ...config.instances[index], ...updates };
      this.saveConfig(config);
    }
  }
}
