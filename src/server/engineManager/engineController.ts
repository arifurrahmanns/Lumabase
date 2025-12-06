import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync, ChildProcess } from 'child_process';
import treeKill from 'tree-kill';
import { EngineConfigManager } from './engineConfig';
import { EngineInstance } from './types';
import { downloadEngine } from './downloader';

// Helper function to find PID by port
function getPidByPort(port: number): number | undefined {
  try {
    // Windows implementation using netstat
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          return parseInt(parts[parts.length - 1], 10);
        }
      }
    } else {
      // Linux/Mac implementation using lsof
      try {
          const output = execSync(`lsof -i :${port} -t`, { encoding: 'utf-8' });
          return parseInt(output.trim(), 10);
      } catch (e) {
          return undefined; // lsof returns non-zero if no process found
      }
    }
  } catch (e) {
    return undefined;
  }
}

export class EngineController extends EventEmitter {
  private instances: Map<string, EngineInstance>;
  private runningProcesses: Map<string, ChildProcess>;
  private configManager: EngineConfigManager;
  private isQuitting: boolean = false;

  constructor() {
    super();
    this.instances = new Map();
    this.runningProcesses = new Map();
    this.configManager = new EngineConfigManager();
    this.loadInstances();
  }

  private loadInstances() {
    const instances = this.configManager.getInstances();
    instances.forEach(i => {
      // Restore status check
      if (i.pid) {
          try {
              // process.kill(pid, 0) throws if process doesn't exist
              process.kill(i.pid, 0);
              i.status = 'running';
              console.log(`Restored running instance ${i.name} (PID: ${i.pid})`);
          } catch (e: any) {
              // Process not found by PID. Check by port.
              console.log(`Process ${i.pid} check failed for ${i.name}: ${e.message}. Checking port ${i.port}...`);
              const foundPid = getPidByPort(i.port);
              if (foundPid) {
                  console.log(`Found process ${foundPid} listening on port ${i.port}. Updating config.`);
                  i.pid = foundPid;
                  i.status = 'running';
                  // Update config immediately
                  this.configManager.updateInstance(i.id, { pid: foundPid, status: 'running' });
              } else {
                  console.log(`No process found on port ${i.port}. Marking as stopped.`);
                  i.status = 'stopped';
                  i.pid = undefined;
              }
          }
      } else {
          // No PID saved. Check port just in case it's a ghost.
          const foundPid = getPidByPort(i.port);
          if (foundPid) {
               console.log(`Found ghost process ${foundPid} listening on port ${i.port}. Recovering...`);
               i.pid = foundPid;
               i.status = 'running';
               this.configManager.updateInstance(i.id, { pid: foundPid, status: 'running' });
          } else {
               // console.log(`No PID found for ${i.name}, marking as stopped.`);
               i.status = 'stopped';
          }
      }
      this.instances.set(i.id, i);
    });
  }

  getInstances(): EngineInstance[] {
    return Array.from(this.instances.values());
  }

  async addInstance(instance: EngineInstance, onProgress?: (percent: number) => void) {
    // Check for duplicate name
    const existing = Array.from(this.instances.values()).find(i => i.name.toLowerCase() === instance.name.toLowerCase());
    if (existing) {
        throw new Error(`Instance with name "${instance.name}" already exists`);
    }

    // Check if binary exists, if not, try to download
    if (!fs.existsSync(instance.binaryPath)) {
        console.log(`Binary not found for ${instance.name}. Attempting download...`);
        try {
            // Determine version from instance or default
            const version = instance.version || (instance.type === 'mysql' ? '8.0' : '14');
            
            const installDir = path.dirname(instance.dataDir); 
            
            const realBinaryPath = await downloadEngine(
                instance.type, 
                version, 
                installDir,
                onProgress
            );
            
            instance.binaryPath = realBinaryPath;
            console.log(`Engine installed at ${realBinaryPath}`);
        } catch (e: any) {
            console.error('Download failed:', e);
            throw new Error(`Failed to download engine: ${e.message}`);
        }
    }

    this.configManager.addInstance(instance);
    this.instances.set(instance.id, instance);
    this.emit('change', this.getInstances());
    return instance;
  }

