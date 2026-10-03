import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { describeError } from '../api';
import { useSession } from '../app/SessionContext';
import { ForgotPassword } from '../auth/ForgotPassword';
import { acceptInvitation, describeInvitationState, lookupInvitation, type InvitationInfo } from '../household/household';

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
      setMessage(`Ya formas parte de «${name}».`);
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
      setMessage(`Ya formas parte de «${name}».`);
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
        <h1>Invitación</h1>
      </div>
      <section className="card">
        {!info && !message && <p className="muted">Comprobando la invitación…</p>}
        {info && info.state === 'valid' && (
          <p>
            <strong>{info.invitedBy ?? 'Alguien'}</strong> te invita a ver y editar sus viajes en Viajes
            {info.householdName ? ` (hogar «${info.householdName}»)` : ''}.
          </p>
        )}
        {problem && <p className="error">{problem}</p>}

        {info?.state === 'valid' && session.status === 'in' && (
          <>
            <p className="small muted">Tienes la sesión iniciada como {session.email}.</p>
            <button className="btn primary block" type="button" disabled={busy} onClick={() => void join()}>
              Unirme con esta cuenta
            </button>
            <button className="btn block" type="button" style={{ marginTop: 8 }} disabled={busy} onClick={() => void session.signOut()}>
              Usar otra cuenta
            </button>
          </>
        )}

        {info?.state === 'valid' && session.status === 'out' && (
          <form onSubmit={submit}>
            <h2 style={{ marginTop: 0 }}>{mode === 'register' ? 'Crear mi cuenta' : 'Entrar con mi cuenta'}</h2>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">Contraseña</label>
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
              {mode === 'register' ? 'Crear cuenta y unirme' : 'Entrar y unirme'}
            </button>
            <button className="btn block" type="button" style={{ marginTop: 8 }} onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>
              {mode === 'register' ? 'Ya tengo cuenta' : 'No tengo cuenta'}
            </button>
            {mode === 'login' && <ForgotPassword email={email} />}
          </form>
        )}
        {message && <p className="error">{message}</p>}
        <p className="small muted" style={{ marginTop: 12 }}>
          Después, añade la app a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y activa los avisos en Ajustes. Todo
          está explicado en la <Link to="/guia">guía de uso</Link>.
        </p>
      </section>
    </main>
  );
}
