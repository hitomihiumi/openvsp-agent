import { execFile, exec } from 'child_process';
import { getPythonScriptPath } from '../../utils/paths.js';
import { getDesignStore } from '../../utils/designStore.js';

export async function checkStability(params) {
    console.log('[checkStability] called for', params.designId);

    const store  = getDesignStore();
    const stored = store[params.designId] || {};
    const vspFile = params.vspFile || stored.vspFile;
    const runDir  = params.runDir  || stored.runDir;
    const p       = stored.parameters || {};

    const enrichedParams = {
        ...params,
        vspFile,
        runDir,
        wingArea:     params.wingArea     || p.wingArea,
        wingspan:     params.wingspan     || p.wingspan,
        wingChord:    params.wingChord    || p.wingChord,
        wingTipChord: params.wingTipChord || p.wingTipChord,
    };

    return new Promise((resolve) => {
        const scriptPath = getPythonScriptPath('check_stability.py');

        const proc = execFile(
            'python',
            [scriptPath],
            {
                timeout:   120_000,
                maxBuffer: 50 * 1024 * 1024,
                cwd:       runDir || process.cwd(),
            },
            (error, stdout, stderr) => {
                if (stderr) console.error('[checkStability] stderr:', stderr.slice(0, 400));

                const result = extractJson(stdout);

                if (result) {
                    if (result.status === 'error') {
                        console.error('[checkStability] Python error:', result.message);
                        resolve(result);
                        return;
                    }
                    store[params.designId] = { ...stored, stability: result };
                    resolve(result);
                    return;
                }

                if (error) {
                    console.error('[checkStability] crash/timeout:', error.message);
                    if (process.platform === 'win32') exec('taskkill /F /IM vspaero.exe', () => {});
                    resolve({ status: 'error', message: `System failed: ${error.message}` });
                    return;
                }

                resolve({ status: 'error', message: 'No JSON in stdout.' });
            }
        );

        proc.stdin.write(JSON.stringify(enrichedParams));
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