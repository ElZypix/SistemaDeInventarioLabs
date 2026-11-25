<?php
// ctrl/php/componentesApi.php — Catálogo de componentes (modelo, procesador, gráfica, motherboard).

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../model/php/CatalogoModelo.php';

$accion = $_GET['accion'] ?? '';
$cat = new CatalogoModelo();
$tipos = array_keys(CatalogoModelo::TIPOS_COMPONENTE);

switch ($accion) {

    case 'listar':
        usuario_actual();
        json_out(['ok' => true, 'items' => $cat->componentes()]);

    case 'asegurar':
        admin_escritura();
        $d = entrada();
        $tipo = in_array($d['tipo'] ?? '', $tipos, true) ? $d['tipo'] : '';
        if ($tipo === '') error_out('Tipo de componente no válido.');
        $nombre = texto((string)($d['nombre'] ?? ''), 100);
        if ($nombre === '') error_out('Escribe el nombre.');
        $id = $cat->asegurarComponente($tipo, $nombre);
        $items = $cat->componentes();
        json_out(['ok' => true, 'item' => array_values(array_filter($items, static fn($x) => $x['id'] === $id))[0] ?? null, 'items' => $items]);

    case 'guardar':
        admin_escritura();
        $d = entrada();
        $c = $cat->componente((int)($d['id'] ?? 0));
        if (!$c) error_out('Ese componente ya no existe.', 404);
        $nombre = texto((string)($d['nombre'] ?? $c['nombre']), 100);
        if ($nombre === '') error_out('Escribe el nombre.');
        $otro = $cat->buscarComponente($c['tipo'], $nombre);
        if ($otro && $otro !== (int)$c['id']) error_out("Ya existe \"$nombre\".", 409);
        $cat->guardarComponente((int)$c['id'], $nombre, !array_key_exists('activo', $d) || (bool)$d['activo']);
        json_out(['ok' => true, 'items' => $cat->componentes(), 'mensaje' => "\"$nombre\" guardado."]);

    case 'eliminar':
        admin_escritura();
        $id = (int)(entrada()['id'] ?? 0);
        $item = array_values(array_filter($cat->componentes(), static fn($x) => $x['id'] === $id))[0] ?? null;
        if (!$item) error_out('Ese componente ya no existe.', 404);
        if ($item['usos'] > 0) error_out("Está asignado a {$item['usos']} equipo" . ($item['usos'] === 1 ? '' : 's') . '. Desactívalo en lugar de eliminarlo.', 409);
        $cat->eliminarComponente($id);
        json_out(['ok' => true, 'items' => $cat->componentes(), 'mensaje' => 'Eliminado del catálogo.']);

    default:
        error_out('Acción no válida.', 404);
}
