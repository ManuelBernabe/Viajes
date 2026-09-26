import { useEffect, useState } from 'react';
import { isStandalone, type DisplayEnv } from '../platform/standalone';

export function EnvironmentCheck() {
  const [persisted, setPersisted] = useState('comprobando…');

  useEffect(() => {
    if (!navigator.storage?.persist) {
      setPersisted('no soportado');
      return;
    }
    navigator.storage.persist().then(
      (granted) => setPersisted(granted ? '✅ concedido' : '⚠️ denegado'),
      () => setPersisted('error'),
    );
  }, []);

  const standalone = isStandalone(window as unknown as DisplayEnv);

  return (
    <section>
      <h2>Entorno</h2>
      <p>Versión: {__APP_VERSION__}</p>
      <p>Modo: {standalone ? '✅ instalada en la pantalla de inicio' : '⚠️ dentro de Safari, sin instalar'}</p>
      <p>Almacenamiento persistente: {persisted}</p>
      <p>Red: {navigator.onLine ? 'con conexión' : 'sin conexión'}</p>
    </section>
  );
}
