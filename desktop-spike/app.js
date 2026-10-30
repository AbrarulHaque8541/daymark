(() => {
  'use strict';
  const core = window.DaymarkTaskCore;
  const capabilityPolicy = window.DaymarkDeviceCapabilityPolicy;
  if (!core || !capabilityPolicy) return;

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
  const surfaceMode = document.getElementById('surface-mode');

  // Browser APIs expose input/display affordances, not reliable hardware identity.
  // Classify the current interaction surface; never claim native OS or wearable support.
  function detectSurfaceProfile() {
    const width = document.documentElement.clientWidth || window.innerWidth || 320;
    const media = (query) => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
    const finePointer = media('(pointer: fine)');
    const coarsePointer = media('(pointer: coarse)');
    const touchPoints = Number.isFinite(navigator.maxTouchPoints) ? navigator.maxTouchPoints : 0;
    const surface = finePointer && media('(hover: hover)') ? 'desktop' : width >= 600 ? 'tablet' : 'phone';
    const display = width >= 900 ? 'full' : width >= 600 ? 'compact' : 'glance';
    const inputs = [];
    if (finePointer) inputs.push('pointer');
    if (coarsePointer || touchPoints > 0) inputs.push('touch');
    const profile = capabilityPolicy.createDeviceCapabilityProfile({
      surface,
      display,
      inputs,
      features: ['task-capture', 'task-review']
    });
    document.documentElement.dataset.daymarkSurface = surface;
    document.documentElement.dataset.daymarkDisplay = display;
    if (surfaceMode) surfaceMode.textContent = `${surface} · ${display} view`;
    const canCapture = profile.actions.includes('capture-task');
    const submit = form.querySelector('button[type="submit"]');
    input.disabled = !canCapture;
    submit.disabled = !canCapture;
    if (!canCapture) announce('This input mode is read-only. Connect a supported touch or pointer input to add tasks.');
    return profile;
  }

  let surfaceProfile = detectSurfaceProfile();
  let resizeFrame = null;
  window.addEventListener('resize', () => {
    if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      surfaceProfile = detectSurfaceProfile();
    });
  }, { passive: true });

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
