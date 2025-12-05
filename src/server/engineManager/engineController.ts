import { spawn, ChildProcess, execSync } from 'child_process';
import { EngineConfigManager } from './engineConfig';
import { EngineInstance } from './types';
import fs from 'fs';
import path from 'path';
import { downloadEngine } from './downloader';
import treeKill from 'tree-kill';

function getPidByPort(port: number): number | null {
    try {
        if (process.platform === 'win32') {
            const output = execSync(`netstat -ano | findstr :${port}`).toString();
            // Output format: TCP    0.0.0.0:3308           0.0.0.0:0              LISTENING       1234
            const lines = output.split('\n').filter(l => l.includes('LISTENING'));
            if (lines.length > 0) {
                const parts = lines[0].trim().split(/\s+/);
                const pid = parseInt(parts[parts.length - 1]);
                return isNaN(pid) ? null : pid;
            }
        } else {
            const output = execSync(`lsof -i :${port} -t`).toString();
            const pid = parseInt(output.trim());
            return isNaN(pid) ? null : pid;
        }
    } catch (e) {
        // Command failed or no process found
        return null;
    }
    return null;
}

export class EngineController {
  private configManager: EngineConfigManager;
  private runningProcesses: Map<string, ChildProcess> = new Map();
  // We keep an in-memory state of instances to track 'running' status and PIDs
  private instances: Map<string, EngineInstance> = new Map();
  private isQuitting: boolean = false;

  constructor() {
    this.configManager = new EngineConfigManager();
    this.loadInstances();
  }

  private loadInstances() {
    const saved = this.configManager.getInstances();
    console.log('Loading instances from config:', JSON.stringify(saved));
    saved.forEach(i => {
      // Check if the process is actually running if we have a PID
      if (i.pid) {
          try {
              console.log(`Checking if process ${i.pid} exists for ${i.name}...`);
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
               console.log(`No PID found for ${i.name}, marking as stopped.`);
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
            
            // Construct a dedicated engine dir if not provided or if it looks like a default path
            // We'll extract to the parent of the bin folder if possible, or just use the base engines dir
            // Actually, let's use the parent of the binaryPath as the target, 
            // but binaryPath is what we want to FIND.
            // The UI sends a binaryPath guess. We should ignore it if we are downloading 
            // and instead determine the path dynamically.
            
            // Let's assume instance.dataDir is .../engines/mysql/8.0/data
            // So we want to extract to .../engines/mysql/8.0/
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
        // This assumes the structure: <base>/<type>/<safeName>/<version>/data
        // We want to remove <base>/<type>/<safeName>
        if (instance.dataDir) {
            const versionDir = path.dirname(instance.dataDir); // .../<version>
            const instanceDir = path.dirname(versionDir);      // .../<safeName>
            
            // Safety check: Ensure we are not deleting the root engines dir or type dir
            // instanceDir should be at least 2 levels deep from 'engines' (engines/type/instance)
            // But we don't have easy access to 'engines' root here without config.
            // Let's just check if it looks like a valid path and not too short.
            
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
    }
  }

  async startInstance(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) throw new Error('Instance not found');
    
    // If it's already running, we might want to restart it if requested (implicit in "Start" click when already running?)
    // But usually the UI handles "Stop" then "Start". 
    // However, if the user sees "Start" but it IS running (e.g. ghost process not detected on load), we should try to kill it.
    
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
        // MySQL Start Logic
        // mysqld --datadir=<path> --port=<port> --console
        // Note: User must provide a valid data directory initialized with mysqld --initialize-insecure
        
        // Check if data dir exists
        // Check if binary exists
        if (!fs.existsSync(instance.binaryPath)) {
            throw new Error(`MySQL binary not found at: ${instance.binaryPath}`);
        }

        // Create data dir if not exists
        if (!fs.existsSync(instance.dataDir)) {
             fs.mkdirSync(instance.dataDir, { recursive: true });
        }

        // Check if initialized (look for 'mysql' folder)
        const mysqlDir = path.join(instance.dataDir, 'mysql');
        if (!fs.existsSync(mysqlDir)) {
            console.log(`Initializing MySQL data directory: ${instance.dataDir}`);
            try {
                // Initialize insecurely (empty root password)
                execSync(`"${instance.binaryPath}" --initialize-insecure --datadir="${instance.dataDir}"`);
            } catch (e: any) {
                throw new Error(`Failed to initialize MySQL: ${e.message}`);
            }
        }

        const args = [
          `--datadir=${instance.dataDir}`,
          `--port=${instance.port}`,
          '--console', // Output to stdout/stderr
          // '--skip-grant-tables' // Optional: for easy access if needed
        ];

        console.log(`Starting MySQL: ${instance.binaryPath} ${args.join(' ')}`);
        child = spawn(instance.binaryPath, args);

      } else if (instance.type === 'postgres') {
        // PostgreSQL Start Logic
        // postgres -D <datadir> -p <port>
        
        // Check if binary exists
        if (!fs.existsSync(instance.binaryPath)) {
            throw new Error(`Postgres binary not found at: ${instance.binaryPath}`);
        }

        // Create data dir if not exists
        if (!fs.existsSync(instance.dataDir)) {
            fs.mkdirSync(instance.dataDir, { recursive: true });
        }

        // Check if initialized (look for PG_VERSION)
        const pgVersionFile = path.join(instance.dataDir, 'PG_VERSION');
        if (!fs.existsSync(pgVersionFile)) {
             console.log(`Initializing Postgres data directory: ${instance.dataDir}`);
             try {
                 // Need initdb. Assume it's in the same bin directory as postgres
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
      this.updateStatus(id, 'running', child.pid);

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

  private updateStatus(id: string, status: EngineInstance['status'], pid?: number) {
    const instance = this.instances.get(id);
    if (instance) {
      instance.status = status;
      instance.pid = pid;
      this.instances.set(id, instance);
      // Persist to config
      this.configManager.updateInstance(id, { status, pid });
    }
  }
}
