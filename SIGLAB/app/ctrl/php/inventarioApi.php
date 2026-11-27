<?php
// ctrl/php/inventarioApi.php — Mapa de laboratorios, equipos, arrastre y edición en lote.

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../model/php/InventarioModelo.php';
require_once __DIR__ . '/../../model/php/CatalogoModelo.php';
require_once __DIR__ . '/../../model/php/AjustesModelo.php';

$accion = $_GET['accion'] ?? '';
$inv = new InventarioModelo();
$cat = new CatalogoModelo();

/** Valida y limpia los datos de un equipo enviados desde el modal. */
function validar_equipo(array $d, InventarioModelo $inv, CatalogoModelo $cat): array
{
    $id = (int)($d['id'] ?? 0);
    $labId = (int)($d['laboratorio_id'] ?? 0);
    if (!$inv->laboratorio($labId)) error_out('Selecciona un laboratorio válido.');

    $numero = strtoupper(str_replace(' ', '', texto($d['numero'] ?? '', 20)));
    if (!preg_match('/^[A-Z0-9][A-Z0-9_-]{0,19}$/', $numero)) {
        error_out('El número de inventario solo puede tener letras, números y guiones (ej. PC01).');
    }
    if ($inv->existeNumero($labId, $numero, $id)) error_out("Ya existe un equipo $numero en ese laboratorio.", 409);

    $tipo = in_array($d['tipo'] ?? '', InventarioModelo::TIPOS, true) ? $d['tipo'] : 'pc';

    $out = ['id' => $id ?: null, 'laboratorio_id' => $labId, 'numero' => $numero, 'tipo' => $tipo];
    foreach (InventarioModelo::PERIFERICOS as $p) {
        $v = $d[$p] ?? 'presente';
        if (!in_array($v, InventarioModelo::ESTADOS_PERIFERICO, true)) error_out('Estado de periférico no válido.');
        $out[$p] = $v;
    }

    $manual = $d['estado_manual'] ?? null;
    if ($manual !== null && $manual !== '') {
        if (!in_array($manual, InventarioModelo::ESTADOS, true)) error_out('Estado no válido.');
        $motivo = texto($d['motivo_manual'] ?? '', 200);   // el motivo es opcional
        $out['estado_manual'] = $manual;
        $out['motivo_manual'] = $motivo === '' ? null : $motivo;
    } else {
        $out['estado_manual'] = null;
        $out['motivo_manual'] = null;
    }

    $obs = trim((string)($d['observaciones'] ?? ''));
    $out['observaciones'] = mb_substr($obs, 0, 1000, 'UTF-8');
    $out['so'] = $cat->idsExistentes('so', (array)($d['so'] ?? []));
    $out['software'] = $cat->idsExistentes('software', (array)($d['software'] ?? []));
    $out['specs'] = validar_specs($d['specs'] ?? null, $cat);

    $out['lugar_id'] = null;
    if (!$id && !empty($d['lugar_id'])) {
        $lugar = $inv->lugar((int)$d['lugar_id']);
        if ($lugar && $lugar['laboratorio_id'] === $labId && $inv->equipoEnLugar($lugar['id']) === null) {
            $out['lugar_id'] = $lugar['id'];
        }
    }
    return $out;
}

/**
 * Especificaciones técnicas. Los componentes llegan por nombre y se dan de alta en el catálogo si son nuevos.
 * $parcial = true (edición en lote): solo se devuelven los campos que traen valor.
 */
