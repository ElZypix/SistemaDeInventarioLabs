// view/js/login.js — Pantalla de inicio de sesión.

import { api } from './api.js';
import { icono, pintarIconos } from './iconos.js';
import { aplicarTema, pintarBotonTema, temaActual } from './ui.js';

pintarIconos();

const form = document.getElementById('form-login');
const msg = document.getElementById('login-msg');
const btn = document.getElementById('btn-entrar');
const pass = document.getElementById('password');
const verPass = document.getElementById('ver-pass');
const btnTema = document.getElementById('btn-tema');

if (new URLSearchParams(location.search).has('expirada')) {
  msg.innerHTML = `${icono('info', 'sm')} Tu sesión terminó. Vuelve a iniciar sesión.`;
  msg.style.color = 'var(--texto-2)';
}

pintarBotonTema(btnTema);
btnTema.addEventListener('click', () => {
  aplicarTema(temaActual() === 'dark' ? 'light' : 'dark', btnTema);
  setTimeout(() => pintarBotonTema(btnTema), 50);
});

verPass.innerHTML = icono('ojo');
verPass.addEventListener('click', () => {
  const ver = pass.type === 'password';
  pass.type = ver ? 'text' : 'password';
  verPass.innerHTML = icono(ver ? 'ojoNo' : 'ojo');
  verPass.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
});

let cuenta = null;
function bloquear(seg) {
  clearInterval(cuenta);
  btn.disabled = true;
  const pintar = () => {
    msg.innerHTML = `${icono('candado', 'sm')} Demasiados intentos. Espera ${seg} s.`;
    btn.textContent = `Espera ${seg} s`;
  };
  pintar();
  cuenta = setInterval(() => {
    seg -= 1;
    if (seg <= 0) {
      clearInterval(cuenta);
      btn.disabled = false;
      btn.textContent = 'Entrar';
      msg.textContent = '';
      return;
    }
    pintar();
  }, 1000);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = form.usuario.value.trim();
  if (!usuario || !pass.value) {
    msg.innerHTML = `${icono('alerta', 'sm')} Escribe tu usuario y contraseña.`;
    form.classList.remove('agitar'); void form.offsetWidth; form.classList.add('agitar');
    return;
  }
  msg.textContent = '';
  msg.style.color = '';
  btn.disabled = true;
  btn.innerHTML = '<span class="cargando"></span>';
  try {
    await api('ctrl/php/authApi.php?accion=login', { body: { usuario, password: pass.value }, sinRedireccion: true });
    btn.innerHTML = icono('check');
    document.body.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.985)' }], { duration: 260, fill: 'forwards', easing: 'ease-in' });
    setTimeout(() => { location.href = 'app.php'; }, 240);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Entrar';
    pass.value = '';
    form.classList.remove('agitar'); void form.offsetWidth; form.classList.add('agitar');
    if (err.datos?.bloqueo > 0) bloquear(err.datos.bloqueo);
    else msg.innerHTML = `${icono('alerta', 'sm')} ${err.message}`;
    pass.focus();
  }
});

/* Mini laboratorio animado: los puntos cambian de color como si se revisaran los equipos. */
const mini = document.getElementById('mini-lab');
if (mini) {
  const colores = ['#22c55e', '#22c55e', '#22c55e', '#22c55e', '#fbbf24', '#fb7185', '#60a5fa'];
  const filas = ['PPPPPPPP', 'PPPPPPPP', 'PPPPPPPP', 'PPPPPP__'];
  let n = 0;
  filas.forEach((f) => [...f].forEach((c) => {
    const i = document.createElement('i');
    if (c === '_') i.className = 'vacio';
    else i.style.setProperty('--c', colores[Math.floor(Math.random() * colores.length)]);
    i.style.animationDelay = `${n++ * 18}ms`;
    mini.append(i);
  }));
  const pcs = [...mini.querySelectorAll('i:not(.vacio)')];
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setInterval(() => {
      const p = pcs[Math.floor(Math.random() * pcs.length)];
      p.style.setProperty('--c', colores[Math.floor(Math.random() * colores.length)]);
    }, 900);
  }
}
