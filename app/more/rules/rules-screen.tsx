'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowLeft,FileText,Image as ImageIcon,MessageCircle,Plus,Pencil,Share2,ShieldCheck} from 'lucide-react';
import Link from '@/app/components/tenant-link';
import {createClient} from '@/lib/supabase/client';
import {mutationProblem,mutationNotice} from '@/lib/mutation-result';
import {reportMutationError,reportMutationSuccess} from '@/lib/client-ui';
import {CAMPOREE_RULES,MAX_CAMPOREE_RULES,MAX_RULE_LENGTH,cleanCamporeeRule,formatCamporeeRulesForShare} from '@/lib/camporee-rules';
import {createCamporeeRulesFiles} from '@/lib/camporee-rules-export';
import styles from './rules.module.css';

type Props={camporeeName:string;camporeeId?:string;initialRules?:readonly string[];canEdit?:boolean;onClose?:()=>void;onSave?:(rules:string[])=>Promise<void>};

export default function RulesScreen({camporeeName,camporeeId,initialRules=CAMPOREE_RULES,canEdit=false,onClose,onSave}:Props) {
  const [rules,setRules]=useState<string[]>(()=>[...initialRules]);
  const [mode,setMode]=useState<'add'|'edit'|null>(null);
  const [selected,setSelected]=useState(0);
  const [draft,setDraft]=useState('');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [shareOpen,setShareOpen]=useState(false);
  const [shareFiles,setShareFiles]=useState<Awaited<ReturnType<typeof createCamporeeRulesFiles>>|null>(null);
  const [shareProblem,setShareProblem]=useState('');
  const input=useRef<HTMLTextAreaElement>(null);
  const router=useRouter();
  useEffect(()=>{setRules([...initialRules]);},[initialRules]);
  useEffect(()=>{
    if(!shareOpen)return;
    let active=true;
    createCamporeeRulesFiles(camporeeName,rules).then(files=>{
      if(active){setShareFiles(files);setShareProblem('');}
    }).catch(()=>{if(active)setShareProblem('No se pudieron preparar los archivos en este dispositivo.');});
    return()=>{active=false;};
  },[shareOpen,camporeeName,rules]);

  function download(files:File[]){
    for(const file of files){
      const url=URL.createObjectURL(file);
      const anchor=document.createElement('a');anchor.href=url;anchor.download=file.name;
      document.body.append(anchor);anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
    setNotice(files.length>1?'Imágenes descargadas. Puedes enviarlas desde tus archivos.':'Archivo descargado. Puedes enviarlo desde tus archivos.');
  }

  function shareDocuments(files:File[]){
    if(typeof navigator.share==='function'&&(!navigator.canShare||navigator.canShare({files}))){
      void navigator.share({files,title:`Reglas del camporee · ${camporeeName}`}).catch(cause=>{
        if(cause instanceof Error&&cause.name==='AbortError')return;
        download(files);
      });
    }else download(files);
  }

  function openEditor(next:'add'|'edit') {
    setError('');setNotice('');setMode(next);
    if(next==='edit'){setSelected(0);setDraft(rules[0]??'');}else setDraft('');
    requestAnimationFrame(()=>input.current?.focus());
  }

  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!canEdit||saving||!mode)return;
    const rule=cleanCamporeeRule(draft);
    if(!rule){setError('Escribe la regla antes de guardarla.');return;}
    if(rule.length>MAX_RULE_LENGTH){setError(`La regla puede tener hasta ${MAX_RULE_LENGTH} caracteres.`);return;}
    if(mode==='add'&&rules.length>=MAX_CAMPOREE_RULES){setError('Se alcanzó el máximo de reglas.');return;}
    const next=mode==='add'?[...rules,rule]:rules.map((item,index)=>index===selected?rule:item);
    setSaving(true);setError('');setNotice('');
    try {
      if(onSave)await onSave(next);
      else {
        if(!camporeeId)throw new Error('Falta el camporee para guardar las reglas.');
        const result=await createClient().from('camporee_rule_sets').update({rules:next}).eq('camporee_id',camporeeId).select('rules').single();
        const problem=mutationProblem(result);
        if(problem)throw problem;
        reportMutationSuccess(mutationNotice(result.status,'Reglas guardadas.'));
        if(result.status!==202)router.refresh();
      }
      setShareFiles(null);setRules(next);setMode(null);
      setNotice(onSave?'Guardado en este dispositivo. Se sincronizará al volver a conectarte.':'Reglas guardadas.');
    }catch(cause){setError(reportMutationError(cause,'No se pudo guardar la regla.'));}
    finally{setSaving(false);}
  }

  const share=`https://wa.me/?text=${encodeURIComponent(formatCamporeeRulesForShare(camporeeName,rules))}`;
  return <div className={styles.screen}>
    <div className={styles.content}>
      <header className={styles.top}>
        {onClose
          ? <button type="button" onClick={onClose} className={styles.back} aria-label="Volver a la copia sin conexión"><ArrowLeft size={21}/></button>
          : <Link href="/more" className={styles.back} aria-label="Volver a Más"><ArrowLeft size={21}/></Link>}
        <span className={styles.topTitle}>Reglas del camporee</span>
        <span className={styles.topIcon}><ShieldCheck size={20} aria-hidden="true"/></span>
      </header>
      <section className={styles.hero} aria-labelledby="rules-title">
        <span className={styles.eyebrow}>CONVIVENCIA · {rules.length} {rules.length===1?'REGLA':'REGLAS'}</span>
        <h1 id="rules-title">Nuestro compromiso en el camporee</h1>
        <p>{camporeeName}</p>
        <span className={styles.credit}>Caro y Juan Daniel</span>
        <div className={styles.actions}>
          <button type="button" className={styles.share} aria-expanded={shareOpen} aria-controls="rule-share-options" onClick={()=>{setShareOpen(open=>!open);setShareFiles(null);setShareProblem('');}}><Share2 size={18}/> Compartir</button>
          {shareOpen?<div id="rule-share-options" className={styles.shareOptions} aria-label="Opciones para compartir">
            <a href={share} target="_blank" rel="noopener noreferrer"><MessageCircle size={19}/><span><strong>WhatsApp</strong><small>Enviar las reglas como mensaje</small></span></a>
            <button type="button" disabled={!shareFiles} onClick={()=>shareFiles&&shareDocuments(shareFiles.images)}><ImageIcon size={19}/><span><strong>Imagen</strong><small>Compartir en PNG</small></span></button>
            <button type="button" disabled={!shareFiles} onClick={()=>shareFiles&&shareDocuments([shareFiles.pdf])}><FileText size={19}/><span><strong>PDF</strong><small>Documento tamaño carta</small></span></button>
            {!shareFiles&&!shareProblem?<p role="status">Preparando imagen y PDF…</p>:null}
            {shareProblem?<p role="alert">{shareProblem}</p>:null}
          </div>:null}
          {canEdit?<div className={styles.editActions}>
            <button type="button" onClick={()=>openEditor('add')} disabled={saving||rules.length>=MAX_CAMPOREE_RULES}><Plus size={17}/> Agregar regla</button>
            <button type="button" onClick={()=>openEditor('edit')} disabled={saving}><Pencil size={16}/> Editar reglas</button>
          </div>:null}
        </div>
        {mode?<form className={styles.editor} onSubmit={event=>void save(event)}>
          {mode==='edit'?<label>Regla que vas a editar
            <select value={selected} onChange={event=>{const index=Number(event.target.value);setSelected(index);setDraft(rules[index]);setError('');}}>
              {rules.map((rule,index)=><option key={index} value={index}>{index+1}. {rule}</option>)}
            </select>
          </label>:<strong>Nueva regla · {String(rules.length+1).padStart(2,'0')}</strong>}
          <label>Texto de la regla
            <textarea ref={input} value={draft} maxLength={MAX_RULE_LENGTH} rows={3} onChange={event=>setDraft(event.target.value)} required/>
          </label>
          {error?<p role="alert" className={styles.error}>{error}</p>:null}
          <div className={styles.formActions}><button type="button" onClick={()=>{setMode(null);setError('');}} disabled={saving}>Cancelar</button><button type="submit" disabled={saving}>{saving?'Guardando…':'Guardar regla'}</button></div>
        </form>:null}
        {notice?<p role="status" className={styles.notice}>{notice}</p>:null}
      </section>
      <ol className={styles.list} aria-label="Reglas del camporee">
        {rules.map((rule,index)=><li key={index} className={styles.rule}>
          <span className={styles.number} aria-hidden="true">{String(index+1).padStart(2,'0')}</span>
          <span>{rule}</span>
        </li>)}
      </ol>
      <p className={styles.end}>Cuidarnos y respetarnos hace mejor esta experiencia para todos.</p>
    </div>
  </div>;
}