function validar_specs($sp, CatalogoModelo $cat, bool $parcial = false): ?array
{
    if (!is_array($sp)) return null;
    $out = [];
    foreach (['modelo', 'procesador', 'grafica', 'motherboard'] as $t) {
        if (!array_key_exists($t, $sp)) continue;
        $nombre = texto((string)($sp[$t] ?? ''), 100);
        if ($nombre === '' && $parcial) continue;
        $out[CatalogoModelo::TIPOS_COMPONENTE[$t]] = $nombre === '' ? null : $cat->asegurarComponente($t, $nombre);
    }
    if (array_key_exists('ram_gb', $sp)) {
        $ram = (int)($sp['ram_gb'] ?? 0);
        if ($ram < 0 || $ram > 4096) error_out('La RAM debe estar entre 1 y 4096 GB.');
        if ($ram > 0 || !$parcial) $out['ram_gb'] = $ram ?: null;
    }
    if (array_key_exists('num_serie', $sp) && !$parcial) {
        $out['num_serie'] = texto((string)($sp['num_serie'] ?? ''), 60) ?: null;
    }
    if (array_key_exists('discos', $sp)) {
        $discos = [];
        foreach (array_slice((array)$sp['discos'], 0, 6) as $d) {
            $tipo = in_array($d['tipo'] ?? '', InventarioModelo::TIPOS_DISCO, true) ? $d['tipo'] : null;
            $gb = (int)($d['gb'] ?? 0);
            if (!$tipo && $gb <= 0) continue;
            if ($gb < 0 || $gb > 100000) error_out('Capacidad de disco no válida.');
            $discos[] = ['tipo' => $tipo ?? 'SSD', 'gb' => $gb];
        }
        if ($discos || !$parcial) $out['discos'] = $discos;
    }
    return $out;
}

function ids_enteros($v): array
{
    return array_values(array_unique(array_filter(array_map('intval', (array)$v), static fn($x) => $x > 0)));
}

