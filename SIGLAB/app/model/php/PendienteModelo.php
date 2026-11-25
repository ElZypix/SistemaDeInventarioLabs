<?php
// model/php/PendienteModelo.php — Pendientes (tareas) por equipo.

declare(strict_types=1);
require_once __DIR__ . '/../../config/conexionBD.php';

final class PendienteModelo
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Conexion::obtener();
    }

    /** Lista pendientes; $labId = null para todos los laboratorios. */
    public function listar(?int $labId = null, bool $conHechos = true): array
    {
        $sql = 'SELECT p.*, e.numero, e.laboratorio_id, u.nombre AS creado_por_nombre
                FROM pendientes p
                INNER JOIN equipos e ON e.id = p.equipo_id
                LEFT JOIN usuarios u ON u.id = p.creado_por WHERE 1 = 1';
        $par = [];
        if ($labId !== null) { $sql .= ' AND e.laboratorio_id = ?'; $par[] = $labId; }
        if (!$conHechos) $sql .= ' AND p.hecho = 0';
        $st = $this->db->prepare($sql . ' ORDER BY p.hecho, p.creado_en DESC');
        $st->execute($par);
        return array_map(static fn($r) => [
            'id'             => (int)$r['id'],
            'equipo_id'      => (int)$r['equipo_id'],
            'numero'         => $r['numero'],
            'laboratorio_id' => (int)$r['laboratorio_id'],
            'texto'          => $r['texto'],
            'responsable'    => $r['responsable'],
            'hecho'          => (int)$r['hecho'] === 1,
            'creado_en'      => $r['creado_en'],
            'creado_por'     => $r['creado_por_nombre'],
            'hecho_en'       => $r['hecho_en'],
        ], $st->fetchAll());
    }

    public function porEquipo(int $equipoId): array
    {
        return array_values(array_filter($this->listar(null), static fn($p) => $p['equipo_id'] === $equipoId));
    }

    public function obtener(int $id): ?array
    {
        $st = $this->db->prepare('SELECT * FROM pendientes WHERE id = ?');
        $st->execute([$id]);
        return $st->fetch() ?: null;
    }

    public function crear(int $equipoId, string $texto, ?string $responsable, int $usuarioId): int
    {
        $this->db->prepare('INSERT INTO pendientes (equipo_id, texto, responsable, hecho, creado_en, creado_por) VALUES (?, ?, ?, 0, ?, ?)')
                 ->execute([$equipoId, $texto, $responsable, date('Y-m-d H:i:s'), $usuarioId]);
        return (int)$this->db->lastInsertId();
    }

    public function marcar(int $id, bool $hecho): void
    {
        $this->db->prepare('UPDATE pendientes SET hecho = ?, hecho_en = ? WHERE id = ?')
                 ->execute([$hecho ? 1 : 0, $hecho ? date('Y-m-d H:i:s') : null, $id]);
    }

    public function eliminar(int $id): void
    {
        $this->db->prepare('DELETE FROM pendientes WHERE id = ?')->execute([$id]);
    }
}
