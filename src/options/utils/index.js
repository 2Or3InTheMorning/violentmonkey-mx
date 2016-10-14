function routeTester(paths) {
  var routes = paths.map(function (path) {
    var names = [];
    path = path.replace(/:(\w+)/g, function (_param, name) {
      names.push(name);
      return '([^/]+)';
    });
    return {
      re: new RegExp('^' + path + '$'),
      names: names,
    };
  });
  return function (url) {
    var length = routes.length;
    for (var i = 0; i < length; i ++) {
      var route = routes[i];
      var matches = url.match(route.re);
      if (matches) {
        return route.names.reduce(function (params, name, i) {
          params[name] = decodeURIComponent(matches[i + 1]);
          return params;
        }, {});
      }
    }
  };
}

var _ = require('../../common');
_.sendMessage = _.getMessenger({});

// patch options since options is not reachable by options.html in Maxthon
require('./options');

exports.routeTester = routeTester;
exports.store = {};
exports.events = new Vue;

require('./features');
require('./dropdown');
require('./settings');
