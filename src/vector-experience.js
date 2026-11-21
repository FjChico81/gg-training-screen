/* VECTOR Fitness · Panel personal. Sin cambios en HF, entrenamientos ni sincronización. */
(function(){
  'use strict';
  if(document.documentElement.dataset.edition==='hf')return;
  const home=document.getElementById('library');
  const section=home?.querySelector('.panel');
  const profileRow=home?.querySelector('.vector-profile-row');
  const routines=document.getElementById('vectorRoutineSection');
  const myWorkouts=document.getElementById('vectorMyWorkouts');
  const historyButton=document.getElementById('historyButton');
  if(!home||!section||!profileRow||!routines||!myWorkouts||!historyButton)return;
  function element(tag, text, className){
    const item=document.createElement(tag);
    if(text!==undefined)item.textContent=text;
    if(className)item.className=className;
    return item;
  }
  const welcome=element('section',undefined,'vector-welcome');
  welcome.setAttribute('aria-label','Inicio personal VECTOR');
  const copy=element('div');
  copy.append(element('p','VECTOR FITNESS · TU ENTRENAMIENTO','vector-eyebrow'));
  const greeting=element('h2');
  greeting.id='vectorWelcomeTitle';
  const subtitle=element('p','Elige una rutina, crea tu propio entrenamiento o continúa donde lo dejaste.');
  copy.append(greeting,subtitle);
  const primary=element('button','Ver rutinas VECTOR');
  primary.id='vectorPrimaryAction';
  primary.type='button';
  welcome.append(copy,primary);
  const homeActions=home.querySelector('.home-actions');
  homeActions.before(welcome);
  const progress=element('details',undefined,'tools-details vector-home-section');
  progress.id='vectorProgressSection';
  const progressSummary=element('summary');
  const progressIcon=element('span','↗','vector-home-icon');
  progressIcon.setAttribute('aria-hidden','true');
  const caption=element('span',undefined,'vector-home-caption');
  caption.append(element('strong','Mi progreso'));
  const progressDescription=element('small');
  progressDescription.id='vectorProgressDescription';
  caption.append(progressDescription);
  progressSummary.append(progressIcon,caption);
  progress.append(progressSummary);
  const body=element('div',undefined,'vector-progress-content');
  const stats=element('div',undefined,'vector-progress-grid');
  const figures=[
    ['vectorSevenDays','Últimos 7 días'],
    ['vectorAllSessions','Sesiones totales'],
    ['vectorTrainingTime','Tiempo entrenado']
  ];
  for(const [id,label] of figures){
    const card=element('div',undefined,'vector-progress-stat');
    const number=element('strong','0');
    number.id=id;
    card.append(number,element('span',label));
    stats.append(card);
  }
  const latest=element('p',undefined);
  latest.id='vectorLastTraining';
  historyButton.textContent='Consultar mi historial';
  historyButton.classList.add('alt');
  body.append(stats,latest,historyButton,
    element('p','El historial se guarda en este dispositivo y en el perfil local seleccionado.','vector-progress-note'));
  progress.append(body);
  routines.after(progress);
  primary.addEventListener('click',()=>{
    if(typeof session!=='undefined'&&session&&typeof sessionWorkout!=='undefined'&&sessionWorkout){
      if(typeof active!=='undefined')active=sessionWorkout;
      if(typeof show==='function')show('guided');
    }else{
      routines.open=true;
      routines.scrollIntoView({behavior:'smooth',block:'start'});
      routines.querySelector('summary')?.focus({preventScroll:true});
    }
  });
  function safeHistory(){
    try{
      if(typeof getHistory!=='function')return [];
      const records=getHistory();
      return Array.isArray(records)?records:[];
    }catch(e){return []}
  }
  function elapsedSeconds(value){
    const n=Number(value);
    return Number.isFinite(n)&&n>0?Math.floor(n):0;
  }
  function refresh(){
    const profile=typeof localProfile!=='undefined'?localProfile:null;
    const name=profile?.name?.trim();
    greeting.textContent=name&&name!=='Principal'?'Hola, '+name:'Tu espacio VECTOR';
    const hasSession=typeof session!=='undefined'&&session&&typeof sessionWorkout!=='undefined'&&!!sessionWorkout;
    primary.textContent=hasSession?'▶ Continuar entrenamiento':'Explorar rutinas VECTOR';
    subtitle.textContent=hasSession
      ?'Tienes un entrenamiento sin finalizar. Puedes retomarlo cuando quieras.'
      :'Entrena a tu ritmo: elige una rutina VECTOR o crea la tuya.';
    const records=safeHistory();
    const today=Date.now();
    const lastWeek=records.filter(record=>{
      const date=new Date(record?.date).getTime();
      return Number.isFinite(date)&&date<=today&&today-date<7*24*60*60*1000;
    }).length;
    document.getElementById('vectorSevenDays').textContent=String(lastWeek);
    document.getElementById('vectorAllSessions').textContent=String(records.length);
    const minutes=Math.floor(records.reduce((sum,record)=>sum+elapsedSeconds(record?.elapsed),0)/60);
    document.getElementById('vectorTrainingTime').textContent=minutes<60?minutes+' min':Math.floor(minutes/60)+' h '+(minutes%60)+' min';
    progressDescription.textContent=records.length?records.length+' sesiones registradas':'Tu evolución, a tu ritmo';
    const dated=records.filter(record=>Number.isFinite(new Date(record?.date).getTime()))
      .sort((a,b)=>new Date(b.date)-new Date(a.date));
    if(dated.length){
      const last=dated[0];
      const date=new Date(last.date).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});
      latest.textContent='Última sesión: '+(last.name||'Entrenamiento')+' · '+date;
    }else latest.textContent='Cuando completes tu primera sesión, podrás ver aquí tu evolución.';
  }
  globalThis.vectorDashboard={refresh};
  refresh();
})();
