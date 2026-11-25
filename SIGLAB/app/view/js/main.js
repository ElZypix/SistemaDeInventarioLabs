// view/js/main.js — Arranque de la aplicación, navegación, cuenta, tema, buscador y reportes.

import { api } from './api.js';
import { icono, pintarIconos } from './iconos.js';
import { esc, el, toast, abrirModal, conCarga, aplicarTema, pintarBotonTema, temaActual, agitar, debounce } from './ui.js';
import { S, ESTADOS, esAdmin, estadoDe, equiposLab, labPorId, ubicacionTxt, coincideTexto } from './estado.js';
import { renderTodo, mostrarEsqueleto, cambiarLab, alternarSeleccion, alternarEdicion, aplicarFiltros, resaltarEquipo } from './mapa.js';
import { abrirEquipo } from './equipo.js';

pintarIconos();
const $ = (s) => document.querySelector(s);

/* ------------------------------------------------------------------ */
/*  Carga inicial                                                      */
/* ------------------------------------------------------------------ */

async function cargar() {
  const d = await api('ctrl/php/inventarioApi.php?accion=datos');
  S.labs = d.laboratorios;
  S.lugares = d.lugares;
  S.equipos = d.equipos;
  S.so = d.so;
  S.software = d.software;
  S.componentes = d.componentes || [];
  S.perfiles = d.perfiles || [];
  let guardado = null;
  try { guardado = Number(localStorage.getItem('siglab-lab')); } catch { /* */ }
  S.labId = S.labs.some((l) => l.id === guardado) ? guardado : S.labs[0]?.id;
}

async function iniciar() {
  try {
    mostrarEsqueleto();
    if (S.usuario.debe_cambiar) await cambiarPassword(true);
    await cargar();
    renderTodo({ entrada: true });
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'error', { duracion: 8000 });
  }
}

/* ------------------------------------------------------------------ */
/*  Navegación entre vistas                                            */
/* ------------------------------------------------------------------ */

/** Lleva al mapa, cambia de laboratorio si hace falta y resalta el equipo. */
function irAEquipo(e) {
  const ir = () => setTimeout(() => resaltarEquipo(e.id), 60);
  if (!document.querySelector('#vista-mapa.activa')) irA('mapa').then(() => cambiarLab(e.laboratorio_id, ir));
  else cambiarLab(e.laboratorio_id, ir);
}

const cargadores = {
  estadisticas: () => import('./estadisticas.js').then((m) => m.mostrarEstadisticas(irAEquipo)),
  matriz: () => import('./matriz.js').then((m) => m.mostrarMatriz()),
  pendientes: () => import('./pendientes.js').then((m) => m.mostrarPendientes(irAEquipo)),
  catalogos: () => import('./catalogos.js').then((m) => m.mostrarCatalogos()),
  usuarios: () => import('./usuarios.js').then((m) => m.mostrarUsuarios()),
  respaldo: () => import('./respaldo.js').then((m) => m.mostrarRespaldo()),
};

function moverIndicadorNav() {
  const act = document.querySelector('.nav-item.activo');
  const ind = document.querySelector('.nav-indicador');
  if (act && ind) ind.style.transform = `translateY(${act.offsetTop}px)`;
}

async function irA(vista) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('activo', b.dataset.vista === vista));
  moverIndicadorNav();
  document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('activa', v.dataset.vista === vista));
  $('#lateral').classList.remove('abierta');
  if (vista === 'mapa') {
    try { await cargar(); renderTodo(); } catch (err) { toast(err.message, 'error'); }
  } else {
    S.modoSeleccion = false; S.seleccion.clear();
    $('#lote-barra').hidden = true;
    try { await cargadores[vista]?.(); } catch (err) { toast(err.message, 'error'); }
  }
  scrollTo({ top: 0 });
}

document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => irA(b.dataset.vista)));
requestAnimationFrame(moverIndicadorNav);
$('#btn-menu').addEventListener('click', (e) => { e.stopPropagation(); $('#lateral').classList.toggle('abierta'); });
document.addEventListener('click', (e) => { if (!e.target.closest('#lateral')) $('#lateral').classList.remove('abierta'); });

/* ------------------------------------------------------------------ */
/*  Acciones del mapa                                                  */
/* ------------------------------------------------------------------ */

$('#btn-seleccionar')?.addEventListener('click', alternarSeleccion);
$('#btn-editar-mapa')?.addEventListener('click', alternarEdicion);
$('#btn-nueva')?.addEventListener('click', () => abrirEquipo(null));
$('#btn-recorrido')?.addEventListener('click', () => import('./recorrido.js').then((m) => m.abrirRecorrido()));
$('#btn-atajos')?.addEventListener('click', () => import('./atajos.js').then((m) => m.ayudaAtajos()));
import('./atajos.js');

/* ------------------------------------------------------------------ */
/*  Tema                                                               */
/* ------------------------------------------------------------------ */

