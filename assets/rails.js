/* SolaRayEffect.com shop rails.
   Shows the desktop side rails only when there is room beside the page
   content (at least 224px each side); otherwise the shop strip shows.
   Rails marked data-top="auto" are lined up with the top of the content. */
(function () {
  var MIN_ROOM = 224;
  var root = document.documentElement;

  function anchor() {
    return document.querySelector('main .container') || document.querySelector('#main-content .container') ||
      document.querySelector('.container') || document.querySelector('main');
  }

  function update() {
    var a = anchor();
    if (!a) return;
    var r = a.getBoundingClientRect();
    var room = r.width > 0 ? Math.min(r.left, root.clientWidth - r.right) : 0;
    var on = room >= MIN_ROOM;
    root.classList.toggle('rails-on', on);
    if (!on) return;
    // Start below the fixed menu button in the top-left corner (about 80px tall).
    var top = Math.max(80, r.top + window.scrollY);
    var rails = document.querySelectorAll('.affiliate-rail[data-top="auto"], .affiliate-rail-right[data-top="auto"]');
    for (var i = 0; i < rails.length; i++) rails[i].style.top = top + 'px';
  }

  window.addEventListener('resize', update);
  window.addEventListener('load', update);
  document.addEventListener('DOMContentLoaded', update);
  if (window.ResizeObserver) new ResizeObserver(update).observe(document.body);
  update();
})();
