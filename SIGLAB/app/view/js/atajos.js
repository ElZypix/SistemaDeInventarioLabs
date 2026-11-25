// view/js/atajos.js — Atajos de teclado en el mapa del laboratorio.
//   Flechas: moverse entre PCs · Enter: abrir ficha · Espacio: seleccionar (en modo selección)
//   M / T / R / C: cambiar Monitor, Teclado, Ratón (mouse) o CPU (presente → faltante → dañado)
//   1-4: fijar estado (sin pedir motivo) · 0: volver a automático
//   N: nueva PC · S: selección · E: editar mapa · G: recorrido · ?: ayuda

import { api } from './api.js';
import { icono } from './iconos.js';
import { esc, el, toast, abrirModal } from './ui.js';
import { S, ESTADOS, PER_ESTADOS, esAdmin, equipoPorId, lugarPorId, actualizarEquipos, cuerpoEquipo } from './estado.js';
import { abrirEquipo } from './equipo.js';
import { renderMapa, renderStats, renderProgreso, renderResumenLateral, destellar, alternarSeleccion, alternarEdicion } from './mapa.js';
import { abrirRecorrido } from './recorrido.js';

const CICLO = ['presente', 'faltante', 'danado'];
const TECLA_PERIF = { m: 'monitor', t: 'teclado', r: 'mouse', c: 'cpu' };
const NOMBRE_PERIF = { monitor: 'Monitor', teclado: 'Teclado', mouse: 'Mouse', cpu: 'CPU' };
const ESTADO_NUM = { 1: 'verde', 2: 'ambar', 3: 'rojo', 4: 'azul' };
const MOTIVO_SUGERIDO = { verde: 'Verificada en revisión', ambar: 'En mantenimiento', rojo: 'No enciende', azul: 'En revisión' };

const enMapa = () => document.querySelector('#vista-mapa.activa') && !document.querySelector('.modal-capa, .recorrido');
const tarjetaActiva = () => document.activeElement?.closest?.('.pc[data-id]');

function enfocar(id) {
  const n = document.querySelector(`#mapa .pc[data-id="${id}"], #bandeja .pc[data-id="${id}"]`);
  if (!n) return;
  n.focus({ preventScroll: true });
  n.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

/** Busca la PC más cercana en una dirección según su fila/lugar. */
function vecina(actual, dx, dy) {
  const la = actual.lugar_id ? lugarPorId(actual.lugar_id) : null;
  if (!la) return null;
  let mejor = null; let dist = Infinity;
  for (const e of S.equipos) {
    if (e.laboratorio_id !== S.labId || !e.lugar_id || e.id === actual.id) continue;
    const l = lugarPorId(e.lugar_id);
    const df = l.fila - la.fila; const dc = l.columna - la.columna;
    if (dy && Math.sign(df) !== dy) continue;
    if (dx && (df !== 0 || Math.sign(dc) !== dx)) continue;
    const d = dy ? Math.abs(df) * 100 + Math.abs(dc) : Math.abs(dc);
    if (d < dist) { dist = d; mejor = e; }
  }
  return mejor;
}

async function guardarRapido(e, cambios, mensaje) {
  try {
    const r = await api('ctrl/php/inventarioApi.php?accion=guardarEquipo', { body: cuerpoEquipo(e, cambios) });
    const antes = new Map([[e.id, e.estado]]);
    actualizarEquipos([r.equipo]);
    renderMapa(); renderStats(); renderProgreso(); renderResumenLateral();
    destellar([e.id], antes);
    enfocar(e.id);
    toast(mensaje, 'ok', { duracion: 1800 });
  } catch (err) { toast(err.message, 'error'); }
}

function pedirMotivo(e, estado) {
  const cuerpo = el(`<div class="campo"><label for="at-motivo">Motivo para "${ESTADOS[estado].nombre}"</label>
    <input class="input" id="at-motivo" maxlength="200" value="${esc(MOTIVO_SUGERIDO[estado])}"></div>`);
  const m = abrirModal({ titulo: `${esc(e.numero)} · <i class="punto st-${estado}"></i> ${ESTADOS[estado].nombre}`, cuerpo, ancho: 420,
    pie: '<span class="espacio"></span><span class="ayuda">Enter para guardar · Esc para cancelar</span>' });
  const inp = cuerpo.querySelector('input');
  requestAnimationFrame(() => { inp.focus(); inp.select(); });
  inp.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const motivo = inp.value.trim();
    if (!motivo) return;
    m.cerrar();
    guardarRapido(e, { estado_manual: estado, motivo_manual: motivo }, `${e.numero}: ${ESTADOS[estado].nombre}`);
  });
}

