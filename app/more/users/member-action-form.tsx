'use client';
import {useState,type ReactNode,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {revokeInvitation,transferOwnership} from './actions';

export default function MemberActionForm({kind,label,children}:{kind:'revoke'|'transfer';label:string;children:ReactNode}) {
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const router=useRouter();
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(loading)return;
    if(!navigator.onLine){setError('Necesitas conexión para cambiar el acceso.');return;}
    const form=new FormData(event.currentTarget);
    if(kind==='transfer'&&!window.confirm('¿Transferir la propiedad de esta organización al administrador seleccionado?'))return;
    setLoading(true);setError('');setSaved(false);
    try{const result=await (kind==='revoke'?revokeInvitation:transferOwnership)(form);if(!result.ok){setError(result.error??'No se pudo guardar.');return;}setSaved(true);router.refresh();}
    catch{setError('No se pudo conectar. Inténtalo otra vez.');}finally{setLoading(false);}
  }
  return <form onSubmit={submit} className="panel-form organization-form" aria-busy={loading}>{children}{error?<p role="alert" className="auth-alert error">{error}</p>:null}{saved?<p role="status">Cambio guardado.</p>:null}<button type="submit" className="primary-btn" disabled={loading}>{loading?'Guardando…':label}</button></form>;
}
