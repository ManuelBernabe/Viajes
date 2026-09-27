import { Link } from 'react-router-dom';
import { useSession } from '../app/SessionContext';

/** Captura de pantalla de la guía (en public/guia, fuera de la precache: se ve con red). */
function Shot({ file, caption, wide = false }: { file: string; caption: string; wide?: boolean }) {
  return (
    <figure className={`guide-shot${wide ? ' wide' : ''}`}>
      <img src={`/guia/${file}`} alt={caption} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/** Guía de uso para quien entra nuevo en el hogar: qué hace la app y cómo se usa en el iPhone. */
export function GuidePage() {
  const session = useSession();
  return (
    <main className={`page${session.status === 'in' ? '' : ' no-tabs'}`}>
      <div className="topbar">
        <h1>Guía de uso</h1>
      </div>

      <section className="card">
        <h3>Qué es Viajes</h3>
        <p className="small">
          Una app para tener en el móvil todas las reservas de un viaje: vuelos, trenes, hoteles, coches y entradas, con sus billetes y códigos
          QR. Funciona sin conexión, avisa antes de cada salida y las personas del mismo «hogar» ven lo mismo.
        </p>
      </section>

      <section className="card">
        <h3>1. Instalarla en el iPhone</h3>
        <ol className="small">
          <li>Abre en Safari el enlace de invitación que te han enviado y crea tu cuenta (correo y contraseña).</li>
          <li>
            Pulsa el botón <strong>Compartir</strong> de Safari (el cuadrado con la flecha) y elige <strong>Añadir a pantalla de inicio</strong>.
          </li>
          <li>
            A partir de ahí, abre siempre Viajes <strong>desde el icono</strong>. Solo así funciona sin conexión y puede mandar avisos.
          </li>
          <li>
            Cuando haya una versión nueva saldrá un aviso «Hay una versión nueva»: pulsa <strong>Actualizar ahora</strong>.
          </li>
        </ol>
        <Shot file="11-invitacion.png" caption="El enlace de invitación: crea tu cuenta o entra con la que ya tengas." />
      </section>

      <section className="card">
        <h3>2. Inicio</h3>
        <ul className="small">
          <li>
            Arriba, el <strong>viaje en curso</strong> (o el próximo): tocando su tarjeta se abre el viaje para editarlo, añadir reservas o
            guardarlo en el móvil.
          </li>
          <li>
            Debajo, <strong>Lo siguiente</strong>: la próxima reserva de ese viaje con sus botones <strong>Ver QR</strong> y{' '}
            <strong>Ver reserva</strong>, y las dos siguientes. Con <strong>Ver las N reservas del viaje por días</strong> se despliegan
            todas sin salir de Inicio; <strong>Mostrar menos</strong> las vuelve a plegar.
          </li>
          <li>
            <strong>Más adelante</strong>: los demás viajes por venir. Con <strong>Nuevo viaje</strong> creas uno (título, destino y fechas).
          </li>
          <li>
            <strong>Histórico</strong>, al final: los viajes ya realizados, plegados y agrupados por año, marcados en naranja como
            «Realizado». Se abren igual para consultar sus reservas y billetes.
          </li>
          <li>
            Si aparece <strong>«N correos por revisar»</strong>, han llegado correos de reservas que esperan que alguien los confirme
            (apartado 5).
          </li>
        </ul>
        <Shot file="01-inicio.png" caption="Inicio: correos por revisar, el viaje en curso, lo siguiente y el botón para desplegar todas sus reservas." />
        <Shot file="14-inicio-desplegado.png" caption="Con las reservas del viaje desplegadas por días, sin salir de Inicio." />
        <Shot file="15-historico.png" caption="El histórico al final: viajes realizados por año, en naranja." />
      </section>

      <section className="card">
        <h3>3. Viajes y reservas</h3>
        <ul className="small">
          <li>
            Al abrir un viaje se ven sus reservas por días, con filtros por tipo, el botón <strong>+ Añadir reserva</strong> y el de guardarlo
            en el móvil.
          </li>
          <li>
            En <strong>Nueva reserva</strong> eliges el tipo (vuelo, hotel, tren, coche, entrada u otro), el título, la salida con su hora y
            lugar, y si quieres la llegada, el localizador, la dirección y notas.
          </li>
          <li>
            <strong>Lo más rápido</strong>: en «Adjuntos», sube el PDF del billete o una foto de la tarjeta de embarque. La app lo lee y
            rellena sola los campos; tú solo revisas y pulsas <strong>Guardar</strong>.
          </li>
          <li>
            Las horas son siempre las <strong>del lugar</strong> (la hora de Buenos Aires para un vuelo que sale de Buenos Aires). La app
            ordena todo por el instante real, así que no hay que calcular nada.
          </li>
          <li>
            Si subes un billete de una reserva que ya existe, la app lo detecta y ofrece <strong>Actualizar esa reserva</strong> en vez de
            duplicarla.
          </li>
        </ul>
        <Shot file="02-viaje.png" caption="Un viaje: sus reservas por días, «+ Añadir reserva» y el botón de guardar en el móvil." />
        <Shot file="03-nueva-reserva.png" caption="Nueva reserva: tipo, título, salida y, abajo, los adjuntos que rellenan el formulario." />
      </section>

      <section className="card">
        <h3>4. Billetes y códigos QR</h3>
        <ul className="small">
          <li>
            En cada reserva se pueden añadir más adjuntos con <strong>+ Adjuntar</strong> (cámara, Fotos o Archivos). Si uno lleva un QR o
            código de barras, la app lo lee al guardarlo y lo marca con «QR».
          </li>
          <li>
            <strong>Ver QR</strong> lo enseña a pantalla completa y con fondo blanco, listo para el control de embarque. La pantalla no se
            apaga mientras está abierto. <strong>Ver original</strong> abre el billete entero.
          </li>
          <li>Tocando un adjunto se abre el original (el PDF entero, por ejemplo).</li>
        </ul>
        <Shot file="04-reserva.png" caption="Una reserva: «Ver QR», los datos y los adjuntos (el billete lleva la marca «QR»)." />
        <Shot file="05-qr.png" caption="Ver QR: a pantalla completa para el control. No necesita conexión." />
      </section>

      <section className="card">
        <h3>5. Correos de reservas</h3>
        <ul className="small">
          <li>
            Las confirmaciones que llegan al correo del hogar entran solas en la app. Si tienes una reserva en tu propio correo,
            <strong> reenvíala</strong> a la dirección de importación del hogar (pregunta a quien te invitó; termina en «+viajes@gmail.com»).
          </li>
          <li>
            En uno o dos minutos aparece en Inicio como «correo por revisar». Ábrelo, comprueba los datos que la app ha leído, elige el
            viaje y pulsa <strong>Crear reserva</strong>. Los adjuntos del correo pasan a la reserva. Si no interesa, <strong>Descartar</strong>.
          </li>
          <li>
            Si el correo es un <strong>cambio</strong> de una reserva que ya está (otra hora, otro asiento…), la app lo reconoce, aplica el
            cambio y deja un aviso rojo en la reserva con el detalle. Cuando lo hayas visto, pulsa{' '}
            <strong>Entendido, quitar el aviso</strong>.
          </li>
        </ul>
        <Shot file="07-correo.png" caption="Un correo por revisar: lo que la app ha leído, el viaje donde guardarlo y «Crear reserva»." />
        <Shot file="13-aviso-cambio.png" caption="Aviso rojo en una reserva modificada por un correo, con el antes y el después." wide />
        <Shot file="06-reserva-modificada.png" caption="La reserva ya tiene la hora nueva; el aviso se quita con «Entendido»." />
      </section>

      <section className="card">
        <h3>6. Sin conexión</h3>
        <ul className="small">
          <li>
            En cada viaje hay un botón <strong>Guardar en el móvil</strong>: baja todas sus reservas y billetes para verlos sin cobertura (en
            el avión, en el extranjero sin datos). Hazlo antes de salir, con wifi. Cuando está hecho pone «Listo sin conexión».
          </li>
          <li>
            Lo que cambies sin conexión se guarda en el móvil y se envía solo cuando vuelve la red. En Ajustes → Sincronización se ve si
            queda algo pendiente.
          </li>
          <li>
            <strong>Quitar del móvil</strong> libera espacio cuando el viaje ha pasado (en Ajustes también se puede hacer de golpe para todos
            los viajes pasados).
          </li>
        </ul>
        <Shot file="12-sincronizacion.png" caption="Ajustes → Sincronización: cuándo fue la última y si queda algo pendiente de enviar." wide />
      </section>

      <section className="card">
        <h3>7. Avisos</h3>
        <ul className="small">
          <li>
            En Ajustes → Avisos, pulsa <strong>Activar avisos en este móvil</strong> y acepta el permiso. Se hace una vez por móvil.
          </li>
          <li>
            Llegan tres tipos: la <strong>víspera a las 20:00</strong> (hora del lugar), <strong>tres horas antes</strong> de la salida y{' '}
            <strong>al instante</strong> si un correo modifica una reserva. Tocando el aviso se abre la reserva.
          </li>
          <li>Si no llegan, revisa que no haya un modo de concentración activo y que Viajes tenga permiso en Ajustes del iPhone → Notificaciones.</li>
        </ul>
        <Shot file="10-avisos.png" caption="Ajustes → Avisos: activar los avisos en este móvil." wide />
      </section>

      <section className="card">
        <h3>8. Hogar y cuentas</h3>
        <ul className="small">
          <li>
            Cada persona tiene su cuenta y su contraseña. Los viajes son del hogar y los ven todos. Las reservas que crea quien
            administra las ven todos; las que añade un invitado solo las ven ese invitado y quien administra, que es el único con la
            foto completa. Un invitado puede marcar una reserva suya como <strong>Compartir con el hogar</strong> al crearla o
            editarla, y entonces la ven todos.
          </li>
          <li>
            En Ajustes → Hogar cualquiera puede <strong>Invitar a alguien</strong>: se genera un enlace de un solo uso que caduca a los
            siete días. Solo quien administra el hogar puede quitar miembros y generar o revocar los tokens de Gmail y de copias de
            seguridad; los demás ven esos apartados sin botones.
          </li>
          <li>
            <strong>Cerrar sesión</strong> borra la copia de este móvil (viajes, billetes y cambios sin enviar). Normalmente no hace falta
            cerrarla nunca.
          </li>
        </ul>
        <Shot file="09-hogar.png" caption="Ajustes → Hogar: quién forma parte e «Invitar a alguien»." wide />
        <Shot file="08-ajustes.png" caption="Ajustes: cuenta, sincronización, hogar, avisos, correo, espacio, ayuda y versión." />
      </section>

      <section className="card">
        <h3>Consejos para el viaje</h3>
        <ul className="small">
          <li>Antes de salir: cada viaje «Listo sin conexión», avisos activados y una mirada a «Lo siguiente».</li>
          <li>En el control: abre la reserva y pulsa <strong>Ver QR</strong>. No necesita conexión.</li>
          <li>Si llega un correo de cambio de hora, confía en el aviso rojo: la reserva ya tiene la hora nueva.</li>
        </ul>
      </section>

      {session.status === 'in' ? (
        <p className="small">
          <Link to="/settings">‹ Volver a Ajustes</Link>
        </p>
      ) : (
        <p className="small">
          <Link to="/">‹ Volver</Link>
        </p>
      )}
    </main>
  );
}
