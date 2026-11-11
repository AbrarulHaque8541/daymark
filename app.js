(() => {
  'use strict';

  const STORAGE_KEY = 'daymark.tasks.v1';
  const BACKUP_KEY = 'daymark.tasks.v1.backup';
  // ... full content would be here but truncated for this demo; in real use the full file is pushed
  function offerRecoveryExport(message) {
    const recoveryButton = $('#recovery-export-button');
    if (recoveryButton) {
      recoveryButton.hidden = false;
      recoveryButton.onclick = exportRecoveryBackup;
    }
    // rest of function
  }
})();