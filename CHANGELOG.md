# Changelog

Versionado semántico informal: patch para correcciones, minor para
nuevas funcionalidades (sección 17.2 de la especificación funcional).

## [0.11.0] — Facturación / POS: Punto de venta, Ventas y Clientes

### Agregado
- Facturación / POS → Clientes: maestro (nombre, RUC/C.I., teléfono,
  email, dirección) con baja lógica. Acumula `saldoPendiente` por ventas a crédito.
- Facturación / POS → Punto de venta: buscador por nombre/código y
  lector de código de barra (Enter agrega directo), carrito con cantidades,
  precio mayorista automático al llegar a la cantidad mínima, descuento
  (solo admin/gerencia/cajero), pagos divididos (efectivo, tarjeta,
  transferencia, crédito a cobrar), vuelto de efectivo y selección de
  depósito de salida.
- La venta se registra en una sola transacción: código V-000001, precios
  tomados del producto en ese momento, valida stock suficiente, descuenta
  `stockPorDeposito`/`stockTotal`, genera movimientos de stock tipo
  "egreso" y suma el crédito al saldo del cliente.
- Ticket interno de 80 mm en PDF (con logo), descargable al vender y
  desde el historial. Sin validez fiscal.
- Facturación / POS → Ventas: historial con filtro contado/crédito, detalle y reimpresión.
- Campos reservados en cada venta para después: `fiscal: null` (SIFEN),
  `cajaId: null` (cajas), `iva: null` por ítem.
- Finanzas → "Clientes" pasó a llamarse "Cuentas a cobrar" (pronto).

### Reglas de seguridad
- Cajero y vendedor pueden actualizar en productos solo `stockPorDeposito`,
  `stockTotal` y `actualizadoEn`, y crear movimientos de stock solo de
  tipo egreso. Vendedor puede crear ventas.

## [0.10.1] — Migración a nuevo proyecto Firebase

### Cambiado
- `firebase-config.js` apunta al proyecto `erp-carlosg-2` (nueva cuenta
  de Google). Sitio: https://gvivetelecom-lang.github.io/erp-carlosg-2/
- Se agregaron scripts de respaldo/migración en `migracion/`
  (exportar e importar toda la base, conservando IDs y contadores).

## [0.10.0] — Compras: Órdenes de compra

### Agregado
- Compras → Órdenes de compra: pedido al proveedor (proveedor, depósito
  de destino, fecha estimada, ítems con cantidad y costo; sugiere el
  último costo del producto). Código OC-000001 con contador atómico.
  No mueve stock.
- Estados: Pendiente → Recibida parcial → Recibida, o Anulada (solo si
  aún no recibió mercadería). Filtro por estado y detalle con cantidad
  pedida vs. recibida.
- Recepción de mercadería ahora puede vincularse a una orden abierta:
  precarga proveedor, depósito y lo pendiente; valida que no se reciba
  más de lo pedido; actualiza la orden (parcial/recibida) en la misma
  transacción que suma el stock.
- Reglas: nueva colección `ordenesCompra` (sin borrado físico).

## [0.9.0] — Compras: Proveedores y Recepción de mercadería

### Agregado
- Compras → Proveedores: maestro (razón social, RUC, teléfono, email,
  dirección, condiciones de pago) con baja lógica.
- Compras → Recepción de mercadería: ingreso de stock contra la factura
  del proveedor (proveedor, depósito destino, N° de factura, ítems con
  cantidad y costo unitario, total). Código RC-000001 con contador
  atómico; suma stock por depósito, guarda `costoUltimo` en el producto
  y genera un movimiento de tipo "ingreso" visible en Movimientos de stock.
- El documento `recepciones` incluye `ordenCompraId: null`, reservado
  para vincular la futura Orden de compra sin migrar datos.
- Reglas: nueva colección `recepciones` (inmutable); `compras` puede
  crear movimientos de stock; `deposito` puede leer proveedores y ve el
  módulo Compras.

### Corregido
- Traslado y Recepción rechazan el mismo producto repetido en una sola
  operación (antes el segundo renglón pisaba el stock calculado del primero).
- Texto de ayuda de Productos actualizado (ya no dice "no disponible").

## [0.8.0] — Exportar Productos a PDF y Excel

