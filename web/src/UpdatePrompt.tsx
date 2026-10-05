import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from './i18n';

const CHECK_EVERY_MS = 60_000;
const SHOW_EVENT = 'viajes:show-update';

let registered: ServiceWorkerRegistration | null = null;

export type UpdateCheck = 'new' | 'latest' | 'offline' | 'unsupported';

/** Espera a que termine de instalarse una versión que se está descargando (como mucho unos segundos). */
function installed(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve();
    const timer = setTimeout(done, 15_000);
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'installing') {
        clearTimeout(timer);
        done();
      }
    });
  });
}

/**
 * «Buscar actualizaciones»: pregunta al servidor si hay versión nueva. Si la hay (aunque antes se dijera «Más tarde»),
 * vuelve a salir el aviso para actualizar.
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!registered) {
    return 'unsupported';
  }
  try {
    await registered.update();
  } catch {
    return 'offline';
  }
  if (registered.installing) {
    await installed(registered.installing);
  }
  if (registered.waiting) {
    window.dispatchEvent(new Event(SHOW_EVENT));
    return 'new';
  }
  return 'latest';
}

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
      registered = registration;
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

  useEffect(() => {
    const show = () => setNeedRefresh(true);
    window.addEventListener(SHOW_EVENT, show);
    return () => window.removeEventListener(SHOW_EVENT, show);
  }, [setNeedRefresh]);

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
