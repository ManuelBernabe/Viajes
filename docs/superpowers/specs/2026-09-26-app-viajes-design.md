# App de viajes — Especificación de diseño

**Fecha:** 26/09/2026
**Estado:** revisión 2, pendiente de aprobación

| Revisión | Cambio |
|---|---|
| 1 | Primera versión, sobre Firebase. Aprobada |
| 2 | **Servidor en Railway con .NET y SQLite**, porque Manuel ya paga Railway para otras apps. Cambian las secciones 2, 3, 5, 6, 8, 11, 13 y 14; roles, caja fuerte, zonas horarias y pantallas se mantienen. Se añade la **importación de reservas desde Gmail** como segunda fase (sección 15) |

## 1. Objetivo

Una app para iPhone donde tener **a mano, también sin conexión**, todo lo de un viaje: reservas de
vuelos, hoteles, trenes, coches y entradas con sus **QR y documentos originales**, y los **documentos de
identidad** de quienes viajan.

La usan **el administrador (Manuel) y su pareja**, que ven todos los viajes, y a veces **invitados**
a un viaje concreto.

**Éxito** = en la cola del control del aeropuerto, sin datos, se abre la app y la tarjeta de embarque
está a **un toque**; y antes de salir de casa se sabe, mirando un indicador, que todo el viaje está
disponible sin conexión.

## 2. Restricciones y decisiones

| Decisión | Motivo |
|---|---|
| **Web app instalable (PWA)**, no app nativa | Solo se dispone de Windows; una app nativa exige Mac + Xcode y 99 €/año de Apple |
| **Railway** como plataforma | Manuel ya lo paga para otras apps. Railway cobra por consumo: el servicio nuevo suma algo a la factura, a vigilar el primer mes |
| **Servidor propio en .NET** (ASP.NET Core) | Es el terreno de Manuel: permisos y sincronización en C#, con tests |
| **Un único servicio** que sirve la app y la API **desde el mismo dominio** | Sesión en cookie de primera parte, sin CORS ni cookies de terceros en la app instalada del iPhone |
| **SQLite** en un volumen, no PostgreSQL | Datos pequeños y dos o tres usuarios: no hace falta concurrencia de escritura. Un servicio menos consumiendo en Railway, y tests sin Docker. A cambio: una sola instancia, un corte breve en cada despliegue y copias de seguridad por cuenta propia |
| **v1: reservas a mano con adjuntos. Segunda fase: importación desde Gmail** que crea borradores (sección 15) | A mano sirve para cualquier proveedor y formato. La importación ahorra trabajo sin dar al servidor acceso al buzón ni necesitar un dominio propio |
| **Email y contraseña** para iniciar sesión | En iPhone, la app instalada y Safari **no comparten sesión**: los enlaces mágicos se abren en Safari; «Iniciar sesión con Apple» exige la cuenta de desarrollador |
| **Cifrado de extremo a extremo solo para la caja fuerte** | Protege al máximo lo más sensible; perder la clave solo afecta a documentos que se pueden volver a escanear |
| **Sincronización propia** por versiones de cambio | Sin un servicio que la traiga hecha, es la pieza central del proyecto; su diseño está en la sección 8 |

## 3. Arquitectura

```
iPhone (PWA instalada)                      Railway
┌───────────────────────────┐   HTTPS   ┌──────────────────────────────────────┐
│ React + TypeScript        │◄─────────►│ Servicio ASP.NET Core (.NET 10)      │
│ Service worker (Workbox)  │  mismo    │  · sirve la PWA (wwwroot)            │
│ IndexedDB: datos, cola de │  dominio  │  · API REST /api/*                   │
│ cambios, adjuntos         │           │  · Identity + cookie de sesión       │
│ Web Crypto (caja fuerte)  │           │  · permisos y sincronización en C#   │
└───────────────────────────┘           │  · SQLite en un volumen (/data)      │
                                        └──────────┬───────────────────────────┘
                                                   │  ficheros + réplica continua
                                                   ▼  de la base (Litestream)
                                        Almacenamiento de ficheros
                                        (bucket S3 de Railway)
```

- **Cliente**: Vite + TypeScript + React, con `vite-plugin-pwa` (Workbox). Se compila dentro del
  servicio .NET y se sirve desde su `wwwroot`.
- **Servidor**: ASP.NET Core (.NET 10), API REST en `/api`, **EF Core + SQLite** con migraciones.
  **Una sola instancia**, porque el volumen solo se monta en una.
