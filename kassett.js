var sys = require('sys'),
    mongo = require('mongodb'),
    $id = require('mongodb/bson/bson').ObjectID,
    memcache = require('memcachejs/memcache');


/**
 * Building a simple object to simplify the native MongoDB interface
 * Constructor fetches collection counters to provide 
 * a quick key scheme to new document in collections
 * 
 * @param {dbName:String} name of the main db collection
 * @option {host:String} name of the mongodb host
 * @option {port:String} port of the db server
 * @option {serverOptions:String} options for the db server
 * @option {clientOptions:String} options for the db client
 * @return {Db:Object}
 */
var Kassett = exports.Kassett = function (dbName, host, port, serverOptions, clientOptions) {
  if (!dbName) {
    sys.log('Database name missing');
    return;
  }
  var host = host || 'localhost',
      port = port || '27017',
      serverOptions = serverOptions || {},
      clientOptions = clientOptions || {},
      _ = this;
  _.server = new mongo.Server(host, port, serverOptions);
  _.client = new mongo.Db(dbName, _.server, clientOptions);
  _.client.open(function (err, db) { 
    _.db = db;

//    DEV: PROVIDING CUSTOM ID SCHEME
//    _.db.counters = {step: 1};
//    _.db.collection('counters', function (err, coll) {
//      coll.find(function (err, curs) {
//        curs.toArray(function (err, its) {
//          its.forEach(function (it) {
//            _.db.counters[it._id] = range(it.count, it.count + _.db.counters.step);
//          });
//        });
//      });
//      coll.update({}, {$inc: {count: 1}}, {multi: true}, function () {});
//    });
  });
  _.mc = new memcache();
};

Kassett.prototype.findById = function (collName, id, act) {
  var _ = this;
  var ks = (id instanceof Array) ? id : new Array(id);

  _.mc.get({
    'keys': ks,
    'act': function (it) { 
      return act.call(this, it); 
    },
    'err': function (k) {
      _.db.collection(collName, function (err, coll) {
        coll.findOne({'_id': $id(k)}, function (err, it) {
          act(it);
          _.mc.set([collName, k].join('/'), it);
        });
      });
    },
  });
};

Kassett.prototype.findUpdate = function (collName, query, update, cb) {
  this.db.collection(collName, function (err, coll) {
    coll.findAndModify(query, {}, update, function (err, it) {
      cb(it);
    });
  });
};

Kassett.prototype.put = function (collName, doc, act) {
  this.db.collection(collName, function (err, coll) {
    coll.save(doc, {}, act ? act : function(){});
  });
};

Kassett.prototype.find = function (collName, query, act) {
  var _ = this;
  var qkey = [collName, JSON.stringify(query)].join('/');
  _.mc.get({
    'key': qkey,
    'act': function (it) {
      _.findById(collName, it, act);
    },
    'err': function () {
      _.db.collection(collName, function (err, coll) {
        coll.find(query, function (err, curs) {
          curs.toArray(function (err, its) {
            var payload = new Object, 
                keys = new Array;
            its.forEach(function (it) {
              var id = collName + '/' + it._id.toHexString();
              act(it);
              payload[id] = it;
              keys.push(id);
            });
            payload[collName + '/' + JSON.stringify(query)] = keys;
            _.mc.set(payload);
          });
        });
      });
    },
  });
};

/**
 * Save a new item into a collection
 * eventually refresh key generators with new keys
 *
 * @param {coll:String} collection name
 * @param {doc:Object} new item to save
 * @return {isInserted:Boolean} result of operation
 */
Kassett.prototype.inject = function (collName, doc) {
  var _ = this;
  doc._id = !doc._id ? _.db.counters[collName].shift() : doc._id;
  _.db.collection(collName, function(err, coll) {
    coll.save(doc, {}, function () {});
  });
  if (!_.db.counters[collName].length) 
    _.db.collection('notes', function (err, coll) {
      coll.findAndModify({'_id': 1}, [], {$inc: {count: 1}}, function(){});
    });
};

/**
 * Generate an array and populate it with integers
 * @return {arr:Array}
 */
function range(start, end, step) {
  var arr = new Array, i = start, k = 0, step = step ? step : 1;
  while (i < end) {
    arr[k++] = i;
    i += step;
  };
  return arr;
};



//--TESTING--

var db = new Kassett('datastore');

setTimeout(function () {
  var keys = ['4c28bbd850a554c22ef40d4a', '4c28bbd850a554c22ef40d4b'];

  //db.findById('docs', '4c2f9226882bb48618000001', function (it) { sys.puts(it._id) });
  db.find('notes', {lang: 'fr'}, function (it) { sys.puts(it._id) });
}, 8);




