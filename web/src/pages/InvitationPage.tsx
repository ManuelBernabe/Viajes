import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { describeError } from '../api';
import { useSession } from '../app/SessionContext';
import { ForgotPassword } from '../auth/ForgotPassword';
import { acceptInvitation, describeInvitationState, lookupInvitation, type InvitationInfo } from '../household/household';
import { t } from '../i18n';

/**
 * Página del enlace de invitación. Sin sesión: crear cuenta (sin código) o entrar con una existente y unirse.
 * Con sesión: unirse con la cuenta actual o cambiar de cuenta.
 */
export function InvitationPage() {
  const { token = '' } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    lookupInvitation(token).then(setInfo, (error: unknown) => setMessage(describeError(error)));
  }, [token]);

  async function join() {
    setBusy(true);
    setMessage('');
    try {
      const name = await acceptInvitation(token);
      setMessage(t('Ya formas parte de «{name}».', { name }));
      navigate('/', { replace: true });
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'register') {
        // El alta con invitación deja la cuenta dentro del hogar; el canje posterior solo confirma.
        await session.signUp(email.trim(), password, { invitation: token });
      } else {
        await session.signIn(email.trim(), password);
      }
      const name = await acceptInvitation(token);
      setMessage(t('Ya formas parte de «{name}».', { name }));
      navigate('/', { replace: true });
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  const problem = info && info.state !== 'valid' ? describeInvitationState(info.state) : '';

  return (
    <main className="page no-tabs">
      <div className="topbar">
        <h1>{t('Invitación')}</h1>
      </div>
      <section className="card">
        {!info && !message && <p className="muted">{t('Comprobando la invitación…')}</p>}
        {info && info.state === 'valid' && (
          <p>
            <strong>{info.invitedBy ?? t('Alguien')}</strong>{' '}
            {info.householdName
              ? t('te invita a ver y editar sus viajes en Viajes (hogar «{household}»).', { household: info.householdName })
              : t('te invita a ver y editar sus viajes en Viajes.')}
          </p>
        )}
        {problem && <p className="error">{problem}</p>}

        {info?.state === 'valid' && session.status === 'in' && (
          <>
            <p className="small muted">{t('Tienes la sesión iniciada como {email}.', { email: session.email ?? '' })}</p>
            <button className="btn primary block" type="button" disabled={busy} onClick={() => void join()}>
              {t('Unirme con esta cuenta')}
            </button>
            <button className="btn block" type="button" style={{ marginTop: 8 }} disabled={busy} onClick={() => void session.signOut()}>
              {t('Usar otra cuenta')}
            </button>
          </>
        )}

        {info?.state === 'valid' && session.status === 'out' && (
          <form onSubmit={submit}>
            <h2 style={{ marginTop: 0 }}>{mode === 'register' ? t('Crear mi cuenta') : t('Entrar con mi cuenta')}</h2>
            <div className="field">
              <label htmlFor="email">{t('Email')}</label>
              <input id="email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">{t('Contraseña')}</label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn primary block" type="submit" disabled={busy}>
              {mode === 'register' ? t('Crear cuenta y unirme') : t('Entrar y unirme')}
            </button>
            <button className="btn block" type="button" style={{ marginTop: 8 }} onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>
              {mode === 'register' ? t('Ya tengo cuenta') : t('No tengo cuenta')}
            </button>
            {mode === 'login' && <ForgotPassword email={email} />}
          </form>
        )}
        {message && <p className="error">{message}</p>}
        <p className="small muted" style={{ marginTop: 12 }}>
          {t('Después, añade la app a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y activa los avisos en Ajustes. Todo está explicado en la')}{' '}
          <Link to="/guia">{t('guía de uso')}</Link>.
        </p>
      </section>
    </main>
  );
}
