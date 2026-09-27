import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { suggestFromText } from './extract';

/**
 * Banco de pruebas sobre correos reales (no están en el repositorio): con CORPUS_DIR apuntando a una carpeta de ficheros
 * .json (salida de corpus.mjs) escribe un informe con lo que sacan las reglas de cada correo y de cada PDF adjunto.
 * Sin CORPUS_DIR no hace nada.
 */
const dir = process.env.CORPUS_DIR;

describe.skipIf(!dir || !existsSync(dir))('reglas sobre el corpus real', () => {
  it('genera el informe', () => {
    const files = readdirSync(dir!).filter((f) => f.endsWith('.json') && !f.startsWith('informe'));
    const report: Record<string, unknown> = {};
    for (const file of files) {
      const item = JSON.parse(readFileSync(join(dir!, file), 'utf8')) as {
        subject: string;
        text: string;
        attachments: { name: string; text: string | null }[];
      };
      report[file] = {
        subject: item.subject,
        body: suggestFromText(item.text),
        attachments: Object.fromEntries(item.attachments.filter((a) => a.text).map((a) => [a.name, suggestFromText(a.text!, a.name)])),
      };
    }
    writeFileSync(join(dir!, 'informe-reglas.json'), JSON.stringify(report, null, 2));
    expect(files.length).toBeGreaterThan(0);
  });
});
