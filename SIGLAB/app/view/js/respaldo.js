// view/js/respaldo.js — Descargar y restaurar respaldos de la base de datos.

import { api, getCsrf } from './api.js';
import { icono } from './iconos.js';
import { esc, toast, confirmar, conCarga } from './ui.js';

const cont = document.getElementById('respaldo');
let listo = false;
let archivo = null;

export function mostrarRespaldo() {
  if (listo) return;
  listo = true;
  cont.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h3>${icono('descargar')} Descargar respaldo</h3></div>
      <div class="panel-body">
        <p style="margin:0;color:var(--texto-2)">Genera un archivo <b>.sql</b> con toda la información: laboratorios, mapa, equipos, catálogos y usuarios.</p>
        <p class="ayuda" style="margin:0">Recomendación: descarga un respaldo al terminar cada sesión de inventario y guárdalo fuera de la computadora del servidor.</p>
        <form method="post" action="ctrl/php/respaldoApi.php?accion=descargar" id="form-descarga">
          <input type="hidden" name="csrf">
          <button class="btn primario" type="submit">${icono('descargar', 'sm')} Descargar respaldo</button>
        </form>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h3>${icono('subir')} Restaurar respaldo</h3></div>
      <div class="panel-body">
        <div class="alerta-box">${icono('alerta')}<span>Restaurar <b>reemplaza toda la información actual</b>. Antes de hacerlo, SIGLAB guarda automáticamente una copia de emergencia en la carpeta <code>backups/</code> del servidor.</span></div>
        <label class="zona-archivo" id="zona">
          ${icono('baseDatos')}
          <span id="zona-txt"><b>Arrastra aquí el archivo .sql</b><br>o haz clic para elegirlo</span>
          <input type="file" accept=".sql" hidden id="in-archivo">
        </label>
        <div class="campo">
          <label for="conf">Escribe <b>RESTAURAR</b> para confirmar</label>
          <input class="input" id="conf" autocomplete="off" spellcheck="false">
        </div>
        <button class="btn peligro-lleno" id="btn-restaurar" disabled>${icono('subir', 'sm')} Restaurar base de datos</button>
      </div>
    </section>`;

  const form = cont.querySelector('#form-descarga');
  form.addEventListener('submit', () => {
    form.csrf.value = getCsrf();
    toast('Generando respaldo… la descarga comenzará en un momento.', 'info');
  });

  const zona = cont.querySelector('#zona');
  const input = cont.querySelector('#in-archivo');
  const conf = cont.querySelector('#conf');
  const btn = cont.querySelector('#btn-restaurar');
  const validar = () => { btn.disabled = !(archivo && conf.value.trim() === 'RESTAURAR'); };
  const elegir = (f) => {
    if (!f) return;
    if (!/\.sql$/i.test(f.name)) { toast('El archivo debe ser .sql', 'error'); return; }
    archivo = f;
    cont.querySelector('#zona-txt').innerHTML = `<b>${esc(f.name)}</b><br>${(f.size / 1024).toFixed(1)} KB · clic para cambiar`;
    validar();
  };
  input.addEventListener('change', () => elegir(input.files[0]));
  ['dragenter', 'dragover'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.remove('sobre'); }));
  zona.addEventListener('drop', (e) => elegir(e.dataTransfer.files[0]));
  conf.addEventListener('input', validar);

  btn.addEventListener('click', async () => {
    if (!await confirmar({ titulo: 'Restaurar base de datos', mensaje: `Se reemplazará toda la información con <b>${esc(archivo.name)}</b>. ¿Continuar?`, aceptar: 'Sí, restaurar', peligro: true })) return;
    conCarga(btn, async () => {
      const fd = new FormData();
      fd.append('archivo', archivo);
      fd.append('confirmacion', conf.value.trim());
      try {
        const r = await api('ctrl/php/respaldoApi.php?accion=restaurar', { body: fd });
        toast(r.mensaje, 'ok', { duracion: 7000 });
        toast('Recargando para mostrar los datos restaurados…', 'info');
        setTimeout(() => location.reload(), 2200);
      } catch (err) { toast(err.message, 'error', { duracion: 8000 }); }
    });
  });
}
