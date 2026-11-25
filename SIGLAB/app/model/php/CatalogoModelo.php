<?php
// model/php/CatalogoModelo.php — Catálogos administrables: sistemas operativos y software.

declare(strict_types=1);
require_once __DIR__ . '/../../config/conexionBD.php';

final class CatalogoModelo
{
    public const FAMILIAS = ['windows', 'linux', 'macos', 'otro'];

    /** Configuración de cada catálogo: tabla, tabla de relación, columna y campo extra. */
    private const CAT = [
        'so'       => ['tabla' => 'sistemas_operativos', 'rel' => 'equipo_so',       'col' => 'so_id',       'extra' => 'familia'],
        'software' => ['tabla' => 'software',            'rel' => 'equipo_software', 'col' => 'software_id', 'extra' => 'categoria'],
    ];

    private PDO $db;

    public function __construct()
    {
        $this->db = Conexion::obtener();
    }

    public static function valido(string $cat): bool
    {
        return isset(self::CAT[$cat]);
    }

    /** Lista con el número de equipos que usan cada elemento. */
    public function listar(string $cat): array
    {
        $c = self::CAT[$cat];
        $camposSO = $cat === 'so' ? ', t.distribucion, t.version' : ', t.programa, t.version';
        $sql = "SELECT t.id, t.nombre, t.{$c['extra']} AS extra, t.activo$camposSO,
                       (SELECT COUNT(*) FROM {$c['rel']} r WHERE r.{$c['col']} = t.id) AS usos
                FROM {$c['tabla']} t ORDER BY t.{$c['extra']}, t.nombre";
        $out = [];
        foreach ($this->db->query($sql) as $r) {
            $out[] = [
                'id'            => (int)$r['id'],
                'nombre'        => $r['nombre'],
                $c['extra']     => $r['extra'],
                'activo'        => (int)$r['activo'] === 1,
                'usos'          => (int)$r['usos'],
            ];
            if ($cat === 'so') {
                $out[count($out) - 1]['distribucion'] = $r['distribucion'] ?: null;
            } else {
                $out[count($out) - 1]['programa'] = $r['programa'] ?: $r['nombre'];
            }
            $out[count($out) - 1]['version'] = $r['version'] ?: null;
        }
        // Orden siempre consistente (no depende de la intercalación de MySQL)
        if ($cat === 'so') {
            usort($out, static fn($a, $b) => self::claveOrdenSO($a) <=> self::claveOrdenSO($b));
        } else {
            // Categoría → programa → versión de la más nueva a la más vieja (sin versión primero)
            usort($out, static fn($a, $b) => strnatcasecmp($a['categoria'], $b['categoria'])
                ?: strnatcasecmp($a['programa'], $b['programa'])
                ?: (self::numeroVersion($b['version']) <=> self::numeroVersion($a['version']))
                ?: strnatcasecmp((string)$a['version'], (string)$b['version']));
        }
        return $out;
    }

    public function idsExistentes(string $cat, array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if (!$ids) return [];
        $c = self::CAT[$cat];
        $in = implode(',', array_fill(0, count($ids), '?'));
        $st = $this->db->prepare("SELECT id FROM {$c['tabla']} WHERE id IN ($in)");
        $st->execute($ids);
        return array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    }

    public function existeNombre(string $cat, string $nombre, int $exceptoId = 0): bool
    {
        $c = self::CAT[$cat];
        $st = $this->db->prepare("SELECT COUNT(*) FROM {$c['tabla']} WHERE LOWER(nombre) = LOWER(?) AND id <> ?");
        $st->execute([$nombre, $exceptoId]);
        return (int)$st->fetchColumn() > 0;
    }

    public function guardar(string $cat, ?int $id, string $nombre, string $extra, bool $activo): int
    {
        $c = self::CAT[$cat];
        if ($id) {
            $this->db->prepare("UPDATE {$c['tabla']} SET nombre = ?, {$c['extra']} = ?, activo = ? WHERE id = ?")
                     ->execute([$nombre, $extra, $activo ? 1 : 0, $id]);
            return $id;
        }
        $this->db->prepare("INSERT INTO {$c['tabla']} (nombre, {$c['extra']}, activo) VALUES (?, ?, ?)")
                 ->execute([$nombre, $extra, $activo ? 1 : 0]);
        return (int)$this->db->lastInsertId();
    }

    public function usos(string $cat, int $id): int
    {
        $c = self::CAT[$cat];
        $st = $this->db->prepare("SELECT COUNT(*) FROM {$c['rel']} WHERE {$c['col']} = ?");
        $st->execute([$id]);
        return (int)$st->fetchColumn();
    }

