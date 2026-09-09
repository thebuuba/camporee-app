'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Search, ShieldCheck, UserRoundCheck, UserRoundX, UsersRound, X } from 'lucide-react';
import { updateMemberAccess } from './actions';

type UserRow = {
  user_id:string;
  role:string;
  permissions:Record<string,boolean>;
  is_active:boolean;
  created_at:string;
  full_name:string|null;
  email:string|null;
  is_self:boolean;
};

const permissionLabels = [
  ['tasks','Tareas'],['schedule','Programa'],['participants','Participantes'],['finances','Finanzas'],['meals','Comidas'],['notes','Apuntes'],['lists','Listas'],['inventory','Inventario'],['settings','Ajustes'],
] as const;

const roleLabel = (role:string) => role === 'admin' ? 'Administrador' : role === 'editor' ? 'Editor' : 'Solo lectura';

type Filter = 'all'|'pending'|'active';

export default function UsersManager({ users }: { users:UserRow[] }) {
  const [query,setQuery] = useState('');
  const [filter,setFilter] = useState<Filter>(users.some((user) => !user.is_active) ? 'pending' : 'all');
  const [openId,setOpenId] = useState<string|null>(null);

  const counts = useMemo(() => ({
    all:users.length,
    pending:users.filter((user) => !user.is_active).length,
    active:users.filter((user) => user.is_active).length,
  }),[users]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users
      .filter((user) => filter === 'pending' ? !user.is_active : filter === 'active' ? user.is_active : true)
      .filter((user) => !needle || `${user.full_name ?? ''} ${user.email ?? ''}`.toLowerCase().includes(needle))
      .sort((a,b) => {
        if (a.is_self !== b.is_self) return a.is_self ? -1 : 1;
        if (a.is_active !== b.is_active) return a.is_active ? 1 : -1;
        return (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? '', 'es');
      });
  },[users,filter,query]);

  return <>
    <section className='user-admin-summary'>
      <button className={`user-filter ${filter==='pending'?'active':''}`} type='button' onClick={() => setFilter('pending')}><UserRoundX size={17}/><span>Pendientes</span><b>{counts.pending}</b></button>
      <button className={`user-filter ${filter==='active'?'active':''}`} type='button' onClick={() => setFilter('active')}><UserRoundCheck size={17}/><span>Activos</span><b>{counts.active}</b></button>
      <button className={`user-filter ${filter==='all'?'active':''}`} type='button' onClick={() => setFilter('all')}><UsersRound size={17}/><span>Todos</span><b>{counts.all}</b></button>
    </section>

    <div className='user-search'>
      <Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Buscar por nombre o correo' aria-label='Buscar usuarios'/>{query?<button type='button' onClick={() => setQuery('')} aria-label='Limpiar búsqueda'><X size={16}/></button>:null}
    </div>

    {counts.pending > 0 && filter !== 'pending' ? <button className='pending-callout' type='button' onClick={() => setFilter('pending')}><span><UserRoundX size={18}/><strong>{counts.pending} {counts.pending===1?'cuenta pendiente':'cuentas pendientes'}</strong></span><small>Revisar y activar</small></button> : null}

    <div className='user-list-head'><span>{filtered.length} {filtered.length===1?'persona':'personas'}</span><small>{filter==='pending'?'Esperando aprobación':filter==='active'?'Con acceso a la app':'Todas las cuentas'}</small></div>

    <section className='compact-member-list'>
      {filtered.map((user) => {
        const isOpen = openId === user.user_id;
        const display = user.full_name || user.email || 'Sin nombre';
        return <article className={`compact-member ios-card ${!user.is_active?'pending-user':''}`} key={user.user_id}>
          <button className='compact-member-summary' type='button' onClick={() => setOpenId(isOpen ? null : user.user_id)} aria-expanded={isOpen}>
            <div className='member-avatar'>{display.slice(0,1).toUpperCase()}</div>
            <div className='compact-member-copy'><strong>{display}{user.is_self?' · Tú':''}</strong><small>{user.email || 'Correo no disponible'}</small><div className='member-badges'><span className={`member-status ${user.is_active?'active':'pending'}`}>{user.is_active?<><CheckCircle2 size={12}/> Activo</>:<>Pendiente</>}</span><span className='member-role'>{roleLabel(user.role)}</span></div></div>
            <ChevronDown size={19} className={`member-chevron ${isOpen?'open':''}`}/>
          </button>

          {isOpen ? <form action={updateMemberAccess} className='compact-member-editor'>
            <input type='hidden' name='userId' value={user.user_id}/>
            <div className='member-editor-top'>
              <label><span>Acceso</span><span className='switch'><input type='checkbox' name='isActive' defaultChecked={user.is_active} disabled={user.is_self}/><i/></span></label>
              {user.is_self ? <input type='hidden' name='isActive' value='on'/> : null}
              <label><span>Rol</span><select name='role' defaultValue={user.role} disabled={user.is_self}><option value='admin'>Administrador</option><option value='editor'>Editor</option><option value='viewer'>Solo lectura</option></select></label>
              {user.is_self ? <input type='hidden' name='role' value='admin'/> : null}
            </div>
            <div className='permission-title'><strong>Permisos específicos</strong><small>Activa solo los módulos que esta persona puede editar.</small></div>
            <div className='permission-grid'>{permissionLabels.map(([key,label]) => <label className='permission-chip' key={key}><input type='checkbox' name={key} defaultChecked={Boolean(user.permissions[key])}/><span>{label}</span></label>)}</div>
            <button className='primary-btn member-save' type='submit'><ShieldCheck size={16}/> Guardar cambios</button>
          </form> : null}
        </article>;
      })}
      {!filtered.length ? <div className='empty compact'>No hay usuarios que coincidan con este filtro.</div> : null}
    </section>
  </>;
}