- **Datos**: **SQLite** en modo **WAL**, en un **volumen** de Railway montado en `/data`.
- **Copias de seguridad**: **Litestream** replica la base de forma continua al almacenamiento de
  ficheros, y permite restaurarla a un momento concreto.
- **Ficheros**: almacenamiento compatible con S3 de Railway (`AWSSDK.S3`). ⚠️ **Verificar al montarlo**
  que Railway ofrece buckets. Si no, los ficheros irían al mismo volumen y Litestream necesitaría otro
  destino compatible con S3 para las copias. El acceso a los ficheros pasa **siempre por la API**, que
  comprueba permisos antes de servirlos.
- **Correo** (solo recuperación de contraseña e invitaciones opcionales): proveedor SMTP configurable
  por variables de entorno. Propuesta: **Resend**; verificar sus condiciones al montarlo.
- **Despliegue**: repositorio en GitHub, Railway construye con un **Dockerfile** multietapa (compila la
  PWA con Node, publica el servicio .NET y copia la PWA a `wwwroot`). Dominio `*.up.railway.app`
  con HTTPS; uno propio es opcional.
- **Secretos**: variables de entorno de Railway. Nunca en el repositorio.

### Estructura del repositorio

```
/web                 PWA (Vite + React + TS)
/server/Viajes.Api   ASP.NET Core
/server/Viajes.Tests xUnit, contra SQLite real en fichero temporal
/Dockerfile
/docs
```

## 4. Roles y permisos

| Permiso | Administrador | Miembro | Invitado de un viaje |
|---|---|---|---|
| Ver todos los viajes | ✅ | ✅ | Solo el suyo |
| Añadir reservas | ✅ | ✅ | ✅ en su viaje |
| Editar o borrar sus propias reservas | ✅ | ✅ | ✅ |
| Editar o borrar reservas **de otros** | ✅ | ⚙️ sí por defecto | ❌ |
| Crear, editar y borrar viajes | ✅ | ⚙️ sí por defecto | ❌ |
| Invitar a gente a un viaje | ✅ | ⚙️ sí por defecto | ❌ |
| Abrir la caja fuerte | ✅ | ⚙️ decide el administrador | ❌ nunca |
| Gestionar miembros y permisos | ✅ | ❌ | ❌ |
| Cambiar la frase de la caja fuerte | ✅ | ❌ | ❌ |
| Traspasar el rol de administrador | ✅ | ❌ | ❌ |

⚙️ = el administrador lo activa o desactiva por persona.

- Hay **un único administrador**. Puede **traspasar** el rol a un miembro.
- El permiso de caja fuerte **no basta**: además hay que tener la **frase** (sección 7). A quien no se
  le da acceso, no se le da la frase, y la API también se lo niega.
- **Toda la autorización se decide en el servidor**, en un único servicio de acceso (`AccessService`)
  que resuelve el papel del usuario en un hogar o viaje. Ninguna consulta devuelve datos sin pasar por él.

## 5. Modelo de datos (SQLite)

Todos los identificadores son **UUID generados en el cliente** (guardados como texto), para que un alta
hecha sin conexión tenga ya su id definitivo y reintentarla no duplique nada.

🔑 **Los instantes se guardan como enteros**: milisegundos UTC desde 1970 (`*_ms`). EF Core **no sabe
ordenar ni comparar `DateTimeOffset` en SQLite**, y `start_utc`, `deleted_at` o `expires_at` se usan
justo para eso. Las horas locales de las reservas van como texto ISO junto a su zona.