### Agregado
- En Stock → Productos: botones "Exportar PDF" y "Exportar Excel" junto
  al título. Ambos exportan exactamente lo que está cargado en pantalla
  (código interno, nombre, código de barra, marca, línea, categoría,
  precios mayorista/minorista, stock y estado).
- El PDF incluye el logo de la empresa (el mismo que se subió en
  Configuración) arriba de la tabla, junto con el nombre de la empresa
  y la fecha de generación.
- Todo corre en el navegador, sin backend: se agregaron las librerías
  SheetJS (Excel) y jsPDF + autoTable (PDF) vía CDN en `index.html`.

## [0.7.0] — Traslado de mercadería + auditoría de stock

*(Reemplaza por completo el enfoque de la versión 0.7.0 anterior — esa
no llegó a subirse al repositorio.)*

### Agregado
- **Stock → Traslado de mercadería**: mueve stock entre depósitos con
  una nota de remisión (código autogenerado `R-000001`, depósito de
  origen y destino, observaciones, y una lista de productos con
  cantidad). Se puede agregar más de un producto por remisión. Valida
  que haya stock suficiente en el origen para cada producto antes de
  confirmar.
- **Stock → Movimientos de stock** pasó a ser una pantalla de solo
  lectura: un historial de auditoría de todo lo que se movió, con
  filtros por tipo y por producto. Ya no tiene botón para crear
  movimientos sueltos a mano — los movimientos se generan
  automáticamente desde Traslado de mercadería (y, más adelante, desde
  Compras y Facturación cuando se construyan esos módulos).
- Colección `remisiones` (inmutable, mismo patrón que
  `movimientosStock`): cada traslado confirmado genera un movimiento de
  tipo "Transferencia" por cada producto, todo en una sola transacción
  junto con la actualización de `producto.stockPorDeposito`.

### Quitado
- Se sacó el formulario genérico de "Nuevo movimiento" (que permitía
  crear Ingreso/Egreso/Transferencia/Ajuste sueltos a mano) — no
  encajaba con la idea de que Movimientos de stock sea un registro de
  auditoría, no un lugar para cargar movimientos manualmente.

## [0.6.1] — Corrección de bug

### Corregido
- En páginas con tablas anchas (como Productos), toda la pantalla se
  corría hacia la derecha en vez de que solo la tabla scrolleara —
  bug clásico de CSS Grid: la columna de contenido no tenía
  `min-width: 0`, así que crecía para acomodar la tabla y empujaba todo
  lo demás (barra superior incluida) fuera de la pantalla. Se agregó
  la clase `.main-panel` con `min-width: 0` para que ahora sea
  `.table-scroll` la única parte que scrollea horizontalmente.

## [0.6.0] — Responsive + imagen de producto

### Agregado
- **Imagen de producto**: se puede subir una foto (PNG/JPG) por producto,
  con el mismo mecanismo que el logo de la empresa — se redimensiona y
  comprime en el navegador (JPEG, hasta 480px de lado mayor) y se guarda
  como imagen chica en el propio documento de Firestore, sin necesitar
  Firebase Storage. Se ve como miniatura en la tabla y en grande dentro
  del formulario.
- **Layout responsive**: por debajo de 860px de ancho, el menú lateral
  pasa a ser un panel deslizable que se abre con el botón ☰ en la barra
  superior (antes directamente desaparecía y no había forma de navegar
  desde el celular). Se ajustaron además el padding del contenido, las
  tarjetas de KPIs/módulos, el tamaño de las tablas y la barra superior
  para pantallas angostas.

### Notas técnicas
- El helper `redimensionarImagenADataUrl` ahora acepta formato y calidad
  de salida (antes siempre PNG) para poder comprimir mejor las fotos de
  producto sin tocar el comportamiento del logo.

## [0.5.0] — Ficha de Productos ampliada

### Agregado
- Código interno autogenerado (formato `P-000001`), usando un contador
  atómico en `contadores/productos` (sección 15.5 de la especificación)
  para que nunca se repita o se pierda un código aunque dos personas
  creen productos al mismo tiempo. No es editable una vez creado.
- Código de barra principal + botón para agregar códigos de barra
  adicionales (variantes, presentaciones, códigos viejos, etc.).
