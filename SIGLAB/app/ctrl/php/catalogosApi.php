<?php
// ctrl/php/catalogosApi.php — Alta, edición y baja de sistemas operativos y software.

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../model/php/CatalogoModelo.php';

$accion = $_GET['accion'] ?? '';
$tipo = (string)($_GET['tipo'] ?? '');
if (!CatalogoModelo::valido($tipo)) error_out('Catálogo no válido.', 404);
$cat = new CatalogoModelo();

/** Valida familia / distribución / versión de un sistema operativo. */
function datos_so(array $d): array
{
    $familia = in_array($d['familia'] ?? '', CatalogoModelo::FAMILIAS, true) ? $d['familia'] : '';
    if ($familia === '') error_out('Elige la familia del sistema (Windows, Linux, macOS u otro).');
    $distro = texto($d['distribucion'] ?? '', 60) ?: null;
    $version = texto($d['version'] ?? '', 40) ?: null;
    if (in_array($familia, ['linux', 'otro'], true) && !$distro) {
        error_out($familia === 'linux' ? 'Escribe el nombre de la distribución.' : 'Escribe el nombre del sistema.');
    }
    return [$familia, $distro, $version];
}

/** Valida programa / versión / categoría de un software. */
function datos_sw(array $d): array
{
    $programa = texto($d['programa'] ?? ($d['nombre'] ?? ''), 80);
    if ($programa === '') error_out('Escribe el nombre del programa.');
    $version = texto($d['version'] ?? '', 40) ?: null;
    $categoria = texto($d['categoria'] ?? '', 40);
    return [$programa, $version, $categoria];
}

function item_de(array $items, int $id): ?array
{
    return array_values(array_filter($items, static fn($x) => $x['id'] === $id))[0] ?? null;
}

switch ($accion) {

    case 'listar':
        usuario_actual();
        json_out(['ok' => true, 'items' => $cat->listar($tipo)]);

    case 'asegurar':
        // Sistema operativo por familia/distribución/versión: lo encuentra o lo crea (para "Otro…" y la cascada).
        admin_escritura();
        if ($tipo === 'software') {
            [$programa, $version, $categoria] = datos_sw(entrada());
            $id = $cat->asegurarSW($programa, $version, $categoria);
            $items = $cat->listar('software');
            json_out(['ok' => true, 'item' => item_de($items, $id), 'items' => $items]);
        }
        [$familia, $distro, $version] = datos_so(entrada());
        $id = $cat->asegurarSO($familia, $distro, $version);
        $items = $cat->listar('so');
        $item = array_values(array_filter($items, static fn($x) => $x['id'] === $id))[0] ?? null;
        json_out(['ok' => true, 'item' => $item, 'items' => $items]);

    case 'guardar':
        admin_escritura();
        $d = entrada();
        if ($tipo === 'so') {
            $id = (int)($d['id'] ?? 0) ?: null;
            [$familia, $distro, $version] = datos_so($d);
            $otro = $cat->buscarSO($familia, $distro, $version);
            $nombre = CatalogoModelo::nombreSO($familia, $distro, $version);
            if ($otro && $otro !== $id) error_out("Ya existe \"$nombre\" en el catálogo.", 409);
            $activo = !array_key_exists('activo', $d) || (bool)$d['activo'];
            $nuevoId = $cat->guardarSO($id, $familia, $distro, $version, $activo);
            $items = $cat->listar('so');
            $item = array_values(array_filter($items, static fn($x) => $x['id'] === $nuevoId))[0] ?? null;
            json_out(['ok' => true, 'item' => $item, 'items' => $items, 'mensaje' => "\"$nombre\" guardado."]);
        }
        // Software: programa + versión opcional; la categoría es del programa
        $id = (int)($d['id'] ?? 0) ?: null;
        [$programa, $version, $categoria] = datos_sw($d);
        $nombre = CatalogoModelo::nombreSW($programa, $version);
        $otro = $cat->buscarSW($programa, $version);
        if ($otro && $otro !== $id) error_out("Ya existe \"$nombre\" en el catálogo.", 409);
        if ($categoria === '') $categoria = $cat->categoriaDe($programa) ?? 'General';
        $activo = !array_key_exists('activo', $d) || (bool)$d['activo'];
        $nuevoId = $cat->guardarSW($id, $programa, $version, $categoria, $activo);
        $items = $cat->listar('software');
        json_out(['ok' => true, 'item' => item_de($items, $nuevoId), 'items' => $items, 'mensaje' => "\"$nombre\" guardado."]);


    case 'eliminar':
        admin_escritura();
        $id = (int)(entrada()['id'] ?? 0);
        $usos = $cat->usos($tipo, $id);
        if ($usos > 0) {
            error_out("Está asignado a $usos equipo" . ($usos === 1 ? '' : 's') . '. Desactívalo en lugar de eliminarlo, o quítalo de esos equipos primero.', 409);
        }
        $cat->eliminar($tipo, $id);
        json_out(['ok' => true, 'items' => $cat->listar($tipo), 'mensaje' => 'Eliminado del catálogo.']);

    default:
        error_out('Acción no válida.', 404);
}
