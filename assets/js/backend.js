/* ==========================================================================
   Backend local de demostración
   Imita la API del cliente de Supabase (from/select/insert/update/delete, rpc,
   functions, storage, auth y realtime) y guarda todo en el navegador
   (localStorage para los datos, IndexedDB para los archivos).
   No se conecta a ningún servicio externo ni necesita credenciales.
   ========================================================================== */
(function () {
  'use strict';

  var M = window.MARCA || {};
  var KEY = 'crm-demo-db-v2';
  var SES = 'crm-demo-sesion';
  var SES_PORTAL = 'crm-demo-portal';
  var API = 'https://api.crm.local';

  /* ---------- Utilidades ---------- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
  }
  function clon(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function ahora() { return new Date().toISOString(); }
  function isoLocal(d) { d = new Date(d); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function dia(n) { var d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d); }
  function tsF(n, h, m) { var d = new Date(); d.setDate(d.getDate() + n); d.setHours(h == null ? 10 : h, m || 0, 0, 0); return d.toISOString(); }
  // Fecha pasada: si la hora pedida aún no llega hoy, se ajusta a unos minutos atrás
  function ts(n, h, m) { var t = tsF(n, h, m); if (new Date(t).getTime() > Date.now()) t = new Date(Date.now() - (((h || 0) * 7 + (m || 0)) % 170 + 4) * 60000).toISOString(); return t; }
  function digitos(t) { return String(t || '').replace(/\D/g, ''); }
  function espera(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  function rnd(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------- Base de datos ---------- */
  var db;
  var PK = { admins: 'user_id', admin_emails: 'email', ajustes: 'clave' };
  var FK = { clientes: 'cliente_id', casos: 'caso_id', pagos: 'pago_id', conversaciones: 'conversacion_id', formularios: 'formulario_id', contenido: 'contenido_id', planes: 'plan_id' };

  function cargar() {
    try { var t = localStorage.getItem(KEY); if (t) return JSON.parse(t); } catch (_) { /* sin almacenamiento */ }
    return null;
  }
  var tGuardar = null;
  function guardar() {
    clearTimeout(tGuardar);
    tGuardar = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { /* lleno o bloqueado */ } }, 30);
  }
  function guardarYa() { clearTimeout(tGuardar); try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { /* */ } }
  function tabla(t) { return db[t] || (db[t] = []); }
  function porId(t, id) { var k = PK[t] || 'id'; return tabla(t).filter(function (r) { return r[k] === id; })[0] || null; }

  /* ---------- Sesión ---------- */
  function leerSesion(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }
  function escribirSesion(k, v) { try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch (_) { /* */ } }
  function usuarioActual() {
    var s = leerSesion(SES);
    return s ? porId('admins', s.user.id) : null;
  }

  /* ---------- Reglas automáticas (lo que harían los triggers de la base) ---------- */
  var DEF = {
    clientes: { etiquetas: [], idioma: 'es', origen: 'otro' },
    casos: { estado: 'activo', datos: {} },
    tareas: { hecha: false },
    solicitudes: { estado: 'nuevo', objetivos: [], documentos: {} },
    mensajes_web: { estado: 'nuevo' },
    formulario_respuestas: { estado: 'nuevo', datos: {}, archivos: [] },
    contratos: { estado: 'borrador' },
    conversaciones: { no_leidos: 0, etapa: 'nuevo', prospecto: true, seguimientos: [] },
    contenido: { estado: 'por_aprobar', archivos: [] },
    campanas: { estado: 'borrador' },
    planes: { activo: true, estado_cobro: 'manual' },
    disputas: { resultado: 'pendiente' },
    cola_mensajes: { estado: 'pendiente', intentos: 0 },
    citas: { estado: 'solicitada' },
    mensajes_chat: { estado: 'enviado', adjuntos: [] },
    enlaces_pago: { estado: 'pendiente' },
    formularios: { activo: false, campos: [] },
    llamadas: { ia_estado: 'sin_grabacion' },
    sitio_items: { visible: true }
  };
  var SIN_ACTIVIDAD = { actividad: 1, integraciones_eventos: 1, mensajes_chat: 1 };

  function antesDeInsertar(t, r) {
    var k = PK[t] || 'id';
    if (r[k] == null && k === 'id') r.id = uuid();
    if (!r.created_at) r.created_at = ahora();
    r.updated_at = ahora();
    var d = DEF[t];
    if (d) Object.keys(d).forEach(function (c) { if (r[c] === undefined) r[c] = clon(d[c]); });
    if (t === 'clientes') r.tel_digitos = digitos(r.telefono);
    if (t === 'casos') {
      if (!r.fecha_inicio) r.fecha_inicio = isoLocal(new Date());
      if (!r.checklist) {
        var aj = porId('ajustes', 'checklists');
        r.checklist = ((aj && aj.valor && aj.valor[r.servicio]) || []).map(function (x) { return { d: x, e: 'falta' }; });
      }
    }
    if (t === 'pagos') {
      r.numero = tabla('pagos').reduce(function (m, p) { return Math.max(m, p.numero || 0); }, 1000) + 1;
      if (!r.token) r.token = uuid();
      if (!r.fecha) r.fecha = isoLocal(new Date());
    }
    if (t === 'contratos' && !r.token) r.token = uuid();
    if (t === 'disputas' && !r.fecha_limite) { var f = new Date((r.fecha_envio || isoLocal(new Date())) + 'T12:00:00'); f.setDate(f.getDate() + 30); r.fecha_limite = isoLocal(f); }
    if (t === 'conversaciones' && !r.ultimo_at) r.ultimo_at = ahora();
    if (t === 'cola_mensajes' && !r.programado_para) r.programado_para = ahora();
    if (t === 'formularios' && !r.slug) r.slug = 'formulario-' + Math.random().toString(36).slice(2, 7);
  }
  function despuesDeInsertar(t, r) {
    if (t === 'mensajes_chat') {
      var c = porId('conversaciones', r.conversacion_id);
      if (c) {
        c.ultimo_texto = String(r.texto || (r.adjuntos && r.adjuntos.length ? '[Archivo]' : '')).slice(0, 200);
        c.ultimo_at = r.created_at;
        if (r.direccion === 'entrante') { c.ultimo_entrante_at = r.created_at; c.no_leidos = (c.no_leidos || 0) + 1; }
        else c.ultimo_saliente_at = r.created_at;
        c.updated_at = ahora();
        emitir('conversaciones', 'UPDATE', c);
      }
    }
    if (!SIN_ACTIVIDAD[t] && (t === 'clientes' || t === 'casos' || t === 'solicitudes')) registrar('creó', t, r);
  }
  function despuesDeActualizar(t, antes, r) {
    if (t === 'clientes') r.tel_digitos = digitos(r.telefono);
    if (t === 'casos' && antes.etapa !== r.etapa) {
      var cfg = (porId('ajustes', 'whatsapp') || {}).valor || {};
      var cli = porId('clientes', r.cliente_id);
      if (cfg.aviso_etapa && cfg.aviso_etapa.activo && cli && cli.telefono) {
        var svc = (window.APP && APP.SERVICIOS && APP.SERVICIOS[r.servicio]) ? APP.SERVICIOS[r.servicio].label : r.servicio;
        insertarFila('cola_mensajes', { tipo: 'aviso_etapa', cliente_id: cli.id, nombre: cli.nombre + (cli.apellidos ? ' ' + cli.apellidos : ''), telefono: cli.telefono,
          texto: String(cfg.aviso_etapa.mensaje || 'Hola {nombre}, tu {servicio} avanzó a: {etapa}.').replace(/\{nombre\}/g, cli.nombre).replace(/\{servicio\}/g, String(svc).toLowerCase()).replace(/\{etapa\}/g, r.etapa) });
      }
    }
    if (t === 'clientes' || t === 'casos' || t === 'solicitudes') registrar('editó', t, r);
  }
  function antesDeBorrar(t, r) {
    if (t === 'clientes') {
      ['casos', 'tareas', 'pagos', 'documentos', 'contratos', 'planes', 'portal_accesos', 'enlaces_pago'].forEach(function (x) {
        if (x === 'casos') tabla('casos').filter(function (k) { return k.cliente_id === r.id; }).forEach(function (k) { antesDeBorrar('casos', k); });
        db[x] = tabla(x).filter(function (y) { return y.cliente_id !== r.id; });
      });
      ['conversaciones', 'llamadas', 'citas', 'mensajes_web', 'formulario_respuestas'].forEach(function (x) { tabla(x).forEach(function (y) { if (y.cliente_id === r.id) y.cliente_id = null; }); });
    }
    if (t === 'casos') {
      ['puntajes', 'disputas'].forEach(function (x) { db[x] = tabla(x).filter(function (y) { return y.caso_id !== r.id; }); });
      tabla('tareas').forEach(function (y) { if (y.caso_id === r.id) y.caso_id = null; });
      tabla('pagos').forEach(function (y) { if (y.caso_id === r.id) y.caso_id = null; });
    }
    if (t === 'conversaciones') db.mensajes_chat = tabla('mensajes_chat').filter(function (m) { return m.conversacion_id !== r.id; });
    if (t === 'contenido') db.contenido_comentarios = tabla('contenido_comentarios').filter(function (m) { return m.contenido_id !== r.id; });
    if (t === 'clientes' || t === 'casos' || t === 'solicitudes') registrar('eliminó', t, r);
  }
  var SVC_CORTO = { credito: 'credito', taxes: 'taxes', plan_irs: 'plan_irs', contabilidad: 'contabilidad', llc: 'llc', franchise_tax: 'franchise_tax', inmigracion: 'inmigracion', otro: 'otro', notaria: 'notaria' };
  function registrar(accion, t, r) {
    var u = usuarioActual();
    var resumen = t === 'casos' ? (SVC_CORTO[r.servicio] || r.servicio) + ' · ' + nombreCliente(r.cliente_id) : [r.nombre, r.apellidos].filter(Boolean).join(' ');
    tabla('actividad').push({ id: uuid(), created_at: ahora(), usuario: u ? u.nombre : 'Sistema', accion: accion, entidad: t, entidad_id: r.id, resumen: resumen });
    if (db.actividad.length > 400) db.actividad = db.actividad.slice(-300);
  }
  function nombreCliente(id) { var c = porId('clientes', id); return c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : ''; }

  function insertarFila(t, fila) {
    var r = clon(fila);
    antesDeInsertar(t, r);
    tabla(t).push(r);
    despuesDeInsertar(t, r);
    emitir(t, 'INSERT', r);
    guardar();
    return r;
  }

  /* ---------- Realtime ---------- */
  var oyentes = [];
  function emitir(t, tipo, fila) {
    oyentes.forEach(function (o) {
      if (o.table && o.table !== t) return;
      if (o.event && o.event !== '*' && o.event !== tipo) return;
      setTimeout(function () { try { o.cb({ eventType: tipo, new: clon(fila), old: {}, table: t }); } catch (e) { console.error(e); } }, 0);
    });
  }

  /* ---------- Consultas ---------- */
  function parseSelect(s) {
    var i = 0; s = String(s || '*');
    function lista() {
      var out = [], tok = '';
      while (i < s.length) {
        var ch = s[i];
        if (ch === '(') { i++; var hijos = lista(); out.push({ n: tok.trim().split(':').pop(), h: hijos }); tok = ''; continue; }
        if (ch === ')') { i++; if (tok.trim()) out.push({ n: tok.trim() }); return out; }
        if (ch === ',') { i++; if (tok.trim()) out.push({ n: tok.trim() }); tok = ''; continue; }
        tok += ch; i++;
      }
      if (tok.trim()) out.push({ n: tok.trim() });
      return out;
    }
    return lista();
  }
  function proyectar(t, r, spec) {
    var o = {};
    spec.forEach(function (it) {
      if (it.h) {
        var rel = it.n, fk = FK[rel];
        if (fk && r[fk] !== undefined) {
          var obj = r[fk] ? porId(rel, r[fk]) : null;
          o[rel] = obj ? proyectar(rel, obj, it.h) : null;
        } else if (FK[t]) {
          var clave = FK[t];
          o[rel] = tabla(rel).filter(function (x) { return x[clave] === r.id; }).map(function (x) { return proyectar(rel, x, it.h); });
        } else o[rel] = null;
      } else if (it.n === '*') {
        Object.keys(r).forEach(function (k) { o[k] = clon(r[k]); });
      } else o[it.n] = r[it.n] === undefined ? null : clon(r[it.n]);
    });
    return o;
  }

  function comoNumero(v) { return typeof v === 'number' ? v : (typeof v === 'string' && v !== '' && !isNaN(v) && !/^\d{4}-/.test(v) ? Number(v) : null); }
  function comparar(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1; if (b == null) return 1;
    var na = comoNumero(a), nb = comoNumero(b);
    if (na != null && nb != null) return na - nb;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
  function patronRe(p, i) { return new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*') + '$', i ? 'i' : ''); }
  function prueba(v, op, x) {
    switch (op) {
      case 'eq': return v != null && String(v) === String(x);
      case 'neq': return v == null || String(v) !== String(x);
      case 'gt': return v != null && comparar(v, x) > 0;
      case 'gte': return v != null && comparar(v, x) >= 0;
      case 'lt': return v != null && comparar(v, x) < 0;
      case 'lte': return v != null && comparar(v, x) <= 0;
      case 'like': return v != null && patronRe(x).test(String(v));
      case 'ilike': return v != null && patronRe(x, true).test(String(v));
      case 'in': return (x || []).map(String).indexOf(String(v)) !== -1;
      case 'is': return x === null || x === 'null' ? v == null : String(v) === String(x);
      case 'cs': return Array.isArray(v) && (x || []).every(function (y) { return v.indexOf(y) !== -1; });
    }
    return false;
  }
  function partirComas(s) {
    var out = [], prof = 0, tok = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '(') prof++; if (ch === ')') prof--;
      if (ch === ',' && prof === 0) { out.push(tok); tok = ''; } else tok += ch;
    }
    if (tok) out.push(tok);
    return out;
  }
  function condicion(txt) {
    var a = txt.indexOf('.'), b = txt.indexOf('.', a + 1);
    var col = txt.slice(0, a), op = txt.slice(a + 1, b), val = txt.slice(b + 1);
    if (op === 'not') { var r = condicion(col + '.' + val); return function (f) { return !r(f); }; }
    if (op === 'in') val = val.replace(/^\(|\)$/g, '').split(',').map(function (x) { return x.trim().replace(/^"|"$/g, ''); });
    return function (f) { return prueba(f[col], op, val); };
  }

  function Q(t) { this.t = t; this.op = 'select'; this.cols = '*'; this.f = []; this.ord = []; this.lim = null; this.uno = null; this.cnt = null; this.head = false; this.ret = null; this.val = null; this.opts = {}; }
  Q.prototype.select = function (c, o) {
    if (this.op === 'select') { this.cols = c || '*'; if (o) { this.cnt = o.count || null; this.head = !!o.head; } }
    else this.ret = c || '*';
    return this;
  };
  Q.prototype.insert = function (v) { this.op = 'insert'; this.val = v; return this; };
  Q.prototype.upsert = function (v, o) { this.op = 'upsert'; this.val = v; this.opts = o || {}; return this; };
  Q.prototype.update = function (v) { this.op = 'update'; this.val = v; return this; };
  Q.prototype.delete = function () { this.op = 'delete'; return this; };
  ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is'].forEach(function (op) {
    Q.prototype[op] = function (c, v) { this.f.push(function (r) { return prueba(r[c], op, v); }); return this; };
  });
  Q.prototype.contains = function (c, v) { this.f.push(function (r) { return prueba(r[c], 'cs', v); }); return this; };
  Q.prototype.not = function (c, op, v) { this.f.push(function (r) { return !prueba(r[c], op, v); }); return this; };
  Q.prototype.filter = function (c, op, v) { this.f.push(function (r) { return prueba(r[c], op, v); }); return this; };
  Q.prototype.match = function (o) { var self = this; Object.keys(o).forEach(function (k) { self.eq(k, o[k]); }); return this; };
  Q.prototype.or = function (s) { var cs = partirComas(s).map(condicion); this.f.push(function (r) { return cs.some(function (c) { return c(r); }); }); return this; };
  Q.prototype.order = function (c, o) { o = o || {}; var asc = o.ascending !== false; this.ord.push({ c: c, asc: asc, nf: o.nullsFirst != null ? o.nullsFirst : !asc }); return this; };
  Q.prototype.limit = function (n) { this.lim = n; return this; };
  Q.prototype.range = function (a, b) { this.desde = a; this.lim = b - a + 1; return this; };
  Q.prototype.single = function () { this.uno = 'single'; return this; };
  Q.prototype.maybeSingle = function () { this.uno = 'maybe'; return this; };
  Q.prototype.then = function (ok, mal) { var self = this; return espera(25 + Math.random() * 60).then(function () { return self.ejecutar(); }).then(ok, mal); };
  Q.prototype.catch = function (mal) { return this.then(null, mal); };

  Q.prototype.filtrar = function () { var f = this.f; return tabla(this.t).filter(function (r) { return f.every(function (fn) { return fn(r); }); }); };
  Q.prototype.salida = function (filas, spec) {
    var t = this.t, self = this;
    if (this.ord.length) filas = filas.slice().sort(function (a, b) {
      for (var i = 0; i < self.ord.length; i++) {
        var o = self.ord[i], va = a[o.c], vb = b[o.c];
        if (va == null && vb == null) continue;
        if (va == null) return o.nf ? -1 : 1;
        if (vb == null) return o.nf ? 1 : -1;
        var c = comparar(va, vb);
        if (c) return o.asc ? c : -c;
      }
      return 0;
    });
    if (this.desde) filas = filas.slice(this.desde);
    if (this.lim != null) filas = filas.slice(0, this.lim);
    var datos = filas.map(function (r) { return proyectar(t, r, parseSelect(spec)); });
    if (this.uno) {
      if (datos.length === 1) return { data: datos[0], error: null };
      if (!datos.length && this.uno === 'maybe') return { data: null, error: null };
      return { data: null, error: { message: datos.length ? 'Varias filas' : 'Sin resultados', code: 'PGRST116' } };
    }
    return { data: datos, error: null };
  };
  Q.prototype.ejecutar = function () {
    var t = this.t, self = this;
    try {
      if (this.op === 'select') {
        var filas = this.filtrar();
        if (this.head) return { data: null, count: filas.length, error: null };
        var r = this.salida(filas, this.cols);
        if (this.cnt) r.count = filas.length;
        return r;
      }
      if (this.op === 'insert' || this.op === 'upsert') {
        var lista = Array.isArray(this.val) ? this.val : [this.val];
        var hechos = lista.map(function (v) {
          if (self.op === 'upsert') {
            var cols = (self.opts.onConflict || PK[t] || 'id').split(',').map(function (x) { return x.trim(); });
            var ya = tabla(t).filter(function (r) { return cols.every(function (c) { return v[c] != null && String(r[c]) === String(v[c]); }); })[0];
            if (ya) { var antes = clon(ya); Object.assign(ya, clon(v), { updated_at: ahora() }); despuesDeActualizar(t, antes, ya); emitir(t, 'UPDATE', ya); return ya; }
          }
          var r = clon(v);
          antesDeInsertar(t, r);
          tabla(t).push(r);
          despuesDeInsertar(t, r);
          emitir(t, 'INSERT', r);
          return r;
        });
        guardar();
        if (this.ret) return this.salida(hechos, this.ret);
        return { data: null, error: null };
      }
      if (this.op === 'update') {
        var cambiadas = this.filtrar();
        cambiadas.forEach(function (r) {
          var antes = clon(r);
          Object.assign(r, clon(self.val));
          r.updated_at = ahora();
          despuesDeActualizar(t, antes, r);
          emitir(t, 'UPDATE', r);
        });
        guardar();
        if (this.ret) return this.salida(cambiadas, this.ret);
        return { data: null, error: null };
      }
      if (this.op === 'delete') {
        var borrar = this.filtrar();
        borrar.forEach(function (r) { antesDeBorrar(t, r); emitir(t, 'DELETE', r); });
        db[t] = tabla(t).filter(function (r) { return borrar.indexOf(r) === -1; });
        guardar();
        return { data: null, error: null };
      }
    } catch (e) {
      console.error('[demo]', e);
      return { data: null, error: { message: String(e.message || e) } };
    }
    return { data: null, error: null };
  };

  /* ---------- Archivos (IndexedDB) ---------- */
  var idb = null;
  function abrirIDB() {
    if (idb) return idb;
    idb = new Promise(function (ok) {
      try {
        var req = indexedDB.open('crm-demo-archivos', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('f'); };
        req.onsuccess = function () { ok(req.result); };
        req.onerror = function () { ok(null); };
      } catch (_) { ok(null); }
    });
    return idb;
  }
  var memoria = {};
  function guardarArchivo(clave, blob) {
    memoria[clave] = blob;
    return abrirIDB().then(function (d) {
      if (!d) return;
      return new Promise(function (ok) { try { var tx = d.transaction('f', 'readwrite'); tx.objectStore('f').put(blob, clave); tx.oncomplete = ok; tx.onerror = ok; } catch (_) { ok(); } });
    });
  }
  function leerArchivo(clave) {
    if (memoria[clave]) return Promise.resolve(memoria[clave]);
    return abrirIDB().then(function (d) {
      if (!d) return null;
      return new Promise(function (ok) { try { var q = d.transaction('f').objectStore('f').get(clave); q.onsuccess = function () { ok(q.result || null); }; q.onerror = function () { ok(null); }; } catch (_) { ok(null); } });
    }).then(function (b) { return b || muestra(clave); });
  }
  function borrarArchivo(clave) {
    delete memoria[clave];
    return abrirIDB().then(function (d) { if (d) try { d.transaction('f', 'readwrite').objectStore('f').delete(clave); } catch (_) { /* */ } });
  }
  var urls = {};
  function urlDe(clave) {
    return leerArchivo(clave).then(function (b) {
      if (!b) return null;
      if (!urls[clave] || urls[clave].b !== b) urls[clave] = { b: b, u: URL.createObjectURL(b) };
      return urls[clave].u;
    });
  }

  /* Archivos de muestra generados al vuelo (diseños, documentos y audios del demo) */
  function esc(t) { return String(t).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  function svgBlob(s) { return new Blob([s], { type: 'image/svg+xml' }); }
  function diseno(n, titulo, sub) {
    var fondos = ['#0b0b0b', '#f4f4f4', '#1d1d1d', '#e6e6e6', '#111111', '#fafafa'];
    var fg = n % 2 ? '#0b0b0b' : '#f4f4f4', bg = fondos[n % fondos.length];
    var forma = [
      '<circle cx="820" cy="250" r="260" fill="none" stroke="' + fg + '" stroke-opacity=".18" stroke-width="2"/><circle cx="820" cy="250" r="170" fill="' + fg + '" fill-opacity=".06"/>',
      '<rect x="560" y="60" width="420" height="420" rx="210" fill="' + fg + '" fill-opacity=".07"/><path d="M80 860 L1000 860" stroke="' + fg + '" stroke-opacity=".2" stroke-width="2"/>',
      '<g stroke="' + fg + '" stroke-opacity=".14">' + Array.apply(null, Array(12)).map(function (_, i) { return '<line x1="' + (i * 90) + '" y1="0" x2="' + (i * 90 + 300) + '" y2="1080"/>'; }).join('') + '</g>',
      '<rect x="80" y="80" width="920" height="920" fill="none" stroke="' + fg + '" stroke-opacity=".25" stroke-width="2"/><rect x="110" y="110" width="860" height="860" fill="none" stroke="' + fg + '" stroke-opacity=".12"/>'
    ][n % 4];
    return svgBlob('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="' + bg + '"/>' + forma +
      '<text x="90" y="170" font-family="Inter,Arial,sans-serif" font-size="30" letter-spacing="10" fill="' + fg + '" fill-opacity=".6">' + esc((M.nombre || 'NEXO').toUpperCase()) + '</text>' +
      '<text x="90" y="640" font-family="Georgia,serif" font-size="104" fill="' + fg + '">' + esc(titulo) + '</text>' +
      '<text x="90" y="740" font-family="Inter,Arial,sans-serif" font-size="40" fill="' + fg + '" fill-opacity=".7">' + esc(sub) + '</text>' +
      '<rect x="90" y="860" width="300" height="84" rx="42" fill="' + fg + '"/><text x="240" y="914" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="600" fill="' + bg + '">Agenda hoy</text></svg>');
  }
  function documento(nombre) {
    var lineas = '';
    for (var i = 0; i < 16; i++) lineas += '<rect x="90" y="' + (330 + i * 46) + '" width="' + (420 + ((i * 137) % 380)) + '" height="14" rx="7" fill="#d9d9d9"/>';
    return svgBlob('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1160"><rect width="900" height="1160" fill="#fff"/><rect x="0" y="0" width="900" height="10" fill="#111"/>' +
      '<text x="90" y="140" font-family="Inter,Arial,sans-serif" font-size="26" letter-spacing="6" fill="#777">DOCUMENTO DE MUESTRA</text>' +
      '<text x="90" y="220" font-family="Georgia,serif" font-size="54" fill="#111">' + esc(String(nombre).slice(0, 34)) + '</text>' + lineas +
      '<rect x="90" y="1060" width="720" height="1" fill="#ccc"/><text x="90" y="1100" font-family="Inter,Arial,sans-serif" font-size="20" fill="#999">Archivo generado por el modo demostración</text></svg>');
  }
  function audio(seg) {
    var sr = 8000, n = sr * seg, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function s(o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); }
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) {
      var t = i / sr, env = Math.min(1, t * 4) * Math.min(1, (seg - t) * 4) * (0.55 + 0.45 * Math.sin(t * 5.3));
      var x = (Math.sin(2 * Math.PI * 220 * t) * 0.5 + Math.sin(2 * Math.PI * 330 * t) * 0.3 + Math.sin(2 * Math.PI * 440 * t) * 0.2) * env * 0.25;
      v.setInt16(44 + i * 2, x * 32767, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }
  function muestra(clave) {
    var p = clave.split('/').slice(1).join('/'), nombre = p.split('/').pop();
    var m = /diseno-(\d+)-(.+)\.svg$/.exec(p);
    if (m) { var txt = decodeURIComponent(m[2]).split('|'); return diseno(Number(m[1]), txt[0], txt[1] || ''); }
    if (/\.(mp3|wav|ogg|m4a|opus|webm)$/i.test(p)) return audio(6);
    if (/foto-/.test(p)) return diseno(3, 'Foto', nombre.replace(/\.\w+$/, ''));
    return documento(nombre.replace(/^\d+-/, '').replace(/\.\w+$/, '').replace(/[-_]/g, ' '));
  }

  function storageDe(bucket) {
    function k(p) { return bucket + '/' + p; }
    return {
      upload: function (path, file) { return guardarArchivo(k(path), file).then(function () { return { data: { path: path }, error: null }; }); },
      createSignedUrl: function (path) { return urlDe(k(path)).then(function (u) { return u ? { data: { signedUrl: u }, error: null } : { data: null, error: { message: 'No existe' } }; }); },
      createSignedUrls: function (paths) { return Promise.all(paths.map(function (p) { return urlDe(k(p)).then(function (u) { return { path: p, signedUrl: u }; }); })).then(function (d) { return { data: d, error: null }; }); },
      download: function (path) { return leerArchivo(k(path)).then(function (b) { return b ? { data: b, error: null } : { data: null, error: { message: 'No existe' } }; }); },
      remove: function (paths) { return Promise.all((paths || []).map(function (p) { return borrarArchivo(k(p)); })).then(function () { return { data: [], error: null }; }); },
      copy: function (de, a) { return leerArchivo(k(de)).then(function (b) { return guardarArchivo(k(a), b); }).then(function () { return { data: { path: a }, error: null }; }); }
    };
  }

  /* ---------- Funciones del servidor (rpc) ---------- */
  function err(m) { var e = new Error(m); e.rpc = true; throw e; }
  function aj(c) { var a = porId('ajustes', c); return (a && a.valor) || {}; }
  function clientesDeFiltro(f) {
    f = f || {};
    return tabla('clientes').filter(function (c) {
      if (!c.telefono) return false;
      var casos = tabla('casos').filter(function (k) { return k.cliente_id === c.id && k.estado !== 'cancelado'; });
      if ((f.etiquetas || []).length && !(c.etiquetas || []).some(function (e) { return f.etiquetas.map(function (x) { return x.toLowerCase(); }).indexOf(String(e).toLowerCase()) !== -1; })) return false;
      if (f.origen && c.origen !== f.origen) return false;
      if (f.servicio && !casos.some(function (k) { return k.servicio === f.servicio; })) return false;
      if (f.sin_servicio && casos.some(function (k) { return k.servicio === f.sin_servicio; })) return false;
      if (f.taxes_anio && !casos.some(function (k) { return k.servicio === 'taxes' && k.datos && String(k.datos.anio) === String(f.taxes_anio); })) return false;
      return true;
    });
  }
  var RPC = {
    ping: function () { return 'pong'; },
    equipo_basico: function () { return tabla('admins').filter(function (a) { return a.activo; }).map(function (a) { return { user_id: a.user_id, nombre: a.nombre }; }); },
    config_citas: function () { var c = aj('citas'); return Object.assign({ zona: M.zona || 'America/Chicago', dias_max: 30 }, c); },
    claves_configuradas: function () { var o = {}; ['META_APP_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'META_PAGE_ID', 'SQUARE_ACCESS_TOKEN', 'SQUARE_WEBHOOK_SIGNATURE_KEY', 'GROQ_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_NUMERO'].forEach(function (k) { o[k] = true; }); return o; },
    guardar_clave_integracion: function () { return true; },
    calendario_estado: function () { return { conectado: true, ultima: ts(0, new Date().getHours() - 2) }; },
    llamadas_estado: function () { return { conectado: true, numero: M.telefonoE164 || '+17135550100', ia: true }; },
    mi_calendario: function () { return uuid(); },
    ver_sensible: function (p) { var s = porId('solicitudes', p.p_id); return s ? (s.privado || { ssn: '•••-••-' + String(1000 + Math.floor(Math.random() * 8999)), monitor_credito: 'usuario: demo · clave: ••••••' }) : null; },
    ver_respuesta_sensible: function (p) { var r = porId('formulario_respuestas', p.p_id); return (r && r.sensibles) || {}; },
    ver_transcripcion: function (p) { var l = porId('llamadas', p.p_id); return l ? l.transcripcion || '' : ''; },
    generar_franchise_tax: function (p) {
      var n = 0;
      var conLlc = {};
      tabla('casos').forEach(function (k) { if (k.servicio === 'llc' && k.estado !== 'cancelado') conLlc[k.cliente_id] = 1; });
      Object.keys(conLlc).forEach(function (cid) {
        if (tabla('casos').some(function (k) { return k.cliente_id === cid && k.servicio === 'franchise_tax' && k.datos && String(k.datos.anio) === String(p.p_anio); })) return;
        insertarFila('casos', { cliente_id: cid, servicio: 'franchise_tax', etapa: 'Pedir información', titulo: 'Franchise Tax ' + p.p_anio, datos: { anio: p.p_anio }, responsable: 'u-owner' }); n++;
      });
      return n;
    },
    generar_contabilidad_mes: function (p) {
      var periodo = String(p.p_fecha || isoLocal(new Date())).slice(0, 7), n = 0;
      tabla('planes').filter(function (x) { return x.activo && x.servicio === 'contabilidad'; }).forEach(function (pl) {
        if (tabla('casos').some(function (k) { return k.cliente_id === pl.cliente_id && k.servicio === 'contabilidad' && k.datos && k.datos.periodo === periodo; })) return;
        insertarFila('casos', { cliente_id: pl.cliente_id, servicio: 'contabilidad', etapa: 'Pedir estados de cuenta', titulo: 'Contabilidad ' + periodo, precio: pl.monto, datos: { periodo: periodo }, responsable: 'u-owner' }); n++;
      });
      return n;
    },
    contar_campana: function (p) { return clientesDeFiltro(p.p_filtro).length; },
    encolar_campana: function (p) {
      var c = porId('campanas', p.p_id); if (!c) err('No existe');
      var lista = clientesDeFiltro(c.filtro);
      lista.forEach(function (cl) {
        insertarFila('cola_mensajes', { tipo: 'campana', cliente_id: cl.id, nombre: [cl.nombre, cl.apellidos].filter(Boolean).join(' '), telefono: cl.telefono, texto: String(c.mensaje || '').replace(/\{nombre\}/g, cl.nombre), programado_para: c.programada_para || ahora() });
      });
      c.estado = 'en_cola'; c.destinatarios = lista.length; guardar();
      return lista.length;
    },
    mi_cliente: function () { var s = leerSesion(SES_PORTAL); return s ? s.cliente_id : null; },
    portal_info: function () { return { zelle: aj('negocio').zelle || '' }; },
    portal_marcar_doc: function (p) { var k = porId('casos', p.p_caso); if (k && k.checklist && k.checklist[p.p_idx]) { k.checklist[p.p_idx].e = 'enviado'; guardar(); } return true; },
    formulario_publico: function (p) { var f = tabla('formularios').filter(function (x) { return x.slug === p.p_slug && x.activo; })[0]; return f ? { id: f.id, slug: f.slug, titulo: f.titulo, descripcion: f.descripcion, mensaje_final: f.mensaje_final, campos: f.campos } : null; },
    enviar_formulario: function (p) {
      var f = tabla('formularios').filter(function (x) { return x.slug === p.p_slug; })[0]; if (!f) err('Formulario no disponible');
      var datos = clon(p.p_datos || {}), sens = {}, mapa = {};
      (f.campos || []).forEach(function (c) {
        if (c.tipo === 'sensible' && datos[c.id] != null) { sens[c.id] = datos[c.id]; delete datos[c.id]; }
        if (c.mapa && datos[c.id] != null) mapa[c.mapa] = datos[c.id];
      });
      insertarFila('formulario_respuestas', { formulario_id: f.id, datos: datos, sensibles: sens, archivos: p.p_archivos || [], nombre: mapa.nombre || null, apellidos: mapa.apellidos || null, telefono: mapa.telefono || null, email: mapa.email || null });
      return true;
    },
    citas_ocupadas: function (p) { return tabla('citas').filter(function (c) { return ['solicitada', 'confirmada'].indexOf(c.estado) !== -1 && c.inicio >= p.p_desde && c.inicio <= p.p_hasta; }).map(function (c) { return { inicio: c.inicio, fin: c.fin }; }); },
    reservar_cita: function (p) {
      var dur = aj('citas').duracion || 30, ini = new Date(p.p_inicio), fin = new Date(ini.getTime() + dur * 60000);
      var choca = tabla('citas').some(function (c) { return ['solicitada', 'confirmada'].indexOf(c.estado) !== -1 && new Date(c.inicio) < fin && new Date(c.fin) > ini; });
      if (choca) err('Ese horario ya está reservado');
      var cli = tabla('clientes').filter(function (c) { return digitos(c.telefono).slice(-10) === digitos(p.p_telefono).slice(-10); })[0];
      insertarFila('citas', { nombre: p.p_nombre, telefono: p.p_telefono, email: p.p_email || null, servicio: p.p_servicio, inicio: ini.toISOString(), fin: fin.toISOString(), notas: p.p_notas || null, estado: 'solicitada', origen: 'web', cliente_id: cli ? cli.id : null });
      return true;
    },
    ver_contrato: function (p) { var k = tabla('contratos').filter(function (x) { return x.token === p.p_token && x.estado !== 'borrador' && x.estado !== 'anulado'; })[0]; return k ? { titulo: k.titulo, cliente: nombreCliente(k.cliente_id), contenido: k.contenido, estado: k.estado, firmado_nombre: k.firmado_nombre, firmado_at: k.firmado_at } : null; },
    firmar_contrato: function (p) { var k = tabla('contratos').filter(function (x) { return x.token === p.p_token && x.estado === 'enviado'; })[0]; if (!k) return false; k.estado = 'firmado'; k.firmado_nombre = p.p_nombre; k.firmado_at = ahora(); k.firma = p.p_firma; k.agente = p.p_agente; guardar(); emitir('contratos', 'UPDATE', k); return true; },
    ver_recibo: function (p) {
      var x = tabla('pagos').filter(function (y) { return y.token === p.p_token; })[0]; if (!x) return null;
      var k = x.caso_id ? porId('casos', x.caso_id) : null;
      var pagado = k ? tabla('pagos').filter(function (y) { return y.caso_id === k.id; }).reduce(function (a, y) { return a + Number(y.monto); }, 0) : null;
      var S = { credito: 'Reparación de crédito', taxes: 'Taxes', plan_irs: 'Plan de pago IRS', contabilidad: 'Contabilidad mensual', llc: 'Formación de LLC', franchise_tax: 'Franchise Tax', inmigracion: 'Inmigración', otro: 'Otro', notaria: 'Notaría' };
      return { numero: x.numero, fecha: x.fecha, monto: x.monto, metodo: x.metodo, nota: x.nota, cliente: nombreCliente(x.cliente_id), servicio: k ? (k.titulo || S[k.servicio]) : null, precio: k ? k.precio : null, pagado: pagado, telefono: aj('negocio').telefono || M.telefono };
    },
    pagar_enlace_demo: function (p) {
      var e = porId('enlaces_pago', p.p_id); if (!e || e.estado !== 'pendiente') return null;
      e.estado = 'pagado'; e.pagado_at = ahora();
      var pago = insertarFila('pagos', { cliente_id: e.cliente_id, caso_id: e.caso_id || null, monto: e.monto, metodo: 'tarjeta', nota: e.concepto, pasarela_id: 'demo-' + e.id.slice(0, 8) });
      tabla('integraciones_eventos').push({ id: uuid(), created_at: ahora(), fuente: 'square', tipo: 'payment_completed', ok: true, detalle: '$' + e.monto });
      guardar();
      return { numero: pago.numero, token: pago.token, monto: e.monto, concepto: e.concepto };
    }
  };
  function rpc(nombre, p) {
    return espera(60 + Math.random() * 120).then(function () {
      var fn = RPC[nombre];
      if (!fn) return { data: null, error: { message: 'Función no disponible en el demo: ' + nombre } };
      try { var d = fn(p || {}); guardar(); return { data: d === undefined ? null : d, error: null }; } catch (e) { return { data: null, error: { message: e.message } }; }
    });
  }

  /* ---------- Funciones "edge" simuladas ---------- */
  function fallo(msg, codigo) { return { data: null, error: { message: msg, context: { json: function () { return Promise.resolve({ error: msg, codigo: codigo }); } } } }; }
  var RESPUESTAS = [
    '¡Perfecto, muchas gracias! ¿Qué documentos necesito llevar?',
    'Gracias por responder 🙌 ¿Tienen cita disponible esta semana?',
    'Excelente, quedo atento(a). ¿Cuánto cuesta el servicio?',
    'Listo, le envío los papeles hoy en la tarde.'
  ];
  var respondidas = {};
  function analizar(c) {
    var msgs = tabla('mensajes_chat').filter(function (m) { return m.conversacion_id === c.id; });
    var texto = msgs.filter(function (m) { return m.direccion === 'entrante'; }).map(function (m) { return m.texto || ''; }).join(' ').toLowerCase();
    var svc = /tax|impuesto|declaraci/.test(texto) ? 'taxes' : /cr[eé]dito|score|bur[oó]/.test(texto) ? 'credito' : /llc|empresa|negocio/.test(texto) ? 'llc' : /green|permiso|ciudadan|uscis|inmigra/.test(texto) ? 'inmigracion' : /notar|poder/.test(texto) ? 'notaria' : c.servicio || null;
    var temp = /precio|cu[aá]nto|cita|hoy|ma[nñ]ana|urgente|agendar|disponible/.test(texto) ? 'caliente' : texto.length > 60 ? 'tibio' : 'frio';
    var nombre = c.nombre || (c.clientes && c.clientes.nombre) || '';
    var pn = String(nombre).split(' ')[0];
    var SUG = {
      taxes: 'Hola ' + pn + ', con gusto preparamos tu declaración. Trae tu ID, tu Seguro Social o ITIN y tus W-2/1099. ¿Te agendo una cita esta semana?',
      credito: 'Hola ' + pn + ', te ayudamos a revisar tus 3 reportes y a preparar las disputas. La primera consulta es sin costo. ¿Te parece si te llamo hoy?',
      llc: 'Hola ' + pn + ', registramos tu LLC, sacamos el EIN y te entregamos el Operating Agreement. ¿Ya tienes el nombre que quieres para tu empresa?',
      inmigracion: 'Hola ' + pn + ', preparamos tus formularios con la información que nos des (no somos abogados). ¿Qué trámite necesitas exactamente?',
      notaria: 'Hola ' + pn + ', notarizamos tu documento el mismo día. Solo trae tu ID vigente. ¿A qué hora te queda bien?'
    };
    return { temperatura: temp, servicio: svc, idioma: 'es', resumen: (pn || 'El contacto') + ' pregunta por ' + (svc ? { taxes: 'preparación de taxes', credito: 'reparación de crédito', llc: 'formar una LLC', inmigracion: 'un trámite migratorio', notaria: 'notaría' }[svc] : 'información general') + (temp === 'caliente' ? ' y quiere avanzar pronto.' : '.'),
      sugerencia: SUG[svc] || 'Hola ' + pn + ', gracias por escribirnos. ¿En qué te podemos ayudar hoy?', motivo: temp === 'caliente' ? 'Pregunta por precio o cita' : 'Conversación inicial', at: ahora() };
  }
  var FN = {
    'enviar-mensaje': function (b) {
      if (b.estado) return { whatsapp: true, meta: true, pagos: true, demo: true };
      if (b.cola_id) {
        var m = porId('cola_mensajes', b.cola_id); if (!m) return fallo('No existe');
        m.estado = 'enviado'; m.enviado_at = ahora();
        var tel = digitos(m.telefono);
        var c = tabla('conversaciones').filter(function (x) { return x.canal === 'whatsapp' && x.contacto === tel; })[0] || insertarFila('conversaciones', { canal: 'whatsapp', contacto: tel, nombre: m.nombre, cliente_id: m.cliente_id, etapa: m.cliente_id ? 'cliente' : 'nuevo' });
        insertarFila('mensajes_chat', { conversacion_id: c.id, direccion: 'saliente', texto: m.texto, automatico: true, estado: 'enviado' });
        return { ok: true };
      }
      var conv = porId('conversaciones', b.conversacion_id); if (!conv) return fallo('Conversación no encontrada');
      var msg = insertarFila('mensajes_chat', { conversacion_id: conv.id, direccion: 'saliente', texto: b.texto || (b.adjunto ? '[Archivo] ' + b.adjunto.nombre : ''), adjuntos: b.adjunto ? [b.adjunto] : [], estado: 'enviado' });
      setTimeout(function () { msg.estado = 'leido'; guardar(); }, 2500);
      if (!respondidas[conv.id]) {
        respondidas[conv.id] = 1;
        setTimeout(function () {
          insertarFila('mensajes_chat', { conversacion_id: conv.id, direccion: 'entrante', texto: RESPUESTAS[Math.floor(Math.random() * RESPUESTAS.length)] });
        }, 5000 + Math.random() * 4000);
      }
      return { ok: true, id: msg.id };
    },
    'ia-mensajes': function (b) {
      var c = porId('conversaciones', b.conversacion_id); if (!c) return fallo('No existe');
      tabla('mensajes_chat').forEach(function (m) {
        if (m.conversacion_id !== c.id) return;
        (m.adjuntos || []).forEach(function (a) { if (/^audio\//.test(a.tipo) && a.transcripcion == null) a.transcripcion = 'Hola, buenas tardes. Les escribo porque quiero saber qué necesito para hacer mis taxes este año. Trabajo con Uber y también tengo W-2. ¿Me pueden dar una cita? Gracias.'; });
      });
      c.ia = analizar(c); c.temperatura = c.ia.temperatura; c.ia_at = c.ia.at; if (!c.servicio && c.ia.servicio) c.servicio = c.ia.servicio;
      emitir('conversaciones', 'UPDATE', c);
      return { ia: c.ia };
    },
    'square-pago': function (b) {
      if (b.tipo === 'verificar') return { registrados: 0 };
      var cid = b.cliente_id;
      if (b.tipo === 'saldo') { var s = leerSesion(SES_PORTAL); cid = s && s.cliente_id; }
      if (!cid) return fallo('Cliente no encontrado');
      var monto = b.monto;
      if (b.tipo === 'saldo') {
        var casos = tabla('casos').filter(function (k) { return k.cliente_id === cid && k.estado !== 'cancelado' && k.precio != null; });
        var total = casos.reduce(function (a, k) { return a + Number(k.precio); }, 0);
        var pag = tabla('pagos').filter(function (p) { return p.cliente_id === cid; }).reduce(function (a, p) { return a + Number(p.monto); }, 0);
        monto = Math.max(0, Math.round((total - pag) * 100) / 100);
      }
      var id = uuid();
      var base = location.href.replace(/\/(admin|portal)\/.*$/, '/');
      var e = insertarFila('enlaces_pago', { id: id, cliente_id: cid, plan_id: b.plan_id || null, monto: monto, concepto: b.descripcion || 'Saldo pendiente', url: base + 'pago/?demo=' + id + (b.tipo === 'saldo' ? '&portal=1' : '') });
      return { url: e.url };
    },
    'portal-invitar': function (b) {
      var c = porId('clientes', b.cliente_id); if (!c || !c.email) return fallo('El cliente no tiene correo');
      db.portal_accesos = tabla('portal_accesos').filter(function (x) { return x.cliente_id !== c.id; });
      insertarFila('portal_accesos', { cliente_id: c.id, email: c.email });
      return { ok: true };
    },
    invitar: function (b) { return { estado: tabla('admins').some(function (a) { return a.email === b.email; }) ? 'existente' : 'enviado' }; },
    llamadas: function (b) {
      if (b.accion === 'token') return { token: 'demo-' + uuid() };
      if (b.accion === 'procesar') {
        var l = porId('llamadas', b.llamada_id); if (!l) return fallo('No existe');
        procesarLlamada(l);
        return { ok: true };
      }
      return fallo('Acción no disponible');
    }
  };
  function procesarLlamada(l) {
    var c = l.cliente_id ? porId('clientes', l.cliente_id) : null, n = c ? c.nombre : 'El cliente';
    l.ia_estado = 'listo';
    l.ia = {
      resumen: n + ' llamó para dar seguimiento a su trámite. Confirmó sus datos de contacto y quedó en enviar los documentos que faltan esta semana.',
      necesita: 'Avanzar con su caso y saber el costo total.',
      nombre_cliente: c ? [c.nombre, c.apellidos].filter(Boolean).join(' ') : 'Contacto nuevo',
      datos: [{ campo: 'Teléfono', valor: l.numero || '' }, { campo: 'Mejor horario', valor: 'Por las tardes, después de las 4 p. m.' }],
      documentos_pendientes: ['Identificación con foto vigente', 'Comprobante de domicilio reciente'],
      proximos_pasos: ['Enviar lista de documentos por WhatsApp', 'Confirmar cita para la próxima semana'],
      tareas: [{ titulo: 'Enviar lista de documentos a ' + n, en_dias: 0 }, { titulo: 'Llamar a ' + n + ' para confirmar cita', en_dias: 2 }]
    };
    l.transcripcion = 'Agente: Buenas tardes, gracias por llamar a ' + (M.nombreCompleto || 'la oficina') + '.\nCliente: Hola, buenas tardes, llamo para saber cómo va mi trámite.\nAgente: Claro, con gusto. ¿Me confirma su número de teléfono?\nCliente: Sí, es el ' + (l.numero || '') + '.\nAgente: Perfecto. Nos falta su identificación y un comprobante de domicilio.\nCliente: Se los mando esta semana por WhatsApp.\nAgente: Excelente, le agendo una cita para la próxima semana.';
    guardar();
  }
  function invocar(nombre, o) {
    o = o || {};
    return espera(250 + Math.random() * 450).then(function () {
      var fn = FN[nombre];
      if (!fn) return fallo('Función no disponible en el demo');
      try { var r = fn(o.body || {}); guardar(); if (r && r.error) return r; return { data: r, error: null }; } catch (e) { return fallo(e.message); }
    });
  }

  /* ---------- Línea telefónica simulada (en lugar del SDK de Twilio) ---------- */
  function Llamada(params) {
    var self = this, h = {}, mudo = false;
    this.parameters = params || {};
    this.on = function (ev, cb) { (h[ev] = h[ev] || []).push(cb); return self; };
    function disparar(ev) { (h[ev] || []).forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } }); }
    this.isMuted = function () { return mudo; };
    this.mute = function (m) { mudo = m; };
    this.sendDigits = function () {};
    this.accept = function () { disparar('accept'); };
    this.reject = function () { disparar('reject'); };
    this.disconnect = function () {
      var id = self.parameters.llamada;
      var l = id && porId('llamadas', id);
      if (l) {
        var seg = Math.max(8, Math.round((Date.now() - self.inicio) / 1000));
        l.estado = 'completada'; l.duracion_seg = seg;
        if (l.ia_estado === 'pendiente') { l.grabacion_path = 'demo/llamada-' + l.id + '.wav'; l.ia_estado = 'procesando'; setTimeout(function () { procesarLlamada(l); }, 3500); }
        guardar();
      }
      disparar('disconnect');
    };
    this.inicio = Date.now();
  }
  function Device() { this.audio = { incoming: function () {} }; var h = {}; this.on = function (ev, cb) { (h[ev] = h[ev] || []).push(cb); }; this.register = function () { return Promise.resolve(); }; this.updateToken = function () {};
    this.connect = function (o) {
      var c = new Llamada(o && o.params);
      var id = c.parameters.llamada, l = id && porId('llamadas', id);
      if (l) { l.estado = 'en_curso'; l.inicio = ahora(); guardar(); }
      return Promise.resolve(c);
    };
  }
  window.Twilio = { Device: Device };

  /* ---------- Cliente compatible con supabase-js ---------- */
  function crearCliente(url, key, opciones) {
    var portal = !!(opciones && opciones.portal);
    var cbs = [];
    function avisar(ev, s) { cbs.forEach(function (cb) { setTimeout(function () { cb(ev, s); }, 0); }); }
    var auth = {
      getSession: function () {
        var s = leerSesion(portal ? SES_PORTAL : SES);
        return Promise.resolve({ data: { session: s }, error: null });
      },
      getUser: function () { var s = leerSesion(portal ? SES_PORTAL : SES); return Promise.resolve({ data: { user: s && s.user }, error: null }); },
      signInWithPassword: function (c) {
        return espera(500).then(function () {
          var email = String((c && c.email) || '').trim().toLowerCase();
          var a = tabla('admins').filter(function (x) { return x.email === email && x.activo; })[0] || porId('admins', 'u-owner');
          var s = { user: { id: a.user_id, email: a.email }, access_token: 'demo' };
          escribirSesion(SES, s); avisar('SIGNED_IN', s);
          return { data: { session: s, user: s.user }, error: null };
        });
      },
      signInWithOtp: function (c) {
        return espera(500).then(function () {
          var email = String((c && c.email) || '').trim().toLowerCase();
          var acc = tabla('portal_accesos').filter(function (x) { return String(x.email).toLowerCase() === email; })[0] || tabla('portal_accesos')[0];
          var cid = acc ? acc.cliente_id : (tabla('clientes')[0] || {}).id;
          var s = { user: { id: 'p-' + cid, email: email }, cliente_id: cid };
          escribirSesion(SES_PORTAL, s); avisar('SIGNED_IN', s);
          return { data: {}, error: null };
        });
      },
      signOut: function () { escribirSesion(portal ? SES_PORTAL : SES, null); avisar('SIGNED_OUT', null); return Promise.resolve({ error: null }); },
      resetPasswordForEmail: function () { return Promise.resolve({ data: {}, error: null }); },
      updateUser: function () { return Promise.resolve({ data: {}, error: null }); },
      onAuthStateChange: function (cb) { cbs.push(cb); return { data: { subscription: { unsubscribe: function () { cbs = cbs.filter(function (x) { return x !== cb; }); } } } }; }
    };
    return {
      auth: auth,
      from: function (t) { return new Q(t); },
      rpc: rpc,
      functions: { invoke: invocar },
      storage: { from: storageDe },
      channel: function () {
        var mios = [];
        var ch = {
          on: function (tipo, filtro, cb) { var o = { table: filtro && filtro.table, event: filtro && filtro.event, cb: cb }; mios.push(o); oyentes.push(o); return ch; },
          subscribe: function () { return ch; },
          unsubscribe: function () { oyentes = oyentes.filter(function (o) { return mios.indexOf(o) === -1; }); }
        };
        return ch;
      },
      removeChannel: function (ch) { if (ch && ch.unsubscribe) ch.unsubscribe(); }
    };
  }
  window.supabase = { createClient: crearCliente };

  /* ---------- API REST para las páginas públicas (fetch a https://api.crm.local) ---------- */
  var fetchReal = window.fetch ? window.fetch.bind(window) : null;
  function respuesta(cuerpo, estado) { return new Response(cuerpo == null ? '' : JSON.stringify(cuerpo), { status: estado || 200, headers: { 'Content-Type': 'application/json' } }); }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (/^https:\/\/formsubmit\.co\//.test(url)) return Promise.resolve(respuesta({ success: true, demo: true }));
    if (url.indexOf(API) !== 0) return fetchReal(input, init);
    init = init || {};
    var u = new URL(url), ruta = u.pathname.replace(/^\/rest\/v1\//, ''), metodo = (init.method || 'GET').toUpperCase();
    var cuerpo = null; try { cuerpo = init.body ? JSON.parse(init.body) : null; } catch (_) { /* */ }
    if (/^rpc\//.test(ruta)) {
      return rpc(ruta.slice(4), cuerpo).then(function (r) { return r.error ? respuesta({ message: r.error.message }, 400) : respuesta(r.data); });
    }
    var q = new Q(ruta);
    if (metodo === 'GET') {
      q.select(u.searchParams.get('select') || '*');
      u.searchParams.forEach(function (v, k) {
        if (k === 'select') return;
        if (k === 'order') { v.split(',').forEach(function (o) { var p = o.split('.'); q.order(p[0], { ascending: p[1] !== 'desc' }); }); return; }
        if (k === 'limit') { q.limit(Number(v)); return; }
        var i = v.indexOf('.'); q.filter(k, v.slice(0, i), v.slice(i + 1));
      });
      if (ruta === 'sitio_items') q.eq('visible', true);
      return q.then(function (r) { return respuesta(r.data); });
    }
    if (metodo === 'POST') {
      var permitidas = { mensajes_web: 1, solicitudes: 1 };
      if (!permitidas[ruta]) return Promise.resolve(respuesta({ message: 'No permitido' }, 403));
      return q.insert(cuerpo).then(function (r) { guardarYa(); return r.error ? respuesta({ message: r.error.message }, 400) : respuesta(null, 201); });
    }
    return Promise.resolve(respuesta({ message: 'No permitido' }, 405));
  };

  /* Subida de archivos desde las páginas públicas, con progreso simulado */
  function subirPublico(bucket, path, file, progreso) {
    return new Promise(function (ok) {
      var p = 0;
      var t = setInterval(function () {
        p = Math.min(100, p + 12 + Math.random() * 22);
        if (progreso) progreso(Math.round(p));
        if (p >= 100) { clearInterval(t); guardarArchivo(bucket + '/' + path, file).then(function () { ok({ path: path }); }); }
      }, 90);
    });
  }

  /* ---------- Cambios desde otra pestaña (por ejemplo, el sitio público) ---------- */
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY || !e.newValue) return;
    var antes = db;
    try { db = JSON.parse(e.newValue); } catch (_) { return; }
    var nuevos = {};
    ['solicitudes', 'mensajes_web', 'formulario_respuestas', 'citas', 'mensajes_chat', 'contratos', 'pagos', 'documentos'].forEach(function (t) {
      var ids = {}; (antes[t] || []).forEach(function (r) { ids[r.id] = 1; });
      var n = (db[t] || []).filter(function (r) { return !ids[r.id]; });
      if (n.length) nuevos[t] = n;
    });
    (db.contratos || []).forEach(function (k) { var a = (antes.contratos || []).filter(function (x) { return x.id === k.id; })[0]; if (a && a.estado !== k.estado) (nuevos.contratos_firmados = nuevos.contratos_firmados || []).push(k); });
    window.dispatchEvent(new CustomEvent('crm:externo', { detail: nuevos }));
    (nuevos.mensajes_chat || []).forEach(function (m) { var c = porId('conversaciones', m.conversacion_id); if (c) emitir('conversaciones', 'UPDATE', c); });
  });

  /* ---------- Datos de ejemplo ---------- */
  function sembrar() {
    var R = rnd(20261019);
    function elegir(l) { return l[Math.floor(R() * l.length)]; }
    var d = {};
    Object.keys(DEF).concat(['admins', 'admin_emails', 'ajustes', 'actividad', 'puntajes', 'documentos', 'portal_accesos', 'integraciones_eventos', 'respuestas_rapidas', 'contenido_comentarios']).forEach(function (t) { d[t] = []; });
    db = d;
    var marca = M.nombreCompleto || 'Nexo Multiservicios';

    d.admins = [
      { user_id: 'u-owner', email: M.emailDemo || 'demo@tudominio.com', nombre: M.duena || 'Laura Méndez', rol: 'admin', permisos: [], activo: true, acceso_hasta: null, created_at: ts(-420) },
      { user_id: 'u-carlos', email: 'carlos@tudominio.com', nombre: 'Carlos Rivera', rol: 'miembro', permisos: ['solicitudes', 'clientes', 'casos', 'documentos', 'cobros', 'tareas', 'mensajes', 'llamadas', 'campanas', 'citas', 'contenido'], activo: true, acceso_hasta: null, created_at: ts(-300) },
      { user_id: 'u-sofia', email: 'sofia@tudominio.com', nombre: 'Sofía Ortiz', rol: 'miembro', permisos: ['solicitudes', 'mensajes', 'campanas'], activo: true, acceso_hasta: null, created_at: ts(-120) }
    ];
    d.admin_emails = [{ email: 'valeria@tudominio.com', nombre: 'Valeria Cruz', rol: 'miembro', permisos: ['taxes', 'tareas'], created_at: ts(-2) }];

    d.ajustes = [
      { clave: 'negocio', valor: { link_resena: 'https://g.page/r/tu-negocio/review', descuento_referido: '$25', zelle: M.email || 'pagos@tudominio.com', telefono: M.telefono || '(713) 555-0147', link_portal: '' } },
      { clave: 'citas', valor: { duracion: 30, anticipacion_horas: 4, servicios: ['Taxes', 'Reparación de crédito', 'Formación de LLC', 'Inmigración', 'Notaría', 'Consulta general'], horario: { 1: ['09:00', '18:00'], 2: ['09:00', '18:00'], 3: ['09:00', '18:00'], 4: ['09:00', '18:00'], 5: ['09:00', '17:00'], 6: ['10:00', '14:00'] } } },
      { clave: 'checklists', valor: {
        credito: ['Identificación con foto', 'Comprobante de domicilio', 'Tarjeta de Seguro Social', 'Acceso al monitor de crédito'],
        taxes: ['ID con foto', 'SSN o ITIN', 'W-2 / 1099', 'Declaración del año anterior'],
        llc: ['ID de cada socio', 'Nombre de la empresa (3 opciones)', 'Dirección del negocio'],
        inmigracion: ['Pasaporte', 'Documento actual (permiso / green card)', 'Fotos tamaño pasaporte'],
        contabilidad: ['Estados de cuenta del mes', 'Recibos de gastos'], plan_irs: ['Carta del IRS', 'Comprobante de ingresos'], franchise_tax: ['Ingresos anuales de la LLC'], otro: ['ID con foto'], notaria: ['ID con foto'] } },
      { clave: 'whatsapp', valor: {
        envio_automatico: false,
        fuera_horario: { activo: true, mensaje: '¡Hola! Gracias por escribir a ' + marca + '. Ahora estamos fuera de horario; te respondemos a primera hora.', horario: { 1: ['09:00', '18:00'], 2: ['09:00', '18:00'], 3: ['09:00', '18:00'], 4: ['09:00', '18:00'], 5: ['09:00', '17:00'] } },
        aviso_etapa: { activo: true, mensaje: 'Hola {nombre}, te contamos que tu {servicio} avanzó a la etapa: {etapa}. Cualquier duda, aquí estamos.' },
        recordatorio_documentos: { activo: true, mensaje: 'Hola {nombre}, para avanzar con tu {servicio} nos falta: {faltan}. Puedes subirlos aquí: {link_portal}' },
        recordatorio_pago: { activo: true, mensaje: 'Hola {nombre}, te recordamos tu pago de {monto} de {servicio} el {fecha}. ¡Gracias!' },
        recordatorio_cita: { activo: true, mensaje: 'Hola {nombre}, te esperamos mañana {fecha} a las {hora}. Si no puedes venir, avísanos.' },
        resena: { activo: false, mensaje: 'Hola {nombre}, ¡gracias por confiar en nosotros! ¿Nos dejas una reseña? {link_resena}' },
        franchise_tax: { activo: true, mensaje: 'Hola {nombre}, el Franchise Tax de tu LLC vence el 15 de mayo. Envíanos tus ingresos del año para presentarlo a tiempo.' },
        seguimiento: { activo: true, dias: [2, 5, 7], mensaje: 'Hola {nombre}, ¿pudiste revisar la información de {servicio}? Si quieres te aparto una cita esta semana.' }
      } }
    ];

    var NOM = [['María', 'González Ruiz'], ['José', 'Hernández'], ['Daniela', 'Castillo'], ['Luis', 'Ramírez Soto'], ['Gabriela', 'Morales'], ['Jorge', 'Vargas'], ['Ana Lucía', 'Pérez'], ['Miguel', 'Torres Díaz'], ['Paola', 'Jiménez'], ['Ricardo', 'Flores'],
      ['Valentina', 'Rojas'], ['Andrés', 'Medina'], ['Camila', 'Navarro'], ['Fernando', 'Salazar'], ['Lucía', 'Herrera'], ['Héctor', 'Domínguez'], ['Isabel', 'Aguilar'], ['Raúl', 'Mendoza'], ['Carolina', 'Silva'], ['Diego', 'Castro'],
      ['Mónica', 'Ortega'], ['Javier', 'Guzmán'], ['Patricia', 'Reyes'], ['Óscar', 'Cabrera'], ['Natalia', 'Vega'], ['Eduardo', 'Campos'], ['Sandra', 'Ríos'], ['Alberto', 'Luna']];
    var CIU = [['Houston', 'TX', '77036'], ['Houston', 'TX', '77081'], ['Pasadena', 'TX', '77506'], ['Katy', 'TX', '77449'], ['Sugar Land', 'TX', '77478'], ['Dallas', 'TX', '75211'], ['San Antonio', 'TX', '78207'], ['Miami', 'FL', '33135'], ['Austin', 'TX', '78744']];
    var ORG = ['whatsapp', 'whatsapp', 'referido', 'meta_ads', 'instagram', 'facebook', 'walk_in', 'sitio_web', 'google', 'tiktok'];
    var DIAS = [-330, -300, -280, -250, -230, -200, -185, -160, -140, -120, -110, -95, -80, -70, -60, -52, -45, -38, -30, -24, -18, -12, -9, -6, -4, -3, -2, -1];
    var cl = NOM.map(function (n, i) {
      var c = CIU[i % CIU.length];
      var tel = '(' + (c[1] === 'FL' ? '305' : '713') + ') 555-01' + String(10 + i).padStart(2, '0');
      return { id: uuid(), created_at: ts(DIAS[i], 9 + (i % 8)), nombre: n[0], apellidos: n[1], telefono: tel, tel_digitos: digitos(tel),
        email: n[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '') + '.' + n[1].split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '') + '@example.com',
        fecha_nacimiento: (1965 + (i * 7) % 35) + '-' + String(1 + i % 12).padStart(2, '0') + '-' + String(3 + (i * 5) % 25).padStart(2, '0'),
        origen: ORG[i % ORG.length], idioma: i % 6 === 5 ? 'en' : 'es', etiquetas: i % 5 === 0 ? ['VIP'] : i % 7 === 2 ? ['Referido'] : [],
        direccion: (1200 + i * 37) + ' ' + elegir(['Bellaire Blvd', 'Westheimer Rd', 'Main St', 'Hillcroft Ave', 'Gessner Rd', 'Fondren Rd']), ciudad: c[0], region: c[1], codigo_postal: c[2],
        referido_por: null, notas: null, solicitud_id: null, updated_at: ts(DIAS[i]) };
    });
    cl[6].referido_por = cl[0].id; cl[14].referido_por = cl[0].id; cl[20].referido_por = cl[3].id;
    cl[0].notas = 'Cliente desde el año pasado. Prefiere que le escriban por WhatsApp en las tardes.';
    d.clientes = cl;

    var CASOS = [
      [0, 'credito', 'Ronda 3', 1200], [0, 'taxes', 'Reembolso', 250, 'completado'], [1, 'taxes', 'Preparando', 220], [2, 'llc', 'EIN', 650], [3, 'credito', 'Ronda 1', 1200],
      [4, 'inmigracion', 'Enviado', 450], [5, 'taxes', 'Documentos pendientes', 180], [6, 'credito', 'Análisis', 990], [7, 'contabilidad', 'Conciliar', 300], [7, 'llc', 'Entregado', 650, 'completado'],
      [8, 'notaria', 'Completado', 45, 'completado'], [9, 'taxes', 'Revisión', 350], [10, 'inmigracion', 'Documentos pendientes', 380], [11, 'plan_irs', 'Aprobado', 400], [12, 'credito', 'Ronda 2', 1200],
      [13, 'llc', 'Registro en Texas', 650], [14, 'taxes', 'Firmado', 200], [15, 'franchise_tax', 'Preparando', 150], [16, 'otro', 'En proceso', 120], [17, 'taxes', 'Aceptado', 275, 'completado'],
      [18, 'credito', 'Contrato', 1200], [19, 'inmigracion', 'En proceso', 520], [20, 'taxes', 'Preparando', 240], [21, 'llc', 'Datos', 650], [22, 'credito', 'Ronda 4', 1200],
      [23, 'taxes', 'Documentos pendientes', 190], [24, 'contabilidad', 'Reporte', 300], [25, 'inmigracion', 'Preparando', 450], [26, 'taxes', 'Enviado', 260], [27, 'credito', 'Finalizado', 1200, 'completado'],
      [3, 'taxes', 'Reembolso', 210, 'completado'], [12, 'llc', 'Operating Agreement', 650]
    ];
    var RESP = ['u-owner', 'u-owner', 'u-carlos', 'u-owner', 'u-carlos'];
    var aj2 = d.ajustes[2].valor;
    var cs = CASOS.map(function (x, i) {
      var c = cl[x[0]], s = x[1], est = x[4] || 'activo';
      var ini = new Date(c.created_at); ini.setDate(ini.getDate() + 1);
      var lista = (aj2[s] || []).map(function (doc, j) { return { d: doc, e: est !== 'activo' ? 'recibido' : (j < 1 + (i % 3) ? 'recibido' : (i % 4 === 1 && j === (aj2[s].length - 1) ? 'enviado' : 'falta')) }; });
      var datos = {};
      if (s === 'taxes') datos = { anio: new Date().getFullYear() - 1, tipo: i % 3 === 0 ? 'negocio' : 'individual', resultado: est === 'completado' ? 'reembolso' : null, monto: est === 'completado' ? 1800 + i * 90 : null };
      if (s === 'credito') datos = { fecha_contrato: isoLocal(ini), proxima_ronda: x[2].indexOf('Ronda') === 0 ? dia((i % 5) - 1) : null };
      if (s === 'inmigracion') datos = { tramite: ['I-765 Permiso de trabajo', 'I-90 Renovación de green card', 'N-400 Ciudadanía'][i % 3], numero_recibo: 'IOE0' + (912345670 + i), fecha_vencimiento: dia(8 + i * 3) };
      if (s === 'llc') datos = { nombre_llc: c.apellidos.split(' ')[0] + ' ' + elegir(['Services', 'Group', 'Construction', 'Cleaning', 'Logistics']) + ' LLC', ein: x[2] === 'Entregado' || x[2] === 'Operating Agreement' ? '88-' + (1000000 + i * 4321) : null };
      if (s === 'plan_irs') datos = { monto_deuda: 6400, pago_mensual: 210, dia_pago: 15, numero_plan: 'IA-2291' };
      if (s === 'franchise_tax') datos = { anio: new Date().getFullYear(), ingresos: 148000 };
      if (s === 'contabilidad') datos = { periodo: isoLocal(new Date()).slice(0, 7) };
      return { id: uuid(), cliente_id: c.id, servicio: s, etapa: x[2], estado: est, titulo: s === 'taxes' ? 'Taxes ' + (new Date().getFullYear() - 1) : null, responsable: RESP[i % RESP.length], precio: x[3],
        fecha_inicio: isoLocal(ini), fecha_entrega: est === 'activo' && i % 3 === 0 ? dia((i % 7) - 2) : null, notas: null, datos: datos, checklist: lista, created_at: ini.toISOString(), updated_at: ts(-(i % 9), 11) };
    });
    d.casos = cs;

    // Pagos de los últimos 6 meses
    var MET = ['zelle', 'zelle', 'efectivo', 'tarjeta', 'cashapp', 'transferencia', 'zelle', 'efectivo'];
    var pagos = [], hoyMs = Date.now();
    cs.forEach(function (k, i) {
      var precio = Number(k.precio), fr = k.estado === 'completado' ? 1 : [0.5, 0.25, 0.4, 0, 0.65, 0.8][i % 6];
      var partes = k.servicio === 'credito' || k.servicio === 'contabilidad' ? 3 + (i % 3) : (fr === 1 ? 1 + (i % 2) : (fr ? 1 : 0));
      if (!fr || !partes) return;
      var total = Math.round(precio * fr), cuota = Math.round(total / partes);
      var ini = Math.max(new Date(k.created_at).getTime(), hoyMs - 170 * 86400000);
      for (var j = 0; j < partes; j++) {
        var f = new Date(ini + (j + 1) / (partes + 0.4) * (hoyMs - ini));
        pagos.push({ id: uuid(), cliente_id: k.cliente_id, caso_id: k.id, monto: j === partes - 1 ? total - cuota * (partes - 1) : cuota, fecha: isoLocal(f), metodo: MET[(i + j) % MET.length], nota: partes > 1 ? 'Cuota ' + (j + 1) + ' de ' + partes : null, token: uuid(), created_at: f.toISOString() });
      }
    });
    [3, 9, 15, 21].forEach(function (i, j) { pagos.push({ id: uuid(), cliente_id: cs[i].cliente_id, caso_id: cs[i].id, monto: 120 + j * 35, fecha: dia(-(j * 2 + 1)), metodo: MET[j + 2], nota: null, token: uuid(), created_at: ts(-(j * 2 + 1)) }); });
    pagos.sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; }).forEach(function (p, i) { p.numero = 1001 + i; });
    d.pagos = pagos;

    // Puntajes y disputas de crédito
    cs.filter(function (k) { return k.servicio === 'credito' && k.etapa !== 'Contrato'; }).forEach(function (k, i) {
      var base = 548 + i * 17, n = { 'Análisis': 1, 'Ronda 1': 2, 'Ronda 2': 3, 'Ronda 3': 4, 'Ronda 4': 5, 'Finalizado': 6 }[k.etapa] || 2;
      for (var j = 0; j < n; j++) {
        var f = new Date(k.created_at); f.setDate(f.getDate() + j * 32);
        if (f > new Date()) f = new Date();
        d.puntajes.push({ id: uuid(), caso_id: k.id, fecha: isoLocal(f), equifax: base + j * 24 + (j ? 6 : 0), experian: base + 10 + j * 21, transunion: base - 6 + j * 27, created_at: f.toISOString() });
      }
      var ACR = ['Capital One', 'Midland Credit', 'Portfolio Recovery', 'Synchrony Bank', 'LVNV Funding', 'Credit One Bank'];
      for (var r = 1; r <= Math.min(n, 3); r++) {
        ['equifax', 'experian', 'transunion'].forEach(function (b, z) {
          if ((r + z + i) % 2) return;
          var fe = new Date(k.created_at); fe.setDate(fe.getDate() + 5 + (r - 1) * 32); if (fe > new Date()) fe = new Date(Date.now() - 20 * 86400000);
          var lim = new Date(fe); lim.setDate(lim.getDate() + 30);
          var ultima = r === Math.min(n, 3);
          if (ultima) { fe = new Date(Date.now() - (12 + ((i * 7 + z * 5) % 18)) * 86400000); lim = new Date(fe); lim.setDate(lim.getDate() + 30); }
          d.disputas.push({ id: uuid(), caso_id: k.id, ronda: r, buro: b, acreedor: ACR[(i + r + z) % ACR.length], tipo: ['coleccion', 'cuenta', 'pago_tarde', 'consulta'][(r + z) % 4], fecha_envio: isoLocal(fe), fecha_limite: isoLocal(lim),
            resultado: ultima ? 'pendiente' : ['eliminado', 'corregido', 'verificado', 'eliminado'][(i + z) % 4], created_at: fe.toISOString() });
        });
      }
    });

    // Tareas
    var TAR = [['Llamar a {n} para pedir el W-2 que falta', -2], ['Enviar contrato de crédito a {n}', -1], ['Revisar reportes de crédito de {n}', 0], ['Confirmar cita de {n} por WhatsApp', 0], ['Preparar formulario I-765 de {n}', 0],
      ['Subir Articles of Organization de {n}', 1], ['Mandar recordatorio de pago a {n}', 2], ['Conciliar estados de cuenta de {n}', 3], ['Revisar respuesta del buró para {n}', 5], ['Pedir referencias a {n}', 9], ['Actualizar notas de {n}', null]];
    TAR.forEach(function (t, i) {
      var k = cs[(i * 3) % cs.length], c = porId('clientes', k.cliente_id);
      d.tareas.push({ id: uuid(), titulo: t[0].replace('{n}', c.nombre), fecha: t[1] == null ? null : dia(t[1]), asignada_a: i % 4 === 3 ? 'u-carlos' : 'u-owner', cliente_id: c.id, caso_id: k.id, hecha: false, detalle: null, created_at: ts(-3 - i) });
    });
    d.tareas.push({ id: uuid(), titulo: 'Seguimiento: Rosa escribió por Instagram y no ha agendado', fecha: dia(0), asignada_a: 'u-owner', cliente_id: null, caso_id: null, hecha: false, enlace: 'bandeja/chats', detalle: 'Mensaje sugerido:\nHola Rosa, ¿pudiste revisar la información? Si quieres te aparto una cita esta semana.', created_at: ts(-1) });
    d.tareas.push({ id: uuid(), titulo: 'Enviar factura del mes a ' + cl[7].nombre, fecha: dia(-6), asignada_a: 'u-owner', cliente_id: cl[7].id, hecha: true, hecha_at: ts(-5), created_at: ts(-8) });

    // Citas de esta semana y la próxima
    var SERV_C = ['Taxes', 'Reparación de crédito', 'Formación de LLC', 'Inmigración', 'Notaría', 'Consulta general'];
    [[0, 10, 'confirmada'], [0, 15, 'solicitada'], [1, 9, 'confirmada'], [1, 11, 'confirmada'], [2, 13, 'solicitada'], [3, 10, 'confirmada'], [4, 16, 'confirmada'], [6, 10, 'solicitada'], [8, 12, 'confirmada'], [-1, 11, 'completada'], [-2, 15, 'no_asistio'], [-3, 10, 'completada']].forEach(function (x, i) {
      var c = cl[(i * 5 + 2) % cl.length], ini = x[0] < 0 ? ts(x[0], x[1], i % 2 ? 30 : 0) : tsF(x[0], x[1], i % 2 ? 30 : 0);
      d.citas.push({ id: uuid(), nombre: c.nombre + ' ' + c.apellidos, telefono: c.telefono, email: c.email, servicio: SERV_C[i % SERV_C.length], inicio: ini, fin: new Date(new Date(ini).getTime() + 30 * 60000).toISOString(), estado: x[2], origen: i % 3 ? 'web' : 'panel', cliente_id: c.id, notas: null, created_at: ts(x[0] - 3) });
    });

    // Conversaciones
    var CONV = [
      ['whatsapp', cl[1], 'cliente', 'tibio', 'taxes', [['in', 'Hola buenas, ¿ya tienen listos mis taxes?', -1, 15], ['out', '¡Hola José! Estamos en la revisión final, mañana te confirmamos.', -1, 16], ['in', 'Perfecto, muchas gracias 🙏', 0, 9]], 1],
      [null, { n: 'Rosa Elena Paz', t: '7135550198' }, 'interesado', 'caliente', 'credito', [['in', 'Hola, vi su anuncio. ¿Cuánto cuesta la reparación de crédito?', -2, 18], ['out', 'Hola Rosa, la primera consulta es gratis. ¿Te agendo una cita?', -2, 18], ['in', 'Sí por favor, ¿tienen mañana en la tarde?', 0, 10]], 2, 'instagram'],
      ['whatsapp', cl[4], 'cliente', 'tibio', 'inmigracion', [['in', 'Buen día, ¿llegó alguna carta de USCIS?', -3, 11], ['out', 'Hola Gabriela, todavía no. Te avisamos apenas llegue.', -3, 12]], 0],
      [null, { n: 'Pedro Alvarado', t: '7135550177' }, 'nuevo', 'caliente', 'taxes', [['in', 'Buenas tardes, quiero hacer mis taxes, trabajo con Uber. ¿Qué necesito?', 0, 8]], 1, 'whatsapp', true],
      ['messenger', cl[11], 'cliente', 'frio', 'llc', [['in', 'Hola, una pregunta sobre mi LLC', -5, 14], ['out', 'Claro Andrés, dime.', -5, 14], ['in', '¿El EIN tarda mucho?', -5, 15], ['out', 'Normalmente sale el mismo día que lo pedimos.', -5, 15]], 0],
      [null, { n: 'Karla Méndez', t: '3055550133' }, 'cita', 'caliente', 'notaria', [['in', 'Necesito notarizar un permiso de viaje para mi hija', -1, 12], ['out', 'Con gusto Karla. ¿Te queda bien el jueves a las 10?', -1, 12], ['in', 'Sí, ahí estaré. Gracias', -1, 13]], 0, 'whatsapp'],
      ['instagram', cl[19], 'cliente', 'tibio', 'inmigracion', [['in', '¡Gracias por todo! Ya me llegó el permiso de trabajo 🎉', -7, 17], ['out', '¡Qué alegría Diego! Felicidades 🙌', -7, 17]], 0],
      [null, { n: 'Marco Antonio Ruiz', t: '7135550166' }, 'no_interesado', 'frio', null, [['in', '¿Hacen trámites de licencia de manejo?', -10, 10], ['out', 'Hola Marco, ese trámite no lo hacemos, pero te recomendamos ir al DPS.', -10, 11]], 0, 'whatsapp'],
      [null, { n: 'Lorena Sánchez', t: '7135550155' }, 'interesado', 'tibio', 'llc', [['in', 'Hola, quiero abrir una empresa de limpieza. ¿Me ayudan con la LLC?', -2, 9], ['out', '¡Claro Lorena! Te mando la información.', -2, 10]], 0, 'messenger']
    ];
    CONV.forEach(function (x, i) {
      var esCli = !!x[1].id;
      var canal = x[0] || x[7] || 'whatsapp';
      var c = { id: uuid(), canal: canal, contacto: canal === 'whatsapp' ? (esCli ? '1' + x[1].tel_digitos : '1' + x[1].t) : String(1000000000000 + i * 7919), nombre: esCli ? x[1].nombre + ' ' + x[1].apellidos : x[1].n, cliente_id: esCli ? x[1].id : null,
        etapa: x[2], temperatura: x[3], servicio: x[4], no_leidos: Number(x[6]) || 0, prospecto: !esCli, asignado_a: i % 3 ? 'u-owner' : 'u-sofia', seguimientos: x[2] === 'interesado' ? [2] : [], created_at: ts(x[5][0][2] - 1) };
      d.conversaciones.push(c);
      x[5].forEach(function (m, j) {
        var at = ts(m[2], m[3], 5 + j * 7);
        var msj = { id: uuid(), conversacion_id: c.id, direccion: m[0] === 'in' ? 'entrante' : 'saliente', texto: m[1], estado: m[0] === 'out' ? 'leido' : 'recibido', adjuntos: [], created_at: at };
        if (x[8] && j === 0) { msj.adjuntos = [{ path: c.id + '/nota-de-voz.ogg', nombre: 'nota-de-voz.ogg', tipo: 'audio/ogg', tam: 48213 }]; }
        d.mensajes_chat.push(msj);
        c.ultimo_texto = m[1]; c.ultimo_at = at;
        if (m[0] === 'in') c.ultimo_entrante_at = at; else c.ultimo_saliente_at = at;
      });
    });
    d.conversaciones[1].ia = { temperatura: 'caliente', servicio: 'credito', idioma: 'es', resumen: 'Rosa vio el anuncio y quiere una cita mañana en la tarde para reparación de crédito.', sugerencia: 'Hola Rosa, ¡claro! Mañana tenemos a las 4:00 o 5:30 p. m. ¿Cuál te queda mejor?', motivo: 'Pide cita', at: ts(0, 10, 30) };
    d.conversaciones[1].ia_at = d.conversaciones[1].ia.at;

    d.cola_mensajes = [
      { id: uuid(), tipo: 'recordatorio_cita', cliente_id: cl[7].id, nombre: cl[7].nombre + ' ' + cl[7].apellidos, telefono: cl[7].telefono, texto: 'Hola ' + cl[7].nombre + ', te esperamos mañana a las 9:00 a. m. Si no puedes venir, avísanos.', estado: 'pendiente', programado_para: ts(0, 8), created_at: ts(0, 7), intentos: 0 },
      { id: uuid(), tipo: 'recordatorio_documentos', cliente_id: cl[5].id, nombre: cl[5].nombre + ' ' + cl[5].apellidos, telefono: cl[5].telefono, texto: 'Hola ' + cl[5].nombre + ', para avanzar con tus taxes nos falta: W-2 / 1099. Puedes subirlos en tu portal.', estado: 'pendiente', programado_para: ts(-1, 9), created_at: ts(-1, 9), intentos: 0 },
      { id: uuid(), tipo: 'recordatorio_pago', cliente_id: cl[12].id, nombre: cl[12].nombre + ' ' + cl[12].apellidos, telefono: cl[12].telefono, texto: 'Hola ' + cl[12].nombre + ', te recordamos tu pago de $200 de reparación de crédito el día 15. ¡Gracias!', estado: 'pendiente', programado_para: tsF(1, 9), created_at: ts(0, 6), intentos: 0 }
    ];
    d.respuestas_rapidas = [
      { id: uuid(), titulo: 'Saludo', texto: '¡Hola {nombre}! Gracias por escribir a ' + marca + '. ¿En qué te podemos ayudar?', orden: 1 },
      { id: uuid(), titulo: 'Horario', texto: 'Atendemos de lunes a viernes de 9:00 a 6:00 y los sábados de 10:00 a 2:00.', orden: 2 },
      { id: uuid(), titulo: 'Documentos taxes', texto: 'Para tus taxes trae: ID con foto, SSN o ITIN, W-2 o 1099 y la declaración del año pasado.', orden: 3 },
      { id: uuid(), titulo: 'Agendar cita', texto: 'Puedes reservar tu cita aquí: ' + location.href.replace(/\/(admin|portal|citas)\/.*$/, '/') + 'citas/', orden: 4 },
      { id: uuid(), titulo: 'Gracias', texto: '¡Gracias {nombre}! Cualquier cosa, aquí estamos.', orden: 5 }
    ];

    d.sitio_items = [
      { id: uuid(), tipo: 'anuncio', clave: 'anuncio', texto: '¡Temporada de taxes abierta! Agenda tu cita hoy.', visible: true, orden: 0 },
      { id: uuid(), tipo: 'servicio', clave: 'inmigracion', titulo: 'Documentos migratorios', precio: '$150', visible: true, orden: 1 },
      { id: uuid(), tipo: 'servicio', clave: 'taxes', titulo: 'Taxes', precio: '$99', visible: true, orden: 2 },
      { id: uuid(), tipo: 'servicio', clave: 'llc', titulo: 'Formación de LLC', precio: '$499', visible: true, orden: 3 },
      { id: uuid(), tipo: 'servicio', clave: 'notaria', titulo: 'Notaría', precio: '$25', visible: true, orden: 4 },
      { id: uuid(), tipo: 'servicio', clave: 'credito', titulo: 'Reparación de crédito', precio: null, visible: true, orden: 5 },
      { id: uuid(), tipo: 'testimonio', titulo: 'Reparación de crédito', texto: 'En seis meses subí más de 90 puntos y por fin pude comprar mi carro. Siempre me explicaron cada paso.', autor: 'María G.', visible: true, orden: 10 },
      { id: uuid(), tipo: 'testimonio', titulo: 'Formación de LLC', texto: 'Abrí mi empresa de construcción en una semana. Me ayudaron con todo, hasta con el EIN.', autor: 'Jorge V.', visible: true, orden: 11 },
      { id: uuid(), tipo: 'testimonio', titulo: 'Taxes', texto: 'Rápidos, claros y en español. Mi reembolso llegó antes de lo que esperaba.', autor: 'Paola J.', visible: true, orden: 12 },
      { id: uuid(), tipo: 'faq', titulo: '¿Puedo pagar en cuotas?', texto: 'Sí. En reparación de crédito y contabilidad trabajamos con pagos mensuales. Te damos todo por escrito.', visible: true, orden: 20 }
    ];

    // Solicitudes del formulario de inicio y mensajes del sitio
    [['Rebeca', 'Lozano', 'nuevo', 0], ['Tomás', 'Quintero', 'nuevo', -1], ['Elena', 'Fuentes', 'en_proceso', -4], ['Mario', 'Esquivel', 'completado', -15]].forEach(function (x, i) {
      d.solicitudes.push({ id: uuid(), created_at: ts(x[3], 10 + i), estado: x[2], objetivos: [['Comprar casa', 'Comprar carro'], ['Tarjetas de crédito'], ['Comprar casa'], ['Préstamo personal', 'Rentar apartamento']][i],
        nombre: x[0], apellidos: x[1], email: x[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '') + '@example.com', telefono: '(713) 555-02' + (40 + i), fecha_nacimiento: '198' + i + '-0' + (i + 3) + '-1' + i,
        empleador: ['Restaurante El Sol', 'Construcciones RG', 'Hospital Memorial', 'Uber'][i], direccion: (800 + i * 51) + ' Gessner Rd', direccion_postal: null, pais: 'Estados Unidos', region: 'TX', ciudad: 'Houston', codigo_postal: '7703' + i,
        documentos: { licencia: 'inicio/demo/licencia-' + i + '.pdf', factura: 'inicio/demo/factura-' + i + '.pdf' }, autoriza_credito: true, acepta_marketing: i % 2 === 0, notas: null,
        privado: { ssn: '•••-••-' + (4021 + i * 113), monitor_credito: 'usuario: ' + x[0].toLowerCase() + '.demo · clave: Demo' + (2024 + i) } });
    });
    [['Sergio Bautista', 'Taxes', 'nuevo', 0, 'sitio_web', 'Hola, quiero saber el precio de los taxes de negocio propio.'], ['Adriana Ponce', 'Reparación de crédito', 'nuevo', -1, 'meta_ads', null],
      ['Kevin Morales', 'LLC', 'atendido', -3, 'sitio_web', 'Necesito abrir una LLC para mi negocio de comida.'], ['Laura Peña', 'Documentos migratorios', 'nuevo', 0, 'meta_ads', null], ['Iván Rosales', 'Notaría', 'archivado', -12, 'sitio_web', '¿Abren los sábados?']].forEach(function (x, i) {
      d.mensajes_web.push({ id: uuid(), created_at: ts(x[3], 9 + i * 2), nombre: x[0], telefono: '(713) 555-03' + (10 + i), email: x[0].split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '') + '@example.com', servicio: x[1], estado: x[2], origen: x[4], mensaje: x[5], idioma: 'Español', cliente_id: null });
    });

    // Formularios
    function C(id, tipo, etiqueta, o) { return Object.assign({ id: id, tipo: tipo, etiqueta: etiqueta, requerido: false }, o || {}); }
    var contacto = function () { return [C('s1', 'seccion', 'Tus datos', { ayuda: 'Para poder contactarte.' }), C('n', 'texto', 'Nombre', { requerido: true, mapa: 'nombre' }), C('a', 'texto', 'Apellidos', { requerido: true, mapa: 'apellidos' }), C('t', 'telefono', 'Teléfono', { requerido: true, mapa: 'telefono' }), C('e', 'email', 'Correo electrónico', { mapa: 'email' })]; };
    var fTax = { id: uuid(), slug: 'taxes', titulo: 'Preparación de taxes ' + new Date().getFullYear(), servicio: 'taxes', activo: true, descripcion: 'Completa tus datos y sube tus documentos. Toda la información es confidencial.', mensaje_final: 'Gracias. Revisaremos tus documentos y te escribiremos si falta algo.',
      campos: contacto().concat([C('ssn', 'sensible', 'Número de Seguro Social o ITIN', { requerido: true }), C('s2', 'seccion', 'Tu declaración'), C('ec', 'opciones', 'Estado civil', { requerido: true, opciones: ['Soltero/a', 'Casado/a declarando juntos', 'Cabeza de familia'] }),
        C('ing', 'multiple', '¿Cómo recibiste ingresos?', { opciones: ['W-2 (empleado)', '1099 (contratista)', 'Negocio propio', 'Uber / Lyft / delivery'] }), C('dep', 'numero', '¿Cuántos dependientes tienes?'), C('s3', 'seccion', 'Documentos'), C('docs', 'archivo', 'W-2, 1099 y otros formularios', { requerido: false }),
        C('ok', 'acepto', 'Confirmo que la información que entrego es verdadera.', { requerido: true }), C('fir', 'firma', 'Tu firma', { requerido: false })]), created_at: ts(-60), updated_at: ts(-5) };
    var fLlc = { id: uuid(), slug: 'llc', titulo: 'Formación de tu LLC', servicio: 'llc', activo: true, descripcion: 'Registramos tu LLC, sacamos el EIN y preparamos el Operating Agreement.', mensaje_final: null,
      campos: contacto().concat([C('s2', 'seccion', 'Tu negocio'), C('nl', 'texto', 'Nombre que quieres para la LLC', { requerido: true }), C('act', 'parrafo', '¿A qué se dedica el negocio?', { requerido: true }), C('soc', 'opciones', '¿Cuántos dueños tendrá?', { opciones: ['Solo yo', '2 socios', '3 o más'] })]), created_at: ts(-40), updated_at: ts(-12) };
    var fCon = { id: uuid(), slug: 'contacto', titulo: 'Cuéntanos qué necesitas', servicio: null, activo: false, descripcion: 'Te contestamos el mismo día.', mensaje_final: null,
      campos: contacto().concat([C('svc', 'lista', '¿Qué servicio te interesa?', { requerido: true, opciones: ['Taxes', 'Reparación de crédito', 'Formación de LLC', 'Inmigración', 'Notaría', 'Contabilidad', 'Otro'] }), C('msg', 'parrafo', 'Tu mensaje')]), created_at: ts(-20), updated_at: ts(-20) };
    d.formularios = [fTax, fLlc, fCon];
    [['Hugo', 'Benítez', 'nuevo', 0, fTax, { ec: 'Casado/a declarando juntos', ing: ['W-2 (empleado)', 'Uber / Lyft / delivery'], dep: '2', ok: true }], ['Rocío', 'Arias', 'nuevo', -1, fTax, { ec: 'Soltero/a', ing: ['1099 (contratista)'], dep: '0', ok: true }],
      ['Emilio', 'Paredes', 'en_proceso', -3, fLlc, { nl: 'Paredes Roofing LLC', act: 'Techos residenciales y reparaciones.', soc: '2 socios' }], ['Silvia', 'Cano', 'completado', -9, fTax, { ec: 'Cabeza de familia', ing: ['W-2 (empleado)'], dep: '1', ok: true }]].forEach(function (x, i) {
      var datos = Object.assign({ n: x[0], a: x[1], t: '(713) 555-04' + (20 + i), e: x[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '') + '@example.com' }, x[5]);
      d.formulario_respuestas.push({ id: uuid(), created_at: ts(x[3], 11 + i), formulario_id: x[4].id, datos: datos, sensibles: x[4] === fTax ? { ssn: '•••-••-' + (5532 + i * 7) } : {}, archivos: x[4] === fTax ? [{ campo: 'docs', path: 'formularios/demo/w2-' + i + '.pdf', nombre: 'W-2 ' + (new Date().getFullYear() - 1) + '.pdf', tipo: 'application/pdf', tam: 182340 }] : [],
        nombre: x[0], apellidos: x[1], telefono: datos.t, email: datos.e, estado: x[2], cliente_id: null, caso_id: null, notas: null });
    });

    // Contenido digital
    [['Temporada de taxes', 'Tu reembolso, sin estrés', 'post', 'instagram', 'por_aprobar', 2], ['Crédito 700+', 'Empieza tu plan hoy', 'post', 'facebook', 'por_aprobar', 4], ['¿Tu propia LLC?', 'La abrimos en 7 días', 'reel', 'instagram', 'aprobado', 6],
      ['Notaría el mismo día', 'Trae tu ID y listo', 'historia', 'instagram', 'publicado', -3], ['Green card', 'Renueva a tiempo', 'flyer', 'whatsapp', 'cambios', 9], ['Contabilidad mensual', 'Tus números claros', 'post', 'facebook', 'publicado', -8],
      ['Testimonio de María', '+90 puntos en 6 meses', 'post', 'instagram', 'aprobado', 12], ['Franchise Tax', 'Vence el 15 de mayo', 'historia', 'facebook', 'por_aprobar', 15]].forEach(function (x, i) {
      var id = uuid();
      d.contenido.push({ id: id, titulo: x[0], tipo: x[2], red: x[3], estado: x[4], fecha_publicacion: dia(x[5]), copy: x[0] + ' ✨ ' + x[1] + '. Escríbenos por WhatsApp o agenda tu cita en línea. #' + (M.nombre || 'Nexo') + ' #Multiservicios',
        archivos: [{ path: id + '/diseno-' + i + '-' + encodeURIComponent(x[0] + '|' + x[1]) + '.svg', nombre: x[0] + '.svg', tipo: 'image/svg+xml' }], created_at: ts(-14 + i) });
      if (x[4] === 'cambios') d.contenido_comentarios.push({ id: uuid(), contenido_id: id, autor: d.admins[0].nombre, user_id: 'u-owner', texto: '¿Podemos poner el precio más grande y agregar el teléfono abajo?', created_at: ts(-1, 16) });
      if (x[4] === 'aprobado') d.contenido_comentarios.push({ id: uuid(), contenido_id: id, autor: 'Sofía Ortiz', user_id: 'u-sofia', texto: '¡Me encanta! Listo para programar.', created_at: ts(-2, 12) });
    });

    d.campanas = [
      { id: uuid(), nombre: 'Temporada de taxes (clientes del año pasado)', mensaje: 'Hola {nombre}, ¡ya abrió la temporada de taxes! Agenda tu cita en línea y prepara tu declaración con nosotros otra vez.', filtro: { etiquetas: [], origen: '', servicio: 'taxes', sin_servicio: '', taxes_anio: '' }, estado: 'enviada', destinatarios: 11, created_at: ts(-25) },
      { id: uuid(), nombre: 'Promoción de crédito para clientes de taxes', mensaje: 'Hola {nombre}, ¿sabías que también te ayudamos a mejorar tu crédito? Este mes la consulta es gratis.', filtro: { etiquetas: [], origen: '', servicio: 'taxes', sin_servicio: 'credito', taxes_anio: '' }, estado: 'borrador', destinatarios: null, created_at: ts(-2) }
    ];

    // Llamadas
    [['saliente', 0, 11, 184, 2, 'completada', 'listo'], ['entrante', 0, 9, 0, null, 'sin_respuesta', 'sin_grabacion'], ['entrante', -1, 16, 412, 5, 'completada', 'listo'], ['saliente', -1, 12, 96, 9, 'completada', 'listo'],
      ['saliente', -2, 10, 0, 14, 'sin_respuesta', 'sin_grabacion'], ['entrante', -3, 15, 263, 0, 'completada', 'listo'], ['saliente', -4, 17, 131, 21, 'completada', 'sin_grabacion']].forEach(function (x, i) {
      var c = x[4] != null ? cl[x[4]] : null;
      var l = { id: uuid(), created_at: ts(x[1], x[2], i * 7), direccion: x[0], canal: 'telefono', numero: c ? '+1' + c.tel_digitos : '+17135550188', cliente_id: c ? c.id : null, usuario: 'u-owner', estado: x[5], inicio: ts(x[1], x[2], i * 7), duracion_seg: x[3],
        grabacion_path: x[6] === 'listo' ? 'demo/llamada-' + i + '.wav' : null, con_aviso: c ? c.region !== 'TX' : true, ia_estado: x[6], notas: null };
      if (x[6] === 'listo') procesarLlamada.call(null, l);
      d.llamadas.push(l);
    });

    // Documentos, contratos, planes, portal
    var DOCS = [['ID - Licencia de conducir.pdf', 0], ['Comprobante de domicilio.pdf', 0], ['W-2 2025.pdf', 1], ['Articles of Organization.pdf', 2], ['Carta USCIS I-797.pdf', 4], ['Estado de cuenta.pdf', 7], ['Pasaporte.pdf', 10], ['1099-K Uber.pdf', 9]];
    DOCS.forEach(function (x, i) { d.documentos.push({ id: uuid(), cliente_id: cl[x[1]].id, nombre: x[0], path: 'clientes/' + cl[x[1]].id + '/' + x[0].replace(/\s+/g, '-'), tipo: 'application/pdf', tamano: 120000 + i * 33100, created_at: ts(-i * 4 - 1) }); });
    var txt = function (c) { return 'ACUERDO DE SERVICIOS\n\nEntre ' + marca + ' ("la Empresa") y ' + c.nombre + ' ' + c.apellidos + ' ("el Cliente").\n\n1. SERVICIO. Reparación de crédito: revisión de los tres reportes, disputas de información inexacta y seguimiento.\n\n2. PAGO. El Cliente pagará $200 mensuales durante 6 meses.\n\n3. SIN GARANTÍAS. La Empresa no garantiza un aumento específico del puntaje.\n\n4. DERECHO A CANCELAR. El Cliente puede cancelar sin penalidad antes de la medianoche del tercer día hábil después de firmar.\n\nAl firmar, el Cliente confirma que leyó y entiende este acuerdo.'; };
    d.contratos = [
      { id: uuid(), cliente_id: cl[0].id, caso_id: cs[0].id, titulo: 'Contrato de servicios de reparación de crédito', contenido: txt(cl[0]), estado: 'firmado', token: uuid(), enviado_at: ts(-60), firmado_at: ts(-59, 18), firmado_nombre: cl[0].nombre + ' ' + cl[0].apellidos, created_at: ts(-61) },
      { id: uuid(), cliente_id: cl[18].id, caso_id: cs[20].id, titulo: 'Contrato de servicios de reparación de crédito', contenido: txt(cl[18]), estado: 'enviado', token: uuid(), enviado_at: ts(-1), created_at: ts(-1) },
      { id: uuid(), cliente_id: cl[3].id, caso_id: cs[4].id, titulo: 'Contrato de servicios de reparación de crédito', contenido: txt(cl[3]), estado: 'borrador', token: uuid(), created_at: ts(0, 8) }
    ];
    d.planes = [
      { id: uuid(), cliente_id: cl[0].id, servicio: 'credito', monto: 200, dia_cobro: 15, inicio: dia(-90), fin: null, activo: true, descripcion: 'Plan crédito 6 meses', estado_cobro: 'manual', created_at: ts(-90) },
      { id: uuid(), cliente_id: cl[7].id, servicio: 'contabilidad', monto: 300, dia_cobro: 1, inicio: dia(-120), fin: null, activo: true, descripcion: null, estado_cobro: 'activo', created_at: ts(-120) },
      { id: uuid(), cliente_id: cl[24].id, servicio: 'contabilidad', monto: 300, dia_cobro: 5, inicio: dia(-30), fin: null, activo: true, descripcion: null, estado_cobro: 'manual', created_at: ts(-30) }
    ];
    var base = location.href.replace(/\/(admin|portal|citas|f|firmar|recibo|pago)\/.*$/, '/').replace(/[^/]*$/, '');
    [[cl[7], 300, 'Contabilidad mensual (mensualidad)', 'pendiente', -2], [cl[1], 220, 'Preparación de taxes ' + (new Date().getFullYear() - 1), 'pendiente', -1], [cl[24], 300, 'Contabilidad mensual (mensualidad)', 'pagado', -20]].forEach(function (x) {
      var id = uuid();
      d.enlaces_pago.push({ id: id, cliente_id: x[0].id, monto: x[1], concepto: x[2], estado: x[3], url: base + 'pago/?demo=' + id, created_at: ts(x[4]), pagado_at: x[3] === 'pagado' ? ts(x[4] + 1) : null });
    });
    d.portal_accesos = [{ id: uuid(), cliente_id: cl[0].id, email: cl[0].email, created_at: ts(-58) }, { id: uuid(), cliente_id: cl[1].id, email: cl[1].email, created_at: ts(-20) }];

    // Actividad e integraciones
    [['Laura Méndez', 'creó', 'clientes', cl[27]], ['Carlos Rivera', 'editó', 'casos', cs[2]], ['Laura Méndez', 'editó', 'casos', cs[14]], ['Sofía Ortiz', 'creó', 'clientes', cl[26]], ['Carlos Rivera', 'creó', 'casos', cs[28]], ['Laura Méndez', 'editó', 'clientes', cl[0]]].forEach(function (x, i) {
      d.actividad.push({ id: uuid(), created_at: ts(-i, 15 - i), usuario: x[0], accion: x[1], entidad: x[2], entidad_id: x[3].id, resumen: x[2] === 'casos' ? x[3].servicio + ' · ' + nombreCliente(x[3].cliente_id) : x[3].nombre + ' ' + x[3].apellidos });
    });
    [['whatsapp', 'mensaje_recibido', true, 'José Hernández'], ['instagram', 'mensaje_recibido', true, 'Rosa Elena Paz'], ['meta_ads', 'lead_recibido', true, 'Adriana Ponce'], ['square', 'payment_completed', true, '$300'], ['cola', 'envio_automatico', true, '3 avisos'], ['messenger', 'mensaje_recibido', true, 'Lorena Sánchez']].forEach(function (x, i) {
      d.integraciones_eventos.push({ id: uuid(), created_at: ts(-i, 12 - i), fuente: x[0], tipo: x[1], ok: x[2], detalle: x[3] });
    });

    d._version = 5;
    d._creado = ahora();
    return d;
  }

  /* ---------- Arranque ---------- */
  db = cargar();
  if (!db || db._version !== 5) { db = sembrar(); guardarYa(); }

  /* Un mensaje nuevo llega solo unos segundos después de entrar (para mostrar los avisos en vivo) */
  function mensajeDeMuestra() {
    if (sessionStorage.getItem('crm-demo-vivo')) return;
    try { sessionStorage.setItem('crm-demo-vivo', '1'); } catch (_) { /* */ }
    setTimeout(function () {
      if (!leerSesion(SES)) return;
      var c = tabla('conversaciones').filter(function (x) { return x.etapa === 'interesado'; })[0] || tabla('conversaciones')[0];
      if (!c) return;
      insertarFila('mensajes_chat', { conversacion_id: c.id, direccion: 'entrante', texto: '¿Me pueden confirmar el horario de mañana? 😊' });
    }, 22000);
  }

  window.CRM = {
    api: API,
    demo: true,
    rpc: function (n, p) { return rpc(n, p).then(function (r) { if (r.error) throw new Error(r.error.message); return r.data; }); },
    subir: subirPublico,
    reiniciar: function () { db = sembrar(); guardarYa(); try { sessionStorage.removeItem('crm-demo-vivo'); } catch (_) { /* */ } },
    mensajeDeMuestra: mensajeDeMuestra,
    _db: function () { return db; }
  };
})();
