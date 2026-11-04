'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Coffee, Cookie, Moon, Utensils } from 'lucide-react';
import { formatMenuDate, groupMealsForMenu, mealLabel, type MenuMeal } from '@/lib/meal-menu';
import { camporeeLocalClock, formatMealTime, hasMealTimePassed, mealTime } from '@/lib/meal-schedule';
import styles from './meal-timeline.module.css';

type TimelineMeal = MenuMeal & {
  id: string; meal_time?: string | null; responsible_name?: string | null;
};
export default function MealTimeline({ meals, timeZone, onSelect, missingCount }: {
  meals: TimelineMeal[]; timeZone: string;
  onSelect: (id: string) => void; missingCount: (meal: TimelineMeal) => number;
}) {
  const [clock, setClock] = useState<string | null>(null);
  const days = useMemo(() => groupMealsForMenu(meals), [meals]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      clearTimeout(timer);
      setClock(camporeeLocalClock(new Date(), timeZone));
      // Align to the next minute, and recalculate immediately after sleep/tab changes.
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 25);
    }
    tick();
    window.addEventListener('focus', tick);
    window.addEventListener('pageshow', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', tick);
      window.removeEventListener('pageshow', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [timeZone]);
  const nextId = clock ? days.flatMap(day => day.meals).find(meal => !hasMealTimePassed(meal, clock))?.id : null;
  if (!days.length) return <div className="empty compact">No hay comidas planificadas todavía.</div>;

  return <div className={styles.timeline} data-testid="meal-timeline">
    <p className={styles.hint}>Se tachan al pasar su fecha y hora · {timeZone === 'America/Santo_Domingo' ? 'Hora de República Dominicana' : timeZone}</p>
    {days.map(({ date, meals: entries }, index) => {
      const dayPast = entries.every(meal => hasMealTimePassed(meal, clock));
      const today = date === clock?.slice(0, 10);
      return <section key={date} className={styles.day} aria-labelledby={`meal-day-${date}`} data-meal-day={date}>
        <header className={styles.dayHeader}>
          <span className={styles.dayNumber}>{String(index + 1).padStart(2, '0')}</span>
          <div><h2 id={`meal-day-${date}`} className={dayPast ? styles.pastTitle : ''}>{formatMenuDate(date, { weekday: 'long' })}</h2>
            <p>{formatMenuDate(date, { day: 'numeric', month: 'long' })}</p></div>
          {today && !dayPast ? <span className={styles.today}>Hoy</span> : null}
          {dayPast ? <span className={styles.dayStatus}>Horario pasado</span> : null}
        </header>
        <div className={styles.meals}>{entries.map(meal => {
          const past = hasMealTimePassed(meal, clock);
          const time = mealTime(meal);
          const missing = missingCount(meal);
          const Icon = meal.meal_type === 'breakfast' ? Coffee : meal.meal_type.startsWith('snack') ? Cookie : meal.meal_type === 'dinner' ? Moon : Utensils;
          return <button type="button" key={meal.id} className={styles.meal} data-meal-id={meal.id} data-past={past} data-next={meal.id === nextId} onClick={() => onSelect(meal.id)}>
            <span className={styles.icon}>{past ? <Check size={20} aria-hidden="true"/> : <Icon size={20} aria-hidden="true"/>}</span>
            <span className={styles.copy}>
              <span className={styles.mealHeading}><span>{mealLabel(meal.meal_type)}</span><time dateTime={time ? `${date}T${time}` : date}>{formatMealTime(time)}</time></span>
              <span className={styles.menu}>{meal.menu}</span>
              <span className={styles.meta}>
                {past ? <span>Horario pasado</span> : meal.id === nextId ? <span className={styles.upNext}>Próxima</span> : null}
                {meal.responsible_name ? <span>{meal.responsible_name}</span> : null}
                {missing > 0 ? <span className={styles.missing}>{missing} faltantes</span> : null}
              </span>
            </span>
            <ChevronRight size={16} className={styles.chevron} aria-hidden="true"/>
          </button>;
        })}</div>
      </section>;
    })}
  </div>;
}
