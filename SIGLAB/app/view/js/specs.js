// view/js/specs.js — Editor de especificaciones técnicas (modelo, serie, procesador, RAM, gráfica,
// motherboard y discos). Los componentes se eligen de listas con búsqueda y "Otro…"; los nuevos
// se dan de alta en el catálogo al guardar el equipo.

import { icono } from './iconos.js';
import { esc, el } from './ui.js';
import { S, compPorId, textoDisco } from './estado.js';
import { combobox } from './combobox.js';

export const TIPOS_COMP = {
  modelo: { titulo: 'Modelo del equipo', ph: 'Ej. Dell OptiPlex 7090', otro: 'Otro modelo…', col: 'modelo_id' },
  procesador: { titulo: 'Procesador', ph: 'Ej. Intel Core i5-10500', otro: 'Otro procesador…', col: 'procesador_id' },
  grafica: { titulo: 'Tarjeta gráfica', ph: 'Ej. NVIDIA GTX 1650', otro: 'Otra gráfica…', col: 'grafica_id' },
  motherboard: { titulo: 'Motherboard', ph: 'Ej. ASUS PRIME B460M-A', otro: 'Otra motherboard…', col: 'motherboard_id' },
};
const RAMS = [4, 8, 16, 32, 64];
const CAPACIDADES = [128, 240, 256, 480, 500, 512, 1000, 2000];
const TIPOS_DISCO = ['SSD', 'NVMe', 'HDD'];

/**
 * opc = { equipo?: objeto con *_id, ram_gb, discos, num_serie; admin; parcial?: bool (edición en lote); alCambiar?() }
 * Devuelve { el, obtener(): payload para el servidor, resumen(): texto }
 */
