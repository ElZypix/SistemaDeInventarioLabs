// view/js/mapa.js — Mapa del laboratorio: tarjetas de PC, filtros, arrastrar y soltar,
// selección múltiple y edición de lugares/filas.

import { api } from './api.js';
import { icono } from './iconos.js';
import { esc, el, toast, confirmar, abrirModal, conCarga } from './ui.js';
import {
  S, ESTADOS, PERIFERICOS, PER_ESTADOS, FAMILIAS, esAdmin, estadoDe,
  soPorId, swPorId, resumenSpecs, lugarPorId, equipoPorId, equiposLab, lugaresLab, labPorId, ubicacionTxt, pasaFiltros, hayFiltros,
  diasDesde, haceTxt, fechaCorta,
} from './estado.js';
import { abrirEquipo, abrirLote, abrirCopiar } from './equipo.js';
import { contar, ondaColor, pulso, confeti } from './animaciones.js';
import { combobox } from './combobox.js';

const $ = (s) => document.querySelector(s);
const grid = $('#mapa-grid');
const mapa = $('#mapa');
const bandeja = $('#bandeja');
const bandejaItems = $('#bandeja-items');
const tip = $('#tooltip-pc');
const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================================================================== */
/*  Render general                                                     */
/* ================================================================== */

export function renderTodo({ entrada = false } = {}) {
  renderLabSwitch();
  renderStats();
  renderProgreso();
  renderFiltros();
  renderMapa({ entrada });
  renderResumenLateral();
  renderAviso();
  renderLoteBarra();
}

/* ---------- Esqueleto mientras cargan los datos ---------- */
export function mostrarEsqueleto() {
  $('#progreso').innerHTML = '<div class="sk" style="height:14px;width:280px"></div><div class="sk" style="height:8px;border-radius:99px"></div>';
  $('#stats').innerHTML = Array.from({ length: 6 }, () => '<div class="stat fijo"><span class="sk" style="height:26px;width:46px"></span><span class="sk" style="height:11px;width:90px"></span></div>').join('');
  $('#filtros').innerHTML = '<span class="sk" style="height:28px;width:220px;border-radius:99px"></span><span class="sk" style="height:28px;width:160px;border-radius:99px"></span><span class="sk" style="height:28px;width:300px;border-radius:10px"></span>';
  grid.style.setProperty('--cols', '8');
  let h = '';
  for (let f = 1; f <= 4; f++) {
    h += `<div class="fila-lbl" style="grid-row:${f}"><span class="sk" style="width:20px;height:12px"></span></div>`;
    for (let c = 1; c <= 8; c++) {
      h += `<div class="lugar" style="grid-row:${f};grid-column:${c + 1}"><div class="pc-sk">
        <span class="sk" style="height:14px;width:55%"></span><span class="sk" style="height:18px;width:70%;border-radius:6px"></span>
        <span class="sk-fila">${'<span class="sk" style="height:26px"></span>'.repeat(4)}</span><span class="sk" style="height:10px;width:80%"></span></div></div>`;
    }
  }
  grid.innerHTML = h;
}

/* ---------- Selector de laboratorio ---------- */
function renderLabSwitch() {
  const cont = $('#lab-switch');
  cont.querySelectorAll('button').forEach((b) => b.remove());
  for (const lab of S.labs) {
    const n = equiposLab(lab.id).length;
    const corto = lab.nombre.replace(/^Laboratorio de /i, '');
    const b = el(`<button role="tab" data-lab="${lab.id}" class="${lab.id === S.labId ? 'sel' : ''}" aria-selected="${lab.id === S.labId}">
        <b>${esc(corto)}</b><small>${n} equipo${n === 1 ? '' : 's'}</small></button>`);
    b.addEventListener('click', () => cambiarLab(lab.id));
    cont.append(b);
  }
  requestAnimationFrame(moverIndicadorLab);
}

function moverIndicadorLab() {
  const cont = $('#lab-switch');
  const sel = cont.querySelector('button.sel');
  const ind = cont.querySelector('.lab-indicador');
  if (!sel || !ind) return;
  ind.style.width = `${sel.offsetWidth}px`;
  ind.style.transform = `translateX(${sel.offsetLeft}px)`;
}
addEventListener('resize', moverIndicadorLab);

export function cambiarLab(id, despues) {
  if (id === S.labId) { despues?.(); return; }
  const idxA = S.labs.findIndex((l) => l.id === S.labId);
  const idxB = S.labs.findIndex((l) => l.id === id);
  const raiz = document.documentElement;
  raiz.classList.remove('lab-der', 'lab-izq');
  raiz.classList.add(idxB > idxA ? 'lab-der' : 'lab-izq');

  S.seleccion.clear();
  S.filtros.soSel = '';
  S.filtros.software.clear();
  try { localStorage.setItem('siglab-lab', String(id)); } catch { /* */ }

  const actualizar = () => {
    S.labId = id;
    renderLabSwitch();
    renderStats();
    renderProgreso();
    renderFiltros();
    renderMapa();
    renderLoteBarra();
  };
  if (document.startViewTransition && !reducir) {
    const vt = document.startViewTransition(actualizar);
    vt.finished.finally(() => { raiz.classList.remove('lab-der', 'lab-izq'); despues?.(); });
  } else {
    actualizar();
    mapa.classList.add('entrando');
    setTimeout(() => mapa.classList.remove('entrando'), 900);
    despues?.();
  }
}

/* ---------- Estadísticas (clic = filtrar por estado) ---------- */
const numerosPrevios = new Map(); // labId → últimos valores mostrados (para animar el conteo)
export function renderStats() {
  const eqs = equiposLab();
  const cuenta = { verde: 0, ambar: 0, rojo: 0, azul: 0 };
  eqs.forEach((e) => { cuenta[e.estado] += 1; });
  const vacios = lugaresLab().length - eqs.filter((e) => e.lugar_id).length;

  const nuevos = { total: eqs.length, ...cuenta, vacios };
  const previos = numerosPrevios.get(S.labId) || { total: 0, verde: 0, ambar: 0, rojo: 0, azul: 0, vacios: 0 };
  numerosPrevios.set(S.labId, nuevos);

  const cont = $('#stats');
  cont.innerHTML = `
    <div class="stat fijo"><span class="num" data-n="total">${previos.total}</span><span class="lbl">${icono('monitor', 'sm')} Equipos</span></div>
    ${Object.entries(ESTADOS).map(([k, v]) => `
      <button class="stat st-${k} ${S.filtros.estados.has(k) ? 'on' : ''}" data-estado="${k}" title="Filtrar: ${v.nombre}">
        <span class="num" data-n="${k}">${previos[k]}</span><span class="lbl"><i class="punto st-${k}"></i>${v.corto}</span>
      </button>`).join('')}
    <div class="stat fijo"><span class="num" data-n="vacios">${previos.vacios}</span><span class="lbl">${icono('laboratorio', 'sm')} Lugares vacíos</span></div>`;
  cont.querySelectorAll('[data-n]').forEach((n) => contar(n, previos[n.dataset.n], nuevos[n.dataset.n]));
  cont.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.estado;
    S.filtros.estados.has(k) ? S.filtros.estados.delete(k) : S.filtros.estados.add(k);
    b.classList.toggle('on');
    aplicarFiltros();
    renderFiltros();
  }));
}

