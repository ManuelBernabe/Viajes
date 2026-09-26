import { useEffect, useState } from 'react';
import { describeError } from '../api';
import {
  disablePush,
  enablePush,
  pushDiagnostics,
  pushState,
  sendTestPush,
  showLocalTest,
  type PushDiagnostics,
  type PushState,
} from '../push/push';

const TEST_DELAY_S = 10;

/** Sección «Avisos» de Ajustes: activar, desactivar y probar las notificaciones. */
export function PushSettings() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [diagnostics, setDiagnostics] = useState<PushDiagnostics | null>(null);

  useEffect(() => {
    pushState().then(setState, () => setState({ kind: 'unsupported', reason: 'No se ha podido comprobar.' }));
  }, []);

  async function refreshDiagnostics() {
    try {
      setDiagnostics(await pushDiagnostics());
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function run(action: () => Promise<PushState | number | void>) {
    setBusy(true);
    setMessage('');
    try {
      const result = await action();
      if (result === undefined) {
        setMessage('Aviso local mostrado. Si no lo ves, revisa Ajustes del iPhone → Notificaciones → Viajes y el modo de concentración.');
      } else if (typeof result === 'number') {
        if (result < 0) {
          setMessage(`Llegará en ${TEST_DELAY_S} segundos: cierra la app y espera en la pantalla de inicio.`);
        } else {
          setMessage(result > 0 ? `Aviso enviado a ${result} dispositivo${result === 1 ? '' : 's'}.` : 'No hay ningún dispositivo con avisos activados.');
        }
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
          <button className="btn block" disabled={busy} onClick={() => void run(showLocalTest)}>
            Mostrar un aviso local (sin servidor)
          </button>
          <button className="btn block" disabled={busy} onClick={() => void run(() => sendTestPush(TEST_DELAY_S))}>
            Enviar un aviso de prueba en {TEST_DELAY_S} s
          </button>
          <button className="btn block secondary" disabled={busy} onClick={() => void run(disablePush)}>
            Desactivar avisos en este móvil
          </button>
        </>
      )}
      {message && <p className="muted small">{message}</p>}
      {state?.kind === 'on' && (
        <details onToggle={(event) => event.currentTarget.open && void refreshDiagnostics()}>
          <summary className="small">Diagnóstico de avisos</summary>
          {diagnostics ? (
            <div className="small">
              <p>Service worker: {diagnostics.workerBuild ?? 'sin respuesta (versión antigua sin avisos)'}</p>
              <p>Servicio push: {diagnostics.endpointHost ?? 'ninguno'}</p>
              <p>Bitácora del móvil ({diagnostics.log.length}):</p>
              {diagnostics.log.length === 0 ? (
                <p className="muted">Ningún push ha llegado todavía a este móvil.</p>
              ) : (
                <ul>
                  {diagnostics.log.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
              <button className="btn block secondary" onClick={() => void refreshDiagnostics()}>
                Actualizar diagnóstico
              </button>
            </div>
          ) : (
            <p className="muted small">Consultando…</p>
          )}
        </details>
      )}
    </section>
  );
}
