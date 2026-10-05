import { lang, langIsChosen, LANGS, setLang, t, type Lang } from '../i18n';

/** Ajustes → Idioma. Por defecto, el del móvil; elegir uno lo guarda en este navegador y recarga la app. */
export function LanguageSettings() {
  const chosen = langIsChosen() ? lang() : 'auto';
  return (
    <section className="card">
      <h3>{t('Idioma')}</h3>
      <div className="field">
        <select
          aria-label={t('Idioma')}
          value={chosen}
          onChange={(e) => setLang(e.target.value === 'auto' ? null : (e.target.value as Lang))}
        >
          <option value="auto">{t('El del móvil')}</option>
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
