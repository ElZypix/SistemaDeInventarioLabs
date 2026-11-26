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

        [$dsn, $usuario, $clave] = self::datosConexion();
        if (str_starts_with($dsn, 'mysql:') && !extension_loaded('pdo_mysql')) {
            throw new ErrorConexionBD('PHP no tiene activada la extensión pdo_mysql. Actívala en php.ini (extension=pdo_mysql) y reinicia Apache.');
        }
        if (str_starts_with($dsn, 'pgsql:') && !extension_loaded('pdo_pgsql')) {
            throw new ErrorConexionBD('PHP no tiene activada la extensión pdo_pgsql.');
        }

        try {
            $pdo = new PDO($dsn, $usuario, $clave, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                // PostgreSQL de Neon pasa por un "pooler" (PgBouncer) que no admite las sentencias
                // preparadas del servidor que usa PDO (al liberarlas manda DEALLOCATE y falla en
                // silencio, abortando la transacción). Con preparación emulada no hay ese problema.
                PDO::ATTR_EMULATE_PREPARES   => str_starts_with($dsn, 'pgsql:'),
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

        $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        if ($driver === 'sqlite') {
            $pdo->exec('PRAGMA foreign_keys = ON');
        } elseif ($driver === 'pgsql') {
            $pdo->exec("SET TIME ZONE 'America/Mexico_City'");
        } else {
            $pdo->exec("SET time_zone = '-06:00'");
        }
        return self::$pdo = $pdo;
    }

    /** [dsn, usuario, contraseña] según DATABASE_URL (PostgreSQL), DB_DSN (pruebas) o DB_HOST… (MySQL). */
    private static function datosConexion(): array
    {
        if (DATABASE_URL !== '') {
            $u = parse_url(DATABASE_URL);
            if (!$u || empty($u['host'])) throw new ErrorConexionBD('DATABASE_URL no es válida.');
            parse_str($u['query'] ?? '', $q);
            $dsn = 'pgsql:host=' . $u['host'] . ';port=' . ($u['port'] ?? 5432)
                 . ';dbname=' . ltrim($u['path'] ?? '/neondb', '/')
                 . ';sslmode=' . ($q['sslmode'] ?? 'require');
            return [$dsn, urldecode($u['user'] ?? ''), urldecode($u['pass'] ?? '')];
        }
        if (DB_DSN !== '') return [DB_DSN, DB_USER, DB_PASS];
        return ['mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS];
    }

    public static function driver(): string
    {
        return self::obtener()->getAttribute(PDO::ATTR_DRIVER_NAME);
    }

    public static function esMysql(): bool
    {
        return self::obtener()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    }
}
