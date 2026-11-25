<?php
// config/conexionBD.php — Conexión PDO única (se reutiliza en toda la petición).

declare(strict_types=1);
require_once __DIR__ . '/config.php';

/** Error de conexión con un mensaje claro y seguro (sin contraseñas) para mostrar al usuario. */
final class ErrorConexionBD extends RuntimeException {}

final class Conexion
{
    private static ?PDO $pdo = null;

    public static function obtener(): PDO
    {
        if (self::$pdo !== null) return self::$pdo;

        if (DB_DSN === '' && !extension_loaded('pdo_mysql')) {
            throw new ErrorConexionBD('PHP no tiene activada la extensión pdo_mysql. Actívala en php.ini (extension=pdo_mysql) y reinicia Apache.');
        }

        $dsn = DB_DSN !== ''
            ? DB_DSN
            : 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            error_log('[SIGLAB] Conexión BD: ' . $e->getMessage());
            $codigo = (int)($e->errorInfo[1] ?? 0);
            $msg = $e->getMessage();
            if ($codigo === 1049 || stripos($msg, 'Unknown database') !== false) {
                throw new ErrorConexionBD('No existe la base de datos "' . DB_NAME . '". Importa el archivo db/siglab.sql en phpMyAdmin o HeidiSQL.');
            }
            if ($codigo === 1045 || stripos($msg, 'Access denied') !== false) {
                throw new ErrorConexionBD('MySQL rechazó el usuario "' . DB_USER . '". Revisa usuario y contraseña en config/config.local.php.');
            }
            if ($codigo === 2002 || stripos($msg, 'refused') !== false || stripos($msg, 'getaddrinfo') !== false) {
                throw new ErrorConexionBD('No se pudo conectar a MySQL en ' . DB_HOST . ':' . DB_PORT . '. Verifica que MySQL/MariaDB esté encendido.');
            }
            throw new ErrorConexionBD('No se pudo conectar a la base de datos. Revisa config/config.local.php y el registro de errores de PHP.');
        }

        if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
            $pdo->exec('PRAGMA foreign_keys = ON');
        } else {
            $pdo->exec("SET time_zone = '-06:00'");
        }
        return self::$pdo = $pdo;
    }

    public static function esMysql(): bool
    {
        return self::obtener()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    }
}
