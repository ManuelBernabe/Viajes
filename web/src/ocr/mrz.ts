/**
 * Zona de lectura mecánica (ICAO 9303) de pasaportes (TD3, 2×44) y carnés (TD1, 3×30): se lee y se comprueba con sus
 * dígitos de control, que delatan cualquier carácter mal leído. Tolera los errores típicos del OCR (O↔0, I↔1…).
 */
export interface MrzResult {
  kind: 'passport' | 'id';
  /** Código ISO de 3 letras del país que lo expide («ESP»). */
  issuer: string;
  nationality: string;
  surnames: string;
  givenNames: string;
  number: string;
  birthDate: string | null;
  expiryDate: string;
}

const WEIGHTS = [7, 3, 1];

function value(c: string): number {
  if (c >= '0' && c <= '9') {
    return c.charCodeAt(0) - 48;
  }
  if (c >= 'A' && c <= 'Z') {
    return c.charCodeAt(0) - 55;
  }
  return 0;
}

export function checkDigit(field: string): number {
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    sum += value(field[i]) * WEIGHTS[i % 3];
  }
  return sum % 10;
}

const valid = (field: string, check: string) => /\d/.test(check) && checkDigit(field) === Number(check);

/** En campos que solo llevan cifras, las letras que el OCR confunde con números. */
const toDigits = (text: string) => text.replace(/O|Q|D/g, '0').replace(/I|L/g, '1').replace(/Z/g, '2').replace(/S/g, '5').replace(/B/g, '8').replace(/G/g, '6');

