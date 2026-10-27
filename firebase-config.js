/**
 * firebase-config.js
 *
 * Proyecto Firebase: erp-carlosg.
 *
 * Nota: esta app usa el SDK "compat" de Firebase (scripts <script> clásicos,
 * variable global `firebase`) porque así está armado el resto del sistema
 * (sin build, sin import de módulos ES) — ver index.html, sección 17.1 de
 * la especificación funcional. Por eso esta versión no usa `import {...}
 * from "firebase-app.js"` como en el snippet del panel de Firebase (ese es
 * para el SDK modular); los valores son los mismos, solo cambia la forma
 * de inicializar.
 *
 * La "apiKey" de una app web de Firebase no es secreta: identifica el
 * proyecto, no autoriza nada por sí sola. La seguridad real vive en
 * firestore.rules, no acá.
 */

const firebaseConfig = {
  apiKey: "AIzaSyBjOKJe0t1PX-k9Sihw0w7Gi6DIr_xxyFU",
  authDomain: "erp-carlosg.firebaseapp.com",
  projectId: "erp-carlosg",
  storageBucket: "erp-carlosg.firebasestorage.app",
  messagingSenderId: "284155280399",
  appId: "1:284155280399:web:a7a11a553592add1c5377a",
  measurementId: "G-1H8VDTGYPW",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Habilita persistencia offline básica (opcional, mejora la experiencia
// en conexiones inestables; no reemplaza reglas de seguridad).
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  console.warn("Persistencia offline no disponible:", err.code);
});

const APP_VERSION = "0.10.0";

// Analytics (measurementId incluido en el proyecto) no se está usando en
// esta app: es un sistema interno de gestión, no un sitio con visitantes
// anónimos que valga la pena medir con Google Analytics. Si en algún
// momento se quiere activar, hay que agregar el script compat
// "firebase-analytics-compat.js" en index.html y descomentar:
//
// const analytics = firebase.analytics();
