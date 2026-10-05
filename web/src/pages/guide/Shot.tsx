/** Captura de pantalla de la guía (en public/guia, fuera de la precache: se ve con red). */
export function Shot({ file, caption, wide = false }: { file: string; caption: string; wide?: boolean }) {
  return (
    <figure className={`guide-shot${wide ? ' wide' : ''}`}>
      <img src={`/guia/${file}`} alt={caption} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
