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
      { key: "cuentas-cobrar", label: "Cuentas a cobrar" },
      { key: "pagos", label: "Pagos a proveedores" },
    ],
  },
  {
    key: "facturacion", label: "Facturación / POS", icon: "FA",
    children: [
      { key: "pos", label: "Punto de venta" },
      { key: "ventas", label: "Ventas" },
      { key: "clientes", label: "Clientes" },
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
/* Dashboard (Inicio) — datos reales en tiempo real                     */
/* ------------------------------------------------------------------ */

const UMBRAL_STOCK_BAJO = 5; // unidades; por debajo (o igual) se considera "stock bajo"

function Dashboard() {
  const [ventas, setVentas] = useState(null);       // null = cargando, false = sin permiso
  const [productos, setProductos] = useState(null);
  const [clientes, setClientes] = useState(null);
  const [porPagar, setPorPagar] = useState(null);

  const ahora = new Date();
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const inicio7 = new Date(inicioHoy); inicio7.setDate(inicio7.getDate() - 6);
  const desde = inicio7 < inicioMes ? inicio7 : inicioMes;

  useEffect(() => {
    const unsub = db.collection("ventas")
      .where("fecha", ">=", firebase.firestore.Timestamp.fromDate(desde))
      .orderBy("fecha", "desc")
      .onSnapshot(
        (snap) => setVentas(snap.docs.map((d) => d.data())),
        (err) => { console.warn("Dashboard ventas:", err.code); setVentas(false); }
      );
    return () => unsub();
  }, [desde.getTime()]);

  useEffect(() => {
    const u1 = db.collection("productos").onSnapshot(
      (snap) => setProductos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => { console.warn(err.code); setProductos(false); }
    );
    const u2 = db.collection("clientes").onSnapshot(
      (snap) => setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => { console.warn(err.code); setClientes(false); }
    );
    const u3 = db.collection("recepciones").where("condicion", "==", "credito").onSnapshot(
      (snap) => setPorPagar(snap.docs.map((d) => d.data()).filter((r) => (r.saldoPendiente || 0) > 0)),
      (err) => { console.warn(err.code); setPorPagar(false); }
    );
    return () => { u1(); u2(); u3(); };
  }, []);

  const fechaDe = (v) => (v.fecha && v.fecha.toDate ? v.fecha.toDate() : null);
  const validas = Array.isArray(ventas) ? ventas.filter((v) => v.estado === "emitida" && fechaDe(v)) : [];
  const delMes = validas.filter((v) => fechaDe(v) >= inicioMes);
  const deHoy = validas.filter((v) => fechaDe(v) >= inicioHoy);
  const suma = (arr) => arr.reduce((a, v) => a + (v.total || 0), 0);

  // Últimos 7 días
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d0 = new Date(inicioHoy); d0.setDate(d0.getDate() - i);
    const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
    const delDia = validas.filter((v) => fechaDe(v) >= d0 && fechaDe(v) < d1);
    dias.push({
      etiqueta: `${String(d0.getDate()).padStart(2, "0")}/${String(d0.getMonth() + 1).padStart(2, "0")}`,
      total: suma(delDia), cantidad: delDia.length,
    });
  }
  const maxDia = Math.max(...dias.map((d) => d.total), 1);

  // Top 5 productos del mes (por monto)
  const acum = {};
  delMes.forEach((v) => (v.items || []).forEach((it) => {
    const a = acum[it.productoId] || (acum[it.productoId] = { nombre: it.nombreProducto, cantidad: 0, monto: 0 });
    a.cantidad += it.cantidad; a.monto += it.subtotal;
  }));
  const top = Object.values(acum).sort((a, b) => b.monto - a.monto).slice(0, 5);

  // Stock bajo: solo productos que alguna vez tuvieron stock cargado
  const conStock = Array.isArray(productos) ? productos.filter((p) => p.activo !== false && typeof p.stockTotal === "number") : [];
  const bajos = conStock.filter((p) => p.stockTotal <= UMBRAL_STOCK_BAJO).sort((a, b) => a.stockTotal - b.stockTotal);
  const agotados = bajos.filter((p) => p.stockTotal <= 0).length;

  const deudores = Array.isArray(clientes) ? clientes.filter((c) => (c.saldoPendiente || 0) > 0) : [];
  const totalCobrar = deudores.reduce((a, c) => a + c.saldoPendiente, 0);

  const val = (dato, f) => (dato === null ? "..." : dato === false ? "—" : f());

  const kpis = [
    { label: "Ventas del día", value: val(ventas, () => formatoGs(suma(deHoy))), sub: val(ventas, () => `${deHoy.length} ventas`) },
    { label: "Ventas del mes", value: val(ventas, () => formatoGs(suma(delMes))), sub: val(ventas, () => `${delMes.length} ventas`) },
    { label: "Ticket promedio (mes)", value: val(ventas, () => formatoGs(delMes.length ? suma(delMes) / delMes.length : 0)), sub: "" },
    { label: "Productos con stock bajo", value: val(productos, () => String(bajos.length)), sub: val(productos, () => `${agotados} agotados · umbral ${UMBRAL_STOCK_BAJO} u.`) },
    { label: "Cuentas a cobrar", value: val(clientes, () => formatoGs(totalCobrar)), sub: val(clientes, () => `${deudores.length} clientes`) },
    {
      label: "Cuentas a pagar",
      value: val(porPagar, () => formatoGs(porPagar.reduce((a, r) => a + r.saldoPendiente, 0))),
      sub: val(porPagar, () => {
        const hoyIso = new Date().toISOString().slice(0, 10);
        const venc = porPagar.filter((r) => r.fechaVencimiento && r.fechaVencimiento < hoyIso).length;
        return `${porPagar.length} facturas${venc ? ` · ${venc} vencidas` : ""}`;
      }),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Inicio</h1>
          <p>Visión ejecutiva del negocio, en tiempo real. Las ventas anuladas no se cuentan.</p>
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi-card" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value small">{k.value}</div>
            {k.sub ? <div className="kpi-sub">{k.sub}</div> : null}
          </div>
        ))}
      </div>

      {ventas === false ? (
        <div className="card"><div className="card-body" style={{ fontSize: 13, color: "var(--color-text-soft)" }}>
          Tu rol no tiene acceso a las ventas, por eso esos indicadores no se muestran.
        </div></div>
      ) : (
        <div className="dash-grid">
          <div className="card">
            <div className="card-header"><h3>Ventas de los últimos 7 días</h3></div>
            <div className="card-body">
              <div className="dash-bars">
                {dias.map((d) => (
                  <div className="dash-bar-col" key={d.etiqueta} title={`${d.etiqueta}: ${formatoGs(d.total)} (${d.cantidad} ventas)`}>
                    <div className="dash-bar-valor">{d.total > 0 ? Math.round(d.total / 1000).toLocaleString("es-PY") + "k" : ""}</div>
                    <div className="dash-bar" style={{ height: Math.max((d.total / maxDia) * 100, d.total > 0 ? 4 : 0) + "px" }} />
                    <div className="dash-bar-etq">{d.etiqueta}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: "var(--color-text-soft)", margin: "8px 0 0" }}>Montos en miles de guaraníes.</p>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>Más vendidos del mes</h3></div>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Producto</th><th>Cant.</th><th>Monto</th></tr></thead>
                <tbody>
                  {ventas === null ? (
                    <tr><td colSpan={3}>Cargando...</td></tr>
                  ) : top.length === 0 ? (
                    <tr><td colSpan={3} style={{ color: "var(--color-text-soft)" }}>Todavía no hay ventas este mes.</td></tr>
                  ) : top.map((t) => (
                    <tr key={t.nombre}><td>{t.nombre}</td><td>{t.cantidad}</td><td>{formatoGs(t.monto)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><h3>Stock bajo o agotado</h3></div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Código</th><th>Producto</th><th>Stock total</th></tr></thead>
            <tbody>
              {productos === null ? (
                <tr><td colSpan={3}>Cargando...</td></tr>
              ) : bajos.length === 0 ? (
                <tr><td colSpan={3} style={{ color: "var(--color-text-soft)" }}>Ningún producto con stock cargado está por debajo del umbral.</td></tr>
              ) : bajos.slice(0, 10).map((p) => (
                <tr key={p.id}>
                  <td>{p.codigoInterno}</td><td>{p.nombre}</td>
                  <td>{p.stockTotal <= 0 ? <span className="oc-estado oc-anulada">Agotado</span> : p.stockTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bajos.length > 10 ? <div className="card-body" style={{ fontSize: 12, color: "var(--color-text-soft)" }}>Mostrando 10 de {bajos.length}.</div> : null}
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
    "IVA": tasaIvaDe(p) === 0 ? "Exenta" : tasaIvaDe(p) + "%",
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
    tasaIvaDe(p) === 0 ? "Exenta" : tasaIvaDe(p) + "%",
    p.stockTotal != null ? p.stockTotal : 0,
    p.activo ? "Activo" : "Inactivo",
  ]);

  doc.autoTable({
    startY: y + 22,
    head: [["Código", "Nombre / Descripción", "Cód. barra", "Marca", "Línea", "Categoría", "P. mayorista", "Cant. may.", "P. minorista", "IVA", "Stock", "Estado"]],
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
                <th>IVA</th>
                <th>Stock</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={14}>Cargando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={14} style={{ color: "var(--color-text-soft)" }}>
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
                  <td>{tasaIvaDe(p) === 0 ? "Exenta" : tasaIvaDe(p) + "%"}</td>
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
  const [tasaIva, setTasaIva] = useState(String(initial.tasaIva != null ? initial.tasaIva : 10));
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
      tasaIva: Number(tasaIva),
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
            <div className="field">
              <label>IVA</label>
              <select value={tasaIva} onChange={(e) => setTasaIva(e.target.value)}>
                <option value="10">10 %</option>
                <option value="5">5 %</option>
                <option value="0">Exenta</option>
              </select>
              <p style={{ fontSize: 11.5, color: "var(--color-text-faint)", margin: "4px 0 0" }}>
                Los precios de venta incluyen el IVA.
              </p>
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
  proveedorId, depositoId, numeroDocumento, observaciones, items, ordenCompraId, condicion, fechaVencimiento, usuarioId, usuarioNombre,
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
      condicion: condicion === "credito" ? "credito" : "contado",
      saldoPendiente: condicion === "credito" ? total : 0,
      fechaVencimiento: condicion === "credito" && fechaVencimiento ? fechaVencimiento : null,
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
  const [condicion, setCondicion] = useState("contado");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
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
        condicion, fechaVencimiento,
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
                <label>Condición de pago</label>
                <select value={condicion} onChange={(e) => setCondicion(e.target.value)}>
                  <option value="contado">Contado (ya pagado)</option>
                  <option value="credito">Crédito (queda a pagar)</option>
                </select>
              </div>
              {condicion === "credito" ? (
                <div className="field">
                  <label>Fecha de vencimiento (opcional)</label>
                  <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
                </div>
              ) : null}
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
                <th>Pago</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10}>Cargando...</td></tr>
              ) : recepciones.length === 0 ? (
                <tr><td colSpan={10} style={{ color: "var(--color-text-soft)" }}>
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
                  <td>{r.condicion === "credito" ? `Crédito (saldo ${formatoGs(r.saldoPendiente)})` : "Contado"}</td>
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
/* Facturación / POS · Punto de venta, Ventas y Clientes                */
/* El comprobante por ahora es un ticket interno (V-000001). La         */
/* factura electrónica SIFEN se activa después: el documento de venta   */
/* ya trae `fiscal: null` y `cajaId: null` reservados.                  */
/* ------------------------------------------------------------------ */

const METODOS_PAGO = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  credito: "Crédito (a cobrar)",
};

/** Tasa de IVA del producto (10 si todavía no se cargó). 0 = exenta. */
function tasaIvaDe(producto) {
  const t = producto && producto.tasaIva;
  return t === 0 || t === 5 || t === 10 ? t : 10;
}

/**
 * Liquidación del IVA de una venta. Los precios ya incluyen IVA.
 * El descuento se reparte proporcionalmente entre los ítems y el IVA se
 * calcula sobre el neto de cada tasa (10% -> neto/11, 5% -> neto/21).
 */
function calcularLiquidacionIva(items, descuento) {
  const subtotal = items.reduce((a, it) => a + (it.subtotal || 0), 0);
  const desc = Math.min(Math.max(Math.round(Number(descuento) || 0), 0), subtotal);
  let repartido = 0;
  const netoPorTasa = { 0: 0, 5: 0, 10: 0 };
  items.forEach((it, i) => {
    const tasa = it.ivaTasa === 0 || it.ivaTasa === 5 ? it.ivaTasa : 10;
    const parte = i === items.length - 1 ? desc - repartido : Math.floor(subtotal ? (desc * it.subtotal) / subtotal : 0);
    repartido += parte;
    netoPorTasa[tasa] += (it.subtotal || 0) - parte;
  });
  const iva10 = Math.round(netoPorTasa[10] / 11);
  const iva5 = Math.round(netoPorTasa[5] / 21);
  return {
    exenta: netoPorTasa[0],
    gravada5: netoPorTasa[5] - iva5,
    iva5,
    gravada10: netoPorTasa[10] - iva10,
    iva10,
    totalIva: iva5 + iva10,
  };
}

/** Precio unitario según cantidad: mayorista si llega al mínimo, si no minorista. */
function precioUnitarioPara(producto, cantidad) {
  const may = producto.precioMayorista;
  const min = producto.precioMinorista;
  if (producto.cantidadMayorista > 0 && may != null && cantidad >= producto.cantidadMayorista) {
    return { precio: Number(may), tipoPrecio: "mayorista" };
  }
  if (min != null) return { precio: Number(min), tipoPrecio: "minorista" };
  if (may != null) return { precio: Number(may), tipoPrecio: "mayorista" };
  return { precio: null, tipoPrecio: null };
}

async function registrarVenta({
  depositoId, clienteId, items, descuento, pagos, usuarioId, usuarioNombre,
}) {
  const ids = items.map((it) => it.productoId);
  if (new Set(ids).size !== ids.length) throw new Error("Hay un producto repetido en el carrito.");

  const contadorVentaRef = db.collection("contadores").doc("ventas");
  const contadorMovRef = db.collection("contadores").doc("movimientosStock");
  const ventaRef = db.collection("ventas").doc();
  const clienteRef = clienteId ? db.collection("clientes").doc(clienteId) : null;
  const productoRefs = items.map((it) => db.collection("productos").doc(it.productoId));
  let resultado = null;

  await db.runTransaction(async (tx) => {
    // Lecturas primero.
    const clienteDoc = clienteRef ? await tx.get(clienteRef) : null;
    const productoDocs = await Promise.all(productoRefs.map((ref) => tx.get(ref)));
    const contadorVentaDoc = await tx.get(contadorVentaRef);
    const contadorMovDoc = await tx.get(contadorMovRef);

    if (clienteRef && !clienteDoc.exists) throw new Error("El cliente ya no existe.");

    const siguienteVenta = (contadorVentaDoc.exists ? contadorVentaDoc.data().ultimo || 0 : 0) + 1;
    let siguienteMov = contadorMovDoc.exists ? contadorMovDoc.data().ultimo || 0 : 0;
    const codigoVenta = "V-" + String(siguienteVenta).padStart(6, "0");

    let subtotal = 0;
    const itemsGuardados = [];
    const updates = [];

    items.forEach((it, idx) => {
      const doc = productoDocs[idx];
      if (!doc.exists) throw new Error("Uno de los productos ya no existe.");
      const p = doc.data();
      if (p.activo === false) throw new Error(`"${p.nombre}" está inactivo.`);
      const { precio, tipoPrecio } = precioUnitarioPara(p, it.cantidad);
      if (precio == null) throw new Error(`"${p.nombre}" no tiene precio cargado.`);

      const stockPorDeposito = { ...(p.stockPorDeposito || {}) };
      const actual = stockPorDeposito[depositoId] || 0;
      if (actual < it.cantidad) {
        throw new Error(`Stock insuficiente de "${p.nombre}" (hay ${actual}, se pidió ${it.cantidad}).`);
      }
      stockPorDeposito[depositoId] = actual - it.cantidad;
      const stockTotal = Object.values(stockPorDeposito).reduce((a, b) => a + b, 0);

      const sub = precio * it.cantidad;
      subtotal += sub;
      itemsGuardados.push({
        productoId: it.productoId,
        codigoInterno: p.codigoInterno || null,
        nombreProducto: p.nombre,
        cantidad: it.cantidad,
        precioUnitario: precio,
        tipoPrecio,
        subtotal: sub,
        ivaTasa: tasaIvaDe(p),
      });
      updates.push({ ref: productoRefs[idx], stockPorDeposito, stockTotal, productoId: it.productoId, cantidad: it.cantidad });
    });

    const desc = Math.min(Math.max(Math.round(Number(descuento) || 0), 0), subtotal);
    const total = subtotal - desc;

    const pagosGuardados = pagos
      .filter((x) => Number(x.monto) > 0)
      .map((x) => ({ metodo: x.metodo, monto: Math.round(Number(x.monto)) }));
    const sumaPagos = pagosGuardados.reduce((a, x) => a + x.monto, 0);
    if (sumaPagos !== total) {
      throw new Error(`Los pagos (${sumaPagos.toLocaleString("es-PY")}) no coinciden con el total (${total.toLocaleString("es-PY")}).`);
    }
    const credito = pagosGuardados.filter((x) => x.metodo === "credito").reduce((a, x) => a + x.monto, 0);
    if (credito > 0 && !clienteRef) throw new Error("Una venta a crédito necesita un cliente (no puede ser consumidor final).");

    updates.forEach((u) => {
      tx.update(u.ref, {
        stockPorDeposito: u.stockPorDeposito,
        stockTotal: u.stockTotal,
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });
      siguienteMov += 1;
      tx.set(db.collection("movimientosStock").doc(), {
        codigoMovimiento: "M-" + String(siguienteMov).padStart(6, "0"),
        tipo: "egreso",
        productoId: u.productoId,
        depositoOrigenId: depositoId,
        depositoDestinoId: null,
        cantidad: u.cantidad,
        motivo: `Venta ${codigoVenta}`,
        ventaId: ventaRef.id,
        codigoVenta,
        usuarioId,
        usuarioNombre,
        fecha: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });

    if (clienteRef && credito > 0) {
      tx.update(clienteRef, {
        saldoPendiente: (clienteDoc.data().saldoPendiente || 0) + credito,
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    const cd = clienteDoc ? clienteDoc.data() : null;
    const venta = {
      codigoVenta,
      comprobante: { tipo: "ticket", numero: codigoVenta },
      fiscal: null,   // reservado: datos SIFEN (CDC, timbrado, etc.)
      cajaId: null,   // reservado: control de cajas
      depositoId,
      clienteId: clienteId || null,
      clienteNombre: cd ? cd.nombre : "Consumidor final",
      clienteDocumento: cd ? (cd.ruc || null) : null,
      items: itemsGuardados,
      totalItems: itemsGuardados.length,
      subtotal,
      descuento: desc,
      total,
      liquidacionIva: calcularLiquidacionIva(itemsGuardados, desc),
      pagos: pagosGuardados,
      condicion: credito > 0 ? "credito" : "contado",
      saldoPendiente: credito,
      estado: "emitida",
      usuarioId,
      usuarioNombre,
    };

    tx.set(contadorVentaRef, { ultimo: siguienteVenta }, { merge: true });
    tx.set(contadorMovRef, { ultimo: siguienteMov }, { merge: true });
    tx.set(ventaRef, { ...venta, fecha: firebase.firestore.FieldValue.serverTimestamp() });
    resultado = { id: ventaRef.id, ...venta, fecha: null };
  });

  return resultado;
}

/** Ticket de 80 mm en PDF (descarga directa). */
async function generarTicketPDF({ venta, empresaNombre, logoDataUrl, nombreDeposito }) {
  const { jsPDF } = window.jspdf;
  const W = 80;
  const margen = 4;
  const anchoUtil = W - margen * 2;
  const alto = 70 + venta.items.length * 10 + (venta.pagos || []).length * 5;
  const doc = new jsPDF({ unit: "mm", format: [W, alto] });
  let y = 6;

  if (logoDataUrl) {
    const dims = await obtenerDimensionesImagen(logoDataUrl);
    if (dims && dims.w > 0) {
      const ancho = 26;
      const h = ancho * (dims.h / dims.w);
      const fmt = /^data:image\/jpe?g/i.test(logoDataUrl) ? "JPEG" : "PNG";
      doc.addImage(logoDataUrl, fmt, (W - ancho) / 2, y, ancho, h);
      y += h + 3;
    }
  }

  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text(empresaNombre || "Ticket de venta", W / 2, y, { align: "center" });
  y += 5;
  doc.setFont(undefined, "normal");
  doc.setFontSize(8);
  doc.text(`Ticket ${venta.codigoVenta} (sin validez fiscal)`, W / 2, y, { align: "center" });
  y += 4;
  const fecha = venta.fecha && venta.fecha.toDate ? venta.fecha.toDate() : (venta.fechaLocal || new Date());
  doc.text(fecha.toLocaleString("es-PY"), W / 2, y, { align: "center" });
  y += 5;
  doc.text(`Cliente: ${venta.clienteNombre || "Consumidor final"}`, margen, y); y += 4;
  if (venta.clienteDocumento) { doc.text(`RUC/CI: ${venta.clienteDocumento}`, margen, y); y += 4; }
  if (nombreDeposito) { doc.text(`Depósito: ${nombreDeposito}`, margen, y); y += 4; }
  doc.text(`Atendió: ${venta.usuarioNombre || "—"}`, margen, y); y += 3;
  doc.line(margen, y, W - margen, y); y += 4;

  venta.items.forEach((it) => {
    const lineas = doc.splitTextToSize(it.nombreProducto, anchoUtil);
    doc.text(lineas, margen, y);
    y += lineas.length * 3.6;
    doc.text(`${it.cantidad} x ${Number(it.precioUnitario).toLocaleString("es-PY")}`, margen, y);
    doc.text(Number(it.subtotal).toLocaleString("es-PY"), W - margen, y, { align: "right" });
    y += 5;
  });

  doc.line(margen, y - 1, W - margen, y - 1); y += 3;
  if (venta.descuento > 0) {
    doc.text("Subtotal", margen, y); doc.text(Number(venta.subtotal).toLocaleString("es-PY"), W - margen, y, { align: "right" }); y += 4;
    doc.text("Descuento", margen, y); doc.text("-" + Number(venta.descuento).toLocaleString("es-PY"), W - margen, y, { align: "right" }); y += 4;
  }
  doc.setFont(undefined, "bold");
  doc.setFontSize(10);
  doc.text("TOTAL Gs.", margen, y);
  doc.text(Number(venta.total).toLocaleString("es-PY"), W - margen, y, { align: "right" });
  y += 5;
  {
    const liq = venta.liquidacionIva || calcularLiquidacionIva(venta.items, venta.descuento);
    doc.setFont(undefined, "normal");
    doc.setFontSize(7.5);
    const partes = [];
    if (liq.exenta > 0) partes.push(`Exentas: ${liq.exenta.toLocaleString("es-PY")}`);
    if (liq.iva5 > 0 || liq.gravada5 > 0) partes.push(`IVA 5%: ${liq.iva5.toLocaleString("es-PY")}`);
    if (liq.iva10 > 0 || liq.gravada10 > 0) partes.push(`IVA 10%: ${liq.iva10.toLocaleString("es-PY")}`);
    if (partes.length) { doc.text(partes.join("  ·  "), margen, y); y += 4; }
    y += 1;
  }
  doc.setFont(undefined, "normal");
  doc.setFontSize(8);
  (venta.pagos || []).forEach((p) => {
    doc.text(METODOS_PAGO[p.metodo] || p.metodo, margen, y);
    doc.text(Number(p.monto).toLocaleString("es-PY"), W - margen, y, { align: "right" });
    y += 4;
  });
  if (venta.saldoPendiente > 0) {
    doc.text(`Saldo a cobrar: Gs. ${Number(venta.saldoPendiente).toLocaleString("es-PY")}`, margen, y + 1);
    y += 5;
  }
  doc.setFontSize(8);
  doc.text("¡Gracias por su compra!", W / 2, y + 4, { align: "center" });
  doc.save(`ticket-${venta.codigoVenta}.pdf`);
}

/* ------------------------------------------------------------------ */
/* Comprobante de venta A4 (documento interno, sin validez fiscal)      */
/* Orden de campos inspirado en el KuDE: encabezado de empresa,         */
/* datos del cliente, detalle, totales y pie. Cuando se active SIFEN    */
/* este documento se reemplaza por la factura electrónica.              */
/* ------------------------------------------------------------------ */

const _UN = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const _DEC = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const _CEN = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function _menorMil(n) {
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const r = n % 100;
  let s = _CEN[c];
  if (r > 0) {
    if (s) s += " ";
    if (r < 30) s += _UN[r];
    else s += _DEC[Math.floor(r / 10)] + (r % 10 ? " y " + _UN[r % 10] : "");
  }
  return s;
}
const _apocope = (t) => t.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un");

/** 1234567 -> "un millón doscientos treinta y cuatro mil quinientos sesenta y siete" */
function numeroALetras(valor) {
  const n = Math.floor(Math.abs(Number(valor) || 0));
  if (n === 0) return "cero";
  const mill = Math.floor(n / 1000000);
  const mil = Math.floor((n % 1000000) / 1000);
  const resto = n % 1000;
  const partes = [];
  if (mill) partes.push(mill === 1 ? "un millón" : _apocope(numeroALetras(mill)) + " millones");
  if (mil) partes.push(mil === 1 ? "mil" : _apocope(_menorMil(mil)) + " mil");
  if (resto) partes.push(_menorMil(resto));
  return partes.join(" ");
}

async function generarComprobanteA4PDF({ venta, nombreDeposito }) {
  // Datos de la empresa, sucursal predeterminada y cliente (se leen al momento de imprimir).
  let empresa = {};
  let sucursal = {};
  let cliente = {};
  try {
    const cfg = await db.collection("configuracion").doc("general").get();
    if (cfg.exists) empresa = cfg.data();
  } catch (e) { console.warn(e); }
  try {
    const sn = await db.collection("sucursales").get();
    const lista = sn.docs.map((d) => d.data()).filter((s) => s.activo !== false);
    sucursal = lista.find((s) => s.predeterminada) || lista[0] || {};
  } catch (e) { console.warn(e); }
  if (venta.clienteId) {
    try {
      const cd = await db.collection("clientes").doc(venta.clienteId).get();
      if (cd.exists) cliente = cd.data();
    } catch (e) { console.warn(e); }
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 10;          // margen izquierdo
  const R = 200;         // borde derecho
  const ANCHO = R - L;
  const PIE_Y = 287;     // límite inferior del contenido
  const nf = (v) => Number(v || 0).toLocaleString("es-PY");
  const logoDataUrl = empresa.logoDataUrl || "";
  // Ancho de la etiqueta en negrita (se mide en la misma fuente en que se dibuja).
  const wEtq = (etq) => { doc.setFont(undefined, "bold"); return doc.getTextWidth(etq) + 2; };

  doc.setLineWidth(0.3);
  doc.setDrawColor(0);

  // --- Franja superior
  doc.rect(L, 10, ANCHO, 6);
  doc.setFont(undefined, "bold");
  doc.setFontSize(8.5);
  doc.text("COMPROBANTE DE VENTA — DOCUMENTO INTERNO SIN VALIDEZ FISCAL", (L + R) / 2, 14.2, { align: "center" });

  // --- Bloque empresa (izq) y número (der)
  const yEmp = 16;
  const altoEmp = 42;
  const xDiv = 135;
  doc.rect(L, yEmp, ANCHO, altoEmp);
  doc.line(xDiv, yEmp, xDiv, yEmp + altoEmp);

  let y = yEmp + 4;
  if (logoDataUrl) {
    const dims = await obtenerDimensionesImagen(logoDataUrl);
    if (dims && dims.w > 0) {
      let w = 38;
      let h = w * (dims.h / dims.w);
      if (h > 18) { h = 18; w = h * (dims.w / dims.h); }
      const fmt = /^data:image\/jpe?g/i.test(logoDataUrl) ? "JPEG" : "PNG";
      doc.addImage(logoDataUrl, fmt, L + 3, y, w, h);
      y += h + 3;
    }
  }
  doc.setFont(undefined, "bold");
  doc.setFontSize(10);
  doc.text(empresa.empresaNombre || "", L + 3, y + 1);
  y += 5;
  doc.setFontSize(8);
  const lineaEmpresa = (etq, val) => {
    if (!val) return;
    const t = doc.splitTextToSize(val, xDiv - L - 8 - wEtq(etq));
    doc.setFont(undefined, "bold"); doc.text(etq, L + 3, y);
    doc.setFont(undefined, "normal"); doc.text(t, L + 3 + wEtq(etq), y);
    y += 3.6 * t.length;
  };
  lineaEmpresa("Dirección:", sucursal.direccion || empresa.empresaDireccion);
  lineaEmpresa("Ciudad:", empresa.empresaCiudad);
  lineaEmpresa("Teléfono:", empresa.empresaTelefono);
  lineaEmpresa("Correo Electrónico:", empresa.empresaEmail);

  // Derecha: RUC, tipo de documento y número
  let yd = yEmp + 6;
  doc.setFontSize(8.5);
  if (empresa.empresaRuc) {
    doc.setFont(undefined, "bold"); doc.text("RUC:", xDiv + 4, yd);
    doc.setFont(undefined, "normal"); doc.text(String(empresa.empresaRuc), xDiv + 14, yd);
  }
  doc.setFont(undefined, "bold");
  doc.setFontSize(12);
  doc.text("COMPROBANTE", xDiv + 4, yEmp + 24);
  doc.text("DE VENTA", xDiv + 4, yEmp + 30);
  doc.text(venta.codigoVenta, xDiv + 4, yEmp + 37);

  // --- Bloque cliente (izq) y condiciones (der)
  const yCli = yEmp + altoEmp + 1.5;
  const altoCli = 27;
  doc.rect(L, yCli, ANCHO, altoCli);
  doc.line(xDiv, yCli, xDiv, yCli + altoCli);
  doc.setFontSize(8);
  let yc = yCli + 5;
  const lineaCli = (etq, val) => {
    if (!val) return;
    const t = doc.splitTextToSize(String(val), xDiv - L - 8 - wEtq(etq));
    doc.setFont(undefined, "bold"); doc.text(etq, L + 3, yc);
    doc.setFont(undefined, "normal"); doc.text(t[0], L + 3 + wEtq(etq), yc);
    yc += 4;
  };
  lineaCli("RUC / C.I.:", venta.clienteDocumento || cliente.ruc || "Sin identificar");
  lineaCli("Nombre o Razón Social:", venta.clienteNombre || "Consumidor final");
  lineaCli("Dirección:", cliente.direccion);
  lineaCli("Teléfono:", cliente.telefono);
  lineaCli("Correo Electrónico:", cliente.email);

  const fecha = venta.fecha && venta.fecha.toDate ? venta.fecha.toDate() : (venta.fechaLocal || new Date());
  let yr = yCli + 5;
  const lineaDer = (etq, val) => {
    doc.setFont(undefined, "bold"); doc.text(etq, xDiv + 4, yr);
    doc.setFont(undefined, "normal"); doc.text(String(val), xDiv + 4 + wEtq(etq), yr);
    yr += 4;
  };
  const p2 = (x) => String(x).padStart(2, "0");
  lineaDer("Fecha de Emisión:", `${p2(fecha.getDate())}/${p2(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${p2(fecha.getHours())}:${p2(fecha.getMinutes())}:${p2(fecha.getSeconds())}`);
  lineaDer("Condición de Venta:", venta.condicion === "credito" ? "Crédito" : "Contado");
  lineaDer("Moneda:", "Guaraníes (PYG)");
  if (nombreDeposito) lineaDer("Depósito:", nombreDeposito);

  // --- Detalle
  const columnas = [
    [
      { content: "Código", rowSpan: 2 },
      { content: "Descripción", rowSpan: 2 },
      { content: "Unidad de medida", rowSpan: 2 },
      { content: "Cantidad", rowSpan: 2 },
      { content: "Precio Unitario", rowSpan: 2 },
      { content: "Valor de Venta", colSpan: 3 },
    ],
    ["Exentas", "5%", "10%"],
  ];
  const tasaDe = (it) => (it.ivaTasa === 0 || it.ivaTasa === 5 ? it.ivaTasa : 10);
  const colsTasa = { 0: 0, 5: 0, 10: 0 };
  const filas = (venta.items || []).map((it) => {
    const t = tasaDe(it);
    colsTasa[t] += it.subtotal || 0;
    return [
      it.codigoInterno || "",
      it.nombreProducto || "",
      "UNI",
      nf(it.cantidad),
      nf(it.precioUnitario),
      t === 0 ? nf(it.subtotal) : "0",
      t === 5 ? nf(it.subtotal) : "0",
      t === 10 ? nf(it.subtotal) : "0",
    ];
  });
  const liq = venta.liquidacionIva || calcularLiquidacionIva(venta.items || [], venta.descuento);
  const altoTotales = 52;
  doc.autoTable({
    startY: yCli + altoCli + 1.5,
    head: columnas,
    body: filas,
    theme: "grid",
    margin: { left: L, right: 210 - R, bottom: 297 - PIE_Y + altoTotales + 2 },
    styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: 0, valign: "middle" },
    headStyles: { fillColor: [235, 235, 235], textColor: 0, halign: "center", fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 19 },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 14, halign: "right" },
      4: { cellWidth: 21, halign: "right" },
      5: { cellWidth: 21, halign: "right" },
      6: { cellWidth: 21, halign: "right" },
      7: { cellWidth: 21, halign: "right" },
    },
  });

  // --- Totales (siempre al pie de la última página)
  let yT = PIE_Y - altoTotales;
  if (doc.lastAutoTable.finalY + 3 > yT) {
    doc.addPage();
    yT = PIE_Y - altoTotales;
  }
  doc.rect(L, yT, ANCHO, altoTotales);
  const xTot = 105;
  doc.line(xTot, yT, xTot, yT + altoTotales - 9);

  // Izquierda: forma de pago
  doc.setFontSize(8);
  let yp = yT + 5;
  doc.setFont(undefined, "bold");
  doc.text("FORMA DE PAGO", L + 3, yp);
  doc.setFont(undefined, "normal");
  yp += 4.5;
  (venta.pagos || []).forEach((p) => {
    doc.text(METODOS_PAGO[p.metodo] || p.metodo, L + 3, yp);
    doc.text(nf(p.monto), xTot - 4, yp, { align: "right" });
    yp += 4;
  });
  if (venta.saldoPendiente > 0) {
    doc.setFont(undefined, "bold");
    doc.text("SALDO A COBRAR", L + 3, yp + 1);
    doc.text(nf(venta.saldoPendiente), xTot - 4, yp + 1, { align: "right" });
  }

  // Derecha: subtotal / descuento / total / en letras
  const fila = (etq, val, yy, negrita) => {
    doc.setFont(undefined, negrita ? "bold" : "normal");
    doc.text(etq, xTot + 3, yy);
    doc.text(val, R - 3, yy, { align: "right" });
  };
  fila("SUBTOTAL:", nf(venta.subtotal != null ? venta.subtotal : venta.total), yT + 6, true);
  fila("DESCUENTO:", nf(venta.descuento || 0), yT + 12, true);
  doc.line(xTot, yT + 15, R, yT + 15);
  doc.setFontSize(10);
  fila("TOTAL DE LA OPERACIÓN:", nf(venta.total), yT + 21, true);
  doc.setFontSize(8);
  doc.line(xTot, yT + 24, R, yT + 24);
  doc.setFont(undefined, "bold");
  doc.text("TOTAL EN LETRAS:", xTot + 3, yT + 29);
  doc.setFont(undefined, "normal");
  const letras = "Guaraníes " + numeroALetras(venta.total) + ".";
  doc.text(doc.splitTextToSize(letras.charAt(0).toUpperCase() + letras.slice(1), R - xTot - 6), xTot + 3, yT + 33);

  // Liquidación del IVA (franja inferior del cuadro de totales)
  const yIva = yT + altoTotales - 9;
  doc.line(L, yIva, R, yIva);
  doc.setFont(undefined, "bold");
  doc.text("SUBTOTAL (valor de venta):", L + 3, yIva + 4);
  doc.setFont(undefined, "normal");
  doc.text(`Exentas ${nf(colsTasa[0])}   ·   5% ${nf(colsTasa[5])}   ·   10% ${nf(colsTasa[10])}`, L + 50, yIva + 4);
  doc.setFont(undefined, "bold");
  doc.text("LIQUIDACIÓN DEL IVA:", L + 3, yIva + 7.8);
  doc.setFont(undefined, "normal");
  doc.text(`(5%) ${nf(liq.iva5)}   ·   (10%) ${nf(liq.iva10)}`, L + 50, yIva + 7.8);
  doc.setFont(undefined, "bold");
  doc.text(`TOTAL IVA: ${nf(liq.totalIva)}`, R - 3, yIva + 7.8, { align: "right" });

  // --- Leyenda y pie en todas las páginas
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    if (venta.estado === "anulada") {
      doc.setTextColor(200, 40, 40);
      doc.setFont(undefined, "bold");
      doc.setFontSize(70);
      doc.text("ANULADO", 105, 160, { align: "center", angle: 35 });
      doc.setTextColor(0);
    }
    doc.setFontSize(7.5);
    doc.setFont(undefined, "normal");
    doc.text("Documento interno de control de ventas. No reemplaza a la factura; no tiene validez fiscal.", L, 291);
    doc.text(`Atendió: ${venta.usuarioNombre || "—"}`, L, 295);
    doc.text(`Página ${i} de ${total}`, R, 295, { align: "right" });
  }

  doc.save(`comprobante-${venta.codigoVenta}.pdf`);
}

function PosBuscador({ productos, depositoId, onAgregar }) {
  const [q, setQ] = useState("");
  const texto = q.trim().toLowerCase();

  const coincide = (p) =>
    (p.nombre || "").toLowerCase().includes(texto) ||
    (p.codigoInterno || "").toLowerCase().includes(texto) ||
    (p.codigoBarraPrincipal || "").toLowerCase().includes(texto) ||
    (p.codigosBarraAdicionales || []).some((c) => String(c).toLowerCase().includes(texto));

  const resultados = texto
    ? productos.filter((p) => p.activo !== false && coincide(p)).slice(0, 8)
    : [];
  const stockEn = (p) => (p.stockPorDeposito || {})[depositoId] || 0;

  const agregar = (p) => { onAgregar(p); setQ(""); };

  const onKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!texto) return;
    // Código de barra / interno exacto (lector de código de barras): se agrega directo.
    const exacto = productos.find((p) =>
      p.activo !== false && (
        (p.codigoBarraPrincipal || "").toLowerCase() === texto ||
        (p.codigoInterno || "").toLowerCase() === texto ||
        (p.codigosBarraAdicionales || []).some((c) => String(c).toLowerCase() === texto)
      )
    );
    if (exacto) return agregar(exacto);
    if (resultados.length === 1) agregar(resultados[0]);
  };

  return (
    <div>
      <input
        autoFocus
        placeholder="Buscar por nombre, código o escanear código de barra..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {texto ? (
        <div className="pos-resultados">
          {resultados.length === 0 ? (
            <div className="pos-resultado-vacio">Sin resultados.</div>
          ) : resultados.map((p) => {
            const st = stockEn(p);
            const { precio } = precioUnitarioPara(p, 1);
            return (
              <button type="button" key={p.id} className="pos-resultado" disabled={st <= 0} onClick={() => agregar(p)}>
                <span>
                  <strong>{p.nombre}</strong>
                  <small>{p.codigoInterno}{p.codigoBarraPrincipal ? ` · ${p.codigoBarraPrincipal}` : ""}</small>
                </span>
                <span style={{ textAlign: "right" }}>
                  <strong>{precio != null ? formatoGs(precio) : "Sin precio"}</strong>
                  <small>Stock: {st}</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PuntoVentaPage({ currentUid, currentUserName, role, empresaNombre, logoDataUrl }) {
  const productos = useColeccionSimple("productos");
  const depositos = useColeccionSimple("depositos");
  const clientes = useColeccionSimple("clientes");

  const [depositoId, setDepositoId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [carrito, setCarrito] = useState([]); // [{productoId, cantidad}]
  const [descuento, setDescuento] = useState("");
  const [pagos, setPagos] = useState([{ metodo: "efectivo", monto: "" }]);
  const [recibido, setRecibido] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [ultimaVenta, setUltimaVenta] = useState(null);

  const puedeDescuento = hasActionAccess(role, "pos.descuento");
  const depositosActivos = depositos.filter((d) => d.activo !== false);

  useEffect(() => {
    if (!depositoId && depositosActivos.length > 0) setDepositoId(depositosActivos[0].id);
  }, [depositosActivos.length]);

  const prod = (id) => productos.find((p) => p.id === id);
  const stockEn = (p) => (p ? (p.stockPorDeposito || {})[depositoId] || 0 : 0);

  const lineas = carrito.map((it) => {
    const p = prod(it.productoId);
    const cant = Number(it.cantidad) || 0;
    const { precio, tipoPrecio } = p ? precioUnitarioPara(p, cant) : { precio: null, tipoPrecio: null };
    return { ...it, p, cant, precio, tipoPrecio, sub: (precio || 0) * cant };
  });
  const subtotal = lineas.reduce((a, l) => a + l.sub, 0);
  const desc = Math.min(Math.max(Math.round(Number(descuento) || 0), 0), subtotal);
  const total = subtotal - desc;

  // Con un único pago sin monto, se asume que paga el total.
  const pagosEfectivos = pagos.length === 1 && pagos[0].monto === ""
    ? [{ ...pagos[0], monto: total }]
    : pagos.map((x) => ({ ...x, monto: Number(x.monto) || 0 }));
  const sumaPagos = pagosEfectivos.reduce((a, x) => a + (Number(x.monto) || 0), 0);
  const restante = total - sumaPagos;
  const soloEfectivo = pagosEfectivos.length === 1 && pagosEfectivos[0].metodo === "efectivo";
  const vuelto = soloEfectivo && recibido !== "" ? Number(recibido) - total : null;

  const agregarProducto = (p) => {
    setError("");
    setCarrito((arr) => {
      const i = arr.findIndex((x) => x.productoId === p.id);
      if (i >= 0) return arr.map((x, idx) => (idx === i ? { ...x, cantidad: Number(x.cantidad) + 1 } : x));
      return [...arr, { productoId: p.id, cantidad: 1 }];
    });
  };
  const cambiarCantidad = (i, v) => setCarrito((arr) => arr.map((x, idx) => (idx === i ? { ...x, cantidad: v } : x)));
  const quitar = (i) => setCarrito((arr) => arr.filter((_, idx) => idx !== i));
  const cambiarPago = (i, campo, v) => setPagos((arr) => arr.map((x, idx) => (idx === i ? { ...x, [campo]: v } : x)));

  const nuevaVenta = () => {
    setCarrito([]); setDescuento(""); setPagos([{ metodo: "efectivo", monto: "" }]);
    setRecibido(""); setClienteId(""); setError(""); setUltimaVenta(null);
  };

  const confirmar = async () => {
    setError("");
    if (!depositoId) return setError("Elegí el depósito desde donde se vende.");
    if (carrito.length === 0) return setError("El carrito está vacío.");
    for (const l of lineas) {
      if (!(l.cant > 0) || !Number.isInteger(l.cant)) return setError(`Cantidad inválida en "${l.p ? l.p.nombre : "producto"}".`);
      if (l.precio == null) return setError(`"${l.p.nombre}" no tiene precio cargado.`);
      if (l.cant > stockEn(l.p)) return setError(`Stock insuficiente de "${l.p.nombre}" (hay ${stockEn(l.p)}).`);
    }
    if (restante !== 0) return setError(`Los pagos no coinciden con el total (${restante > 0 ? "faltan" : "sobran"} ${formatoGs(Math.abs(restante))}).`);
    if (pagosEfectivos.some((x) => x.metodo === "credito" && x.monto > 0) && !clienteId) {
      return setError("Para vender a crédito elegí un cliente.");
    }
    setSaving(true);
    try {
      const venta = await registrarVenta({
        depositoId,
        clienteId: clienteId || null,
        items: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cant })),
        descuento: desc,
        pagos: pagosEfectivos,
        usuarioId: currentUid,
        usuarioNombre: currentUserName,
      });
      setUltimaVenta({ ...venta, fechaLocal: new Date() });
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo registrar la venta.");
    } finally {
      setSaving(false);
    }
  };

  const nombreDeposito = (id) => (depositos.find((d) => d.id === id) || {}).nombre || "";

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Punto de venta</h1>
          <p>Escaneá o buscá productos, cobrá y descontá stock del depósito. Comprobante: ticket interno.</p>
        </div>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="pos-grid">
        <div>
          <div className="card">
            <div className="card-body">
              <div className="form-grid-2" style={{ marginBottom: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Depósito (de dónde sale la mercadería)</label>
                  <select value={depositoId} onChange={(e) => { setDepositoId(e.target.value); setCarrito([]); }}>
                    {depositosActivos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Cliente</label>
                  <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                    <option value="">Consumidor final</option>
                    {clientes.filter((c) => c.activo !== false).map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}{c.ruc ? ` · ${c.ruc}` : ""}</option>
                    ))}
                  </select>
                </div>
              </div>
              <PosBuscador productos={productos} depositoId={depositoId} onAgregar={agregarProducto} />
            </div>
          </div>

          <div className="card">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>Producto</th><th style={{ width: 90 }}>Cant.</th><th>Precio</th><th>Subtotal</th><th></th></tr>
                </thead>
                <tbody>
                  {lineas.length === 0 ? (
                    <tr><td colSpan={5} style={{ color: "var(--color-text-soft)" }}>El carrito está vacío.</td></tr>
                  ) : lineas.map((l, i) => (
                    <tr key={l.productoId}>
                      <td>
                        {l.p ? l.p.nombre : "(producto eliminado)"}
                        <div style={{ fontSize: 11.5, color: "var(--color-text-soft)" }}>
                          Stock: {stockEn(l.p)}{l.tipoPrecio === "mayorista" ? " · precio mayorista" : ""}
                        </div>
                      </td>
                      <td>
                        <input type="number" min="1" step="1" value={l.cantidad}
                          onChange={(e) => cambiarCantidad(i, e.target.value)} style={{ width: 80 }} />
                      </td>
                      <td>{l.precio != null ? formatoGs(l.precio) : "Sin precio"}</td>
                      <td>{formatoGs(l.sub)}</td>
                      <td><button type="button" className="icon-btn" onClick={() => quitar(i)}>Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-body">
              <div className="pos-fila"><span>Subtotal</span><strong>{formatoGs(subtotal)}</strong></div>
              {puedeDescuento ? (
                <div className="field" style={{ margin: "8px 0" }}>
                  <label>Descuento (Gs.)</label>
                  <input type="number" min="0" step="1" value={descuento} onChange={(e) => setDescuento(e.target.value)} />
                </div>
              ) : null}
              <div className="pos-total"><span>TOTAL</span><strong>{formatoGs(total)}</strong></div>

              <h4 style={{ margin: "16px 0 8px" }}>Pagos</h4>
              {pagos.map((x, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <select value={x.metodo} onChange={(e) => cambiarPago(i, "metodo", e.target.value)} style={{ flex: 1 }}>
                    {Object.entries(METODOS_PAGO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input type="number" min="0" step="1" style={{ width: 120 }}
                    placeholder={pagos.length === 1 ? String(total) : "Monto"}
                    value={x.monto} onChange={(e) => cambiarPago(i, "monto", e.target.value)} />
                  {pagos.length > 1 ? (
                    <button type="button" className="icon-btn" onClick={() => setPagos((arr) => arr.filter((_, idx) => idx !== i))}>×</button>
                  ) : null}
                </div>
              ))}
              <button type="button" className="btn btn-secondary" style={{ width: "auto" }}
                onClick={() => setPagos((arr) => [...(arr.length === 1 && arr[0].monto === "" ? [{ ...arr[0], monto: String(total) }] : arr), { metodo: "efectivo", monto: "" }])}>
                + Dividir pago
              </button>
              {pagos.length > 1 ? (
                <p style={{ fontSize: 12.5, margin: "8px 0 0", color: restante === 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                  {restante === 0 ? "Pagos completos." : restante > 0 ? `Falta cobrar ${formatoGs(restante)}` : `Sobran ${formatoGs(-restante)}`}
                </p>
              ) : null}

              {soloEfectivo ? (
                <div className="field" style={{ marginTop: 12 }}>
                  <label>Efectivo recibido (opcional, para calcular vuelto)</label>
                  <input type="number" min="0" step="1" value={recibido} onChange={(e) => setRecibido(e.target.value)} />
                  {vuelto != null ? (
                    <p style={{ margin: "6px 0 0", fontWeight: 600, color: vuelto >= 0 ? "inherit" : "var(--color-danger)" }}>
                      {vuelto >= 0 ? `Vuelto: ${formatoGs(vuelto)}` : `Faltan ${formatoGs(-vuelto)}`}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} disabled={saving || carrito.length === 0} onClick={confirmar}>
                {saving ? "Registrando..." : `Cobrar ${formatoGs(total)}`}
              </button>
              <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={nuevaVenta}>Vaciar / nueva venta</button>
            </div>
          </div>
        </div>
      </div>

      {ultimaVenta ? (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header"><h3>Venta registrada</h3></div>
            <div className="modal-body">
              <p style={{ marginTop: 0 }}>
                <strong>{ultimaVenta.codigoVenta}</strong> · {formatoGs(ultimaVenta.total)}
                {ultimaVenta.condicion === "credito" ? " · queda saldo a cobrar" : ""}
              </p>
              {vuelto != null && vuelto >= 0 && soloEfectivo ? <p>Vuelto: <strong>{formatoGs(vuelto)}</strong></p> : null}
              <p style={{ fontSize: 12.5, color: "var(--color-text-soft)" }}>El stock ya se descontó.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" style={{ width: "auto" }}
                onClick={() => generarTicketPDF({ venta: ultimaVenta, empresaNombre, logoDataUrl, nombreDeposito: nombreDeposito(ultimaVenta.depositoId) })}>
                Ticket 80 mm
              </button>
              <button type="button" className="btn btn-secondary" style={{ width: "auto" }}
                onClick={() => generarComprobanteA4PDF({ venta: ultimaVenta, nombreDeposito: nombreDeposito(ultimaVenta.depositoId) })}>
                Comprobante A4
              </button>
              <button type="button" className="btn btn-primary" style={{ width: "auto" }} onClick={nuevaVenta}>Nueva venta</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Anula una venta: devuelve el stock al depósito, descuenta el crédito del cliente y la marca "anulada". */
async function anularVenta({ ventaId, motivo, usuarioId, usuarioNombre }) {
  const ventaRef = db.collection("ventas").doc(ventaId);
  const contadorMovRef = db.collection("contadores").doc("movimientosStock");

  await db.runTransaction(async (tx) => {
    const ventaDoc = await tx.get(ventaRef);
    if (!ventaDoc.exists) throw new Error("La venta ya no existe.");
    const v = ventaDoc.data();
    if (v.estado !== "emitida") throw new Error("Esta venta ya está anulada.");

    const productoRefs = (v.items || []).map((it) => db.collection("productos").doc(it.productoId));
    const productoDocs = await Promise.all(productoRefs.map((ref) => tx.get(ref)));
    const clienteRef = v.clienteId && v.saldoPendiente > 0 ? db.collection("clientes").doc(v.clienteId) : null;
    const clienteDoc = clienteRef ? await tx.get(clienteRef) : null;
    const contadorMovDoc = await tx.get(contadorMovRef);

    let siguienteMov = contadorMovDoc.exists ? contadorMovDoc.data().ultimo || 0 : 0;

    (v.items || []).forEach((it, idx) => {
      const pd = productoDocs[idx];
      if (!pd.exists) return; // producto eliminado: no hay stock que reponer
      const stockPorDeposito = { ...(pd.data().stockPorDeposito || {}) };
      stockPorDeposito[v.depositoId] = (stockPorDeposito[v.depositoId] || 0) + it.cantidad;
      const stockTotal = Object.values(stockPorDeposito).reduce((a, b) => a + b, 0);
      tx.update(productoRefs[idx], {
        stockPorDeposito,
        stockTotal,
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });
      siguienteMov += 1;
      tx.set(db.collection("movimientosStock").doc(), {
        codigoMovimiento: "M-" + String(siguienteMov).padStart(6, "0"),
        tipo: "ingreso",
        productoId: it.productoId,
        depositoOrigenId: null,
        depositoDestinoId: v.depositoId,
        cantidad: it.cantidad,
        motivo: `Anulación de venta ${v.codigoVenta}`,
        ventaId,
        codigoVenta: v.codigoVenta,
        usuarioId,
        usuarioNombre,
        fecha: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });

    if (clienteRef && clienteDoc.exists) {
      tx.update(clienteRef, {
        saldoPendiente: Math.max((clienteDoc.data().saldoPendiente || 0) - v.saldoPendiente, 0),
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    tx.set(contadorMovRef, { ultimo: siguienteMov }, { merge: true });
    const creditoOriginal = (v.pagos || []).filter((p) => p.metodo === "credito").reduce((a, p) => a + p.monto, 0);
    const cobradoAlAnular = Math.max(creditoOriginal - (v.saldoPendiente || 0), 0);
    tx.update(ventaRef, {
      estado: "anulada",
      saldoPendiente: 0,
      cobradoAlAnular,
      motivoAnulacion: motivo,
      anuladaPorId: usuarioId,
      anuladaPorNombre: usuarioNombre,
      anuladaEn: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
}

function VentasPage({ empresaNombre, logoDataUrl, role, currentUid, currentUserName }) {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [verDetalle, setVerDetalle] = useState(null);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorAnular, setErrorAnular] = useState("");
  const [savingAnular, setSavingAnular] = useState(false);
  const [toast, setToast] = useState("");
  const depositos = useColeccionSimple("depositos");

  useEffect(() => {
    const unsub = db.collection("ventas").orderBy("fecha", "desc").limit(200).onSnapshot(
      (snap) => { setVentas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  const nombreDeposito = (id) => (depositos.find((d) => d.id === id) || {}).nombre || "—";
  const visibles = !filtro ? ventas
    : filtro === "anulada" ? ventas.filter((v) => v.estado === "anulada")
    : ventas.filter((v) => v.condicion === filtro && v.estado !== "anulada");
  const totalVisible = visibles.reduce((a, v) => a + (v.estado === "anulada" ? 0 : (v.total || 0)), 0);

  const cerrarDetalle = () => { setVerDetalle(null); setAnulando(false); setMotivo(""); setErrorAnular(""); };

  const confirmarAnulacion = async () => {
    setErrorAnular("");
    if (motivo.trim().length < 3) return setErrorAnular("Escribí el motivo de la anulación.");
    setSavingAnular(true);
    try {
      await anularVenta({ ventaId: verDetalle.id, motivo: motivo.trim(), usuarioId: currentUid, usuarioNombre: currentUserName });
      cerrarDetalle();
      setToast("Venta anulada. El stock volvió al depósito.");
      setTimeout(() => setToast(""), 3500);
    } catch (err) {
      console.error(err);
      setErrorAnular(err.message || "No se pudo anular la venta.");
    } finally {
      setSavingAnular(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ventas</h1>
          <p>Historial de ventas emitidas (últimas 200). Cada venta es inmutable; una devolución se registrará como operación aparte.</p>
        </div>
      </div>
      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Condición</label>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="">Todas</option>
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
              <option value="anulada">Anuladas</option>
            </select>
          </div>
          <p style={{ marginBottom: 16, fontWeight: 600 }}>{visibles.length} ventas · {formatoGs(totalVisible)}</p>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Venta</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Condición</th><th>Usuario</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}>Cargando...</td></tr>
              ) : visibles.length === 0 ? (
                <tr><td colSpan={7} style={{ color: "var(--color-text-soft)" }}>Todavía no hay ventas.</td></tr>
              ) : visibles.map((v) => (
                <tr key={v.id}>
                  <td>{v.codigoVenta}</td>
                  <td>{v.fecha && v.fecha.toDate ? v.fecha.toDate().toLocaleString("es-PY") : "—"}</td>
                  <td>{v.clienteNombre || "Consumidor final"}</td>
                  <td>{formatoGs(v.total)}</td>
                  <td>
                    {v.estado === "anulada" ? <span className="oc-estado oc-anulada">Anulada</span>
                      : v.condicion === "credito" ? `Crédito (saldo ${formatoGs(v.saldoPendiente)})` : "Contado"}
                  </td>
                  <td>{v.usuarioNombre || "—"}</td>
                  <td><button className="icon-btn" onClick={() => setVerDetalle(v)}>Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {verDetalle ? (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) cerrarDetalle(); }}>
          <div className="modal">
            <div className="modal-header">
              <h3>{verDetalle.codigoVenta}{verDetalle.estado === "anulada" ? " · ANULADA" : ""}</h3>
              <button type="button" className="modal-close" onClick={cerrarDetalle}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12.5, color: "var(--color-text-soft)", marginTop: 0 }}>
                {verDetalle.clienteNombre} · {nombreDeposito(verDetalle.depositoId)}
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
                  <tbody>
                    {(verDetalle.items || []).map((it, i) => (
                      <tr key={i}><td>{it.nombreProducto}</td><td>{it.cantidad}</td><td>{formatoGs(it.precioUnitario)}</td><td>{formatoGs(it.subtotal)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {verDetalle.descuento > 0 ? <p style={{ textAlign: "right", margin: "8px 0 0" }}>Descuento: -{formatoGs(verDetalle.descuento)}</p> : null}
              {(() => {
                const liq = verDetalle.liquidacionIva || calcularLiquidacionIva(verDetalle.items || [], verDetalle.descuento);
                return (
                  <p style={{ textAlign: "right", fontSize: 12, color: "var(--color-text-soft)", margin: "4px 0 0" }}>
                    IVA 10%: {formatoGs(liq.iva10)} · IVA 5%: {formatoGs(liq.iva5)} · Exentas: {formatoGs(liq.exenta)}
                  </p>
                );
              })()}
              <p style={{ textAlign: "right", fontWeight: 600 }}>Total: {formatoGs(verDetalle.total)}</p>
              <p style={{ fontSize: 12.5, margin: 0 }}>
                {(verDetalle.pagos || []).map((p) => `${METODOS_PAGO[p.metodo] || p.metodo}: ${formatoGs(p.monto)}`).join(" · ")}
              </p>
              {verDetalle.estado === "anulada" ? (
                <p style={{ fontSize: 12.5, color: "var(--color-danger)", marginBottom: 0 }}>
                  Anulada por {verDetalle.anuladaPorNombre || "—"}: {verDetalle.motivoAnulacion || "sin motivo"}
                </p>
              ) : null}
              {anulando ? (
                <div className="field" style={{ marginTop: 12 }}>
                  <label>Motivo de la anulación</label>
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: error de carga, devolución del cliente..." autoFocus />
                  <p style={{ fontSize: 11.5, color: "var(--color-text-soft)", margin: "6px 0 0" }}>
                    Devuelve el stock al depósito y descuenta el crédito del cliente. No se puede deshacer.
                  </p>
                  {(() => {
                    const cred = (verDetalle.pagos || []).filter((p) => p.metodo === "credito").reduce((a, p) => a + p.monto, 0);
                    const cobrado = cred - (verDetalle.saldoPendiente || 0);
                    return cobrado > 0 ? (
                      <p style={{ fontSize: 12, color: "var(--color-danger)", margin: "6px 0 0" }}>
                        Atención: ya se cobraron {formatoGs(cobrado)} de esta venta. Esa plata hay que devolverla al cliente aparte; queda registrada en la venta.
                      </p>
                    ) : null;
                  })()}
                  {errorAnular ? <div className="form-error" style={{ marginTop: 8 }}>{errorAnular}</div> : null}
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" style={{ width: "auto" }}
                onClick={() => generarTicketPDF({ venta: verDetalle, empresaNombre, logoDataUrl, nombreDeposito: nombreDeposito(verDetalle.depositoId) })}>
                Ticket 80 mm
              </button>
              <button type="button" className="btn btn-primary" style={{ width: "auto" }}
                onClick={() => generarComprobanteA4PDF({ venta: verDetalle, nombreDeposito: nombreDeposito(verDetalle.depositoId) })}>
                Comprobante A4
              </button>
              {hasActionAccess(role, "pos.anular_venta") && verDetalle.estado === "emitida" ? (
                anulando ? (
                  <button type="button" className="btn btn-danger" style={{ width: "auto" }} disabled={savingAnular} onClick={confirmarAnulacion}>
                    {savingAnular ? "Anulando..." : "Confirmar anulación"}
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary" style={{ width: "auto" }} onClick={() => setAnulando(true)}>Anular venta</button>
                )
              ) : null}
              <button type="button" className="btn btn-secondary" style={{ width: "auto" }} onClick={cerrarDetalle}>Cerrar</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Finanzas · Cuentas a cobrar                                          */
/* Cobro de ventas a crédito. Cada cobro es un registro inmutable       */
/* (CB-000001) que se imputa a las ventas pendientes del cliente,       */
/* de la más antigua a la más nueva, y genera un movimiento financiero. */
/* ------------------------------------------------------------------ */

const METODOS_COBRO = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", cheque: "Cheque" };

/** Reparte un monto entre las ventas (ya ordenadas de más antigua a más nueva). */
function imputarCobro(ventasPendientes, monto) {
  let resto = Math.round(Number(monto) || 0);
  const imputaciones = [];
  for (const v of ventasPendientes) {
    if (resto <= 0) break;
    const aplicar = Math.min(resto, v.saldoPendiente || 0);
    if (aplicar > 0) {
      imputaciones.push({ ventaId: v.id, codigoVenta: v.codigoVenta, monto: aplicar });
      resto -= aplicar;
    }
  }
  return { imputaciones, sobrante: resto };
}

async function registrarCobro({ clienteId, monto, metodo, observaciones, imputaciones, usuarioId, usuarioNombre }) {
  const montoTotal = imputaciones.reduce((a, x) => a + x.monto, 0);
  if (!(montoTotal > 0)) throw new Error("El monto a cobrar debe ser mayor a 0.");

  const contadorRef = db.collection("contadores").doc("cobros");
  const clienteRef = db.collection("clientes").doc(clienteId);
  const cobroRef = db.collection("cobros").doc();
  const movRef = db.collection("movimientosFinancieros").doc();
  const ventaRefs = imputaciones.map((x) => db.collection("ventas").doc(x.ventaId));
  let resultado = null;

  await db.runTransaction(async (tx) => {
    const clienteDoc = await tx.get(clienteRef);
    const ventaDocs = await Promise.all(ventaRefs.map((r) => tx.get(r)));
    const contadorDoc = await tx.get(contadorRef);

    if (!clienteDoc.exists) throw new Error("El cliente ya no existe.");
    ventaDocs.forEach((vd, i) => {
      if (!vd.exists) throw new Error("Una de las ventas ya no existe.");
      const v = vd.data();
      if (v.estado !== "emitida") throw new Error(`La venta ${v.codigoVenta} fue anulada. Cerrá y volvé a abrir el cobro.`);
      if ((v.saldoPendiente || 0) < imputaciones[i].monto) {
        throw new Error(`La venta ${v.codigoVenta} ya no tiene ese saldo (otro cobro se registró). Cerrá y volvé a abrir el cobro.`);
      }
    });

    const siguiente = (contadorDoc.exists ? contadorDoc.data().ultimo || 0 : 0) + 1;
    const codigoCobro = "CB-" + String(siguiente).padStart(6, "0");

    ventaDocs.forEach((vd, i) => {
      tx.update(ventaRefs[i], {
        saldoPendiente: (vd.data().saldoPendiente || 0) - imputaciones[i].monto,
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
    tx.update(clienteRef, {
      saldoPendiente: Math.max((clienteDoc.data().saldoPendiente || 0) - montoTotal, 0),
      actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
    });

    const cobro = {
      codigoCobro,
      clienteId,
      clienteNombre: clienteDoc.data().nombre,
      clienteDocumento: clienteDoc.data().ruc || null,
      monto: montoTotal,
      metodo,
      observaciones: observaciones || null,
      imputaciones,
      usuarioId,
      usuarioNombre,
    };
    tx.set(contadorRef, { ultimo: siguiente }, { merge: true });
    tx.set(cobroRef, { ...cobro, fecha: firebase.firestore.FieldValue.serverTimestamp() });
    tx.set(movRef, {
      tipo: "ingreso",
      origen: "cobro",
      cobroId: cobroRef.id,
      codigoCobro,
      clienteId,
      concepto: `Cobro ${codigoCobro} · ${clienteDoc.data().nombre}`,
      monto: montoTotal,
      metodo,
      usuarioId,
      usuarioNombre,
      fecha: firebase.firestore.FieldValue.serverTimestamp(),
    });
    resultado = { id: cobroRef.id, ...cobro, fecha: null };
  });
  return resultado;
}

/** Recibo de cobro en A4 (documento interno, sin validez fiscal). */
async function generarReciboCobroPDF({ cobro, modo }) {
  const esPago = modo === "pago";
  let empresa = {};
  try {
    const cfg = await db.collection("configuracion").doc("general").get();
    if (cfg.exists) empresa = cfg.data();
  } catch (e) { console.warn(e); }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 10, R = 200, ANCHO = R - L;
  const nf = (v) => Number(v || 0).toLocaleString("es-PY");
  const fecha = cobro.fecha && cobro.fecha.toDate ? cobro.fecha.toDate() : (cobro.fechaLocal || new Date());
  const p2 = (x) => String(x).padStart(2, "0");
  const fechaTxt = `${p2(fecha.getDate())}/${p2(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${p2(fecha.getHours())}:${p2(fecha.getMinutes())}`;

  doc.setLineWidth(0.3);
  doc.rect(L, 10, ANCHO, 6);
  doc.setFont(undefined, "bold");
  doc.setFontSize(8.5);
  doc.text((esPago ? "COMPROBANTE DE PAGO" : "RECIBO DE COBRO") + " — DOCUMENTO INTERNO SIN VALIDEZ FISCAL", (L + R) / 2, 14.2, { align: "center" });

  doc.rect(L, 16, ANCHO, 34);
  doc.line(135, 16, 135, 50);
  let y = 22;
  if (empresa.logoDataUrl) {
    const dims = await obtenerDimensionesImagen(empresa.logoDataUrl);
    if (dims && dims.w > 0) {
      let w = 34; let h = w * (dims.h / dims.w);
      if (h > 14) { h = 14; w = h * (dims.w / dims.h); }
      doc.addImage(empresa.logoDataUrl, /^data:image\/jpe?g/i.test(empresa.logoDataUrl) ? "JPEG" : "PNG", L + 3, 19, w, h);
      y = 19 + h + 4;
    }
  }
  doc.setFontSize(10);
  doc.text(empresa.empresaNombre || "", L + 3, y);
  doc.setFont(undefined, "normal");
  doc.setFontSize(8);
  [empresa.empresaRuc ? `RUC: ${empresa.empresaRuc}` : "", empresa.empresaTelefono || "", empresa.empresaEmail || ""]
    .filter(Boolean).forEach((t, i) => doc.text(t, L + 3, y + 4 + i * 3.6));
  doc.setFont(undefined, "bold");
  doc.setFontSize(12);
  doc.text(esPago ? "COMPROBANTE DE PAGO" : "RECIBO DE COBRO", 139, 28);
  doc.text(cobro.codigoCobro, 139, 35);
  doc.setFontSize(8.5);
  doc.setFont(undefined, "normal");
  doc.text(fechaTxt, 139, 42);

  doc.rect(L, 52, ANCHO, 30);
  doc.setFontSize(9);
  const fila = (etq, val, yy) => {
    doc.setFont(undefined, "bold"); doc.text(etq, L + 3, yy);
    doc.setFont(undefined, "normal"); doc.text(String(val), L + 3 + 34, yy);
  };
  fila(esPago ? "Pagamos a:" : "Recibimos de:", cobro.clienteNombre || "—", 59);
  fila("RUC / C.I.:", cobro.clienteDocumento || "—", 65);
  fila("Forma de pago:", METODOS_COBRO[cobro.metodo] || cobro.metodo, 71);
  doc.setFont(undefined, "bold"); doc.text("La suma de:", L + 3, 77);
  doc.setFont(undefined, "normal");
  const letras = "Guaraníes " + numeroALetras(cobro.monto) + ".";
  doc.text(doc.splitTextToSize(letras.charAt(0).toUpperCase() + letras.slice(1), ANCHO - 44)[0], L + 3 + 34, 77);

  doc.autoTable({
    startY: 85,
    head: [[esPago ? "Compra / Factura" : "Venta", "Monto imputado"]],
    body: (cobro.imputaciones || []).map((x) => [x.codigoVenta, nf(x.monto)]),
    foot: [[esPago ? "TOTAL PAGADO (Gs.)" : "TOTAL COBRADO (Gs.)", nf(cobro.monto)]],
    theme: "grid",
    margin: { left: L, right: 210 - R },
    styles: { fontSize: 9, cellPadding: 1.8, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: 0 },
    headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: "bold" },
    footStyles: { fillColor: [245, 245, 245], textColor: 0, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });
  let yf = doc.lastAutoTable.finalY + 6;
  if (cobro.observaciones) {
    doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(`Observaciones: ${cobro.observaciones}`, ANCHO), L, yf);
    yf += 8;
  }
  yf = Math.max(yf + 22, 130);
  doc.line(L + 10, yf, L + 75, yf);
  doc.line(R - 75, yf, R - 10, yf);
  doc.setFontSize(8.5);
  doc.text(esPago ? "Firma y aclaración del proveedor" : "Firma y aclaración del cliente", L + 42.5, yf + 4, { align: "center" });
  doc.text(`${esPago ? "Pagó" : "Recibió"}: ${cobro.usuarioNombre || "—"}`, R - 42.5, yf + 4, { align: "center" });
  doc.setFontSize(7.5);
  doc.text(esPago ? "Documento interno de control de pagos. No reemplaza a un recibo fiscal." : "Documento interno de control de cobranzas. No reemplaza a un recibo fiscal.", L, 291);
  doc.save(`${esPago ? "comprobante-pago" : "recibo"}-${cobro.codigoCobro}.pdf`);
}

function CobroModal({ cliente, usuarioId, usuarioNombre, onClose, onListo }) {
  const [ventas, setVentas] = useState(null); // null = cargando
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.collection("ventas").where("clienteId", "==", cliente.id).where("condicion", "==", "credito").get()
      .then((snap) => {
        const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .filter((v) => v.estado === "emitida" && (v.saldoPendiente || 0) > 0)
          .sort((a, b) => ((a.fecha && a.fecha.seconds) || 0) - ((b.fecha && b.fecha.seconds) || 0));
        setVentas(lista);
        setMonto(String(lista.reduce((a, v) => a + v.saldoPendiente, 0)));
      })
      .catch((err) => { console.error(err); setVentas([]); setError("No se pudieron leer las ventas del cliente."); });
  }, [cliente.id]);

  const totalPendiente = (ventas || []).reduce((a, v) => a + v.saldoPendiente, 0);
  const { imputaciones, sobrante } = imputarCobro(ventas || [], monto);
  const montoNum = Math.round(Number(monto) || 0);

  const confirmar = async () => {
    setError("");
    if (!(montoNum > 0)) return setError("Ingresá el monto a cobrar.");
    if (sobrante > 0) return setError(`El monto supera el saldo pendiente (${formatoGs(totalPendiente)}).`);
    setSaving(true);
    try {
      const cobro = await registrarCobro({
        clienteId: cliente.id, monto: montoNum, metodo, observaciones, imputaciones, usuarioId, usuarioNombre,
      });
      onListo({ ...cobro, fechaLocal: new Date() });
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo registrar el cobro.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <h3>Cobrar a {cliente.nombre}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error ? <div className="form-error">{error}</div> : null}
          {ventas === null ? <p>Cargando...</p> : ventas.length === 0 ? (
            <p style={{ color: "var(--color-text-soft)" }}>Este cliente no tiene ventas a crédito pendientes.</p>
          ) : (
            <>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Venta</th><th>Fecha</th><th>Saldo</th><th>Se cobra</th></tr></thead>
                  <tbody>
                    {ventas.map((v) => {
                      const ap = imputaciones.find((x) => x.ventaId === v.id);
                      return (
                        <tr key={v.id}>
                          <td>{v.codigoVenta}</td>
                          <td>{v.fecha && v.fecha.toDate ? v.fecha.toDate().toLocaleDateString("es-PY") : "—"}</td>
                          <td>{formatoGs(v.saldoPendiente)}</td>
                          <td>{ap ? formatoGs(ap.monto) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12, color: "var(--color-text-soft)" }}>El cobro se aplica primero a las ventas más antiguas.</p>
              <div className="form-grid-2">
                <div className="field">
                  <label>Monto a cobrar (Gs.) — pendiente {formatoGs(totalPendiente)}</label>
                  <input type="number" min="1" step="1" value={monto} onChange={(e) => setMonto(e.target.value)} />
                </div>
                <div className="field">
                  <label>Forma de pago</label>
                  <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                    {Object.entries(METODOS_COBRO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Observaciones (opcional)</label>
                <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Ej: N° de transferencia, cheque..." />
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" style={{ width: "auto" }} onClick={onClose}>Cancelar</button>
          {ventas && ventas.length > 0 ? (
            <button type="button" className="btn btn-primary" style={{ width: "auto" }} disabled={saving} onClick={confirmar}>
              {saving ? "Registrando..." : `Registrar cobro ${formatoGs(montoNum)}`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CuentasCobrarPage({ currentUid, currentUserName }) {
  const clientes = useColeccionSimple("clientes");
  const [cobros, setCobros] = useState([]);
  const [cobrando, setCobrando] = useState(null);
  const [recienCobrado, setRecienCobrado] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const unsub = db.collection("cobros").orderBy("fecha", "desc").limit(100).onSnapshot(
      (snap) => setCobros(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error(err)
    );
    return () => unsub();
  }, []);

  const deudores = clientes
    .filter((c) => (c.saldoPendiente || 0) > 0)
    .sort((a, b) => b.saldoPendiente - a.saldoPendiente);
  const totalPendiente = deudores.reduce((a, c) => a + c.saldoPendiente, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Cuentas a cobrar</h1>
          <p>Clientes con ventas a crédito pendientes. Cada cobro se aplica a las ventas más antiguas y genera un recibo.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Total a cobrar: {formatoGs(totalPendiente)} · {deudores.length} clientes</p>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Cliente</th><th>RUC / C.I.</th><th>Teléfono</th><th>Saldo pendiente</th><th></th></tr></thead>
            <tbody>
              {deudores.length === 0 ? (
                <tr><td colSpan={5} style={{ color: "var(--color-text-soft)" }}>No hay saldos pendientes.</td></tr>
              ) : deudores.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td>{c.ruc || "—"}</td>
                  <td>{c.telefono || "—"}</td>
                  <td>{formatoGs(c.saldoPendiente)}</td>
                  <td><button className="icon-btn" onClick={() => setCobrando(c)}>Cobrar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Últimos cobros</h3></div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Cobro</th><th>Fecha</th><th>Cliente</th><th>Forma</th><th>Monto</th><th>Ventas</th><th></th></tr></thead>
            <tbody>
              {cobros.length === 0 ? (
                <tr><td colSpan={7} style={{ color: "var(--color-text-soft)" }}>Todavía no hay cobros.</td></tr>
              ) : cobros.map((c) => (
                <tr key={c.id}>
                  <td>{c.codigoCobro}</td>
                  <td>{c.fecha && c.fecha.toDate ? c.fecha.toDate().toLocaleString("es-PY") : "—"}</td>
                  <td>{c.clienteNombre}</td>
                  <td>{METODOS_COBRO[c.metodo] || c.metodo}</td>
                  <td>{formatoGs(c.monto)}</td>
                  <td>{(c.imputaciones || []).map((x) => x.codigoVenta).join(", ")}</td>
                  <td><button className="icon-btn" onClick={() => generarReciboCobroPDF({ cobro: c })}>Recibo</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {cobrando ? (
        <CobroModal
          cliente={cobrando}
          usuarioId={currentUid}
          usuarioNombre={currentUserName}
          onClose={() => setCobrando(null)}
          onListo={(cobro) => { setCobrando(null); setRecienCobrado(cobro); }}
        />
      ) : null}

      {recienCobrado ? (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header"><h3>Cobro registrado</h3></div>
            <div className="modal-body">
              <p style={{ marginTop: 0 }}><strong>{recienCobrado.codigoCobro}</strong> · {formatoGs(recienCobrado.monto)} · {recienCobrado.clienteNombre}</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" style={{ width: "auto" }} onClick={() => generarReciboCobroPDF({ cobro: recienCobrado })}>Imprimir recibo</button>
              <button type="button" className="btn btn-primary" style={{ width: "auto" }} onClick={() => setRecienCobrado(null)}>Listo</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Finanzas · Pagos a proveedores                                       */
/* Las compras a crédito (Recepción de mercadería con condición         */
/* "Crédito") quedan como facturas abiertas. Un pago se imputa a las    */
/* más próximas a vencer y es un registro inmutable (PG-000001).        */
/* ------------------------------------------------------------------ */

const METODOS_PAGO_PROV = { transferencia: "Transferencia", efectivo: "Efectivo", cheque: "Cheque", tarjeta: "Tarjeta" };

/** Facturas abiertas ordenadas: primero las que vencen antes (sin vencimiento al final), luego las más antiguas. */
function ordenarFacturasAbiertas(lista) {
  const seg = (r) => (r.fecha && r.fecha.seconds) || 0;
  return [...lista].sort((a, b) => {
    const va = a.fechaVencimiento || "9999-99-99";
    const vb = b.fechaVencimiento || "9999-99-99";
    if (va !== vb) return va < vb ? -1 : 1;
    return seg(a) - seg(b);
  });
}

function imputarPago(facturas, monto) {
  let resto = Math.round(Number(monto) || 0);
  const imputaciones = [];
  for (const f of facturas) {
    if (resto <= 0) break;
    const aplicar = Math.min(resto, f.saldoPendiente || 0);
    if (aplicar > 0) {
      imputaciones.push({
        recepcionId: f.id, codigoRecepcion: f.codigoRecepcion,
        numeroDocumento: f.numeroDocumento || null, monto: aplicar,
      });
      resto -= aplicar;
    }
  }
  return { imputaciones, sobrante: resto };
}

async function registrarPagoProveedor({ proveedorId, metodo, observaciones, imputaciones, usuarioId, usuarioNombre }) {
  const montoTotal = imputaciones.reduce((a, x) => a + x.monto, 0);
  if (!(montoTotal > 0)) throw new Error("El monto a pagar debe ser mayor a 0.");

  const contadorRef = db.collection("contadores").doc("pagosProveedores");
  const proveedorRef = db.collection("proveedores").doc(proveedorId);
  const pagoRef = db.collection("pagosProveedores").doc();
  const movRef = db.collection("movimientosFinancieros").doc();
  const recRefs = imputaciones.map((x) => db.collection("recepciones").doc(x.recepcionId));
  let resultado = null;

  await db.runTransaction(async (tx) => {
    const proveedorDoc = await tx.get(proveedorRef);
    const recDocs = await Promise.all(recRefs.map((r) => tx.get(r)));
    const contadorDoc = await tx.get(contadorRef);

    if (!proveedorDoc.exists) throw new Error("El proveedor ya no existe.");
    recDocs.forEach((rd, i) => {
      if (!rd.exists) throw new Error("Una de las facturas ya no existe.");
      if ((rd.data().saldoPendiente || 0) < imputaciones[i].monto) {
        throw new Error(`La factura ${rd.data().codigoRecepcion} ya no tiene ese saldo (otro pago se registró). Cerrá y volvé a abrir el pago.`);
      }
    });

    const siguiente = (contadorDoc.exists ? contadorDoc.data().ultimo || 0 : 0) + 1;
    const codigoPago = "PG-" + String(siguiente).padStart(6, "0");

    recDocs.forEach((rd, i) => {
      tx.update(recRefs[i], {
        saldoPendiente: (rd.data().saldoPendiente || 0) - imputaciones[i].monto,
        actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });

    const pago = {
      codigoPago,
      proveedorId,
      proveedorNombre: proveedorDoc.data().nombre,
      proveedorRuc: proveedorDoc.data().ruc || null,
      monto: montoTotal,
      metodo,
      observaciones: observaciones || null,
      imputaciones,
      usuarioId,
      usuarioNombre,
    };
    tx.set(contadorRef, { ultimo: siguiente }, { merge: true });
    tx.set(pagoRef, { ...pago, fecha: firebase.firestore.FieldValue.serverTimestamp() });
    tx.set(movRef, {
      tipo: "egreso",
      origen: "pago_proveedor",
      pagoId: pagoRef.id,
      codigoPago,
      proveedorId,
      concepto: `Pago ${codigoPago} · ${proveedorDoc.data().nombre}`,
      monto: montoTotal,
      metodo,
      usuarioId,
      usuarioNombre,
      fecha: firebase.firestore.FieldValue.serverTimestamp(),
    });
    resultado = { id: pagoRef.id, ...pago, fecha: null };
  });
  return resultado;
}

function generarComprobantePagoPDF({ pago }) {
  return generarReciboCobroPDF({
    modo: "pago",
    cobro: {
      codigoCobro: pago.codigoPago,
      clienteNombre: pago.proveedorNombre,
      clienteDocumento: pago.proveedorRuc,
      monto: pago.monto,
      metodo: pago.metodo,
      observaciones: pago.observaciones,
      usuarioNombre: pago.usuarioNombre,
      fecha: pago.fecha,
      fechaLocal: pago.fechaLocal,
      imputaciones: (pago.imputaciones || []).map((x) => ({
        codigoVenta: x.codigoRecepcion + (x.numeroDocumento ? ` - Factura ${x.numeroDocumento}` : ""),
        monto: x.monto,
      })),
    },
  });
}

function PagoProveedorModal({ proveedor, facturas, usuarioId, usuarioNombre, onClose, onListo }) {
  const abiertas = ordenarFacturasAbiertas(facturas);
  const totalPendiente = abiertas.reduce((a, f) => a + f.saldoPendiente, 0);
  const [monto, setMonto] = useState(String(totalPendiente));
  const [metodo, setMetodo] = useState("transferencia");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const { imputaciones, sobrante } = imputarPago(abiertas, monto);
  const montoNum = Math.round(Number(monto) || 0);
  const hoy = new Date().toISOString().slice(0, 10);

  const confirmar = async () => {
    setError("");
    if (!(montoNum > 0)) return setError("Ingresá el monto a pagar.");
    if (sobrante > 0) return setError(`El monto supera la deuda (${formatoGs(totalPendiente)}).`);
    setSaving(true);
    try {
      const pago = await registrarPagoProveedor({
        proveedorId: proveedor.id, metodo, observaciones, imputaciones, usuarioId, usuarioNombre,
      });
      onListo({ ...pago, fechaLocal: new Date() });
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo registrar el pago.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <h3>Pagar a {proveedor.nombre}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error ? <div className="form-error">{error}</div> : null}
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Compra</th><th>Factura</th><th>Vence</th><th>Saldo</th><th>Se paga</th></tr></thead>
              <tbody>
                {abiertas.map((f) => {
                  const ap = imputaciones.find((x) => x.recepcionId === f.id);
                  const vencida = f.fechaVencimiento && f.fechaVencimiento < hoy;
                  return (
                    <tr key={f.id}>
                      <td>{f.codigoRecepcion}</td>
                      <td>{f.numeroDocumento || "—"}</td>
                      <td style={vencida ? { color: "var(--color-danger)", fontWeight: 600 } : null}>{f.fechaVencimiento || "—"}{vencida ? " (vencida)" : ""}</td>
                      <td>{formatoGs(f.saldoPendiente)}</td>
                      <td>{ap ? formatoGs(ap.monto) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-soft)" }}>El pago se aplica primero a las facturas que vencen antes.</p>
          <div className="form-grid-2">
            <div className="field">
              <label>Monto a pagar (Gs.) — deuda {formatoGs(totalPendiente)}</label>
              <input type="number" min="1" step="1" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
            <div className="field">
              <label>Forma de pago</label>
              <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                {Object.entries(METODOS_PAGO_PROV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Observaciones (opcional)</label>
            <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Ej: N° de transferencia, cheque..." />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" style={{ width: "auto" }} onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" style={{ width: "auto" }} disabled={saving} onClick={confirmar}>
            {saving ? "Registrando..." : `Registrar pago ${formatoGs(montoNum)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function PagosProveedoresPage({ currentUid, currentUserName }) {
  const proveedores = useColeccionSimple("proveedores");
  const [facturas, setFacturas] = useState([]);   // recepciones a crédito con saldo
  const [pagos, setPagos] = useState([]);
  const [pagando, setPagando] = useState(null);
  const [recienPagado, setRecienPagado] = useState(null);

  useEffect(() => {
    const u1 = db.collection("recepciones").where("condicion", "==", "credito").onSnapshot(
      (snap) => setFacturas(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => (r.saldoPendiente || 0) > 0)),
      (err) => console.error(err)
    );
    const u2 = db.collection("pagosProveedores").orderBy("fecha", "desc").limit(100).onSnapshot(
      (snap) => setPagos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error(err)
    );
    return () => { u1(); u2(); };
  }, []);

  const hoy = new Date().toISOString().slice(0, 10);
  const porProveedor = {};
  facturas.forEach((f) => {
    const g = porProveedor[f.proveedorId] || (porProveedor[f.proveedorId] = { proveedorId: f.proveedorId, nombre: f.proveedorNombre, facturas: [], saldo: 0, vencido: 0, proximo: null });
    g.facturas.push(f);
    g.saldo += f.saldoPendiente;
    if (f.fechaVencimiento && f.fechaVencimiento < hoy) g.vencido += f.saldoPendiente;
    if (f.fechaVencimiento && (!g.proximo || f.fechaVencimiento < g.proximo)) g.proximo = f.fechaVencimiento;
  });
  const grupos = Object.values(porProveedor).sort((a, b) => b.saldo - a.saldo);
  const totalPagar = grupos.reduce((a, g) => a + g.saldo, 0);
  const totalVencido = grupos.reduce((a, g) => a + g.vencido, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Pagos a proveedores</h1>
          <p>Compras a crédito pendientes de pago (se cargan en Recepción de mercadería con condición "Crédito"). Cada pago se aplica a las facturas que vencen antes.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>
            Total a pagar: {formatoGs(totalPagar)} · {grupos.length} proveedores
            {totalVencido > 0 ? <span style={{ color: "var(--color-danger)" }}> · vencido: {formatoGs(totalVencido)}</span> : null}
          </p>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Proveedor</th><th>Facturas</th><th>Próx. vencimiento</th><th>Saldo</th><th></th></tr></thead>
            <tbody>
              {grupos.length === 0 ? (
                <tr><td colSpan={5} style={{ color: "var(--color-text-soft)" }}>No hay deudas con proveedores.</td></tr>
              ) : grupos.map((g) => (
                <tr key={g.proveedorId}>
                  <td>{g.nombre}</td>
                  <td>{g.facturas.length}</td>
                  <td style={g.proximo && g.proximo < hoy ? { color: "var(--color-danger)", fontWeight: 600 } : null}>{g.proximo || "—"}</td>
                  <td>{formatoGs(g.saldo)}</td>
                  <td>
                    <button className="icon-btn" onClick={() => setPagando({ proveedor: proveedores.find((p) => p.id === g.proveedorId) || { id: g.proveedorId, nombre: g.nombre }, facturas: g.facturas })}>
                      Pagar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Últimos pagos</h3></div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Pago</th><th>Fecha</th><th>Proveedor</th><th>Forma</th><th>Monto</th><th>Facturas</th><th></th></tr></thead>
            <tbody>
              {pagos.length === 0 ? (
                <tr><td colSpan={7} style={{ color: "var(--color-text-soft)" }}>Todavía no hay pagos.</td></tr>
              ) : pagos.map((p) => (
                <tr key={p.id}>
                  <td>{p.codigoPago}</td>
                  <td>{p.fecha && p.fecha.toDate ? p.fecha.toDate().toLocaleString("es-PY") : "—"}</td>
                  <td>{p.proveedorNombre}</td>
                  <td>{METODOS_PAGO_PROV[p.metodo] || p.metodo}</td>
                  <td>{formatoGs(p.monto)}</td>
                  <td>{(p.imputaciones || []).map((x) => x.codigoRecepcion).join(", ")}</td>
                  <td><button className="icon-btn" onClick={() => generarComprobantePagoPDF({ pago: p })}>Comprobante</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pagando ? (
        <PagoProveedorModal
          proveedor={pagando.proveedor}
          facturas={pagando.facturas}
          usuarioId={currentUid}
          usuarioNombre={currentUserName}
          onClose={() => setPagando(null)}
          onListo={(pago) => { setPagando(null); setRecienPagado(pago); }}
        />
      ) : null}

      {recienPagado ? (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header"><h3>Pago registrado</h3></div>
            <div className="modal-body">
              <p style={{ marginTop: 0 }}><strong>{recienPagado.codigoPago}</strong> · {formatoGs(recienPagado.monto)} · {recienPagado.proveedorNombre}</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" style={{ width: "auto" }} onClick={() => generarComprobantePagoPDF({ pago: recienPagado })}>Imprimir comprobante</button>
              <button type="button" className="btn btn-primary" style={{ width: "auto" }} onClick={() => setRecienPagado(null)}>Listo</button>
            </div>
          </div>
        </div>
      ) : null}
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
  const [datos, setDatos] = useState({ empresaRuc: "", empresaTelefono: "", empresaEmail: "", empresaCiudad: "" });
  const [logoDataUrl, setLogoDataUrl] = useState(""); // logo ya guardado en Firestore
  const [logoPreview, setLogoPreview] = useState(""); // logo recién elegido, sin guardar
  const [logoError, setLogoError] = useState("");
  const [quitarLogo, setQuitarLogo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const unsub = db.collection("configuracion").doc("general").onSnapshot((doc) => {
      const d = doc.exists ? doc.data() : {};
      setNombre(d.empresaNombre || "");
      setDatos({
        empresaRuc: d.empresaRuc || "", empresaTelefono: d.empresaTelefono || "",
        empresaEmail: d.empresaEmail || "", empresaCiudad: d.empresaCiudad || "",
      });
      setLogoDataUrl(d.logoDataUrl || "");
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
      const payload = {
        empresaNombre: nombre.trim(),
        empresaRuc: datos.empresaRuc.trim(),
        empresaTelefono: datos.empresaTelefono.trim(),
        empresaEmail: datos.empresaEmail.trim(),
        empresaCiudad: datos.empresaCiudad.trim(),
      };
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
              <label>RUC (opcional, se imprime en el comprobante)</label>
              <input value={datos.empresaRuc} onChange={(e) => setDatos({ ...datos, empresaRuc: e.target.value })} placeholder="Ej: 80012345-6" />
            </div>
            <div className="field">
              <label>Ciudad</label>
              <input value={datos.empresaCiudad} onChange={(e) => setDatos({ ...datos, empresaCiudad: e.target.value })} />
            </div>
            <div className="field">
              <label>Teléfono</label>
              <input value={datos.empresaTelefono} onChange={(e) => setDatos({ ...datos, empresaTelefono: e.target.value })} />
            </div>
            <div className="field">
              <label>Correo electrónico</label>
              <input value={datos.empresaEmail} onChange={(e) => setDatos({ ...datos, empresaEmail: e.target.value })} />
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

function PageContent({ moduleKey, pageKey, currentUid, currentUserName, role, empresaNombre, logoDataUrl }) {
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

  if (moduleKey === "finanzas" && pageKey === "pagos") {
    return <PagosProveedoresPage currentUid={currentUid} currentUserName={currentUserName} />;
  }

  if (moduleKey === "finanzas" && pageKey === "cuentas-cobrar") {
    return <CuentasCobrarPage currentUid={currentUid} currentUserName={currentUserName} />;
  }

  if (moduleKey === "facturacion" && pageKey === "pos") {
    return (
      <PuntoVentaPage
        currentUid={currentUid} currentUserName={currentUserName} role={role}
        empresaNombre={empresaNombre} logoDataUrl={logoDataUrl}
      />
    );
  }

  if (moduleKey === "facturacion" && pageKey === "ventas") {
    return <VentasPage empresaNombre={empresaNombre} logoDataUrl={logoDataUrl} role={role} currentUid={currentUid} currentUserName={currentUserName} />;
  }

  if (moduleKey === "facturacion" && pageKey === "clientes") {
    return (
      <MaestroCRUD
        collectionName="clientes"
        title="Clientes"
        description="Maestro de clientes. Se usa en el punto de venta (ventas a crédito y datos del comprobante) y, más adelante, en la factura electrónica."
        fields={[
          { name: "nombre", label: "Nombre / Razón social", required: true },
          { name: "ruc", label: "RUC / C.I." },
          { name: "telefono", label: "Teléfono" },
          { name: "email", label: "Email" },
          { name: "direccion", label: "Dirección" },
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
            role={role}
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
