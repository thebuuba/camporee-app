import Link from '@/app/components/tenant-link';
import { History, Plus, Pencil, Trash2 } from 'lucide-react';
import { formatCamporeeDateTime } from '@/lib/camporee-locale';
import { tenantPath } from '@/lib/tenant-context';
import { requireCamporeeContext, type PanelSearchParams, type TenantPageParams } from '@/lib/tenant-server';
import styles from './history.module.css';

const labels:Record<string,string>={
  camporees:'camporee',areas:'área',tasks:'tarea',task_checklist_items:'paso de tarea',
  schedule_events:'actividad del programa',lists:'lista',list_items:'elemento de lista',
  meals:'comida',meal_ingredients:'ingrediente',participants:'participante',
  expenses:'gasto',income_entries:'ingreso',notes:'apunte',inventory_items:'artículo de inventario',
  emergency_contacts:'contacto de emergencia',camporee_documents:'documento',
  announcements:'aviso',attendance_sessions:'pase de lista',attendance_marks:'marca de asistencia',
  camporee_activities:'competencia',camporee_activity_participants:'participante de competencia',
};
const actions={created:{label:'creó',Icon:Plus},updated:{label:'modificó',Icon:Pencil},deleted:{label:'eliminó',Icon:Trash2}} as const;

export default async function HistoryPage({params,searchParams}:{params?:TenantPageParams;searchParams?:PanelSearchParams}={}) {
  const context=await requireCamporeeContext(params,'/more/history',searchParams);
  const query=searchParams?await searchParams:{};
  const raw=Array.isArray(query.page)?query.page[0]:query.page;
  const page=raw&&/^\d+$/.test(raw)?Math.min(Number(raw),100):0;
  const size=25;
  const {data:history,error}=await context.supabase.from('activity_history')
    .select('id,actor_name,action,entity_type,entity_title,created_at')
    .eq('camporee_id',context.camporeeId).order('created_at',{ascending:false}).order('id',{ascending:false})
    .range(page*size,page*size+size);
  if(error)throw error;
  const rows=(history??[]).slice(0,size);
  const href=tenantPath(context,'/more/history');
  return <main className="app panel-page polymet-detail-page">
    <header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver a Más">‹</Link><div><div className="eyebrow">REGISTRO</div><h1>Historial</h1><p className="polymet-subtitle">Cambios en este camporee</p></div><span className="avatar"><History size={22}/></span></header>
    {rows.length?<ol className={styles.feed}>{rows.map(entry=>{
      const action=actions[entry.action as keyof typeof actions]??actions.updated;
      const Icon=action.Icon;
      const type=labels[entry.entity_type]??'elemento';
      return <li key={entry.id} className={`${styles.entry} ios-card`}>
        <span className={styles.icon} data-action={entry.action}><Icon size={16} aria-hidden="true"/></span>
        <div className={styles.copy}><p><strong>{entry.actor_name}</strong> {action.label} {type}</p><span className={styles.title}>{entry.entity_title}</span><time dateTime={entry.created_at}>{formatCamporeeDateTime(entry.created_at,context.camporee.time_zone)}</time></div>
      </li>;
    })}</ol>:<div className="empty compact">{page?'No hay más movimientos.':'Los cambios nuevos aparecerán aquí cuando alguien guarde una acción.'}</div>}
    <nav className={styles.pagination} aria-label="Páginas del historial">
      {page>0?<Link href={`${href}${page===1?'':`?page=${page-1}`}`} className={styles.pageLink}>Más recientes</Link>:null}
      {(history?.length??0)>size?<Link href={`${href}?page=${page+1}`} className={styles.pageLink}>Anteriores</Link>:null}
    </nav>
  </main>;
}
