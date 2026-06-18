import { execFile, exec } from 'child_process';
import { getPythonScriptPath } from '../../utils/paths.js';
import { getDesignStore } from '../../utils/designStore.js';

export async function runAeroAnalysis(params) {
  console.log(`[AeroAnalysis] Starting for ${params.designId}`);

  return new Promise((resolve) => {
    const scriptPath = getPythonScriptPath('run_vspaero.py');
    const inputJson = JSON.stringify({ ...params }, null, 2);

    const proc = execFile(
        'python',
        [scriptPath],
        { timeout: 60000, maxBuffer: 50 * 1024 * 1024 },
        (error, stdout, stderr) => {
            console.log(`[AeroAnalysis] Raw stdout for ${params.designId}:`, stdout);
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

          // 2. Если мы успешно достали JSON (с данными или с ошибкой от Python)
          if (result) {
            if (result.status === 'error') {
              console.error(`[AeroAnalysis] Python Error for ${params.designId}:`, result.message);
              resolve(result); // Отдаем реальную ошибку агенту!
              return;
            }
            const store = getDesignStore();
            store[params.designId] = { ...store[params.designId], aero: result };
            resolve(result);
            return;
          }

          // 3. Если JSON нет, а ошибка есть (жесткий краш C++, segfault или реальный таймаут)
          if (error) {
            console.error(`[AeroAnalysis] Hard Crash/Timeout for ${params.designId}:`, error.message);
            exec('taskkill /F /IM vspaero.exe', () => {}); // Убиваем зависший решатель
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