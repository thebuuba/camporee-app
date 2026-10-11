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
  const router=useRouter();
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(loading)return;
    if(!navigator.onLine){setError('Necesitas conexión para administrar organizaciones e invitaciones.');return;}
    const form=new FormData(event.currentTarget);
    setLoading(true);setError('');setInvitationUrl('');
    try {
      const result=await actions[kind](form);
      if(!result.ok){setError(result.error);return;}
      if(result.invitationToken){setInvitationUrl(new URL(kind==='create-join-code'?`/join/${result.invitationToken}`:`/invitations/${result.invitationToken}`,window.location.origin).toString());return;}
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
    {invitationUrl?<div className="organization-invite-result" role="status"><label>Enlace de invitación<input type="url" readOnly value={invitationUrl} onFocus={event=>event.currentTarget.select()}/></label>{kind==='create-join-code'?<label>Código de camporee<input readOnly value={invitationUrl.split('/').pop()??''} onFocus={event=>event.currentTarget.select()}/></label>:null}<p>{kind==='create-join-code'?'Comparte este enlace o su código con los miembros de tu club. No hace falta escribir el código al abrir el enlace.':'Comparte este enlace con la persona invitada.'}</p></div>:null}
    <button type="submit" className="primary-btn" disabled={loading}>{loading?'Procesando…':submitLabel}</button>
  </form>;
}
