import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Search, CheckCircle2, Users, CalendarDays, Utensils, ListChecks, StickyNote, FileText, WalletCards, PackageCheck, HeartPulse } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const term = q.trim();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect('/login');
  const [{ data: member }, { data: camporees }] = await Promise.all([
    supabase.from('app_members').select('is_active').eq('user_id', userId).maybeSingle(),
    supabase.from('camporees').select('id,status').order('starts_on', { ascending: true }),
  ]);
  if (!member?.is_active) redirect('/login');
  const camporee = camporees?.find((c) => c.status !== 'archived') ?? camporees?.[0];
  const empty = { tasks: [], participants: [], events: [], meals: [], lists: [], notes: [], documents: [], expenses: [], income: [], inventory: [], emergency: [] } as any;
  let results = empty;
  if (camporee && term.length >= 2) {
    const clean = term.replace(/[%_,()]/g, ' ').trim();
    const pattern = `%${clean}%`;
    const [tasks, participants, events, meals, lists, notes, documents, expenses, income, inventory, emergency] = await Promise.all([
      supabase.from('tasks').select('id,title,description,status').eq('camporee_id', camporee.id).or(`title.ilike.${pattern},description.ilike.${pattern}`).limit(8),
      supabase.from('participants').select('id,full_name,unit_name').eq('camporee_id', camporee.id).or(`full_name.ilike.${pattern},unit_name.ilike.${pattern}`).limit(8),
      supabase.from('schedule_events').select('id,title,location,starts_at').eq('camporee_id', camporee.id).or(`title.ilike.${pattern},location.ilike.${pattern}`).limit(8),
      supabase.from('meals').select('id,meal_type,menu,meal_date').eq('camporee_id', camporee.id).ilike('menu', pattern).limit(8),
      supabase.from('lists').select('id,title,category').eq('camporee_id', camporee.id).or(`title.ilike.${pattern},category.ilike.${pattern}`).limit(8),
      supabase.from('notes').select('id,title,body,note_date').eq('camporee_id', camporee.id).or(`title.ilike.${pattern},body.ilike.${pattern}`).limit(8),
      supabase.from('camporee_documents').select('id,title,document_type').eq('camporee_id', camporee.id).or(`title.ilike.${pattern},document_type.ilike.${pattern}`).limit(8),
      supabase.from('expenses').select('id,description,category,paid_by').eq('camporee_id', camporee.id).or(`description.ilike.${pattern},category.ilike.${pattern},paid_by.ilike.${pattern}`).limit(8),
      supabase.from('income_entries').select('id,description,category,received_from').eq('camporee_id', camporee.id).or(`description.ilike.${pattern},category.ilike.${pattern},received_from.ilike.${pattern}`).limit(8),
      supabase.from('inventory_items').select('id,name,notes').eq('camporee_id', camporee.id).or(`name.ilike.${pattern},notes.ilike.${pattern}`).limit(8),
      supabase.from('emergency_contacts').select('id,name,role,phone').eq('camporee_id', camporee.id).or(`name.ilike.${pattern},role.ilike.${pattern},phone.ilike.${pattern}`).limit(8),
    ]);
    results = { tasks: tasks.data ?? [], participants: participants.data ?? [], events: events.data ?? [], meals: meals.data ?? [], lists: lists.data ?? [], notes: notes.data ?? [], documents: documents.data ?? [], expenses: expenses.data ?? [], income: income.data ?? [], inventory: inventory.data ?? [], emergency: emergency.data ?? [] };
  }
  const financeRows = [...results.income.map((x:any)=>({...x,_kind:'Ingreso'})), ...results.expenses.map((x:any)=>({...x,_kind:'Gasto'}))];
  const groups = [
    ['Tareas', CheckCircle2, results.tasks, '/tasks', (x:any)=>x.title],
    ['Participantes', Users, results.participants, '/more/participants', (x:any)=>x.full_name],
    ['Programa', CalendarDays, results.events, '/program', (x:any)=>x.title],
    ['Comidas', Utensils, results.meals, '/more/meals', (x:any)=>x.menu],
    ['Listas', ListChecks, results.lists, '/more/lists', (x:any)=>x.title],
    ['Finanzas', WalletCards, financeRows, '/more/budget', (x:any)=>`${x._kind}: ${x.description}`],
    ['Inventario', PackageCheck, results.inventory, '/more/inventory', (x:any)=>x.name],
    ['Apuntes', StickyNote, results.notes, '/more/notes', (x:any)=>x.title || x.body],
    ['Documentos', FileText, results.documents, '/more/documents', (x:any)=>x.title],
    ['Emergencia', HeartPulse, results.emergency, '/more/emergency', (x:any)=>x.name],
  ] as const;
  const count = groups.reduce((n, [, , rows]) => n + rows.length, 0);
  return <main className="app panel-page">
    <header className="subpage-top"><Link href="/" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">ENCUENTRA TODO</div><h1>Buscar</h1></div><span className="avatar"><Search size={21}/></span></header>
    <form className="panel-search" action="/search"><Search size={18}/><input name="q" defaultValue={term} placeholder="Tarea, persona, comida, gasto…" autoFocus/><button type="submit" aria-label="Buscar">→</button></form>
    {!term ? <div className="empty compact">Escribe al menos dos letras para buscar en todo el camporee.</div> : term.length < 2 ? <div className="empty compact">Escribe un poco más para buscar.</div> : count === 0 ? <div className="empty compact">No encontré nada con “{term}”.</div> : groups.map(([title, Icon, rows, href, label]) => rows.length ? <section key={title} className="section-card ios-card search-results-group"><div className="section-head inside"><h3>{title}</h3><span>{rows.length}</span></div><div className="panel-list">{rows.map((row:any) => <Link href={href} className="panel-row search-result-row" key={`${title}-${row.id}`}><span className="stat-icon stat-green"><Icon size={17}/></span><div className="panel-row-copy"><strong>{label(row)}</strong><small>Ver en {title.toLowerCase()}</small></div><span className="chevron">›</span></Link>)}</div></section> : null)}
  </main>;
}
