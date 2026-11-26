<?php
// index.php — Inicio de sesión de SIGLAB.
declare(strict_types=1);
require_once __DIR__ . '/config/config.php';

require_once __DIR__ . '/config/sesion.php';
abrir_sesion();
if (!empty($_SESSION['usuario_id'])) {
    header('Location: app.php');
    exit;
}
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
$v = APP_VERSION;
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf" content="<?= htmlspecialchars($_SESSION['csrf']) ?>">
  <title>SIGLAB · Iniciar sesión</title>
  <link rel="icon" href="view/img/favicon.svg" type="image/svg+xml">
  <script>try { if (localStorage.getItem('siglab-tema') === 'dark') document.documentElement.classList.add('dark'); } catch (e) {}</script>
  <link rel="stylesheet" href="view/css/base.css?v=<?= $v ?>">
  <link rel="stylesheet" href="view/css/login.css?v=<?= $v ?>">
</head>
<body>
  <main class="login">
    <section class="login-arte" aria-hidden="true">
      <div class="arte-top">
        <img src="view/img/tecnm-blanco.png" alt="" class="arte-logo">
      </div>
      <div class="arte-centro">
        <div class="mini-lab" id="mini-lab"></div>
        <h1>SIGLAB</h1>
        <p>Inventario de los laboratorios de <b>Telecomunicaciones</b> y <b>Desarrollo de Software</b>, estación por estación.</p>
        <ul class="leyenda">
          <li><i class="punto st-verde"></i> Operativa</li>
          <li><i class="punto st-ambar"></i> Detalle menor</li>
          <li><i class="punto st-rojo"></i> Fuera de servicio</li>
          <li><i class="punto st-azul"></i> En revisión</li>
        </ul>
      </div>
      <div class="arte-pie">Instituto Tecnológico de Comitán · TecNM</div>
    </section>

    <section class="login-form-wrap">
      <button class="btn icon fantasma tema-btn" id="btn-tema" type="button" title="Cambiar tema" aria-label="Cambiar tema"></button>
      <form class="login-form" id="form-login" autocomplete="on" novalidate>
        <img src="view/img/tecnm.png" alt="TecNM" class="form-logo">
        <h2>Bienvenido</h2>
        <p class="sub">Inicia sesión para administrar los laboratorios.</p>

        <div class="campo">
          <label for="usuario">Usuario</label>
          <div class="input-icono">
            <span data-icono="usuario"></span>
            <input class="input" id="usuario" name="usuario" autocomplete="username" required autofocus maxlength="40">
          </div>
        </div>
        <div class="campo">
          <label for="password">Contraseña</label>
          <div class="input-icono">
            <span data-icono="candado"></span>
            <input class="input" id="password" name="password" type="password" autocomplete="current-password" required>
            <button type="button" class="ver-pass" id="ver-pass" aria-label="Mostrar contraseña"></button>
          </div>
        </div>

        <div class="login-msg" id="login-msg" role="alert" aria-live="polite"></div>

        <button class="btn primario entrar" id="btn-entrar" type="submit">Entrar</button>
        <p class="pie-form">SIGLAB v<?= $v ?> · Servicio social ago–dic 2026</p>
      </form>
    </section>
  </main>
  <script type="module" src="view/js/login.js?v=<?= $v ?>"></script>
</body>
</html>
