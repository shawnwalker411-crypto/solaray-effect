    function toggleNav() {
      const btn = document.getElementById('hamburger-btn');
      const drawer = document.getElementById('nav-drawer');
      const overlay = document.getElementById('nav-overlay');
      
      btn.classList.toggle('open');
      drawer.classList.toggle('open');
      overlay.classList.toggle('show');
    }
  

    // ============================================
    // STABLE INTERACTION BINDINGS
    // (no inline onclick, no eval; works on desktop/tablet/mobile)
    // ============================================
    document.addEventListener('DOMContentLoaded', function () {
      // Nav drawer
      var hamburgerBtn = document.getElementById('hamburger-btn');
      var navOverlay = document.getElementById('nav-overlay');
      if (hamburgerBtn) {
        hamburgerBtn.addEventListener('pointerup', function (e) {
          e.preventDefault();
          if (typeof toggleNav === 'function') toggleNav();
        });
      }
      if (navOverlay) {
        navOverlay.addEventListener('pointerup', function (e) {
          e.preventDefault();
          if (typeof toggleNav === 'function') toggleNav();
        });
      }

      // Glossary drawer
      var glossaryOverlay = document.getElementById('glossary-overlay');
      var glossaryClose = document.querySelector('.glossary-drawer-close');
      if (glossaryOverlay) {
        glossaryOverlay.addEventListener('pointerup', function (e) {
          e.preventDefault();
          if (typeof closeGlossary === 'function') closeGlossary();
        });
      }
      if (glossaryClose) {
        glossaryClose.addEventListener('pointerup', function (e) {
          e.preventDefault();
          if (typeof closeGlossary === 'function') closeGlossary();
        });
      }

      // Any element with a glossary term id
      document.querySelectorAll('[data-glossary-term]').forEach(function (el) {
        el.addEventListener('pointerup', function (e) {
          e.preventDefault();
          var termId = el.getAttribute('data-glossary-term');
          if (termId && typeof openGlossary === 'function') openGlossary(termId);
        });
      });
    });
  
