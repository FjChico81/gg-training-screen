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
    assert.equal(document.querySelectorAll('#blocks .vector-illustration:not(.hidden)').length, 7);
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
      const drawing = element('vectorCurrentIllustration');
      assert.ok(!drawing.classList.contains('hidden'));
      assert.equal(drawing.getAttribute('aria-label'), 'Ilustración de ' + name);
      assert.match(drawing.style.backgroundImage, /fichas-\d+\.webp/);
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

async function verifyVectorNavigation() {
  const window = page('', { [workoutKey]: custom });
  const { document } = window;
  const element = id => document.getElementById(id);
  try {
    assert.equal(element('library').querySelector('.library-title'), null);
    assert.equal(element('vectorLogin').parentElement, element('localProfilePanel').parentElement);
    element('vectorLogin').click();
    assert.equal(element('ggCloudPanel').open, true);
    assert.equal(element('vectorLogin').getAttribute('aria-expanded'), 'true');
    element('vectorLogin').click();
    assert.equal(element('ggCloudPanel').open, false);

    assert.equal(element('vectorRoutineSection').open, false);
    element('vectorRoutineSection').querySelector('summary').click();
    assert.equal(element('vectorRoutineSection').open, true);
    assert.deepEqual([...element('vectorRoutines').children].map(level => level.firstChild.textContent),
      ['Principiante', 'Intermedio', 'Avanzado']);

    assert.equal(element('vectorMyWorkouts').open, false);
    assert.match(element('vectorMyWorkouts').querySelector('#saved').textContent, /Sesión de prueba/);
    element('new').click();
    element('workoutName').value = 'Entrenamiento nuevo';
    element('workoutBlocks').value = 'Fuerza:\nPress | 2x8 | descanso 4s';
    const drawer = element('vectorEditorLibrary');
    assert.ok(element('editor').contains(element('exerciseLibrary')));
    drawer.querySelector('summary').click();
    await new Promise(resolve => window.setTimeout(resolve, 20));
    assert.ok(element('exerciseLibraryResults').childElementCount > 0);
    drawer.querySelector('summary').click();
    assert.equal(element('workoutName').value, 'Entrenamiento nuevo');
    element('save').click();
    element('back').click();
    assert.equal(element('vectorMyWorkouts').open, true);
    assert.match(element('saved').textContent, /Entrenamiento nuevo/);
    assert.equal(JSON.parse(window.localStorage.getItem(workoutKey)).length, 2);
  } finally {
    await new Promise(resolve => setImmediate(resolve));
    window.close();
  }
}

(async () => {
  await verifyPilot(false);
  await verifyVectorNavigation();
  await verifyPilot(true);
  await verifyRangesAndResume();
  
  for (const app of ['', '?app=hf']) {
    const window = page(app);
    try {
      const { document } = window;
      const catalog = window.vectorRoutineCatalog;
      assert.equal(catalog.length, 36);
      const days = catalog.flatMap(routine => routine.days);
      const exercises = days.flatMap(day => day.exercises);
      const {columns, rows, tiles} = window.vectorIllustrationGrid;
      for (const day of days) {
        const positions = window.vectorIllustrations[day.id];
        assert.equal(positions.length, day.exercises.length);
        assert.ok(positions.every(value => Number.isInteger(value) && value >= 0 && value < tiles));
      }
      for (let index = 0; index < Math.ceil(tiles / (columns * rows)); index++) {
        const file = 'fichas-' + String(index + 1).padStart(2, '0') + '.webp';
        const asset = readFileSync(join(__dirname, '..', 'assets', 'vector', file));
        assert.equal(asset.toString('ascii', 8, 12), 'WEBP');
      }
      assert.equal(exercises.length, 833);
      for (const exercise of exercises) {
        if (exercise.duration) assert.equal(exercise.setRest, undefined);
        else assert.ok([60, 90, 120, 180].includes(exercise.setRest));
        if (exercise.repsBySet) assert.equal(exercise.repsBySet.length, exercise.sets);
        if (exercise.side) assert.match(exercise.dose, / por (brazo|pierna|lado)$/);
      }
      assert.equal(document.getElementById('vectorRoutines').classList.contains('hidden'), !!app);
      if (app) {
        assert.ok(document.querySelector('.library-title'));
        assert.ok(document.getElementById('library').contains(document.getElementById('exerciseLibraryOpen')));
        assert.equal(document.getElementById('vectorMyWorkouts'), null);
      }
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
