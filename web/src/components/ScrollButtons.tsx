import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { t } from '../i18n';

/** Distancia (px) desde el borde a partir de la que tiene sentido el botón. */
const MARGIN = 400;

/**
 * Botones flotantes «subir arriba» / «bajar al final» en las pantallas largas. La página se desplaza dentro de
 * `.shell > .scroll` (no el body), así que se escucha ese contenedor. Solo aparecen cuando hay mucho que recorrer.
 */
export function ScrollButtons() {
  const location = useLocation();
  const [state, setState] = useState({ up: false, down: false });

  useEffect(() => {
    const area = document.querySelector<HTMLElement>('.shell > .scroll');
    if (!area) {
      return;
    }
    const update = () => {
      const long = area.scrollHeight > area.clientHeight * 1.8;
      setState({
        up: long && area.scrollTop > MARGIN,
        down: long && area.scrollHeight - area.clientHeight - area.scrollTop > MARGIN,
      });
    };
    update();
    area.addEventListener('scroll', update, { passive: true });
    // El contenido cambia de alto al cargar (listas, imágenes): se vuelve a mirar.
    const observer = new ResizeObserver(update);
    observer.observe(area);
    if (area.firstElementChild) {
      observer.observe(area.firstElementChild);
    }
    const settle = setTimeout(update, 800);
    return () => {
      area.removeEventListener('scroll', update);
      observer.disconnect();
      clearTimeout(settle);
    };
  }, [location.pathname]);

  const go = (where: 'top' | 'bottom') => {
    const area = document.querySelector<HTMLElement>('.shell > .scroll');
    area?.scrollTo({ top: where === 'top' ? 0 : area.scrollHeight, behavior: 'smooth' });
  };

  if (!state.up && !state.down) {
    return null;
  }
  return (
    <div className="scroll-buttons">
      {state.up && (
        <button type="button" onClick={() => go('top')} aria-label={t('Subir arriba del todo')}>
          ↑
        </button>
      )}
      {state.down && (
        <button type="button" onClick={() => go('bottom')} aria-label={t('Bajar hasta el final')}>
          ↓
        </button>
      )}
    </div>
  );
}
