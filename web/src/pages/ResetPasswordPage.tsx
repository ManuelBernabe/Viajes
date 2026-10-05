import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { describeError } from '../api';
import { useSession } from '../app/SessionContext';
import { checkPasswordReset, resetPassword } from '../household/household';
import { t } from '../i18n';

/** Página del enlace para cambiar una contraseña olvidada. Lo genera quien administra el hogar; sirve una vez y 24 horas. */
export function ResetPasswordPage() {
  const { userId = '', token = '' } = useParams();
  const session = useSession();
  const [email, setEmail] = useState<string | null>(null);
  const [state, setState] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    checkPasswordReset(userId, token).then(
      (found) => {
        setEmail(found);
        setState('valid');
      },
      (error: unknown) => {
        setMessage(describeError(error));
        setState('invalid');
      },
    );
  }, [userId, token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== repeat) {
      setMessage(t('Las dos contraseñas no coinciden.'));
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      // Si en este navegador había otra cuenta abierta, se cierra antes: la nueva sesión es la de este enlace.
      if (session.status === 'in') {
        await session.signOut();
      }
      // El servidor ya deja la sesión iniciada al guardar la contraseña: no se vuelve a pasar por el inicio de sesión
      // (que con la cuenta bloqueada por intentos o con el llavero rellenando la antigua podía fallar). Se recarga la app.
      await resetPassword(userId, token, password);
      window.location.replace('/');
      return;
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page no-tabs">
      <div className="topbar">
        <h1>{t('Nueva contraseña')}</h1>
      </div>
      <section className="card">
        {state === 'checking' && <p className="muted">{t('Comprobando el enlace…')}</p>}
        {state === 'invalid' && (
          <>
            <p className="error">{message}</p>
            <Link className="btn block" to="/">
              {t('Ir a la entrada')}
            </Link>
          </>
        )}
        {state === 'valid' && (
          <form onSubmit={submit}>
            <p>
              {t('Pon una contraseña nueva para')} <strong>{email ?? t('tu cuenta')}</strong>.{' '}
              {t('Al guardarla entrarás directamente, y se cerrará la sesión en los demás dispositivos donde la tuvieras abierta.')}
            </p>
            {/* El email oculto ayuda al llavero de iOS a guardar la contraseña nueva con la cuenta correcta. */}
            <input type="email" autoComplete="username" value={email ?? ''} readOnly hidden />
            <div className="field">
              <label htmlFor="new-password">{t('Contraseña nueva')}</label>
              <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="repeat-password">{t('Repítela')}</label>
              <input id="repeat-password" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
            </div>
            <p className="small muted">{t('Al menos 10 caracteres, con mayúsculas, minúsculas y números.')}</p>
            {message && <p className="error">{message}</p>}
            <button className="btn primary block" type="submit" disabled={busy}>
              {t('Guardar y entrar')}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