/** Fecha AAMMDD → AAAA-MM-DD. `future`: caducidad (siglo XXI salvo 70-99); si no, nacimiento (no puede ser futuro). */
function date(yymmdd: string, future: boolean): string | null {
  if (!/^\d{6}$/.test(yymmdd)) {
    return null;
  }
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return null;
  }
  const currentYY = new Date().getUTCFullYear() % 100;
  const century = future ? (yy >= 70 ? 1900 : 2000) : yy > currentYY ? 1900 : 2000;
  return `${century + yy}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

/** «BELSO<ALFONSO<<FRANCISCO<JOSE» → apellidos «Belso Alfonso», nombre «Francisco Jose». */
function names(field: string): { surnames: string; givenNames: string } {
  // El relleno del final a veces se lee como «S», «K» o «L»: una racha de tres o más al final es relleno.
  const [surnames = '', given = ''] = field.replace(/[<SKL]{3,}$/, '').replace(/<+$/, '').split('<<');
  // En los nombres no hay cifras: las que salgan son letras mal leídas.
  const letters = (text: string) => text.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B').replace(/2/g, 'Z').replace(/6/g, 'G');
  const nice = (text: string) =>
    letters(text)
      .split('<')
      .filter(Boolean)
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  return { surnames: nice(surnames), givenNames: nice(given) };
}

/** Limpia una línea leída: mayúsculas, sin espacios, y lo que no puede estar en una MRZ pasa a «<». */
export function cleanLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[«‹(\[{]/g, '<')
    .replace(/[^A-Z0-9<]/g, '');
}

function fit(line: string, length: number): string {
  return line.length >= length ? line.slice(0, length) : line + '<'.repeat(length - line.length);
}

/** Lo que el OCR confunde: para cada carácter, los que podría ser en realidad. */
const LOOKALIKE: Record<string, string> = {
  '0': 'ODQ', O: '0DQ', D: '0OP', Q: '0O', P: 'D', '1': 'IL', I: '1L', L: '1I', '2': 'Z', Z: '2', '5': 'S6', S: '5<', '6': 'G5', G: '6',
  '8': 'B', B: '8', K: '<', '<': 'KS',
  // Un carácter que el OCR se comió (ver `alignSecond`): puede ser cualquiera.
  '?': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
};

/**
 * Coloca la segunda línea del pasaporte en su sitio: el OCR a veces se come el primer carácter o añade basura delante.
 * La nacionalidad seguida de la fecha de nacimiento y su control (p. ej. «ESP7503120») marca dónde empieza (posición 10).
 */
function alignSecond(line: string): string {
  const match = /[A-Z<]{3}[0-9ODQZSBGIL]{7}[MFX<]/.exec(line);
  if (!match) {
    return line;
  }
  const shift = match.index - 10;
  return shift < 0 ? '?'.repeat(-shift) + line : line.slice(shift);
}

/**
 * Variantes de un campo que cuadran con su dígito de control: tal cual o con un carácter cambiado por otro parecido.
 * `digitsOnly`: fechas (solo cifras).
 */
function candidates(field: string, check: string, digitsOnly: boolean): { value: string; check: string; edits: number }[] {
  const base = digitsOnly ? toDigits(field) : field;
  const out: { value: string; check: string; edits: number }[] = [];
  // El propio dígito de control también puede estar mal leído (5↔6, 0↔8…): cuenta como un cambio.
  const checks = [check, ...(LOOKALIKE[check] ?? '').split('').filter((c) => /\d/.test(c))];
  for (const [index, c] of checks.entries()) {
    if (valid(base, c)) {
      out.push({ value: base, check: c, edits: index === 0 ? 0 : 1 });
    }
  }
  for (let i = 0; i < base.length; i++) {
    for (const alt of LOOKALIKE[base[i]] ?? '') {
      if (digitsOnly && !/\d/.test(alt)) {
        continue;
      }
      const value = base.slice(0, i) + alt + base.slice(i + 1);
      if (valid(value, check)) {
        out.push({ value, check, edits: 1 });
      }
    }
  }
  return out;
}

function readTd3(first: string, second: string): MrzResult | null {
  const a = fit(first, 44);
  const b = fit(alignSecond(second), 44);
  const checks = toDigits(b[9] + b[19] + b[27] + b[42] + b[43]);
  // Cada campo con su control; si falla, se prueba cambiando un carácter por otro parecido. El control general
  // (número + nacimiento + caducidad + opcional) decide entre las combinaciones: así una corrección casual no cuela.
  const numbers = candidates(b.slice(0, 9), checks[0], false);
  const births = candidates(b.slice(13, 19), checks[1], true);
  const expiries = candidates(b.slice(21, 27), checks[2], true);
  const optionals = candidates(b.slice(28, 42), checks[3], false);
  if (optionals.length === 0 && b.slice(28, 43).replace(/[<SK]/g, '') === '') {
    optionals.push({ value: '<'.repeat(14), check: '<', edits: 0 });
  }
  const finals = [checks[4], ...(LOOKALIKE[checks[4]] ?? '').split('').filter((c) => /\d/.test(c))];
  let best: { number: string; birth: string; expiry: string; edits: number } | null = null;
  // Si dos lecturas igual de buenas dan números distintos (un carácter perdido que podría ser «P» o «F»), el número
  // no es seguro: se deja en blanco para escribirlo a mano. Lo mismo con las fechas.
  let ambiguous = { number: false, birth: false, expiry: false };
  for (const n of numbers) {
    for (const bd of births) {
      for (const e of expiries) {
        for (const o of optionals) {
          const composite = `${n.value}${n.check}${bd.value}${bd.check}${e.value}${e.check}${o.value}${o.check}`;
          for (const [index, final] of finals.entries()) {
            const edits = n.edits + bd.edits + e.edits + o.edits + (index === 0 ? 0 : 1);
            if (!valid(composite, final)) {
              continue;
            }
            if (!best || edits < best.edits) {
              best = { number: n.value, birth: bd.value, expiry: e.value, edits };
              ambiguous = { number: false, birth: false, expiry: false };
            } else if (edits === best.edits) {
              ambiguous = {
                number: ambiguous.number || n.value !== best.number,
                birth: ambiguous.birth || bd.value !== best.birth,
                expiry: ambiguous.expiry || e.value !== best.expiry,
              };
            }
          }
        }
      }
    }
  }
  if (!best) {
    return null;
  }
  if (ambiguous.expiry) {
    return null;
  }
  const number = ambiguous.number ? '' : best.number;
  const birth = ambiguous.birth ? '' : best.birth;
  const expiry = best.expiry;
  const expiryDate = date(expiry, true);
  if (!expiryDate) {
    return null;
  }
  return {
    kind: 'passport',
    issuer: a.slice(2, 5).replace(/</g, ''),
    nationality: b.slice(10, 13).replace(/</g, ''),
    ...names(a.slice(5)),
    number: number.replace(/<+$/, ''),
    birthDate: date(birth, false),
    expiryDate,
  };
}

function readTd1(first: string, second: string, third: string): MrzResult | null {
  const a = fit(first, 30);
  const b = fit(second, 30);
  if (!'IAC'.includes(a[0])) {
    return null;
  }
  const number = a.slice(5, 14);
  const birth = toDigits(b.slice(0, 6));
  const expiry = toDigits(b.slice(8, 14));
  const checks = toDigits(a[14] + b[6] + b[14]);
  if (!valid(number, checks[0]) || !valid(birth, checks[1]) || !valid(expiry, checks[2])) {
    return null;
  }
  const expiryDate = date(expiry, true);
  if (!expiryDate) {
    return null;
  }
  // En el DNI español, el número de DNI (con letra) va en los datos opcionales de la primera línea.
  const optional = a.slice(15, 30).replace(/<+$/, '');
  const dni = /^\d{8}[A-Z]$/.test(optional) ? optional : null;
  return {
    kind: 'id',
    issuer: a.slice(2, 5).replace(/</g, ''),
    nationality: b.slice(15, 18).replace(/</g, ''),
    ...names(fit(third, 30)),
    number: dni ?? number.replace(/<+$/, ''),
    birthDate: date(birth, false),
    expiryDate,
  };
}

/** Busca una MRZ válida entre las líneas de texto leídas (en cualquier orden y con basura alrededor). */
export function findMrz(text: string): MrzResult | null {
  const lines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((l) => l.length >= 25 && l.includes('<'));
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i].length >= 38) {
      const result = readTd3(lines[i], lines[i + 1]);
      if (result) {
        return result;
      }
    }
    if (i + 2 < lines.length && lines[i].length <= 34) {
      const result = readTd1(lines[i], lines[i + 1], lines[i + 2]);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

/** «ESP» → «España» (en el idioma de la app). Los códigos que no conoce se dejan tal cual. */
const ISO3_TO_2: Record<string, string> = {
  ESP: 'ES', ARG: 'AR', BRA: 'BR', FRA: 'FR', ITA: 'IT', PRT: 'PT', GBR: 'GB', USA: 'US', DEU: 'DE', D: 'DE', MEX: 'MX', COL: 'CO',
  CHL: 'CL', PER: 'PE', URY: 'UY', PRY: 'PY', BOL: 'BO', ECU: 'EC', VEN: 'VE', CUB: 'CU', DOM: 'DO', NLD: 'NL', BEL: 'BE', CHE: 'CH',
  AUT: 'AT', IRL: 'IE', SWE: 'SE', NOR: 'NO', DNK: 'DK', FIN: 'FI', POL: 'PL', ROU: 'RO', GRC: 'GR', CAN: 'CA', AUS: 'AU', JPN: 'JP',
  CHN: 'CN', MAR: 'MA', UKR: 'UA', RUS: 'RU', AND: 'AD', LUX: 'LU', CZE: 'CZ', HUN: 'HU', BGR: 'BG', TUR: 'TR', IND: 'IN',
};

export function countryName(iso3: string, locale: string): string {
  const iso2 = ISO3_TO_2[iso3];
  if (!iso2) {
    return iso3;
  }
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(iso2) ?? iso3;
  } catch {
    return iso3;
  }
}
