// view/js/matriz.js — Matriz de software: PCs × programas, con instalaciones pendientes.

import { api } from './api.js';
import { icono } from './iconos.js';
import { esc, toast, debounce } from './ui.js';
import { S, esAdmin, equipoPorId, equiposOrdenados, actualizarEquipos, norm, swPorId } from './estado.js';
import { exportarExcel } from './exportar.js';

const cont = document.getElementById('matriz');
let labId = null;
let filtro = '';
let soloFaltantes = false;
let listo = false;

export function mostrarMatriz() {
  labId = labId ?? S.labId;
  if (!listo) { prepararEventos(); listo = true; }
  pintar(true);
}

/** Columnas por programa (todas sus versiones juntas). */
function programasVisibles(eqs) {
  const m = new Map();
  S.software.forEach((s) => {
    const k = s.programa.toLowerCase();
    if (!m.has(k)) m.set(k, { id: k, nombre: s.programa, categoria: s.categoria, ids: [], activo: false });
    const p = m.get(k);
    p.ids.push(s.id);
    p.activo ||= s.activo;
  });
  return [...m.values()]
    .filter((p) => (p.activo || eqs.some((e) => tiene(e, p))) && (!filtro || norm(p.nombre).includes(norm(filtro)) || norm(p.categoria).includes(norm(filtro))))
    .filter((p) => !soloFaltantes || eqs.some((e) => !tiene(e, p)))
    .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
}
const versionEn = (e, p) => e.software.map(swPorId).find((s) => s && p.ids.includes(s.id));
const tiene = (e, p) => e.software.some((id) => p.ids.includes(id));
const contenidoCelda = (e, p) => {
  const s = versionEn(e, p);
  return s ? (s.version ? `<span class="mz-ver">${esc(s.version)}</span>` : icono('check')) : icono('x');
};

