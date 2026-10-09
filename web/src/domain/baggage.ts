/**
 * El equipaje de una reserva vive en sus notas como un tramo propio, «Equipaje: 2 × 23 kg por pasajero · …», igual que
 * el resto de datos sin campo (así viaja con la sincronización de siempre y lo rellena la IA al leer el correo o el PDF).
 */
const LABEL = /^(equipaje|baggage|bagages?|bagaglio|bagagem)\s*:\s*/i;

/** Las notas en tramos: se separan por « · » o por saltos de línea. */
function segments(notes: string | null | undefined): string[] {
  return (notes ?? '')
    .split(/\s+·\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** «2 × 23 kg por pasajero» si las notas lo dicen; null si no. */
export function baggageOf(notes: string | null | undefined): string | null {
  const found = segments(notes).find((s) => LABEL.test(s));
  const value = found?.replace(LABEL, '').trim();
  return value ? value : null;
}

/** Las notas con el equipaje puesto (o quitado, si viene vacío), sin tocar el resto. */
export function withBaggage(notes: string | null | undefined, baggage: string | null): string | null {
  const text = notes ?? '';
  const clean = baggage?.trim() ?? '';
  const line = clean ? `Equipaje: ${clean}` : '';
  const parts = text.split(/(\s+·\s+|\n+)/);
  const index = parts.findIndex((p) => LABEL.test(p.trim()));
  if (index >= 0) {
    if (line) {
      parts[index] = line;
    } else {
      // Se quita el tramo y un separador vecino.
      parts.splice(index > 0 ? index - 1 : index, index > 0 ? 2 : 2);
    }
    const joined = parts.join('').trim();
    return joined || null;
  }
  if (!line) {
    return notes ?? null;
  }
  return text.trim() ? `${text.trim()} · ${line}` : line;
}

/** Cuántas maletas facturadas en total dice el texto («2 × 23 kg» → 2; «sin maleta facturada» → 0); null si no se sabe. */
export function checkedBags(baggage: string | null): number | null {
  if (!baggage) {
    return null;
  }
  if (/\b(sin|no incluye|ninguna|no checked|none|aucun|nessun)/i.test(baggage)) {
    return 0;
  }
  const match = /(\d+)\s*[×x]\s*\d+\s*kg/i.exec(baggage);
  return match ? Number(match[1]) : null;
}
