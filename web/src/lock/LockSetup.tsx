import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../app/SessionContext';
import { t } from '../i18n';
import { DEFAULT_AFTER_MINUTES, enableLock, lockSupported, useLockConfig } from './appLock';

/**
 * Si no se ha podido activar, se deja entrar un rato (media hora): al volver a la app después se pide otra vez. El iPhone
 * deja la app abierta en segundo plano días, así que «hasta cerrarla» podía ser nunca.
 */
let postponedAt = 0;
const POSTPONE_MS = 30 * 60_000;

/**
 * Face ID es obligatorio: en un móvil que lo permite y donde aún no está activado, esta pantalla tapa la app hasta
 * activarlo. Si el móvil no lo permite (un ordenador sin Touch ID, por ejemplo), no sale.
 */
export function LockSetup() {
  const config = useLockConfig();
  const session = useSession();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, setTick] = useState(0);

  // En un iPhone o iPad se pide siempre: aunque el navegador diga que no hay Face ID (sin código de bloqueo, o con las
  // Contraseñas de iCloud apagadas), la pantalla explica qué activar. Solo se salta en equipos sin Face ID ni Touch ID.
  const [mobileApple] = useState(() => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  useEffect(() => {
    void lockSupported().then(setSupported);
    // Al volver a la app se repasa si toca pedirlo otra vez.
    const onVisible = () => document.visibilityState === 'visible' && setTick((n) => n + 1);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Se cuenta al servidor si este móvil tiene Face ID activado, para que quien administra vea quién falta.
  useEffect(() => {
    if (supported === null) {
      return;
    }
    void api('/api/household/lock-status', { method: 'POST', body: JSON.stringify({ enabled: config !== null, supported }) }).catch(() => {
      // Sin conexión: se contará la próxima vez.
    });
  }, [supported, config !== null]);

  if (config || supported === null || (!supported && !mobileApple) || Date.now() - postponedAt < POSTPONE_MS) {
    return null;
  }

  async function activate() {
    setBusy(true);
    setFailed(false);
    try {
      await enableLock(session.email ?? '', DEFAULT_AFTER_MINUTES);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function later() {
    postponedAt = Date.now();
    setTick((n) => n + 1);
  }

  return (
    <div className="app-lock" role="dialog" aria-modal="true" aria-labelledby="lock-setup-title">
      <div className="app-lock-card">
        <div style={{ fontSize: '3rem' }}>🔐</div>
        <h2 id="lock-setup-title">{t('Protege Viajes con Face ID')}</h2>
        <p className="small muted">
          {t('Para entrar en Viajes hace falta Face ID (o el código del iPhone). Así tus reservas, QR y documentos quedan protegidos aunque alguien coja el móvil desbloqueado.')}
        </p>
        <button className="btn primary block" type="button" disabled={busy} onClick={() => void activate()}>
          {busy ? t('Esperando a Face ID…') : t('Activar Face ID')}
        </button>
        {supported === false && (
          <p className="small">
            {t('Este iPhone no deja usar Face ID en la app ahora mismo. Comprueba en Ajustes del iPhone → Face ID y código que hay un código puesto, y en Ajustes → General → Autorrelleno y contraseñas que «Contraseñas» está activado. Después vuelve a abrir Viajes.')}
          </p>
        )}
        {failed && (
          <>
            <p className="small">
              {t('No se ha podido activar. Si el iPhone abre otra app (Microsoft Authenticator, por ejemplo), esa app no sirve para esto: al guardar la llave elige «Contraseñas». Si no te deja elegir, ve a Ajustes del iPhone → General → Autorrelleno y contraseñas, activa «Contraseñas» y vuelve a intentarlo.')}
            </p>
          </>
        )}
        {(failed || supported === false) && (
          <button className="btn block" type="button" style={{ marginTop: 8 }} onClick={later}>
            {t('Entrar ahora y activarlo la próxima vez')}
          </button>
        )}
      </div>
    </div>
  );
}
