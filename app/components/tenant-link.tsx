'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ComponentProps } from 'react';
import { parseTenantPath, tenantPath } from '@/lib/tenant-context';

// A subpage opened from Inicio should return there, not unexpectedly to Más.
// Keep that origin across deeper screens (such as Listas -> una lista concreta).
function retainHomeOrigin(href: ComponentProps<typeof Link>['href'], className: ComponentProps<typeof Link>['className'], fromHome: boolean) {
  if (!fromHome || typeof href !== 'string') return href;
  const backButton = typeof className === 'string' && className.split(/\s+/).includes('back-btn');
  if (backButton && href === '/more') return '/';
  if (href.startsWith('/more/')) {
    const url = new URL(href, 'https://camporee.invalid');
    if (!url.searchParams.has('from')) url.searchParams.set('from', 'home');
    return url.pathname + url.search + url.hash;
  }
  return href;
}

export default function TenantLink(props: ComponentProps<typeof Link>) {
  const context = parseTenantPath(usePathname());
  const searchParams = useSearchParams();
  const destination = retainHomeOrigin(props.href, props.className, searchParams?.get('from') === 'home');
  const href = context && typeof destination === 'string' ? tenantPath(context, destination) : destination;
  return <Link {...props} href={href} />;
}
