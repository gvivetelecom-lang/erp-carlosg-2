/**
 * app.js
 * Sistema de Gestión Comercial — Carlos Gomes
 *
 * FASE 1 · BASE — según sección 19 de la especificación funcional.
 * Incluye: login, layout general (sidebar + topbar), menú completo del
 * sistema, módulo de Seguridad (Usuarios + alta de nuevas cuentas),
 * Configuración (Empresa y sucursales, con logo) y los maestros de
 * Stock: Marcas, Líneas, Categorías, Depósitos (patrón MaestroCRUD) y
 * Productos (ficha con selects a Marca/Línea/Categoría). Falta el
 * módulo de Movimientos de stock para completar Fase 2.
 *
 * Los módulos que todavía no se ejecutan (Facturación electrónica,
 * Tienda Online, Contabilidad) se muestran en el menú pero con pantalla
 * de "módulo no activado" — así el modelo de datos se puede ir
 * diseñando sin construir su lógica operativa todavía.
 *
 * Sin build: React 18 + Babel Standalone. Ver index.html para el orden
 * de carga de scripts.
 */

const { useState, useEffect, useMemo, useCallback } = React;

/**
 * Redimensiona una imagen (PNG/JPG) en el navegador y la devuelve como
 * data URL en base64, lista para guardar directo en un documento de
 * Firestore. No sube nada a ningún servidor: todo pasa en el cliente.
 * Se limita el tamaño máximo (220px de lado mayor) para que el logo
 * entre cómodo dentro del límite de 1 MiB por documento de Firestore.
 */
