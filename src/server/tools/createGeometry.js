import { getDesignStore } from '../../utils/designStore.js';
import { getPythonScriptPath, getRunsBasePath } from '../../utils/paths.js';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function createGeometry(params) {
  console.log('[createGeometry] called for', params.designId);

  // Compute absolute runDir on the JS side — Python receives it and never
  // needs to call os.chdir() relative to an unknown cwd.
  const runsBase = getRunsBasePath();          // e.g. <project>/runs
  const runDir   = path.join(runsBase, `run_${params.designId}`);
  fs.mkdirSync(runDir, { recursive: true });

  const enrichedParams = { ...params, runDir };

  return new Promise((resolve) => {
    const scriptPath = getPythonScriptPath('create_drone.py');
    const inputJson  = JSON.stringify(enrichedParams);

    const proc = execFile(
        'python',
        [scriptPath],
        {
          timeout:   120_000,
          maxBuffer: 10 * 1024 * 1024,
          cwd:       runDir,   // Python's __file__-relative paths are safe
        },
        (error, stdout, stderr) => {
          if (stderr) console.error('[createGeometry] stderr:', stderr.slice(0, 400));

          const result = extractJson(stdout);

          if (result) {
            if (result.status === 'error') {
              console.error('[createGeometry] Python error:', result.message);
              resolve(result);
              return;
            }
            // Persist full result (including runDir + vspFile) in store
            const store = getDesignStore();
            store[params.designId] = {
              ...store[params.designId],
              parameters:  result.parameters,
              description: result.description,
              runDir:      result.runDir  || runDir,
              vspFile:     result.parameters?.vspFile || path.join(runDir, `${params.designId}.vsp3`),
            };
            resolve(result);
            return;
          }

          if (error) {
            console.error('[createGeometry] crash/timeout:', error.message);
            resolve({ status: 'error', message: error.message });
            return;
          }

          resolve({ status: 'error', message: 'No JSON in stdout.' });
        }
    );

    proc.stdin.write(inputJson);
    proc.stdin.end();
  });
}

function extractJson(stdout) {
  try {
    const s = stdout.indexOf('===JSON_START===');
    const e = stdout.indexOf('===JSON_END===');
    if (s !== -1 && e !== -1) return JSON.parse(stdout.substring(s + 16, e).trim());
    const j = stdout.indexOf('{');
    if (j !== -1) return JSON.parse(stdout.substring(j).trim());
  } catch (_) {}
  return null;
}