/* ---------- Progreso del inventario ---------- */
const esPendiente = (e) => e.estado_manual === 'azul' && (e.motivo_manual || '').trim().toLowerCase() === 'pendiente de inventario';
const pctPrevio = new Map(); // labId → % mostrado la última vez

export function renderProgreso() {
  const cont = $('#progreso');
  if (!cont) return;
  const eqs = equiposLab();
  const total = eqs.length;
  const hechas = eqs.filter((e) => !esPendiente(e)).length;
  const pct = total ? Math.round((hechas / total) * 100) : 0;
  if (!cont.querySelector('.prog-barra i')) {
    cont.innerHTML = `
      <div class="prog-txt">${icono('check', 'sm')}<span>Inventario: <b data-p="hechas">0</b> de <b data-p="total">0</b> equipos revisados</span><b class="prog-pct"><span data-p="pct">0</span>%</b></div>
      <div class="prog-barra"><i></i></div>`;
  }
  const antes = pctPrevio.get(S.labId);
  const desde = antes ?? 0;
  const prevHechas = Math.round((desde / 100) * total);
  contar(cont.querySelector('[data-p="hechas"]'), cont.dataset.lab === String(S.labId) ? Number(cont.querySelector('[data-p="hechas"]').textContent) : prevHechas, hechas);
  cont.querySelector('[data-p="total"]').textContent = String(total);
  contar(cont.querySelector('[data-p="pct"]'), cont.dataset.lab === String(S.labId) ? Number(cont.querySelector('[data-p="pct"]').textContent) : desde, pct);
  cont.dataset.lab = String(S.labId);
  requestAnimationFrame(() => { cont.querySelector('.prog-barra i').style.width = `${pct}%`; });
  cont.classList.toggle('completo', pct === 100);

  // Celebración solo cuando se llega al 100 % durante la sesión (no al cargar)
  if (antes !== undefined && antes < 100 && pct === 100) {
    setTimeout(() => {
      const barra = cont.querySelector('.prog-barra');
      const r = barra.getBoundingClientRect();
      confeti(r.top > 60 && r.bottom < innerHeight ? barra : null);
      toast(`¡Inventario de ${labPorId(S.labId).nombre.replace(/^Laboratorio de /i, '')} completo! 🎉`, 'ok', { duracion: 6000 });
    }, 450);
  }
  pctPrevio.set(S.labId, pct);
}

/* ---------- Barra de filtros ---------- */
let popSoftAbierto = false;

export function renderFiltros() {
  const eqs = equiposLab();
  const usoSO = new Map();
  const usoSW = new Map();
  eqs.forEach((e) => {
    e.so.forEach((id) => usoSO.set(id, (usoSO.get(id) || 0) + 1));
    // El filtro de software es por programa (cualquier versión)
    new Set(e.software.map((id) => swPorId(id)?.programa.toLowerCase()).filter(Boolean)).forEach((k) => usoSW.set(k, (usoSW.get(k) || 0) + 1));
  });
  const soVisibles = S.so.filter((s) => usoSO.has(s.id) || S.filtros.soSel === `id:${s.id}`);
  const nSW = S.filtros.software.size;

  const cont = $('#filtros');
  cont.innerHTML = `
    <div class="filtro-grupo">
      <span class="etiqueta">${icono('windows', 'sm')} Sistema</span>
      <div id="filtro-so"></div>
    </div>
    <span class="filtro-sep"></span>
    <div class="filtro-grupo multi" id="multi-sw">
      <span class="etiqueta">${icono('software', 'sm')} Software</span>
      <button class="chip ${nSW ? 'on' : ''}" id="btn-sw">${nSW ? `${nSW} seleccionado${nSW === 1 ? '' : 's'}` : 'Cualquiera'} ${icono('flecha', 'sm')}</button>
    </div>
    <span class="filtro-sep"></span>
    <div class="filtro-grupo">
      <span class="etiqueta">${icono('teclado', 'sm')} Periféricos</span>
      <div class="segmentado" id="seg-perif">
        ${[['', 'Todos'], ['completo', 'Completos'], ['faltante', 'Con faltantes'], ['danado', 'Con dañados']]
          .map(([k, t]) => `<button data-perif="${k}" class="${S.filtros.perif === k ? 'sel' : ''}">${t}</button>`).join('')}
      </div>
    </div>
    <div class="filtros-fin">
      <span class="mostrando" id="mostrando"></span>
      <button class="btn sm fantasma" id="btn-limpiar" ${hayFiltros() ? '' : 'hidden'}>${icono('x', 'sm')} Limpiar</button>
    </div>`;

  // Sistema: un combobox con búsqueda; se puede filtrar por familia completa o por versión exacta
  const usoFam = new Map();
  eqs.forEach((e) => new Set(e.so.map((id) => soPorId(id)?.familia).filter(Boolean)).forEach((f) => usoFam.set(f, (usoFam.get(f) || 0) + 1)));
  const sinSO = eqs.filter((e) => !e.so.length).length;
  const cbSO = combobox({
    placeholder: 'Todos', valor: S.filtros.soSel, clase: 'cbx-filtro',
    opciones: () => [
      { valor: '', texto: 'Todos los sistemas', tenue: true },
      ...Object.entries(FAMILIAS).filter(([k]) => usoFam.has(k)).map(([k, t]) => ({ valor: `f:${k}`, texto: `${t} (todas)`, sub: String(usoFam.get(k)), grupo: 'Familia', icono: k })),
      ...soVisibles.map((x) => ({ valor: `id:${x.id}`, texto: x.nombre, sub: String(usoSO.get(x.id) || 0), grupo: 'Versión exacta', icono: x.familia })),
      ...(sinSO ? [{ valor: 'sin', texto: 'Sin sistema registrado', sub: String(sinSO), grupo: 'Otros' }] : []),
    ],
    alElegir: (v) => { S.filtros.soSel = v; aplicarFiltros(); },
  });
  cont.querySelector('#filtro-so').append(cbSO.el);
  cont.querySelectorAll('[data-perif]').forEach((b) => b.addEventListener('click', () => {
    S.filtros.perif = b.dataset.perif;
    cont.querySelectorAll('[data-perif]').forEach((x) => x.classList.toggle('sel', x === b));
    aplicarFiltros();
  }));
  cont.querySelector('#btn-limpiar').addEventListener('click', limpiarFiltros);
  cont.querySelector('#btn-sw').addEventListener('click', (e) => { e.stopPropagation(); togglePopSoftware(usoSW); });
  if (popSoftAbierto) togglePopSoftware(usoSW, true);
  aplicarFiltros();
}

