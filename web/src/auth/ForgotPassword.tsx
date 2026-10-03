import { useState } from 'react';
import { api, describeError } from '../api';

/**
 * «¿Has olvidado la contraseña?»: pide un enlace por correo con el email de la cuenta. Lo envía el script de Gmail del
 * hogar en uno o dos minutos. La respuesta es la misma exista o no la cuenta.
 */
export function ForgotPassword({ email: initial }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');

  async function request() {
    setBusy(true);
    setMessage('');
    try {
      await api('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email: email.trim() }) });
      setSent(true);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        className="btn block"
        type="button"
        style={{ marginTop: 8 }}
        onClick={() => {
          setEmail(initial || email);
          setOpen(true);
        }}
      >
        ¿Has olvidado la contraseña?
      </button>
    );
  }

  return (
    <div className="notice" style={{ marginTop: 12 }}>
      {sent ? (
        <p className="small" style={{ margin: 0 }}>
          Si <strong>{email.trim()}</strong> tiene cuenta, en uno o dos minutos te llegará un correo con un enlace para poner una
          contraseña nueva (mira también en spam). Ábrelo en este móvil. Si no llega, pide a quien administra tu hogar el enlace desde
          Ajustes → Hogar → «Contraseña».
        </p>
      ) : (
        <>
          <div className="small">Escribe el email de tu cuenta y te mandamos un enlace para poner una contraseña nueva:</div>
          <div className="field" style={{ marginTop: 8 }}>
            <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {message && <p className="error small">{message}</p>}
          <button className="btn primary block" type="button" disabled={busy || !email.trim()} onClick={() => void request()}>
            Enviarme el enlace
          </button>
        </>
      )}
    </div>
  );
}
