<?php
// ctrl/php/reporteSoftware.php — Matriz de software y lista de instalaciones pendientes, lista para imprimir/PDF.
// Parámetros GET: lab=<id>|todos, sw=1,2,3 (opcional: solo esos programas), auto=1

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_reporte.php';
require_once __DIR__ . '/../../model/php/InventarioModelo.php';
require_once __DIR__ . '/../../model/php/CatalogoModelo.php';

set_exception_handler(static function (Throwable $t): void {
    error_log('[SIGLAB] ' . $t->getMessage());
    http_response_code(500);
    echo 'No se pudo generar el reporte.';
});

$idUsuario = (int)($_SESSION['usuario_id'] ?? 0);
$yo = $idUsuario ? (new UsuarioModelo())->porId($idUsuario) : null;
if (!$yo || (int)$yo['activo'] !== 1) { http_response_code(401); echo 'Tu sesión terminó. Inicia sesión de nuevo.'; exit; }

$inv = new InventarioModelo();
$cat = new CatalogoModelo();
$labParam = (string)($_GET['lab'] ?? 'todos');
$auto = ($_GET['auto'] ?? '') === '1';

// Una columna por programa (todas sus versiones juntas); la celda muestra la versión instalada
$catalogo = $cat->listar('software');
$verPorId = array_column($catalogo, 'version', 'id');
$filtroIds = !empty($_GET['sw']) ? array_map('intval', explode(',', (string)$_GET['sw'])) : null;
$programas = [];
foreach ($catalogo as $s) {
    $k = mb_strtolower($s['programa']);
    $programas[$k] ??= ['nombre' => $s['programa'], 'categoria' => $s['categoria'], 'ids' => [], 'activo' => false, 'pedido' => false];
    $programas[$k]['ids'][] = $s['id'];
    $programas[$k]['activo'] = $programas[$k]['activo'] || $s['activo'];
    if ($filtroIds && in_array($s['id'], $filtroIds, true)) $programas[$k]['pedido'] = true;
}
$programas = array_values(array_filter($programas, static fn($p) => $filtroIds ? $p['pedido'] : $p['activo']));
usort($programas, static fn($a, $b) => strnatcasecmp($a['categoria'], $b['categoria']) ?: strnatcasecmp($a['nombre'], $b['nombre']));
/** Versión instalada de un programa en un equipo: null = no lo tiene, '' = sin versión. */
function version_en(array $e, array $p, array $verPorId): ?string
{
    foreach ($e['software'] as $id) if (in_array($id, $p['ids'], true)) return (string)($verPorId[$id] ?? '');
    return null;
}

$labs = $inv->laboratorios();
if ($labParam !== 'todos') $labs = array_values(array_filter($labs, static fn($l) => $l['id'] === (int)$labParam));
$lugares = array_column($inv->lugares(), null, 'id');

