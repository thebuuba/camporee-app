'use client';

import BottomSheet from '@/app/components/bottom-sheet';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCircle2, Loader2, ShieldCheck, Trash2, X } from 'lucide-react';
import { updateMemberAccess } from './actions';
import { createClient } from '@/lib/supabase/client';

type UserRow = {
  user_id:string;
  role:string;
  directive_role:string|null;
  permissions:Record<string,boolean>;
  is_active:boolean;
  created_at:string;
  full_name:string|null;
  email:string|null;
  avatar_url:string|null;
  is_self:boolean;
};

const permissionLabels = [
  ['tasks','Tareas'],['schedule','Programa'],['participants','Participantes'],['finances','Finanzas'],['meals','Comidas'],['notes','Apuntes'],['lists','Listas'],['inventory','Inventario'],['settings','Ajustes'],
] as const;

const roleLabel = (role:string) => role === 'admin' ? 'Administrador' : role === 'editor' ? 'Editor' : 'Solo lectura';

type Filter = 'pending'|'active';
type DeleteInvokeResult = { data?: { ok?: boolean } | null; error?: { message?: string } | null };

const directiveRoles = ['Director/a','Subdirector/a','Secretario/a','Tesorero/a','Consejero/a'];

// These modules share the application's existing editing permissions.
const permissionRows = [
  ['schedule','Programa'],['tasks','Tareas'],['schedule','Avisos'],
  ['participants','Pases de lista'],['schedule','Competencias'],['meals','Comidas'],
  ['participants','Participantes'],['lists','Listas'],['inventory','Inventario'],
  ['finances','Presupuesto'],['settings','Documentos'],['participants','Emergencia'],['notes','Apuntes'],
] as const;

function PermissionFields({ permissions }: { permissions:Record<string,boolean> }) {
  const [values, setValues] = useState(permissions);
  return <>
    <div className="permission-title"><strong>Permisos de edición por módulo</strong></div>
    {permissionLabels.map(([key]) => values[key] ? <input key={key} type="hidden" name={key} value="on"/> : null)}
    <div className="permission-grid">{permissionRows.map(([key,label]) => <label className="permission-chip" key={label}><span>{label}</span><input type="checkbox" role="switch" aria-label={label} checked={Boolean(values[key])} onChange={(event)=>setValues((current)=>({...current,[key]:event.target.checked}))}/></label>)}</div>
    <p className="permission-groups-note">Programa, avisos y competencias comparten permiso. Participantes, pases de lista y emergencia también.</p>
  </>;
}

function DirectiveRoleField({ value }: { value:string|null }) {
  const [choice, setChoice] = useState(value && !directiveRoles.includes(value) ? 'other' : value ?? '');
  return <div className="panel-form">
    <label className="pm-field"><span>Cargo en la directiva</span><select name={choice === 'other' ? undefined : 'directiveRole'} value={choice} onChange={(event)=>setChoice(event.target.value)}><option value="">Sin cargo</option>{directiveRoles.map((cargo)=><option key={cargo} value={cargo}>{cargo}</option>)}<option value="other">Otro</option></select></label>
    {choice === 'other' ? <label className="pm-field"><span>Nombre del cargo</span><input name="directiveRole" defaultValue={value && !directiveRoles.includes(value) ? value : ''} maxLength={80} required/></label> : null}
    <small>Los recordatorios se adaptan al cargo. El acceso se define con el rol y los permisos.</small>
  </div>;
}

