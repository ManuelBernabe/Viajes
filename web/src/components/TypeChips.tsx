import type { BookingType } from '../data/types';
import { TYPE_INFO } from '../domain/agenda';
import { t } from '../i18n';

/** Filtro por tipo de reserva: una píldora por tipo presente, cada una con el color de su tipo. */
export function TypeChips({ types, value, onChange }: { types: Iterable<BookingType>; value: BookingType | null; onChange: (type: BookingType | null) => void }) {
  const present = [...types];
  if (present.length < 2) {
    return null;
  }
  return (
    <div className="chips" role="group" aria-label={t('Filtrar por tipo')}>
      <button type="button" className={value === null ? 'on' : ''} onClick={() => onChange(null)}>
        {t('Todo')}
      </button>
      {present.map((type) => (
        <button key={type} type="button" className={`type-${type}${value === type ? ' on' : ''}`} onClick={() => onChange(value === type ? null : type)}>
          {TYPE_INFO[type].icon} {TYPE_INFO[type].label}
        </button>
      ))}
    </div>
  );
}
