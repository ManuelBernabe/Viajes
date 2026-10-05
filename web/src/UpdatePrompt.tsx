import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from './i18n';

const CHECK_EVERY_MS = 60_000;

/** Aviso de versión nueva: el service worker nuevo espera hasta que la persona decide actualizar. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) {
        return;
      }
      const check = () => {
        registration.update().catch(() => {
          // Sin red no se puede comprobar; se reintenta en la siguiente vuelta.
        });
      };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          check();
        }
      });
    },
  });

  if (!needRefresh) {
    return null;
  }

  return (
    <div className="update-backdrop" role="dialog" aria-modal="true" aria-labelledby="update-title">
      <div className="update-card">
        <h2 id="update-title">{t('Hay una versión nueva')}</h2>
        <p>{t('Se ha publicado una actualización de Viajes. Actualiza para usarla.')}</p>
        <button onClick={() => void updateServiceWorker(true)}>{t('Actualizar ahora')}</button>
        <button className="secondary" onClick={() => setNeedRefresh(false)}>
          {t('Más tarde')}
        </button>
      </div>
    </div>
  );
}
