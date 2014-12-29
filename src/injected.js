(function(){
// avoid running repeatedly due to new document.documentElement
if(window.VM) return;window.VM=1;
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
var rt=window.external.mxGetRuntime(),id=Date.now()+Math.random().toString().slice(1),
		callbacks={};
function post(d,o,callback){
	o.src={id:id,url:window.location.href};
	if(callback) {
		o.callback=Math.random().toString();
		callbacks[o.callback]=callback;
	}
	rt.post(d,o);
}
rt.listen(id,function(o){
	var maps={
		Command:command,
		Callback:function(o){
			var f=callbacks[o.id];
			if(f) f(o.data);
			delete callbacks[o.id];
		},
	},f=maps[o.cmd];
	if(f) f(o.data);
});

// Communicator
var comm={
	vmid:'VM'+Math.random(),
	state:0,
	utf8decode:utf8decode,

	// Array functions
	// to avoid using prototype functions
	// since they may be changed by page scripts
	inArray:function(arr, item) {
		for(var i=0;i<arr.length;i++)
			if(arr[i]==item) return true;
		return false;
	},
	extendArray:function(arr, arr2) {
		for(var i=0;i<arr2.length;i++) arr.push(arr2[i]);
	},
	forEach:function(arr, func, args) {
		for(var i=0;i<arr.length;i++) {
			var a=[arr[i]];
			if(args) this.extendArray(a,args);
			func.apply(arr,a);
		}
	},

	prop1:Object.getOwnPropertyNames(window),
	prop2:(function(n,p){
		while(n=Object.getPrototypeOf(n)) p=p.concat(Object.getOwnPropertyNames(n));
		return p;
	})(window,[]),
	init:function(s,d){
		var t=this;
		t.sid=t.vmid+s;
		t.did=t.vmid+d;
		document.addEventListener(t.sid,t['handle'+s].bind(t),false);
		t.load=t.checkLoad=function(){};
	},
	post:function(d){
		var e=document.createEvent("MutationEvent");
		e.initMutationEvent(this.did,false,false,null,null,null,JSON.stringify(d),e.ADDITION);
		document.dispatchEvent(e);
	},
	handleR:function(e){
		var o=JSON.parse(e.attrName),comm=this,maps={
			LoadScript:comm.loadScript.bind(comm),
			Command:function(o){
				var f=comm.command[o];
				if(f) f();
			},
			GotRequestId:function(o){comm.qrequests.shift().start(o);},
			HttpRequested:function(o){
				var c=comm.requests[o.id];
				if(c) c.callback(o);
			},
		},f=maps[o.cmd];
		if(f) f(o.data);
	},
	loadScript:function(o){
		var start=[],idle=[],end=[],cache,require,values,comm=this,urls={},
		Request=(function(){
			// request functions
			function reqAbort(){comm.post({cmd:'AbortRequest',data:this.id});}

			// request object functions
			function callback(d){
				var i,t=this,c=t.details['on'+d.type];
				if(c) {
					if(d.data.response) {
						if(!t.data.length) {
							if(d.resType) {	// blob or arraybuffer
								var m=d.data.response.match(/^data:(.*?);base64,(.*)$/);
								if(!m) d.data.response=null;
								else {
									var b=window.atob(m[2]);
									if(t.details.responseType=='blob') {
										t.data.push(new Blob([b],{type:m[1]}));
									} else {	// arraybuffer
										m=new Uint8Array(b.length);
										for(i=0;i<b.length;i++) m[i]=b.charCodeAt(i);
										t.data.push(m.buffer);
									}
								}
							} else if(t.details.responseType=='json')	// json
								t.data.push(JSON.parse(d.data.response));
							else	// text
								t.data.push(d.data.response);
						}
						d.data.response=t.data[0];
					}
					// finalUrl not supported
					Object.defineProperty(d.data,'finalUrl',{
						get:function(){console.log('[Violentmonkey]Warning: finalUrl not supported for GM_xmlhttpRequest yet!');}
					});
					c(d.data);
				}
				if(d.type=='loadend') delete comm.requests[t.id];
			}
			function start(id){
				var t=this,data={
					id:id,
					method:t.details.method,
					url:t.details.url,
					data:t.details.data,
					//async:!t.details.synchronous,
					user:t.details.user,
					password:t.details.password,
					headers:t.details.headers,
					overrideMimeType:t.details.overrideMimeType,
				};
				t.id=id;
				comm.requests[id]=t;
				if(comm.inArray(['arraybuffer','blob'],t.details.responseType)) data.responseType='blob';
				comm.post({cmd:'HttpRequest',data:data});
			}

			return function(details){
				var t={
					details:details,
					callback:callback,
					start:start,
					req:{
						abort:reqAbort,
					},
					data:[],
				},a=document.createElement('a');
				a.setAttribute('href',details.url);
				details.url=a.href;
				comm.qrequests.push(t);
				comm.post({cmd:'GetRequestId'});
				return t.req;
			};
		})();
		comm.command={};comm.requests={};comm.qrequests=[];

		/*
		 * Wrap functions and properties
		 */
		// wrapper: wrap functions as needed, return and set properties
		function wrapper(){
			function wrapItem(key,wrap){
				var type=null,value,apply=Function.apply;
				function initProperty() {
					if(!comm.inArray(['function','custom'],type)) {
						value=window[key];
						type=typeof value;
						if(type=='function'&&wrap) {
							var o=value;
							value=function(){
								var r;
								try {
									r=apply.apply(o,[window,arguments]);
								} catch(e) {
									console.log('[Violentmonkey] Error calling '+key+':\n'+e.stack);
								}
								return r===window?t:r;
							};
							value.__proto__=o;
							value.prototype=o.prototype;
						}
					}
				}
				try {
					Object.defineProperty(t,key,{
						get:function(){
							initProperty();
							return value===window?t:value;
						},
						set:function(v){
							initProperty();
							value=v;
							if(type!='function') window[key]=v;
							type='custom';
						},
					});
				} catch(e) {
					// ignore protected data
				}
			}
			var t=this;
			comm.forEach(comm.prop1,wrapItem,[]);
			comm.forEach(comm.prop2,wrapItem,[true]);
		}

		function wrapGM(c){
			// Add GM functions
			// Reference: http://wiki.greasespot.net/Greasemonkey_Manual:API
			var gm={},value=values[c.uri]||{},g=c.meta.grant||[];
			if(!g.length||g.length==1&&g[0]=='none') {	// @grant none
				g.pop();
			} else {
				gm['window']=new wrapper();
			}
			if(!comm.inArray(g,'unsafeWindow')) g.push('unsafeWindow');
			function propertyToString(){return 'Property for Violentmonkey: designed by Gerald';}
			function addProperty(name,prop,obj){
				if('value' in prop) prop.writable=false;
				prop.configurable=false;
				Object.defineProperty(obj,name,prop);
				if(typeof obj[name]=='function') obj[name].toString=propertyToString;
			}
			var resources=c.meta.resources||{},gf={
				unsafeWindow:{value:window},
				GM_info:{get:function(){
					var m=c.code.match(/\/\/\s+==UserScript==\s+([\s\S]*?)\/\/\s+==\/UserScript==\s/),
							script={
								description:c.meta.description||'',
								excludes:c.meta.exclude.concat(),
								includes:c.meta.include.concat(),
								matches:c.meta.match.concat(),
								name:c.meta.name||'',
								namespace:c.meta.namespace||'',
								resources:{},
								'run-at':c.meta['run-at']||'document-end',
								unwrap:false,
								version:c.meta.version||'',
							},
							o={};
					addProperty('script',{value:{}},o);
					addProperty('scriptMetaStr',{value:m?m[1]:''},o);
					addProperty('scriptWillUpdate',{value:c.update},o);
					addProperty('version',{value:undefined},o);
					for(m in script) addProperty(m,{value:script[m]},o.script);
					for(m in c.meta.resources) addProperty(m,{value:c.meta.resources[m]},o.script.resources);
					return o;
				}},
				GM_deleteValue:{value:function(key){delete value[key];comm.post({cmd:'SetValue',data:{uri:c.uri,values:value}});}},
				GM_getValue:{value:function(k,d){
					var v=value[k];
					if(v) {
						k=v[0];
						v=v.slice(1);
						switch(k){
							case 'n': d=Number(v);break;
							case 'b': d=v=='true';break;
							case 'o': try{d=JSON.parse(v);}catch(e){console.log(e);}break;
							default: d=v;
						}
					}
					return d;
				}},
				GM_listValues:{value:function(){return Object.getOwnPropertyNames(value);}},
				GM_setValue:{value:function(key,val){
					var t=(typeof val)[0];
					switch(t){
						case 'o':val=t+JSON.stringify(val);break;
						default:val=t+val;
					}
					value[key]=val;comm.post({cmd:'SetValue',data:{uri:c.uri,values:value}});
				}},
				GM_getResourceText:{value:function(name){
					var i,b=null;
					for(i in resources) if(name==i) {
						b=cache[resources[i]];
						if(b) b=comm.utf8decode(b);
						break;
					}
					return b;
				}},
				GM_getResourceURL:{value:function(name){
					var i,u,r,j,b;
					for(i in resources) if(name==i) {
						i=resources[i];u=urls[i];
						if(!u&&(r=cache[i])) {
							r=window.atob(r);
							b=new Uint8Array(r.length);
							for(j=0;j<r.length;j++) b[j]=r.charCodeAt(j);
							b=new Blob([b]);
							urls[i]=u=URL.createObjectURL(b);
						}
						return u;
					}
				}},
				GM_addStyle:{value:function(css){
					if(document.head) {
						var v=document.createElement('style');
						v.innerHTML=css;
						document.head.appendChild(v);
						return v;
					}
				}},
				GM_log:{value:function(d){console.log(d);}},
				GM_openInTab:{value:function(url){
					var a=document.createElement('a');
					a.href=url;a.target='_blank';a.click();
				}},
				GM_registerMenuCommand:{value:function(cap,func,acc){
					comm.command[cap]=func;comm.post({cmd:'RegisterMenu',data:[cap,acc]});
				}},
				GM_notification:{value:function(msg,title,callback,more){
					msg={body:msg};more=more||{};
					var n=more.icon||c.meta.icon;if(n) msg.icon=n;
					n=new Notification(title,msg);n.onclick=callback;
					if(more.onclose) n.onclose=more.onclose;
					setTimeout(function(){n.close();},more.timeout||5000);
				}},
				GM_xmlhttpRequest:{value:function(details){
					return Request(details);
				}},
			};
			comm.forEach(g,function(i){var o=gf[i];if(o) addProperty(i,o,gm);});
			return gm;
		}
		function run(l){while(l.length) runCode(l.shift());}
		function runCode(c){
			var req=c.meta.require||[],i,r=[],code=[],w=wrapGM(c);
			comm.forEach(Object.getOwnPropertyNames(w),function(i){r.push(i+'=g["'+i+'"]');});
			if(r.length) code.push('var '+r.join(',')+';delete g;with(this)(function(){');
			for(i=0;i<req.length;i++) if(r=require[req[i]]) code.push(r);
			code.push('(function(){'+c.code+'\n}).call(this);');	// to make 'use strict' work
			code.push('}).call(this);');code=code.join('\n');
			try{
				(new Function('g',code)).call(w.window,w);
			}catch(e){
				console.log('Error running script: '+(c.custom.name||c.meta.name||c.id)+'\n'+e.message);
			}
		}
		comm.load=function(){run(end);run(idle);};
		comm.checkLoad=function(){
			if(!comm.state&&comm.inArray(['interactive','complete'],document.readyState)) comm.state=1;
			if(comm.state) comm.load();
		};

		require=o.require;
		cache=o.cache;
		values=o.values;
		comm.forEach(o.scripts,function(i,l){
			if(i&&i.enabled) {
				switch(i.custom['run-at']||i.meta['run-at']){
					case 'document-start': l=start;break;
					case 'document-idle': l=idle;break;
					default: l=end;
				}
				l.push(i);
			}
		});
		run(start);comm.checkLoad();
	},
},menu=[],ids=[],total=0;
function handleC(e){
	var o=JSON.parse(e.attrName),maps={
		SetValue:function(o){post('Background',{cmd:'SetValue',data:o});},
		RegisterMenu:function(o){menu.push(o);updatePopup();},
		GetRequestId:getRequestId,
		HttpRequest:httpRequest,
		AbortRequest:abortRequest,
	},f=maps[o.cmd];
	if(f) f(o.data);
}
function command(o){
	comm.post({cmd:'Command',data:o});
}

// Requests
var requests={};
function getRequestId() {
  var id=Date.now()+Math.random().toString().slice(1);
  requests[id]=new XMLHttpRequest();
	comm.post({cmd:'GotRequestId',data:id});
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
		var data={
			readyState: req.readyState,
			responseHeaders: req.getAllResponseHeaders(),
			status: req.status,
			statusText: req.statusText
		},r;
		try {
			data.responseText=req.responseText;
		} catch(e) {}
		if(req.response&&req.responseType=='blob') {
			r=new FileReader();
			r.onload=function(e){
				data.response=r.result;
				finish();
			};
			r.readAsDataURL(req.response);
		} else {	// default `null` for blob and '' for text
			data.response=req.response;
			finish();
		}
  }
  var i,req;
  if(details.id) req=requests[details.id]; else req=new XMLHttpRequest();
  try {
		// details.async=true;
    req.open(details.method,details.url,true,details.user,details.password);
    if(details.headers)
			for(i in details.headers) req.setRequestHeader(i,details.headers[i]);
		if(details.responseType) req.responseType='blob';
    if(details.overrideMimeType) req.overrideMimeType(details.overrideMimeType);
    ['abort','error','load','loadend','progress','readystatechange','timeout'].forEach(function(i) {
      req['on'+i]=callback;
    });
    req.send(details.data);
  } catch (e) {
		console.log(e);
  }
}
function abortRequest(id) {
  var req=requests[id];
  if(req) req.abort();
  delete requests[id];
}

// For injected scripts
function objEncode(o){
	var t=[],i;
	for(i in o) {
		if(!o.hasOwnProperty(i)) continue;
		if(typeof o[i]=='function') t.push(i+':'+o[i].toString());
		else t.push(i+':'+JSON.stringify(o[i]));
	}
	return '{'+t.join(',')+'}';
}
function initCommunicator(){
	var s=document.createElement('script'),d=document.documentElement,C='C',R='R';
	s.innerHTML='('+(function(c,R,C){
		c.init(R,C);
		document.addEventListener("DOMContentLoaded",function(e){
			c.state=1;c.load();
		},false);
		c.checkLoad();
	}).toString()+')('+objEncode(comm)+',"'+R+'","'+C+'")';
	d.appendChild(s);d.removeChild(s);
	comm.handleC=handleC;comm.init(C,R);
	post('Background',{cmd:'GetInjected'},loadScript);
}
function loadScript(o){
	o.scripts.forEach(function(i){
		ids.push(i.id);if(i.enabled) total++;
	});
	comm.post({cmd:'LoadScript',data:o});
}
initCommunicator();

var popup=0;
function updatePopup(){
	popup++;
	setTimeout(function(){
		if(!--popup) post('Popup',{cmd:'GetPopup'});
	},100);
}
function updateBadge(){post('Background',{cmd:'GetBadge'});}
window.setPopup=function(){post('Popup',{cmd:'SetPopup',data:[menu,ids]});};
window.setBadge=function(){post('Background',{cmd:'SetBadge',data:total});};
document.addEventListener("DOMContentLoaded",updatePopup,false);
document.addEventListener("DOMContentLoaded",updateBadge,false);

// For installation
function checkJS() {
	if(document&&document.body) {
		if(!document.querySelector('title'))	// plain text
			post('Background',{cmd:'InstallScript',data:location.href},function(){
				if(history.length>1) history.go(-1);
				else window.close();
			});
		return true;
	}
}
if(/\.user\.js$/.test(location.pathname))
	checkJS()||document.addEventListener('DOMContentLoaded',checkJS,false);
})();