    public function eliminar(string $cat, int $id): void
    {
        $c = self::CAT[$cat];
        $this->db->prepare("DELETE FROM {$c['tabla']} WHERE id = ?")->execute([$id]);
    }

    public function categoriasSoftware(): array
    {
        return $this->db->query('SELECT DISTINCT categoria FROM software ORDER BY categoria')->fetchAll(PDO::FETCH_COLUMN);
    }

    /* ---------------- Perfiles de software ---------------- */

    public function perfiles(): array
    {
        $out = [];
        foreach ($this->db->query('SELECT id, nombre FROM perfiles_software ORDER BY nombre') as $r) {
            $out[(int)$r['id']] = ['id' => (int)$r['id'], 'nombre' => $r['nombre'], 'software' => []];
        }
        foreach ($this->db->query('SELECT perfil_id, software_id FROM perfil_software') as $r) {
            if (isset($out[(int)$r['perfil_id']])) $out[(int)$r['perfil_id']]['software'][] = (int)$r['software_id'];
        }
        return array_values($out);
    }

    public function perfilExiste(int $id): bool
    {
        $st = $this->db->prepare('SELECT COUNT(*) FROM perfiles_software WHERE id = ?');
        $st->execute([$id]);
        return (int)$st->fetchColumn() > 0;
    }

    public function perfilNombreUsado(string $nombre, int $exceptoId = 0): bool
    {
        $st = $this->db->prepare('SELECT COUNT(*) FROM perfiles_software WHERE LOWER(nombre) = LOWER(?) AND id <> ?');
        $st->execute([$nombre, $exceptoId]);
        return (int)$st->fetchColumn() > 0;
    }

    public function guardarPerfil(?int $id, string $nombre, array $software): int
    {
        $this->db->beginTransaction();
        try {
            if ($id) {
                $this->db->prepare('UPDATE perfiles_software SET nombre = ? WHERE id = ?')->execute([$nombre, $id]);
            } else {
                $this->db->prepare('INSERT INTO perfiles_software (nombre) VALUES (?)')->execute([$nombre]);
                $id = (int)$this->db->lastInsertId();
            }
            $this->db->prepare('DELETE FROM perfil_software WHERE perfil_id = ?')->execute([$id]);
            $ins = $this->db->prepare('INSERT INTO perfil_software (perfil_id, software_id) VALUES (?, ?)');
            foreach (array_unique($software) as $sw) $ins->execute([$id, $sw]);
            $this->db->commit();
            return $id;
        } catch (Throwable $t) {
            $this->db->rollBack();
            throw $t;
        }
    }

    public function eliminarPerfil(int $id): void
    {
        $this->db->prepare('DELETE FROM perfiles_software WHERE id = ?')->execute([$id]);
    }

    /* ---------------- Software: programa / versión ---------------- */

    public static function nombreSW(string $programa, ?string $version): string
    {
        $v = $version !== null && trim($version) !== '' ? trim($version) : null;
        return trim($programa) . ($v ? " $v" : '');
    }

    public function buscarSW(string $programa, ?string $version): ?int
    {
        $st = $this->db->prepare("SELECT id FROM software WHERE LOWER(programa) = LOWER(?) AND LOWER(COALESCE(version, '')) = LOWER(?)");
        $st->execute([trim($programa), trim((string)$version)]);
        $v = $st->fetchColumn();
        return $v === false ? null : (int)$v;
    }

    /** Categoría que ya tiene un programa (todas sus versiones comparten categoría). */
    public function categoriaDe(string $programa): ?string
    {
        $st = $this->db->prepare('SELECT categoria FROM software WHERE LOWER(programa) = LOWER(?) LIMIT 1');
        $st->execute([trim($programa)]);
        $v = $st->fetchColumn();
        return $v === false ? null : (string)$v;
    }

    /** Nombre exacto (con mayúsculas) con el que ya existe un programa. */
    private function programaExistente(string $programa): string
    {
        $st = $this->db->prepare('SELECT programa FROM software WHERE LOWER(programa) = LOWER(?) LIMIT 1');
        $st->execute([trim($programa)]);
        $v = $st->fetchColumn();
        return $v === false ? trim($programa) : (string)$v;
    }

