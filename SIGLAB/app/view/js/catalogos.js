// view/js/catalogos.js — Administración de sistemas operativos y software.

import { api } from './api.js';
import { icono } from './iconos.js';
import { esc, el, toast, abrirModal, confirmar, conCarga, agitar } from './ui.js';
import { S, FAMILIAS } from './estado.js';
import { combobox } from './combobox.js';
import { TIPOS_COMP } from './specs.js';

const cont = document.getElementById('catalogos');

const CONF = {
  so: { titulo: 'Sistemas operativos', singular: 'sistema operativo', extra: 'familia', extraTxt: 'Familia', ph: 'Ej. Fedora, Windows 10 LTSC' },
  software: { titulo: 'Software', singular: 'programa', extra: 'categoria', extraTxt: 'Categoría', ph: 'Ej. Blender, GNS3, Postman' },
};
const COMP_PLURAL = { modelo: 'Modelos', procesador: 'Procesadores', grafica: 'Gráficas', motherboard: 'Motherboards' };
let compTipo = 'modelo';
const forms = {};   // comboboxes de los formularios de alta

export async function mostrarCatalogos() {
  cont.innerHTML = `${panel('so')}${panel('software')}
    <section class="panel ancho" id="cat-comp">
      <div class="panel-head"><h3>${icono('cpu')} Componentes</h3><span class="badge" data-total>…</span></div>
      <div class="comp-barra">
        <div class="segmentado" id="comp-tabs">${Object.entries(COMP_PLURAL).map(([k, t]) => `<button type="button" data-t="${k}" class="${k === compTipo ? 'sel' : ''}">${t}</button>`).join('')}</div>
        <form class="cat-form comp-form" id="comp-form">
          <input class="input" name="nombre" maxlength="100" aria-label="Nombre del componente" placeholder="${esc(TIPOS_COMP[compTipo].ph)}">
          <button class="btn primario" type="submit">${icono('mas', 'sm')} Agregar</button>
        </form>
      </div>
      <p class="ayuda" style="margin:0 0 10px">También se agregan solos al escribirlos en las especificaciones de una PC.</p>
      <div class="tabla-wrap" id="comp-tabla"><div class="vacio-msg">Cargando…</div></div>
    </section>
    <section class="panel ancho" id="cat-perfiles">
      <div class="panel-head"><h3>${icono('capas')} Perfiles de software</h3>
        <button class="btn sm primario" id="btn-nuevo-perfil">${icono('mas', 'sm')} Nuevo perfil</button></div>
      <div class="perfiles-lista"><div class="vacio-msg">Cargando…</div></div>
    </section>`;
  await Promise.all(['so', 'software'].map(cargar));
  montarFormularios();
  const rc = await api('ctrl/php/componentesApi.php?accion=listar');
  S.componentes = rc.items;
  pintarComp();
  const r = await api('ctrl/php/perfilesApi.php?accion=listar');
  S.perfiles = r.perfiles;
  pintarPerfiles();
}

function pintarPerfiles(nuevoId = null) {
  const caja = document.querySelector('#cat-perfiles .perfiles-lista');
  if (!caja) return;
  caja.innerHTML = S.perfiles.length ? S.perfiles.map((p) => `
    <article class="perfil-card ${p.id === nuevoId ? 'fila-nueva' : ''}" data-perfil="${p.id}">
      <div class="perfil-top"><b>${esc(p.nombre)}</b><span class="badge">${p.software.length} programas</span>
        <span class="espacio"></span>
        <button class="btn sm icon fantasma" data-editar-perfil title="Editar">${icono('editar', 'sm')}</button>
        <button class="btn sm icon fantasma peligro" data-borrar-perfil title="Eliminar">${icono('basura', 'sm')}</button></div>
      <div class="chips">${p.software.map((id) => S.software.find((x) => x.id === id)).filter(Boolean).map((x) => `<span class="chip" aria-disabled="true">${esc(x.nombre)}</span>`).join('')}</div>
    </article>`).join('')
    : '<div class="vacio-msg">Aún no hay perfiles. Crea uno con los programas que instalas siempre juntos.</div>';
}

