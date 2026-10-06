'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

type ReliableLinkProps = {
  href:string;
  className?:string;
  children:React.ReactNode;
  ariaLabel?:string;
};

export default function ReliableLink({href,className='',children,ariaLabel}:ReliableLinkProps){
  const pathname=usePathname();
  const [pending,setPending]=useState(false);

  useEffect(()=>{
    setPending(false);
  },[pathname]);

  function open(event:React.MouseEvent<HTMLAnchorElement>){
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    if(!navigator.onLine){event.preventDefault();window.location.assign(href);return;}
    if(pathname===href){event.preventDefault();return;}
    if(pending){event.preventDefault();return;}
    setPending(true);
  }

  return <Link prefetch href={href} className={`${className}${pending?' is-opening':''}`} onClick={open} aria-label={ariaLabel} aria-busy={pending||undefined}>{children}{pending?<span className='panel-opening-indicator' aria-hidden='true'/>:null}</Link>;
}
