-- =============================================================================
-- SIGLAB - Sistema de Gestión de Laboratorios
-- Instituto Tecnológico de Comitán (TecNM)
-- Base de datos inicial: esquema + catálogos + distribución de los laboratorios
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '-06:00';
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `siglab_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `siglab_db`;

DROP TABLE IF EXISTS `ajustes`;
DROP TABLE IF EXISTS `pendientes`;
DROP TABLE IF EXISTS `perfil_software`;
DROP TABLE IF EXISTS `perfiles_software`;
DROP TABLE IF EXISTS `equipo_software`;
DROP TABLE IF EXISTS `equipo_so`;
DROP TABLE IF EXISTS `equipos`;
DROP TABLE IF EXISTS `lugares`;
DROP TABLE IF EXISTS `laboratorios`;
DROP TABLE IF EXISTS `software`;
DROP TABLE IF EXISTS `componentes`;
DROP TABLE IF EXISTS `sistemas_operativos`;
DROP TABLE IF EXISTS `intentos_login`;
DROP TABLE IF EXISTS `usuarios`;

-- -----------------------------------------------------------------------------
-- Usuarios: solo dos roles (administrador y visualizador)
-- -----------------------------------------------------------------------------
CREATE TABLE `usuarios` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre`         VARCHAR(120) NOT NULL,
  `usuario`        VARCHAR(40)  NOT NULL,
  `password_hash`  VARCHAR(255) NOT NULL,
  `rol`            ENUM('admin','visualizador') NOT NULL DEFAULT 'visualizador',
  `tema`           ENUM('light','dark') NOT NULL DEFAULT 'light',
  `activo`         TINYINT(1) NOT NULL DEFAULT 1,
  `debe_cambiar`   TINYINT(1) NOT NULL DEFAULT 0,
  `ultimo_acceso`  DATETIME NULL,
  `creado_en`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_usuario` (`usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Intentos fallidos de inicio de sesión (bloqueo por usuario y por IP)
