import { useEffect, useState } from 'react';
import { api } from '../api';
import { isAiOff, setAiOff } from '../attachments/aiExtract';
import { t } from '../i18n';

interface AiStatus {
  provider: string;
  model: string | null;
  lightModel: string | null;
  cachedAnswers: number;
  hits: number;
  misses: number;
}

/**
 * Sección «Lectura de documentos» de Ajustes: permite probar el plan B sin IA y, a quien administra, le dice qué IA usa
 * el servidor (según la clave puesta en Railway) y cuánto responde la caché.
 */
export function AiSettings({ admin = false }: { admin?: boolean }) {
  const [off, setOff] = useState<boolean | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    isAiOff().then(setOff, () => setOff(false));
  }, []);

  useEffect(() => {
    if (admin) {
      api<AiStatus>('/api/settings/ai').then(setStatus, () => setStatus(null));
    }
  }, [admin]);

  async function toggle(value: boolean) {
    setOff(value);
    await setAiOff(value);
  }

  return (
    <section className="card">
      <h3>{t('Lectura de documentos')}</h3>
      <p className="small muted">
        {t(
          'Los billetes y correos se leen con IA en el servidor y, si no responde, con las reglas locales de la app (QR, datos estructurados del correo y patrones de texto). Con esta casilla puedes probar cómo iría sin la IA.',
        )}
      </p>
      <label className="row small" style={{ gap: 10 }}>
        <input type="checkbox" checked={off === true} disabled={off === null} onChange={(e) => void toggle(e.target.checked)} />
        {t('Leer sin IA en este móvil (solo reglas locales)')}
      </label>
      {status && (
        <dl className="dest-rows small" style={{ marginTop: 10 }}>
          <div className="dest-row">
            <dt>{t('IA del servidor')}</dt>
            <dd>{status.provider}</dd>
          </div>
          {status.model && (
            <div className="dest-row">
              <dt>{t('Modelo')}</dt>
              <dd>
                {status.model}
                {status.lightModel && status.lightModel !== status.model ? ` · ${t('preguntas sencillas: {model}', { model: status.lightModel })}` : ''}
              </dd>
            </div>
          )}
          <div className="dest-row">
            <dt>{t('Caché')}</dt>
            <dd>
              {t('{n} respuestas guardadas', { n: status.cachedAnswers })}
              {status.hits + status.misses > 0 ? ` · ${t('{hits} de {total} desde la caché', { hits: status.hits, total: status.hits + status.misses })}` : ''}
            </dd>
          </div>
        </dl>
      )}
      {off && <p className="notice small">{t('Modo de prueba: los PDF e imágenes que subas se leerán solo con las reglas locales.')}</p>}
    </section>
  );
}
