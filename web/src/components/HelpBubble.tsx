import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { HelpChat } from '../pages/HelpChatPage';
import { t } from '../i18n';

/**
 * Burbuja flotante 💬 en las pantallas principales: abre «Pregunta a la guía» como una hoja que sube desde abajo, sin salir
 * de donde se está. No sale en la propia pantalla de ayuda.
 */
export function HelpBubble() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // En la ayuda no hace falta, y en los formularios taparía los campos y el botón de guardar.
  const path = location.pathname;
  if (path === '/ayuda' || /\/(new|edit)$/.test(path) || /^\/documents\/./.test(path) || path.startsWith('/inbox/')) {
    return null;
  }

  return (
    <>
      {!open && (
        <button type="button" className="help-bubble" onClick={() => setOpen(true)} aria-label={t('Pregunta a la guía')} title={t('Pregunta a la guía')}>
          💬
        </button>
      )}
      {open && (
        <div className="help-sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="help-sheet" role="dialog" aria-modal="true" aria-labelledby="help-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div className="row between help-sheet-head">
              <h2 id="help-sheet-title" style={{ margin: 0 }}>
                💬 {t('Pregunta a la guía')}
              </h2>
              <button type="button" className="btn small" onClick={() => setOpen(false)} aria-label={t('Cerrar')}>
                ✕
              </button>
            </div>
            <div className="help-sheet-body">
              <HelpChat onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
