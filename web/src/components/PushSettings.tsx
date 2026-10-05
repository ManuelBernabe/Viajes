import { useEffect, useState } from 'react';
import { ApiError, describeError } from '../api';
import { t } from '../i18n';

/** Los errores del navegador (permiso, suscripción, worker) se enseñan tal cual: son la pista para arreglarlo. */
function describePushError(error: unknown): string {
  if (error instanceof ApiError || error instanceof TypeError) {
    return describeError(error);
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return describeError(error);
}
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
    pushState().then(setState, () => setState({ kind: 'unsupported', reason: t('No se ha podido comprobar.') }));
  }, []);

  async function refreshDiagnostics() {
    try {
      setDiagnostics(await pushDiagnostics());
    } catch (error) {
      setMessage(describePushError(error));
    }
  }

  async function run(action: () => Promise<PushState | number | void>) {
    setBusy(true);
    setMessage('');
    try {
      const result = await action();
      if (result === undefined) {
        setMessage(t('Aviso local mostrado. Si no lo ves, revisa Ajustes del iPhone → Notificaciones → Viajes y el modo de concentración.'));
      } else if (typeof result === 'number') {
        if (result < 0) {
          setMessage(t('Llegará en {n} segundos: cierra la app y espera en la pantalla de inicio.', { n: TEST_DELAY_S }));
        } else {
          setMessage(
            result === 1
              ? t('Aviso enviado a 1 dispositivo.')
              : result > 0
                ? t('Aviso enviado a {n} dispositivos.', { n: result })
                : t('No hay ningún dispositivo con avisos activados.'),
          );
        }
      } else {
        setState(result);
        if (result.kind === 'denied') {
          setMessage(t('Permiso denegado. Actívalo en Ajustes del iPhone → Notificaciones → Viajes.'));
        } else if (result.kind === 'on') {
          setMessage(t('Avisos activados en este móvil.'));
        }
      }
    } catch (error) {
      setMessage(describePushError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>{t('Avisos')}</h3>
      <p className="small">
        {t('La víspera a las 20:00 (hora del lugar), tres horas antes de la salida y al instante si un correo modifica una reserva.')}
      </p>
      {state === null && <p className="muted small">{t('Comprobando…')}</p>}
      {state?.kind === 'unsupported' && <p className="muted small">{state.reason}</p>}
      {state?.kind === 'denied' && (
        <p className="muted small">{t('Permiso denegado. Actívalo en Ajustes del iPhone → Notificaciones → Viajes.')}</p>
      )}
      {state?.kind === 'off' && (
        <button className="btn block" disabled={busy} onClick={() => void run(() => enablePush((step) => setMessage(`${step}…`)))}>
          {t('Activar avisos en este móvil')}
        </button>
      )}
      {state?.kind === 'on' && (
        <>
          <button className="btn block" disabled={busy} onClick={() => void run(showLocalTest)}>
            {t('Mostrar un aviso local (sin servidor)')}
          </button>
          <button className="btn block" disabled={busy} onClick={() => void run(() => sendTestPush(TEST_DELAY_S))}>
            {t('Enviar un aviso de prueba en {n} s', { n: TEST_DELAY_S })}
          </button>
          <button className="btn block secondary" disabled={busy} onClick={() => void run(disablePush)}>
            {t('Desactivar avisos en este móvil')}
          </button>
        </>
      )}
      {message && <p className="muted small">{message}</p>}
      {(state?.kind === 'on' || state?.kind === 'off') && (
        <details onToggle={(event) => event.currentTarget.open && void refreshDiagnostics()}>
          <summary className="small">{t('Diagnóstico de avisos')}</summary>
          {diagnostics ? (
            <div className="small">
              <p>Service worker: {diagnostics.workerBuild ?? t('sin respuesta (versión antigua sin avisos)')}</p>
              <p>{t('Estado: {state}', { state: diagnostics.workerState })}</p>
              <p>{t('Servicio push: {host}', { host: diagnostics.endpointHost ?? t('ninguno') })}</p>
              <p>{t('Bitácora del móvil ({n}):', { n: diagnostics.log.length })}</p>
              {diagnostics.log.length === 0 ? (
                <p className="muted">{t('Ningún push ha llegado todavía a este móvil.')}</p>
              ) : (
                <ul>
                  {diagnostics.log.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
              <button className="btn block secondary" onClick={() => void refreshDiagnostics()}>
                {t('Actualizar diagnóstico')}
              </button>
            </div>
          ) : (
            <p className="muted small">{t('Consultando…')}</p>
          )}
        </details>
      )}
    </section>
  );
}
