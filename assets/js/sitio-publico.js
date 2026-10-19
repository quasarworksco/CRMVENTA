/* Contenido del sitio administrado desde el panel (precios, anuncio, testimonios y preguntas)
   y envío de los mensajes de contacto al CRM (Solicitudes → Mensajes de contacto). */
(function () {
  'use strict';
  var URL_API = CRM.api + '/rest/v1/';
  var H = { apikey: 'demo', Authorization: 'Bearer demo' };

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function en() { return (document.documentElement.lang || 'es').slice(0, 2) === 'en'; }

  fetch(URL_API + 'sitio_items?select=tipo,clave,titulo,texto,precio,autor,orden&order=orden', { headers: H })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(aplicar)
    .catch(function () {});

  function aplicar(items) {
    if (!Array.isArray(items)) return;
    var visibles = {};
    items.forEach(function (i) { if (i.tipo === 'servicio') visibles[i.clave] = i; });

    // Servicios: precio "desde" y servicios ocultos
    document.querySelectorAll('[data-svc-card]').forEach(function (card) {
      var s = visibles[card.getAttribute('data-svc-card')];
      if (!s) { card.hidden = true; return; }
      if (s.precio) {
        var badge = el('div', 'sc-price');
        badge.appendChild(el('span', null, en() ? 'From' : 'Desde'));
        badge.appendChild(el('b', null, s.precio));
        var t = card.querySelector('.sc-title');
        if (t) t.insertAdjacentElement('afterend', badge);
      }
    });

    // Anuncio
    var an = items.filter(function (i) { return i.tipo === 'anuncio' && i.texto; })[0];
    if (an) {
      var cerrado = false;
      try { cerrado = sessionStorage.getItem('crm-anuncio') === an.texto; } catch (e) { /* */ }
      if (!cerrado) {
        var bar = el('div', 'site-ann');
        bar.setAttribute('role', 'status');
        bar.appendChild(el('span', 'dot'));
        bar.appendChild(el('span', 'txt', an.texto));
        var cta = el('a', 'cta', en() ? 'Book now' : 'Agendar');
        cta.href = 'citas/';
        bar.appendChild(cta);
        var x = el('button', 'x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', en() ? 'Close' : 'Cerrar');
        x.addEventListener('click', function () { bar.remove(); try { sessionStorage.setItem('crm-anuncio', an.texto); } catch (e) { /* */ } });
        bar.appendChild(x);
        document.body.appendChild(bar);
        // Se retira solo al bajar por la página para no tapar el contenido
        var quitar = function () { if (window.scrollY > innerHeight * 1.2) { bar.classList.add('fuera'); window.removeEventListener('scroll', quitar); setTimeout(function () { bar.remove(); }, 700); } };
        window.addEventListener('scroll', quitar, { passive: true });
      }
    }

    // Testimonios
    var tes = items.filter(function (i) { return i.tipo === 'testimonio' && i.texto; });
    var faq = document.getElementById('faq');
    if (tes.length && faq) {
      var sec = el('section', 'testimonials');
      sec.id = 'testimonios';
      sec.setAttribute('aria-labelledby', 'tes-title');
      var c = el('div', 'container');
      var head = el('div', 'section-head center');
      head.appendChild(el('span', 'kicker', en() ? 'Testimonials' : 'Testimonios'));
      var h = el('h2', 'section-title', en() ? 'What our ' : 'Lo que dicen ');
      h.id = 'tes-title';
      h.appendChild(el('span', 'serif', en() ? 'clients say' : 'nuestros clientes'));
      head.appendChild(h);
      c.appendChild(head);
      var grid = el('div', 'tes-grid');
      tes.forEach(function (t, i) {
        var card = el('figure', 'tes-card');
        card.style.animationDelay = (i * 0.08) + 's';
        card.appendChild(el('blockquote', null, '“' + t.texto + '”'));
        var cap = el('figcaption');
        cap.appendChild(el('b', null, t.autor || (en() ? 'Client' : 'Cliente')));
        if (t.titulo) cap.appendChild(el('span', null, t.titulo));
        card.appendChild(cap);
        grid.appendChild(card);
      });
      c.appendChild(grid);
      sec.appendChild(c);
      faq.parentNode.insertBefore(sec, faq);
    }

    // Preguntas frecuentes adicionales
    var lista = document.querySelector('#faq .faq-list');
    items.filter(function (i) { return i.tipo === 'faq' && i.titulo && i.texto; }).forEach(function (f) {
      if (!lista) return;
      var d = el('details', 'faq-item');
      var s = el('summary');
      s.appendChild(el('span', null, f.titulo));
      var plus = el('span', 'plus'); plus.setAttribute('aria-hidden', 'true');
      s.appendChild(plus);
      d.appendChild(s);
      d.appendChild(el('div', 'faq-body', f.texto));
      lista.appendChild(d);
    });
  }

  // Formulario de contacto: el mensaje entra al CRM
  window.SITIO = {
    enviarContacto: function (datos) {
      return fetch(URL_API + 'mensajes_web', {
        method: 'POST',
        headers: { apikey: 'demo', Authorization: 'Bearer demo', 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(datos)
      }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); });
    }
  };
})();
