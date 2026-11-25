<?php
// model/php/RespaldoModelo.php — Respaldo y restauración de la base de datos (rescatado de SUGACI).

declare(strict_types=1);
require_once __DIR__ . '/../../config/conexionBD.php';

final class RespaldoModelo
{
    public const FIRMA = '-- SIGLAB - Respaldo completo';
    private PDO $db;

    public function __construct()
    {
        $this->db = Conexion::obtener();
    }

    private static function citar($v): string
    {
        if ($v === null) return 'NULL';
        return "'" . str_replace(["\\", "\0", "'", "\r", "\n", "\x1a"], ["\\\\", "\\0", "\\'", "\\r", "\\n", "\\Z"], (string)$v) . "'";
    }

    public function generar(): string
    {
        $dbName = (string)$this->db->query('SELECT DATABASE()')->fetchColumn();
        $tablas = [];
        foreach ($this->db->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_NUM) as $r) {
            $tablas[] = $r[0];
        }

        $o = self::FIRMA . "\n";
        $o .= '-- Generado: ' . date('Y-m-d H:i:s') . "\n";
        $o .= "-- Base de datos: `{$dbName}`\n\n";
        $o .= "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n\n";

        foreach ($tablas as $t) $o .= "DROP TABLE IF EXISTS `{$t}`;\n";
        $o .= "\n";

        foreach ($tablas as $t) {
            $create = $this->db->query("SHOW CREATE TABLE `{$t}`")->fetch();
            $o .= "-- Estructura de `{$t}`\n" . ($create['Create Table'] ?? array_values($create)[1]) . ";\n\n";

            $filas = $this->db->query("SELECT * FROM `{$t}`")->fetchAll();
            if (!$filas) continue;
            $cols = implode(', ', array_map(static fn($c) => '`' . str_replace('`', '``', $c) . '`', array_keys($filas[0])));
            $o .= "-- Datos de `{$t}`\n";
            foreach ($filas as $f) {
                $o .= "INSERT INTO `{$t}` ({$cols}) VALUES (" . implode(', ', array_map([self::class, 'citar'], array_values($f))) . ");\n";
            }
            $o .= "\n";
        }
        return $o . "SET FOREIGN_KEY_CHECKS=1;\n";
    }

    /** Divide un script SQL en sentencias respetando cadenas y comentarios. */
    public static function dividir(string $sql): array
    {
        $sql = preg_replace('/^\xEF\xBB\xBF/', '', $sql);
        $len = strlen($sql);
        $sent = [];
        $buf = '';
        $q = null;            // comilla abierta: ' " `
        $linea = $bloque = false;

        for ($i = 0; $i < $len; $i++) {
            $ch = $sql[$i];
            $sig = $sql[$i + 1] ?? '';

            if ($linea) { if ($ch === "\n") { $linea = false; $buf .= $ch; } continue; }
            if ($bloque) { if ($ch === '*' && $sig === '/') { $bloque = false; $i++; } continue; }

            if ($q === null) {
                if ($ch === '-' && $sig === '-' && in_array($sql[$i + 2] ?? "\n", [' ', "\t", "\r", "\n"], true)) { $linea = true; $i++; continue; }
                if ($ch === '#') { $linea = true; continue; }
                if ($ch === '/' && $sig === '*') { $bloque = true; $i++; continue; }
                if ($ch === "'" || $ch === '"' || $ch === '`') { $q = $ch; $buf .= $ch; continue; }
                if ($ch === ';') {
                    if (trim($buf) !== '') $sent[] = trim($buf);
                    $buf = '';
                    continue;
                }
                $buf .= $ch;
                continue;
            }

            // Dentro de una cadena
            $buf .= $ch;
            if ($ch === '\\' && $q !== '`') { $buf .= $sig; $i++; continue; }
            if ($ch === $q) $q = null;
        }
        if (trim($buf) !== '') $sent[] = trim($buf);
        return $sent;
    }

    public function restaurar(string $sql): int
    {
        $n = 0;
        $this->db->exec('SET FOREIGN_KEY_CHECKS=0');
        try {
            foreach (self::dividir($sql) as $s) {
                if (stripos($s, 'DELIMITER') === 0) {
                    throw new RuntimeException('El archivo contiene procedimientos (DELIMITER). Restáuralo manualmente desde phpMyAdmin.');
                }
                if (preg_match('/^(CREATE\s+DATABASE|USE\s|DROP\s+DATABASE)/i', $s)) continue;
                $this->db->exec($s);
                $n++;
            }
        } finally {
            $this->db->exec('SET FOREIGN_KEY_CHECKS=1');
        }
        return $n;
    }
}
