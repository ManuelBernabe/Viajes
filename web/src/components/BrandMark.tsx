import { useId } from 'react';

/** El símbolo de Viajes: el mundo de fondo, la estela de un vuelo que sale de un punto y el avión. Es el mismo que el icono de la app. */
export function BrandMark({ size = 36 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Viajes">
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f6be0" />
          <stop offset="1" stopColor="#0f1d3a" />
        </linearGradient>
        <clipPath id={`tile${id}`}>
          <rect width="512" height="512" rx="112" />
        </clipPath>
      </defs>
      <g clipPath={`url(#tile${id})`}>
        <rect width="512" height="512" fill={`url(#bg${id})`} />
        <g fill="none" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="10">
          <circle cx="232" cy="300" r="200" />
          <ellipse cx="232" cy="300" rx="90" ry="200" />
          <path d="M32 300h400M58 200h348M58 400h348" />
        </g>
        <path d="M86 424C150 300 250 230 352 190" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="16" strokeLinecap="round" strokeDasharray="2 38" />
        <g transform="translate(392 150) rotate(62) scale(2.3) translate(-50 -50)" fill="#ffffff">
          <path d="M50 4C54 4 56 9 56 16V38L92 58V66L56 56V78L68 87V94L50 89L32 94V87L44 78V56L8 66V58L44 38V16C44 9 46 4 50 4Z" />
        </g>
        <circle cx="86" cy="424" r="18" fill="#f2b04a" />
      </g>
    </svg>
  );
}
