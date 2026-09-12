'use client';

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, Home, MoreHorizontal } from "lucide-react";

const items = [
  ["/", "Inicio", Home],
  ["/program", "Hoy", CalendarDays],
  ["/tasks", "Tareas", CheckCircle2],
  ["/more", "Más", MoreHorizontal],
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const fallbackTimer = useRef<number|null>(null);

  useEffect(() => {
    for (const [href] of items) router.prefetch(href);
  }, [router]);

  useEffect(() => {
    setPendingHref(null);
    if(fallbackTimer.current!==null){window.clearTimeout(fallbackTimer.current);fallbackTimer.current=null;}
  }, [pathname]);

  useEffect(()=>()=>{if(fallbackTimer.current!==null)window.clearTimeout(fallbackTimer.current)},[]);

  function beginNavigation(href:string, routeActive:boolean){
    if(routeActive)return;
    setPendingHref(href);
    if(fallbackTimer.current!==null)window.clearTimeout(fallbackTimer.current);
    fallbackTimer.current=window.setTimeout(()=>{
      if(window.location.pathname!==href)window.location.assign(href);
    },2200);
  }

  return (
    <nav className="nav nav-reference" aria-label="Navegación principal">
      {items.map(([href, label, Icon]) => {
        const routeActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        const active = pendingHref ? pendingHref === href : routeActive;
        return (
          <Link
            prefetch
            className={active ? "active" : ""}
            href={href}
            key={href}
            aria-current={routeActive ? "page" : undefined}
            aria-busy={pendingHref===href||undefined}
            onPointerDown={() => beginNavigation(href,routeActive)}
            onClick={() => beginNavigation(href,routeActive)}
          >
            <span className="nav-icon"><Icon size={22} strokeWidth={2.2} /></span>
            <span className="nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
