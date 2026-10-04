import { useEffect, useState } from 'react';
import { api, describeError } from '../api';

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
export const SHORTCUT_ICLOUD_URL = '';

function when(ms: number | null): string {
  return ms ? new Date(ms).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca';
}

/** Ajustes → «Atajo de iPhone»: la clave personal del atajo y cómo instalarlo. */
export function ShareShortcut() {
  const [keys, setKeys] = useState<TokenRow[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [showSteps, setShowSteps] = useState(false);
  const [message, setMessage] = useState('');
  const endpoint = `${location.origin}/api/inbox/share`;

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
            Tu clave personal. Cópiala ahora: no se volverá a mostrar. La primera vez que uses el atajo te la pedirá.
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
        <a className="btn primary block" style={{ marginTop: 8 }} href={SHORTCUT_ICLOUD_URL}>
          2. Instalar el atajo
        </a>
      ) : (
        <button className="btn block" type="button" style={{ marginTop: 8 }} onClick={() => setShowSteps(!showSteps)}>
          {showSteps ? 'Ocultar cómo crear el atajo' : '2. Cómo crear el atajo (una vez)'}
        </button>
      )}

      {!SHORTCUT_ICLOUD_URL && showSteps && (
        <ol className="small" style={{ paddingLeft: 18 }}>
          <li>
            Abre la app <strong>Atajos</strong> → <strong>+</strong>. Llámalo <strong>Enviar a Viajes</strong>.
          </li>
          <li>
            Toca la <strong>ⓘ</strong> (abajo) y activa <strong>Mostrar en la hoja para compartir</strong>. En «Recibir», deja solo{' '}
            <strong>Imágenes, PDF, Archivos y Texto</strong>. Si no recibe nada: <strong>Continuar</strong>.
          </li>
          <li>
            Añade <strong>Obtener archivo de carpeta</strong>: carpeta <strong>Atajos</strong>, ruta <code>viajes-clave.txt</code>, y
            desactiva <strong>Error si no se encuentra</strong>.
          </li>
          <li>
            Añade <strong>Si</strong>: «Archivo» <strong>no tiene ningún valor</strong>. Dentro: <strong>Solicitar entrada</strong>{' '}
            (texto, «Pega tu clave de Viajes») y <strong>Guardar archivo</strong>: «Entrada proporcionada», sin preguntar dónde, en
            carpeta <strong>Atajos</strong> con subruta <code>viajes-clave.txt</code> y <strong>Sobrescribir</strong> activado. En{' '}
            <strong>De lo contrario</strong>: <strong>Texto</strong> con la variable «Archivo».
          </li>
          <li>
            Añade <strong>Texto</strong> con: <code>Bearer </code> seguido de la variable <strong>Resultado de Si</strong>.
          </li>
          <li>
            Añade <strong>Obtener contenido de URL</strong>{' '}
            <button className="btn small" type="button" onClick={() => void copy(endpoint, 'url')}>
              {copied === 'url' ? 'URL copiada ✓' : 'Copiar URL'}
            </button>
            : método <strong>POST</strong>; encabezados <code>Authorization</code> = el Texto del paso anterior y{' '}
            <code>X-File-Name</code> = «Entrada del atajo» → <strong>Nombre</strong>; cuerpo <strong>Archivo</strong> = «Entrada del
            atajo».
          </li>
          <li>
            Añade <strong>Mostrar notificación</strong> con «Contenido de la URL». Listo: verás «✓ Enviado a Viajes» o el motivo si algo
            falla.
          </li>
          <li>
            Para pasárselo a otros: mantén pulsado el atajo → <strong>Compartir</strong> → <strong>Copiar enlace de iCloud</strong>, y
            mándame ese enlace para poner aquí el botón «Instalar el atajo».
          </li>
        </ol>
      )}
      <p className="small muted" style={{ marginTop: 8 }}>
        Si generas una clave nueva, borra <code>viajes-clave.txt</code> en Archivos → iCloud Drive → Atajos para que el atajo te pida
        la nueva.
      </p>
      {message && <p className="error small">{message}</p>}
    </section>
  );
}
