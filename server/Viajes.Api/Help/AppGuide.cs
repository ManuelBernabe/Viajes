namespace Viajes.Api.Help;

/// <summary>
/// Lo que sabe el asistente de ayuda: cómo se usa la app, pantalla por pantalla. Es la fuente de sus respuestas; si se
/// añade o cambia una función, hay que contarlo aquí también (en español; el asistente responde en el idioma de la app).
/// </summary>
public static class AppGuide
{
    public const string Text = """
        # Viajes: guía de uso

        ## Qué es
        App web instalable (PWA) para tener en el móvil todas las reservas de los viajes de la familia («el hogar»): vuelos,
        trenes, hoteles, coches, entradas y otros, con sus billetes y QR. Funciona sin conexión, avisa antes de cada salida y
        todos los del hogar ven lo mismo (salvo lo que alguien marca como privado).

        ## Instalar en el iPhone
        Abrir el enlace de invitación en Safari, crear la cuenta (correo y contraseña de al menos 10 caracteres), y luego
        Compartir → «Añadir a pantalla de inicio». Abrirla siempre desde el icono: así funciona sin conexión, con avisos y Face ID.
        Versión nueva: sale «Hay una versión nueva» → «Actualizar ahora». También en Ajustes → Versión → «Buscar actualizaciones».

        ## Pestañas
        Abajo: Hoy, Viajes, Documentos y Ajustes. En pantallas largas hay botones flotantes ↑ / ↓ para ir arriba o al final.
        Arriba en Hoy y en Viajes hay un botón ↻ para sincronizar al momento (también en «Por revisar» y en Ajustes → Sincronización).

        ## Hoy (la pantalla de inicio)
        - Arriba la fecha y el tiempo de donde se está. Tres vistas: Hoy, Mañana y Semana (los próximos 7 días).
        - Hoy: «Lo siguiente» como una tarjeta de embarque (origen y destino, hora, terminal, puerta, asiento, localizador y
          el estado del vuelo), con «Ver QR» (o «Cómo llegar») y «Ver reserva». Si es el mismo vuelo de varias personas
          (una reserva cada una), sale una sola tarjeta con los pasajeros. Debajo «Esta noche» (el hotel) y «Resto del día».
          Lo de mañana no sale en Hoy: hay un acceso «Mañana: …» que abre esa vista.
        - Mañana y Semana: lo que empieza cada día, las salidas de hotel y dónde se duerme.
        - «N correos por revisar» si han llegado reservas por correo o por el atajo que esperan confirmación.

        ## Viajes
        - Viajes «En curso», «Próximos viajes» y, al final, el «Histórico» de viajes realizados, plegado por años. Cada
          viaje muestra fechas, número de reservas, lo siguiente y si está guardado para verse sin conexión.
        - «Nuevo viaje» crea un viaje (título, destino, fechas de ida y vuelta).

        ## Un viaje
        - Arriba «Lo siguiente» como tarjeta de embarque: la próxima reserva (si es el mismo vuelo de varias personas, una sola
          tarjeta con los pasajeros), con «Ver QR» y «Ver reserva». Un hotel en el que ya se está no tapa lo siguiente.
        - Aviso de documentos si un pasaporte o DNI caduca antes de acabar el viaje o le quedan menos de 6 meses al salir.
        - «🌤️ El tiempo»: previsión día a día (Open-Meteo) para donde se duerme cada noche, hasta 16 días por delante; también
          junto a cada día de la agenda. Si no hay hotel, usa el destino del viaje.
        - «Guardar en el móvil» baja todos los billetes para verlos sin cobertura (se hace solo 7 días antes del viaje).
        - «+ Añadir reserva», «📍 Lugares» y «🧳 Equipaje»: lista de equipaje compartida por el hogar, con grupos (Ropa, Aseo,
          Documentos…), «para quién» opcional y casillas para marcar lo que ya va en la maleta. Se empieza con plantillas
          (Básico, Playa, Frío y nieve, Trabajo, Con niños) o copiando la lista de otro viaje; no se repite lo que ya está.
        - «🌍 Destino»: por cada país del viaje, moneda y cambio del día (1 € = …, y cuánto son 10, 50 y 100 €), enchufes y
          voltaje, emergencias, propinas, idioma, si hace falta visado con los pasaportes del hogar y consejos. Lo prepara la
          IA una vez y se guarda (también sin conexión); «↻ Actualizar» lo rehace. Los requisitos de entrada, confirmarlos
          en la web oficial.
        - «🔗 Compartir»: crea un enlace de solo lectura del itinerario para quien no usa la app (se manda por WhatsApp,
          correo…). Muestra día a día las reservas que ve todo el hogar, con horas y lugares, sin localizadores, notas ni
          billetes; desde esa página se imprime o se guarda en PDF. Se actualiza solo y «Anular enlace» lo desactiva.
        - «🔗 Unir con otro viaje…» (al final del viaje): pasa todo (reservas, lugares, ideas y equipaje) a otro viaje, que
          amplía sus fechas, y borra este. Si un viaje parece parte de otro («Brasil» junto a «Argentina Brasil»), arriba
          sale «¿Es parte de…?» con el botón para unirlos. Al añadir una reserva, las fechas del viaje se amplían solas, y una
          etapa que sale de un sitio del viaje pocos días después se reconoce como del mismo viaje.
        - Equipaje de un vuelo (en «Asiento, equipaje y check-in» de la reserva y en la tarjeta de «Hoy»): la IA lo apunta al
          leer el correo o el billete («Equipaje: 1 × 23 kg por pasajero»); si no sale, «Leer del billete» lo busca en el PDF
          adjunto y «Apuntar» deja escribirlo a mano. El aviso de check-in abierto lo recuerda.
        - «🔎 Revisión del viaje»: avisa de noches sin alojamiento, trayectos que se solapan, escalas cortas o cambios de
          aeropuerto con poco margen, llegadas antes de la salida y reservas fuera de las fechas del viaje.
        - Reservas por días, con filtros por tipo; al final el «Histórico» con las ya pasadas.
        - Botón 🙈 en cada tarjeta para ocultar una reserva de MIS listas (útil para quien administra, que ve las de todos).
          Las ocultas salen plegadas al final («Ver las ocultas») y se recuperan con 👁. Ocultar solo afecta a quien lo hace:
          tampoco salen en su calendario ni le llegan sus avisos. Los demás la siguen viendo.
        - «Editar» (arriba) cambia título, destino y fechas; «Borrar viaje» al final.

        ## Añadir reservas
        - A mano: «+ Añadir reserva», elegir tipo, título, salida (fecha, hora y lugar), llegada, localizador, dirección, notas
          y quién la ve.
        - Lo más rápido: en el formulario adjuntar el PDF o la foto del billete: la app lo lee y rellena los campos.
        - Por correo: reenviar la confirmación a la dirección de importación del hogar (termina en «+viajes@gmail.com»; la
          sabe quien administra). En uno o dos minutos aparece en «Por revisar».
        - Con el atajo de iPhone «Enviar a Viajes»: desde un PDF, captura o texto (Mail, WhatsApp, Archivos…) → Compartir →
          «Enviar a Viajes». Se instala en Ajustes → Atajo de iPhone (generar la clave personal, instalar el atajo y pegar la
          clave en su bloque Texto, después de «Bearer »).
        - En «Por revisar», al abrir un correo la app lee el billete y decide a qué viaje va (con IA): si encaja en uno, lo
          elige; si no, propone «➕ Viaje nuevo» con nombre, destino y fechas editables, y lo crea al pulsar «Crear reserva».
          Si el correo es un cambio de una reserva existente, la detecta y ofrece «Actualizar la reserva»; queda un aviso rojo
          con el cambio hasta pulsar «Entendido».
        - Las horas son siempre las del lugar (hora de Buenos Aires para un vuelo que sale de Buenos Aires).

        ## Dentro de una reserva
        - Datos, «🧭 Cómo llegar» (Apple Maps o Google Maps hasta el aeropuerto, estación u hotel) y adjuntos.
        - En los vuelos con número de vuelo (en el título, como «JA 3157 IGR → AEP», o en las notas, como «Vuelo: 3157» con el
          nombre de la aerolínea), «🛰️ Estado del vuelo»: en hora o con retraso, horas
          previstas o reales de salida y llegada, terminal, puerta, mostradores y cinta de equipaje, con «↻ Actualizar». Se
          empieza a seguir un día antes de salir; llegan avisos si hay retraso (de 15 min en adelante), cambio de puerta o
          terminal, cancelación, desvío o cinta de equipaje. El estado se ve también en la agenda del viaje y en «Hoy», para
          todos los que ven la reserva. Si la reserva no tiene número de vuelo, la tarjeta explica cómo ponerlo. Solo funciona con la clave de un proveedor de datos de
          vuelos: quien administra la pega en Ajustes → «🛰️ Estado de los vuelos» (AeroDataBox por RapidAPI, plan Basic
          gratuito); si no hay clave, la tarjeta no sale.
        - En los vuelos, «💺 Asiento y check-in»: el asiento si la reserva lo dice, cuándo abre el check-in de la aerolínea, botón
          para elegir o cambiar asiento en la web de la aerolínea y «Copiar localizador». Llega un aviso cuando abre el check-in.
          La app no puede mostrar los asientos libres: eso solo lo hace la aerolínea.
        - «🔁 Buscar otros vuelos/trenes»: abre Google Flights o Skyscanner con el mismo trayecto, directos primero.
        - «+ Adjuntar (cámara, Fotos o Archivos)»: añade billetes; si llevan QR, la app lo lee («QR», «2 QR»…).
        - «Ver QR»: QR a pantalla completa con fondo blanco y la pantalla sin apagarse; con varios pasajeros se pasa de uno a otro.
        - Tocar un adjunto abre el original. En el visor se hace zoom pellizcando con dos dedos, con doble toque o con + / −.
        - «Quién la ve»: todo el hogar, solo yo o personas concretas. Quien administra ve todas.
        - «Ocultar de mis listas» / «Mostrar en mis listas», «Editar» y «Borrar reserva».

        ## Lugares (en cada viaje, botón «📍 Lugares»)
        - Lista de sitios para ver, comer, tomar algo, compras o naturaleza. Se añaden escribiendo el nombre o pegando un
          enlace de Google Maps. Lo último añadido sale primero. Cada uno tiene «Mapa» y «✓ Visitado»; «Editar» → «Borrar».
        - «✨ Ideas para…» (debajo de la lista): la IA propone sitios del destino, agrupados por país; se guardan en el viaje.
          «+ Añadir» los pasa a la lista, «✕» los quita, «Sugerir más» añade otros sin repetir. Si se borra de la lista un
          sitio que vino de una idea, vuelve a las ideas.

        ## Documentos (pestaña 🛂)
        - Pasaportes, DNI, visados, seguros, vacunas y carnés de conducir de cada persona, con número, país, fechas, notas y
          fotos o PDF, que siempre se guardan en el móvil para verlos sin conexión.
        - «+ Añadir» → hacer la foto de la página de datos con las líneas de abajo («<<<») visibles: en pasaportes y DNI se lee
          EN EL PROPIO MÓVIL (no se envía a ninguna IA) y rellena número, caducidad, país y nombre (revisar el nombre). El carné
          de conducir español se rellena a mano. Seguros, visados y vacunas pueden leerse con IA solo si se pulsa «Leer con IA».
        - «Solo para mí» hace un documento privado: no lo ve nadie más, ni quien administra.
        - Avisos arriba: caducado, caduca antes de acabar un viaje, pasaporte con menos de 6 meses al salir, caduca en 90 días.

        ## Ajustes
        - Cuenta: cerrar sesión (borra la copia del móvil), cambiar contraseña, cerrar sesión en todos los dispositivos.
        - 🔒 Face ID: es obligatorio. Al entrar por primera vez en un móvil, la app pide «Activar Face ID» y no deja seguir
          sin él (si falla, se puede entrar esa vez y lo vuelve a pedir al abrirla). No se puede quitar. En Ajustes se elige cuándo
          volver a pedirlo (cada vez, 1, 5, 15 o 30 minutos o 1 hora fuera; por defecto 15 minutos). Si al activarlo se abre Microsoft Authenticator u otra app, hay
          que guardar la llave en «Contraseñas» (Ajustes del iPhone → General → Autorrelleno y contraseñas → activar
          Contraseñas). Si Face ID falla, «Usar la contraseña» de la cuenta.
        - 📅 Calendario: «Añadir al calendario del iPhone» suscribe el calendario a los viajes (días completos) y reservas (con
          hora; hoteles noche a noche). Se actualiza solo. «Copiar el enlace» para Google Calendar; «Quitar del calendario».
          El enlace es personal: no compartirlo.
        - 🔠 Tamaño de la letra: el botón «Aa» arriba en Hoy y en Viajes (o Ajustes → Tamaño de la letra) agranda o reduce
          toda la letra de la app en ese móvil (90 % a 150 %), sin hacer zoom.
        - Atajo de iPhone, Sincronización, Idioma (español, inglés, francés, italiano), Hogar (invitar con un enlace de un solo
          uso de 30 días; quien administra quita miembros y genera enlaces para cambiar la contraseña de alguien), Avisos
          («Activar avisos en este móvil»: la víspera a las 20:00 un resumen de todo lo de mañana con el tiempo y la hora a
          la que estar en el aeropuerto; 3 horas antes; check-in abierto; cambios en reservas y en el estado de los vuelos), Importar desde
          Gmail y Copias de seguridad (solo quien administra), Espacio en el móvil, Guía de uso y Versión.
        - Contraseña olvidada: en la pantalla de entrada, «¿Has olvidado la contraseña?» → llega un enlace por correo (24 h).

        ## Sin conexión
        Todo lo que se ha abierto o guardado en el móvil se ve sin red; los cambios se guardan y se envían al volver la red
        (Ajustes → Sincronización dice si queda algo pendiente). Los QR no necesitan conexión.

        ## Avisos que no llegan
        Comprobar Ajustes → Avisos (activado en este móvil), que la app esté instalada desde el icono, que no haya un modo de
        concentración y que Viajes tenga permiso en Ajustes del iPhone → Notificaciones.
        """;
}
