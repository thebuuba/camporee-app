'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { parseTenantPath } from '@/lib/tenant-context';
import { getOfflineQueueCount, readScopedOfflineWrites } from '@/lib/offline-fetch';

// No global public-schema feed: only refresh the selected camporee, and always
// dispose its subscription before switching organizations or camporees.
const EVENT_TABLES = [
  'tasks', 'schedule_events', 'participants', 'expenses', 'income_entries',
  'announcements', 'lists', 'meals', 'inventory_items', 'camporee_activities',
  'attendance_sessions', 'camporee_documents', 'notes',
] as const;

export default function DataFreshness() {
  const router = useRouter();
  const pathname = usePathname();
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (pathname === '/login' || pathname === '/signup' || pathname.startsWith('/auth/')) return;
    const context = parseTenantPath(pathname);
    const supabase = createClient();
    let refreshTimer: number | undefined;
    let disposed = false, checking = false;
    const refreshSafely = async () => {
      if (!navigator.onLine || checking || disposed) return;
      const now = Date.now();
      if (now - lastRefresh.current < 1500) return;
      checking = true;
      try {
        // A server refresh would replace local optimistic rows with older data.
        // Foreign-account and other-camporee queues do not block this screen.
        let pending = 0;
        try { pending = await getOfflineQueueCount(); }
        catch { /* Storage may be disabled; online reads remain available. */ }
        if (pending) {
          try {
            const { data, error } = await supabase.auth.getSession();
            if (error || !data.session?.access_token) return;
            if ((await readScopedOfflineWrites(`Bearer ${data.session.access_token}`)).length) return;
          } catch { return; }
        }
        if (disposed || !navigator.onLine) return;
        lastRefresh.current = Date.now();
        router.refresh();
      } finally { checking = false; }
    };
    const refresh = () => { void refreshSafely(); };
    const queueRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refresh, 350);
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('camporee:queue-flushed', refresh);
    document.addEventListener('visibilitychange', onVisibility);

    // Organization selection, profile and login pages do not need live events
    // from every camporee belonging to every authenticated user.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (context) {
      channel = supabase.channel(`camporee-live-${context.organizationId}-${context.camporeeId}`);
      for (const table of EVENT_TABLES) {
        channel = channel.on('postgres_changes', {
          event: '*', schema: 'public', table,
          filter: `camporee_id=eq.${context.camporeeId}`,
        }, queueRefresh);
      }
      channel = channel.on('postgres_changes', {
        event: '*', schema: 'public', table: 'camporees',
        filter: `id=eq.${context.camporeeId}`,
      }, queueRefresh);
      channel = channel.on('postgres_changes', {
        event: '*', schema: 'public', table: 'organization_members',
        filter: `organization_id=eq.${context.organizationId}`,
      }, queueRefresh);
      channel.subscribe();
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60000);
    return () => {
      disposed = true;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('camporee:queue-flushed', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
      if (refreshTimer) window.clearTimeout(refreshTimer);
      window.clearInterval(interval);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [pathname, router]);

  return null;
}
