import { useEffect, useState } from 'react';

interface Sentinel {
  release(): Promise<void>;
}

interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<Sentinel> };
}

/** Mantiene la pantalla encendida mientras el componente está montado y visible. */
export function useWakeLock(): 'activo' | 'no soportado' | 'rechazado' | 'pendiente' {
  const [status, setStatus] = useState<'activo' | 'no soportado' | 'rechazado' | 'pendiente'>('pendiente');

  useEffect(() => {
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) {
      setStatus('no soportado');
      return;
    }
    let sentinel: Sentinel | null = null;
    let alive = true;
    const request = async () => {
      try {
        sentinel = await nav.wakeLock!.request('screen');
        if (alive) {
          setStatus('activo');
        }
      } catch {
        if (alive) {
          setStatus('rechazado');
        }
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void request();
      }
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, []);

  return status;
}
