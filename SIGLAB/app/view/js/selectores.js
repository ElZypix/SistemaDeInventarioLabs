// view/js/selectores.js — Selectores reutilizables de SIGLAB:
//   selectorSO()        sistema operativo en cascada (familia → distribución → versión), con arranque dual
//   selectorSoftware()  programas con búsqueda y etiquetas, con alta rápida al catálogo
//   nombreSO()          nombre visible igual que en el servidor

import { api } from './api.js';
import { icono } from './iconos.js';
import { esc, el, toast, abrirModal, conCarga, agitar } from './ui.js';
import { S, FAMILIAS, soPorId, norm } from './estado.js';
import { combobox, lista } from './combobox.js';

const ORDEN_FAM = { windows: 1, linux: 2, macos: 3, otro: 4 };

export function nombreSO(familia, distro, version) {
  const v = (version || '').trim();
  if (familia === 'windows') return `Windows${v ? ` ${v}` : ''}`;
  if (familia === 'macos') return `macOS${v ? ` ${v.replace(/\s*\(.*\)$/, '')}` : ''}`;
  return `${(distro || '').trim()}${v ? ` ${v}` : ''}`;
}

/** "Sequoia (15)" → 15, "24.04" → 24.04; sin número → -1 */
const numVersion = (v) => { const m = /\(([\d.]+)\)/.exec(v) || /([\d.]+)/.exec(v); return m ? parseFloat(m[1]) : -1; };
const porVersion = (a, b) => numVersion(b) - numVersion(a) || a.localeCompare(b, 'es', { numeric: true });
const igual = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

const buscarSO = (f, d, v) => S.so.find((s) => s.familia === f && igual(s.distribucion, d) && igual(s.version, v));

async function asegurarSO(f, d, v) {
  const r = await api('ctrl/php/catalogosApi.php?tipo=so&accion=asegurar', { body: { familia: f, distribucion: d || '', version: v || '' } });
  S.so = r.items;
  return r.item;
}

/* ================================================================== */
/*  Sistema operativo en cascada                                       */
/* ================================================================== */

/**
 * opc = { ids: number[], admin: bool, alCambiar?() , grande?: bool }
 * Devuelve { el, obtenerIds: async () => number[], vacio: () => bool }
 */
