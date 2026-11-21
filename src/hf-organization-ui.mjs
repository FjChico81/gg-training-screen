/**
 * HF-only organization view. This module owns DOM creation for club shortcuts;
 * it never changes the original routine library or any other edition.
 */
export function mountHFOrganization({
  host,store,tools,getWorkouts,onFavoriteFilter,onPresent,onDraft,onOpen,
  onRefreshLibrary,getFavoriteFilter,categoryForWorkout
}){
  if(!host||!store||!tools||typeof getWorkouts!=='function')throw Error('Falta el contexto autorizado HF');
  const document=host.ownerDocument;
  if(!document)throw Error('Interfaz de HF no disponible');
  let templateQuery='',templateCategory='Todas',historyLimit=10;
  const create=(tag,content,cls)=>{
    const x=document.createElement(tag);
    if(content!==undefined)x.textContent=content;
    if(cls)x.className=cls;
    return x;
  };
  const button=(caption,handler,cls='alt')=>{
    const x=create('button',caption,cls);x.type='button';x.onclick=handler;return x;
  };
  const section=(id,title)=>{
    const box=create('section',undefined,'hf-org-panel');box.id=id;
    box.append(create('h3',title));
    return box;
  };
  const errorBox=create('p','','hf-org-error');errorBox.setAttribute('role','status');
  function safe(action){
    try{action();errorBox.textContent='';}catch(err){errorBox.textContent=err?.message||'No se pudo completar la operación HF';}
  }
  const wrapper=create('div',undefined,'hf-club-organizer');
  const summary=create('p','Favoritos, plantillas reutilizables e historial de clases impartidas en este navegador. No se mezclan con el historial individual.','hf-org-caption');
  const favorites=section('hfClubFavorites','★ Favoritos');
  const favoriteActions=create('div',undefined,'hf-org-actions');
  const favoriteList=create('div',undefined,'hf-org-list');
  favorites.append(favoriteActions,favoriteList);
  const templates=section('hfClubTemplates','▦ Plantillas de clase');
  const templateIntro=create('p','Guarda una plantilla desde el menú ⋯ de cualquier rutina HF. Podrás presentarla o utilizarla como base de una nueva rutina.','hf-org-caption');
  const filterRow=create('div',undefined,'hf-org-filters');
  const search=create('input');search.type='search';search.placeholder='Buscar plantilla';search.setAttribute('aria-label','Buscar plantilla');
  const category=document.createElement('select');category.setAttribute('aria-label','Categoría de plantilla');
  for(const name of ['Todas',...tools.HF_CATEGORIES]){
    const option=create('option',name);option.value=name;category.append(option);
  }
  const templateList=create('div',undefined,'hf-org-list');
  filterRow.append(search,category);
  templates.append(templateIntro,filterRow,templateList);
  const history=section('hfClubHistory','◷ Historial colectivo');
  const historyList=create('div',undefined,'hf-org-list');
  const historyActions=create('div',undefined,'hf-org-actions');
  const moreHistory=button('Ver más registros',()=>{historyLimit+=20;renderHistory();});
  const exportHistory=button('Exportar datos HF',()=>safe(()=>{
    const data=tools.exportHFCollectiveData(store);
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download='HF-colectivo-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }));
  historyActions.append(moreHistory,exportHistory);
  history.append(historyList,historyActions);
  // One visible panel at a time: prevents a long, cluttered mobile homepage.
  // The three panels are still present in the DOM with accessible tab semantics.
  const tabs=create('div',undefined,'hf-org-tabs');
  tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label','Organización de clases HF');
  const panels={favorites,templates,history};
  const tabMap=new Map();
  const labels={favorites:'★ Favoritos',templates:'▦ Plantillas',history:'◷ Historial'};
  function selectTab(key){
    if(!Object.hasOwn(panels,key))return;
    for(const [name,panel] of Object.entries(panels)){
      const active=name===key,tab=tabMap.get(name);
      panel.hidden=!active;
      tab.setAttribute('aria-selected',String(active));
      tab.tabIndex=active?0:-1;
    }
  }
  for(const [key,panel] of Object.entries(panels)){
    const tab=button(labels[key],()=>selectTab(key),'hf-org-tab');
    tab.id='hfOrgTab'+key;
    tab.setAttribute('role','tab');
    tab.setAttribute('aria-controls',panel.id);
    panel.setAttribute('role','tabpanel');
    panel.setAttribute('aria-labelledby',tab.id);
    tabMap.set(key,tab);
    tabs.append(tab);
  }
  tabs.onkeydown=event=>{
    const keys=Object.keys(panels);
    const selected=keys.findIndex(key=>tabMap.get(key).getAttribute('aria-selected')==='true');
    const next=event.key==='ArrowRight'?(selected+1)%keys.length:
      event.key==='ArrowLeft'?(selected+keys.length-1)%keys.length:
      event.key==='Home'?0:event.key==='End'?keys.length-1:-1;
    if(next<0)return;
    event.preventDefault();
    selectTab(keys[next]);
    tabMap.get(keys[next]).focus();
  };
  selectTab('favorites');
  wrapper.append(summary,errorBox,tabs,favorites,templates,history);
  host.replaceChildren(wrapper);

  function renderFavorites(){
    favoriteActions.replaceChildren();
    favoriteList.replaceChildren();
    const only=Boolean(getFavoriteFilter());
    const filter=button(only?'Mostrar todas las rutinas':'Ver solo favoritas',()=>{
      onFavoriteFilter(!only);
    });
    favoriteActions.append(filter);
    const ids=tools.listHFFavorites(store);
    const known=new Map(getWorkouts().map(w=>[w.id,w]));
    const available=ids.map(id=>known.get(id)).filter(Boolean);
    if(!available.length){
      favoriteList.append(create('p','No hay rutinas favoritas disponibles en este perfil. Puedes marcar una con ☆.','hf-org-empty'));
      return;
    }
    for(const workout of available.slice().reverse().slice(0,25)){
      const card=create('div',undefined,'hf-org-line');
      const title=create('strong',workout.name);
      const actions=create('div',undefined,'hf-org-actions');
      actions.append(button('Presentar',()=>onPresent(workout,'guided')),
        button('Abrir',()=>onOpen(workout.id)));
      card.append(title,actions);favoriteList.append(card);
    }
    if(available.length>25)favoriteList.append(create('p',
      'Se muestran 25 favoritos. Los demás siguen disponibles en la biblioteca.','hf-org-caption'));
  }
  function renderTemplates(){
    templateList.replaceChildren();
    const all=tools.listHFTemplates(store).sort((a,b)=>b.createdAt-a.createdAt);
    const filtered=all.filter(t=>(templateCategory==='Todas'||t.category===templateCategory)&&
      t.name.toLocaleLowerCase('es-ES').includes(templateQuery.toLocaleLowerCase('es-ES')));
    if(!filtered.length){
      templateList.append(create('p',all.length?'No hay plantillas que coincidan.':'Aún no hay plantillas guardadas.','hf-org-empty'));
      return;
    }
    for(const tmpl of filtered){
      const card=create('div',undefined,'hf-org-line');
      const content=create('div');
      content.append(create('strong',tmpl.name),
        create('p',tmpl.category+' · '+tmpl.workout.blocks.length+' bloques','hf-org-caption'));
      const actions=create('div',undefined,'hf-org-actions');
      const editBox=create('div',undefined,'hf-org-edit');
      editBox.hidden=true;
      const nameLabel=create('label','Nombre de plantilla');
      const nameField=create('input');nameField.type='text';nameField.maxLength=70;
      nameField.value=tmpl.name;nameField.setAttribute('aria-label','Nombre de plantilla');
      const categoryLabel=create('label','Categoría');
      const categoryField=create('select');
      categoryField.setAttribute('aria-label','Categoría de la plantilla');
      for(const categoryName of tools.HF_CATEGORIES){
        const option=create('option',categoryName);option.value=categoryName;
        categoryField.append(option);
      }
      categoryField.value=tmpl.category;
      editBox.append(nameLabel,nameField,categoryLabel,categoryField,
        button('Guardar cambios',()=>safe(()=>{
          tools.renameHFTemplate(store,tmpl.id,{name:nameField.value,category:categoryField.value});
          renderTemplates();
        })),
        button('Cancelar',()=>{editBox.hidden=true;}));
      const templateWorkout={...tmpl.workout,name:tmpl.name};
      actions.append(
        button('Presentar',()=>onPresent(templateWorkout,'guided')),
        button('Estaciones',()=>onPresent(templateWorkout,'stations')),
        button('Usar en editor',()=>onDraft(tmpl)),
        button('Editar datos',()=>{editBox.hidden=!editBox.hidden;}),
        button('Quitar',()=>safe(()=>{
          if(!confirm('¿Eliminar solo la plantilla «'+tmpl.name+'»? La rutina de origen y el historial no se modificarán.'))return;
          tools.removeHFTemplate(store,tmpl.id);
          renderTemplates();
        }))
      );
      card.append(content,actions,editBox);templateList.append(card);
    }
  }
  function niceDuration(ms){
    const mins=Math.floor(ms/60000),seconds=Math.floor(ms%60000/1000);
    return String(mins).padStart(2,'0')+':'+String(seconds).padStart(2,'0');
  }
  function renderHistory(){
    historyList.replaceChildren();
    const all=tools.listHFCollectiveHistory(store);
    if(!all.length){
      historyList.append(create('p','Todavía no se ha finalizado ninguna clase colectiva en este dispositivo.','hf-org-empty'));
      moreHistory.hidden=true;return;
    }
    for(const entry of all.slice(0,historyLimit)){
      const card=create('details',undefined,'hf-org-history');
      const date=new Date(entry.endedAt);
      const title=create('summary',entry.title+' · '+date.toLocaleDateString('es-ES'));
      const meta=create('p',
        (entry.mode==='stations'?'Circuito por estaciones':'Clase guiada')+
        ' · '+niceDuration(entry.elapsedMs)+' · '+entry.progress+'/'+entry.total+
        ' pasos/rotaciones · '+(entry.outcome==='completed'?'Completada':'Terminada manualmente'),
        'hf-org-caption');
      card.append(title,meta);
      for(const result of entry.results){
        const performance=result.type==='amrap'?
          ' · '+(result.rounds??0)+' rondas + '+(result.partial??0)+' ejercicios':
          result.type==='for-time'?' · '+(result.complete?'Completado':'No completado'):'';
        card.append(create('p',result.type.toUpperCase().replace('FOR-TIME','FOR TIME')+
          ' · '+result.label+' · '+niceDuration(result.seconds*1000)+performance,'hf-org-caption'));
      }
      historyList.append(card);
    }
    moreHistory.hidden=all.length<=historyLimit;
    const heading=history.querySelector('h3');
    if(heading)heading.textContent='◷ Historial colectivo · '+all.length+' clases';
  }
  search.oninput=()=>{templateQuery=search.value;safe(renderTemplates)};
  category.onchange=()=>{templateCategory=category.value;safe(renderTemplates)};
  return Object.freeze({
    openTab:key=>selectTab(key),
    refresh(){
      try{
        renderFavorites();renderTemplates();renderHistory();errorBox.textContent='';
      }catch(err){
        errorBox.textContent='No se puede leer la organización local: '+(err?.message||'Error');
      }
    }
  });
}
