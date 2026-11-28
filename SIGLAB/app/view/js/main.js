// view/js/main.js — Arranque de la aplicación, navegación, cuenta, tema, buscador y reportes.

import { api } from './api.js';
import { icono, pintarIconos } from './iconos.js';
import { esc, el, toast, abrirModal, conCarga, aplicarTema, pintarBotonTema, temaActual, agitar, debounce } from './ui.js';
import { S, ESTADOS, esAdmin, estadoDe, equiposLab, labPorId, ubicacionTxt, coincideTexto } from './estado.js';
import { renderTodo, mostrarEsqueleto, cambiarLab, alternarSeleccion, alternarEdicion, aplicarFiltros, resaltarEquipo } from './mapa.js';
import { abrirEquipo } from './equipo.js';
import { combobox } from './combobox.js';

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
  S.ajustes = d.ajustes || {};
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

const VOBO_SUGERIDO = { nombre: 'ING. HUGO ANTONIO OCAMPO ALFARO', cargo: 'Encargado del laboratorio' };
const TIPOS_REPORTE = {
  inventario: { texto: 'Inventario y estado (PDF)', icono: 'pdf', sub: 'Croquis, inventario y especificaciones' },
  software: { texto: 'Software e instalaciones pendientes (PDF)', icono: 'matriz', sub: 'Matriz de programas por equipo' },
  excel: { texto: 'Excel completo', icono: 'excel', sub: 'Todas las hojas en un archivo .xlsx' },
};
const leerLS = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

