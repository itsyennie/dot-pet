// The alert process must not start the pet, web session or recovery watchdog.
if (process.argv.includes('--recovery-alert')) {
  const { app } = require('electron');
  const path = require('node:path');
  app.on('window-all-closed', () => {});
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.mori.companion');
    await require('./recovery-alert').showRecoveryPaused({ dir: path.join(app.getPath('userData'), 'diagnostics'), kind: 'app' });
  }).finally(() => app.quit());
} else {
  require('./main');
}
