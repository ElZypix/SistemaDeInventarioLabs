// view/js/combobox.js — Comboboxes con búsqueda integrada:
//   combobox()    una opción, con "Otro…" que despliega un campo para agregar al catálogo
//   multiCombo()  varias opciones como etiquetas (software)

import { icono } from './iconos.js';
import { esc, el } from './ui.js';
import { norm } from './estado.js';

let idSec = 0;

/** Lista desplegable compartida: pinta opciones agrupadas y maneja el teclado. */
export function lista(contenedor) {
  const ul = el('<div class="cbx-lista" role="listbox" hidden></div>');
  contenedor.append(ul);
  let items = [];
  let activo = -1;
  const api = {
    el: ul,
    abierta: () => !ul.hidden,
    pintar(ops, extra = []) {
      items = [...ops, ...extra];
      activo = items.length ? 0 : -1;
      let html = '';
      let grupo = null;
      ops.forEach((o, i) => {
        if (o.grupo && o.grupo !== grupo) { grupo = o.grupo; html += `<div class="cbx-grupo">${esc(grupo)}</div>`; }
        html += `<div class="cbx-op ${o.tenue ? 'tenue' : ''} ${o.marcada ? 'marcada' : ''}" role="option" data-i="${i}">${o.icono ? icono(o.icono, 'sm') : ''}<span>${esc(o.texto)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}${o.marcada ? icono('check', 'sm') : ''}</div>`;
      });
      if (!ops.length) html += '<div class="cbx-vacio">Sin coincidencias</div>';
      extra.forEach((o, j) => {
        html += `<div class="cbx-op cbx-otro" role="option" data-i="${ops.length + j}">${icono('mas', 'sm')}<span>${esc(o.texto)}</span></div>`;
      });
      ul.innerHTML = html;
      api.marcar();
    },
    marcar() {
      ul.querySelectorAll('.cbx-op').forEach((n) => n.classList.toggle('activa', Number(n.dataset.i) === activo));
      ul.querySelector('.cbx-op.activa')?.scrollIntoView({ block: 'nearest' });
    },
    mover(d) { if (!items.length) return; activo = (activo + d + items.length) % items.length; api.marcar(); },
    actual: () => items[activo],
    abrir() { ul.hidden = false; },
    cerrar() { ul.hidden = true; },
    item: (i) => items[i],
  };
  return api;
}

/**
 * Combobox de una opción con búsqueda.
 * opc = { placeholder, opciones: () => [{ valor, texto, grupo?, sub?, icono?, tenue? }], valor,
 *         alElegir(valor), otro?: { texto: 'Otro…', placeholder, alAgregar: async (texto) => valor | null },
 *         deshabilitado?, clase?, animar? }
 */
