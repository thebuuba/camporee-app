'use client';

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, Clock3, Hourglass, LogOut, Mail, ShieldCheck, TentTree } from "lucide-react";
import SetupForm from "./setup-form";
import { createClient } from "@/lib/supabase/client";

export default function HomeSetup({ firstName, isActive, isAdmin, role, requestedAt, accessLoadError = false, camporeeLoadError = false, accessRejected = false }: { firstName: string; isActive: boolean; isAdmin: boolean; role?: string; requestedAt?: string; accessLoadError?: boolean; camporeeLoadError?: boolean; accessRejected?: boolean }) {
  const router = useRouter();
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (isActive || accessLoadError || accessRejected) return;

    const supabase = createClient();
    let cancelled = false;
    let intervalId: number | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const refreshOnceApproved = async () => {
      if (cancelled || refreshingRef.current) return;

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId || cancelled) return;

      const { data: member } = await supabase
        .from("app_members")
        .select("is_active,permissions")
        .eq("user_id", userId)
        .maybeSingle();

      if ((member?.is_active || member?.permissions?.access_rejected === true) && !cancelled) {
        refreshingRef.current = true;
        router.refresh();
      }
    };

    const start = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId || cancelled) return;

      channel = supabase
        .channel(`access-approval-${userId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "app_members", filter: `user_id=eq.${userId}` },
          (payload: unknown) => {
            const next = (payload as { new?: { is_active?: boolean; permissions?: { access_rejected?: boolean } } }).new;
            if ((next?.is_active || next?.permissions?.access_rejected === true) && !refreshingRef.current) {
              refreshingRef.current = true;
              router.refresh();
            }
          },
        )
        .subscribe();

      await refreshOnceApproved();
      intervalId = window.setInterval(refreshOnceApproved, 2500);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshOnceApproved();
    };
    const onFocus = () => void refreshOnceApproved();

    void start();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [accessLoadError, accessRejected, isActive, router]);

  useEffect(() => {
    if (!isActive || accessLoadError) return;
    const supabase = createClient();
    let cancelled = false;
    let intervalId: number | undefined;

    const recoverExistingCamporee = async () => {
      if (cancelled || refreshingRef.current) return;
      const { data, error } = await supabase
        .from("camporees")
        .select("id,status")
        .order("starts_on", { ascending: true })
        .limit(5);
      if (!error && data?.length && !cancelled) {
        refreshingRef.current = true;
        router.refresh();
      }
    };

    void recoverExistingCamporee();
    intervalId = window.setInterval(recoverExistingCamporee, 2200);
    const onFocus = () => void recoverExistingCamporee();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [accessLoadError, accessRejected, isActive, router]);

  if (!isActive && !accessLoadError && !camporeeLoadError && !accessRejected) {
    const date = requestedAt ? new Date(requestedAt) : null;
    const requestDate = date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("es-DO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santo_Domingo" }).format(date) : null;
    return <main className="account-status-shell account-review-shell">
      <header className="account-review-header">
        <div className="account-status-icon"><Hourglass size={34} strokeWidth={1.8} aria-hidden="true" /></div>
        <h1>Cuenta en revisión</h1>
        <p>Tu solicitud está esperando aprobación.</p>
      </header>
      <section className="account-review-content" aria-label="Estado de tu solicitud">
        <ol className="account-review-steps">
          <li className="is-complete"><span className="account-step-icon"><Mail size={20} aria-hidden="true" /></span><div><h2>Solicitud enviada</h2><p>Recibimos tus datos</p></div></li>
          <li aria-current="step"><span className="account-step-icon"><Hourglass size={20} aria-hidden="true" /></span><div><h2>Revisión del administrador</h2><p>La directiva está revisando tu solicitud</p></div></li>
          <li><span className="account-step-icon"><ShieldCheck size={20} aria-hidden="true" /></span><div><h2>Rol y permisos asignados</h2><p>Podrás ver y editar según tu rol</p></div></li>
        </ol>
        <aside className="account-review-notice"><h2><Bell size={18} aria-hidden="true" />Te avisaremos</h2><p>Esta pantalla se actualizará automáticamente en cuanto tu cuenta sea aprobada.</p></aside>
        {requestDate ? <p className="account-request-date"><Clock3 size={14} aria-hidden="true" />Solicitud enviada el {requestDate}</p> : null}
        <button type="button" className="account-status-secondary" onClick={() => router.refresh()}>Actualizar estado de mi solicitud</button>
      </section>
    </main>;
  }

  return <main className="app setup-app">
    <header className="top"><div><div className="eyebrow">CAMPOREE</div><h1>Hola, {firstName} 👋</h1></div><form action="/auth/signout" method="post"><button className="icon-btn" aria-label="Cerrar sesión"><LogOut size={19}/></button></form></header>
    {accessLoadError ? <section className="setup-intro ios-card waiting-card"><div className="setup-icon"><TentTree size={25}/></div><div><span className="auth-kicker">CONEXIÓN INESTABLE</span><h2>No pudimos verificar tu acceso.</h2></div><p>La app no pudo consultar tus permisos en este momento. Tu cuenta no ha sido marcada como pendiente.</p><div className="auth-alert">Vuelve a intentarlo. Si eres administrador, la app conservará tu acceso cuando la consulta responda correctamente.</div><a className="primary-btn" href="/">Reintentar</a></section> : camporeeLoadError ? <section className="setup-intro ios-card waiting-card"><div className="setup-icon"><TentTree size={25}/></div><div><span className="auth-kicker">RECUPERANDO DATOS</span><h2>Tu camporee sigue guardado.</h2></div><p>No pudimos cargar el evento en esta consulta. La app está intentando recuperarlo automáticamente.</p><div className="auth-alert">No crees otro camporee. Tus datos existentes no se han borrado.</div><a className="primary-btn" href="/">Reintentar ahora</a></section> : accessRejected && !isActive ? <section className="setup-intro ios-card waiting-card"><div className="setup-icon"><TentTree size={25}/></div><div><span className="auth-kicker">SOLICITUD RECHAZADA</span><h2>Tu solicitud de acceso fue rechazada.</h2></div><p>No tienes acceso a la información del camporee. Contacta con la directiva si crees que se trata de un error o necesitas solicitar una revisión.</p></section> : !isAdmin ? <section className="setup-intro ios-card waiting-card"><div className="setup-icon"><TentTree size={25}/></div><div><span className="auth-kicker">ACCESO LISTO</span><h2>Ya eres parte del equipo.</h2></div><p>Todos trabajan sobre el mismo camporee. Cuando un administrador cree el evento, aparecerá aquí automáticamente para ti.</p><div className="auth-alert success">Acceso activo como {role === "editor" ? "editor" : "solo lectura"}.</div></section> : <><section className="setup-intro ios-card"><div className="setup-icon"><TentTree size={25}/></div><div><span className="auth-kicker">EMPECEMOS</span><h2>Prepara la próxima aventura.</h2><p>Crea el evento compartido y después todo el equipo podrá organizar tareas, programa, participantes, comidas, listas y presupuesto desde el mismo lugar.</p></div><div className="setup-steps"><span className="active">1</span><i/><span>2</span><i/><span>3</span></div><div className="setup-step-labels"><span>Evento</span><span>Equipo</span><span>Listo</span></div></section><section className="setup-card ios-card"><div className="section-head inside"><div><div className="eyebrow">PASO 1 DE 3</div><h3>Datos del camporee</h3></div><span>Podrás editarlos luego</span></div><SetupForm /></section></>}
  </main>;
}
