import { execFile, exec } from 'child_process';
import { getPythonScriptPath } from '../../utils/paths.js';
import { getDesignStore } from '../../utils/designStore.js';

export async function checkStability(params) {
  console.log(`[Stability] Starting for ${params.designId}`);

  return new Promise((resolve) => {
    const scriptPath = getPythonScriptPath('check_stability.py');
    const inputJson = JSON.stringify({ ...params }, null, 2);

    const proc = execFile(
        'python',
        [scriptPath],
        { timeout: 60000, maxBuffer: 50 * 1024 * 1024 },
        (error, stdout, stderr) => {
            let result = null;

            try {
                const startIdx = stdout.indexOf('===JSON_START===');
                const endIdx = stdout.indexOf('===JSON_END===');
                let cleanJson = '';

                if (startIdx !== -1 && endIdx !== -1) {
                    cleanJson = stdout.substring(startIdx + 16, endIdx).trim();
                } else {
                    const jsonStart = stdout.indexOf('{');
                    if (jsonStart !== -1) cleanJson = stdout.substring(jsonStart).trim();
                }

                if (cleanJson) result = JSON.parse(cleanJson);
            } catch (err) {}

          if (result) {
            if (result.status === 'error') {
              console.error(`[Stability] Python Error for ${params.designId}:`, result.message);
              resolve(result);
              return;
            }
            const store = getDesignStore();
            store[params.designId] = { ...store[params.designId], stability: result };
            resolve(result);
            return;
          }

          if (error) {
            console.error(`[Stability] Hard Crash/Timeout for ${params.designId}:`, error.message);
            exec('taskkill /F /IM vspaero.exe', () => {});
            resolve({ status: 'error', message: `System failed: ${error.message}` });
            return;
          }

          resolve({ status: 'error', message: 'Unknown error: no JSON found in output.' });
        }
    );

    proc.stdin.write(inputJson);
    proc.stdin.end();
  });
}