<?php
// ctrl/php/reporteSoftware.php — Matriz de software y lista de instalaciones pendientes, lista para imprimir/PDF.
// Parámetros GET: lab=<id>|todos, sw=1,2,3 (opcional: solo esos programas), auto=1

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

function h($v): string { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
$fecha = (int)date('j') . ' de ' . MESES[(int)date('n') - 1] . ' de ' . date('Y');
$img = '../../view/img/';
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Software instalado — SIGLAB</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #e5e7eb; color: #111827; font-family: Arial, Helvetica, sans-serif; }
  .barra { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: #0f172a; color: #fff; }
  .barra span { color: #cbd5e1; font-size: 12px; }
  .barra button { border: 0; border-radius: 8px; padding: 9px 16px; font-weight: 700; cursor: pointer; background: #fff; color: #0f172a; }
  .hoja { width: 279mm; min-height: 216mm; margin: 18px auto; padding: 10mm 11mm 14mm; background: #fff; box-shadow: 0 8px 30px rgba(15,23,42,.18); position: relative; }
  .hoja + .hoja { break-before: page; }
  .logos { display: flex; justify-content: space-between; align-items: center; height: 18mm; margin-bottom: 3mm; }
  .logos .der { display: flex; align-items: center; gap: 5mm; }
  .logo-sep { height: 11mm; } .logo-tec { height: 13mm; } .logo-itc { height: 17mm; }
  .titulo { border: 1.3px solid #111827; text-align: center; padding: 5px 8px; }
  .titulo h1 { margin: 0; font-size: 13px; text-transform: uppercase; }
  .titulo h2 { margin: 2px 0 0; font-size: 12px; text-transform: uppercase; color: #1B396A; }
  .meta { display: flex; justify-content: space-between; font-size: 9.5px; color: #475569; margin: 4px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  thead { display: table-header-group; }
  th { background: #1B396A; color: #fff; border: 1px solid #1B396A; padding: 4px 2px; font-size: 8px; }
  th.vert { height: 34mm; vertical-align: bottom; }
  th.vert span { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; display: inline-block; }
  td { border: 1px solid #94a3b8; padding: 3px; text-align: center; }
  td.num { font-weight: 800; font-family: Consolas, monospace; white-space: nowrap; }
  td.si { color: #15803d; font-weight: 900; }
  td.si small { font-size: 7.5px; font-weight: 700; white-space: nowrap; }
  td.no { color: #b91c1c; background: #fef2f2; }
  tr.total td { background: #f1f5f9; font-weight: 700; font-size: 8px; }
  tr { break-inside: avoid; }
  th, td.no, tr.total td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h3 { font-size: 11px; text-transform: uppercase; color: #1B396A; margin: 7mm 0 3mm; border-bottom: 1.5px solid #1B396A; padding-bottom: 2px; }
  .pend { display: grid; grid-template-columns: 52mm 1fr; border-bottom: 1px solid #e2e8f0; font-size: 9.5px; padding: 3px 0; break-inside: avoid; }
  .pend b { color: #111827; } .pend span { color: #334155; }
  .ok { font-size: 10px; color: #15803d; padding: 6px 0; }
  .pie { position: absolute; left: 11mm; right: 11mm; bottom: 5mm; text-align: center; font-size: 8px; color: #6b7280; }
  @page { size: Letter landscape; margin: 0; }
  @media print { body { background: #fff; } .barra { display: none; } .hoja { margin: 0; box-shadow: none; width: auto; } }
</style>
</head>
<body>
<div class="barra">
  <div><strong>Software instalado e instalaciones pendientes</strong><br><span>Usa "Guardar como PDF" en el destino de impresión. Carta, horizontal.</span></div>
  <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
</div>

<?php foreach ($labs as $lab):
    $equipos = $inv->equipos($lab['id']);
    usort($equipos, static function ($a, $b) use ($lugares) {
        $ka = $a['lugar_id'] ? [$lugares[$a['lugar_id']]['fila'], $lugares[$a['lugar_id']]['columna']] : [999, 0];
        $kb = $b['lugar_id'] ? [$lugares[$b['lugar_id']]['fila'], $lugares[$b['lugar_id']]['columna']] : [999, 0];
        return $ka <=> $kb ?: strnatcmp($a['numero'], $b['numero']);
    });
    $n = count($equipos);
?>
<section class="hoja">
  <div class="logos">
    <img class="logo-sep" src="<?= $img ?>sep.png" alt="SEP">
    <div class="der"><img class="logo-tec" src="<?= $img ?>tecnm.png" alt="TecNM"><img class="logo-itc" src="<?= $img ?>comitan.png" alt="ITC"></div>
  </div>
  <div class="titulo"><h1>Software instalado por equipo</h1><h2><?= h($lab['nombre']) ?></h2></div>
  <div class="meta"><span><?= h(INSTITUCION) ?> · Comitán de Domínguez, Chiapas</span><span>Fecha de corte: <?= h($fecha) ?></span></div>

  <?php if (!$programas || !$equipos): ?>
    <p class="ok">No hay programas o equipos para mostrar.</p>
  <?php else: ?>
  <table>
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
  <div class="pie">SIGLAB · Sistema de Gestión de Laboratorios · Generado el <?= date('d/m/Y H:i') ?> por <?= h($yo['nombre']) ?></div>
</section>
<?php endforeach; ?>

<?php if ($auto): ?><script>window.addEventListener('load', () => setTimeout(() => window.print(), 500));</script><?php endif; ?>
</body>
</html>
