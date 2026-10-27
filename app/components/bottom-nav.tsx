'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {parseTenantPath,tenantPath} from '@/lib/tenant-context';
import { CalendarClock, ClipboardCheck, FileText, HeartPulse, House, LayoutGrid, ListChecks, Megaphone, Music2, NotebookPen, PackageCheck, Soup, Trophy, Users, WalletCards } from "lucide-react";
import {NAVIGATION_PANELS,normalizeNavigationPanels} from '@/lib/navigation-panels';
import {useNavigationPanels} from './navigation-panels-provider';

const icons = {inventory:PackageCheck,tasks:ListChecks,program:CalendarClock,activities:Trophy,announcements:Megaphone,attendance:ClipboardCheck,meals:Soup,participants:Users,lists:ListChecks,budget:WalletCards,documents:FileText,emergency:HeartPulse,notes:NotebookPen,songs:Music2};

export default function BottomNav({panels}:{panels?:unknown} = {}) {
  const configuredPanels = useNavigationPanels();
  const selectedPanels = normalizeNavigationPanels(panels ?? configuredPanels);
  const items = [
    ["/", "Inicio", House],
    ...selectedPanels.map(id => {const panel=NAVIGATION_PANELS.find(panel=>panel.id===id)!;return [panel.href,panel.label,icons[id]] as const;}),
    ["/more", "Más", LayoutGrid],
  ] as const;
  const pathname = usePathname();
  const context=parseTenantPath(pathname);
  const panelPath=context?.panel??pathname;
  const activePanelHref = items.find(([href]) => href === "/"
    ? panelPath === "/"
    : panelPath === href || panelPath.startsWith(href + "/"))?.[0]
    ?? (panelPath === "/profile" ? "/more" : null);
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
    <nav className="nav nav-reference" style={{'--nav-columns':items.length} as React.CSSProperties} aria-label="Navegación principal">
      {items.map(([panelHref, label, Icon]) => {
        const href=context?tenantPath(context,panelHref):panelHref;
        const routeActive = panelHref === activePanelHref;
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
