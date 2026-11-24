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

export function mountBuhardillaStations({root, onExit, onSound, onActivity, formatTime}) {
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
  let cards = [];
  let config;
  let state;
  let paused = false;
  let clock = 0;
  let interval;

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

  function tick(now = performance.now()) {
    if (!state || paused || state.phase === 'finished') return;
    let delta = now - clock;
    clock = now;
    const previous = Math.ceil(state.milliseconds / 1000);
    let changed = false;
    while (state.phase !== 'finished' && delta >= state.milliseconds) {
      delta -= state.milliseconds;
      state = nextPhase(state, config);
      changed = true;
    }
    if (state.phase !== 'finished') state.milliseconds -= delta;
    const seconds = Math.ceil(state.milliseconds / 1000);
    if (changed || (seconds < previous && seconds <= 3)) onSound(changed);
    if (changed) render();
    else updateClock();
    if (state.phase === 'finished') {
      stopClock();
      onActivity();
      back.focus();
    }
  }

  function startClock() {
    clock = performance.now();
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

  form.onsubmit = event => {
    event.preventDefault();
    const items = [...selection.querySelectorAll('input:checked')].map(input => candidates[Number(input.value)]);
    if (items.length < 2 || items.length > 8) {
      find('stationError').textContent = 'Selecciona entre 2 y 8 estaciones.';
      return;
    }
    config = {count:items.length, ...Object.fromEntries(['laps','work','change'].map(key => [key, form.elements[key].valueAsNumber]))};
    const entries = items.map(makeCard);
    cards = entries.map(entry => entry.group);
    find('stationCards').replaceChildren(...entries.map(entry => entry.card));
    state = {phase:'prepare', rotation:0, milliseconds:10000};
    paused = false;
    form.classList.add('hidden');
    screen.classList.remove('hidden');
    find('stationControls').open = true;
    render();
    startClock();
    onActivity();
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
  };
  next.onclick = () => {
    const phase = state.phase;
    const rotation = state.rotation;
    tick();
    if (phase !== state.phase || rotation !== state.rotation) return;
    state = nextPhase(state, config);
    clock = performance.now();
    onSound(true);
    render();
    if (state.phase === 'finished') {
      stopClock();
      onActivity();
      back.focus();
    }
  };
  finish.onclick = () => {
    if (!confirm('¿Finalizar el circuito por estaciones?')) return;
    state = {...state, phase:'finished', milliseconds:0};
    stopClock();
    render();
    onActivity();
    back.focus();
  };
  back.onclick = find('stationCancel').onclick = onExit;
  selection.onchange = () => {
    const count = selection.querySelectorAll('input:checked').length;
    find('stationError').textContent = '';
    find('stationCount').textContent = count + ' seleccionadas';
  };

  return {
    open(title, exercises) {
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
    get running() {
      return Boolean(state && state.phase !== 'finished' && !paused);
    }
  };
}
