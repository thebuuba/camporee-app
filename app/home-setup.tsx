'use client';

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LogOut, TentTree } from "lucide-react";
import SetupForm from "./setup-form";
import { createClient } from "@/lib/supabase/client";

export default function HomeSetup({ firstName, isActive, isAdmin, role, accessLoadError = false }: { firstName: string; isActive: boolean; isAdmin: boolean; role?: string; accessLoadError?: boolean }) {
  const router = useRouter();
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (isActive || accessLoadError) return;

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
        .select("is_active")
        .eq("user_id", userId)
        .maybeSingle();

      if (member?.is_active && !cancelled) {
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
            const next = (payload as { new?: { is_active?: boolean } }).new;
            if (next?.is_active && !refreshingRef.current) {
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
  }, [accessLoadError, isActive, router]);

  return <main className="app setup-app">
    <header className="top"><div><div className="eyebrow">CAMPOREE</div><h1>Hola, {firstName} 👋</h1></div><form action="/auth/signout" method="post"><button className="icon-btn" aria-label="Cerrar sesión"><LogOut size={19}/></button></form></header>
    {accessLoadError ? <section className="setup-intro ios-card waiting-card"><div className="setup-icon"><TentTree size={25}/></div><div><span className="auth-kicker">CONEXIÓN INESTABLE</span><h2>No pudimos verificar tu acceso.</h2></div><p>La app no pudo consultar tus permisos en este momento. Tu cuenta no ha sido marcada como pendiente.</p><div className="auth-alert">Vuelve a intentarlo. Si eres administrador, la app conservará tu acceso cuando la consulta responda correctamente.</div><a className="primary-btn" href="/">Reintentar</a></section> : !isActive ? <section className="setup-intro ios-card waiting-card"><div className="setup-icon"><TentTree size={25}/></div><div><span className="auth-kicker">SOLICITUD RECIBIDA</span><h2>Tu acceso está pendiente.</h2></div><p>Un administrador debe activar tu cuenta antes de que puedas consultar la información del camporee.</p><div className="auth-alert">Esta pantalla se actualizará automáticamente en cuanto un administrador apruebe tu acceso.</div></section> : !isAdmin ? <section className="setup-intro ios-card waiting-card"><div className="setup-icon"><TentTree size={25}/></div><div><span className="auth-kicker">ACCESO LISTO</span><h2>Ya eres parte del equipo.</h2></div><p>Todos trabajan sobre el mismo camporee. Cuando un administrador cree el evento, aparecerá aquí automáticamente para ti.</p><div className="auth-alert success">Acceso activo como {role === "editor" ? "editor" : "solo lectura"}.</div></section> : <><section className="setup-intro ios-card"><div className="setup-icon"><TentTree size={25}/></div><div><span className="auth-kicker">EMPECEMOS</span><h2>Prepara la próxima aventura.</h2><p>Crea el evento compartido y después todo el equipo podrá organizar tareas, programa, participantes, comidas, listas y presupuesto desde el mismo lugar.</p></div><div className="setup-steps"><span className="active">1</span><i/><span>2</span><i/><span>3</span></div><div className="setup-step-labels"><span>Evento</span><span>Equipo</span><span>Listo</span></div></section><section className="setup-card ios-card"><div className="section-head inside"><div><div className="eyebrow">PASO 1 DE 3</div><h3>Datos del camporee</h3></div><span>Podrás editarlos luego</span></div><SetupForm /></section></>}
  </main>;
}