```
users                 (Identity) id, email, display_name, password_hash, …

households            id, name, admin_user_id,
                      vault_wrapped_key, vault_kdf_salt, vault_kdf_iterations, vault_key_version,
                      version, deleted_at

household_members     household_id, user_id, role ('admin'|'member'),
                      perm_edit_others, perm_manage_trips, perm_invite, perm_vault,
                      version, deleted_at

trips                 id, household_id, title, destination, start_date, end_date,
                      created_by, version, deleted_at

trip_guests           trip_id, user_id, version, deleted_at

bookings              id, trip_id, type ('flight'|'hotel'|'train'|'car'|'ticket'|'other'),
                      title,
                      start_local, start_tz, start_place,      -- '2026-10-12T10:05', 'Europe/Madrid'
                      end_local, end_tz, end_place,            -- opcionales
                      start_utc,                               -- derivado: ordenar y «lo siguiente»
                      reference, address, notes,
                      created_by, version, deleted_at

attachments           id, booking_id, file_key, name, mime, size, qr_text,
                      uploaded (bool), created_by, version, deleted_at

vault_items           id, household_id, ciphertext, iv, wrapped_file_key, file_key,
                      created_by, version, deleted_at

invites               id, token_hash, kind ('member'|'guest'), household_id, trip_id,
                      role, perms, created_by, expires_at, used_by, used_at

-- Segunda fase (sección 15)
import_tokens         id, user_id, token_hash, created_ms, revoked_ms

inbox_items           id, household_id, imported_by, message_id, from_address, subject,
                      received_ms, suggested_type, suggested_title,
                      suggested_start_local, suggested_start_tz, suggested_reference,
                      body_text, raw_file_key, status ('pending'|'confirmed'|'discarded'),
                      booking_id, version, deleted_at
                      -- único por (household_id, message_id)

inbox_attachments     id, inbox_item_id, file_key, name, mime, size, qr_text
```

- **`version`**: un entero que sale de **un contador global** (tabla `change_counter`, una sola fila),
  incrementado **en la misma transacción** de cada alta, modificación, borrado y cambio de acceso.
  SQLite no tiene secuencias, pero como **escribe de una en una**, el contador es seguro sin más. Es la
  base de la sincronización (sección 8).
- En el esquema de arriba, `start_utc`, `deleted_at`, `expires_at` y `used_at` son columnas enteras
  `*_ms`, según la regla anterior.
- **Borrados lógicos** (`deleted_at`): una fila borrada se conserva para que los clientes se enteren
  del borrado al sincronizar.
- Los ficheros viven en el almacenamiento con claves
  `households/{hid}/trips/{tripId}/{bookingId}/{attachmentId}` y `households/{hid}/vault/{itemId}`.

### Horas y zonas horarias

Cada momento se guarda como **hora local + zona IANA del lugar**, y se muestra **siempre en la hora
del lugar**, esté el móvil donde esté («10:05 hora de Madrid»). `start_utc` se calcula al guardar y
solo sirve para ordenar y para decidir qué es «lo siguiente».

## 6. Sesión e invitaciones

### Sesión
- **ASP.NET Core Identity**: hash de contraseñas, bloqueo tras intentos fallidos y tokens de recuperación.
- Sesión en **cookie `HttpOnly`, `Secure`, `SameSite=Strict`**, con caducidad deslizante de **60 días**,
  para que la app instalada no pida la contraseña a cada rato.
- Las peticiones que modifican datos comprueban además la cabecera `Origin`.
- **Límite de intentos** en inicio de sesión, alta y canje de invitaciones (limitador de ASP.NET Core).
- **Recuperación de contraseña** por correo (el reseteo se hace en Safari; después se entra en la app
  con la contraseña nueva).

### Invitaciones
- **Miembro del hogar** o **invitado a un viaje**: el administrador (o quien tenga permiso de invitar,
  solo para viajes) genera un **enlace de un solo uso que caduca en 7 días**:
  `https://<dominio>/invitacion/<token>`.
- El token son **128 bits aleatorios**; en la base se guarda **solo su hash** (SHA-256).
- Quien lo abre crea su cuenta (o inicia sesión) y lo **canjea**. El canje es **una transacción** que
  comprueba que existe, no ha caducado y no se ha usado, lo marca como usado y da el acceso.
- **Quitar a un invitado** le corta el acceso al instante. Lo que ya descargó para usar sin conexión
  **no se puede borrar a distancia**, pero su app lo purga en la siguiente sincronización (sección 8);
  se avisa de ello al quitarlo.

## 7. Caja fuerte: cifrado de extremo a extremo

**Claves**
- Al crear el hogar, el móvil del administrador genera la **clave de la caja fuerte** (AES-GCM de 256
  bits). No sale nunca del dispositivo sin cifrar.
- Cada fichero se cifra con **su propia clave** aleatoria (AES-GCM, IV aleatorio de 96 bits), que a su
  vez se guarda **envuelta** con la clave de la caja fuerte. Los **metadatos** (tipo de documento,
  titular, caducidad) también van cifrados.
