!function () {

// make sure this is an HTML page, ignore XML, etc.
if(document.documentElement.tagName.toLowerCase()!='html') return;

// avoid running repeatedly due to new document.documentElement
if (window.VM) return;
window.VM = 1;

function getUniqId() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
* http://www.webtoolkit.info/javascript-utf8.html
*/
function utf8decode (utftext) {
	var string = "";
	var i = 0;
	var c = 0, c1 = 0, c2 = 0, c3 = 0;
	while ( i < utftext.length ) {
		c = utftext.charCodeAt(i);
		if (c < 128) {string += String.fromCharCode(c);i++;}
		else if((c > 191) && (c < 224)) {
			c2 = utftext.charCodeAt(i+1);
			string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
			i += 2;
		} else {
			c2 = utftext.charCodeAt(i+1);
			c3 = utftext.charCodeAt(i+2);
			string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
			i += 3;
		}
	}
	return string;
}

// Messages
var rt = window.external.mxGetRuntime();
var id = getUniqId();
var callbacks = {};
function post(target, data, callback) {
	data.src = {id: id, url: window.location.href};
	if (callback) {
		data.callback = getUniqId();
		callbacks[data.callback] = callback;
	}
	rt.post(target, data);
}
rt.listen(id, function (obj) {
	var maps = {
		Command: function(data) {
			comm.post({cmd: 'Command', data: data});
		},
		Callback: function (obj) {
			var func = callbacks[obj.id];
			if (func) func(obj.data);
			delete callbacks[obj.id];
		},
	};
	var func = maps[obj.cmd];
	if (func) func(obj.data);
});

// Communicator
var comm = {
	vmid: 'VM_' + getUniqId(),
	state: 0,
	utf8decode: utf8decode,
	getUniqId: getUniqId,

	// Array functions
	// to avoid using prototype functions
	// since they may be changed by page scripts
	inArray: function(arr, item) {
		for (var i = 0; i < arr.length; i ++)
			if (arr[i] == item) return true;
		return false;
	},
	extendArray: function(arr, arr2) {
		for(var i = 0; i < arr2.length; i ++) arr.push(arr2[i]);
	},
	forEach: function(arr, func, args) {
		for(var i = 0; i < arr.length; i ++) {
			var _args = [arr[i]];
			if(args) this.extendArray(_args, args);
			func.apply(arr, _args);
		}
	},

	prop1: Object.getOwnPropertyNames(window),
	prop2: (function(n,p){
		while(n=Object.getPrototypeOf(n)) p=p.concat(Object.getOwnPropertyNames(n));
		return p;
	})(window,[]),
	init: function(srcId, destId) {
		var comm = this;
		comm.sid = comm.vmid + srcId;
		comm.did = comm.vmid + destId;
		document.addEventListener(comm.sid, comm['handle' + srcId].bind(comm), false);
		comm.load = comm.checkLoad = function(){};
	},
	post: function(data) {
		var e = document.createEvent("MutationEvent");
		e.initMutationEvent(this.did, false, false, null, null, null, JSON.stringify(data), e.ADDITION);
		document.dispatchEvent(e);
	},
	handleR: function(e) {
		var obj = JSON.parse(e.attrName);
		var comm = this;
		var maps = {
			LoadScript: comm.loadScript.bind(comm),
			Command: function (data) {
				var func = comm.command[data];
				if(func) func();
			},
			GotRequestId: function (id) {
				comm.qrequests.shift().start(id);
			},
			HttpRequested: function (r) {
				var req = comm.requests[r.id];
				if (req) req.callback(r);
			},
		};
		var func = maps[obj.cmd];
		if (func) func(obj.data);
	},
	runCode: function(name, func, wrapper) {
		try{
			func.call(wrapper.window, wrapper);
		}catch(e){
			console.log('Error running script: ' + name + '\n' + e.message);
		}
	},
	initRequest: function() {
		// request functions
		function reqAbort(){
			comm.post({cmd: 'AbortRequest', data: this.id});
		}

		// request object functions
		function callback(req){
			var t = this;
			var cb = t.details['on' + req.type];
			if (cb) {
				if(req.data.response) {
					if(!t.data.length) {
						if(req.resType) {	// blob or arraybuffer
							var m = req.data.response.match(/^data:(.*?);base64,(.*)$/);
							if (!m) req.data.response = null;
							else {
								var b = window.atob(m[2]);
								if(t.details.responseType == 'blob')
									t.data.push(new Blob([b], {type: m[1]}));
								else {	// arraybuffer
									m = new Uint8Array(b.length);
									for(var i = 0; i < b.length; i ++) m[i] = b.charCodeAt(i);
									t.data.push(m.buffer);
								}
							}
						} else if(t.details.responseType == 'json')	// json
							t.data.push(JSON.parse(req.data.response));
						else	// text
							t.data.push(req.data.response);
					}
					req.data.response = t.data[0];
				}
				// finalUrl not supported
				Object.defineProperty(req.data, 'finalUrl', {
					get: function () {
						console.log('[Violentmonkey] Warning: finalUrl is not supported!');
					},
				});
				cb(req.data);
			}
			if (req.type == 'loadend') delete comm.requests[t.id];
		}
		function start(id) {
			var t = this;
			var data = {
				id: id,
				method: t.details.method,
				url: t.details.url,
				data: t.details.data,
				//async: !t.details.synchronous,
				user: t.details.user,
				password: t.details.password,
				headers: t.details.headers,
				overrideMimeType: t.details.overrideMimeType,
			};
			t.id = id;
			comm.requests[id] = t;
			if(comm.inArray(['arraybuffer', 'blob'], t.details.responseType))
				data.responseType = 'blob';
			comm.post({cmd: 'HttpRequest', data: data});
		}
		function getFullUrl(url) {
			var a = document.createElement('a');
			a.setAttribute('href', url);
			return a.href;
		}

		var comm = this;
		comm.requests = {};
		comm.qrequests = [];
		comm.Request = function(details) {
			var t = {
				details: details,
				callback: callback,
				start: start,
				req: {
					abort: reqAbort,
				},
				data: [],
			};
			details.url = getFullUrl(details.url);
			comm.qrequests.push(t);
			comm.post({cmd:'GetRequestId'});
			return t.req;
		};
	},
	initWrapper: function() {
		// wrapper: wrap functions as needed, return and set properties
		function wrapItem(key, thisObj, wrap) {
			var type;
			var value;
			var apply = Function.apply;
			function initProperty() {
				if(!comm.inArray(['function', 'custom'], type)) {
					value = window[key];
					type = typeof value;
					if(wrap && type == 'function') {
						var func = value;
						value = function () {
							var r;
							try {
								r = apply.apply(func, [window, arguments]);
							} catch(e) {
								console.log('[Violentmonkey] Error calling ' + key + ':\n' + e.stack);
							}
							return r === window ? thisObj : r;
						};
						value.__proto__ = func;
						value.prototype = func.prototype;
					}
				}
			}
			try {
				Object.defineProperty(thisObj, key, {
					get: function () {
						initProperty();
						return value === window ? thisObj : value;
					},
					set: function (_value) {
						initProperty();
						value = _value;
						if(type != 'function') window[key] = _value;
						type = 'custom';
					},
				});
			} catch(e) {
				// ignore protected data
			}
		}
		var comm = this;
		comm.Wrapper = function () {
			comm.forEach(comm.prop1, wrapItem, [this]);
			comm.forEach(comm.prop2, wrapItem, [this, true]);
		};
	},
	wrapGM: function(script, value, cache) {
		// Add GM functions
		// Reference: http://wiki.greasespot.net/Greasemonkey_Manual:API
		var comm = this;
		var gm = {};
		var grant = script.meta.grant || [];
		var urls = {};
		if (!grant.length || grant.length == 1 && grant[0] == 'none')
			// @grant none
			grant.pop();
		else {
			if (!comm.Wrapper) comm.initWrapper();
			gm['window'] = new comm.Wrapper();
		}
		value = value || {};
		if(!comm.inArray(grant, 'unsafeWindow')) grant.push('unsafeWindow');
		function propertyToString() {
			return '[Violentmonkey property]';
		}
		function addProperty(name, prop, obj) {
			if('value' in prop) prop.writable = false;
			prop.configurable = false;
			Object.defineProperty(obj, name, prop);
			if (typeof obj[name] == 'function')
				obj[name].toString = propertyToString;
		}
		function saveValues() {
			comm.post({
				cmd: 'SetValue',
				data: {
					uri: script.uri,
					values: value,
				},
			});
		}
		var resources = script.meta.resources || {};
		var gm_funcs = {
			unsafeWindow: {value: window},
			GM_info: {
				get: function () {
					var m = script.code.match(/\/\/\s+==UserScript==\s+([\s\S]*?)\/\/\s+==\/UserScript==\s/);
					var data = {
						description: script.meta.description || '',
						excludes: script.meta.exclude.concat(),
						includes: script.meta.include.concat(),
						matches: script.meta.match.concat(),
						name: script.meta.name || '',
						namespace: script.meta.namespace || '',
						resources: {},
						'run-at': script.meta['run-at'] || '',
						unwrap: false,
						version: script.meta.version || '',
					};
					var obj = {};
					addProperty('scriptMetaStr', {value: m ? m[1] : ''}, obj);

					// whether update is allowed
					addProperty('scriptWillUpdate', {value: script.update}, obj);

					// Violentmonkey specific data
					addProperty('version', {value: comm.version}, obj);
					addProperty('scriptHandler', {value: 'Violentmonkey'}, obj);

					// script object
					addProperty('script', {value:{}}, obj);
					for(var i in data)
						addProperty(i, {value: data[i]}, obj.script);
					for(var i in script.meta.resources)
						addProperty(i, {value: script.meta.resources[i]}, obj.script.resources);

					return obj;
				},
			},
			GM_deleteValue: {
				value: function (key) {
					delete value[key];
					saveValues();
				},
			},
			GM_getValue: {
				value: function(key, val) {
					var v = value[key];
					if (v) {
						var type = v[0];
						v = v.slice(1);
						switch(type) {
							case 'n':
								val = Number(v);
								break;
							case 'b':
								val = v == 'true';
								break;
							case 'o':
								try {
									val = JSON.parse(v);
								} catch(e) {
									console.log(e);
								}
								break;
							default:
								val = v;
						}
					}
					return val;
				},
			},
			GM_listValues: {
				value: function () {
					return Object.getOwnPropertyNames(value);
				},
			},
			GM_setValue: {
				value: function (key, val) {
					var type = (typeof val)[0];
					switch(type) {
						case 'o':
							val = type + JSON.stringify(val);
							break;
						default:
							val = type + val;
					}
					value[key] = val;
					saveValues();
				},
			},
			GM_getResourceText: {
				value: function (name) {
					for(var i in resources) if (name == i) {
						var text = cache[resources[i]];
						if (text) text = comm.utf8decode(window.atob(text));
						return text;
					}
				},
			},
			GM_getResourceURL: {
				value: function (name) {
					for(var i in resources) if (name == i) {
						i = resources[i];
						var url = urls[i];
						if(!url) {
							var cc = cache[i];
							if(cc) {
								cc = window.atob(cc);
								var b = new Uint8Array(cc.length);
								for(var j = 0; j < cc.length; j ++)
									b[j] = cc.charCodeAt(j);
								b = new Blob([b]);
								urls[i] = url = URL.createObjectURL(b);
							}
						}
					}
					return url;
				}
			},
			GM_addStyle: {
				value: function (css) {
					if (document.head) {
						var style = document.createElement('style');
						style.innerHTML = css;
						document.head.appendChild(style);
						return style;
					}
				},
			},
			GM_log: {
				value: function (data) {console.log(data);},
			},
			GM_openInTab: {
				value: function (url) {
					// XXX: open from background to avoid being blocked
					var a = document.createElement('a');
					a.href = url;
					a.target = '_blank';
					a.click();
				},
			},
			GM_registerMenuCommand: {
				value: function (cap, func, acc) {
					comm.command[cap] = func;
					comm.post({cmd: 'RegisterMenu', data: [cap, acc]});
				},
			},
			GM_xmlhttpRequest: {
				value: function (details) {
					if(!comm.Request) comm.initRequest();
					return comm.Request(details);
				},
			},
		};
		comm.forEach(grant, function (name) {
			var prop = gm_funcs[name];
			if(prop) addProperty(name, prop, gm);
		});
		return gm;
	},
	loadScript: function (data) {
		function buildCode(script) {
			var require = script.meta.require || [];
			var wrapper = comm.wrapGM(script, data.values[script.uri], data.cache);
			var code = [];
			var part;
			comm.forEach(Object.getOwnPropertyNames(wrapper), function(name) {
				code.push(name + '=this["' + name + '"]=g["' + name + '"]');
			});
			if (code.length)
				code = ['var ' + code.join(',') + ';delete g;with(this)!function(){'];
			else
				code = [];
			for(var i = 0; i < require.length; i ++)
				if(part = data.require[require[i]]) code.push(part);
			// wrap code to make 'use strict' work
			code.push('!function(){' + script.code + '\n}.call(this)');
			code.push('}.call(this);');
			code = code.join('\n');
			var name = script.custom.name || script.meta.name || script.id;
			if (data.injectMode == 1) {
				// advanced injection
				var id = comm.getUniqId();
				comm.ainject[id] = [name, wrapper];
				comm.post({cmd: 'Inject', data: [id, code]});
			} else {
				// normal injection
				try {
					var func = new Function('g', code);
				} catch(e) {
					console.log('Syntax error in script: ' + name + '\n' + e.message);
					return;
				}
				comm.runCode(name, func, wrapper);
			}
		}
		function run(list) {
			while (list.length) buildCode(list.shift());
		}
		var comm = this;
		var start = [];
		var idle = [];
		var end = [];
		comm.command = {};
		comm.ainject = {};
		comm.version = data.version;
		// reset load and checkLoad
		comm.load = function() {
			run(end);
			setTimeout(function() {
				run(idle);
			}, 0);
		};
		comm.checkLoad = function() {
			if (!comm.state && comm.inArray(['interactive', 'complete'], document.readyState))
				comm.state = 1;
			if (comm.state) comm.load();
		};
		comm.forEach(data.scripts, function(script) {
			var list;
			if(script && script.enabled) {
				switch (script.custom['run-at'] || script.meta['run-at']) {
					case 'document-start':
						list = start;
						break;
					case 'document-idle':
						list = idle;
						break;
					default:
						list = end;
				}
				list.push(script);
			}
		});
		run(start);
		comm.checkLoad();
	},
};

var menus = []
var ids = [];
function handleC(e){
	var req = JSON.parse(e.attrName);
	var maps = {
		SetValue: function (data) {
			post('Background', {cmd: 'SetValue', data: data});
		},
		RegisterMenu: function (data) {
			menus.push(data);
			updatePopup();
		},
		GetRequestId: getRequestId,
		HttpRequest: httpRequest,
		AbortRequest: abortRequest,
	};
	var func = maps[req.cmd];
	if (func) func(req.data);
}

// Requests
var requests = {};
function getRequestId() {
  var id = getUniqId();
  requests[id] = new XMLHttpRequest();
	comm.post({cmd: 'GotRequestId', data: id});
}
function httpRequest(details) {
  function callback(evt) {
		function finish(){
			comm.post({
				cmd: 'HttpRequested',
				data: {
					id: details.id,
					type: evt.type,
					resType: req.responseType,
					data: data
				}
			});
		}
		var data = {
			readyState: req.readyState,
			responseHeaders: req.getAllResponseHeaders(),
			status: req.status,
			statusText: req.statusText
		};
		try {
			data.responseText = req.responseText;
		} catch(e) {}
		if (req.response && req.responseType == 'blob') {
			var r = new FileReader();
			r.onload = function (e) {
				data.response = r.result;
				finish();
			};
			r.readAsDataURL(req.response);
		} else {	// default `null` for blob and '' for text
			data.response = req.response;
			finish();
		}
  }
  var req;
  if (details.id) req = requests[details.id];
	else req = new XMLHttpRequest();
  try {
		// details.async=true;
    req.open(details.method, details.url, true, details.user, details.password);
    if (details.headers)
			for (var i in details.headers)
				req.setRequestHeader(i, details.headers[i]);
		if (details.responseType) req.responseType = 'blob';
    if (details.overrideMimeType) req.overrideMimeType(details.overrideMimeType);
    ['abort', 'error', 'load', 'loadend', 'progress', 'readystatechange', 'timeout'].forEach(function(evt) {
      req['on' + evt] = callback;
    });
    req.send(details.data);
  } catch (e) {
		console.log(e);
  }
}
function abortRequest(id) {
  var req = requests[id];
  if (req) req.abort();
  delete requests[id];
}

function objEncode(obj) {
	var list = [];
	for(var i in obj) {
		if(!obj.hasOwnProperty(i)) continue;
		if(typeof obj[i] == 'function')
			list.push(i + ':' + obj[i].toString());
		else
			list.push(i + ':' + JSON.stringify(obj[i]));
	}
	return '{' + list.join(',') + '}';
}
function inject(code) {
	var script = document.createElement('script')
	var doc = document.body || document.documentElement;
	script.innerHTML = code;
	doc.appendChild(script);
	doc.removeChild(script);
}
function loadScript(data) {
	data.scripts.forEach(function(script) {
		ids.push(script.id);
		if (script.enabled) badge.number ++;
	});
	comm.post({cmd: 'LoadScript', data: data});
	badge.ready = true;
	updateBadge();
}
function initCommunicator() {
	var C = 'C';
	var R = 'R';
	inject(
		'!function(c,R,C){c.init(R,C);document.addEventListener("DOMContentLoaded",function(e){c.state=1;c.load();},false);c.checkLoad();}(' +
		objEncode(comm) + ',"' + R + '","' + C + '")'
	);
	comm.handleC = handleC;
	comm.init(C, R);
	post('Background', {cmd: 'GetInjected'}, loadScript);
}
initCommunicator();

var badge = {
	number: 0,
	ready: false,
	willSet: false,
};
var timer;
function updatePopup() {
	if (timer) clearTimeout(timer);
	timer = setTimeout(function () {
		post('Popup', {cmd: 'GetPopup'});
		timer = null;
	}, 100);
}
function updateBadge() {
	post('Background', {cmd: 'GetBadge'});
}
window.setPopup = function () {
	post('Popup', {
		cmd: 'SetPopup',
		data: {
			ids: ids,
			menus: menus,
		},
	});
};
window.setBadge = function () {
	post('Background', {cmd: 'SetBadge', data: badge.number});
};
document.addEventListener("DOMContentLoaded", updatePopup, false);

// For installation
function checkJS() {
	if (!document.querySelector('title'))	// plain text
		post('Background', {
			cmd: 'InstallScript',
			data: location.href,
		}, function () {
			if (history.length > 1) history.go(-1);
			else window.close();
		});
}
if (/\.user\.js$/.test(location.pathname)) {
	if (document.readyState == 'complete')
		checkJS();
	else
		window.addEventListener('load', checkJS, false);
}

}();
