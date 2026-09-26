import { useEffect, useState } from 'react';
import { api } from '../api';
import { isStandalone, type DisplayEnv } from '../platform/standalone';
import { describeServer, formatBuild, type ServerVersion } from '../platform/version';

const APP_VERSION = formatBuild(new Date(__BUILD_AT__), __BUILD_COMMIT__);

export function EnvironmentCheck() {
  const [persisted, setPersisted] = useState('comprobando…');
  const [online, setOnline] = useState(navigator.onLine);
  const [server, setServer] = useState('consultando…');

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

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const load = () =>
      api<ServerVersion>('/api/version').then(
        (info) => setServer(describeServer(info, new Date())),
        () => setServer('sin respuesta (¿sin conexión?)'),
      );
    void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const standalone = isStandalone(window as unknown as DisplayEnv);

  return (
    <section>
      <h2>Entorno</h2>
      <p>Versión de la app: {APP_VERSION}</p>
      <p>Servidor: {server}</p>
      <p>Modo: {standalone ? '✅ instalada en la pantalla de inicio' : '⚠️ dentro de Safari, sin instalar'}</p>
      <p>Almacenamiento persistente: {persisted}</p>
      <p>Red: {online ? 'con conexión' : 'sin conexión'}</p>
    </section>
  );
}
