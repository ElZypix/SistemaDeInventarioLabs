<?php
// model/php/InventarioModelo.php — Laboratorios, lugares (mapa) y equipos.

declare(strict_types=1);
require_once __DIR__ . '/../../config/conexionBD.php';

final class InventarioModelo
{
    public const PERIFERICOS = ['monitor', 'teclado', 'mouse', 'cpu'];
    public const ESTADOS_PERIFERICO = ['presente', 'faltante', 'danado'];
    public const ESTADOS = ['verde', 'ambar', 'rojo', 'azul'];
    public const TIPOS = ['pc', 'mac'];
    public const TIPOS_DISCO = ['SSD', 'NVMe', 'HDD'];
    /** Columnas de especificaciones técnicas (los *_id apuntan a la tabla componentes). */
    public const SPECS = ['modelo_id', 'num_serie', 'procesador_id', 'ram_gb', 'grafica_id', 'motherboard_id', 'discos'];

    private PDO $db;

    public function __construct()
    {
        $this->db = Conexion::obtener();
    }

    /* ------------------------------------------------------------------ */
    /*  Estado de la máquina (opción mixta)                               */
    /* ------------------------------------------------------------------ */

    /** Regla automática: monitor/CPU con problema = rojo; teclado/mouse = ámbar. */
    public static function estadoAuto(array $e): string
    {
        foreach (['monitor', 'cpu'] as $p) {
            if (($e[$p] ?? 'presente') !== 'presente') return 'rojo';
        }
        foreach (['teclado', 'mouse'] as $p) {
            if (($e[$p] ?? 'presente') !== 'presente') return 'ambar';
        }
        return 'verde';
    }

    public static function estadoEfectivo(array $e): string
    {
        return !empty($e['estado_manual']) ? $e['estado_manual'] : self::estadoAuto($e);
    }

    /* ------------------------------------------------------------------ */
    /*  Lectura                                                            */
    /* ------------------------------------------------------------------ */

    public function laboratorios(): array
    {
        $rows = $this->db->query('SELECT id, clave, nombre FROM laboratorios ORDER BY orden, id')->fetchAll();
        foreach ($rows as &$r) $r['id'] = (int)$r['id'];
        return $rows;
    }

    public function laboratorio(int $id): ?array
    {
        $st = $this->db->prepare('SELECT id, clave, nombre FROM laboratorios WHERE id = ?');
        $st->execute([$id]);
        return $st->fetch() ?: null;
    }

    public function lugares(?int $labId = null): array
    {
        $sql = 'SELECT id, laboratorio_id, fila, columna FROM lugares';
        $par = [];
        if ($labId !== null) { $sql .= ' WHERE laboratorio_id = ?'; $par[] = $labId; }
        $st = $this->db->prepare($sql . ' ORDER BY laboratorio_id, fila, columna');
        $st->execute($par);
        return array_map(static fn($r) => array_map('intval', $r), $st->fetchAll());
    }

    public function lugar(int $id): ?array
    {
        $st = $this->db->prepare('SELECT id, laboratorio_id, fila, columna FROM lugares WHERE id = ?');
        $st->execute([$id]);
        $r = $st->fetch();
        return $r ? array_map('intval', $r) : null;
    }

