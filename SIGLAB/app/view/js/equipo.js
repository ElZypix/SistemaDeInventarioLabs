// view/js/equipo.js — Modal para crear/editar una PC y modal de edición en lote.

import { api } from './api.js';
import { icono } from './iconos.js';
import { esc, el, toast, abrirModal, confirmar, conCarga, agitar } from './ui.js';
import {
  S, ESTADOS, PERIFERICOS, PER_ESTADOS, FAMILIAS, esAdmin, estadoAuto,
  soPorId, labPorId, lugarPorId, equipoPorId, equiposLab, lugaresLab, actualizarEquipos, ubicacionTxt, norm,
  fechaCorta, equiposOrdenados, resumenSpecs,
} from './estado.js';
import { editorSpecs } from './specs.js';
import { animarPeriferico } from './animaciones.js';
import { selectorSO, selectorSoftware, botonPerfiles, agregarSoftware } from './selectores.js';
import { multiCombo } from './combobox.js';
import { renderTodo, conFlip, renderMapa, renderStats, renderFiltros, renderResumenLateral, destellar, renderProgreso, usarComoModelo, renderLoteBarra } from './mapa.js';

/* ------------------------------------------------------------------ */
/*  Auxiliares compartidos                                             */
/* ------------------------------------------------------------------ */

function siguienteNumero(labId) {
  const usados = new Set(equiposLab(labId).map((e) => e.numero));
  for (let i = 1; i < 1000; i++) {
    const n = `PC${String(i).padStart(2, '0')}`;
    if (!usados.has(n)) return n;
  }
  return '';
}

function refrescarTrasGuardar(ids, estadosAntes = new Map()) {
  conFlip(() => renderMapa());
  renderStats();
  renderProgreso();
  renderFiltros();
  renderResumenLateral();
  document.querySelectorAll('#lab-switch button').forEach((b) => {
    const n = equiposLab(Number(b.dataset.lab)).length;
    b.querySelector('small').textContent = `${n} equipo${n === 1 ? '' : 's'}`;
  });
  destellar(ids, estadosAntes);
}


/* ------------------------------------------------------------------ */
/*  Sección plegable (minimalista: solo se abre cuando se necesita)     */
/* ------------------------------------------------------------------ */

function plegable(clave, titulo, ico, contenidoHtml, abierto = false) {
  return `<section class="pleg ${abierto ? 'abierto' : ''}" data-pleg="${clave}">
    <button type="button" class="pleg-btn" aria-expanded="${abierto}">
      <span class="pleg-flecha">${icono('siguiente', 'sm')}</span>${ico ? icono(ico, 'sm') : ''}<span>${titulo}</span><small class="pleg-res"></small>
    </button>
    <div class="colapsable ${abierto ? 'abierto' : ''}"><div><div class="pleg-cuerpo">${contenidoHtml}</div></div></div>
  </section>`;
}

function activarPlegables(raiz) {
  raiz.querySelectorAll('.pleg-btn').forEach((b) => b.addEventListener('click', () => {
    const sec = b.closest('.pleg');
    const abrir = !sec.classList.contains('abierto');
    sec.classList.toggle('abierto', abrir);
    sec.querySelector('.colapsable').classList.toggle('abierto', abrir);
    b.setAttribute('aria-expanded', String(abrir));
    if (abrir) setTimeout(() => sec.querySelector('.pleg-cuerpo input:not([type=checkbox]), .pleg-cuerpo textarea')?.focus({ preventScroll: true }), 260);
  }));
}

/** Menú "⋯" con acciones secundarias. acciones = [{ texto, icono, peligro?, accion }] */
function menuMas(acciones) {
  const cont = el(`<div class="menu-mas"><button type="button" class="btn icon" aria-label="Más acciones" aria-haspopup="menu">${icono('menu', 'sm')}</button>
    <div class="menu-mas-lista" role="menu" hidden>${acciones.map((a, i) => `<button type="button" role="menuitem" data-i="${i}" class="${a.peligro ? 'peligro' : ''}">${icono(a.icono, 'sm')}${esc(a.texto)}</button>`).join('')}</div></div>`);
  const lista = cont.querySelector('.menu-mas-lista');
  cont.firstElementChild.onclick = (e) => { e.stopPropagation(); lista.hidden = !lista.hidden; };
  lista.onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; lista.hidden = true; acciones[Number(b.dataset.i)].accion(); };
  document.addEventListener('click', () => { lista.hidden = true; });
  return cont;
}

const CICLO_PERIF = ['presente', 'faltante', 'danado'];

/* ------------------------------------------------------------------ */
/*  Ficha de un equipo (minimalista)                                   */
/* ------------------------------------------------------------------ */

