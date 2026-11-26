<?php
// ctrl/php/_bootstrap.php — Base común de todas las APIs:
// sesión segura, respuesta JSON, autenticación, roles y protección CSRF.

declare(strict_types=1);

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/conexionBD.php';
require_once __DIR__ . '/../../config/sesion.php';
require_once __DIR__ . '/../../model/php/UsuarioModelo.php';

function iniciar_sesion(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    abrir_sesion();

    // Cierre por inactividad
    $ahora = time();
    if (isset($_SESSION['ultimo_mov']) && $ahora - $_SESSION['ultimo_mov'] > SESION_INACTIVIDAD) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['ultimo_mov'] = $ahora;

    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function json_out(array $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function error_out(string $mensaje, int $code = 400): never
{
    json_out(['ok' => false, 'mensaje' => $mensaje], $code);
}

/** Cuerpo JSON de la petición. */
function entrada(): array
{
    static $datos = null;
    if ($datos !== null) return $datos;
    $raw = file_get_contents('php://input') ?: '';
    $json = json_decode($raw, true);
    return $datos = is_array($json) ? $json : $_POST;
}

function solo_metodo(string $metodo): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $metodo) error_out('Método no permitido.', 405);
}

function verificar_csrf(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf'] ?? '');
    if (!is_string($token) || !hash_equals($_SESSION['csrf'] ?? '', $token)) {
        error_out('La sesión expiró o la petición no es válida. Recarga la página.', 419);
    }
}

/** Devuelve el usuario en sesión (revalidado contra la BD) o responde 401. */
function usuario_actual(bool $permitirCambioPendiente = false): array
{
    $id = (int)($_SESSION['usuario_id'] ?? 0);
    if ($id <= 0) error_out('Tu sesión terminó. Inicia sesión de nuevo.', 401);

    $u = (new UsuarioModelo())->porId($id);
    if (!$u || (int)$u['activo'] !== 1) {
        $_SESSION = [];
        error_out('Tu cuenta ya no está activa.', 401);
    }
    if (!$permitirCambioPendiente && (int)$u['debe_cambiar'] === 1) {
        error_out('Debes cambiar tu contraseña antes de continuar.', 403);
    }
    return $u;
}

function requerir_admin(array $u): void
{
    if ($u['rol'] !== 'admin') error_out('Solo un administrador puede hacer esto.', 403);
}

/** Atajo para APIs de escritura: POST + CSRF + admin. */
function admin_escritura(): array
{
    solo_metodo('POST');
    verificar_csrf();
    $u = usuario_actual();
    requerir_admin($u);
    return $u;
}

function texto($v, int $max): string
{
    $v = trim(preg_replace('/\s+/u', ' ', (string)($v ?? '')));
    return mb_substr($v, 0, $max, 'UTF-8');
}

function ip_cliente(): string
{
    // En Render todas las peticiones llegan desde su proxy: la IP real viene en las cabeceras.
    // Solo se confía en ellas si el servidor lo indica (TRUST_PROXY=1), para que no se puedan falsificar en local.
    if (getenv('TRUST_PROXY') === '1') {
        foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_TRUE_CLIENT_IP', 'HTTP_X_FORWARDED_FOR'] as $h) {
            $v = trim(explode(',', (string)($_SERVER[$h] ?? ''))[0]);
            if ($v !== '' && filter_var($v, FILTER_VALIDATE_IP)) return substr($v, 0, 45);
        }
    }
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

function es_duplicado(Throwable $t): bool
{
    return $t instanceof PDOException && in_array((string)$t->getCode(), ['23000', '23505'], true);
}

set_exception_handler(static function (Throwable $t): void {
    error_log('[SIGLAB] ' . $t->getMessage() . ' @ ' . $t->getFile() . ':' . $t->getLine());
    if ($t instanceof ErrorConexionBD) {
        error_out($t->getMessage(), 503);
    }
    if (es_duplicado($t)) {
        error_out('Ya existe un registro con esos datos.', 409);
    }
    error_out('Ocurrió un error interno. Intenta de nuevo; si persiste, revisa el registro del servidor.', 500);
});

iniciar_sesion();