function formPerfil(p) {
  const sel = new Set(p?.software || []);
  const cuerpo = el(`<div style="display:contents">
    <div class="campo"><label for="pf-nombre">Nombre del perfil</label><input class="input" id="pf-nombre" maxlength="80" value="${esc(p?.nombre || '')}" placeholder="Ej. Imagen Desarrollo 2026"></div>
    <div class="campo"><span class="etiqueta">Programas <small id="pf-n" style="font-weight:500;color:var(--texto-3)"></small></span>
      <div class="sw-caja" id="pf-sw"></div></div>
  </div>`);
  const pintar = () => {
    const lista = S.software.filter((x) => x.activo || sel.has(x.id));
    const cats = [...new Set(lista.map((x) => x.categoria))];
    cuerpo.querySelector('#pf-sw').innerHTML = cats.map((c) => `<div class="sw-cat">${esc(c)}</div><div class="chips">${lista.filter((x) => x.categoria === c)
      .map((x) => `<button type="button" class="chip ${sel.has(x.id) ? 'on' : ''}" data-id="${x.id}">${esc(x.nombre)}${sel.has(x.id) ? icono('check', 'sm') : ''}</button>`).join('')}</div>`).join('');
    cuerpo.querySelector('#pf-n').textContent = `· ${sel.size} marcados`;
  };
  pintar();
  cuerpo.querySelector('#pf-sw').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    const id = Number(b.dataset.id);
    sel.has(id) ? sel.delete(id) : sel.add(id);
    pintar();
  });
  const pie = el(`<div style="display:contents"><span class="espacio"></span><button class="btn" data-c>Cancelar</button><button class="btn primario" data-ok>Guardar perfil</button></div>`);
  const m = abrirModal({ titulo: p ? 'Editar perfil' : 'Nuevo perfil de software', subtitulo: 'Un conjunto de programas que se aplica de un clic', cuerpo, pie, ancho: 620 });
  pie.querySelector('[data-c]').onclick = () => m.cerrar();
  const ok = pie.querySelector('[data-ok]');
  ok.onclick = () => conCarga(ok, async () => {
    try {
      const antes = new Set(S.perfiles.map((x) => x.id));
      const r = await api('ctrl/php/perfilesApi.php?accion=guardar', { body: { id: p?.id, nombre: cuerpo.querySelector('#pf-nombre').value, software: [...sel] } });
      S.perfiles = r.perfiles;
      pintarPerfiles(S.perfiles.find((x) => !antes.has(x.id))?.id ?? p?.id);
      toast(r.mensaje);
      m.cerrar();
    } catch (err) { toast(err.message, 'error'); agitar(m.modal); }
  });
}

function panel(tipo) {
  const c = CONF[tipo];
  return `<section class="panel" id="cat-${tipo}">
    <div class="panel-head"><h3>${icono(tipo === 'so' ? 'windows' : 'software')} ${c.titulo}</h3><span class="badge" data-total>…</span></div>
    <form class="cat-form" data-tipo="${tipo}">
      ${tipo === 'so'
        ? '<div class="cf-fam" data-cb="so-fam"></div><div class="cf-dist" data-cb="so-dist"></div><input class="input cf-ver" name="version" maxlength="40" placeholder="Versión (opcional)" aria-label="Versión">'
        : '<div class="cf-prog" data-cb="sw-prog"></div><input class="input cf-ver" name="version" maxlength="40" placeholder="Versión (opcional)" aria-label="Versión"><div class="cf-cat" data-cb="sw-cat"></div>'}
      <button class="btn primario" type="submit">${icono('mas', 'sm')} Agregar</button>
    </form>
    <div class="tabla-wrap"><div class="vacio-msg">Cargando…</div></div>
  </section>`;
}