function redimensionarImagenADataUrl(file, maxSize = 220, formato = "image/png", calidad = 0.92) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("El archivo tiene que ser una imagen (PNG o JPG)."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("El archivo no es una imagen válida."));
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) { height = Math.round(height * (maxSize / width)); width = maxSize; }
        } else if (height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (formato === "image/jpeg") {
          // JPEG no soporta transparencia: fondo blanco para que no quede negro.
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
        } else {
          ctx.clearRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL(formato, calidad));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* Estructura del menú (orden = flujo de información, sección 3)       */
/* ------------------------------------------------------------------ */

const MENU = [
  { key: "inicio", label: "Inicio", icon: "IN" },
  {
    key: "stock", label: "Stock", icon: "ST",
    children: [
      { key: "marcas", label: "Marcas" },
      { key: "lineas", label: "Líneas" },
      { key: "categorias", label: "Categorías" },
      { key: "productos", label: "Productos" },
      { key: "depositos", label: "Depósitos" },
      { key: "traslados", label: "Traslado de mercadería" },
      { key: "movimientos", label: "Movimientos de stock" },
    ],
  },
  {
    key: "compras", label: "Compras", icon: "CO",
    children: [
      { key: "proveedores", label: "Proveedores" },
      { key: "ordenes-compra", label: "Órdenes de compra" },
      { key: "recepcion", label: "Recepción de mercadería" },
    ],
  },
  {
    key: "finanzas", label: "Finanzas", icon: "FI",
    children: [
      { key: "bancos", label: "Bancos", soon: true },
      { key: "clientes", label: "Clientes", soon: true },
      { key: "pagos", label: "Pagos a proveedores", soon: true },
    ],
  },
  {
    key: "facturacion", label: "Facturación / POS", icon: "FA",
    children: [
      { key: "pos", label: "Punto de venta", soon: true },
      { key: "cajas", label: "Cajas", soon: true },
      { key: "vendedores", label: "Vendedores", soon: true },
    ],
  },
  {
    key: "online", label: "Tienda Online", icon: "TO", notActivated: true,
    children: [
      { key: "pedidos-online", label: "Pedidos" },
      { key: "productos-web", label: "Productos publicados" },
    ],
  },
  {
    key: "contabilidad", label: "Contabilidad", icon: "CT", notActivated: true,
    children: [
      { key: "cuentas-contables", label: "Cuentas contables" },
      { key: "comprobantes", label: "Comprobantes / Timbrados" },
    ],
  },
  {
    key: "informes", label: "Informes", icon: "IF",
    children: [
      { key: "informe-ventas", label: "Ventas", soon: true },
      { key: "informe-stock", label: "Stock", soon: true },
    ],
  },
  {
    key: "seguridad", label: "Seguridad", icon: "SE",
    children: [
      { key: "usuarios", label: "Usuarios" },
      { key: "configuracion", label: "Empresa y sucursales" },
      { key: "roles", label: "Roles", soon: true },
    ],
  },
];

const ALL_PAGE_LABELS = MENU.flatMap((m) =>
  (m.children || [{ key: m.key, label: m.label }]).map((c) => ({
    ...c, moduleKey: m.key, moduleLabel: m.label,
  }))
);

/* ------------------------------------------------------------------ */
/* Login                                                                */
/* ------------------------------------------------------------------ */

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");

  useEffect(() => {
    const unsub = db.collection("configuracion").doc("general").onSnapshot(
      (doc) => {
        if (doc.exists) {
          setEmpresaNombre(doc.data().empresaNombre || "");
          setLogoDataUrl(doc.data().logoDataUrl || "");
        }
      },
      () => {} // sin problema si todavía no hay nada configurado
    );
    return () => unsub();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await auth.signInWithEmailAndPassword(email.trim(), password);
    } catch (err) {
      setError(traduceErrorAuth(err.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        {logoDataUrl ? (
          <img className="login-logo" src={logoDataUrl} alt={empresaNombre || "Logo de la empresa"} />
        ) : null}
        <div className="login-brand">{empresaNombre || "Carlos Gomes"}</div>
        <div className="login-sub">Sistema de gestión comercial</div>

        {error ? <div className="form-error">{error}</div> : null}

        <div className="field">
          <label htmlFor="email">Correo electrónico</label>
          <input
            id="email" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}

function traduceErrorAuth(code) {
  const map = {
    "auth/invalid-email": "El correo electrónico no es válido.",
    "auth/user-disabled": "Este usuario está deshabilitado.",
    "auth/user-not-found": "No existe una cuenta con ese correo.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/too-many-requests": "Demasiados intentos. Probá de nuevo en unos minutos.",
  };
  return map[code] || "No se pudo iniciar sesión. Intentá nuevamente.";
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                              */
/* ------------------------------------------------------------------ */

function Sidebar({ collapsed, onToggle, activeModule, activePage, onNavigate, role, empresaNombre, logoDataUrl, onCloseMobile }) {
  const [search, setSearch] = useState("");

  const filteredMenu = useMemo(() => {
    if (!search.trim()) return MENU;
    const q = search.trim().toLowerCase();
    return MENU
      .map((m) => {
        const children = (m.children || []).filter((c) => c.label.toLowerCase().includes(q));
        const selfMatches = m.label.toLowerCase().includes(q);
        if (selfMatches || children.length) return { ...m, children: children.length ? children : m.children };
        return null;
      })
      .filter(Boolean);
  }, [search]);

  const handleNavigate = (moduleKey, pageKey) => {
    onNavigate(moduleKey, pageKey);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          {logoDataUrl ? (
            <img className="sidebar-logo-img" src={logoDataUrl} alt={empresaNombre || "Logo"} />
          ) : (
            empresaNombre || "Carlos Gomes"
          )}
        </div>
        <button className="sidebar-toggle" onClick={onToggle} title="Colapsar menú" aria-label="Colapsar menú">
          {collapsed ? "»" : "«"}
        </button>
        <button className="sidebar-close" onClick={onCloseMobile} title="Cerrar menú" aria-label="Cerrar menú">
          ×
        </button>
      </div>

      <div className="sidebar-search">
        <input
          placeholder="Buscar página..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <nav className="sidebar-nav">
        {filteredMenu.map((m) => {
          if (!hasModuleAccess(role, m.key)) return null;
          const isActiveModule = activeModule === m.key;
          if (!m.children) {
            return (
              <button
                key={m.key}
                className={"sidebar-link" + (isActiveModule ? " active" : "")}
                onClick={() => handleNavigate(m.key, null)}
              >
                <span className="dot" />
                <span className="label">{m.label}</span>
              </button>
            );
          }
          return (
            <div key={m.key}>
              <div className="sidebar-group-label">
                {m.label}{m.notActivated ? " · no activado" : ""}
              </div>
              {m.children.map((c) => (
                <button
                  key={c.key}
                  className={"sidebar-link" + (isActiveModule && activePage === c.key ? " active" : "")}
                  onClick={() => handleNavigate(m.key, c.key)}
                >
                  <span className="dot" />
                  <span className="label">{c.label}</span>
                  {c.soon || m.notActivated ? <span className="badge-soon">pronto</span> : null}
                </button>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="version-tag">v{typeof APP_VERSION !== "undefined" ? APP_VERSION : "0.1.0"}</div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Topbar                                                               */
/* ------------------------------------------------------------------ */

function Topbar({ userDoc, firebaseUser, onLogout, empresaNombre, sucursalNombre, onOpenMobileNav }) {
  const initials = (userDoc?.nombre || firebaseUser.email || "?").slice(0, 2).toUpperCase();
  return (
    <header className="topbar">
      <button className="mobile-menu-btn" onClick={onOpenMobileNav} aria-label="Abrir menú">
        ☰
      </button>
      <div className="topbar-context">
        <span>Empresa:</span> <strong>{empresaNombre || "—"}</strong>
        <span>·</span>
        <span>Sucursal:</span> <strong>{sucursalNombre || "—"}</strong>
      </div>
      <div className="topbar-user">
        <div className="user-chip">
          <div className="user-avatar">{initials}</div>
          <div>
            <div style={{ fontWeight: 600 }}>{userDoc?.nombre || firebaseUser.email}</div>
            <div style={{ fontSize: 11.5, color: "var(--color-text-soft)" }}>
              {userDoc?.rol ? userDoc.rol : "sin rol asignado"}
            </div>
          </div>
        </div>
        <button className="link-quiet" onClick={onLogout}>Cerrar sesión</button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard (Inicio) — datos de ejemplo, se conecta a Firestore        */
/* cuando existan movimientos reales de Stock / POS.                    */
/* ------------------------------------------------------------------ */

function Dashboard() {
  const kpis = [
    { label: "Ventas del día", value: "—" },
    { label: "Ventas del mes", value: "—" },
    { label: "Ticket promedio", value: "—" },
    { label: "Productos con stock bajo", value: "—" },
    { label: "Cuentas a cobrar", value: "—" },
    { label: "Cuentas a pagar", value: "—" },
  ];
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Inicio</h1>
          <p>Visión ejecutiva del negocio. Los valores se completan a medida que se activan Stock, POS y Finanzas.</p>
        </div>
      </div>
      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi-card" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header"><h3>Próximos pasos de la Fase 1</h3></div>
        <div className="card-body">
          <p style={{ color: "var(--color-text-soft)", fontSize: 13 }}>
            Cargar los maestros principales de Stock (empezando por Marcas, ya
            disponible) y crear los usuarios del equipo en el módulo de
            Seguridad para habilitar el resto de los módulos.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Módulo no activado (Online, Contabilidad, Facturación electrónica)   */
/* ------------------------------------------------------------------ */

function ModuloNoActivado({ label }) {
  return (
    <div className="empty-state">
      <h3>{label} · módulo no activado</h3>
      <p>
        Por decisión del negocio, este módulo todavía no se ejecuta. El
        modelo de datos se está dejando preparado en Firestore para que,
        cuando se decida activarlo, no haga falta migrar información ya
        cargada en Stock, Compras o Finanzas.
      </p>
      <span className="tag-soon">Activación pendiente de decisión</span>
    </div>
  );
}

function ModuloEnConstruccion({ label, moduleLabel }) {
  return (
    <div className="empty-state">
      <h3>{label}</h3>
      <p>
        Esta página de {moduleLabel} todavía no fue construida en esta
        entrega. Se irá completando siguiendo el orden de fases del
        documento de especificación.
      </p>
      <span className="tag-soon">Próxima entrega</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Patrón de maestro CRUD — usado por Marcas.                          */
/* Para replicarlo en otro maestro (Líneas, Categorías, Colores...):    */
/*   1. Cambiar `collectionName`.                                       */
/*   2. Cambiar `fields` (lista de campos del formulario).              */
/*   3. Listo — la tabla, el alta, la edición y la baja lógica ya        */
/*      funcionan igual.                                                */
/* ------------------------------------------------------------------ */

function MaestroCRUD({ collectionName, title, description, fields }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = cerrado, {} = nuevo, {...} = edición
  const [toast, setToast] = useState("");

  useEffect(() => {
    const unsub = db.collection(collectionName)
      .orderBy("nombre")
      .onSnapshot(
        (snap) => {
          setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
        },
        (err) => {
          console.error(err);
          setLoading(false);
        }
      );
    return () => unsub();
  }, [collectionName]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  };

  const handleSave = async (data) => {
    try {
      const { id, ...rest } = data;
      if (id) {
        await db.collection(collectionName).doc(id).update({
          ...rest,
          actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
        });
        showToast("Cambios guardados.");
      } else {
        await db.collection(collectionName).add({
          ...rest,
          activo: rest.activo !== undefined ? rest.activo : true,
          creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
        });
        showToast("Registro creado.");
      }
      setEditing(null);
    } catch (err) {
      console.error(err);
      showToast("No se pudo guardar. Revisá los permisos.");
    }
  };

  const toggleActivo = async (item) => {
    try {
      await db.collection(collectionName).doc(item.id).update({ activo: !item.activo });
    } catch (err) {
      console.error(err);
      showToast("No se pudo cambiar el estado.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setEditing({})}>
          + Nuevo
        </button>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {fields.map((f) => <th key={f.name}>{f.label}</th>)}
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={fields.length + 2}>Cargando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={fields.length + 2} style={{ color: "var(--color-text-soft)" }}>
                  Todavía no hay registros. Usá "+ Nuevo" para crear el primero.
                </td></tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  {fields.map((f) => <td key={f.name}>{item[f.name]}</td>)}
                  <td>
                    <span className={"status-pill " + (item.activo ? "active" : "inactive")}>
                      {item.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => setEditing(item)}>Editar</button>
                      <button className="icon-btn" onClick={() => toggleActivo(item)}>
                        {item.activo ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== null ? (
        <MaestroFormModal
          fields={fields}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function MaestroFormModal({ fields, initial, onClose, onSave }) {
  const [form, setForm] = useState(() => {
    const base = {};
    fields.forEach((f) => { base[f.name] = initial[f.name] ?? ""; });
    return { ...base, id: initial.id };
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3>{initial.id ? "Editar registro" : "Nuevo registro"}</h3>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            {fields.map((f) => (
              <div className="field" key={f.name}>
                <label>{f.label}</label>
                <input
                  required={f.required}
                  value={form[f.name]}
                  onChange={(e) => handleChange(f.name, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" style={{ width: "auto" }} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stock · Productos                                                    */
/* No usa el patrón MaestroCRUD genérico porque necesita selects que    */
/* referencian otros maestros (Marca, Línea, Categoría) y un campo      */
/* numérico de precio — se arma un formulario propio, pero conserva la  */
/* misma estructura de tabla + modal + baja lógica que el resto.        */
/* ------------------------------------------------------------------ */

/** Hook chico para traer una colección de referencia (para llenar selects). */
function useColeccionSimple(collectionName) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const unsub = db.collection(collectionName).orderBy("nombre").onSnapshot((snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [collectionName]);
  return items;
}

/**
 * Genera el código interno del producto usando un contador atómico
 * (contadores/productos, sección 15.5 de la especificación) y crea el
 * documento en la misma transacción, para que el código nunca se
 * pierda o se repita aunque dos personas creen productos al mismo
 * tiempo.
 */
async function crearProductoConCodigo(datosProducto) {
  const contadorRef = db.collection("contadores").doc("productos");
  const nuevoProductoRef = db.collection("productos").doc();

  await db.runTransaction(async (tx) => {
    const contadorDoc = await tx.get(contadorRef);
    const actual = contadorDoc.exists ? (contadorDoc.data().ultimo || 0) : 0;
    const siguiente = actual + 1;
    const codigoInterno = "P-" + String(siguiente).padStart(6, "0");

    tx.set(contadorRef, { ultimo: siguiente }, { merge: true });
    tx.set(nuevoProductoRef, {
      ...datosProducto,
      codigoInterno,
      activo: true,
      creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Exportación de Productos a Excel (SheetJS) y PDF (jsPDF + autoTable).
 * Ambas corren enteramente en el navegador — no hay servidor de por
 * medio, así que solo exportan lo que ya está cargado en pantalla.
 */

function exportarProductosExcel({ items, marcas, lineas, categorias }) {
  const nombrePorId = (lista, id) => (lista.find((x) => x.id === id) || {}).nombre || "";

  const filas = items.map((p) => ({
    "Código interno": p.codigoInterno || "",
    "Nombre / Descripción": p.nombre || "",
    "Código de barra": p.codigoBarraPrincipal || "",
    "Marca": nombrePorId(marcas, p.marcaId),
    "Línea": nombrePorId(lineas, p.lineaId),
    "Categoría": nombrePorId(categorias, p.categoriaId),
    "Precio mayorista (Gs.)": p.precioMayorista != null ? Number(p.precioMayorista) : "",
    "Cantidad mayorista": p.cantidadMayorista != null ? Number(p.cantidadMayorista) : "",
    "Precio minorista (Gs.)": p.precioMinorista != null ? Number(p.precioMinorista) : "",
    "Stock": p.stockTotal != null ? Number(p.stockTotal) : 0,
    "Estado": p.activo ? "Activo" : "Inactivo",
  }));

  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Productos");
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `productos_${fecha}.xlsx`);
}

/** Carga una imagen y devuelve sus dimensiones naturales (para no deformar el logo en el PDF). */
function obtenerDimensionesImagen(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function exportarProductosPDF({ items, marcas, lineas, categorias, empresaNombre, logoDataUrl }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  let y = 14;

  if (logoDataUrl) {
    const dims = await obtenerDimensionesImagen(logoDataUrl);
    if (dims && dims.w > 0) {
      const anchoMax = 28; // mm
      const alto = anchoMax * (dims.h / dims.w);
      doc.addImage(logoDataUrl, "PNG", 14, y, anchoMax, alto);
    }
  }

  doc.setFontSize(14);
  doc.setTextColor(33, 32, 29);
  doc.text(empresaNombre || "Productos", 50, y + 6);

  doc.setFontSize(9);
  doc.setTextColor(110, 103, 96);
  doc.text(`Listado de productos — ${new Date().toLocaleDateString("es-PY")}`, 50, y + 12);

  const nombrePorId = (lista, id) => (lista.find((x) => x.id === id) || {}).nombre || "";
  const formatearGsPdf = (v) => (v != null ? Number(v).toLocaleString("es-PY") : "");

  const filas = items.map((p) => [
    p.codigoInterno || "",
    p.nombre || "",
    p.codigoBarraPrincipal || "",
    nombrePorId(marcas, p.marcaId),
    nombrePorId(lineas, p.lineaId),
    nombrePorId(categorias, p.categoriaId),
    formatearGsPdf(p.precioMayorista),
    p.cantidadMayorista != null ? p.cantidadMayorista : "",
    formatearGsPdf(p.precioMinorista),
    p.stockTotal != null ? p.stockTotal : 0,
    p.activo ? "Activo" : "Inactivo",
  ]);

  doc.autoTable({
    startY: y + 22,
    head: [["Código", "Nombre / Descripción", "Cód. barra", "Marca", "Línea", "Categoría", "P. mayorista", "Cant. may.", "P. minorista", "Stock", "Estado"]],
    body: filas,
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [156, 59, 87], textColor: 255 },
    alternateRowStyles: { fillColor: [247, 245, 241] },
  });

  const fecha = new Date().toISOString().slice(0, 10);
  doc.save(`productos_${fecha}.pdf`);
}

function ProductosPage({ empresaNombre, logoDataUrl }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState("");
  const [exportandoPdf, setExportandoPdf] = useState(false);

  const marcas = useColeccionSimple("marcas");
  const lineas = useColeccionSimple("lineas");
  const categorias = useColeccionSimple("categorias");

  useEffect(() => {
    const unsub = db.collection("productos").orderBy("codigoInterno", "desc").onSnapshot(
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2600); };

  const handleExportarExcel = () => {
    try {
      exportarProductosExcel({ items, marcas, lineas, categorias });
    } catch (err) {
      console.error(err);
      showToast("No se pudo generar el Excel.");
    }
  };

  const handleExportarPdf = async () => {
    setExportandoPdf(true);
    try {
      await exportarProductosPDF({ items, marcas, lineas, categorias, empresaNombre, logoDataUrl });
    } catch (err) {
      console.error(err);
      showToast("No se pudo generar el PDF.");
    } finally {
      setExportandoPdf(false);
    }
  };

  const nombrePorId = (lista, id) => (lista.find((x) => x.id === id) || {}).nombre || "—";

  const formatearGs = (valor) => valor != null ? `Gs. ${Number(valor).toLocaleString("es-PY")}` : "—";

  const handleSave = async (data) => {
    try {
      const { id, ...rest } = data;
      if (id) {
        await db.collection("productos").doc(id).update({
          ...rest,
          actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
        });
        showToast("Producto actualizado.");
      } else {
        await crearProductoConCodigo(rest);
        showToast("Producto creado.");
      }
      setEditing(null);
    } catch (err) {
      console.error(err);
      showToast("No se pudo guardar. Revisá los permisos.");
    }
  };

  const toggleActivo = async (item) => {
    try {
      await db.collection("productos").doc(item.id).update({ activo: !item.activo });
    } catch (err) {
      console.error(err);
      showToast("No se pudo cambiar el estado.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Productos</h1>
          <p>Código interno autogenerado, código de barra, marca/línea/categoría y precios mayorista/minorista. El stock por depósito se carga con Recepción de mercadería (Compras) y se mueve entre depósitos con Traslado de mercadería.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" style={{ width: "auto" }} onClick={handleExportarPdf} disabled={exportandoPdf || items.length === 0}>
            {exportandoPdf ? "Generando..." : "Exportar PDF"}
          </button>
          <button className="btn btn-secondary" style={{ width: "auto" }} onClick={handleExportarExcel} disabled={items.length === 0}>
            Exportar Excel
          </button>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setEditing({})}>
            + Nuevo
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Código interno</th>
                <th>Nombre / Descripción</th>
                <th>Código de barra</th>
                <th>Marca</th>
                <th>Línea</th>
                <th>Categoría</th>
                <th>Precio mayorista</th>
                <th>Cant. mayorista</th>
                <th>Precio minorista</th>
                <th>Stock</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13}>Cargando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={13} style={{ color: "var(--color-text-soft)" }}>
                  Todavía no hay productos. Usá "+ Nuevo" para crear el primero
                  {marcas.length === 0 ? " (necesitás al menos una marca cargada)." : "."}
                </td></tr>
              ) : items.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.imagenDataUrl ? (
                      <img src={p.imagenDataUrl} alt={p.nombre} className="producto-thumb" />
                    ) : (
                      <div className="producto-thumb producto-thumb-empty" />
                    )}
                  </td>
                  <td>{p.codigoInterno || "—"}</td>
                  <td>{p.nombre}</td>
                  <td>
                    {p.codigoBarraPrincipal || "—"}
                    {p.codigosBarraAdicionales && p.codigosBarraAdicionales.length > 0 ? (
                      <span style={{ color: "var(--color-text-soft)", fontSize: 11.5 }}>
                        {" "}(+{p.codigosBarraAdicionales.length})
                      </span>
                    ) : null}
                  </td>
                  <td>{nombrePorId(marcas, p.marcaId)}</td>
                  <td>{nombrePorId(lineas, p.lineaId)}</td>
                  <td>{nombrePorId(categorias, p.categoriaId)}</td>
                  <td>{formatearGs(p.precioMayorista)}</td>
                  <td>{p.cantidadMayorista != null ? p.cantidadMayorista : "—"}</td>
                  <td>{formatearGs(p.precioMinorista)}</td>
                  <td>{p.stockTotal != null ? p.stockTotal : 0}</td>
                  <td>
                    <span className={"status-pill " + (p.activo ? "active" : "inactive")}>
                      {p.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => setEditing(p)}>Editar</button>
                      <button className="icon-btn" onClick={() => toggleActivo(p)}>
                        {p.activo ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== null ? (
        <ProductoFormModal
          initial={editing}
          marcas={marcas}
          lineas={lineas}
          categorias={categorias}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function ProductoFormModal({ initial, marcas, lineas, categorias, onClose, onSave }) {
  const [nombre, setNombre] = useState(initial.nombre || "");
  const [imagenDataUrl, setImagenDataUrl] = useState(initial.imagenDataUrl || "");
  const [imagenNueva, setImagenNueva] = useState("");
  const [quitarImagen, setQuitarImagen] = useState(false);
  const [imagenError, setImagenError] = useState("");
  const [codigoBarraPrincipal, setCodigoBarraPrincipal] = useState(initial.codigoBarraPrincipal || "");
  const [codigosAdicionales, setCodigosAdicionales] = useState(initial.codigosBarraAdicionales || []);
  const [marcaId, setMarcaId] = useState(initial.marcaId || "");
  const [lineaId, setLineaId] = useState(initial.lineaId || "");
  const [categoriaId, setCategoriaId] = useState(initial.categoriaId || "");
  const [precioMayorista, setPrecioMayorista] = useState(initial.precioMayorista != null ? String(initial.precioMayorista) : "");
  const [cantidadMayorista, setCantidadMayorista] = useState(initial.cantidadMayorista != null ? String(initial.cantidadMayorista) : "");
  const [precioMinorista, setPrecioMinorista] = useState(initial.precioMinorista != null ? String(initial.precioMinorista) : "");
  const [saving, setSaving] = useState(false);

  const agregarCodigoAdicional = () => setCodigosAdicionales((arr) => [...arr, ""]);
  const cambiarCodigoAdicional = (i, valor) =>
    setCodigosAdicionales((arr) => arr.map((c, idx) => (idx === i ? valor : c)));
  const quitarCodigoAdicional = (i) =>
    setCodigosAdicionales((arr) => arr.filter((_, idx) => idx !== i));

  const handleImagenChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setImagenError("");
    try {
      const dataUrl = await redimensionarImagenADataUrl(file, 480, "image/jpeg", 0.8);
      setImagenNueva(dataUrl);
      setQuitarImagen(false);
    } catch (err) {
      setImagenError(err.message);
    }
  };

  const handleQuitarImagen = () => {
    setImagenNueva("");
    // Solo marcar "quitar" (que manda FieldValue.delete()) si había una
    // imagen ya guardada; si era una recién elegida y todavía no se
    // guardó, alcanza con limpiar la selección.
    if (initial.imagenDataUrl) setQuitarImagen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      id: initial.id,
      nombre,
      codigoBarraPrincipal: codigoBarraPrincipal || null,
      codigosBarraAdicionales: codigosAdicionales.map((c) => c.trim()).filter(Boolean),
      marcaId: marcaId || null,
      lineaId: lineaId || null,
      categoriaId: categoriaId || null,
      precioMayorista: precioMayorista === "" ? null : Number(precioMayorista),
      cantidadMayorista: cantidadMayorista === "" ? null : Number(cantidadMayorista),
      precioMinorista: precioMinorista === "" ? null : Number(precioMinorista),
    };
    if (imagenNueva) {
      payload.imagenDataUrl = imagenNueva;
    } else if (quitarImagen) {
      payload.imagenDataUrl = firebase.firestore.FieldValue.delete();
    }
    await onSave(payload);
    setSaving(false);
  };

  const imagenAMostrar = imagenNueva || (!quitarImagen ? imagenDataUrl : "");

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3>{initial.id ? "Editar producto" : "Nuevo producto"}</h3>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Imagen del producto (opcional)</label>
              {imagenAMostrar ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <img
                    src={imagenAMostrar}
                    alt={nombre || "Producto"}
                    style={{ width: 72, height: 72, objectFit: "cover", border: "1px solid var(--color-border)", borderRadius: "var(--radius)" }}
                  />
                  <button type="button" className="icon-btn" onClick={handleQuitarImagen}>Quitar imagen</button>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "var(--color-text-soft)", marginTop: 0 }}>
                  Todavía no hay una foto cargada para este producto.
                </p>
              )}
              <input type="file" accept="image/png,image/jpeg" onChange={handleImagenChange} />
              {imagenError ? <div className="form-error" style={{ marginTop: 8 }}>{imagenError}</div> : null}
            </div>

            {initial.id ? (
              <div className="field">
                <label>Código interno</label>
                <input value={initial.codigoInterno || ""} disabled style={{ background: "var(--color-bg)", color: "var(--color-text-soft)" }} />
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--color-text-soft)", marginTop: 0 }}>
                El código interno se genera automáticamente al guardar.
              </p>
            )}

            <div className="field">
              <label>Nombre / Descripción</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>

            <div className="field">
              <label>Código de barra</label>
              <input value={codigoBarraPrincipal} onChange={(e) => setCodigoBarraPrincipal(e.target.value)} placeholder="El que viene en la caja" />
            </div>

            <div className="field">
              <label>Códigos de barra adicionales (opcional)</label>
              {codigosAdicionales.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input
                    value={c}
                    onChange={(e) => cambiarCodigoAdicional(i, e.target.value)}
                    placeholder={`Código adicional ${i + 1}`}
                  />
                  <button type="button" className="icon-btn" onClick={() => quitarCodigoAdicional(i)}>Quitar</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary" style={{ width: "auto", marginTop: 4 }} onClick={agregarCodigoAdicional}>
                + Agregar código de barra
              </button>
            </div>

            <div className="field">
              <label>Marca</label>
              <select value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
                <option value="">— Sin marca —</option>
                {marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Línea</label>
              <select value={lineaId} onChange={(e) => setLineaId(e.target.value)}>
                <option value="">— Sin línea —</option>
                {lineas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Categoría</label>
              <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">— Sin categoría —</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Precio de venta mayorista (Gs.)</label>
              <input
                type="number" min="0" step="1"
                value={precioMayorista} onChange={(e) => setPrecioMayorista(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Cantidad mayorista</label>
              <input
                type="number" min="0" step="1"
                value={cantidadMayorista} onChange={(e) => setCantidadMayorista(e.target.value)}
                placeholder="A partir de cuántas unidades se aplica el precio mayorista"
              />
            </div>
            <div className="field">
              <label>Precio de venta minorista (Gs.)</label>
              <input
                type="number" min="0" step="1"
                value={precioMinorista} onChange={(e) => setPrecioMinorista(e.target.value)}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" style={{ width: "auto" }} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stock · Traslado de mercadería                                       */
/* Mueve stock entre depósitos usando una "nota de remisión": un         */
/* documento con cabecera (origen, destino, fecha) y una lista de ítems  */
/* (producto + cantidad). Al confirmarla, se genera UN movimiento de     */
/* stock inmutable por cada ítem (ver más abajo) y se actualiza          */
/* producto.stockPorDeposito — todo en una sola transacción atómica.     */
/*                                                                        */
/* La remisión en sí también es inmutable (colección `remisiones`): no   */
/* se edita ni se borra una vez creada. Si hay un error, se hace otra    */
/* remisión en sentido inverso.                                          */
/* ------------------------------------------------------------------ */

async function crearTrasladoMercaderia({
  depositoOrigenId, depositoDestinoId, items, observaciones, usuarioId, usuarioNombre,
}) {
  const contadorRemisionRef = db.collection("contadores").doc("remisiones");
  const contadorMovRef = db.collection("contadores").doc("movimientosStock");
  const remisionRef = db.collection("remisiones").doc();
  const productoRefs = items.map((it) => db.collection("productos").doc(it.productoId));

  await db.runTransaction(async (tx) => {
    // Todas las lecturas van primero (regla de las transacciones de Firestore).
    const productoDocs = await Promise.all(productoRefs.map((ref) => tx.get(ref)));
    const contadorRemisionDoc = await tx.get(contadorRemisionRef);
    const contadorMovDoc = await tx.get(contadorMovRef);

    let siguienteRemision = (contadorRemisionDoc.exists ? contadorRemisionDoc.data().ultimo || 0 : 0) + 1;
    let siguienteMov = contadorMovDoc.exists ? contadorMovDoc.data().ultimo || 0 : 0;
    const codigoRemision = "R-" + String(siguienteRemision).padStart(6, "0");

    const itemsGuardados = [];

    items.forEach((it, idx) => {
      const doc = productoDocs[idx];
      if (!doc.exists) throw new Error("Uno de los productos ya no existe.");
      const nombreProducto = doc.data().nombre;
      const stockPorDeposito = { ...(doc.data().stockPorDeposito || {}) };
      const actualOrigen = stockPorDeposito[depositoOrigenId] || 0;
      if (actualOrigen < it.cantidad) {
        throw new Error(`Stock insuficiente de "${nombreProducto}" en el depósito de origen (hay ${actualOrigen}, se pidió ${it.cantidad}).`);
      }
      stockPorDeposito[depositoOrigenId] = actualOrigen - it.cantidad;
      stockPorDeposito[depositoDestinoId] = (stockPorDeposito[depositoDestinoId] || 0) + it.cantidad;
      const stockTotal = Object.values(stockPorDeposito).reduce((a, b) => a + b, 0);

      tx.update(productoRefs[idx], {
        stockPorDeposito,
        stockTotal,
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });

      siguienteMov += 1;
      const codigoMovimiento = "M-" + String(siguienteMov).padStart(6, "0");
      const movRef = db.collection("movimientosStock").doc();
      tx.set(movRef, {
        codigoMovimiento,
        tipo: "transferencia",
        productoId: it.productoId,
        depositoOrigenId,
        depositoDestinoId,
        cantidad: it.cantidad,
        motivo: `Traslado ${codigoRemision}`,
        remisionId: remisionRef.id,
        codigoRemision,
        usuarioId,
        usuarioNombre,
        fecha: firebase.firestore.FieldValue.serverTimestamp(),
      });

      itemsGuardados.push({ productoId: it.productoId, nombreProducto, cantidad: it.cantidad });
    });

    tx.set(contadorRemisionRef, { ultimo: siguienteRemision }, { merge: true });
    tx.set(contadorMovRef, { ultimo: siguienteMov }, { merge: true });
    tx.set(remisionRef, {
      codigoRemision,
      depositoOrigenId,
      depositoDestinoId,
      observaciones: observaciones || null,
      items: itemsGuardados,
      totalItems: itemsGuardados.length,
      usuarioId,
      usuarioNombre,
      fecha: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
}

/** Buscador simple de producto: filtra por nombre, código interno o código de barra. */
function ProductoPicker({ productos, value, onChange, placeholder }) {
  const [query, setQuery] = useState("");
  const [abierto, setAbierto] = useState(false);

  const seleccionado = productos.find((p) => p.id === value);

  const resultados = useMemo(() => {
    if (!query.trim()) return productos.slice(0, 20);
    const q = query.trim().toLowerCase();
    return productos
      .filter((p) =>
        (p.nombre || "").toLowerCase().includes(q) ||
        (p.codigoInterno || "").toLowerCase().includes(q) ||
        (p.codigoBarraPrincipal || "").toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [productos, query]);

  if (seleccionado && !abierto) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius)", padding: "8px 11px" }}>
        {seleccionado.imagenDataUrl ? (
          <img src={seleccionado.imagenDataUrl} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} />
        ) : null}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{seleccionado.nombre}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-soft)" }}>{seleccionado.codigoInterno}</div>
        </div>
        <button type="button" className="icon-btn" onClick={() => { setAbierto(true); setQuery(""); }}>Cambiar</button>
      </div>
    );
  }

  return (
    <div>
      <input
        placeholder={placeholder || "Buscar por nombre, código interno o código de barra..."}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setAbierto(true)}
        autoFocus={abierto}
      />
      {abierto ? (
        <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius)", marginTop: 6, maxHeight: 200, overflowY: "auto" }}>
          {resultados.length === 0 ? (
            <div style={{ padding: 10, fontSize: 12.5, color: "var(--color-text-soft)" }}>Sin resultados.</div>
          ) : resultados.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => { onChange(p.id); setAbierto(false); }}
              style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "8px 11px", background: "none", border: "none", borderBottom: "1px solid var(--color-border)", textAlign: "left", cursor: "pointer", fontSize: 13 }}
            >
              <span style={{ flex: 1 }}>{p.nombre}</span>
              <span style={{ fontSize: 11.5, color: "var(--color-text-soft)" }}>{p.codigoInterno}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TrasladoMercaderiaPage({ currentUid, currentUserName }) {
  const [remisiones, setRemisiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [verDetalle, setVerDetalle] = useState(null);
  const [toast, setToast] = useState("");

  const depositos = useColeccionSimple("depositos");

  useEffect(() => {
    const unsub = db.collection("remisiones").orderBy("fecha", "desc").limit(100).onSnapshot(
      (snap) => {
        setRemisiones(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };
  const nombreDeposito = (id) => (depositos.find((d) => d.id === id) || {}).nombre || "—";

  const handleCrear = async (datos) => {
    await crearTrasladoMercaderia({ ...datos, usuarioId: currentUid, usuarioNombre: currentUserName });
    showToast(`Remisión creada. El stock ya se actualizó.`);
    setCreando(false);
  };

  if (creando) {
    return (
      <RemisionForm
        depositos={depositos}
        onCancel={() => setCreando(false)}
        onCrear={handleCrear}
      />
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Traslado de mercadería</h1>
          <p>Mueve stock de un depósito a otro con una nota de remisión. Genera automáticamente el historial en Movimientos de stock.</p>
        </div>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setCreando(true)}>
          + Nueva remisión
        </button>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Remisión</th>
                <th>Fecha</th>
                <th>Origen</th>
                <th>Destino</th>
                <th>Ítems</th>
                <th>Usuario</th>
                <th>Observaciones</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}>Cargando...</td></tr>
              ) : remisiones.length === 0 ? (
                <tr><td colSpan={8} style={{ color: "var(--color-text-soft)" }}>
                  Todavía no hay remisiones. Usá "+ Nueva remisión" para trasladar mercadería entre depósitos
                  {depositos.length < 2 ? " (necesitás al menos dos depósitos cargados)." : "."}
                </td></tr>
              ) : remisiones.map((r) => (
                <tr key={r.id}>
                  <td>{r.codigoRemision}</td>
                  <td>{r.fecha && r.fecha.toDate ? r.fecha.toDate().toLocaleString("es-PY") : "—"}</td>
                  <td>{nombreDeposito(r.depositoOrigenId)}</td>
                  <td>{nombreDeposito(r.depositoDestinoId)}</td>
                  <td>{r.totalItems}</td>
                  <td>{r.usuarioNombre || "—"}</td>
                  <td>{r.observaciones || "—"}</td>
                  <td>
                    <button className="icon-btn" onClick={() => setVerDetalle(r)}>Ver ítems</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {verDetalle ? (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setVerDetalle(null); }}>
          <div className="modal">
            <div className="modal-header">
              <h3>Detalle de {verDetalle.codigoRemision}</h3>
              <button type="button" className="modal-close" onClick={() => setVerDetalle(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12.5, color: "var(--color-text-soft)", marginTop: 0 }}>
                {nombreDeposito(verDetalle.depositoOrigenId)} → {nombreDeposito(verDetalle.depositoDestinoId)}
              </p>
              <table className="data-table">
                <thead><tr><th>Producto</th><th>Cantidad</th></tr></thead>
                <tbody>
                  {(verDetalle.items || []).map((it, i) => (
                    <tr key={i}><td>{it.nombreProducto}</td><td>{it.cantidad}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setVerDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function RemisionForm({ depositos, onCancel, onCrear }) {
  const [depositoOrigenId, setDepositoOrigenId] = useState("");
  const [depositoDestinoId, setDepositoDestinoId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState([{ productoId: "", cantidad: "" }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const productos = useColeccionSimple("productos");

  const stockEnOrigen = (productoId) => {
    if (!productoId || !depositoOrigenId) return null;
    const p = productos.find((x) => x.id === productoId);
    if (!p) return null;
    return (p.stockPorDeposito || {})[depositoOrigenId] || 0;
  };

  const cambiarItem = (i, campo, valor) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  const agregarItem = () => setItems((arr) => [...arr, { productoId: "", cantidad: "" }]);
  const quitarItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!depositoOrigenId || !depositoDestinoId) {
      setError("Elegí depósito de origen y de destino.");
      return;
    }
    if (depositoOrigenId === depositoDestinoId) {
      setError("Origen y destino no pueden ser el mismo depósito.");
      return;
    }
    const itemsValidos = items.filter((it) => it.productoId && it.cantidad !== "" && Number(it.cantidad) > 0);
    if (itemsValidos.length === 0) {
      setError("Agregá al menos un producto con cantidad mayor a 0.");
      return;
    }

    const idsRem = itemsValidos.map((it) => it.productoId);
    if (new Set(idsRem).size !== idsRem.length) {
      setError("Hay un producto repetido. Sumá las cantidades en una sola línea.");
      return;
    }

    setSaving(true);
    try {
      await onCrear({
        depositoOrigenId,
        depositoDestinoId,
        observaciones,
        items: itemsValidos.map((it) => ({ productoId: it.productoId, cantidad: Number(it.cantidad) })),
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo crear la remisión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Nueva remisión</h1>
          <p>Elegí origen, destino, y los productos con la cantidad a trasladar.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {error ? <div className="form-error">{error}</div> : null}

        <div className="card">
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="field">
                <label>Depósito de origen</label>
                <select value={depositoOrigenId} onChange={(e) => setDepositoOrigenId(e.target.value)}>
                  <option value="">— Elegir —</option>
                  {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Depósito de destino</label>
                <select value={depositoDestinoId} onChange={(e) => setDepositoDestinoId(e.target.value)}>
                  <option value="">— Elegir —</option>
                  {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginTop: 4 }}>
              <label>Observaciones (opcional)</label>
              <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Ej: transportista, número de guía externa..." />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Productos a trasladar</h3></div>
          <div className="card-body">
            {items.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <ProductoPicker
                    productos={productos}
                    value={it.productoId}
                    onChange={(id) => cambiarItem(i, "productoId", id)}
                  />
                  {it.productoId && depositoOrigenId ? (
                    <p style={{ fontSize: 11.5, color: "var(--color-text-soft)", margin: "4px 0 0" }}>
                      Stock actual en origen: {stockEnOrigen(it.productoId)}
                    </p>
                  ) : null}
                </div>
                <input
                  type="number" min="1" step="1" placeholder="Cantidad"
                  style={{ width: 110 }}
                  value={it.cantidad}
                  onChange={(e) => cambiarItem(i, "cantidad", e.target.value)}
                />
                <button type="button" className="icon-btn" onClick={() => quitarItem(i)} disabled={items.length === 1}>
                  Quitar
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary" style={{ width: "auto" }} onClick={agregarItem}>
              + Agregar producto
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-secondary" style={{ width: "auto" }} onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary" style={{ width: "auto" }} disabled={saving}>
            {saving ? "Guardando..." : "Confirmar remisión"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compras · Recepción de mercadería                                    */
/* Ingreso de stock contra la factura del proveedor. El campo           */
/* ordenCompraId queda reservado (null) para vincular más adelante      */
/* una Orden de compra sin cambiar el modelo de datos.                  */
/* ------------------------------------------------------------------ */

async function crearRecepcionMercaderia({
  proveedorId, depositoId, numeroDocumento, observaciones, items, ordenCompraId, usuarioId, usuarioNombre,
}) {
  const contadorRecRef = db.collection("contadores").doc("recepciones");
  const contadorMovRef = db.collection("contadores").doc("movimientosStock");
  const recepcionRef = db.collection("recepciones").doc();
  const proveedorRef = db.collection("proveedores").doc(proveedorId);
  const ordenRef = ordenCompraId ? db.collection("ordenesCompra").doc(ordenCompraId) : null;
  const productoRefs = items.map((it) => db.collection("productos").doc(it.productoId));

  await db.runTransaction(async (tx) => {
    // Todas las lecturas primero.
    const ordenDoc = ordenRef ? await tx.get(ordenRef) : null;
    const proveedorDoc = await tx.get(proveedorRef);
    const productoDocs = await Promise.all(productoRefs.map((ref) => tx.get(ref)));
    const contadorRecDoc = await tx.get(contadorRecRef);
    const contadorMovDoc = await tx.get(contadorMovRef);

    if (!proveedorDoc.exists) throw new Error("El proveedor ya no existe.");

    let ordenItems = null;
    if (ordenDoc) {
      if (!ordenDoc.exists) throw new Error("La orden de compra ya no existe.");
      const od = ordenDoc.data();
      if (od.estado !== "pendiente" && od.estado !== "parcial") {
        throw new Error(`La orden ${od.codigoOrden} está ${ESTADOS_OC[od.estado] || od.estado} y no admite recepciones.`);
      }
      if (od.proveedorId !== proveedorId) throw new Error("La orden pertenece a otro proveedor.");
      ordenItems = (od.items || []).map((x) => ({ ...x }));
      items.forEach((it) => {
        const oi = ordenItems.find((x) => x.productoId === it.productoId);
        if (!oi) throw new Error("Hay un producto que no está en la orden de compra.");
        const pendiente = oi.cantidad - (oi.cantidadRecibida || 0);
        if (it.cantidad > pendiente) {
          throw new Error(`"${oi.nombreProducto}": se intenta recibir ${it.cantidad} pero solo quedan ${pendiente} pendientes en la orden.`);
        }
        oi.cantidadRecibida = (oi.cantidadRecibida || 0) + it.cantidad;
      });
    }

    const siguienteRec = (contadorRecDoc.exists ? contadorRecDoc.data().ultimo || 0 : 0) + 1;
    let siguienteMov = contadorMovDoc.exists ? contadorMovDoc.data().ultimo || 0 : 0;
    const codigoRecepcion = "RC-" + String(siguienteRec).padStart(6, "0");

    const itemsGuardados = [];
    let total = 0;

    items.forEach((it, idx) => {
      const doc = productoDocs[idx];
      if (!doc.exists) throw new Error("Uno de los productos ya no existe.");
      const nombreProducto = doc.data().nombre;
      const stockPorDeposito = { ...(doc.data().stockPorDeposito || {}) };
      stockPorDeposito[depositoId] = (stockPorDeposito[depositoId] || 0) + it.cantidad;
      const stockTotal = Object.values(stockPorDeposito).reduce((a, b) => a + b, 0);

      tx.update(productoRefs[idx], {
        stockPorDeposito,
        stockTotal,
        costoUltimo: it.costoUnitario,
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });

      siguienteMov += 1;
      const codigoMovimiento = "M-" + String(siguienteMov).padStart(6, "0");
      tx.set(db.collection("movimientosStock").doc(), {
        codigoMovimiento,
        tipo: "ingreso",
        productoId: it.productoId,
        depositoOrigenId: null,
        depositoDestinoId: depositoId,
        cantidad: it.cantidad,
        motivo: `Recepción ${codigoRecepcion}`,
        recepcionId: recepcionRef.id,
        codigoRecepcion,
        usuarioId,
        usuarioNombre,
        fecha: firebase.firestore.FieldValue.serverTimestamp(),
      });

      const subtotal = it.cantidad * it.costoUnitario;
      total += subtotal;
      itemsGuardados.push({
        productoId: it.productoId, nombreProducto,
        cantidad: it.cantidad, costoUnitario: it.costoUnitario, subtotal,
      });
    });

    if (ordenRef && ordenItems) {
      const completa = ordenItems.every((x) => (x.cantidadRecibida || 0) >= x.cantidad);
      tx.update(ordenRef, {
        items: ordenItems,
        estado: completa ? "recibida" : "parcial",
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    tx.set(contadorRecRef, { ultimo: siguienteRec }, { merge: true });
    tx.set(contadorMovRef, { ultimo: siguienteMov }, { merge: true });
    tx.set(recepcionRef, {
      codigoRecepcion,
      proveedorId,
      proveedorNombre: proveedorDoc.data().nombre,
      depositoId,
      numeroDocumento: numeroDocumento || null,
      ordenCompraId: ordenCompraId || null,
      codigoOrdenCompra: ordenDoc ? ordenDoc.data().codigoOrden : null,
      observaciones: observaciones || null,
      items: itemsGuardados,
      totalItems: itemsGuardados.length,
      total,
      usuarioId,
      usuarioNombre,
      fecha: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
}

function formatoGs(n) {
  return "Gs. " + Math.round(Number(n) || 0).toLocaleString("es-PY");
}

function RecepcionForm({ proveedores, depositos, ordenes, onCancel, onCrear }) {
  const [ordenCompraId, setOrdenCompraId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [depositoId, setDepositoId] = useState("");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState([{ productoId: "", cantidad: "", costoUnitario: "" }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const productos = useColeccionSimple("productos");

  const cambiarItem = (i, campo, valor) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  const agregarItem = () => setItems((arr) => [...arr, { productoId: "", cantidad: "", costoUnitario: "" }]);
  const quitarItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const totalForm = items.reduce((acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.costoUnitario) || 0), 0);

  const ordenesAbiertas = (ordenes || []).filter(
    (o) => (o.estado === "pendiente" || o.estado === "parcial") && (!proveedorId || o.proveedorId === proveedorId)
  );

  // Al elegir una orden, se precargan proveedor, depósito y lo que falta recibir.
  const elegirOrden = (id) => {
    setOrdenCompraId(id);
    if (!id) return;
    const o = (ordenes || []).find((x) => x.id === id);
    if (!o) return;
    setProveedorId(o.proveedorId);
    setDepositoId(o.depositoId);
    const pendientes = (o.items || [])
      .map((it) => ({
        productoId: it.productoId,
        cantidad: String(it.cantidad - (it.cantidadRecibida || 0)),
        costoUnitario: String(it.costoUnitario),
      }))
      .filter((it) => Number(it.cantidad) > 0);
    setItems(pendientes.length ? pendientes : [{ productoId: "", cantidad: "", costoUnitario: "" }]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!proveedorId) { setError("Elegí el proveedor."); return; }
    if (!depositoId) { setError("Elegí el depósito de destino."); return; }

    const itemsValidos = items.filter((it) => it.productoId && Number(it.cantidad) > 0);
    if (itemsValidos.length === 0) {
      setError("Agregá al menos un producto con cantidad mayor a 0.");
      return;
    }
    const ids = itemsValidos.map((it) => it.productoId);
    if (new Set(ids).size !== ids.length) {
      setError("Hay un producto repetido. Sumá las cantidades en una sola línea.");
      return;
    }
    if (itemsValidos.some((it) => it.costoUnitario === "" || Number(it.costoUnitario) < 0)) {
      setError("Cargá el costo unitario de cada producto (puede ser 0).");
      return;
    }

    setSaving(true);
    try {
      await onCrear({
        proveedorId, depositoId, numeroDocumento, observaciones,
        ordenCompraId: ordenCompraId || null,
        items: itemsValidos.map((it) => ({
          productoId: it.productoId,
          cantidad: Number(it.cantidad),
          costoUnitario: Number(it.costoUnitario),
        })),
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo registrar la recepción.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Nueva recepción</h1>
          <p>Registrá la mercadería que llega según la factura del proveedor. El stock se suma al depósito elegido.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {error ? <div className="form-error">{error}</div> : null}

        <div className="card">
          <div className="card-body">
            <div className="form-grid-2">
              <div className="field">
                <label>Orden de compra (opcional)</label>
                <select value={ordenCompraId} onChange={(e) => elegirOrden(e.target.value)}>
                  <option value="">— Sin orden (recepción directa) —</option>
                  {ordenesAbiertas.map((o) => <option key={o.id} value={o.id}>{o.codigoOrden} · {o.proveedorNombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Proveedor</label>
                <select value={proveedorId} disabled={!!ordenCompraId} onChange={(e) => setProveedorId(e.target.value)}>
                  <option value="">— Elegir —</option>
                  {proveedores.filter((p) => p.activo !== false).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Depósito de destino</label>
                <select value={depositoId} disabled={!!ordenCompraId} onChange={(e) => setDepositoId(e.target.value)}>
                  <option value="">— Elegir —</option>
                  {depositos.filter((d) => d.activo !== false).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label>N° de factura / documento del proveedor</label>
                <input value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} placeholder="Ej: 001-001-0001234" />
              </div>
              <div className="field">
                <label>Observaciones (opcional)</label>
                <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Productos recibidos</h3></div>
          <div className="card-body">
            {items.map((it, i) => (
              <div key={i} className="recepcion-item">
                <div style={{ flex: 1, minWidth: 220 }}>
                  <ProductoPicker
                    productos={productos}
                    value={it.productoId}
                    onChange={(id) => cambiarItem(i, "productoId", id)}
                  />
                </div>
                <input
                  type="number" min="1" step="1" placeholder="Cantidad" style={{ width: 100 }}
                  value={it.cantidad} onChange={(e) => cambiarItem(i, "cantidad", e.target.value)}
                />
                <input
                  type="number" min="0" step="1" placeholder="Costo unit. (Gs.)" style={{ width: 150 }}
                  value={it.costoUnitario} onChange={(e) => cambiarItem(i, "costoUnitario", e.target.value)}
                />
                <span style={{ width: 130, textAlign: "right", fontSize: 13 }}>
                  {formatoGs((Number(it.cantidad) || 0) * (Number(it.costoUnitario) || 0))}
                </span>
                <button type="button" className="icon-btn" onClick={() => quitarItem(i)} disabled={items.length === 1}>
                  Quitar
                </button>
              </div>
            ))}
            {ordenCompraId ? (
              <p style={{ fontSize: 12.5, color: "var(--color-text-soft)", margin: 0 }}>
                Cantidades precargadas con lo que falta recibir de la orden. Si llegó menos, bajá la cantidad (quedará recepción parcial) o quitá la línea.
              </p>
            ) : (
              <button type="button" className="btn btn-secondary" style={{ width: "auto" }} onClick={agregarItem}>
                + Agregar producto
              </button>
            )}
            <p style={{ textAlign: "right", fontWeight: 600, marginTop: 16, marginBottom: 0 }}>
              Total: {formatoGs(totalForm)}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-secondary" style={{ width: "auto" }} onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary" style={{ width: "auto" }} disabled={saving}>
            {saving ? "Guardando..." : "Confirmar recepción"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RecepcionMercaderiaPage({ currentUid, currentUserName }) {
  const [recepciones, setRecepciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [verDetalle, setVerDetalle] = useState(null);
  const [toast, setToast] = useState("");

  const proveedores = useColeccionSimple("proveedores");
  const depositos = useColeccionSimple("depositos");
  const [ordenes, setOrdenes] = useState([]);

  useEffect(() => {
    const unsub = db.collection("ordenesCompra").orderBy("fecha", "desc").limit(200).onSnapshot(
      (snap) => setOrdenes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error(err)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = db.collection("recepciones").orderBy("fecha", "desc").limit(100).onSnapshot(
      (snap) => {
        setRecepciones(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };
  const nombreDeposito = (id) => (depositos.find((d) => d.id === id) || {}).nombre || "—";

  const handleCrear = async (datos) => {
    await crearRecepcionMercaderia({ ...datos, usuarioId: currentUid, usuarioNombre: currentUserName });
    showToast("Recepción registrada. El stock ya se actualizó.");
    setCreando(false);
  };

  if (creando) {
    return (
      <RecepcionForm
        proveedores={proveedores}
        depositos={depositos}
        ordenes={ordenes}
        onCancel={() => setCreando(false)}
        onCrear={handleCrear}
      />
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Recepción de mercadería</h1>
          <p>Ingreso de mercadería contra la factura del proveedor. Suma stock al depósito y deja el historial en Movimientos de stock.</p>
        </div>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setCreando(true)}>
          + Nueva recepción
        </button>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Recepción</th>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Factura</th>
                <th>Orden</th>
                <th>Depósito</th>
                <th>Ítems</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9}>Cargando...</td></tr>
              ) : recepciones.length === 0 ? (
                <tr><td colSpan={9} style={{ color: "var(--color-text-soft)" }}>
                  Todavía no hay recepciones. Cargá primero un proveedor y un depósito, y luego usá "+ Nueva recepción".
                </td></tr>
              ) : recepciones.map((r) => (
                <tr key={r.id}>
                  <td>{r.codigoRecepcion}</td>
                  <td>{r.fecha && r.fecha.toDate ? r.fecha.toDate().toLocaleString("es-PY") : "—"}</td>
                  <td>{r.proveedorNombre || "—"}</td>
                  <td>{r.numeroDocumento || "—"}</td>
                  <td>{r.codigoOrdenCompra || "—"}</td>
                  <td>{nombreDeposito(r.depositoId)}</td>
                  <td>{r.totalItems}</td>
                  <td>{formatoGs(r.total)}</td>
                  <td><button className="icon-btn" onClick={() => setVerDetalle(r)}>Ver ítems</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {verDetalle ? (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setVerDetalle(null); }}>
          <div className="modal">
            <div className="modal-header">
              <h3>Detalle de {verDetalle.codigoRecepcion}</h3>
              <button type="button" className="modal-close" onClick={() => setVerDetalle(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12.5, color: "var(--color-text-soft)", marginTop: 0 }}>
                {verDetalle.proveedorNombre} → {nombreDeposito(verDetalle.depositoId)}
                {verDetalle.numeroDocumento ? ` · Factura ${verDetalle.numeroDocumento}` : ""}
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Producto</th><th>Cant.</th><th>Costo unit.</th><th>Subtotal</th></tr></thead>
                  <tbody>
                    {(verDetalle.items || []).map((it, i) => (
                      <tr key={i}>
                        <td>{it.nombreProducto}</td>
                        <td>{it.cantidad}</td>
                        <td>{formatoGs(it.costoUnitario)}</td>
                        <td>{formatoGs(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ textAlign: "right", fontWeight: 600 }}>Total: {formatoGs(verDetalle.total)}</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setVerDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compras · Órdenes de compra                                          */
/* Pedido al proveedor. No mueve stock: el stock entra recién cuando    */
/* se registra una Recepción vinculada (total o parcial).               */
/* Estados: pendiente → parcial → recibida, o anulada.                  */
/* ------------------------------------------------------------------ */

const ESTADOS_OC = {
  pendiente: "Pendiente",
  parcial: "Recibida parcial",
  recibida: "Recibida",
  anulada: "Anulada",
};

async function crearOrdenCompra({
  proveedorId, depositoId, fechaEsperada, observaciones, items, usuarioId, usuarioNombre,
}) {
  const contadorRef = db.collection("contadores").doc("ordenesCompra");
  const ordenRef = db.collection("ordenesCompra").doc();
  const proveedorRef = db.collection("proveedores").doc(proveedorId);
  const productoRefs = items.map((it) => db.collection("productos").doc(it.productoId));

  await db.runTransaction(async (tx) => {
    const proveedorDoc = await tx.get(proveedorRef);
    const productoDocs = await Promise.all(productoRefs.map((ref) => tx.get(ref)));
    const contadorDoc = await tx.get(contadorRef);

    if (!proveedorDoc.exists) throw new Error("El proveedor ya no existe.");
    const siguiente = (contadorDoc.exists ? contadorDoc.data().ultimo || 0 : 0) + 1;
    const codigoOrden = "OC-" + String(siguiente).padStart(6, "0");

    let total = 0;
    const itemsGuardados = items.map((it, idx) => {
      if (!productoDocs[idx].exists) throw new Error("Uno de los productos ya no existe.");
      const subtotal = it.cantidad * it.costoUnitario;
      total += subtotal;
      return {
        productoId: it.productoId,
        nombreProducto: productoDocs[idx].data().nombre,
        cantidad: it.cantidad,
        costoUnitario: it.costoUnitario,
        subtotal,
        cantidadRecibida: 0,
      };
    });

    tx.set(contadorRef, { ultimo: siguiente }, { merge: true });
    tx.set(ordenRef, {
      codigoOrden,
      proveedorId,
      proveedorNombre: proveedorDoc.data().nombre,
      depositoId,
      fechaEsperada: fechaEsperada || null,
      observaciones: observaciones || null,
      estado: "pendiente",
      items: itemsGuardados,
      totalItems: itemsGuardados.length,
      total,
      usuarioId,
      usuarioNombre,
      fecha: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function anularOrdenCompra(ordenId) {
  const ref = db.collection("ordenesCompra").doc(ordenId);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error("La orden ya no existe.");
    if (doc.data().estado !== "pendiente") {
      throw new Error("Solo se puede anular una orden que no recibió mercadería.");
    }
    tx.update(ref, { estado: "anulada", actualizadoEn: firebase.firestore.FieldValue.serverTimestamp() });
  });
}

function OrdenCompraForm({ proveedores, depositos, onCancel, onCrear }) {
  const [proveedorId, setProveedorId] = useState("");
  const [depositoId, setDepositoId] = useState("");
  const [fechaEsperada, setFechaEsperada] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState([{ productoId: "", cantidad: "", costoUnitario: "" }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const productos = useColeccionSimple("productos");

  const cambiarItem = (i, campo, valor) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  const agregarItem = () => setItems((arr) => [...arr, { productoId: "", cantidad: "", costoUnitario: "" }]);
  const quitarItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  // Sugiere el último costo conocido al elegir el producto.
  const elegirProducto = (i, id) => {
    const p = productos.find((x) => x.id === id);
    setItems((arr) => arr.map((it, idx) => {
      if (idx !== i) return it;
      const sugerido = it.costoUnitario === "" && p && p.costoUltimo != null ? String(p.costoUltimo) : it.costoUnitario;
      return { ...it, productoId: id, costoUnitario: sugerido };
    }));
  };

  const totalForm = items.reduce((acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.costoUnitario) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!proveedorId) { setError("Elegí el proveedor."); return; }
    if (!depositoId) { setError("Elegí el depósito de destino."); return; }
    const itemsValidos = items.filter((it) => it.productoId && Number(it.cantidad) > 0);
    if (itemsValidos.length === 0) { setError("Agregá al menos un producto con cantidad mayor a 0."); return; }
    const ids = itemsValidos.map((it) => it.productoId);
    if (new Set(ids).size !== ids.length) { setError("Hay un producto repetido. Sumá las cantidades en una sola línea."); return; }
    if (itemsValidos.some((it) => it.costoUnitario === "" || Number(it.costoUnitario) < 0)) {
      setError("Cargá el costo unitario de cada producto (puede ser 0).");
      return;
    }
    setSaving(true);
    try {
      await onCrear({
        proveedorId, depositoId, fechaEsperada, observaciones,
        items: itemsValidos.map((it) => ({
          productoId: it.productoId,
          cantidad: Number(it.cantidad),
          costoUnitario: Number(it.costoUnitario),
        })),
      });
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo crear la orden.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Nueva orden de compra</h1>
          <p>Pedido al proveedor. No modifica el stock hasta que se registre la recepción.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        {error ? <div className="form-error">{error}</div> : null}
        <div className="card">
          <div className="card-body">
            <div className="form-grid-2">
              <div className="field">
                <label>Proveedor</label>
                <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                  <option value="">— Elegir —</option>
                  {proveedores.filter((p) => p.activo !== false).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Depósito de destino</label>
                <select value={depositoId} onChange={(e) => setDepositoId(e.target.value)}>
                  <option value="">— Elegir —</option>
                  {depositos.filter((d) => d.activo !== false).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Fecha estimada de entrega (opcional)</label>
                <input type="date" value={fechaEsperada} onChange={(e) => setFechaEsperada(e.target.value)} />
              </div>
              <div className="field">
                <label>Observaciones (opcional)</label>
                <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Productos pedidos</h3></div>
          <div className="card-body">
            {items.map((it, i) => (
              <div key={i} className="recepcion-item">
                <div style={{ flex: 1, minWidth: 220 }}>
                  <ProductoPicker productos={productos} value={it.productoId} onChange={(id) => elegirProducto(i, id)} />
                </div>
                <input type="number" min="1" step="1" placeholder="Cantidad" style={{ width: 100 }}
                  value={it.cantidad} onChange={(e) => cambiarItem(i, "cantidad", e.target.value)} />
                <input type="number" min="0" step="1" placeholder="Costo unit. (Gs.)" style={{ width: 150 }}
                  value={it.costoUnitario} onChange={(e) => cambiarItem(i, "costoUnitario", e.target.value)} />
                <span style={{ width: 130, textAlign: "right", fontSize: 13 }}>
                  {formatoGs((Number(it.cantidad) || 0) * (Number(it.costoUnitario) || 0))}
                </span>
                <button type="button" className="icon-btn" onClick={() => quitarItem(i)} disabled={items.length === 1}>Quitar</button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary" style={{ width: "auto" }} onClick={agregarItem}>+ Agregar producto</button>
            <p style={{ textAlign: "right", fontWeight: 600, marginTop: 16, marginBottom: 0 }}>Total: {formatoGs(totalForm)}</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-secondary" style={{ width: "auto" }} onClick={onCancel}>Cancelar</button>
          <button type="submit" className="btn btn-primary" style={{ width: "auto" }} disabled={saving}>
            {saving ? "Guardando..." : "Crear orden"}
          </button>
        </div>
      </form>
    </div>
  );
}

function OrdenesCompraPage({ currentUid, currentUserName }) {
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [verDetalle, setVerDetalle] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [toast, setToast] = useState("");

  const proveedores = useColeccionSimple("proveedores");
  const depositos = useColeccionSimple("depositos");

  useEffect(() => {
    const unsub = db.collection("ordenesCompra").orderBy("fecha", "desc").limit(200).onSnapshot(
      (snap) => {
        setOrdenes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };
  const nombreDeposito = (id) => (depositos.find((d) => d.id === id) || {}).nombre || "—";

  const handleCrear = async (datos) => {
    await crearOrdenCompra({ ...datos, usuarioId: currentUid, usuarioNombre: currentUserName });
    showToast("Orden de compra creada.");
    setCreando(false);
  };

  const handleAnular = async (o) => {
    if (!window.confirm(`¿Anular la orden ${o.codigoOrden}?`)) return;
    try {
      await anularOrdenCompra(o.id);
      setVerDetalle(null);
      showToast("Orden anulada.");
    } catch (err) {
      console.error(err);
      showToast(err.message || "No se pudo anular.");
    }
  };

  if (creando) {
    return <OrdenCompraForm proveedores={proveedores} depositos={depositos} onCancel={() => setCreando(false)} onCrear={handleCrear} />;
  }

  const visibles = filtroEstado ? ordenes.filter((o) => o.estado === filtroEstado) : ordenes;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Órdenes de compra</h1>
          <p>Pedidos a proveedores. Al llegar la mercadería, se vinculan desde Recepción de mercadería.</p>
        </div>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setCreando(true)}>+ Nueva orden</button>
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="field" style={{ maxWidth: 240 }}>
            <label>Estado</label>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ESTADOS_OC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Orden</th><th>Fecha</th><th>Proveedor</th><th>Depósito</th>
                <th>Entrega est.</th><th>Total</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}>Cargando...</td></tr>
              ) : visibles.length === 0 ? (
                <tr><td colSpan={8} style={{ color: "var(--color-text-soft)" }}>No hay órdenes para mostrar.</td></tr>
              ) : visibles.map((o) => (
                <tr key={o.id}>
                  <td>{o.codigoOrden}</td>
                  <td>{o.fecha && o.fecha.toDate ? o.fecha.toDate().toLocaleDateString("es-PY") : "—"}</td>
                  <td>{o.proveedorNombre || "—"}</td>
                  <td>{nombreDeposito(o.depositoId)}</td>
                  <td>{o.fechaEsperada || "—"}</td>
                  <td>{formatoGs(o.total)}</td>
                  <td><span className={"oc-estado oc-" + o.estado}>{ESTADOS_OC[o.estado] || o.estado}</span></td>
                  <td><button className="icon-btn" onClick={() => setVerDetalle(o)}>Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {verDetalle ? (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setVerDetalle(null); }}>
          <div className="modal">
            <div className="modal-header">
              <h3>{verDetalle.codigoOrden}</h3>
              <button type="button" className="modal-close" onClick={() => setVerDetalle(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12.5, color: "var(--color-text-soft)", marginTop: 0 }}>
                {verDetalle.proveedorNombre} → {nombreDeposito(verDetalle.depositoId)} · {ESTADOS_OC[verDetalle.estado]}
                {verDetalle.observaciones ? ` · ${verDetalle.observaciones}` : ""}
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Producto</th><th>Pedido</th><th>Recibido</th><th>Costo unit.</th><th>Subtotal</th></tr></thead>
                  <tbody>
                    {(verDetalle.items || []).map((it, i) => (
                      <tr key={i}>
                        <td>{it.nombreProducto}</td>
                        <td>{it.cantidad}</td>
                        <td>{it.cantidadRecibida || 0}</td>
                        <td>{formatoGs(it.costoUnitario)}</td>
                        <td>{formatoGs(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ textAlign: "right", fontWeight: 600 }}>Total: {formatoGs(verDetalle.total)}</p>
            </div>
            <div className="modal-footer">
              {verDetalle.estado === "pendiente" ? (
                <button type="button" className="btn btn-secondary" onClick={() => handleAnular(verDetalle)}>Anular orden</button>
              ) : null}
              <button type="button" className="btn btn-secondary" onClick={() => setVerDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stock · Movimientos de stock (auditoría, solo lectura)               */
/* Muestra el historial completo de movimientos generados por otras     */
/* operaciones (por ahora, Traslado de mercadería; más adelante también */
/* Compras y Facturación). No se crean movimientos manualmente acá — es */
/* el registro de auditoría de "cómo se movió la mercadería", nunca se  */
/* edita ni se borra nada desde esta pantalla.                          */
/* ------------------------------------------------------------------ */

const TIPOS_MOVIMIENTO = {
  ingreso: "Ingreso",
  egreso: "Egreso",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
};

function MovimientoStockPage() {
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroProductoId, setFiltroProductoId] = useState("");

  const productos = useColeccionSimple("productos");
  const depositos = useColeccionSimple("depositos");

  useEffect(() => {
    const unsub = db.collection("movimientosStock").orderBy("fecha", "desc").limit(300).onSnapshot(
      (snap) => {
        setMovimientos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  const nombreProducto = (id) => (productos.find((p) => p.id === id) || {}).nombre || "—";
  const nombreDeposito = (id) => (depositos.find((d) => d.id === id) || {}).nombre || "—";

  const movimientosFiltrados = movimientos.filter((m) => {
    if (filtroTipo && m.tipo !== filtroTipo) return false;
    if (filtroProductoId && m.productoId !== filtroProductoId) return false;
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Movimientos de stock</h1>
          <p>Historial de auditoría — de solo lectura. Cada fila queda registrada para siempre; para corregir algo se hace un traslado o ajuste nuevo, nunca se edita el histórico.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Tipo</label>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(TIPOS_MOVIMIENTO).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 260, flex: 1 }}>
            <label>Producto</label>
            {filtroProductoId ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>{nombreProducto(filtroProductoId)}</span>
                <button type="button" className="icon-btn" onClick={() => setFiltroProductoId("")}>Quitar filtro</button>
              </div>
            ) : (
              <ProductoPicker productos={productos} value={filtroProductoId} onChange={setFiltroProductoId} placeholder="Filtrar por producto..." />
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Producto</th>
                <th>Origen</th>
                <th>Destino</th>
                <th>Cantidad</th>
                <th>Usuario</th>
                <th>Observación</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9}>Cargando...</td></tr>
              ) : movimientosFiltrados.length === 0 ? (
                <tr><td colSpan={9} style={{ color: "var(--color-text-soft)" }}>
                  No hay movimientos {filtroTipo || filtroProductoId ? "con ese filtro" : "registrados todavía"}.
                </td></tr>
              ) : movimientosFiltrados.map((m) => (
                <tr key={m.id}>
                  <td>{m.codigoMovimiento}</td>
                  <td>{m.fecha && m.fecha.toDate ? m.fecha.toDate().toLocaleString("es-PY") : "—"}</td>
                  <td>{TIPOS_MOVIMIENTO[m.tipo] || m.tipo}</td>
                  <td>{nombreProducto(m.productoId)}</td>
                  <td>{m.depositoOrigenId ? nombreDeposito(m.depositoOrigenId) : "—"}</td>
                  <td>{m.depositoDestinoId ? nombreDeposito(m.depositoDestinoId) : "—"}</td>
                  <td>{m.cantidad}</td>
                  <td>{m.usuarioNombre || "—"}</td>
                  <td>{m.motivo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Configuración · Empresa y sucursales                                 */
/* ------------------------------------------------------------------ */

function ConfiguracionPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Empresa y sucursales</h1>
          <p>Datos que aparecen en la barra superior y, más adelante, en comprobantes e informes.</p>
        </div>
      </div>
      <EmpresaCard />
      <SucursalesCard />
    </div>
  );
}

function EmpresaCard() {
  const [nombre, setNombre] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState(""); // logo ya guardado en Firestore
  const [logoPreview, setLogoPreview] = useState(""); // logo recién elegido, sin guardar
  const [logoError, setLogoError] = useState("");
  const [quitarLogo, setQuitarLogo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const unsub = db.collection("configuracion").doc("general").onSnapshot((doc) => {
      setNombre(doc.exists ? (doc.data().empresaNombre || "") : "");
      setLogoDataUrl(doc.exists ? (doc.data().logoDataUrl || "") : "");
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2400); };

  const handleFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setLogoError("");
    try {
      const dataUrl = await redimensionarImagenADataUrl(file);
      setLogoPreview(dataUrl);
      setQuitarLogo(false);
    } catch (err) {
      setLogoError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { empresaNombre: nombre.trim() };
      if (logoPreview) {
        payload.logoDataUrl = logoPreview;
      } else if (quitarLogo) {
        payload.logoDataUrl = firebase.firestore.FieldValue.delete();
      }
      await db.collection("configuracion").doc("general").set(payload, { merge: true });
      setLogoPreview("");
      setQuitarLogo(false);
      showToast("Empresa actualizada.");
    } catch (err) {
      console.error(err);
      showToast("No se pudo guardar. Revisá los permisos.");
    } finally {
      setSaving(false);
    }
  };

  const logoAMostrar = logoPreview || (!quitarLogo ? logoDataUrl : "");

  return (
    <div className="card">
      <div className="card-header"><h3>Empresa</h3></div>
      <div className="card-body">
        {loading ? (
          <p style={{ color: "var(--color-text-soft)", fontSize: 13 }}>Cargando...</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ maxWidth: 360 }}>
            <div className="field">
              <label>Nombre de la empresa</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>

            <div className="field">
              <label>Logo (PNG o JPG)</label>
              {logoAMostrar ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <img
                    src={logoAMostrar}
                    alt="Logo de la empresa"
                    style={{ maxHeight: 56, maxWidth: 160, objectFit: "contain", border: "1px solid var(--color-border)", borderRadius: "var(--radius)", padding: 4 }}
                  />
                  <button
                    type="button" className="icon-btn"
                    onClick={() => { setLogoPreview(""); setQuitarLogo(true); }}
                  >
                    Quitar logo
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "var(--color-text-soft)", marginTop: 0 }}>
                  Todavía no hay un logo cargado. Se usa el nombre de la empresa como texto.
                </p>
              )}
              <input type="file" accept="image/png,image/jpeg" onChange={handleFileChange} />
              {logoError ? <div className="form-error" style={{ marginTop: 8 }}>{logoError}</div> : null}
              <p style={{ fontSize: 11.5, color: "var(--color-text-faint)", marginTop: 6 }}>
                Se redimensiona automáticamente a un tamaño chico (para la
                barra lateral y la pantalla de login); no hace falta que la
                imagen original esté optimizada.
              </p>
            </div>

            <button className="btn btn-primary" style={{ width: "auto" }} type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </form>
        )}
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function SucursalesCard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const unsub = db.collection("sucursales").orderBy("nombre").onSnapshot((snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2600); };

  const handleSave = async (data) => {
    try {
      const { id, ...rest } = data;
      if (id) {
        await db.collection("sucursales").doc(id).update(rest);
      } else {
        await db.collection("sucursales").add({
          ...rest,
          activo: true,
          creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
      // Si esta sucursal quedó marcada como predeterminada, desmarcar las demás.
      if (rest.predeterminada) {
        const batch = db.batch();
        const otras = await db.collection("sucursales").get();
        otras.docs.forEach((d) => {
          if (d.id !== id) batch.update(d.ref, { predeterminada: false });
        });
        await batch.commit();
      }
      showToast("Sucursal guardada.");
      setEditing(null);
    } catch (err) {
      console.error(err);
      showToast("No se pudo guardar. Revisá los permisos.");
    }
  };

  const toggleActivo = async (item) => {
    try {
      await db.collection("sucursales").doc(item.id).update({ activo: !item.activo });
    } catch (err) {
      console.error(err);
      showToast("No se pudo cambiar el estado.");
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3>Sucursales</h3>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setEditing({})}>
          + Nueva
        </button>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr><th>Nombre</th><th>Dirección</th><th>Predeterminada</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}>Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} style={{ color: "var(--color-text-soft)" }}>
                Todavía no hay sucursales. Usá "+ Nueva" para crear la primera (por ejemplo, "Casa Central").
              </td></tr>
            ) : items.map((s) => (
              <tr key={s.id}>
                <td>{s.nombre}</td>
                <td>{s.direccion || "—"}</td>
                <td>{s.predeterminada ? "Sí" : ""}</td>
                <td>
                  <span className={"status-pill " + (s.activo ? "active" : "inactive")}>
                    {s.activo ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button className="icon-btn" onClick={() => setEditing(s)}>Editar</button>
                    <button className="icon-btn" onClick={() => toggleActivo(s)}>
                      {s.activo ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== null ? (
        <SucursalFormModal initial={editing} onClose={() => setEditing(null)} onSave={handleSave} />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function SucursalFormModal({ initial, onClose, onSave }) {
  const [nombre, setNombre] = useState(initial.nombre || "");
  const [direccion, setDireccion] = useState(initial.direccion || "");
  const [predeterminada, setPredeterminada] = useState(initial.predeterminada || false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({ id: initial.id, nombre, direccion, predeterminada });
    setSaving(false);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3>{initial.id ? "Editar sucursal" : "Nueva sucursal"}</h3>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Nombre</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div className="field">
              <label>Dirección (opcional)</label>
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
            </div>
            <div className="field">
              <label>
                <input
                  type="checkbox" checked={predeterminada}
                  onChange={(e) => setPredeterminada(e.target.checked)}
                  style={{ width: "auto", marginRight: 8 }}
                />
                Usar como sucursal predeterminada (se muestra en la barra superior)
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" style={{ width: "auto" }} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seguridad · Usuarios                                                 */
/* ------------------------------------------------------------------ */

/**
 * Crea un usuario nuevo en Firebase Authentication SIN cerrar la sesión
 * del admin que está logueado. Truco estándar para apps sin backend:
 * se abre una instancia secundaria de Firebase (con la misma config),
 * se crea el usuario ahí, y se la descarta. El documento en Firestore
 * se escribe con la sesión PRINCIPAL (la del admin), así que respeta
 * firestore.rules normalmente.
 */
async function crearUsuarioConAuth({ email, password, nombre, rol }) {
  const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary-" + Date.now());
  try {
    const cred = await secondaryApp.auth().createUserWithEmailAndPassword(email.trim(), password);
    const uid = cred.user.uid;
    await secondaryApp.auth().signOut();
    await db.collection("usuarios").doc(uid).set({
      nombre: nombre.trim(),
      email: email.trim(),
      rol,
      activo: true,
      creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return uid;
  } finally {
    await secondaryApp.delete();
  }
}

function UsuariosPage({ currentUid }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const unsub = db.collection("usuarios").onSnapshot((snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2600); };

  const handleSave = async (data) => {
    try {
      const { id, ...rest } = data;
      await db.collection("usuarios").doc(id).update(rest);
      showToast("Usuario actualizado.");
      setEditing(null);
    } catch (err) {
      console.error(err);
      showToast("No se pudo guardar. Revisá los permisos.");
    }
  };

  const handleCreate = async (data) => {
    await crearUsuarioConAuth(data);
    showToast(`Usuario creado. Compartile el correo y la contraseña a ${data.nombre}.`);
    setCreating(false);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Usuarios</h1>
          <p>
            Creá cuentas nuevas del equipo acá mismo — se registran en
            Firebase Authentication y en Firestore en un solo paso.
          </p>
        </div>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setCreating(true)}>
          + Nuevo
        </button>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}>Cargando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} style={{ color: "var(--color-text-soft)" }}>
                  Todavía no hay usuarios cargados en Firestore.
                </td></tr>
              ) : items.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre || "—"}{u.id === currentUid ? " (vos)" : ""}</td>
                  <td>{u.email || "—"}</td>
                  <td>{u.rol || "sin rol"}</td>
                  <td>
                    <span className={"status-pill " + (u.activo !== false ? "active" : "inactive")}>
                      {u.activo !== false ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => setEditing(u)}>Editar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing ? (
        <UsuarioFormModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      ) : null}

      {creating ? (
        <NuevoUsuarioModal
          onClose={() => setCreating(false)}
          onCreate={handleCreate}
        />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function NuevoUsuarioModal({ onClose, onCreate }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState(ROLES.VENDEDOR);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setSaving(true);
    try {
      await onCreate({ nombre, email, password, rol });
    } catch (err) {
      console.error(err);
      setError(traduceErrorAuth(err.code));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3>Nuevo usuario</h3>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            {error ? <div className="form-error">{error}</div> : null}
            <div className="field">
              <label>Nombre</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div className="field">
              <label>Correo electrónico</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Contraseña inicial</label>
              <input
                type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="mínimo 6 caracteres" required
              />
            </div>
            <div className="field">
              <label>Rol</label>
              <select value={rol} onChange={(e) => setRol(e.target.value)}>
                {Object.values(ROLES).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <p style={{ fontSize: 12, color: "var(--color-text-soft)" }}>
              Después de crearlo, compartile el correo y esta contraseña por
              un canal seguro. Todavía no hay una pantalla de "cambiar mi
              contraseña" — quedará para una próxima entrega.
            </p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" style={{ width: "auto" }} disabled={saving}>
              {saving ? "Creando..." : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsuarioFormModal({ initial, onClose, onSave }) {
  const [nombre, setNombre] = useState(initial.nombre || "");
  const [rol, setRol] = useState(initial.rol || ROLES.VENDEDOR);
  const [activo, setActivo] = useState(initial.activo !== false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({ id: initial.id, nombre, rol, activo });
    setSaving(false);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3>Editar usuario</h3>
            <button type="button" className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Nombre</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div className="field">
              <label>Rol</label>
              <select value={rol} onChange={(e) => setRol(e.target.value)}>
                {Object.values(ROLES).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field">
              <label>
                <input
                  type="checkbox" checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                  style={{ width: "auto", marginRight: 8 }}
                />
                Usuario activo
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" style={{ width: "auto" }} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Router de contenido                                                  */
/* ------------------------------------------------------------------ */

function PageContent({ moduleKey, pageKey, currentUid, currentUserName, empresaNombre, logoDataUrl }) {
  if (moduleKey === "inicio") return <Dashboard />;

  const moduleDef = MENU.find((m) => m.key === moduleKey);
  if (moduleDef?.notActivated) return <ModuloNoActivado label={moduleDef.label} />;

  if (moduleKey === "compras" && pageKey === "proveedores") {
    return (
      <MaestroCRUD
        collectionName="proveedores"
        title="Proveedores"
        description="Maestro de proveedores. Se usa en la recepción de mercadería y, más adelante, en órdenes de compra y cuentas a pagar."
        fields={[
          { name: "nombre", label: "Razón social / Nombre", required: true },
          { name: "ruc", label: "RUC" },
          { name: "telefono", label: "Teléfono" },
          { name: "email", label: "Email" },
          { name: "direccion", label: "Dirección" },
          { name: "condicionesPago", label: "Condiciones de pago" },
        ]}
      />
    );
  }

  if (moduleKey === "compras" && pageKey === "ordenes-compra") {
    return <OrdenesCompraPage currentUid={currentUid} currentUserName={currentUserName} />;
  }

  if (moduleKey === "compras" && pageKey === "recepcion") {
    return <RecepcionMercaderiaPage currentUid={currentUid} currentUserName={currentUserName} />;
  }

  if (moduleKey === "stock" && pageKey === "traslados") {
    return <TrasladoMercaderiaPage currentUid={currentUid} currentUserName={currentUserName} />;
  }

  if (moduleKey === "stock" && pageKey === "movimientos") {
    return <MovimientoStockPage />;
  }

  if (moduleKey === "stock" && pageKey === "marcas") {
    return (
      <MaestroCRUD
        collectionName="marcas"
        title="Marcas"
        description="Maestro de marcas de producto. Se usa en la ficha de producto y en los informes por marca."
        fields={[{ name: "nombre", label: "Nombre", required: true }]}
      />
    );
  }

  if (moduleKey === "stock" && pageKey === "lineas") {
    return (
      <MaestroCRUD
        collectionName="lineas"
        title="Líneas"
        description="Maestro de líneas de producto (por ejemplo, dentro de una marca: línea femenina, masculina, infantil)."
        fields={[{ name: "nombre", label: "Nombre", required: true }]}
      />
    );
  }

  if (moduleKey === "stock" && pageKey === "categorias") {
    return (
      <MaestroCRUD
        collectionName="categorias"
        title="Categorías"
        description="Maestro de categorías de producto (por ejemplo: perfumería, cuidado corporal, cabello)."
        fields={[{ name: "nombre", label: "Nombre", required: true }]}
      />
    );
  }

  if (moduleKey === "stock" && pageKey === "depositos") {
    return (
      <MaestroCRUD
        collectionName="depositos"
        title="Depósitos"
        description="Ubicaciones físicas donde se guarda stock (casa central, sucursales, depósito externo, etc.)."
        fields={[
          { name: "nombre", label: "Nombre", required: true },
          { name: "direccion", label: "Dirección" },
        ]}
      />
    );
  }

  if (moduleKey === "stock" && pageKey === "productos") {
    return <ProductosPage empresaNombre={empresaNombre} logoDataUrl={logoDataUrl} />;
  }

  if (moduleKey === "seguridad" && pageKey === "usuarios") {
    return <UsuariosPage currentUid={currentUid} />;
  }

  if (moduleKey === "seguridad" && pageKey === "configuracion") {
    return <ConfiguracionPage />;
  }

  const pageDef = ALL_PAGE_LABELS.find((p) => p.moduleKey === moduleKey && p.key === pageKey);
  return (
    <ModuloEnConstruccion
      label={pageDef ? pageDef.label : moduleDef ? moduleDef.label : "Página"}
      moduleLabel={moduleDef ? moduleDef.label : ""}
    />
  );
}

/* ------------------------------------------------------------------ */
/* AppShell                                                             */
/* ------------------------------------------------------------------ */

function AppShell({ firebaseUser }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeModule, setActiveModule] = useState("inicio");
  const [activePage, setActivePage] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [userDocLoading, setUserDocLoading] = useState(true);
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [sucursalNombre, setSucursalNombre] = useState("");

  useEffect(() => {
    const unsub = db.collection("usuarios").doc(firebaseUser.uid).onSnapshot(
      (doc) => {
        setUserDoc(doc.exists ? doc.data() : null);
        setUserDocLoading(false);
      },
      () => setUserDocLoading(false)
    );
    return () => unsub();
  }, [firebaseUser.uid]);

  useEffect(() => {
    const unsub = db.collection("configuracion").doc("general").onSnapshot((doc) => {
      setEmpresaNombre(doc.exists ? (doc.data().empresaNombre || "") : "");
      setLogoDataUrl(doc.exists ? (doc.data().logoDataUrl || "") : "");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = db.collection("sucursales")
      .where("predeterminada", "==", true)
      .limit(1)
      .onSnapshot((snap) => {
        setSucursalNombre(snap.empty ? "" : snap.docs[0].data().nombre || "");
      });
    return () => unsub();
  }, []);

  const handleNavigate = useCallback((moduleKey, pageKey) => {
    setActiveModule(moduleKey);
    setActivePage(pageKey);
  }, []);

  const handleLogout = () => auth.signOut();

  if (userDocLoading) {
    return <div style={{ padding: 40 }}>Cargando perfil de usuario...</div>;
  }

  if (!userDoc) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-brand">Cuenta sin perfil</div>
          <div className="login-sub">
            Tu usuario de Firebase Authentication existe, pero no tiene un
            documento en la colección <code>usuarios</code>. Pedile al
            administrador que lo cree con tu UID: <code>{firebaseUser.uid}</code>.
          </div>
          <button className="btn btn-secondary" onClick={handleLogout} style={{ width: "100%" }}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const role = userDoc.rol;

  return (
    <div className={"shell" + (collapsed ? " collapsed" : "") + (mobileNavOpen ? " mobile-nav-open" : "")}>
      <div className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} />
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        activeModule={activeModule}
        activePage={activePage}
        onNavigate={handleNavigate}
        role={role}
        empresaNombre={empresaNombre}
        logoDataUrl={logoDataUrl}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div className="main-panel">
        <Topbar
          userDoc={userDoc}
          firebaseUser={firebaseUser}
          onLogout={handleLogout}
          empresaNombre={empresaNombre}
          sucursalNombre={sucursalNombre}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main className="content">
          <PageContent
            moduleKey={activeModule}
            pageKey={activePage}
            currentUid={firebaseUser.uid}
            currentUserName={userDoc?.nombre || firebaseUser.email}
            empresaNombre={empresaNombre}
            logoDataUrl={logoDataUrl}
          />
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Raíz de la aplicación                                                */
/* ------------------------------------------------------------------ */

function App() {
  const [firebaseUser, setFirebaseUser] = useState(undefined); // undefined = cargando

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => setFirebaseUser(user));
    return () => unsub();
  }, []);

  if (firebaseUser === undefined) {
    return <div style={{ padding: 40 }}>Cargando...</div>;
  }

  if (!firebaseUser) {
    return <LoginScreen />;
  }

  return <AppShell firebaseUser={firebaseUser} />;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