function togglePopSoftware(usoSW, forzarAbrir = false) {
  const cont = $('#multi-sw');
  const previo = cont.querySelector('.multi-pop');
  if (previo && !forzarAbrir) { previo.remove(); popSoftAbierto = false; return; }
  previo?.remove();
  popSoftAbierto = true;
  const pop = el(`<div class="multi-pop" role="dialog" aria-label="Filtrar por software">
      <input class="input" placeholder="Buscar programa…" aria-label="Buscar programa">
      <div class="multi-lista"></div>
    </div>`);
  const lista = pop.querySelector('.multi-lista');
  const pintar = (q = '') => {
    const nq = q.toLowerCase();
    const vistos = new Set();
    const items = S.software.filter((s) => {
      const k = s.programa.toLowerCase();
      if (vistos.has(k) || !(s.activo || S.filtros.software.has(k)) || !k.includes(nq)) return false;
      vistos.add(k); return true;
    });
    const cats = [...new Set(items.map((s) => s.categoria))];
    lista.innerHTML = cats.length ? cats.map((c) => `<div class="multi-cat">${esc(c)}</div>` + items.filter((s) => s.categoria === c).map((s) => `
        <label class="multi-op"><input type="checkbox" value="${esc(s.programa.toLowerCase())}" ${S.filtros.software.has(s.programa.toLowerCase()) ? 'checked' : ''}>
          ${esc(s.programa)}<span class="cuenta">${usoSW.get(s.programa.toLowerCase()) || 0}</span></label>`).join('')).join('')
      : '<div class="vacio-msg">Sin resultados</div>';
  };
  pintar();
  pop.querySelector('input').addEventListener('input', (e) => pintar(e.target.value));
  lista.addEventListener('change', (e) => {
    const id = e.target.value;
    e.target.checked ? S.filtros.software.add(id) : S.filtros.software.delete(id);
    const n = S.filtros.software.size;
    const btn = $('#btn-sw');
    btn.classList.toggle('on', n > 0);
    btn.innerHTML = `${n ? `${n} seleccionado${n === 1 ? '' : 's'}` : 'Cualquiera'} ${icono('flecha', 'sm')}`;
    aplicarFiltros();
  });
  pop.addEventListener('click', (e) => e.stopPropagation());
  cont.append(pop);
  if (!forzarAbrir) pop.querySelector('input').focus();
}
document.addEventListener('click', () => {
  const pop = document.querySelector('#multi-sw .multi-pop');
  if (pop) { pop.remove(); popSoftAbierto = false; }
});

export function limpiarFiltros() {
  S.filtros.estados.clear(); S.filtros.soSel = ''; S.filtros.software.clear();
  S.filtros.perif = ''; S.filtros.texto = '';
  const b = $('#buscar'); if (b) b.value = '';
  renderStats();
  renderFiltros();
}

/** Atenúa las tarjetas que no cumplen los filtros (sin rehacer el DOM). */
export function aplicarFiltros() {
  const eqs = equiposLab();
  let visibles = 0;
  for (const e of eqs) {
    const ok = pasaFiltros(e);
    if (ok) visibles += 1;
    // Ola: las tarjetas cambian en diagonal desde arriba-izquierda según su lugar
    const l = e.lugar_id ? lugarPorId(e.lugar_id) : null;
    const retraso = reducir ? 0 : Math.min(320, ((l ? l.fila * 2 + l.columna : 14) * 16));
    document.querySelectorAll(`.pc[data-id="${e.id}"]`).forEach((n) => {
      if (n.classList.contains('atenuada') === !ok) return;
      n.style.transitionDelay = `${retraso}ms`;
      n.classList.toggle('atenuada', !ok);
      clearTimeout(n._olaT);
      n._olaT = setTimeout(() => { n.style.transitionDelay = ''; }, retraso + 450);
    });
  }
  const m = $('#mostrando');
  if (m) m.textContent = hayFiltros() ? `Mostrando ${visibles} de ${eqs.length}` : `${eqs.length} equipos`;
  const lim = $('#btn-limpiar');
  if (lim) lim.hidden = !hayFiltros();
}

/* ---------- Tarjeta de PC ---------- */
function tarjetaPC(e) {
  const st = estadoDe(e);
  const so = e.so.map(soPorId).filter(Boolean);
  const soHtml = so.length
    ? so.slice(0, 2).map((s) => `<span class="so-tag so-${s.familia}">${icono(s.familia)}${esc(s.nombre)}</span>`).join('')
      + (so.length > 2 ? `<span class="so-tag so-otro">+${so.length - 2}</span>` : '')
    : '<span class="sin">Sin sistema</span>';
  const perif = PERIFERICOS.map((p) => `<span class="perif ${e[p.clave]}" title="${p.nombre}: ${PER_ESTADOS[e[p.clave]]}">${icono(p.icono)}</span>`).join('');
  const dias = (st === 'rojo' || st === 'ambar') ? diasDesde(e.estado_desde) : null;
  const tiempo = dias !== null && dias > 0
    ? `<span class="pc-dias ${dias >= 7 ? 'viejo' : ''}" title="En este estado ${haceTxt(e.estado_desde)}">${icono('reloj')}${dias} d</span>` : '';
  const pie = (e.estado_manual
    ? `${icono('candado')}<span class="motivo">${esc(e.motivo_manual || '')}</span>`
    : `${icono('software')}<span>${e.software.length} programa${e.software.length === 1 ? '' : 's'}</span>`) + tiempo;
  return `
    <article class="pc st-${st} ${S.seleccion.has(e.id) ? 'sel' : ''}" data-id="${e.id}" tabindex="0"
      aria-label="${esc(e.numero)}, ${ESTADOS[st].nombre}">
      <div class="pc-top">
        <span class="pc-num">${esc(e.numero)}</span>
        ${e.tipo === 'mac' ? '<span class="pc-tipo">MAC</span>' : ''}
        ${e.estado_manual ? `<span class="pc-lock" title="Estado fijado manualmente">${icono('candado')}</span>` : ''}
        ${e.pendientes ? `<span class="pc-pend" title="${e.pendientes} pendiente${e.pendientes === 1 ? '' : 's'}">${icono('tareas')}${e.pendientes}</span>` : ''}
        ${S.modelo === e.id ? '<span class="pc-modelo" title="Equipo modelo para copiar">MODELO</span>' : ''}
        <i class="punto st-${st}"></i>
      </div>
      <div class="pc-so">${soHtml}</div>
      <div class="pc-perif">${perif}</div>
      <div class="pc-pie">${pie}</div>
      <span class="marca-sel">${icono('check')}</span>
    </article>`;
}

