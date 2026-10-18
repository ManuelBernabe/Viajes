import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AgendaRow } from '../components/Agenda';
import { ConnectionRow, JourneyCard } from '../components/Connection';
import { BrandMark } from '../components/BrandMark';
import { SetupCard } from '../components/SetupCard';
import { AddButton } from '../components/AddSheet';
import { PushOfferBanner } from '../components/QuickSetup';
import { SyncButton } from '../components/SyncButton';
import { TextSizeButton } from '../components/TextSize';
import { useTripWeather } from '../components/WeatherStrip';
import { formatLongDay, timeOf } from '../data/localTime';
import { hiddenBookings, listAllBookings, listAttachments, listInbox, listTrips } from '../data/repo';
import { useSyncStatus } from '../data/syncClient';
import type { Booking } from '../data/types';
import { useLiveQuery } from '../data/useLive';
import { nextBookings, todayLocal, TYPE_INFO } from '../domain/agenda';
import { shiftDate } from '../domain/alternatives';
import { idsOf, withConnections } from '../domain/connections';
import { dayPlan, groupSameTrip, todayView, weekPlans, type DayPlan } from '../domain/today';
import { describeWeather, temps } from '../domain/weather';
import { t } from '../i18n';

type View = 'today' | 'tomorrow' | 'week';

const VIEW_KEY = 'viajes:hoy:vista';

function savedView(): View {
  try {
    const value = sessionStorage.getItem(VIEW_KEY);
    return value === 'tomorrow' || value === 'week' ? value : 'today';
  } catch {
    return 'today';
  }
}

/** El día tiene algo que pintar (un viaje con escalas que empezó la víspera ya salió ese día). */
function hasRows(plan: DayPlan, all: readonly Booking[], onlyNew: boolean): boolean {
  const fresh = withConnections(groupSameTrip(plan.starting), all).filter((legs) => !onlyNew || legs[0][0].startLocal.slice(0, 10) === plan.date);
  return plan.checkOuts.length + fresh.length > 0 || (plan.night !== null && !plan.starting.includes(plan.night));
}

/**
 * Las filas de un día: salidas de hotel, lo que empieza y, al final, dónde se duerme.
 * `all`: todas las reservas, para juntar los vuelos con escala en una fila. `onlyNew`: un viaje con escalas que empezó un
 * día antes no se repite (en «Semana» ya está en su primer día).
 */
function DayRows({
  plan,
  now,
  all,
  onlyNew = false,
  skip = new Set<string>(),
}: {
  plan: DayPlan;
  now: number;
  all: readonly Booking[];
  onlyNew?: boolean;
  skip?: ReadonlySet<string>;
}) {
  const night = plan.night && !plan.starting.includes(plan.night) && !skip.has(plan.night.id) ? plan.night : null;
  const starting = plan.starting.filter((b) => !skip.has(b.id));
  if (plan.checkOuts.length + starting.length === 0 && !night) {
    return null;
  }
  return (
    <div className="agenda">
      {plan.checkOuts.map((b) => (
        <AgendaRow key={`out-${b.id}`} booking={b} kind="checkout" />
      ))}
      {withConnections(groupSameTrip(starting), all)
        .filter((legs) => !onlyNew || legs[0][0].startLocal.slice(0, 10) === plan.date)
        .map((legs) =>
          legs.length > 1 ? (
            <ConnectionRow key={legs[0][0].id} legs={legs} now={now} date={plan.date} />
          ) : (
            <AgendaRow key={legs[0][0].id} booking={legs[0][0]} group={legs[0]} now={now} />
          ),
        )}
      {night && <AgendaRow booking={night} kind="night" />}
    </div>
  );
}

/**
 * «Hoy»: la agenda, separada de los viajes. Arriba el tiempo; lo siguiente como tarjeta de embarque; el resto del día
 * en filas. «Mañana» y «Semana» enseñan lo que viene, sin tener que entrar en cada viaje.
 */
