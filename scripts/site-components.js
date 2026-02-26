/*
 * site-components.js
 * Loads shared nav and footer into any page.
 *
 * Usage: Add to any page BEFORE </body>:
 *   <div id="site-nav"></div>         (where hamburger + drawer should appear)
 *   <div id="site-footer"></div>      (where footer should appear)
 *   <script src="/scripts/site-components.js"></script>
 *
 * The nav auto-highlights the current page.
 * Edit /components/nav.html or /components/footer.html once
 * and every page updates automatically.
 */
(function(){
  function load(id, url){
    var el = document.getElementById(id);
    if(!el) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = function(){
      if(xhr.status === 200){
        el.innerHTML = xhr.responseText;
        /* Execute any inline <script> tags in the loaded HTML */
        var scripts = el.querySelectorAll('script');
        for(var i=0; i<scripts.length; i++){
          var s = document.createElement('script');
          s.textContent = scripts[i].textContent;
          document.body.appendChild(s);
          scripts[i].remove();
        }
      }
    };
    xhr.send();
  }
  load('site-nav', '/components/nav.html');
  load('site-footer', '/components/footer.html');
})();