function pintar(animar = false) {
  const eqs = equiposOrdenados(labId);
  const progs = programasVisibles(eqs);
  const admin = esAdmin();
  const total = eqs.length || 1;

  cont.innerHTML = `
    <div class="matriz-barra">
      <div class="segmentado" id="mz-lab">${S.labs.map((l) => `<button data-lab="${l.id}" class="${l.id === labId ? 'sel' : ''}">${esc(l.nombre.replace(/^Laboratorio de /i, ''))}</button>`).join('')}</div>
      <div class="buscador-mini">${icono('buscar', 'sm')}<input class="input" id="mz-q" placeholder="Filtrar programas o categoría…" value="${esc(filtro)}"></div>
      <label class="switch"><input type="checkbox" id="mz-faltan" ${soloFaltantes ? 'checked' : ''}><span class="pista"></span>Solo con faltantes</label>
      <span class="espacio"></span>
      <button class="btn" id="mz-pdf">${icono('pdf', 'sm')} Instalaciones pendientes (PDF)</button>
      <button class="btn" id="mz-xlsx">${icono('excel', 'sm')} Excel</button>
    </div>
    ${!eqs.length || !progs.length ? `<div class="panel vacio-msg">${!eqs.length ? 'Este laboratorio no tiene equipos.' : 'Ningún programa coincide con el filtro.'}</div>` : `
    <div class="panel matriz-wrap ${animar ? 'entrando-mz' : ''}">
      <table class="matriz">
        <thead><tr>
          <th class="mz-pc">Equipo</th>
          ${progs.map((p, c) => `<th class="mz-prog" data-c="${c}" title="${esc(p.categoria)}"><span>${esc(p.nombre)}</span></th>`).join('')}
          <th class="mz-tot">Total</th>
        </tr></thead>
        <tbody>${eqs.map((e, r) => {
          const n = progs.filter((p) => tiene(e, p)).length;
          return `<tr data-eq="${e.id}">
            <th class="mz-pc"><i class="punto st-${e.estado}"></i>${esc(e.numero)}</th>
            ${progs.map((p, c) => {
              const si = tiene(e, p);
              const v = versionEn(e, p)?.version;
              return `<td data-c="${c}" style="--r:${r};--k:${c}"><button class="mz-celda ${si ? 'si' : 'no'}" data-sw="${esc(p.id)}" ${admin ? '' : 'disabled'}
                title="${esc(p.nombre)}${v ? ` ${esc(v)}` : ''}" aria-label="${esc(p.nombre)} en ${esc(e.numero)}: ${si ? `instalado${v ? ` versión ${esc(v)}` : ''}` : 'falta'}">${contenidoCelda(e, p)}</button></td>`;
            }).join('')}
            <td class="mz-tot"><b>${n}</b>/${progs.length}</td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr>
          <th class="mz-pc">Instalado en</th>
          ${progs.map((p, c) => {
            const k = eqs.filter((e) => tiene(e, p)).length;
            return `<td data-c="${c}" data-tot="${esc(p.id)}"><span class="mz-pct ${k === eqs.length ? 'lleno' : ''}"><i style="height:${(k / total) * 100}%"></i></span><small>${k}/${eqs.length}</small></td>`;
          }).join('')}
          <td></td>
        </tr></tfoot>
      </table>
    </div>
    <p class="ayuda">${admin ? 'Haz clic en una celda para marcar o desmarcar el programa en esa PC. Se guarda al instante.' : 'Vista de solo lectura.'}
      Los programas inactivos del catálogo no aparecen.</p>`}`;
}

function prepararEventos() {
  cont.addEventListener('click', async (ev) => {
    const lab = ev.target.closest('[data-lab]');
    if (lab) { labId = Number(lab.dataset.lab); pintar(true); return; }
    if (ev.target.closest('#mz-pdf')) {
      const eqs = equiposOrdenados(labId);
      const ids = programasVisibles(eqs).flatMap((p) => p.ids).join(',');
      window.open(`ctrl/php/reporteSoftware.php?lab=${labId}&sw=${ids}`, '_blank', 'noopener');
      return;
    }
    if (ev.target.closest('#mz-xlsx')) { exportarExcel(ev.target.closest('#mz-xlsx')); return; }

    const celda = ev.target.closest('.mz-celda');
    if (!celda || celda.disabled) return;
    const fila = celda.closest('tr');
    const e = equipoPorId(Number(fila.dataset.eq));
    const clave = celda.dataset.sw;
    const p = programasVisibles(equiposOrdenados(labId)).find((x) => x.id === clave);
    if (!p) return;
    const instalar = !tiene(e, p);
    const antes = [...e.software];
    // Optimista: se pinta al momento y se revierte si falla
    if (!instalar) e.software = e.software.filter((x) => !p.ids.includes(x));
    else { const sinVer = S.software.find((s) => p.ids.includes(s.id) && !s.version); if (sinVer) e.software = [...e.software, sinVer.id]; }
    pintarCelda(celda, instalar, e, p);
    actualizarTotales(fila, clave);
    try {
      const r = await api('ctrl/php/inventarioApi.php?accion=ponerSoftware', { body: { equipo_id: e.id, programa: p.nombre, instalado: instalar } });
      if (r.software) S.software = r.software;
      actualizarEquipos([r.equipo]);
      pintarCelda(celda, instalar, equipoPorId(e.id), p, false);
      actualizarTotales(fila, clave);
    } catch (err) {
      e.software = antes;
      pintarCelda(celda, !instalar, e, p);
      actualizarTotales(fila, clave);
      toast(err.message, 'error');
    }
  });
  cont.addEventListener('input', debounce((ev) => {
    if (ev.target.id !== 'mz-q') return;
    filtro = ev.target.value;
    const pos = ev.target.selectionStart;
    pintar();
    const q = document.getElementById('mz-q'); q.focus(); q.setSelectionRange(pos, pos);
  }, 180));
  cont.addEventListener('change', (ev) => {
    if (ev.target.id === 'mz-faltan') { soloFaltantes = ev.target.checked; pintar(true); }
  });
  // Resalta la columna bajo el cursor
  cont.addEventListener('pointerover', (ev) => {
    const c = ev.target.closest('[data-c]')?.dataset.c;
    cont.querySelectorAll('.col-hover').forEach((x) => x.classList.remove('col-hover'));
    if (c !== undefined) cont.querySelectorAll(`[data-c="${c}"]`).forEach((x) => x.classList.add('col-hover'));
  });
  cont.addEventListener('pointerleave', () => cont.querySelectorAll('.col-hover').forEach((x) => x.classList.remove('col-hover')));
}

function pintarCelda(celda, si, e, p, animar = true) {
  celda.className = `mz-celda ${si ? 'si' : 'no'}`;
  celda.innerHTML = e && p ? contenidoCelda(e, p) : si ? icono('check') : icono('x');
  if (animar) celda.animate([{ transform: 'scale(.6)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.34,1.56,.64,1)' });
}

function actualizarTotales(fila, sw) {
  const eqs = equiposOrdenados(labId);
  const progs = programasVisibles(eqs);
  const e = equipoPorId(Number(fila.dataset.eq));
  fila.querySelector('td.mz-tot').innerHTML = `<b>${progs.filter((p) => tiene(e, p)).length}</b>/${progs.length}`;
  const tot = [...cont.querySelectorAll('[data-tot]')].find((x) => x.dataset.tot === sw);
  const prog = progs.find((p) => p.id === sw);
  if (!tot || !prog) return;
  const k = eqs.filter((x) => tiene(x, prog)).length;
  tot.querySelector('i').style.height = `${(k / (eqs.length || 1)) * 100}%`;
  tot.querySelector('.mz-pct').classList.toggle('lleno', k === eqs.length);
  tot.querySelector('small').textContent = `${k}/${eqs.length}`;
}
