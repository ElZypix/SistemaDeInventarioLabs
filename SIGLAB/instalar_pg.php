<?php
// instalar_pg.php — Se ejecuta al arrancar el contenedor de Render (antes de Apache).
// Si la base de Neon está vacía, crea las tablas y los datos iniciales con db/siglab_pg.sql.
// Si ya tiene datos, no hace nada. Queda fuera de la carpeta pública.

declare(strict_types=1);
require_once __DIR__ . '/html/config/conexionBD.php';
require_once __DIR__ . '/html/model/php/RespaldoModelo.php';

if (DATABASE_URL === '') { fwrite(STDERR, "[SIGLAB] Falta DATABASE_URL: no se revisa la base.\n"); exit(0); }

for ($intento = 1; $intento <= 5; $intento++) {
    try {
        $db = Conexion::obtener();
        break;
    } catch (Throwable $e) {
        fwrite(STDERR, "[SIGLAB] La base aún no responde (intento $intento): {$e->getMessage()}\n");
        sleep(3);
    }
}
if (!isset($db)) exit(0);   // Apache arranca igual y la app mostrará el error de conexión

$existe = $db->query("SELECT to_regclass('public.usuarios')")->fetchColumn();
if ($existe) {
    // Base ya instalada: solo se asegura la tabla de sesiones (por si viene de una versión anterior)
    $db->exec('CREATE TABLE IF NOT EXISTS sesiones (id VARCHAR(128) PRIMARY KEY, datos TEXT NOT NULL, expira INTEGER NOT NULL)');
    fwrite(STDERR, "[SIGLAB] Base de datos lista.\n");
    exit(0);
}

$sql = (string)file_get_contents(__DIR__ . '/db/siglab_pg.sql');
$db->beginTransaction();
try {
    foreach (RespaldoModelo::dividir($sql, false) as $s) $db->exec($s);
    $db->commit();
    fwrite(STDERR, "[SIGLAB] Base de datos creada en Neon con los datos iniciales.\n");
} catch (Throwable $e) {
    $db->rollBack();
    fwrite(STDERR, "[SIGLAB] No se pudo crear la base: {$e->getMessage()}\n");
}
