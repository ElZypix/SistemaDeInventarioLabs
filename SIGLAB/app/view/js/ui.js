// view/js/ui.js — Utilidades de interfaz: toasts, modales, confirmaciones y tema.

import { icono } from './iconos.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function debounce(fn, ms = 150) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ------------------------------------------------------------------ */
/*  Toasts                                                             */
/* ------------------------------------------------------------------ */

export function toast(mensaje, tipo = 'ok', { accion, alAccion, duracion = 3800 } = {}) {
  let cont = document.getElementById('toasts');
  if (!cont) { cont = el('<div id="toasts" aria-live="polite"></div>'); document.body.append(cont); }
  const ic = { ok: 'check', error: 'alerta', aviso: 'alerta', info: 'info' }[tipo] || 'info';
  const t = el(`<div class="toast ${tipo}" role="status">${icono(ic)}<span>${esc(mensaje)}</span></div>`);
  if (accion) {
    const b = el(`<button class="accion" type="button">${esc(accion)}</button>`);
    b.addEventListener('click', () => { alAccion?.(); cerrar(); });
    t.append(b);
  }
  const barra = el('<i class="barra-tiempo"></i>');
  barra.style.animationDuration = `${duracion}ms`;
  t.append(barra);
  cont.append(t);

  let timer = setTimeout(cerrar, duracion);
  t.addEventListener('mouseenter', () => { clearTimeout(timer); barra.style.animationPlayState = 'paused'; });
  t.addEventListener('mouseleave', () => { timer = setTimeout(cerrar, 1500); barra.style.animationPlayState = 'running'; });
  function cerrar() {
    clearTimeout(timer);
    if (t.classList.contains('saliendo')) return;
    t.classList.add('saliendo');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }
  return cerrar;
}

/* ------------------------------------------------------------------ */
/*  Modales                                                            */
/* ------------------------------------------------------------------ */

const pila = [];
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pila.length) {
    const m = pila[pila.length - 1];
    if (m.cerrable) { e.preventDefault(); m.cerrar(); }
  }
});

/**
 * abrirModal({ titulo, subtitulo, cuerpo: Element|string, pie: Element|string, ancho, cerrable, alCerrar, cabeceraExtra })
 * Devuelve { capa, modal, cuerpo, pie, cerrar() }.
 */
export function abrirModal({ titulo, subtitulo = '', cuerpo = '', pie = '', ancho = 560, cerrable = true, alCerrar, clase = '' }) {
  const anterior = document.activeElement;
  const capa = el(`
    <div class="modal-capa">
      <div class="modal ${clase}" role="dialog" aria-modal="true" aria-labelledby="mt-${pila.length}" style="--ancho:${ancho}px">
        <header class="modal-head">
          <div><h2 id="mt-${pila.length}">${titulo}</h2>${subtitulo ? `<p>${subtitulo}</p>` : ''}</div>
          ${cerrable ? `<button class="btn icon fantasma sm cerrar" type="button" aria-label="Cerrar">${icono('x')}</button>` : ''}
        </header>
        <div class="modal-body"></div>
        <footer class="modal-foot"></footer>
      </div>
    </div>`);
  const modal = capa.querySelector('.modal');
  const body = capa.querySelector('.modal-body');
  const foot = capa.querySelector('.modal-foot');
  typeof cuerpo === 'string' ? (body.innerHTML = cuerpo) : body.append(cuerpo);
  if (pie) typeof pie === 'string' ? (foot.innerHTML = pie) : foot.append(pie);
  else foot.remove();

  const ctrl = {
    capa, modal, cuerpo: body, pie: foot, cerrable,
    cerrar() {
      if (capa.classList.contains('saliendo')) return;
      pila.splice(pila.indexOf(ctrl), 1);
      capa.classList.add('saliendo');
      capa.addEventListener('animationend', () => { capa.remove(); }, { once: true });
      setTimeout(() => capa.remove(), 400);
      alCerrar?.();
      if (anterior && document.contains(anterior)) anterior.focus({ preventScroll: true });
    },
  };
  capa.querySelector('.cerrar')?.addEventListener('click', () => ctrl.cerrar());
  capa.addEventListener('pointerdown', (e) => {
    if (e.target !== capa) return;
    if (cerrable) ctrl.cerrar();
    else { modal.classList.remove('agitar'); void modal.offsetWidth; modal.classList.add('agitar'); }
  });
  // Mantener el foco dentro del modal
  capa.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((x) => x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });

  document.body.append(capa);
  pila.push(ctrl);
  requestAnimationFrame(() => {
    const primero = body.querySelector('[autofocus], input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled)')
      || foot.querySelector('.btn.primario') || modal.querySelector('.cerrar');
    primero?.focus({ preventScroll: true });
  });
  return ctrl;
}

export function agitar(modal) {
  modal.classList.remove('agitar');
  void modal.offsetWidth;
  modal.classList.add('agitar');
}

/** Confirmación con promesa. */
export function confirmar({ titulo, mensaje, aceptar = 'Aceptar', peligro = false }) {
  return new Promise((resolve) => {
    let r = false;
    const pie = el(`<div style="display:contents">
        <span class="espacio"></span>
        <button class="btn" type="button" data-r="0">Cancelar</button>
        <button class="btn ${peligro ? 'peligro-lleno' : 'primario'}" type="button" data-r="1">${esc(aceptar)}</button>
      </div>`);
    const m = abrirModal({ titulo: esc(titulo), cuerpo: `<p style="margin:0;color:var(--texto-2)">${mensaje}</p>`, pie, ancho: 420, alCerrar: () => resolve(r) });
    pie.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { r = b.dataset.r === '1'; m.cerrar(); }));
    requestAnimationFrame(() => pie.querySelector('[data-r="1"]').focus());
  });
}

/** Pone un botón en estado "cargando" mientras se resuelve la promesa. */
export async function conCarga(boton, fn) {
  if (!boton) return fn();
  const html = boton.innerHTML;
  const ancho = boton.offsetWidth;
  boton.disabled = true;
  boton.style.minWidth = `${ancho}px`;
  boton.innerHTML = '<span class="cargando"></span>';
  try { return await fn(); } finally { boton.disabled = false; boton.innerHTML = html; boton.style.minWidth = ''; }
}

/* ------------------------------------------------------------------ */
/*  Tema claro / oscuro con transición circular                       */
/* ------------------------------------------------------------------ */

export function temaActual() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function pintarBotonTema(btn) {
  btn.innerHTML = icono(temaActual() === 'dark' ? 'sol' : 'luna');
  btn.title = temaActual() === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
}

export function aplicarTema(tema, origen) {
  const raiz = document.documentElement;
  const cambiar = () => {
    raiz.classList.toggle('dark', tema === 'dark');
    try { localStorage.setItem('siglab-tema', tema); } catch { /* sin almacenamiento */ }
  };
  const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reducir || !origen) {
    document.body.classList.add('transicion-tema');
    cambiar();
    setTimeout(() => document.body.classList.remove('transicion-tema'), 400);
    return;
  }
  const r = origen.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const radio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  raiz.classList.add('vt-tema');
  const vt = document.startViewTransition(cambiar);
  vt.ready.then(() => {
    raiz.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radio}px at ${x}px ${y}px)`] },
      { duration: 550, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' },
    );
  });
  vt.finished.finally(() => raiz.classList.remove('vt-tema'));
}
