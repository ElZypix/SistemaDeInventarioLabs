<?php
// app.php — Contenedor principal de SIGLAB (requiere sesión iniciada).
declare(strict_types=1);
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/config/conexionBD.php';
require_once __DIR__ . '/model/php/UsuarioModelo.php';

require_once __DIR__ . '/config/sesion.php';
abrir_sesion();

$u = null;
if (!empty($_SESSION['usuario_id'])
    && (time() - (int)($_SESSION['ultimo_mov'] ?? time())) <= SESION_INACTIVIDAD) {
    $u = (new UsuarioModelo())->porId((int)$_SESSION['usuario_id']);
}
if (!$u || (int)$u['activo'] !== 1) {
    $_SESSION = [];
    header('Location: index.php?expirada=1');
    exit;
}
$_SESSION['ultimo_mov'] = time();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));

header('Cache-Control: no-store');
$publico = UsuarioModelo::publico($u);
$v = APP_VERSION;
$esAdmin = $u['rol'] === 'admin';
?>
<!DOCTYPE html>
<html lang="es" class="<?= $u['tema'] === 'dark' ? 'dark' : '' ?>">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf" content="<?= htmlspecialchars($_SESSION['csrf']) ?>">
  <title>SIGLAB · Laboratorios</title>
  <link rel="icon" href="view/img/favicon.svg" type="image/svg+xml">
  <script>try { localStorage.setItem('siglab-tema', '<?= $u['tema'] === 'dark' ? 'dark' : 'light' ?>'); } catch (e) {}</script>
  <link rel="stylesheet" href="view/css/base.css?v=<?= $v ?>">
  <link rel="stylesheet" href="view/css/app.css?v=<?= $v ?>">
  <script id="sesion" type="application/json"><?= json_encode($publico, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
</head>
<body class="<?= $esAdmin ? 'es-admin' : 'es-visor' ?>">
<div class="app" id="app">

  <aside class="lateral" id="lateral">
    <div class="marca">
      <div class="marca-logo"><span data-icono="laboratorio"></span></div>
      <div><b>SIGLAB</b><small>Gestión de laboratorios</small></div>
    </div>

    <nav class="nav" aria-label="Secciones">
      <button class="nav-item activo" data-vista="mapa"><span data-icono="mapa"></span><span>Laboratorios</span></button>
      <button class="nav-item" data-vista="estadisticas"><span data-icono="estadisticas"></span><span>Estadísticas</span></button>
      <button class="nav-item" data-vista="matriz"><span data-icono="matriz"></span><span>Software</span></button>
      <button class="nav-item" data-vista="pendientes"><span data-icono="tareas"></span><span>Pendientes</span></button>
      <?php if ($esAdmin): ?>
      <button class="nav-item" data-vista="catalogos"><span data-icono="catalogo"></span><span>Catálogos</span></button>
      <button class="nav-item" data-vista="usuarios"><span data-icono="usuarios"></span><span>Usuarios</span></button>
      <button class="nav-item" data-vista="respaldo"><span data-icono="baseDatos"></span><span>Respaldo</span></button>
      <?php endif; ?>
      <span class="nav-indicador" aria-hidden="true"></span>
    </nav>

    <div class="lateral-resumen" id="lateral-resumen"></div>

    <div class="lateral-pie">
      <img src="view/img/tecnm-blanco.png" alt="TecNM" class="lateral-tecnm">
    </div>
  </aside>

  <div class="principal">
    <header class="superior">
      <button class="btn icon fantasma solo-movil" id="btn-menu" aria-label="Menú"><span data-icono="menu"></span></button>

      <div class="buscador" id="buscador">
        <span data-icono="buscar" class="buscador-ico"></span>
        <input id="buscar" type="search" placeholder="Buscar equipo, sistema, software o estado…" autocomplete="off" aria-label="Buscar">
        <span class="kbd buscador-kbd">Ctrl K</span>
        <div class="buscador-res" id="buscador-res" role="listbox" hidden></div>
      </div>

      <div class="superior-acciones">
        <button class="btn" id="btn-reporte"><span data-icono="pdf"></span><span class="ocultar-sm">Reportes</span></button>
        <button class="btn icon" id="btn-tema" aria-label="Cambiar tema"></button>
        <div class="cuenta">
          <button class="cuenta-btn" id="btn-cuenta" aria-haspopup="menu" aria-expanded="false">
            <span class="avatar"><?= htmlspecialchars(mb_strtoupper(mb_substr($u['nombre'], 0, 1))) ?></span>
            <span class="cuenta-txt ocultar-sm"><b><?= htmlspecialchars($u['nombre']) ?></b><small><?= $esAdmin ? 'Administrador' : 'Visualización' ?></small></span>
            <span data-icono="flecha" data-icono-clase="sm"></span>
          </button>
          <div class="cuenta-menu" id="cuenta-menu" role="menu" hidden>
            <button role="menuitem" data-accion="password"><span data-icono="llave"></span>Cambiar contraseña</button>
            <button role="menuitem" data-accion="salir" class="peligro"><span data-icono="salir"></span>Cerrar sesión</button>
          </div>
        </div>
      </div>
    </header>

    <main class="contenido" id="contenido">
      <!-- ============ Vista: mapa de laboratorios ============ -->
      <section class="vista activa" id="vista-mapa" data-vista="mapa">
        <div class="mapa-cabecera">
          <div class="lab-switch" id="lab-switch" role="tablist" aria-label="Laboratorio"><span class="lab-indicador"></span></div>
          <div class="mapa-acciones">
            <button class="btn icon" id="btn-atajos" title="Atajos de teclado (?)"><span data-icono="teclas"></span></button>
            <button class="btn solo-admin" id="btn-recorrido" title="Capturar el inventario PC por PC (ideal en celular o tablet)"><span data-icono="recorrido"></span><span class="ocultar-sm">Recorrido</span></button>
            <button class="btn solo-admin" id="btn-seleccionar" title="Seleccionar varias PCs para editarlas a la vez"><span data-icono="seleccionar"></span><span class="ocultar-sm">Seleccionar</span></button>
            <button class="btn solo-admin" id="btn-editar-mapa" title="Agregar o quitar lugares y filas"><span data-icono="laboratorio"></span><span class="ocultar-sm">Editar mapa</span></button>
            <button class="btn primario solo-admin" id="btn-nueva"><span data-icono="mas"></span><span class="ocultar-sm">Nueva PC</span></button>
          </div>
        </div>

        <div class="progreso" id="progreso" aria-live="polite"></div>

        <div class="stats" id="stats"></div>

        <div class="filtros" id="filtros"></div>

        <div class="aviso-modo" id="aviso-modo" hidden></div>

        <div class="mapa" id="mapa">
          <div class="pizarron"><span data-icono="pizarron" data-icono-clase="sm"></span>Pizarrón</div>
          <div class="mapa-grid" id="mapa-grid"></div>
          <div class="mapa-extra" id="mapa-extra"></div>
        </div>

        <div class="bandeja" id="bandeja" hidden>
          <div class="bandeja-head"><span data-icono="bandeja"></span><b>Sin ubicar</b><small>Arrastra estos equipos a un lugar del mapa.</small></div>
          <div class="bandeja-items" id="bandeja-items"></div>
        </div>
      </section>

      <!-- ============ Vista: estadísticas ============ -->
      <section class="vista" id="vista-estadisticas" data-vista="estadisticas">
        <div class="vista-head"><div><h1>Estadísticas</h1><p>Panorama del estado de los equipos, sistemas, periféricos y software.</p></div></div>
        <div id="estadisticas"></div>
      </section>

      <!-- ============ Vista: matriz de software ============ -->
      <section class="vista" id="vista-matriz" data-vista="matriz">
        <div class="vista-head"><div><h1>Matriz de software</h1><p>Qué programas tiene cada PC y dónde faltan instalaciones.</p></div></div>
        <div id="matriz"></div>
      </section>

      <!-- ============ Vista: pendientes ============ -->
      <section class="vista" id="vista-pendientes" data-vista="pendientes">
        <div class="vista-head"><div><h1>Pendientes</h1><p>Tareas por hacer en cada equipo.</p></div></div>
        <div id="pendientes"></div>
      </section>

      <?php if ($esAdmin): ?>
      <!-- ============ Vista: catálogos ============ -->
      <section class="vista" id="vista-catalogos" data-vista="catalogos">
        <div class="vista-head">
          <div><h1>Catálogos</h1><p>Sistemas operativos y software que puedes asignar a los equipos.</p></div>
        </div>
        <div class="catalogos" id="catalogos"></div>
      </section>

      <!-- ============ Vista: usuarios ============ -->
      <section class="vista" id="vista-usuarios" data-vista="usuarios">
        <div class="vista-head">
          <div><h1>Usuarios</h1><p>Administradores (control total) y usuarios de visualización (solo consulta y reportes).</p></div>
          <button class="btn primario" id="btn-nuevo-usuario"><span data-icono="mas"></span>Nuevo usuario</button>
        </div>
        <div class="panel"><div class="tabla-wrap" id="tabla-usuarios"></div></div>
      </section>

      <!-- ============ Vista: respaldo ============ -->
      <section class="vista" id="vista-respaldo" data-vista="respaldo">
        <div class="vista-head">
          <div><h1>Respaldo de la base de datos</h1><p>Descarga una copia completa o restaura una copia anterior.</p></div>
        </div>
        <div class="respaldo" id="respaldo"></div>
      </section>
      <?php endif; ?>
    </main>
  </div>
</div>

<div class="lote-barra" id="lote-barra" hidden></div>
<div class="tooltip-pc" id="tooltip-pc" hidden></div>
<div id="toasts" aria-live="polite"></div>

<script type="module" src="view/js/main.js?v=<?= $v ?>"></script>
</body>
</html>
