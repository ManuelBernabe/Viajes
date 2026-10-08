import { useEffect, useState } from 'react';
import { useSession } from '../app/SessionContext';
import { t } from '../i18n';
import { DEFAULT_AFTER_MINUTES, enableLock, lockSupported, setAfterMinutes, useLockConfig } from './appLock';

const DELAYS = [0, 1, 5, 15, 30, 60];

/** Ajustes → «Face ID»: es obligatorio; aquí se elige cuándo se vuelve a pedir (o se activa si quedó pendiente). */
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
      await enableLock(session.email ?? '', DEFAULT_AFTER_MINUTES);
      setMessage(`✓ ${t('Activado. A partir de ahora la app pedirá Face ID al abrirla.')}`);
    } catch {
      setMessage(t('No se ha podido activar. Si el iPhone abre otra app (Microsoft Authenticator, por ejemplo), esa app no sirve para esto: al guardar la llave elige «Contraseñas». Si no te deja elegir, ve a Ajustes del iPhone → General → Autorrelleno y contraseñas, activa «Contraseñas» y vuelve a intentarlo.'))
    }
  }

  const label = (minutes: number) =>
    minutes === 0
      ? t('Cada vez que vuelvo a la app')
      : minutes === 1
        ? t('Tras 1 minuto fuera')
        : minutes === 60
          ? t('Tras 1 hora fuera')
          : t('Tras {n} minutos fuera', { n: minutes });

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
          <p className="small muted">{t('Face ID es obligatorio para entrar en Viajes: no se puede quitar.')}</p>
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