function alternarDistro(sel) {
  const dist = sel.parentElement.querySelector('[name=distribucion]');
  const con = sel.value === 'linux' || sel.value === 'otro';
  dist.placeholder = sel.value === 'otro' ? 'Nombre del sistema' : 'Distribución, ej. Fedora';
  if (con && dist.hidden) { dist.hidden = false; dist.animate([{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 220 }); }
  if (!con) dist.hidden = true;
}

/** Campos de un sistema operativo: familia, distribución (Linux/otro) y versión opcional. */
function camposSO(it = null) {
  const f = it?.familia || 'windows';
  const conDistro = f === 'linux' || f === 'otro';
  return `<select class="select" name="familia" aria-label="Familia" style="width:130px;flex:none">${Object.entries(FAMILIAS).map(([k, v]) => `<option value="${k}" ${k === f ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <input class="input campo-distro" name="distribucion" maxlength="60" placeholder="${f === 'otro' ? 'Nombre del sistema' : 'Distribución, ej. Fedora'}" value="${esc(it?.distribucion || '')}" ${conDistro ? '' : 'hidden'} aria-label="Distribución">
    <input class="input" name="version" maxlength="40" placeholder="Versión (opcional)" value="${esc(it?.version || '')}" aria-label="Versión" style="width:170px;flex:none">`;
}

/* ---------- Formularios de alta con las mismas listas con búsqueda que la ficha ---------- */

const programasUnicos = () => [...new Map(S.software.map((s) => [s.programa.toLowerCase(), s])).values()]
  .sort((a, b) => a.programa.localeCompare(b.programa, 'es', { numeric: true }));
const categorias = (extra = []) => [...new Set(S.software.map((s) => s.categoria).concat('General', extra))]
  .sort((a, b) => a.localeCompare(b, 'es')).map((x) => ({ valor: x, texto: x }));

function montarFormularios() {
  // Sistemas operativos: familia → distribución (Linux / otro)
  const nuevasDist = [];
  const distros = (f) => [...new Set(S.so.filter((x) => x.familia === f && x.distribucion).map((x) => x.distribucion).concat(nuevasDist))]
    .sort((a, b) => a.localeCompare(b, 'es')).map((x) => ({ valor: x, texto: x }));
  const contDist = cont.querySelector('[data-cb="so-dist"]');
  const montarDist = (f, animar) => {
    contDist.innerHTML = '';
    forms.soDist = null;
    if (f !== 'linux' && f !== 'otro') { contDist.hidden = true; return; }
    contDist.hidden = false;
    forms.soDist = combobox({ placeholder: f === 'linux' ? 'Distribución…' : 'Nombre del sistema…', opciones: () => distros(f), animar,
      otro: { texto: f === 'linux' ? 'Otra distribución…' : 'Otro sistema…', placeholder: 'Ej. Fedora', alAgregar: async (t) => { nuevasDist.push(t); return t; } } });
    contDist.append(forms.soDist.el);
  };
  forms.soFam = combobox({ valor: 'windows', placeholder: 'Familia…', clase: 'cbx-fam',
    opciones: () => Object.entries(FAMILIAS).map(([k, t]) => ({ valor: k, texto: t, icono: k })),
    alElegir: (f) => montarDist(f, true) });
  cont.querySelector('[data-cb="so-fam"]').append(forms.soFam.el);
  montarDist('windows');

  // Software: programa (existente o nuevo) → categoría automática
  const nuevosProg = [];
  const nuevasCat = [];
  forms.swCat = combobox({ valor: 'General', placeholder: 'Categoría…', opciones: () => categorias(nuevasCat),
    otro: { texto: 'Otra categoría…', placeholder: 'Ej. Diseño', alAgregar: async (t) => { nuevasCat.push(t); return t; } } });
  forms.swProg = combobox({ placeholder: 'Programa…',
    opciones: () => programasUnicos().map((x) => ({ valor: x.programa, texto: x.programa, sub: x.categoria }))
      .concat(nuevosProg.map((x) => ({ valor: x, texto: x, sub: 'nuevo' }))),
    otro: { texto: 'Otro programa…', placeholder: CONF.software.ph, alAgregar: async (t) => {
      const existe = programasUnicos().find((x) => x.programa.toLowerCase() === t.toLowerCase());
      if (existe) return existe.programa;
      nuevosProg.push(t); return t;
    } },
    alElegir: (v) => {
      const ex = S.software.find((x) => x.programa === v);
      if (ex) forms.swCat.set(ex.categoria);
      cont.querySelector('#cat-software [name=version]').focus();
    } });
  cont.querySelector('[data-cb="sw-prog"]').append(forms.swProg.el);
  cont.querySelector('[data-cb="sw-cat"]').append(forms.swCat.el);
}

/* ---------- Componentes ---------- */

function pintarComp(nuevoId = null) {
  const sec = document.getElementById('cat-comp');
  if (!sec) return;
  sec.querySelector('[data-total]').textContent = `${S.componentes.filter((x) => x.activo).length} activos`;
  const items = S.componentes.filter((x) => x.tipo === compTipo);
  sec.querySelector('#comp-tabla').innerHTML = items.length ? `
    <table class="tabla">
      <thead><tr><th>${esc(TIPOS_COMP[compTipo].titulo)}</th><th>Equipos</th><th>Activo</th><th></th></tr></thead>
      <tbody>${items.map((it) => `
        <tr class="${it.activo ? '' : 'inactivo'} ${it.id === nuevoId ? 'fila-nueva' : ''}" data-comp="${it.id}">
          <td><b>${esc(it.nombre)}</b></td><td>${it.usos}</td>
          <td><label class="switch"><input type="checkbox" data-comp-activo ${it.activo ? 'checked' : ''}><span class="pista"></span></label></td>
          <td class="acciones">
            <button class="btn sm icon fantasma" data-comp-editar title="Renombrar">${icono('editar', 'sm')}</button>
            <button class="btn sm icon fantasma peligro" data-comp-borrar title="${it.usos ? 'En uso: desactívalo en lugar de eliminarlo' : 'Eliminar'}" ${it.usos ? 'disabled' : ''}>${icono('basura', 'sm')}</button>
          </td></tr>`).join('')}</tbody>
    </table>` : `<div class="vacio-msg">Sin ${COMP_PLURAL[compTipo].toLowerCase()} todavía.</div>`;
}

async function guardarComp(it, cambios) {
  const r = await api('ctrl/php/componentesApi.php?accion=guardar', { body: { id: it.id, nombre: it.nombre, activo: it.activo, ...cambios } });
  S.componentes = r.items;
  pintarComp();
  return r;
}

async function cargar(tipo) {
  const r = await api(`ctrl/php/catalogosApi.php?tipo=${tipo}&accion=listar`);
  if (tipo === 'so') S.so = r.items; else S.software = r.items;
  pintar(tipo);
}

function pintar(tipo, nuevoId = null) {
  const c = CONF[tipo];
  const items = tipo === 'so' ? S.so : S.software;
  const sec = document.getElementById(`cat-${tipo}`);
  sec.querySelector('[data-total]').textContent = `${items.filter((x) => x.activo).length} activos`;
  let grupo = null;
  const cabGrupo = (it) => {
    const g = tipo === 'so' ? it.familia : it.categoria;
    if (g === grupo) return '';
    grupo = g;
    return `<tr class="fila-grupo"><td colspan="4">${tipo === 'so' ? `${icono(g, 'sm')} ${FAMILIAS[g]}` : esc(g)}</td></tr>`;
  };
  // Software: el nombre del programa se escribe una vez y sus versiones quedan debajo
  let progAnt = null;
  const nombreFila = (it) => {
    if (tipo === 'so') return `<b>${esc(it.nombre)}</b>`;
    const mismo = progAnt === it.programa.toLowerCase();
    progAnt = it.programa.toLowerCase();
    return `${mismo ? '<span class="sw-sangria"></span>' : `<b>${esc(it.programa)}</b> `}${it.version ? `<span class="ver-badge">${esc(it.version)}</span>` : ''}`;
  };
  sec.querySelector('.tabla-wrap').innerHTML = items.length ? `
    <table class="tabla">
      <thead><tr><th>Nombre</th><th>Equipos</th><th>Activo</th><th></th></tr></thead>
      <tbody>${items.map((it) => `${cabGrupo(it)}
        <tr class="${it.activo ? '' : 'inactivo'} ${it.id === nuevoId ? 'fila-nueva' : ''}" data-id="${it.id}">
          <td>${nombreFila(it)}</td>
          <td>${it.usos}</td>
          <td><label class="switch" title="${it.activo ? 'Desactivar: deja de aparecer para asignar' : 'Activar'}"><input type="checkbox" data-activo ${it.activo ? 'checked' : ''}><span class="pista"></span></label></td>
          <td class="acciones">
            <button class="btn sm icon fantasma" data-editar title="Editar">${icono('editar', 'sm')}</button>
            <button class="btn sm icon fantasma peligro" data-borrar title="${it.usos ? 'En uso: desactívalo en lugar de eliminarlo' : 'Eliminar'}" ${it.usos ? 'disabled' : ''}>${icono('basura', 'sm')}</button>
          </td>
        </tr>`).join('')}</tbody>
    </table>` : '<div class="vacio-msg">Sin elementos todavía.</div>';
}

async function guardar(tipo, datos) {
  const body = tipo === 'so'
    ? { id: datos.id, familia: datos.familia, distribucion: datos.distribucion || '', version: datos.version || '', activo: datos.activo }
    : { id: datos.id, programa: datos.programa, version: datos.version || '', categoria: datos.categoria || '', activo: datos.activo };
  const r = await api(`ctrl/php/catalogosApi.php?tipo=${tipo}&accion=guardar`, { body });
  if (tipo === 'so') S.so = r.items; else S.software = r.items;
  pintar(tipo, r.item?.id);
  return r;
}

cont.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button[type=submit]');
  if (f.id === 'comp-form') {
    conCarga(btn, async () => {
      try {
        const nombre = f.nombre.value.trim();
        if (!nombre) { f.nombre.focus(); return; }
        const r = await api('ctrl/php/componentesApi.php?accion=asegurar', { body: { tipo: compTipo, nombre } });
        S.componentes = r.items;
        pintarComp(r.item?.id);
        toast(`"${r.item.nombre}" guardado.`);
        f.nombre.value = ''; f.nombre.focus();
      } catch (err) { toast(err.message, 'error'); }
    });
    return;
  }
  const tipo = f.dataset.tipo;
  conCarga(btn, async () => {
    try {
      if (tipo === 'so') {
        const r = await guardar('so', { familia: forms.soFam.valor, distribucion: forms.soDist?.valor || '', version: f.version.value, activo: true });
        toast(r.mensaje);
        f.version.value = ''; f.version.focus();
      } else {
        if (!forms.swProg.valor) { toast('Elige o escribe el programa.', 'aviso'); forms.swProg.foco(true); return; }
        const r = await guardar('software', { programa: forms.swProg.valor, version: f.version.value, categoria: forms.swCat.valor, activo: true });
        toast(r.mensaje);
        f.version.value = ''; f.version.focus();
      }
    } catch (err) { toast(err.message, 'error'); }
  });
});

cont.addEventListener('change', async (e) => {
  if (e.target.matches('[data-comp-activo]')) {
    const it = S.componentes.find((x) => x.id === Number(e.target.closest('tr').dataset.comp));
    try { await guardarComp(it, { activo: e.target.checked }); toast(e.target.checked ? `"${it.nombre}" activado.` : `"${it.nombre}" desactivado.`); }
    catch (err) { toast(err.message, 'error'); e.target.checked = !e.target.checked; }
    return;
  }
  if (!e.target.matches('[data-activo]')) return;
  const tr = e.target.closest('tr');
  const sec = e.target.closest('section');
  const tipo = sec.id.replace('cat-', '');
  const it = (tipo === 'so' ? S.so : S.software).find((x) => x.id === Number(tr.dataset.id));
  try {
    await guardar(tipo, { ...it, extra: it[CONF[tipo].extra], activo: e.target.checked });
    toast(e.target.checked ? `"${it.nombre}" activado.` : `"${it.nombre}" desactivado. Ya no aparecerá para asignar.`);
  } catch (err) { toast(err.message, 'error'); e.target.checked = !e.target.checked; }
});

cont.addEventListener('click', async (e) => {
  if (e.target.closest('#btn-nuevo-perfil')) { formPerfil(null); return; }
  const tab = e.target.closest('#comp-tabs [data-t]');
  if (tab) {
    compTipo = tab.dataset.t;
    cont.querySelectorAll('#comp-tabs button').forEach((x) => x.classList.toggle('sel', x === tab));
    cont.querySelector('#comp-form [name=nombre]').placeholder = TIPOS_COMP[compTipo].ph;
    pintarComp();
    return;
  }
  const filaComp = e.target.closest('[data-comp]');
  if (filaComp) {
    const it = S.componentes.find((x) => x.id === Number(filaComp.dataset.comp));
    if (e.target.closest('[data-comp-borrar]')) {
      if (!await confirmar({ titulo: 'Eliminar componente', mensaje: `¿Eliminar <b>${esc(it.nombre)}</b> del catálogo?`, aceptar: 'Eliminar', peligro: true })) return;
      try {
        const r = await api('ctrl/php/componentesApi.php?accion=eliminar', { body: { id: it.id } });
        S.componentes = r.items; pintarComp(); toast(r.mensaje);
      } catch (err) { toast(err.message, 'error'); }
    }
    if (e.target.closest('[data-comp-editar]')) {
      const cuerpo = el(`<form style="display:contents"><div class="campo"><label for="cmp-n">${esc(TIPOS_COMP[it.tipo].titulo)}</label>
        <input class="input" id="cmp-n" maxlength="100" value="${esc(it.nombre)}"></div>
        ${it.usos ? `<p class="ayuda" style="margin:0">Está en ${it.usos} equipo${it.usos === 1 ? '' : 's'}; el cambio se verá en todos.</p>` : ''}</form>`);
      const pie = el(`<div style="display:contents"><span class="espacio"></span><button class="btn" data-c>Cancelar</button><button class="btn primario" data-ok>Guardar</button></div>`);
      const m = abrirModal({ titulo: 'Renombrar componente', cuerpo, pie, ancho: 440 });
      pie.querySelector('[data-c]').onclick = () => m.cerrar();
      const ok = pie.querySelector('[data-ok]');
      const enviar = () => conCarga(ok, async () => {
        try { const r = await guardarComp(it, { nombre: cuerpo.querySelector('#cmp-n').value }); toast(r.mensaje); m.cerrar(); }
        catch (err) { toast(err.message, 'error'); agitar(m.modal); }
      });
      ok.onclick = enviar;
      cuerpo.addEventListener('submit', (ev) => { ev.preventDefault(); enviar(); });
    }
    return;
  }
  const tarjeta = e.target.closest('.perfil-card');
  if (tarjeta) {
    const p = S.perfiles.find((x) => x.id === Number(tarjeta.dataset.perfil));
    if (e.target.closest('[data-editar-perfil]')) formPerfil(p);
    if (e.target.closest('[data-borrar-perfil]')) {
      if (!await confirmar({ titulo: 'Eliminar perfil', mensaje: `¿Eliminar el perfil <b>${esc(p.nombre)}</b>? Los programas instalados en las PCs no se modifican.`, aceptar: 'Eliminar', peligro: true })) return;
      try {
        const r = await api('ctrl/php/perfilesApi.php?accion=eliminar', { body: { id: p.id } });
        S.perfiles = r.perfiles; pintarPerfiles(); toast(r.mensaje);
      } catch (err) { toast(err.message, 'error'); }
    }
    return;
  }
  const b = e.target.closest('[data-editar], [data-borrar]');
  if (!b) return;
  const tr = b.closest('tr');
  const tipo = b.closest('section').id.replace('cat-', '');
  const c = CONF[tipo];
  const it = (tipo === 'so' ? S.so : S.software).find((x) => x.id === Number(tr.dataset.id));

  if (b.dataset.borrar !== undefined) {
    if (!await confirmar({ titulo: `Eliminar ${c.singular}`, mensaje: `¿Eliminar <b>${esc(it.nombre)}</b> del catálogo?`, aceptar: 'Eliminar', peligro: true })) return;
    try {
      const r = await api(`ctrl/php/catalogosApi.php?tipo=${tipo}&accion=eliminar`, { body: { id: it.id } });
      if (tipo === 'so') S.so = r.items; else S.software = r.items;
      pintar(tipo);
      toast(r.mensaje);
    } catch (err) { toast(err.message, 'error'); }
    return;
  }

  const cuerpo = el(`<form style="display:contents">
      ${tipo === 'so' ? `<div class="campo"><span class="etiqueta">Familia, distribución y versión</span><div class="fila-flex">${camposSO(it)}</div>
        <span class="ayuda">El nombre se arma solo, ej. "Ubuntu 24.04" o "macOS Sequoia".</span></div>` : `
      <div class="form-fila">
        <div class="campo"><label>Programa</label><input class="input" name="programa" value="${esc(it.programa)}" maxlength="80"></div>
        <div class="campo" style="max-width:150px"><label>Versión</label><input class="input" name="version" value="${esc(it.version || '')}" maxlength="40" placeholder="Opcional"></div>
      </div>
      <div class="campo"><span class="etiqueta">${c.extraTxt} <small class="ayuda">(se aplica a todas las versiones)</small></span><div data-cb="ed-cat"></div></div>`}
      ${it.usos ? `<p class="ayuda" style="margin:0">Está asignado a ${it.usos} equipo${it.usos === 1 ? '' : 's'}; el cambio de nombre se verá en todos.</p>` : ''}
    </form>`);
  cuerpo.addEventListener('change', (ev) => { if (ev.target.name === 'familia') alternarDistro(ev.target); });
  let edCat = null;
  if (tipo === 'software') {
    const extraCat = [];
    edCat = combobox({ valor: it.categoria, placeholder: 'Categoría…', opciones: () => categorias(extraCat),
      otro: { texto: 'Otra categoría…', placeholder: 'Ej. Diseño', alAgregar: async (t) => { extraCat.push(t); return t; } } });
    cuerpo.querySelector('[data-cb="ed-cat"]').append(edCat.el);
  }
  const pie = el(`<div style="display:contents"><span class="espacio"></span><button class="btn" data-c>Cancelar</button><button class="btn primario" data-ok>Guardar</button></div>`);
  const m = abrirModal({ titulo: `Editar ${c.singular}`, cuerpo, pie, ancho: 460 });
  pie.querySelector('[data-c]').onclick = () => m.cerrar();
  const ok = pie.querySelector('[data-ok]');
  const enviar = () => conCarga(ok, async () => {
    try {
      const q = (n) => cuerpo.querySelector(`[name=${n}]`)?.value;
      const r = tipo === 'so'
        ? await guardar('so', { id: it.id, familia: q('familia'), distribucion: q('distribucion'), version: q('version'), activo: it.activo })
        : await guardar(tipo, { id: it.id, programa: q('programa'), version: q('version'), categoria: edCat.valor, activo: it.activo });
      toast(r.mensaje);
      m.cerrar();
    } catch (err) { toast(err.message, 'error'); agitar(m.modal); }
  });
  ok.onclick = enviar;
  cuerpo.addEventListener('submit', (ev) => { ev.preventDefault(); enviar(); });
});
