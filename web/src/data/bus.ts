/** Aviso de «los datos locales han cambiado»: las pantallas vuelven a consultar IndexedDB. */

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}
