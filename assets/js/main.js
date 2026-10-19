/* Sitio público: intro, animaciones al hacer scroll, idioma ES/EN y formulario de contacto */
(function () {
  'use strict';
  var doc = document.documentElement;
  var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }

  /* ---------- Traducciones (el español está en el HTML) ---------- */
  var EN = {
    'skip': 'Skip to content', 'nav.services': 'Services', 'nav.process': 'Process', 'nav.portal': 'Portal', 'nav.about': 'About', 'nav.faq': 'FAQ', 'nav.contact': 'Contact', 'nav.cta': 'Book now',
    'hero.eyebrow': 'In person and online · Spanish and English', 'hero.t1': 'Clear paperwork,', 'hero.t2': 'real results.',
    'hero.lead': 'Taxes, LLCs, notary, immigration documents and credit repair. We guide you every step of the way, with clear prices and real-time tracking from your phone.',
    'hero.cta1': 'Book your appointment', 'hero.cta2': 'See services', 'hero.s1': 'clients served', 'hero.s2': 'average rating', 'hero.s3': 'to reply to you',
    'hv.credit': 'Credit score', 'hv.credit.s': '6-month plan', 'hv.tax': 'Tax refund', 'hv.llc': 'Your LLC', 'hv.llc1': 'State filing', 'hv.llc2': 'EIN', 'hv.llc3': 'Operating Agreement',
    'hv.chat1': 'Hi, are my papers ready? 🙏', 'hv.chat2': 'Yes! You can sign them from your portal.',
    'svc.kicker': 'What we do', 'svc.t1': 'Everything you need,', 'svc.t2': 'in one place.', 'svc.lead': 'Essential services for your family and your business, with the close attention your paperwork deserves.',
    'svc.tax': 'Taxes', 'svc.tax.d': 'Personal and business returns seeking the best possible outcome within the law.', 'svc.tax.1': 'Personal and family', 'svc.tax.2': '1099, Uber and self-employed', 'svc.tax.3': 'New and renewed ITIN', 'svc.tax.cta': 'Start online',
    'svc.cre': 'Credit repair', 'svc.cre.d': 'We review your three reports, dispute inaccurate items and give you a plan to build better credit.', 'svc.cre.1': 'Equifax, Experian and TransUnion analysis', 'svc.cre.2': 'Disputes and follow-up by rounds', 'svc.cre.3': 'A chart of your progress', 'svc.cre.cta': 'Fill out the form',
    'svc.llc': 'LLC formation', 'svc.llc.d': 'Formalize your business with a solid structure from day one: filing, EIN and Operating Agreement.', 'svc.more': 'Request',
    'svc.imm': 'Immigration documents', 'svc.imm.s': 'Immigration', 'svc.imm.d': 'We prepare and organize your forms precisely so your application arrives complete.', 'svc.ask': 'Ask for information',
    'svc.not': 'Notary', 'svc.not.d': 'Powers of attorney, affidavits and travel consents for minors, same day.', 'svc.book': 'Book',
    'svc.note': 'We are not attorneys and do not give legal advice. We prepare documents with the information you provide.',
    'proc.kicker': 'How we work', 'proc.t1': 'A simple process,', 'proc.t2': 'from start to finish.', 'proc.lead': 'We break every case into clear steps so you always know where you stand.', 'proc.cta': 'Get started',
    'proc.1.t': 'You reach out', 'proc.1.d': 'Via WhatsApp, a call, the form or by booking online.', 'proc.2.t': 'We review your case', 'proc.2.d': 'We tell you which documents you need and the cost, in writing.',
    'proc.3.t': 'We prepare everything', 'proc.3.d': 'You sign your contract from your phone and upload documents to your portal.', 'proc.4.t': 'Delivery and follow-up', 'proc.4.d': 'Track progress in real time and get notified at every stage.',
    'pv.hi': 'Hi,', 'pv.case': 'Credit repair', 'pv.stage': 'Round 3', 'pv.docs': 'Documents', 'pv.d1': 'Photo ID', 'pv.d2': 'Proof of address', 'pv.d3': 'Social Security card', 'pv.up': 'Upload', 'pv.bal': 'Balance due', 'pv.pay': 'Pay by card', 'pv.sign': 'Contract signed ✓',
    'pt.kicker': 'Your case on your phone', 'pt.t1': 'Your whole case,', 'pt.t2': 'one tap away.', 'pt.lead': 'Every client gets a private portal. No more calls to ask how it is going: it is all there.',
    'pt.f1': 'Real-time progress', 'pt.f1d': 'The exact stage of every case, updated by our team.', 'pt.f2': 'Upload your documents', 'pt.f2d': 'Photo or PDF from your phone, stored privately.',
    'pt.f3': 'E-signature', 'pt.f3d': 'Read and sign your contracts with your finger, no printing.', 'pt.f4': 'Payments and receipts', 'pt.f4d': 'Pay by card and download your receipts as PDF.', 'pt.cta': 'Open my portal', 'pt.cta2': 'Book an appointment',
    'ab.kicker': 'Who we are', 'ab.t1': 'Human closeness,', 'ab.t2': 'flawless processes.', 'ab.p1': 'We are a bilingual team that walks families and entrepreneurs through the most important paperwork of their lives. We explain every step, every cost and every date, with no fine print.',
    'ab.v1': 'Trust', 'ab.v1d': 'Your information is handled with full confidentiality.', 'ab.v2': 'Clarity', 'ab.v2d': 'Written prices and visible progress at all times.', 'ab.v3': 'Closeness', 'ab.v3d': 'Personal attention, in your language, start to finish.',
    'ab.n1': 'years of experience', 'ab.n2': 'of clients recommend us', 'ab.n3': 'services in one place', 'ab.n4': 'languages: Spanish and English',
    'faq.kicker': 'Your questions answered', 'faq.t1': 'Frequently asked', 'faq.t2': 'questions.', 'faq.lead': 'If you do not find your answer, message us and we will gladly help.', 'faq.help': 'Message us on WhatsApp',
    'faq.q1': 'Do you provide legal advice?', 'faq.a1': 'No. We prepare documents with the information you provide, but we are not attorneys and do not give legal advice. If your case requires it, we will recommend a licensed attorney.',
    'faq.q2': 'What do I need to prepare my taxes?', 'faq.a2': 'A photo ID, your SSN or ITIN (and your dependents’), W-2 or 1099 forms, records of other income and last year’s return if you have it.',
    'faq.q3': 'Can you help me open an LLC?', 'faq.a3': 'Yes. We file the Certificate of Formation with the state, obtain your EIN and prepare the Operating Agreement.',
    'faq.q4': 'Do you offer remote service?', 'faq.a4': 'Yes. We serve clients across the U.S. via WhatsApp, phone and email, and in person by appointment at our office.',
    'faq.q5': 'How does credit repair work?', 'faq.a5': 'We review your reports, identify inaccurate information, send disputes to the bureaus in rounds and track your score so you can see progress. Results vary.',
    'ct.kicker': 'Let’s talk', 'ct.t1': 'Tell us what', 'ct.t2': 'you need.', 'ct.lead': 'We reply the same business day. Your message goes straight to our team.', 'ct.call': 'Call us', 'ct.mail': 'Email', 'ct.where': 'Office',
    'ct.name': 'Full name', 'ct.phone': 'Phone', 'ct.email': 'Email (optional)', 'ct.svc': 'Which service are you interested in?', 'ct.msg': 'Your message', 'ct.consent': 'I agree to be contacted by phone, WhatsApp or email about my request.', 'ct.send': 'Send message',
    'ft.about': 'Taxes, LLCs, notary, immigration documents and credit repair. Personal service in Spanish and English.', 'ft.svc': 'Services', 'ft.cli': 'Clients', 'ft.portal': 'My portal', 'ft.forms': 'Forms', 'ft.priv': 'Privacy', 'ft.team': 'Team', 'ft.panel': 'CRM panel', 'ft.disc': 'We are not a law firm and do not give legal advice.',
    'ty.kicker': 'Message received', 'ty.t1': 'Thank you,', 'ty.t2': 'we got it.', 'ty.lead': 'Our team will contact you very soon to continue with your request.', 'ty.back': 'Back to site', 'ty.wa': 'Message us on WhatsApp'
  };
  var ES = {};
  $$('[data-i18n]').forEach(function (n) { ES[n.dataset.i18n] = n.innerHTML; });
  var idioma = leer('crm-lang') === 'en' ? 'en' : 'es';
  function aplicarIdioma(l) {
    idioma = l; doc.lang = l; guardar('crm-lang', l);
    $$('[data-i18n]').forEach(function (n) { var k = n.dataset.i18n, t = l === 'en' ? EN[k] : ES[k]; if (t != null) n.innerHTML = t; });
    $$('#lang span').forEach(function (s, i) { s.classList.toggle('on', (i === 0) === (l === 'es')); });
    var fl = $('#form-lang'); if (fl) fl.value = l === 'en' ? 'English' : 'Español';
  }
  if (idioma === 'en') aplicarIdioma('en');
  var lang = $('#lang'); if (lang) lang.addEventListener('click', function () { aplicarIdioma(idioma === 'es' ? 'en' : 'es'); });

  /* Datos de la marca */
  var M = window.MARCA || {};
  if (M.whatsapp) $$('a[href^="https://wa.me/"]').forEach(function (a) { a.href = 'https://wa.me/' + M.whatsapp; });
  var anio = $('#anio'); if (anio) anio.textContent = new Date().getFullYear();

  /* ---------- Intro ---------- */
  var intro = $('.intro');
  function arrancar() { document.body.classList.add('listo'); empezarHero(); }
  if (intro && doc.classList.contains('intro-on')) {
    setTimeout(function () { intro.classList.add('leave'); setTimeout(function () { doc.classList.remove('intro-on'); arrancar(); }, 650); }, 1500);
  } else arrancar();

  /* ---------- Navegación ---------- */
  var nav = $('#nav'), ultimo = 0, barra = $('.progreso');
  function alScroll() {
    var y = window.scrollY;
    if (nav) {
      nav.classList.toggle('solid', y > 20);
      if (y > ultimo && y > 600 && !nav.classList.contains('open')) nav.classList.add('hide'); else if (y < ultimo) nav.classList.remove('hide');
    }
    ultimo = y;
    if (barra) barra.style.setProperty('--p', Math.min(1, y / Math.max(1, doc.scrollHeight - innerHeight)));
    lineaProceso();
  }
  window.addEventListener('scroll', alScroll, { passive: true });
  var burger = $('#burger');
  if (burger) burger.addEventListener('click', function () { var o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', String(o)); });
  $$('#nav-movil a').forEach(function (a) { a.addEventListener('click', function () { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }); });
  // Enlace activo según la sección visible
  var links = $$('.nav-links a');
  if ('IntersectionObserver' in window) {
    var secObs = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) links.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id); }); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main section[id]').forEach(function (s) { secObs.observe(s); });
  }

  /* ---------- Revelado al hacer scroll ---------- */
  var revelar = $$('.rv, .sec-t, .kicker, .portal-vis');
  if ('IntersectionObserver' in window && !quieto) {
    var obs = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        $$('[data-n]', e.target).forEach(contar);
        if (e.target.matches('[data-n]')) contar(e.target);
        obs.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revelar.forEach(function (n) { obs.observe(n); });
  } else revelar.forEach(function (n) { n.classList.add('in'); $$('[data-n]', n).forEach(contar); });

  /* Números que cuentan */
  function contar(n) {
    if (n.dataset.ok) return; n.dataset.ok = '1';
    var fin = Number(n.dataset.n), dec = Number(n.dataset.dec || 0), pre = n.dataset.pre || '', suf = n.dataset.suf || '';
    if (quieto) { n.textContent = pre + fin.toLocaleString('en-US', { minimumFractionDigits: dec }) + suf; return; }
    var t0 = performance.now(), dur = 1600;
    (function paso(t) {
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      n.textContent = pre + (fin * e).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
      if (p < 1) requestAnimationFrame(paso);
    })(t0);
  }

  /* ---------- Portada: titular, medidor y tarjetas ---------- */
  function empezarHero() {
    var h = $('.hero-t'); if (h) setTimeout(function () { h.classList.add('in'); }, 60);
    $$('.hero [data-n]').forEach(function (n) { setTimeout(function () { contar(n); }, 900); });
    var fg = $('.g-fg'), sc = $('#score');
    if (fg && sc) setTimeout(function () {
      fg.style.strokeDashoffset = String(268 * (1 - 718 / 850));
      if (quieto) { sc.textContent = '718'; return; }
      var t0 = performance.now();
      (function paso(t) { var p = Math.min(1, (t - t0) / 2200), e = 1 - Math.pow(1 - p, 3); sc.textContent = Math.round(612 + (718 - 612) * e); if (p < 1) requestAnimationFrame(paso); })(t0);
    }, 1100);
    setTimeout(function () { $$('.hv-tax, .hv-llc, .hv-chat').forEach(function (c) { c.classList.add('vivo'); }); }, 2300);
  }

  /* Inclinación 3D con el cursor */
  if (fino && !quieto) {
    $$('.tilt').forEach(function (c) {
      var caja = c.closest('.hero-vis, .portal-vis') || c;
      caja.addEventListener('pointermove', function (e) {
        var r = caja.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        c.style.transform = 'rotateY(' + (x * 10) + 'deg) rotateX(' + (-y * 10) + 'deg)';
        c.style.transition = 'transform 0.15s';
      });
      caja.addEventListener('pointerleave', function () { c.style.transition = 'transform 0.9s cubic-bezier(.22,1,.36,1)'; c.style.transform = ''; });
    });
    // Botones magnéticos
    $$('.magnet').forEach(function (b) {
      b.addEventListener('pointermove', function (e) { var r = b.getBoundingClientRect(); b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * 0.18) + 'px,' + ((e.clientY - r.top - r.height / 2) * 0.28) + 'px)'; });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    });
    // Brillo que sigue al cursor
    document.addEventListener('pointermove', function (e) {
      var c = e.target.closest && e.target.closest('.svc-card'); if (!c) return;
      var r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }
  // Onda al hacer clic
  document.addEventListener('pointerdown', function (e) {
    if (quieto) return;
    var b = e.target.closest && e.target.closest('.btn'); if (!b) return;
    var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height), o = document.createElement('span');
    o.className = 'onda'; o.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + (e.clientX - r.left - s / 2) + 'px;top:' + (e.clientY - r.top - s / 2) + 'px';
    b.appendChild(o); setTimeout(function () { o.remove(); }, 700);
  });

  /* Línea del proceso que avanza con el scroll */
  var pasos = $('#proc-steps'), linea = pasos && $('.proc-line i', pasos);
  function lineaProceso() {
    if (!pasos) return;
    var r = pasos.getBoundingClientRect(), p = Math.min(1, Math.max(0, (innerHeight * 0.6 - r.top) / r.height));
    linea.style.setProperty('--pl', p);
    $$('li', pasos).forEach(function (li) { var q = li.getBoundingClientRect(); li.classList.toggle('activo', q.top < innerHeight * 0.62 && q.bottom > innerHeight * 0.25); });
  }
  alScroll();

  /* ---------- Formulario de contacto ---------- */
  var form = $('#contact-form');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (form.querySelector('[name="_honey"]').value) return;
    var estado = $('.f-status', form), ok = true;
    function marca(id, bad) { var n = $(id); var c = n.closest('.fl') || n.closest('.consent'); if (c) c.classList.toggle('bad', bad); if (bad) ok = false; }
    marca('#f-name', $('#f-name').value.trim().length < 2);
    marca('#f-phone', $('#f-phone').value.replace(/\D/g, '').length < 7);
    var em = $('#f-email').value.trim(); marca('#f-email', !!em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em));
    marca('#f-ok', !$('#f-ok').checked);
    if (!ok) { estado.textContent = idioma === 'en' ? 'Please check the highlighted fields.' : 'Revisa los campos marcados.'; return; }
    var btn = $('#f-send'); btn.classList.add('loading'); btn.disabled = true;
    estado.textContent = idioma === 'en' ? 'Sending…' : 'Enviando…';
    var serv = form.querySelector('.chip-input:checked');
    var datos = { nombre: $('#f-name').value.trim().slice(0, 120), telefono: $('#f-phone').value.trim().slice(0, 40), email: em || null, servicio: serv ? serv.value : null, mensaje: $('#f-msg').value.trim().slice(0, 3000) || null, idioma: $('#form-lang').value, origen: 'sitio_web' };
    (window.SITIO && SITIO.enviarContacto ? SITIO.enviarContacto(datos) : Promise.resolve()).then(function () {
      location.href = 'gracias.html';
    }).catch(function () {
      btn.classList.remove('loading'); btn.disabled = false;
      estado.textContent = idioma === 'en' ? 'We could not send your message. Please try again.' : 'No pudimos enviar tu mensaje. Inténtalo de nuevo.';
    });
  });
  $$('.fl input, .fl textarea').forEach(function (i) { i.addEventListener('input', function () { var c = i.closest('.fl'); if (c) c.classList.remove('bad'); }); });
})();
