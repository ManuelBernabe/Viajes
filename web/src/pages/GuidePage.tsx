import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../app/SessionContext';
import { lang, t, type Lang } from '../i18n';
import { GuideEn } from './guide/GuideEn';
import { GuideEs } from './guide/GuideEs';
import { GuideFr } from './guide/GuideFr';
import { GuideIt } from './guide/GuideIt';

/** El cuerpo de la guía va entero en cada idioma (mucho JSX con negritas y capturas: trocearlo en t() sería ilegible). */
const BODIES: Record<Lang, ComponentType> = { es: GuideEs, en: GuideEn, fr: GuideFr, it: GuideIt };

/** Guía de uso para quien entra nuevo en el hogar: qué hace la app y cómo se usa en el iPhone. */
export function GuidePage() {
  const session = useSession();
  const Body = BODIES[lang()];
  return (
    <main className={`page${session.status === 'in' ? '' : ' no-tabs'}`}>
      <div className="topbar">
        <h1>{t('Guía de uso')}</h1>
        {session.status === 'in' && (
          <Link className="btn small primary" to="/ayuda">
            💬 {t('Preguntar')}
          </Link>
        )}
      </div>

      <Body />

      {session.status === 'in' ? (
        <p className="small">
          <Link to="/settings">{t('‹ Volver a Ajustes')}</Link>
        </p>
      ) : (
        <p className="small">
          <Link to="/">{t('‹ Volver')}</Link>
        </p>
      )}
    </main>
  );
}
