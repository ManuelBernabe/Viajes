import { useCallback, useState } from 'react';
import { addAttachment } from '../data/repo';
import { formatSize, mimeOf, tooBig } from './files';
import { t } from '../i18n';

export interface AttachProgress {
  busy: boolean;
  message: string;
}

export interface ReadFile {
  file: File;
  bytes: ArrayBuffer;
  mime: string;
  qrText: string | null;
  error: string | null;
}

/** Lee los ficheros y busca su QR. Lo que falle queda con su mensaje en `error`. */
export async function readFiles(files: FileList | File[], onProgress?: (message: string) => void): Promise<ReadFile[]> {
  const result: ReadFile[] = [];
  for (const file of Array.from(files)) {
    const mime = mimeOf(file);
    if (tooBig(file.size)) {
      result.push({ file, bytes: new ArrayBuffer(0), mime, qrText: null, error: t('{name}: supera los 20 MB ({size}).', { name: file.name, size: formatSize(file.size) }) });
      continue;
    }
    try {
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength === 0) {
        result.push({ file, bytes, mime, qrText: null, error: t('{name}: el fichero está vacío. Si está en iCloud, ábrelo antes en Archivos para descargarlo.', { name: file.name }) });
        continue;
      }
      onProgress?.(t('Buscando QR en {name}…', { name: file.name }));
      result.push({ file, bytes, mime, qrText: await (await import('./qr')).readQr(bytes, mime), error: null });
    } catch (error) {
      result.push({ file, bytes: new ArrayBuffer(0), mime, qrText: null, error: `${file.name}: ${error instanceof Error ? error.message : t('no se ha podido leer.')}` });
    }
  }
  return result;
}

/** Adjunta ficheros a una reserva: los guarda en el móvil, lee el QR y deja la subida a la sincronización. */
export function useAttachFiles(createdBy: string) {
  const [progress, setProgress] = useState<AttachProgress>({ busy: false, message: '' });

  const attachRead = useCallback(
    async (bookingId: string, read: ReadFile[]) => {
      setProgress({ busy: true, message: t('Guardando…') });
      const errors: string[] = [];
      for (const item of read) {
        if (item.error) {
          errors.push(item.error);
          continue;
        }
        try {
          await addAttachment(
            { bookingId, name: item.file.name, mime: item.mime, size: item.bytes.byteLength, qrText: item.qrText },
            item.bytes,
            createdBy,
          );
        } catch (error) {
          errors.push(`${item.file.name}: ${error instanceof Error ? error.message : t('no se ha podido guardar.')}`);
        }
      }
      setProgress({ busy: false, message: errors.join(' ') });
    },
    [createdBy],
  );

  const attach = useCallback(
    async (bookingId: string, files: FileList | File[]) => {
      if (files.length === 0) {
        return;
      }
      setProgress({ busy: true, message: t('Leyendo…') });
      const read = await readFiles(files, (message) => setProgress({ busy: true, message }));
      await attachRead(bookingId, read);
    },
    [attachRead],
  );

  return { attach, attachRead, progress };
}