const btnTema = $('#btn-tema');
pintarBotonTema(btnTema);
btnTema.addEventListener('click', async () => {
  const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
  aplicarTema(nuevo, btnTema);
  setTimeout(() => pintarBotonTema(btnTema), 60);
  try { await api('ctrl/php/authApi.php?accion=tema', { body: { tema: nuevo } }); } catch { /* se queda solo local */ }
});

/* ------------------------------------------------------------------ */
/*  Menú de cuenta                                                     */
/* ------------------------------------------------------------------ */

const btnCuenta = $('#btn-cuenta');
const menuCuenta = $('#cuenta-menu');
btnCuenta.addEventListener('click', (e) => {
  e.stopPropagation();
  menuCuenta.hidden = !menuCuenta.hidden;
  btnCuenta.setAttribute('aria-expanded', String(!menuCuenta.hidden));
});
document.addEventListener('click', () => { menuCuenta.hidden = true; btnCuenta.setAttribute('aria-expanded', 'false'); });
menuCuenta.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-accion]'); if (!b) return;
  if (b.dataset.accion === 'password') cambiarPassword(false);
  if (b.dataset.accion === 'salir') {
    try { await api('ctrl/php/authApi.php?accion=logout', { body: {} }); } catch { /* */ }
    document.body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    setTimeout(() => { location.href = 'index.php'; }, 180);
  }
});

function cambiarPassword(obligatorio) {
  return new Promise((resolve) => {
    const cuerpo = el(`<div style="display:contents">
      ${obligatorio ? `<div class="alerta-box">${icono('candado')}<span>Por seguridad, cambia la contraseña temporal antes de continuar.</span></div>` : ''}
      <div class="campo"><label for="pw-a">Contraseña actual</label><input class="input" id="pw-a" type="password" autocomplete="current-password"></div>
      <div class="campo"><label for="pw-n">Nueva contraseña</label><input class="input" id="pw-n" type="password" autocomplete="new-password">
        <span class="ayuda">Mínimo 8 caracteres, con letras y números.</span></div>
      <div class="campo"><label for="pw-c">Confirmar nueva contraseña</label><input class="input" id="pw-c" type="password" autocomplete="new-password"></div>
    </div>`);
    const pie = el(`<div style="display:contents"><span class="espacio"></span>
        ${obligatorio ? '' : '<button class="btn" data-c>Cancelar</button>'}
        <button class="btn primario" data-ok>Guardar contraseña</button></div>`);
    const m = abrirModal({ titulo: 'Cambiar contraseña', cuerpo, pie, ancho: 440, cerrable: !obligatorio, alCerrar: resolve });
    pie.querySelector('[data-c]')?.addEventListener('click', () => m.cerrar());
    const ok = pie.querySelector('[data-ok]');
    const enviar = () => conCarga(ok, async () => {
      const [a, n, c] = ['#pw-a', '#pw-n', '#pw-c'].map((s) => cuerpo.querySelector(s).value);
      if (n !== c) { toast('Las contraseñas nuevas no coinciden.', 'error'); agitar(m.modal); return; }
      try {
        const r = await api('ctrl/php/authApi.php?accion=cambiarPassword', { body: { actual: a, nueva: n } });
        S.usuario.debe_cambiar = false;
        toast(r.mensaje);
        m.cerrar();
      } catch (err) { toast(err.message, 'error'); agitar(m.modal); }
    });
    ok.addEventListener('click', enviar);
    cuerpo.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
  });
}

/* ------------------------------------------------------------------ */
/*  Reporte PDF                                                        */
/* ------------------------------------------------------------------ */

