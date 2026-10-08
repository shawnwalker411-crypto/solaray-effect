/* SolaRayEffect.com Google Analytics (GA4) - one copy for every page.
   Loads only on the live site. gtag() is global so page events
   (calculate_profitability, catalog_to_calculator, pool/firmware link clicks)
   actually reach Analytics. Off the live site gtag() is a harmless no-op. */
(function () {
  var host = window.location.hostname;
  var isProd = (host === 'solarayeffect.com' || host === 'www.solarayeffect.com');
  if (!isProd) { window.gtag = window.gtag || function () {}; return; }
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', 'G-M6F5T8Y2P6');
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=G-M6F5T8Y2P6';
  document.head.appendChild(s);
})();
