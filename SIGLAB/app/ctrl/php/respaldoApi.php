<?php
// ctrl/php/respaldoApi.php — Descargar y restaurar respaldos .sql (solo administradores).

declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../../model/php/RespaldoModelo.php';
require_once __DIR__ . '/../../model/php/AjustesModelo.php';

$accion = $_GET['accion'] ?? '';
$u = usuario_actual();
requerir_admin($u);
$resp = new RespaldoModelo();

switch ($accion) {

    case 'descargar':
        // Se pide con un formulario POST para poder validar el token CSRF.
        solo_metodo('POST');
        verificar_csrf();
        $sql = $resp->generar();
        $aj = new AjustesModelo();
        $aj->guardar('ultimo_respaldo', date('Y-m-d H:i:s'));
        $aj->guardar('ultimo_respaldo_por', mb_substr((string)$u['nombre'], 0, 120));
        $archivo = 'siglab_respaldo_' . date('Y-m-d_His') . '.sql';
        header('Content-Type: application/sql; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $archivo . '"');
        header('Cache-Control: no-store');
        echo $sql;
        exit;

    case 'restaurar':
        solo_metodo('POST');
        verificar_csrf();
        if (($_POST['confirmacion'] ?? '') !== 'RESTAURAR') error_out('Escribe RESTAURAR para confirmar.');
        $f = $_FILES['archivo'] ?? null;
        if (!$f || $f['error'] !== UPLOAD_ERR_OK) error_out('Selecciona un archivo .sql válido.');
        if (!preg_match('/\.sql$/i', (string)$f['name'])) error_out('El archivo debe tener extensión .sql.');
        $sql = (string)file_get_contents($f['tmp_name']);
        if (trim($sql) === '') error_out('El archivo está vacío.');
        if (!str_starts_with(ltrim($sql, "\xEF\xBB\xBF"), RespaldoModelo::FIRMA) && !str_contains(substr($sql, 0, 400), 'SIGLAB')) {
            error_out('El archivo no parece un respaldo de SIGLAB.');
        }

        // Respaldo de emergencia antes de restaurar (fuera de la carpeta pública).
        $emergencia = null;
        if (is_dir(BACKUP_DIR) || @mkdir(BACKUP_DIR, 0775, true)) {
            $ruta = BACKUP_DIR . '/emergencia_' . date('Y-m-d_His') . '.sql';
            if (@file_put_contents($ruta, $resp->generar()) !== false) $emergencia = basename($ruta);
        }

        try {
            $n = $resp->restaurar($sql);
        } catch (Throwable $t) {
            error_log('[SIGLAB] Restauración fallida: ' . $t->getMessage());
            error_out('No se pudo restaurar: ' . ($t instanceof RuntimeException ? $t->getMessage() : 'el archivo tiene errores de SQL.')
                . ($emergencia ? " Se guardó un respaldo de emergencia: $emergencia" : ''), 422);
        }
        json_out([
            'ok' => true,
            'mensaje' => "Base de datos restaurada ($n sentencias)." . ($emergencia ? " Respaldo previo guardado como $emergencia." : ''),
        ]);

    default:
        error_out('Acción no válida.', 404);
}
