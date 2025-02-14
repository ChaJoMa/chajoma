/* */ 
var Emitter = require("events").EventEmitter;
var parser = require("socket.io-parser");
var url = require("url");
var debug = require("debug")('socket.io:socket');
var hasBin = require("has-binary-data");
module.exports = exports = Socket;
exports.events = ['error', 'connect', 'disconnect', 'newListener', 'removeListener'];
var flags = ['json', 'volatile', 'broadcast'];
var emit = Emitter.prototype.emit;
function Socket(nsp, client) {
  this.nsp = nsp;
  this.server = nsp.server;
  this.adapter = this.nsp.adapter;
  this.id = client.id;
  this.request = client.request;
  this.client = client;
  this.conn = client.conn;
  this.rooms = [];
  this.acks = {};
  this.connected = true;
  this.disconnected = false;
  this.handshake = this.buildHandshake();
}
Socket.prototype.__proto__ = Emitter.prototype;
flags.forEach(function(flag) {
  Socket.prototype.__defineGetter__(flag, function() {
    this.flags = this.flags || {};
    this.flags[flag] = true;
    return this;
  });
});
Socket.prototype.__defineGetter__('request', function() {
  return this.conn.request;
});
Socket.prototype.buildHandshake = function() {
  return {
    headers: this.request.headers,
    time: (new Date) + '',
    address: this.conn.remoteAddress,
    xdomain: !!this.request.headers.origin,
    secure: !!this.request.connection.encrypted,
    issued: +(new Date),
    url: this.request.url,
    query: url.parse(this.request.url, true).query || {}
  };
};
Socket.prototype.emit = function(ev) {
  if (~exports.events.indexOf(ev)) {
    emit.apply(this, arguments);
  } else {
    var args = Array.prototype.slice.call(arguments);
    var packet = {};
    packet.type = hasBin(args) ? parser.BINARY_EVENT : parser.EVENT;
    packet.data = args;
    if ('function' == typeof args[args.length - 1]) {
      if (this._rooms || (this.flags && this.flags.broadcast)) {
        throw new Error('Callbacks are not supported when broadcasting');
      }
      debug('emitting packet with ack id %d', this.nsp.ids);
      this.acks[this.nsp.ids] = args.pop();
      packet.id = this.nsp.ids++;
    }
    if (this._rooms || (this.flags && this.flags.broadcast)) {
      this.adapter.broadcast(packet, {
        except: [this.id],
        rooms: this._rooms,
        flags: this.flags
      });
    } else {
      this.packet(packet);
    }
    delete this._rooms;
    delete this.flags;
  }
  return this;
};
Socket.prototype.to = Socket.prototype.in = function(name) {
  this._rooms = this._rooms || [];
  if (!~this._rooms.indexOf(name))
    this._rooms.push(name);
  return this;
};
Socket.prototype.send = Socket.prototype.write = function() {
  var args = Array.prototype.slice.call(arguments);
  args.unshift('message');
  this.emit.apply(this, args);
  return this;
};
Socket.prototype.packet = function(packet, preEncoded) {
  packet.nsp = this.nsp.name;
  var volatile = this.flags && this.flags.volatile;
  this.client.packet(packet, preEncoded, volatile);
};
Socket.prototype.join = function(room, fn) {
  debug('joining room %s', room);
  var self = this;
  if (~this.rooms.indexOf(room))
    return this;
  this.adapter.add(this.id, room, function(err) {
    if (err)
      return fn && fn(err);
    debug('joined room %s', room);
    self.rooms.push(room);
    fn && fn(null);
  });
  return this;
};
Socket.prototype.leave = function(room, fn) {
  debug('leave room %s', room);
  var self = this;
  this.adapter.del(this.id, room, function(err) {
    if (err)
      return fn && fn(err);
    debug('left room %s', room);
    var idx = self.rooms.indexOf(room);
    if (idx >= 0) {
      self.rooms.splice(idx, 1);
    }
    fn && fn(null);
  });
  return this;
};
Socket.prototype.leaveAll = function() {
  this.adapter.delAll(this.id);
  this.rooms = [];
};
Socket.prototype.onconnect = function() {
  debug('socket connected - writing packet');
  this.join(this.id);
  this.packet({type: parser.CONNECT});
  this.nsp.connected[this.id] = this;
};
Socket.prototype.onpacket = function(packet) {
  debug('got packet %j', packet);
  switch (packet.type) {
    case parser.EVENT:
      this.onevent(packet);
      break;
    case parser.BINARY_EVENT:
      this.onevent(packet);
      break;
    case parser.ACK:
      this.onack(packet);
      break;
    case parser.BINARY_ACK:
      this.onack(packet);
      break;
    case parser.DISCONNECT:
      this.ondisconnect();
      break;
    case parser.ERROR:
      this.emit('error', packet.data);
  }
};
Socket.prototype.onevent = function(packet) {
  var args = packet.data || [];
  debug('emitting event %j', args);
  if (null != packet.id) {
    debug('attaching ack callback to event');
    args.push(this.ack(packet.id));
  }
  emit.apply(this, args);
};
Socket.prototype.ack = function(id) {
  var self = this;
  var sent = false;
  return function() {
    if (sent)
      return;
    var args = Array.prototype.slice.call(arguments);
    debug('sending ack %j', args);
    var type = hasBin(args) ? parser.BINARY_ACK : parser.ACK;
    self.packet({
      id: id,
      type: type,
      data: args
    });
  };
};
Socket.prototype.onack = function(packet) {
  var ack = this.acks[packet.id];
  if ('function' == typeof ack) {
    debug('calling ack %s with %j', packet.id, packet.data);
    ack.apply(this, packet.data);
    delete this.acks[packet.id];
  } else {
    debug('bad ack %s', packet.id);
  }
};
Socket.prototype.ondisconnect = function() {
  debug('got disconnect packet');
  this.onclose('client namespace disconnect');
};
Socket.prototype.onerror = function(err) {
  if (this.listeners('error').length) {
    this.emit('error', err);
  } else {
    console.error('Missing error handler on `socket`.');
    console.error(err.stack);
  }
};
Socket.prototype.onclose = function(reason) {
  if (!this.connected)
    return this;
  debug('closing socket - reason %s', reason);
  this.leaveAll();
  this.nsp.remove(this);
  this.client.remove(this);
  this.connected = false;
  this.disconnected = true;
  delete this.nsp.connected[this.id];
  this.emit('disconnect', reason);
};
Socket.prototype.error = function(err) {
  this.packet({
    type: parser.ERROR,
    data: err
  });
};
Socket.prototype.disconnect = function(close) {
  if (!this.connected)
    return this;
  if (close) {
    this.client.disconnect();
  } else {
    this.packet({type: parser.DISCONNECT});
    this.onclose('server namespace disconnect');
  }
  return this;
};
