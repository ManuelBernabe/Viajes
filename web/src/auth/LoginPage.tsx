import { useState, type FormEvent } from 'react';
import { describeError } from '../api';
import { useSession } from '../app/SessionContext';

export function LoginPage() {
  const session = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(session.email ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'login') {
        await session.signIn(email.trim(), password);
      } else {
        await session.signUp(email.trim(), password, { code: code.trim() });
      }
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page no-tabs">
      <div className="topbar">
        <h1>Viajes</h1>
      </div>
      {session.unverified && <p className="notice">Sin conexión: no se ha podido comprobar la sesión. Inténtalo cuando tengas red.</p>}
      <form onSubmit={submit} className="card">
        <h2 style={{ marginTop: 0 }}>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
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
        {mode === 'register' && (
          <div className="field">
            <label htmlFor="code">Código de registro</label>
            <input id="code" value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
        )}
        {message && <p className="error">{message}</p>}
        <button className="btn primary block" type="submit" disabled={busy}>
          {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
        <button className="btn block" type="button" style={{ marginTop: 8 }} onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'No tengo cuenta' : 'Ya tengo cuenta'}
        </button>
      </form>
      {mode === 'login' && (
        <p className="small muted center">
          ¿Has olvidado la contraseña? Pide a quien administra tu hogar que te mande un enlace para cambiarla (Ajustes → Hogar →
          «Contraseña» junto a tu nombre).
        </p>
      )}
    </main>
  );
}