- La clave de la caja fuerte se sube **envuelta** con una clave derivada de la **frase de la caja
  fuerte**: **6 palabras aleatorias** de una lista de 7.776 (~77 bits), **generadas por la app, nunca
  elegidas por el usuario**. Derivación con PBKDF2-SHA-256, 600.000 iteraciones y sal aleatoria.

**En cada dispositivo**
- La frase se escribe **una vez por dispositivo**. Después, la clave se guarda en el móvil envuelta con
  un **PIN de 6 dígitos** de la app.
- La caja fuerte se **cierra sola a los 5 minutos**. Tras **5 PIN erróneos** se exige otra vez la frase.
- Modelo de amenaza, dicho claro: el PIN protege frente a alguien que coge el móvil desbloqueado; frente
  al robo del dispositivo protege el cifrado del propio iPhone. El servidor y los invitados **nunca**
  pueden leer la caja fuerte: Railway solo guarda datos cifrados.

**Recuperación**
- Al crear la caja fuerte, la app **obliga** a guardar la frase (imprimirla o copiarla a un gestor de
  contraseñas) y a **teclearla de nuevo** para confirmarla.
- 🔴 Si se pierden la frase y todos los dispositivos, **la caja fuerte no se recupera**. Lo afectado son
  documentos que se pueden volver a escanear; las reservas no dependen de esta clave.

**Avisos**: un documento que **caduca en menos de 6 meses** se marca en la lista.

## 8. Sin conexión y sincronización

### En el móvil
- **La app abre siempre**: el *service worker* cachea la aplicación.
- **IndexedDB** guarda una **copia completa** de todo lo que el usuario puede ver (hogar, viajes,
  reservas, metadatos de adjuntos y de la caja fuerte). El volumen de un hogar es pequeño.
- **Adjuntos**: se descargan a IndexedDB cuando un viaje está **disponible sin conexión**:
  - **automáticamente** para los viajes que empiezan en los **próximos 7 días**, cada vez que se abre
    la app con conexión;
  - **a mano**, con un interruptor por viaje.
  - Los de la caja fuerte se guardan **cifrados** y se descifran al abrirlos.
- **Indicador por viaje**: «✅ Listo sin conexión · actualizado hace 2 h» o «⚠️ faltan N adjuntos».
- Se pide `navigator.storage.persist()`. ⚠️ En iPhone, los datos solo se conservan si la app está
  **instalada en la pantalla de inicio**; la app lo detecta y, si se usa desde Safari, avisa.

### Bajar cambios: `GET /api/sync?since=<version>`
- Devuelve todas las filas **visibles para el usuario** con `version > since`, **incluidas las
  borradas** (`deleted_at` no nulo), y la `version` máxima para la próxima llamada.
- Devuelve además la **lista completa de ids de viajes accesibles**. El cliente **purga** cualquier
  viaje que no esté en ella: así desaparece un viaje del que se ha quitado a un invitado, aunque esa
  retirada no genere una fila visible para él.
- Se llama al abrir la app, al volver la conexión y periódicamente mientras está abierta.
- 🔑 **Regla de oro, aprendida en MRW**: **cualquier** escritura —alta, edición, **borrado** y cambio de
  acceso— debe asignar una `version` nueva. Si un borrado no la toca, el cliente nunca se entera. Se
  garantiza **en un único sitio** (un interceptor de `SaveChanges` de EF Core) y se prueba **partiendo
  de filas antiguas**, no recién creadas.

### Subir cambios: la cola de pendientes
- Cada cambio hecho en el móvil se aplica al instante en local y se guarda en una **cola en IndexedDB**.
- La cola se envía **en orden** cuando hay conexión. Las operaciones son **idempotentes** porque llevan
  el UUID generado en el cliente: reenviar una operación ya aplicada no duplica nada.
- **Adjuntos**: primero se sube el fichero (`PUT /api/attachments/{id}/content`, máx. **20 MB**) y
  queda `uploaded = true`; mientras tanto la reserva muestra «pendiente de subir».
- **Conflictos**: **gana el último cambio en llegar al servidor**, por reserva completa. Editar algo
  que otro ha borrado se descarta y el cliente lo retira en la siguiente bajada. Con dos o tres personas
  es rarísimo.
- Si el servidor **rechaza** una operación por permisos (por ejemplo, un invitado al que acaban de
  quitar), se descarta de la cola y se muestra un aviso.

## 9. Pantallas

Pestañas inferiores: **Inicio · Caja fuerte · Ajustes**.

