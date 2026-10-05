import { useEffect, useState } from 'react';
import { api, describeError } from '../api';
import { locale } from '../i18n';

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
  return ms ? new Date(ms).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : 'nunca';
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
    if (keys && keys.length > 0 && !confirm('Se creará una clave nueva y la anterior dejará de funcionar. ¿Seguir?')) {
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
      setMessage('No se ha podido copiar; selecciónalo y cópialo a mano.');
    }
  }

  const active = keys?.[0];

  return (
    <section className="card">
      <h3>Atajo de iPhone</h3>
      <p className="small muted">
        Con el atajo «Enviar a Viajes», desde cualquier PDF, captura o texto (en Mail, Gmail, WhatsApp, Archivos…) pulsas{' '}
        <strong>Compartir → Enviar a Viajes</strong> y en unos segundos lo tienes en «por revisar», con los datos ya leídos.
      </p>

      {fresh ? (
        <div className="notice">
          <div className="small">
            Tu clave personal. Cópiala ahora: no se volverá a mostrar. Pégala en el bloque Texto del atajo (paso 3).
          </div>
          <code style={{ wordBreak: 'break-all', display: 'block', margin: '6px 0' }}>{fresh}</code>
          <button className="btn small" type="button" onClick={() => void copy(fresh, 'clave')}>
            {copied === 'clave' ? 'Copiada ✓' : 'Copiar la clave'}
          </button>
        </div>
      ) : active ? (
        <p className="small">
          Tienes una clave activa (creada {when(active.createdMs)} · último uso {when(active.lastUsedMs)}). Si cambias de móvil o la
          pierdes, genera otra.
        </p>
      ) : null}

      <button className="btn block" type="button" onClick={() => void create()}>
        {active ? 'Generar una clave nueva' : '1. Generar mi clave'}
      </button>

      {SHORTCUT_ICLOUD_URL ? (
        <>
          <a className="btn primary block" style={{ marginTop: 8 }} href={SHORTCUT_ICLOUD_URL}>
            2. Instalar el atajo
          </a>
          <ol className="small" style={{ paddingLeft: 18, marginTop: 10 }} start={3}>
            <li>
              En la app <strong>Atajos</strong>, toca los <strong>···</strong> de «Enviar a Viajes». En el bloque <strong>Texto</strong> borra{' '}
              <em>Pega aquí tu clave</em> y pega la tuya. Debe quedar <code>Bearer</code>, un espacio y la clave, sin nada más.
            </li>
            <li>
              Úsalo desde un PDF, una captura o un texto: <strong>Compartir → Enviar a Viajes</strong>. La primera vez, si pregunta,{' '}
              <strong>Permitir siempre</strong>.
            </li>
          </ol>
          <p className="small muted">Si generas una clave nueva, cámbiala también en el bloque Texto del atajo.</p>
        </>
      ) : (
        <p className="small muted" style={{ marginTop: 8 }}>El atajo aún no está publicado.</p>
      )}
      {message && <p className="error small">{message}</p>}
    </section>
  );
}