    /** Equipos con sus sistemas operativos y software (ids). */
    public function equipos(?int $labId = null, ?array $ids = null): array
    {
        $sql = 'SELECT e.*, u.nombre AS actualizado_por_nombre
                FROM equipos e LEFT JOIN usuarios u ON u.id = e.actualizado_por WHERE 1 = 1';
        $par = [];
        if ($labId !== null) { $sql .= ' AND e.laboratorio_id = ?'; $par[] = $labId; }
        if ($ids !== null) {
            if (!$ids) return [];
            $sql .= ' AND e.id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
            array_push($par, ...$ids);
        }
        $st = $this->db->prepare($sql . ' ORDER BY e.laboratorio_id, e.numero');
        $st->execute($par);
        $equipos = $st->fetchAll();
        if (!$equipos) return [];

        $porId = [];
        foreach ($equipos as $e) {
            $id = (int)$e['id'];
            $porId[$id] = $this->normalizar($e);
        }

        $in = implode(',', array_keys($porId));
        foreach ($this->db->query("SELECT equipo_id, so_id FROM equipo_so WHERE equipo_id IN ($in)") as $r) {
            $porId[(int)$r['equipo_id']]['so'][] = (int)$r['so_id'];
        }
        foreach ($this->db->query("SELECT equipo_id, software_id FROM equipo_software WHERE equipo_id IN ($in)") as $r) {
            $porId[(int)$r['equipo_id']]['software'][] = (int)$r['software_id'];
        }
        foreach ($this->db->query("SELECT equipo_id, COUNT(*) AS n FROM pendientes WHERE hecho = 0 AND equipo_id IN ($in) GROUP BY equipo_id") as $r) {
            $porId[(int)$r['equipo_id']]['pendientes'] = (int)$r['n'];
        }
        return array_values($porId);
    }

    public function equipo(int $id): ?array
    {
        $r = $this->equipos(null, [$id]);
        return $r[0] ?? null;
    }

    private function normalizar(array $e): array
    {
        $out = [
            'id'              => (int)$e['id'],
            'laboratorio_id'  => (int)$e['laboratorio_id'],
            'lugar_id'        => $e['lugar_id'] !== null ? (int)$e['lugar_id'] : null,
            'numero'          => $e['numero'],
            'tipo'            => $e['tipo'],
            'monitor'         => $e['monitor'],
            'teclado'         => $e['teclado'],
            'mouse'           => $e['mouse'],
            'cpu'             => $e['cpu'],
            'estado_manual'   => $e['estado_manual'] ?: null,
            'motivo_manual'   => $e['motivo_manual'] ?: null,
            'estado_desde'    => $e['estado_desde'] ?? null,
            'capturado_en'    => $e['capturado_en'] ?? null,
            'observaciones'   => $e['observaciones'] ?? '',
            'modelo_id'       => isset($e['modelo_id']) ? (int)$e['modelo_id'] : null,
            'num_serie'       => $e['num_serie'] ?? null,
            'procesador_id'   => isset($e['procesador_id']) ? (int)$e['procesador_id'] : null,
            'ram_gb'          => isset($e['ram_gb']) ? (int)$e['ram_gb'] : null,
            'grafica_id'      => isset($e['grafica_id']) ? (int)$e['grafica_id'] : null,
            'motherboard_id'  => isset($e['motherboard_id']) ? (int)$e['motherboard_id'] : null,
            'discos'          => self::leerDiscos($e['discos'] ?? null),
            'actualizado_en'  => $e['actualizado_en'],
            'actualizado_por' => $e['actualizado_por_nombre'] ?? null,
            'so'              => [],
            'software'        => [],
            'pendientes'      => 0,
        ];
        $out['estado_auto'] = self::estadoAuto($out);
        $out['estado'] = self::estadoEfectivo($out);
        return $out;
    }

    public static function leerDiscos(?string $json): array
    {
        $d = $json ? json_decode($json, true) : null;
        return is_array($d) ? array_values($d) : [];
    }

    /** "SSD 512 GB", "HDD 1 TB" */
    public static function textoDisco(array $d): string
    {
        $gb = (int)($d['gb'] ?? 0);
        $cap = $gb >= 1000 && $gb % 1000 === 0 ? ($gb / 1000) . ' TB' : ($gb >= 1024 && $gb % 1024 === 0 ? ($gb / 1024) . ' TB' : "$gb GB");
        return trim(($d['tipo'] ?? '') . ' ' . ($gb ? $cap : ''));
    }

