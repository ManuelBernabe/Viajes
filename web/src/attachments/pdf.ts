import { pdfLib } from './pdfSetup';

export interface RenderOptions {
  /** Ancho objetivo en píxeles de cada página. */
  width?: number;
  maxPages?: number;
}

/** Dibuja las páginas del PDF en lienzos. Sin depender del visor de iOS, que solo enseña la primera página. */
export async function renderPdf(bytes: ArrayBuffer, options: RenderOptions = {}): Promise<HTMLCanvasElement[]> {
  const width = options.width ?? Math.min(window.innerWidth * (window.devicePixelRatio || 1), 2000);
  const task = pdfLib().getDocument({ data: new Uint8Array(bytes.slice(0)) });
  const document_ = await task.promise;
  const pages = Math.min(document_.numPages, options.maxPages ?? 50);
  const canvases: HTMLCanvasElement[] = [];
  try {
    for (let number = 1; number <= pages; number++) {
      const page = await document_.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d')!;
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      canvases.push(canvas);
    }
  } finally {
    await task.destroy();
  }
  return canvases;
}
