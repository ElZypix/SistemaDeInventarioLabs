<?php
// model/php/RespaldoModelo.php — Respaldo y restauración de los datos de SIGLAB.
// Formato "datos v2": solo los datos (INSERT con SQL estándar), en orden de dependencias.
// Sirve igual en MySQL/MariaDB (local) y en PostgreSQL (Neon, en línea), así que un respaldo
// hecho en la laptop se puede restaurar en el SIGLAB en línea y al revés.

declare(strict_types=1);
require_once __DIR__ . '/../../config/conexionBD.php';

final class RespaldoModelo
{
    public const FIRMA = '-- SIGLAB - Respaldo completo';
    public const FORMATO = '-- Formato: datos v2';
    /** Tablas en orden de dependencias (primero las que no dependen de otras). Las sesiones no se respaldan. */
    public const TABLAS = [
        'usuarios', 'intentos_login', 'laboratorios', 'lugares', 'componentes', 'sistemas_operativos', 'software',
        'equipos', 'equipo_so', 'equipo_software', 'perfiles_software', 'perfil_software', 'pendientes', 'ajustes',
    ];
    /** Tablas con id autoincremental (para reajustar las secuencias de PostgreSQL al restaurar). */
    private const CON_ID = ['usuarios', 'intentos_login', 'laboratorios', 'lugares', 'componentes', 'sistemas_operativos',
        'software', 'equipos', 'perfiles_software', 'pendientes'];

    private PDO $db;
    private string $driver;

    public function __construct()
    {
        $this->db = Conexion::obtener();
        $this->driver = $this->db->getAttribute(PDO::ATTR_DRIVER_NAME);
    }

    /** Literal SQL estándar: las comillas se duplican y la diagonal invertida no es especial. */
    private static function citar($v): string
    {
        if ($v === null) return 'NULL';
        if (is_bool($v)) return $v ? '1' : '0';
        if (is_int($v) || is_float($v)) return (string)$v;
        return "'" . str_replace("'", "''", (string)$v) . "'";
    }

    /** Identificador estándar ("tabla"), el que se escribe en el archivo. */
    private static function id(string $nombre): string
    {
        return '"' . str_replace('"', '""', $nombre) . '"';
    }

    /** Identificador para consultar la base actual (MySQL sin ANSI_QUOTES usa `tabla`). */
    private function tabla(string $nombre): string
    {
        return $this->driver === 'mysql' ? '`' . str_replace('`', '``', $nombre) . '`' : self::id($nombre);
    }

    public function generar(): string
    {
        $o = self::FIRMA . "\n" . self::FORMATO . "\n";
        $o .= '-- Generado: ' . date('Y-m-d H:i:s') . ' · base ' . $this->driver . "\n";
        $o .= "-- Restaurar desde SIGLAB → Respaldo (reemplaza todos los datos).\n\n";
        foreach (self::TABLAS as $t) {
            $filas = $this->db->query('SELECT * FROM ' . $this->tabla($t))->fetchAll();
            $o .= '-- ' . $t . ': ' . count($filas) . " filas\n";
            if (!$filas) { $o .= "\n"; continue; }
            $cols = implode(', ', array_map([self::class, 'id'], array_keys($filas[0])));
            foreach ($filas as $f) {
                $o .= 'INSERT INTO ' . self::id($t) . " ($cols) VALUES (" . implode(', ', array_map([self::class, 'citar'], array_values($f))) . ");\n";
            }
            $o .= "\n";
        }
        return $o;
    }

    public static function esFormatoDatos(string $sql): bool
    {
        return str_contains(substr($sql, 0, 300), self::FORMATO);
    }

    /** Divide un script SQL en sentencias respetando cadenas y comentarios. */
    public static function dividir(string $sql, bool $diagonalEscapa = true): array
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
                if ($ch === '#' && $diagonalEscapa) { $linea = true; continue; }
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
            if ($diagonalEscapa && $ch === '\\' && $q !== '`') { $buf .= $sig; $i++; continue; }
            if ($ch === $q) $q = null;
        }
        if (trim($buf) !== '') $sent[] = trim($buf);
        return $sent;
    }

    /** Restaura un respaldo. Devuelve cuántas sentencias se ejecutaron. */
    public function restaurar(string $sql): int
    {
        return self::esFormatoDatos($sql) ? $this->restaurarDatos($sql) : $this->restaurarScriptMysql($sql);
    }

    /** Formato v2: borra los datos actuales y carga los del archivo, todo en una transacción. */
    private function restaurarDatos(string $sql): int
    {
        $sentencias = self::dividir($sql, false);
        foreach ($sentencias as $s) {
            if (!preg_match('/^INSERT\s+INTO\s+"([a-z_]+)"\s/i', $s, $m) || !in_array($m[1], self::TABLAS, true)) {
                throw new RuntimeException('El respaldo contiene sentencias que no son datos de SIGLAB.');
            }
        }
        $mysql = $this->driver === 'mysql';
        if ($mysql) $this->db->exec("SET SESSION sql_mode = 'ANSI_QUOTES,NO_BACKSLASH_ESCAPES,NO_AUTO_VALUE_ON_ZERO'");
        $this->db->beginTransaction();
        try {
            foreach (array_reverse(self::TABLAS) as $t) $this->db->exec('DELETE FROM ' . $this->tabla($t));
            foreach ($sentencias as $s) $this->db->exec($s);
            if ($this->driver === 'pgsql') {
                foreach (self::CON_ID as $t) {
                    $this->db->query("SELECT setval(pg_get_serial_sequence('$t', 'id'), COALESCE((SELECT MAX(id) FROM \"$t\"), 0) + 1, false)");
                }
            }
            $this->db->commit();
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        } finally {
            if ($mysql) $this->db->exec("SET SESSION sql_mode = DEFAULT");
        }
        return count($sentencias);
    }

    /** Respaldos antiguos (v1.x, script completo de MySQL). Solo se pueden restaurar en MySQL. */
    private function restaurarScriptMysql(string $sql): int
    {
        if ($this->driver !== 'mysql') {
            throw new RuntimeException('Este respaldo es del formato antiguo (solo MySQL). Genera uno nuevo desde SIGLAB 1.6 en tu laptop y restaura ese.');
        }
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
