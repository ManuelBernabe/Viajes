import { useEffect, useRef, useState } from 'react';
import { stepTextSize, TEXT_SIZES, useTextSize } from '../app/textSize';
import { t } from '../i18n';

/** «A− 115 % A+»: cambia el tamaño de toda la letra de la app en este móvil. */
export function TextSizeControl() {
  const size = useTextSize();
  return (
    <div className="text-size">
      <button type="button" className="btn" onClick={() => stepTextSize(-1)} disabled={size <= TEXT_SIZES[0]} aria-label={t('Letra más pequeña')}>
        <span style={{ fontSize: '0.85em' }}>A−</span>
      </button>
      <span className="text-size-value" aria-live="polite">
        {Math.round(size * 100)} %
      </span>
      <button type="button" className="btn" onClick={() => stepTextSize(1)} disabled={size >= TEXT_SIZES[TEXT_SIZES.length - 1]} aria-label={t('Letra más grande')}>
        <span style={{ fontSize: '1.2em' }}>A+</span>
      </button>
    </div>
  );
}

/** Botón redondo «Aa» arriba: abre los botones de tamaño de letra. */
export function TextSizeButton() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="text-size-anchor" ref={box}>
      <button
        type="button"
        className={`btn icon text-size-btn${open ? ' on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('Tamaño de la letra')}
        title={t('Tamaño de la letra')}
      >
        Aa
      </button>
      {open && (
        <div className="text-size-pop" role="dialog" aria-label={t('Tamaño de la letra')}>
          <div className="small muted">{t('Tamaño de la letra')}</div>
          <TextSizeControl />
        </div>
      )}
    </div>
  );
}
