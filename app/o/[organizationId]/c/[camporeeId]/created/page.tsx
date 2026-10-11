import Link from 'next/link';
import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {requireCamporeeContext, type TenantPageParams} from '@/lib/tenant-server';
import {tenantPath} from '@/lib/tenant-context';
import CamporeeInviteCard from '@/app/components/camporee-invite-card';

// A separate route from the creation form and the current-camporee redirect.
// Focus, reconnect, periodic refresh and full reload all read the same RPC.
export default async function CamporeeCreatedPage({params}:{params:TenantPageParams}) {
  const context=await requireCamporeeContext(params);
  if(!context.isAdmin)notFound();
  const {data:invitation,error}=await context.supabase.rpc('read_camporee_invitation',{
    target_camporee:context.camporeeId,
  });
  const ready=!error && typeof invitation?.code==='string' && /^[0-9]{4}$/.test(invitation.code)
    && typeof invitation?.token==='string' && /^[a-f0-9]{64}$/.test(invitation.token);
  const requestHeaders=await headers();
  const host=requestHeaders.get('x-forwarded-host')||requestHeaders.get('host');
  const protocol=requestHeaders.get('x-forwarded-proto')||(host?.startsWith('localhost')?'http':'https');
  const localHost=Boolean(host&&/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host));
  const siteUrl=((localHost?`${protocol}://${host}`:process.env.NEXT_PUBLIC_SITE_URL)
    || (host?`${protocol}://${host}`:'')).replace(/\/$/,'');
  const camporeePath=tenantPath(context);

  return <main className="app panel-page organizations-page">
    <header className="polymet-panel-heading">
      <h1>¡Camporee creado! Comparte tu invitación</h1>
      <p>{context.camporee.name}</p>
    </header>
    <section className="organization-section ios-card">
      {ready?<CamporeeInviteCard code={invitation.code} url={`${siteUrl}/join/${invitation.token}`}/>
        :<div role="alert">
          <p>Tu camporee ya está creado. No pudimos consultar la invitación; puedes volver a intentarlo sin crear otro camporee.</p>
          <a href={`${camporeePath}/created`} className="secondary-btn">Reintentar consulta</a>
        </div>}
      <p>Puedes volver a consultar el código y el enlace en Usuarios y permisos.</p>
      <Link href={camporeePath} prefetch={false} className="primary-btn">Entrar al camporee</Link>
    </section>
  </main>;
}
