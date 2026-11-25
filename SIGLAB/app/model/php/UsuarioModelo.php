<?php
// model/php/UsuarioModelo.php — Usuarios, roles y preferencias.

declare(strict_types=1);
require_once __DIR__ . '/../../config/conexionBD.php';

final class UsuarioModelo
{
    public const ROLES = ['admin', 'visualizador'];
    private PDO $db;

    public function __construct()
    {
        $this->db = Conexion::obtener();
    }

    public function porUsuario(string $usuario): ?array
    {
        $st = $this->db->prepare('SELECT * FROM usuarios WHERE usuario = ?');
        $st->execute([$usuario]);
        return $st->fetch() ?: null;
    }

    public function porId(int $id): ?array
    {
        $st = $this->db->prepare('SELECT * FROM usuarios WHERE id = ?');
        $st->execute([$id]);
        return $st->fetch() ?: null;
    }

    /** Datos seguros para enviar al navegador. */
    public static function publico(array $u): array
    {
        return [
            'id'            => (int)$u['id'],
            'nombre'        => $u['nombre'],
            'usuario'       => $u['usuario'],
            'rol'           => $u['rol'],
            'tema'          => $u['tema'],
            'activo'        => (int)$u['activo'] === 1,
            'debe_cambiar'  => (int)$u['debe_cambiar'] === 1,
            'ultimo_acceso' => $u['ultimo_acceso'],
        ];
    }

    public function listar(): array
    {
        $rows = $this->db->query('SELECT * FROM usuarios ORDER BY rol, nombre')->fetchAll();
        return array_map([self::class, 'publico'], $rows);
    }

    public function registrarAcceso(int $id): void
    {
        $this->db->prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?')
                 ->execute([date('Y-m-d H:i:s'), $id]);
    }

    public function contarAdminsActivos(?int $excepto = null): int
    {
        $sql = "SELECT COUNT(*) FROM usuarios WHERE rol = 'admin' AND activo = 1";
        $par = [];
        if ($excepto !== null) { $sql .= ' AND id <> ?'; $par[] = $excepto; }
        $st = $this->db->prepare($sql);
        $st->execute($par);
        return (int)$st->fetchColumn();
    }

    public function crear(string $nombre, string $usuario, string $rol, bool $activo, string $password): int
    {
        $st = $this->db->prepare('INSERT INTO usuarios (nombre, usuario, password_hash, rol, activo, debe_cambiar, creado_en)
                                  VALUES (?, ?, ?, ?, ?, 1, ?)');
        $st->execute([$nombre, $usuario, password_hash($password, PASSWORD_DEFAULT), $rol, $activo ? 1 : 0, date('Y-m-d H:i:s')]);
        return (int)$this->db->lastInsertId();
    }

    public function actualizar(int $id, string $nombre, string $usuario, string $rol, bool $activo): void
    {
        $this->db->prepare('UPDATE usuarios SET nombre = ?, usuario = ?, rol = ?, activo = ? WHERE id = ?')
                 ->execute([$nombre, $usuario, $rol, $activo ? 1 : 0, $id]);
    }

    /** $forzarCambio = true cuando un admin la restablece: el usuario deberá cambiarla al entrar. */
    public function cambiarPassword(int $id, string $password, bool $forzarCambio = false): void
    {
        $this->db->prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar = ? WHERE id = ?')
                 ->execute([password_hash($password, PASSWORD_DEFAULT), $forzarCambio ? 1 : 0, $id]);
    }

    public function actualizarHashSiHaceFalta(int $id, string $password, string $hash): void
    {
        if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
            $this->db->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')
                     ->execute([password_hash($password, PASSWORD_DEFAULT), $id]);
        }
    }

    public function guardarTema(int $id, string $tema): void
    {
        $this->db->prepare('UPDATE usuarios SET tema = ? WHERE id = ?')->execute([$tema, $id]);
    }

    public function eliminar(int $id): void
    {
        $this->db->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
    }

    public function existeUsuario(string $usuario, int $exceptoId = 0): bool
    {
        $st = $this->db->prepare('SELECT COUNT(*) FROM usuarios WHERE usuario = ? AND id <> ?');
        $st->execute([$usuario, $exceptoId]);
        return (int)$st->fetchColumn() > 0;
    }
}
