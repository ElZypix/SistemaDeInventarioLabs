-- =============================================================================
-- SIGLAB · Migración a la versión 1.4
--  · Sistemas operativos separados en familia / distribución / versión
--  · Fecha de captura del inventario y tabla de ajustes (para la pantalla de Inicio)
-- Ejecutar UNA sola vez sobre una base que ya tiene la versión 1.3.
-- Conserva todos los datos. Las instalaciones nuevas ya traen esto en siglab.sql.
-- =============================================================================
SET NAMES utf8mb4;
USE `siglab_db`;

-- 1) Sistemas operativos: nuevas columnas
ALTER TABLE `sistemas_operativos`
  ADD COLUMN `distribucion` VARCHAR(60) NULL AFTER `familia`,
  ADD COLUMN `version` VARCHAR(40) NULL AFTER `distribucion`;

-- Convierte lo que ya existe: "Windows 11" → versión 11; "Zorin OS" → distribución Zorin OS
UPDATE `sistemas_operativos` SET `version` = TRIM(SUBSTRING(`nombre`, 9))
 WHERE `familia` = 'windows' AND `nombre` LIKE 'Windows %';
UPDATE `sistemas_operativos` SET `version` = TRIM(SUBSTRING(`nombre`, 7))
 WHERE `familia` = 'macos' AND `nombre` LIKE 'macOS %';
UPDATE `sistemas_operativos` SET `distribucion` = `nombre`
 WHERE `familia` IN ('linux', 'otro') AND `distribucion` IS NULL;

-- Versiones comunes precargadas (no duplica si ya existen)
INSERT IGNORE INTO `sistemas_operativos` (`nombre`, `familia`, `distribucion`, `version`) VALUES
 ('Debian 12', 'linux', 'Debian', '12'),
 ('Linux Mint 22', 'linux', 'Linux Mint', '22'),
 ('Ubuntu 24.04', 'linux', 'Ubuntu', '24.04'),
 ('Ubuntu 22.04', 'linux', 'Ubuntu', '22.04'),
 ('Zorin OS 17', 'linux', 'Zorin OS', '17'),
 ('macOS Golden Gate', 'macos', NULL, 'Golden Gate (27)'),
 ('macOS Tahoe', 'macos', NULL, 'Tahoe (26)'),
 ('macOS Sequoia', 'macos', NULL, 'Sequoia (15)'),
 ('macOS Sonoma', 'macos', NULL, 'Sonoma (14)'),
 ('macOS Ventura', 'macos', NULL, 'Ventura (13)');

-- 2) Fecha en que cada PC dejó de estar "Pendiente de inventario"
ALTER TABLE `equipos` ADD COLUMN `capturado_en` DATETIME NULL AFTER `estado_desde`;
UPDATE `equipos` SET `capturado_en` = COALESCE(`actualizado_en`, NOW())
 WHERE `capturado_en` IS NULL AND NOT (COALESCE(`estado_manual`, '') = 'azul' AND LOWER(COALESCE(`motivo_manual`, '')) = 'pendiente de inventario');

-- 3) Ajustes generales (último respaldo y perfil base por laboratorio)
CREATE TABLE IF NOT EXISTS `ajustes` (
  `clave`  VARCHAR(60) NOT NULL,
  `valor`  VARCHAR(255) NULL,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO `ajustes` (`clave`, `valor`)
  SELECT CONCAT('perfil_lab_', l.id), p.id FROM `laboratorios` l JOIN `perfiles_software` p
  ON (l.clave = 'DS' AND p.nombre = 'Imagen Desarrollo') OR (l.clave = 'TC' AND p.nombre = 'Imagen Telecomunicaciones');
