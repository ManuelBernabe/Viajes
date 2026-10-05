import { useEffect, useState } from 'react';
import { useSession } from '../app/SessionContext';
import { t } from '../i18n';
import { disableLock, enableLock, isTrusted, lockSupported, setAfterMinutes, useLockConfig, verify } from './appLock';

const DELAYS = [0, 1, 5, 15];

/** Ajustes → «Face ID»: activar el bloqueo en este móvil y cuándo se vuelve a pedir. */
export function LockSettings() {
  const config = useLockConfig();
  const session = useSession();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void lockSupported().then(setSupported);
  }, []);

  async function enable() {
    setMessage('');
    try {
      await enableLock(session.email ?? '', 1);
      setMessage(`✓ ${t('Activado. A partir de ahora la app pedirá Face ID al abrirla.')}`);
    } catch {
      setMessage(t('No se ha podido activar. Si el iPhone abre otra app (Microsoft Authenticator, por ejemplo), esa app no sirve para esto: al guardar la llave elige «Contraseñas». Si no te deja elegir, ve a Ajustes del iPhone → General → Autorrelleno y contraseñas, activa «Contraseñas» y vuelve a intentarlo.'))
    }
  }

  async function disable() {
    // Para quitarlo también hay que pasar Face ID: si no, cualquiera con el móvil lo apagaría.
    if (isTrusted() || (await verify())) {
      disableLock();
      setMessage('');
    } else {
      setMessage(t('Para quitar el bloqueo hay que pasar Face ID. Si no te funciona, bloquea la app, entra con la contraseña y quítalo enseguida.'));
    }
  }

  const label = (minutes: number) =>
    minutes === 0 ? t('Cada vez que vuelvo a la app') : minutes === 1 ? t('Tras 1 minuto fuera') : t('Tras {n} minutos fuera', { n: minutes });

  return (
    <section className="card">
      <h3>🔒 {t('Face ID')}</h3>
      <p className="small muted">
        {t('Pide Face ID (o el código del iPhone) para abrir Viajes en este móvil: tus reservas, QR y documentos quedan protegidos si alguien coge el móvil desbloqueado.')}
      </p>
      {supported === false && !config && <p className="small">{t('Este navegador no permite usar Face ID. Abre Viajes desde el icono de la pantalla de inicio.')}</p>}
      {config ? (
        <>
          <div className="field">
            <label htmlFor="lock-after">{t('Pedir Face ID')}</label>
            <select id="lock-after" value={config.afterMinutes} onChange={(e) => setAfterMinutes(Number(e.target.value))}>
              {DELAYS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {label(minutes)}
                </option>
              ))}
            </select>
          </div>
          <button className="btn block danger" type="button" onClick={() => void disable()}>
            {t('Quitar Face ID')}
          </button>
        </>
      ) : (
        supported && (
          <button className="btn primary block" type="button" onClick={() => void enable()}>
            {t('Activar Face ID')}
          </button>
        )
      )}
      {message && <p className="small">{message}</p>}
    </section>
  );
}
