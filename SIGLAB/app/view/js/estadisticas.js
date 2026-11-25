// view/js/estadisticas.js — Panel de estadísticas por laboratorio.

import { icono } from './iconos.js';
import { esc } from './ui.js';
import {
  S, ESTADOS, PERIFERICOS, FAMILIAS, equiposLab, labPorId, esPendienteInv, diasDesde, haceTxt, ubicacionTxt,
} from './estado.js';
import { contar } from './animaciones.js';

const cont = document.getElementById('estadisticas');
let labSel = null;
let listo = false;
let irAEquipo = () => {};

const COLOR = { verde: 'var(--verde)', ambar: 'var(--ambar)', rojo: 'var(--rojo)', azul: 'var(--azul)' };

export function mostrarEstadisticas(ir) {
  if (ir) irAEquipo = ir;
  labSel = labSel ?? 'todos';
  if (!listo) {
    cont.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-lab]');
      if (b) { labSel = b.dataset.lab; pintar(); return; }
      const pc = ev.target.closest('[data-eq]');
      if (pc) { const e = S.equipos.find((x) => x.id === Number(pc.dataset.eq)); if (e) irAEquipo(e); }
    });
    listo = true;
  }
  pintar();
}

function donut(cuenta, total) {
  const r = 52; const C = 2 * Math.PI * r;
  let acum = 0;
  const arcos = Object.keys(ESTADOS).map((k) => {
    const frac = total ? cuenta[k] / total : 0;
    const seg = `<circle class="dn-seg" r="${r}" cx="70" cy="70" stroke="${COLOR[k]}" stroke-dasharray="0 ${C}"
      data-dash="${Math.max(0, frac * C - (frac > 0 && frac < 1 ? 2 : 0))} ${C}" stroke-dashoffset="${-acum * C}"><title>${ESTADOS[k].nombre}: ${cuenta[k]}</title></circle>`;
    acum += frac;
    return seg;
  }).join('');
  return `<svg viewBox="0 0 140 140" class="donut" role="img" aria-label="Distribución por estado">
    <circle r="${r}" cx="70" cy="70" class="dn-fondo"/>${arcos}
    <text x="70" y="66" class="dn-num">${total ? Math.round((cuenta.verde / total) * 100) : 0}%</text>
    <text x="70" y="86" class="dn-lbl">operativas</text></svg>`;
}

function barras(items, max, conPct = false) {
  return `<div class="barras">${items.map((it) => `
    <div class="barra-fila" ${it.eq ? `data-eq="${it.eq}"` : ''}>
      <span class="bf-nombre">${it.icono || ''}${esc(it.nombre)}</span>
      <span class="bf-pista"><i style="--w:${max ? (it.valor / max) * 100 : 0}%;--c:${it.color || 'var(--primario)'}"></i></span>
      <span class="bf-valor">${conPct ? `${Math.round((it.valor / (max || 1)) * 100)}%` : it.valor}${it.extra ? ` <small>${it.extra}</small>` : ''}</span>
    </div>`).join('')}</div>`;
}