  removeInstance(id: string) {
    const instance = this.instances.get(id);
    if (instance) {
        this.stopInstance(id);
        
        // Delete data directory
        if (instance.dataDir && fs.existsSync(instance.dataDir)) {
            try {
                console.log(`Removing data directory: ${instance.dataDir}`);
                fs.rmSync(instance.dataDir, { recursive: true, force: true });
            } catch (e) {
                console.error(`Failed to remove data dir: ${e}`);
            }
        }

        // Attempt to remove the engine directory (parent of dataDir)
        if (instance.dataDir) {
            const versionDir = path.dirname(instance.dataDir); // .../<version>
            const instanceDir = path.dirname(versionDir);      // .../<safeName>
            
            if (fs.existsSync(instanceDir)) {
                 try {
                    console.log(`Removing instance directory: ${instanceDir}`);
                    fs.rmSync(instanceDir, { recursive: true, force: true });
                } catch (e) {
                    console.error(`Failed to remove instance dir: ${e}`);
                }
            }
        }

        this.configManager.removeInstance(id);
        this.instances.delete(id);
        this.emit('change', this.getInstances());
    }
  }

  async startInstance(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) throw new Error('Instance not found');
    
    // Check if port is in use or if we have a ghost PID
    if (instance.status === 'running') {
        console.log(`Instance ${instance.name} is marked as running. Stopping first...`);
        await this.stopInstance(id);
    } else {
        // Check port before starting
        const portPid = getPidByPort(instance.port);
        if (portPid) {
             console.log(`Port ${instance.port} is in use by PID ${portPid}. Killing it...`);
             // Kill the blocker
             try {
                 process.kill(portPid, 'SIGTERM');
                 // Give it a moment
                 await new Promise(r => setTimeout(r, 1000));
                 if (getPidByPort(instance.port)) {
                     process.kill(portPid, 'SIGKILL');
                 }
             } catch (e) {
                 console.error(`Failed to kill blocker PID ${portPid}:`, e);
             }
        }
    }

    this.updateStatus(id, 'starting');

