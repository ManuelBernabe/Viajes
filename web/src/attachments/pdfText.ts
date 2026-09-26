import { pdfLib } from './pdfSetup';

/** Texto de las primeras páginas del PDF, con saltos de línea aproximados por la posición de cada trozo. */
export async function extractPdfText(bytes: ArrayBuffer, maxPages = 3): Promise<string> {
  const task = pdfLib().getDocument({ data: new Uint8Array(bytes.slice(0)) });
  const document_ = await task.promise;
  const lines: string[] = [];
  try {
    const pages = Math.min(document_.numPages, maxPages);
    for (let number = 1; number <= pages; number++) {
      const page = await document_.getPage(number);
      const content = await page.getTextContent();
      let lastY: number | null = null;
      let line = '';
      for (const item of content.items) {
        if (!('str' in item)) {
          continue;
        }
        const y = Math.round(item.transform[5]);
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          lines.push(line.trim());
          line = '';
        }
        line += (line && !line.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str;
        lastY = y;
      }
      lines.push(line.trim());
      lines.push('');
    }
  } finally {
    await task.destroy();
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
