<?php
// ctrl/php/reporteInventario.php — Reporte de inventario listo para imprimir o guardar como PDF.
// Parámetros GET: lab=<id>|todos, estado=todos|verde|ambar|rojo|azul, software=1|0, croquis=1|0, specs=1|0,
//                 firmas=ambas|elaboro|vobo|ninguna, fe_nombre, fe_cargo, fv_nombre, fv_cargo, auto=1

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../model/php/InventarioModelo.php';
require_once __DIR__ . '/../../model/php/CatalogoModelo.php';
require_once __DIR__ . '/_reporte.php';

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

$fecha = fecha_larga();
$firmas = firmas_de_get($yo);
$pie = 'SIGLAB · Sistema de Gestión de Laboratorios · Generado el ' . date('d/m/Y H:i');

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
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Inventario de laboratorios — SIGLAB</title>
<style>
<?= css_reporte() ?>

  .resumen { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 7px; }
  .caja { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 7px; font-size: 9px; color: #334155; border-left-width: 5px; }
  .caja b { display: block; font-size: 15px; color: #111827; }
  .c-verde { border-left-color: #16a34a; } .c-ambar { border-left-color: #f59e0b; background: #fff7db; }
  .c-rojo { border-left-color: #dc2626; background: #fee2e2; } .c-azul { border-left-color: #2563eb; } .c-total, .c-vacio { border-left-color: #64748b; }
  .datos { width: 100%; border-collapse: collapse; font-size: 9px; }
  .datos thead { display: table-header-group; }
  .datos th { background: #1B396A; color: #fff; padding: 5px 4px; text-transform: uppercase; font-size: 8.5px; border: 1px solid #1B396A; }
  .datos td { border: 1px solid #94a3b8; padding: 4px; vertical-align: middle; text-align: center; }
  .datos tr { break-inside: avoid; }
  .datos tbody tr:nth-child(even) td { background: #f8fafc; }
  .datos td.izq { text-align: left; }
  .num { font-weight: 800; }
  .mal { color: #b91c1c; font-weight: 700; }

  /* Filas coloreadas por estado (más fácil de ubicar al imprimir) */
  .datos tbody tr.f-rojo td { background: #fde0e0; }
  .datos tbody tr.f-ambar td { background: #fff3cd; }
  .datos tbody tr.f-azul td { background: #e3edff; }
  .datos tbody tr.f-rojo td.est { background: #dc2626; color: #fff; }
  .datos tbody tr.f-ambar td.est { background: #f59e0b; color: #111827; }
  .datos tbody tr.f-azul td.est { background: #2563eb; color: #fff; }
  .datos tr.f-rojo td.est .motivo, .datos tr.f-rojo td.est .desde,
  .datos tr.f-azul td.est .motivo, .datos tr.f-azul td.est .desde { color: #fff; opacity: .9; }
  .datos tr.f-ambar td.est .motivo, .datos tr.f-ambar td.est .desde { color: #1f2937; }
  .datos tr.f-rojo .mal, .datos tr.f-ambar .mal { color: #991b1b; }
  .estado { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; white-space: nowrap; }
  .punto { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .p-verde { background: #16a34a; } .p-ambar { background: #f59e0b; } .p-rojo { background: #dc2626; } .p-azul { background: #2563eb; }
  .est .punto { box-shadow: 0 0 0 1.5px #fff; }
  .motivo { display: block; font-weight: 400; color: #475569; font-size: 8px; }
  .desde { display: block; font-weight: 400; color: #64748b; font-size: 7.5px; }
  .vacio { text-align: center; padding: 18px; border: 1px dashed #94a3b8; font-size: 11px; color: #475569; }
  .sub-specs { font-size: 11px; text-transform: uppercase; margin: 5mm 0 2mm; color: #1B396A; }

  /* Croquis: cabe siempre en una hoja */
  .cq-piz { margin: 1mm auto 4mm; width: 45%; text-align: center; font-size: 9px; font-weight: 700; letter-spacing: 2px; color: #475569; border: 1px solid #94a3b8; background: #f1f5f9; padding: 3px; border-radius: 3px; }
  .cq-grid { display: grid; gap: 2.5mm 2.5mm; }
  .cq-fila { display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #64748b; }
  .cq-pc { border: 1.4px solid #94a3b8; border-top-width: 4px; border-radius: 4px; padding: 2mm; text-align: center; min-height: 17mm; display: flex; flex-direction: column; justify-content: center; gap: .8mm; break-inside: avoid; }
  .cq-pc b { font-size: 12px; font-family: Consolas, monospace; }
  .cq-pc small { font-size: 7.5px; color: #475569; line-height: 1.2; }
  .cq-pc.e-verde { border-color: #86efac; border-top-color: #16a34a; background: #f0fdf4; }
  .cq-pc.e-ambar { border-color: #f59e0b; background: #fde68a; }
  .cq-pc.e-rojo { border-color: #dc2626; background: #fca5a5; }
  .cq-pc.e-azul { border-color: #2563eb; background: #bfdbfe; }
  .cq-pc.e-ambar small, .cq-pc.e-rojo small, .cq-pc.e-azul small { color: #1f2937; }
  .cq-pc .cq-est { font-weight: 700; }
  .cq-vacio { border: 1.2px dashed #cbd5e1; border-radius: 4px; min-height: 17mm; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #94a3b8; }
  .cq-leyenda { display: flex; justify-content: center; gap: 18px; margin-top: 5mm; font-size: 9.5px; color: #334155; }
  .cq-leyenda span { display: inline-flex; align-items: center; gap: 5px; }
</style>
</head>
<body>
<div class="barra">
  <div><strong>Reporte de inventario</strong><br><span>Usa "Guardar como PDF" en el destino de impresión. Tamaño carta, horizontal; activa "Gráficos de fondo" si no ves los colores.</span></div>
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
    inicio_seccion('Croquis de distribución y estado de los equipos', $s['lab']['nombre'], $fecha, $pie);
?>
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
              <small class="cq-est"><?= h(ESTADO_CORTO[$e['estado']]) ?></small>
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
<?php fin_seccion(); endif; ?>
<?php inicio_seccion('Inventario de equipo de cómputo' . ($estadoParam !== 'todos' ? ' — ' . ESTADO_TXT[$estadoParam] : ''), $s['lab']['nombre'], $fecha, $pie); ?>
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
    <table class="datos">
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
          <th style="width:<?= $conSoftware ? '12' : '16' ?>%">Estado</th>
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
        <tr class="f-<?= $e['estado'] ?>">
          <td><?= $i + 1 ?></td>
          <td class="num"><?= h($e['numero']) ?></td>
          <td><?= $l ? 'F' . $l['fila'] . ' · L' . $l['columna'] : 'Sin ubicar' ?></td>
          <td><?= $e['tipo'] === 'mac' ? 'Mac' : 'PC' ?></td>
          <?php foreach (InventarioModelo::PERIFERICOS as $p): ?>
            <td class="<?= $e[$p] !== 'presente' ? 'mal' : '' ?>"><?= PER_TXT[$e[$p]] ?></td>
          <?php endforeach; ?>
          <td><?= $so ? h(implode(' / ', $so)) : '—' ?></td>
          <?php if ($conSoftware): ?><td class="izq"><?= $sw ? h(implode(', ', $sw)) : '—' ?></td><?php endif; ?>
          <td class="est">
            <span class="estado"><i class="punto p-<?= $e['estado'] ?>"></i><?= h(ESTADO_CORTO[$e['estado']]) ?></span>
            <?php if ($e['estado_manual'] && $e['motivo_manual']): ?><span class="motivo"><?= h($e['motivo_manual']) ?></span><?php endif; ?>
            <?php if (!empty($e['estado_desde'])): ?><span class="desde">desde <?= date('d/m/Y', strtotime($e['estado_desde'])) ?></span><?php endif; ?>
          </td>
          <td class="izq"><?= ($e['observaciones'] ?? '') !== '' ? nl2br(h($e['observaciones'])) : '' ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>

    <?php if ($conSpecs): ?>
    <h3 class="sub-specs">Especificaciones técnicas</h3>
    <table class="datos t-specs">
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

    <?= html_firmas($firmas) ?>
<?php fin_seccion(); ?>
<?php endforeach; ?>

<?php if ($auto): ?>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 500));</script>
<?php endif; ?>
</body>
</html>
