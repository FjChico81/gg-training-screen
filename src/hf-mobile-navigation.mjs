/**
 * HF mobile-first primary navigation.
 *
 * Presentation-only enhancement: moves existing DOM nodes, preserving their
 * IDs, handlers, data and originals. Never reads or writes workout storage.
 * It is mounted exclusively inside setupHF() after checking isHF.
 */
export function mountHFMobileNavigation(doc,{profileLabel='Principal'}={}){
  const library=doc.getElementById('library');
  const panel=library?.querySelector('.panel');
  if(!panel)throw Error('No se ha encontrado la biblioteca HF.');
  if(doc.getElementById('hfPrimaryNavigation'))throw Error('La navegación HF ya está montada.');

  const title=panel.querySelector('.library-title');
  const intro=panel.querySelector('.hf-class-intro');
  const classChooser=panel.querySelector('.hf-class-chooser');
  const organizer=doc.getElementById('hfClubOrganizer');
  const resume=doc.getElementById('hfResumeClass');
  const actions=panel.querySelector('.home-actions');
  const filters=doc.getElementById('libraryFilters');
  const saved=doc.getElementById('saved');
  const settings=doc.getElementById('settingsPanel');
  const profile=doc.getElementById('localProfilePanel');
  const cloud=doc.getElementById('ggCloudPanel');
  const exerciseLibrary=doc.getElementById('exerciseLibraryOpen');
  const vectorRoutines=doc.getElementById('vectorRoutines');
  if(!title||!intro||!classChooser||!organizer||!resume||!actions||
     !filters||!saved||!settings||!profile||!exerciseLibrary)
    throw Error('Falta algún componente de la pantalla HF. No se ha modificado la biblioteca.');

  const create=(tag,text,className)=>{
    const element=doc.createElement(tag);
    if(text!==undefined)element.textContent=text;
    if(className)element.className=className;
    return element;
  };
  const nav=create('nav',undefined,'hf-primary-tabs');
  nav.id='hfPrimaryNavigation';
  nav.setAttribute('role','tablist');
  nav.setAttribute('aria-label','Navegación principal HF');
  const panels={
    home:create('section',undefined,'hf-primary-page'),
    workouts:create('section',undefined,'hf-primary-page'),
    classes:create('section',undefined,'hf-primary-page')
  };
  const tabs=new Map();
  const names={home:'Inicio',workouts:'Mis entrenamientos',classes:'Clases'};
  for(const [key,section] of Object.entries(panels)){
    section.id='hfPrimaryPage'+key;
    section.setAttribute('role','tabpanel');
    const tab=create('button',names[key],'hf-primary-tab');
    tab.id='hfPrimaryTab'+key;
    tab.type='button';
    tab.setAttribute('role','tab');
    tab.setAttribute('aria-controls',section.id);
    section.setAttribute('aria-labelledby',tab.id);
    tab.onclick=()=>selectTab(key);
    tabs.set(key,tab);
    nav.append(tab);
  }
  function selectTab(key,{focus=false}={}){
    if(!Object.hasOwn(panels,key))return;
    for(const [name,section] of Object.entries(panels)){
      const active=key===name,tab=tabs.get(name);
      section.hidden=!active;
      tab.setAttribute('aria-selected',String(active));
      tab.tabIndex=active?0:-1;
    }
    if(focus)tabs.get(key).focus();
  }
  nav.onkeydown=event=>{
    const keys=Object.keys(panels);
    const current=keys.findIndex(key=>tabs.get(key).getAttribute('aria-selected')==='true');
    const next=event.key==='ArrowRight'?(current+1)%keys.length:
      event.key==='ArrowLeft'?(current+keys.length-1)%keys.length:
      event.key==='Home'?0:
      event.key==='End'?keys.length-1:-1;
    if(next<0)return;
    event.preventDefault();
    selectTab(keys[next],{focus:true});
  };

  // Short home: no list of classes, workouts, history, profile or cloud.
  const heading=create('h2','¿Qué quieres hacer hoy?','hf-home-heading');
  const profileName=String(profileLabel||'').trim().slice(0,50);
  const context=create('p','Perfil: '+profileName,'hf-home-profile');
  context.hidden=!profileName||profileName==='Principal';
  const shortcuts=create('div',undefined,'hf-home-shortcuts');
  function shortcut(symbol,label,description,target){
    const button=create('button',undefined,'hf-home-shortcut');
    button.type='button';
    button.setAttribute('aria-label',label);
    const icon=create('span',symbol,'hf-home-shortcut-icon');
    icon.setAttribute('aria-hidden','true');
    button.append(icon,create('strong',label),create('small',description));
    button.onclick=()=>selectTab(target);
    return button;
  }
  shortcuts.append(
    shortcut('▤','Mis entrenamientos','Rutinas y sesiones personales','workouts'),
    shortcut('▶','Impartir una clase','Clase guiada o circuito','classes')
  );
  panels.home.append(heading,context,resume,shortcuts);

  // Saved workouts and the individual history are together and nowhere else.
  title.textContent='Mis entrenamientos';
  panels.workouts.append(title,actions,filters,saved);
  // Classes, templates, favorites and collective history are one destination.
  intro.hidden=true; // The existing class chooser already explains the options.
  const classHint=classChooser.querySelector('p');
  if(classHint)classHint.textContent='Elige el formato y después el dispositivo.';
  panels.classes.append(classChooser,intro,organizer);

  // Secondary tools leave the main mobile screen; IDs and listeners survive.
  const toolsHeading=create('h3','Perfil y sincronización','hf-settings-section-title');
  const settingsLabel=create('p','Biblioteca y otras herramientas','hf-settings-section-caption');
  const closeButton=doc.getElementById('closeSettings');
  const addProfile=doc.getElementById('addLocalProfile');
  // Additional local HF profiles deliberately have no cloud panel.
  if(closeButton){
    closeButton.after(toolsHeading,profile);
    if(addProfile)profile.after(addProfile);
    const anchor=addProfile||profile;
    if(cloud)anchor.after(cloud);
    (cloud||anchor).after(settingsLabel,exerciseLibrary);
  }else{
    settings.append(toolsHeading,profile);
    if(cloud)settings.append(cloud);
    settings.append(settingsLabel,exerciseLibrary);
  }
  profile.classList.add('hf-settings-profile');
  if(cloud)cloud.classList.add('hf-settings-cloud');
  exerciseLibrary.classList.add('hf-settings-exercise');
  if(vectorRoutines)vectorRoutines.classList.add('hf-hidden-vector-routines');

  // Keep only the navigation and its three pages in the HF library panel.
  panel.prepend(nav);
  panel.append(panels.home,panels.workouts,panels.classes);
  selectTab('home');
  return Object.freeze({selectTab,activeTab:()=>Object.keys(panels).find(k=>!panels[k].hidden)});
}