1. **Inicio**: arriba, **«Lo siguiente»**: la próxima reserva por `start_utc`, con su botón de QR a un
   toque. Debajo, la lista de viajes (próximos y pasados) con su indicador sin conexión.
2. **Viaje**: línea de tiempo **por días** en hora local, con filtros por tipo (✈️ 🏨 🚄 🚗 🎟️). Las
   reservas añadidas por un invitado llevan su nombre. Botón «Añadir reserva».
3. **Detalle de reserva**: horas con la zona del lugar, localizador, dirección, adjuntos y notas.
4. **QR a pantalla completa**: fondo blanco y QR lo más grande posible, **pantalla encendida** mientras
   está abierto (Screen Wake Lock), recordatorio de subir el brillo y botón «Ver original».
   - El QR se **lee de las imágenes** al adjuntarlas y se guarda su texto en `qr_text` para
     redibujarlo nítido. Si no se puede leer, **se muestra la imagen original**.
   - En v1 **no** se leen QR de dentro de un PDF: el PDF se muestra tal cual.
5. **Añadir o editar reserva**: tipo, título, salida y llegada (fecha, hora, lugar), localizador,
   notas, y adjuntar desde **cámara, Fotos o Archivos**. Solo son obligatorios el **título y la fecha
   de salida**.
6. **Caja fuerte**: PIN para abrir, lista de documentos con su caducidad, añadir documento.
7. **Ajustes**: perfil; miembros, permisos y traspaso de administración; invitaciones pendientes;
   frase de la caja fuerte y PIN; espacio usado sin conexión; cerrar sesión. En la segunda fase,
   además, **el token de importación desde Gmail** (generar, ver una vez y revocar).
8. **Bandeja de entrada** (segunda fase): en Inicio, un aviso «3 reservas por revisar». Cada borrador
   muestra el **remitente original**, los datos sugeridos y los adjuntos; se elige el viaje, se
   corrige lo que haga falta y se **confirma** o se **descarta**.

**Diseño visual profesional y eficaz** (petición expresa): se define un **sistema de diseño** propio al
empezar la implementación de la interfaz: paleta, tipografía, espaciado, componentes, modo oscuro y
márgenes seguros del iPhone.

## 10. Errores y casos límite

| Caso | Comportamiento |
|---|---|
| Adjunto de más de **20 MB** | Se rechaza en el móvil con un mensaje, y el servidor lo rechaza también |
| Subida interrumpida | Se reintenta sola al volver la conexión; la reserva muestra «pendiente de subir» |
| Invitación caducada o ya usada | Mensaje claro y opción de pedir otra al administrador |
| Invitado quitado mientras estaba sin conexión | Al reconectar, el viaje se purga de su móvil y sus cambios pendientes de ese viaje se descartan con aviso |
| Sesión caducada | Se pide la contraseña; **la cola de pendientes se conserva** y se envía después |
| PIN olvidado | Se vuelve a pedir la frase |
| Frase perdida, pero queda un dispositivo con la caja fuerte configurada | El administrador abre la caja fuerte con su PIN y **genera una frase nueva**, que vuelve a envolver la misma clave. La frase antigua no se guarda en ningún sitio y no se puede recuperar |
| Almacenamiento lleno en el móvil | Aviso y opción de quitar viajes pasados del modo sin conexión |
| App usada desde Safari sin instalar | Aviso de que los datos sin conexión pueden borrarse |
| Servidor caído | La app sigue funcionando con la copia local; los cambios esperan en la cola |

## 11. Pruebas

- **Servidor** (xUnit, contra **SQLite real en un fichero temporal** por test, nunca en memoria, para
  probar lo mismo que corre en Railway):
  - **Permisos**: cada fila de la tabla de la sección 4, **en positivo y en negativo**, contra la API.
  - **Invitaciones**: válida, caducada, reutilizada y canjeada dos veces a la vez.
  - **Sincronización**: una fila **antigua** que se borra aparece como borrada en la siguiente bajada;
    un invitado quitado deja de ver el viaje; reenviar una operación no la duplica.
  - Un invitado **no** puede leer la caja fuerte ni otro viaje, ni sus ficheros.
- **Cliente** (Vitest):
  - **Cifrado**: ida y vuelta; frase incorrecta falla; un bit alterado falla (AES-GCM autenticado);
    envolver y desenvolver la clave con frase y con PIN.
  - **Cola de pendientes**: orden, reintento, descarte por rechazo de permisos.
  - **Zonas horarias**: el vuelo Madrid–Tokio se ordena y se muestra bien con el móvil en cualquier zona.
