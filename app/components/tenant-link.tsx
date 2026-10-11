'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import type {ComponentProps} from 'react';
import {parseTenantPath,tenantPath} from '@/lib/tenant-context';

export default function TenantLink(props:ComponentProps<typeof Link>) {
  const context=parseTenantPath(usePathname());
  const href=context&&typeof props.href==='string'?tenantPath(context,props.href):props.href;
  return <Link {...props} href={href}/>;
}
