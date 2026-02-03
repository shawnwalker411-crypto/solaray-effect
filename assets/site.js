function toggleNav() {
  const btn = document.getElementById('hamburger-btn');
  const drawer = document.getElementById('nav-drawer');
  const overlay = document.getElementById('nav-overlay');

  // Guardrails: if something is missing, do nothing (prevents JS from dying)
  if (!btn || !drawer || !overlay) return;

  btn.classList.toggle('open');
  drawer.classList.toggle('open');
  overlay.classList.toggle('show');
}

// ============================================
// STABLE INTERACTION BINDINGS
// (works on desktop/tablet/mobile; no guessing)
// ============================================
document.addEventListener('DOMContentLoaded', function () {
  function bindActivate(el, handler) {
    if (!el) return;

    // Click always works for mouse/trackpad
    el.addEventListener('click', function (e) {
      // Don’t block normal behavior except for our toggle targets
      e.preventDefault();
      handler();
    });

    // Pointer events help on touch devices
    el.addEventListener('pointerup', function (e) {
      e.preventDefault();
      handler();
    });
  }

  // Nav drawer
  var hamburgerBtn = document.getElementById('hamburger-btn');
  var navOverlay = document.getElementById('nav-overlay');

  bindActivate(hamburgerBtn, function () {
    if (typeof toggleNav === 'function') toggleNav();
  });

  bindActivate(navOverlay, function () {
    if (typeof toggleNav === 'function') toggleNav();
  });

  // Glossary drawer
  var glossaryOverlay = document.getElementById('glossary-overlay');
  var glossaryClose = document.querySelector('.glossary-drawer-close');

  bindActivate(glossaryOverlay, function () {
    if (typeof closeGlossary === 'function') closeGlossary();
  });

  bindActivate(glossaryClose, function () {
    if (typeof closeGlossary === 'function') closeGlossary();
  });

  // Any element with a glossary term id
  document.querySelectorAll('[data-glossary-term]').forEach(function (el) {
    bindActivate(el, function () {
      var termId = el.getAttribute('data-glossary-term');
      if (termId && typeof openGlossary === 'function') openGlossary(termId);
    });
  });
});
