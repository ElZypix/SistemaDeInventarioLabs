<?php
// ctrl/php/authApi.php — Inicio/cierre de sesión, sesión actual, cambio de contraseña y tema.

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../model/php/SeguridadModelo.php';

$accion = $_GET['accion'] ?? '';
$usuarios = new UsuarioModelo();

switch ($accion) {

    case 'login':
        solo_metodo('POST');
        verificar_csrf();
        $d = entrada();
        $login = texto($d['usuario'] ?? '', 40);
        $pass = (string)($d['password'] ?? '');
        if ($login === '' || $pass === '') error_out('Escribe tu usuario y contraseña.');

        $seg = new SeguridadModelo();
        $ip = ip_cliente();
        $espera = $seg->segundosBloqueo($login, $ip);
        if ($espera > 0) {
            json_out(['ok' => false, 'mensaje' => 'Demasiados intentos. Espera un momento.', 'bloqueo' => $espera], 429);
        }

        $u = $usuarios->porUsuario($login);
        $valido = $u && (int)$u['activo'] === 1 && password_verify($pass, $u['password_hash']);
        if (!$valido) {
            $seg->registrarFallo($login, $ip);
            $espera = $seg->segundosBloqueo($login, $ip);
            json_out(['ok' => false, 'mensaje' => 'Usuario o contraseña incorrectos.', 'bloqueo' => $espera], $espera > 0 ? 429 : 401);
        }

        $seg->limpiar($login, $ip);
        $usuarios->actualizarHashSiHaceFalta((int)$u['id'], $pass, $u['password_hash']);
        $usuarios->registrarAcceso((int)$u['id']);
        session_regenerate_id(true);
        $_SESSION['usuario_id'] = (int)$u['id'];
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        json_out(['ok' => true, 'usuario' => UsuarioModelo::publico($u), 'csrf' => $_SESSION['csrf']]);

    case 'sesion':
        $u = usuario_actual(true);
        json_out(['ok' => true, 'usuario' => UsuarioModelo::publico($u), 'csrf' => $_SESSION['csrf']]);

    case 'logout':
        solo_metodo('POST');
        verificar_csrf();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
        json_out(['ok' => true]);

    case 'cambiarPassword':
        solo_metodo('POST');
        verificar_csrf();
        $u = usuario_actual(true);
        $d = entrada();
        $actual = (string)($d['actual'] ?? '');
        $nueva = (string)($d['nueva'] ?? '');
        if (!password_verify($actual, $u['password_hash'])) error_out('La contraseña actual no es correcta.');
        if (mb_strlen($nueva) < 8) error_out('La nueva contraseña debe tener al menos 8 caracteres.');
        if (!preg_match('/[A-Za-z]/', $nueva) || !preg_match('/\d/', $nueva)) error_out('La nueva contraseña debe combinar letras y números.');
        if (hash_equals($actual, $nueva)) error_out('La nueva contraseña debe ser diferente a la actual.');
        $usuarios->cambiarPassword((int)$u['id'], $nueva);
        json_out(['ok' => true, 'mensaje' => 'Contraseña actualizada.']);

    case 'tema':
        solo_metodo('POST');
        verificar_csrf();
        $u = usuario_actual(true);
        $tema = (entrada()['tema'] ?? '') === 'dark' ? 'dark' : 'light';
        $usuarios->guardarTema((int)$u['id'], $tema);
        json_out(['ok' => true, 'tema' => $tema]);

    case 'csrf':
        // Token para el formulario de inicio de sesión.
        json_out(['ok' => true, 'csrf' => $_SESSION['csrf']]);

    default:
        error_out('Acción no válida.', 404);
}
