// view/js/recorrido.js — Modo recorrido: capturar el inventario PC por PC (pensado para celular o tablet).

import { api } from './api.js';
import { icono } from './iconos.js';
import { esc, el, toast, conCarga } from './ui.js';
import {
  S, ESTADOS, PERIFERICOS, PER_ESTADOS, estadoAuto, soPorId, labPorId, equipoPorId, ubicacionTxt,
  actualizarEquipos, equiposOrdenados, esPendienteInv, cuerpoEquipo, norm,
} from './estado.js';
import { renderTodo, destellar } from './mapa.js';
import { selectorSO, selectorSoftware, botonPerfiles, agregarSoftware } from './selectores.js';
import { animarPeriferico } from './animaciones.js';

export function abrirRecorrido() {
  const lab = labPorId(S.labId);
  const todos = equiposOrdenados();
  if (!todos.length) { toast('Este laboratorio no tiene equipos.', 'aviso'); return; }
  let soloPendientes = todos.some(esPendienteInv);
  let lista = soloPendientes ? todos.filter(esPendienteInv) : todos;
  let i = 0;
  let d = null;
  let cambiado = false;
  const guardados = new Map(); // id → estado anterior (para animar al salir)

  const capa = el(`<div class="recorrido" role="dialog" aria-modal="true" aria-label="Modo recorrido">
    <header class="rc-head">
      <button class="btn icon fantasma" data-a="cerrar" aria-label="Salir del recorrido">${icono('x')}</button>
      <div class="rc-titulo"><b>Recorrido</b><small>${esc(lab.nombre.replace(/^Laboratorio de /i, ''))}</small></div>
      <label class="switch rc-solo"><input type="checkbox" id="rc-solo" ${soloPendientes ? 'checked' : ''}><span class="pista"></span><span>Solo pendientes</span></label>
    </header>
    <div class="rc-progreso"><i></i></div>
    <main class="rc-cuerpo" id="rc-cuerpo"></main>
    <footer class="rc-pie">
      <button class="btn" data-a="anterior">${icono('anterior')}<span>Anterior</span></button>
      <button class="btn fantasma" data-a="saltar">Saltar</button>
      <button class="btn primario rc-guardar" data-a="guardar"><span>Guardar y seguir</span>${icono('siguiente')}</button>
    </footer>
  </div>`);
  document.body.append(capa);
  document.body.classList.add('sin-scroll');
  const $ = (q) => capa.querySelector(q);

  function cargar(dir = 0) {
    if (!lista.length) {
      $('#rc-cuerpo').innerHTML = `<div class="rc-fin">${icono('check', 'lg')}<h2>¡Sin pendientes!</h2>
        <p>Todas las PCs de este laboratorio ya están capturadas.</p><button class="btn primario" data-a="cerrar">Volver al mapa</button></div>`;
      $('.rc-progreso i').style.width = '100%';
      $('.rc-pie').hidden = true;
      return;
    }
    $('.rc-pie').hidden = false;
    i = Math.max(0, Math.min(i, lista.length - 1));
    const e = equipoPorId(lista[i]);
    d = { ...e, so: [...e.so], software: new Set(e.software) };
    // Al capturar, deja de estar "Pendiente de inventario"
    if (esPendienteInv(e)) { d.estado_manual = null; d.motivo_manual = null; }
    cambiado = false;
    pintar(dir);
  }

  let selSO = null;
  let selSW = null;

  /** Actualiza solo el estado y los periféricos (sin volver a dibujar los selectores). */
  function pintarEstado() {
    const final = d.estado_manual || estadoAuto(d);
    const tarjeta = $('.rc-tarjeta');
    tarjeta.className = `rc-tarjeta st-${final}`;
    $('.rc-estado').innerHTML = `<i class="punto st-${final}"></i><b>${ESTADOS[final].nombre}</b>
      ${d.estado_manual ? `<span class="ayuda">· fijado: ${esc(d.motivo_manual || '')}</span>` : '<span class="ayuda">· según periféricos</span>'}`;
    capa.querySelectorAll('.rc-perif').forEach((box) => {
      const k = box.dataset.p;
      box.className = `rc-perif ${d[k]}`;
      box.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x.dataset.v === d[k]));
    });
  }

  function pintar(dir) {
    const hechos = todos.filter((x) => !esPendienteInv(equipoPorId(x.id))).length;
    $('.rc-progreso i').style.width = `${(hechos / todos.length) * 100}%`;
    const c = $('#rc-cuerpo');
    c.innerHTML = `
      <section class="rc-tarjeta">
        <div class="rc-cab">
          <div><span class="rc-num">${esc(d.numero)}</span>${d.tipo === 'mac' ? '<span class="pc-tipo">MAC</span>' : ''}
            <div class="rc-ubic">${esc(ubicacionTxt(d))}</div></div>
          <div class="rc-pos">${i + 1} / ${lista.length}<small>${hechos} de ${todos.length} capturadas</small></div>
        </div>
        <div class="rc-estado"></div>

        <h3>Periféricos</h3>
        <div class="rc-perifs">
          ${PERIFERICOS.map((p) => `<div class="rc-perif" data-p="${p.clave}">
            <span class="tit"><span class="perif-ico">${icono(p.icono, 'lg')}</span>${p.nombre}</span>
            <div class="segmentado">${Object.entries(PER_ESTADOS).map(([k, v]) => `<button type="button" data-v="${k}" class="s-${k}">${v}</button>`).join('')}</div>
          </div>`).join('')}
        </div>

        <h3>Sistema operativo</h3>
        <div id="rc-so"></div>

        <h3>Software</h3>
        <div class="ficha-sw"><div id="rc-sw"></div><div id="rc-sw-acc"></div></div>

        <h3>Observaciones</h3>
        <textarea class="textarea" id="rc-obs" maxlength="1000" placeholder="Opcional">${esc(d.observaciones || '')}</textarea>
      </section>`;
    selSO = selectorSO({ ids: [...d.so], admin: true, grande: true, alCambiar: () => { cambiado = true; } });
    $('#rc-so').append(selSO.el);
    selSW = selectorSoftware({ seleccion: d.software, admin: true, alCambiar: () => { cambiado = true; } });
    $('#rc-sw').append(selSW.el);
    $('#rc-sw-acc').append(botonPerfiles((p) => { p.software.forEach((id) => agregarSoftware(d.software, id)); selSW.refrescar(); cambiado = true; }));
    pintarEstado();
    if (dir && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      c.firstElementChild.animate([{ opacity: 0, transform: `translateX(${dir * 40}px)` }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    $('#rc-obs').addEventListener('input', (ev) => { d.observaciones = ev.target.value; cambiado = true; });
    capa.querySelector('[data-a="anterior"]').disabled = i === 0;
  }

  capa.addEventListener('click', async (ev) => {
    const t = ev.target;
    const per = t.closest('.rc-perif button');
    if (per) {
      const box = per.closest('.rc-perif');
      d[box.dataset.p] = per.dataset.v; cambiado = true;
      pintarEstado(); animarPeriferico(box, per.dataset.v);
      return;
    }

    const a = t.closest('[data-a]')?.dataset.a;
    if (a === 'cerrar') cerrar();
    if (a === 'anterior' && i > 0) { i -= 1; cargar(-1); }
    if (a === 'saltar') { if (i < lista.length - 1) { i += 1; cargar(1); } else toast('Es la última PC de la lista.', 'info'); }
    if (a === 'guardar') guardar(t.closest('[data-a]'));
  });

  $('#rc-solo').addEventListener('change', (e) => {
    soloPendientes = e.target.checked;
    const actual = lista[i];
    lista = (soloPendientes ? equiposOrdenados().filter(esPendienteInv) : equiposOrdenados()).map((x) => x.id);
    i = Math.max(0, lista.indexOf(actual));
    cargar(0);
  });

  function guardar(boton) {
    return conCarga(boton, async () => {
      const original = equipoPorId(d.id);
      if (selSO.incompletos()) { toast('Elige la distribución del sistema (o quita esa fila).', 'aviso'); return; }
      try {
        const so = await selSO.obtenerIds();
        const r = await api('ctrl/php/inventarioApi.php?accion=guardarEquipo', { body: cuerpoEquipo(original, { ...d, so, software: d.software }) });
        if (!guardados.has(d.id)) guardados.set(d.id, original.estado);
        actualizarEquipos([r.equipo]);
        if (navigator.vibrate) navigator.vibrate(15);
        if (soloPendientes) {
          lista = lista.filter((id) => id !== d.id);
          cargar(1);
        } else if (i < lista.length - 1) { i += 1; cargar(1); } else {
          toast('Terminaste la lista. 🎉', 'ok');
          pintar(0);
        }
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  function cerrar() {
    capa.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(20px)' }], { duration: 200, fill: 'forwards' }).finished.then(() => capa.remove());
    document.body.classList.remove('sin-scroll');
    document.removeEventListener('keydown', teclas);
    renderTodo();
    destellar([...guardados.keys()], guardados);
  }

  function teclas(e) {
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); guardar(capa.querySelector('[data-a="guardar"]')); }
  }
  document.addEventListener('keydown', teclas);

  lista = lista.map((x) => x.id);
  cargar(0);
  void cambiado;
}