    try {
      let child: ChildProcess;

      if (instance.type === 'mysql') {
        if (!fs.existsSync(instance.binaryPath)) {
            throw new Error(`MySQL binary not found at: ${instance.binaryPath}`);
        }

        if (!fs.existsSync(instance.dataDir)) {
             fs.mkdirSync(instance.dataDir, { recursive: true });
        }

        const mysqlDir = path.join(instance.dataDir, 'mysql');
        if (!fs.existsSync(mysqlDir)) {
            console.log(`Initializing MySQL data directory: ${instance.dataDir}`);
            try {
                execSync(`"${instance.binaryPath}" --initialize-insecure --datadir="${instance.dataDir}"`);
            } catch (e: any) {
                throw new Error(`Failed to initialize MySQL: ${e.message}`);
            }
        }

        const args = [
          `--datadir=${instance.dataDir}`,
          `--port=${instance.port}`,
          '--console',
        ];

        console.log(`Starting MySQL: ${instance.binaryPath} ${args.join(' ')}`);
        child = spawn(instance.binaryPath, args);

      } else if (instance.type === 'postgres') {
        if (!fs.existsSync(instance.binaryPath)) {
            throw new Error(`Postgres binary not found at: ${instance.binaryPath}`);
        }

        if (!fs.existsSync(instance.dataDir)) {
            fs.mkdirSync(instance.dataDir, { recursive: true });
        }

        const pgVersionFile = path.join(instance.dataDir, 'PG_VERSION');
        if (!fs.existsSync(pgVersionFile)) {
             console.log(`Initializing Postgres data directory: ${instance.dataDir}`);
             try {
                 const binDir = path.dirname(instance.binaryPath);
                 const initdbPath = path.join(binDir, process.platform === 'win32' ? 'initdb.exe' : 'initdb');
                 
                 if (!fs.existsSync(initdbPath)) {
                     throw new Error(`initdb not found at ${initdbPath}. Cannot initialize.`);
                 }

                 execSync(`"${initdbPath}" -D "${instance.dataDir}" -U postgres --auth=trust`);
             } catch (e: any) {
                 throw new Error(`Failed to initialize Postgres: ${e.message}`);
             }
        }

        const args = [
          '-D', instance.dataDir,
          '-p', instance.port.toString()
        ];

        console.log(`Starting Postgres: ${instance.binaryPath} ${args.join(' ')}`);
        child = spawn(instance.binaryPath, args);
      } else {
        throw new Error('Unsupported engine type');
      }

      this.runningProcesses.set(id, child);
      this.updateStatus(id, 'running', child.pid, Date.now());

      child.stdout?.on('data', (data) => {
        console.log(`[${instance.name}] stdout: ${data}`);
      });

      child.stderr?.on('data', (data) => {
        console.error(`[${instance.name}] stderr: ${data}`);
      });

      child.on('close', (code) => {
        console.log(`[${instance.name}] process exited with code ${code}`);
        this.runningProcesses.delete(id);
        if (!this.isQuitting) {
            this.updateStatus(id, 'stopped', undefined);
        } else {
            console.log(`[${instance.name}] App quitting, preserving 'running' status and PID ${child.pid} for next launch.`);
        }
      });

      child.on('error', (err) => {
          console.error(`[${instance.name}] Failed to start:`, err);
          this.updateStatus(id, 'error');
      });

    } catch (error) {
      console.error(`Failed to start instance ${id}:`, error);
      this.updateStatus(id, 'error');
      throw error;
    }
  }

  async stopInstance(id: string): Promise<void> {
    const instance = this.instances.get(id);
    const child = this.runningProcesses.get(id);
    
    let pidToKill = child?.pid;
    if (!pidToKill && instance?.pid) {
        pidToKill = instance.pid;
    }

    if (pidToKill) {
      console.log(`Stopping instance ${id} (PID: ${pidToKill})...`);
      return new Promise((resolve) => {
          treeKill(pidToKill!, 'SIGTERM', (err) => {
              if (err) {
                  console.error(`Failed to kill process ${pidToKill}:`, err);
                  treeKill(pidToKill!, 'SIGKILL');
              }
              // Clean up state
              this.runningProcesses.delete(id);
              this.updateStatus(id, 'stopped', undefined);
              resolve();
          });
      });
    } else {
        // No PID found, just mark as stopped
        this.updateStatus(id, 'stopped', undefined);
    }
  }

  async stopAllInstances() {
      console.log('Stopping all running instances...');
      const promises = Array.from(this.runningProcesses.keys()).map(id => this.stopInstance(id));
      await Promise.all(promises);
  }

  setQuitting() {
      this.isQuitting = true;
  }

  private updateStatus(id: string, status: EngineInstance['status'], pid?: number, lastStartedAt?: number) {
    const instance = this.instances.get(id);
    if (instance) {
      instance.status = status;
      instance.pid = pid;
      if (lastStartedAt) instance.lastStartedAt = lastStartedAt;
      this.instances.set(id, instance);
      // Persist to config
      this.configManager.updateInstance(id, { status, pid, lastStartedAt });
      this.emit('change', this.getInstances());
    }
  }

  updateInstanceConfig(id: string, updates: Partial<EngineInstance>) {
    const instance = this.instances.get(id);
    if (!instance) {
        throw new Error('Instance not found');
    }

    if (instance.status === 'running' || instance.status === 'starting') {
        throw new Error('Cannot update configuration while engine is running. Please stop it first.');
    }

    // Validate updates
    if (updates.port) {
        // basic range check
        if (updates.port < 1024 || updates.port > 65535) {
            throw new Error('Port must be between 1024 and 65535');
        }
    }

    // Apply updates
    const updatedInstance = { ...instance, ...updates };
    this.instances.set(id, updatedInstance);
    this.configManager.updateInstance(id, updates);
    this.emit('change', this.getInstances());
    
    return updatedInstance;
  }
}
