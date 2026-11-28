// The group at a station moves one position forward on each rotation.
function stationGroup(station, rotation, count) {
  return String.fromCharCode(65 + (station - rotation % count + count) % count);
}

function nextPhase(state, config) {
  switch (state.phase) {
    case 'prepare':
      return {phase:'work', rotation:0, milliseconds:config.work * 1000};
    case 'change':
      return {phase:'work', rotation:state.rotation + 1, milliseconds:config.work * 1000};
    case 'work':
      if (state.rotation + 1 >= config.count * config.laps) {
        return {phase:'finished', rotation:state.rotation, milliseconds:0};
      }
      if (config.change) {
        return {phase:'change', rotation:state.rotation, milliseconds:config.change * 1000};
      }
      return {phase:'work', rotation:state.rotation + 1, milliseconds:config.work * 1000};
    default:
      return state;
  }
}

export function mountBuhardillaStations({
  root, onExit, onSound, onActivity, onStart = () => true,
  onCheckpoint = () => {}, onComplete = () => {}, formatTime
}) {
  const find = id => root.querySelector('#' + id);
  const form = find('stationForm');
  const selection = find('stationSelection');
  const screen = find('stationScreen');
  const pause = find('stationPause');
  const next = find('stationNext');
  const finish = find('stationFinish');
  const back = find('stationBack');
  const timer = find('stationTime');
  let candidates = [];
  let items = [];
  let lastSave = 0;
  let cards = [];
  let config;
  let state;
  let paused = false;
  let clock = 0;
  let interval;
  let workout;
  let elapsed = 0;

  function stopClock() {
    clearInterval(interval);
    interval = undefined;
  }

  function updateClock() {
    const seconds = Math.ceil(state.milliseconds / 1000);
    const time = formatTime(seconds);
    if (timer.textContent !== time) timer.textContent = time;
    timer.classList.toggle('countdown-ending', state.phase === 'work' && seconds > 0 && seconds <= 3);
  }

  function render() {
    const {phase, rotation} = state;
    const finished = phase === 'finished';
    const displayRotation = rotation + (phase === 'change' ? 1 : 0);
    const lap = Math.floor(displayRotation / config.count) + 1;
    const caption = {prepare:'Prepárate',work:'Tiempo de trabajo',change:'Cambio de estación',finished:'Clase finalizada'}[phase];
    find('stationPhase').textContent = paused && !finished ? 'En pausa · ' + caption : caption;
    find('stationProgress').textContent = 'Vuelta ' + lap + ' de ' + config.laps + ' · Rotación ' + (displayRotation + 1) + ' de ' + config.count * config.laps;
    cards.forEach((card, index) => {
      const text = (phase === 'change' ? 'Llega grupo ' : 'Grupo ') + stationGroup(index, displayRotation, config.count);
      if (card.textContent !== text) card.textContent = text;
    });
    pause.textContent = paused ? 'Reanudar' : 'Pausar';
    pause.hidden = finish.hidden = finished;
    next.hidden = finished;
    next.disabled = phase === 'prepare';
    back.hidden = !finished;
    updateClock();
  }

  function saveProgress() {
    if (!state || state.phase === 'finished') return;
    onCheckpoint({items, config, state, paused, elapsed});
    lastSave = Date.now();
  }

  function finishRun() {
    stopClock();
    if (onComplete(workout, elapsed / 1000) === false) {
      finish.hidden = false;
      finish.focus();
      onActivity();
      return;
    }
    finish.hidden = true;
    onActivity();
    back.focus();
  }

  function tick(now = Date.now()) {
    if (!state || paused || state.phase === 'finished') return;
    let delta = Math.max(0, now - clock);
    const timely = delta <= 1250;
    clock = now;
    const previous = Math.ceil(state.milliseconds / 1000);
    let changed = false;
    while (state.phase !== 'finished' && delta >= state.milliseconds) {
      if (state.phase !== 'prepare') elapsed += state.milliseconds;
      delta -= state.milliseconds;
      state = nextPhase(state, config);
      changed = true;
    }
    if (state.phase !== 'finished') {
      state.milliseconds -= delta;
      if (state.phase !== 'prepare') elapsed += delta;
    }
    const seconds = Math.ceil(state.milliseconds / 1000);
    if (timely && (changed || (seconds < previous && seconds <= 3))) onSound(changed);
    if (changed) render();
    else updateClock();
    if (state.phase === 'finished') finishRun();
    else if (changed || now - lastSave >= 1000) saveProgress();
  }

  function startClock() {
    clock = Date.now();
    stopClock();
    interval = setInterval(tick, 100);
  }

  function makeCard(item, index) {
    const card = document.createElement('article');
    const position = document.createElement('span');
    const group = document.createElement('strong');
    const name = document.createElement('h3');
    position.textContent = 'Estación ' + (index + 1);
    name.textContent = item.label;
    card.append(position, group, name);
    for (const text of [item.target, item.instructions].filter(Boolean)) {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      card.append(paragraph);
    }
    if (item.gif) {
      const image = document.createElement('img');
      image.alt = '';
      image.addEventListener('error', () => image.remove(), {once:true});
      image.src = item.gif;
      card.append(image);
    }
    return {card, group};
  }

  function openClock(title) {
    const entries = items.map(makeCard);
    cards = entries.map(entry => entry.group);
    find('stationCards').replaceChildren(...entries.map(entry => entry.card));
    find('stationTitle').textContent = title;
    form.classList.add('hidden');
    screen.classList.remove('hidden');
    find('stationControls').open = true;
    render();
    if (!paused) startClock();
    onActivity();
  }

  form.onsubmit = event => {
    event.preventDefault();
    const selected = [...selection.querySelectorAll('input:checked')].map(input => candidates[Number(input.value)]);
    if (selected.length < 2 || selected.length > 8) {
      find('stationError').textContent = 'Selecciona entre 2 y 8 estaciones.';
      return;
    }
    if (!onStart(workout)) return;
    items = selected;
    config = {count:items.length, ...Object.fromEntries(['laps','work','change'].map(key => [key, form.elements[key].valueAsNumber]))};
    elapsed = 0;
    state = {phase:'prepare', rotation:0, milliseconds:10000};
    paused = false;
    openClock(workout.name);
    saveProgress();
    pause.focus();
  };

  pause.onclick = () => {
    if (!paused) {
      tick();
      if (state.phase === 'finished') return;
      paused = true;
      stopClock();
    } else {
      paused = false;
      startClock();
    }
    onActivity();
    render();
    saveProgress();
  };
  next.onclick = () => {
    const phase = state.phase;
    const rotation = state.rotation;
    tick();
    if (phase !== state.phase || rotation !== state.rotation) return;
    state = nextPhase(state, config);
    clock = Date.now();
    onSound(true);
    render();
    if (state.phase === 'finished') finishRun();
    else saveProgress();
  };
  finish.onclick = () => {
    if (!confirm('¿Finalizar el circuito por estaciones?')) return;
    if (state.phase === 'finished') {
      finishRun();
      return;
    }
    tick();
    if (state.phase === 'finished') return;
    state = {...state, phase:'finished', milliseconds:0};
    render();
    finishRun();
  };
  back.onclick = find('stationCancel').onclick = onExit;
  selection.onchange = () => {
    const count = selection.querySelectorAll('input:checked').length;
    find('stationError').textContent = '';
    find('stationCount').textContent = count + ' seleccionadas';
  };

  return {
    open(title, exercises, sourceWorkout) {
      workout = sourceWorkout;
      stopClock();
      state = null;
      candidates = exercises;
      find('stationTitle').textContent = title;
      find('stationError').textContent = '';
      form.reset();
      const preselect = candidates.length <= 8;
      selection.replaceChildren(...candidates.map((item, index) => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = String(index);
        checkbox.checked = preselect;
        label.append(checkbox, item.label);
        return label;
      }));
      selection.onchange();
      find('stationStart').disabled = candidates.length < 2;
      if (candidates.length < 2) find('stationError').textContent = 'Añade al menos dos ejercicios a la rutina.';
      find('stationCards').replaceChildren();
      form.classList.remove('hidden');
      screen.classList.add('hidden');
    },
    restore(sourceWorkout, saved) {
      const {items: savedItems, config: savedConfig, state: savedState} = saved;
      const bounded = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
      if (!Array.isArray(savedItems) || !savedItems.every(item => typeof item?.label === 'string')
          || !bounded(savedItems.length, 2, 8) || savedConfig?.count !== savedItems.length
          || !bounded(savedConfig.laps, 1, 12) || !bounded(savedConfig.work, 10, 1800)
          || !bounded(savedConfig.change, 0, 300)
          || !['prepare', 'work', 'change'].includes(savedState?.phase)
          || !bounded(savedState.rotation, 0, savedConfig.count * savedConfig.laps - 1)
          || !bounded(savedState.milliseconds, 0, 1800000)
          || !Number.isFinite(saved.elapsed) || saved.elapsed < 0) {
        throw Error('Estado del circuito inválido.');
      }
      stopClock();
      workout = sourceWorkout;
      items = savedItems;
      config = savedConfig;
      state = savedState;
      elapsed = saved.elapsed;
      paused = Boolean(saved.paused);
      lastSave = Date.now();
      openClock(workout.name);
    },
    checkpoint() {
      tick();
      saveProgress();
    },
    get running() {
      return Boolean(state && state.phase !== 'finished' && !paused);
    }
  };
}
