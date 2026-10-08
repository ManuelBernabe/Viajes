import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSession } from '../app/SessionContext';
import { describeError } from '../api';
import { t } from '../i18n';
import { setLocked, trustForAWhile, useLocked, verify, watchVisibility } from './appLock';
import { LockSetup } from './LockSetup';

/** Pantalla de bloqueo: tapa toda la app hasta pasar Face ID (o la contraseña de la cuenta, si Face ID no va). */
export function AppLock() {
  const locked = useLocked();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const tried = useRef(false);

  useEffect(() => watchVisibility(), []);

  /** «auto»: el intento al aparecer; el iPhone puede negarlo sin un toque, y entonces no es un fallo que haya que contar. */
  async function unlock(auto = false) {
    setBusy(true);
    setFailed(false);
    const ok = await verify();
    setBusy(false);
    if (ok) {
      setLocked(false);
    } else if (!auto) {
      setFailed(true);
    }
  }

  // Al aparecer, se pide Face ID directamente una vez; si el iPhone no deja sin un toque, queda el botón.
  useEffect(() => {
    if (locked && !tried.current) {
      tried.current = true;
      void unlock(true);
    }
    if (!locked) {
      tried.current = false;
      setUsePassword(false);
      setPassword('');
      setMessage('');
    }
  }, [locked]);

  async function withPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await session.signIn(session.email ?? '', password);
      // Con la contraseña se puede, durante un rato, quitar Face ID en Ajustes aunque Face ID no funcione.
      trustForAWhile();
      setLocked(false);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  if (!locked) {
    // Sin Face ID activado en este móvil, se pide activarlo: es obligatorio.
    return <LockSetup />;
  }

  return (
    <div className="app-lock" role="dialog" aria-modal="true" aria-labelledby="lock-title">
      <div className="app-lock-card">
        <div style={{ fontSize: '3rem' }}>🔒</div>
        <h2 id="lock-title">{t('Viajes está bloqueada')}</h2>
        {!usePassword ? (
          <>
            <button className="btn primary block" type="button" disabled={busy} onClick={() => void unlock()}>
              {busy ? t('Esperando a Face ID…') : t('Desbloquear con Face ID')}
            </button>
            {failed && <p className="small muted">{t('No se ha podido comprobar. Vuelve a intentarlo o entra con la contraseña de la cuenta.')}</p>}
            <button className="btn block" type="button" style={{ marginTop: 8 }} onClick={() => setUsePassword(true)}>
              {t('Usar la contraseña')}
            </button>
          </>
        ) : (
          <form onSubmit={(e) => void withPassword(e)}>
            <p className="small muted">{session.email}</p>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('Contraseña')} autoFocus />
            <button className="btn primary block" type="submit" disabled={busy || !password} style={{ marginTop: 8 }}>
              {t('Desbloquear')}
            </button>
            {message && <p className="error small">{message}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
