import { useId } from 'react';

/** El símbolo de Viajes: una rosa de los vientos cuya aguja es un avión. Es el mismo que el icono de la app (public/logo.svg). */
export function BrandMark({ size = 36 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Viajes">
      <defs>
        <radialGradient id={`bg${id}`} cx="0.5" cy="0.4" r="0.8">
          <stop offset="0" stopColor="#3a2f73" />
          <stop offset="1" stopColor="#120e2e" />
        </radialGradient>
        <clipPath id={`tile${id}`}>
          <rect width="512" height="512" rx="112" />
        </clipPath>
      </defs>
      <g clipPath={`url(#tile${id})`}>
        <rect width="512" height="512" fill={`url(#bg${id})`} />
        <circle cx="256" cy="256" r="170" fill="none" stroke="#f7c948" strokeOpacity="0.9" strokeWidth="10" />
        <circle cx="256" cy="256" r="140" fill="none" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="4" />
        <g fill="#ffffff" fillOpacity="0.9">
          <path d="M256 70l14 40h-28z" />
          <path d="M256 442l-14-40h28z" />
          <path d="M70 256l40-14v28z" />
          <path d="M442 256l-40 14v-28z" />
        </g>
        <g stroke="#ffffff" strokeOpacity="0.35" strokeWidth="6">
          <path d="M136 136l22 22M376 136l-22 22M136 376l22-22M376 376l-22-22" />
        </g>
        <g transform="translate(256 256) rotate(35) scale(2) translate(-50 -50)" fill="#f7c948">
          <path d="M50 4C54 4 56 9 56 16V38L92 58V66L56 56V78L68 87V94L50 89L32 94V87L44 78V56L8 66V58L44 38V16C44 9 46 4 50 4Z" />
        </g>
      </g>
    </svg>
  );
}