CREATE TABLE `intentos_login` (
  `id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario`  VARCHAR(40) NOT NULL,
  `ip`       VARCHAR(45) NOT NULL,
  `fecha`    DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_intentos_usuario` (`usuario`, `fecha`),
  KEY `ix_intentos_ip` (`ip`, `fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Laboratorios y lugares físicos (fila / posición). Un lugar sin equipo = vacío.
-- -----------------------------------------------------------------------------
CREATE TABLE `laboratorios` (
  `id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `clave`   VARCHAR(10)  NOT NULL,
  `nombre`  VARCHAR(120) NOT NULL,
  `orden`   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_laboratorios_clave` (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lugares` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `laboratorio_id`  INT UNSIGNED NOT NULL,
  `fila`            INT NOT NULL,
  `columna`         INT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lugares_posicion` (`laboratorio_id`, `fila`, `columna`),
  CONSTRAINT `fk_lugares_lab` FOREIGN KEY (`laboratorio_id`) REFERENCES `laboratorios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Componentes (catálogo para las especificaciones técnicas de los equipos)
-- -----------------------------------------------------------------------------
CREATE TABLE `componentes` (
  `id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tipo`    ENUM('modelo','procesador','grafica','motherboard') NOT NULL,
  `nombre`  VARCHAR(100) NOT NULL,
  `activo`  TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_componentes` (`tipo`, `nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Equipos (estación completa). El número de inventario no cambia al moverlo.
-- Estado: se calcula con los periféricos; estado_manual lo fija el encargado.
-- -----------------------------------------------------------------------------
CREATE TABLE `equipos` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `laboratorio_id`   INT UNSIGNED NOT NULL,
  `lugar_id`         INT UNSIGNED NULL,
  `numero`           VARCHAR(20) NOT NULL,
  `tipo`             ENUM('pc','mac') NOT NULL DEFAULT 'pc',
  `monitor`          ENUM('presente','faltante','danado') NOT NULL DEFAULT 'presente',
  `teclado`          ENUM('presente','faltante','danado') NOT NULL DEFAULT 'presente',
  `mouse`            ENUM('presente','faltante','danado') NOT NULL DEFAULT 'presente',
  `cpu`              ENUM('presente','faltante','danado') NOT NULL DEFAULT 'presente',
  `estado_manual`    ENUM('verde','ambar','rojo','azul') NULL DEFAULT NULL,
  `motivo_manual`    VARCHAR(200) NULL DEFAULT NULL,
  `estado_desde`     DATETIME NULL,
  `capturado_en`     DATETIME NULL,
  `observaciones`    TEXT NULL,
  `modelo_id`        INT UNSIGNED NULL,
  `num_serie`        VARCHAR(60) NULL,
  `procesador_id`    INT UNSIGNED NULL,
  `ram_gb`           SMALLINT UNSIGNED NULL,
  `grafica_id`       INT UNSIGNED NULL,
  `motherboard_id`   INT UNSIGNED NULL,
  `discos`           VARCHAR(255) NULL,
  `actualizado_en`   DATETIME NULL,
  `actualizado_por`  INT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_equipos_numero` (`laboratorio_id`, `numero`),
  UNIQUE KEY `uq_equipos_lugar` (`lugar_id`),
  CONSTRAINT `fk_equipos_lab`   FOREIGN KEY (`laboratorio_id`) REFERENCES `laboratorios` (`id`),
  CONSTRAINT `fk_equipos_lugar` FOREIGN KEY (`lugar_id`) REFERENCES `lugares` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_equipos_usr`   FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_equipos_modelo` FOREIGN KEY (`modelo_id`) REFERENCES `componentes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_equipos_cpu`    FOREIGN KEY (`procesador_id`) REFERENCES `componentes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_equipos_gpu`    FOREIGN KEY (`grafica_id`) REFERENCES `componentes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_equipos_mb`     FOREIGN KEY (`motherboard_id`) REFERENCES `componentes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Catálogos administrables: sistemas operativos y software
-- -----------------------------------------------------------------------------
CREATE TABLE `sistemas_operativos` (
  `id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre`   VARCHAR(60) NOT NULL,
  `familia`  ENUM('windows','linux','macos','otro') NOT NULL DEFAULT 'otro',
  `distribucion` VARCHAR(60) NULL,
  `version`  VARCHAR(40) NULL,
  `activo`   TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_so_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `software` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre`     VARCHAR(120) NOT NULL,
  `programa`   VARCHAR(80) NOT NULL,
  `version`    VARCHAR(40) NULL,
  `categoria`  VARCHAR(40) NOT NULL DEFAULT 'General',
  `activo`     TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_software_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `equipo_so` (
  `equipo_id`  INT UNSIGNED NOT NULL,
  `so_id`      INT UNSIGNED NOT NULL,
  PRIMARY KEY (`equipo_id`, `so_id`),
  CONSTRAINT `fk_eso_equipo` FOREIGN KEY (`equipo_id`) REFERENCES `equipos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eso_so`     FOREIGN KEY (`so_id`) REFERENCES `sistemas_operativos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `equipo_software` (
  `equipo_id`    INT UNSIGNED NOT NULL,
  `software_id`  INT UNSIGNED NOT NULL,
  PRIMARY KEY (`equipo_id`, `software_id`),
  CONSTRAINT `fk_esw_equipo`   FOREIGN KEY (`equipo_id`) REFERENCES `equipos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_esw_software` FOREIGN KEY (`software_id`) REFERENCES `software` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Perfiles de software (conjuntos con nombre que se aplican de un clic)
-- -----------------------------------------------------------------------------
CREATE TABLE `perfiles_software` (
  `id`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre`  VARCHAR(80) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_perfil_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `perfil_software` (
  `perfil_id`    INT UNSIGNED NOT NULL,
  `software_id`  INT UNSIGNED NOT NULL,
  PRIMARY KEY (`perfil_id`, `software_id`),
  CONSTRAINT `fk_psw_perfil`   FOREIGN KEY (`perfil_id`) REFERENCES `perfiles_software` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_psw_software` FOREIGN KEY (`software_id`) REFERENCES `software` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Pendientes por equipo (tareas con casilla de completado)
-- -----------------------------------------------------------------------------
CREATE TABLE `pendientes` (
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

-- -----------------------------------------------------------------------------
-- Ajustes generales (clave/valor): último respaldo, perfil base por laboratorio
-- -----------------------------------------------------------------------------
CREATE TABLE `ajustes` (
  `clave`  VARCHAR(60) NOT NULL,
  `valor`  VARCHAR(255) NULL,
  PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- DATOS INICIALES
-- =============================================================================

-- Usuario administrador inicial (se pide cambiar la contraseña en el primer acceso)
--   usuario: admin    contraseña: Siglab2026!

INSERT INTO `usuarios` (`id`,`nombre`,`usuario`,`password_hash`,`rol`,`tema`,`activo`,`debe_cambiar`) VALUES
(1,'Administrador','admin','$2y$10$rezQBRlRhRvRsGIuk2txzeWU6tLexWEn4yXM1U7PPvfjzLQVukmGq','admin','light',1,1);

INSERT INTO `sistemas_operativos` (`id`,`nombre`,`familia`,`distribucion`,`version`) VALUES
(1,'Windows 11','windows',NULL,'11'),
(2,'Windows 10','windows',NULL,'10'),
(3,'Windows 8','windows',NULL,'8'),
(4,'Debian 12','linux','Debian','12'),
(5,'Linux Mint 22','linux','Linux Mint','22'),
(6,'Ubuntu 24.04','linux','Ubuntu','24.04'),
(7,'Ubuntu 22.04','linux','Ubuntu','22.04'),
(8,'Zorin OS 17','linux','Zorin OS','17'),
(9,'Zorin OS','linux','Zorin OS',NULL),
(10,'macOS','macos',NULL,NULL),
(11,'macOS Golden Gate','macos',NULL,'Golden Gate (27)'),
(12,'macOS Tahoe','macos',NULL,'Tahoe (26)'),
(13,'macOS Sequoia','macos',NULL,'Sequoia (15)'),
(14,'macOS Sonoma','macos',NULL,'Sonoma (14)'),
(15,'macOS Ventura','macos',NULL,'Ventura (13)');

INSERT INTO `software` (`id`,`nombre`,`programa`,`categoria`) VALUES
(1,'Visual Studio Code','Visual Studio Code','Editores e IDE'),
(2,'Apache NetBeans','Apache NetBeans','Editores e IDE'),
(3,'Eclipse','Eclipse','Editores e IDE'),
(4,'IntelliJ IDEA','IntelliJ IDEA','Editores e IDE'),
(5,'Android Studio','Android Studio','Editores e IDE'),
(6,'Xcode','Xcode','Editores e IDE'),
(7,'Java JDK','Java JDK','Lenguajes y entornos'),
(8,'Python','Python','Lenguajes y entornos'),
(9,'Node.js','Node.js','Lenguajes y entornos'),
(10,'Git','Git','Lenguajes y entornos'),
(11,'XAMPP','XAMPP','Bases de datos y servidores'),
(12,'MySQL Workbench','MySQL Workbench','Bases de datos y servidores'),
(13,'Cisco Packet Tracer','Cisco Packet Tracer','Redes'),
(14,'Wireshark','Wireshark','Redes'),
(15,'PuTTY','PuTTY','Redes'),
(16,'Microsoft Office','Microsoft Office','Ofimática'),
(17,'LibreOffice','LibreOffice','Ofimática'),
(18,'Google Chrome','Google Chrome','Navegadores'),
(19,'Mozilla Firefox','Mozilla Firefox','Navegadores');

INSERT INTO `componentes` (`tipo`,`nombre`) VALUES ('grafica','Integrada');

INSERT INTO `laboratorios` (`id`,`clave`,`nombre`,`orden`) VALUES
(1,'DS','Laboratorio de Desarrollo de Software',1),
(2,'TC','Laboratorio de Telecomunicaciones',2);

-- Distribución física: fila 1 = la más cercana al pizarrón

INSERT INTO `lugares` (`id`,`laboratorio_id`,`fila`,`columna`) VALUES
(1,1,1,1),
(2,1,1,2),
(3,1,1,3),
(4,1,1,4),
(5,1,1,5),
(6,1,2,1),
(7,1,2,2),
(8,1,2,3),
(9,1,2,4),
(10,1,2,5),
(11,1,3,1),
(12,1,3,2),
(13,1,3,3),
(14,1,3,4),
(15,1,4,1),
(16,1,4,2),
(17,1,4,3),
(18,1,4,4),
(19,1,4,5),
(20,1,4,6),
(21,1,4,7),
(22,1,5,1),
(23,1,5,2),
(24,1,5,3),
(25,1,5,4),
(26,1,5,5),
(27,1,5,6),
(28,1,5,7),
(29,1,5,8),
(30,2,1,1),
(31,2,1,2),
(32,2,1,3),
(33,2,1,4),
(34,2,1,5),
(35,2,1,6),
(36,2,1,7),
(37,2,1,8),
(38,2,2,1),
(39,2,2,2),
(40,2,2,3),
(41,2,2,4),
(42,2,2,5),
(43,2,2,6),
(44,2,2,7),
(45,2,2,8),
(46,2,3,1),
(47,2,3,2),
(48,2,3,3),
(49,2,3,4),
(50,2,3,5),
(51,2,3,6),
(52,2,3,7),
(53,2,3,8),
(54,2,4,1),
(55,2,4,2),
(56,2,4,3),
(57,2,4,4),
(58,2,4,5),
(59,2,4,6),
(60,2,4,7),
(61,2,4,8);

-- Equipos: todos inician 'En revisión' hasta que se levante el inventario

INSERT INTO `equipos` (`id`,`laboratorio_id`,`lugar_id`,`numero`,`tipo`,`estado_manual`,`motivo_manual`,`estado_desde`) VALUES
(1,1,1,'PC01','mac','azul','Pendiente de inventario',NOW()),
(2,1,2,'PC02','mac','azul','Pendiente de inventario',NOW()),
(3,1,3,'PC03','mac','azul','Pendiente de inventario',NOW()),
(4,1,4,'PC04','mac','azul','Pendiente de inventario',NOW()),
(5,1,6,'PC05','pc','azul','Pendiente de inventario',NOW()),
(6,1,7,'PC06','pc','azul','Pendiente de inventario',NOW()),
(7,1,8,'PC07','pc','azul','Pendiente de inventario',NOW()),
(8,1,10,'PC08','pc','azul','Pendiente de inventario',NOW()),
(9,1,11,'PC09','pc','azul','Pendiente de inventario',NOW()),
(10,1,12,'PC10','pc','azul','Pendiente de inventario',NOW()),
(11,1,14,'PC11','pc','azul','Pendiente de inventario',NOW()),
(12,1,15,'PC12','pc','azul','Pendiente de inventario',NOW()),
(13,1,16,'PC13','pc','azul','Pendiente de inventario',NOW()),
(14,1,17,'PC14','pc','azul','Pendiente de inventario',NOW()),
(15,1,18,'PC15','pc','azul','Pendiente de inventario',NOW()),
(16,1,19,'PC16','pc','azul','Pendiente de inventario',NOW()),
(17,1,20,'PC17','pc','azul','Pendiente de inventario',NOW()),
(18,1,21,'PC18','pc','azul','Pendiente de inventario',NOW()),
(19,1,22,'PC19','pc','azul','Pendiente de inventario',NOW()),
(20,1,23,'PC20','pc','azul','Pendiente de inventario',NOW()),
(21,1,24,'PC21','pc','azul','Pendiente de inventario',NOW()),
(22,1,25,'PC22','pc','azul','Pendiente de inventario',NOW()),
(23,1,26,'PC23','pc','azul','Pendiente de inventario',NOW()),
(24,1,27,'PC24','pc','azul','Pendiente de inventario',NOW()),
(25,1,28,'PC25','pc','azul','Pendiente de inventario',NOW()),
(26,1,29,'PC26','pc','azul','Pendiente de inventario',NOW()),
(27,2,30,'PC01','pc','azul','Pendiente de inventario',NOW()),
(28,2,31,'PC02','pc','azul','Pendiente de inventario',NOW()),
(29,2,32,'PC03','pc','azul','Pendiente de inventario',NOW()),
(30,2,33,'PC04','pc','azul','Pendiente de inventario',NOW()),
(31,2,34,'PC05','pc','azul','Pendiente de inventario',NOW()),
(32,2,35,'PC06','pc','azul','Pendiente de inventario',NOW()),
(33,2,36,'PC07','pc','azul','Pendiente de inventario',NOW()),
(34,2,37,'PC08','pc','azul','Pendiente de inventario',NOW()),
(35,2,38,'PC09','pc','azul','Pendiente de inventario',NOW()),
(36,2,39,'PC10','pc','azul','Pendiente de inventario',NOW()),
(37,2,40,'PC11','pc','azul','Pendiente de inventario',NOW()),
(38,2,41,'PC12','pc','azul','Pendiente de inventario',NOW()),
(39,2,42,'PC13','pc','azul','Pendiente de inventario',NOW()),
(40,2,43,'PC14','pc','azul','Pendiente de inventario',NOW()),
(41,2,44,'PC15','pc','azul','Pendiente de inventario',NOW()),
(42,2,45,'PC16','pc','azul','Pendiente de inventario',NOW()),
(43,2,46,'PC17','pc','azul','Pendiente de inventario',NOW()),
(44,2,47,'PC18','pc','azul','Pendiente de inventario',NOW()),
(45,2,48,'PC19','pc','azul','Pendiente de inventario',NOW()),
(46,2,49,'PC20','pc','azul','Pendiente de inventario',NOW()),
(47,2,50,'PC21','pc','azul','Pendiente de inventario',NOW()),
(48,2,51,'PC22','pc','azul','Pendiente de inventario',NOW()),
(49,2,52,'PC23','pc','azul','Pendiente de inventario',NOW()),
(50,2,53,'PC24','pc','azul','Pendiente de inventario',NOW()),
(51,2,54,'PC25','pc','azul','Pendiente de inventario',NOW()),
(52,2,55,'PC26','pc','azul','Pendiente de inventario',NOW()),
(53,2,56,'PC27','pc','azul','Pendiente de inventario',NOW()),
(54,2,57,'PC28','pc','azul','Pendiente de inventario',NOW()),
(55,2,58,'PC29','pc','azul','Pendiente de inventario',NOW()),
(56,2,59,'PC30','pc','azul','Pendiente de inventario',NOW());

INSERT INTO `equipo_so` (`equipo_id`,`so_id`) VALUES
(1,10),
(2,10),
(3,10),
(4,10);

-- Perfiles de ejemplo (se pueden editar o borrar en Catálogos)

INSERT INTO `perfiles_software` (`id`,`nombre`) VALUES (1,'Imagen Desarrollo'),(2,'Imagen Telecomunicaciones');

INSERT INTO `perfil_software` (`perfil_id`,`software_id`) VALUES
(1,1),
(1,2),
(1,7),
(1,8),
(1,10),
(1,11),
(1,12),
(1,18),
(2,13),
(2,14),
(2,15),
(2,18),
(2,17);

-- Perfil base de cada laboratorio (para detectar programas faltantes)

INSERT INTO `ajustes` (`clave`,`valor`) VALUES ('perfil_lab_1','1'),('perfil_lab_2','2');


SET FOREIGN_KEY_CHECKS = 1;
