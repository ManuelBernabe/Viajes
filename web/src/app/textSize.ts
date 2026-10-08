import { useSyncExternalStore } from 'react';

/** Tamaños de letra elegibles (sobre el tamaño normal). Toda la app usa rem, así que crece entera, sin zoom. */
export const TEXT_SIZES = [0.9, 1, 1.15, 1.3, 1.5] as const;

const KEY = 'viajes:letra';
const listeners = new Set<() => void>();
let current = read();

function read(): number {
  try {
    const value = Number(localStorage.getItem(KEY));
    return (TEXT_SIZES as readonly number[]).includes(value) ? value : 1;
  } catch {
    return 1;
  }
}

/** Aplica el tamaño guardado en este móvil (se llama al arrancar). */
export function applyTextSize(size = current) {
  document.documentElement.style.fontSize = size === 1 ? '' : `${size * 100}%`;
}

export function setTextSize(size: number) {
  current = size;
  try {
    localStorage.setItem(KEY, String(size));
  } catch {
    // Sin almacenamiento: dura hasta cerrar la app.
  }
  applyTextSize(size);
  listeners.forEach((listener) => listener());
}

/** Un paso más grande (+1) o más pequeño (−1). */
export function stepTextSize(direction: 1 | -1) {
  const index = TEXT_SIZES.indexOf(current as (typeof TEXT_SIZES)[number]);
  const next = TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, (index < 0 ? 1 : index) + direction))];
  setTextSize(next);
}

export function useTextSize(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
