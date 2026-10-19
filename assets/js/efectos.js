/* Efectos de interfaz: números que cuentan, brillo que sigue al cursor y ondas al hacer clic */
(function () {
  'use strict';
  var quieto = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Brillo que sigue al cursor en tarjetas y fondo de acceso */
  document.addEventListener('pointermove', function (e) {
    var c = e.target.closest && e.target.closest('.card, .stat, .cb-kpi, .g-card, .fm-card, .svc-card, .feat');
    if (c) { var r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); }
    var a = e.target.closest && e.target.closest('.auth');
    if (a) { a.style.setProperty('--ax', e.clientX + 'px'); a.style.setProperty('--ay', e.clientY + 'px'); }
  }, { passive: true });

  /* Onda al hacer clic en botones */
  document.addEventListener('pointerdown', function (e) {
    if (quieto) return;
    var b = e.target.closest && e.target.closest('.btn, .mini-btn');
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height);
    var o = document.createElement('span');
    o.className = 'onda';
    o.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + (e.clientX - r.left - s / 2) + 'px;top:' + (e.clientY - r.top - s / 2) + 'px';
    b.appendChild(o);
    setTimeout(function () { o.remove(); }, 700);
  });

  /* Los números de los indicadores cuentan desde cero al aparecer */
  function contar(n) {
    if (quieto || n.dataset.contado) return;
    var t = (n.textContent || '').trim();
    var m = /^([+\-]?)(\$?)([\d,]+(?:\.\d+)?)(.*)$/.exec(t);
    if (!m) return;
    var fin = Number(m[3].replace(/,/g, ''));
    if (!isFinite(fin) || fin === 0) return;
    n.dataset.contado = '1';
    var dec = (m[3].split('.')[1] || '').length, ini = performance.now(), dur = 900 + Math.min(600, fin / 50);
    var fmt = function (v) {
      var s = v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      return m[1] + m[2] + s + m[4];
    };
    (function paso(ahora) {
      var p = Math.min(1, (ahora - ini) / dur), e = 1 - Math.pow(1 - p, 4);
      n.textContent = fmt(fin * e);
      if (p < 1) requestAnimationFrame(paso); else n.textContent = t;
    })(ini);
  }
  var SEL = '.stat .k, .cb-kpi .k, .vbar-v, .tile b, .fn-row b, .hbar > b, .saldo-big, .cuenta-up';
  function revisar(raiz) {
    if (!raiz.querySelectorAll) return;
    if (raiz.matches && raiz.matches(SEL)) contar(raiz);
    raiz.querySelectorAll(SEL).forEach(contar);
  }
  new MutationObserver(function (ms) {
    ms.forEach(function (m) {
      m.addedNodes.forEach(function (x) { if (x.nodeType === 1) revisar(x); });
      if (m.type === 'characterData' || (m.type === 'childList' && m.target.matches && m.target.matches(SEL) && !m.target.dataset.contado)) contar(m.target);
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.EFECTOS = { contar: contar };
})();
