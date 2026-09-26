import { useState } from 'react';
import { requestWakeLock, type WakeLockStatus } from './wakeLock';

export function WakeLockCheck() {
  const [status, setStatus] = useState<WakeLockStatus | 'sin probar'>('sin probar');

  return (
    <section>
      <h2>5 · Pantalla encendida</h2>
      <p>Estado: {status}</p>
      <button onClick={() => void requestWakeLock(navigator as never).then(setStatus)}>Mantener encendida</button>
    </section>
  );
}
