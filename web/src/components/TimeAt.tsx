import { timeOf, zoneLabel } from '../data/localTime';
import { t } from '../i18n';

const MARK = '\u0001';

/** Mete la hora en negrita y algo más grande dentro de una frase traducida («{time} hora de {zone}»). */
export function BigTime({ text, time }: { text: string; time: string }) {
  const [before, after = ''] = text.split(MARK);
  return (
    <>
      {before}
      <strong className="time-big">{time}</strong>
      {after}
    </>
  );
}

/** «**15:56** hora de Madrid», con la hora destacada para encontrarla de un vistazo. */
export function TimeAt({ local, tz }: { local: string; tz: string }) {
  return <BigTime text={t('{time} hora de {zone}', { time: MARK, zone: zoneLabel(tz) })} time={timeOf(local)} />;
}

/** La marca para usar con BigTime en otras frases («hasta las {time}»). */
export const TIME_MARK = MARK;
