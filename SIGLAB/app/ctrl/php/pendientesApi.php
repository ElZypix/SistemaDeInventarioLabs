<?php
// ctrl/php/pendientesApi.php — Pendientes por equipo.

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../model/php/PendienteModelo.php';
require_once __DIR__ . '/../../model/php/InventarioModelo.php';

$accion = $_GET['accion'] ?? '';
$pend = new PendienteModelo();

switch ($accion) {

    case 'listar':
        usuario_actual();
        $lab = isset($_GET['lab']) && $_GET['lab'] !== '' ? (int)$_GET['lab'] : null;
        $equipo = (int)($_GET['equipo'] ?? 0);
        json_out(['ok' => true, 'pendientes' => $equipo ? $pend->porEquipo($equipo) : $pend->listar($lab)]);

    case 'crear':
        $u = admin_escritura();
        $d = entrada();
        $e = (new InventarioModelo())->equipo((int)($d['equipo_id'] ?? 0));
        if (!$e) error_out('El equipo ya no existe.', 404);
        $texto = texto($d['texto'] ?? '', 200);
        if ($texto === '') error_out('Escribe qué hay que hacer.');
        $resp = texto($d['responsable'] ?? '', 80) ?: null;
        $pend->crear($e['id'], $texto, $resp, (int)$u['id']);
        json_out(['ok' => true, 'pendientes' => $pend->porEquipo($e['id']), 'mensaje' => 'Pendiente agregado.']);

    case 'marcar':
        admin_escritura();
        $d = entrada();
        $p = $pend->obtener((int)($d['id'] ?? 0));
        if (!$p) error_out('El pendiente ya no existe.', 404);
        $pend->marcar((int)$p['id'], (bool)($d['hecho'] ?? false));
        json_out(['ok' => true, 'pendientes' => $pend->porEquipo((int)$p['equipo_id'])]);

    case 'eliminar':
        admin_escritura();
        $p = $pend->obtener((int)(entrada()['id'] ?? 0));
        if (!$p) error_out('El pendiente ya no existe.', 404);
        $pend->eliminar((int)$p['id']);
        json_out(['ok' => true, 'pendientes' => $pend->porEquipo((int)$p['equipo_id']), 'mensaje' => 'Pendiente eliminado.']);

    default:
        error_out('Acción no válida.', 404);
}
