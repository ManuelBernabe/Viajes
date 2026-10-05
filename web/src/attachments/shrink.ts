/**
 * Una foto del móvil (4-8 MB) reducida a un JPEG de como mucho 2000 px por lado: basta para leer un documento y sube
 * en un momento. Un PDF, o una imagen que el navegador no sepa abrir, se devuelve tal cual.
 */
export async function shrinkForReading(bytes: ArrayBuffer, mime: string, maxSide = 2000): Promise<{ bytes: ArrayBuffer; mime: string }> {
  if (!mime.startsWith('image/') || typeof createImageBitmap !== 'function') {
    return { bytes, mime };
  }
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ? { bytes: await blob.arrayBuffer(), mime: 'image/jpeg' } : { bytes, mime };
  } catch {
    return { bytes, mime };
  }
}
