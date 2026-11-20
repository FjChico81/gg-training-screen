const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const read = file => readFileSync(join(__dirname, '..', file), 'utf8');
const html = read('index.html')
  .replace(/<script src="([^"?]+)(?:\?[^"]+)?"><\/script>/g, (_, file) =>
    '<script>' + read(file) + '</script>');

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));

function page(query = '', storage = {}) {
  return new JSDOM(html, {
    url: 'https://vector.test/' + query,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      Object.defineProperty(window.navigator, 'onLine', { value: false });
      window.alert = message => errors.push(message);
      for (const [key, value] of Object.entries(storage)) {
        window.localStorage.setItem(key, value);
      }
    }
  }).window;
}

const sessionKey = 'gg-active-session-v1';
const workoutKey = 'gg-training-screen-workouts-v1';
const custom = JSON.stringify([{
  id: 'personal-test', name: 'Sesión de prueba', blocks: [{ name: 'Fuerza', items: [
    'Press | 2x8 | descanso 4s', 'Remo | 1x8 | descanso 5s'
  ] }]
}]);

async function verifyPilot(tv) {
  const window = page('', { [workoutKey]: custom });
  const document = window.document;
  const element = id => document.getElementById(id);
  const clickLog = () => element(tv ? 'tvCompleteSet' : 'logSet').click();
  const expire = seconds => window.eval('clockAnchor = Date.now() - ' + (seconds + 1) * 1000 + '; tick()');

  try {
    assert.equal(document.querySelectorAll('#vectorRoutines > details').length, 3);
    assert.equal(document.querySelectorAll('#vectorRoutines button').length, 116);
    document.querySelector('button[aria-label="Abrir General 02 · Cuerpo completo · Día 3 · Cuerpo Completo"]').click();
    assert.match(element('blocks').textContent, /Press nautilus.*120 s entre series.*90 s antes del siguiente/);
    if (tv) document.querySelector('#board [data-tv-toggle]').click();
    element('start').click();

    const expected = [
      ['Press nautilus', '02:00', '01:30'], ['Remo polea', '02:00', '01:30'],
      ['Fondos banco', '02:00', '01:30'], ['Elevaciones laterales', '01:00', '01:00'],
      ['Curl martillo', '01:00', '01:00'], ['Prensa de placas', '02:00', '01:30'],
      ['Lumbares en máquina', '01:00', null]
    ];

    for (const [name, setRest, transitionRest] of expected) {
      assert.equal(element('current').textContent, name);
      for (let set = 0; set < 2; set++) {
        clickLog();
        assert.match(element('restLabel').textContent, /ENTRE SERIES/);
        assert.equal(element('restCountdown').textContent, setRest);
        assert.equal(element('logSet').disabled, true);
        assert.match(element('restNext').textContent, new RegExp('serie ' + (set + 2), 'i'));
        expire(120);
        assert.equal(element('logSet').disabled, false);
      }
      clickLog();
      if (transitionRest) {
        assert.match(element('restLabel').textContent, /ENTRE EJERCICIOS/);
        assert.equal(element('restCountdown').textContent, transitionRest);
        expire(90);
      } else {
        assert(element('restCard').classList.contains('hidden'));
        element('quickAdvance').click();
        assert.match(element('summaryWorkout').textContent, /Día 3/);
      }
    }
    assert.equal(window.localStorage.getItem(workoutKey), custom);
  } finally {
    await new Promise(resolve => setImmediate(resolve));
    window.close();
  }
}

async function verifyRangesAndResume() {
  const window = page();
  let session;
  try {
    const document = window.document;
    document.querySelector('#vectorRoutines button').click();
    const ranges = document.querySelectorAll('#blocks select');
    ranges[0].value = '900';
    ranges[0].dispatchEvent(new window.Event('change'));
    ranges[1].value = '3';
    ranges[1].dispatchEvent(new window.Event('change'));
    document.getElementById('start').click();
    assert.equal(document.getElementById('stepTimeValue').textContent, '15:00');
    window.eval('clockAnchor = Date.now() - 901000; tick()');
    assert.equal(document.getElementById('seriesProgress').textContent, 'SERIE 1 DE 3');
    document.getElementById('logSet').click();
    session = window.localStorage.getItem(sessionKey);
  } finally {
    await new Promise(resolve => setImmediate(resolve));
    window.close();
  }

  const restored = page('', { [sessionKey]: session });
  try {
    restored.document.querySelector('#vectorRoutines button').click();
    restored.document.getElementById('resume').click();
    assert.match(restored.document.getElementById('restLabel').textContent, /PAUSADO/);
    assert.equal(restored.document.getElementById('restCountdown').textContent, '02:00');
    assert.equal(restored.document.getElementById('seriesProgress').textContent, 'SERIE 2 DE 3');
  } finally {
    await new Promise(resolve => setImmediate(resolve));
    restored.close();
  }
}

(async () => {
  await verifyPilot(false);
  await verifyPilot(true);
  await verifyRangesAndResume();
  
  for (const app of ['', '?app=hf']) {
    const window = page(app);
    try {
      const { document } = window;
      const catalog = window.vectorRoutineCatalog;
      assert.equal(catalog.length, 36);
      const exercises = catalog.flatMap(routine => routine.days).flatMap(day => day.exercises);
      assert.equal(exercises.length, 833);
      for (const exercise of exercises) {
        if (exercise.duration) assert.equal(exercise.setRest, undefined);
        else assert.ok([60, 90, 120, 180].includes(exercise.setRest));
        if (exercise.repsBySet) assert.equal(exercise.repsBySet.length, exercise.sets);
        if (exercise.side) assert.match(exercise.dose, / por (brazo|pierna|lado)$/);
      }
      assert.equal(document.getElementById('vectorRoutines').classList.contains('hidden'), !!app);
    } finally {
      await new Promise(resolve => setImmediate(resolve));
      window.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log('VECTOR: 36 fichas, 116 días, descansos en modo normal y TV, rangos y reanudación. HF: catálogo ausente de la interfaz.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