export function abrirEquipo(equipo, { lugarId = null } = {}) {
  const admin = esAdmin();
  const nuevo = !equipo;
  const d = nuevo
    ? { id: null, laboratorio_id: S.labId, numero: siguienteNumero(S.labId), tipo: 'pc', monitor: 'presente', teclado: 'presente', mouse: 'presente', cpu: 'presente',
        estado_manual: null, motivo_manual: '', observaciones: '', so: [], software: [], lugar_id: lugarId }
    : structuredClone(equipo);
  d.software = new Set(d.software);
  const dis = admin ? '' : 'disabled';

  const vacios = lugaresLab(d.laboratorio_id).filter((l) => !equiposLab(d.laboratorio_id).some((e) => e.lugar_id === l.id));
  if (nuevo && d.lugar_id == null && vacios.length) d.lugar_id = vacios[0].id;

  const datosHtml = `<div class="grid-2">
      <div class="campo"><label for="eq-num">Número de inventario</label>
        <input class="input" id="eq-num" value="${esc(d.numero)}" maxlength="20" ${dis} style="font-family:var(--mono);font-weight:700;text-transform:uppercase"></div>
      <div class="campo"><span class="etiqueta">Tipo de equipo</span>
        <div class="segmentado" id="eq-tipo">
          <button type="button" data-v="pc" ${dis}>${icono('monitor', 'sm')} PC</button>
          <button type="button" data-v="mac" ${dis}>${icono('macos', 'sm')} Mac</button>
        </div></div>
      ${nuevo ? `<div class="campo" style="grid-column:1/-1"><label for="eq-lugar">Ubicación</label>
        <select class="select" id="eq-lugar">
          ${vacios.map((l) => `<option value="${l.id}" ${l.id === d.lugar_id ? 'selected' : ''}>Fila ${l.fila} · Lugar ${l.columna}</option>`).join('')}
          <option value="" ${d.lugar_id == null ? 'selected' : ''}>Sin ubicar (la acomodo después)</option>
        </select></div>` : `<div class="campo" style="grid-column:1/-1"><label for="eq-lab">Laboratorio</label>
        <select class="select" id="eq-lab" ${dis}>${S.labs.map((l) => `<option value="${l.id}" ${l.id === d.laboratorio_id ? 'selected' : ''}>${esc(l.nombre)}</option>`).join('')}</select>
        <span class="ayuda" id="eq-lab-ayuda">${admin ? 'Para moverla dentro del laboratorio, arrástrala en el mapa.' : ''}</span></div>`}
    </div>`;

  // Estado: un clic. "Automático" lo calcula con los periféricos; el motivo es opcional.
  const estadoHtml = `
    <input type="checkbox" id="eq-manual" hidden ${d.estado_manual ? 'checked' : ''}>
    <div class="estado-chips" id="eq-chips">
      <button type="button" class="estado-chip" data-v="" ${dis}>${icono('auto', 'sm')} Automático</button>
      ${Object.entries(ESTADOS).map(([k, v]) => `<button type="button" class="estado-chip st-${k}" data-v="${k}" title="${esc(v.desc)}" ${dis}><i class="punto st-${k}"></i>${v.nombre}</button>`).join('')}
    </div>
    <div class="colapsable ${d.estado_manual ? 'abierto' : ''}" id="eq-col"><div>
      <input class="input" id="eq-motivo" maxlength="200" placeholder="Motivo (opcional), ej. No enciende" value="${esc(d.motivo_manual || '')}" ${dis}>
    </div></div>`;

  const pendHtml = `<div class="pend-lista" id="eq-pend"><div class="ayuda">Cargando…</div></div>
    ${admin ? `<div class="pend-nuevo">
      <input class="input" id="eq-pend-txt" maxlength="200" placeholder="Ej. Cambiar el mouse">
      <input class="input" id="eq-pend-resp" maxlength="80" placeholder="Responsable" style="width:150px;flex:none">
      <button type="button" class="btn sm" id="eq-pend-add">${icono('mas', 'sm')} Agregar</button>
    </div>` : ''}`;

  const notasHtml = `<textarea class="textarea" id="eq-obs" maxlength="1000" placeholder="Detalles que quieras recordar de este equipo" ${dis}>${esc(d.observaciones || '')}</textarea>`;

  const cuerpo = el(`<div class="ficha">
    <div class="ficha-fila"><span class="ficha-lbl">Periféricos</span>
      <div class="perif-botones" id="eq-perif">
        ${PERIFERICOS.map((p) => `<button type="button" class="perif-btn" data-p="${p.clave}" ${dis}>
          <span class="perif-ico">${icono(p.icono)}</span><small>${p.nombre.replace(' / Gabinete', '')}</small></button>`).join('')}
        ${admin ? '<span class="ayuda perif-ayuda">Clic para cambiar</span>' : ''}
      </div></div>
    <div class="ficha-fila"><span class="ficha-lbl">Estado</span><div>${estadoHtml}</div></div>
    <div class="ficha-fila"><span class="ficha-lbl">Sistema</span><div id="eq-so"></div></div>
    <div class="ficha-fila"><span class="ficha-lbl">Software</span><div class="ficha-sw"><div id="eq-sw"></div><div id="eq-sw-acc"></div></div></div>
    <div class="plegables">
      ${plegable('datos', 'Datos del equipo', 'editar', datosHtml, nuevo)}
      ${plegable('specs', 'Especificaciones', 'cpu', '<div id="eq-specs"></div>')}
      ${nuevo ? '' : plegable('pend', 'Pendientes', 'tareas', pendHtml)}
      ${plegable('notas', 'Notas', 'catalogo', notasHtml)}
    </div>
    ${!nuevo && equipo.actualizado_en ? `<div class="meta-eq">Última actualización: ${esc(fechaCorta(equipo.actualizado_en))}${equipo.actualizado_por ? ` · ${esc(equipo.actualizado_por)}` : ''}</div>` : ''}
  </div>`);

  const pie = el(`<div style="display:contents"><span class="espacio"></span>
      <button class="btn" type="button" data-a="cancelar">${admin ? 'Cancelar' : 'Cerrar'}</button>
      ${admin ? `<button class="btn primario" type="button" data-a="guardar">${icono('check', 'sm')} ${nuevo ? 'Agregar PC' : 'Guardar'}</button>` : ''}
    </div>`);

  const ubic = nuevo ? labPorId(d.laboratorio_id).nombre.replace(/^Laboratorio de /i, '') : ubicacionTxt(equipo);
  const m = abrirModal({
    titulo: `${nuevo ? 'Nueva PC' : `<span style="font-family:var(--mono)">${esc(equipo.numero)}</span>`}<span class="eq-estado-pill" id="eq-pill"></span>`,
    subtitulo: esc(ubic), cuerpo, pie, ancho: 620, clase: 'equipo ficha-modal',
  });
  const $ = (s) => cuerpo.querySelector(s);
  activarPlegables(cuerpo);

  if (admin && !nuevo) {
    pie.prepend(menuMas([
      { texto: 'Usar como modelo para copiar', icono: 'copiar', accion: () => { m.cerrar(); usarComoModelo(equipo.id); } },
      { texto: 'Eliminar equipo', icono: 'basura', peligro: true, accion: () => borrar() },
    ]));
  }

  /* Resúmenes de las secciones plegadas */
  const resumir = () => {
    const r = (k, t) => { const n = cuerpo.querySelector(`[data-pleg="${k}"] .pleg-res`); if (n) n.textContent = t; };
    r('datos', `${($('#eq-num')?.value || '').toUpperCase()} · ${d.tipo === 'mac' ? 'Mac' : 'PC'}`);
    r('estado', $('#eq-manual').checked && d.estado_manual ? `${ESTADOS[d.estado_manual].nombre}${$('#eq-motivo').value ? ` · ${$('#eq-motivo').value}` : ''}` : 'Automático');
    r('notas', ($('#eq-obs').value || '').trim() ? 'Con notas' : '');
    if (specsEd) r('specs', specsEd.resumen() || 'Sin capturar');
  };
  let specsEd = null;

  /* "Pendiente de inventario" se quita sola al capturar datos */
  let pendiente = admin && d.estado_manual === 'azul' && (d.motivo_manual || '').trim().toLowerCase() === 'pendiente de inventario';
  function alCapturar() {
    if (!pendiente) return;
    pendiente = false;
    $('#eq-manual').checked = false;
    $('#eq-col').classList.remove('abierto');
    d.estado_manual = null;
    $('#eq-motivo').value = '';
    toast('Se quitó "Pendiente de inventario": el estado ahora es automático.', 'info', { duracion: 2600 });
    pintarEstado();
  }

  /* Tipo */
  const pintarTipo = () => $('#eq-tipo').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.v === d.tipo));
  $('#eq-tipo').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; d.tipo = b.dataset.v; pintarTipo(); resumir(); });
  pintarTipo();
  $('#eq-num').addEventListener('input', resumir);

  /* Periféricos: un clic cambia presente → faltante → dañado */
  function pintarEstado() {
    PERIFERICOS.forEach((p) => {
      const b = cuerpo.querySelector(`.perif-btn[data-p="${p.clave}"]`);
      b.className = `perif-btn ${d[p.clave]}`;
      b.title = `${p.nombre}: ${PER_ESTADOS[d[p.clave]]}`;
      b.setAttribute('aria-label', b.title);
    });
    const auto = estadoAuto(d);
    const manual = $('#eq-manual').checked && d.estado_manual;
    const final = manual ? d.estado_manual : auto;
    const pill = m.modal.querySelector('#eq-pill');
    pill.className = `eq-estado-pill st-${final}`;
    pill.innerHTML = `<i class="punto st-${final}"></i>${ESTADOS[final].nombre}${manual ? ` ${icono('candado', 'sm')}` : ''}`;
    cuerpo.querySelectorAll('.estado-chip').forEach((b) => b.classList.toggle('sel', b.dataset.v === (manual ? d.estado_manual : '')));
    m.modal.style.setProperty('--st', `var(--${final})`);
    resumir();
  }
  $('#eq-perif').addEventListener('click', (e) => {
    const b = e.target.closest('.perif-btn'); if (!b || b.disabled) return;
    const k = b.dataset.p;
    d[k] = CICLO_PERIF[(CICLO_PERIF.indexOf(d[k]) + 1) % 3];
    alCapturar();
    pintarEstado();
    animarPeriferico(b, d[k]);
  });
  /** Fija el estado ('' = automático). Se usa desde los chips y desde el menú del encabezado. */
  function fijarEstado(v) {
    pendiente = false;
    const antes = $('#eq-manual').checked && d.estado_manual;
    if (antes !== 'azul' || v !== 'azul') {
      if ((d.motivo_manual || '').toLowerCase() === 'pendiente de inventario') $('#eq-motivo').value = '';
    }
    $('#eq-manual').checked = !!v;
    d.estado_manual = v || null;
    $('#eq-col').classList.toggle('abierto', !!v);
    if (!v) $('#eq-motivo').value = '';
    pintarEstado();
  }
  $('#eq-chips').addEventListener('click', (e) => { const b = e.target.closest('.estado-chip'); if (b && !b.disabled) fijarEstado(b.dataset.v); });
  if (admin) {
    // La pastilla del encabezado abre un menú rápido de estados
    const pill = m.modal.querySelector('#eq-pill');
    pill.classList.add('clic');
    pill.setAttribute('role', 'button');
    pill.tabIndex = 0;
    pill.title = 'Cambiar estado';
    const abrirMenuEstado = (ev) => {
      ev.stopPropagation();
      document.querySelector('.menu-estado')?.remove();
      const menu = el(`<div class="menu-estado">
        <button type="button" data-v="">${icono('auto', 'sm')} Automático <small>según periféricos</small></button>
        ${Object.entries(ESTADOS).map(([k, v]) => `<button type="button" data-v="${k}"><i class="punto st-${k}"></i>${v.nombre}</button>`).join('')}
      </div>`);
      const r = pill.getBoundingClientRect();
      menu.style.left = `${r.left}px`; menu.style.top = `${r.bottom + 6}px`;
      document.body.append(menu);
      const tecla = (e3) => { if (e3.key === 'Escape') { e3.stopPropagation(); e3.preventDefault(); cerrarMenu(); } };
      const cerrarMenu = () => { menu.remove(); removeEventListener('click', cerrarMenu); removeEventListener('keydown', tecla, true); };
      addEventListener('keydown', tecla, true);
      menu.addEventListener('click', (e2) => { const b = e2.target.closest('button'); if (!b) return; e2.stopPropagation(); fijarEstado(b.dataset.v); cerrarMenu(); });
      setTimeout(() => addEventListener('click', cerrarMenu), 0);
    };
    pill.addEventListener('click', abrirMenuEstado);
    pill.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirMenuEstado(e); } });
  }
  $('#eq-motivo').addEventListener('input', resumir);
  $('#eq-obs').addEventListener('input', resumir);
  pintarEstado();

  /* Especificaciones técnicas */
  specsEd = editorSpecs({ equipo: d, admin, alCambiar: () => { resumir(); } });
  $('#eq-specs').append(specsEd.el);
  resumir();

  /* Sistema operativo en cascada y software con búsqueda */
  const selSO = selectorSO({ ids: d.so, admin, alCambiar: alCapturar });
  $('#eq-so').append(selSO.el);
  const selSW = selectorSoftware({ seleccion: d.software, admin, alCambiar: alCapturar });
  $('#eq-sw').append(selSW.el);
  if (admin) {
    $('#eq-sw-acc').append(botonPerfiles((p) => {
      const n = p.software.filter((id) => agregarSoftware(d.software, id)).length;
      selSW.refrescar();
      alCapturar();
      toast(`Perfil "${p.nombre}": ${n} programa(s) agregados.`, 'info', { duracion: 2200 });
    }));
  }

  /* Pendientes (se guardan al momento) */
  if (!nuevo) {
    const pintarPend = (lista) => {
      const abiertos = lista.filter((x) => !x.hecho).length;
      const eq = equipoPorId(equipo.id);
      if (eq && eq.pendientes !== abiertos) { eq.pendientes = abiertos; renderMapa(); }
      const res = cuerpo.querySelector('[data-pleg="pend"] .pleg-res');
      if (res) { res.textContent = abiertos ? `${abiertos} abierto${abiertos === 1 ? '' : 's'}` : ''; res.classList.toggle('alerta', abiertos > 0); }
      $('#eq-pend').innerHTML = lista.length ? lista.map((x) => `
        <div class="pend-item ${x.hecho ? 'hecho' : ''}" data-id="${x.id}">
          <label class="pend-check"><input type="checkbox" ${x.hecho ? 'checked' : ''} ${admin ? '' : 'disabled'}><span class="caja">${icono('check')}</span></label>
          <span class="pend-txt">${esc(x.texto)}${x.responsable ? ` <small>· ${esc(x.responsable)}</small>` : ''}</span>
          <small class="pend-fecha">${esc(fechaCorta(x.hecho ? x.hecho_en : x.creado_en))}</small>
          ${admin ? `<button type="button" class="btn sm icon fantasma" data-borrar-pend title="Eliminar">${icono('x', 'sm')}</button>` : ''}
        </div>`).join('') : '<div class="ayuda">Sin pendientes.</div>';
    };
    const res0 = cuerpo.querySelector('[data-pleg="pend"] .pleg-res');
    if (res0 && equipo.pendientes) { res0.textContent = `${equipo.pendientes} abierto${equipo.pendientes === 1 ? '' : 's'}`; res0.classList.add('alerta'); }
    api(`ctrl/php/pendientesApi.php?accion=listar&equipo=${equipo.id}`).then((r) => pintarPend(r.pendientes)).catch((err) => toast(err.message, 'error'));
    $('#eq-pend').addEventListener('change', async (e) => {
      const item = e.target.closest('.pend-item'); if (!item) return;
      item.classList.toggle('hecho', e.target.checked);
      try {
        const r = await api('ctrl/php/pendientesApi.php?accion=marcar', { body: { id: Number(item.dataset.id), hecho: e.target.checked } });
        pintarPend(r.pendientes);
      } catch (err) { toast(err.message, 'error'); e.target.checked = !e.target.checked; }
    });
    $('#eq-pend').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-borrar-pend]'); if (!b) return;
      const item = b.closest('.pend-item');
      try {
        await item.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(20px)' }], { duration: 180, fill: 'forwards' }).finished;
        const r = await api('ctrl/php/pendientesApi.php?accion=eliminar', { body: { id: Number(item.dataset.id) } });
        pintarPend(r.pendientes);
      } catch (err) { toast(err.message, 'error'); }
    });
    const agregarPend = () => conCarga($('#eq-pend-add'), async () => {
      const texto = $('#eq-pend-txt').value.trim();
      if (!texto) { $('#eq-pend-txt').focus(); return; }
      try {
        const r = await api('ctrl/php/pendientesApi.php?accion=crear', { body: { equipo_id: equipo.id, texto, responsable: $('#eq-pend-resp').value.trim() } });
        $('#eq-pend-txt').value = '';
        pintarPend(r.pendientes);
      } catch (err) { toast(err.message, 'error'); }
    });
    $('#eq-pend-add')?.addEventListener('click', agregarPend);
    $('#eq-pend-txt')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregarPend(); } });
  }

  /* Cambio de laboratorio */
  $('#eq-lab')?.addEventListener('change', (e) => {
    $('#eq-lab-ayuda').textContent = Number(e.target.value) !== equipo.laboratorio_id
      ? 'Al guardar, pasará a "Sin ubicar" en el otro laboratorio para que la acomodes.' : 'Para moverla dentro del laboratorio, arrástrala en el mapa.';
  });

  /* Acciones */
  pie.querySelector('[data-a="cancelar"]').onclick = () => m.cerrar();

  async function borrar() {
    const ok = await confirmar({ titulo: `Eliminar ${equipo.numero}`, mensaje: `Se borrará <b>${esc(equipo.numero)}</b> del inventario con su sistema operativo, software y pendientes. Esta acción no se puede deshacer.`, aceptar: 'Eliminar', peligro: true });
    if (!ok) return;
    try {
      const r = await api('ctrl/php/inventarioApi.php?accion=eliminarEquipo', { body: { id: equipo.id } });
      m.cerrar();
      S.equipos = S.equipos.filter((x) => x.id !== equipo.id);
      S.seleccion.delete(equipo.id);
      refrescarTrasGuardar([]);
      toast(r.mensaje);
    } catch (err) { toast(err.message, 'error'); }
  }

  const abrirPleg = (k) => { const s = cuerpo.querySelector(`[data-pleg="${k}"]`); if (s && !s.classList.contains('abierto')) s.querySelector('.pleg-btn').click(); };
  const guardar = pie.querySelector('[data-a="guardar"]');
  guardar?.addEventListener('click', () => conCarga(guardar, async () => {
    const manual = $('#eq-manual').checked;
    const motivo = $('#eq-motivo').value.trim();
    const numero = $('#eq-num').value.trim().toUpperCase();
    if (!numero) { abrirPleg('datos'); setTimeout(() => $('#eq-num').focus(), 260); agitar(m.modal); return; }
    if (selSO.incompletos()) { toast('Elige la distribución o el nombre del sistema (o quita esa fila).', 'aviso'); agitar(m.modal); return; }
    try {
      const so = await selSO.obtenerIds();
      const body = {
        id: d.id,
        laboratorio_id: $('#eq-lab') ? Number($('#eq-lab').value) : d.laboratorio_id,
        lugar_id: nuevo ? (Number($('#eq-lugar').value) || null) : undefined,
        numero, tipo: d.tipo,
        monitor: d.monitor, teclado: d.teclado, mouse: d.mouse, cpu: d.cpu,
        estado_manual: manual ? d.estado_manual : null,
        motivo_manual: manual && motivo ? motivo : null,
        observaciones: $('#eq-obs').value,
        so, software: [...d.software],
        specs: specsEd.obtener(),
      };
      const r = await api('ctrl/php/inventarioApi.php?accion=guardarEquipo', { body });
      if (r.componentes) S.componentes = r.componentes;
      m.cerrar();
      const antes = new Map(equipo ? [[equipo.id, equipoPorId(equipo.id)?.estado]] : []);
      actualizarEquipos([r.equipo]);
      refrescarTrasGuardar([r.equipo.id], antes);
      toast(r.mensaje);
    } catch (err) {
      toast(err.message, 'error');
      agitar(m.modal);
    }
  }));

  if (!admin) m.modal.querySelectorAll('input, textarea').forEach((x) => { x.readOnly = true; });
}

