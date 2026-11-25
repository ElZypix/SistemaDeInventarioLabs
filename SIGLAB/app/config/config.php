<?php
// config/config.php — Configuración general de SIGLAB.
// Los valores se leen de variables de entorno (docker-compose). Si no existen
// (por ejemplo en Laragon/XAMPP), se usan los valores por defecto de abajo o
// los de config/config.local.php si lo creas a partir de config.local.example.php.

declare(strict_types=1);

if (defined('SIGLAB_CONFIG')) return;
define('SIGLAB_CONFIG', true);

$local = is_file(__DIR__ . '/config.local.php') ? require __DIR__ . '/config.local.php' : [];

$env = static function (string $clave, string $defecto) use ($local): string {
    $v = getenv($clave);
    if ($v !== false && $v !== '') return $v;
    return isset($local[$clave]) ? (string)$local[$clave] : $defecto;
};

define('APP_NOMBRE', 'SIGLAB');
define('APP_NOMBRE_LARGO', 'Sistema de Gestión de Laboratorios');
define('APP_VERSION', '1.5');
define('INSTITUCION', 'Instituto Tecnológico de Comitán');

define('DB_DSN',  $env('DB_DSN', ''));          // Solo para pruebas; normalmente vacío.
define('DB_HOST', $env('DB_HOST', 'localhost'));
define('DB_PORT', $env('DB_PORT', '3306'));
define('DB_NAME', $env('DB_NAME', 'siglab_db'));
define('DB_USER', $env('DB_USER', 'root'));
define('DB_PASS', $env('DB_PASS', ''));

// Carpeta de respaldos: fuera de la carpeta pública.
define('BACKUP_DIR', $env('BACKUP_DIR', dirname(__DIR__, 2) . '/backups'));

// Sesión: se cierra tras este tiempo de inactividad (segundos).
define('SESION_INACTIVIDAD', 2 * 60 * 60);

// Bloqueo de inicio de sesión: a partir de N fallos en la ventana, espera creciente.
define('LOGIN_FALLOS_PERMITIDOS', 3);
define('LOGIN_VENTANA_SEG', 15 * 60);
define('LOGIN_PENALIZACION_SEG', 15);

date_default_timezone_set('America/Mexico_City');
