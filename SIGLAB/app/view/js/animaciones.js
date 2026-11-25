// view/js/animaciones.js — Microanimaciones: contadores, onda de color, progreso y confeti.
// Todas respetan la opción "reducir movimiento" del sistema.

export const reducirMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const facilidad = (t) => 1 - (1 - t) ** 3; // ease-out cúbico

/** Anima un número de `desde` a `hasta` dentro del elemento. */
export function contar(el, desde, hasta, ms = 650) {
  if (!el) return;
  if (reducirMovimiento() || desde === hasta) { el.textContent = String(hasta); return; }
  const inicio = performance.now();
  const id = (el._animId = (el._animId || 0) + 1);
  const paso = (ahora) => {
    if (el._animId !== id) return; // otra animación tomó el control
    const t = Math.min(1, (ahora - inicio) / ms);
    el.textContent = String(Math.round(desde + (hasta - desde) * facilidad(t)));
    if (t < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
  // Pequeño salto visual cuando el valor cambia
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
}

/** Onda del nuevo color que se expande desde el centro de la tarjeta. */
export function ondaColor(tarjeta, estado, retraso = 0) {
  if (!tarjeta) return;
  if (reducirMovimiento()) { tarjeta.classList.add('guardado'); return; }
  const onda = document.createElement('span');
  onda.className = `onda-estado st-${estado}`;
  tarjeta.append(onda);
  const r = tarjeta.getBoundingClientRect();
  const d = Math.hypot(r.width, r.height) * 1.1;
  onda.style.width = onda.style.height = `${d}px`;
  onda.animate(
    [{ transform: 'translate(-50%, -50%) scale(0)', opacity: 0.55 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 }],
    { duration: 750, delay: retraso, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' },
  ).finished.finally(() => onda.remove());
  tarjeta.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.045)' }, { transform: 'scale(1)' }],
    { duration: 420, delay: retraso, easing: 'cubic-bezier(.34,1.56,.64,1)' });
}

/** Destello sencillo (sin cambio de estado), con retraso para efecto de ola. */
export function pulso(tarjeta, retraso = 0) {
  if (!tarjeta) return;
  if (reducirMovimiento()) return;
  tarjeta.animate(
    [{ boxShadow: '0 0 0 0 color-mix(in srgb, var(--st) 55%, transparent)' }, { boxShadow: '0 0 0 14px color-mix(in srgb, var(--st) 0%, transparent)' }],
    { duration: 700, delay: retraso, easing: 'ease-out' },
  );
}

/** Confeti con los colores de estado, para celebrar el 100 % del inventario. */
export function confeti(origen) {
  if (reducirMovimiento()) return;
  const colores = ['#16a34a', '#22c55e', '#f59e0b', '#3b82f6', '#0ea5b7', '#e11d48', '#1b396a'];
  const r = origen?.getBoundingClientRect() || { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 };
  const x0 = r.left + r.width / 2;
  const y0 = r.top + r.height / 2;
  const capa = document.createElement('div');
  capa.className = 'capa-confeti';
  document.body.append(capa);
  const anims = [];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement('i');
    p.style.background = colores[i % colores.length];
    p.style.left = `${x0}px`;
    p.style.top = `${y0}px`;
    if (i % 3 === 0) p.style.borderRadius = '50%';
    capa.append(p);
    const ang = Math.random() * Math.PI * 2;
    const vel = 140 + Math.random() * 260;
    const dx = Math.cos(ang) * vel;
    const dy = Math.sin(ang) * vel - 160;
    const giro = (Math.random() - 0.5) * 900;
    anims.push(p.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${giro / 2}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx * 1.3}px, ${dy + 420}px) rotate(${giro}deg)`, opacity: 0 },
    ], { duration: 1600 + Math.random() * 900, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).finished);
  }
  Promise.allSettled(anims).then(() => capa.remove());
}

/** Reacción del ícono de un periférico al cambiar su estado en la ficha. */
export function animarPeriferico(caja, estado) {
  const ico = caja?.querySelector('.perif-ico');
  if (!ico || reducirMovimiento()) return;
  if (estado === 'faltante') {
    ico.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px) rotate(-8deg)' }, { transform: 'translateX(4px) rotate(8deg)' },
      { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], { duration: 380, easing: 'ease-out' });
  } else if (estado === 'danado') {
    ico.animate([{ transform: 'scale(1)' }, { transform: 'scale(.82) rotate(-6deg)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  } else if (estado === 'presente') {
    ico.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }
}
