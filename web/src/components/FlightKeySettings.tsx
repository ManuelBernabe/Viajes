import { useEffect, useState } from 'react';
import { api, describeError } from '../api';
import { locale, t } from '../i18n';

interface FlightKeyStatus {
  configured: boolean;
  origin: 'server' | 'app' | null;
  provider: string;
  hint: string | null;
  lastError: string | null;
  lastOkMs: number | null;
}

/**
 * «🛰️ Estado de los vuelos» en Ajustes (solo quien administra): pegar la clave de AeroDataBox (RapidAPI) o de FlightAware
 * para activar el estado de los vuelos en directo. El servidor la guarda cifrada y nunca la devuelve entera.
 */
export function FlightKeySettings({ admin }: { admin: boolean }) {
  const [status, setStatus] = useState<FlightKeyStatus | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    try {
      setStatus(await api<FlightKeyStatus>('/api/settings/flight-status'));
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  useEffect(() => {
    if (admin) {
      void load();
    }
  }, [admin]);

  if (!admin) {
    return null;
  }

  async function save(remove = false) {
    setBusy(true);
    setMessage('');
    try {
      await api('/api/settings/flight-status', remove ? { method: 'DELETE' } : { method: 'PUT', body: JSON.stringify({ key }) });
      setKey('');
      setMessage(remove ? t('Clave quitada.') : t('Clave guardada. Los vuelos de las próximas 24 h se empiezan a seguir en unos minutos.'));
      await load();
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>🛰️ {t('Estado de los vuelos')}</h3>
      {status?.configured ? (
        <p className="small">
          ✅ {t('Activado con {provider}', { provider: status.provider })}
          {status.hint && ` · ${t('clave …{hint}', { hint: status.hint })}`}
          {status.origin === 'server' && ` · ${t('configurada en el servidor')}`}
          {status.lastOkMs && ` · ${t('última consulta correcta: {when}', { when: new Date(status.lastOkMs).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) })}`}
        </p>
      ) : (
        <p className="small muted">
          {t('Pega aquí la clave de AeroDataBox (RapidAPI, plan Basic gratuito) para ver en cada vuelo el retraso, la puerta y la cinta, con avisos si cambian.')}
        </p>
      )}
      {status?.lastError && <p className="small error">⚠️ {status.lastError}</p>}
      {status?.origin !== 'server' && (
        <>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={status?.configured ? t('Pegar otra clave') : t('Pegar la clave')}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            aria-label={t('Clave del proveedor de vuelos')}
          />
          <div className="actions">
            <button className="btn primary" type="button" disabled={busy || key.trim().length === 0} onClick={() => void save()}>
              {t('Guardar clave')}
            </button>
            {status?.origin === 'app' && (
              <button className="btn" type="button" disabled={busy} onClick={() => void save(true)}>
                {t('Quitar clave')}
              </button>
            )}
          </div>
        </>
      )}
      {message && <p className="small muted">{message}</p>}
    </section>
  );
}
