const fs = require('node:fs');
const path = require('node:path');
function log(dir, event, details = {}) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'recovery.jsonl');
    if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) {
      fs.rmSync(file + '.1', { force: true });
      fs.renameSync(file, file + '.1');
    }
    fs.appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), event, ...details }) + '\n');
  } catch { /* A full disk must not bring down the pet or its recovery helper. */ }
}
module.exports = { log };