    /** Guarda un programa/versión. La categoría se aplica a todas las versiones del programa. */
    public function guardarSW(?int $id, string $programa, ?string $version, string $categoria, bool $activo): int
    {
        $programa = $id ? trim($programa) : $this->programaExistente($programa);
        $version = $version !== null && trim($version) !== '' ? trim($version) : null;
        $nombre = self::nombreSW($programa, $version);
        $this->db->beginTransaction();
        try {
            if ($id) {
                $st = $this->db->prepare('SELECT programa FROM software WHERE id = ?');
                $st->execute([$id]);
                $anterior = (string)$st->fetchColumn();
                $this->db->prepare('UPDATE software SET nombre = ?, programa = ?, version = ?, categoria = ?, activo = ? WHERE id = ?')
                         ->execute([$nombre, $programa, $version, $categoria, $activo ? 1 : 0, $id]);
                // Si cambió el nombre del programa, también se renombran sus otras versiones
                if ($anterior !== '' && $anterior !== $programa) {
                    $otros = $this->db->prepare('SELECT id, version FROM software WHERE programa = ? AND id <> ?');
                    $otros->execute([$anterior, $id]);
                    $upd = $this->db->prepare('UPDATE software SET programa = ?, nombre = ? WHERE id = ?');
                    foreach ($otros->fetchAll() as $o) $upd->execute([$programa, self::nombreSW($programa, $o['version']), $o['id']]);
                }
            } else {
                $this->db->prepare('INSERT INTO software (nombre, programa, version, categoria, activo) VALUES (?, ?, ?, ?, ?)')
                         ->execute([$nombre, $programa, $version, $categoria, $activo ? 1 : 0]);
                $id = (int)$this->db->lastInsertId();
            }
            $this->db->prepare('UPDATE software SET categoria = ? WHERE programa = ?')->execute([$categoria, $programa]);
            $this->db->commit();
            return $id;
        } catch (Throwable $t) {
            $this->db->rollBack();
            throw $t;
        }
    }

    /** Id del programa/versión; lo crea si no existe (con la categoría del programa) y lo reactiva. */
    public function asegurarSW(string $programa, ?string $version, ?string $categoria = null): int
    {
        $id = $this->buscarSW($programa, $version);
        if ($id) {
            $this->db->prepare('UPDATE software SET activo = 1 WHERE id = ?')->execute([$id]);
            return $id;
        }
        $cat = $this->categoriaDe($programa) ?? ($categoria !== null && $categoria !== '' ? $categoria : 'General');
        return $this->guardarSW(null, $programa, $version, $cat, true);
    }

    /** Programa (nombre) de un id de software. */
    public function programaDe(int $id): ?string
    {
        $st = $this->db->prepare('SELECT programa FROM software WHERE id = ?');
        $st->execute([$id]);
        $v = $st->fetchColumn();
        return $v === false ? null : (string)$v;
    }

    /* ---------------- Componentes (especificaciones técnicas) ---------------- */

    public const TIPOS_COMPONENTE = ['modelo' => 'modelo_id', 'procesador' => 'procesador_id', 'grafica' => 'grafica_id', 'motherboard' => 'motherboard_id'];

    public function componentes(): array
    {
        $usos = [];
        foreach (self::TIPOS_COMPONENTE as $col) {
            foreach ($this->db->query("SELECT $col AS c, COUNT(*) AS n FROM equipos WHERE $col IS NOT NULL GROUP BY $col") as $r) {
                $usos[(int)$r['c']] = ($usos[(int)$r['c']] ?? 0) + (int)$r['n'];
            }
        }
        $out = [];
        foreach ($this->db->query('SELECT id, tipo, nombre, activo FROM componentes') as $r) {
            $out[] = ['id' => (int)$r['id'], 'tipo' => $r['tipo'], 'nombre' => $r['nombre'], 'activo' => (int)$r['activo'] === 1, 'usos' => $usos[(int)$r['id']] ?? 0];
        }
        $orden = array_flip(array_keys(self::TIPOS_COMPONENTE));
        usort($out, static fn($a, $b) => ($orden[$a['tipo']] <=> $orden[$b['tipo']]) ?: strnatcasecmp($a['nombre'], $b['nombre']));
        return $out;
    }

    public function buscarComponente(string $tipo, string $nombre): ?int
    {
        $st = $this->db->prepare('SELECT id FROM componentes WHERE tipo = ? AND LOWER(nombre) = LOWER(?)');
        $st->execute([$tipo, trim($nombre)]);
        $v = $st->fetchColumn();
        return $v === false ? null : (int)$v;
    }

