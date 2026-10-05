import { useEffect, useState } from 'react';
import { api } from '../api';
import { isStandalone, type DisplayEnv } from '../platform/standalone';
import { describeServer, formatBuild, type ServerVersion } from '../platform/version';
import { t } from '../i18n';

const APP_VERSION = formatBuild(new Date(__BUILD_AT__), __BUILD_COMMIT__);

export function EnvironmentCheck() {
  const [persisted, setPersisted] = useState(t('comprobando…'));
  const [online, setOnline] = useState(navigator.onLine);
  const [server, setServer] = useState(t('consultando…'));

  useEffect(() => {
    if (!navigator.storage?.persist) {
      setPersisted(t('no soportado'));
      return;
    }
    navigator.storage.persist().then(
      (granted) => setPersisted(granted ? `✅ ${t('concedido')}` : `⚠️ ${t('denegado')}`),
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
        () => setServer(t('sin respuesta (¿sin conexión?)')),
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
      <h2>{t('Entorno')}</h2>
      <p>{t('Versión de la app: {version}', { version: APP_VERSION })}</p>
      <p>{t('Servidor: {server}', { server })}</p>
      <p>{t('Modo: {mode}', { mode: standalone ? `✅ ${t('instalada en la pantalla de inicio')}` : `⚠️ ${t('dentro de Safari, sin instalar')}` })}</p>
      <p>{t('Almacenamiento persistente: {state}', { state: persisted })}</p>
      <p>{t('Red: {state}', { state: online ? t('con conexión') : t('sin conexión') })}</p>
    </section>
  );
}
