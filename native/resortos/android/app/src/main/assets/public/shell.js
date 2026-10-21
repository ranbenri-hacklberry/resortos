(function () {
  var DEFAULT_URL = 'http://100.127.14.15:3001';
  var KEY = 'resortos-staff-app-url';
  function readUrl() {
    try { return localStorage.getItem(KEY) || DEFAULT_URL; } catch (e) { return DEFAULT_URL; }
  }
  function writeUrl(v) {
    var url = String(v || DEFAULT_URL).trim() || DEFAULT_URL;
    try { localStorage.setItem(KEY, url); } catch (e) {}
    return url;
  }
  function go() {
    var url = readUrl();
    document.getElementById('status-url').textContent = url;
    document.getElementById('status-label').textContent = 'פותחים את ResortOS…';
    window.location.replace(url.replace(/\/$/, '') + '/');
  }
  document.getElementById('status-url').textContent = readUrl();
  document.getElementById('url').value = readUrl();
  document.getElementById('retry').onclick = go;
  document.getElementById('open-settings').onclick = function () {
    document.getElementById('settings').hidden = false;
  };
  document.getElementById('reset').onclick = function () {
    document.getElementById('url').value = writeUrl(DEFAULT_URL);
  };
  document.getElementById('settings').onsubmit = function (e) {
    e.preventDefault();
    writeUrl(document.getElementById('url').value);
    go();
  };
  go();
})();
