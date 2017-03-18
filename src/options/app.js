function initMain() {
  store.loading = true;
  _.sendMessage({cmd: 'GetData'})
  .then(function (data) {
    [
      'cache',
      'scripts',
      'sync',
      'app',
    ].forEach(function (key) {
      Vue.set(store, key, data[key]);
    });
    store.loading = false;
    utils.features.reset('sync');
  });
  Object.assign(handlers, {
    UpdateSync: function (data) {
      store.sync = data;
    },
    AddScript: function (data) {
      data.message = '';
      store.scripts.push(data);
    },
    UpdateScript: function (data) {
      if (!data) return;
      var script = store.scripts.find(function (script) {
        return script.id === data.id;
      });
      script && Object.keys(data).forEach(function (key) {
        Vue.set(script, key, data[key]);
      });
    },
    RemoveScript: function (data) {
      var i = store.scripts.findIndex(function (script) {
        return script.id === data;
      });
      ~i && store.scripts.splice(i, 1);
    },
  });
}
function loadHash() {
  var hash = location.hash.slice(1);
  Object.keys(routes).find(function (key) {
    var test = routes[key];
    var params = test(hash);
    if (params) {
      hashData.type = key;
      hashData.params = params;
      if (init[key]) {
        init[key]();
        init[key] = null;
      }
      return true;
    }
  });
}
function initCustomCSS() {
  var style;
  _.options.hook(function (changes) {
    var customCSS = changes.customCSS || '';
    if (customCSS && !style) {
      style = document.createElement('style');
      document.head.appendChild(style);
    }
    if (customCSS || style) {
      style.innerHTML = customCSS;
    }
  });
}

var _ = require('../common');
_.initOptions();
var utils = require('./utils');
var Main = require('./views/main');
var Confirm = require('./views/confirm');

var store = Object.assign(utils.store, {
  loading: false,
  cache: {},
  scripts: [],
  sync: [],
  app: {},
});
var init = {
  Main: initMain,
};
var routes = {
  Main: utils.routeTester([
    '',
    'main/:tab',
  ]),
  Confirm: utils.routeTester([
    'confirm/:url',
    'confirm/:url/:referer',
  ]),
};
var hashData = {
  type: null,
  params: null,
};
var handlers = {
  UpdateOptions: function (data) {
    _.options.update(data);
  },
};
browser.runtime.onMessage.addListener(function (res) {
  var handle = handlers[res.cmd];
  handle && handle(res.data);
});
window.addEventListener('hashchange', loadHash, false);
zip.workerScriptsPath = '/lib/zip.js/';
document.title = _.i18n('extName');
loadHash();
initCustomCSS();

_.options.ready.then(function () {
  new Vue({
    el: '#app',
    template: '<component :is=type :params=params></component>',
    components: {
      Main: Main,
      Confirm: Confirm,
    },
    data: hashData,
  });
});
