// Screw Maxthon: Start
function polyfill(obj, name, value) {
  if (!obj[name]) Object.defineProperty(obj, name, {
    value: value,
  });
}

polyfill(Object, 'assign', function () {
  var obj = arguments[0];
  for (var i = 1; i < arguments.length; i ++) {
    var arg = arguments[i];
    arg && Object.keys(arg).forEach(function (key) {
      obj[key] = arg[key];
    });
  }
  return obj;
});
polyfill(String.prototype, 'startsWith', function (str) {
  return this.slice(0, str.length) === str;
});
polyfill(String.prototype, 'endsWith', function (str) {
  return this.slice(-str.length) === str;
});
polyfill(Array.prototype, 'findIndex', function (predicate) {
  var length = this.length;
  for (var i = 0; i < length; i ++) {
    var item = this[i];
    if (predicate(item, i, this)) return i;
  }
  return -1;
});
polyfill(Array.prototype, 'find', function (predicate) {
  return this[this.findIndex(predicate)];
});

// Screw Maxthon: End

var _ = exports;

_.i18n = function (name, args) {
  return browser.i18n.getMessage(name, args) || name;
};

function normalizeKeys(key) {
  if (!key) key = [];
  if (!Array.isArray(key)) key = key.toString().split('.');
  return key;
}

_.normalizeKeys = normalizeKeys;

_.object = function () {
  function get(obj, key, def) {
    var keys = normalizeKeys(key);
    for (var i = 0, len = keys.length; i < len; i ++) {
      key = keys[i];
      if (obj && (key in obj)) obj = obj[key];
      else return def;
    }
    return obj;
  }
  function set(obj, key, val) {
    var keys = normalizeKeys(key);
    if (!keys.length) return val;
    var sub = obj = obj || {};
    for (var i = 0, len = keys.length - 1; i < len; i ++) {
      key = keys[i];
      sub = sub[key] = sub[key] || {};
    }
    sub[keys[keys.length - 1]] = val;
    return obj;
  }
  return {
    get: get,
    set: set,
  };
}();

_.initHooks = function () {
  var hooks = [];

  function fire(data) {
    hooks.slice().forEach(function (hook) {
      hook(data);
    });
  }

  function hook(callback) {
    hooks.push(callback);
    return function () {
      var i = hooks.indexOf(callback);
      ~i && hooks.splice(i, 1);
    };
  }

  return {
    hook: hook,
    fire: fire,
  };
};

_.initOptions = function () {
  var options = {};
  var hooks = _.initHooks();
  var ready = _.sendMessage({cmd: 'GetAllOptions'})
  .then(function (data) {
    options = data;
    data && hooks.fire(data);
  });

  function getOption(key, def) {
    var keys = normalizeKeys(key);
    return _.object.get(options, keys, def);
  }

  function setOption(key, value) {
    _.sendMessage({
      cmd: 'SetOptions',
      data: {
        key: key,
        value: value,
      },
    });
  }

  function updateOptions(data) {
    Object.keys(data).forEach(function (key) {
      _.object.set(options, key, data[key]);
    });
    hooks.fire(data);
  }

  _.options = {
    get: getOption,
    set: setOption,
    update: updateOptions,
    hook: hooks.hook,
    ready: ready,
  };
};

_.sendMessage = function (data) {
  return browser.runtime.sendMessage(data)
  .then(function (res) {
    if (res && res.error) throw res.error;
    return res && res.data;
  })
  .catch(function (err) {
    console.error(err);
  });
};

_.debounce = function (func, time) {
  function run(thisObj, args) {
    timer = null;
    func.apply(thisObj, args);
  }
  var timer;
  return function (args) {
    timer && clearTimeout(timer);
    timer = setTimeout(run, time, this, args);
  };
};

_.noop = function () {};

_.zfill = function (num, length) {
  num = num.toString();
  while (num.length < length) num = '0' + num;
  return num;
};

_.getUniqId = function () {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
};

/**
 * Get locale attributes such as `@name:zh-CN`
 */
_.getLocaleString = function (meta, key) {
  var languages = [navigator.language];
  var i = languages[0].indexOf('-');
  if (i > 0) languages.push(languages[0].slice(0, i));
  var lang = languages.find(function (lang) {
    return (key + ':' + lang) in meta;
  });
  if (lang) key += ':' + lang;
  return meta[key] || '';
};

_.injectContent = function (br) {
  return function (script) {
    br.executeScript('if(window.mx)try{' + script + '}catch(e){}');
  };
}(window.external.mxGetRuntime().create('mx.browser'));
