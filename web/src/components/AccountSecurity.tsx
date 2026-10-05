import { useState, type FormEvent } from 'react';
import { api, describeError } from '../api';
import { t } from '../i18n';

/** Cambiar la contraseña y cerrar la sesión en todos los dispositivos (por ejemplo, si se pierde el móvil). */
export function AccountSecurity({ onSignedOutEverywhere }: { onSignedOutEverywhere: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await api('/api/auth/password', { method: 'POST', body: JSON.stringify({ current, new: next }) });
      setCurrent('');
      setNext('');
      setOpen(false);
      setMessage(t('Contraseña cambiada. Las sesiones de otros dispositivos se cerrarán en un minuto.'));
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function everywhere() {
    if (!confirm(t('¿Cerrar la sesión en todos los dispositivos, también en este? Tendrás que volver a entrar con tu contraseña.'))) {
      return;
    }
    setBusy(true);
    try {
      await api('/api/auth/logout-everywhere', { method: 'POST', body: '{}' });
      await onSignedOutEverywhere();
    } catch (error) {
      setMessage(describeError(error));
      setBusy(false);
    }
  }

  return (
    <>
      {!open ? (
        <button className="btn block" type="button" style={{ marginTop: 8 }} disabled={busy} onClick={() => setOpen(true)}>
          {t('Cambiar contraseña')}
        </button>
      ) : (
        <form onSubmit={changePassword}>
          <div className="field">
            <label htmlFor="current-password">{t('Contraseña actual')}</label>
            <input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="new-password">{t('Nueva contraseña (10 caracteres o más)')}</label>
            <input id="new-password" type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
          </div>
          <button className="btn primary block" type="submit" disabled={busy}>
            {t('Guardar contraseña')}
          </button>
          <button className="btn block" type="button" style={{ marginTop: 8 }} onClick={() => setOpen(false)}>
            {t('Cancelar')}
          </button>
        </form>
      )}
      <button className="btn danger block" type="button" style={{ marginTop: 8 }} disabled={busy} onClick={() => void everywhere()}>
        {t('Cerrar sesión en todos los dispositivos')}
      </button>
      <p className="muted small">{t('Útil si pierdes el móvil: desde cualquier otro dispositivo cortas el acceso en un minuto.')}</p>
      {message && <p className="small">{message}</p>}
    </>
  );
}
