import { useState } from 'react';
import { requestWakeLock, type WakeLockStatus } from './wakeLock';
import { t } from '../i18n';

export function WakeLockCheck() {
  const [status, setStatus] = useState<WakeLockStatus | 'sin probar'>('sin probar');

  return (
    <section>
      <h2>{t('5 · Pantalla encendida')}</h2>
      <p>{t('Estado: {status}', { status: t(status) })}</p>
      <button onClick={() => void requestWakeLock(navigator as never).then(setStatus)}>{t('Mantener encendida')}</button>
    </section>
  );
}
