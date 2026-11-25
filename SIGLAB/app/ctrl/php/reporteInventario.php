<?php
// ctrl/php/reporteInventario.php — Reporte de inventario listo para imprimir o guardar como PDF.
// Parámetros GET: lab=<id>|todos, estado=todos|verde|ambar|rojo|azul, software=1|0, auto=1

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../model/php/InventarioModelo.php';
require_once __DIR__ . '/../../model/php/CatalogoModelo.php';

set_exception_handler(static function (Throwable $t): void {
    error_log('[SIGLAB] ' . $t->getMessage());
    http_response_code(500);
    echo 'No se pudo generar el reporte.';
});

$idUsuario = (int)($_SESSION['usuario_id'] ?? 0);
$yo = $idUsuario ? (new UsuarioModelo())->porId($idUsuario) : null;
if (!$yo || (int)$yo['activo'] !== 1) {
    http_response_code(401);
    echo 'Tu sesión terminó. Inicia sesión de nuevo.';
    exit;
}

$inv = new InventarioModelo();
$cat = new CatalogoModelo();

$labParam = (string)($_GET['lab'] ?? 'todos');
$estadoParam = in_array($_GET['estado'] ?? '', InventarioModelo::ESTADOS, true) ? $_GET['estado'] : 'todos';
$conSoftware = ($_GET['software'] ?? '1') === '1';
$conCroquis = ($_GET['croquis'] ?? '0') === '1';
$conSpecs = ($_GET['specs'] ?? '0') === '1';
$auto = ($_GET['auto'] ?? '') === '1';

$labs = $inv->laboratorios();
if ($labParam !== 'todos') {
    $labs = array_values(array_filter($labs, static fn($l) => $l['id'] === (int)$labParam));
    if (!$labs) { http_response_code(404); echo 'Laboratorio no encontrado.'; exit; }
}

$soNombre = array_column($cat->listar('so'), 'nombre', 'id');
$swNombre = array_column($cat->listar('software'), 'nombre', 'id');
$compNombre = array_column($cat->componentes(), 'nombre', 'id');
$lugares = array_column($inv->lugares(), null, 'id');

