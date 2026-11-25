-- =============================================================================
-- SIGLAB · Migración a la versión 1.3
-- Ejecutar UNA sola vez sobre una base siglab_db que ya está en uso (v1.0 a v1.2).
-- Conserva todos los datos. Las instalaciones nuevas ya traen esto en siglab.sql.
-- =============================================================================
SET NAMES utf8mb4;
USE `siglab_db`;

-- Fecha desde la que el equipo está en su estado actual
ALTER TABLE `equipos` ADD COLUMN `estado_desde` DATETIME NULL AFTER `motivo_manual`;
UPDATE `equipos` SET `estado_desde` = COALESCE(`actualizado_en`, NOW()) WHERE `estado_desde` IS NULL;

-- Perfiles de software
CREATE TABLE IF NOT EXISTS `perfiles_software` (
  `id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre`  VARCHAR(80) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_perfil_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `perfil_software` (
  `perfil_id`    INT UNSIGNED NOT NULL,
  `software_id`  INT UNSIGNED NOT NULL,
  PRIMARY KEY (`perfil_id`, `software_id`),
  CONSTRAINT `fk_psw_perfil`   FOREIGN KEY (`perfil_id`) REFERENCES `perfiles_software` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_psw_software` FOREIGN KEY (`software_id`) REFERENCES `software` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pendientes por equipo
CREATE TABLE IF NOT EXISTS `pendientes` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `equipo_id`    INT UNSIGNED NOT NULL,
  `texto`        VARCHAR(200) NOT NULL,
  `responsable`  VARCHAR(80) NULL,
  `hecho`        TINYINT(1) NOT NULL DEFAULT 0,
  `creado_en`    DATETIME NOT NULL,
  `creado_por`   INT UNSIGNED NULL,
  `hecho_en`     DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `ix_pendientes_equipo` (`equipo_id`, `hecho`),
  CONSTRAINT `fk_pend_equipo` FOREIGN KEY (`equipo_id`) REFERENCES `equipos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pend_usr`    FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Perfiles de ejemplo (solo con los programas que existan en tu catálogo)
INSERT IGNORE INTO `perfiles_software` (`nombre`) VALUES ('Imagen Desarrollo'), ('Imagen Telecomunicaciones');
INSERT IGNORE INTO `perfil_software` (`perfil_id`, `software_id`)
  SELECT p.id, s.id FROM `perfiles_software` p JOIN `software` s
  ON s.nombre IN ('Visual Studio Code','Apache NetBeans','Java JDK','Python','Git','XAMPP','MySQL Workbench','Google Chrome')
  WHERE p.nombre = 'Imagen Desarrollo';
INSERT IGNORE INTO `perfil_software` (`perfil_id`, `software_id`)
  SELECT p.id, s.id FROM `perfiles_software` p JOIN `software` s
  ON s.nombre IN ('Cisco Packet Tracer','Wireshark','PuTTY','Google Chrome','LibreOffice')
  WHERE p.nombre = 'Imagen Telecomunicaciones';