- **Sin conexión** (Playwright con WebKit): la app abre y enseña un QR con la red cortada.
- **Importación desde Gmail** (segunda fase), con correos `.eml` reales anonimizados como datos de prueba:
  un `.pkpass` da el texto del QR y la fecha; un bloque JSON-LD `FlightReservation` rellena vuelo,
  fecha y localizador; un correo sin datos estructurados crea el borrador solo con adjuntos y asunto;
  el mismo correo importado dos veces no duplica; un correo que Gmail no validó se rechaza; un token
  revocado recibe 401; el HTML del correo nunca llega a la app como HTML.
- **Prueba en iPhone real** antes de construir el resto (sección 13).

## 12. Fuera de alcance en v1

- La **importación desde Gmail** no entra en la v1: es la **segunda fase** (sección 15).
- Leer correos con IA, y datos estructurados en formato microdatos (solo se leen bloques JSON-LD).
- Importar desde otros proveedores de correo (Outlook, iCloud): el mecanismo de la sección 15 es de
  Gmail. Desde ellos se puede **reenviar** a la dirección de Gmail y funciona igual.
- **Sacar a alguien del hogar volviendo a cifrar la caja fuerte** con una clave nueva (quien sale tenía
  la anterior). Se deja para v2.
- Leer QR de dentro de PDFs.
- Exportar a Apple Wallet, notificaciones y recordatorios.
- Más de un hogar por usuario.

## 13. Primer paso: prueba de viabilidad en iPhone real

Antes de construir nada más, un servicio mínimo en Railway (.NET sirviendo una PWA de diagnóstico y una
API con inicio de sesión) para comprobar **en el iPhone, con la app instalada en la pantalla de inicio**:

1. **Sesión**: iniciar sesión **dentro** de la app instalada, y que la cookie siga valiendo al reabrirla,
   **al día siguiente** y **a los 8 días**.
2. **Sin conexión**: con modo avión, la app abre desde el icono y enseña datos guardados en IndexedDB;
   una operación encolada sin red se envía sola al volver la conexión.
3. **Fichero guardado**: un fichero de varios MB en IndexedDB sigue íntegro **al día siguiente** y
   **a los 8 días**.
4. **Adjuntar** desde cámara, Fotos y Archivos, y **subirlo** al almacenamiento de Railway y
   descargarlo de nuevo.
5. **Screen Wake Lock** en modo instalado.
6. **Web Crypto**: AES-GCM y PBKDF2 con 600.000 iteraciones en **menos de 2 s**.

Si alguna falla, se revisa el diseño **antes** de seguir.

## 14. Riesgos

| Riesgo | Mitigación |
|---|---|
| iOS borra datos de webs no instaladas | Detectar el modo y avisar; pedir almacenamiento persistente |
| La sesión caduca antes de lo previsto en la app instalada | Comprobación a 8 días en la prueba de viabilidad; si falla, pasar a token en IndexedDB |
| Coste por consumo en Railway | Revisar la factura el primer mes; el servicio pasa casi todo el tiempo en reposo |
| **Seguridad de un servidor propio expuesto** | Autorización centralizada con tests de la matriz completa, límite de intentos, dependencias al día, secretos solo en variables de Railway |
| **Pérdida del volumen** con la base SQLite | **Litestream** replica la base de forma continua al almacenamiento de ficheros; **probar una restauración** antes de dar el servicio por bueno |
| Corte breve en cada despliegue (volumen en una sola instancia) | La app sigue funcionando con la copia local y la cola de pendientes |
| Railway no ofrece buckets | Ficheros al volumen y copias de Litestream a otro almacenamiento compatible con S3 |
| Pérdida de la frase de la caja fuerte | Guardado obligatorio con confirmación; documentos re-escaneables |
| Algún API no funciona en la app instalada | Prueba de viabilidad del punto 13 antes de construir |
| Administrador único sin acceso | Recuperación de contraseña por correo y traspaso del rol |
| Un borrado o cambio de acceso que no llega a los móviles | La regla de oro de la sección 8, en un solo sitio y con tests desde filas antiguas |
| Alguien ajeno envía correos a `+viajes` para colar borradores | El filtro de Gmail solo etiqueta remitentes del hogar; el servidor rechaza lo que Gmail no validó; **nada entra sin confirmación** y el borrador enseña el remitente original |
| Se filtra el token de importación | Solo permite **crear borradores**, nunca leer; se revoca desde Ajustes |
| El script depende de la cuenta de Google de Manuel | Su código vive en el repositorio; si deja de funcionar, se sigue pudiendo añadir a mano |