    public function asegurarComponente(string $tipo, string $nombre): int
    {
        $id = $this->buscarComponente($tipo, $nombre);
        if ($id) {
            $this->db->prepare('UPDATE componentes SET activo = 1 WHERE id = ?')->execute([$id]);
            return $id;
        }
        $this->db->prepare('INSERT INTO componentes (tipo, nombre) VALUES (?, ?)')->execute([$tipo, trim($nombre)]);
        return (int)$this->db->lastInsertId();
    }

    public function guardarComponente(int $id, string $nombre, bool $activo): void
    {
        $this->db->prepare('UPDATE componentes SET nombre = ?, activo = ? WHERE id = ?')->execute([trim($nombre), $activo ? 1 : 0, $id]);
    }

    public function componente(int $id): ?array
    {
        $st = $this->db->prepare('SELECT id, tipo, nombre FROM componentes WHERE id = ?');
        $st->execute([$id]);
        $r = $st->fetch();
        return $r ?: null;
    }

    public function eliminarComponente(int $id): void
    {
        $this->db->prepare('DELETE FROM componentes WHERE id = ?')->execute([$id]);
    }

    /* ---------------- Sistemas operativos: familia / distribución / versión ---------------- */

    public const ORDEN_FAMILIA = ['windows' => 1, 'linux' => 2, 'macos' => 3, 'otro' => 4];

    /** Nombre visible: "Windows 11", "Ubuntu 24.04", "Zorin OS", "macOS Sequoia". */
    public static function nombreSO(string $familia, ?string $distro, ?string $version): string
    {
        $v = $version !== null && trim($version) !== '' ? trim($version) : null;
        return match ($familia) {
            'windows' => 'Windows' . ($v ? " $v" : ''),
            'macos'   => 'macOS' . ($v ? ' ' . trim((string)preg_replace('/\s*\(.*\)$/', '', $v)) : ''),
            default   => trim((string)$distro) . ($v ? " $v" : ''),
        };
    }

    /** Número de una versión para ordenar de la más nueva a la más vieja ("Sequoia (15)" → 15, "24.04" → 24.04). */
    public static function numeroVersion(?string $v): float
    {
        if ($v === null || $v === '') return INF; // sin versión va primero
        if (preg_match('/\(([\d.]+)\)/', $v, $m) || preg_match('/([\d.]+)/', $v, $m)) return (float)$m[1];
        return -1.0;
    }

    private static function claveOrdenSO(array $s): array
    {
        return [
            self::ORDEN_FAMILIA[$s['familia']] ?? 9,
            mb_strtolower((string)($s['distribucion'] ?? '')),
            -self::numeroVersion($s['version'] ?? null),
            mb_strtolower((string)($s['version'] ?? '')),
        ];
    }

    public function buscarSO(string $familia, ?string $distro, ?string $version): ?int
    {
        $st = $this->db->prepare("SELECT id FROM sistemas_operativos WHERE familia = ?
            AND LOWER(COALESCE(distribucion, '')) = LOWER(?) AND LOWER(COALESCE(version, '')) = LOWER(?)");
        $st->execute([$familia, (string)$distro, (string)$version]);
        $v = $st->fetchColumn();
        return $v === false ? null : (int)$v;
    }

    /** Guarda un sistema operativo calculando su nombre. Devuelve el id. */
    public function guardarSO(?int $id, string $familia, ?string $distro, ?string $version, bool $activo): int
    {
        $distro = in_array($familia, ['linux', 'otro'], true) ? $distro : null;
        $nombre = self::nombreSO($familia, $distro, $version);
        if ($id) {
            $this->db->prepare('UPDATE sistemas_operativos SET nombre = ?, familia = ?, distribucion = ?, version = ?, activo = ? WHERE id = ?')
                     ->execute([$nombre, $familia, $distro, $version, $activo ? 1 : 0, $id]);
            return $id;
        }
        $this->db->prepare('INSERT INTO sistemas_operativos (nombre, familia, distribucion, version, activo) VALUES (?, ?, ?, ?, ?)')
                 ->execute([$nombre, $familia, $distro, $version, $activo ? 1 : 0]);
        return (int)$this->db->lastInsertId();
    }

    /** Devuelve el id del sistema (familia, distro, versión); lo crea si no existe y lo reactiva si estaba inactivo. */
    public function asegurarSO(string $familia, ?string $distro, ?string $version): int
    {
        $id = $this->buscarSO($familia, $distro, $version);
        if ($id) {
            $this->db->prepare('UPDATE sistemas_operativos SET activo = 1 WHERE id = ?')->execute([$id]);
            return $id;
        }
        return $this->guardarSO(null, $familia, $distro, $version, true);
    }
}
