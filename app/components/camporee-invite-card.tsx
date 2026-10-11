'use client';

import {useState} from 'react';

export default function CamporeeInviteCard({code,url}:{code:string;url:string}) {
  const [copied,setCopied]=useState<'code'|'url'|null>(null);
  async function copy(value:string,which:'code'|'url'){
    try {await navigator.clipboard.writeText(value);setCopied(which);}
    catch {setCopied(null);}
  }
  return <div className="organization-invite-result">
    <label>Código numérico del camporee
      <input readOnly value={code} aria-label="Código del camporee" onFocus={event=>event.currentTarget.select()}/>
    </label>
    <button type="button" className="secondary-btn" onClick={()=>void copy(code,'code')}>
      {copied==='code'?'Código copiado':'Copiar código'}
    </button>
    <label>Enlace de invitación
      <input type="url" readOnly value={url} aria-label="Enlace de invitación" onFocus={event=>event.currentTarget.select()}/>
    </label>
    <button type="button" className="secondary-btn" onClick={()=>void copy(url,'url')}>
      {copied==='url'?'Enlace copiado':'Copiar enlace'}
    </button>
    <p>Enlace: acceso automático después de confirmar el correo. Código de cuatro dígitos: solicitud sujeta a aprobación del director.</p>
  </div>;
}