export function editorSpecs(opc) {
  const e = opc.equipo || {};
  const parcial = !!opc.parcial;
  const dis = opc.admin ? '' : 'disabled';
  const v = {
    modelo: compPorId(e.modelo_id)?.nombre || '',
    procesador: compPorId(e.procesador_id)?.nombre || '',
    grafica: compPorId(e.grafica_id)?.nombre || '',
    motherboard: compPorId(e.motherboard_id)?.nombre || '',
    ram_gb: e.ram_gb || 0,
    num_serie: e.num_serie || '',
    discos: (e.discos || []).map((x) => ({ ...x })),
  };
  const nuevos = { modelo: [], procesador: [], grafica: [], motherboard: [] };
  const cambiar = () => opc.alCambiar?.();

  const raiz = el(`<div class="specs">
      <div class="specs-grid">
        <div class="campo"><span class="etiqueta">Modelo del equipo</span><div data-c="modelo"></div></div>
        ${parcial ? '' : `<div class="campo"><label for="sp-serie">Número de serie</label><input class="input" id="sp-serie" maxlength="60" placeholder="Ej. 5CD1234XYZ" value="${esc(v.num_serie)}" ${dis}></div>`}
        <div class="campo"><span class="etiqueta">Procesador</span><div data-c="procesador"></div></div>
        <div class="campo"><span class="etiqueta">Memoria RAM</span>
          <div class="ram-chips" id="sp-ram">
            ${RAMS.map((g) => `<button type="button" class="ram-chip" data-g="${g}" ${dis}>${g} GB</button>`).join('')}
            <span class="ram-otra"><input class="input" type="number" min="1" max="4096" placeholder="Otra" aria-label="Otra cantidad de RAM en GB" ${dis}><small>GB</small></span>
          </div></div>
        <div class="campo"><span class="etiqueta">Tarjeta gráfica</span><div data-c="grafica"></div></div>
        <div class="campo"><span class="etiqueta">Motherboard</span><div data-c="motherboard"></div></div>
        <div class="campo specs-discos"><span class="etiqueta">Almacenamiento${parcial ? ' <small class="ayuda">(si agregas discos, reemplazan a los actuales)</small>' : ''}</span>
          <div class="discos-filas"></div>
          ${opc.admin ? `<button type="button" class="enlace" data-disco>${icono('mas', 'sm')} Agregar ${parcial ? 'disco' : 'otro disco'}</button>` : ''}
        </div>
      </div>
    </div>`);

  /* Componentes con búsqueda y "Otro…" */
  const cbs = {};
  for (const [tipo, cfg] of Object.entries(TIPOS_COMP)) {
    const opciones = () => {
      const lista = S.componentes.filter((c) => c.tipo === tipo && (c.activo || c.nombre === v[tipo])).map((c) => c.nombre)
        .concat(nuevos[tipo]);
      const ops = [...new Set(lista)].sort((a, b) => (a === 'Integrada' ? -1 : b === 'Integrada' ? 1 : a.localeCompare(b, 'es', { numeric: true })))
        .map((n) => ({ valor: n, texto: n }));
      return [{ valor: '', texto: parcial ? 'Sin cambio' : 'Sin especificar', tenue: true }, ...ops];
    };
    cbs[tipo] = combobox({
      placeholder: parcial ? 'Sin cambio' : cfg.ph, valor: v[tipo], opciones, deshabilitado: !opc.admin,
      otro: opc.admin ? { texto: cfg.otro, placeholder: cfg.ph, alAgregar: async (t) => {
        const existe = opciones().find((o) => o.texto.toLowerCase() === t.toLowerCase());
        if (existe) return existe.valor;
        nuevos[tipo].push(t);
        return t;
      } } : null,
      alElegir: (val) => { v[tipo] = val; cambiar(); },
    });
    raiz.querySelector(`[data-c="${tipo}"]`).append(cbs[tipo].el);
  }

  /* RAM */
  const ramBox = raiz.querySelector('#sp-ram');
  const ramOtra = ramBox.querySelector('input');
  const pintarRam = () => {
    ramBox.querySelectorAll('.ram-chip').forEach((b) => b.classList.toggle('sel', Number(b.dataset.g) === v.ram_gb));
    const otra = v.ram_gb && !RAMS.includes(v.ram_gb);
    ramOtra.value = otra ? v.ram_gb : '';
    ramOtra.parentElement.classList.toggle('sel', !!otra);
  };
  ramBox.addEventListener('click', (ev) => {
    const b = ev.target.closest('.ram-chip'); if (!b || b.disabled) return;
    const g = Number(b.dataset.g);
    v.ram_gb = v.ram_gb === g ? 0 : g;   // segundo clic la quita
    pintarRam(); cambiar();
  });
  ramOtra.addEventListener('input', () => { v.ram_gb = Math.max(0, Math.min(4096, parseInt(ramOtra.value, 10) || 0)); ramBox.querySelectorAll('.ram-chip').forEach((b) => b.classList.remove('sel')); ramOtra.parentElement.classList.toggle('sel', !!v.ram_gb); cambiar(); });
  pintarRam();

  /* Discos */
  const filasD = raiz.querySelector('.discos-filas');
  const capTxt = (gb) => textoDisco({ gb }).trim();
  function pintarDiscos(animar = -1) {
    filasD.innerHTML = '';
    if (!v.discos.length) {
      filasD.innerHTML = `<span class="ayuda">${parcial ? 'Sin cambio' : 'Sin discos registrados'}</span>`;
      return;
    }
    v.discos.forEach((dk, i) => {
      const fila = el(`<div class="disco-fila ${i === animar ? 'cbx-entra' : ''}">
          <div class="segmentado sm">${TIPOS_DISCO.map((t) => `<button type="button" data-t="${t}" class="${dk.tipo === t ? 'sel' : ''}" ${dis}>${t}</button>`).join('')}</div>
        </div>`);
      const cap = combobox({
        placeholder: 'Capacidad', valor: dk.gb || '', deshabilitado: !opc.admin,
        opciones: () => [...new Set([...CAPACIDADES, ...(dk.gb ? [dk.gb] : [])])].sort((a, b) => a - b).map((g) => ({ valor: g, texto: capTxt(g) })),
        otro: opc.admin ? { texto: 'Otra capacidad…', placeholder: 'En GB, ej. 750', alAgregar: async (t) => {
          const g = parseInt(String(t).replace(/[^\d]/g, ''), 10);
          if (!g) throw new Error('Escribe la capacidad en GB.');
          return /tb/i.test(t) ? g * 1000 : g;
        } } : null,
        alElegir: (g) => { dk.gb = Number(g) || 0; cambiar(); },
      });
      fila.append(cap.el);
      if (opc.admin) {
        const b = el(`<button type="button" class="btn sm icon fantasma" aria-label="Quitar disco">${icono('basura', 'sm')}</button>`);
        b.onclick = () => { v.discos.splice(i, 1); pintarDiscos(); cambiar(); };
        fila.append(b);
      }
      fila.querySelector('.segmentado').addEventListener('click', (ev) => {
        const t = ev.target.closest('button'); if (!t || t.disabled) return;
        dk.tipo = t.dataset.t;
        fila.querySelectorAll('.segmentado button').forEach((x) => x.classList.toggle('sel', x === t));
        cambiar();
      });
      filasD.append(fila);
    });
  }
  raiz.querySelector('[data-disco]')?.addEventListener('click', () => {
    v.discos.push({ tipo: 'SSD', gb: 0 });
    pintarDiscos(v.discos.length - 1);
    cambiar();
  });
  pintarDiscos();
  raiz.querySelector('#sp-serie')?.addEventListener('input', (ev) => { v.num_serie = ev.target.value; cambiar(); });

  return {
    el: raiz,
    /** Lo que se manda al servidor (componentes por nombre). En lote, solo lo que tiene valor. */
    obtener() {
      const discos = v.discos.filter((x) => x.gb > 0).map((x) => ({ tipo: x.tipo, gb: x.gb }));
      if (parcial) {
        const out = {};
        for (const t of Object.keys(TIPOS_COMP)) if (v[t]) out[t] = v[t];
        if (v.ram_gb) out.ram_gb = v.ram_gb;
        if (discos.length) out.discos = discos;
        return out;
      }
      return { modelo: v.modelo, procesador: v.procesador, grafica: v.grafica, motherboard: v.motherboard,
        ram_gb: v.ram_gb || 0, num_serie: v.num_serie.trim(), discos };
    },
    resumen() {
      const cpu = v.procesador.replace(/^(Intel(®)?\s*(Core)?\s*|AMD\s*)/i, '');
      return [cpu, v.ram_gb ? `${v.ram_gb} GB` : '', ...v.discos.filter((x) => x.gb).map(textoDisco)].filter(Boolean).join(' · ');
    },
    cuantos() {
      const o = this.obtener();
      return Object.keys(o).length;
    },
  };
}
