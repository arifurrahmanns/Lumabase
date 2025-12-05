import fs from 'fs';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { app } from 'electron';

// Hardcoded URLs for MVP (Windows x64)
const DOWNLOAD_URLS: Record<string, string> = {
    'mysql-8.0': 'https://downloads.mysql.com/archives/get/p/23/file/mysql-8.0.32-winx64.zip',
    'mysql-5.7': 'https://downloads.mysql.com/archives/get/p/23/file/mysql-5.7.44-winx64.zip',
    'postgres-14': 'https://get.enterprisedb.com/postgresql/postgresql-14.10-1-windows-x64-binaries.zip',
    'postgres-13': 'https://get.enterprisedb.com/postgresql/postgresql-13.13-1-windows-x64-binaries.zip'
};

export const downloadEngine = async (
    type: 'mysql' | 'postgres',
    version: string,
    destDir: string,
    onProgress?: (percent: number) => void
): Promise<string> => {
    const key = `${type}-${version}`;
    const url = DOWNLOAD_URLS[key];
    
    if (!url) {
        throw new Error(`No download URL for ${type} ${version}`);
    }

    // Create temp directory for download
    const tempDir = path.join(app.getPath('temp'), 'lumabase-downloads');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileName = path.basename(url);
    const filePath = path.join(tempDir, fileName);

    // 0. Pre-check: If binary exists, skip everything
    if (fs.existsSync(destDir)) {
        try {
            // Filter out 'data' dir when looking for extract root
            const subdirs = fs.readdirSync(destDir).filter(f => {
                return fs.statSync(path.join(destDir, f)).isDirectory() && f !== 'data';
            });
            const rootExtractDir = subdirs.length === 1 ? path.join(destDir, subdirs[0]) : destDir;
            
            let checkBin = '';
            if (type === 'mysql') {
                checkBin = path.join(rootExtractDir, 'bin', 'mysqld.exe');
            } else {
                checkBin = path.join(rootExtractDir, 'bin', 'postgres.exe');
            }

            if (fs.existsSync(checkBin)) {
                console.log('Engine binary already exists, skipping download/extract.');
                if (onProgress) onProgress(100);
                return checkBin;
            }
        } catch (e) {
            // Ignore error and proceed to download/extract
        }
    }

    // 1. Download
    console.log(`Downloading ${key} from ${url}...`);
    if (!fs.existsSync(filePath)) { // Simple cache: don't redownload if exists in temp
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer',
            onDownloadProgress: (progressEvent) => {
                if (onProgress && progressEvent.total) {
                    const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    onProgress(percent);
                }
            }
        });
        fs.writeFileSync(filePath, response.data);
    } else {
        console.log('Using cached archive');
        if (onProgress) onProgress(100);
    }

    // 2. Extract
    console.log(`Extracting to ${destDir}...`);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    try {
        const zip = new AdmZip(filePath);
        zip.extractAllTo(destDir, true);
    } catch (e: any) {
        // If EBUSY, it might mean the files are locked because they are already running/extracted.
        // We will proceed to check for the binary. If it exists, we assume it's fine.
        console.warn(`Extraction warning: ${e.message}`);
        if (e.code !== 'EBUSY') {
             throw e;
        }
    }

    // 3. Find Binary Path
    // Extraction usually creates a subfolder (e.g. mysql-8.0.32-winx64)
    // We need to find the bin folder inside
    const subdirs = fs.readdirSync(destDir).filter(f => {
        return fs.statSync(path.join(destDir, f)).isDirectory() && f !== 'data';
    });
    const rootExtractDir = subdirs.length === 1 ? path.join(destDir, subdirs[0]) : destDir;

    let binPath = '';
    if (type === 'mysql') {
        binPath = path.join(rootExtractDir, 'bin', 'mysqld.exe');
    } else {
        binPath = path.join(rootExtractDir, 'bin', 'postgres.exe');
    }

    if (!fs.existsSync(binPath)) {
        // Fallback check
        const altBin = path.join(destDir, 'bin', type === 'mysql' ? 'mysqld.exe' : 'postgres.exe');
        if (fs.existsSync(altBin)) binPath = altBin;
        else throw new Error(`Could not locate binary after extraction: ${binPath}`);
    }

    return binPath;
};