const ESTADO_TXT = ['verde' => 'Operativa', 'ambar' => 'Detalle menor / mantenimiento', 'rojo' => 'Fuera de servicio', 'azul' => 'En revisión'];
const ESTADO_CORTO = ['verde' => 'Operativa', 'ambar' => 'Detalle menor', 'rojo' => 'Fuera de servicio', 'azul' => 'En revisión'];
const PER_TXT = ['presente' => '✓', 'faltante' => 'Faltante', 'danado' => 'Dañado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function h($v): string { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }
$fecha = (int)date('j') . ' de ' . MESES[(int)date('n') - 1] . ' de ' . date('Y');

$secciones = [];
foreach ($labs as $lab) {
    $equipos = $inv->equipos($lab['id']);
    $todos = $equipos;
    if ($estadoParam !== 'todos') $equipos = array_values(array_filter($equipos, static fn($e) => $e['estado'] === $estadoParam));

    usort($equipos, static function ($a, $b) use ($lugares) {
        $la = $a['lugar_id'] ? $lugares[$a['lugar_id']] : null;
        $lb = $b['lugar_id'] ? $lugares[$b['lugar_id']] : null;
        $ka = $la ? [$la['fila'], $la['columna']] : [999, 0];
        $kb = $lb ? [$lb['fila'], $lb['columna']] : [999, 0];
        return $ka <=> $kb ?: strnatcmp($a['numero'], $b['numero']);
    });

    $conteo = array_fill_keys(InventarioModelo::ESTADOS, 0);
    foreach ($todos as $e) $conteo[$e['estado']]++;
    $totalLugares = count(array_filter($lugares, static fn($l) => $l['laboratorio_id'] === $lab['id']));
    $ubicados = count(array_filter($todos, static fn($e) => $e['lugar_id'] !== null));

    $secciones[] = [
        'lab' => $lab, 'equipos' => $equipos, 'conteo' => $conteo,
        'total' => count($todos), 'vacios' => $totalLugares - $ubicados,
        'todos' => $todos,
    ];
}
$img = '../../view/img/';
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Inventario de laboratorios — SIGLAB</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #e5e7eb; color: #111827; font-family: Arial, Helvetica, sans-serif; }
  .barra { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center;
           gap: 12px; padding: 12px 20px; background: #0f172a; color: #fff; box-shadow: 0 6px 20px rgba(15,23,42,.25); }
  .barra span { color: #cbd5e1; font-size: 12px; }
  .barra button { border: 0; border-radius: 8px; padding: 9px 16px; font-weight: 700; cursor: pointer; background: #fff; color: #0f172a; }
  .hoja { width: 279mm; min-height: 216mm; margin: 18px auto; padding: 10mm 11mm 14mm; background: #fff;
          box-shadow: 0 8px 30px rgba(15,23,42,.18); position: relative; }
  .hoja + .hoja { break-before: page; }
  .logos { display: flex; justify-content: space-between; align-items: center; height: 18mm; margin-bottom: 3mm; }
  .logos .der { display: flex; align-items: center; gap: 5mm; }
  .logo-sep { height: 11mm; } .logo-tec { height: 13mm; } .logo-itc { height: 17mm; }
  .titulo { border: 1.3px solid #111827; text-align: center; padding: 5px 8px; }
  .titulo h1 { margin: 0; font-size: 13px; letter-spacing: .3px; text-transform: uppercase; }
  .titulo h2 { margin: 2px 0 0; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #1B396A; }
  .meta { display: flex; justify-content: space-between; font-size: 9.5px; color: #475569; margin: 4px 0 6px; }
  .resumen { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 7px; }
  .caja { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 7px; font-size: 9px; color: #334155; border-left-width: 4px; }
  .caja b { display: block; font-size: 15px; color: #111827; }
  .c-verde { border-left-color: #16a34a; } .c-ambar { border-left-color: #f59e0b; }
  .c-rojo { border-left-color: #dc2626; } .c-azul { border-left-color: #2563eb; } .c-total, .c-vacio { border-left-color: #64748b; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  thead { display: table-header-group; }
  th { background: #1B396A; color: #fff; padding: 5px 4px; text-transform: uppercase; font-size: 8.5px; border: 1px solid #1B396A; }
  td { border: 1px solid #94a3b8; padding: 4px; vertical-align: middle; text-align: center; }
  tr { break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  td.izq { text-align: left; }
  .num { font-weight: 800; }
  .mal { color: #b91c1c; font-weight: 700; }
  .estado { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; white-space: nowrap; }
  .punto { width: 8px; height: 8px; border-radius: 50%; display: inline-block; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .p-verde { background: #16a34a; } .p-ambar { background: #f59e0b; } .p-rojo { background: #dc2626; } .p-azul { background: #2563eb; }
  .motivo { display: block; font-weight: 400; color: #475569; font-size: 8px; }
  .vacio { text-align: center; padding: 18px; border: 1px dashed #94a3b8; font-size: 11px; color: #475569; }
  .firmas { display: flex; justify-content: space-around; margin-top: 16mm; font-size: 9.5px; text-align: center; break-inside: avoid; }
  .firmas div { width: 70mm; border-top: 1px solid #111827; padding-top: 4px; }
  .pie { position: absolute; left: 11mm; right: 11mm; bottom: 5mm; text-align: center; font-size: 8px; color: #6b7280; }
  .pie i { display: block; width: 60%; height: 2px; background: #9f1239; margin: 3px auto 0; }
  th, .punto, .caja { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: Letter landscape; margin: 0; }
  @media print {
    body { background: #fff; }
    .barra { display: none; }
    .hoja { margin: 0; box-shadow: none; width: auto; min-height: 216mm; }
  }
  .croquis { margin-top: 6mm; }
  .sub-specs { font-size: 11px; text-transform: uppercase; margin: 6mm 0 2mm; color: #1B396A; break-after: avoid; }
  .cq-piz { margin: 0 auto 5mm; width: 45%; text-align: center; font-size: 9px; font-weight: 700; letter-spacing: 2px; color: #475569; border: 1px solid #94a3b8; background: #f1f5f9; padding: 3px; border-radius: 3px; }
  .cq-grid { display: grid; gap: 3mm 2.5mm; }
  .cq-fila { display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #64748b; }
  .cq-pc { border: 1.4px solid #94a3b8; border-top-width: 4px; border-radius: 4px; padding: 3mm 2mm 2mm; text-align: center; min-height: 20mm; display: flex; flex-direction: column; justify-content: center; gap: 1mm; }
  .cq-pc b { font-size: 12px; font-family: Consolas, monospace; }
  .cq-pc small { font-size: 7.5px; color: #475569; line-height: 1.2; }
  .cq-pc.e-verde { border-top-color: #16a34a; background: #f0fdf4; } .cq-pc.e-ambar { border-top-color: #f59e0b; background: #fffbeb; }
  .cq-pc.e-rojo { border-top-color: #dc2626; background: #fef2f2; } .cq-pc.e-azul { border-top-color: #2563eb; background: #eff6ff; }
  .cq-vacio { border: 1.2px dashed #cbd5e1; border-radius: 4px; min-height: 20mm; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #94a3b8; }
  .cq-leyenda { display: flex; justify-content: center; gap: 18px; margin-top: 6mm; font-size: 9.5px; color: #334155; }
  .cq-leyenda span { display: inline-flex; align-items: center; gap: 5px; }
  .cq-pc, .cq-leyenda .punto { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .desde { display: block; font-weight: 400; color: #64748b; font-size: 7.5px; }
</style>
</head>
<body>
<div class="barra">
  <div><strong>Reporte de inventario</strong><br><span>Usa "Guardar como PDF" en el destino de impresión. Tamaño carta, horizontal.</span></div>
  <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
</div>

<?php foreach ($secciones as $s): ?>
<?php if ($conCroquis):
    $lugLab = array_values(array_filter($lugares, static fn($l) => $l['laboratorio_id'] === $s['lab']['id']));
    $eqPorLugar = [];
    foreach ($s['todos'] as $e) if ($e['lugar_id']) $eqPorLugar[$e['lugar_id']] = $e;
    $maxCol = max(1, ...array_map(static fn($l) => $l['columna'], $lugLab ?: [['columna' => 1]]));
    $filas = array_values(array_unique(array_map(static fn($l) => $l['fila'], $lugLab)));
    sort($filas);
?>
<section class="hoja">
  <div class="logos">
    <img class="logo-sep" src="<?= $img ?>sep.png" alt="SEP">
    <div class="der">
      <img class="logo-tec" src="<?= $img ?>tecnm.png" alt="TecNM">
      <img class="logo-itc" src="<?= $img ?>comitan.png" alt="Instituto Tecnológico de Comitán">
    </div>
  </div>
  <div class="titulo">
    <h1>Croquis de distribución y estado de los equipos</h1>
    <h2><?= h($s['lab']['nombre']) ?></h2>
  </div>
  <div class="meta">
    <span><?= h(INSTITUCION) ?> · Comitán de Domínguez, Chiapas</span>
    <span>Fecha de corte: <?= h($fecha) ?></span>
  </div>
  <div class="croquis">
    <div class="cq-piz">PIZARRÓN</div>
    <div class="cq-grid" style="grid-template-columns: 8mm repeat(<?= $maxCol ?>, 1fr)">
      <?php foreach ($filas as $f): ?>
        <div class="cq-fila" style="grid-row:<?= $f ?>">F<?= $f ?></div>
        <?php foreach ($lugLab as $l): if ($l['fila'] !== $f) continue; $e = $eqPorLugar[$l['id']] ?? null; ?>
          <?php if ($e):
              $soTxt = implode(' / ', array_map(static fn($x) => $soNombre[$x] ?? '', $e['so'])); ?>
            <div class="cq-pc e-<?= $e['estado'] ?>" style="grid-row:<?= $f ?>;grid-column:<?= $l['columna'] + 1 ?>">
              <b><?= h($e['numero']) ?></b>
              <small><?= $soTxt !== '' ? h($soTxt) : 'Sin sistema' ?></small>
              <small><?= h(ESTADO_CORTO[$e['estado']]) ?></small>
            </div>
          <?php else: ?>
            <div class="cq-vacio" style="grid-row:<?= $f ?>;grid-column:<?= $l['columna'] + 1 ?>">Vacío</div>
          <?php endif; ?>
        <?php endforeach; ?>
      <?php endforeach; ?>
    </div>
    <div class="cq-leyenda">
      <span><i class="punto p-verde"></i>Operativa (<?= $s['conteo']['verde'] ?>)</span>
      <span><i class="punto p-ambar"></i>Detalle menor / mant. (<?= $s['conteo']['ambar'] ?>)</span>
      <span><i class="punto p-rojo"></i>Fuera de servicio (<?= $s['conteo']['rojo'] ?>)</span>
      <span><i class="punto p-azul"></i>En revisión (<?= $s['conteo']['azul'] ?>)</span>
    </div>
  </div>
  <div class="pie">SIGLAB · Sistema de Gestión de Laboratorios · Generado el <?= date('d/m/Y H:i') ?><i></i></div>
</section>
<?php endif; ?>
<section class="hoja">
  <div class="logos">
    <img class="logo-sep" src="<?= $img ?>sep.png" alt="SEP">
    <div class="der">
      <img class="logo-tec" src="<?= $img ?>tecnm.png" alt="TecNM">
      <img class="logo-itc" src="<?= $img ?>comitan.png" alt="Instituto Tecnológico de Comitán">
    </div>
  </div>

  <div class="titulo">
    <h1>Inventario de equipo de cómputo<?= $estadoParam !== 'todos' ? ' — ' . h(ESTADO_TXT[$estadoParam]) : '' ?></h1>
    <h2><?= h($s['lab']['nombre']) ?></h2>
  </div>
  <div class="meta">
    <span><?= h(INSTITUCION) ?> · Comitán de Domínguez, Chiapas</span>
    <span>Fecha de corte: <?= h($fecha) ?></span>
  </div>

  <div class="resumen">
    <div class="caja c-total"><b><?= $s['total'] ?></b>Equipos registrados</div>
    <div class="caja c-verde"><b><?= $s['conteo']['verde'] ?></b>Operativas</div>
    <div class="caja c-ambar"><b><?= $s['conteo']['ambar'] ?></b>Detalle menor / mant.</div>
    <div class="caja c-rojo"><b><?= $s['conteo']['rojo'] ?></b>Fuera de servicio</div>
    <div class="caja c-azul"><b><?= $s['conteo']['azul'] ?></b>En revisión</div>
    <div class="caja c-vacio"><b><?= $s['vacios'] ?></b>Lugares vacíos</div>
  </div>

  <?php if (!$s['equipos']): ?>
    <div class="vacio">No hay equipos que coincidan con el filtro seleccionado.</div>
  <?php else: ?>
  <table>
    <thead>
      <tr>
        <th style="width:4%">#</th>
        <th style="width:7%">Equipo</th>
        <th style="width:7%">Ubicación</th>
        <th style="width:5%">Tipo</th>
        <th style="width:6.5%">Monitor</th>
        <th style="width:6.5%">Teclado</th>
        <th style="width:6.5%">Mouse</th>
        <th style="width:6.5%">CPU</th>
        <th style="width:<?= $conSoftware ? '12' : '18' ?>%">Sistema operativo</th>
        <?php if ($conSoftware): ?><th style="width:18%">Software instalado</th><?php endif; ?>
        <th style="width:<?= $conSoftware ? '11' : '16' ?>%">Estado</th>
        <th>Observaciones</th>
      </tr>
    </thead>
    <tbody>
    <?php foreach ($s['equipos'] as $i => $e):
        $l = $e['lugar_id'] ? $lugares[$e['lugar_id']] : null;
        $so = array_map(static fn($x) => $soNombre[$x] ?? '', $e['so']);
        $sw = array_map(static fn($x) => $swNombre[$x] ?? '', $e['software']);
        sort($sw, SORT_NATURAL | SORT_FLAG_CASE);
    ?>
      <tr>
        <td><?= $i + 1 ?></td>
        <td class="num"><?= h($e['numero']) ?></td>
        <td><?= $l ? 'F' . $l['fila'] . ' · L' . $l['columna'] : 'Sin ubicar' ?></td>
        <td><?= $e['tipo'] === 'mac' ? 'Mac' : 'PC' ?></td>
        <?php foreach (InventarioModelo::PERIFERICOS as $p): ?>
          <td class="<?= $e[$p] !== 'presente' ? 'mal' : '' ?>"><?= PER_TXT[$e[$p]] ?></td>
        <?php endforeach; ?>
        <td><?= $so ? h(implode(' / ', $so)) : '—' ?></td>
        <?php if ($conSoftware): ?><td class="izq"><?= $sw ? h(implode(', ', $sw)) : '—' ?></td><?php endif; ?>
        <td>
          <span class="estado"><i class="punto p-<?= $e['estado'] ?>"></i><?= h(ESTADO_CORTO[$e['estado']]) ?></span>
          <?php if ($e['estado_manual']): ?><span class="motivo"><?= h($e['motivo_manual']) ?></span><?php endif; ?>
          <?php if (!empty($e['estado_desde'])): ?><span class="desde">desde <?= date('d/m/Y', strtotime($e['estado_desde'])) ?></span><?php endif; ?>
        </td>
        <td class="izq"><?= $e['observaciones'] !== '' ? nl2br(h($e['observaciones'])) : '' ?></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>

  <?php if ($conSpecs): ?>
  <h3 class="sub-specs">Especificaciones técnicas</h3>
  <table class="t-specs">
    <thead><tr>
      <th style="width:7%">Equipo</th><th style="width:15%">Modelo</th><th style="width:11%">No. de serie</th>
      <th style="width:17%">Procesador</th><th style="width:6%">RAM</th><th style="width:13%">Gráfica</th>
      <th style="width:14%">Motherboard</th><th>Almacenamiento</th>
    </tr></thead>
    <tbody>
    <?php foreach ($s['equipos'] as $e): $c = static fn($id) => $id ? h($compNombre[$id] ?? '') : '—'; ?>
      <tr>
        <td class="num"><?= h($e['numero']) ?></td>
        <td><?= $c($e['modelo_id']) ?></td>
        <td><?= $e['num_serie'] ? h($e['num_serie']) : '—' ?></td>
        <td><?= $c($e['procesador_id']) ?></td>
        <td><?= $e['ram_gb'] ? $e['ram_gb'] . ' GB' : '—' ?></td>
        <td><?= $c($e['grafica_id']) ?></td>
        <td><?= $c($e['motherboard_id']) ?></td>
        <td><?= $e['discos'] ? h(implode(' + ', array_map([InventarioModelo::class, 'textoDisco'], $e['discos']))) : '—' ?></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
  <?php endif; ?>
  <?php endif; ?>

  <div class="firmas">
    <div>Elaboró<br><b><?= h($yo['nombre']) ?></b></div>
    <div>Vo. Bo.<br><b>Encargado(a) del laboratorio</b></div>
  </div>

  <div class="pie">SIGLAB · Sistema de Gestión de Laboratorios · Generado el <?= date('d/m/Y H:i') ?><i></i></div>
</section>
<?php endforeach; ?>

<?php if ($auto): ?>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 500));</script>
<?php endif; ?>
</body>
</html>
