// HF local presentation: HDMI mirroring and standalone iPad o tablet.
// No external libs, no Supabase, no device pairing required.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const vm=require('node:vm');

const html=readFileSync(resolve(__dirname,'../hf-class-display.html'),'utf8');
const home=readFileSync(resolve(__dirname,'../index.html'),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(js,'HF standalone class script exists');

function boot(query='?mode=guided&view=mirror'){
  const nodes=new Map(),listeners=new Map(), bodyClasses=new Set();
  let clock=1_000_000,ticker=null;
  function node(id=''){
    let value='';
    const attrs=new Map(), cls=new Set();
    const item={
      id,textContent:'',hidden:false,disabled:false,children:[],
      style:{},previousElementSibling:{textContent:id},
      classList:{
        add(...names){for(const n of names)cls.add(n);},
        remove(...names){for(const n of names)cls.delete(n);},
        contains(name){return cls.has(name);},
        toggle(name,force){
          const next=force===undefined?!cls.has(name):!!force;
          if(next)cls.add(name);else cls.delete(name);
          return next;
        }
      },
      setAttribute(k,v){attrs.set(k,String(v));},
      getAttribute(k){return attrs.get(k);},
      addEventListener(){},
      append(...items){this.children.push(...items);},
      replaceChildren(...items){this.children=items;},
      remove(){}
    };
    Object.defineProperty(item,'value',{get(){return value;},set(v){value=String(v);}});
    return item;
  }
  const document={
    fullscreenElement:null,fullscreenEnabled:false,
    body:{
      classList:{
        add(...names){for(const n of names)bodyClasses.add(n);},
        remove(...names){for(const n of names)bodyClasses.delete(n);},
        contains(name){return bodyClasses.has(name);},
        toggle(name,force){
          const next=force===undefined?!bodyClasses.has(name):!!force;
          if(next)bodyClasses.add(name);else bodyClasses.delete(name);
          return next;
        }
      }
    },
    getElementById(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);},
    createElement:tag=>node(tag),
    addEventListener(type,cb){listeners.set(type,cb);}
  };
  const window={};
  const sandbox={
    document,window,location:{search:query},URLSearchParams,
    Date:{now:()=>clock},console,confirm:()=>true,setInterval:(fn,ms)=>{if(ms===160)ticker=fn;return 0}
  };
  vm.runInNewContext(js,sandbox,{filename:'hf-class-prototype',timeout:1000});
  return {
    el:id=>document.getElementById(id),bodyClasses,document,listeners,
    advance(ms){clock+=ms;ticker?.();},click(id){const item=this.el(id);assert.equal(typeof item.onclick,'function');item.onclick();}
  };
}

test('main HF entry shows only group formats, not the retired device-pairing workflow',()=>{
  const i=home.indexOf('function setupHF(){');
  const j=home.indexOf('function setupLocalProfiles(){',i);
  const setup=home.slice(i,j);
  assert.ok(setup.includes('Clase guiada'));
  assert.ok(setup.includes('Circuito por estaciones'));
  assert.ok(setup.includes('view=mirror'));
  assert.doesNotMatch(setup,/pairDemo|hf-pair-preview|hf-live-beta|Conexión móvil y pantalla/);
  assert.ok(setup.includes('iPad o tablet'));
});

test('HDMI mirroring is the default and only one selected device mode is active',()=>{
  const a=boot('?mode=guided');
  assert.ok(a.bodyClasses.has('session-mode-mirror'));
  assert.ok(!a.bodyClasses.has('session-mode-tablet'));
  assert.equal(a.el('mirrorMode').getAttribute('aria-pressed'),'true');
  assert.equal(a.el('tabletMode').getAttribute('aria-pressed'),'false');
});

test('tablet mode selected from URL can be changed locally without restarting class',()=>{
  const a=boot('?mode=stations&view=tablet');
  assert.ok(a.bodyClasses.has('session-mode-tablet'));
  a.click('start');
  a.advance(10000); // preparation is not active training
  assert.equal(a.el('start').disabled,true);
  a.click('mirrorMode');
  assert.ok(a.bodyClasses.has('session-mode-mirror'));
  assert.ok(!a.bodyClasses.has('session-mode-tablet'));
  assert.equal(a.el('mirrorMode').getAttribute('aria-pressed'),'true');
  assert.equal(a.el('start').disabled,true,'mode switch must not reset the class');
});

test('presentation stays usable without fullscreen API on iPhone',()=>{
  const a=boot();
  a.click('togglePresentation');
  assert.ok(a.bodyClasses.has('presentation'));
  assert.equal(a.el('togglePresentation').textContent,'Salir de presentación');
  a.listeners.get('fullscreenchange')();
  assert.ok(a.bodyClasses.has('presentation'),
    'Safari fallback must retain CSS presentation when fullscreen unsupported');
  a.click('exitPresentation');
  assert.ok(!a.bodyClasses.has('presentation'));
});

test('local touch controls can collapse and expand while presenting',()=>{
  const a=boot();
  a.click('togglePresentation');
  assert.equal(a.el('coachToggle').getAttribute('aria-expanded'),'true');
  a.click('coachToggle');
  assert.ok(a.bodyClasses.has('controls-collapsed'));
  assert.equal(a.el('coachToggle').getAttribute('aria-expanded'),'false');
  assert.equal(a.el('coachToggle').textContent,'Mostrar mandos');
  a.click('coachToggle');
  assert.ok(!a.bodyClasses.has('controls-collapsed'));
  assert.equal(a.el('coachToggle').textContent,'Ocultar mandos');
  a.click('exitPresentation');
  a.click('togglePresentation');
  assert.ok(!a.bodyClasses.has('controls-collapsed'));
});

test('class modes and programmed breaks work in both presentation modes',()=>{
  const a=boot('?mode=guided&view=mirror');
  a.click('togglePresentation');
  a.click('start');
  a.advance(10000);
  assert.ok(a.el('pause').disabled===false);
  a.click('next'); // manually advance from timed warmup
  assert.match(a.el('progressText').textContent,/Ejercicio 2 de/);
  a.click('pause');
  assert.equal(a.el('next').disabled,true);
  a.click('pause'); // resume
  a.click('tabletMode');
  a.click('next');
  assert.match(a.el('progressText').textContent,/Ejercicio 3 de/);
  a.click('next');
  assert.equal(a.el('phaseTag').textContent,'DESCANSO');
});

test('CSS has landscape compact mirroring and tablet controls, without hiding entire coach interface',()=>{
  assert.match(html,/orientation:landscape/);
  assert.match(html,/\.presentation\.session-mode-mirror \.coach/);
  assert.match(html,/\.presentation\.session-mode-tablet \.coach/);
  assert.match(html,/\.presentation \.device-choice\{display:none\}/);
  assert.match(html,/viewport-fit=cover/);
  assert.match(html,/env\(safe-area-inset-bottom\)/);
});
