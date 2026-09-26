import { useCallback, useState } from 'react';
import { addAttachment } from '../data/repo';
import { formatSize, mimeOf, tooBig } from './files';
import { readQr } from './qr';

export interface AttachProgress {
  busy: boolean;
  message: string;
}

/** Adjunta ficheros a una reserva: los guarda en el móvil, lee el QR y deja la subida a la sincronización. */
export function useAttachFiles(createdBy: string) {
  const [progress, setProgress] = useState<AttachProgress>({ busy: false, message: '' });

  const attach = useCallback(
    async (bookingId: string, files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) {
        return;
      }
      setProgress({ busy: true, message: `Guardando ${list.length === 1 ? 'el fichero' : `${list.length} ficheros`}…` });
      const errors: string[] = [];
      for (const file of list) {
        if (tooBig(file.size)) {
          errors.push(`${file.name}: supera los 20 MB (${formatSize(file.size)}).`);
          continue;
        }
        try {
          const bytes = await file.arrayBuffer();
          if (bytes.byteLength === 0) {
            errors.push(`${file.name}: el fichero está vacío. Si está en iCloud, ábrelo antes en Archivos para descargarlo.`);
            continue;
          }
          const mime = mimeOf(file);
          setProgress({ busy: true, message: `Buscando QR en ${file.name}…` });
          const qrText = await readQr(bytes, mime);
          await addAttachment({ bookingId, name: file.name, mime, size: bytes.byteLength, qrText }, bytes, createdBy);
        } catch (error) {
          errors.push(`${file.name}: ${error instanceof Error ? error.message : 'no se ha podido guardar.'}`);
        }
      }
      setProgress({ busy: false, message: errors.join(' ') });
    },
    [createdBy],
  );

  return { attach, progress };
}
