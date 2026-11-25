// view/js/api.js — Cliente HTTP: JSON, token CSRF y manejo uniforme de errores.

let csrf = document.querySelector('meta[name="csrf"]')?.content || '';

export function setCsrf(token) { if (token) csrf = token; }
export function getCsrf() { return csrf; }

export class ApiError extends Error {
  constructor(mensaje, status, datos) { super(mensaje); this.status = status; this.datos = datos; }
}

/**
 * @param {string} url      Ruta relativa a la raíz, ej. 'ctrl/php/inventarioApi.php?accion=datos'
 * @param {object} [opc]    { body: objeto JSON | FormData }
 */
export async function api(url, opc = {}) {
  const init = { method: opc.body ? 'POST' : 'GET', headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' }, credentials: 'same-origin' };
  if (opc.body instanceof FormData) {
    init.body = opc.body;
  } else if (opc.body) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opc.body);
  }

  let resp;
  try {
    resp = await fetch(url, init);
  } catch {
    throw new ApiError('No hay conexión con el servidor.', 0);
  }

  let datos = null;
  try { datos = await resp.json(); } catch { /* respuesta no JSON */ }

  if (resp.status === 401 && !opc.sinRedireccion) {
    window.location.href = 'index.php?expirada=1';
    throw new ApiError(datos?.mensaje || 'Sesión terminada.', 401, datos);
  }
  if (!resp.ok || !datos || datos.ok === false) {
    throw new ApiError(datos?.mensaje || `Error del servidor (${resp.status}).`, resp.status, datos);
  }
  if (datos.csrf) setCsrf(datos.csrf);
  return datos;
}