function pintar() {
  const eqs = labSel === 'todos' ? S.equipos : equiposLab(Number(labSel));
  const total = eqs.length;
  const cuenta = { verde: 0, ambar: 0, rojo: 0, azul: 0 };
  eqs.forEach((e) => { cuenta[e.estado] += 1; });
  const capturadas = eqs.filter((e) => !esPendienteInv(e)).length;
  const pend = eqs.reduce((a, e) => a + (e.pendientes || 0), 0);

  // Sistemas operativos
  const usoSO = S.so.map((s) => ({ nombre: s.nombre, valor: eqs.filter((e) => e.so.includes(s.id)).length, icono: icono(s.familia, 'sm'),
    color: { windows: '#0078d4', linux: '#f97316', macos: '#64748b', otro: '#8b5cf6' }[s.familia] })).filter((x) => x.valor);
  const sinSO = eqs.filter((e) => !e.so.length).length;
  if (sinSO) usoSO.push({ nombre: 'Sin sistema registrado', valor: sinSO, color: 'var(--borde-2)' });
  usoSO.sort((a, b) => b.valor - a.valor);
  const duales = eqs.filter((e) => e.so.length > 1).length;

  // Software
  // Cobertura por programa (cualquier versión)
  const porProg = new Map();
  S.software.forEach((s) => {
    const k = s.programa.toLowerCase();
    if (!porProg.has(k)) porProg.set(k, { nombre: s.programa, ids: new Set(), activo: false });
    porProg.get(k).ids.add(s.id); porProg.get(k).activo ||= s.activo;
  });
  const cobertura = [...porProg.values()].filter((p) => p.activo).map((p) => ({ nombre: p.nombre, valor: eqs.filter((e) => e.software.some((id) => p.ids.has(id))).length }))
    .sort((a, b) => b.valor - a.valor)
    .map((x) => ({ ...x, color: x.valor === total ? 'var(--verde)' : x.valor / (total || 1) < 0.5 ? 'var(--rojo)' : 'var(--ambar)', extra: `${x.valor}/${total}` }));

  // Periféricos
  const perif = PERIFERICOS.map((p) => ({ p, falt: eqs.filter((e) => e[p.clave] === 'faltante').length, dan: eqs.filter((e) => e[p.clave] === 'danado').length }));

  // Más tiempo con problemas
  const problemas = eqs.filter((e) => e.estado === 'rojo' || e.estado === 'ambar')
    .sort((a, b) => (diasDesde(b.estado_desde) ?? -1) - (diasDesde(a.estado_desde) ?? -1)).slice(0, 8);

  cont.innerHTML = `
    <div class="matriz-barra">
      <div class="segmentado">
        <button data-lab="todos" class="${labSel === 'todos' ? 'sel' : ''}">Ambos laboratorios</button>
        ${S.labs.map((l) => `<button data-lab="${l.id}" class="${String(l.id) === String(labSel) ? 'sel' : ''}">${esc(l.nombre.replace(/^Laboratorio de /i, ''))}</button>`).join('')}
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><span class="kpi-n" data-n="${total}">0</span><span>Equipos</span></div>
      <div class="kpi st-verde"><span class="kpi-n" data-n="${total ? Math.round((cuenta.verde / total) * 100) : 0}">0</span><span>% operativas</span></div>
      <div class="kpi"><span class="kpi-n" data-n="${total ? Math.round((capturadas / total) * 100) : 0}">0</span><span>% inventario capturado</span></div>
      <div class="kpi st-rojo"><span class="kpi-n" data-n="${cuenta.rojo}">0</span><span>Fuera de servicio</span></div>
      <div class="kpi st-ambar"><span class="kpi-n" data-n="${pend}">0</span><span>Pendientes abiertos</span></div>
    </div>
    <div class="est-grid">
      <section class="panel est-card">
        <div class="panel-head"><h3>Estado de los equipos</h3></div>
        <div class="panel-body donut-wrap">
          ${donut(cuenta, total)}
          <ul class="leyenda-est">${Object.entries(ESTADOS).map(([k, v]) => `<li><i class="punto st-${k}"></i>${v.nombre}<b>${cuenta[k]}</b></li>`).join('')}</ul>
        </div>
      </section>
      <section class="panel est-card">
        <div class="panel-head"><h3>Sistemas operativos</h3>${duales ? `<span class="badge">${duales} con arranque dual</span>` : ''}</div>
        <div class="panel-body">${usoSO.length ? barras(usoSO, total) : '<div class="vacio-msg">Sin datos todavía.</div>'}</div>
      </section>
      <section class="panel est-card">
        <div class="panel-head"><h3>Periféricos con problemas</h3></div>
        <div class="panel-body">
          <div class="perif-est">${perif.map(({ p, falt, dan }) => `
            <div class="pe-item">${icono(p.icono, 'lg')}<b>${p.nombre}</b>
              <span class="pe-num ${falt ? 'ambar' : ''}">${falt}<small>faltantes</small></span>
              <span class="pe-num ${dan ? 'rojo' : ''}">${dan}<small>dañados</small></span></div>`).join('')}</div>
        </div>
      </section>
      <section class="panel est-card">
        <div class="panel-head"><h3>${icono('reloj', 'sm')} Más tiempo con problemas</h3></div>
        <div class="panel-body">${problemas.length ? `<ul class="lista-prob">${problemas.map((e) => `
          <li data-eq="${e.id}"><i class="punto st-${e.estado}"></i><b>${esc(e.numero)}</b>
            <span>${esc(labSel === 'todos' ? labPorId(e.laboratorio_id).clave + ' · ' : '')}${esc(ubicacionTxt(e))}${e.estado_manual ? ` · ${esc(e.motivo_manual)}` : ''}</span>
            <small>${esc(haceTxt(e.estado_desde) || '—')}</small></li>`).join('')}</ul>` : '<div class="vacio-msg">✓ Ninguna PC con problemas.</div>'}</div>
      </section>
      <section class="panel est-card ancho">
        <div class="panel-head"><h3>Cobertura de software</h3><span class="ayuda">En cuántas PCs está instalado cada programa</span></div>
        <div class="panel-body">${cobertura.length && total ? barras(cobertura, total, true) : '<div class="vacio-msg">Sin datos todavía.</div>'}</div>
      </section>
    </div>`;

  // Animaciones de entrada: contadores, donut y barras
  cont.querySelectorAll('.kpi-n').forEach((n) => contar(n, 0, Number(n.dataset.n), 800));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    cont.querySelectorAll('.dn-seg').forEach((c) => c.setAttribute('stroke-dasharray', c.dataset.dash));
    cont.querySelectorAll('.bf-pista i').forEach((b, i) => { b.style.transitionDelay = `${Math.min(i * 30, 500)}ms`; b.style.width = b.style.getPropertyValue('--w'); });
  }));
  void FAMILIAS;
}