## 15. Segunda fase: importar reservas desde Gmail

Se construye **después del núcleo** (Planes 0 a 4). Hasta entonces, las reservas se añaden a mano.

### Principio
**El servidor nunca tiene acceso al buzón.** La API de Gmail no permite leer solo una etiqueta: dar
acceso a la app supondría acceso de lectura a **todo** el correo. En su lugar, un **script de Google
Apps Script en la cuenta de Manuel** empuja a la app **solo los correos que él marca**.

### Flujo
1. En Gmail, una etiqueta **«Viajes»** y un filtro: lo que llega a **`<usuario>+viajes@gmail.com`**
   **desde las direcciones del hogar** se etiqueta automáticamente. Opcionalmente, filtros que
   etiquetan directamente los correos de proveedores concretos (Iberia, Booking…).
2. Para importar, se **reenvía** el correo a `<usuario>+viajes@gmail.com`, desde cualquier cliente de
   correo y por cualquier miembro del hogar.
3. El script se ejecuta **cada minuto**: por cada correo con la etiqueta, envía el mensaje **completo**
   (`getRawContent()`, RFC 822) a `POST /api/inbox/import`, y después le quita «Viajes» y le pone
   **«Viajes/Importado»**. Si la API falla, le pone **«Viajes/Error»** para no reintentarlo sin fin.
4. El servidor crea un **borrador** en la bandeja de entrada del hogar, que llega a los móviles por la
   sincronización normal.
5. Un miembro del hogar lo revisa, elige el viaje y lo **confirma** (se convierte en reserva con sus
   adjuntos) o lo **descarta**. Los borradores sin tratar se borran a los **30 días**.

### La API de importación
- `POST /api/inbox/import`, cuerpo `message/rfc822`, **máximo 25 MB**.
- Autenticación con un **token de importación** personal: 256 bits aleatorios, se genera en Ajustes, se
  enseña **una sola vez**, se guarda **solo su hash** y se puede **revocar**. Solo permite crear
  borradores; no da acceso de lectura a nada.
- **Idempotente**: el `Message-ID` es único por hogar; importar el mismo correo dos veces no duplica.
- **Se rechaza** el correo si la cabecera `Authentication-Results` que añade **Gmail** (`mx.google.com`)
  no da por buenos **ni DKIM ni SPF**.
- El token vive en las **propiedades del script**, nunca en su código.

### Qué se extrae (en el servidor, con MimeKit)
| Fuente | Qué da | Fiabilidad |
|---|---|---|
| **Adjuntos** PDF e imágenes | Se guardan como adjuntos del borrador; de las imágenes se intenta leer el QR | Siempre |
| **`.pkpass`** (pases de Apple Wallet) | El texto del código de barras (`barcodes[].message`) y la fecha (`relevantDate`) | Alta |
| **JSON-LD de schema.org** en el HTML (`FlightReservation`, `LodgingReservation`, `TrainReservation`, `RentalCarReservation`, `EventReservation`) | Tipo, título, fechas con zona, localizador | Alta cuando existe |
| **Asunto y remitente** | Título provisional si no hay otra cosa | Siempre |

- Si no hay datos estructurados, el borrador trae **igualmente los adjuntos y el asunto**, y se completa
  a mano. **La importación nunca falla del todo por no entender un correo.**
- El HTML del correo **nunca se envía a la app como HTML**: se guarda el texto plano para consulta y el
  `.eml` original en el almacenamiento.
- La importación **no toca nunca la caja fuerte**: los documentos de identidad no se meten por correo.
- **Sin IA**: nada del correo se envía a terceros, y no hay instrucciones ocultas que un modelo pueda
  obedecer.

### El script
- Código en el repositorio, en `/integrations/gmail/Code.gs`, con instrucciones para pegarlo en
  script.google.com y crear el activador de cada minuto.
- Al autorizarlo, Google muestra el aviso de **«app no verificada»**: es lo normal en un script propio.
- Retraso esperado: **1 o 2 minutos** desde el reenvío.
