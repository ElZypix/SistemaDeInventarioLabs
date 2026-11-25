<?php
// model/php/SeguridadModelo.php — Bloqueo progresivo por intentos fallidos.
// Se guarda en la base de datos (por usuario y por IP), así que borrar la cookie
// de sesión no reinicia el contador como pasaba en SUGACI.

declare(strict_types=1);
require_once __DIR__ . '/../../config/conexionBD.php';

final class SeguridadModelo
{
    private PDO $db;

    public function __construct()
    {
        $this->db = Conexion::obtener();
    }

    /** Segundos que faltan para poder intentar de nuevo (0 = sin bloqueo). */
    public function segundosBloqueo(string $usuario, string $ip): int
    {
        $desde = date('Y-m-d H:i:s', time() - LOGIN_VENTANA_SEG);
        $st = $this->db->prepare('SELECT COUNT(*) AS n, MAX(fecha) AS ultima FROM intentos_login
                                  WHERE (usuario = ? OR ip = ?) AND fecha >= ?');
        $st->execute([$usuario, $ip, $desde]);
        $r = $st->fetch();
        $n = (int)($r['n'] ?? 0);
        if ($n < LOGIN_FALLOS_PERMITIDOS || empty($r['ultima'])) return 0;

        $espera = LOGIN_PENALIZACION_SEG * ($n - LOGIN_FALLOS_PERMITIDOS + 1);
        $libre = strtotime((string)$r['ultima']) + $espera;
        return max(0, $libre - time());
    }

    public function registrarFallo(string $usuario, string $ip): void
    {
        $this->db->prepare('INSERT INTO intentos_login (usuario, ip, fecha) VALUES (?, ?, ?)')
                 ->execute([mb_substr($usuario, 0, 40), $ip, date('Y-m-d H:i:s')]);
        // Limpieza ocasional de registros viejos.
        if (random_int(1, 20) === 1) {
            $this->db->prepare('DELETE FROM intentos_login WHERE fecha < ?')
                     ->execute([date('Y-m-d H:i:s', time() - 86400)]);
        }
    }

    public function limpiar(string $usuario, string $ip): void
    {
        $this->db->prepare('DELETE FROM intentos_login WHERE usuario = ? OR ip = ?')->execute([$usuario, $ip]);
    }
}