    /** Escribe las especificaciones (ya validadas; los componentes ya como ids). */
    private function guardarSpecs(int $id, array $sp): void
    {
        $sets = []; $par = [];
        foreach ($sp as $col => $v) {
            if (!in_array($col, self::SPECS, true)) continue;
            $sets[] = "$col = ?";
            $par[] = $col === 'discos' ? ($v ? json_encode(array_values($v), JSON_UNESCAPED_UNICODE) : null) : $v;
        }
        if (!$sets) return;
        $par[] = $id;
        $this->db->prepare('UPDATE equipos SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($par);
    }

    /**
     * Agrega programas a un equipo respetando las versiones:
     *  - una versión concreta reemplaza a las otras versiones del mismo programa;
     *  - "sin versión" no toca una versión que ya esté instalada.
     */
    private function agregarProgramas(int $equipoId, array $ids): void
    {
        if (!$ids) return;
        $info = $this->db->prepare('SELECT programa, version FROM software WHERE id = ?');
        $actuales = $this->db->prepare('SELECT s.id, s.version FROM equipo_software es JOIN software s ON s.id = es.software_id
                                        WHERE es.equipo_id = ? AND LOWER(s.programa) = LOWER(?)');
        $del = $this->db->prepare('DELETE FROM equipo_software WHERE equipo_id = ? AND software_id = ?');
        $ins = $this->db->prepare('INSERT INTO equipo_software (equipo_id, software_id) VALUES (?, ?)');
        foreach (array_unique($ids) as $sw) {
            $info->execute([$sw]);
            $p = $info->fetch();
            if (!$p) continue;
            $actuales->execute([$equipoId, $p['programa']]);
            $tiene = $actuales->fetchAll();
            if (in_array((int)$sw, array_map(static fn($x) => (int)$x['id'], $tiene), true)) continue;
            if (($p['version'] === null || $p['version'] === '') && $tiene) continue;
            foreach ($tiene as $t) $del->execute([$equipoId, $t['id']]);
            $ins->execute([$equipoId, $sw]);
        }
    }

    /** Quita todas las versiones de un programa de un equipo. */
    public function quitarPrograma(int $equipoId, string $programa): void
    {
        $this->db->prepare('DELETE FROM equipo_software WHERE equipo_id = ? AND software_id IN
            (SELECT id FROM software WHERE LOWER(programa) = LOWER(?))')->execute([$equipoId, $programa]);
    }

    public function existeNumero(int $labId, string $numero, int $exceptoId = 0): bool
    {
        $st = $this->db->prepare('SELECT COUNT(*) FROM equipos WHERE laboratorio_id = ? AND numero = ? AND id <> ?');
        $st->execute([$labId, $numero, $exceptoId]);
        return (int)$st->fetchColumn() > 0;
    }

    public function equipoEnLugar(int $lugarId): ?int
    {
        $st = $this->db->prepare('SELECT id FROM equipos WHERE lugar_id = ?');
        $st->execute([$lugarId]);
        $v = $st->fetchColumn();
        return $v === false ? null : (int)$v;
    }

    /* ------------------------------------------------------------------ */
    /*  Escritura de equipos                                               */
    /* ------------------------------------------------------------------ */

    /** $d ya viene validado por el controlador. Devuelve el id. */
    public function guardarEquipo(array $d, int $usuarioId): int
    {
        $this->db->beginTransaction();
        try {
            $ahora = date('Y-m-d H:i:s');
            $campos = [
                $d['laboratorio_id'], $d['numero'], $d['tipo'],
                $d['monitor'], $d['teclado'], $d['mouse'], $d['cpu'],
                $d['estado_manual'], $d['motivo_manual'], $d['observaciones'],
                $ahora, $usuarioId,
            ];

            $estadoNuevo = self::estadoEfectivo($d);
            if (!empty($d['id'])) {
                $id = (int)$d['id'];
                $actual = $this->equipo($id);
                if (!$actual || $actual['estado'] !== $estadoNuevo) {
                    $this->db->prepare('UPDATE equipos SET estado_desde = ? WHERE id = ?')->execute([$ahora, $id]);
                }
                // Si cambia de laboratorio, pasa a "sin ubicar" en el nuevo laboratorio.
                $lugar = ($actual && $actual['laboratorio_id'] !== $d['laboratorio_id']) ? null : ($actual['lugar_id'] ?? null);
                $st = $this->db->prepare('UPDATE equipos SET laboratorio_id = ?, numero = ?, tipo = ?,
                        monitor = ?, teclado = ?, mouse = ?, cpu = ?, estado_manual = ?, motivo_manual = ?,
                        observaciones = ?, actualizado_en = ?, actualizado_por = ?, lugar_id = ? WHERE id = ?');
                $st->execute([...$campos, $lugar, $id]);
            } else {
                $st = $this->db->prepare('INSERT INTO equipos (laboratorio_id, numero, tipo, monitor, teclado, mouse, cpu,
                        estado_manual, motivo_manual, observaciones, actualizado_en, actualizado_por, lugar_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $st->execute([...$campos, $d['lugar_id'] ?? null]);
                $id = (int)$this->db->lastInsertId();
                $this->db->prepare('UPDATE equipos SET estado_desde = ? WHERE id = ?')->execute([$ahora, $id]);
            }

            $this->reemplazarRelacion('equipo_so', 'so_id', $id, $d['so']);
            $this->reemplazarRelacion('equipo_software', 'software_id', $id, $d['software']);
            if (isset($d['specs']) && is_array($d['specs'])) $this->guardarSpecs($id, $d['specs']);
            $this->marcarCapturados($ahora);
            $this->db->commit();
            return $id;
        } catch (Throwable $t) {
            $this->db->rollBack();
            throw $t;
        }
    }

    private function reemplazarRelacion(string $tabla, string $col, int $equipoId, array $ids): void
    {
        $this->db->prepare("DELETE FROM $tabla WHERE equipo_id = ?")->execute([$equipoId]);
        $ins = $this->db->prepare("INSERT INTO $tabla (equipo_id, $col) VALUES (?, ?)");
        foreach (array_unique($ids) as $x) $ins->execute([$equipoId, $x]);
    }

    public function eliminarEquipo(int $id): void
    {
        $this->db->prepare('DELETE FROM equipos WHERE id = ?')->execute([$id]);
    }

    /**
     * Mueve un equipo a un lugar. Si el lugar está ocupado, intercambian posiciones.
     * $lugarId = null lo manda a la bandeja "sin ubicar".
     * Devuelve [['id' => equipo, 'lugar_id' => nuevo], ...].
     */
    public function mover(int $equipoId, ?int $lugarId, int $usuarioId): array
    {
        $this->db->beginTransaction();
        try {
            $st = $this->db->prepare('SELECT id, lugar_id FROM equipos WHERE id = ?');
            $st->execute([$equipoId]);
            $origen = $st->fetch();
            $lugarOrigen = $origen['lugar_id'] !== null ? (int)$origen['lugar_id'] : null;
            $ahora = date('Y-m-d H:i:s');
            $upd = $this->db->prepare('UPDATE equipos SET lugar_id = ?, actualizado_en = ?, actualizado_por = ? WHERE id = ?');
            $cambios = [];

            $ocupante = $lugarId !== null ? $this->equipoEnLugar($lugarId) : null;
            if ($ocupante !== null && $ocupante !== $equipoId) {
                // Intercambio: se libera primero para no chocar con la llave única.
                $upd->execute([null, $ahora, $usuarioId, $equipoId]);
                $upd->execute([$lugarOrigen, $ahora, $usuarioId, $ocupante]);
                $cambios[] = ['id' => $ocupante, 'lugar_id' => $lugarOrigen];
            }
            $upd->execute([$lugarId, $ahora, $usuarioId, $equipoId]);
            $cambios[] = ['id' => $equipoId, 'lugar_id' => $lugarId];

            $this->db->commit();
            return $cambios;
        } catch (Throwable $t) {
            $this->db->rollBack();
            throw $t;
        }
    }

    /**
     * Edición en lote. $c puede traer:
     *  so_agregar, so_quitar, software_agregar, software_quitar: int[]
     *  perifericos: ['monitor' => 'presente', ...]  (solo los que cambian)
     *  estado: null (sin cambio) | 'auto' | ['estado' => 'ambar', 'motivo' => '...']
     */
    public function lote(array $ids, array $c, int $usuarioId): void
    {
        $antes = $this->estadosActuales($ids);
        $this->db->beginTransaction();
        try {
            $ahora = date('Y-m-d H:i:s');
            $marcar = $this->db->prepare('UPDATE equipos SET actualizado_en = ?, actualizado_por = ? WHERE id = ?');

            foreach ($ids as $id) {
                foreach ($c['perifericos'] ?? [] as $p => $v) {
                    // $p está validado contra la lista blanca de periféricos.
                    $this->db->prepare("UPDATE equipos SET $p = ? WHERE id = ?")->execute([$v, $id]);
                }
                if (($c['estado'] ?? null) === 'auto') {
                    $this->db->prepare('UPDATE equipos SET estado_manual = NULL, motivo_manual = NULL WHERE id = ?')->execute([$id]);
                } elseif (is_array($c['estado'] ?? null)) {
                    $this->db->prepare('UPDATE equipos SET estado_manual = ?, motivo_manual = ? WHERE id = ?')
                             ->execute([$c['estado']['estado'], $c['estado']['motivo'], $id]);
                }
                $this->ajustarRelacion('equipo_so', 'so_id', $id, $c['so_agregar'] ?? [], $c['so_quitar'] ?? []);
                $this->ajustarRelacion('equipo_software', 'software_id', $id, [], $c['software_quitar'] ?? []);
                $this->agregarProgramas($id, $c['software_agregar'] ?? []);
                if (!empty($c['specs'])) $this->guardarSpecs($id, $c['specs']);
                $marcar->execute([$ahora, $usuarioId, $id]);
            }
            $this->actualizarEstadoDesde($antes, $ahora);
            $this->marcarCapturados($ahora);
            $this->db->commit();
        } catch (Throwable $t) {
            $this->db->rollBack();
            throw $t;
        }
    }

    /** Registra la fecha de captura de las PCs que ya no están "Pendiente de inventario". */
    private function marcarCapturados(string $ahora): void
    {
        $this->db->prepare("UPDATE equipos SET capturado_en = ?
            WHERE capturado_en IS NULL AND NOT (COALESCE(estado_manual, '') = 'azul' AND LOWER(COALESCE(motivo_manual, '')) = 'pendiente de inventario')")
            ->execute([$ahora]);
    }

    /** Estado efectivo actual de varios equipos: [id => estado]. */
    private function estadosActuales(array $ids): array
    {
        if (!$ids) return [];
        $in = implode(',', array_fill(0, count($ids), '?'));
        $st = $this->db->prepare("SELECT id, monitor, teclado, mouse, cpu, estado_manual FROM equipos WHERE id IN ($in)");
        $st->execute(array_values($ids));
        $out = [];
        foreach ($st->fetchAll() as $r) $out[(int)$r['id']] = self::estadoEfectivo($r);
        return $out;
    }

    /** Pone la fecha "en este estado desde" a los equipos cuyo estado cambió. */
    private function actualizarEstadoDesde(array $antes, string $ahora): void
    {
        $despues = $this->estadosActuales(array_keys($antes));
        $upd = $this->db->prepare('UPDATE equipos SET estado_desde = ? WHERE id = ?');
        foreach ($despues as $id => $est) {
            if (($antes[$id] ?? null) !== $est) $upd->execute([$ahora, $id]);
        }
    }

    /**
     * Copia la configuración de un equipo modelo a otros.
     * $partes: subconjunto de ['perifericos', 'so', 'software', 'estado'].
     * Si los destinos seguían "Pendiente de inventario", pasan a estado automático.
     */
    public function copiar(int $origenId, array $ids, array $partes, int $usuarioId): void
    {
        $origen = $this->equipo($origenId);
        $antes = $this->estadosActuales($ids);
        $ahora = date('Y-m-d H:i:s');
        $this->db->beginTransaction();
        try {
            foreach ($ids as $id) {
                if ($id === $origenId) continue;
                if (in_array('perifericos', $partes, true)) {
                    $this->db->prepare('UPDATE equipos SET monitor = ?, teclado = ?, mouse = ?, cpu = ? WHERE id = ?')
                             ->execute([$origen['monitor'], $origen['teclado'], $origen['mouse'], $origen['cpu'], $id]);
                }
                if (in_array('so', $partes, true)) $this->reemplazarRelacion('equipo_so', 'so_id', $id, $origen['so']);
                if (in_array('software', $partes, true)) $this->reemplazarRelacion('equipo_software', 'software_id', $id, $origen['software']);
                if (in_array('specs', $partes, true)) {
                    // El número de serie es de cada equipo: no se copia
                    $sp = array_intersect_key($origen, array_flip(self::SPECS));
                    unset($sp['num_serie']);
                    $this->guardarSpecs($id, $sp);
                }
                if (in_array('estado', $partes, true)) {
                    $this->db->prepare('UPDATE equipos SET estado_manual = ?, motivo_manual = ? WHERE id = ?')
                             ->execute([$origen['estado_manual'], $origen['motivo_manual'], $id]);
                } else {
                    $this->db->prepare("UPDATE equipos SET estado_manual = NULL, motivo_manual = NULL
                                        WHERE id = ? AND estado_manual = 'azul' AND LOWER(motivo_manual) = 'pendiente de inventario'")
                             ->execute([$id]);
                }
                $this->db->prepare('UPDATE equipos SET actualizado_en = ?, actualizado_por = ? WHERE id = ?')->execute([$ahora, $usuarioId, $id]);
            }
            $this->actualizarEstadoDesde($antes, $ahora);
            $this->marcarCapturados($ahora);
            $this->db->commit();
        } catch (Throwable $t) {
            $this->db->rollBack();
            throw $t;
        }
    }

    /** Marca o desmarca un programa en un equipo (matriz de software). */
    public function ponerSoftware(int $equipoId, int $softwareId, bool $instalado, int $usuarioId): void
    {
        if ($instalado) {
            $this->agregarProgramas($equipoId, [$softwareId]);
        } else {
            $this->db->prepare('DELETE FROM equipo_software WHERE equipo_id = ? AND software_id = ?')->execute([$equipoId, $softwareId]);
        }
        $this->db->prepare('UPDATE equipos SET actualizado_en = ?, actualizado_por = ? WHERE id = ?')
                 ->execute([date('Y-m-d H:i:s'), $usuarioId, $equipoId]);
    }

    private function ajustarRelacion(string $tabla, string $col, int $equipoId, array $agregar, array $quitar): void
    {
        if ($quitar) {
            $in = implode(',', array_fill(0, count($quitar), '?'));
            $this->db->prepare("DELETE FROM $tabla WHERE equipo_id = ? AND $col IN ($in)")->execute([$equipoId, ...$quitar]);
        }
        if ($agregar) {
            $existe = $this->db->prepare("SELECT COUNT(*) FROM $tabla WHERE equipo_id = ? AND $col = ?");
            $ins = $this->db->prepare("INSERT INTO $tabla (equipo_id, $col) VALUES (?, ?)");
            foreach (array_unique($agregar) as $x) {
                $existe->execute([$equipoId, $x]);
                if ((int)$existe->fetchColumn() === 0) $ins->execute([$equipoId, $x]);
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Edición del mapa (lugares y filas)                                 */
    /* ------------------------------------------------------------------ */

    public function filas(int $labId): array
    {
        $st = $this->db->prepare('SELECT fila, COUNT(*) AS n, MAX(columna) AS maxcol FROM lugares WHERE laboratorio_id = ? GROUP BY fila ORDER BY fila');
        $st->execute([$labId]);
        $out = [];
        foreach ($st->fetchAll() as $r) $out[(int)$r['fila']] = ['n' => (int)$r['n'], 'maxcol' => (int)$r['maxcol']];
        return $out;
    }

    /** Recorre columnas (o filas) a partir de $desde usando un paso por negativos para no romper la llave única. */
    private function desplazar(string $campo, int $labId, ?int $fila, int $desde, int $delta): void
    {
        $filtroFila = $campo === 'columna' ? ' AND fila = ?' : '';
        $par = $campo === 'columna' ? [$labId, $fila, $desde] : [$labId, $desde];

        $this->db->prepare("UPDATE lugares SET $campo = -$campo WHERE laboratorio_id = ?$filtroFila AND $campo >= ?")->execute($par);
        $par2 = $campo === 'columna' ? [$delta, $labId, $fila] : [$delta, $labId];
        $this->db->prepare("UPDATE lugares SET $campo = -$campo + ? WHERE laboratorio_id = ?$filtroFila AND $campo < 0")->execute($par2);
    }

    /** Inserta un lugar vacío en la posición $columna (las de la derecha se recorren). */
    public function insertarLugar(int $labId, int $fila, int $columna): int
    {
        $this->db->beginTransaction();
        try {
            // Si ese hueco ya está libre (pasillo/espacio en blanco) se ocupa sin recorrer a los demás
            $st = $this->db->prepare('SELECT COUNT(*) FROM lugares WHERE laboratorio_id = ? AND fila = ? AND columna = ?');
            $st->execute([$labId, $fila, $columna]);
            if ((int)$st->fetchColumn() > 0) $this->desplazar('columna', $labId, $fila, $columna, 1);
            $this->db->prepare('INSERT INTO lugares (laboratorio_id, fila, columna) VALUES (?, ?, ?)')->execute([$labId, $fila, $columna]);
            $id = (int)$this->db->lastInsertId();
            $this->db->commit();
            return $id;
        } catch (Throwable $t) {
            $this->db->rollBack();
            throw $t;
        }
    }

    public function agregarFila(int $labId, int $cantidad): int
    {
        $st = $this->db->prepare('SELECT COALESCE(MAX(fila), 0) FROM lugares WHERE laboratorio_id = ?');
        $st->execute([$labId]);
        $fila = (int)$st->fetchColumn() + 1;
        $ins = $this->db->prepare('INSERT INTO lugares (laboratorio_id, fila, columna) VALUES (?, ?, ?)');
        $this->db->beginTransaction();
        for ($c = 1; $c <= $cantidad; $c++) $ins->execute([$labId, $fila, $c]);
        $this->db->commit();
        return $fila;
    }

    public function eliminarLugar(array $lugar, bool $recorrer = true): void
    {
        $this->db->beginTransaction();
        try {
            $this->db->prepare('DELETE FROM lugares WHERE id = ?')->execute([$lugar['id']]);
            if ($recorrer) $this->desplazar('columna', $lugar['laboratorio_id'], $lugar['fila'], $lugar['columna'] + 1, -1);
            // Si la fila quedó vacía se elimina y las de atrás se recorren.
            $st = $this->db->prepare('SELECT COUNT(*) FROM lugares WHERE laboratorio_id = ? AND fila = ?');
            $st->execute([$lugar['laboratorio_id'], $lugar['fila']]);
            if ((int)$st->fetchColumn() === 0) {
                $this->desplazar('fila', $lugar['laboratorio_id'], null, $lugar['fila'] + 1, -1);
            }
            $this->db->commit();
        } catch (Throwable $t) {
            $this->db->rollBack();
            throw $t;
        }
    }

    public function equiposEnFila(int $labId, int $fila): int
    {
        $st = $this->db->prepare('SELECT COUNT(*) FROM equipos e INNER JOIN lugares l ON l.id = e.lugar_id
                                  WHERE l.laboratorio_id = ? AND l.fila = ?');
        $st->execute([$labId, $fila]);
        return (int)$st->fetchColumn();
    }

    public function eliminarFila(int $labId, int $fila): void
    {
        $this->db->beginTransaction();
        try {
            $this->db->prepare('DELETE FROM lugares WHERE laboratorio_id = ? AND fila = ?')->execute([$labId, $fila]);
            $this->desplazar('fila', $labId, null, $fila + 1, -1);
            $this->db->commit();
        } catch (Throwable $t) {
            $this->db->rollBack();
            throw $t;
        }
    }
}
