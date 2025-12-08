import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface AppSettings {
  showInTray: boolean;
}

const CONFIG_FILENAME = 'settings.json';

const getConfigPath = () => path.join(app.getPath('userData'), CONFIG_FILENAME);

const DEFAULT_CONFIG: AppSettings = {
  showInTray: true
};

export class AppSettingsManager {
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

  private readConfig(): AppSettings {
    try {
      if (fs.existsSync(this.configPath)) {
          const data = fs.readFileSync(this.configPath, 'utf-8');
          // Merge with default to ensure new keys are present
          return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
      return DEFAULT_CONFIG;
    } catch (error) {
      console.error('Failed to read app settings:', error);
      return DEFAULT_CONFIG;
    }
  }

  private saveConfig(config: AppSettings) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Failed to save app settings:', error);
    }
  }

  getSettings(): AppSettings {
    return this.readConfig();
  }

  updateSettings(updates: Partial<AppSettings>) {
    const config = this.readConfig();
    const newConfig = { ...config, ...updates };
    this.saveConfig(newConfig);
    return newConfig;
  }
}