$('#btn-reporte').addEventListener('click', () => {
  const lab = labPorId(S.labId);
  const cuerpo = el(`<div style="display:contents">
    <div class="campo"><label for="rp-lab">Laboratorio</label>
      <select class="select" id="rp-lab">
        ${S.labs.map((l) => `<option value="${l.id}" ${l.id === lab?.id ? 'selected' : ''}>${esc(l.nombre)}</option>`).join('')}
        <option value="todos">Ambos laboratorios</option>
      </select></div>
    <div class="campo"><label for="rp-estado">Equipos a incluir</label>
      <select class="select" id="rp-estado">
        <option value="todos">Todos los equipos</option>
        ${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}">Solo: ${v.nombre}</option>`).join('')}
      </select></div>
    <label class="switch"><input type="checkbox" id="rp-sw" checked><span class="pista"></span>Incluir columna de software instalado</label>
    <label class="switch"><input type="checkbox" id="rp-croquis" checked><span class="pista"></span>Incluir croquis del laboratorio (mapa a color)</label>
    <label class="switch"><input type="checkbox" id="rp-specs"><span class="pista"></span>Incluir especificaciones técnicas (procesador, RAM, discos…)</label>
    <p class="ayuda" style="margin:0">Se abre en una pestaña nueva con los logos institucionales. Elige <b>Guardar como PDF</b> en el cuadro de impresión.</p>
    <div class="rp-extra">
      <button class="btn" type="button" id="rp-software">${icono('matriz', 'sm')} Software e instalaciones pendientes (PDF)</button>
      <button class="btn" type="button" id="rp-excel">${icono('excel', 'sm')} Exportar todo a Excel</button>
    </div>
  </div>`);
  const pie = el(`<div style="display:contents"><span class="espacio"></span><button class="btn" data-c>Cancelar</button>
      <button class="btn primario" data-ok>${icono('pdf', 'sm')} Generar reporte</button></div>`);
  const m = abrirModal({ titulo: 'Reportes', subtitulo: 'Inventario, croquis, software y Excel', cuerpo, pie, ancho: 500 });
  pie.querySelector('[data-c]').onclick = () => m.cerrar();
  cuerpo.querySelector('#rp-software').onclick = () => {
    window.open(`ctrl/php/reporteSoftware.php?lab=${cuerpo.querySelector('#rp-lab').value}&auto=1`, '_blank', 'noopener');
    m.cerrar();
  };
  const btnX = cuerpo.querySelector('#rp-excel');
  btnX.onclick = () => import('./exportar.js').then((x) => x.exportarExcel(btnX));
  pie.querySelector('[data-ok]').onclick = () => {
    const q = new URLSearchParams({
      croquis: cuerpo.querySelector('#rp-croquis').checked ? '1' : '0',
      lab: cuerpo.querySelector('#rp-lab').value,
      estado: cuerpo.querySelector('#rp-estado').value,
      software: cuerpo.querySelector('#rp-sw').checked ? '1' : '0',
      specs: cuerpo.querySelector('#rp-specs').checked ? '1' : '0',
      auto: '1',
    });
    window.open(`ctrl/php/reporteInventario.php?${q}`, '_blank', 'noopener');
    m.cerrar();
  };
});

/* ------------------------------------------------------------------ */
/*  Buscador global (filtra el mapa al instante y salta a otros labs)  */
/* ------------------------------------------------------------------ */

const inBuscar = $('#buscar');
const resBox = $('#buscador-res');
let resSel = 0;
let resultados = [];

function marcar(txt, q) {
  const t = esc(txt);
  const pal = q.trim().split(/\s+/).filter((p) => p.length > 1).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return pal.length ? t.replace(new RegExp(`(${pal.join('|')})`, 'gi'), '<mark>$1</mark>') : t;
}

function pintarResultados(q) {
  if (!q.trim()) { resBox.hidden = true; return; }
  resultados = S.equipos.filter((e) => coincideTexto(e, q))
    .sort((a, b) => (a.laboratorio_id === S.labId ? -1 : 0) - (b.laboratorio_id === S.labId ? -1 : 0) || a.numero.localeCompare(b.numero, 'es', { numeric: true }))
    .slice(0, 12);
  resSel = 0;
  if (!resultados.length) {
    resBox.innerHTML = `<div class="vacio-msg">Sin coincidencias para “${esc(q)}”</div>`;
  } else {
    resBox.innerHTML = `<div class="res-grupo">Equipos</div>` + resultados.map((e, i) => {
      const st = estadoDe(e);
      return `<button class="res-item ${i === 0 ? 'sel' : ''}" data-i="${i}" role="option">
          <i class="punto st-${st}"></i>
          <span class="res-txt"><b>${marcar(e.numero, q)}</b><small>${esc(ubicacionTxt(e))} · ${ESTADOS[st].nombre}${e.observaciones ? ` · ${marcar(e.observaciones.slice(0, 60), q)}` : ''}</small></span>
          <span class="res-lab">${esc(labPorId(e.laboratorio_id).clave === 'DS' ? 'Desarrollo' : 'Telecom')}</span>
        </button>`;
    }).join('');
  }
  resBox.hidden = false;
}

function irAResultado(i) {
  const e = resultados[i];
  if (!e) return;
  resBox.hidden = true;
  irAEquipo(e);
}

const filtrarMapa = debounce((q) => { S.filtros.texto = q.trim(); aplicarFiltros(); }, 80);
inBuscar.addEventListener('input', () => { pintarResultados(inBuscar.value); filtrarMapa(inBuscar.value); });
inBuscar.addEventListener('focus', () => { if (inBuscar.value.trim()) pintarResultados(inBuscar.value); });
inBuscar.addEventListener('keydown', (e) => {
  const items = [...resBox.querySelectorAll('.res-item')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!items.length) return;
    resSel = (resSel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((x, i) => x.classList.toggle('sel', i === resSel));
    items[resSel].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault(); irAResultado(resSel);
  } else if (e.key === 'Escape') {
    if (inBuscar.value) { inBuscar.value = ''; S.filtros.texto = ''; aplicarFiltros(); }
    resBox.hidden = true; inBuscar.blur();
  }
});
resBox.addEventListener('pointerdown', (e) => e.preventDefault());
resBox.addEventListener('click', (e) => { const b = e.target.closest('.res-item'); if (b) irAResultado(Number(b.dataset.i)); });
inBuscar.addEventListener('blur', () => setTimeout(() => { resBox.hidden = true; }, 120));

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inBuscar.focus(); inBuscar.select(); }
  else if (e.key === '/' && !e.target.closest('input, textarea, select') && !document.querySelector('.modal-capa')) { e.preventDefault(); inBuscar.focus(); }
});

iniciar();

export { esAdmin, equiposLab };