- Precio de venta mayorista y minorista por separado, más "Cantidad
  mayorista": a partir de cuántas unidades se aplica el precio
  mayorista (ese cálculo se usará más adelante en el POS, todavía no
  construido).

### Cambiado
- Se sacaron los campos viejos "Código / SKU" y "Precio de venta"
  únicos — quedan reemplazados por los de arriba. Si ya habías cargado
  productos con el formulario anterior, esos registros no van a tener
  código interno (se asigna solo al crear, no al editar) — avisame si
  los querés migrar y armamos un script para asignárselo.

## [0.4.3] — Corrección de bug

### Corregido
- El logo en el sidebar se desbordaba del encabezado (rompía el layout,
  tapando "Buscar página" e "Inicio"). Se le dio un alto fijo de 36px a
  la imagen y `overflow: hidden` al contenedor, en vez de depender solo
  de `max-height`, que no lo estaba conteniendo de forma confiable.

## [0.4.2] — Corrección de bug

### Corregido
- Alta de registros nuevos en Marcas, Líneas, Categorías y Depósitos
  fallaba con el error "Unsupported field value: undefined" porque el
  formulario mandaba un campo `id: undefined` dentro del documento
  nuevo. El mensaje en pantalla decía "revisá los permisos", pero el
  problema no era de permisos — era este bug. Corregido en
  `MaestroCRUD` (app.js).

## [0.4.1] — Ajuste visual

### Corregido
- Logo en la pantalla de login: se agrandó (de 56px a 96px de alto) y
  se centró horizontalmente arriba del formulario.

## [0.4.0] — Fase 2 · Maestros de Stock completos

### Agregado
- Stock → Categorías (maestro CRUD, mismo patrón que Marcas/Líneas).
- Stock → Depósitos (maestro CRUD, con campo de dirección opcional).
- Stock → Productos: ficha propia (no usa el patrón genérico) con
  selects a Marca, Línea y Categoría, código/SKU opcional y precio de
  venta. El stock por depósito queda para el módulo de Movimientos de
  stock, todavía pendiente.

### Notas de versionado
- El número de versión vive en `firebase-config.js` (`APP_VERSION`) y
  se refleja en el pie del menú lateral de la app. Cada entrega que
  agrega o cambia funcionalidad suma una versión "minor" (0.X.0) acá en
  el changelog; los ajustes menores sin funcionalidad nueva sumarían un
  "patch" (0.X.Y).

## [0.3.0] — Fase 1 · Base (continuación)

### Agregado
- Logo de la empresa: se puede subir un PNG o JPG desde Seguridad →
  Empresa y sucursales. Se redimensiona en el navegador (sin subirlo a
  ningún servidor) y se guarda como imagen chica dentro del mismo
  documento de configuración en Firestore. Se muestra en la barra
  lateral y en la pantalla de login.
- `configuracion/general` ahora se puede leer sin haber iniciado sesión
  (nombre de la empresa + logo no son datos sensibles y hacen falta en
  la pantalla de login).

## [0.2.0] — Fase 1 · Base (continuación)

### Agregado
- Alta de usuarios nuevos desde la app (Seguridad → Usuarios → "+ Nuevo"):
  crea la cuenta en Firebase Authentication y su perfil en Firestore en
  un solo paso, sin cerrar la sesión del admin que lo está creando.
- Módulo Seguridad → Empresa y sucursales: nombre de la empresa y CRUD
  de sucursales (con una marcada como predeterminada). La barra superior
  ahora lee estos valores de Firestore en vez de mostrarlos fijos.
- Módulo Stock → Líneas (mismo patrón de maestro que Marcas).
- Reglas de Firestore para `configuracion` y `sucursales`.

## [0.1.0] — Fase 1 · Base

### Agregado
- Login con Firebase Authentication (email/contraseña).
- Layout general: sidebar colapsable con el menú completo del sistema,
  barra superior con contexto de empresa/sucursal y usuario.
- Módulo Seguridad → Usuarios (listado y edición de perfil).
- Módulo Stock → Marcas (maestro CRUD completo, patrón replicable).
- `firestore.rules` con matriz de permisos por rol y colecciones
  transaccionales inmutables.
- Pantallas de "módulo no activado" para Tienda Online, Contabilidad y
  Facturación electrónica.
- Pantallas de "en construcción" para el resto de las páginas del menú.
