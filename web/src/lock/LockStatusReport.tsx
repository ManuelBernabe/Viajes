import { useEffect, useState } from 'react';
import { api } from '../api';
import { lockSupported, useLockConfig } from './appLock';

/** Cuenta al servidor si este móvil tiene Face ID activado (quien administra lo ve en Ajustes → Hogar). No pinta nada. */
export function LockStatusReport() {
  const config = useLockConfig();
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    void lockSupported().then(setSupported);
  }, []);

  useEffect(() => {
    if (supported === null) {
      return;
    }
    void api('/api/household/lock-status', { method: 'POST', body: JSON.stringify({ enabled: config !== null, supported }) }).catch(() => {
      // Sin conexión: se contará la próxima vez.
    });
  }, [supported, config !== null]);

  return null;
}
