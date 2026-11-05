import type { LaunchSchedule } from './legado-launch';

declare global {
  interface Window {
    __camporeeLaunch?: { ready: () => void; event: (schedule: LaunchSchedule, scope: string) => void };
  }
}

// Runs in the head before the shell or page can paint. It can only finish
// the initial cover: late hydration can never open another one.
export const launchInitScript = String.raw`(()=>{
  const root=document.documentElement;
  const started=performance.now();
  let closed=true,leaving=false,watchdog,exitTimer;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scopeOf=path=>{const m=/^\/o\/([a-f0-9-]{36})\/c\/([a-f0-9-]{36})(?:\/|$)/i.exec(path);return m?m[1]+':'+m[2]:null};
  const eligible=event=>{
    if(!event||event.legado!==true||!['planning','active'].includes(event.status)||!/^\d{4}-\d{2}-\d{2}$/.test(event.startsOn)||!/^\d{4}-\d{2}-\d{2}$/.test(event.endsOn))return false;
    try{return new Intl.DateTimeFormat('en-CA',{timeZone:event.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now())<=event.endsOn}catch{return false}
  };
  const keyFor=(event,scope)=>eligible(event)?'camporee:startup:v2:'+scope+':'+event.startsOn:'camporee:startup:v2:generic';
  const mark=key=>{try{sessionStorage.setItem(key,'yes')}catch{}};
  const finish=()=>{
    if(closed)return;
    closed=true;clearTimeout(watchdog);clearTimeout(exitTimer);
    root.removeAttribute('data-camporee-launch');
    root.removeAttribute('data-camporee-launch-stage');
    window.dispatchEvent(new Event('camporee:launch-finished'));
  };
  const ready=()=>{
    if(closed||leaving)return;
    leaving=true;
    const remaining=Math.max(0,(reduced?0:350)-(performance.now()-started));
    const img=document.querySelector('#camporee-launch .legado-launch img');
    const decoded=root.dataset.camporeeLaunch==='legado'&&img?.decode?img.decode().catch(()=>{}):Promise.resolve();
    Promise.all([new Promise(resolve=>setTimeout(resolve,remaining)),Promise.race([decoded,new Promise(resolve=>setTimeout(resolve,400))])]).then(()=>{
      if(closed)return;
      // Paint the hydrated page before blending the cover into it.
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(closed)return;
        root.dataset.camporeeLaunchStage='leaving';
        exitTimer=setTimeout(finish,reduced?100:420);
      }));
    });
  };
  window.__camporeeLaunch={ready,event:(event,scope)=>{
    if(closed||leaving)return;
    root.dataset.camporeeLaunch=eligible(event)?'legado':'generic';
    mark(keyFor(event,scope));
  }};
  try{
    const path=location.pathname;
    const offline=path==='/offline';
    const from=offline?(new URLSearchParams(location.search).get('from')||'/'):path;
    if(/\/c\/[a-f0-9-]{36}\/(created|print)(\/|$)/i.test(from))return;
    let scope=scopeOf(from),event=null;
    const camporeeRoute=Boolean(scope)||from==='/'||/^\/(tasks|program|more|search)(\/|$)/.test(from);
    if(!camporeeRoute)return;
    const navigation=performance.getEntriesByType('navigation')[0];
    if(navigation&&navigation.type==='back_forward')return;
    if(document.referrer&&new URL(document.referrer).origin===location.origin)return;
    try{
      if(!scope&&from==='/')scope=localStorage.getItem('camporee:launch:last-scope');
      if(scope&&/^[a-f0-9-]{36}:[a-f0-9-]{36}$/i.test(scope))event=JSON.parse(localStorage.getItem('camporee:launch:'+scope)||'null');
    }catch{}
    const branded=eligible(event);
    if((offline||!navigator.onLine)&&!branded)return;
    const key=keyFor(event,scope);
    try{if(sessionStorage.getItem(key)==='yes')return}catch{if(navigation&&navigation.type!=='navigate')return}
    closed=false;
    root.dataset.camporeeLaunch=branded?'legado':'generic';
    root.dataset.camporeeLaunchStage='loading';
    mark(key);
    // Failed chunks cannot trap the app behind a cover indefinitely.
    watchdog=setTimeout(finish,12000);
    window.addEventListener('pagehide',finish,{once:true});
  }catch{finish()}
})();`;
