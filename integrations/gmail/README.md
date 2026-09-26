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

Opcional: más filtros que etiqueten directamente los correos de proveedores concretos («De: iberia.com»).

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
