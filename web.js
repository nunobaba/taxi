var nun = require('nun'),
    qstr = require('querystring'),
    crypto = require('crypto'),
    uuid = require('./uuidgen'),
    b64 = require('./base64');


/**
 * Parse cookie simply by segmenting the string in server request
 * @return {cookies:Object} whose properties match transmitted cookies
 */
var parseCookie = exports.parseCookie = function(req) {
  if ('cookie' in req.headers) {
    var cookies = new Object;
    var ss = req.headers.cookie.split(';');
    var i = ss.length;
    while (ss[--i]) {
      var s = ss[i];
      var j = s.indexOf('=');
      cookies[s.slice(0,j).trim()] = s.slice(j+1).trim();
    }
    return cookies;
  }
  return undefined;
};

var urlCure = exports.urlCure = function (s) {
  return s.replace(/^\s*|[^\d\w\s]|\s*$/gi, '').split(' ').join('+').toLowerCase();
};

/**
 * Build a render object with appropriate directory path
 * @param {dirPath:string}
 */
var Renderer = exports.Renderer = function(settings) {
  this.skinDir = settings.skinDir;
};

/**
 * Flush template rendered into ServerResponse
 * XSRF available through a variable in the context Zoo
 * @param {tplName:String}
 * @param {zoo:Object} containing context variables to render
 * @param {res:Object} server response
 * @optional {req:Object} server request triggering XSRF enhancement
 */
Renderer.prototype.render = function(tplName, zoo, res) {
  if (arguments.length == 4) {
    res = xsrfToken(arguments[3], res);
    zoo.xsrf = '<input type="hidden" name="xsrf" value="' + res._xsrf + '"/>';
  }
  nun.render(this.skinDir + tplName, zoo, {cache: false, filters: this.filters}, function(err, chew) {
    if (err) throw err;
    res.writeHead(200, res._headers);
    chew.addListener('data', function(data) { res.write(data) })
        .addListener('end', function() { res.end() });
  });
};

/**
 * Decorator function detecting user authentication status
 * It checks the cookie transmitted in headers of the ServerRequest object
 * If cookie is missing, it creates a local property bound to ServerResponse object
 */
var xsrfToken = function(req, res) {
  var cookies = parseCookie(req); 
  if ('_xsrf' in cookies) {
    _xsrf = cookies['_xsrf'];
  } else {
    var hash = crypto.createHash('md5'),
        expireTime = new Date();
    expireTime.setMonth(expireTime.getMonth() + 1);
    hash.update(uuid.uuid());
    _xsrf = hash.digest('hex');
    res._headers['Set-cookie'] = '_xsrf=' + _xsrf + ';expires=' + String(expireTime);
  }
  res._xsrf = _xsrf;
  return res;
};

var redirect = exports.redirect = function(res, url) {
  res._headers['Location'] = url;
  res.writeHead(302, res._headers);
  res.end();
};

/**
 * Set a secure cookie with an expiration time fixed at one month
 *
 * @param {name:String} name of the cookie
 * @param {value:String} value of the cookie in plain text
 * @param {cookieSecret:String} to build the hmac
 * @param {res:Object} server response
 */
var setSecureCookie = exports.setSecureCookie = function(name, value, cookieSecret, res) {
  var timestamp = new Date(),
      value = b64.encode(value),
      signature;
  timestamp.setMonth(timestamp.getMonth() + 1);
  signature = crypto.createHmac('sha1', cookieSecret).update(value + timestamp.getTime()).digest('hex');
  value = [value, timestamp.getTime(), signature].join('|');
  res._headers['Set-cookie'] = [ [name, value].join('=')
                               , ['expires', timestamp+''].join('=')
                               , ['path', '/'].join('=')
                               ].join(';');
  return res;
};

/**
 * Parse and decode secure cookie
 * @return {cookie:Object} containing user identifier and nickname
 */
var getSecureCookie = function(settings, cookie) {
  var its = cookie.split('|');
  if (its.length !== 3) return;
  var signature = crypto.createHmac('sha1', settings.cookieSecret).update(its[0] + its[1]).digest('hex');
  if (signature !== its[2]) return;
  var dt = (new Date()) - (new Date(its[1]));
  if (dt > 0) return;
  return qstr.parse(b64.decode(its[0]));
};


var isAuthenticated = exports.isAuthenticated = function(settings, req, res) {
  var cookieName = 'traduwiki',
      cookies = parseCookie(req);
  if (!cookies || !(cookieName in cookies)) 
    return redirect(res, settings.loginUrl + '?redirect=' + req.url);
  var c = getSecureCookie(settings, cookies[cookieName]);
};

