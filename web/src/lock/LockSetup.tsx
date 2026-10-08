import { useEffect, useState } from 'react';
import { useSession } from '../app/SessionContext';
import { t } from '../i18n';
import { enableLock, lockSupported, useLockConfig } from './appLock';

/** Si no se ha podido activar, se deja entrar solo hasta cerrar la app: al volver a abrirla se pide otra vez. */
let postponed = false;

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

  useEffect(() => {
    void lockSupported().then(setSupported);
  }, []);

  if (config || !supported || postponed) {
    return null;
  }

  async function activate() {
    setBusy(true);
    setFailed(false);
    try {
      await enableLock(session.email ?? '', 1);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function later() {
    postponed = true;
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
        {failed && (
          <>
            <p className="small">
              {t('No se ha podido activar. Si el iPhone abre otra app (Microsoft Authenticator, por ejemplo), esa app no sirve para esto: al guardar la llave elige «Contraseñas». Si no te deja elegir, ve a Ajustes del iPhone → General → Autorrelleno y contraseñas, activa «Contraseñas» y vuelve a intentarlo.')}
            </p>
            <button className="btn block" type="button" style={{ marginTop: 8 }} onClick={later}>
              {t('Entrar ahora y activarlo la próxima vez')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
