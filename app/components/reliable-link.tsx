'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type ReliableLinkProps = {
  href:string;
  className?:string;
  children:React.ReactNode;
  ariaLabel?:string;
};

export default function ReliableLink({href,className='',children,ariaLabel}:ReliableLinkProps){
  const router=useRouter();
  const pathname=usePathname();
  const [pending,setPending]=useState(false);
  const timerRef=useRef<number|null>(null);

  useEffect(()=>{
    router.prefetch(href);
    return()=>{if(timerRef.current!==null)window.clearTimeout(timerRef.current)};
  },[href,router]);

  useEffect(()=>{
    setPending(false);
    if(timerRef.current!==null){window.clearTimeout(timerRef.current);timerRef.current=null}
  },[pathname]);

  function open(event:React.MouseEvent<HTMLAnchorElement>){
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    if(pending)return;
    setPending(true);
    router.push(href);
    timerRef.current=window.setTimeout(()=>{
      if(window.location.pathname!==href)window.location.assign(href);
    },2200);
  }

  return <a href={href} className={`${className}${pending?' is-opening':''}`} onClick={open} aria-label={ariaLabel} aria-busy={pending||undefined}>{children}{pending?<span className='panel-opening-indicator' aria-hidden='true'/>:null}</a>;
}