$fecha = fecha_larga();
$firmas = firmas_de_get($yo);
$pie = 'Generado el ' . date('d/m/Y H:i') . ' por ' . $yo['nombre'];
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Software instalado — SIGLAB</title>
<style>
<?= css_reporte($pie) ?>

  .datos { width: 100%; border-collapse: collapse; font-size: 9px; }
  .datos thead { display: table-header-group; }
  .datos th { background: #1B396A; color: #fff; border: 1px solid #1B396A; padding: 4px 2px; font-size: 8px; }
  .datos th.vert { height: 34mm; vertical-align: bottom; }
  .datos th.vert span { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; display: inline-block; }
  .datos td { border: 1px solid #94a3b8; padding: 3px; text-align: center; }
  .datos td.num { font-weight: 800; font-family: Consolas, monospace; white-space: nowrap; }
  .datos td.si { color: #15803d; font-weight: 900; }
  .datos td.si small { font-size: 7.5px; font-weight: 700; white-space: nowrap; }
  .datos td.no { color: #b91c1c; background: #fde0e0; }
  .datos tr.total td { background: #f1f5f9; font-weight: 700; font-size: 8px; }
  .datos tr { break-inside: avoid; }
  h3 { font-size: 11px; text-transform: uppercase; color: #1B396A; margin: 7mm 0 3mm; border-bottom: 1.5px solid #1B396A; padding-bottom: 2px; break-after: avoid; }
  .pend { display: grid; grid-template-columns: 52mm 1fr; border-bottom: 1px solid #e2e8f0; font-size: 9.5px; padding: 3px 0; break-inside: avoid; }
  .pend b { color: #111827; } .pend span { color: #334155; }
  .ok { font-size: 10px; color: #15803d; padding: 6px 0; }
</style>
<?= html_navegador() ?>
</head>
<body>
<div class="barra">
  <div><strong>Software instalado e instalaciones pendientes</strong><br><span>Usa "Guardar como PDF" en el destino de impresión. Carta, horizontal.</span></div>
  <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
</div>
<?= html_aviso_navegador() ?>

<?php foreach ($labs as $lab):
    $equipos = $inv->equipos($lab['id']);
    usort($equipos, static function ($a, $b) use ($lugares) {
        $ka = $a['lugar_id'] ? [$lugares[$a['lugar_id']]['fila'], $lugares[$a['lugar_id']]['columna']] : [999, 0];
        $kb = $b['lugar_id'] ? [$lugares[$b['lugar_id']]['fila'], $lugares[$b['lugar_id']]['columna']] : [999, 0];
        return $ka <=> $kb ?: strnatcmp($a['numero'], $b['numero']);
    });
    $n = count($equipos);
?>
<?php inicio_seccion('Software instalado por equipo', $lab['nombre'], $fecha, $pie); ?>
  <?php if (!$programas || !$equipos): ?>
    <p class="ok">No hay programas o equipos para mostrar.</p>
  <?php else: ?>
  <table class="datos">
    <thead><tr>
      <th style="width:16mm">Equipo</th>
      <th style="width:14mm">Ubicación</th>
      <?php foreach ($programas as $p): ?><th class="vert"><span><?= h($p['nombre']) ?></span></th><?php endforeach; ?>
      <th style="width:12mm">Total</th>
    </tr></thead>
    <tbody>
    <?php foreach ($equipos as $e): $l = $e['lugar_id'] ? $lugares[$e['lugar_id']] : null; $cuenta = 0; ?>
      <tr>
        <td class="num"><?= h($e['numero']) ?></td>
        <td><?= $l ? 'F' . $l['fila'] . '·L' . $l['columna'] : '—' ?></td>
        <?php foreach ($programas as $p): $ver = version_en($e, $p, $verPorId); $si = $ver !== null; if ($si) $cuenta++; ?>
          <td class="<?= $si ? 'si' : 'no' ?>"><?= $si ? ($ver !== '' ? '<small>' . h($ver) . '</small>' : '✓') : '✗' ?></td>
        <?php endforeach; ?>
        <td><b><?= $cuenta ?></b>/<?= count($programas) ?></td>
      </tr>
    <?php endforeach; ?>
      <tr class="total">
        <td colspan="2">Instalado en</td>
        <?php foreach ($programas as $p):
            $c = count(array_filter($equipos, static fn($e) => version_en($e, $p, $verPorId) !== null)); ?>
          <td><?= $c ?>/<?= $n ?></td>
        <?php endforeach; ?>
        <td></td>
      </tr>
    </tbody>
  </table>

  <h3>Instalaciones pendientes</h3>
  <?php $hay = false; foreach ($programas as $p):
      $faltan = array_map(static fn($e) => $e['numero'], array_filter($equipos, static fn($e) => version_en($e, $p, $verPorId) === null));
      if (!$faltan) continue; $hay = true; ?>
    <div class="pend"><b><?= h($p['nombre']) ?> (<?= count($faltan) ?>)</b><span><?= h(implode(', ', $faltan)) ?></span></div>
  <?php endforeach; ?>
  <?php if (!$hay): ?><p class="ok">✓ Todos los programas seleccionados están instalados en todos los equipos.</p><?php endif; ?>
  <?php endif; ?>
  <?= html_firmas($firmas) ?>
<?php fin_seccion(); ?>
<?php endforeach; ?>

<?php if ($auto): ?><script>window.addEventListener('load', () => setTimeout(() => window.print(), 500));</script><?php endif; ?>
</body>
</html>