/* ---------- Mapa (cuadrícula de lugares) ---------- */
export function renderMapa({ entrada = false } = {}) {
  ocultarTip();
  const lugares = lugaresLab();
  const eqPorLugar = new Map(equiposLab().filter((e) => e.lugar_id).map((e) => [e.lugar_id, e]));
  const filas = [...new Set(lugares.map((l) => l.fila))].sort((a, b) => a - b);
  const maxCol = Math.max(1, ...lugares.map((l) => l.columna));
  // En modo edición se muestra una columna extra al final para alargar filas
  grid.style.setProperty('--cols', String(S.modoEdicion ? Math.min(20, maxCol + 1) : maxCol));
  mapa.classList.toggle('editando', S.modoEdicion);
  document.body.classList.toggle('seleccionando', S.modoSeleccion);

  let html = '';
  let i = 0;
  for (const f of filas) {
    const enFila = lugares.filter((l) => l.fila === f);
    const filaVacia = enFila.every((l) => !eqPorLugar.has(l.id));
    const clic = S.modoSeleccion ? 'clic' : '';
    html += `<div class="fila-lbl ${clic}" data-fila="${f}" style="grid-row:${f}" title="${S.modoSeleccion ? 'Seleccionar toda la fila' : `Fila ${f}`}">
        F${f}
        ${S.modoEdicion && filaVacia ? `<button class="btn sm icon peligro" data-quitar-fila="${f}" title="Eliminar fila ${f}">${icono('basura', 'sm')}</button>` : ''}
      </div>`;
    for (const l of enFila) {
      const e = eqPorLugar.get(l.id);
      const herr = S.modoEdicion ? `
        <div class="lugar-herr">
          <button class="btn icon" data-ins="antes" title="Insertar lugar a la izquierda">${icono('insertarIzq')}</button>
          ${!e ? `<button class="btn icon peligro" data-quitar-lugar title="Eliminar este lugar vacío">${icono('x')}</button>` : ''}
          <button class="btn icon" data-ins="despues" title="Insertar lugar a la derecha">${icono('insertarDer')}</button>
        </div>` : '';
      html += `<div class="lugar ${e ? '' : 'vacio'} ${!e && esAdmin() && !S.modoEdicion && !S.modoSeleccion ? 'agregar' : ''}"
          data-lugar="${l.id}" style="grid-row:${f};grid-column:${l.columna + 1};--i:${i++}">
          ${e ? tarjetaPC(e) : `<span class="vacio-txt">${esAdmin() && !S.modoEdicion && !S.modoSeleccion ? icono('mas') : ''}Vacío</span>`}
          ${herr}
          ${S.modoEdicion ? `<span class="lugar-pos">F${f}·L${l.columna}</span>` : ''}
        </div>`;
    }
    // Huecos: espacios en blanco de la fila (pasillos). Sirven para soltar una PC ahí
    // o, en modo edición, para crear un lugar nuevo con un clic.
    if (esAdmin()) {
      const ocupadas = new Set(enFila.map((l) => l.columna));
      const hasta = S.modoEdicion && enFila.length < 20 ? Math.min(20, maxCol + 1) : maxCol;
      for (let c = 1; c <= hasta; c++) {
        if (ocupadas.has(c)) continue;
        html += `<div class="hueco" data-hueco-f="${f}" data-hueco-c="${c}" style="grid-row:${f};grid-column:${c + 1}" title="Crear un lugar aquí">
            <span>${icono('mas', 'sm')}${c > maxCol ? 'Alargar fila' : 'Crear lugar'}</span></div>`;
      }
    }
  }
  if (!filas.length) html = '<div class="vacio-msg" style="grid-column:1/-1">Este laboratorio no tiene lugares. Activa "Editar mapa" para agregar filas.</div>';
  grid.innerHTML = html;

  $('#mapa-extra').innerHTML = S.modoEdicion
    ? `<button class="btn agregar-fila" id="btn-agregar-fila">${icono('mas')} Agregar fila</button>` : '';
  $('#btn-agregar-fila')?.addEventListener('click', agregarFila);

  renderBandeja();
  aplicarFiltros();

  if (entrada && !reducir) {
    mapa.classList.add('entrando');
    setTimeout(() => mapa.classList.remove('entrando'), 1200);
  }
}

function renderBandeja(forzar = false) {
  const sin = equiposLab().filter((e) => !e.lugar_id).sort((a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true }));
  bandeja.hidden = !sin.length && !forzar;
  bandejaItems.innerHTML = sin.map(tarjetaPC).join('');
}

