// view/js/usuarios.js — Alta, edición, restablecimiento de contraseña y baja de usuarios.

import { api } from './api.js';
import { icono } from './iconos.js';
import { esc, el, toast, abrirModal, confirmar, conCarga, agitar } from './ui.js';
import { S } from './estado.js';

const cont = document.getElementById('tabla-usuarios');
let lista = [];
let listo = false;

export async function mostrarUsuarios() {
  if (!listo) {
    document.getElementById('btn-nuevo-usuario').addEventListener('click', () => formulario(null));
    listo = true;
  }
  const r = await api('ctrl/php/usuariosApi.php?accion=listar');
  lista = r.usuarios;
  pintar();
}

const fecha = (f) => {
  if (!f) return '<span class="ayuda">Nunca</span>';
  const d = new Date(f.replace(' ', 'T'));
  return d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

function pintar(nuevoId = null) {
  cont.innerHTML = `<table class="tabla">
    <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead>
    <tbody>${lista.map((u) => `
      <tr class="${u.activo ? '' : 'inactivo'} ${u.id === nuevoId ? 'fila-nueva' : ''}" data-id="${u.id}">
        <td><div class="fila-flex" style="flex-wrap:nowrap"><span class="avatar">${esc(u.nombre.charAt(0).toUpperCase())}</span><b>${esc(u.nombre)}</b>${u.id === S.usuario.id ? '<span class="badge">Tú</span>' : ''}</div></td>
        <td style="font-family:var(--mono)">${esc(u.usuario)}</td>
        <td><span class="badge ${u.rol === 'admin' ? 'admin' : ''}">${u.rol === 'admin' ? 'Administrador' : 'Visualización'}</span></td>
        <td>${u.activo ? '<span class="badge" style="color:var(--verde)">Activo</span>' : '<span class="badge">Inactivo</span>'}
            ${u.debe_cambiar ? `<span class="badge" title="Debe cambiar su contraseña al entrar">${icono('llave', 'sm')}</span>` : ''}</td>
        <td>${fecha(u.ultimo_acceso)}</td>
        <td class="acciones">
          <button class="btn sm icon fantasma" data-a="editar" title="Editar">${icono('editar', 'sm')}</button>
          ${u.id !== S.usuario.id ? `
          <button class="btn sm icon fantasma" data-a="pass" title="Restablecer contraseña">${icono('llave', 'sm')}</button>
          <button class="btn sm icon fantasma peligro" data-a="borrar" title="Eliminar">${icono('basura', 'sm')}</button>` : ''}
        </td>
      </tr>`).join('')}</tbody></table>`;
}

cont.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const u = lista.find((x) => x.id === Number(b.closest('tr').dataset.id));
  if (b.dataset.a === 'editar') formulario(u);
  if (b.dataset.a === 'pass') restablecer(u);
  if (b.dataset.a === 'borrar') {
    if (!await confirmar({ titulo: 'Eliminar usuario', mensaje: `¿Eliminar la cuenta de <b>${esc(u.nombre)}</b> (${esc(u.usuario)})? Si solo quieres impedir su acceso, mejor desactívala.`, aceptar: 'Eliminar', peligro: true })) return;
    try {
      const r = await api('ctrl/php/usuariosApi.php?accion=eliminar', { body: { id: u.id } });
      lista = r.usuarios; pintar(); toast(r.mensaje);
    } catch (err) { toast(err.message, 'error'); }
  }
});

