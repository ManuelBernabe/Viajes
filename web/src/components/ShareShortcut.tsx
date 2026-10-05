import { useEffect, useState } from 'react';
import { api, describeError } from '../api';
import { locale, t } from '../i18n';

interface TokenRow {
  id: string;
  label: string;
  scope?: string;
  createdMs: number;
  revokedMs: number | null;
  lastUsedMs: number | null;
}

/**
 * Enlace de iCloud del atajo «Enviar a Viajes» ya hecho. Mientras esté vacío, Ajustes enseña cómo crearlo a mano;
 * cuando alguien lo cree y lo comparta, basta con poner aquí su enlace para que los demás lo instalen con un toque.
 */
export const SHORTCUT_ICLOUD_URL = 'https://www.icloud.com/shortcuts/92078364cf7240f6b0103cfff51fb95e';

function when(ms: number | null): string {
  return ms ? new Date(ms).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : t('nunca');
}

/** Ajustes → «Atajo de iPhone»: la clave personal del atajo y cómo instalarlo. */
export function ShareShortcut() {
  const [keys, setKeys] = useState<TokenRow[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const all = await api<TokenRow[]>('/api/import-tokens/');
      setKeys(all.filter((t) => t.scope === 'share' && !t.revokedMs));
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    if (keys && keys.length > 0 && !confirm(t('Se creará una clave nueva y la anterior dejará de funcionar. ¿Seguir?'))) {
      return;
    }
    setMessage('');
    try {
      for (const key of keys ?? []) {
        await api(`/api/import-tokens/${key.id}`, { method: 'DELETE' });
      }
      const created = await api<{ token: string }>('/api/import-tokens/', { method: 'POST', body: JSON.stringify({ scope: 'share' }) });
      setFresh(created.token);
      setCopied('');
      await load();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setMessage(t('No se ha podido copiar; selecciónalo y cópialo a mano.'));
    }
  }

  const active = keys?.[0];

  return (
    <section className="card">
      <h3>{t('Atajo de iPhone')}</h3>
      <p className="small muted">
        {t('Con el atajo «Enviar a Viajes», desde cualquier PDF, captura o texto (en Mail, Gmail, WhatsApp, Archivos…) pulsas')}{' '}
        <strong>{t('Compartir → Enviar a Viajes')}</strong> {t('y en unos segundos lo tienes en «por revisar», con los datos ya leídos.')}
      </p>

      {fresh ? (
        <div className="notice">
          <div className="small">
            {t('Tu clave personal. Cópiala ahora: no se volverá a mostrar. Pégala en el bloque Texto del atajo (paso 3).')}
          </div>
          <code style={{ wordBreak: 'break-all', display: 'block', margin: '6px 0' }}>{fresh}</code>
          <button className="btn small" type="button" onClick={() => void copy(fresh, 'clave')}>
            {copied === 'clave' ? t('Copiada ✓') : t('Copiar la clave')}
          </button>
        </div>
      ) : active ? (
        <p className="small">
          {t('Tienes una clave activa (creada {created} · último uso {used}). Si cambias de móvil o la pierdes, genera otra.', {
            created: when(active.createdMs),
            used: when(active.lastUsedMs),
          })}
        </p>
      ) : null}

      <button className="btn block" type="button" onClick={() => void create()}>
        {active ? t('Generar una clave nueva') : t('1. Generar mi clave')}
      </button>

      {SHORTCUT_ICLOUD_URL ? (
        <>
          <a className="btn primary block" style={{ marginTop: 8 }} href={SHORTCUT_ICLOUD_URL}>
            {t('2. Instalar el atajo')}
          </a>
          <ol className="small" style={{ paddingLeft: 18, marginTop: 10 }} start={3}>
            <li>
              {t('En la app')} <strong>{t('Atajos')}</strong>
              {t(', toca los')} <strong>···</strong> {t('de «Enviar a Viajes». En el bloque')} <strong>{t('Texto')}</strong>{' '}
              {t('borra')} <em>Pega aquí tu clave</em> {t('y pega la tuya. Debe quedar')} <code>Bearer</code>
              {t(', un espacio y la clave, sin nada más.')}
            </li>
            <li>
              {t('Úsalo desde un PDF, una captura o un texto:')} <strong>{t('Compartir → Enviar a Viajes')}</strong>
              {t('. La primera vez, si pregunta,')} <strong>{t('Permitir siempre')}</strong>.
            </li>
          </ol>
          <p className="small muted">{t('Si generas una clave nueva, cámbiala también en el bloque Texto del atajo.')}</p>
        </>
      ) : (
        <p className="small muted" style={{ marginTop: 8 }}>{t('El atajo aún no está publicado.')}</p>
      )}
      {message && <p className="error small">{message}</p>}
    </section>
  );
}
