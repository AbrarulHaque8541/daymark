/* Daymark performance helpers — coalesced render + single-pass counts. */
(function (global) {
  if (!global || !global.document) return;
  var scheduled = 0;
  global.DaymarkPerf = {
    schedule: function (renderFn) {
      if (scheduled) return;
      scheduled = 1;
      var run = function () { scheduled = 0; try { renderFn(); } catch (e) {} };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else setTimeout(run, 0);
    },
    countTasks: function (tasks, today) {
      var open = 0, todayN = 0, upcoming = 0, completed = 0;
      if (!tasks) return { open: 0, today: 0, upcoming: 0, completed: 0 };
      for (var i = 0; i < tasks.length; i++) {
        var t = tasks[i];
        if (t.completed) completed++;
        else {
          open++;
          if (t.dueDate === today) todayN++;
          else if (t.dueDate != null && t.dueDate > today) upcoming++;
        }
      }
      return { open: open, today: todayN, upcoming: upcoming, completed: completed };
    }
  };
})(typeof window !== 'undefined' ? window : this);
