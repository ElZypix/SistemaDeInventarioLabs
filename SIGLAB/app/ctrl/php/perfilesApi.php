<?php
// ctrl/php/perfilesApi.php — Perfiles de software (conjuntos de programas con nombre).

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../model/php/CatalogoModelo.php';

$accion = $_GET['accion'] ?? '';
$cat = new CatalogoModelo();

switch ($accion) {

    case 'listar':
        usuario_actual();
        json_out(['ok' => true, 'perfiles' => $cat->perfiles()]);

    case 'guardar':
        admin_escritura();
        $d = entrada();
        $id = (int)($d['id'] ?? 0) ?: null;
        if ($id && !$cat->perfilExiste($id)) error_out('El perfil ya no existe.', 404);
        $nombre = texto($d['nombre'] ?? '', 80);
        if ($nombre === '') error_out('Escribe el nombre del perfil.');
        if ($cat->perfilNombreUsado($nombre, (int)$id)) error_out("Ya existe un perfil llamado \"$nombre\".", 409);
        $software = $cat->idsExistentes('software', (array)($d['software'] ?? []));
        if (!$software) error_out('Elige al menos un programa para el perfil.');
        $cat->guardarPerfil($id, $nombre, $software);
        json_out(['ok' => true, 'perfiles' => $cat->perfiles(), 'mensaje' => "Perfil \"$nombre\" guardado."]);

    case 'eliminar':
        admin_escritura();
        $cat->eliminarPerfil((int)(entrada()['id'] ?? 0));
        json_out(['ok' => true, 'perfiles' => $cat->perfiles(), 'mensaje' => 'Perfil eliminado.']);

    default:
        error_out('Acción no válida.', 404);
}
