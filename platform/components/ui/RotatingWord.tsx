'use client';

import { useEffect, useRef, useState } from 'react';

interface RotatingWordProps {
  words: string[];
  /** ms between word changes — defaults to 2000ms (2s) */
  interval?: number;
  className?: string;
  /** Tailwind color class for the rotating word. Defaults to ob-warn (amber). */
  colorClass?: string;
}

/**
 * Cycles through `words` in place with a slide-up + fade transition.
 * Pauses while hovered so the reader can lock onto a specific word.
 * Respects prefers-reduced-motion: shows static first word.
 */
export function RotatingWord({
  words,
  interval = 2000,
  className = '',
  colorClass = 'text-ob-warn',
}: RotatingWordProps) {
  const [index, setIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (paused || reducedMotion.current || words.length < 2) return;
    const id = window.setInterval(() => {
      // start fade-out / slide-up-out
      setAnimating(true);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % words.length);
        setAnimating(false);
      }, 240);
    }, interval);
    return () => window.clearInterval(id);
  }, [paused, words.length, interval]);

  // measure widest word so the line doesn't reflow on each rotation
  const widest = words.reduce((a, b) => (b.length > a.length ? b : a), words[0] ?? '');

  return (
    <span
      className={`relative inline-block align-baseline ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* width reservation — invisible widest word holds layout */}
      <span aria-hidden="true" className="invisible">
        {widest}
      </span>
      <span
        key={index}
        className={`absolute inset-0 ${colorClass} transition-all duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
          animating
            ? '-translate-y-2 opacity-0'
            : 'translate-y-0 opacity-100 motion-safe:animate-[ob-rise_320ms_cubic-bezier(0.16,1,0.3,1)]'
        }`}
      >
        {words[index]}
      </span>
    </span>
  );
}
