import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n';

const MIN = 1;
const MAX = 5;
const DOUBLE_TAP = 2.5;

const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));

/**
 * Zona con zoom para el visor de adjuntos: pellizcar con dos dedos (y doble toque) amplía el PDF o la foto y se desplaza
 * en las dos direcciones. La app tiene el zoom del navegador desactivado (para que la interfaz no baile), así que aquí se
 * hace a mano: el contenido se ensancha y la zona se desplaza para que el punto entre los dedos se quede quieto.
 */
export function ZoomStage({ children }: { children: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const zoom = useRef(1);
  const [zoomed, setZoomed] = useState(false);

  /** Aplica el zoom manteniendo fijo el punto (x, y) de la pantalla, relativo a la zona. */
  function apply(next: number, x: number, y: number) {
    const area = stage.current;
    const inner = content.current;
    if (!area || !inner) {
      return;
    }
    const previous = zoom.current;
    next = clamp(next);
    const contentX = (area.scrollLeft + x) / previous;
    const contentY = (area.scrollTop + y) / previous;
    zoom.current = next;
    inner.style.width = `${next * 100}%`;
    area.scrollLeft = contentX * next - x;
    area.scrollTop = contentY * next - y;
    setZoomed(next > 1.01);
  }

  useEffect(() => {
    const area = stage.current;
    if (!area) {
      return;
    }
    let pinch: { distance: number; zoom: number } | null = null;
    let lastTap = 0;

    const point = (touch: Touch) => {
      const box = area.getBoundingClientRect();
      return { x: touch.clientX - box.left, y: touch.clientY - box.top };
    };
    const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        pinch = { distance: distance(event.touches[0], event.touches[1]), zoom: zoom.current };
        event.preventDefault();
      } else if (event.touches.length === 1) {
        const now = Date.now();
        if (now - lastTap < 300) {
          const { x, y } = point(event.touches[0]);
          apply(zoom.current > 1.01 ? 1 : DOUBLE_TAP, x, y);
          event.preventDefault();
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }
    };
    const onMove = (event: TouchEvent) => {
      if (pinch && event.touches.length === 2) {
        event.preventDefault();
        const [a, b] = [event.touches[0], event.touches[1]];
        const mid = point({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 } as Touch);
        apply((pinch.zoom * distance(a, b)) / pinch.distance, mid.x, mid.y);
      }
    };
    const onEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        pinch = null;
      }
    };
    // Safari también manda «gesture*»: se anulan para que no intente su propio zoom.
    const stop = (event: Event) => event.preventDefault();

    area.addEventListener('touchstart', onStart, { passive: false });
    area.addEventListener('touchmove', onMove, { passive: false });
    area.addEventListener('touchend', onEnd);
    area.addEventListener('touchcancel', onEnd);
    area.addEventListener('gesturestart', stop);
    area.addEventListener('gesturechange', stop);
    return () => {
      area.removeEventListener('touchstart', onStart);
      area.removeEventListener('touchmove', onMove);
      area.removeEventListener('touchend', onEnd);
      area.removeEventListener('touchcancel', onEnd);
      area.removeEventListener('gesturestart', stop);
      area.removeEventListener('gesturechange', stop);
    };
  }, []);

  const step = (factor: number) => {
    const area = stage.current;
    if (area) {
      apply(zoom.current * factor, area.clientWidth / 2, area.clientHeight / 2);
    }
  };

  return (
    <>
      <div ref={stage} className="zoom-stage">
        <div ref={content} className="zoom-content">
          {children}
        </div>
      </div>
      <div className="zoom-buttons">
        <button type="button" className="btn small" onClick={() => step(1 / 1.5)} disabled={!zoomed} aria-label={t('Alejar')}>
          −
        </button>
        <button type="button" className="btn small" onClick={() => step(1.5)} aria-label={t('Acercar')}>
          +
        </button>
      </div>
    </>
  );
}