export function selectorSO(opc) {
  const filas = (opc.ids || []).map(soPorId).filter(Boolean)
    .sort((a, b) => (ORDEN_FAM[a.familia] || 9) - (ORDEN_FAM[b.familia] || 9))
    .map((s) => ({ familia: s.familia, distro: s.distribucion || '', version: s.version || '' }));
  if (!filas.length) filas.push({ familia: '', distro: '', version: '' });

  const raiz = el(`<div class="sel-so ${opc.grande ? 'grande' : ''}"><div class="sel-so-filas"></div>
      ${opc.admin ? `<button type="button" class="enlace" data-mas>${icono('mas', 'sm')} Agregar otro sistema (arranque dual)</button>` : ''}</div>`);
  const cont = raiz.querySelector('.sel-so-filas');

  const familias = () => [
    { valor: '', texto: 'Sin sistema', tenue: true },
    ...Object.entries(FAMILIAS).map(([k, t]) => ({ valor: k, texto: t, icono: k })),
  ];
  const distros = (f) => [...new Set(S.so.filter((s) => s.familia === f && s.distribucion && (s.activo || filas.some((x) => igual(x.distro, s.distribucion))))
    .map((s) => s.distribucion))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    .map((d) => ({ valor: d, texto: d }));
  const versiones = (f, d) => [
    { valor: '', texto: 'Sin especificar', tenue: true },
    ...[...new Set(S.so.filter((s) => s.familia === f && s.version && (f === 'linux' || f === 'otro' ? igual(s.distribucion, d) : true)
      && (s.activo || filas.some((x) => igual(x.version, s.version)))).map((s) => s.version))]
      .sort(porVersion).map((v) => ({ valor: v, texto: v })),
  ];

  function pintar(animarFila = -1, animarNivel = '') {
    cont.innerHTML = '';
    let siguiente = null;   // combobox que se abre solo tras elegir el nivel anterior
    filas.forEach((fila, i) => {
      const fil = el(`<div class="sel-so-fila"></div>`);
      const cambiar = () => opc.alCambiar?.();
      fil.append(combobox({
        placeholder: 'Sistema…', valor: fila.familia, opciones: familias, deshabilitado: !opc.admin, clase: 'cbx-fam',
        alElegir: (v) => { if (v !== fila.familia) { fila.familia = v; fila.distro = ''; fila.version = ''; pintar(i, 'd'); cambiar(); } },
      }).el);
      const conDistro = fila.familia === 'linux' || fila.familia === 'otro';
      if (conDistro) {
        const cbD = combobox({
          placeholder: fila.familia === 'linux' ? 'Distribución…' : 'Nombre del sistema…',
          valor: fila.distro, opciones: () => distros(fila.familia), deshabilitado: !opc.admin,
          animar: animarFila === i && animarNivel === 'd',
          otro: opc.admin ? {
            texto: fila.familia === 'linux' ? 'Otra distribución…' : 'Otro sistema…',
            placeholder: fila.familia === 'linux' ? 'Ej. Fedora, Kali Linux, Pop!_OS' : 'Ej. ChromeOS Flex, FreeBSD',
            alAgregar: async (t) => { const it = await asegurarSO(fila.familia, t, ''); toast(`"${it.nombre}" agregado al catálogo.`); return it.distribucion; },
          } : null,
          alElegir: (v) => { if (v !== fila.distro) { fila.distro = v; fila.version = ''; pintar(i, 'v'); cambiar(); } },
        });
        fil.append(cbD.el);
        if (animarFila === i && animarNivel === 'd') siguiente = cbD;
      }
      if (fila.familia && (!conDistro || fila.distro)) {
        const cbV = combobox({
          placeholder: 'Versión (opcional)', valor: fila.version, opciones: () => versiones(fila.familia, fila.distro), deshabilitado: !opc.admin,
          animar: animarFila === i && (animarNivel === 'v' || (animarNivel === 'd' && !conDistro)),
          otro: opc.admin ? {
            texto: 'Otra versión…',
            placeholder: fila.familia === 'macos' ? 'Ej. Monterey (12)' : fila.familia === 'windows' ? 'Ej. 7' : 'Ej. 25.04',
            alAgregar: async (t) => { const it = await asegurarSO(fila.familia, fila.distro, t); toast(`"${it.nombre}" agregado al catálogo.`); return it.version; },
          } : null,
          alElegir: (v) => { fila.version = v; cambiar(); },
        });
        fil.append(cbV.el);
        if (animarFila === i && (animarNivel === 'v' || (animarNivel === 'd' && !conDistro))) siguiente = cbV;
      }
      if (opc.admin && filas.length > 1) {
        const b = el(`<button type="button" class="btn sm icon fantasma" aria-label="Quitar este sistema">${icono('basura', 'sm')}</button>`);
        b.onclick = () => { filas.splice(i, 1); pintar(); cambiar(); };
        fil.append(b);
      }
      cont.append(fil);
    });
    if (siguiente && opc.admin) setTimeout(() => siguiente.foco(true), 60);
  }
  pintar();

  raiz.querySelector('[data-mas]')?.addEventListener('click', () => {
    filas.push({ familia: '', distro: '', version: '' });
    pintar(filas.length - 1);
    const ult = cont.lastElementChild;
    ult.classList.add('cbx-entra');
    ult.querySelector('input')?.focus();
    opc.alCambiar?.();
  });

  return {
    el: raiz,
    /** Ids de catálogo para guardar; crea en el catálogo las combinaciones nuevas. */
    async obtenerIds() {
      const ids = [];
      for (const f of filas) {
        if (!f.familia) continue;
        if ((f.familia === 'linux' || f.familia === 'otro') && !f.distro) continue;
        let s = buscarSO(f.familia, f.distro, f.version);
        if (!s) s = await asegurarSO(f.familia, f.distro, f.version);
        if (s && !ids.includes(s.id)) ids.push(s.id);
      }
      return ids;
    },
    incompletos: () => filas.some((f) => (f.familia === 'linux' || f.familia === 'otro') && !f.distro),
  };
}

/* ================================================================== */
/*  Software: programa → versión                                       */
/* ================================================================== */

const progDe = (id) => S.software.find((s) => s.id === id);
const mismoProg = (a, b) => igual(a.programa, b.programa);

/**
 * Agrega un programa/versión a un Set de ids respetando las versiones:
 * una versión concreta reemplaza a las otras del mismo programa; "sin versión" no toca una que ya esté.
 * Devuelve true si cambió algo.
 */
export function agregarSoftware(set, id) {
  const s = progDe(id);
  if (!s || set.has(id)) return false;
  const otras = [...set].map(progDe).filter((x) => x && mismoProg(x, s));
  if (!s.version && otras.length) return false;
  otras.forEach((x) => set.delete(x.id));
  set.add(id);
  return true;
}

async function asegurarSW(programa, version, categoria) {
  const r = await api('ctrl/php/catalogosApi.php?tipo=software&accion=asegurar', { body: { programa, version: version || '', categoria: categoria || '' } });
  S.software = r.items;
  return r.item;
}

/** Ventana para dar de alta un programa nuevo (nombre, categoría y versión opcional). Devuelve el id o null. */
export function agregarProgramaRapido(nombre) {
  return new Promise((resolve) => {
    let categoria = 'General';
    let resultado = null;
    const cats = () => [...new Set(S.software.map((s) => s.categoria).concat('General'))]
      .sort((a, b) => a.localeCompare(b, 'es')).map((c) => ({ valor: c, texto: c }));
    const cuerpo = el(`<div style="display:contents">
      <div class="campo"><label for="ap-nombre">Programa</label><input class="input" id="ap-nombre" maxlength="80" value="${esc(nombre)}" placeholder="Ej. Apache NetBeans"></div>
      <div class="form-fila">
        <div class="campo"><span class="etiqueta">Categoría</span><div id="ap-cat"></div></div>
        <div class="campo" style="max-width:170px"><label for="ap-ver">Versión <small class="ayuda">(opcional)</small></label><input class="input" id="ap-ver" maxlength="40" placeholder="Ej. 26"></div>
      </div>
    </div>`);
    const cb = combobox({ placeholder: 'Categoría…', valor: categoria, opciones: cats,
      otro: { texto: 'Otra categoría…', placeholder: 'Ej. Diseño, Seguridad', alAgregar: async (t) => t },
      alElegir: (v) => { categoria = v; } });
    cuerpo.querySelector('#ap-cat').append(cb.el);
    const pie = el(`<div style="display:contents"><span class="espacio"></span><button class="btn" data-c>Cancelar</button><button class="btn primario" data-ok>${icono('mas', 'sm')} Agregar</button></div>`);
    const m = abrirModal({ titulo: 'Agregar programa al catálogo', cuerpo, pie, ancho: 480, alCerrar: () => resolve(resultado) });
    pie.querySelector('[data-c]').onclick = () => m.cerrar();
    const ok = pie.querySelector('[data-ok]');
    const enviar = () => conCarga(ok, async () => {
      try {
        const r = await api('ctrl/php/catalogosApi.php?tipo=software&accion=guardar', { body: {
          programa: cuerpo.querySelector('#ap-nombre').value, version: cuerpo.querySelector('#ap-ver').value, categoria: cb.valor || categoria } });
        S.software = r.items;
        resultado = r.item.id;
        toast(r.mensaje);
        m.cerrar();
      } catch (err) { toast(err.message, 'error'); agitar(m.modal); }
    });
    ok.onclick = enviar;
    cuerpo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input#ap-nombre, input#ap-ver')) { e.preventDefault(); enviar(); } });
    requestAnimationFrame(() => cuerpo.querySelector(nombre ? '#ap-ver' : '#ap-nombre').focus());
  });
}

/**
 * Selector de software en dos pasos: se busca el programa y luego se elige la versión.
 * opc = { seleccion: Set<number>, admin, alCambiar?(), placeholder? }
 * Las etiquetas muestran "Python 3.12" o "Python"; clic en una etiqueta cambia su versión.
 */
export function selectorSoftware(opc) {
  const sel = opc.seleccion;
  const ph = opc.placeholder || 'Buscar programa…';
  const raiz = el(`<div class="mcbx sel-sw">
      <div class="mcbx-etiquetas"></div>
      <div class="cbx-campo">
        <span class="sw-paso" hidden></span>
        <input class="input" role="combobox" aria-expanded="false" autocomplete="off" spellcheck="false" placeholder="${esc(ph)}">
        <span class="cbx-flecha">${icono('flecha', 'sm')}</span>
      </div>
    </div>`);
  const etiquetas = raiz.querySelector('.mcbx-etiquetas');
  const campo = raiz.querySelector('.cbx-campo');
  const input = raiz.querySelector('input');
  const paso = raiz.querySelector('.sw-paso');
  const ls = lista(campo);
  let prog = null;        // programa elegido en el paso de versión
  let nuevaVer = false;   // escribiendo una versión nueva

  function pintarEtiquetas(nuevo = null) {
    const elegidos = [...sel].map(progDe).filter(Boolean)
      .sort((a, b) => a.programa.localeCompare(b.programa, 'es', { numeric: true }));
    etiquetas.innerHTML = elegidos.length
      ? elegidos.map((s) => `<span class="etiqueta-sel ${s.id === nuevo ? 'nueva' : ''}" data-v="${s.id}">
          <span class="sw-tag-txt" ${opc.admin ? 'title="Clic para cambiar la versión"' : ''}>${esc(s.programa)}${s.version ? ` <b>${esc(s.version)}</b>` : ''}</span>
          ${opc.admin ? `<button type="button" aria-label="Quitar ${esc(s.nombre)}">${icono('x', 'sm')}</button>` : ''}</span>`).join('')
      : `<span class="ayuda">${esc(opc.vacioTexto || 'Sin programas registrados')}</span>`;
  }

  /** Programas únicos (activos o ya elegidos) */
  function programas() {
    const m = new Map();
    S.software.filter((s) => s.activo || sel.has(s.id)).forEach((s) => {
      const k = s.programa.toLowerCase();
      if (!m.has(k)) m.set(k, { programa: s.programa, categoria: s.categoria, ids: [] });
      m.get(k).ids.push(s.id);
    });
    return [...m.values()].sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.programa.localeCompare(b.programa, 'es', { numeric: true }));
  }
  const versionesDe = (p) => S.software.filter((s) => igual(s.programa, p) && s.version && (s.activo || sel.has(s.id)))
    .sort((a, b) => porVersion(a.version, b.version));
  const elegidoDe = (p) => [...sel].map(progDe).find((s) => s && igual(s.programa, p));

  function filtrar(q) {
    const nq = norm(q);
    if (prog) {
      const act = elegidoDe(prog);
      const ops = [
        { valor: '__sin', texto: 'Sin especificar', tenue: true, marcada: act && !act.version },
        ...versionesDe(prog).map((s) => ({ valor: s.id, texto: s.version, marcada: act?.id === s.id })),
      ].filter((o) => !nq || norm(o.texto).includes(nq));
      const existe = versionesDe(prog).some((s) => norm(s.version) === nq);
      const extra = opc.admin ? (q.trim() && !existe ? [{ valor: '__nuevaver', texto: `Agregar versión "${q.trim()}"` }]
        : !q.trim() ? [{ valor: '__otraver', texto: 'Otra versión…' }] : []) : [];
      ls.pintar(ops, extra);
      return;
    }
    const ops = programas().filter((p) => !nq || norm(`${p.programa} ${p.categoria}`).includes(nq)).map((p) => {
      const act = elegidoDe(p.programa);
      const nv = versionesDe(p.programa).length;
      return { valor: p.programa, texto: p.programa, grupo: p.categoria, marcada: !!act, sub: act?.version ? act.version : nv ? `${nv} versión${nv === 1 ? '' : 'es'}` : '' };
    });
    const existe = programas().some((p) => norm(p.programa) === nq);
    const extra = opc.admin ? (q.trim() && !existe ? [{ valor: '__nuevo', texto: `Agregar "${q.trim()}" al catálogo` }] : !q.trim() ? [{ valor: '__nuevo', texto: 'Otro programa…' }] : []) : [];
    ls.pintar(ops, extra);
  }
  const abrir = (q = '') => { filtrar(q); ls.abrir(); input.setAttribute('aria-expanded', 'true'); };
  const cerrar = () => { ls.cerrar(); input.setAttribute('aria-expanded', 'false'); salirVersion(); };

  function entrarVersion(p) {
    prog = p; nuevaVer = false;
    paso.hidden = false;
    paso.innerHTML = `${esc(p)} ${icono('siguiente', 'sm')}`;
    campo.classList.add('con-paso');
    input.value = '';
    input.placeholder = 'Versión…';
    paso.animate([{ opacity: 0, transform: 'translate(-6px, -50%)' }, { opacity: 1, transform: 'translate(0, -50%)' }], { duration: 200, easing: 'ease-out' });
    input.style.paddingLeft = `${paso.offsetWidth + 14}px`;
    abrir('');
    input.focus();
  }
  function salirVersion() {
    if (!prog) return;
    prog = null; nuevaVer = false;
    paso.hidden = true;
    campo.classList.remove('con-paso');
    input.style.paddingLeft = '';
    input.placeholder = ph;
    input.value = '';
  }

  function poner(id) {
    const s = progDe(id);
    // Al elegir explícitamente una versión (o "sin especificar") se reemplaza la que hubiera
    [...sel].map(progDe).filter((x) => x && mismoProg(x, s)).forEach((x) => sel.delete(x.id));
    sel.add(id);
    pintarEtiquetas(id);
    opc.alCambiar?.();
  }

  async function elegir(o) {
    if (!o) return;
    try {
      if (prog) {
        if (o.valor === '__otraver') { nuevaVer = true; input.placeholder = 'Escribe la versión y presiona Enter'; input.focus(); filtrar(''); ls.cerrar(); return; }
        let id = o.valor;
        if (o.valor === '__sin') id = (S.software.find((s) => igual(s.programa, prog) && !s.version) || await asegurarSW(prog, '')).id;
        if (o.valor === '__nuevaver') { const it = await asegurarSW(prog, input.value.trim()); id = it.id; toast(`"${it.nombre}" agregado al catálogo.`); }
        poner(id);
        cerrar();
        input.focus();
        return;
      }
      if (o.valor === '__nuevo') {
        const id = await agregarProgramaRapido(input.value.trim());
        if (id) { poner(id); cerrar(); }
        return;
      }
      // Programa: si tiene versiones registradas se pasa al paso de versión
      if (versionesDe(o.valor).length && opc.admin) { entrarVersion(o.valor); return; }
      const sinVer = S.software.find((s) => igual(s.programa, o.valor) && !s.version) || await asegurarSW(o.valor, '');
      poner(sinVer.id);
      input.value = '';
      filtrar('');
    } catch (err) { toast(err.message, 'error'); }
  }

  if (!opc.admin) campo.remove();
  else {
    input.addEventListener('click', () => { if (!ls.abierta()) abrir(input.value); });
    input.addEventListener('input', () => { if (nuevaVer) return; abrir(input.value); });
    input.addEventListener('keydown', (e) => {
      if (nuevaVer && e.key === 'Enter') {
        e.preventDefault();
        const t = input.value.trim();
        if (t) elegir({ valor: '__nuevaver' });
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!ls.abierta()) abrir(input.value); else ls.mover(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); ls.mover(-1); }
      else if (e.key === 'Enter') { if (ls.abierta()) { e.preventDefault(); elegir(ls.actual()); } }
      else if (e.key === 'Escape') {
        if (prog) { e.preventDefault(); e.stopPropagation(); salirVersion(); abrir(''); }
        else if (ls.abierta()) { e.preventDefault(); e.stopPropagation(); cerrar(); }
      } else if (e.key === 'Backspace' && !input.value) {
        if (prog) { e.preventDefault(); salirVersion(); abrir(''); return; }
        const ult = [...etiquetas.querySelectorAll('.etiqueta-sel')].pop();
        if (ult && sel.size) { sel.delete(Number(ult.dataset.v)); pintarEtiquetas(); opc.alCambiar?.(); }
      }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (!raiz.contains(document.activeElement)) cerrar(); }, 150));
    raiz.querySelector('.cbx-flecha').addEventListener('mousedown', (e) => { e.preventDefault(); if (ls.abierta()) cerrar(); else { input.focus(); abrir(input.value); } });
    paso.addEventListener('mousedown', (e) => { e.preventDefault(); salirVersion(); abrir(''); input.focus(); });
    ls.el.addEventListener('mousedown', (e) => {
      const n = e.target.closest('.cbx-op'); if (!n) return;
      e.preventDefault();
      elegir(ls.item(Number(n.dataset.i)));
    });
    etiquetas.addEventListener('click', (e) => {
      const tag = e.target.closest('.etiqueta-sel'); if (!tag) return;
      const id = Number(tag.dataset.v);
      if (e.target.closest('button')) {
        tag.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.7)' }], { duration: 140 }).finished.then(() => {
          sel.delete(id); pintarEtiquetas(); opc.alCambiar?.();
        });
        return;
      }
      const s = progDe(id);
      if (s) entrarVersion(s.programa);
    });
  }
  pintarEtiquetas();
  return { el: raiz, refrescar: () => pintarEtiquetas(), foco: () => input.focus() };
}

/** Menú pequeño "Aplicar perfil ▾". `alAplicar(perfil)` */
export function botonPerfiles(alAplicar, etiqueta = 'Aplicar perfil') {
  const cont = el(`<div class="menu-perfiles"><button type="button" class="btn sm">${icono('capas', 'sm')} ${esc(etiqueta)} ${icono('flecha', 'sm')}</button><div class="menu-perfiles-lista" hidden></div></div>`);
  const btn = cont.querySelector('button');
  const lista = cont.querySelector('.menu-perfiles-lista');
  btn.onclick = (e) => {
    e.stopPropagation();
    if (!lista.hidden) { lista.hidden = true; return; }
    lista.innerHTML = S.perfiles.length
      ? S.perfiles.map((p) => `<button type="button" data-p="${p.id}">${esc(p.nombre)}<small>${p.software.length} programas</small></button>`).join('')
      : '<span class="ayuda" style="padding:8px">No hay perfiles. Créalos en Catálogos.</span>';
    lista.hidden = false;
  };
  lista.onclick = (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    lista.hidden = true;
    alAplicar(S.perfiles.find((x) => x.id === Number(b.dataset.p)));
  };
  document.addEventListener('click', () => { lista.hidden = true; });
  return cont;
}