/** Re-render con animación FLIP: las tarjetas se deslizan a su nueva posición. */
export function conFlip(mutar, { desde = new Map() } = {}) {
  const sel = '#mapa .pc[data-id], #bandeja .pc[data-id], #mapa .lugar.vacio[data-lugar], #mapa .fila-lbl[data-fila]';
  const clave = (n) => (n.dataset.id ? `p${n.dataset.id}` : n.dataset.lugar ? `l${n.dataset.lugar}` : `f${n.dataset.fila}`);
  const antes = new Map();
  document.querySelectorAll(sel).forEach((n) => antes.set(clave(n), n.getBoundingClientRect()));
  desde.forEach((rect, id) => antes.set(`p${id}`, rect)); // p. ej. la posición donde se soltó el fantasma
  mutar();
  if (reducir) return;
  let nuevos = 0;
  document.querySelectorAll(sel).forEach((n) => {
    const a = antes.get(clave(n));
    if (!a) {
      // Elemento nuevo (lugar insertado, fila agregada, PC que entra): se abre con escalonado
      n.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }],
        { duration: 380, delay: Math.min(nuevos++ * 35, 400), easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' });
      return;
    }
    const b = n.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    if (desde.has(Number(n.dataset.id))) {
      // La tarjeta soltada "cae" en su lugar con un pequeño rebote
      n.animate([
        { transform: `translate(${dx}px, ${dy}px) rotate(-2.5deg) scale(1.05)`, zIndex: 6, boxShadow: 'var(--sombra-3)' },
        { transform: 'translate(0, 0) rotate(0) scale(.97)', zIndex: 6, offset: 0.7 },
        { transform: 'none', zIndex: 6 },
      ], { duration: 520, easing: 'cubic-bezier(.34,1.3,.64,1)' });
      return;
    }
    n.animate([{ transform: `translate(${dx}px, ${dy}px)`, zIndex: 5 }, { transform: 'none', zIndex: 5 }],
      { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
}

/** Marca visualmente una tarjeta recién guardada. */
export function destellar(ids, estadosAntes = new Map()) {
  requestAnimationFrame(() => {
    // Ordena por posición en pantalla para que la ola vaya de arriba-izquierda a abajo-derecha
    const tarjetas = ids.map((id) => [id, document.querySelector(`.pc[data-id="${id}"]`)]).filter(([, n]) => n)
      .sort(([, a], [, b]) => { const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect(); return (ra.top - rb.top) || (ra.left - rb.left); });
    const paso = Math.min(60, 700 / Math.max(1, tarjetas.length));
    tarjetas.forEach(([id, n], i) => {
      const e = equipoPorId(id);
      const antes = estadosAntes.get(id);
      if (e && antes && antes !== e.estado) ondaColor(n, e.estado, i * paso);
      else pulso(n, i * paso);
    });
  });
}

export function resaltarEquipo(id) {
  const n = document.querySelector(`.pc[data-id="${id}"]`);
  if (!n) return;
  n.scrollIntoView({ behavior: reducir ? 'auto' : 'smooth', block: 'center', inline: 'center' });
  n.classList.remove('resaltada'); void n.offsetWidth; n.classList.add('resaltada');
  setTimeout(() => n.classList.remove('resaltada'), 3000);
}

/* ---------- Resumen en la barra lateral ---------- */
export function renderResumenLateral() {
  const cont = $('#lateral-resumen');
  const yaExiste = S.labs.every((lab) => cont.querySelector(`.lr-lab[data-lab="${lab.id}"]`));
  if (yaExiste) {
    S.labs.forEach((lab) => {
      const eqs = equiposLab(lab.id);
      const n = eqs.length || 1;
      const c = { verde: 0, ambar: 0, rojo: 0, azul: 0 };
      eqs.forEach((e) => { c[e.estado] += 1; });
      const caja = cont.querySelector(`.lr-lab[data-lab="${lab.id}"]`);
      const num = caja.querySelector('[data-verde]');
      contar(num, Number(num.textContent), c.verde);
      caja.querySelector('[data-total]').textContent = String(eqs.length);
      ['verde', 'ambar', 'rojo', 'azul'].forEach((k) => { caja.querySelector(`.b-${k}`).style.width = `${(c[k] / n) * 100}%`; });
    });
    return;
  }
  cont.innerHTML = '<h4>Estado general</h4>' + S.labs.map((lab) => {
    const eqs = equiposLab(lab.id);
    const n = eqs.length || 1;
    const c = { verde: 0, ambar: 0, rojo: 0, azul: 0 };
    eqs.forEach((e) => { c[e.estado] += 1; });
    return `<div class="lr-lab" data-lab="${lab.id}">
        <span>${esc(lab.nombre.replace(/^Laboratorio de /i, ''))}<b><span data-verde>${c.verde}</span>/<span data-total>${eqs.length}</span></b></span>
        <div class="lr-barra" title="Operativas ${c.verde} · Detalle ${c.ambar} · Fuera ${c.rojo} · Revisión ${c.azul}">
          ${['verde', 'ambar', 'rojo', 'azul'].map((k) => `<i class="b-${k}" style="width:${(c[k] / n) * 100}%"></i>`).join('')}
        </div></div>`;
  }).join('');
}

/* ---------- Aviso de modo (selección / edición) ---------- */
function renderAviso() {
  const a = $('#aviso-modo');
  $('#btn-seleccionar')?.classList.toggle('activo', S.modoSeleccion);
  $('#btn-editar-mapa')?.classList.toggle('activo', S.modoEdicion);
  if (S.modoEdicion) {
    a.hidden = false;
    a.innerHTML = `${icono('info')} <span>Modo edición del mapa: pasa el cursor sobre un lugar para insertar o quitar lugares. También puedes arrastrar equipos.</span>
      <button class="btn sm" id="salir-modo">Listo</button>`;
  } else if (S.modoSeleccion) {
    a.hidden = false;
    a.innerHTML = `${icono('seleccionar')} <span>${S.modelo ? `Modelo: <b>${esc(equipoPorId(S.modelo)?.numero || '')}</b>. Marca las PCs que recibirán su configuración y pulsa <b>Copiar</b>.` : 'Haz clic en las PCs que quieras editar a la vez.'} Clic en <b>F1, F2…</b> para seleccionar una fila completa.</span>
      <button class="btn sm" id="salir-modo">Terminar</button>`;
  } else {
    a.hidden = true;
    a.innerHTML = '';
  }
  a.querySelector('#salir-modo')?.addEventListener('click', () => { S.modoEdicion = false; S.modoSeleccion = false; S.seleccion.clear(); S.modelo = null; renderTodo(); });
}

export function alternarSeleccion() {
  S.modoSeleccion = !S.modoSeleccion;
  S.modoEdicion = false;
  if (!S.modoSeleccion) { S.seleccion.clear(); S.modelo = null; }
  renderMapa(); renderAviso(); renderLoteBarra();
}

export function alternarEdicion() {
  S.modoEdicion = !S.modoEdicion;
  S.modoSeleccion = false;
  S.seleccion.clear();
  renderMapa(); renderAviso(); renderLoteBarra();
}

/* ---------- Barra flotante de edición en lote ---------- */
export function renderLoteBarra() {
  const b = $('#lote-barra');
  const n = S.seleccion.size;
  if (!S.modoSeleccion) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `
    <b>${n}</b><span>seleccionada${n === 1 ? '' : 's'}</span>
    <button class="btn sm fantasma" data-l="todas">Seleccionar ${hayFiltros() ? 'filtradas' : 'todas'}</button>
    <button class="btn sm fantasma" data-l="ninguna" ${n ? '' : 'disabled'}>Ninguna</button>
    <button class="btn sm fantasma" data-l="copiar" ${n ? '' : 'disabled'} title="Copiar la configuración de una PC a las seleccionadas">
      ${icono('copiar', 'sm')} ${S.modelo ? `Copiar de ${esc(equipoPorId(S.modelo)?.numero || '')}` : 'Copiar de una PC'}</button>
    <button class="btn sm primario" data-l="editar" ${n ? '' : 'disabled'}>${icono('editar', 'sm')} Editar en lote</button>
    <button class="btn sm icon fantasma" data-l="cerrar" title="Terminar selección">${icono('x', 'sm')}</button>`;
  b.querySelector('[data-l="copiar"]').onclick = () => abrirCopiar([...S.seleccion], S.modelo);
  b.querySelector('[data-l="todas"]').onclick = () => {
    equiposLab().filter(pasaFiltros).forEach((e) => S.seleccion.add(e.id));
    pintarSeleccion();
  };
  b.querySelector('[data-l="ninguna"]').onclick = () => { S.seleccion.clear(); pintarSeleccion(); };
  b.querySelector('[data-l="editar"]').onclick = () => abrirLote([...S.seleccion]);
  b.querySelector('[data-l="cerrar"]').onclick = alternarSeleccion;
}

function pintarSeleccion() {
  document.querySelectorAll('.pc[data-id]').forEach((n) => n.classList.toggle('sel', S.seleccion.has(Number(n.dataset.id))));
  renderLoteBarra();
}

/* ================================================================== */
/*  Interacción: clic, teclado, tooltip                                */
/* ================================================================== */

let suprimirClic = false;

function alClic(ev) {
  if (suprimirClic) { suprimirClic = false; return; }
  const t = ev.target;

  // Herramientas de edición del mapa
  const ins = t.closest('[data-ins]');
  if (ins) { insertarLugar(ins.closest('.lugar'), ins.dataset.ins); return; }
  if (t.closest('[data-quitar-lugar]')) { quitarLugar(t.closest('.lugar')); return; }
  const hu = t.closest('.hueco');
  if (hu && S.modoEdicion) { crearEnHueco(Number(hu.dataset.huecoF), Number(hu.dataset.huecoC)); return; }
  const qf = t.closest('[data-quitar-fila]');
  if (qf) { quitarFila(Number(qf.dataset.quitarFila)); return; }

  // Selección de fila completa
  const fl = t.closest('.fila-lbl');
  if (fl && S.modoSeleccion) {
    const f = Number(fl.dataset.fila);
    const ids = equiposLab().filter((e) => e.lugar_id && lugarPorId(e.lugar_id).fila === f).map((e) => e.id);
    const todas = ids.every((id) => S.seleccion.has(id));
    ids.forEach((id) => (todas ? S.seleccion.delete(id) : S.seleccion.add(id)));
    pintarSeleccion();
    return;
  }

  const pc = t.closest('.pc[data-id]');
  if (pc) {
    const id = Number(pc.dataset.id);
    if (S.modoSeleccion) {
      if (id === S.modelo) { toast('Esa es la PC modelo; elige las que recibirán su configuración.', 'info'); return; }
      S.seleccion.has(id) ? S.seleccion.delete(id) : S.seleccion.add(id);
      pintarSeleccion();
    } else {
      ocultarTip();
      abrirEquipo(equipoPorId(id));
    }
    return;
  }

  const vacio = t.closest('.lugar.vacio.agregar');
  if (vacio) abrirEquipo(null, { lugarId: Number(vacio.dataset.lugar) });
}

mapa.addEventListener('click', alClic);
bandeja.addEventListener('click', alClic);
[mapa, bandeja].forEach((c) => c.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.pc[data-id]')) { e.preventDefault(); e.target.click(); }
}));

/* Tooltip con detalle completo al pasar el cursor */
let tipTimer = null;
function mostrarTip(pcEl) {
  const e = equipoPorId(Number(pcEl.dataset.id));
  if (!e) return;
  const st = estadoDe(e);
  const so = e.so.map(soPorId).filter(Boolean).map((s) => s.nombre).join(', ') || '—';
  const sw = e.software.map(swPorId).filter(Boolean).map((s) => s.nombre).sort().join(', ') || '—';
  const malos = PERIFERICOS.filter((p) => e[p.clave] !== 'presente').map((p) => `${p.nombre}: ${PER_ESTADOS[e[p.clave]].toLowerCase()}`);
  tip.innerHTML = `
    <h4>${esc(e.numero)}<span class="tp-estado"><i class="punto st-${st}"></i>${ESTADOS[st].nombre}</span></h4>
    <dl>
      <dt>Ubicación</dt><dd>${esc(ubicacionTxt(e))}</dd>
      <dt>Sistema</dt><dd>${esc(so)}</dd>
      <dt>Periféricos</dt><dd>${malos.length ? esc(malos.join(' · ')) : 'Completos'}</dd>
      <dt>Software</dt><dd>${esc(sw)}</dd>
      ${resumenSpecs(e) ? `<dt>Equipo</dt><dd>${esc(resumenSpecs(e))}</dd>` : ''}
      ${e.observaciones ? `<dt>Notas</dt><dd>${esc(e.observaciones)}</dd>` : ''}
      ${e.estado_desde ? `<dt>Desde</dt><dd>${esc(fechaCorta(e.estado_desde))} (${haceTxt(e.estado_desde)})</dd>` : ''}
      ${e.pendientes ? `<dt>Pendientes</dt><dd>${e.pendientes} sin completar</dd>` : ''}
    </dl>
    ${e.estado_manual && e.motivo_manual ? `<div class="tp-motivo">${icono('candado', 'sm')} ${esc(e.motivo_manual)}</div>` : ''}`;
  tip.hidden = false;
  const r = pcEl.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let x = r.right + 10;
  if (x + w > innerWidth - 10) x = r.left - w - 10;
  if (x < 10) x = Math.min(innerWidth - w - 10, Math.max(10, r.left));
  let y = Math.min(innerHeight - h - 10, Math.max(70, r.top));
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
export function ocultarTip() { clearTimeout(tipTimer); tip.hidden = true; }

[mapa, bandeja].forEach((c) => {
  c.addEventListener('pointerover', (ev) => {
    const pc = ev.target.closest('.pc[data-id]');
    if (!pc || arrastre || ev.pointerType !== 'mouse') return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => mostrarTip(pc), 550);
  });
  c.addEventListener('pointerout', (ev) => {
    const pc = ev.target.closest('.pc[data-id]');
    if (pc && !pc.contains(ev.relatedTarget)) ocultarTip();
  });
});
addEventListener('scroll', ocultarTip, true);

/* ================================================================== */
/*  Arrastrar y soltar (mover / intercambiar equipos)                  */
/* ================================================================== */

let presion = null;   // { x, y, id, el, ox, oy }
let arrastre = null;  // { fantasma, destino }

function puedeArrastrar() { return esAdmin() && !S.modoSeleccion; }

function alPresionar(ev) {
  if (ev.button !== 0 || !puedeArrastrar()) return;
  const pc = ev.target.closest('.pc[data-id]');
  if (!pc || ev.target.closest('.lugar-herr')) return;
  const r = pc.getBoundingClientRect();
  presion = { x: ev.clientX, y: ev.clientY, id: Number(pc.dataset.id), el: pc, ox: ev.clientX - r.left, oy: ev.clientY - r.top, pid: ev.pointerId };
  addEventListener('pointermove', alMover);
  addEventListener('pointerup', alSoltar);
  addEventListener('pointercancel', cancelarArrastre);
}
mapa.addEventListener('pointerdown', alPresionar);
bandeja.addEventListener('pointerdown', alPresionar);

function iniciarArrastre() {
  ocultarTip();
  const r = presion.el.getBoundingClientRect();
  const fantasma = el('<div class="fantasma-arrastre"></div>');
  const copia = presion.el.cloneNode(true);
  copia.classList.remove('atenuada', 'resaltada', 'guardado');
  fantasma.append(copia);
  fantasma.style.width = `${r.width}px`;
  fantasma.style.height = `${r.height}px`;
  document.body.append(fantasma);
  presion.el.classList.add('origen-arrastre');
  document.body.classList.add('arrastrando');
  bandeja.hidden = false; // siempre visible como destino mientras se arrastra
  arrastre = { fantasma, destino: undefined, scroll: null };
  try { presion.el.setPointerCapture?.(presion.pid); } catch { /* */ }
}

function alMover(ev) {
  if (!presion) return;
  if (!arrastre) {
    if (Math.hypot(ev.clientX - presion.x, ev.clientY - presion.y) < 6) return;
    iniciarArrastre();
  }
  ev.preventDefault();
  arrastre.x = ev.clientX;
  arrastre.y = ev.clientY;
  const f = arrastre.fantasma;
  f.style.left = `${ev.clientX - presion.ox}px`;
  f.style.top = `${ev.clientY - presion.oy}px`;
  detectarDestino();

  // Desplazamiento automático cerca de los bordes (sigue detectando el destino mientras se desplaza)
  clearInterval(arrastre.scroll);
  const margen = 70;
  let vy = 0; let vx = 0;
  if (ev.clientY < margen + 60) vy = -12; else if (ev.clientY > innerHeight - margen) vy = 12;
  const mr = mapa.getBoundingClientRect();
  if (ev.clientX < mr.left + 40) vx = -14; else if (ev.clientX > mr.right - 40) vx = 14;
  if (vx || vy) arrastre.scroll = setInterval(() => { scrollBy(0, vy); mapa.scrollLeft += vx; detectarDestino(); }, 16);
}

/** Marca el lugar (o la bandeja) que está bajo el cursor. */
function detectarDestino() {
  if (!arrastre || !presion) return;
  const bajo = document.elementFromPoint(arrastre.x, arrastre.y);
  const lugar = bajo?.closest('#mapa .lugar');
  const hueco = bajo?.closest('#mapa .hueco');
  const enBandeja = bajo?.closest('#bandeja');
  const origen = equipoPorId(presion.id);
  let destino;
  if (lugar) {
    const lid = Number(lugar.dataset.lugar);
    if (lid !== origen.lugar_id) destino = lid;
  } else if (hueco) {
    destino = `h:${hueco.dataset.huecoF}:${hueco.dataset.huecoC}`;
  } else if (enBandeja && origen.lugar_id) {
    destino = null;
  }
  if (destino === arrastre.destino) return;
  arrastre.destino = destino;
  quitarVistaPrevia();
  document.querySelectorAll('.lugar.destino, .hueco.destino').forEach((n) => n.classList.remove('destino', 'intercambio'));
  bandeja.classList.toggle('destino', destino === null);
  if (hueco && typeof destino === 'string') hueco.classList.add('destino');
  if (lugar && destino !== undefined) {
    lugar.classList.add('destino');
    const ocupante = lugar.querySelector('.pc');
    if (ocupante) {
      lugar.classList.add('intercambio');
      // La PC que está ahí se asoma hacia el lugar de origen: así se ve qué va a pasar al soltar
      const origenEl = presion.el.closest('.lugar') || presion.el;
      const ro = origenEl.getBoundingClientRect();
      const rd = ocupante.getBoundingClientRect();
      ocupante.classList.add('vista-previa');
      ocupante.style.transform = `translate(${(ro.left - rd.left) * 0.16}px, ${(ro.top - rd.top) * 0.16}px) scale(.94)`;
      arrastre.previa = ocupante;
    }
  }
}

function quitarVistaPrevia() {
  if (!arrastre?.previa) return;
  arrastre.previa.style.transform = '';
  const p = arrastre.previa;
  setTimeout(() => p.classList.remove('vista-previa'), 260);
  arrastre.previa = null;
}

function limpiarArrastre() {
  removeEventListener('pointermove', alMover);
  removeEventListener('pointerup', alSoltar);
  removeEventListener('pointercancel', cancelarArrastre);
  if (arrastre) {
    clearInterval(arrastre.scroll);
    quitarVistaPrevia();
    arrastre.fantasma.remove();
  }
  presion?.el.classList.remove('origen-arrastre');
  document.body.classList.remove('arrastrando');
  document.querySelectorAll('.lugar.destino, .hueco.destino').forEach((n) => n.classList.remove('destino', 'intercambio'));
  bandeja.classList.remove('destino');
}

function cancelarArrastre() {
  limpiarArrastre();
  presion = null; arrastre = null;
  renderBandeja();
}

function alSoltar() {
  if (!arrastre) { limpiarArrastre(); presion = null; return; }
  const destino = arrastre.destino;
  const id = presion.id;
  const fantasma = arrastre.fantasma;
  suprimirClic = true;
  setTimeout(() => { suprimirClic = false; }, 0);

  if (destino === undefined) {
    // Regresa a su lugar con animación
    const r = presion.el.getBoundingClientRect();
    const f = fantasma.getBoundingClientRect();
    fantasma.animate([{ transform: 'none' }, { transform: `translate(${r.left - f.left}px, ${r.top - f.top}px)` }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' })
      .finished.finally(() => cancelarArrastre());
    removeEventListener('pointermove', alMover);
    return;
  }
  const rectSoltado = fantasma.getBoundingClientRect();
  if (arrastre.previa) { arrastre.previa.style.transition = 'none'; arrastre.previa.style.transform = ''; }
  limpiarArrastre();
  presion = null; arrastre = null;
  if (typeof destino === 'string') { moverAHueco(id, destino, rectSoltado); return; }
  moverEquipo(id, destino, true, rectSoltado);
}

/** Soltar una PC en un espacio en blanco: crea ahí el lugar y la mueve. */
async function moverAHueco(id, clave, rectSoltado) {
  const [, f, c] = clave.split(':').map(Number);
  const e = equipoPorId(id);
  const origen = e.lugar_id;
  try {
    const r = await api('ctrl/php/inventarioApi.php?accion=insertarLugar', { body: { laboratorio_id: S.labId, fila: f, columna: c } });
    S.lugares = r.lugares;
    await moverEquipo(id, r.id, false, rectSoltado);
    const msg = `${e.numero} movida a fila ${f}, lugar ${c}`;
    if (origen) toast(`${msg}. Su lugar anterior quedó vacío.`, 'ok', { accion: 'Dejarlo en blanco', alAccion: () => quitarLugarId(origen) });
    else toast(msg, 'ok');
  } catch (err) { toast(err.message, 'error'); renderMapa(); }
}

async function quitarLugarId(id) {
  try {
    const r = await api('ctrl/php/inventarioApi.php?accion=eliminarLugar', { body: { id, recorrer: false } });
    conFlip(() => { S.lugares = r.lugares; renderMapa(); });
    renderStats();
  } catch (err) { toast(err.message, 'error'); }
}

async function crearEnHueco(fila, columna) {
  try {
    const r = await api('ctrl/php/inventarioApi.php?accion=insertarLugar', { body: { laboratorio_id: S.labId, fila, columna } });
    conFlip(() => { S.lugares = r.lugares; renderMapa(); });
    renderStats();
  } catch (err) { toast(err.message, 'error'); }
}

/** Mueve (o intercambia) con actualización optimista y opción de deshacer. */
export async function moverEquipo(id, lugarDestino, conDeshacer = false, rectSoltado = null) {
  const e = equipoPorId(id);
  const lugarOrigen = e.lugar_id;
  const ocupante = lugarDestino != null ? equiposLab().find((x) => x.lugar_id === lugarDestino && x.id !== id) : null;
  const respaldo = [[e, e.lugar_id], ...(ocupante ? [[ocupante, ocupante.lugar_id]] : [])];

  conFlip(() => {
    if (ocupante) ocupante.lugar_id = lugarOrigen;
    e.lugar_id = lugarDestino;
    renderMapa();
  }, { desde: rectSoltado ? new Map([[id, rectSoltado]]) : new Map() });
  renderStats();

  try {
    await api('ctrl/php/inventarioApi.php?accion=mover', { body: { equipo_id: id, lugar_id: lugarDestino } });
    destellar([id, ...(ocupante ? [ocupante.id] : [])]);
    if (conDeshacer) {
      const desc = ocupante ? `${e.numero} ⇄ ${ocupante.numero} intercambiadas` : lugarDestino == null ? `${e.numero} quitada de su lugar` : `${e.numero} movida a ${ubicacionTxt(e).toLowerCase()}`;
      toast(desc, 'ok', { accion: 'Deshacer', alAccion: () => moverEquipo(id, lugarOrigen) });
    }
  } catch (err) {
    conFlip(() => { respaldo.forEach(([eq, l]) => { eq.lugar_id = l; }); renderMapa(); });
    renderStats();
    toast(err.message, 'error');
  }
}

/* ================================================================== */
/*  Edición del mapa                                                   */
/* ================================================================== */

async function insertarLugar(lugarEl, lado) {
  const l = lugarPorId(Number(lugarEl.dataset.lugar));
  try {
    const r = await api('ctrl/php/inventarioApi.php?accion=insertarLugar', {
      body: { laboratorio_id: S.labId, fila: l.fila, columna: lado === 'antes' ? l.columna : l.columna + 1 },
    });
    conFlip(() => { S.lugares = r.lugares; renderMapa(); });
    renderStats();
  } catch (err) { toast(err.message, 'error'); }
}

async function quitarLugar(lugarEl) {
  const id = Number(lugarEl.dataset.lugar);
  try {
    const encoger = reducir ? Promise.resolve() : lugarEl.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.4) rotate(-4deg)' }],
      { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished;
    const [r] = await Promise.all([api('ctrl/php/inventarioApi.php?accion=eliminarLugar', { body: { id } }), encoger]);
    conFlip(() => { S.lugares = r.lugares; renderMapa(); });
    renderStats();
  } catch (err) { toast(err.message, 'error'); renderMapa(); }
}

async function quitarFila(fila) {
  if (!await confirmar({ titulo: `Eliminar fila ${fila}`, mensaje: 'Se quitarán todos sus lugares vacíos y las filas de atrás se recorrerán.', aceptar: 'Eliminar fila', peligro: true })) return;
  try {
    const r = await api('ctrl/php/inventarioApi.php?accion=eliminarFila', { body: { laboratorio_id: S.labId, fila } });
    conFlip(() => { S.lugares = r.lugares; renderMapa(); });
    renderStats();
    toast(r.mensaje);
  } catch (err) { toast(err.message, 'error'); }
}

function agregarFila() {
  const cuerpo = el(`<div class="campo">
      <label for="cant-lugares">¿Cuántos lugares tendrá la nueva fila?</label>
      <input class="input" id="cant-lugares" type="number" min="1" max="20" value="8">
      <span class="ayuda">Se agrega al fondo del laboratorio. Después puedes insertar o quitar lugares.</span>
    </div>`);
  const pie = el(`<div style="display:contents"><span class="espacio"></span><button class="btn" data-c>Cancelar</button><button class="btn primario" data-ok>Agregar fila</button></div>`);
  const m = abrirModal({ titulo: 'Agregar fila', cuerpo, pie, ancho: 400 });
  pie.querySelector('[data-c]').onclick = () => m.cerrar();
  const ok = pie.querySelector('[data-ok]');
  const enviar = () => conCarga(ok, async () => {
    try {
      const r = await api('ctrl/php/inventarioApi.php?accion=agregarFila', { body: { laboratorio_id: S.labId, cantidad: Number(cuerpo.querySelector('input').value) } });
      m.cerrar();
      conFlip(() => { S.lugares = r.lugares; renderMapa(); });
      renderStats();
      toast(r.mensaje);
      requestAnimationFrame(() => $('#btn-agregar-fila')?.scrollIntoView({ behavior: reducir ? 'auto' : 'smooth', block: 'end' }));
    } catch (err) { toast(err.message, 'error'); }
  });
  ok.onclick = enviar;
  cuerpo.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
}

export { labPorId, FAMILIAS };

/** Activa la selección con una PC como modelo para copiar su configuración. */
export function usarComoModelo(id) {
  S.modelo = id;
  S.modoSeleccion = true;
  S.modoEdicion = false;
  S.seleccion.clear();
  renderMapa(); renderAviso(); renderLoteBarra();
  toast(`${equipoPorId(id)?.numero} es el modelo. Ahora marca las PCs destino.`, 'info');
}
