import { useEffect, useState } from 'react';
import { isAiOff, setAiOff } from '../attachments/aiExtract';
import { t } from '../i18n';

/** Sección «Lectura de documentos» de Ajustes: permite probar el plan B sin IA. */
export function AiSettings() {
  const [off, setOff] = useState<boolean | null>(null);

  useEffect(() => {
    isAiOff().then(setOff, () => setOff(false));
  }, []);

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
      {off && <p className="notice small">{t('Modo de prueba: los PDF e imágenes que subas se leerán solo con las reglas locales.')}</p>}
    </section>
  );
}
