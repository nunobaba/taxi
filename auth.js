var sys = require('sys'),
    http = require('http'),
    crypto = require('crypto'),
    qstr = require('querystring'),
    url = require('url'),
    uuid = require('./uuidgen'),
    web = require('./web');

var services = {
  twitter: {
    host: 'twitter.com', 
    requestTokenPath: '/oauth/request_token',
    accessTokenPath: 'https://twitter.com/oauth/access_token',
    deputy: http.createClient(80, 'twitter.com'),
  },
};

/**
 * Connect to OAuth service provider and collect access and request tokens
 * To get it run properly, a callback handler has to be build
 * When access tokens are granted, a secure cookie is stored
 * The secure cookie includes the user name and unique id
 *
 * @param {sname:String} name of the service provider
 * @param {setting:Object} contains service parameters
 * @param {res:Object} handle server response
 */
var handshake = exports.handshake = function(sname, setting, res) {
  var service = services[sname],
      query = (arguments[3]) ? url.parse(arguments[3].url, true).query : {},
      nonce = crypto.createHash('sha1').update(uuid.uuid()).digest('hex'),
      ctime = new Date();
  var payload = { oauth_consumer_key: setting.consumerKey
                , oauth_nonce: nonce
                , oauth_signature_method: 'HMAC-SHA1'
                , oauth_timestamp: ctime.getTime()
                , oauth_version: '1.0'
                },
      signatureKey = setting.consumerSecret + '&' + (query.oauth_token_secret || '');
  if (query.oauth_token) 
    payload.oauth_token = query.oauth_token;
  var baseStr = [ 'GET'
                , qstr.escape('http://' + service.host + ((query.oauth_token) ? service.accessTokenPath : service.requestTokenPath))
                , qstr.escape(qstr.stringify(payload))
                ].join('&');
  var token = { realm: ''
              , oauth_nonce: nonce
              , oauth_timestamp: ctime.getTime()
              , oauth_consumer_key: setting.consumerKey
              , oauth_signature_method: 'HMAC-SHA1'
              , oauth_version: '1.0'
              , oauth_signature: crypto.createHmac('sha1', signatureKey).update(baseStr).digest('base64')
              };
  if (query.oauth_token) 
    token.oauth_token = query.oauth_token;
  var headers = { host: service.host
                , Authorization: 'OAuth ' + qstr.stringify(token, '", ', '="') + '"' 
                };

  // Sending the request through the http deputy client
  if (query.oauth_token) {
    var _req = service.deputy.request('GET', service.accessTokenPath, headers);
    _req.addListener('response', function(_res) {
      var user;
      _res.addListener('data', function(data) {
        // setting cookie
        user = qstr.parse(data+'');
        var cookieVal = qstr.stringify({uid: user.user_id, nickname: user.screen_name});
        res = web.setSecureCookie('traduwiki', cookieVal, setting.cookieSecret, res);
      });
      _res.addListener('end', function() {
        web.redirect(res, '/');
      });
    });
  } else {
    var _req = service.deputy.request('GET', service.requestTokenPath, headers);
    _req.addListener('response', function(_res) {
      var ctoken;
      _res.addListener('data', function(data) {
        ctoken = qstr.parse(data+'');
      });
      _res.addListener('end', function() {
        web.redirect(res, url.format({ protocol: 'https:'
                                     , host: 'twitter.com'
                                     , pathname: 'oauth/authorize'
                                     , query: { oauth_token: ctoken.oauth_token
                                              , oauth_callback: setting.callback
                                              }
                                     })
        );
      });
    });
  };
  _req.end();
};
