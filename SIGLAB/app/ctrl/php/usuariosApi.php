<?php
// ctrl/php/usuariosApi.php — Gestión de usuarios (solo administradores).

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$accion = $_GET['accion'] ?? '';
$usuarios = new UsuarioModelo();

function validar_password(string $p): void
{
    if (mb_strlen($p) < 8) error_out('La contraseña debe tener al menos 8 caracteres.');
    if (!preg_match('/[A-Za-z]/', $p) || !preg_match('/\d/', $p)) error_out('La contraseña debe combinar letras y números.');
}

switch ($accion) {

    case 'listar':
        $u = usuario_actual();
        requerir_admin($u);
        json_out(['ok' => true, 'usuarios' => $usuarios->listar()]);

    case 'guardar':
        $yo = admin_escritura();
        $d = entrada();
        $id = (int)($d['id'] ?? 0);
        $nombre = texto($d['nombre'] ?? '', 120);
        $login = strtolower(texto($d['usuario'] ?? '', 40));
        $rol = in_array($d['rol'] ?? '', UsuarioModelo::ROLES, true) ? $d['rol'] : 'visualizador';
        $activo = !array_key_exists('activo', $d) || (bool)$d['activo'];

        if ($nombre === '') error_out('Escribe el nombre completo.');
        if (!preg_match('/^[a-z0-9._-]{3,40}$/', $login)) error_out('El usuario debe tener de 3 a 40 caracteres: letras, números, punto, guion o guion bajo.');
        if ($usuarios->existeUsuario($login, $id)) error_out("El usuario \"$login\" ya existe.", 409);

        if ($id) {
            $actual = $usuarios->porId($id);
            if (!$actual) error_out('El usuario ya no existe.', 404);
            $dejaDeSerAdmin = $actual['rol'] === 'admin' && ($rol !== 'admin' || !$activo);
            if ($id === (int)$yo['id'] && $dejaDeSerAdmin) error_out('No puedes quitarte el rol de administrador ni desactivar tu propia cuenta.');
            if ($dejaDeSerAdmin && $usuarios->contarAdminsActivos($id) === 0) error_out('Debe quedar al menos un administrador activo.');
            $usuarios->actualizar($id, $nombre, $login, $rol, $activo);
            $msg = 'Usuario actualizado.';
        } else {
            $pass = (string)($d['password'] ?? '');
            validar_password($pass);
            $id = $usuarios->crear($nombre, $login, $rol, $activo, $pass);
            $msg = 'Usuario creado. Deberá cambiar su contraseña al entrar por primera vez.';
        }
        json_out(['ok' => true, 'usuarios' => $usuarios->listar(), 'mensaje' => $msg]);

    case 'restablecer':
        $yo = admin_escritura();
        $d = entrada();
        $id = (int)($d['id'] ?? 0);
        if ($id === (int)$yo['id']) error_out('Para tu propia cuenta usa "Cambiar contraseña".');
        if (!$usuarios->porId($id)) error_out('El usuario ya no existe.', 404);
        $pass = (string)($d['password'] ?? '');
        validar_password($pass);
        $usuarios->cambiarPassword($id, $pass, true);
        json_out(['ok' => true, 'mensaje' => 'Contraseña restablecida. Se pedirá cambiarla al entrar.']);

    case 'eliminar':
        $yo = admin_escritura();
        $id = (int)(entrada()['id'] ?? 0);
        if ($id === (int)$yo['id']) error_out('No puedes eliminar tu propia cuenta.');
        $u = $usuarios->porId($id);
        if (!$u) error_out('El usuario ya no existe.', 404);
        if ($u['rol'] === 'admin' && (int)$u['activo'] === 1 && $usuarios->contarAdminsActivos($id) === 0) {
            error_out('Debe quedar al menos un administrador activo.');
        }
        $usuarios->eliminar($id);
        json_out(['ok' => true, 'usuarios' => $usuarios->listar(), 'mensaje' => 'Usuario eliminado.']);

    default:
        error_out('Acción no válida.', 404);
}
