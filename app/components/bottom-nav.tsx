'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarClock, House, LayoutGrid, ListChecks } from "lucide-react";

const items = [
  ["/", "Inicio", House],
  ["/program", "Hoy", CalendarClock],
  ["/tasks", "Tareas", ListChecks],
  ["/more", "Más", LayoutGrid],
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  function beginNavigation(href:string, routeActive:boolean){
    if(!navigator.onLine)return;
    if(routeActive)return;
    setPendingHref(href);
  }

  return (
    <nav className="nav nav-reference" aria-label="Navegación principal">
      {items.map(([href, label, Icon]) => {
        const routeActive = href === "/" ? pathname === "/" : pathname.startsWith(href) || (href === "/more" && pathname === "/profile");
        const active = pendingHref ? pendingHref === href : routeActive;
        return (
          <Link
            prefetch
            className={active ? "active" : ""}
            href={href}
            key={href}
            aria-current={routeActive ? "page" : undefined}
            aria-busy={pendingHref===href||undefined}
            onClick={event => {
              if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              if (!navigator.onLine) { event.preventDefault(); window.location.assign(href); return; }
              beginNavigation(href,routeActive);
            }}
          >
            <span className="nav-icon"><Icon size={22} strokeWidth={2.2} /></span>
            <span className="nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
