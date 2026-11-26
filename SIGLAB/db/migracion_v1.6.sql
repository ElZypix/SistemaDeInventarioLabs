-- =============================================================================
-- SIGLAB · Migración a la versión 1.6 (MySQL / MariaDB local)
--  · Tabla de sesiones (solo se usa en línea con SESIONES_BD=1; local es opcional)
-- Ejecutar UNA sola vez sobre una base que ya tiene la versión 1.5.
-- =============================================================================
SET NAMES utf8mb4;
USE `siglab_db`;

CREATE TABLE IF NOT EXISTS `sesiones` (
  `id`      VARCHAR(128) NOT NULL,
  `datos`   TEXT NOT NULL,
  `expira`  INT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_sesiones_expira` (`expira`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
