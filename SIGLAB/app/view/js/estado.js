// view/js/estado.js — Estado global de la aplicación y funciones auxiliares de dominio.

export const ESTADOS = {
  verde: { nombre: 'Operativa', corto: 'Operativas', desc: 'Completa y funcionando' },
  ambar: { nombre: 'Detalle menor', corto: 'Detalle menor', desc: 'Mantenimiento o periférico faltante' },
  rojo: { nombre: 'Fuera de servicio', corto: 'Fuera de servicio', desc: 'Falla crítica' },
  azul: { nombre: 'En revisión', corto: 'En revisión', desc: 'En revisión o disponible para reasignar' },
};

export const PERIFERICOS = [
  { clave: 'monitor', nombre: 'Monitor', icono: 'monitor' },
  { clave: 'teclado', nombre: 'Teclado', icono: 'teclado' },
  { clave: 'mouse', nombre: 'Mouse', icono: 'mouse' },
  { clave: 'cpu', nombre: 'CPU / Gabinete', icono: 'cpu' },
];

export const PER_ESTADOS = { presente: 'Presente', faltante: 'Faltante', danado: 'Dañado' };
export const FAMILIAS = { windows: 'Windows', linux: 'Linux', macos: 'macOS', otro: 'Otro' };

export const S = {
  usuario: JSON.parse(document.getElementById('sesion')?.textContent || '{}'),
  labs: [],
  lugares: [],
  equipos: [],
  so: [],
  software: [],
  componentes: [],
  perfiles: [],
  labId: null,
  modelo: null, // equipo modelo para "copiar configuración"
  filtros: { estados: new Set(), soSel: '', software: new Set(), perif: '', texto: '' },
  seleccion: new Set(),
  modoSeleccion: false,
  modoEdicion: false,
};

export const esAdmin = () => S.usuario.rol === 'admin';

/** Misma regla que el servidor (InventarioModelo::estadoAuto). */
export function estadoAuto(e) {
  if (e.monitor !== 'presente' || e.cpu !== 'presente') return 'rojo';
  if (e.teclado !== 'presente' || e.mouse !== 'presente') return 'ambar';
  return 'verde';
}
export const estadoDe = (e) => e.estado_manual || estadoAuto(e);

export const soPorId = (id) => S.so.find((x) => x.id === id);
export const swPorId = (id) => S.software.find((x) => x.id === id);
export const compPorId = (id) => (id ? S.componentes.find((x) => x.id === id) : null);