export function combobox(opc) {
  const id = `cbx${++idSec}`;
  const raiz = el(`<div class="cbx ${opc.clase || ''} ${opc.animar ? 'cbx-entra' : ''}">
      <div class="cbx-campo">
        <input class="input" id="${id}" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${esc(opc.placeholder || '')}">
        <span class="cbx-flecha">${icono('flecha', 'sm')}</span>
      </div>
    </div>`);
  const input = raiz.querySelector('input');
  const ls = lista(raiz.querySelector('.cbx-campo'));
  let valor = opc.valor ?? '';
  let formOtro = null;

  const textoDe = (v) => opc.opciones().find((o) => o.valor === v)?.texto ?? '';
  // Un valor vacío deja ver el placeholder (no "Sin especificar" ni "Sin sistema")
  const mostrarValor = () => { input.value = valor === '' || valor == null ? '' : textoDe(valor); };
  mostrarValor();
  if (opc.deshabilitado) { input.disabled = true; raiz.classList.add('deshabilitado'); }

  function filtrar(q) {
    const nq = norm(q);
    const ops = opc.opciones().filter((o) => !nq || norm(`${o.texto} ${o.sub || ''} ${o.grupo || ''}`).includes(nq));
    ls.pintar(ops, opc.otro ? [{ valor: '__otro', texto: opc.otro.texto || 'Otro…' }] : []);
  }
  function abrir(q = '') { filtrar(q); ls.abrir(); input.setAttribute('aria-expanded', 'true'); }
  function cerrar() { ls.cerrar(); input.setAttribute('aria-expanded', 'false'); mostrarValor(); }

  function elegir(o) {
    if (!o) return;
    if (o.valor === '__otro') { cerrar(); mostrarOtro(); return; }
    valor = o.valor;
    cerrar();
    opc.alElegir?.(valor, o);
  }

  function mostrarOtro() {
    if (formOtro) { formOtro.querySelector('input').focus(); return; }
    formOtro = el(`<div class="cbx-nuevo">
        <input class="input" maxlength="60" placeholder="${esc(opc.otro.placeholder || 'Escribe el nombre')}">
        <button type="button" class="btn sm primario">${icono('check', 'sm')} Agregar</button>
        <button type="button" class="btn sm icon fantasma" aria-label="Cancelar">${icono('x', 'sm')}</button>
        <span class="cbx-error"></span>
      </div>`);
    raiz.append(formOtro);
    const [inp] = formOtro.querySelectorAll('input');
    const [ok, cancelar] = formOtro.querySelectorAll('button');
    const err = formOtro.querySelector('.cbx-error');
    const cerrarForm = () => {
      const f = formOtro; formOtro = null;
      f.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-4px)' }], { duration: 160 }).finished.then(() => f.remove());
    };
    const enviar = async () => {
      const t = inp.value.trim();
      if (!t) { err.textContent = 'Escribe un nombre primero.'; inp.focus(); return; }
      ok.disabled = true;
      try {
        const nuevo = await opc.otro.alAgregar(t);
        if (nuevo !== null && nuevo !== undefined) {
          valor = nuevo; mostrarValor(); cerrarForm(); opc.alElegir?.(valor);
        }
      } catch (e) { err.textContent = e.message || 'No se pudo agregar.'; } finally { ok.disabled = false; }
    };
    ok.onclick = enviar;
    cancelar.onclick = cerrarForm;
    inp.addEventListener('input', () => { err.textContent = ''; });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); enviar(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarForm(); }
    });
    requestAnimationFrame(() => inp.focus());
  }

  // La lista se abre al hacer clic o escribir, no con el foco automático del modal
  input.addEventListener('focus', () => input.select());
  input.addEventListener('click', () => { if (!ls.abierta()) { input.select(); abrir(); } });
  input.addEventListener('input', () => abrir(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!ls.abierta()) abrir(); else ls.mover(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ls.mover(-1); }
    else if (e.key === 'Enter') { if (ls.abierta()) { e.preventDefault(); elegir(ls.actual()); } }
    else if (e.key === 'Escape') { if (ls.abierta()) { e.preventDefault(); e.stopPropagation(); cerrar(); } }
    else if (e.key === 'Tab') { if (ls.abierta() && input.value && ls.actual()) elegir(ls.actual()); else cerrar(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { if (!raiz.contains(document.activeElement)) cerrar(); }, 120));
  raiz.querySelector('.cbx-flecha').addEventListener('mousedown', (e) => { e.preventDefault(); if (ls.abierta()) cerrar(); else { input.focus(); abrir(); } });
  ls.el.addEventListener('mousedown', (e) => {
    const n = e.target.closest('.cbx-op');
    if (!n) return;
    e.preventDefault();
    elegir(ls.item(Number(n.dataset.i)));
  });

  return {
    el: raiz,
    get valor() { return valor; },
    set(v) { valor = v; mostrarValor(); },
    foco(abrirLista = false) { input.focus(); if (abrirLista) abrir(); },
  };
}

/**
 * Combobox de varias opciones: lo elegido se muestra como etiquetas con ×.
 * opc = { placeholder, opciones: () => [{ valor, texto, grupo? }], seleccion: Set, alCambiar(),
 *         agregar?: { alAgregar: async (texto) => valor | null }, deshabilitado?, vacioTexto? }
 */