export function ayudaAtajos() {
  const filas = [
    ['← ↑ → ↓', 'Moverse entre las PCs del mapa'], ['Enter', 'Abrir la ficha de la PC'],
    ['M · T · R · C', 'Cambiar Monitor, Teclado, Ratón o CPU (presente → faltante → dañado)'],
    ['1 · 2 · 3 · 4', 'Fijar estado: Operativa, Detalle menor, Fuera de servicio, En revisión'],
    ['0', 'Volver al estado automático'], ['Espacio', 'Marcar o desmarcar (en modo selección)'],
    ['N', 'Nueva PC'], ['S', 'Modo selección'], ['E', 'Editar el mapa'], ['G', 'Modo recorrido'],
    ['Ctrl + K  ·  /', 'Buscar'], ['?', 'Mostrar esta ayuda'],
  ];
  abrirModal({ titulo: `${icono('teclas')} Atajos de teclado`, ancho: 520,
    cuerpo: `<table class="tabla atajos">${filas.map(([k, t]) => `<tr><td><span class="kbd">${k}</span></td><td>${t}</td></tr>`).join('')}</table>
      <p class="ayuda" style="margin:0">Primero haz clic en una PC (o usa Tab) para empezar a moverte con las flechas.</p>` });
}

document.addEventListener('keydown', (ev) => {
  if (!enMapa() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.target.closest('input, textarea, select, [contenteditable]')) return;
  const k = ev.key.toLowerCase();
  const pc = tarjetaActiva();
  const e = pc ? equipoPorId(Number(pc.dataset.id)) : null;
  const admin = esAdmin();

  if (k === '?') { ev.preventDefault(); ayudaAtajos(); return; }
  if (k === 'g' && admin) { ev.preventDefault(); abrirRecorrido(); return; }
  if (k === 'n' && admin) { ev.preventDefault(); abrirEquipo(null); return; }
  if (k === 's' && admin) { ev.preventDefault(); alternarSeleccion(); return; }
  if (k === 'e' && admin) { ev.preventDefault(); alternarEdicion(); return; }

  const flechas = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
  if (flechas[k]) {
    ev.preventDefault();
    if (!e) { const primera = document.querySelector('#mapa .pc[data-id]'); primera?.focus(); return; }
    const v = vecina(e, ...flechas[k]);
    if (v) enfocar(v.id);
    return;
  }
  if (!e) return;
  if (!admin) return;

  if (TECLA_PERIF[k]) {
    ev.preventDefault();
    const campo = TECLA_PERIF[k];
    const nuevo = CICLO[(CICLO.indexOf(e[campo]) + 1) % CICLO.length];
    const pend = e.estado_manual === 'azul' && (e.motivo_manual || '').toLowerCase() === 'pendiente de inventario';
    guardarRapido(e, { [campo]: nuevo, ...(pend ? { estado_manual: null, motivo_manual: null } : {}) }, `${e.numero}: ${NOMBRE_PERIF[campo]} ${PER_ESTADOS[nuevo].toLowerCase()}`);
    return;
  }
  if (ESTADO_NUM[k]) { ev.preventDefault(); guardarRapido(e, { estado_manual: ESTADO_NUM[k], motivo_manual: null }, `${e.numero}: ${ESTADOS[ESTADO_NUM[k]].nombre}`); return; }
  if (k === '0' && e.estado_manual) { ev.preventDefault(); guardarRapido(e, { estado_manual: null, motivo_manual: null }, `${e.numero}: estado automático`); }
});
