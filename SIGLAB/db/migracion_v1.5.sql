-- =============================================================================
-- SIGLAB · Migración a la versión 1.5
--  · Software con versión (programa + versión opcional)
--  · Especificaciones técnicas de los equipos y catálogo de componentes
-- Ejecutar UNA sola vez sobre una base que ya tiene la versión 1.4.
-- Conserva todos los datos. Las instalaciones nuevas ya traen esto en siglab.sql.
-- =============================================================================
SET NAMES utf8mb4;
USE `siglab_db`;

-- 1) Software: programa + versión (lo que ya existe queda como programa sin versión)
ALTER TABLE `software`
  MODIFY `nombre` VARCHAR(120) NOT NULL,
  ADD COLUMN `programa` VARCHAR(80) NULL AFTER `nombre`,
  ADD COLUMN `version` VARCHAR(40) NULL AFTER `programa`;
UPDATE `software` SET `programa` = `nombre` WHERE `programa` IS NULL;
ALTER TABLE `software` MODIFY `programa` VARCHAR(80) NOT NULL;

-- 2) Catálogo de componentes
CREATE TABLE IF NOT EXISTS `componentes` (
  `id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tipo`    ENUM('modelo','procesador','grafica','motherboard') NOT NULL,
  `nombre`  VARCHAR(100) NOT NULL,
  `activo`  TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_componentes` (`tipo`, `nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO `componentes` (`tipo`, `nombre`) VALUES ('grafica', 'Integrada');

-- 3) Especificaciones en cada equipo
ALTER TABLE `equipos`
  ADD COLUMN `modelo_id`      INT UNSIGNED NULL AFTER `observaciones`,
  ADD COLUMN `num_serie`      VARCHAR(60) NULL AFTER `modelo_id`,
  ADD COLUMN `procesador_id`  INT UNSIGNED NULL AFTER `num_serie`,
  ADD COLUMN `ram_gb`         SMALLINT UNSIGNED NULL AFTER `procesador_id`,
  ADD COLUMN `grafica_id`     INT UNSIGNED NULL AFTER `ram_gb`,
  ADD COLUMN `motherboard_id` INT UNSIGNED NULL AFTER `grafica_id`,
  ADD COLUMN `discos`         VARCHAR(255) NULL AFTER `motherboard_id`,
  ADD CONSTRAINT `fk_equipos_modelo` FOREIGN KEY (`modelo_id`) REFERENCES `componentes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_equipos_cpu`    FOREIGN KEY (`procesador_id`) REFERENCES `componentes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_equipos_gpu`    FOREIGN KEY (`grafica_id`) REFERENCES `componentes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_equipos_mb`     FOREIGN KEY (`motherboard_id`) REFERENCES `componentes` (`id`) ON DELETE SET NULL;
