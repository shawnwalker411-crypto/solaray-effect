/* ════════════════════════════════════════════════════════════════════
   EBAY OUTBOUND CLICK TRACKING — SolaRayEffect.com
   ebay-tracking.js

   Auto-tracks clicks on every eBay affiliate link on the page.
   Fires GA4 event 'ebay_click' with:
     - page_path:   which page the click came from (e.g. /miners.html)
     - rail_id:     value of customid= in the eBay URL (e.g. rail-s19)
     - destination: full eBay URL
     - link_text:   visible text of the link (truncated to 80 chars)

   Uses event delegation on document — works for links added dynamically
   after page load. Requires GA4 gtag() to already be initialized.
   ════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    document.addEventListener('click', handleClick, true);
  }

  function handleClick(e) {
    // Find the closest <a> tag (in case user clicked an inner element)
    var link = e.target.closest('a');
    if (!link || !link.href) return;

    // Only track ebay.com links
    if (!/(^|\.)ebay\.com$/i.test(getHostname(link.href))) return;

    // Extract customid as rail_id
    var railId = 'unknown';
    var match = link.href.match(/[?&]customid=([^&]+)/i);
    if (match) {
      railId = decodeURIComponent(match[1]);
    }

    // Get visible link text, fall back to alt or 'unknown'
    var linkText = (link.textContent || link.innerText || '').trim();
    if (!linkText) {
      var img = link.querySelector('img');
      if (img && img.alt) linkText = img.alt.trim();
    }
    if (!linkText) linkText = 'unknown';
    if (linkText.length > 80) linkText = linkText.substring(0, 80);

    // Fire GA4 event if gtag is available
    if (typeof gtag === 'function') {
      gtag('event', 'ebay_click', {
        page_path: window.location.pathname,
        rail_id: railId,
        destination: link.href,
        link_text: linkText
      });
    }
  }

  function getHostname(url) {
    try {
      return new URL(url).hostname;
    } catch (err) {
      return '';
    }
  }
})();
