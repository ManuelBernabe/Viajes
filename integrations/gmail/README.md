# Importar reservas desde Gmail

El servidor **nunca** accede al buzón. Un script en tu propia cuenta de Google envía a la app solo los correos
que llevan la etiqueta «Viajes». La app crea un **borrador** que revisas en el móvil («N correos por revisar» en
Inicio), eliges el viaje, corriges lo que haga falta y confirmas: los adjuntos del correo pasan a la reserva.

## 1. Token en la app

En la app → **Ajustes → Importar desde Gmail → Generar token nuevo**. Cópialo: solo se muestra una vez.
Si se filtra, revócalo ahí mismo; solo permite crear borradores, nunca leer nada.

## 2. Script en Google

1. Entra en https://script.google.com con tu cuenta de Gmail y crea un proyecto nuevo («Viajes»).
2. Sustituye el contenido de `Código.gs` por el de `Code.gs` de esta carpeta y guarda.
3. **Configuración del proyecto** (rueda dentada) → **Propiedades del script** → añade:
   - `VIAJES_URL` = `https://viajes-production-82cb.up.railway.app`
   - `VIAJES_TOKEN` = el token del paso 1
4. **Activadores** (reloj) → **Añadir activador**: función `importarViajes`, origen «Basado en tiempo»,
   «Temporizador por minutos», «Cada minuto».
5. Al guardar, Google pide autorizar el script y avisa de «app no verificada»: es lo normal en un script propio.
   Pulsa «Configuración avanzada» → «Ir a Viajes (no seguro)» y acepta el acceso a Gmail y a servicios externos.

## 3. Etiqueta y filtro en Gmail

El script crea las etiquetas «Viajes», «Viajes/Importado» y «Viajes/Error» la primera vez que corre.

Para que **reenviar** un correo baste, crea un filtro en Gmail:

- **Para**: `tu.usuario+viajes@gmail.com`
- Acción: **Aplicar la etiqueta «Viajes»**.

Reenvía desde cualquier correo la reserva a `tu.usuario+viajes@gmail.com` (Gmail entrega a tu buzón todo lo que
lleve `+algo`). En uno o dos minutos aparece en la app.

### Sin reenviar: etiquetar automáticamente los correos de los proveedores

El script no mira quién envía el correo, solo la etiqueta. Así que un segundo filtro que etiquete directamente lo
que mandan las aerolíneas, trenes y hoteles evita el reenvío:

1. Gmail → rueda dentada → **Ver todos los ajustes** → **Filtros y direcciones bloqueadas** → **Crear un filtro**.
2. En **De**, pega los dominios de tus proveedores separados por `OR`, por ejemplo:

   ```
   renfe.com OR trenes.com OR iberia.com OR aireuropa.com OR aerolineas.com.ar OR voegol.com.br OR jetsmart.com OR booking.com OR airbnb.com OR latam.com OR ryanair.com OR vueling.com
   ```

3. **Crear filtro** → marca **Aplicar la etiqueta: Viajes** → **Crear filtro**.

No marques «Aplicar también a las conversaciones que cumplan los criterios»: importaría todo el correo antiguo de
esos remitentes. Los cambios de horario llegan del mismo dominio, así que también entran solos y la app los
detecta como modificación de la reserva. Si un proveedor manda publicidad desde el mismo dominio, aparecerá como
borrador «por revisar» y basta con descartarlo; para afinar, añade en **Asunto** palabras como
`reserva OR confirmación OR booking OR billete OR itinerario`.

## Correos de «¿Has olvidado la contraseña?»

La app no puede enviar correo (Railway bloquea el SMTP), así que lo envía este mismo script: cada minuto, antes de
mirar las etiquetas, recoge los enlaces que haya pedido alguien del hogar y se los manda **desde tu cuenta de Gmail**.
No hay que configurar nada más que tener el script al día (copia otra vez `Code.gs` cuando cambie). Si Google pide
autorizar «enviar correo en tu nombre», acéptalo.

## Qué extrae la app

| Del correo | Qué da |
|---|---|
| Adjuntos PDF e imágenes | Adjuntos de la reserva; el QR se lee en el móvil al confirmar |
| Pases de Apple Wallet (`.pkpass`) | El código de barras y la fecha; el tipo, origen, destino y localizador cuando el pase los lleva |
| Datos estructurados schema.org (JSON-LD) en el HTML: vuelos, hoteles, trenes, coches, entradas | Tipo, título, fechas, lugares, localizador, dirección |
| Asunto y remitente | Título provisional si no hay otra cosa |

Sin datos estructurados, el borrador trae igualmente el asunto, el texto y los adjuntos.

## Seguridad

- Solo entran correos que Gmail haya validado (DKIM o SPF correctos) o que reenvíes tú desde tu propia cuenta de
  Gmail (esos no llevan cabecera de validación porque no salen de Google). Un remitente falso se rechaza.
- El mismo correo dos veces no duplica nada.
- El HTML nunca llega al móvil: se guarda el texto plano y el `.eml` original en el almacenamiento.
- Nada del correo se envía a terceros.

## Copia de seguridad diaria en Google Drive

La app guarda cada día una copia de su base de datos en el propio servidor (se conservan las 14 últimas; se ven en
Ajustes → Copias de seguridad). Para tener además una copia **fuera** del servidor, el mismo script puede bajar cada
noche un zip completo (base de datos, billetes adjuntos y claves de sesión) a tu Drive:

1. En la app → **Ajustes → Copias de seguridad → Generar token de copia para Drive**. Cópialo (solo se muestra una
   vez). Solo quien administra el hogar puede crearlo, y se revoca ahí mismo.
2. En el script, **Propiedades del script** → añade `VIAJES_BACKUP_TOKEN` = ese token. `VIAJES_URL` ya está.
3. Pega el contenido actualizado de `Code.gs` (incluye la función `copiaDeSeguridad`) y guarda.
4. **Activadores** → **Añadir activador**: función `copiaDeSeguridad`, «Basado en tiempo», «Temporizador diario»,
   entre las 3 y las 4 de la madrugada. Al guardar, Google pedirá permiso para Drive.
5. Prueba: en el editor, elige `copiaDeSeguridad` y pulsa **Ejecutar**. En Drive aparecerá la carpeta
   «Viajes - copias de seguridad» con `viajes-AAAA-MM-DD-HHMM.zip`.

Se conservan las 14 copias más recientes; las demás van a la papelera de Drive.

**Restaurar**: descomprime el zip y copia `viajes.db` y la carpeta `files` en el volumen de datos del servidor
(`/data`), con la app parada. La copia no lleva las claves de sesión (con ellas se podrían fabricar sesiones), así que
tras restaurar todo el mundo tiene que iniciar sesión de nuevo. En el servidor las copias diarias están en
`/data/backups/viajes-AAAA-MM-DD.db`.

## Aviso si el servidor se cae

La función `vigilarServidor` del mismo script comprueba cada 5 minutos que la app responde. Si falla dos veces
seguidas te envía un correo («Viajes: el servidor no responde») y otro cuando vuelve. Solo avisa una vez por caída.

1. Pega el `Code.gs` actualizado y guarda.
2. **Activadores → Añadir activador**: función `vigilarServidor`, «Basado en tiempo», «Temporizador por minutos»,
   «Cada 5 minutos».
3. En el editor elige `vigilarServidor` y pulsa **Ejecutar** una vez: Google pedirá el permiso nuevo de «enviar
   correo en tu nombre». Acéptalo.
