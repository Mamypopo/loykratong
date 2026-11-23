/* button.html: live previews of lk-button.js and copy-ready snippets (kept out of the page so a strict CSP works) */
(function () {
  'use strict';
  var src = new URL('lk-button.js', location.href).href;
  var siteInput = document.getElementById('site');
  function site() { return (siteInput.value || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'siteA'; }

  function snippet(style) {
    return '<script src="' + src + '" data-site="' + site() + '"' + (style === 'pill' ? '' : ' data-style="' + style + '"') + ' async><\/script>';
  }
  function renderCode() {
    document.querySelectorAll('pre[data-style]').forEach(function (pre) { pre.textContent = snippet(pre.getAttribute('data-style')); });
  }
  // live previews: the real script, always shown here whatever the date
  function preview(style, target) {
    var s = document.createElement('script');
    s.src = src; s.dataset.site = 'preview'; s.dataset.style = style; s.dataset.show = 'always'; s.dataset.preview = '1';
    if (target) s.dataset.target = target;
    document.body.appendChild(s);
  }
  preview('pill', '#pv-pill-light');
  preview('pill', '#pv-pill-dark');
  preview('banner', '#pv-banner');
  preview('floating', '#pv-floating');
  // the floating example can be closed with ✕ or has tucked its label away: play it again
  document.getElementById('replay').addEventListener('click', function () {
    var old = document.querySelector('#pv-floating lk-krathong-button');
    if (old) old.parentNode.removeChild(old);
    preview('floating', '#pv-floating');
  });

  renderCode();
  siteInput.addEventListener('input', renderCode);
  document.querySelectorAll('.copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.parentNode.querySelector('pre').textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
        b.textContent = 'คัดลอกแล้ว ✓';
      }, function () {
        var r = document.createRange(); r.selectNodeContents(b.parentNode.querySelector('pre'));
        var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        b.textContent = 'กด Ctrl+C';
      });
      setTimeout(function () { b.textContent = 'คัดลอก'; }, 1800);
    });
  });
})();