export function multiCombo(opc) {
  const raiz = el(`<div class="mcbx">
      <div class="mcbx-etiquetas"></div>
      <div class="cbx-campo">
        <input class="input" role="combobox" aria-expanded="false" autocomplete="off" spellcheck="false" placeholder="${esc(opc.placeholder || 'Buscar…')}">
        <span class="cbx-flecha">${icono('flecha', 'sm')}</span>
      </div>
    </div>`);
  const etiquetas = raiz.querySelector('.mcbx-etiquetas');
  const input = raiz.querySelector('input');
  const ls = lista(raiz.querySelector('.cbx-campo'));
  const sel = opc.seleccion;

  function pintarEtiquetas(nuevo = null) {
    const ops = opc.opciones();
    const elegidas = ops.filter((o) => sel.has(o.valor)).sort((a, b) => a.texto.localeCompare(b.texto, 'es', { numeric: true }));
    etiquetas.innerHTML = elegidas.length
      ? elegidas.map((o) => `<span class="etiqueta-sel ${o.valor === nuevo ? 'nueva' : ''}" data-v="${o.valor}">${esc(o.texto)}${opc.deshabilitado ? '' : `<button type="button" aria-label="Quitar ${esc(o.texto)}">${icono('x', 'sm')}</button>`}</span>`).join('')
      : `<span class="ayuda">${esc(opc.vacioTexto || 'Nada seleccionado')}</span>`;
  }

  function filtrar(q) {
    const nq = norm(q);
    const ops = opc.opciones().filter((o) => !sel.has(o.valor) && (!nq || norm(`${o.texto} ${o.grupo || ''}`).includes(nq)));
    const existe = opc.opciones().some((o) => norm(o.texto) === nq);
    const extra = opc.agregar && q.trim() && !existe ? [{ valor: '__nuevo', texto: `Agregar "${q.trim()}" al catálogo` }] : [];
    ls.pintar(ops, extra);
  }
  const abrir = (q = '') => { filtrar(q); ls.abrir(); input.setAttribute('aria-expanded', 'true'); };
  const cerrar = () => { ls.cerrar(); input.setAttribute('aria-expanded', 'false'); };

  async function elegir(o) {
    if (!o) return;
    let v = o.valor;
    if (v === '__nuevo') {
      try { v = await opc.agregar.alAgregar(input.value.trim()); } catch { v = null; }
      if (v === null || v === undefined) return;
    }
    sel.add(v);
    input.value = '';
    pintarEtiquetas(v);
    opc.alCambiar?.();
    filtrar('');
  }

  if (opc.deshabilitado) raiz.querySelector('.cbx-campo').remove();
  else {
    input.addEventListener('click', () => { if (!ls.abierta()) abrir(input.value); });
    input.addEventListener('input', () => abrir(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!ls.abierta()) abrir(input.value); else ls.mover(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); ls.mover(-1); }
      else if (e.key === 'Enter') { if (ls.abierta()) { e.preventDefault(); elegir(ls.actual()); } }
      else if (e.key === 'Escape') { if (ls.abierta()) { e.preventDefault(); e.stopPropagation(); cerrar(); } }
      else if (e.key === 'Backspace' && !input.value && sel.size) {
        const ult = [...etiquetas.querySelectorAll('.etiqueta-sel')].pop();
        if (ult) { sel.delete(isNaN(ult.dataset.v) ? ult.dataset.v : Number(ult.dataset.v)); pintarEtiquetas(); opc.alCambiar?.(); }
      }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (!raiz.contains(document.activeElement)) cerrar(); }, 120));
    raiz.querySelector('.cbx-flecha').addEventListener('mousedown', (e) => { e.preventDefault(); if (ls.abierta()) cerrar(); else { input.focus(); abrir(input.value); } });
    ls.el.addEventListener('mousedown', (e) => {
      const n = e.target.closest('.cbx-op');
      if (!n) return;
      e.preventDefault();
      elegir(ls.item(Number(n.dataset.i)));
    });
    etiquetas.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const tag = b.closest('.etiqueta-sel');
      const v = isNaN(tag.dataset.v) ? tag.dataset.v : Number(tag.dataset.v);
      tag.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.7)' }], { duration: 140 }).finished.then(() => {
        sel.delete(v); pintarEtiquetas(); opc.alCambiar?.();
      });
    });
  }
  pintarEtiquetas();
  return { el: raiz, refrescar: () => pintarEtiquetas(), foco: () => input.focus() };
}
