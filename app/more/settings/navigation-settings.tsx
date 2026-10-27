'use client';

import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowDown,ArrowUp,Plus,Trash2} from 'lucide-react';
import {createClient} from '@/lib/supabase/client';
import {reportMutationError,reportMutationSuccess} from '@/lib/client-ui';
import {mutationNotice,mutationProblem} from '@/lib/mutation-result';
import {DEFAULT_NAVIGATION_PANELS,MAX_NAVIGATION_PANELS,NAVIGATION_PANELS,normalizeNavigationPanels,type NavigationPanelId} from '@/lib/navigation-panels';

export default function NavigationSettings({camporeeId,organizationId,initialPanels,canEdit}:{camporeeId:string;organizationId:string;initialPanels:unknown;canEdit:boolean}) {
  const [panels,setPanels]=useState(()=>normalizeNavigationPanels(initialPanels));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const router=useRouter();
  const persistedPanels=JSON.stringify(normalizeNavigationPanels(initialPanels));
  useEffect(()=>{setPanels(JSON.parse(persistedPanels));setError('');},[persistedPanels]);
  function change(next:NavigationPanelId[]){setPanels(next);setError('');setNotice('');}
  function move(index:number,direction:number){const next=[...panels];[next[index],next[index+direction]]=[next[index+direction],next[index]];change(next);}
  async function save(){
    if(!canEdit||saving)return;
    setSaving(true);setError('');setNotice('');
    try{
      const result=await createClient().from('camporees').update({navigation_panels:panels}).eq('organization_id',organizationId).eq('id',camporeeId).select('id');
      const problem=mutationProblem(result,[camporeeId]);
      if(problem){setError(reportMutationError(problem,'No se pudo guardar la barra de navegación.'));return;}
      const message=mutationNotice(result.status,'Barra de navegación guardada para todo el camporee.');
      setNotice(message);reportMutationSuccess(message);
      if(result.status!==202)router.refresh();
    }catch(err){setError(reportMutationError(err,'No se pudo guardar la barra de navegación.'));}finally{setSaving(false);}
  }
  if(!canEdit)return null;
  return <section className='polymet-settings-card navigation-settings' aria-labelledby='navigation-settings-title'>
    <h2 id='navigation-settings-title'>Barra de navegación</h2>
    <p>Elige los accesos que verá todo el camporee. Inicio y Más siempre estarán disponibles. Puedes añadir hasta tres paneles entre ellos.</p>
    <form onSubmit={event=>{event.preventDefault();void save();}}>
      <fieldset disabled={saving}>
        <div className='navigation-fixed'>Inicio <small>Siempre visible</small></div>
        {panels.map((id,index)=><div className='navigation-setting-row' key={index}>
          <label htmlFor={`navigation-panel-${index}`}>Panel {index+1}<select id={`navigation-panel-${index}`} value={id} onChange={event=>change(panels.map((value,i)=>i===index?event.target.value as NavigationPanelId:value))}>
            {NAVIGATION_PANELS.filter(panel=>panel.id===id||!panels.includes(panel.id)).map(panel=><option key={panel.id} value={panel.id}>{panel.label}</option>)}
          </select></label>
          <div className='navigation-setting-actions'>
            <button type='button' className='secondary-btn' aria-label={`Subir panel ${index+1}`} disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={18}/></button>
            <button type='button' className='secondary-btn' aria-label={`Bajar panel ${index+1}`} disabled={index===panels.length-1} onClick={()=>move(index,1)}><ArrowDown size={18}/></button>
            <button type='button' className='secondary-btn' aria-label={`Quitar panel ${index+1}`} onClick={()=>change(panels.filter((_,i)=>i!==index))}><Trash2 size={18}/></button>
          </div>
        </div>)}
        <button type='button' className='secondary-btn navigation-add' disabled={panels.length>=MAX_NAVIGATION_PANELS} onClick={()=>{const next=NAVIGATION_PANELS.find(panel=>!panels.includes(panel.id));if(next)change([...panels,next.id]);}}><Plus size={18}/> Añadir panel</button>
        <div className='navigation-fixed'>Más <small>Siempre visible</small></div>
        <div className='navigation-preview' aria-label='Vista previa de la barra'>{['Inicio',...panels.map(id=>NAVIGATION_PANELS.find(panel=>panel.id===id)!.label),'Más'].map(label=><span key={label}>{label}</span>)}</div>
        {error?<div className='auth-alert error' role='alert'>{error}</div>:null}
        {notice?<div className='auth-alert success' role='status'>{notice}</div>:null}
        <div className='navigation-save-actions'><button type='submit' className='primary-btn'>{saving?'Guardando…':'Guardar barra'}</button><button type='button' className='secondary-btn' onClick={()=>change([...DEFAULT_NAVIGATION_PANELS])}>Restablecer</button></div>
      </fieldset>
    </form>
  </section>;
}
