'use client';

import {useState, type FormEvent, type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {tenantPath} from '@/lib/tenant-context';
import {createOrganization,createCamporee,createInvitation,acceptInvitation,joinCamporee,createJoinCode} from './actions';

type Kind='create-organization'|'create-camporee'|'invite'|'accept'|'join'|'create-join-code';
const actions={'create-organization':createOrganization,'create-camporee':createCamporee,invite:createInvitation,accept:acceptInvitation,join:joinCamporee,'create-join-code':createJoinCode};
export default function OrganizationForm({kind,children,submitLabel}:{kind:Kind;children:ReactNode;submitLabel:string}) {
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [invitationUrl,setInvitationUrl]=useState('');
  const [joinCode,setJoinCode]=useState('');
  const [createdCamporeePath,setCreatedCamporeePath]=useState('');
  const router=useRouter();
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(loading)return;
    if(!navigator.onLine){setError('Necesitas conexión para administrar organizaciones e invitaciones.');return;}
    const form=new FormData(event.currentTarget);
    setLoading(true);setError('');setInvitationUrl('');setJoinCode('');
    try {
      const result=await actions[kind](form);
      if(!result.ok){setError(result.error);return;}
      if(kind==='create-camporee' && result.camporeeId && result.organizationId
        && result.joinCode && result.invitationToken){
        setJoinCode(result.joinCode);
        setInvitationUrl(new URL(`/join/${result.invitationToken}`,window.location.origin).toString());
        setCreatedCamporeePath(tenantPath({organizationId:result.organizationId,camporeeId:result.camporeeId}));
        return;
      }
      if(result.invitationToken){setInvitationUrl(new URL(kind==='create-join-code'? `/join/${result.invitationToken}`:`/invitations/${result.invitationToken}`,window.location.origin).toString());return;}
      if(kind==='join'&&result.camporeeId){router.push('/');router.refresh();return;}
      if(result.organizationId){
        router.push(result.camporeeId?tenantPath({organizationId:result.organizationId,camporeeId:result.camporeeId}):`/o/${result.organizationId}`);
        router.refresh();
      }
    } catch {setError('No se pudo conectar. Tus datos siguen en el formulario; inténtalo de nuevo.');}
    finally {setLoading(false);}
  }
  return <form onSubmit={submit} className="panel-form organization-form" aria-busy={loading}>
    {children}
    {error?<p className="auth-alert error" role="alert">{error}</p>:null}
    {invitationUrl?<div className="organization-invite-result" role="status">
      {createdCamporeePath?<h2>¡Camporee creado! Comparte tu invitación</h2>:null}
      {joinCode?<label>Código del camporee (4 dígitos)
        <input readOnly value={joinCode} onFocus={event=>event.currentTarget.select()} aria-label="Código del camporee"/>
        <button type="button" className="secondary-btn" onClick={()=>void navigator.clipboard.writeText(joinCode)}>Copiar código</button>
      </label>:null}
      <label>Enlace de invitación
        <input type="url" readOnly value={invitationUrl} onFocus={event=>event.currentTarget.select()}/>
        <button type="button" className="secondary-btn" onClick={()=>void navigator.clipboard.writeText(invitationUrl)}>Copiar enlace</button>
      </label>
      <p>Las personas que abran el enlace y verifiquen su correo entrarán automáticamente. Con el código de cuatro dígitos podrán solicitar acceso al director.</p>
      {createdCamporeePath?<button type="button" className="primary-btn" onClick={()=>{router.push(createdCamporeePath);router.refresh();}}>Entrar al camporee</button>:null}
    </div>:null}
    {!createdCamporeePath?<button type="submit" className="primary-btn" disabled={loading}>{loading?'Procesando…':submitLabel}</button>:null}
  </form>;
}