export default function UsersManager({ users, directiveRolesAvailable }: { users:UserRow[]; directiveRolesAvailable:boolean }) {
  const [members,setMembers] = useState(users);
  const [filter,setFilter] = useState<Filter>(users.some((user) => !user.is_active) ? 'pending' : 'active');
  const [openId,setOpenId] = useState<string|null>(null);
  const [deletingId,setDeletingId] = useState<string|null>(null);
  const [deleteError,setDeleteError] = useState<string|null>(null);
  const [savingId,setSavingId] = useState<string|null>(null);
  const [savedId,setSavedId] = useState<string|null>(null);
  const [saveError,setSaveError] = useState<string|null>(null);
  const router = useRouter();
  const supabase = createClient();

  const counts = useMemo(() => ({
    pending:members.filter((user) => !user.is_active).length,
    active:members.filter((user) => user.is_active).length,
  }),[members]);

  const filtered = useMemo(() => {
    return members
      .filter((user) => filter === 'pending' ? !user.is_active : user.is_active)
      .sort((a,b) => {
        if (a.is_self !== b.is_self) return a.is_self ? -1 : 1;
        if (a.is_active !== b.is_active) return a.is_active ? 1 : -1;
        return (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? '', 'es');
      });
  },[members,filter]);

  async function saveAccess(event:FormEvent<HTMLFormElement>, user:UserRow) {
    event.preventDefault();
    if (savingId) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    setSaveError(null);
    setSavedId(null);
    setSavingId(user.user_id);

    try {
      const result = await updateMemberAccess(formData);
      if (!result.ok) throw new Error(result.error || 'No se pudieron guardar los cambios');

      const role = String(formData.get('role') ?? 'viewer');
      const isActive = formData.get('isActive') === 'on';
      const permissions:Record<string,boolean> = {};
      for (const [key] of permissionLabels) permissions[key] = formData.get(key) === 'on';

      setMembers((current) => current.map((member) => member.user_id === user.user_id ? {
        ...member,
        role,
        directive_role:String(formData.get('directiveRole') ?? '').trim() || null,
        is_active:isActive,
        permissions,
      } : member));
      setSavedId(user.user_id);
      window.setTimeout(() => setSavedId((current) => current === user.user_id ? null : current), 1600);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No se pudieron guardar los cambios');
    } finally {
      setSavingId(null);
    }
  }

  async function approveAccount(user:UserRow) {
    if (savingId) return;
    setSavingId(user.user_id); setSaveError(null);
    const formData = new FormData();
    formData.set('userId',user.user_id);
    formData.set('role',user.role === 'admin' ? 'editor' : user.role);
    formData.set('isActive','on');
    if (directiveRolesAvailable) formData.set('directiveRole',user.directive_role ?? '');
    for (const [key] of permissionLabels) if (user.permissions[key]) formData.set(key,'on');
    try {
      const result = await updateMemberAccess(formData);
      if (!result.ok) throw new Error(result.error || 'No se pudo aprobar la cuenta');
      setMembers((current) => current.map((member) => member.user_id === user.user_id ? {...member,is_active:true,role:user.role === 'admin' ? 'editor' : user.role} : member));
      router.refresh();
    } catch(error) { setSaveError(error instanceof Error ? error.message : 'No se pudo aprobar la cuenta'); }
    finally { setSavingId(null); }
  }

  async function removeAccount(user:UserRow) {
    if (user.is_self || deletingId) return;
    const display = user.full_name || user.email || 'esta cuenta';
    const confirmed = window.confirm(`¿Eliminar la cuenta de ${display}?\n\nPerderá el acceso inmediatamente. Su historial del camporee se conservará como registro y esta acción no se puede deshacer.`);
    if (!confirmed) return;

    setDeleteError(null);
    setDeletingId(user.user_id);
    try {
      const result = await supabase.functions.invoke('admin-delete-user', { body:{ userId:user.user_id } }) as DeleteInvokeResult;
      if (result.error || !result.data?.ok) throw new Error(result.error?.message || 'No se pudo eliminar la cuenta');
      setOpenId(null);
      setMembers((current) => current.filter((member) => member.user_id !== user.user_id));
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'No se pudo eliminar la cuenta');
    } finally {
      setDeletingId(null);
    }
  }

  return <>
    <section className='user-admin-summary'>
      <button className={`user-filter ${filter==='pending'?'active':''}`} type='button' onClick={() => setFilter('pending')} aria-pressed={filter==='pending'}><span>Por aprobar</span><b>{counts.pending}</b></button>
      <button className={`user-filter ${filter==='active'?'active':''}`} type='button' onClick={() => setFilter('active')} aria-pressed={filter==='active'}><span>Activos</span><b>{counts.active}</b></button>
    </section>

    {saveError ? <div className='auth-alert error'>{saveError}</div> : null}
    {deleteError ? <div className='auth-alert error'>{deleteError}</div> : null}
    <section className='compact-member-list'>
      {filtered.map((user) => {
        const isOpen = openId === user.user_id;
        const display = user.full_name || user.email || 'Sin nombre';
        const deleting = deletingId === user.user_id;
        const saving = savingId === user.user_id;
        const saved = savedId === user.user_id;
        if (!user.is_active) return <article className='polymet-pending-member ios-card' key={user.user_id}><div className='polymet-pending-main'><span className='member-avatar'>{display.split(' ').map((part) => part[0]).slice(0,2).join('').toUpperCase()}</span><div><strong>{display}</strong><small>{user.email || 'Correo no disponible'} · solicitó {new Date(user.created_at).toLocaleDateString('es-DO',{day:'numeric',month:'short'})}</small></div></div><div className='polymet-pending-actions'><button type='button' onClick={() => void removeAccount(user)} disabled={deleting}><X size={16}/>Rechazar</button><button type='button' onClick={() => void approveAccount(user)} disabled={saving}><Check size={16}/>Aprobar</button></div></article>;
        return <article className={`compact-member ios-card ${!user.is_active?'pending-user':''}`} key={user.user_id}>
          <button className='compact-member-summary' type='button' onClick={() => setOpenId(isOpen ? null : user.user_id)} aria-expanded={isOpen}>
            <div className='member-avatar'>{user.avatar_url ? <img src={user.avatar_url} alt=""/> : display.split(' ').filter(Boolean).map((part)=>part[0]).slice(0,2).join('').toUpperCase()}</div>
            <div className='compact-member-copy'><strong>{display}{user.is_self?' (tú)':''}</strong><small>{user.role === 'admin' || user.role === 'editor' ? 'Todos los módulos' : `${permissionRows.filter(([key])=>user.permissions[key]).length} módulos con edición`}</small></div>
            <span className={`member-role member-role-${user.role}`}>{roleLabel(user.role)}</span>
          </button>

          <BottomSheet open={isOpen} onClose={()=>setOpenId(null)} title={display} description={user.email || ""} busy={saving || deleting}><form onSubmit={(event) => void saveAccess(event,user)} className='compact-member-editor polymet-member-editor'>
            <input type='hidden' name='userId' value={user.user_id}/>
            <div className='member-editor-top'>
              <fieldset className="pm-role-picker"><legend>Rol</legend><div>{[['admin','Administrador','Acceso total'],['editor','Editor','Edita todos los módulos'],['viewer','Solo lectura','Ve todo, edita lo asignado']].map(([value,label,hint])=><label key={value}><input type="radio" name="role" value={value} defaultChecked={user.role===value} disabled={user.is_self}/><span><strong>{label}</strong><small>{hint}</small></span></label>)}</div></fieldset>
              {user.is_self ? <input type='hidden' name='role' value='admin'/> : null}
            </div>
            <PermissionFields key={user.user_id} permissions={user.permissions}/>
            {directiveRolesAvailable ? <DirectiveRoleField key={`${user.user_id}-${user.directive_role ?? ''}`} value={user.directive_role}/> : null}
            <details className="member-access-options"><summary>Acceso a la cuenta</summary><label><span>Cuenta activa</span><span className='switch'><input type='checkbox' name='isActive' defaultChecked={user.is_active} disabled={user.is_self}/><i/></span></label></details>
            {user.is_self ? <input type='hidden' name='isActive' value='on'/> : null}
            <button className='primary-btn member-save' type='submit' disabled={saving}>{saving?<><Loader2 size={16} className='spin'/> Guardando…</>:saved?<><CheckCircle2 size={16}/> Guardado</>:<><ShieldCheck size={16}/> Guardar cambios</>}</button>
            {!user.is_self ? <div className='member-danger-zone'><div><strong>Eliminar cuenta</strong><small>Quita el acceso de forma permanente. El historial del camporee se conserva.</small></div><button className='member-delete-btn' type='button' onClick={() => void removeAccount(user)} disabled={deleting}>{deleting?<Loader2 size={16} className='spin'/>:<Trash2 size={16}/>} {deleting?'Eliminando…':'Eliminar'}</button></div> : null}
          </form></BottomSheet>
        </article>;
      })}
      {!filtered.length ? <div className='empty compact'>No hay usuarios que coincidan con este filtro.</div> : null}
    </section>
  </>;
}
