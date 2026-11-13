/**
 * Motion layer (Motion for React). Rules, from the build specification:
 *  - motion explains a change the person caused or an event that emerged; it never tweens a measured value;
 *  - transform/opacity only, 120–320 ms, no looping flourishes inside operational views;
 *  - "Reduce motion" (setting or OS preference) removes travel and loops; state changes stay immediate.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../app/store';

export const EASE = [0.2, 0.7, 0.2, 1] as const;

export function MotionRoot({ children }: { children: ReactNode }) {
  const reduce = useApp((s) => s.settings.reduceMotion);
  return <MotionConfig reducedMotion={reduce ? 'always' : 'user'} transition={{ duration: 0.24, ease: EASE }}>{children}</MotionConfig>;
}

/** True when motion should be removed (app setting or OS preference). */
export function useReducedMotionPref(): boolean {
  const setting = useApp((s) => s.settings.reduceMotion);
  const [os, setOs] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setOs(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return setting || os;
}

/** Route continuity: a short cross-fade with 8 px of travel, keyed by path. */
export function RouteTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotionPref();
  if (reduce) return <>{children}</>; // no cross-fade at all: the new screen is simply there
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2, ease: EASE }}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** List whose items emerge when they first appear (used for events: the emergence is animated, never the severity). */
export function EmergeList<T>({ items, keyOf, render, className = 'list' }: { items: T[]; keyOf: (x: T) => string; render: (x: T) => ReactNode; className?: string }) {
  return (
    <div className={className}>
      <AnimatePresence initial={false}>
        {items.map((x) => (
          <motion.div key={keyOf(x)} layout="position" initial={{ opacity: 0, x: -10, scale: 0.985 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }} transition={{ duration: 0.28, ease: EASE }}>
            {render(x)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Returns a class that plays a one-shot highlight when `value` changes (not on first render). */
export function useChangeFlash(value: string): string {
  const prev = useRef(value), [n, setN] = useState(0);
  useEffect(() => { if (prev.current !== value) { prev.current = value; setN((x) => x + 1); } }, [value]);
  return n === 0 ? '' : n % 2 ? 'flash-a' : 'flash-b';
}

/** One orchestrated entrance for the entry screen: children rise in sequence, once. */
export function Stagger({ children, className }: { children: ReactNode[]; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}>
      {children.map((c, i) => (
        <motion.div key={i} variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}>{c}</motion.div>
      ))}
    </motion.div>
  );
}

export { motion, AnimatePresence };
