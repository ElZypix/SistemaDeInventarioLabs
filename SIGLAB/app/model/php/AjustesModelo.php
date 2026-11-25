<?php
// model/php/AjustesModelo.php — Ajustes generales clave/valor (último respaldo, perfil base por laboratorio).

declare(strict_types=1);
require_once __DIR__ . '/../../config/conexionBD.php';

final class AjustesModelo
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Conexion::obtener();
    }

    public function todos(): array
    {
        $out = [];
        foreach ($this->db->query('SELECT clave, valor FROM ajustes') as $r) $out[$r['clave']] = $r['valor'];
        return $out;
    }

    public function obtener(string $clave): ?string
    {
        $st = $this->db->prepare('SELECT valor FROM ajustes WHERE clave = ?');
        $st->execute([$clave]);
        $v = $st->fetchColumn();
        return $v === false ? null : $v;
    }

    /** Guarda (o borra si $valor es null) un ajuste. */
    public function guardar(string $clave, ?string $valor): void
    {
        $this->db->prepare('DELETE FROM ajustes WHERE clave = ?')->execute([$clave]);
        if ($valor !== null) {
            $this->db->prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?)')->execute([$clave, $valor]);
        }
    }
}