export function TodayPage() {
  const [view, setViewState] = useState<View>(savedView);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  function setView(next: View) {
    setViewState(next);
    try {
      sessionStorage.setItem(VIEW_KEY, next);
    } catch {
      // Sin almacenamiento: se vuelve a «Hoy» al abrir.
    }
  }

  const data = useLiveQuery(async () => {
    const hidden = await hiddenBookings();
    const trips = (await listTrips()).filter((trip) => trip.deletedAtMs === null);
    const tripIds = new Set(trips.map((trip) => trip.id));
    const bookings = (await listAllBookings()).filter((b) => b.deletedAtMs === null && !hidden.has(b.id) && tripIds.has(b.tripId));
    const qr = new Set<string>();
    for (const booking of bookings) {
      if ((await listAttachments(booking.id)).some((a) => a.qrText)) {
        qr.add(booking.id);
      }
    }
    return { bookings, qr, tripCount: trips.length, inbox: (await listInbox()).length };
  }, []);
  const sync = useSyncStatus();

  const today = todayLocal(new Date(now));
  const tomorrow = shiftDate(today, 1);
  const bookings: Booking[] = data?.bookings ?? [];
  const todayV = todayView(bookings, now, today);
  // Un vuelo con escala va en una sola tarjeta con todos sus tramos (aunque el segundo salga mañana).
  const nextChains = todayV ? withConnections(groupSameTrip(todayV.next), bookings) : [];
  const restChains = todayV ? withConnections(groupSameTrip(todayV.today), bookings, idsOf(nextChains)) : [];
  const tomorrowPlan = dayPlan(bookings, tomorrow);
  const week = weekPlans(bookings, today, 7);
  const date = view === 'tomorrow' ? tomorrow : today;
  const focus =
    view === 'tomorrow'
      ? [...tomorrowPlan.starting, ...(tomorrowPlan.night ? [tomorrowPlan.night] : [])]
      : todayV
        ? [...todayV.tonight, ...todayV.next, ...todayV.today]
        : [];
  const weather = useTripWeather(focus[0]?.tripId ?? dayPlan(bookings, date).night?.tripId).find((d) => d.date === date);
  const sky = weather ? describeWeather(weather.code) : null;
  const upcoming = nextBookings(bookings, now)[0];
  const tomorrowCount = tomorrowPlan.starting.length + tomorrowPlan.checkOuts.length;
  // En el aviso de «Mañana» no cuenta el segundo vuelo de una escala que ya está en la tarjeta de hoy.
  const shownToday = idsOf([...nextChains, ...restChains]);
  const teaserStarting = tomorrowPlan.starting.filter((b) => !shownToday.has(b.id));
  const teaserCount = teaserStarting.length + tomorrowPlan.checkOuts.length;

  const titles: Record<View, string> = { today: t('Hoy'), tomorrow: t('Mañana'), week: t('Esta semana') };

  return (
    <main className="page today-page">
      <div className="topbar">
        <BrandMark size={40} />
        <h1>{titles[view]}</h1>
        <TextSizeButton />
        <SyncButton />
        <AddButton />
      </div>
      <p className="today-sub">
        {view === 'week' ? t('Los próximos 7 días') : formatLongDay(date)}
        {view !== 'week' && weather && sky && (
          <>
            {' · '}
            {sky.icon} <b>{temps(weather)}</b> {weather.place}
            {weather.rain !== null && weather.rain >= 30 && ` · ${t('lluvia {n} %', { n: weather.rain })}`}
          </>
        )}
      </p>

      <div className="segmented" role="tablist">
        {(['today', 'tomorrow', 'week'] as const).map((v) => (
          <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
            {v === 'week' ? t('Semana') : titles[v]}
          </button>
        ))}
      </div>

      {sync.pending > 0 && (
        <p className="muted small">
          {sync.pending === 1 ? t('1 cambio pendiente de enviar') : t('{n} cambios pendientes de enviar', { n: sync.pending })}
          {sync.incomplete ? ` · ${t('sin conexión con el servidor')}` : ''}
        </p>
      )}
      {(data?.inbox ?? 0) > 0 && (
        <Link className="inbox-notice" to="/inbox">
          <span>✉️ {data!.inbox === 1 ? t('1 correo por revisar') : t('{n} correos por revisar', { n: data!.inbox })}</span>
          <span className="muted">›</span>
        </Link>
      )}

      <PushOfferBanner flightSoon={bookings.some((b) => b.type === 'flight' && b.startUtcMs > now && b.startUtcMs - now < 7 * 86_400_000)} />

      {data && data.tripCount === 0 && (
        <div className="empty">
          <p>{t('Todavía no hay viajes.')}</p>
          <Link className="btn primary" to="/trips/new">
            {t('Crear el primer viaje')}
          </Link>
        </div>
      )}

      {data && data.tripCount > 0 && view === 'today' && (
        <>
          {todayV ? (
            <>
              {nextChains.map((legs) => (
                <JourneyCard key={legs[0][0].id} legs={legs} qr={data.qr} now={now} />
              ))}
              {todayV.tonight.length > 0 && (
                <>
                  <h2 className="section-title">{t('Esta noche')}</h2>
                  <div className="agenda">
                    {todayV.tonight.map((b) => (
                      <AgendaRow key={b.id} booking={b} kind="night" />
                    ))}
                  </div>
                </>
              )}
              {restChains.length > 0 && (
                <>
                  <h2 className="section-title">{t('Resto del día')}</h2>
                  <div className="agenda">
                    {restChains.map((legs) =>
                      legs.length > 1 ? (
                        <ConnectionRow key={legs[0][0].id} legs={legs} now={now} />
                      ) : (
                        <AgendaRow key={legs[0][0].id} booking={legs[0][0]} group={legs[0]} now={now} />
                      ),
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="calm">
              <p>{t('Hoy no tienes nada reservado.')}</p>
              {upcoming && (
                <p className="muted small">
                  {t('Lo próximo:')} {TYPE_INFO[upcoming.type].icon} {upcoming.title} · {formatLongDay(upcoming.startLocal.slice(0, 10))}{' '}
                  <b className="time-big">{timeOf(upcoming.startLocal)}</b>
                </p>
              )}
            </div>
          )}
          {teaserCount > 0 && (
            <button type="button" className="teaser" onClick={() => setView('tomorrow')}>
              <span>
                {t('Mañana')}: <b className="time-big">{timeOf((teaserStarting[0] ?? tomorrowPlan.checkOuts[0]).startLocal)}</b>{' '}
                {teaserStarting[0]?.title ?? tomorrowPlan.checkOuts[0]?.startPlace ?? ''}
                {teaserCount > 1 && ` · ${t('{n} cosas', { n: teaserCount })}`}
              </span>
              <span className="muted">›</span>
            </button>
          )}
        </>
      )}

      {data && data.tripCount > 0 && view === 'tomorrow' && (
        <>
          {withConnections(groupSameTrip(tomorrowPlan.starting.filter((b) => b.type === 'flight' || b.type === 'train')), bookings)
            .filter((legs) => legs[0][0].startLocal.slice(0, 10) === tomorrow)
            .slice(0, 1)
            .map((legs) => (
              <JourneyCard key={legs[0][0].id} legs={legs} qr={data.qr} now={now} label={t('Mañana')} />
            ))}
          {tomorrowCount > 0 || tomorrowPlan.night ? (
            <>
              <h2 className="section-title">{t('Todo lo de mañana')}</h2>
              <DayRows plan={tomorrowPlan} now={now} all={bookings} />
            </>
          ) : (
            <div className="calm">
              <p>{t('Mañana no tienes nada reservado.')}</p>
            </div>
          )}
        </>
      )}

      {data && data.tripCount > 0 && view === 'week' && (
        <>
          {week.length === 0 && (
            <div className="calm">
              <p>{t('Nada reservado en los próximos 7 días.')}</p>
            </div>
          )}
          {week
            .filter((plan) => hasRows(plan, bookings, true))
            .map((plan) => (
              <section key={plan.date}>
                <h2 className="section-title day-title">
                  {plan.date === today ? t('Hoy') : plan.date === tomorrow ? t('Mañana') : formatLongDay(plan.date)}
                </h2>
                <DayRows plan={plan} now={now} all={bookings} onlyNew />
              </section>
            ))}
        </>
      )}

      <SetupCard />

      {data && data.tripCount > 0 && (
        <Link className="teaser link" to="/trips">
          <span>🧳 {t('Ver todos los viajes')}</span>
          <span className="muted">›</span>
        </Link>
      )}
      <Link className="teaser link emergency" to="/emergency">
        <span>🆘 {t('Emergencia')}</span>
        <span className="muted">›</span>
      </Link>
    </main>
  );
}
