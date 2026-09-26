export const MAX_BYTES = 20_000_000;

const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heic',
};

/** iOS a veces no pone tipo a lo que viene de Archivos: se deduce de la extensión. */
export function mimeOf(file: { type: string; name: string }): string {
  if (file.type) {
    return file.type;
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

export function isPdf(mime: string): boolean {
  return mime === 'application/pdf';
}

export function tooBig(size: number): boolean {
  return size > MAX_BYTES;
}

export function formatSize(bytes: number): string {
  if (bytes < 1000) {
    return `${bytes} B`;
  }
  if (bytes < 1_000_000) {
    return `${Math.round(bytes / 1000)} KB`;
  }
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
