(function (root) {
  'use strict';

  function normalizeTitle(value) {
    if (typeof value !== 'string') throw new TypeError('Task title must be text.');
    const title = value.trim();
    if (!title) throw new Error('Enter a task title.');
    if (title.length > 160) throw new Error('Task title must be 160 characters or fewer.');
    return title;
  }

  function createTask(title, id) {
    const cleanTitle = normalizeTitle(title);
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new TypeError('A task ID is required.');
    }
    return Object.freeze({ id, title: cleanTitle, done: false });
  }

  function setTaskDone(tasks, id, done) {
    if (!Array.isArray(tasks) || typeof done !== 'boolean') {
      throw new TypeError('Invalid task state.');
    }
    let found = false;
    const next = tasks.map((task) => {
      if (task.id !== id) return task;
      found = true;
      return Object.freeze({ id: task.id, title: task.title, done });
    });
    if (!found) throw new Error('Task no longer exists.');
    return next;
  }

  function removeTask(tasks, id) {
    if (!Array.isArray(tasks)) throw new TypeError('Tasks must be a list.');
    return tasks.filter((task) => task.id !== id);
  }

  function filterTasks(tasks, filter) {
    if (!Array.isArray(tasks)) throw new TypeError('Tasks must be a list.');
    if (filter === 'open') return tasks.filter((task) => !task.done);
    if (filter === 'done') return tasks.filter((task) => task.done);
    if (filter === 'all') return tasks.slice();
    throw new Error('Unknown task filter.');
  }

  const api = Object.freeze({ normalizeTitle, createTask, setTaskDone, removeTask, filterTasks });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.DaymarkTaskCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
