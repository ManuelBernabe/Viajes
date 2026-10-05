import { useEffect, useState } from 'react';
import { api, describeError } from '../api';
import { locale, t } from '../i18n';

interface TokenRow {
  id: string;
  scope?: string;
  createdMs: number;
  revokedMs: number | null;
  lastUsedMs: number | null;
}

/** La clave del calendario solo se ve al crearla: se guarda en este móvil para poder volver a añadirlo o copiarlo. */
const STORED = 'viajes:calendar-token';

function readToken(): string | null {
  try {
    return localStorage.getItem(STORED);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(STORED, token);
    } else {
      localStorage.removeItem(STORED);
    }
  } catch {
    // Sin almacenamiento: habrá que generar otro enlace la próxima vez.
  }
}

export function calendarUrls(host: string, token: string): { webcal: string; https: string } {
  const path = `${host}/api/calendar/${token}.ics`;
  return { webcal: `webcal://${path}`, https: `https://${path}` };
}

/**
 * Ajustes → «Calendario»: suscribe el calendario del iPhone (o Google Calendar) a los viajes y reservas. El calendario
 * pregunta solo cada cierto tiempo, así que lo que cambie en la app aparece allí sin hacer nada.
 */
export function CalendarSettings() {
  const [keys, setKeys] = useState<TokenRow[] | null>(null);
  const [token, setToken] = useState<string | null>(readToken);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const all = await api<TokenRow[]>('/api/import-tokens/');
      const active = all.filter((k) => k.scope === 'calendar' && !k.revokedMs);
      setKeys(active);
      if (active.length === 0 && readToken()) {
        writeToken(null);
        setToken(null);
      }
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function revokeAll() {
    for (const key of keys ?? []) {
      await api(`/api/import-tokens/${key.id}`, { method: 'DELETE' });
    }
  }

  async function subscribe() {
    setMessage('');
    try {
      let current = token;
      if (!current) {
        // Otra clave de antes (de otro móvil): se sustituye, una sola por persona.
        await revokeAll();
        const created = await api<{ token: string }>('/api/import-tokens/', { method: 'POST', body: JSON.stringify({ scope: 'calendar' }) });
        current = created.token;
        writeToken(current);
        setToken(current);
        await load();
      }
      window.location.href = calendarUrls(window.location.host, current).webcal;
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function copy() {
    if (!token) {
      return;
    }
    try {
      await navigator.clipboard.writeText(calendarUrls(window.location.host, token).https);
      setCopied(true);
    } catch {
      setMessage(t('No se ha podido copiar; selecciónalo y cópialo a mano.'));
    }
  }

  async function stop() {
    if (!confirm(t('El calendario dejará de actualizarse y sus eventos desaparecerán en la próxima actualización. ¿Seguir?'))) {
      return;
    }
    try {
      await revokeAll();
      writeToken(null);
      setToken(null);
      await load();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  const active = keys?.[0];
  const lastUse = active?.lastUsedMs ? new Date(active.lastUsedMs).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : null;

  return (
    <section className="card">
      <h3>📅 {t('Calendario')}</h3>
      <p className="small muted">
        {t('Tus viajes y reservas en el calendario del móvil, con su hora. Se actualiza solo cuando cambia algo en la app; cada persona ve sus reservas.')}
      </p>
      <button className="btn primary block" type="button" onClick={() => void subscribe()}>
        {t('Añadir al calendario del iPhone')}
      </button>
      {active && !token && (
        <p className="small muted">
          {t('Ya lo tienes añadido desde otro móvil. Si lo añades aquí, el enlace anterior dejará de actualizarse.')}
        </p>
      )}
      {active && token && (
        <>
          <p className="small muted">
            {lastUse ? t('Activo · el calendario lo consultó por última vez el {when}.', { when: lastUse }) : t('Activo · el calendario aún no lo ha consultado.')}
          </p>
          <div className="actions">
            <button className="btn small" type="button" onClick={() => void copy()}>
              {copied ? t('Copiado ✓') : t('Copiar el enlace (Google Calendar)')}
            </button>
            <button className="btn small danger" type="button" onClick={() => void stop()}>
              {t('Quitar del calendario')}
            </button>
          </div>
        </>
      )}
      {message && <p className="error">{message}</p>}
    </section>
  );
}