/* ------------------------------------------------------------------ */
/*  Edición en lote (con los mismos selectores)                        */
/* ------------------------------------------------------------------ */

const CICLO_LOTE = ['', 'presente', 'faltante', 'danado'];

export function abrirLote(ids) {
  const eqs = ids.map(equipoPorId).filter(Boolean);
  if (!eqs.length) return;
  const n = eqs.length;
  const perif = { monitor: '', teclado: '', mouse: '', cpu: '' };
  let estadoModo = '';
  let estadoManual = 'azul';
  const swAgregar = new Set();
  const swQuitar = new Set();
  const soQuitar = new Set();

  const nums = eqs.map((e) => e.numero).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const cuenta = (campo, id) => eqs.filter((e) => e[campo].includes(id)).length;

  const cuerpo = el(`<div class="ficha">
    <div class="lote-nota">${icono('info', 'sm')} Solo se cambia lo que toques aquí; lo demás queda igual en cada equipo.</div>
    <div class="ayuda" style="margin-top:-6px">${esc(nums.slice(0, 18).join(', '))}${n > 18 ? ` y ${n - 18} más` : ''}</div>

    <div class="ficha-fila"><span class="ficha-lbl">Periféricos</span>
      <div class="perif-botones" id="lt-perif">
        ${PERIFERICOS.map((p) => `<button type="button" class="perif-btn sin" data-p="${p.clave}" title="${p.nombre}: sin cambio">
          <span class="perif-ico">${icono(p.icono)}</span><small>${p.nombre.replace(' / Gabinete', '')}</small></button>`).join('')}
        <span class="ayuda perif-ayuda">Sin cambio → presente → faltante → dañado</span>
      </div></div>

    <div class="ficha-fila"><span class="ficha-lbl">Estado</span><div>
      <div class="segmentado" id="lt-estado">
        <button type="button" data-v="" class="sel">Sin cambio</button>
        <button type="button" data-v="auto">Automático</button>
        <button type="button" data-v="manual">${icono('candado', 'sm')} Fijar a mano</button>
      </div>
      <div class="colapsable" id="lt-col"><div style="padding-top:10px">
        <div class="estado-opciones">${Object.entries(ESTADOS).map(([k, v]) => `<button type="button" class="estado-op st-${k}" data-v="${k}">
          <span style="display:flex;align-items:center;gap:7px"><i class="punto st-${k}"></i>${v.nombre}</span><small>${v.desc}</small></button>`).join('')}</div>
        <input class="input" id="lt-motivo" maxlength="200" placeholder="Motivo (opcional), ej. Mantenimiento preventivo">
      </div></div>
    </div></div>

    <div class="ficha-fila"><span class="ficha-lbl">Agregar sistema</span><div id="lt-so-mas"></div></div>
    <div class="ficha-fila"><span class="ficha-lbl">Quitar sistema</span><div id="lt-so-menos"></div></div>
    <div class="ficha-fila"><span class="ficha-lbl">Agregar programas</span><div class="ficha-sw"><div id="lt-sw-mas"></div><div id="lt-sw-acc"></div></div></div>
    <div class="ficha-fila"><span class="ficha-lbl">Quitar programas</span><div id="lt-sw-menos"></div></div>
    <div class="plegables">${plegable('specs', 'Especificaciones', 'cpu', '<div id="lt-specs"></div>')}</div>
  </div>`);

  const pie = el(`<div style="display:contents"><span class="ayuda" id="lt-resumen"></span><span class="espacio"></span>
      <button class="btn" type="button" data-a="cancelar">Cancelar</button>
      <button class="btn primario" type="button" data-a="guardar">${icono('check', 'sm')} Aplicar a ${n} equipo${n === 1 ? '' : 's'}</button>
    </div>`);
  const m = abrirModal({ titulo: 'Edición en lote', subtitulo: `${n} equipo${n === 1 ? '' : 's'} seleccionado${n === 1 ? '' : 's'}`, cuerpo, pie, ancho: 640, clase: 'ficha-modal' });
  const $ = (q) => cuerpo.querySelector(q);

  activarPlegables(cuerpo);
  const specsLote = editorSpecs({ admin: true, parcial: true, alCambiar: () => {
    const t = specsLote.cuantos();
    const res = cuerpo.querySelector('[data-pleg="specs"] .pleg-res');
    if (res) res.textContent = t ? `${t} cambio${t === 1 ? '' : 's'}` : 'Sin cambio';
    resumen();
  } });
  $('#lt-specs').append(specsLote.el);
  cuerpo.querySelector('[data-pleg="specs"] .pleg-res').textContent = 'Sin cambio';

  let soNuevos = [];
  const selSO = selectorSO({ ids: [], admin: true, alCambiar: () => { soNuevos = ['?']; resumen(); } });
  $('#lt-so-mas').append(selSO.el);

  const presentesSO = S.so.filter((s) => eqs.some((e) => e.so.includes(s.id)));
  $('#lt-so-menos').append(multiCombo({
    placeholder: presentesSO.length ? 'Elegir sistema a quitar…' : 'Ninguna PC seleccionada tiene sistema',
    seleccion: soQuitar, vacioTexto: 'Nada que quitar',
    opciones: () => presentesSO.map((s) => ({ valor: s.id, texto: `${s.nombre} (${cuenta('so', s.id)}/${n})`, grupo: FAMILIAS[s.familia] })),
    alCambiar: () => resumen(),
  }).el);

  const selSW = selectorSoftware({ seleccion: swAgregar, admin: true, alCambiar: () => resumen(), placeholder: 'Buscar programa para agregar…', vacioTexto: 'Nada que agregar' });
  $('#lt-sw-mas').append(selSW.el);
  $('#lt-sw-acc').append(botonPerfiles((p) => { p.software.forEach((id) => agregarSoftware(swAgregar, id)); selSW.refrescar(); resumen(); }, 'Agregar perfil'));

  const presentesSW = S.software.filter((s) => eqs.some((e) => e.software.includes(s.id)));
  $('#lt-sw-menos').append(multiCombo({
    placeholder: presentesSW.length ? 'Elegir programa a quitar…' : 'Ninguna PC seleccionada tiene programas',
    seleccion: swQuitar, vacioTexto: 'Nada que quitar',
    opciones: () => presentesSW.map((s) => ({ valor: s.id, texto: `${s.nombre} (${cuenta('software', s.id)}/${n})`, grupo: s.categoria })),
    alCambiar: () => resumen(),
  }).el);

  function resumen() {
    const k = Object.values(perif).filter(Boolean).length + (estadoModo ? 1 : 0) + (soNuevos.length ? 1 : 0) + soQuitar.size + swAgregar.size + swQuitar.size + specsLote.cuantos();
    pie.querySelector('#lt-resumen').textContent = k ? `${k} cambio${k === 1 ? '' : 's'} por aplicar` : 'Sin cambios todavía';
  }

  $('#lt-perif').addEventListener('click', (e) => {
    const b = e.target.closest('.perif-btn'); if (!b) return;
    const k = b.dataset.p;
    perif[k] = CICLO_LOTE[(CICLO_LOTE.indexOf(perif[k]) + 1) % CICLO_LOTE.length];
    b.className = `perif-btn ${perif[k] || 'sin'}`;
    b.title = `${PERIFERICOS.find((p) => p.clave === k).nombre}: ${perif[k] ? PER_ESTADOS[perif[k]] : 'sin cambio'}`;
    if (perif[k]) animarPeriferico(b, perif[k]);
    resumen();
  });
  const pintarOps = () => cuerpo.querySelectorAll('.estado-op').forEach((b) => b.classList.toggle('sel', b.dataset.v === estadoManual));
  $('#lt-estado').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $('#lt-estado').querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
    estadoModo = b.dataset.v;
    $('#lt-col').classList.toggle('abierto', estadoModo === 'manual');
    resumen();
  });
  cuerpo.querySelectorAll('.estado-op').forEach((b) => b.addEventListener('click', () => { estadoManual = b.dataset.v; pintarOps(); }));
  pintarOps();
  resumen();

  pie.querySelector('[data-a="cancelar"]').onclick = () => m.cerrar();
  const btn = pie.querySelector('[data-a="guardar"]');
  btn.onclick = () => conCarga(btn, async () => {
    let estado = null;
    if (estadoModo === 'auto') estado = 'auto';
    if (estadoModo === 'manual') {
      estado = { estado: estadoManual, motivo: $('#lt-motivo').value.trim() };
    }
    if (selSO.incompletos()) { toast('Elige la distribución del sistema a agregar.', 'aviso'); agitar(m.modal); return; }
    try {
      const soAgregar = await selSO.obtenerIds();
      const perifericos = Object.fromEntries(Object.entries(perif).filter(([, v]) => v));
      const body = {
        ids: eqs.map((e) => e.id),
        cambios: { perifericos, estado, so_agregar: soAgregar, so_quitar: [...soQuitar], software_agregar: [...swAgregar], software_quitar: [...swQuitar], specs: specsLote.obtener() },
      };
      const vacio = !Object.keys(perifericos).length && !estado && !soAgregar.length && !soQuitar.size && !swAgregar.size && !swQuitar.size && !specsLote.cuantos();
      if (vacio) { toast('No hay cambios que aplicar.', 'aviso'); agitar(m.modal); return; }
      const r = await api('ctrl/php/inventarioApi.php?accion=lote', { body });
      if (r.componentes) S.componentes = r.componentes;
      m.cerrar();
      const antes = new Map(eqs.map((e) => [e.id, equipoPorId(e.id)?.estado]));
      actualizarEquipos(r.equipos);
      refrescarTrasGuardar(r.equipos.map((e) => e.id), antes);
      toast(r.mensaje);
    } catch (err) { toast(err.message, 'error'); }
  });
}

