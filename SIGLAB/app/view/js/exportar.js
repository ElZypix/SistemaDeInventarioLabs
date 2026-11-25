// view/js/exportar.js — Exportación a Excel (.xlsx) generada en el navegador, sin librerías externas.

import { api } from './api.js';
import { toast } from './ui.js';
import {
  S, ESTADOS, PERIFERICOS, PER_ESTADOS, soPorId, swPorId, lugarPorId, equiposOrdenados, fechaCorta, compPorId, textoDisco,
} from './estado.js';

/* ------------------------------------------------------------------ */
/*  ZIP sin compresión (suficiente para un .xlsx)                       */
/* ------------------------------------------------------------------ */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(archivos) {
  const enc = new TextEncoder();
  const partes = [];
  const central = [];
  let offset = 0;
  const ahora = new Date();
  const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
  const fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();

  for (const [nombre, texto] of archivos) {
    const nom = enc.encode(nombre);
    const datos = enc.encode(texto);
    const crc = crc32(datos);
    const cab = new DataView(new ArrayBuffer(30));
    cab.setUint32(0, 0x04034b50, true); cab.setUint16(4, 20, true); cab.setUint16(6, 0x0800, true);
    cab.setUint16(8, 0, true); cab.setUint16(10, hora, true); cab.setUint16(12, fecha, true);
    cab.setUint32(14, crc, true); cab.setUint32(18, datos.length, true); cab.setUint32(22, datos.length, true);
    cab.setUint16(26, nom.length, true); cab.setUint16(28, 0, true);
    partes.push(new Uint8Array(cab.buffer), nom, datos);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true); cd.setUint16(12, hora, true); cd.setUint16(14, fecha, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, datos.length, true); cd.setUint32(24, datos.length, true);
    cd.setUint16(28, nom.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nom);
    offset += 30 + nom.length + datos.length;
  }
  const tamCentral = central.reduce((a, b) => a + b.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ------------------------------------------------------------------ */
/*  Libro de Excel                                                     */
/* ------------------------------------------------------------------ */
const xml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const col = (n) => { let s = ''; n += 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// Estilos: 0 normal · 1 encabezado · 2 celda con borde · 3 ✓ verde · 4 ✗ rojo · 5 título · 6 celda centrada
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF1B396A"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1B396A"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom></border></borders>
<cellStyleXfs count="1"><xf borderId="0" fillId="0" fontId="0" numFmtId="0"/></cellStyleXfs>
<cellXfs count="7"><xf xfId="0" borderId="0" fillId="0" fontId="0" numFmtId="0"/>
<xf xfId="0" numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf xfId="0" fillId="0" fontId="0" numFmtId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf xfId="0" numFmtId="0" fontId="3" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf xfId="0" fontId="0" numFmtId="0" fillId="4" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf xfId="0" borderId="0" fillId="0" numFmtId="0" fontId="2" applyFont="1"/>
<xf xfId="0" fillId="0" fontId="0" numFmtId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** hoja = { nombre, titulo, encabezados: [], filas: [[valor | {v, s}]], anchos: [], fijarColumnas } */
function hojaXml(h) {
  const filasXml = [];
  filasXml.push(`<row r="1"><c r="A1" t="inlineStr" s="5"><is><t>${xml(h.titulo)}</t></is></c></row>`);
  filasXml.push(`<row r="2" ht="${h.altoEncabezado || 30}" customHeight="1">${h.encabezados.map((t, i) => `<c r="${col(i)}2" t="inlineStr" s="1"><is><t>${xml(t)}</t></is></c>`).join('')}</row>`);
  h.filas.forEach((fila, fi) => {
    const r = fi + 3;
    filasXml.push(`<row r="${r}">${fila.map((celda, ci) => {
      const v = celda && typeof celda === 'object' ? celda.v : celda;
      const s = celda && typeof celda === 'object' ? celda.s : 2;
      const ref = `${col(ci)}${r}`;
      if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('')}</row>`);
  });
  const ultima = col(h.encabezados.length - 1);
  const fc = h.fijarColumnas || 0;
  const panel = fc
    ? `<pane xSplit="${fc}" ySplit="2" topLeftCell="${col(fc)}3" activePane="bottomRight" state="frozen"/>`
    : '<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0">${panel}</sheetView></sheetViews>
<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${filasXml.join('')}</sheetData>
${h.filas.length ? `<autoFilter ref="A2:${ultima}${h.filas.length + 2}"/>` : ''}
</worksheet>`;
}

function libro(hojas) {
  const nombres = hojas.map((h) => h.nombre.replace(/[[\]:*?/\\]/g, '').slice(0, 31));
  const archivos = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${nombres.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<definedNames>${hojas.map((h, i) => h.filas.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(nombres[i])}'!$A$2:$${col(h.encabezados.length - 1)}$${h.filas.length + 2}</definedName>` : '').join('')}</definedNames>
</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`],
    ['xl/styles.xml', ESTILOS],
    ...hojas.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hojaXml(h)]),
  ];
  return zip(archivos);
}

/* ------------------------------------------------------------------ */
/*  Contenido de SIGLAB                                                */
/* ------------------------------------------------------------------ */
const corto = (lab) => lab.nombre.replace(/^Laboratorio de /i, '');

function hojaInventario(lab, hoy) {
  const eqs = equiposOrdenados(lab.id);
  return {
    nombre: `Inventario ${lab.clave}`,
    titulo: `Inventario de equipo de cómputo — ${lab.nombre} (${hoy})`,
    encabezados: ['Equipo', 'Fila', 'Lugar', 'Tipo', ...PERIFERICOS.map((p) => p.nombre), 'Sistema operativo', 'Estado', 'Motivo (manual)', 'En este estado desde', 'Software instalado', 'Pendientes abiertos', 'Observaciones',
      'Modelo', 'No. de serie', 'Procesador', 'RAM (GB)', 'Gráfica', 'Motherboard', 'Almacenamiento'],
    anchos: [10, 6, 6, 6, 11, 11, 11, 13, 24, 18, 26, 14, 50, 11, 40, 22, 16, 24, 9, 20, 22, 26],
    filas: eqs.map((e) => {
      const l = e.lugar_id ? lugarPorId(e.lugar_id) : null;
      return [
        e.numero, l ? { v: l.fila, s: 6 } : { v: '—', s: 6 }, l ? { v: l.columna, s: 6 } : { v: '—', s: 6 }, { v: e.tipo === 'mac' ? 'Mac' : 'PC', s: 6 },
        ...PERIFERICOS.map((p) => ({ v: PER_ESTADOS[e[p.clave]], s: e[p.clave] === 'presente' ? 3 : 4 })),
        e.so.map((id) => soPorId(id)?.nombre).filter(Boolean).join(' / ') || '—',
        { v: ESTADOS[e.estado].nombre, s: e.estado === 'verde' ? 3 : e.estado === 'rojo' ? 4 : 2 },
        e.estado_manual ? e.motivo_manual || '' : '',
        e.estado_desde ? fechaCorta(e.estado_desde) : '',
        e.software.map((id) => swPorId(id)?.nombre).filter(Boolean).sort().join(', '),
        { v: e.pendientes || 0, s: 6 },
        e.observaciones || '',
        compPorId(e.modelo_id)?.nombre || '', e.num_serie || '', compPorId(e.procesador_id)?.nombre || '',
        e.ram_gb ? { v: e.ram_gb, s: 6 } : '', compPorId(e.grafica_id)?.nombre || '', compPorId(e.motherboard_id)?.nombre || '',
        (e.discos || []).map(textoDisco).join(' + '),
      ];
    }),
  };
}

function hojaSoftware(lab, hoy) {
  const eqs = equiposOrdenados(lab.id);
  // Una columna por programa; la celda muestra la versión instalada (o ✓ si no tiene versión)
  const m = new Map();
  S.software.forEach((s) => {
    const k = s.programa.toLowerCase();
    if (!m.has(k)) m.set(k, { nombre: s.programa, categoria: s.categoria, ids: [], activo: false });
    m.get(k).ids.push(s.id); m.get(k).activo ||= s.activo;
  });
  const progs = [...m.values()].filter((p) => p.activo).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
  const ver = (e, p) => e.software.map(swPorId).find((s) => s && p.ids.includes(s.id));
  const filas = eqs.map((e) => {
    const n = progs.filter((p) => ver(e, p)).length;
    return [e.numero, ...progs.map((p) => { const s = ver(e, p); return s ? { v: s.version || '✓', s: 3 } : { v: '✗', s: 4 }; }), { v: n, s: 6 }];
  });
  filas.push([{ v: 'Instalado en', s: 1 }, ...progs.map((p) => ({ v: eqs.filter((e) => ver(e, p)).length, s: 6 })), '']);
  return {
    nombre: `Software ${lab.clave}`,
    titulo: `Software instalado — ${lab.nombre} (${hoy})`,
    encabezados: ['Equipo', ...progs.map((p) => p.nombre), 'Total'],
    anchos: [10, ...progs.map(() => 12), 8],
    altoEncabezado: 60,
    fijarColumnas: 1,
    filas,
  };
}

export async function exportarExcel(boton) {
  const original = boton?.innerHTML;
  if (boton) { boton.disabled = true; boton.innerHTML = '<span class="cargando"></span>'; }
  try {
    const hoy = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    const { pendientes } = await api('ctrl/php/pendientesApi.php?accion=listar');
    const hojas = [
      ...S.labs.map((l) => hojaInventario(l, hoy)),
      ...S.labs.map((l) => hojaSoftware(l, hoy)),
      {
        nombre: 'Pendientes',
        titulo: `Pendientes por equipo (${hoy})`,
        encabezados: ['Laboratorio', 'Equipo', 'Pendiente', 'Responsable', 'Situación', 'Creado', 'Completado'],
        anchos: [24, 10, 50, 20, 12, 14, 14],
        filas: pendientes.map((p) => [
          corto(S.labs.find((l) => l.id === p.laboratorio_id) || { nombre: '' }), p.numero, p.texto, p.responsable || '',
          { v: p.hecho ? 'Hecho' : 'Abierto', s: p.hecho ? 3 : 4 }, fechaCorta(p.creado_en), p.hecho ? fechaCorta(p.hecho_en) : '',
        ]),
      },
    ];
    const blob = libro(hojas);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `SIGLAB_inventario_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('Archivo de Excel generado.', 'ok');
  } catch (err) {
    toast(err.message || 'No se pudo generar el archivo.', 'error');
  } finally {
    if (boton) { boton.disabled = false; boton.innerHTML = original; }
  }
}

export { libro as _libroParaPruebas };
