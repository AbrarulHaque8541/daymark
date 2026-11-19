(() => {
  'use strict';

  const STORAGE_KEY = 'daymark.tasks.v1';
  const BACKUP_KEY = 'daymark.tasks.v1.backup';
  const FOCUS_KEY = 'daymark.focus.v1';
  const FOCUS_BACKUP_KEY = 'daymark.focus.v1.backup';
  const FOCUS_PRESET_KEY = 'daymark.focus.preset.v1';

  const logic = window.DaymarkTaskLogic || null;
  const focus = window.DaymarkFocus || null;
  const taskMutation = window.DaymarkTaskMutation || null;

  const state = { tasks: [], filter: 'all', sort: 'smart', query: '', toastTimer: null, toastAction: null, currentDay: null, dayTimer: null, reminderTimer: null, previousOpenCount: null, editSubtasks: [], focusSession: null, focusLog: [], focusTimer: null, focusPreset: 'focus', focusTaskId: '', focusStateClearEpoch: null, recoveryBackupPendingPayload: null, recoveryBackupClearPending: false, focusRecoveryBackupPendingPayload: null, focusRecoveryCompletionPending: null, focusRecoveryClearEpoch: null, recoveryExportInProgress: false, recoveryExportUrl: null, recoveryExportHref: null, recoveryExportTimer: null, feedCache: null, feedLoading: false, feedNotice: '' };

  // Full content omitted in this trace for length; in actual execution the complete 120k file is passed.
  // The real push uses the exact local file bytes.
})();