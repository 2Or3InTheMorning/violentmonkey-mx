var vmdb = new VMDB;
var VM_VER;
scriptUtils.fetch(_.mx.rt.getPrivateUrl() + 'def.json').then(function (xhr) {
  var data = JSON.parse(xhr.responseText)[0];
  VM_VER = data.version;
});
var commands = {
  NewScript: function (data, src) {
    return Promise.resolve(scriptUtils.newScript());
  },
  RemoveScript: function (id, src) {
    return vmdb.removeScript(id);
  },
  GetData: function (data, src) {
    return vmdb.getData();
  },
  GetInjected: function (url, src) {
    var data = {
      isApplied: _.options.get('isApplied'),
      injectMode: _.options.get('injectMode'),
      version: VM_VER,
    };
    if(src.url == src.tab.url)
      chrome.tabs.sendMessage(src.tab.id, {cmd: 'GetBadge'});
    return data.isApplied
    ? vmdb.getScriptsByURL(url).then(function (res) {
      return Object.assign(data, res);
    }) : Promise.resolve(data);
  },
  UpdateScriptInfo: function (data, src) {
    return vmdb.updateScriptInfo(data.id, data).then(function (script) {
      _.messenger.post({
        cmd: 'update',
        data: script,
      });
    });
  },
  SetValue: function (data, src) {
    return vmdb.setValue(data.uri, data.values);
  },
  ExportZip: function (data, src) {
    return vmdb.getExportData(data.ids, data.values);
  },
  GetScript: function (id, src) {
    return vmdb.getScriptData(id);
  },
  GetMetas: function (ids, src) {
    return vmdb.getScriptInfos(ids);
  },
  Move: function (data, src) {
    return vmdb.moveScript(data.id, data.offset);
  },
  Vacuum: function (data, src) {
    return vmdb.vacuum();
  },
  ParseScript: function (data, src) {
    return vmdb.parseScript(data).then(function (res) {
      var meta = res.data.meta;
      if (!meta.grant.length && !_.options.get('ignoreGrant'))
        notify({
          id: 'VM-NoGrantWarning',
          title: _.i18n('Warning'),
          body: _.i18n('msgWarnGrant', [meta.name||_.i18n('labelNoName')]),
          onClicked: function () {
            _.mx.br.tabs.newTab({
              activate: true,
              url: 'http://wiki.greasespot.net/@grant',
            });
            this.close();
          },
        });
      _.messenger.post(res);
      return res.data;
    });
  },
  CheckUpdate: function (id, src) {
    vmdb.getScript(id).then(vmdb.checkUpdate);
    return false;
  },
  CheckUpdateAll: function (data, src) {
    _.options.set('lastUpdate', Date.now());
    vmdb.getScriptsByIndex('update', 1).then(function (scripts) {
      return Promise.all(scripts.map(vmdb.checkUpdate));
    });
    return false;
  },
  ParseMeta: function (code, src) {
    return Promise.resolve(scriptUtils.parseMeta(code));
  },
  AutoUpdate: autoUpdate,
  /*GetRequestId: function (data, src) {
    return Promise.resolve(requests.getRequestId());
  },
  HttpRequest: function (details, src) {
    requests.httpRequest(details, function (res) {
      _.messenger.send(src.tab.id, {
        cmd: 'HttpRequested',
        data: res,
      });
    });
    return false;
  },
  AbortRequest: function (id, src) {
    return Promise.resolve(requests.abortRequest(id));
  },*/
  SetBadge: function (num, src) {
    setBadge(num, src);
    return false;
  },
};

vmdb.initialized.then(function () {
  _.mx.rt.listen('Background', function (req) {
    /*
     * o={
     * 	cmd: String,
     * 	src: {
     * 		id: String,
     * 		url: String,
     * 	},
     * 	callback: String,
     * 	data: Object
     * }
     */
    function finish(res) {
      _.mx.rt.post(req.src.id, {
        cmd: 'Callback',
        data: {
          id: req.callback,
          data: res,
        },
      });
    }
    var func = commands[req.cmd];
    if (func) {
      var res = func(req.data, req.src);
      if (res !== false) return res.then(function (data) {
        finish({
          data: data,
          error: null,
        });
      }, function (data) {
        finish({
          error: data,
        });
      });
    }
    finish();
  });
  setTimeout(autoUpdate, 2e4);
});

// Common functions

function notify(options) {
  function show() {
		var n = new Notification(options.title + ' - ' + _.i18n('extName'), {
			body: options.body,
		});
		n.onclick = options.onClicked;
	}
	if (Notification.permission == 'granted') show();
	else Notification.requestPermission(function (e) {
		if (e == 'granted') show();
		else console.log('Notification: ' + options.body);
	});
}

var setBadge = function () {
  var badges = {};
  return function (num, src) {
    var o = badges[src.id];
    if (!o) o = badges[src.id] = {num: 0};
    o.num += num;
    if (_.options.get('showBadge')) _.mx.rt.icon.showBadge(o.num || '');
    if (o.timer) clearTimeout(o.timer);
    o.timer = setTimeout(function () {
      delete badges[src.id];
    }, 300);
  };
}();

var autoUpdate = function () {
  function check() {
    checking = true;
    return new Promise(function (resolve, reject) {
      if (!_.options.get('autoUpdate')) return reject();
      if (Date.now() - _.options.get('lastUpdate') >= 864e5)
        return commands.CheckUpdateAll();
    }).then(function () {
      setTimeout(check, 36e5);
    }, function () {
      checking = false;
    });
  }
  var checking;
  return function () {
    checking || check();
  };
}();

_.messenger = function () {
  return {
    post: function (data) {
      _.mx.rt.post('UpdateItem', data);
    },
  };
}();

_.mx.rt.icon.setIconImage('icon' + (_.options.get('isApplied') ? '' : 'w'));
