import { useEffect, useState } from 'react';
import { describeError } from '../api';
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from '../push/push';

/** Sección «Avisos» de Ajustes: activar, desactivar y probar las notificaciones. */
export function PushSettings() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    pushState().then(setState, () => setState({ kind: 'unsupported', reason: 'No se ha podido comprobar.' }));
  }, []);

  async function run(action: () => Promise<PushState | number>) {
    setBusy(true);
    setMessage('');
    try {
      const result = await action();
      if (typeof result === 'number') {
        setMessage(result > 0 ? `Aviso enviado a ${result} dispositivo${result === 1 ? '' : 's'}.` : 'No hay ningún dispositivo con avisos activados.');
      } else {
        setState(result);
        if (result.kind === 'denied') {
          setMessage('Permiso denegado. Actívalo en Ajustes del iPhone → Notificaciones → Viajes.');
        } else if (result.kind === 'on') {
          setMessage('Avisos activados en este móvil.');
        }
      }
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Avisos</h3>
      <p className="small">
        La víspera a las 20:00 (hora del lugar), tres horas antes de la salida y al instante si un correo modifica una
        reserva.
      </p>
      {state === null && <p className="muted small">Comprobando…</p>}
      {state?.kind === 'unsupported' && <p className="muted small">{state.reason}</p>}
      {state?.kind === 'denied' && (
        <p className="muted small">Permiso denegado. Actívalo en Ajustes del iPhone → Notificaciones → Viajes.</p>
      )}
      {state?.kind === 'off' && (
        <button className="btn block" disabled={busy} onClick={() => void run(enablePush)}>
          Activar avisos en este móvil
        </button>
      )}
      {state?.kind === 'on' && (
        <>
          <button className="btn block" disabled={busy} onClick={() => void run(sendTestPush)}>
            Enviar un aviso de prueba
          </button>
          <button className="btn block secondary" disabled={busy} onClick={() => void run(disablePush)}>
            Desactivar avisos en este móvil
          </button>
        </>
      )}
      {message && <p className="muted small">{message}</p>}
    </section>
  );
}
