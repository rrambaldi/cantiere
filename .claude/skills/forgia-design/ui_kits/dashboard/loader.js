(function () {
  var ROOT = (document.currentScript && document.currentScript.dataset.root) || '../../';
  var COMP = ['brand/Logo', 'core/Button', 'core/Input', 'core/Checkbox', 'core/Switch', 'core/Tabs', 'feedback/StatoBadge', 'feedback/Toast', 'feedback/Dialog', 'cantiere/Resoconto', 'cantiere/CantiereRiga', 'cantiere/Nastro', 'cantiere/Scheda'];
  function pronto(ns) { window.ForgiaUI = ns; window.dispatchEvent(new Event('forgia-ui-pronto')); }
  function trova() {
    for (var k of Object.keys(window)) { try { var v = window[k]; if (v && v !== window && typeof v === 'object' && !(v instanceof Window) && v.Logo && v.Resoconto) return v; } catch (e) {} }
    return null;
  }
  function daSorgente() {
    Promise.all(COMP.map(function (p) { return fetch(ROOT + 'components/' + p + '.jsx').then(function (r) { return r.text(); }); })).then(function (srcs) {
      var ns = {};
      srcs.forEach(function (src) {
        var code = src.replace(/^import .*$/mg, '').replace(/export function (\w+)/g, 'ns.$1 = function $1');
        var out = Babel.transform(code, { presets: ['react'] }).code;
        var keys = Object.keys(ns);
        Function.apply(null, ['React', 'ns'].concat(keys).concat([out])).apply(null, [React, ns].concat(keys.map(function (k) { return ns[k]; })));
      });
      pronto(ns);
    });
  }
  var s = document.createElement('script');
  s.src = ROOT + '_ds_bundle.js';
  s.onload = function () { var ns = trova(); ns ? pronto(ns) : daSorgente(); };
  s.onerror = daSorgente;
  document.head.appendChild(s);
})();