/** "SSD 512 GB", "HDD 1 TB" */
export function textoDisco(d) {
  const gb = Number(d?.gb) || 0;
  const cap = gb >= 1000 && gb % 1000 === 0 ? `${gb / 1000} TB` : gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} TB` : `${gb} GB`;
  return `${d?.tipo || ''}${gb ? ` ${cap}` : ''}`.trim();
}

/** Resumen corto de las especificaciones: "i5-10500 · 16 GB · SSD 512 GB" */
export function resumenSpecs(e) {
  const cpu = compPorId(e.procesador_id)?.nombre;
  return [cpu ? cpu.replace(/^(Intel(®)?\s*(Core)?\s*|AMD\s*)/i, '') : '', e.ram_gb ? `${e.ram_gb} GB` : '', ...(e.discos || []).map(textoDisco)]
    .filter(Boolean).join(' · ');
}
export const labPorId = (id) => S.labs.find((l) => l.id === id);
export const lugarPorId = (id) => S.lugares.find((l) => l.id === id);
export const equipoPorId = (id) => S.equipos.find((e) => e.id === id);
export const equiposLab = (labId = S.labId) => S.equipos.filter((e) => e.laboratorio_id === labId);
export const lugaresLab = (labId = S.labId) => S.lugares.filter((l) => l.laboratorio_id === labId);

export function ubicacionTxt(e) {
  const l = e.lugar_id ? lugarPorId(e.lugar_id) : null;
  return l ? `Fila ${l.fila} · Lugar ${l.columna}` : 'Sin ubicar';
}

/** Reemplaza (o agrega) equipos en el estado local y recalcula su estado. */
export function actualizarEquipos(lista) {
  for (const nuevo of lista) {
    nuevo.estado = estadoDe(nuevo);
    const i = S.equipos.findIndex((e) => e.id === nuevo.id);
    if (i >= 0) S.equipos[i] = nuevo; else S.equipos.push(nuevo);
  }
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Texto buscable de un equipo: número, SO, software, estado, periféricos con problema, observaciones. */
export function textoBuscable(e) {
  const partes = [
    e.numero, e.tipo === 'mac' ? 'mac' : 'pc',
    ESTADOS[e.estado]?.nombre, e.motivo_manual, e.observaciones,
    labPorId(e.laboratorio_id)?.nombre, ubicacionTxt(e),
    ...e.so.map((id) => soPorId(id)?.nombre),
    ...e.so.map((id) => FAMILIAS[soPorId(id)?.familia]),
    ...e.software.map((id) => swPorId(id)?.nombre),
    compPorId(e.modelo_id)?.nombre, compPorId(e.procesador_id)?.nombre, compPorId(e.grafica_id)?.nombre,
    compPorId(e.motherboard_id)?.nombre, e.num_serie, e.ram_gb ? `${e.ram_gb} GB ${e.ram_gb}gb ram` : '',
    ...(e.discos || []).map(textoDisco),
  ];
  for (const p of PERIFERICOS) {
    if (e[p.clave] !== 'presente') partes.push(`${p.nombre} ${PER_ESTADOS[e[p.clave]]} sin ${p.nombre}`);
  }
  return norm(partes.filter(Boolean).join(' | '));
}

export function coincideTexto(e, q) {
  const t = textoBuscable(e);
  return norm(q).split(/\s+/).filter(Boolean).every((pal) => t.includes(pal));
}

/** ¿El equipo pasa todos los filtros activos? */
export function pasaFiltros(e) {
  const f = S.filtros;
  if (f.estados.size && !f.estados.has(e.estado)) return false;
  if (f.soSel) {
    if (f.soSel === 'sin') { if (e.so.length) return false; }
    else if (f.soSel.startsWith('f:')) { if (!e.so.some((id) => soPorId(id)?.familia === f.soSel.slice(2))) return false; }
    else if (!e.so.includes(Number(f.soSel.slice(3)))) return false;
  }
  if (f.software.size) {
    const progs = new Set(e.software.map((id) => swPorId(id)?.programa.toLowerCase()));
    if (![...f.software].every((k) => progs.has(k))) return false;
  }
  if (f.perif === 'faltante' && !PERIFERICOS.some((p) => e[p.clave] === 'faltante')) return false;
  if (f.perif === 'danado' && !PERIFERICOS.some((p) => e[p.clave] === 'danado')) return false;
  if (f.perif === 'completo' && PERIFERICOS.some((p) => e[p.clave] !== 'presente')) return false;
  if (f.texto && !coincideTexto(e, f.texto)) return false;
  return true;
}

export const hayFiltros = () => {
  const f = S.filtros;
  return f.estados.size || f.soSel || f.software.size || f.perif || f.texto;
};

export { norm };

/** ¿Sigue sin capturarse en el inventario? */
export const esPendienteInv = (e) => e.estado_manual === 'azul' && (e.motivo_manual || '').trim().toLowerCase() === 'pendiente de inventario';

/** Equipos de un laboratorio en orden físico (fila, lugar); los sin ubicar al final. */
export function equiposOrdenados(labId = S.labId) {
  const pos = (e) => { const l = e.lugar_id ? lugarPorId(e.lugar_id) : null; return l ? l.fila * 100 + l.columna : 99999; };
  return equiposLab(labId).sort((a, b) => pos(a) - pos(b) || a.numero.localeCompare(b.numero, 'es', { numeric: true }));
}

/** Días transcurridos desde una fecha 'YYYY-MM-DD HH:MM:SS'. */
export function diasDesde(fecha) {
  if (!fecha) return null;
  const d = new Date(String(fecha).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(d); dia.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoy - dia) / 86400000));
}

/** "hoy", "ayer", "hace 5 días", "hace 2 meses". */
export function haceTxt(fecha) {
  const n = diasDesde(fecha);
  if (n === null) return '';
  if (n === 0) return 'hoy';
  if (n === 1) return 'ayer';
  if (n < 31) return `hace ${n} días`;
  const m = Math.round(n / 30);
  return m < 12 ? `hace ${m} ${m === 1 ? 'mes' : 'meses'}` : `hace ${Math.round(m / 12)} año(s)`;
}

export const fechaCorta = (f) => {
  if (!f) return '';
  const d = new Date(String(f).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Cuerpo completo para guardar un equipo con cambios puntuales (atajos, recorrido). */
export function cuerpoEquipo(e, cambios = {}) {
  const x = { ...e, ...cambios };
  return {
    id: x.id, laboratorio_id: x.laboratorio_id, numero: x.numero, tipo: x.tipo,
    monitor: x.monitor, teclado: x.teclado, mouse: x.mouse, cpu: x.cpu,
    estado_manual: x.estado_manual || null, motivo_manual: x.estado_manual ? x.motivo_manual : null,
    observaciones: x.observaciones || '', so: [...x.so], software: [...x.software],
  };
}
