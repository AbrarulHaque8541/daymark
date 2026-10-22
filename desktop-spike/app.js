(() => {
  'use strict';
  const core = window.DaymarkTaskCore;
  if (!core) return;

  let tasks = [];
  let activeFilter = 'open';
  let sequence = 0;

  const form = document.getElementById('task-form');
  const input = document.getElementById('task-title');
  const list = document.getElementById('task-list');
  const empty = document.getElementById('empty-state');
  const openCount = document.getElementById('open-count');
  const doneCount = document.getElementById('done-count');
  const status = document.getElementById('status-message');
  const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));

  function announce(message) { status.textContent = message; }

  function render() {
    const visible = core.filterTasks(tasks, activeFilter);
    list.replaceChildren();
    empty.hidden = visible.length !== 0;

    for (const task of visible) {
      const row = document.createElement('article');
      row.className = `task-row${task.done ? ' is-done' : ''}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-check';
      checkbox.checked = task.done;
      checkbox.setAttribute('aria-label', `${task.done ? 'Reopen' : 'Complete'} task: ${task.title}`);
      checkbox.addEventListener('change', () => {
        tasks = core.setTaskDone(tasks, task.id, checkbox.checked);
        announce(checkbox.checked ? 'Task completed.' : 'Task reopened.');
        render();
      });

      const title = document.createElement('span');
      title.className = 'task-title';
      title.textContent = task.title;

      const state = document.createElement('span');
      state.className = 'task-state';
      state.textContent = task.done ? 'COMPLETED' : 'OPEN';

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete-task';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete task: ${task.title}`);
      remove.addEventListener('click', () => {
        tasks = core.removeTask(tasks, task.id);
        announce('Task deleted.');
        render();
      });

      row.append(checkbox, title, state, remove);
      list.append(row);
    }

    openCount.textContent = String(tasks.filter((task) => !task.done).length);
    doneCount.textContent = String(tasks.filter((task) => task.done).length);
    filterButtons.forEach((button) => {
      const selected = button.dataset.filter === activeFilter;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let task;
    try {
      sequence += 1;
      task = core.createTask(input.value, `spike-${sequence}`);
    } catch (error) {
      announce(error.message);
      input.focus();
      return;
    }
    tasks = [task, ...tasks];
    activeFilter = 'open';
    input.value = '';
    announce('Task added.');
    render();
    input.focus();
  });

  filterButtons.forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    render();
  }));

  render();
})();
