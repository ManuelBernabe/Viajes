import { useEffect, useState, type FormEvent } from 'react';
import { api, describeError } from '../api';
import { t } from '../i18n';

type Session = { state: 'unknown' } | { state: 'offline' } | { state: 'out' } | { state: 'in'; email: string };

export function AuthCheck({ onSignedIn }: { onSignedIn: (signedIn: boolean) => void }) {
  const [session, setSession] = useState<Session>({ state: 'unknown' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<{ email: string }>('/api/auth/me').then(
      (me) => {
        setSession({ state: 'in', email: me.email });
        onSignedIn(true);
      },
      (error) => {
        setSession(error instanceof TypeError ? { state: 'offline' } : { state: 'out' });
        onSignedIn(false);
      },
    );
  }, [onSignedIn]);

  async function submit(path: string, body: object) {
    setMessage('');
    try {
      const me = await api<{ email: string }>(path, { method: 'POST', body: JSON.stringify(body) });
      setSession({ state: 'in', email: me.email });
      onSignedIn(true);
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  function signIn(event: FormEvent) {
    event.preventDefault();
    void submit('/api/auth/login', { email, password });
  }

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession({ state: 'out' });
    onSignedIn(false);
  }

  return (
    <section>
      <h2>{t('1 · Sesión')}</h2>
      {session.state === 'in' && (
        <>
          <p>✅ {t('Sesión iniciada: {email}', { email: session.email })}</p>
          <button onClick={() => void signOut()}>{t('Cerrar sesión')}</button>
        </>
      )}
      {session.state === 'offline' && <p>{t('Sin conexión: la sesión se comprobará al volver la red.')}</p>}
      {session.state === 'out' && (
        <form onSubmit={signIn}>
          <input type="email" placeholder={t('Email')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder={t('Contraseña')} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit">{t('Entrar')}</button>
          <input placeholder={t('Código de registro (solo para crear cuenta)')} value={code} onChange={(e) => setCode(e.target.value)} />
          <button type="button" onClick={() => void submit('/api/auth/register', { email, password, code })}>
            {t('Crear cuenta')}
          </button>
        </form>
      )}
      {message && <p className="error">{message}</p>}
    </section>
  );
}