/* ------------------------------------------------------------------ */
/*  Copiar la configuración de una PC modelo a otras                   */
/* ------------------------------------------------------------------ */

export function abrirCopiar(ids, modeloId = null) {
  const destinos = ids.filter((id) => id !== modeloId);
  if (!destinos.length) { toast('Selecciona las PCs que recibirán la configuración.', 'aviso'); return; }
  const candidatos = equiposOrdenados().filter((e) => !destinos.includes(e.id));
  let origenId = modeloId || candidatos[0]?.id;
  const partes = new Set(['perifericos', 'so', 'software']);

  const cuerpo = el(`<div style="display:contents">
    <div class="campo"><label for="cp-origen">PC modelo (de donde se copia)</label>
      <select class="select" id="cp-origen">${candidatos.map((e) => `<option value="${e.id}" ${e.id === origenId ? 'selected' : ''}>${esc(e.numero)} · ${esc(ubicacionTxt(e))}</option>`).join('')}</select></div>
    <div class="cp-resumen" id="cp-resumen"></div>
    <div class="campo"><span class="etiqueta">¿Qué copiar?</span>
      <div class="chips" id="cp-partes">
        ${[['perifericos', 'Periféricos'], ['so', 'Sistema operativo'], ['software', 'Software'], ['specs', 'Especificaciones'], ['estado', 'Estado fijado a mano']]
          .map(([k, t]) => `<button type="button" class="chip ${partes.has(k) ? 'on' : ''}" data-p="${k}">${t}</button>`).join('')}
      </div>
      <span class="ayuda">El sistema operativo, el software y las especificaciones se <b>reemplazan</b> por los del modelo (el número de serie no se copia). Si no copias el estado, las PCs que seguían "Pendiente de inventario" pasan a automático.</span>
    </div>
    <div class="ayuda">Destino: ${destinos.map((id) => esc(equipoPorId(id)?.numero)).join(', ')}</div>
  </div>`);
  const pie = el(`<div style="display:contents"><span class="espacio"></span><button class="btn" data-c>Cancelar</button>
      <button class="btn primario" data-ok>${icono('copiar', 'sm')} Copiar a ${destinos.length} PC${destinos.length === 1 ? '' : 's'}</button></div>`);
  const m = abrirModal({ titulo: 'Copiar configuración', subtitulo: 'Aplica lo que tiene una PC a las seleccionadas', cuerpo, pie, ancho: 560 });
  const $ = (q) => cuerpo.querySelector(q);

  const resumenModelo = () => {
    const e = equipoPorId(origenId);
    if (!e) { $('#cp-resumen').innerHTML = '<span class="ayuda">No hay PCs disponibles como modelo.</span>'; return; }
    const so = e.so.map(soPorId).filter(Boolean).map((x) => x.nombre).join(' / ') || 'Sin sistema';
    const per = PERIFERICOS.map((p) => `${p.nombre}: ${PER_ESTADOS[e[p.clave]].toLowerCase()}`).join(' · ');
    $('#cp-resumen').innerHTML = `<b>${esc(e.numero)}</b> <i class="punto st-${e.estado}"></i> ${ESTADOS[e.estado].nombre}<br>
      <span>${esc(per)}</span><br><span>${esc(so)} · ${e.software.length} programa(s)</span>${resumenSpecs(e) ? `<br><span>${esc(resumenSpecs(e))}</span>` : ''}`;
  };
  resumenModelo();
  $('#cp-origen')?.addEventListener('change', (e) => { origenId = Number(e.target.value); resumenModelo(); });
  $('#cp-partes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    partes.has(b.dataset.p) ? partes.delete(b.dataset.p) : partes.add(b.dataset.p);
    b.classList.toggle('on');
  });
  pie.querySelector('[data-c]').onclick = () => m.cerrar();
  const ok = pie.querySelector('[data-ok]');
  ok.onclick = () => conCarga(ok, async () => {
    if (!partes.size) { toast('Elige qué quieres copiar.', 'aviso'); agitar(m.modal); return; }
    try {
      const r = await api('ctrl/php/inventarioApi.php?accion=copiar', { body: { origen_id: origenId, ids: destinos, partes: [...partes] } });
      m.cerrar();
      const antes = new Map(destinos.map((id) => [id, equipoPorId(id)?.estado]));
      actualizarEquipos(r.equipos);
      refrescarTrasGuardar(r.equipos.map((e) => e.id), antes);
      toast(r.mensaje);
      renderLoteBarra();
    } catch (err) { toast(err.message, 'error'); }
  });
}
