'use client';

import {ArrowLeft, ShieldCheck} from 'lucide-react';
import Link from '@/app/components/tenant-link';
import {CAMPOREE_RULES} from '@/lib/camporee-rules';
import styles from './rules.module.css';

export default function RulesScreen({camporeeName, onClose}: {camporeeName:string; onClose?:()=>void}) {
  return <div className={styles.screen}>
    <div className={styles.content}>
      <header className={styles.top}>
        {onClose
          ? <button type="button" onClick={onClose} className={styles.back} aria-label="Volver a la copia sin conexión"><ArrowLeft size={21}/></button>
          : <Link href="/more" className={styles.back} aria-label="Volver a Más"><ArrowLeft size={21}/></Link>}
        <span className={styles.topTitle}>Reglas del camporee</span>
        <span className={styles.topIcon}><ShieldCheck size={20} aria-hidden="true"/></span>
      </header>
      <section className={styles.hero} aria-labelledby="rules-title">
        <span className={styles.eyebrow}>CONVIVENCIA · 14 REGLAS</span>
        <h1 id="rules-title">Nuestro compromiso en el camporee</h1>
        <p>{camporeeName}</p>
        <span className={styles.credit}>Caro y Juan Daniel</span>
      </section>
      <ol className={styles.list} aria-label="Reglas del camporee">
        {CAMPOREE_RULES.map((rule,index)=><li key={rule} className={styles.rule}>
          <span className={styles.number} aria-hidden="true">{String(index+1).padStart(2,'0')}</span>
          <span>{rule}</span>
        </li>)}
      </ol>
      <p className={styles.end}>Cuidarnos y respetarnos hace mejor esta experiencia para todos.</p>
    </div>
  </div>;
}
