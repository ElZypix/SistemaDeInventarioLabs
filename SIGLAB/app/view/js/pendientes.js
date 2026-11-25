// view/js/pendientes.js — Lista general de pendientes por laboratorio.

import { api } from './api.js';
import { icono } from './iconos.js';
import { esc, el, toast, abrirModal, conCarga, agitar } from './ui.js';
import { S, esAdmin, equipoPorId, labPorId, equiposOrdenados, fechaCorta, haceTxt, norm } from './estado.js';

const cont = document.getElementById('pendientes');
let lista = [];
let labFiltro = 'todos';
let estadoFiltro = 'abiertos';
let q = '';
let listo = false;
let irAEquipo = () => {};

/** `ir` recibe un equipo y lleva al mapa resaltándolo. */
export async function mostrarPendientes(ir) {
  if (ir) irAEquipo = ir;
  if (!listo) { prepararEventos(); listo = true; }
  cont.innerHTML = '<div class="panel vacio-msg">Cargando…</div>';
  await cargar();
}

async function cargar() {
  const r = await api('ctrl/php/pendientesApi.php?accion=listar');
  lista = r.pendientes;
  // Mantiene sincronizado el contador de las tarjetas
  const abiertos = new Map();
  lista.filter((p) => !p.hecho).forEach((p) => abiertos.set(p.equipo_id, (abiertos.get(p.equipo_id) || 0) + 1));
  S.equipos.forEach((e) => { e.pendientes = abiertos.get(e.id) || 0; });
  pintar();
}

function pintar() {
  const admin = esAdmin();
  const visibles = lista.filter((p) => (labFiltro === 'todos' || p.laboratorio_id === Number(labFiltro))
    && (estadoFiltro === 'todos' || (estadoFiltro === 'abiertos' ? !p.hecho : p.hecho))
    && (!q || norm(`${p.texto} ${p.responsable || ''} ${p.numero}`).includes(norm(q))));
  const nAb = lista.filter((p) => !p.hecho).length;

  const grupos = S.labs.filter((l) => labFiltro === 'todos' || l.id === Number(labFiltro))
    .map((l) => ({ lab: l, items: visibles.filter((p) => p.laboratorio_id === l.id) }));

  cont.innerHTML = `
    <div class="matriz-barra">
      <div class="segmentado" id="pd-lab">
        <button data-lab="todos" class="${labFiltro === 'todos' ? 'sel' : ''}">Ambos</button>
        ${S.labs.map((l) => `<button data-lab="${l.id}" class="${String(l.id) === String(labFiltro) ? 'sel' : ''}">${esc(l.nombre.replace(/^Laboratorio de /i, ''))}</button>`).join('')}
      </div>
      <div class="segmentado" id="pd-estado">
        ${[['abiertos', `Abiertos (${nAb})`], ['hechos', 'Completados'], ['todos', 'Todos']].map(([k, t]) => `<button data-est="${k}" class="${estadoFiltro === k ? 'sel' : ''}">${t}</button>`).join('')}
      </div>
      <div class="buscador-mini">${icono('buscar', 'sm')}<input class="input" id="pd-q" placeholder="Buscar…" value="${esc(q)}"></div>
      <span class="espacio"></span>
      ${admin ? `<button class="btn primario" id="pd-nuevo">${icono('mas', 'sm')} Nuevo pendiente</button>` : ''}
    </div>
    ${grupos.map((g) => `
      <section class="panel pd-grupo">
        <div class="panel-head"><h3>${esc(g.lab.nombre)}</h3><span class="badge">${g.items.length}</span></div>
        ${g.items.length ? `<ul class="pd-lista">${g.items.map((p) => `
          <li class="pend-item ${p.hecho ? 'hecho' : ''}" data-id="${p.id}">
            <label class="pend-check"><input type="checkbox" ${p.hecho ? 'checked' : ''} ${admin ? '' : 'disabled'}><span class="caja">${icono('check')}</span></label>
            <button class="pd-pc" data-eq="${p.equipo_id}" title="Ver en el mapa"><i class="punto st-${equipoPorId(p.equipo_id)?.estado || 'azul'}"></i>${esc(p.numero)}</button>
            <span class="pend-txt">${esc(p.texto)}${p.responsable ? ` <small>· ${esc(p.responsable)}</small>` : ''}</span>
            <small class="pend-fecha" title="${esc(fechaCorta(p.creado_en))}">${p.hecho ? `hecho ${esc(haceTxt(p.hecho_en))}` : esc(haceTxt(p.creado_en))}</small>
            ${admin ? `<button class="btn sm icon fantasma" data-borrar title="Eliminar">${icono('x', 'sm')}</button>` : ''}
          </li>`).join('')}</ul>` : `<div class="vacio-msg">${estadoFiltro === 'abiertos' ? '✓ Nada pendiente aquí.' : 'Sin resultados.'}</div>`}
      </section>`).join('')}`;
}

