'use client';

import {useState, type FormEvent, type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {tenantPath} from '@/lib/tenant-context';
import {createOrganization,createCamporee,createInvitation,acceptInvitation} from './actions';

type Kind='create-organization'|'create-camporee'|'invite'|'accept';
const actions={'create-organization':createOrganization,'create-camporee':createCamporee,invite:createInvitation,accept:acceptInvitation};
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
      if(result.invitationToken){setInvitationUrl(new URL(`/invitations/${result.invitationToken}`,window.location.origin).toString());return;}
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
    {invitationUrl?<div className="organization-invite-result" role="status"><label>Enlace de invitación<input type="url" readOnly value={invitationUrl} onFocus={event=>event.currentTarget.select()}/></label><p>Copia este enlace y compártelo con la persona invitada. Solo puede usarlo una vez con su correo confirmado; vence en 7 días.</p></div>:null}
    <button type="submit" className="primary-btn" disabled={loading}>{loading?'Procesando…':submitLabel}</button>
  </form>;
}
