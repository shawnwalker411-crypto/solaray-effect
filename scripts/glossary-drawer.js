/**
 * SOLA RAY EFFECT — Glossary Drawer Logic
 * =========================================
 * Shared drawer open/close/render logic for all pages.
 * Requires: glossary-data.js loaded BEFORE this file.
 *
 * EXPECTED HTML (same on every page):
 *
 *   <div class="glossary-drawer" id="glossary-drawer" aria-hidden="true">
 *     <button class="glossary-drawer-close" id="glossary-close" aria-label="Close glossary">&times;</button>
 *     <h3 id="glossary-term-title">Term</h3>
 *     <p id="glossary-term-definition">Definition goes here...</p>
 *     <div id="glossary-term-links" class="glossary-term-links"></div>
 *     <div class="glossary-term-actions">
 *       <a class="glossary-more-link" href="glossary.html">Open full glossary &rarr;</a>
 *     </div>
 *   </div>
 *   <div class="glossary-overlay" id="glossary-overlay" aria-hidden="true"></div>
 *
 * CSS CLASS REQUIRED:
 *   .glossary-drawer.open   { right: 0; }
 *   .glossary-overlay.show  { display: block; }
 */

(function () {
  "use strict";

  // Bail if glossary data wasn't loaded
  if (typeof SOLA_GLOSSARY === "undefined") {
    console.warn("[Glossary] SOLA_GLOSSARY not found. Load glossary-data.js first.");
    return;
  }

  // Cache DOM elements
  var drawer    = document.getElementById("glossary-drawer");
  var overlay   = document.getElementById("glossary-overlay");
  var closeBtn  = document.getElementById("glossary-close");
  var titleEl   = document.getElementById("glossary-term-title");
  var defEl     = document.getElementById("glossary-term-definition");
  var linksEl   = document.getElementById("glossary-term-links");

  if (!drawer || !overlay || !titleEl || !defEl) {
    // Page doesn't have a glossary drawer — silently exit
    return;
  }

  /* ------------------------------------------------
     OPEN DRAWER
     ------------------------------------------------ */
  function openDrawer(termKey, fallbackText) {
    var t = SOLA_GLOSSARY[termKey];

    // Set title and definition
    titleEl.textContent = (t && t.title) ? t.title : (fallbackText || "Term");
    defEl.textContent   = (t && t.definition) ? t.definition : "Definition coming soon.";

    // Build buy / official links (only if container exists)
    if (linksEl) {
      linksEl.innerHTML = "";

      if (t && (t.ebay || t.amazon || t.official)) {
        var frag = document.createDocumentFragment();

        if (t.ebay) {
          frag.appendChild(makePill("eBay \u2192", t.ebay, "ebay"));
        }
        if (t.amazon) {
          frag.appendChild(makePill("Amazon \u2192", t.amazon, "amazon"));
        }
        if (t.official) {
          frag.appendChild(makePill("Official Site \u2192", t.official, "official"));
        }

        linksEl.appendChild(frag);
      }
    }

    // Show drawer
    drawer.classList.add("open");
    overlay.classList.add("show");
    drawer.setAttribute("aria-hidden", "false");
    overlay.setAttribute("aria-hidden", "false");
  }

  /* ------------------------------------------------
     CLOSE DRAWER
     ------------------------------------------------ */
  function closeDrawer() {
    drawer.classList.remove("open");
    overlay.classList.remove("show");
    drawer.setAttribute("aria-hidden", "true");
    overlay.setAttribute("aria-hidden", "true");
  }

  /* ------------------------------------------------
     PILL BUTTON BUILDER
     ------------------------------------------------ */
  function makePill(label, href, type) {
    var a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = label;
    a.className = "glossary-pill";
    if (type === "amazon") {
      a.className += " glossary-pill-amazon";
    } else if (type === "official") {
      a.className += " glossary-pill-official";
    }
    return a;
  }

  /* ------------------------------------------------
     EVENT LISTENERS
     ------------------------------------------------ */

  // Click any glossary term anywhere on the page
  document.addEventListener("click", function (e) {
    var el = e.target.closest(".glossary-term");
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    openDrawer(el.getAttribute("data-term"), el.textContent.trim());
  });

  // Close button
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);

  // Overlay click
  if (overlay) overlay.addEventListener("click", closeDrawer);

  // Escape key
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("show")) {
      closeDrawer();
    }
  });

})();
