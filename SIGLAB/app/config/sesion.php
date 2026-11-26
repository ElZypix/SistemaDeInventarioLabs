<?php
// config/sesion.php — Inicio de sesión PHP común (login, app y APIs).
// En línea (Render) las sesiones se guardan en la tabla `sesiones`, porque el disco del
// servidor se borra cada vez que se reinicia o se duerme.

declare(strict_types=1);
require_once __DIR__ . '/config.php';

final class SesionBD implements SessionHandlerInterface
{
    private ?PDO $db = null;
    private function db(): PDO
    {
        require_once __DIR__ . '/conexionBD.php';
        return $this->db ??= Conexion::obtener();
    }
    public function open(string $path, string $name): bool { return true; }
    public function close(): bool { return true; }
    public function read(string $id): string|false
    {
        $st = $this->db()->prepare('SELECT datos FROM sesiones WHERE id = ? AND expira > ?');
        $st->execute([$id, time()]);
        $v = $st->fetchColumn();
        return $v === false ? '' : (string)$v;
    }
    public function write(string $id, string $data): bool
    {
        $expira = time() + SESION_INACTIVIDAD + 600;
        $db = $this->db();
        $st = $db->prepare('UPDATE sesiones SET datos = ?, expira = ? WHERE id = ?');
        $st->execute([$data, $expira, $id]);
        if ($st->rowCount() === 0) {
            try {
                $db->prepare('INSERT INTO sesiones (id, datos, expira) VALUES (?, ?, ?)')->execute([$id, $data, $expira]);
            } catch (PDOException) {
                // Otra petición la creó al mismo tiempo: basta con actualizarla
                $db->prepare('UPDATE sesiones SET datos = ?, expira = ? WHERE id = ?')->execute([$data, $expira, $id]);
            }
        }
        return true;
    }
    public function destroy(string $id): bool
    {
        $this->db()->prepare('DELETE FROM sesiones WHERE id = ?')->execute([$id]);
        return true;
    }
    public function gc(int $max_lifetime): int|false
    {
        $st = $this->db()->prepare('DELETE FROM sesiones WHERE expira < ?');
        $st->execute([time()]);
        return $st->rowCount();
    }
}

/** ¿La petición llegó por HTTPS? (Render termina el HTTPS en su proxy y avisa con X-Forwarded-Proto) */
function es_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (getenv('TRUST_PROXY') === '1' && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function abrir_sesion(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('SIGLAB_SID');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => es_https(), 'httponly' => true, 'samesite' => 'Lax']);
    ini_set('session.use_strict_mode', '1');
    if (SESIONES_BD) {
        ini_set('session.gc_probability', '1');
        ini_set('session.gc_divisor', '50');
        session_set_save_handler(new SesionBD(), true);
    }
    session_start();
}