switch ($accion) {

    // Todo lo necesario para dibujar los dos laboratorios (son pocos equipos,
    // así los filtros y el buscador funcionan al instante en el navegador).
    case 'datos':
        usuario_actual();
        json_out([
            'ok'           => true,
            'laboratorios' => $inv->laboratorios(),
            'lugares'      => $inv->lugares(),
            'equipos'      => $inv->equipos(),
            'so'           => $cat->listar('so'),
            'software'     => $cat->listar('software'),
            'componentes'  => $cat->componentes(),
            'perfiles'     => $cat->perfiles(),
            'ajustes'      => (new AjustesModelo())->todos(),
        ]);

    case 'guardarEquipo':
        $u = admin_escritura();
        $d = validar_equipo(entrada(), $inv, $cat);
        if ($d['id'] && !$inv->equipo($d['id'])) error_out('El equipo ya no existe.', 404);
        $id = $inv->guardarEquipo($d, (int)$u['id']);
        json_out(['ok' => true, 'equipo' => $inv->equipo($id), 'componentes' => $cat->componentes(), 'mensaje' => "{$d['numero']} guardado."]);

    case 'eliminarEquipo':
        admin_escritura();
        $id = (int)(entrada()['id'] ?? 0);
        $e = $inv->equipo($id);
        if (!$e) error_out('El equipo ya no existe.', 404);
        $inv->eliminarEquipo($id);
        json_out(['ok' => true, 'mensaje' => "{$e['numero']} eliminado."]);

    case 'mover':
        $u = admin_escritura();
        $d = entrada();
        $e = $inv->equipo((int)($d['equipo_id'] ?? 0));
        if (!$e) error_out('El equipo ya no existe.', 404);
        $lugarId = isset($d['lugar_id']) && $d['lugar_id'] !== null ? (int)$d['lugar_id'] : null;
        if ($lugarId !== null) {
            $lugar = $inv->lugar($lugarId);
            if (!$lugar) error_out('Ese lugar ya no existe. Recarga el mapa.', 404);
            if ($lugar['laboratorio_id'] !== $e['laboratorio_id']) error_out('Solo puedes mover equipos dentro del mismo laboratorio.');
        }
        $cambios = $inv->mover($e['id'], $lugarId, (int)$u['id']);
        json_out(['ok' => true, 'cambios' => $cambios]);

    case 'lote':
        $u = admin_escritura();
        $d = entrada();
        $ids = ids_enteros($d['ids'] ?? []);
        if (!$ids) error_out('No seleccionaste equipos.');
        if (count($inv->equipos(null, $ids)) !== count($ids)) error_out('Algunos equipos ya no existen. Recarga el mapa.', 404);

        $c = (array)($d['cambios'] ?? []);
        $limpio = [];
        foreach (['so', 'software'] as $k) {
            $limpio["{$k}_agregar"] = $cat->idsExistentes($k, (array)($c["{$k}_agregar"] ?? []));
            $limpio["{$k}_quitar"] = $cat->idsExistentes($k, (array)($c["{$k}_quitar"] ?? []));
        }
        $limpio['perifericos'] = [];
        foreach ((array)($c['perifericos'] ?? []) as $p => $v) {
            if (in_array($p, InventarioModelo::PERIFERICOS, true) && in_array($v, InventarioModelo::ESTADOS_PERIFERICO, true)) {
                $limpio['perifericos'][$p] = $v;
            }
        }
        $limpio['specs'] = validar_specs($c['specs'] ?? null, $cat, true) ?? [];
        $est = $c['estado'] ?? null;
        if ($est === 'auto') {
            $limpio['estado'] = 'auto';
        } elseif (is_array($est)) {
            if (!in_array($est['estado'] ?? '', InventarioModelo::ESTADOS, true)) error_out('Estado no válido.');
            $motivo = texto($est['motivo'] ?? '', 200);
            $limpio['estado'] = ['estado' => $est['estado'], 'motivo' => $motivo === '' ? null : $motivo];
        }

        $inv->lote($ids, $limpio, (int)$u['id']);
        $n = count($ids);
        json_out(['ok' => true, 'equipos' => $inv->equipos(null, $ids), 'componentes' => $cat->componentes(), 'mensaje' => "Se actualizaron $n equipo" . ($n === 1 ? '' : 's') . '.']);

    case 'copiar':
        $u = admin_escritura();
        $d = entrada();
        $origen = $inv->equipo((int)($d['origen_id'] ?? 0));
        if (!$origen) error_out('El equipo modelo ya no existe.', 404);
        $ids = array_values(array_diff(ids_enteros($d['ids'] ?? []), [$origen['id']]));
        if (!$ids) error_out('Selecciona al menos un equipo destino distinto del modelo.');
        if (count($inv->equipos(null, $ids)) !== count($ids)) error_out('Algunos equipos ya no existen. Recarga el mapa.', 404);
        $partes = array_values(array_intersect((array)($d['partes'] ?? []), ['perifericos', 'so', 'software', 'specs', 'estado']));
        if (!$partes) error_out('Elige qué quieres copiar.');
        $inv->copiar($origen['id'], $ids, $partes, (int)$u['id']);
        $n = count($ids);
        json_out(['ok' => true, 'equipos' => $inv->equipos(null, $ids),
            'mensaje' => "Configuración de {$origen['numero']} copiada a $n equipo" . ($n === 1 ? '' : 's') . '.']);

    case 'firmaReporte':
        // Nombre y cargo sugeridos para el "Vo. Bo." de los reportes (lo puede guardar cualquier usuario)
        usuario_actual();
        $d = entrada();
        $aj = new AjustesModelo();
        $aj->guardar('firma_vobo_nombre', texto((string)($d['nombre'] ?? ''), 90) ?: null);
        $aj->guardar('firma_vobo_cargo', texto((string)($d['cargo'] ?? ''), 90) ?: null);
        json_out(['ok' => true, 'ajustes' => $aj->todos()]);

    case 'perfilLab':
        admin_escritura();
        $d = entrada();
        $lab = $inv->laboratorio((int)($d['laboratorio_id'] ?? 0));
        if (!$lab) error_out('Laboratorio no válido.');
        $perfil = (int)($d['perfil_id'] ?? 0);
        if ($perfil && !$cat->perfilExiste($perfil)) error_out('Ese perfil ya no existe.', 404);
        $aj = new AjustesModelo();
        $aj->guardar('perfil_lab_' . $lab['id'], $perfil ? (string)$perfil : null);
        json_out(['ok' => true, 'ajustes' => $aj->todos(), 'mensaje' => 'Perfil base actualizado.']);

    case 'ponerSoftware':
        $u = admin_escritura();
        $d = entrada();
        $e = $inv->equipo((int)($d['equipo_id'] ?? 0));
        if (!$e) error_out('El equipo ya no existe.', 404);
        $instalado = (bool)($d['instalado'] ?? false);
        // Por programa (matriz): quitar = todas sus versiones; poner = "sin versión" (respeta la versión que ya tenga)
        $programa = texto((string)($d['programa'] ?? ''), 80);
        if ($programa !== '') {
            if ($instalado) {
                $inv->ponerSoftware($e['id'], $cat->asegurarSW($programa, null), true, (int)$u['id']);
            } else {
                $inv->quitarPrograma($e['id'], $programa);
                $inv->ponerSoftware($e['id'], 0, false, (int)$u['id']);
            }
            json_out(['ok' => true, 'equipo' => $inv->equipo($e['id']), 'software' => $cat->listar('software')]);
        }
        $sw = $cat->idsExistentes('software', [(int)($d['software_id'] ?? 0)]);
        if (!$sw) error_out('Ese programa ya no existe.', 404);
        $inv->ponerSoftware($e['id'], $sw[0], $instalado, (int)$u['id']);
        json_out(['ok' => true, 'equipo' => $inv->equipo($e['id'])]);

    /* ---------------- Edición del mapa ---------------- */

    case 'insertarLugar':
        admin_escritura();
        $d = entrada();
        $labId = (int)($d['laboratorio_id'] ?? 0);
        $fila = (int)($d['fila'] ?? 0);
        $col = (int)($d['columna'] ?? 0);
        $filas = $inv->filas($labId);
        if (!isset($filas[$fila])) error_out('Esa fila no existe.');
        if ($filas[$fila]['n'] >= 20) error_out('Una fila puede tener como máximo 20 lugares.');
        $col = max(1, min($col, $filas[$fila]['maxcol'] + 1));
        $nuevo = $inv->insertarLugar($labId, $fila, $col);
        json_out(['ok' => true, 'id' => $nuevo, 'lugares' => $inv->lugares()]);

    case 'agregarFila':
        admin_escritura();
        $d = entrada();
        $labId = (int)($d['laboratorio_id'] ?? 0);
        if (!$inv->laboratorio($labId)) error_out('Laboratorio no válido.');
        $cant = (int)($d['cantidad'] ?? 1);
        if ($cant < 1 || $cant > 20) error_out('La fila debe tener entre 1 y 20 lugares.');
        if (count($inv->filas($labId)) >= 15) error_out('Se alcanzó el máximo de 15 filas.');
        $fila = $inv->agregarFila($labId, $cant);
        json_out(['ok' => true, 'lugares' => $inv->lugares(), 'mensaje' => "Fila $fila agregada."]);

    case 'eliminarLugar':
        admin_escritura();
        $d = entrada();
        $lugar = $inv->lugar((int)($d['id'] ?? 0));
        if (!$lugar) error_out('Ese lugar ya no existe.', 404);
        if ($inv->equipoEnLugar($lugar['id']) !== null) error_out('El lugar tiene un equipo. Muévelo primero.');
        // recorrer=false deja el espacio en blanco (los demás lugares no se mueven)
        $inv->eliminarLugar($lugar, ($d['recorrer'] ?? true) !== false);
        json_out(['ok' => true, 'lugares' => $inv->lugares()]);

    case 'eliminarFila':
        admin_escritura();
        $d = entrada();
        $labId = (int)($d['laboratorio_id'] ?? 0);
        $fila = (int)($d['fila'] ?? 0);
        if (!isset($inv->filas($labId)[$fila])) error_out('Esa fila no existe.');
        if ($inv->equiposEnFila($labId, $fila) > 0) error_out('La fila tiene equipos. Muévelos antes de eliminarla.');
        $inv->eliminarFila($labId, $fila);
        json_out(['ok' => true, 'lugares' => $inv->lugares(), 'mensaje' => "Fila $fila eliminada."]);

    default:
        error_out('Acción no válida.', 404);
}
