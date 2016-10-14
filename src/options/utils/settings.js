var _ = require('../../common');

function update(value, key) {
  var list = hooks[key];
  list && list.forEach(function (el) {
    el.checked = value;
  });
}

var hooks = {};
_.options.hook(function (value, key) {
  if (key) update(value, key);
  else Object.keys(hooks).forEach(function (key) {
    update(_.options.get(key), key);
  });
});

function onSettingChange(e) {
  var target = e.target;
  _.options.set(target.dataset.setting, target.checked);
}

Vue.directive('setting', {
  bind: function (el, binding) {
    var value = binding.value;
    el.dataset.setting = value;
    el.addEventListener('change', onSettingChange, false);
    var list = hooks[value] = hooks[value] || [];
    list.push(el);
    el.checked = _.options.get(value);
  },
  unbind: function (el, binding) {
    var value = binding.value;
    el.removeEventListener('change', onSettingChange, false);
    var list = hooks[value] || [];
    var i = list.indexOf(el);
    ~i && list.splice(i, 1);
  },
});