function formulario(u) {
  const nuevo = !u;
  const cuerpo = el(`<form style="display:contents" autocomplete="off">
    <div class="campo"><label for="us-n">Nombre completo</label><input class="input" id="us-n" name="nombre" maxlength="120" value="${esc(u?.nombre || '')}"></div>
    <div class="grid-2">
      <div class="campo"><label for="us-u">Usuario</label><input class="input" id="us-u" name="usuario" maxlength="40" value="${esc(u?.usuario || '')}" style="font-family:var(--mono)" autocapitalize="off" spellcheck="false"></div>
      <div class="campo"><span class="etiqueta">Rol</span>
        <div class="segmentado" id="us-rol">
          <button type="button" data-v="admin">Administrador</button>
          <button type="button" data-v="visualizador">Visualización</button>
        </div></div>
    </div>
    ${nuevo ? `<div class="campo"><label for="us-p">Contraseña temporal</label><input class="input" id="us-p" name="password" type="text" autocomplete="new-password">
      <span class="ayuda">Mínimo 8 caracteres con letras y números. Se le pedirá cambiarla al entrar.</span></div>` : ''}
    <label class="switch"><input type="checkbox" name="activo" ${!u || u.activo ? 'checked' : ''}><span class="pista"></span>Cuenta activa</label>
    <p class="ayuda" id="us-desc" style="margin:0"></p>
  </form>`);
  let rol = u?.rol || 'visualizador';
  const pintarRol = () => {
    cuerpo.querySelectorAll('#us-rol button').forEach((b) => b.classList.toggle('sel', b.dataset.v === rol));
    cuerpo.querySelector('#us-desc').textContent = rol === 'admin'
      ? 'Puede editar equipos, el mapa, los catálogos, los usuarios y los respaldos.'
      : 'Puede consultar el mapa, buscar, filtrar y generar reportes, pero no modificar nada.';
  };
  cuerpo.querySelector('#us-rol').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { rol = b.dataset.v; pintarRol(); } });
  pintarRol();

  const pie = el(`<div style="display:contents"><span class="espacio"></span><button class="btn" data-c>Cancelar</button>
      <button class="btn primario" data-ok>${nuevo ? 'Crear usuario' : 'Guardar'}</button></div>`);
  const m = abrirModal({ titulo: nuevo ? 'Nuevo usuario' : 'Editar usuario', cuerpo, pie, ancho: 520 });
  pie.querySelector('[data-c]').onclick = () => m.cerrar();
  const ok = pie.querySelector('[data-ok]');
  const enviar = () => conCarga(ok, async () => {
    const f = cuerpo;
    const body = { id: u?.id, nombre: f.nombre.value, usuario: f.usuario.value, rol, activo: f.activo.checked };
    if (nuevo) body.password = f.password.value;
    try {
      const r = await api('ctrl/php/usuariosApi.php?accion=guardar', { body });
      const antes = new Set(lista.map((x) => x.id));
      lista = r.usuarios;
      pintar(lista.find((x) => !antes.has(x.id))?.id ?? u?.id);
      toast(r.mensaje);
      m.cerrar();
    } catch (err) { toast(err.message, 'error'); agitar(m.modal); }
  });
  ok.onclick = enviar;
  cuerpo.addEventListener('submit', (e) => { e.preventDefault(); enviar(); });
}

function restablecer(u) {
  const cuerpo = el(`<div style="display:contents">
    <p style="margin:0;color:var(--texto-2)">Asigna una contraseña temporal a <b>${esc(u.nombre)}</b>. Se le pedirá cambiarla al iniciar sesión.</p>
    <div class="campo"><label for="rs-p">Contraseña temporal</label><input class="input" id="rs-p" type="text" autocomplete="new-password"></div>
  </div>`);
  const pie = el(`<div style="display:contents"><span class="espacio"></span><button class="btn" data-c>Cancelar</button><button class="btn primario" data-ok>Restablecer</button></div>`);
  const m = abrirModal({ titulo: 'Restablecer contraseña', cuerpo, pie, ancho: 440 });
  pie.querySelector('[data-c]').onclick = () => m.cerrar();
  const ok = pie.querySelector('[data-ok]');
  ok.onclick = () => conCarga(ok, async () => {
    try {
      const r = await api('ctrl/php/usuariosApi.php?accion=restablecer', { body: { id: u.id, password: cuerpo.querySelector('#rs-p').value } });
      toast(r.mensaje);
      m.cerrar();
      mostrarUsuarios();
    } catch (err) { toast(err.message, 'error'); agitar(m.modal); }
  });
}
