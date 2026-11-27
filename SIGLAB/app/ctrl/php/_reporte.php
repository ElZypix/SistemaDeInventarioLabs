<?php
// ctrl/php/_reporte.php — Piezas comunes de los reportes imprimibles (inventario y software).
//
// Cada sección se arma como una tabla "página": su <thead> lleva el encabezado institucional y su
// <tfoot> el pie, así el navegador los repite en TODAS las hojas al imprimir o guardar como PDF.

declare(strict_types=1);

const MESES_REP = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function h($v): string { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }

function fecha_larga(): string
{
    return (int)date('j') . ' de ' . MESES_REP[(int)date('n') - 1] . ' de ' . date('Y');
}

/** Firmas pedidas en la URL: modo = ambas | elaboro | vobo | ninguna, con nombre y cargo de cada una. */
function firmas_de_get(array $yo): array
{
    $t = static fn(string $k, string $def = ''): string => mb_substr(trim((string)($_GET[$k] ?? $def)), 0, 90);
    $modo = in_array($_GET['firmas'] ?? '', ['ambas', 'elaboro', 'vobo', 'ninguna'], true) ? $_GET['firmas'] : 'ambas';
    $out = [];
    if ($modo === 'ambas' || $modo === 'elaboro') {
        $out[] = ['rol' => 'Elaboró', 'nombre' => $t('fe_nombre', (string)$yo['nombre']), 'cargo' => $t('fe_cargo')];
    }
    if ($modo === 'ambas' || $modo === 'vobo') {
        $out[] = ['rol' => 'Vo. Bo.', 'nombre' => $t('fv_nombre'), 'cargo' => $t('fv_cargo', 'Encargado del laboratorio')];
    }
    return $out;
}

function html_firmas(array $firmas): string
{
    if (!$firmas) return '';
    $o = '<div class="firmas' . (count($firmas) === 1 ? ' una' : '') . '">';
    foreach ($firmas as $f) {
        $o .= '<div><span class="f-linea"></span>' . h($f['rol'])
            . ($f['nombre'] !== '' ? '<b>' . h($f['nombre']) . '</b>' : '<b>&nbsp;</b>')
            . ($f['cargo'] !== '' ? '<small>' . h($f['cargo']) . '</small>' : '') . '</div>';
    }
    return $o . '</div>';
}

/** Abre una sección: encabezado y pie que se repiten en cada hoja. Se cierra con fin_seccion(). */
function inicio_seccion(string $titulo, string $subtitulo, string $fecha, string $pie): void
{
    $img = '../../view/img/'; ?>
<table class="pagina">
  <thead><tr><td>
    <div class="encabezado">
      <div class="logos">
        <img class="logo-sep" src="<?= $img ?>sep.png" alt="SEP">
        <div class="der">
          <img class="logo-tec" src="<?= $img ?>tecnm.png" alt="TecNM">
          <img class="logo-itc" src="<?= $img ?>comitan.png" alt="Instituto Tecnológico de Comitán">
        </div>
      </div>
      <div class="titulo"><h1><?= h($titulo) ?></h1><h2><?= h($subtitulo) ?></h2></div>
      <div class="meta">
        <span><?= h(INSTITUCION) ?> · Comitán de Domínguez, Chiapas</span>
        <span>Fecha de corte: <?= h($fecha) ?></span>
      </div>
    </div>
  </td></tr></thead>
  <tfoot><tr><td><div class="pie"><?= h($pie) ?><i></i></div></td></tr></tfoot>
  <tbody><tr><td class="contenido">
<?php
}

function fin_seccion(): void
{
    echo "  </td></tr></tbody>\n</table>\n";
}

/** Estilos comunes. Carta horizontal con márgenes reales para que ninguna hoja salga vacía. */
function css_reporte(): string
{
    return <<<'CSS'
  * { box-sizing: border-box; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #e5e7eb; color: #111827; font-family: Arial, Helvetica, sans-serif; }
  .barra { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center;
           gap: 12px; padding: 12px 20px; background: #0f172a; color: #fff; box-shadow: 0 6px 20px rgba(15,23,42,.25); }
  .barra span { color: #cbd5e1; font-size: 12px; }
  .barra button { border: 0; border-radius: 8px; padding: 9px 16px; font-weight: 700; cursor: pointer; background: #fff; color: #0f172a; }

  /* Hoja en pantalla (vista previa) */
  .pagina { width: 259mm; margin: 18px auto; border-collapse: collapse; background: #fff;
            box-shadow: 0 0 0 10mm #fff, 0 8px 30px 10mm rgba(15,23,42,.18); }
  .pagina > thead > tr > td, .pagina > tfoot > tr > td, .pagina > tbody > tr > td { padding: 0; border: 0; text-align: left; vertical-align: top; }
  .pagina + .pagina { break-before: page; margin-top: 30mm; }
  .contenido { padding-bottom: 2mm !important; }

  .encabezado { padding-bottom: 3mm; }
  .logos { display: flex; justify-content: space-between; align-items: center; height: 16mm; margin-bottom: 2mm; }
  .logos .der { display: flex; align-items: center; gap: 5mm; }
  .logo-sep { height: 10mm; } .logo-tec { height: 12mm; } .logo-itc { height: 15mm; }
  .titulo { border: 1.3px solid #111827; text-align: center; padding: 4px 8px; }
  .titulo h1 { margin: 0; font-size: 12.5px; letter-spacing: .3px; text-transform: uppercase; }
  .titulo h2 { margin: 2px 0 0; font-size: 11.5px; font-weight: 700; text-transform: uppercase; color: #1B396A; }
  .meta { display: flex; justify-content: space-between; font-size: 9px; color: #475569; margin-top: 4px; }
  .pie { text-align: center; font-size: 8px; color: #6b7280; padding-top: 3mm; }
  .pie i { display: block; width: 60%; height: 2px; background: #9f1239; margin: 3px auto 0; }

  .firmas { display: flex; justify-content: space-around; margin-top: 18mm; font-size: 9.5px; text-align: center; break-inside: avoid; }
  .firmas.una { justify-content: center; }
  .firmas div { width: 75mm; display: flex; flex-direction: column; align-items: center; gap: 1px; }
  .firmas .f-linea { width: 100%; border-top: 1px solid #111827; margin-bottom: 4px; }
  .firmas b { font-size: 10px; text-transform: uppercase; }
  .firmas small { color: #475569; font-size: 9px; }

  /* Margen de la hoja en 0: así Chrome no imprime su propio encabezado (título y URL) ni su pie.
     Los márgenes reales los dan el encabezado y el pie que se repiten en cada hoja. */
  @page { size: Letter landscape; margin: 0; }
  @media print {
    body { background: #fff; padding: 0 10mm; }
    .barra { display: none; }
    .pagina { width: 100%; margin: 0; box-shadow: none; }
    .pagina + .pagina { margin-top: 0; }
    .pagina > thead > tr > td { padding-top: 9mm; }
    .pagina > tfoot > tr > td { padding-bottom: 6mm; }
  }
CSS;
}
