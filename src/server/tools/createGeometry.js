import { getDesignStore } from '../../utils/designStore.js';
import { getPythonScriptPath } from "../../utils/paths.js";
import { execFile } from "child_process";

export async function createGeometry(params) {
  console.log('=========================================');
  console.log('TOOL CALLED: createGeometry!');
  console.log('Параметры от ИИ:', JSON.stringify(params, null, 2));
  console.log('=========================================');

  return new Promise((resolve) => {
    const scriptPath = getPythonScriptPath('create_drone.py');
    const inputJson = JSON.stringify({ ...params }, null, 2);

    const proc = execFile(
        'python',
        [scriptPath],
        { timeout: 300000, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          let result = null;

          try {
            // Поддерживаем оба формата: и новые теги, и старую фигурную скобку
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
              console.error(`[Geometry] Python Error:`, result.message);
              resolve(result);
              return;
            }
            const store = getDesignStore();
            store[params.designId] = {
              ...store[params.designId],
              parameters: result.parameters,
              description: result.description,
            };
            resolve(result);
            return;
          }

          if (error) {
            console.error(`[Geometry] Hard Crash/Timeout:`, error.message);
            resolve({ status: 'error', message: error.message }); // Теперь не зависнет!
            return;
          }

          resolve({ status: 'error', message: 'Failed to parse geometry output.' });
        }
    );

    proc.stdin.write(inputJson);
    proc.stdin.end();
  });
}