function prepararEventos() {
  cont.addEventListener('click', async (ev) => {
    const t = ev.target;
    const lab = t.closest('[data-lab]'); if (lab) { labFiltro = lab.dataset.lab; pintar(); return; }
    const est = t.closest('[data-est]'); if (est) { estadoFiltro = est.dataset.est; pintar(); return; }
    const pc = t.closest('.pd-pc'); if (pc) { const e = equipoPorId(Number(pc.dataset.eq)); if (e) irAEquipo(e); return; }
    if (t.closest('#pd-nuevo')) { nuevo(); return; }
    const b = t.closest('[data-borrar]');
    if (b) {
      const li = b.closest('.pend-item');
      try {
        await li.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(24px)' }], { duration: 200, fill: 'forwards' }).finished;
        await api('ctrl/php/pendientesApi.php?accion=eliminar', { body: { id: Number(li.dataset.id) } });
        await cargar();
      } catch (err) { toast(err.message, 'error'); pintar(); }
    }
  });
  cont.addEventListener('change', async (ev) => {
    const li = ev.target.closest('.pend-item'); if (!li) return;
    li.classList.toggle('hecho', ev.target.checked);
    try {
      await api('ctrl/php/pendientesApi.php?accion=marcar', { body: { id: Number(li.dataset.id), hecho: ev.target.checked } });
      if (estadoFiltro !== 'todos') await li.animate([{ opacity: 1 }, { opacity: 0, height: `${li.offsetHeight}px` }, { opacity: 0, height: '0px', padding: 0 }], { duration: 380, delay: 250, fill: 'forwards' }).finished;
      await cargar();
    } catch (err) { toast(err.message, 'error'); ev.target.checked = !ev.target.checked; }
  });
  cont.addEventListener('input', (ev) => {
    if (ev.target.id !== 'pd-q') return;
    q = ev.target.value;
    const pos = ev.target.selectionStart;
    pintar();
    const i = document.getElementById('pd-q'); i.focus(); i.setSelectionRange(pos, pos);
  });
}

function nuevo() {
  const labInicial = labFiltro === 'todos' ? S.labId : Number(labFiltro);
  const cuerpo = el(`<div style="display:contents">
    <div class="grid-2">
      <div class="campo"><label for="np-lab">Laboratorio</label><select class="select" id="np-lab">${S.labs.map((l) => `<option value="${l.id}" ${l.id === labInicial ? 'selected' : ''}>${esc(l.nombre.replace(/^Laboratorio de /i, ''))}</option>`).join('')}</select></div>
      <div class="campo"><label for="np-eq">Equipo</label><select class="select" id="np-eq"></select></div>
    </div>
    <div class="campo"><label for="np-txt">¿Qué hay que hacer?</label><input class="input" id="np-txt" maxlength="200" placeholder="Ej. Cambiar el teclado"></div>
    <div class="campo"><label for="np-resp">Responsable (opcional)</label><input class="input" id="np-resp" maxlength="80"></div>
  </div>`);
  const llenar = () => {
    const lab = Number(cuerpo.querySelector('#np-lab').value);
    cuerpo.querySelector('#np-eq').innerHTML = equiposOrdenados(lab).map((e) => `<option value="${e.id}">${esc(e.numero)}</option>`).join('');
  };
  llenar();
  cuerpo.querySelector('#np-lab').addEventListener('change', llenar);
  const pie = el(`<div style="display:contents"><span class="espacio"></span><button class="btn" data-c>Cancelar</button><button class="btn primario" data-ok>Agregar</button></div>`);
  const m = abrirModal({ titulo: 'Nuevo pendiente', cuerpo, pie, ancho: 500 });
  requestAnimationFrame(() => cuerpo.querySelector('#np-txt').focus());
  pie.querySelector('[data-c]').onclick = () => m.cerrar();
  const ok = pie.querySelector('[data-ok]');
  const enviar = () => conCarga(ok, async () => {
    try {
      await api('ctrl/php/pendientesApi.php?accion=crear', { body: {
        equipo_id: Number(cuerpo.querySelector('#np-eq').value),
        texto: cuerpo.querySelector('#np-txt').value,
        responsable: cuerpo.querySelector('#np-resp').value,
      } });
      m.cerrar();
      estadoFiltro = 'abiertos';
      await cargar();
      toast('Pendiente agregado.');
    } catch (err) { toast(err.message, 'error'); agitar(m.modal); }
  });
  ok.onclick = enviar;
  cuerpo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); enviar(); } });
  void labPorId;
}
