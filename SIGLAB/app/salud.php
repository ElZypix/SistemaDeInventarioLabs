<?php
// salud.php — Comprobación de Render: responde 200 si PHP está vivo.
// No consulta la base de datos para no mantener despierta la base de Neon sin necesidad.
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
echo 'ok';
