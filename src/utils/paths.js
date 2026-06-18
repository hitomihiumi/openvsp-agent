import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Returns the absolute path to a Python script in the python/ folder.
 * Adjust the relative path to match your project structure.
 */
export function getPythonScriptPath(scriptName) {
  // e.g. <project_root>/python/<scriptName>
  return path.resolve(__dirname, '../../python', scriptName);
}

/**
 * Returns (and creates) the base directory where per-design run_<id>/ folders live.
 * Using a dedicated folder avoids polluting the project root.
 */
export function getRunsBasePath() {
  const runsDir = path.resolve(__dirname, '../../runs');
  fs.mkdirSync(runsDir, { recursive: true });
  return runsDir;
}