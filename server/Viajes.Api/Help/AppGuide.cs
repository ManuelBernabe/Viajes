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
        Abajo: Inicio, Documentos y Ajustes. En pantallas largas hay botones flotantes ↑ / ↓ para ir arriba o al final.
        Arriba en Inicio hay un botón ↻ para sincronizar al momento (también en «Por revisar» y en Ajustes → Sincronización).

        ## Inicio
        - «Hoy» (arriba, solo si hoy hay algo): el tiempo de hoy donde se está; lo siguiente que empieza hoy (o está en curso)
          con cuenta atrás, su QR, «Cómo llegar» y, en los vuelos, el estado en directo (en hora, retraso, puerta);
          «Esta noche» con el hotel donde se duerme; y «Más tarde, hoy» con el resto del día. Lo de mañana no sale en «Hoy»:
          llega en el aviso de la víspera.
        - Viajes «En curso», «Próximos viajes» y, al final, el «Histórico» de viajes realizados, plegado por años.
        - «N correos por revisar» si han llegado reservas por correo o por el atajo que esperan confirmación.
        - «Nuevo viaje» crea un viaje (título, destino, fechas de ida y vuelta).

        ## Un viaje
        - Arriba «Lo siguiente»: la próxima reserva y las que empiezan en la misma hora (por ejemplo el mismo vuelo de dos
          personas), con «Ver QR» y «Ver reserva». Un hotel en el que ya se está no tapa lo siguiente.
        - Aviso de documentos si un pasaporte o DNI caduca antes de acabar el viaje o le quedan menos de 6 meses al salir.
        - «🌤️ El tiempo»: previsión día a día (Open-Meteo) para donde se duerme cada noche, hasta 16 días por delante; también
          junto a cada día de la agenda. Si no hay hotel, usa el destino del viaje.
        - «Guardar en el móvil» baja todos los billetes para verlos sin cobertura (se hace solo 7 días antes del viaje).
        - «+ Añadir reserva» y «📍 Lugares».
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
        - En los vuelos con número en el título («JA 3157 IGR → AEP»), «🛰️ Estado del vuelo»: en hora o con retraso, horas
          previstas o reales de salida y llegada, terminal, puerta, mostradores y cinta de equipaje, con «↻ Actualizar». Se
          empieza a seguir un día antes de salir; llegan avisos si hay retraso (de 15 min en adelante), cambio de puerta o
          terminal, cancelación, desvío o cinta de equipaje. Solo funciona con la clave de un proveedor de datos de
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
        - 🔒 Face ID: «Activar Face ID» pide Face ID (o el código del iPhone) para abrir la app en ese móvil; se elige cuándo
          volver a pedirlo (cada vez, 1, 5 o 15 minutos fuera). Si al activarlo se abre Microsoft Authenticator u otra app, hay
          que guardar la llave en «Contraseñas» (Ajustes del iPhone → General → Autorrelleno y contraseñas → activar
          Contraseñas). Si Face ID falla, «Usar la contraseña» de la cuenta.
        - 📅 Calendario: «Añadir al calendario del iPhone» suscribe el calendario a los viajes (días completos) y reservas (con
          hora; hoteles noche a noche). Se actualiza solo. «Copiar el enlace» para Google Calendar; «Quitar del calendario».
          El enlace es personal: no compartirlo.
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
