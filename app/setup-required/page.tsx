import Link from 'next/link';
import { Database, ShieldCheck } from 'lucide-react';

export const metadata = {title:'Configuración pendiente | Camporee App'};

export default function SetupRequiredPage(){
  return <main className="app error-state">
    <section className="section-card ios-card error-card">
      <span className="stat-icon stat-gold"><Database size={22}/></span>
      <div>
        <div className="eyebrow">CAMPOREE</div>
        <h1>La versión multiusuario aún no está configurada.</h1>
        <p>Tu sesión puede estar iniciada correctamente. Esta versión necesita las tablas de organizaciones y camporees en Supabase para abrir el panel.</p>
        <p><ShieldCheck size={16} aria-hidden="true"/> Por seguridad, no se ha modificado la base de datos ni se han ejecutado migraciones automáticamente.</p>
        <p>Un administrador debe comprobar las migraciones en un entorno de pruebas y autorizar el despliegue coordinado antes de utilizar esta versión.</p>
      </div>
      <Link className="primary-btn" href="/login">Volver al inicio de sesión</Link>
    </section>
  </main>;
}