$('#btn-reporte').addEventListener('click', () => {
  const lab = labPorId(S.labId);
  let tipo = leerLS('siglab-rep-tipo', 'inventario');
  if (!TIPOS_REPORTE[tipo]) tipo = 'inventario';
  let modoFirmas = leerLS('siglab-rep-firmas', 'ambas');
  const aj = S.ajustes || {};
  const claveCargo = `siglab-firma-cargo-${S.usuario.id}`;

  const cuerpo = el(`<div style="display:contents">
    <div class="campo"><span class="etiqueta">Tipo de reporte</span><div id="rp-tipo"></div></div>
    <div class="rp-grupo" data-para="inventario software">
      <div class="campo"><label for="rp-lab">Laboratorio</label>
        <select class="select" id="rp-lab">
          ${S.labs.map((l) => `<option value="${l.id}" ${l.id === lab?.id ? 'selected' : ''}>${esc(l.nombre)}</option>`).join('')}
          <option value="todos">Ambos laboratorios</option>
        </select></div>
    </div>
    <div class="rp-grupo" data-para="inventario">
      <div class="campo"><label for="rp-estado">Equipos a incluir</label>
        <select class="select" id="rp-estado">
          <option value="todos">Todos los equipos</option>
          ${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}">Solo: ${v.nombre}</option>`).join('')}
        </select></div>
      <label class="switch"><input type="checkbox" id="rp-croquis" checked><span class="pista"></span>Incluir croquis del laboratorio (mapa a color)</label>
      <label class="switch"><input type="checkbox" id="rp-sw" checked><span class="pista"></span>Incluir columna de software instalado</label>
      <label class="switch"><input type="checkbox" id="rp-specs"><span class="pista"></span>Incluir especificaciones técnicas (procesador, RAM, discos…)</label>
    </div>
    <div class="rp-grupo" data-para="inventario software">
      <div class="campo"><span class="etiqueta">Firmas al final</span>
        <div class="segmentado rp-firmas" id="rp-firmas">
          ${[['ambas', 'Elaboró y Vo. Bo.'], ['elaboro', 'Solo Elaboró'], ['vobo', 'Solo Vo. Bo.'], ['ninguna', 'Ninguna']]
            .map(([v, t]) => `<button type="button" data-v="${v}">${t}</button>`).join('')}
        </div></div>
      <div class="rp-firma" data-f="elaboro">
        <span class="rp-firma-rol">Elaboró</span>
        <input class="input" id="rp-fe-nombre" maxlength="90" placeholder="Nombre completo" value="${esc(S.usuario.nombre || '')}">
        <input class="input" id="rp-fe-cargo" maxlength="90" placeholder="Cargo (opcional)" value="${esc(leerLS(claveCargo, ''))}">
      </div>
      <div class="rp-firma" data-f="vobo">
        <span class="rp-firma-rol">Vo. Bo.</span>
        <input class="input" id="rp-fv-nombre" maxlength="90" placeholder="Nombre completo" value="${esc(aj.firma_vobo_nombre ?? VOBO_SUGERIDO.nombre)}">
        <input class="input" id="rp-fv-cargo" maxlength="90" placeholder="Cargo (opcional)" value="${esc(aj.firma_vobo_cargo ?? VOBO_SUGERIDO.cargo)}">
      </div>
    </div>
    <div class="rp-grupo" data-para="excel">
      <p class="ayuda" style="margin:0">Descarga un archivo de Excel con el inventario de ambos laboratorios, el software por equipo, las especificaciones y los pendientes, cada uno en su hoja.</p>
    </div>
    <p class="ayuda rp-nota" data-para="inventario software" style="margin:0">Se abre en una pestaña nueva. En el cuadro de impresión elige <b>Guardar como PDF</b> y activa <b>Gráficos de fondo</b> para que salgan los colores.</p>
  </div>`);
  const pie = el(`<div style="display:contents"><span class="espacio"></span><button class="btn" data-c>Cancelar</button>
      <button class="btn primario" data-ok></button></div>`);
  const m = abrirModal({ titulo: 'Reportes', subtitulo: 'Elige el tipo de reporte y sus opciones', cuerpo, pie, ancho: 640 });
  pie.querySelector('[data-c]').onclick = () => m.cerrar();
  const ok = pie.querySelector('[data-ok]');

  /** Muestra solo las opciones del tipo elegido */
  function pintarTipo(animar) {
    cuerpo.querySelectorAll('[data-para]').forEach((g) => {
      const ver = g.dataset.para.split(' ').includes(tipo);
      if (ver && g.hidden && animar) g.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
      g.hidden = !ver;
    });
    ok.innerHTML = tipo === 'excel' ? `${icono('excel', 'sm')} Descargar Excel` : `${icono('pdf', 'sm')} Generar PDF`;
  }
  function pintarFirmas(animar) {
    cuerpo.querySelectorAll('#rp-firmas button').forEach((b) => b.classList.toggle('sel', b.dataset.v === modoFirmas));
    cuerpo.querySelectorAll('.rp-firma').forEach((f) => {
      const ver = modoFirmas === 'ambas' || modoFirmas === f.dataset.f;
      if (ver && f.hidden && animar) f.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
      f.hidden = !ver;
    });
  }
  const cbTipo = combobox({
    valor: tipo,
    opciones: () => Object.entries(TIPOS_REPORTE).map(([k, t]) => ({ valor: k, texto: t.texto, sub: t.sub })),
    alElegir: (v) => { tipo = v; pintarTipo(true); },
  });
  cuerpo.querySelector('#rp-tipo').append(cbTipo.el);
  cuerpo.querySelector('#rp-firmas').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    modoFirmas = b.dataset.v; pintarFirmas(true);
  });
  pintarTipo(false);
  pintarFirmas(false);

  const firmasQuery = () => ({
    firmas: modoFirmas,
    fe_nombre: cuerpo.querySelector('#rp-fe-nombre').value.trim(),
    fe_cargo: cuerpo.querySelector('#rp-fe-cargo').value.trim(),
    fv_nombre: cuerpo.querySelector('#rp-fv-nombre').value.trim(),
    fv_cargo: cuerpo.querySelector('#rp-fv-cargo').value.trim(),
  });
  /** Recuerda las preferencias; el Vo. Bo. se guarda para todos si cambió */
  function recordar() {
    const f = firmasQuery();
    guardarLS('siglab-rep-tipo', tipo);
    guardarLS('siglab-rep-firmas', modoFirmas);
    guardarLS(claveCargo, f.fe_cargo);
    const antes = { nombre: aj.firma_vobo_nombre ?? VOBO_SUGERIDO.nombre, cargo: aj.firma_vobo_cargo ?? VOBO_SUGERIDO.cargo };
    if (f.fv_nombre !== antes.nombre || f.fv_cargo !== antes.cargo) {
      api('ctrl/php/inventarioApi.php?accion=firmaReporte', { body: { nombre: f.fv_nombre, cargo: f.fv_cargo } })
        .then((r) => { S.ajustes = r.ajustes; }).catch(() => {});
    }
  }

  ok.onclick = () => {
    if (tipo === 'excel') {
      guardarLS('siglab-rep-tipo', tipo);
      import('./exportar.js').then((x) => x.exportarExcel(ok)).then(() => m.cerrar());
      return;
    }
    recordar();
    const labSel = cuerpo.querySelector('#rp-lab').value;
    if (tipo === 'software') {
      const q = new URLSearchParams({ lab: labSel, ...firmasQuery(), auto: '1' });
      window.open(`ctrl/php/reporteSoftware.php?${q}`, '_blank', 'noopener');
    } else {
      const q = new URLSearchParams({
        lab: labSel,
        estado: cuerpo.querySelector('#rp-estado').value,
        croquis: cuerpo.querySelector('#rp-croquis').checked ? '1' : '0',
        software: cuerpo.querySelector('#rp-sw').checked ? '1' : '0',
        specs: cuerpo.querySelector('#rp-specs').checked ? '1' : '0',
        ...firmasQuery(),
        auto: '1',
      });
      window.open(`ctrl/php/reporteInventario.php?${q}`, '_blank', 'noopener');
    }
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
