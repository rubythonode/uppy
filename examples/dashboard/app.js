(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = dragDrop

var flatten = require('flatten')
var parallel = require('run-parallel')

function dragDrop (elem, listeners) {
  if (typeof elem === 'string') {
    var selector = elem
    elem = window.document.querySelector(elem)
    if (!elem) {
      throw new Error('"' + selector + '" does not match any HTML elements')
    }
  }

  if (!elem) {
    throw new Error('"' + elem + '" is not a valid HTML element')
  }

  if (typeof listeners === 'function') {
    listeners = { onDrop: listeners }
  }

  var timeout

  elem.addEventListener('dragenter', onDragEnter, false)
  elem.addEventListener('dragover', onDragOver, false)
  elem.addEventListener('dragleave', onDragLeave, false)
  elem.addEventListener('drop', onDrop, false)

  // Function to remove drag-drop listeners
  return function remove () {
    removeDragClass()
    elem.removeEventListener('dragenter', onDragEnter, false)
    elem.removeEventListener('dragover', onDragOver, false)
    elem.removeEventListener('dragleave', onDragLeave, false)
    elem.removeEventListener('drop', onDrop, false)
  }

  function onDragEnter (e) {
    if (listeners.onDragEnter) {
      listeners.onDragEnter(e)
    }

    // Prevent event
    e.stopPropagation()
    e.preventDefault()
    return false
  }

  function onDragOver (e) {
    e.stopPropagation()
    e.preventDefault()
    if (e.dataTransfer.items) {
      // Only add "drag" class when `items` contains items that are able to be
      // handled by the registered listeners (files vs. text)
      var items = toArray(e.dataTransfer.items)
      var fileItems = items.filter(function (item) { return item.kind === 'file' })
      var textItems = items.filter(function (item) { return item.kind === 'string' })

      if (fileItems.length === 0 && !listeners.onDropText) return
      if (textItems.length === 0 && !listeners.onDrop) return
      if (fileItems.length === 0 && textItems.length === 0) return
    }

    elem.classList.add('drag')
    clearTimeout(timeout)

    if (listeners.onDragOver) {
      listeners.onDragOver(e)
    }

    e.dataTransfer.dropEffect = 'copy'
    return false
  }

  function onDragLeave (e) {
    e.stopPropagation()
    e.preventDefault()

    if (listeners.onDragLeave) {
      listeners.onDragLeave(e)
    }

    clearTimeout(timeout)
    timeout = setTimeout(removeDragClass, 50)

    return false
  }

  function onDrop (e) {
    e.stopPropagation()
    e.preventDefault()

    if (listeners.onDragLeave) {
      listeners.onDragLeave(e)
    }

    clearTimeout(timeout)
    removeDragClass()

    var pos = {
      x: e.clientX,
      y: e.clientY
    }

    // text drop support
    var text = e.dataTransfer.getData('text')
    if (text && listeners.onDropText) {
      listeners.onDropText(text, pos)
    }

    // file drop support
    if (e.dataTransfer.items) {
      // Handle directories in Chrome using the proprietary FileSystem API
      var items = toArray(e.dataTransfer.items).filter(function (item) {
        return item.kind === 'file'
      })

      if (items.length === 0) return

      parallel(items.map(function (item) {
        return function (cb) {
          processEntry(item.webkitGetAsEntry(), cb)
        }
      }), function (err, results) {
        // This catches permission errors with file:// in Chrome. This should never
        // throw in production code, so the user does not need to use try-catch.
        if (err) throw err
        if (listeners.onDrop) {
          listeners.onDrop(flatten(results), pos)
        }
      })
    } else {
      var files = toArray(e.dataTransfer.files)

      if (files.length === 0) return

      files.forEach(function (file) {
        file.fullPath = '/' + file.name
      })

      if (listeners.onDrop) {
        listeners.onDrop(files, pos)
      }
    }

    return false
  }

  function removeDragClass () {
    elem.classList.remove('drag')
  }
}

function processEntry (entry, cb) {
  var entries = []

  if (entry.isFile) {
    entry.file(function (file) {
      file.fullPath = entry.fullPath  // preserve pathing for consumer
      cb(null, file)
    }, function (err) {
      cb(err)
    })
  } else if (entry.isDirectory) {
    var reader = entry.createReader()
    readEntries()
  }

  function readEntries () {
    reader.readEntries(function (entries_) {
      if (entries_.length > 0) {
        entries = entries.concat(toArray(entries_))
        readEntries() // continue reading entries until `readEntries` returns no more
      } else {
        doneEntries()
      }
    })
  }

  function doneEntries () {
    parallel(entries.map(function (entry) {
      return function (cb) {
        processEntry(entry, cb)
      }
    }), cb)
  }
}

function toArray (list) {
  return Array.prototype.slice.call(list || [], 0)
}

},{"flatten":2,"run-parallel":3}],2:[function(require,module,exports){
module.exports = function flatten(list, depth) {
  depth = (typeof depth == 'number') ? depth : Infinity;

  if (!depth) {
    if (Array.isArray(list)) {
      return list.map(function(i) { return i; });
    }
    return list;
  }

  return _flatten(list, 1);

  function _flatten(list, d) {
    return list.reduce(function (acc, item) {
      if (Array.isArray(item) && d < depth) {
        return acc.concat(_flatten(item, d + 1));
      }
      else {
        return acc.concat(item);
      }
    }, []);
  }
};

},{}],3:[function(require,module,exports){
(function (process){
module.exports = function (tasks, cb) {
  var results, pending, keys
  var isSync = true

  if (Array.isArray(tasks)) {
    results = []
    pending = tasks.length
  } else {
    keys = Object.keys(tasks)
    results = {}
    pending = keys.length
  }

  function done (err) {
    function end () {
      if (cb) cb(err, results)
      cb = null
    }
    if (isSync) process.nextTick(end)
    else end()
  }

  function each (i, err, result) {
    results[i] = result
    if (--pending === 0 || err) {
      done(err)
    }
  }

  if (!pending) {
    // empty
    done(null)
  } else if (keys) {
    // object
    keys.forEach(function (key) {
      tasks[key](function (err, result) { each(key, err, result) })
    })
  } else {
    // array
    tasks.forEach(function (task, i) {
      task(function (err, result) { each(i, err, result) })
    })
  }

  isSync = false
}

}).call(this,require('_process'))

},{"_process":75}],4:[function(require,module,exports){
(function (process,global){
/*!
 * @overview es6-promise - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/jakearchibald/es6-promise/master/LICENSE
 * @version   3.2.1
 */

(function() {
    "use strict";
    function lib$es6$promise$utils$$objectOrFunction(x) {
      return typeof x === 'function' || (typeof x === 'object' && x !== null);
    }

    function lib$es6$promise$utils$$isFunction(x) {
      return typeof x === 'function';
    }

    function lib$es6$promise$utils$$isMaybeThenable(x) {
      return typeof x === 'object' && x !== null;
    }

    var lib$es6$promise$utils$$_isArray;
    if (!Array.isArray) {
      lib$es6$promise$utils$$_isArray = function (x) {
        return Object.prototype.toString.call(x) === '[object Array]';
      };
    } else {
      lib$es6$promise$utils$$_isArray = Array.isArray;
    }

    var lib$es6$promise$utils$$isArray = lib$es6$promise$utils$$_isArray;
    var lib$es6$promise$asap$$len = 0;
    var lib$es6$promise$asap$$vertxNext;
    var lib$es6$promise$asap$$customSchedulerFn;

    var lib$es6$promise$asap$$asap = function asap(callback, arg) {
      lib$es6$promise$asap$$queue[lib$es6$promise$asap$$len] = callback;
      lib$es6$promise$asap$$queue[lib$es6$promise$asap$$len + 1] = arg;
      lib$es6$promise$asap$$len += 2;
      if (lib$es6$promise$asap$$len === 2) {
        // If len is 2, that means that we need to schedule an async flush.
        // If additional callbacks are queued before the queue is flushed, they
        // will be processed by this flush that we are scheduling.
        if (lib$es6$promise$asap$$customSchedulerFn) {
          lib$es6$promise$asap$$customSchedulerFn(lib$es6$promise$asap$$flush);
        } else {
          lib$es6$promise$asap$$scheduleFlush();
        }
      }
    }

    function lib$es6$promise$asap$$setScheduler(scheduleFn) {
      lib$es6$promise$asap$$customSchedulerFn = scheduleFn;
    }

    function lib$es6$promise$asap$$setAsap(asapFn) {
      lib$es6$promise$asap$$asap = asapFn;
    }

    var lib$es6$promise$asap$$browserWindow = (typeof window !== 'undefined') ? window : undefined;
    var lib$es6$promise$asap$$browserGlobal = lib$es6$promise$asap$$browserWindow || {};
    var lib$es6$promise$asap$$BrowserMutationObserver = lib$es6$promise$asap$$browserGlobal.MutationObserver || lib$es6$promise$asap$$browserGlobal.WebKitMutationObserver;
    var lib$es6$promise$asap$$isNode = typeof self === 'undefined' && typeof process !== 'undefined' && {}.toString.call(process) === '[object process]';

    // test for web worker but not in IE10
    var lib$es6$promise$asap$$isWorker = typeof Uint8ClampedArray !== 'undefined' &&
      typeof importScripts !== 'undefined' &&
      typeof MessageChannel !== 'undefined';

    // node
    function lib$es6$promise$asap$$useNextTick() {
      // node version 0.10.x displays a deprecation warning when nextTick is used recursively
      // see https://github.com/cujojs/when/issues/410 for details
      return function() {
        process.nextTick(lib$es6$promise$asap$$flush);
      };
    }

    // vertx
    function lib$es6$promise$asap$$useVertxTimer() {
      return function() {
        lib$es6$promise$asap$$vertxNext(lib$es6$promise$asap$$flush);
      };
    }

    function lib$es6$promise$asap$$useMutationObserver() {
      var iterations = 0;
      var observer = new lib$es6$promise$asap$$BrowserMutationObserver(lib$es6$promise$asap$$flush);
      var node = document.createTextNode('');
      observer.observe(node, { characterData: true });

      return function() {
        node.data = (iterations = ++iterations % 2);
      };
    }

    // web worker
    function lib$es6$promise$asap$$useMessageChannel() {
      var channel = new MessageChannel();
      channel.port1.onmessage = lib$es6$promise$asap$$flush;
      return function () {
        channel.port2.postMessage(0);
      };
    }

    function lib$es6$promise$asap$$useSetTimeout() {
      return function() {
        setTimeout(lib$es6$promise$asap$$flush, 1);
      };
    }

    var lib$es6$promise$asap$$queue = new Array(1000);
    function lib$es6$promise$asap$$flush() {
      for (var i = 0; i < lib$es6$promise$asap$$len; i+=2) {
        var callback = lib$es6$promise$asap$$queue[i];
        var arg = lib$es6$promise$asap$$queue[i+1];

        callback(arg);

        lib$es6$promise$asap$$queue[i] = undefined;
        lib$es6$promise$asap$$queue[i+1] = undefined;
      }

      lib$es6$promise$asap$$len = 0;
    }

    function lib$es6$promise$asap$$attemptVertx() {
      try {
        var r = require;
        var vertx = r('vertx');
        lib$es6$promise$asap$$vertxNext = vertx.runOnLoop || vertx.runOnContext;
        return lib$es6$promise$asap$$useVertxTimer();
      } catch(e) {
        return lib$es6$promise$asap$$useSetTimeout();
      }
    }

    var lib$es6$promise$asap$$scheduleFlush;
    // Decide what async method to use to triggering processing of queued callbacks:
    if (lib$es6$promise$asap$$isNode) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useNextTick();
    } else if (lib$es6$promise$asap$$BrowserMutationObserver) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useMutationObserver();
    } else if (lib$es6$promise$asap$$isWorker) {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useMessageChannel();
    } else if (lib$es6$promise$asap$$browserWindow === undefined && typeof require === 'function') {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$attemptVertx();
    } else {
      lib$es6$promise$asap$$scheduleFlush = lib$es6$promise$asap$$useSetTimeout();
    }
    function lib$es6$promise$then$$then(onFulfillment, onRejection) {
      var parent = this;

      var child = new this.constructor(lib$es6$promise$$internal$$noop);

      if (child[lib$es6$promise$$internal$$PROMISE_ID] === undefined) {
        lib$es6$promise$$internal$$makePromise(child);
      }

      var state = parent._state;

      if (state) {
        var callback = arguments[state - 1];
        lib$es6$promise$asap$$asap(function(){
          lib$es6$promise$$internal$$invokeCallback(state, child, callback, parent._result);
        });
      } else {
        lib$es6$promise$$internal$$subscribe(parent, child, onFulfillment, onRejection);
      }

      return child;
    }
    var lib$es6$promise$then$$default = lib$es6$promise$then$$then;
    function lib$es6$promise$promise$resolve$$resolve(object) {
      /*jshint validthis:true */
      var Constructor = this;

      if (object && typeof object === 'object' && object.constructor === Constructor) {
        return object;
      }

      var promise = new Constructor(lib$es6$promise$$internal$$noop);
      lib$es6$promise$$internal$$resolve(promise, object);
      return promise;
    }
    var lib$es6$promise$promise$resolve$$default = lib$es6$promise$promise$resolve$$resolve;
    var lib$es6$promise$$internal$$PROMISE_ID = Math.random().toString(36).substring(16);

    function lib$es6$promise$$internal$$noop() {}

    var lib$es6$promise$$internal$$PENDING   = void 0;
    var lib$es6$promise$$internal$$FULFILLED = 1;
    var lib$es6$promise$$internal$$REJECTED  = 2;

    var lib$es6$promise$$internal$$GET_THEN_ERROR = new lib$es6$promise$$internal$$ErrorObject();

    function lib$es6$promise$$internal$$selfFulfillment() {
      return new TypeError("You cannot resolve a promise with itself");
    }

    function lib$es6$promise$$internal$$cannotReturnOwn() {
      return new TypeError('A promises callback cannot return that same promise.');
    }

    function lib$es6$promise$$internal$$getThen(promise) {
      try {
        return promise.then;
      } catch(error) {
        lib$es6$promise$$internal$$GET_THEN_ERROR.error = error;
        return lib$es6$promise$$internal$$GET_THEN_ERROR;
      }
    }

    function lib$es6$promise$$internal$$tryThen(then, value, fulfillmentHandler, rejectionHandler) {
      try {
        then.call(value, fulfillmentHandler, rejectionHandler);
      } catch(e) {
        return e;
      }
    }

    function lib$es6$promise$$internal$$handleForeignThenable(promise, thenable, then) {
       lib$es6$promise$asap$$asap(function(promise) {
        var sealed = false;
        var error = lib$es6$promise$$internal$$tryThen(then, thenable, function(value) {
          if (sealed) { return; }
          sealed = true;
          if (thenable !== value) {
            lib$es6$promise$$internal$$resolve(promise, value);
          } else {
            lib$es6$promise$$internal$$fulfill(promise, value);
          }
        }, function(reason) {
          if (sealed) { return; }
          sealed = true;

          lib$es6$promise$$internal$$reject(promise, reason);
        }, 'Settle: ' + (promise._label || ' unknown promise'));

        if (!sealed && error) {
          sealed = true;
          lib$es6$promise$$internal$$reject(promise, error);
        }
      }, promise);
    }

    function lib$es6$promise$$internal$$handleOwnThenable(promise, thenable) {
      if (thenable._state === lib$es6$promise$$internal$$FULFILLED) {
        lib$es6$promise$$internal$$fulfill(promise, thenable._result);
      } else if (thenable._state === lib$es6$promise$$internal$$REJECTED) {
        lib$es6$promise$$internal$$reject(promise, thenable._result);
      } else {
        lib$es6$promise$$internal$$subscribe(thenable, undefined, function(value) {
          lib$es6$promise$$internal$$resolve(promise, value);
        }, function(reason) {
          lib$es6$promise$$internal$$reject(promise, reason);
        });
      }
    }

    function lib$es6$promise$$internal$$handleMaybeThenable(promise, maybeThenable, then) {
      if (maybeThenable.constructor === promise.constructor &&
          then === lib$es6$promise$then$$default &&
          constructor.resolve === lib$es6$promise$promise$resolve$$default) {
        lib$es6$promise$$internal$$handleOwnThenable(promise, maybeThenable);
      } else {
        if (then === lib$es6$promise$$internal$$GET_THEN_ERROR) {
          lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$GET_THEN_ERROR.error);
        } else if (then === undefined) {
          lib$es6$promise$$internal$$fulfill(promise, maybeThenable);
        } else if (lib$es6$promise$utils$$isFunction(then)) {
          lib$es6$promise$$internal$$handleForeignThenable(promise, maybeThenable, then);
        } else {
          lib$es6$promise$$internal$$fulfill(promise, maybeThenable);
        }
      }
    }

    function lib$es6$promise$$internal$$resolve(promise, value) {
      if (promise === value) {
        lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$selfFulfillment());
      } else if (lib$es6$promise$utils$$objectOrFunction(value)) {
        lib$es6$promise$$internal$$handleMaybeThenable(promise, value, lib$es6$promise$$internal$$getThen(value));
      } else {
        lib$es6$promise$$internal$$fulfill(promise, value);
      }
    }

    function lib$es6$promise$$internal$$publishRejection(promise) {
      if (promise._onerror) {
        promise._onerror(promise._result);
      }

      lib$es6$promise$$internal$$publish(promise);
    }

    function lib$es6$promise$$internal$$fulfill(promise, value) {
      if (promise._state !== lib$es6$promise$$internal$$PENDING) { return; }

      promise._result = value;
      promise._state = lib$es6$promise$$internal$$FULFILLED;

      if (promise._subscribers.length !== 0) {
        lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publish, promise);
      }
    }

    function lib$es6$promise$$internal$$reject(promise, reason) {
      if (promise._state !== lib$es6$promise$$internal$$PENDING) { return; }
      promise._state = lib$es6$promise$$internal$$REJECTED;
      promise._result = reason;

      lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publishRejection, promise);
    }

    function lib$es6$promise$$internal$$subscribe(parent, child, onFulfillment, onRejection) {
      var subscribers = parent._subscribers;
      var length = subscribers.length;

      parent._onerror = null;

      subscribers[length] = child;
      subscribers[length + lib$es6$promise$$internal$$FULFILLED] = onFulfillment;
      subscribers[length + lib$es6$promise$$internal$$REJECTED]  = onRejection;

      if (length === 0 && parent._state) {
        lib$es6$promise$asap$$asap(lib$es6$promise$$internal$$publish, parent);
      }
    }

    function lib$es6$promise$$internal$$publish(promise) {
      var subscribers = promise._subscribers;
      var settled = promise._state;

      if (subscribers.length === 0) { return; }

      var child, callback, detail = promise._result;

      for (var i = 0; i < subscribers.length; i += 3) {
        child = subscribers[i];
        callback = subscribers[i + settled];

        if (child) {
          lib$es6$promise$$internal$$invokeCallback(settled, child, callback, detail);
        } else {
          callback(detail);
        }
      }

      promise._subscribers.length = 0;
    }

    function lib$es6$promise$$internal$$ErrorObject() {
      this.error = null;
    }

    var lib$es6$promise$$internal$$TRY_CATCH_ERROR = new lib$es6$promise$$internal$$ErrorObject();

    function lib$es6$promise$$internal$$tryCatch(callback, detail) {
      try {
        return callback(detail);
      } catch(e) {
        lib$es6$promise$$internal$$TRY_CATCH_ERROR.error = e;
        return lib$es6$promise$$internal$$TRY_CATCH_ERROR;
      }
    }

    function lib$es6$promise$$internal$$invokeCallback(settled, promise, callback, detail) {
      var hasCallback = lib$es6$promise$utils$$isFunction(callback),
          value, error, succeeded, failed;

      if (hasCallback) {
        value = lib$es6$promise$$internal$$tryCatch(callback, detail);

        if (value === lib$es6$promise$$internal$$TRY_CATCH_ERROR) {
          failed = true;
          error = value.error;
          value = null;
        } else {
          succeeded = true;
        }

        if (promise === value) {
          lib$es6$promise$$internal$$reject(promise, lib$es6$promise$$internal$$cannotReturnOwn());
          return;
        }

      } else {
        value = detail;
        succeeded = true;
      }

      if (promise._state !== lib$es6$promise$$internal$$PENDING) {
        // noop
      } else if (hasCallback && succeeded) {
        lib$es6$promise$$internal$$resolve(promise, value);
      } else if (failed) {
        lib$es6$promise$$internal$$reject(promise, error);
      } else if (settled === lib$es6$promise$$internal$$FULFILLED) {
        lib$es6$promise$$internal$$fulfill(promise, value);
      } else if (settled === lib$es6$promise$$internal$$REJECTED) {
        lib$es6$promise$$internal$$reject(promise, value);
      }
    }

    function lib$es6$promise$$internal$$initializePromise(promise, resolver) {
      try {
        resolver(function resolvePromise(value){
          lib$es6$promise$$internal$$resolve(promise, value);
        }, function rejectPromise(reason) {
          lib$es6$promise$$internal$$reject(promise, reason);
        });
      } catch(e) {
        lib$es6$promise$$internal$$reject(promise, e);
      }
    }

    var lib$es6$promise$$internal$$id = 0;
    function lib$es6$promise$$internal$$nextId() {
      return lib$es6$promise$$internal$$id++;
    }

    function lib$es6$promise$$internal$$makePromise(promise) {
      promise[lib$es6$promise$$internal$$PROMISE_ID] = lib$es6$promise$$internal$$id++;
      promise._state = undefined;
      promise._result = undefined;
      promise._subscribers = [];
    }

    function lib$es6$promise$promise$all$$all(entries) {
      return new lib$es6$promise$enumerator$$default(this, entries).promise;
    }
    var lib$es6$promise$promise$all$$default = lib$es6$promise$promise$all$$all;
    function lib$es6$promise$promise$race$$race(entries) {
      /*jshint validthis:true */
      var Constructor = this;

      if (!lib$es6$promise$utils$$isArray(entries)) {
        return new Constructor(function(resolve, reject) {
          reject(new TypeError('You must pass an array to race.'));
        });
      } else {
        return new Constructor(function(resolve, reject) {
          var length = entries.length;
          for (var i = 0; i < length; i++) {
            Constructor.resolve(entries[i]).then(resolve, reject);
          }
        });
      }
    }
    var lib$es6$promise$promise$race$$default = lib$es6$promise$promise$race$$race;
    function lib$es6$promise$promise$reject$$reject(reason) {
      /*jshint validthis:true */
      var Constructor = this;
      var promise = new Constructor(lib$es6$promise$$internal$$noop);
      lib$es6$promise$$internal$$reject(promise, reason);
      return promise;
    }
    var lib$es6$promise$promise$reject$$default = lib$es6$promise$promise$reject$$reject;


    function lib$es6$promise$promise$$needsResolver() {
      throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
    }

    function lib$es6$promise$promise$$needsNew() {
      throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
    }

    var lib$es6$promise$promise$$default = lib$es6$promise$promise$$Promise;
    /**
      Promise objects represent the eventual result of an asynchronous operation. The
      primary way of interacting with a promise is through its `then` method, which
      registers callbacks to receive either a promise's eventual value or the reason
      why the promise cannot be fulfilled.

      Terminology
      -----------

      - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
      - `thenable` is an object or function that defines a `then` method.
      - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
      - `exception` is a value that is thrown using the throw statement.
      - `reason` is a value that indicates why a promise was rejected.
      - `settled` the final resting state of a promise, fulfilled or rejected.

      A promise can be in one of three states: pending, fulfilled, or rejected.

      Promises that are fulfilled have a fulfillment value and are in the fulfilled
      state.  Promises that are rejected have a rejection reason and are in the
      rejected state.  A fulfillment value is never a thenable.

      Promises can also be said to *resolve* a value.  If this value is also a
      promise, then the original promise's settled state will match the value's
      settled state.  So a promise that *resolves* a promise that rejects will
      itself reject, and a promise that *resolves* a promise that fulfills will
      itself fulfill.


      Basic Usage:
      ------------

      ```js
      var promise = new Promise(function(resolve, reject) {
        // on success
        resolve(value);

        // on failure
        reject(reason);
      });

      promise.then(function(value) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Advanced Usage:
      ---------------

      Promises shine when abstracting away asynchronous interactions such as
      `XMLHttpRequest`s.

      ```js
      function getJSON(url) {
        return new Promise(function(resolve, reject){
          var xhr = new XMLHttpRequest();

          xhr.open('GET', url);
          xhr.onreadystatechange = handler;
          xhr.responseType = 'json';
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.send();

          function handler() {
            if (this.readyState === this.DONE) {
              if (this.status === 200) {
                resolve(this.response);
              } else {
                reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
              }
            }
          };
        });
      }

      getJSON('/posts.json').then(function(json) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Unlike callbacks, promises are great composable primitives.

      ```js
      Promise.all([
        getJSON('/posts'),
        getJSON('/comments')
      ]).then(function(values){
        values[0] // => postsJSON
        values[1] // => commentsJSON

        return values;
      });
      ```

      @class Promise
      @param {function} resolver
      Useful for tooling.
      @constructor
    */
    function lib$es6$promise$promise$$Promise(resolver) {
      this[lib$es6$promise$$internal$$PROMISE_ID] = lib$es6$promise$$internal$$nextId();
      this._result = this._state = undefined;
      this._subscribers = [];

      if (lib$es6$promise$$internal$$noop !== resolver) {
        typeof resolver !== 'function' && lib$es6$promise$promise$$needsResolver();
        this instanceof lib$es6$promise$promise$$Promise ? lib$es6$promise$$internal$$initializePromise(this, resolver) : lib$es6$promise$promise$$needsNew();
      }
    }

    lib$es6$promise$promise$$Promise.all = lib$es6$promise$promise$all$$default;
    lib$es6$promise$promise$$Promise.race = lib$es6$promise$promise$race$$default;
    lib$es6$promise$promise$$Promise.resolve = lib$es6$promise$promise$resolve$$default;
    lib$es6$promise$promise$$Promise.reject = lib$es6$promise$promise$reject$$default;
    lib$es6$promise$promise$$Promise._setScheduler = lib$es6$promise$asap$$setScheduler;
    lib$es6$promise$promise$$Promise._setAsap = lib$es6$promise$asap$$setAsap;
    lib$es6$promise$promise$$Promise._asap = lib$es6$promise$asap$$asap;

    lib$es6$promise$promise$$Promise.prototype = {
      constructor: lib$es6$promise$promise$$Promise,

    /**
      The primary way of interacting with a promise is through its `then` method,
      which registers callbacks to receive either a promise's eventual value or the
      reason why the promise cannot be fulfilled.

      ```js
      findUser().then(function(user){
        // user is available
      }, function(reason){
        // user is unavailable, and you are given the reason why
      });
      ```

      Chaining
      --------

      The return value of `then` is itself a promise.  This second, 'downstream'
      promise is resolved with the return value of the first promise's fulfillment
      or rejection handler, or rejected if the handler throws an exception.

      ```js
      findUser().then(function (user) {
        return user.name;
      }, function (reason) {
        return 'default name';
      }).then(function (userName) {
        // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
        // will be `'default name'`
      });

      findUser().then(function (user) {
        throw new Error('Found user, but still unhappy');
      }, function (reason) {
        throw new Error('`findUser` rejected and we're unhappy');
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
        // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
      });
      ```
      If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.

      ```js
      findUser().then(function (user) {
        throw new PedagogicalException('Upstream error');
      }).then(function (value) {
        // never reached
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // The `PedgagocialException` is propagated all the way down to here
      });
      ```

      Assimilation
      ------------

      Sometimes the value you want to propagate to a downstream promise can only be
      retrieved asynchronously. This can be achieved by returning a promise in the
      fulfillment or rejection handler. The downstream promise will then be pending
      until the returned promise is settled. This is called *assimilation*.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // The user's comments are now available
      });
      ```

      If the assimliated promise rejects, then the downstream promise will also reject.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // If `findCommentsByAuthor` fulfills, we'll have the value here
      }, function (reason) {
        // If `findCommentsByAuthor` rejects, we'll have the reason here
      });
      ```

      Simple Example
      --------------

      Synchronous Example

      ```javascript
      var result;

      try {
        result = findResult();
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js
      findResult(function(result, err){
        if (err) {
          // failure
        } else {
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findResult().then(function(result){
        // success
      }, function(reason){
        // failure
      });
      ```

      Advanced Example
      --------------

      Synchronous Example

      ```javascript
      var author, books;

      try {
        author = findAuthor();
        books  = findBooksByAuthor(author);
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js

      function foundBooks(books) {

      }

      function failure(reason) {

      }

      findAuthor(function(author, err){
        if (err) {
          failure(err);
          // failure
        } else {
          try {
            findBoooksByAuthor(author, function(books, err) {
              if (err) {
                failure(err);
              } else {
                try {
                  foundBooks(books);
                } catch(reason) {
                  failure(reason);
                }
              }
            });
          } catch(error) {
            failure(err);
          }
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findAuthor().
        then(findBooksByAuthor).
        then(function(books){
          // found books
      }).catch(function(reason){
        // something went wrong
      });
      ```

      @method then
      @param {Function} onFulfilled
      @param {Function} onRejected
      Useful for tooling.
      @return {Promise}
    */
      then: lib$es6$promise$then$$default,

    /**
      `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
      as the catch block of a try/catch statement.

      ```js
      function findAuthor(){
        throw new Error('couldn't find that author');
      }

      // synchronous
      try {
        findAuthor();
      } catch(reason) {
        // something went wrong
      }

      // async with promises
      findAuthor().catch(function(reason){
        // something went wrong
      });
      ```

      @method catch
      @param {Function} onRejection
      Useful for tooling.
      @return {Promise}
    */
      'catch': function(onRejection) {
        return this.then(null, onRejection);
      }
    };
    var lib$es6$promise$enumerator$$default = lib$es6$promise$enumerator$$Enumerator;
    function lib$es6$promise$enumerator$$Enumerator(Constructor, input) {
      this._instanceConstructor = Constructor;
      this.promise = new Constructor(lib$es6$promise$$internal$$noop);

      if (!this.promise[lib$es6$promise$$internal$$PROMISE_ID]) {
        lib$es6$promise$$internal$$makePromise(this.promise);
      }

      if (lib$es6$promise$utils$$isArray(input)) {
        this._input     = input;
        this.length     = input.length;
        this._remaining = input.length;

        this._result = new Array(this.length);

        if (this.length === 0) {
          lib$es6$promise$$internal$$fulfill(this.promise, this._result);
        } else {
          this.length = this.length || 0;
          this._enumerate();
          if (this._remaining === 0) {
            lib$es6$promise$$internal$$fulfill(this.promise, this._result);
          }
        }
      } else {
        lib$es6$promise$$internal$$reject(this.promise, lib$es6$promise$enumerator$$validationError());
      }
    }

    function lib$es6$promise$enumerator$$validationError() {
      return new Error('Array Methods must be provided an Array');
    }

    lib$es6$promise$enumerator$$Enumerator.prototype._enumerate = function() {
      var length  = this.length;
      var input   = this._input;

      for (var i = 0; this._state === lib$es6$promise$$internal$$PENDING && i < length; i++) {
        this._eachEntry(input[i], i);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._eachEntry = function(entry, i) {
      var c = this._instanceConstructor;
      var resolve = c.resolve;

      if (resolve === lib$es6$promise$promise$resolve$$default) {
        var then = lib$es6$promise$$internal$$getThen(entry);

        if (then === lib$es6$promise$then$$default &&
            entry._state !== lib$es6$promise$$internal$$PENDING) {
          this._settledAt(entry._state, i, entry._result);
        } else if (typeof then !== 'function') {
          this._remaining--;
          this._result[i] = entry;
        } else if (c === lib$es6$promise$promise$$default) {
          var promise = new c(lib$es6$promise$$internal$$noop);
          lib$es6$promise$$internal$$handleMaybeThenable(promise, entry, then);
          this._willSettleAt(promise, i);
        } else {
          this._willSettleAt(new c(function(resolve) { resolve(entry); }), i);
        }
      } else {
        this._willSettleAt(resolve(entry), i);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._settledAt = function(state, i, value) {
      var promise = this.promise;

      if (promise._state === lib$es6$promise$$internal$$PENDING) {
        this._remaining--;

        if (state === lib$es6$promise$$internal$$REJECTED) {
          lib$es6$promise$$internal$$reject(promise, value);
        } else {
          this._result[i] = value;
        }
      }

      if (this._remaining === 0) {
        lib$es6$promise$$internal$$fulfill(promise, this._result);
      }
    };

    lib$es6$promise$enumerator$$Enumerator.prototype._willSettleAt = function(promise, i) {
      var enumerator = this;

      lib$es6$promise$$internal$$subscribe(promise, undefined, function(value) {
        enumerator._settledAt(lib$es6$promise$$internal$$FULFILLED, i, value);
      }, function(reason) {
        enumerator._settledAt(lib$es6$promise$$internal$$REJECTED, i, reason);
      });
    };
    function lib$es6$promise$polyfill$$polyfill() {
      var local;

      if (typeof global !== 'undefined') {
          local = global;
      } else if (typeof self !== 'undefined') {
          local = self;
      } else {
          try {
              local = Function('return this')();
          } catch (e) {
              throw new Error('polyfill failed because global object is unavailable in this environment');
          }
      }

      var P = local.Promise;

      if (P && Object.prototype.toString.call(P.resolve()) === '[object Promise]' && !P.cast) {
        return;
      }

      local.Promise = lib$es6$promise$promise$$default;
    }
    var lib$es6$promise$polyfill$$default = lib$es6$promise$polyfill$$polyfill;

    var lib$es6$promise$umd$$ES6Promise = {
      'Promise': lib$es6$promise$promise$$default,
      'polyfill': lib$es6$promise$polyfill$$default
    };

    /* global define:true module:true window: true */
    if (typeof define === 'function' && define['amd']) {
      define(function() { return lib$es6$promise$umd$$ES6Promise; });
    } else if (typeof module !== 'undefined' && module['exports']) {
      module['exports'] = lib$es6$promise$umd$$ES6Promise;
    } else if (typeof this !== 'undefined') {
      this['ES6Promise'] = lib$es6$promise$umd$$ES6Promise;
    }

    lib$es6$promise$polyfill$$default();
}).call(this);


}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"_process":75}],5:[function(require,module,exports){
(function (global){
/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/** Used as references for various `Number` constants. */
var NAN = 0 / 0;

/** `Object#toString` result references. */
var symbolTag = '[object Symbol]';

/** Used to match leading and trailing whitespace. */
var reTrim = /^\s+|\s+$/g;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary = /^0b[01]+$/i;

/** Used to detect octal string values. */
var reIsOctal = /^0o[0-7]+$/i;

/** Built-in method references without a dependency on `root`. */
var freeParseInt = parseInt;

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max,
    nativeMin = Math.min;

/**
 * Gets the timestamp of the number of milliseconds that have elapsed since
 * the Unix epoch (1 January 1970 00:00:00 UTC).
 *
 * @static
 * @memberOf _
 * @since 2.4.0
 * @category Date
 * @returns {number} Returns the timestamp.
 * @example
 *
 * _.defer(function(stamp) {
 *   console.log(_.now() - stamp);
 * }, _.now());
 * // => Logs the number of milliseconds it took for the deferred invocation.
 */
var now = function() {
  return root.Date.now();
};

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. The debounced function comes with a `cancel` method to cancel
 * delayed `func` invocations and a `flush` method to immediately invoke them.
 * Provide `options` to indicate whether `func` should be invoked on the
 * leading and/or trailing edge of the `wait` timeout. The `func` is invoked
 * with the last arguments provided to the debounced function. Subsequent
 * calls to the debounced function return the result of the last `func`
 * invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is
 * invoked on the trailing edge of the timeout only if the debounced function
 * is invoked more than once during the `wait` timeout.
 *
 * If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
 * until to the next tick, similar to `setTimeout` with a timeout of `0`.
 *
 * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
 * for details over the differences between `_.debounce` and `_.throttle`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to debounce.
 * @param {number} [wait=0] The number of milliseconds to delay.
 * @param {Object} [options={}] The options object.
 * @param {boolean} [options.leading=false]
 *  Specify invoking on the leading edge of the timeout.
 * @param {number} [options.maxWait]
 *  The maximum time `func` is allowed to be delayed before it's invoked.
 * @param {boolean} [options.trailing=true]
 *  Specify invoking on the trailing edge of the timeout.
 * @returns {Function} Returns the new debounced function.
 * @example
 *
 * // Avoid costly calculations while the window size is in flux.
 * jQuery(window).on('resize', _.debounce(calculateLayout, 150));
 *
 * // Invoke `sendMail` when clicked, debouncing subsequent calls.
 * jQuery(element).on('click', _.debounce(sendMail, 300, {
 *   'leading': true,
 *   'trailing': false
 * }));
 *
 * // Ensure `batchLog` is invoked once after 1 second of debounced calls.
 * var debounced = _.debounce(batchLog, 250, { 'maxWait': 1000 });
 * var source = new EventSource('/stream');
 * jQuery(source).on('message', debounced);
 *
 * // Cancel the trailing debounced invocation.
 * jQuery(window).on('popstate', debounced.cancel);
 */
function debounce(func, wait, options) {
  var lastArgs,
      lastThis,
      maxWait,
      result,
      timerId,
      lastCallTime,
      lastInvokeTime = 0,
      leading = false,
      maxing = false,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  wait = toNumber(wait) || 0;
  if (isObject(options)) {
    leading = !!options.leading;
    maxing = 'maxWait' in options;
    maxWait = maxing ? nativeMax(toNumber(options.maxWait) || 0, wait) : maxWait;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }

  function invokeFunc(time) {
    var args = lastArgs,
        thisArg = lastThis;

    lastArgs = lastThis = undefined;
    lastInvokeTime = time;
    result = func.apply(thisArg, args);
    return result;
  }

  function leadingEdge(time) {
    // Reset any `maxWait` timer.
    lastInvokeTime = time;
    // Start the timer for the trailing edge.
    timerId = setTimeout(timerExpired, wait);
    // Invoke the leading edge.
    return leading ? invokeFunc(time) : result;
  }

  function remainingWait(time) {
    var timeSinceLastCall = time - lastCallTime,
        timeSinceLastInvoke = time - lastInvokeTime,
        result = wait - timeSinceLastCall;

    return maxing ? nativeMin(result, maxWait - timeSinceLastInvoke) : result;
  }

  function shouldInvoke(time) {
    var timeSinceLastCall = time - lastCallTime,
        timeSinceLastInvoke = time - lastInvokeTime;

    // Either this is the first call, activity has stopped and we're at the
    // trailing edge, the system time has gone backwards and we're treating
    // it as the trailing edge, or we've hit the `maxWait` limit.
    return (lastCallTime === undefined || (timeSinceLastCall >= wait) ||
      (timeSinceLastCall < 0) || (maxing && timeSinceLastInvoke >= maxWait));
  }

  function timerExpired() {
    var time = now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    // Restart the timer.
    timerId = setTimeout(timerExpired, remainingWait(time));
  }

  function trailingEdge(time) {
    timerId = undefined;

    // Only invoke if we have `lastArgs` which means `func` has been
    // debounced at least once.
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = undefined;
    return result;
  }

  function cancel() {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timerId = undefined;
  }

  function flush() {
    return timerId === undefined ? result : trailingEdge(now());
  }

  function debounced() {
    var time = now(),
        isInvoking = shouldInvoke(time);

    lastArgs = arguments;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timerId === undefined) {
        return leadingEdge(lastCallTime);
      }
      if (maxing) {
        // Handle invocations in a tight loop.
        timerId = setTimeout(timerExpired, wait);
        return invokeFunc(lastCallTime);
      }
    }
    if (timerId === undefined) {
      timerId = setTimeout(timerExpired, wait);
    }
    return result;
  }
  debounced.cancel = cancel;
  debounced.flush = flush;
  return debounced;
}

/**
 * Creates a throttled function that only invokes `func` at most once per
 * every `wait` milliseconds. The throttled function comes with a `cancel`
 * method to cancel delayed `func` invocations and a `flush` method to
 * immediately invoke them. Provide `options` to indicate whether `func`
 * should be invoked on the leading and/or trailing edge of the `wait`
 * timeout. The `func` is invoked with the last arguments provided to the
 * throttled function. Subsequent calls to the throttled function return the
 * result of the last `func` invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is
 * invoked on the trailing edge of the timeout only if the throttled function
 * is invoked more than once during the `wait` timeout.
 *
 * If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
 * until to the next tick, similar to `setTimeout` with a timeout of `0`.
 *
 * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
 * for details over the differences between `_.throttle` and `_.debounce`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to throttle.
 * @param {number} [wait=0] The number of milliseconds to throttle invocations to.
 * @param {Object} [options={}] The options object.
 * @param {boolean} [options.leading=true]
 *  Specify invoking on the leading edge of the timeout.
 * @param {boolean} [options.trailing=true]
 *  Specify invoking on the trailing edge of the timeout.
 * @returns {Function} Returns the new throttled function.
 * @example
 *
 * // Avoid excessively updating the position while scrolling.
 * jQuery(window).on('scroll', _.throttle(updatePosition, 100));
 *
 * // Invoke `renewToken` when the click event is fired, but not more than once every 5 minutes.
 * var throttled = _.throttle(renewToken, 300000, { 'trailing': false });
 * jQuery(element).on('click', throttled);
 *
 * // Cancel the trailing throttled invocation.
 * jQuery(window).on('popstate', throttled.cancel);
 */
function throttle(func, wait, options) {
  var leading = true,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  if (isObject(options)) {
    leading = 'leading' in options ? !!options.leading : leading;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }
  return debounce(func, wait, {
    'leading': leading,
    'maxWait': wait,
    'trailing': trailing
  });
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3.2);
 * // => 3.2
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3.2');
 * // => 3.2
 */
function toNumber(value) {
  if (typeof value == 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  if (isObject(value)) {
    var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

module.exports = throttle;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],6:[function(require,module,exports){
/**
* Create an event emitter with namespaces
* @name createNamespaceEmitter
* @example
* var emitter = require('./index')()
*
* emitter.on('*', function () {
*   console.log('all events emitted', this.event)
* })
*
* emitter.on('example', function () {
*   console.log('example event emitted')
* })
*/
module.exports = function createNamespaceEmitter () {
  var emitter = { _fns: {} }

  /**
  * Emit an event. Optionally namespace the event. Separate the namespace and event with a `:`
  * @name emit
  * @param {String} event – the name of the event, with optional namespace
  * @param {...*} data – data variables that will be passed as arguments to the event listener
  * @example
  * emitter.emit('example')
  * emitter.emit('demo:test')
  * emitter.emit('data', { example: true}, 'a string', 1)
  */
  emitter.emit = function emit (event) {
    var args = [].slice.call(arguments, 1)
    var namespaced = namespaces(event)
    if (this._fns[event]) emitAll(event, this._fns[event], args)
    if (namespaced) emitAll(event, namespaced, args)
  }

  /**
  * Create en event listener.
  * @name on
  * @param {String} event
  * @param {Function} fn
  * @example
  * emitter.on('example', function () {})
  * emitter.on('demo', function () {})
  */
  emitter.on = function on (event, fn) {
    if (typeof fn !== 'function') { throw new Error('callback required') }
    (this._fns[event] = this._fns[event] || []).push(fn)
  }

  /**
  * Create en event listener that fires once.
  * @name once
  * @param {String} event
  * @param {Function} fn
  * @example
  * emitter.once('example', function () {})
  * emitter.once('demo', function () {})
  */
  emitter.once = function once (event, fn) {
    function one () {
      fn.apply(this, arguments)
      emitter.off(event, one)
    }
    this.on(event, one)
  }

  /**
  * Stop listening to an event. Stop all listeners on an event by only passing the event name. Stop a single listener by passing that event handler as a callback.
  * You must be explicit about what will be unsubscribed: `emitter.off('demo')` will unsubscribe an `emitter.on('demo')` listener, 
  * `emitter.off('demo:example')` will unsubscribe an `emitter.on('demo:example')` listener
  * @name off
  * @param {String} event
  * @param {Function} [fn] – the specific handler
  * @example
  * emitter.off('example')
  * emitter.off('demo', function () {})
  */
  emitter.off = function off (event, fn) {
    var keep = []

    if (event && fn) {
      for (var i = 0; i < this._fns.length; i++) {
        if (this._fns[i] !== fn) {
          keep.push(this._fns[i])
        }
      }
    }

    keep.length ? this._fns[event] = keep : delete this._fns[event]
  }

  function namespaces (e) {
    var out = []
    var args = e.split(':')
    var fns = emitter._fns
    Object.keys(fns).forEach(function (key) {
      if (key === '*') out = out.concat(fns[key])
      if (args.length === 2 && args[0] === key) out = out.concat(fns[key])
    })
    return out
  }

  function emitAll (e, fns, args) {
    for (var i = 0; i < fns.length; i++) {
      if (!fns[i]) break
      fns[i].event = e
      fns[i].apply(fns[i], args)
    }
  }

  return emitter
}

},{}],7:[function(require,module,exports){
/* global MutationObserver */
var document = require('global/document')
var window = require('global/window')
var watch = Object.create(null)
var KEY_ID = 'onloadid' + (new Date() % 9e6).toString(36)
var KEY_ATTR = 'data-' + KEY_ID
var INDEX = 0

if (window && window.MutationObserver) {
  var observer = new MutationObserver(function (mutations) {
    if (Object.keys(watch).length < 1) return
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === KEY_ATTR) {
        eachAttr(mutations[i], turnon, turnoff)
        continue
      }
      eachMutation(mutations[i].removedNodes, turnoff)
      eachMutation(mutations[i].addedNodes, turnon)
    }
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [KEY_ATTR]
  })
}

module.exports = function onload (el, on, off, caller) {
  on = on || function () {}
  off = off || function () {}
  el.setAttribute(KEY_ATTR, 'o' + INDEX)
  watch['o' + INDEX] = [on, off, 0, caller || onload.caller]
  INDEX += 1
  return el
}

function turnon (index, el) {
  if (watch[index][0] && watch[index][2] === 0) {
    watch[index][0](el)
    watch[index][2] = 1
  }
}

function turnoff (index, el) {
  if (watch[index][1] && watch[index][2] === 1) {
    watch[index][1](el)
    watch[index][2] = 0
  }
}

function eachAttr (mutation, on, off) {
  var newValue = mutation.target.getAttribute(KEY_ATTR)
  if (sameOrigin(mutation.oldValue, newValue)) {
    watch[newValue] = watch[mutation.oldValue]
    return
  }
  if (watch[mutation.oldValue]) {
    off(mutation.oldValue, mutation.target)
  }
  if (watch[newValue]) {
    on(newValue, mutation.target)
  }
}

function sameOrigin (oldValue, newValue) {
  if (!oldValue || !newValue) return false
  return watch[oldValue][3] === watch[newValue][3]
}

function eachMutation (nodes, fn) {
  var keys = Object.keys(watch)
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i] && nodes[i].getAttribute && nodes[i].getAttribute(KEY_ATTR)) {
      var onloadid = nodes[i].getAttribute(KEY_ATTR)
      keys.forEach(function (k) {
        if (onloadid === k) {
          fn(k, nodes[i])
        }
      })
    }
    if (nodes[i].childNodes.length > 0) {
      eachMutation(nodes[i].childNodes, fn)
    }
  }
}

},{"global/document":8,"global/window":9}],8:[function(require,module,exports){
(function (global){
var topLevel = typeof global !== 'undefined' ? global :
    typeof window !== 'undefined' ? window : {}
var minDoc = require('min-document');

if (typeof document !== 'undefined') {
    module.exports = document;
} else {
    var doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'];

    if (!doccy) {
        doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'] = minDoc;
    }

    module.exports = doccy;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"min-document":74}],9:[function(require,module,exports){
(function (global){
if (typeof window !== "undefined") {
    module.exports = window;
} else if (typeof global !== "undefined") {
    module.exports = global;
} else if (typeof self !== "undefined"){
    module.exports = self;
} else {
    module.exports = {};
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],10:[function(require,module,exports){
module.exports = prettierBytes

function prettierBytes (num) {
  if (typeof num !== 'number' || Number.isNaN(num)) {
    throw new TypeError('Expected a number, got ' + typeof num)
  }

  var neg = num < 0
  var units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  if (neg) {
    num = -num
  }

  if (num < 1) {
    return (neg ? '-' : '') + num + ' B'
  }

  var exponent = Math.min(Math.floor(Math.log(num) / Math.log(1000)), units.length - 1)
  num = Number(num / Math.pow(1000, exponent))
  var unit = units[exponent]

  if (num >= 10 || num % 1 === 0) {
    // Do not show decimals when the number is two-digit, or if the number has no
    // decimal component.
    return (neg ? '-' : '') + num.toFixed(0) + ' ' + unit
  } else {
    return (neg ? '-' : '') + num.toFixed(1) + ' ' + unit
  }
}

},{}],11:[function(require,module,exports){
// Generated by Babel
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.encode = encode;
/* global: window */

var _window = window;
var btoa = _window.btoa;
function encode(data) {
  return btoa(unescape(encodeURIComponent(data)));
}

var isSupported = exports.isSupported = "btoa" in window;
},{}],12:[function(require,module,exports){
// Generated by Babel
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.newRequest = newRequest;
exports.resolveUrl = resolveUrl;

var _resolveUrl = require("resolve-url");

var _resolveUrl2 = _interopRequireDefault(_resolveUrl);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function newRequest() {
  return new window.XMLHttpRequest();
} /* global window */


function resolveUrl(origin, link) {
  return (0, _resolveUrl2.default)(origin, link);
}
},{"resolve-url":20}],13:[function(require,module,exports){
// Generated by Babel
"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getSource = getSource;

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var FileSource = function () {
  function FileSource(file) {
    _classCallCheck(this, FileSource);

    this._file = file;
    this.size = file.size;
  }

  _createClass(FileSource, [{
    key: "slice",
    value: function slice(start, end) {
      return this._file.slice(start, end);
    }
  }, {
    key: "close",
    value: function close() {}
  }]);

  return FileSource;
}();

function getSource(input) {
  // Since we emulate the Blob type in our tests (not all target browsers
  // support it), we cannot use `instanceof` for testing whether the input value
  // can be handled. Instead, we simply check is the slice() function and the
  // size property are available.
  if (typeof input.slice === "function" && typeof input.size !== "undefined") {
    return new FileSource(input);
  }

  throw new Error("source object may only be an instance of File or Blob in this environment");
}
},{}],14:[function(require,module,exports){
// Generated by Babel
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.setItem = setItem;
exports.getItem = getItem;
exports.removeItem = removeItem;
/* global window, localStorage */

var hasStorage = false;
try {
  hasStorage = "localStorage" in window;

  // Attempt to store and read entries from the local storage to detect Private
  // Mode on Safari on iOS (see #49)
  var key = "tusSupport";
  localStorage.setItem(key, localStorage.getItem(key));
} catch (e) {
  // If we try to access localStorage inside a sandboxed iframe, a SecurityError
  // is thrown. When in private mode on iOS Safari, a QuotaExceededError is
  // thrown (see #49)
  if (e.code === e.SECURITY_ERR || e.code === e.QUOTA_EXCEEDED_ERR) {
    hasStorage = false;
  } else {
    throw e;
  }
}

var canStoreURLs = exports.canStoreURLs = hasStorage;

function setItem(key, value) {
  if (!hasStorage) return;
  return localStorage.setItem(key, value);
}

function getItem(key) {
  if (!hasStorage) return;
  return localStorage.getItem(key);
}

function removeItem(key) {
  if (!hasStorage) return;
  return localStorage.removeItem(key);
}
},{}],15:[function(require,module,exports){
// Generated by Babel
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var DetailedError = function (_Error) {
  _inherits(DetailedError, _Error);

  function DetailedError(error) {
    var causingErr = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];
    var xhr = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];

    _classCallCheck(this, DetailedError);

    var _this = _possibleConstructorReturn(this, Object.getPrototypeOf(DetailedError).call(this, error.message));

    _this.originalRequest = xhr;
    _this.causingError = causingErr;

    var message = error.message;
    if (causingErr != null) {
      message += ", caused by " + causingErr.toString();
    }
    if (xhr != null) {
      message += ", originated from request (response code: " + xhr.status + ", response text: " + xhr.responseText + ")";
    }
    _this.message = message;
    return _this;
  }

  return DetailedError;
}(Error);

exports.default = DetailedError;
},{}],16:[function(require,module,exports){
// Generated by Babel
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = fingerprint;
/**
 * Generate a fingerprint for a file which will be used the store the endpoint
 *
 * @param {File} file
 * @return {String}
 */
function fingerprint(file) {
  return ["tus", file.name, file.type, file.size, file.lastModified].join("-");
}
},{}],17:[function(require,module,exports){
// Generated by Babel
"use strict";

var _upload = require("./upload");

var _upload2 = _interopRequireDefault(_upload);

var _storage = require("./node/storage");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* global window */
var defaultOptions = _upload2.default.defaultOptions;


if (typeof window !== "undefined") {
  // Browser environment using XMLHttpRequest
  var _window = window;
  var XMLHttpRequest = _window.XMLHttpRequest;
  var Blob = _window.Blob;


  var isSupported = XMLHttpRequest && Blob && typeof Blob.prototype.slice === "function";
} else {
  // Node.js environment using http module
  var isSupported = true;
}

// The usage of the commonjs exporting syntax instead of the new ECMAScript
// one is actually inteded and prevents weird behaviour if we are trying to
// import this module in another module using Babel.
module.exports = {
  Upload: _upload2.default,
  isSupported: isSupported,
  canStoreURLs: _storage.canStoreURLs,
  defaultOptions: defaultOptions
};
},{"./node/storage":14,"./upload":18}],18:[function(require,module,exports){
// Generated by Babel
"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); /* global window */


// We import the files used inside the Node environment which are rewritten
// for browsers using the rules defined in the package.json


Object.defineProperty(exports, "__esModule", {
  value: true
});

var _fingerprint = require("./fingerprint");

var _fingerprint2 = _interopRequireDefault(_fingerprint);

var _error = require("./error");

var _error2 = _interopRequireDefault(_error);

var _extend = require("extend");

var _extend2 = _interopRequireDefault(_extend);

var _request = require("./node/request");

var _source = require("./node/source");

var _base = require("./node/base64");

var Base64 = _interopRequireWildcard(_base);

var _storage = require("./node/storage");

var Storage = _interopRequireWildcard(_storage);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var defaultOptions = {
  endpoint: "",
  fingerprint: _fingerprint2.default,
  resume: true,
  onProgress: null,
  onChunkComplete: null,
  onSuccess: null,
  onError: null,
  headers: {},
  chunkSize: Infinity,
  withCredentials: false,
  uploadUrl: null,
  uploadSize: null,
  overridePatchMethod: false,
  retryDelays: null
};

var Upload = function () {
  function Upload(file, options) {
    _classCallCheck(this, Upload);

    this.options = (0, _extend2.default)(true, {}, defaultOptions, options);

    // The underlying File/Blob object
    this.file = file;

    // The URL against which the file will be uploaded
    this.url = null;

    // The underlying XHR object for the current PATCH request
    this._xhr = null;

    // The fingerpinrt for the current file (set after start())
    this._fingerprint = null;

    // The offset used in the current PATCH request
    this._offset = null;

    // True if the current PATCH request has been aborted
    this._aborted = false;

    // The file's size in bytes
    this._size = null;

    // The Source object which will wrap around the given file and provides us
    // with a unified interface for getting its size and slice chunks from its
    // content allowing us to easily handle Files, Blobs, Buffers and Streams.
    this._source = null;

    // The current count of attempts which have been made. Null indicates none.
    this._retryAttempt = 0;

    // The timeout's ID which is used to delay the next retry
    this._retryTimeout = null;

    // The offset of the remote upload before the latest attempt was started.
    this._offsetBeforeRetry = 0;
  }

  _createClass(Upload, [{
    key: "start",
    value: function start() {
      var _this = this;

      var file = this.file;

      if (!file) {
        this._emitError(new Error("tus: no file or stream to upload provided"));
        return;
      }

      if (!this.options.endpoint) {
        this._emitError(new Error("tus: no endpoint provided"));
        return;
      }

      var source = this._source = (0, _source.getSource)(file, this.options.chunkSize);

      // Firstly, check if the caller has supplied a manual upload size or else
      // we will use the calculated size by the source object.
      if (this.options.uploadSize != null) {
        var size = +this.options.uploadSize;
        if (isNaN(size)) {
          throw new Error("tus: cannot convert `uploadSize` option into a number");
        }

        this._size = size;
      } else {
        var size = source.size;

        // The size property will be null if we cannot calculate the file's size,
        // for example if you handle a stream.
        if (size == null) {
          throw new Error("tus: cannot automatically derive upload's size from input and must be specified manually using the `uploadSize` option");
        }

        this._size = size;
      }

      var retryDelays = this.options.retryDelays;
      if (retryDelays != null) {
        if (Object.prototype.toString.call(retryDelays) !== "[object Array]") {
          throw new Error("tus: the `retryDelays` option must either be an array or null");
        } else {
          (function () {
            var errorCallback = _this.options.onError;
            _this.options.onError = function (err) {
              // Restore the original error callback which may have been set.
              _this.options.onError = errorCallback;

              // We will reset the attempt counter if
              // - we were already able to connect to the server (offset != null) and
              // - we were able to upload a small chunk of data to the server
              var shouldResetDelays = _this._offset != null && _this._offset > _this._offsetBeforeRetry;
              if (shouldResetDelays) {
                _this._retryAttempt = 0;
              }

              var isOnline = true;
              if (typeof window !== "undefined" && "navigator" in window && window.navigator.onLine === false) {
                isOnline = false;
              }

              // We only attempt a retry if
              // - we didn't exceed the maxium number of retries, yet, and
              // - this error was caused by a request or it's response and
              // - the browser does not indicate that we are offline
              var shouldRetry = _this._retryAttempt < retryDelays.length && err.originalRequest != null && isOnline;

              if (!shouldRetry) {
                _this._emitError(err);
                return;
              }

              var delay = retryDelays[_this._retryAttempt++];

              _this._offsetBeforeRetry = _this._offset;
              _this.options.uploadUrl = _this.url;

              _this._retryTimeout = setTimeout(function () {
                _this.start();
              }, delay);
            };
          })();
        }
      }

      // Reset the aborted flag when the upload is started or else the
      // _startUpload will stop before sending a request if the upload has been
      // aborted previously.
      this._aborted = false;

      // A URL has manually been specified, so we try to resume
      if (this.options.uploadUrl != null) {
        this.url = this.options.uploadUrl;
        this._resumeUpload();
        return;
      }

      // Try to find the endpoint for the file in the storage
      if (this.options.resume) {
        this._fingerprint = this.options.fingerprint(file);
        var resumedUrl = Storage.getItem(this._fingerprint);

        if (resumedUrl != null) {
          this.url = resumedUrl;
          this._resumeUpload();
          return;
        }
      }

      // An upload has not started for the file yet, so we start a new one
      this._createUpload();
    }
  }, {
    key: "abort",
    value: function abort() {
      if (this._xhr !== null) {
        this._xhr.abort();
        this._source.close();
        this._aborted = true;
      }

      if (this._retryTimeout != null) {
        clearTimeout(this._retryTimeout);
        this._retryTimeout = null;
      }
    }
  }, {
    key: "_emitXhrError",
    value: function _emitXhrError(xhr, err, causingErr) {
      this._emitError(new _error2.default(err, causingErr, xhr));
    }
  }, {
    key: "_emitError",
    value: function _emitError(err) {
      if (typeof this.options.onError === "function") {
        this.options.onError(err);
      } else {
        throw err;
      }
    }
  }, {
    key: "_emitSuccess",
    value: function _emitSuccess() {
      if (typeof this.options.onSuccess === "function") {
        this.options.onSuccess();
      }
    }

    /**
     * Publishes notification when data has been sent to the server. This
     * data may not have been accepted by the server yet.
     * @param  {number} bytesSent  Number of bytes sent to the server.
     * @param  {number} bytesTotal Total number of bytes to be sent to the server.
     */

  }, {
    key: "_emitProgress",
    value: function _emitProgress(bytesSent, bytesTotal) {
      if (typeof this.options.onProgress === "function") {
        this.options.onProgress(bytesSent, bytesTotal);
      }
    }

    /**
     * Publishes notification when a chunk of data has been sent to the server
     * and accepted by the server.
     * @param  {number} chunkSize  Size of the chunk that was accepted by the
     *                             server.
     * @param  {number} bytesAccepted Total number of bytes that have been
     *                                accepted by the server.
     * @param  {number} bytesTotal Total number of bytes to be sent to the server.
     */

  }, {
    key: "_emitChunkComplete",
    value: function _emitChunkComplete(chunkSize, bytesAccepted, bytesTotal) {
      if (typeof this.options.onChunkComplete === "function") {
        this.options.onChunkComplete(chunkSize, bytesAccepted, bytesTotal);
      }
    }

    /**
     * Set the headers used in the request and the withCredentials property
     * as defined in the options
     *
     * @param {XMLHttpRequest} xhr
     */

  }, {
    key: "_setupXHR",
    value: function _setupXHR(xhr) {
      xhr.setRequestHeader("Tus-Resumable", "1.0.0");
      var headers = this.options.headers;

      for (var name in headers) {
        xhr.setRequestHeader(name, headers[name]);
      }

      xhr.withCredentials = this.options.withCredentials;
    }

    /**
     * Create a new upload using the creation extension by sending a POST
     * request to the endpoint. After successful creation the file will be
     * uploaded
     *
     * @api private
     */

  }, {
    key: "_createUpload",
    value: function _createUpload() {
      var _this2 = this;

      var xhr = (0, _request.newRequest)();
      xhr.open("POST", this.options.endpoint, true);

      xhr.onload = function () {
        if (!(xhr.status >= 200 && xhr.status < 300)) {
          _this2._emitXhrError(xhr, new Error("tus: unexpected response while creating upload"));
          return;
        }

        _this2.url = (0, _request.resolveUrl)(_this2.options.endpoint, xhr.getResponseHeader("Location"));

        if (_this2.options.resume) {
          Storage.setItem(_this2._fingerprint, _this2.url);
        }

        _this2._offset = 0;
        _this2._startUpload();
      };

      xhr.onerror = function (err) {
        _this2._emitXhrError(xhr, new Error("tus: failed to create upload"), err);
      };

      this._setupXHR(xhr);
      xhr.setRequestHeader("Upload-Length", this._size);

      // Add metadata if values have been added
      var metadata = encodeMetadata(this.options.metadata);
      if (metadata !== "") {
        xhr.setRequestHeader("Upload-Metadata", metadata);
      }

      xhr.send(null);
    }

    /*
     * Try to resume an existing upload. First a HEAD request will be sent
     * to retrieve the offset. If the request fails a new upload will be
     * created. In the case of a successful response the file will be uploaded.
     *
     * @api private
     */

  }, {
    key: "_resumeUpload",
    value: function _resumeUpload() {
      var _this3 = this;

      var xhr = (0, _request.newRequest)();
      xhr.open("HEAD", this.url, true);

      xhr.onload = function () {
        if (!(xhr.status >= 200 && xhr.status < 300)) {
          if (_this3.options.resume) {
            // Remove stored fingerprint and corresponding endpoint,
            // since the file can not be found
            Storage.removeItem(_this3._fingerprint);
          }

          // If the upload is locked (indicated by the 423 Locked status code), we
          // emit an error instead of directly starting a new upload. This way the
          // retry logic can catch the error and will retry the upload. An upload
          // is usually locked for a short period of time and will be available
          // afterwards.
          if (xhr.status === 423) {
            _this3._emitXhrError(xhr, new Error("tus: upload is currently locked; retry later"));
            return;
          }

          // Try to create a new upload
          _this3.url = null;
          _this3._createUpload();
          return;
        }

        var offset = parseInt(xhr.getResponseHeader("Upload-Offset"), 10);
        if (isNaN(offset)) {
          _this3._emitXhrError(xhr, new Error("tus: invalid or missing offset value"));
          return;
        }

        var length = parseInt(xhr.getResponseHeader("Upload-Length"), 10);
        if (isNaN(length)) {
          _this3._emitXhrError(xhr, new Error("tus: invalid or missing length value"));
          return;
        }

        // Upload has already been completed and we do not need to send additional
        // data to the server
        if (offset === length) {
          _this3._emitProgress(length, length);
          _this3._emitSuccess();
          return;
        }

        _this3._offset = offset;
        _this3._startUpload();
      };

      xhr.onerror = function (err) {
        _this3._emitXhrError(xhr, new Error("tus: failed to resume upload"), err);
      };

      this._setupXHR(xhr);
      xhr.send(null);
    }

    /**
     * Start uploading the file using PATCH requests. The file will be divided
     * into chunks as specified in the chunkSize option. During the upload
     * the onProgress event handler may be invoked multiple times.
     *
     * @api private
     */

  }, {
    key: "_startUpload",
    value: function _startUpload() {
      var _this4 = this;

      // If the upload has been aborted, we will not send the next PATCH request.
      // This is important if the abort method was called during a callback, such
      // as onChunkComplete or onProgress.
      if (this._aborted) {
        return;
      }

      var xhr = this._xhr = (0, _request.newRequest)();

      // Some browser and servers may not support the PATCH method. For those
      // cases, you can tell tus-js-client to use a POST request with the
      // X-HTTP-Method-Override header for simulating a PATCH request.
      if (this.options.overridePatchMethod) {
        xhr.open("POST", this.url, true);
        xhr.setRequestHeader("X-HTTP-Method-Override", "PATCH");
      } else {
        xhr.open("PATCH", this.url, true);
      }

      xhr.onload = function () {
        if (!(xhr.status >= 200 && xhr.status < 300)) {
          _this4._emitXhrError(xhr, new Error("tus: unexpected response while uploading chunk"));
          return;
        }

        var offset = parseInt(xhr.getResponseHeader("Upload-Offset"), 10);
        if (isNaN(offset)) {
          _this4._emitXhrError(xhr, new Error("tus: invalid or missing offset value"));
          return;
        }

        _this4._emitProgress(offset, _this4._size);
        _this4._emitChunkComplete(offset - _this4._offset, offset, _this4._size);

        _this4._offset = offset;

        if (offset == _this4._size) {
          // Yay, finally done :)
          _this4._emitSuccess();
          _this4._source.close();
          return;
        }

        _this4._startUpload();
      };

      xhr.onerror = function (err) {
        // Don't emit an error if the upload was aborted manually
        if (_this4._aborted) {
          return;
        }

        _this4._emitXhrError(xhr, new Error("tus: failed to upload chunk at offset " + _this4._offset), err);
      };

      // Test support for progress events before attaching an event listener
      if ("upload" in xhr) {
        xhr.upload.onprogress = function (e) {
          if (!e.lengthComputable) {
            return;
          }

          _this4._emitProgress(start + e.loaded, _this4._size);
        };
      }

      this._setupXHR(xhr);

      xhr.setRequestHeader("Upload-Offset", this._offset);
      xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");

      var start = this._offset;
      var end = this._offset + this.options.chunkSize;

      // The specified chunkSize may be Infinity or the calcluated end position
      // may exceed the file's size. In both cases, we limit the end position to
      // the input's total size for simpler calculations and correctness.
      if (end === Infinity || end > this._size) {
        end = this._size;
      }

      xhr.send(this._source.slice(start, end));
    }
  }]);

  return Upload;
}();

function encodeMetadata(metadata) {
  if (!Base64.isSupported) {
    return "";
  }

  var encoded = [];

  for (var key in metadata) {
    encoded.push(key + " " + Base64.encode(metadata[key]));
  }

  return encoded.join(",");
}

Upload.defaultOptions = defaultOptions;

exports.default = Upload;
},{"./error":15,"./fingerprint":16,"./node/base64":11,"./node/request":12,"./node/source":13,"./node/storage":14,"extend":19}],19:[function(require,module,exports){
'use strict';

var hasOwn = Object.prototype.hasOwnProperty;
var toStr = Object.prototype.toString;

var isArray = function isArray(arr) {
	if (typeof Array.isArray === 'function') {
		return Array.isArray(arr);
	}

	return toStr.call(arr) === '[object Array]';
};

var isPlainObject = function isPlainObject(obj) {
	if (!obj || toStr.call(obj) !== '[object Object]') {
		return false;
	}

	var hasOwnConstructor = hasOwn.call(obj, 'constructor');
	var hasIsPrototypeOf = obj.constructor && obj.constructor.prototype && hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
	// Not own constructor property must be Object
	if (obj.constructor && !hasOwnConstructor && !hasIsPrototypeOf) {
		return false;
	}

	// Own properties are enumerated firstly, so to speed up,
	// if last one is own, then all properties are own.
	var key;
	for (key in obj) {/**/}

	return typeof key === 'undefined' || hasOwn.call(obj, key);
};

module.exports = function extend() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0],
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if (typeof target === 'boolean') {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	} else if ((typeof target !== 'object' && typeof target !== 'function') || target == null) {
		target = {};
	}

	for (; i < length; ++i) {
		options = arguments[i];
		// Only deal with non-null/undefined values
		if (options != null) {
			// Extend the base object
			for (name in options) {
				src = target[name];
				copy = options[name];

				// Prevent never-ending loop
				if (target !== copy) {
					// Recurse if we're merging plain objects or arrays
					if (deep && copy && (isPlainObject(copy) || (copyIsArray = isArray(copy)))) {
						if (copyIsArray) {
							copyIsArray = false;
							clone = src && isArray(src) ? src : [];
						} else {
							clone = src && isPlainObject(src) ? src : {};
						}

						// Never move original objects, clone them
						target[name] = extend(deep, clone, copy);

					// Don't bring in undefined values
					} else if (typeof copy !== 'undefined') {
						target[name] = copy;
					}
				}
			}
		}
	}

	// Return the modified object
	return target;
};


},{}],20:[function(require,module,exports){
// Copyright 2014 Simon Lydell
// X11 (“MIT”) Licensed. (See LICENSE.)

void (function(root, factory) {
  if (typeof define === "function" && define.amd) {
    define(factory)
  } else if (typeof exports === "object") {
    module.exports = factory()
  } else {
    root.resolveUrl = factory()
  }
}(this, function() {

  function resolveUrl(/* ...urls */) {
    var numUrls = arguments.length

    if (numUrls === 0) {
      throw new Error("resolveUrl requires at least one argument; got none.")
    }

    var base = document.createElement("base")
    base.href = arguments[0]

    if (numUrls === 1) {
      return base.href
    }

    var head = document.getElementsByTagName("head")[0]
    head.insertBefore(base, head.firstChild)

    var a = document.createElement("a")
    var resolved

    for (var index = 1; index < numUrls; index++) {
      a.href = arguments[index]
      resolved = a.href
      base.href = resolved
    }

    head.removeChild(base)

    return resolved
  }

  return resolveUrl

}));

},{}],21:[function(require,module,exports){
(function(self) {
  'use strict';

  if (self.fetch) {
    return
  }

  var support = {
    searchParams: 'URLSearchParams' in self,
    iterable: 'Symbol' in self && 'iterator' in Symbol,
    blob: 'FileReader' in self && 'Blob' in self && (function() {
      try {
        new Blob()
        return true
      } catch(e) {
        return false
      }
    })(),
    formData: 'FormData' in self,
    arrayBuffer: 'ArrayBuffer' in self
  }

  function normalizeName(name) {
    if (typeof name !== 'string') {
      name = String(name)
    }
    if (/[^a-z0-9\-#$%&'*+.\^_`|~]/i.test(name)) {
      throw new TypeError('Invalid character in header field name')
    }
    return name.toLowerCase()
  }

  function normalizeValue(value) {
    if (typeof value !== 'string') {
      value = String(value)
    }
    return value
  }

  // Build a destructive iterator for the value list
  function iteratorFor(items) {
    var iterator = {
      next: function() {
        var value = items.shift()
        return {done: value === undefined, value: value}
      }
    }

    if (support.iterable) {
      iterator[Symbol.iterator] = function() {
        return iterator
      }
    }

    return iterator
  }

  function Headers(headers) {
    this.map = {}

    if (headers instanceof Headers) {
      headers.forEach(function(value, name) {
        this.append(name, value)
      }, this)

    } else if (headers) {
      Object.getOwnPropertyNames(headers).forEach(function(name) {
        this.append(name, headers[name])
      }, this)
    }
  }

  Headers.prototype.append = function(name, value) {
    name = normalizeName(name)
    value = normalizeValue(value)
    var list = this.map[name]
    if (!list) {
      list = []
      this.map[name] = list
    }
    list.push(value)
  }

  Headers.prototype['delete'] = function(name) {
    delete this.map[normalizeName(name)]
  }

  Headers.prototype.get = function(name) {
    var values = this.map[normalizeName(name)]
    return values ? values[0] : null
  }

  Headers.prototype.getAll = function(name) {
    return this.map[normalizeName(name)] || []
  }

  Headers.prototype.has = function(name) {
    return this.map.hasOwnProperty(normalizeName(name))
  }

  Headers.prototype.set = function(name, value) {
    this.map[normalizeName(name)] = [normalizeValue(value)]
  }

  Headers.prototype.forEach = function(callback, thisArg) {
    Object.getOwnPropertyNames(this.map).forEach(function(name) {
      this.map[name].forEach(function(value) {
        callback.call(thisArg, value, name, this)
      }, this)
    }, this)
  }

  Headers.prototype.keys = function() {
    var items = []
    this.forEach(function(value, name) { items.push(name) })
    return iteratorFor(items)
  }

  Headers.prototype.values = function() {
    var items = []
    this.forEach(function(value) { items.push(value) })
    return iteratorFor(items)
  }

  Headers.prototype.entries = function() {
    var items = []
    this.forEach(function(value, name) { items.push([name, value]) })
    return iteratorFor(items)
  }

  if (support.iterable) {
    Headers.prototype[Symbol.iterator] = Headers.prototype.entries
  }

  function consumed(body) {
    if (body.bodyUsed) {
      return Promise.reject(new TypeError('Already read'))
    }
    body.bodyUsed = true
  }

  function fileReaderReady(reader) {
    return new Promise(function(resolve, reject) {
      reader.onload = function() {
        resolve(reader.result)
      }
      reader.onerror = function() {
        reject(reader.error)
      }
    })
  }

  function readBlobAsArrayBuffer(blob) {
    var reader = new FileReader()
    reader.readAsArrayBuffer(blob)
    return fileReaderReady(reader)
  }

  function readBlobAsText(blob) {
    var reader = new FileReader()
    reader.readAsText(blob)
    return fileReaderReady(reader)
  }

  function Body() {
    this.bodyUsed = false

    this._initBody = function(body) {
      this._bodyInit = body
      if (typeof body === 'string') {
        this._bodyText = body
      } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
        this._bodyBlob = body
      } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
        this._bodyFormData = body
      } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
        this._bodyText = body.toString()
      } else if (!body) {
        this._bodyText = ''
      } else if (support.arrayBuffer && ArrayBuffer.prototype.isPrototypeOf(body)) {
        // Only support ArrayBuffers for POST method.
        // Receiving ArrayBuffers happens via Blobs, instead.
      } else {
        throw new Error('unsupported BodyInit type')
      }

      if (!this.headers.get('content-type')) {
        if (typeof body === 'string') {
          this.headers.set('content-type', 'text/plain;charset=UTF-8')
        } else if (this._bodyBlob && this._bodyBlob.type) {
          this.headers.set('content-type', this._bodyBlob.type)
        } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
          this.headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8')
        }
      }
    }

    if (support.blob) {
      this.blob = function() {
        var rejected = consumed(this)
        if (rejected) {
          return rejected
        }

        if (this._bodyBlob) {
          return Promise.resolve(this._bodyBlob)
        } else if (this._bodyFormData) {
          throw new Error('could not read FormData body as blob')
        } else {
          return Promise.resolve(new Blob([this._bodyText]))
        }
      }

      this.arrayBuffer = function() {
        return this.blob().then(readBlobAsArrayBuffer)
      }

      this.text = function() {
        var rejected = consumed(this)
        if (rejected) {
          return rejected
        }

        if (this._bodyBlob) {
          return readBlobAsText(this._bodyBlob)
        } else if (this._bodyFormData) {
          throw new Error('could not read FormData body as text')
        } else {
          return Promise.resolve(this._bodyText)
        }
      }
    } else {
      this.text = function() {
        var rejected = consumed(this)
        return rejected ? rejected : Promise.resolve(this._bodyText)
      }
    }

    if (support.formData) {
      this.formData = function() {
        return this.text().then(decode)
      }
    }

    this.json = function() {
      return this.text().then(JSON.parse)
    }

    return this
  }

  // HTTP methods whose capitalization should be normalized
  var methods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT']

  function normalizeMethod(method) {
    var upcased = method.toUpperCase()
    return (methods.indexOf(upcased) > -1) ? upcased : method
  }

  function Request(input, options) {
    options = options || {}
    var body = options.body
    if (Request.prototype.isPrototypeOf(input)) {
      if (input.bodyUsed) {
        throw new TypeError('Already read')
      }
      this.url = input.url
      this.credentials = input.credentials
      if (!options.headers) {
        this.headers = new Headers(input.headers)
      }
      this.method = input.method
      this.mode = input.mode
      if (!body) {
        body = input._bodyInit
        input.bodyUsed = true
      }
    } else {
      this.url = input
    }

    this.credentials = options.credentials || this.credentials || 'omit'
    if (options.headers || !this.headers) {
      this.headers = new Headers(options.headers)
    }
    this.method = normalizeMethod(options.method || this.method || 'GET')
    this.mode = options.mode || this.mode || null
    this.referrer = null

    if ((this.method === 'GET' || this.method === 'HEAD') && body) {
      throw new TypeError('Body not allowed for GET or HEAD requests')
    }
    this._initBody(body)
  }

  Request.prototype.clone = function() {
    return new Request(this)
  }

  function decode(body) {
    var form = new FormData()
    body.trim().split('&').forEach(function(bytes) {
      if (bytes) {
        var split = bytes.split('=')
        var name = split.shift().replace(/\+/g, ' ')
        var value = split.join('=').replace(/\+/g, ' ')
        form.append(decodeURIComponent(name), decodeURIComponent(value))
      }
    })
    return form
  }

  function headers(xhr) {
    var head = new Headers()
    var pairs = (xhr.getAllResponseHeaders() || '').trim().split('\n')
    pairs.forEach(function(header) {
      var split = header.trim().split(':')
      var key = split.shift().trim()
      var value = split.join(':').trim()
      head.append(key, value)
    })
    return head
  }

  Body.call(Request.prototype)

  function Response(bodyInit, options) {
    if (!options) {
      options = {}
    }

    this.type = 'default'
    this.status = options.status
    this.ok = this.status >= 200 && this.status < 300
    this.statusText = options.statusText
    this.headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers)
    this.url = options.url || ''
    this._initBody(bodyInit)
  }

  Body.call(Response.prototype)

  Response.prototype.clone = function() {
    return new Response(this._bodyInit, {
      status: this.status,
      statusText: this.statusText,
      headers: new Headers(this.headers),
      url: this.url
    })
  }

  Response.error = function() {
    var response = new Response(null, {status: 0, statusText: ''})
    response.type = 'error'
    return response
  }

  var redirectStatuses = [301, 302, 303, 307, 308]

  Response.redirect = function(url, status) {
    if (redirectStatuses.indexOf(status) === -1) {
      throw new RangeError('Invalid status code')
    }

    return new Response(null, {status: status, headers: {location: url}})
  }

  self.Headers = Headers
  self.Request = Request
  self.Response = Response

  self.fetch = function(input, init) {
    return new Promise(function(resolve, reject) {
      var request
      if (Request.prototype.isPrototypeOf(input) && !init) {
        request = input
      } else {
        request = new Request(input, init)
      }

      var xhr = new XMLHttpRequest()

      function responseURL() {
        if ('responseURL' in xhr) {
          return xhr.responseURL
        }

        // Avoid security warnings on getResponseHeader when not allowed by CORS
        if (/^X-Request-URL:/m.test(xhr.getAllResponseHeaders())) {
          return xhr.getResponseHeader('X-Request-URL')
        }

        return
      }

      xhr.onload = function() {
        var options = {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: headers(xhr),
          url: responseURL()
        }
        var body = 'response' in xhr ? xhr.response : xhr.responseText
        resolve(new Response(body, options))
      }

      xhr.onerror = function() {
        reject(new TypeError('Network request failed'))
      }

      xhr.ontimeout = function() {
        reject(new TypeError('Network request failed'))
      }

      xhr.open(request.method, request.url, true)

      if (request.credentials === 'include') {
        xhr.withCredentials = true
      }

      if ('responseType' in xhr && support.blob) {
        xhr.responseType = 'blob'
      }

      request.headers.forEach(function(value, name) {
        xhr.setRequestHeader(name, value)
      })

      xhr.send(typeof request._bodyInit === 'undefined' ? null : request._bodyInit)
    })
  }
  self.fetch.polyfill = true
})(typeof self !== 'undefined' ? self : this);

},{}],22:[function(require,module,exports){
var bel = require('bel') // turns template tag into DOM elements
var morphdom = require('morphdom') // efficiently diffs + morphs two DOM elements
var defaultEvents = require('./update-events.js') // default events to be copied when dom elements update

module.exports = bel

// TODO move this + defaultEvents to a new module once we receive more feedback
module.exports.update = function (fromNode, toNode, opts) {
  if (!opts) opts = {}
  if (opts.events !== false) {
    if (!opts.onBeforeElUpdated) opts.onBeforeElUpdated = copier
  }

  return morphdom(fromNode, toNode, opts)

  // morphdom only copies attributes. we decided we also wanted to copy events
  // that can be set via attributes
  function copier (f, t) {
    // copy events:
    var events = opts.events || defaultEvents
    for (var i = 0; i < events.length; i++) {
      var ev = events[i]
      if (t[ev]) { // if new element has a whitelisted attribute
        f[ev] = t[ev] // update existing element
      } else if (f[ev]) { // if existing element has it and new one doesnt
        f[ev] = undefined // remove it from existing element
      }
    }
    var oldValue = f.value
    var newValue = t.value
    // copy values for form elements
    if ((f.nodeName === 'INPUT' && f.type !== 'file') || f.nodeName === 'SELECT') {
      if (!newValue) {
        t.value = f.value
      } else if (newValue !== oldValue) {
        f.value = newValue
      }
    } else if (f.nodeName === 'TEXTAREA') {
      if (t.getAttribute('value') === null) f.value = t.value
    }
  }
}

},{"./update-events.js":30,"bel":23,"morphdom":29}],23:[function(require,module,exports){
var document = require('global/document')
var hyperx = require('hyperx')
var onload = require('on-load')

var SVGNS = 'http://www.w3.org/2000/svg'
var XLINKNS = 'http://www.w3.org/1999/xlink'

var BOOL_PROPS = {
  autofocus: 1,
  checked: 1,
  defaultchecked: 1,
  disabled: 1,
  formnovalidate: 1,
  indeterminate: 1,
  readonly: 1,
  required: 1,
  selected: 1,
  willvalidate: 1
}
var SVG_TAGS = [
  'svg',
  'altGlyph', 'altGlyphDef', 'altGlyphItem', 'animate', 'animateColor',
  'animateMotion', 'animateTransform', 'circle', 'clipPath', 'color-profile',
  'cursor', 'defs', 'desc', 'ellipse', 'feBlend', 'feColorMatrix',
  'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
  'feDisplacementMap', 'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB',
  'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode',
  'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting',
  'feSpotLight', 'feTile', 'feTurbulence', 'filter', 'font', 'font-face',
  'font-face-format', 'font-face-name', 'font-face-src', 'font-face-uri',
  'foreignObject', 'g', 'glyph', 'glyphRef', 'hkern', 'image', 'line',
  'linearGradient', 'marker', 'mask', 'metadata', 'missing-glyph', 'mpath',
  'path', 'pattern', 'polygon', 'polyline', 'radialGradient', 'rect',
  'set', 'stop', 'switch', 'symbol', 'text', 'textPath', 'title', 'tref',
  'tspan', 'use', 'view', 'vkern'
]

function belCreateElement (tag, props, children) {
  var el

  // If an svg tag, it needs a namespace
  if (SVG_TAGS.indexOf(tag) !== -1) {
    props.namespace = SVGNS
  }

  // If we are using a namespace
  var ns = false
  if (props.namespace) {
    ns = props.namespace
    delete props.namespace
  }

  // Create the element
  if (ns) {
    el = document.createElementNS(ns, tag)
  } else {
    el = document.createElement(tag)
  }

  // If adding onload events
  if (props.onload || props.onunload) {
    var load = props.onload || function () {}
    var unload = props.onunload || function () {}
    onload(el, function belOnload () {
      load(el)
    }, function belOnunload () {
      unload(el)
    },
    // We have to use non-standard `caller` to find who invokes `belCreateElement`
    belCreateElement.caller.caller.caller)
    delete props.onload
    delete props.onunload
  }

  // Create the properties
  for (var p in props) {
    if (props.hasOwnProperty(p)) {
      var key = p.toLowerCase()
      var val = props[p]
      // Normalize className
      if (key === 'classname') {
        key = 'class'
        p = 'class'
      }
      // The for attribute gets transformed to htmlFor, but we just set as for
      if (p === 'htmlFor') {
        p = 'for'
      }
      // If a property is boolean, set itself to the key
      if (BOOL_PROPS[key]) {
        if (val === 'true') val = key
        else if (val === 'false') continue
      }
      // If a property prefers being set directly vs setAttribute
      if (key.slice(0, 2) === 'on') {
        el[p] = val
      } else {
        if (ns) {
          if (p === 'xlink:href') {
            el.setAttributeNS(XLINKNS, p, val)
          } else if (/^xmlns($|:)/i.test(p)) {
            // skip xmlns definitions
          } else {
            el.setAttributeNS(null, p, val)
          }
        } else {
          el.setAttribute(p, val)
        }
      }
    }
  }

  function appendChild (childs) {
    if (!Array.isArray(childs)) return
    for (var i = 0; i < childs.length; i++) {
      var node = childs[i]
      if (Array.isArray(node)) {
        appendChild(node)
        continue
      }

      if (typeof node === 'number' ||
        typeof node === 'boolean' ||
        node instanceof Date ||
        node instanceof RegExp) {
        node = node.toString()
      }

      if (typeof node === 'string') {
        if (el.lastChild && el.lastChild.nodeName === '#text') {
          el.lastChild.nodeValue += node
          continue
        }
        node = document.createTextNode(node)
      }

      if (node && node.nodeType) {
        el.appendChild(node)
      }
    }
  }
  appendChild(children)

  return el
}

module.exports = hyperx(belCreateElement)
module.exports.default = module.exports
module.exports.createElement = belCreateElement

},{"global/document":24,"hyperx":26,"on-load":28}],24:[function(require,module,exports){
(function (global){
var topLevel = typeof global !== 'undefined' ? global :
    typeof window !== 'undefined' ? window : {}
var minDoc = require('min-document');

if (typeof document !== 'undefined') {
    module.exports = document;
} else {
    var doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'];

    if (!doccy) {
        doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'] = minDoc;
    }

    module.exports = doccy;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"min-document":74}],25:[function(require,module,exports){
(function (global){
if (typeof window !== "undefined") {
    module.exports = window;
} else if (typeof global !== "undefined") {
    module.exports = global;
} else if (typeof self !== "undefined"){
    module.exports = self;
} else {
    module.exports = {};
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],26:[function(require,module,exports){
var attrToProp = require('hyperscript-attribute-to-property')

var VAR = 0, TEXT = 1, OPEN = 2, CLOSE = 3, ATTR = 4
var ATTR_KEY = 5, ATTR_KEY_W = 6
var ATTR_VALUE_W = 7, ATTR_VALUE = 8
var ATTR_VALUE_SQ = 9, ATTR_VALUE_DQ = 10
var ATTR_EQ = 11, ATTR_BREAK = 12

module.exports = function (h, opts) {
  h = attrToProp(h)
  if (!opts) opts = {}
  var concat = opts.concat || function (a, b) {
    return String(a) + String(b)
  }

  return function (strings) {
    var state = TEXT, reg = ''
    var arglen = arguments.length
    var parts = []

    for (var i = 0; i < strings.length; i++) {
      if (i < arglen - 1) {
        var arg = arguments[i+1]
        var p = parse(strings[i])
        var xstate = state
        if (xstate === ATTR_VALUE_DQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_SQ) xstate = ATTR_VALUE
        if (xstate === ATTR_VALUE_W) xstate = ATTR_VALUE
        if (xstate === ATTR) xstate = ATTR_KEY
        p.push([ VAR, xstate, arg ])
        parts.push.apply(parts, p)
      } else parts.push.apply(parts, parse(strings[i]))
    }

    var tree = [null,{},[]]
    var stack = [[tree,-1]]
    for (var i = 0; i < parts.length; i++) {
      var cur = stack[stack.length-1][0]
      var p = parts[i], s = p[0]
      if (s === OPEN && /^\//.test(p[1])) {
        var ix = stack[stack.length-1][1]
        if (stack.length > 1) {
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === OPEN) {
        var c = [p[1],{},[]]
        cur[2].push(c)
        stack.push([c,cur[2].length-1])
      } else if (s === ATTR_KEY || (s === VAR && p[1] === ATTR_KEY)) {
        var key = ''
        var copyKey
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_KEY) {
            key = concat(key, parts[i][1])
          } else if (parts[i][0] === VAR && parts[i][1] === ATTR_KEY) {
            if (typeof parts[i][2] === 'object' && !key) {
              for (copyKey in parts[i][2]) {
                if (parts[i][2].hasOwnProperty(copyKey) && !cur[1][copyKey]) {
                  cur[1][copyKey] = parts[i][2][copyKey]
                }
              }
            } else {
              key = concat(key, parts[i][2])
            }
          } else break
        }
        if (parts[i][0] === ATTR_EQ) i++
        var j = i
        for (; i < parts.length; i++) {
          if (parts[i][0] === ATTR_VALUE || parts[i][0] === ATTR_KEY) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][1])
            else cur[1][key] = concat(cur[1][key], parts[i][1])
          } else if (parts[i][0] === VAR
          && (parts[i][1] === ATTR_VALUE || parts[i][1] === ATTR_KEY)) {
            if (!cur[1][key]) cur[1][key] = strfn(parts[i][2])
            else cur[1][key] = concat(cur[1][key], parts[i][2])
          } else {
            if (key.length && !cur[1][key] && i === j
            && (parts[i][0] === CLOSE || parts[i][0] === ATTR_BREAK)) {
              // https://html.spec.whatwg.org/multipage/infrastructure.html#boolean-attributes
              // empty string is falsy, not well behaved value in browser
              cur[1][key] = key.toLowerCase()
            }
            break
          }
        }
      } else if (s === ATTR_KEY) {
        cur[1][p[1]] = true
      } else if (s === VAR && p[1] === ATTR_KEY) {
        cur[1][p[2]] = true
      } else if (s === CLOSE) {
        if (selfClosing(cur[0]) && stack.length) {
          var ix = stack[stack.length-1][1]
          stack.pop()
          stack[stack.length-1][0][2][ix] = h(
            cur[0], cur[1], cur[2].length ? cur[2] : undefined
          )
        }
      } else if (s === VAR && p[1] === TEXT) {
        if (p[2] === undefined || p[2] === null) p[2] = ''
        else if (!p[2]) p[2] = concat('', p[2])
        if (Array.isArray(p[2][0])) {
          cur[2].push.apply(cur[2], p[2])
        } else {
          cur[2].push(p[2])
        }
      } else if (s === TEXT) {
        cur[2].push(p[1])
      } else if (s === ATTR_EQ || s === ATTR_BREAK) {
        // no-op
      } else {
        throw new Error('unhandled: ' + s)
      }
    }

    if (tree[2].length > 1 && /^\s*$/.test(tree[2][0])) {
      tree[2].shift()
    }

    if (tree[2].length > 2
    || (tree[2].length === 2 && /\S/.test(tree[2][1]))) {
      throw new Error(
        'multiple root elements must be wrapped in an enclosing tag'
      )
    }
    if (Array.isArray(tree[2][0]) && typeof tree[2][0][0] === 'string'
    && Array.isArray(tree[2][0][2])) {
      tree[2][0] = h(tree[2][0][0], tree[2][0][1], tree[2][0][2])
    }
    return tree[2][0]

    function parse (str) {
      var res = []
      if (state === ATTR_VALUE_W) state = ATTR
      for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i)
        if (state === TEXT && c === '<') {
          if (reg.length) res.push([TEXT, reg])
          reg = ''
          state = OPEN
        } else if (c === '>' && !quot(state)) {
          if (state === OPEN) {
            res.push([OPEN,reg])
          } else if (state === ATTR_KEY) {
            res.push([ATTR_KEY,reg])
          } else if (state === ATTR_VALUE && reg.length) {
            res.push([ATTR_VALUE,reg])
          }
          res.push([CLOSE])
          reg = ''
          state = TEXT
        } else if (state === TEXT) {
          reg += c
        } else if (state === OPEN && /\s/.test(c)) {
          res.push([OPEN, reg])
          reg = ''
          state = ATTR
        } else if (state === OPEN) {
          reg += c
        } else if (state === ATTR && /[\w-]/.test(c)) {
          state = ATTR_KEY
          reg = c
        } else if (state === ATTR && /\s/.test(c)) {
          if (reg.length) res.push([ATTR_KEY,reg])
          res.push([ATTR_BREAK])
        } else if (state === ATTR_KEY && /\s/.test(c)) {
          res.push([ATTR_KEY,reg])
          reg = ''
          state = ATTR_KEY_W
        } else if (state === ATTR_KEY && c === '=') {
          res.push([ATTR_KEY,reg],[ATTR_EQ])
          reg = ''
          state = ATTR_VALUE_W
        } else if (state === ATTR_KEY) {
          reg += c
        } else if ((state === ATTR_KEY_W || state === ATTR) && c === '=') {
          res.push([ATTR_EQ])
          state = ATTR_VALUE_W
        } else if ((state === ATTR_KEY_W || state === ATTR) && !/\s/.test(c)) {
          res.push([ATTR_BREAK])
          if (/[\w-]/.test(c)) {
            reg += c
            state = ATTR_KEY
          } else state = ATTR
        } else if (state === ATTR_VALUE_W && c === '"') {
          state = ATTR_VALUE_DQ
        } else if (state === ATTR_VALUE_W && c === "'") {
          state = ATTR_VALUE_SQ
        } else if (state === ATTR_VALUE_DQ && c === '"') {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_SQ && c === "'") {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE_W && !/\s/.test(c)) {
          state = ATTR_VALUE
          i--
        } else if (state === ATTR_VALUE && /\s/.test(c)) {
          res.push([ATTR_VALUE,reg],[ATTR_BREAK])
          reg = ''
          state = ATTR
        } else if (state === ATTR_VALUE || state === ATTR_VALUE_SQ
        || state === ATTR_VALUE_DQ) {
          reg += c
        }
      }
      if (state === TEXT && reg.length) {
        res.push([TEXT,reg])
        reg = ''
      } else if (state === ATTR_VALUE && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_DQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_VALUE_SQ && reg.length) {
        res.push([ATTR_VALUE,reg])
        reg = ''
      } else if (state === ATTR_KEY) {
        res.push([ATTR_KEY,reg])
        reg = ''
      }
      return res
    }
  }

  function strfn (x) {
    if (typeof x === 'function') return x
    else if (typeof x === 'string') return x
    else if (x && typeof x === 'object') return x
    else return concat('', x)
  }
}

function quot (state) {
  return state === ATTR_VALUE_SQ || state === ATTR_VALUE_DQ
}

var hasOwn = Object.prototype.hasOwnProperty
function has (obj, key) { return hasOwn.call(obj, key) }

var closeRE = RegExp('^(' + [
  'area', 'base', 'basefont', 'bgsound', 'br', 'col', 'command', 'embed',
  'frame', 'hr', 'img', 'input', 'isindex', 'keygen', 'link', 'meta', 'param',
  'source', 'track', 'wbr',
  // SVG TAGS
  'animate', 'animateTransform', 'circle', 'cursor', 'desc', 'ellipse',
  'feBlend', 'feColorMatrix', 'feComposite',
  'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
  'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
  'feGaussianBlur', 'feImage', 'feMergeNode', 'feMorphology',
  'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
  'feTurbulence', 'font-face-format', 'font-face-name', 'font-face-uri',
  'glyph', 'glyphRef', 'hkern', 'image', 'line', 'missing-glyph', 'mpath',
  'path', 'polygon', 'polyline', 'rect', 'set', 'stop', 'tref', 'use', 'view',
  'vkern'
].join('|') + ')(?:[\.#][a-zA-Z0-9\u007F-\uFFFF_:-]+)*$')
function selfClosing (tag) { return closeRE.test(tag) }

},{"hyperscript-attribute-to-property":27}],27:[function(require,module,exports){
module.exports = attributeToProperty

var transform = {
  'class': 'className',
  'for': 'htmlFor',
  'http-equiv': 'httpEquiv'
}

function attributeToProperty (h) {
  return function (tagName, attrs, children) {
    for (var attr in attrs) {
      if (attr in transform) {
        attrs[transform[attr]] = attrs[attr]
        delete attrs[attr]
      }
    }
    return h(tagName, attrs, children)
  }
}

},{}],28:[function(require,module,exports){
arguments[4][7][0].apply(exports,arguments)
},{"dup":7,"global/document":24,"global/window":25}],29:[function(require,module,exports){
'use strict';

var range; // Create a range object for efficently rendering strings to elements.
var NS_XHTML = 'http://www.w3.org/1999/xhtml';

var doc = typeof document === 'undefined' ? undefined : document;

var testEl = doc ?
    doc.body || doc.createElement('div') :
    {};

// Fixes <https://github.com/patrick-steele-idem/morphdom/issues/32>
// (IE7+ support) <=IE7 does not support el.hasAttribute(name)
var actualHasAttributeNS;

if (testEl.hasAttributeNS) {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.hasAttributeNS(namespaceURI, name);
    };
} else if (testEl.hasAttribute) {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.hasAttribute(name);
    };
} else {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.getAttributeNode(namespaceURI, name) != null;
    };
}

var hasAttributeNS = actualHasAttributeNS;


function toElement(str) {
    if (!range && doc.createRange) {
        range = doc.createRange();
        range.selectNode(doc.body);
    }

    var fragment;
    if (range && range.createContextualFragment) {
        fragment = range.createContextualFragment(str);
    } else {
        fragment = doc.createElement('body');
        fragment.innerHTML = str;
    }
    return fragment.childNodes[0];
}

/**
 * Returns true if two node's names are the same.
 *
 * NOTE: We don't bother checking `namespaceURI` because you will never find two HTML elements with the same
 *       nodeName and different namespace URIs.
 *
 * @param {Element} a
 * @param {Element} b The target element
 * @return {boolean}
 */
function compareNodeNames(fromEl, toEl) {
    var fromNodeName = fromEl.nodeName;
    var toNodeName = toEl.nodeName;

    if (fromNodeName === toNodeName) {
        return true;
    }

    if (toEl.actualize &&
        fromNodeName.charCodeAt(0) < 91 && /* from tag name is upper case */
        toNodeName.charCodeAt(0) > 90 /* target tag name is lower case */) {
        // If the target element is a virtual DOM node then we may need to normalize the tag name
        // before comparing. Normal HTML elements that are in the "http://www.w3.org/1999/xhtml"
        // are converted to upper case
        return fromNodeName === toNodeName.toUpperCase();
    } else {
        return false;
    }
}

/**
 * Create an element, optionally with a known namespace URI.
 *
 * @param {string} name the element name, e.g. 'div' or 'svg'
 * @param {string} [namespaceURI] the element's namespace URI, i.e. the value of
 * its `xmlns` attribute or its inferred namespace.
 *
 * @return {Element}
 */
function createElementNS(name, namespaceURI) {
    return !namespaceURI || namespaceURI === NS_XHTML ?
        doc.createElement(name) :
        doc.createElementNS(namespaceURI, name);
}

/**
 * Copies the children of one DOM element to another DOM element
 */
function moveChildren(fromEl, toEl) {
    var curChild = fromEl.firstChild;
    while (curChild) {
        var nextChild = curChild.nextSibling;
        toEl.appendChild(curChild);
        curChild = nextChild;
    }
    return toEl;
}

function morphAttrs(fromNode, toNode) {
    var attrs = toNode.attributes;
    var i;
    var attr;
    var attrName;
    var attrNamespaceURI;
    var attrValue;
    var fromValue;

    for (i = attrs.length - 1; i >= 0; --i) {
        attr = attrs[i];
        attrName = attr.name;
        attrNamespaceURI = attr.namespaceURI;
        attrValue = attr.value;

        if (attrNamespaceURI) {
            attrName = attr.localName || attrName;
            fromValue = fromNode.getAttributeNS(attrNamespaceURI, attrName);

            if (fromValue !== attrValue) {
                fromNode.setAttributeNS(attrNamespaceURI, attrName, attrValue);
            }
        } else {
            fromValue = fromNode.getAttribute(attrName);

            if (fromValue !== attrValue) {
                fromNode.setAttribute(attrName, attrValue);
            }
        }
    }

    // Remove any extra attributes found on the original DOM element that
    // weren't found on the target element.
    attrs = fromNode.attributes;

    for (i = attrs.length - 1; i >= 0; --i) {
        attr = attrs[i];
        if (attr.specified !== false) {
            attrName = attr.name;
            attrNamespaceURI = attr.namespaceURI;

            if (attrNamespaceURI) {
                attrName = attr.localName || attrName;

                if (!hasAttributeNS(toNode, attrNamespaceURI, attrName)) {
                    fromNode.removeAttributeNS(attrNamespaceURI, attrName);
                }
            } else {
                if (!hasAttributeNS(toNode, null, attrName)) {
                    fromNode.removeAttribute(attrName);
                }
            }
        }
    }
}

function syncBooleanAttrProp(fromEl, toEl, name) {
    if (fromEl[name] !== toEl[name]) {
        fromEl[name] = toEl[name];
        if (fromEl[name]) {
            fromEl.setAttribute(name, '');
        } else {
            fromEl.removeAttribute(name, '');
        }
    }
}

var specialElHandlers = {
    /**
     * Needed for IE. Apparently IE doesn't think that "selected" is an
     * attribute when reading over the attributes using selectEl.attributes
     */
    OPTION: function(fromEl, toEl) {
        syncBooleanAttrProp(fromEl, toEl, 'selected');
    },
    /**
     * The "value" attribute is special for the <input> element since it sets
     * the initial value. Changing the "value" attribute without changing the
     * "value" property will have no effect since it is only used to the set the
     * initial value.  Similar for the "checked" attribute, and "disabled".
     */
    INPUT: function(fromEl, toEl) {
        syncBooleanAttrProp(fromEl, toEl, 'checked');
        syncBooleanAttrProp(fromEl, toEl, 'disabled');

        if (fromEl.value !== toEl.value) {
            fromEl.value = toEl.value;
        }

        if (!hasAttributeNS(toEl, null, 'value')) {
            fromEl.removeAttribute('value');
        }
    },

    TEXTAREA: function(fromEl, toEl) {
        var newValue = toEl.value;
        if (fromEl.value !== newValue) {
            fromEl.value = newValue;
        }

        if (fromEl.firstChild) {
            // Needed for IE. Apparently IE sets the placeholder as the
            // node value and vise versa. This ignores an empty update.
            if (newValue === '' && fromEl.firstChild.nodeValue === fromEl.placeholder) {
                return;
            }

            fromEl.firstChild.nodeValue = newValue;
        }
    },
    SELECT: function(fromEl, toEl) {
        if (!hasAttributeNS(toEl, null, 'multiple')) {
            var selectedIndex = -1;
            var i = 0;
            var curChild = toEl.firstChild;
            while(curChild) {
                var nodeName = curChild.nodeName;
                if (nodeName && nodeName.toUpperCase() === 'OPTION') {
                    if (hasAttributeNS(curChild, null, 'selected')) {
                        selectedIndex = i;
                        break;
                    }
                    i++;
                }
                curChild = curChild.nextSibling;
            }

            fromEl.selectedIndex = i;
        }
    }
};

var ELEMENT_NODE = 1;
var TEXT_NODE = 3;
var COMMENT_NODE = 8;

function noop() {}

function defaultGetNodeKey(node) {
    return node.id;
}

function morphdomFactory(morphAttrs) {

    return function morphdom(fromNode, toNode, options) {
        if (!options) {
            options = {};
        }

        if (typeof toNode === 'string') {
            if (fromNode.nodeName === '#document' || fromNode.nodeName === 'HTML') {
                var toNodeHtml = toNode;
                toNode = doc.createElement('html');
                toNode.innerHTML = toNodeHtml;
            } else {
                toNode = toElement(toNode);
            }
        }

        var getNodeKey = options.getNodeKey || defaultGetNodeKey;
        var onBeforeNodeAdded = options.onBeforeNodeAdded || noop;
        var onNodeAdded = options.onNodeAdded || noop;
        var onBeforeElUpdated = options.onBeforeElUpdated || noop;
        var onElUpdated = options.onElUpdated || noop;
        var onBeforeNodeDiscarded = options.onBeforeNodeDiscarded || noop;
        var onNodeDiscarded = options.onNodeDiscarded || noop;
        var onBeforeElChildrenUpdated = options.onBeforeElChildrenUpdated || noop;
        var childrenOnly = options.childrenOnly === true;

        // This object is used as a lookup to quickly find all keyed elements in the original DOM tree.
        var fromNodesLookup = {};
        var keyedRemovalList;

        function addKeyedRemoval(key) {
            if (keyedRemovalList) {
                keyedRemovalList.push(key);
            } else {
                keyedRemovalList = [key];
            }
        }

        function walkDiscardedChildNodes(node, skipKeyedNodes) {
            if (node.nodeType === ELEMENT_NODE) {
                var curChild = node.firstChild;
                while (curChild) {

                    var key = undefined;

                    if (skipKeyedNodes && (key = getNodeKey(curChild))) {
                        // If we are skipping keyed nodes then we add the key
                        // to a list so that it can be handled at the very end.
                        addKeyedRemoval(key);
                    } else {
                        // Only report the node as discarded if it is not keyed. We do this because
                        // at the end we loop through all keyed elements that were unmatched
                        // and then discard them in one final pass.
                        onNodeDiscarded(curChild);
                        if (curChild.firstChild) {
                            walkDiscardedChildNodes(curChild, skipKeyedNodes);
                        }
                    }

                    curChild = curChild.nextSibling;
                }
            }
        }

        /**
         * Removes a DOM node out of the original DOM
         *
         * @param  {Node} node The node to remove
         * @param  {Node} parentNode The nodes parent
         * @param  {Boolean} skipKeyedNodes If true then elements with keys will be skipped and not discarded.
         * @return {undefined}
         */
        function removeNode(node, parentNode, skipKeyedNodes) {
            if (onBeforeNodeDiscarded(node) === false) {
                return;
            }

            if (parentNode) {
                parentNode.removeChild(node);
            }

            onNodeDiscarded(node);
            walkDiscardedChildNodes(node, skipKeyedNodes);
        }

        // // TreeWalker implementation is no faster, but keeping this around in case this changes in the future
        // function indexTree(root) {
        //     var treeWalker = document.createTreeWalker(
        //         root,
        //         NodeFilter.SHOW_ELEMENT);
        //
        //     var el;
        //     while((el = treeWalker.nextNode())) {
        //         var key = getNodeKey(el);
        //         if (key) {
        //             fromNodesLookup[key] = el;
        //         }
        //     }
        // }

        // // NodeIterator implementation is no faster, but keeping this around in case this changes in the future
        //
        // function indexTree(node) {
        //     var nodeIterator = document.createNodeIterator(node, NodeFilter.SHOW_ELEMENT);
        //     var el;
        //     while((el = nodeIterator.nextNode())) {
        //         var key = getNodeKey(el);
        //         if (key) {
        //             fromNodesLookup[key] = el;
        //         }
        //     }
        // }

        function indexTree(node) {
            if (node.nodeType === ELEMENT_NODE) {
                var curChild = node.firstChild;
                while (curChild) {
                    var key = getNodeKey(curChild);
                    if (key) {
                        fromNodesLookup[key] = curChild;
                    }

                    // Walk recursively
                    indexTree(curChild);

                    curChild = curChild.nextSibling;
                }
            }
        }

        indexTree(fromNode);

        function handleNodeAdded(el) {
            onNodeAdded(el);

            var curChild = el.firstChild;
            while (curChild) {
                var nextSibling = curChild.nextSibling;

                var key = getNodeKey(curChild);
                if (key) {
                    var unmatchedFromEl = fromNodesLookup[key];
                    if (unmatchedFromEl && compareNodeNames(curChild, unmatchedFromEl)) {
                        curChild.parentNode.replaceChild(unmatchedFromEl, curChild);
                        morphEl(unmatchedFromEl, curChild);
                    }
                }

                handleNodeAdded(curChild);
                curChild = nextSibling;
            }
        }

        function morphEl(fromEl, toEl, childrenOnly) {
            var toElKey = getNodeKey(toEl);
            var curFromNodeKey;

            if (toElKey) {
                // If an element with an ID is being morphed then it is will be in the final
                // DOM so clear it out of the saved elements collection
                delete fromNodesLookup[toElKey];
            }

            if (toNode.isSameNode && toNode.isSameNode(fromNode)) {
                return;
            }

            if (!childrenOnly) {
                if (onBeforeElUpdated(fromEl, toEl) === false) {
                    return;
                }

                morphAttrs(fromEl, toEl);
                onElUpdated(fromEl);

                if (onBeforeElChildrenUpdated(fromEl, toEl) === false) {
                    return;
                }
            }

            if (fromEl.nodeName !== 'TEXTAREA') {
                var curToNodeChild = toEl.firstChild;
                var curFromNodeChild = fromEl.firstChild;
                var curToNodeKey;

                var fromNextSibling;
                var toNextSibling;
                var matchingFromEl;

                outer: while (curToNodeChild) {
                    toNextSibling = curToNodeChild.nextSibling;
                    curToNodeKey = getNodeKey(curToNodeChild);

                    while (curFromNodeChild) {
                        fromNextSibling = curFromNodeChild.nextSibling;

                        if (curToNodeChild.isSameNode && curToNodeChild.isSameNode(curFromNodeChild)) {
                            curToNodeChild = toNextSibling;
                            curFromNodeChild = fromNextSibling;
                            continue outer;
                        }

                        curFromNodeKey = getNodeKey(curFromNodeChild);

                        var curFromNodeType = curFromNodeChild.nodeType;

                        var isCompatible = undefined;

                        if (curFromNodeType === curToNodeChild.nodeType) {
                            if (curFromNodeType === ELEMENT_NODE) {
                                // Both nodes being compared are Element nodes

                                if (curToNodeKey) {
                                    // The target node has a key so we want to match it up with the correct element
                                    // in the original DOM tree
                                    if (curToNodeKey !== curFromNodeKey) {
                                        // The current element in the original DOM tree does not have a matching key so
                                        // let's check our lookup to see if there is a matching element in the original
                                        // DOM tree
                                        if ((matchingFromEl = fromNodesLookup[curToNodeKey])) {
                                            if (curFromNodeChild.nextSibling === matchingFromEl) {
                                                // Special case for single element removals. To avoid removing the original
                                                // DOM node out of the tree (since that can break CSS transitions, etc.),
                                                // we will instead discard the current node and wait until the next
                                                // iteration to properly match up the keyed target element with its matching
                                                // element in the original tree
                                                isCompatible = false;
                                            } else {
                                                // We found a matching keyed element somewhere in the original DOM tree.
                                                // Let's moving the original DOM node into the current position and morph
                                                // it.

                                                // NOTE: We use insertBefore instead of replaceChild because we want to go through
                                                // the `removeNode()` function for the node that is being discarded so that
                                                // all lifecycle hooks are correctly invoked
                                                fromEl.insertBefore(matchingFromEl, curFromNodeChild);

                                                fromNextSibling = curFromNodeChild.nextSibling;

                                                if (curFromNodeKey) {
                                                    // Since the node is keyed it might be matched up later so we defer
                                                    // the actual removal to later
                                                    addKeyedRemoval(curFromNodeKey);
                                                } else {
                                                    // NOTE: we skip nested keyed nodes from being removed since there is
                                                    //       still a chance they will be matched up later
                                                    removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                                                }

                                                curFromNodeChild = matchingFromEl;
                                            }
                                        } else {
                                            // The nodes are not compatible since the "to" node has a key and there
                                            // is no matching keyed node in the source tree
                                            isCompatible = false;
                                        }
                                    }
                                } else if (curFromNodeKey) {
                                    // The original has a key
                                    isCompatible = false;
                                }

                                isCompatible = isCompatible !== false && compareNodeNames(curFromNodeChild, curToNodeChild);
                                if (isCompatible) {
                                    // We found compatible DOM elements so transform
                                    // the current "from" node to match the current
                                    // target DOM node.
                                    morphEl(curFromNodeChild, curToNodeChild);
                                }

                            } else if (curFromNodeType === TEXT_NODE || curFromNodeType == COMMENT_NODE) {
                                // Both nodes being compared are Text or Comment nodes
                                isCompatible = true;
                                // Simply update nodeValue on the original node to
                                // change the text value
                                curFromNodeChild.nodeValue = curToNodeChild.nodeValue;
                            }
                        }

                        if (isCompatible) {
                            // Advance both the "to" child and the "from" child since we found a match
                            curToNodeChild = toNextSibling;
                            curFromNodeChild = fromNextSibling;
                            continue outer;
                        }

                        // No compatible match so remove the old node from the DOM and continue trying to find a
                        // match in the original DOM. However, we only do this if the from node is not keyed
                        // since it is possible that a keyed node might match up with a node somewhere else in the
                        // target tree and we don't want to discard it just yet since it still might find a
                        // home in the final DOM tree. After everything is done we will remove any keyed nodes
                        // that didn't find a home
                        if (curFromNodeKey) {
                            // Since the node is keyed it might be matched up later so we defer
                            // the actual removal to later
                            addKeyedRemoval(curFromNodeKey);
                        } else {
                            // NOTE: we skip nested keyed nodes from being removed since there is
                            //       still a chance they will be matched up later
                            removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                        }

                        curFromNodeChild = fromNextSibling;
                    }

                    // If we got this far then we did not find a candidate match for
                    // our "to node" and we exhausted all of the children "from"
                    // nodes. Therefore, we will just append the current "to" node
                    // to the end
                    if (curToNodeKey && (matchingFromEl = fromNodesLookup[curToNodeKey]) && compareNodeNames(matchingFromEl, curToNodeChild)) {
                        fromEl.appendChild(matchingFromEl);
                        morphEl(matchingFromEl, curToNodeChild);
                    } else {
                        var onBeforeNodeAddedResult = onBeforeNodeAdded(curToNodeChild);
                        if (onBeforeNodeAddedResult !== false) {
                            if (onBeforeNodeAddedResult) {
                                curToNodeChild = onBeforeNodeAddedResult;
                            }

                            if (curToNodeChild.actualize) {
                                curToNodeChild = curToNodeChild.actualize(fromEl.ownerDocument || doc);
                            }
                            fromEl.appendChild(curToNodeChild);
                            handleNodeAdded(curToNodeChild);
                        }
                    }

                    curToNodeChild = toNextSibling;
                    curFromNodeChild = fromNextSibling;
                }

                // We have processed all of the "to nodes". If curFromNodeChild is
                // non-null then we still have some from nodes left over that need
                // to be removed
                while (curFromNodeChild) {
                    fromNextSibling = curFromNodeChild.nextSibling;
                    if ((curFromNodeKey = getNodeKey(curFromNodeChild))) {
                        // Since the node is keyed it might be matched up later so we defer
                        // the actual removal to later
                        addKeyedRemoval(curFromNodeKey);
                    } else {
                        // NOTE: we skip nested keyed nodes from being removed since there is
                        //       still a chance they will be matched up later
                        removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                    }
                    curFromNodeChild = fromNextSibling;
                }
            }

            var specialElHandler = specialElHandlers[fromEl.nodeName];
            if (specialElHandler) {
                specialElHandler(fromEl, toEl);
            }
        } // END: morphEl(...)

        var morphedNode = fromNode;
        var morphedNodeType = morphedNode.nodeType;
        var toNodeType = toNode.nodeType;

        if (!childrenOnly) {
            // Handle the case where we are given two DOM nodes that are not
            // compatible (e.g. <div> --> <span> or <div> --> TEXT)
            if (morphedNodeType === ELEMENT_NODE) {
                if (toNodeType === ELEMENT_NODE) {
                    if (!compareNodeNames(fromNode, toNode)) {
                        onNodeDiscarded(fromNode);
                        morphedNode = moveChildren(fromNode, createElementNS(toNode.nodeName, toNode.namespaceURI));
                    }
                } else {
                    // Going from an element node to a text node
                    morphedNode = toNode;
                }
            } else if (morphedNodeType === TEXT_NODE || morphedNodeType === COMMENT_NODE) { // Text or comment node
                if (toNodeType === morphedNodeType) {
                    morphedNode.nodeValue = toNode.nodeValue;
                    return morphedNode;
                } else {
                    // Text node to something else
                    morphedNode = toNode;
                }
            }
        }

        if (morphedNode === toNode) {
            // The "to node" was not compatible with the "from node" so we had to
            // toss out the "from node" and use the "to node"
            onNodeDiscarded(fromNode);
        } else {
            morphEl(morphedNode, toNode, childrenOnly);

            // We now need to loop over any keyed nodes that might need to be
            // removed. We only do the removal if we know that the keyed node
            // never found a match. When a keyed node is matched up we remove
            // it out of fromNodesLookup and we use fromNodesLookup to determine
            // if a keyed node has been matched up or not
            if (keyedRemovalList) {
                for (var i=0, len=keyedRemovalList.length; i<len; i++) {
                    var elToRemove = fromNodesLookup[keyedRemovalList[i]];
                    if (elToRemove) {
                        removeNode(elToRemove, elToRemove.parentNode, false);
                    }
                }
            }
        }

        if (!childrenOnly && morphedNode !== fromNode && fromNode.parentNode) {
            if (morphedNode.actualize) {
                morphedNode = morphedNode.actualize(fromNode.ownerDocument || doc);
            }
            // If we had to swap out the from node with a new node because the old
            // node was not compatible with the target node then we need to
            // replace the old DOM node in the original DOM tree. This is only
            // possible if the original DOM node was part of a DOM tree which
            // we know is the case if it has a parent node.
            fromNode.parentNode.replaceChild(morphedNode, fromNode);
        }

        return morphedNode;
    };
}

var morphdom = morphdomFactory(morphAttrs);

module.exports = morphdom;

},{}],30:[function(require,module,exports){
module.exports = [
  // attribute events (can be set with attributes)
  'onclick',
  'ondblclick',
  'onmousedown',
  'onmouseup',
  'onmouseover',
  'onmousemove',
  'onmouseout',
  'ondragstart',
  'ondrag',
  'ondragenter',
  'ondragleave',
  'ondragover',
  'ondrop',
  'ondragend',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onunload',
  'onabort',
  'onerror',
  'onresize',
  'onscroll',
  'onselect',
  'onchange',
  'onsubmit',
  'onreset',
  'onfocus',
  'onblur',
  'oninput',
  // other common events
  'oncontextmenu',
  'onfocusin',
  'onfocusout'
]

},{}],31:[function(require,module,exports){
module.exports = function yoyoifyAppendChild (el, childs) {
  for (var i = 0; i < childs.length; i++) {
    var node = childs[i]
    if (Array.isArray(node)) {
      yoyoifyAppendChild(el, node)
      continue
    }
    if (typeof node === 'number' ||
      typeof node === 'boolean' ||
      node instanceof Date ||
      node instanceof RegExp) {
      node = node.toString()
    }
    if (typeof node === 'string') {
      if (el.lastChild && el.lastChild.nodeName === '#text') {
        el.lastChild.nodeValue += node
        continue
      }
      node = document.createTextNode(node)
    }
    if (node && node.nodeType) {
      el.appendChild(node)
    }
  }
}

},{}],32:[function(require,module,exports){
(function (global){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Utils = require('../core/Utils');
var Translator = require('../core/Translator');
var UppySocket = require('./UppySocket');
var ee = require('namespace-emitter');
var throttle = require('lodash.throttle');
// const en_US = require('../locales/en_US')
// const deepFreeze = require('deep-freeze-strict')

/**
 * Main Uppy core
 *
 * @param {object} opts general options, like locales, to show modal or not to show
 */

var Uppy = function () {
  function Uppy(opts) {
    _classCallCheck(this, Uppy);

    // set default options
    var defaultOptions = {
      // load English as the default locale
      // locale: en_US,
      autoProceed: true,
      debug: false
    };

    // Merge default options with the ones set by user
    this.opts = _extends({}, defaultOptions, opts);

    // // Dictates in what order different plugin types are ran:
    // this.types = [ 'presetter', 'orchestrator', 'progressindicator',
    //                 'acquirer', 'modifier', 'uploader', 'presenter', 'debugger']

    // Container for different types of plugins
    this.plugins = {};

    this.translator = new Translator({ locale: this.opts.locale });
    this.i18n = this.translator.translate.bind(this.translator);
    this.getState = this.getState.bind(this);
    this.updateMeta = this.updateMeta.bind(this);
    this.initSocket = this.initSocket.bind(this);
    this.log = this.log.bind(this);
    this.addFile = this.addFile.bind(this);
    this.calculateProgress = this.calculateProgress.bind(this);

    this.bus = this.emitter = ee();
    this.on = this.bus.on.bind(this.bus);
    this.emit = this.bus.emit.bind(this.bus);

    this.state = {
      files: {},
      capabilities: {
        resumableUploads: false
      },
      totalProgress: 0
    };

    // for debugging and testing
    this.updateNum = 0;
    if (this.opts.debug) {
      global.UppyState = this.state;
      global.uppyLog = '';
      global.UppyAddFile = this.addFile.bind(this);
      global._Uppy = this;
    }
  }

  /**
   * Iterate on all plugins and run `update` on them. Called each time state changes
   *
   */


  Uppy.prototype.updateAll = function updateAll(state) {
    var _this = this;

    Object.keys(this.plugins).forEach(function (pluginType) {
      _this.plugins[pluginType].forEach(function (plugin) {
        plugin.update(state);
      });
    });
  };

  /**
   * Updates state
   *
   * @param {newState} object
   */


  Uppy.prototype.setState = function setState(stateUpdate) {
    var newState = _extends({}, this.state, stateUpdate);
    this.emit('core:state-update', this.state, newState, stateUpdate);

    this.state = newState;
    this.updateAll(this.state);
  };

  /**
   * Returns current state
   *
   */


  Uppy.prototype.getState = function getState() {
    // use deepFreeze for debugging
    // return deepFreeze(this.state)
    return this.state;
  };

  Uppy.prototype.updateMeta = function updateMeta(data, fileID) {
    var updatedFiles = _extends({}, this.getState().files);
    var newMeta = _extends({}, updatedFiles[fileID].meta, data);
    updatedFiles[fileID] = _extends({}, updatedFiles[fileID], {
      meta: newMeta
    });
    this.setState({ files: updatedFiles });
  };

  Uppy.prototype.addFile = function addFile(file) {
    var updatedFiles = _extends({}, this.state.files);

    var fileName = file.name || 'noname';
    var fileType = Utils.getFileType(file) ? Utils.getFileType(file).split('/') : ['', ''];
    var fileTypeGeneral = fileType[0];
    var fileTypeSpecific = fileType[1];
    var fileExtension = Utils.getFileNameAndExtension(fileName)[1];
    var isRemote = file.isRemote || false;

    var fileID = Utils.generateFileID(fileName);

    var newFile = {
      source: file.source || '',
      id: fileID,
      name: fileName,
      extension: fileExtension || '',
      meta: {
        name: fileName
      },
      type: {
        general: fileTypeGeneral,
        specific: fileTypeSpecific
      },
      data: file.data,
      progress: {
        percentage: 0,
        uploadComplete: false,
        uploadStarted: false
      },
      size: file.data.size || 'N/A',
      isRemote: isRemote,
      remote: file.remote || ''
    };

    updatedFiles[fileID] = newFile;
    this.setState({ files: updatedFiles });

    this.bus.emit('file-added', fileID);
    this.log('Added file: ' + fileName + ', ' + fileID + ', mime type: ' + fileType);

    if (fileTypeGeneral === 'image' && !isRemote) {
      this.addThumbnail(newFile.id);
    }

    if (this.opts.autoProceed) {
      this.bus.emit('core:upload');
    }
  };

  Uppy.prototype.removeFile = function removeFile(fileID) {
    var updatedFiles = _extends({}, this.getState().files);
    delete updatedFiles[fileID];
    this.setState({ files: updatedFiles });
    this.calculateTotalProgress();
    this.log('Removed file: ' + fileID);
  };

  Uppy.prototype.addThumbnail = function addThumbnail(fileID) {
    var _this2 = this;

    var file = this.getState().files[fileID];

    Utils.readFile(file.data).then(function (imgDataURI) {
      return Utils.createImageThumbnail(imgDataURI, 200);
    }).then(function (thumbnail) {
      var updatedFiles = _extends({}, _this2.getState().files);
      var updatedFile = _extends({}, updatedFiles[fileID], {
        preview: thumbnail
      });
      updatedFiles[fileID] = updatedFile;
      _this2.setState({ files: updatedFiles });
    });
  };

  Uppy.prototype.startUpload = function startUpload() {
    this.emit('core:upload');
  };

  Uppy.prototype.calculateProgress = function calculateProgress(data) {
    var fileID = data.id;
    var updatedFiles = _extends({}, this.getState().files);

    // skip progress event for a file that’s been removed
    if (!updatedFiles[fileID]) {
      this.log('Trying to set progress for a file that’s not with us anymore: ', fileID);
      return;
    }

    var updatedFile = _extends({}, updatedFiles[fileID], _extends({}, {
      progress: _extends({}, updatedFiles[fileID].progress, {
        bytesUploaded: data.bytesUploaded,
        bytesTotal: data.bytesTotal,
        percentage: Math.floor((data.bytesUploaded / data.bytesTotal * 100).toFixed(2))
      })
    }));
    updatedFiles[data.id] = updatedFile;

    this.setState({
      files: updatedFiles
    });

    this.calculateTotalProgress();
  };

  Uppy.prototype.calculateTotalProgress = function calculateTotalProgress() {
    // calculate total progress, using the number of files currently uploading,
    // multiplied by 100 and the summ of individual progress of each file
    var files = _extends({}, this.getState().files);

    var inProgress = Object.keys(files).filter(function (file) {
      return files[file].progress.uploadStarted;
    });
    var progressMax = inProgress.length * 100;
    var progressAll = 0;
    inProgress.forEach(function (file) {
      progressAll = progressAll + files[file].progress.percentage;
    });

    var totalProgress = Math.floor((progressAll * 100 / progressMax).toFixed(2));

    this.setState({
      totalProgress: totalProgress
    });

    // if (totalProgress === 100) {
    //   const completeFiles = Object.keys(updatedFiles).filter((file) => {
    //     // this should be `uploadComplete`
    //     return updatedFiles[file].progress.percentage === 100
    //   })
    //   this.emit('core:success', completeFiles.length)
    // }
  };

  /**
   * Registers listeners for all global actions, like:
   * `file-add`, `file-remove`, `upload-progress`, `reset`
   *
   */


  Uppy.prototype.actions = function actions() {
    var _this3 = this;

    // this.bus.on('*', (payload) => {
    //   console.log('emitted: ', this.event)
    //   console.log('with payload: ', payload)
    // })

    // stress-test re-rendering
    // setInterval(() => {
    //   this.setState({bla: 'bla'})
    // }, 20)

    this.on('core:file-add', function (data) {
      _this3.addFile(data);
    });

    // `remove-file` removes a file from `state.files`, for example when
    // a user decides not to upload particular file and clicks a button to remove it
    this.on('core:file-remove', function (fileID) {
      _this3.removeFile(fileID);
    });

    this.on('core:cancel-all', function () {
      var files = _this3.getState().files;
      Object.keys(files).forEach(function (file) {
        _this3.removeFile(files[file].id);
      });
    });

    this.on('core:upload-started', function (fileID, upload) {
      var updatedFiles = _extends({}, _this3.getState().files);
      var updatedFile = _extends({}, updatedFiles[fileID], _extends({}, {
        progress: _extends({}, updatedFiles[fileID].progress, {
          uploadStarted: Date.now()
        })
      }));
      updatedFiles[fileID] = updatedFile;

      _this3.setState({ files: updatedFiles });
    });

    var throttledCalculateProgress = throttle(this.calculateProgress, 300);

    this.on('core:upload-progress', function (data) {
      // this.calculateProgress(data)
      throttledCalculateProgress(data);
    });

    this.on('core:upload-success', function (fileID, uploadResp, uploadURL) {
      var updatedFiles = _extends({}, _this3.getState().files);
      var updatedFile = _extends({}, updatedFiles[fileID], {
        progress: _extends({}, updatedFiles[fileID].progress, {
          uploadComplete: true,
          // good or bad idea? setting the percentage to 100 if upload is successful,
          // so that if we lost some progress events on the way, its still marked “compete”?
          percentage: 100
        }),
        uploadURL: uploadURL
      });
      updatedFiles[fileID] = updatedFile;

      _this3.setState({
        files: updatedFiles
      });

      _this3.calculateTotalProgress();

      if (_this3.getState().totalProgress === 100) {
        var completeFiles = Object.keys(updatedFiles).filter(function (file) {
          return updatedFiles[file].progress.uploadComplete;
        });
        _this3.emit('core:success', completeFiles.length);
      }
    });

    this.on('core:update-meta', function (data, fileID) {
      _this3.updateMeta(data, fileID);
    });

    // show informer if offline
    if (typeof window !== 'undefined') {
      window.addEventListener('online', function () {
        return _this3.isOnline(true);
      });
      window.addEventListener('offline', function () {
        return _this3.isOnline(false);
      });
      setTimeout(function () {
        return _this3.isOnline();
      }, 3000);
    }
  };

  Uppy.prototype.isOnline = function isOnline(status) {
    var online = status || window.navigator.onLine;
    if (!online) {
      this.emit('is-offline');
      this.emit('informer', 'No internet connection', 'error', 0);
      this.wasOffline = true;
    } else {
      this.emit('is-online');
      if (this.wasOffline) {
        this.emit('informer', 'Connected!', 'success', 3000);
        this.wasOffline = false;
      }
    }
  };

  /**
   * Registers a plugin with Core
   *
   * @param {Class} Plugin object
   * @param {Object} options object that will be passed to Plugin later
   * @return {Object} self for chaining
   */


  Uppy.prototype.use = function use(Plugin, opts) {
    // Instantiate
    var plugin = new Plugin(this, opts);
    var pluginName = plugin.id;
    this.plugins[plugin.type] = this.plugins[plugin.type] || [];

    if (!pluginName) {
      throw new Error('Your plugin must have a name');
    }

    if (!plugin.type) {
      throw new Error('Your plugin must have a type');
    }

    var existsPluginAlready = this.getPlugin(pluginName);
    if (existsPluginAlready) {
      var msg = 'Already found a plugin named \'' + existsPluginAlready.name + '\'.\n        Tried to use: \'' + pluginName + '\'.\n        Uppy is currently limited to running one of every plugin.\n        Share your use case with us over at\n        https://github.com/transloadit/uppy/issues/\n        if you want us to reconsider.';
      throw new Error(msg);
    }

    this.plugins[plugin.type].push(plugin);
    plugin.install();

    return this;
  };

  /**
   * Find one Plugin by name
   *
   * @param string name description
   */


  Uppy.prototype.getPlugin = function getPlugin(name) {
    var foundPlugin = false;
    this.iteratePlugins(function (plugin) {
      var pluginName = plugin.id;
      if (pluginName === name) {
        foundPlugin = plugin;
        return false;
      }
    });
    return foundPlugin;
  };

  /**
   * Iterate through all `use`d plugins
   *
   * @param function method description
   */


  Uppy.prototype.iteratePlugins = function iteratePlugins(method) {
    var _this4 = this;

    Object.keys(this.plugins).forEach(function (pluginType) {
      _this4.plugins[pluginType].forEach(method);
    });
  };

  /**
   * Logs stuff to console, only if `debug` is set to true. Silent in production.
   *
   * @return {String|Object} to log
   */


  Uppy.prototype.log = function log(msg, type) {
    if (!this.opts.debug) {
      return;
    }
    if (msg === '' + msg) {
      console.log('LOG: ' + msg);
    } else {
      console.dir(msg);
    }

    if (type === 'error') {
      console.error('LOG: ' + msg);
    }

    global.uppyLog = global.uppyLog + '\n' + 'DEBUG LOG: ' + msg;
  };

  Uppy.prototype.initSocket = function initSocket(opts) {
    if (!this.socket) {
      this.socket = new UppySocket(opts);
    }

    return this.socket;
  };

  // installAll () {
  //   Object.keys(this.plugins).forEach((pluginType) => {
  //     this.plugins[pluginType].forEach((plugin) => {
  //       plugin.install(this)
  //     })
  //   })
  // }

  /**
   * Initializes actions, installs all plugins (by iterating on them and calling `install`), sets options
   *
   */


  Uppy.prototype.run = function run() {
    this.log('Core is run, initializing actions...');

    this.actions();

    // Forse set `autoProceed` option to false if there are multiple selector Plugins active
    // if (this.plugins.acquirer && this.plugins.acquirer.length > 1) {
    //   this.opts.autoProceed = false
    // }

    // Install all plugins
    // this.installAll()

    return;
  };

  return Uppy;
}();

module.exports = function (opts) {
  if (!(this instanceof Uppy)) {
    return new Uppy(opts);
  }
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../core/Translator":33,"../core/Utils":35,"./UppySocket":34,"lodash.throttle":5,"namespace-emitter":6}],33:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * Translates strings with interpolation & pluralization support.
 * Extensible with custom dictionaries and pluralization functions.
 *
 * Borrows heavily from and inspired by Polyglot https://github.com/airbnb/polyglot.js,
 * basically a stripped-down version of it. Differences: pluralization functions are not hardcoded
 * and can be easily added among with dictionaries, nested objects are used for pluralization
 * as opposed to `||||` delimeter
 *
 * Usage example: `translator.translate('files_chosen', {smart_count: 3})`
 *
 * @param {object} opts
 */
module.exports = function () {
  function Translator(opts) {
    _classCallCheck(this, Translator);

    var defaultOptions = {
      locale: {
        strings: {},
        pluralize: function pluralize(n) {
          if (n === 1) {
            return 0;
          }
          return 1;
        }
      }
    };

    this.opts = _extends({}, defaultOptions, opts);
    this.locale = _extends({}, defaultOptions.locale, opts.locale);

    // console.log(this.opts.locale)

    // this.locale.pluralize = this.locale ? this.locale.pluralize : defaultPluralize
    // this.locale.strings = Object.assign({}, en_US.strings, this.opts.locale.strings)
  }

  /**
   * Takes a string with placeholder variables like `%{smart_count} file selected`
   * and replaces it with values from options `{smart_count: 5}`
   *
   * @license https://github.com/airbnb/polyglot.js/blob/master/LICENSE
   * taken from https://github.com/airbnb/polyglot.js/blob/master/lib/polyglot.js#L299
   *
   * @param {string} phrase that needs interpolation, with placeholders
   * @param {object} options with values that will be used to replace placeholders
   * @return {string} interpolated
   */


  Translator.prototype.interpolate = function interpolate(phrase, options) {
    var replace = String.prototype.replace;
    var dollarRegex = /\$/g;
    var dollarBillsYall = '$$$$';

    for (var arg in options) {
      if (arg !== '_' && options.hasOwnProperty(arg)) {
        // Ensure replacement value is escaped to prevent special $-prefixed
        // regex replace tokens. the "$$$$" is needed because each "$" needs to
        // be escaped with "$" itself, and we need two in the resulting output.
        var replacement = options[arg];
        if (typeof replacement === 'string') {
          replacement = replace.call(options[arg], dollarRegex, dollarBillsYall);
        }
        // We create a new `RegExp` each time instead of using a more-efficient
        // string replace so that the same argument can be replaced multiple times
        // in the same phrase.
        phrase = replace.call(phrase, new RegExp('%\\{' + arg + '\\}', 'g'), replacement);
      }
    }
    return phrase;
  };

  /**
   * Public translate method
   *
   * @param {string} key
   * @param {object} options with values that will be used later to replace placeholders in string
   * @return {string} translated (and interpolated)
   */


  Translator.prototype.translate = function translate(key, options) {
    if (options && options.smart_count) {
      var plural = this.locale.pluralize(options.smart_count);
      return this.interpolate(this.opts.locale.strings[key][plural], options);
    }

    return this.interpolate(this.opts.locale.strings[key], options);
  };

  return Translator;
}();

},{}],34:[function(require,module,exports){
'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var ee = require('namespace-emitter');

module.exports = function () {
  function UppySocket(opts) {
    var _this = this;

    _classCallCheck(this, UppySocket);

    this.queued = [];
    this.isOpen = false;
    this.socket = new WebSocket(opts.target);
    this.emitter = ee();

    this.socket.onopen = function (e) {
      _this.isOpen = true;

      while (_this.queued.length > 0 && _this.isOpen) {
        var first = _this.queued[0];
        _this.send(first.action, first.payload);
        _this.queued = _this.queued.slice(1);
      }
    };

    this.socket.onclose = function (e) {
      _this.isOpen = false;
    };

    this._handleMessage = this._handleMessage.bind(this);

    this.socket.onmessage = this._handleMessage;

    this.close = this.close.bind(this);
    this.emit = this.emit.bind(this);
    this.on = this.on.bind(this);
    this.once = this.once.bind(this);
    this.send = this.send.bind(this);
  }

  UppySocket.prototype.close = function close() {
    return this.socket.close();
  };

  UppySocket.prototype.send = function send(action, payload) {
    // attach uuid

    if (!this.isOpen) {
      this.queued.push({ action: action, payload: payload });
      return;
    }

    this.socket.send(JSON.stringify({
      action: action,
      payload: payload
    }));
  };

  UppySocket.prototype.on = function on(action, handler) {
    console.log(action);
    this.emitter.on(action, handler);
  };

  UppySocket.prototype.emit = function emit(action, payload) {
    console.log(action);
    this.emitter.emit(action, payload);
  };

  UppySocket.prototype.once = function once(action, handler) {
    this.emitter.once(action, handler);
  };

  UppySocket.prototype._handleMessage = function _handleMessage(e) {
    try {
      var message = JSON.parse(e.data);
      console.log(message);
      this.emit(message.action, message.payload);
    } catch (err) {
      console.log(err);
    }
  };

  return UppySocket;
}();

},{"namespace-emitter":6}],35:[function(require,module,exports){
'use strict';

var _Promise = typeof Promise === 'undefined' ? require('es6-promise').Promise : Promise;

// import mime from 'mime-types'
// import pica from 'pica'

/**
 * A collection of small utility functions that help with dom manipulation, adding listeners,
 * promises and other good things.
 *
 * @module Utils
 */

/**
 * Shallow flatten nested arrays.
 */
function flatten(arr) {
  return [].concat.apply([], arr);
}

function isTouchDevice() {
  return 'ontouchstart' in window || // works on most browsers
  navigator.maxTouchPoints; // works on IE10/11 and Surface
}

// /**
//  * Shorter and fast way to select a single node in the DOM
//  * @param   { String } selector - unique dom selector
//  * @param   { Object } ctx - DOM node where the target of our search will is located
//  * @returns { Object } dom node found
//  */
// function $ (selector, ctx) {
//   return (ctx || document).querySelector(selector)
// }

// /**
//  * Shorter and fast way to select multiple nodes in the DOM
//  * @param   { String|Array } selector - DOM selector or nodes list
//  * @param   { Object } ctx - DOM node where the targets of our search will is located
//  * @returns { Object } dom nodes found
//  */
// function $$ (selector, ctx) {
//   var els
//   if (typeof selector === 'string') {
//     els = (ctx || document).querySelectorAll(selector)
//   } else {
//     els = selector
//     return Array.prototype.slice.call(els)
//   }
// }

function truncateString(str, length) {
  if (str.length > length) {
    return str.substr(0, length / 2) + '...' + str.substr(str.length - length / 4, str.length);
  }
  return str;

  // more precise version if needed
  // http://stackoverflow.com/a/831583
}

function secondsToTime(rawSeconds) {
  var hours = Math.floor(rawSeconds / 3600) % 24;
  var minutes = Math.floor(rawSeconds / 60) % 60;
  var seconds = Math.floor(rawSeconds % 60);

  return { hours: hours, minutes: minutes, seconds: seconds };
}

/**
 * Partition array by a grouping function.
 * @param  {[type]} array      Input array
 * @param  {[type]} groupingFn Grouping function
 * @return {[type]}            Array of arrays
 */
function groupBy(array, groupingFn) {
  return array.reduce(function (result, item) {
    var key = groupingFn(item);
    var xs = result.get(key) || [];
    xs.push(item);
    result.set(key, xs);
    return result;
  }, new Map());
}

/**
 * Tests if every array element passes predicate
 * @param  {Array}  array       Input array
 * @param  {Object} predicateFn Predicate
 * @return {bool}               Every element pass
 */
function every(array, predicateFn) {
  return array.reduce(function (result, item) {
    if (!result) {
      return false;
    }

    return predicateFn(item);
  }, true);
}

/**
 * Converts list into array
*/
function toArray(list) {
  return Array.prototype.slice.call(list || [], 0);
}

/**
 * Takes a fileName and turns it into fileID, by converting to lowercase,
 * removing extra characters and adding unix timestamp
 *
 * @param {String} fileName
 *
 */
function generateFileID(fileName) {
  var fileID = fileName.toLowerCase();
  fileID = fileID.replace(/[^A-Z0-9]/ig, '');
  fileID = fileID + Date.now();
  return fileID;
}

function extend() {
  for (var _len = arguments.length, objs = Array(_len), _key = 0; _key < _len; _key++) {
    objs[_key] = arguments[_key];
  }

  return Object.assign.apply(this, [{}].concat(objs));
}

/**
 * Takes function or class, returns its name.
 * Because IE doesn’t support `constructor.name`.
 * https://gist.github.com/dfkaye/6384439, http://stackoverflow.com/a/15714445
 *
 * @param {Object} fn — function
 *
 */
// function getFnName (fn) {
//   var f = typeof fn === 'function'
//   var s = f && ((fn.name && ['', fn.name]) || fn.toString().match(/function ([^\(]+)/))
//   return (!f && 'not a function') || (s && s[1] || 'anonymous')
// }

function getProportionalImageHeight(img, newWidth) {
  var aspect = img.width / img.height;
  var newHeight = Math.round(newWidth / aspect);
  return newHeight;
}

function getFileType(file) {
  if (file.type) {
    return file.type;
  }
  return '';
  // return mime.lookup(file.name)
}

// returns [fileName, fileExt]
function getFileNameAndExtension(fullFileName) {
  var re = /(?:\.([^.]+))?$/;
  var fileExt = re.exec(fullFileName)[1];
  var fileName = fullFileName.replace('.' + fileExt, '');
  return [fileName, fileExt];
}

/**
 * Reads file as data URI from file object,
 * the one you get from input[type=file] or drag & drop.
 *
 * @param {Object} file object
 * @return {Promise} dataURL of the file
 *
 */
function readFile(fileObj) {
  return new _Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.addEventListener('load', function (ev) {
      return resolve(ev.target.result);
    });
    reader.readAsDataURL(fileObj);

    // function workerScript () {
    //   self.addEventListener('message', (e) => {
    //     const file = e.data.file
    //     try {
    //       const reader = new FileReaderSync()
    //       postMessage({
    //         file: reader.readAsDataURL(file)
    //       })
    //     } catch (err) {
    //       console.log(err)
    //     }
    //   })
    // }
    //
    // const worker = makeWorker(workerScript)
    // worker.postMessage({file: fileObj})
    // worker.addEventListener('message', (e) => {
    //   const fileDataURL = e.data.file
    //   console.log('FILE _ DATA _ URL')
    //   return resolve(fileDataURL)
    // })
  });
}

/**
 * Resizes an image to specified width and proportional height, using canvas
 * See https://davidwalsh.name/resize-image-canvas,
 * http://babalan.com/resizing-images-with-javascript/
 * @TODO see if we need https://github.com/stomita/ios-imagefile-megapixel for iOS
 *
 * @param {String} Data URI of the original image
 * @param {String} width of the resulting image
 * @return {String} Data URI of the resized image
 */
function createImageThumbnail(imgDataURI, newWidth) {
  return new _Promise(function (resolve, reject) {
    var img = new Image();
    img.addEventListener('load', function () {
      var newImageWidth = newWidth;
      var newImageHeight = getProportionalImageHeight(img, newImageWidth);

      // create an off-screen canvas
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');

      // set its dimension to target size
      canvas.width = newImageWidth;
      canvas.height = newImageHeight;

      // draw source image into the off-screen canvas:
      // ctx.clearRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, newImageWidth, newImageHeight);

      // pica.resizeCanvas(img, canvas, (err) => {
      //   if (err) console.log(err)
      //   const thumbnail = canvas.toDataURL('image/png')
      //   return resolve(thumbnail)
      // })

      // encode image to data-uri with base64 version of compressed image
      // canvas.toDataURL('image/jpeg', quality);  // quality = [0.0, 1.0]
      var thumbnail = canvas.toDataURL('image/png');
      return resolve(thumbnail);
    });
    img.src = imgDataURI;
  });
}

function dataURItoBlob(dataURI, opts, toFile) {
  // get the base64 data
  var data = dataURI.split(',')[1];

  // user may provide mime type, if not get it from data URI
  var mimeType = opts.mimeType || dataURI.split(',')[0].split(':')[1].split(';')[0];

  // default to plain/text if data URI has no mimeType
  if (mimeType == null) {
    mimeType = 'plain/text';
  }

  var binary = atob(data);
  var array = [];
  for (var i = 0; i < binary.length; i++) {
    array.push(binary.charCodeAt(i));
  }

  // Convert to a File?
  if (toFile) {
    return new File([new Uint8Array(array)], opts.name || '', { type: mimeType });
  }

  return new Blob([new Uint8Array(array)], { type: mimeType });
}

function dataURItoFile(dataURI, opts) {
  return dataURItoBlob(dataURI, opts, true);
}

/**
 * Copies text to clipboard by creating an almost invisible textarea,
 * adding text there, then running execCommand('copy').
 * Falls back to prompt() when the easy way fails (hello, Safari!)
 * From http://stackoverflow.com/a/30810322
 *
 * @param {String} textToCopy
 * @param {String} fallbackString
 * @return {Promise}
 */
function copyToClipboard(textToCopy, fallbackString) {
  fallbackString = fallbackString || 'Copy the URL below';

  return new _Promise(function (resolve, reject) {
    var textArea = document.createElement('textarea');
    textArea.setAttribute('style', {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '2em',
      height: '2em',
      padding: 0,
      border: 'none',
      outline: 'none',
      boxShadow: 'none',
      background: 'transparent'
    });

    textArea.value = textToCopy;
    document.body.appendChild(textArea);
    textArea.select();

    var magicCopyFailed = function magicCopyFailed(err) {
      document.body.removeChild(textArea);
      window.prompt(fallbackString, textToCopy);
      return reject('Oops, unable to copy displayed fallback prompt: ' + err);
    };

    try {
      var successful = document.execCommand('copy');
      if (!successful) {
        return magicCopyFailed('copy command unavailable');
      }
      document.body.removeChild(textArea);
      return resolve();
    } catch (err) {
      document.body.removeChild(textArea);
      return magicCopyFailed(err);
    }
  });
}

// function createInlineWorker (workerFunction) {
//   let code = workerFunction.toString()
//   code = code.substring(code.indexOf('{') + 1, code.lastIndexOf('}'))
//
//   const blob = new Blob([code], {type: 'application/javascript'})
//   const worker = new Worker(URL.createObjectURL(blob))
//
//   return worker
// }

// function makeWorker (script) {
//   var URL = window.URL || window.webkitURL
//   var Blob = window.Blob
//   var Worker = window.Worker
//
//   if (!URL || !Blob || !Worker || !script) {
//     return null
//   }
//
//   let code = script.toString()
//   code = code.substring(code.indexOf('{') + 1, code.lastIndexOf('}'))
//
//   var blob = new Blob([code])
//   var worker = new Worker(URL.createObjectURL(blob))
//   return worker
// }

function getSpeed(fileProgress) {
  if (!fileProgress.bytesUploaded) return 0;

  var timeElapsed = new Date() - fileProgress.uploadStarted;
  var uploadSpeed = fileProgress.bytesUploaded / (timeElapsed / 1000);
  return uploadSpeed;
}

function getETA(fileProgress) {
  if (!fileProgress.bytesUploaded) return 0;

  var uploadSpeed = getSpeed(fileProgress);
  var bytesRemaining = fileProgress.bytesTotal - fileProgress.bytesUploaded;
  var secondsRemaining = Math.round(bytesRemaining / uploadSpeed * 10) / 10;

  return secondsRemaining;
}

function prettyETA(seconds) {
  var time = secondsToTime(seconds);

  // Only display hours and minutes if they are greater than 0 but always
  // display minutes if hours is being displayed
  // Display a leading zero if the there is a preceding unit: 1m 05s, but 5s
  var hoursStr = time.hours ? time.hours + 'h ' : '';
  var minutesVal = time.hours ? ('0' + time.minutes).substr(-2) : time.minutes;
  var minutesStr = minutesVal ? minutesVal + 'm ' : '';
  var secondsVal = minutesVal ? ('0' + time.seconds).substr(-2) : time.seconds;
  var secondsStr = secondsVal + 's';

  return '' + hoursStr + minutesStr + secondsStr;
}

// function makeCachingFunction () {
//   let cachedEl = null
//   let lastUpdate = Date.now()
//
//   return function cacheElement (el, time) {
//     if (Date.now() - lastUpdate < time) {
//       return cachedEl
//     }
//
//     cachedEl = el
//     lastUpdate = Date.now()
//
//     return el
//   }
// }

module.exports = {
  generateFileID: generateFileID,
  toArray: toArray,
  every: every,
  flatten: flatten,
  groupBy: groupBy,
  // $,
  // $$,
  extend: extend,
  readFile: readFile,
  createImageThumbnail: createImageThumbnail,
  getProportionalImageHeight: getProportionalImageHeight,
  isTouchDevice: isTouchDevice,
  getFileNameAndExtension: getFileNameAndExtension,
  truncateString: truncateString,
  getFileType: getFileType,
  secondsToTime: secondsToTime,
  dataURItoBlob: dataURItoBlob,
  dataURItoFile: dataURItoFile,
  getSpeed: getSpeed,
  getETA: getETA,
  // makeWorker,
  // makeCachingFunction,
  copyToClipboard: copyToClipboard,
  prettyETA: prettyETA
};

},{"es6-promise":4}],36:[function(require,module,exports){
'use strict';

var Core = require('./Core');
module.exports = Core;

},{"./Core":32}],37:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');

module.exports = function (props) {
  var _uppyProviderAuthBtnDemo, _uppyProviderAuthTitleName, _br, _uppyProviderAuthTitle, _uppyProviderAuthBtn, _uppyProviderAuth;

  var demoLink = props.demo ? (_uppyProviderAuthBtnDemo = document.createElement('button'), _uppyProviderAuthBtnDemo.onclick = props.handleDemoAuth, _uppyProviderAuthBtnDemo.setAttribute('class', 'UppyProvider-authBtnDemo'), _uppyProviderAuthBtnDemo.textContent = 'Proceed with Demo Account', _uppyProviderAuthBtnDemo) : null;
  return _uppyProviderAuth = document.createElement('div'), _uppyProviderAuth.setAttribute('class', 'UppyProvider-auth'), _appendChild(_uppyProviderAuth, ['\n      ', (_uppyProviderAuthTitle = document.createElement('h1'), _uppyProviderAuthTitle.setAttribute('class', 'UppyProvider-authTitle'), _appendChild(_uppyProviderAuthTitle, ['\n        Please authenticate with ', (_uppyProviderAuthTitleName = document.createElement('span'), _uppyProviderAuthTitleName.setAttribute('class', 'UppyProvider-authTitleName'), _appendChild(_uppyProviderAuthTitleName, [props.pluginName]), _uppyProviderAuthTitleName), (_br = document.createElement('br'), _br), ' to select files\n      ']), _uppyProviderAuthTitle), '\n      ', (_uppyProviderAuthBtn = document.createElement('button'), _uppyProviderAuthBtn.onclick = props.handleAuth, _uppyProviderAuthBtn.setAttribute('class', 'UppyProvider-authBtn'), _uppyProviderAuthBtn.textContent = 'Authenticate', _uppyProviderAuthBtn), '\n      ', demoLink, '\n    ']), _uppyProviderAuth;
};

},{"yo-yo":22,"yo-yoify/lib/appendChild":31}],38:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');

module.exports = function (props) {
  var _button, _li;

  return _li = document.createElement('li'), _appendChild(_li, ['\n      ', (_button = document.createElement('button'), _button.onclick = props.getFolder, _appendChild(_button, [props.title]), _button), '\n    ']), _li;
};

},{"yo-yo":22,"yo-yoify/lib/appendChild":31}],39:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');
var Breadcrumb = require('./Breadcrumb');

module.exports = function (props) {
  var _uppyProviderBreadcrumbs;

  return _uppyProviderBreadcrumbs = document.createElement('ul'), _uppyProviderBreadcrumbs.setAttribute('class', 'UppyProvider-breadcrumbs'), _appendChild(_uppyProviderBreadcrumbs, ['\n      ', props.directories.map(function (directory) {
    return Breadcrumb({
      getFolder: function getFolder() {
        return props.getFolder(directory.id);
      },
      title: directory.title
    });
  }), '\n    ']), _uppyProviderBreadcrumbs;
};

},{"./Breadcrumb":38,"yo-yo":22,"yo-yoify/lib/appendChild":31}],40:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');
var Breadcrumbs = require('./Breadcrumbs');
var Table = require('./Table');

module.exports = function (props) {
  var _uppyDashboardTabBtn, _div, _browserSearch, _header, _browserSubHeader, _browserContent, _browserBody, _browser;

  var filteredFolders = props.folders;
  var filteredFiles = props.files;

  if (props.filterInput !== '') {
    filteredFolders = props.filterItems(props.folders);
    filteredFiles = props.filterItems(props.files);
  }

  return _browser = document.createElement('div'), _browser.setAttribute('class', 'Browser'), _appendChild(_browser, ['\n      ', (_div = document.createElement('div'), _appendChild(_div, ['\n        ', (_uppyDashboardTabBtn = document.createElement('button'), _uppyDashboardTabBtn.onclick = props.logout, _uppyDashboardTabBtn.setAttribute('class', 'UppyDashboardTab-btn'), _uppyDashboardTabBtn.textContent = 'Sign out', _uppyDashboardTabBtn), '\n      ']), _div), '\n      ', (_header = document.createElement('header'), _appendChild(_header, ['\n        ', (_browserSearch = document.createElement('input'), _browserSearch.setAttribute('type', 'text'), _browserSearch.setAttribute('placeholder', 'Search Drive'), _browserSearch.onkeyup = props.filterQuery, _browserSearch.setAttribute('value', '' + String(props.filterInput) + ''), _browserSearch.setAttribute('class', 'Browser-search'), _browserSearch), '\n      ']), _header), '\n      ', (_browserSubHeader = document.createElement('div'), _browserSubHeader.setAttribute('class', 'Browser-subHeader'), _appendChild(_browserSubHeader, ['\n        ', Breadcrumbs({
    getFolder: props.getFolder,
    directories: props.directories
  }), '\n      ']), _browserSubHeader), '\n      ', (_browserBody = document.createElement('div'), _browserBody.setAttribute('class', 'Browser-body'), _appendChild(_browserBody, ['\n        ', (_browserContent = document.createElement('main'), _browserContent.setAttribute('class', 'Browser-content'), _appendChild(_browserContent, ['\n          ', Table({
    columns: [{
      name: 'Name',
      key: 'title'
    }],
    folders: filteredFolders,
    files: filteredFiles,
    activeRow: props.isActiveRow,
    sortByTitle: props.sortByTitle,
    sortByDate: props.sortByDate,
    handleRowClick: props.handleRowClick,
    handleFileDoubleClick: props.addFile,
    handleFolderDoubleClick: props.getNextFolder,
    getItemName: props.getItemName,
    getItemIcon: props.getItemIcon
  }), '\n        ']), _browserContent), '\n      ']), _browserBody), '\n    ']), _browser;
};

},{"./Breadcrumbs":39,"./Table":43,"yo-yo":22,"yo-yoify/lib/appendChild":31}],41:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');

module.exports = function (props) {
  var _span, _uppyProviderError;

  return _uppyProviderError = document.createElement('div'), _uppyProviderError.setAttribute('class', 'UppyProvider-error'), _appendChild(_uppyProviderError, ['\n      ', (_span = document.createElement('span'), _appendChild(_span, ['\n        Something went wrong.  Probably our fault. ', props.error, '\n      ']), _span), '\n    ']), _uppyProviderError;
};

},{"yo-yo":22,"yo-yoify/lib/appendChild":31}],42:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');

module.exports = function (props) {
  var _span, _uppyProviderLoading;

  return _uppyProviderLoading = document.createElement('div'), _uppyProviderLoading.setAttribute('class', 'UppyProvider-loading'), _appendChild(_uppyProviderLoading, ['\n      ', (_span = document.createElement('span'), _span.textContent = '\n        Loading ...\n      ', _span), '\n    ']), _uppyProviderLoading;
};

},{"yo-yo":22,"yo-yoify/lib/appendChild":31}],43:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');
var Row = require('./TableRow');

module.exports = function (props) {
  var _tr, _browserTableHeader, _tbody, _browserTable;

  var headers = props.columns.map(function (column) {
    var _browserTableHeaderColumn;

    return _browserTableHeaderColumn = document.createElement('th'), _browserTableHeaderColumn.onclick = props.sortByTitle, _browserTableHeaderColumn.setAttribute('class', 'BrowserTable-headerColumn BrowserTable-column'), _appendChild(_browserTableHeaderColumn, ['\n        ', column.name, '\n      ']), _browserTableHeaderColumn;
  });

  return _browserTable = document.createElement('table'), _browserTable.setAttribute('class', 'BrowserTable'), _appendChild(_browserTable, ['\n      ', (_browserTableHeader = document.createElement('thead'), _browserTableHeader.setAttribute('class', 'BrowserTable-header'), _appendChild(_browserTableHeader, ['\n        ', (_tr = document.createElement('tr'), _appendChild(_tr, ['\n          ', headers, '\n        ']), _tr), '\n      ']), _browserTableHeader), '\n      ', (_tbody = document.createElement('tbody'), _appendChild(_tbody, ['\n        ', props.folders.map(function (folder) {
    return Row({
      title: props.getItemName(folder),
      active: props.activeRow(folder),
      getItemIcon: function getItemIcon() {
        return props.getItemIcon(folder);
      },
      handleClick: function handleClick() {
        return props.handleRowClick(folder);
      },
      handleDoubleClick: function handleDoubleClick() {
        return props.handleFolderDoubleClick(folder);
      },
      columns: props.columns
    });
  }), '\n        ', props.files.map(function (file) {
    return Row({
      title: props.getItemName(file),
      active: props.activeRow(file),
      getItemIcon: function getItemIcon() {
        return props.getItemIcon(file);
      },
      handleClick: function handleClick() {
        return props.handleRowClick(file);
      },
      handleDoubleClick: function handleDoubleClick() {
        return props.handleFileDoubleClick(file);
      },
      columns: props.columns
    });
  }), '\n      ']), _tbody), '\n    ']), _browserTable;
};

},{"./TableRow":45,"yo-yo":22,"yo-yoify/lib/appendChild":31}],44:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');

module.exports = function (props) {
  var _browserTableRowColumn;

  return _browserTableRowColumn = document.createElement('td'), _browserTableRowColumn.setAttribute('class', 'BrowserTable-rowColumn BrowserTable-column'), _appendChild(_browserTableRowColumn, ['\n      ', props.getItemIcon(), ' ', props.value, '\n    ']), _browserTableRowColumn;
};

},{"yo-yo":22,"yo-yoify/lib/appendChild":31}],45:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');
var Column = require('./TableColumn');

module.exports = function (props) {
  var _tr;

  var classes = props.active ? 'BrowserTable-row is-active' : 'BrowserTable-row';
  return _tr = document.createElement('tr'), _tr.onclick = props.handleClick, _tr.ondblclick = props.handleDoubleClick, _tr.setAttribute('class', '' + String(classes) + ''), _appendChild(_tr, ['\n      ', Column({
    getItemIcon: props.getItemIcon,
    value: props.title
  }), '\n    ']), _tr;
};

},{"./TableColumn":44,"yo-yo":22,"yo-yoify/lib/appendChild":31}],46:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var AuthView = require('./AuthView');
var Browser = require('./Browser');
var ErrorView = require('./Error');
var LoaderView = require('./Loader');

/**
 * Class to easily generate generic views for plugins
 *
 * This class expects the plugin using to have the following attributes
 *
 * stateId {String} object key of which the plugin state is stored
 *
 * This class also expects the plugin instance using it to have the following
 * accessor methods.
 * Each method takes the item whose property is to be accessed
 * as a param
 *
 * isFolder
 *    @return {Boolean} for if the item is a folder or not
 * getItemData
 *    @return {Object} that is format ready for uppy upload/download
 * getItemIcon
 *    @return {Object} html instance of the item's icon
 * getItemSubList
 *    @return {Array} sub-items in the item. e.g a folder may contain sub-items
 * getItemName
 *    @return {String} display friendly name of the item
 * getMimeType
 *    @return {String} mime type of the item
 * getItemId
 *    @return {String} unique id of the item
 * getItemRequestPath
 *    @return {String} unique request path of the item when making calls to uppy server
 * getItemModifiedDate
 *    @return {object} or {String} date of when last the item was modified
 */
module.exports = function () {
  /**
   * @param {object} instance of the plugin
   */
  function View(plugin) {
    _classCallCheck(this, View);

    this.plugin = plugin;
    this.Provider = plugin[plugin.id];

    // Logic
    this.addFile = this.addFile.bind(this);
    this.filterItems = this.filterItems.bind(this);
    this.filterQuery = this.filterQuery.bind(this);
    this.getFolder = this.getFolder.bind(this);
    this.getNextFolder = this.getNextFolder.bind(this);
    this.handleRowClick = this.handleRowClick.bind(this);
    this.logout = this.logout.bind(this);
    this.handleAuth = this.handleAuth.bind(this);
    this.handleDemoAuth = this.handleDemoAuth.bind(this);
    this.sortByTitle = this.sortByTitle.bind(this);
    this.sortByDate = this.sortByDate.bind(this);
    this.isActiveRow = this.isActiveRow.bind(this);
    this.handleError = this.handleError.bind(this);

    // Visual
    this.render = this.render.bind(this);
  }

  /**
   * Little shorthand to update the state with the plugin's state
   */


  View.prototype.updateState = function updateState(newState) {
    var _plugin$core$setState;

    var stateId = this.plugin.stateId;
    var state = this.plugin.core.state;


    this.plugin.core.setState((_plugin$core$setState = {}, _plugin$core$setState[stateId] = _extends({}, state[stateId], newState), _plugin$core$setState));
  };

  /**
   * Based on folder ID, fetch a new folder and update it to state
   * @param  {String} id Folder id
   * @return {Promise}   Folders/files in folder
   */


  View.prototype.getFolder = function getFolder(id, name) {
    var _this = this;

    return this._loaderWrapper(this.Provider.list(id), function (res) {
      var folders = [];
      var files = [];
      var updatedDirectories = void 0;

      var state = _this.plugin.core.getState()[_this.plugin.stateId];
      var index = state.directories.findIndex(function (dir) {
        return id === dir.id;
      });

      if (index !== -1) {
        updatedDirectories = state.directories.slice(0, index + 1);
      } else {
        updatedDirectories = state.directories.concat([{ id: id, title: name || _this.plugin.getItemName(res) }]);
      }

      _this.plugin.getItemSubList(res).forEach(function (item) {
        if (_this.plugin.isFolder(item)) {
          folders.push(item);
        } else {
          files.push(item);
        }
      });

      var data = { folders: folders, files: files, directories: updatedDirectories };
      _this.updateState(data);

      return data;
    }, this.handleError);
  };

  /**
   * Fetches new folder
   * @param  {Object} Folder
   * @param  {String} title Folder title
   */


  View.prototype.getNextFolder = function getNextFolder(folder) {
    var id = this.plugin.getItemRequestPath(folder);
    this.getFolder(id, this.plugin.getItemName(folder));
  };

  View.prototype.addFile = function addFile(file) {
    var tagFile = {
      source: this.plugin.id,
      data: this.plugin.getItemData(file),
      name: this.plugin.getItemName(file),
      type: this.plugin.getMimeType(file),
      isRemote: true,
      body: {
        fileId: this.plugin.getItemId(file)
      },
      remote: {
        host: this.plugin.opts.host,
        url: this.plugin.opts.host + '/' + this.Provider.id + '/get/' + this.plugin.getItemRequestPath(file),
        body: {
          fileId: this.plugin.getItemId(file)
        }
      }
    };
    console.log('adding file');
    this.plugin.core.emitter.emit('core:file-add', tagFile);
  };

  /**
   * Removes session token on client side.
   */


  View.prototype.logout = function logout() {
    var _this2 = this;

    this.Provider.logout(location.href).then(function (res) {
      return res.json();
    }).then(function (res) {
      if (res.ok) {
        var newState = {
          authenticated: false,
          files: [],
          folders: [],
          directories: []
        };
        _this2.updateState(newState);
      }
    }).catch(this.handleError);
  };

  /**
   * Used to set active file/folder.
   * @param  {Object} file   Active file/folder
   */


  View.prototype.handleRowClick = function handleRowClick(file) {
    var state = this.plugin.core.getState()[this.plugin.stateId];
    var newState = _extends({}, state, {
      activeRow: this.plugin.getItemId(file)
    });

    this.updateState(newState);
  };

  View.prototype.filterQuery = function filterQuery(e) {
    var state = this.plugin.core.getState()[this.plugin.stateId];
    this.updateState(_extends({}, state, {
      filterInput: e.target.value
    }));
  };

  View.prototype.filterItems = function filterItems(items) {
    var _this3 = this;

    var state = this.plugin.core.getState()[this.plugin.stateId];
    return items.filter(function (folder) {
      return _this3.plugin.getItemName(folder).toLowerCase().indexOf(state.filterInput.toLowerCase()) !== -1;
    });
  };

  View.prototype.sortByTitle = function sortByTitle() {
    var _this4 = this;

    var state = _extends({}, this.plugin.core.getState()[this.plugin.stateId]);
    var files = state.files,
        folders = state.folders,
        sorting = state.sorting;


    var sortedFiles = files.sort(function (fileA, fileB) {
      if (sorting === 'titleDescending') {
        return _this4.plugin.getItemName(fileB).localeCompare(_this4.plugin.getItemName(fileA));
      }
      return _this4.plugin.getItemName(fileA).localeCompare(_this4.plugin.getItemName(fileB));
    });

    var sortedFolders = folders.sort(function (folderA, folderB) {
      if (sorting === 'titleDescending') {
        return _this4.plugin.getItemName(folderB).localeCompare(_this4.plugin.getItemName(folderA));
      }
      return _this4.plugin.getItemName(folderA).localeCompare(_this4.plugin.getItemName(folderB));
    });

    this.updateState(_extends({}, state, {
      files: sortedFiles,
      folders: sortedFolders,
      sorting: sorting === 'titleDescending' ? 'titleAscending' : 'titleDescending'
    }));
  };

  View.prototype.sortByDate = function sortByDate() {
    var _this5 = this;

    var state = _extends({}, this.plugin.core.getState()[this.plugin.stateId]);
    var files = state.files,
        folders = state.folders,
        sorting = state.sorting;


    var sortedFiles = files.sort(function (fileA, fileB) {
      var a = new Date(_this5.plugin.getItemModifiedDate(fileA));
      var b = new Date(_this5.plugin.getItemModifiedDate(fileB));

      if (sorting === 'dateDescending') {
        return a > b ? -1 : a < b ? 1 : 0;
      }
      return a > b ? 1 : a < b ? -1 : 0;
    });

    var sortedFolders = folders.sort(function (folderA, folderB) {
      var a = new Date(_this5.plugin.getItemModifiedDate(folderA));
      var b = new Date(_this5.plugin.getItemModifiedDate(folderB));

      if (sorting === 'dateDescending') {
        return a > b ? -1 : a < b ? 1 : 0;
      }

      return a > b ? 1 : a < b ? -1 : 0;
    });

    this.updateState(_extends({}, state, {
      files: sortedFiles,
      folders: sortedFolders,
      sorting: sorting === 'dateDescending' ? 'dateAscending' : 'dateDescending'
    }));
  };

  View.prototype.isActiveRow = function isActiveRow(file) {
    return this.plugin.core.getState()[this.plugin.stateId].activeRow === this.plugin.getItemId(file);
  };

  View.prototype.handleDemoAuth = function handleDemoAuth() {
    var state = this.plugin.core.getState()[this.plugin.stateId];
    this.updateState({}, state, {
      authenticated: true
    });
  };

  View.prototype.handleAuth = function handleAuth() {
    var _this6 = this;

    var urlId = Math.floor(Math.random() * 999999) + 1;
    var redirect = '' + location.href + (location.search ? '&' : '?') + 'id=' + urlId;

    var authState = btoa(JSON.stringify({ redirect: redirect }));
    var link = this.plugin.opts.host + '/connect/' + this.Provider.authProvider + '?state=' + authState;

    var authWindow = window.open(link, '_blank');
    var checkAuth = function checkAuth() {
      var authWindowUrl = void 0;

      try {
        authWindowUrl = authWindow.location.href;
      } catch (e) {
        if (e instanceof DOMException || e instanceof TypeError) {
          return setTimeout(checkAuth, 100);
        } else throw e;
      }

      // split url because chrome adds '#' to redirects
      if (authWindowUrl.split('#')[0] === redirect) {
        authWindow.close();
        _this6._loaderWrapper(_this6.Provider.auth(), _this6.plugin.onAuth, _this6.handleError);
      } else {
        setTimeout(checkAuth, 100);
      }
    };

    checkAuth();
  };

  View.prototype.handleError = function handleError(error) {
    this.updateState({ error: error });
  };

  // displays loader view while asynchronous request is being made.


  View.prototype._loaderWrapper = function _loaderWrapper(promise, then, catch_) {
    var _this7 = this;

    promise.then(function (result) {
      _this7.updateState({ loading: false });
      then(result);
    }).catch(function (err) {
      _this7.updateState({ loading: false });
      catch_(err);
    });
    this.updateState({ loading: true });
  };

  View.prototype.render = function render(state) {
    var _state$plugin$stateId = state[this.plugin.stateId],
        authenticated = _state$plugin$stateId.authenticated,
        error = _state$plugin$stateId.error,
        loading = _state$plugin$stateId.loading;


    if (error) {
      this.updateState({ error: undefined });
      return ErrorView({ error: error });
    }

    if (loading) {
      return LoaderView();
    }

    if (!authenticated) {
      return AuthView({
        pluginName: this.plugin.title,
        demo: this.plugin.opts.demo,
        handleAuth: this.handleAuth,
        handleDemoAuth: this.handleDemoAuth
      });
    }

    var browserProps = _extends({}, state[this.plugin.stateId], {
      getNextFolder: this.getNextFolder,
      getFolder: this.getFolder,
      addFile: this.addFile,
      filterItems: this.filterItems,
      filterQuery: this.filterQuery,
      handleRowClick: this.handleRowClick,
      sortByTitle: this.sortByTitle,
      sortByDate: this.sortByDate,
      logout: this.logout,
      demo: this.plugin.opts.demo,
      isActiveRow: this.isActiveRow,
      getItemName: this.plugin.getItemName,
      getItemIcon: this.plugin.getItemIcon
    });

    return Browser(browserProps);
  };

  return View;
}();

},{"./AuthView":37,"./Browser":40,"./Error":41,"./Loader":42}],47:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');

module.exports = function (props) {
  var _uppyDashboardBrowse, _uppyDashboardInput, _span;

  return _span = document.createElement('span'), _appendChild(_span, ['\n      ', props.acquirers.length === 0 ? props.i18n('dropPaste') : props.i18n('dropPasteImport'), '\n      ', (_uppyDashboardBrowse = document.createElement('button'), _uppyDashboardBrowse.setAttribute('type', 'button'), _uppyDashboardBrowse.onclick = function (ev) {
    var input = document.querySelector(props.container + ' .UppyDashboard-input');
    input.click();
  }, _uppyDashboardBrowse.setAttribute('class', 'UppyDashboard-browse'), _appendChild(_uppyDashboardBrowse, [props.i18n('browse')]), _uppyDashboardBrowse), '\n      ', (_uppyDashboardInput = document.createElement('input'), _uppyDashboardInput.setAttribute('type', 'file'), _uppyDashboardInput.setAttribute('name', 'files[]'), _uppyDashboardInput.setAttribute('multiple', 'true'), _uppyDashboardInput.onchange = props.handleInputChange, _uppyDashboardInput.setAttribute('class', 'UppyDashboard-input'), _uppyDashboardInput), '\n    ']), _span;
};

},{"yo-yo":22,"yo-yoify/lib/appendChild":31}],48:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild'),
    _onload = require('on-load');

var html = require('yo-yo');
var FileList = require('./FileList');
var Tabs = require('./Tabs');
var FileCard = require('./FileCard');
var UploadBtn = require('./UploadBtn');
var StatusBar = require('./StatusBar');

var _require = require('../../core/Utils'),
    isTouchDevice = _require.isTouchDevice,
    toArray = _require.toArray;

var _require2 = require('./icons'),
    closeIcon = _require2.closeIcon;

// http://dev.edenspiekermann.com/2016/02/11/introducing-accessible-modal-dialog

module.exports = function Dashboard(props) {
  var _uppyDashboardClose, _uppyDashboardOverlay, _uppyDashboardActions, _uppyDashboardFilesContainer, _uppyDashboardContentTitle, _uppyDashboardContentBack, _uppyDashboardContentBar, _uppyDashboardContentPanel, _uppyDashboardProgressindicators, _uppyDashboardInnerWrap, _uppyDashboardInner, _div;

  function handleInputChange(ev) {
    ev.preventDefault();
    var files = toArray(ev.target.files);

    files.forEach(function (file) {
      props.addFile({
        source: props.id,
        name: file.name,
        type: file.type,
        data: file
      });
    });
  }

  // @TODO Exprimental, work in progress
  // no names, weird API, Chrome-only http://stackoverflow.com/a/22940020
  function handlePaste(ev) {
    ev.preventDefault();

    var files = toArray(ev.clipboardData.items);
    files.forEach(function (file) {
      if (file.kind !== 'file') return;

      var blob = file.getAsFile();
      props.log('File pasted');
      props.addFile({
        source: props.id,
        name: file.name,
        type: file.type,
        data: blob
      });
    });
  }

  return _div = document.createElement('div'), _onload(_div, function () {
    return props.updateDashboardElWidth();
  }, null, 1), _div.setAttribute('aria-hidden', '' + String(props.inline ? 'false' : props.modal.isHidden) + ''), _div.setAttribute('aria-label', '' + String(!props.inline ? props.i18n('dashboardWindowTitle') : props.i18n('dashboardTitle')) + ''), _div.setAttribute('role', 'dialog'), _div.onpaste = handlePaste, _div.setAttribute('class', 'Uppy UppyTheme--default UppyDashboard\n                          ' + String(isTouchDevice() ? 'Uppy--isTouchDevice' : '') + '\n                          ' + String(props.semiTransparent ? 'UppyDashboard--semiTransparent' : '') + '\n                          ' + String(!props.inline ? 'UppyDashboard--modal' : '') + '\n                          ' + String(props.isWide ? 'UppyDashboard--wide' : '') + ''), _appendChild(_div, ['\n\n    ', (_uppyDashboardClose = document.createElement('button'), _uppyDashboardClose.setAttribute('aria-label', '' + String(props.i18n('closeModal')) + ''), _uppyDashboardClose.setAttribute('title', '' + String(props.i18n('closeModal')) + ''), _uppyDashboardClose.onclick = props.hideModal, _uppyDashboardClose.setAttribute('class', 'UppyDashboard-close'), _appendChild(_uppyDashboardClose, [closeIcon()]), _uppyDashboardClose), '\n\n    ', (_uppyDashboardOverlay = document.createElement('div'), _uppyDashboardOverlay.onclick = props.hideModal, _uppyDashboardOverlay.setAttribute('class', 'UppyDashboard-overlay'), _uppyDashboardOverlay), '\n\n    ', (_uppyDashboardInner = document.createElement('div'), _uppyDashboardInner.setAttribute('tabindex', '0'), _uppyDashboardInner.setAttribute('style', '\n          ' + String(props.inline && props.maxWidth ? 'max-width: ' + props.maxWidth + 'px;' : '') + '\n          ' + String(props.inline && props.maxHeight ? 'max-height: ' + props.maxHeight + 'px;' : '') + '\n         '), _uppyDashboardInner.setAttribute('class', 'UppyDashboard-inner'), _appendChild(_uppyDashboardInner, ['\n      ', (_uppyDashboardInnerWrap = document.createElement('div'), _uppyDashboardInnerWrap.setAttribute('class', 'UppyDashboard-innerWrap'), _appendChild(_uppyDashboardInnerWrap, ['\n\n        ', Tabs({
    files: props.files,
    handleInputChange: handleInputChange,
    acquirers: props.acquirers,
    container: props.container,
    panelSelectorPrefix: props.panelSelectorPrefix,
    showPanel: props.showPanel,
    i18n: props.i18n
  }), '\n\n        ', FileCard({
    files: props.files,
    fileCardFor: props.fileCardFor,
    done: props.fileCardDone,
    metaFields: props.metaFields,
    log: props.log,
    i18n: props.i18n
  }), '\n\n        ', (_uppyDashboardFilesContainer = document.createElement('div'), _uppyDashboardFilesContainer.setAttribute('class', 'UppyDashboard-filesContainer'), _appendChild(_uppyDashboardFilesContainer, ['\n\n          ', FileList({
    acquirers: props.acquirers,
    files: props.files,
    handleInputChange: handleInputChange,
    container: props.container,
    showFileCard: props.showFileCard,
    showProgressDetails: props.showProgressDetails,
    totalProgress: props.totalProgress,
    totalFileCount: props.totalFileCount,
    info: props.info,
    i18n: props.i18n,
    log: props.log,
    removeFile: props.removeFile,
    pauseAll: props.pauseAll,
    resumeAll: props.resumeAll,
    pauseUpload: props.pauseUpload,
    startUpload: props.startUpload,
    cancelUpload: props.cancelUpload,
    resumableUploads: props.resumableUploads,
    isWide: props.isWide
  }), '\n\n          ', (_uppyDashboardActions = document.createElement('div'), _uppyDashboardActions.setAttribute('class', 'UppyDashboard-actions'), _appendChild(_uppyDashboardActions, ['\n            ', !props.autoProceed && props.newFiles.length > 0 ? UploadBtn({
    i18n: props.i18n,
    startUpload: props.startUpload,
    newFileCount: props.newFiles.length
  }) : null, '\n          ']), _uppyDashboardActions), '\n\n        ']), _uppyDashboardFilesContainer), '\n\n        ', (_uppyDashboardContentPanel = document.createElement('div'), _uppyDashboardContentPanel.setAttribute('role', 'tabpanel'), _uppyDashboardContentPanel.setAttribute('aria-hidden', '' + String(props.activePanel ? 'false' : 'true') + ''), _uppyDashboardContentPanel.setAttribute('class', 'UppyDashboardContent-panel'), _appendChild(_uppyDashboardContentPanel, ['\n          ', (_uppyDashboardContentBar = document.createElement('div'), _uppyDashboardContentBar.setAttribute('class', 'UppyDashboardContent-bar'), _appendChild(_uppyDashboardContentBar, ['\n            ', (_uppyDashboardContentTitle = document.createElement('h2'), _uppyDashboardContentTitle.setAttribute('class', 'UppyDashboardContent-title'), _appendChild(_uppyDashboardContentTitle, ['\n              ', props.i18n('importFrom'), ' ', props.activePanel ? props.activePanel.name : null, '\n            ']), _uppyDashboardContentTitle), '\n            ', (_uppyDashboardContentBack = document.createElement('button'), _uppyDashboardContentBack.onclick = props.hideAllPanels, _uppyDashboardContentBack.setAttribute('class', 'UppyDashboardContent-back'), _appendChild(_uppyDashboardContentBack, [props.i18n('done')]), _uppyDashboardContentBack), '\n          ']), _uppyDashboardContentBar), '\n          ', props.activePanel ? props.activePanel.render(props.state) : '', '\n        ']), _uppyDashboardContentPanel), '\n\n        ', (_uppyDashboardProgressindicators = document.createElement('div'), _uppyDashboardProgressindicators.setAttribute('class', 'UppyDashboard-progressindicators'), _appendChild(_uppyDashboardProgressindicators, ['\n          ', StatusBar({
    totalProgress: props.totalProgress,
    totalFileCount: props.totalFileCount,
    totalSize: props.totalSize,
    totalUploadedSize: props.totalUploadedSize,
    uploadStartedFiles: props.uploadStartedFiles,
    isAllComplete: props.isAllComplete,
    isAllPaused: props.isAllPaused,
    isUploadStarted: props.isUploadStarted,
    pauseAll: props.pauseAll,
    resumeAll: props.resumeAll,
    cancelAll: props.cancelAll,
    complete: props.completeFiles.length,
    inProgress: props.inProgress,
    totalSpeed: props.totalSpeed,
    totalETA: props.totalETA,
    startUpload: props.startUpload,
    newFileCount: props.newFiles.length,
    i18n: props.i18n,
    resumableUploads: props.resumableUploads
  }), '\n\n          ', props.progressindicators.map(function (target) {
    return target.render(props.state);
  }), '\n        ']), _uppyDashboardProgressindicators), '\n\n      ']), _uppyDashboardInnerWrap), '\n    ']), _uppyDashboardInner), '\n  ']), _div;
};

},{"../../core/Utils":35,"./FileCard":49,"./FileList":52,"./StatusBar":53,"./Tabs":54,"./UploadBtn":55,"./icons":57,"on-load":7,"yo-yo":22,"yo-yoify/lib/appendChild":31}],49:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');
var getFileTypeIcon = require('./getFileTypeIcon');

var _require = require('./icons'),
    checkIcon = _require.checkIcon;

// function getIconByMime (fileTypeGeneral) {
//   switch (fileTypeGeneral) {
//     case 'text':
//       return iconText()
//     case 'audio':
//       return iconAudio()
//     default:
//       return iconFile()
//   }
// }

module.exports = function fileCard(props) {
  var _uppyDashboardContentTitleFile, _uppyDashboardContentTitle, _uppyDashboardContentBack, _uppyDashboardContentBar, _uppyButtonCircular, _uppyDashboardActions, _uppyDashboardFileCard, _uppyDashboardFileCardPreview, _uppyDashboardFileCardLabel2, _uppyDashboardFileCardInput2, _uppyDashboardFileCardFieldset2, _uppyDashboardFileCardInfo, _uppyDashboardFileCardInner, _img, _uppyDashboardItemPreviewIcon;

  var file = props.fileCardFor ? props.files[props.fileCardFor] : false;
  var meta = {};

  function tempStoreMeta(ev) {
    var value = ev.target.value;
    var name = ev.target.attributes.name.value;
    meta[name] = value;
  }

  function renderMetaFields(file) {
    var metaFields = props.metaFields || [];
    return metaFields.map(function (field) {
      var _uppyDashboardFileCardLabel, _uppyDashboardFileCardInput, _uppyDashboardFileCardFieldset;

      return _uppyDashboardFileCardFieldset = document.createElement('fieldset'), _uppyDashboardFileCardFieldset.setAttribute('class', 'UppyDashboardFileCard-fieldset'), _appendChild(_uppyDashboardFileCardFieldset, ['\n        ', (_uppyDashboardFileCardLabel = document.createElement('label'), _uppyDashboardFileCardLabel.setAttribute('class', 'UppyDashboardFileCard-label'), _appendChild(_uppyDashboardFileCardLabel, [field.name]), _uppyDashboardFileCardLabel), '\n        ', (_uppyDashboardFileCardInput = document.createElement('input'), _uppyDashboardFileCardInput.setAttribute('name', '' + String(field.id) + ''), _uppyDashboardFileCardInput.setAttribute('type', 'text'), _uppyDashboardFileCardInput.setAttribute('value', '' + String(file.meta[field.id]) + ''), _uppyDashboardFileCardInput.setAttribute('placeholder', '' + String(field.placeholder || '') + ''), _uppyDashboardFileCardInput.onkeyup = tempStoreMeta, _uppyDashboardFileCardInput.setAttribute('class', 'UppyDashboardFileCard-input'), _uppyDashboardFileCardInput)]), _uppyDashboardFileCardFieldset;
    });
  }

  return _uppyDashboardFileCard = document.createElement('div'), _uppyDashboardFileCard.setAttribute('aria-hidden', '' + String(!props.fileCardFor) + ''), _uppyDashboardFileCard.setAttribute('class', 'UppyDashboardFileCard'), _appendChild(_uppyDashboardFileCard, ['\n    ', (_uppyDashboardContentBar = document.createElement('div'), _uppyDashboardContentBar.setAttribute('class', 'UppyDashboardContent-bar'), _appendChild(_uppyDashboardContentBar, ['\n      ', (_uppyDashboardContentTitle = document.createElement('h2'), _uppyDashboardContentTitle.setAttribute('class', 'UppyDashboardContent-title'), _appendChild(_uppyDashboardContentTitle, ['Editing ', (_uppyDashboardContentTitleFile = document.createElement('span'), _uppyDashboardContentTitleFile.setAttribute('class', 'UppyDashboardContent-titleFile'), _appendChild(_uppyDashboardContentTitleFile, [file.meta ? file.meta.name : file.name]), _uppyDashboardContentTitleFile)]), _uppyDashboardContentTitle), '\n      ', (_uppyDashboardContentBack = document.createElement('button'), _uppyDashboardContentBack.setAttribute('title', 'Finish editing file'), _uppyDashboardContentBack.onclick = function () {
    return props.done(meta, file.id);
  }, _uppyDashboardContentBack.setAttribute('class', 'UppyDashboardContent-back'), _uppyDashboardContentBack.textContent = 'Done', _uppyDashboardContentBack), '\n    ']), _uppyDashboardContentBar), '\n    ', props.fileCardFor ? (_uppyDashboardFileCardInner = document.createElement('div'), _uppyDashboardFileCardInner.setAttribute('class', 'UppyDashboardFileCard-inner'), _appendChild(_uppyDashboardFileCardInner, ['\n          ', (_uppyDashboardFileCardPreview = document.createElement('div'), _uppyDashboardFileCardPreview.setAttribute('class', 'UppyDashboardFileCard-preview'), _appendChild(_uppyDashboardFileCardPreview, ['\n            ', file.preview ? (_img = document.createElement('img'), _img.setAttribute('alt', '' + String(file.name) + ''), _img.setAttribute('src', '' + String(file.preview) + ''), _img) : (_uppyDashboardItemPreviewIcon = document.createElement('div'), _uppyDashboardItemPreviewIcon.setAttribute('style', 'color: ' + String(getFileTypeIcon(file.type.general, file.type.specific).color) + ''), _uppyDashboardItemPreviewIcon.setAttribute('class', 'UppyDashboardItem-previewIcon'), _appendChild(_uppyDashboardItemPreviewIcon, ['\n                  ', getFileTypeIcon(file.type.general, file.type.specific).icon, '\n                ']), _uppyDashboardItemPreviewIcon), '\n          ']), _uppyDashboardFileCardPreview), '\n          ', (_uppyDashboardFileCardInfo = document.createElement('div'), _uppyDashboardFileCardInfo.setAttribute('class', 'UppyDashboardFileCard-info'), _appendChild(_uppyDashboardFileCardInfo, ['\n            ', (_uppyDashboardFileCardFieldset2 = document.createElement('fieldset'), _uppyDashboardFileCardFieldset2.setAttribute('class', 'UppyDashboardFileCard-fieldset'), _appendChild(_uppyDashboardFileCardFieldset2, ['\n              ', (_uppyDashboardFileCardLabel2 = document.createElement('label'), _uppyDashboardFileCardLabel2.setAttribute('class', 'UppyDashboardFileCard-label'), _uppyDashboardFileCardLabel2.textContent = 'Name', _uppyDashboardFileCardLabel2), '\n              ', (_uppyDashboardFileCardInput2 = document.createElement('input'), _uppyDashboardFileCardInput2.setAttribute('name', 'name'), _uppyDashboardFileCardInput2.setAttribute('type', 'text'), _uppyDashboardFileCardInput2.setAttribute('value', '' + String(file.meta.name) + ''), _uppyDashboardFileCardInput2.onkeyup = tempStoreMeta, _uppyDashboardFileCardInput2.setAttribute('class', 'UppyDashboardFileCard-input'), _uppyDashboardFileCardInput2), '\n            ']), _uppyDashboardFileCardFieldset2), '\n            ', renderMetaFields(file), '\n          ']), _uppyDashboardFileCardInfo), '\n        ']), _uppyDashboardFileCardInner) : null, '\n    ', (_uppyDashboardActions = document.createElement('div'), _uppyDashboardActions.setAttribute('class', 'UppyDashboard-actions'), _appendChild(_uppyDashboardActions, ['\n      ', (_uppyButtonCircular = document.createElement('button'), _uppyButtonCircular.setAttribute('type', 'button'), _uppyButtonCircular.setAttribute('title', 'Finish editing file'), _uppyButtonCircular.onclick = function () {
    return props.done(meta, file.id);
  }, _uppyButtonCircular.setAttribute('class', 'UppyButton--circular UppyButton--blue UppyDashboardFileCard-done'), _appendChild(_uppyButtonCircular, [checkIcon()]), _uppyButtonCircular), '\n    ']), _uppyDashboardActions), '\n    ']), _uppyDashboardFileCard;
};

},{"./getFileTypeIcon":56,"./icons":57,"yo-yo":22,"yo-yoify/lib/appendChild":31}],50:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild'),
    _svgNamespace = 'http://www.w3.org/2000/svg';

var html = require('yo-yo');

var _require = require('../../core/Utils'),
    getETA = _require.getETA,
    getSpeed = _require.getSpeed,
    prettyETA = _require.prettyETA,
    getFileNameAndExtension = _require.getFileNameAndExtension,
    truncateString = _require.truncateString,
    copyToClipboard = _require.copyToClipboard;

var prettyBytes = require('prettier-bytes');
var FileItemProgress = require('./FileItemProgress');
var getFileTypeIcon = require('./getFileTypeIcon');

var _require2 = require('./icons'),
    iconEdit = _require2.iconEdit,
    iconCopy = _require2.iconCopy;

module.exports = function fileItem(props) {
  var _uppyDashboardItemProgressBtn, _uppyDashboardItemProgress, _uppyDashboardItemPreview, _uppyDashboardItemName, _uppyDashboardItemStatusSize, _uppyDashboardItemStatus, _uppyDashboardItemInfo, _uppyDashboardItemAction, _li, _img, _uppyDashboardItemPreviewIcon, _uppyDashboardItemProgressInfo, _span, _a, _uppyDashboardItemEdit, _uppyDashboardItemCopyLink, _ellipse, _path, _uppyIcon, _uppyDashboardItemRemove;

  var file = props.file;

  var isUploaded = file.progress.uploadComplete;
  var uploadInProgressOrComplete = file.progress.uploadStarted;
  var uploadInProgress = file.progress.uploadStarted && !file.progress.uploadComplete;
  var isPaused = file.isPaused || false;

  var fileName = getFileNameAndExtension(file.meta.name)[0];
  var truncatedFileName = props.isWide ? truncateString(fileName, 15) : fileName;

  return _li = document.createElement('li'), _li.setAttribute('id', 'uppy_' + String(file.id) + ''), _li.setAttribute('title', '' + String(file.meta.name) + ''), _li.setAttribute('class', 'UppyDashboardItem\n                        ' + String(uploadInProgress ? 'is-inprogress' : '') + '\n                        ' + String(isUploaded ? 'is-complete' : '') + '\n                        ' + String(isPaused ? 'is-paused' : '') + '\n                        ' + String(props.resumableUploads ? 'is-resumable' : '') + ''), _appendChild(_li, ['\n      ', (_uppyDashboardItemPreview = document.createElement('div'), _uppyDashboardItemPreview.setAttribute('class', 'UppyDashboardItem-preview'), _appendChild(_uppyDashboardItemPreview, ['\n        ', file.preview ? (_img = document.createElement('img'), _img.setAttribute('alt', '' + String(file.name) + ''), _img.setAttribute('src', '' + String(file.preview) + ''), _img) : (_uppyDashboardItemPreviewIcon = document.createElement('div'), _uppyDashboardItemPreviewIcon.setAttribute('style', 'color: ' + String(getFileTypeIcon(file.type.general, file.type.specific).color) + ''), _uppyDashboardItemPreviewIcon.setAttribute('class', 'UppyDashboardItem-previewIcon'), _appendChild(_uppyDashboardItemPreviewIcon, ['\n              ', getFileTypeIcon(file.type.general, file.type.specific).icon, '\n            ']), _uppyDashboardItemPreviewIcon), '\n        ', (_uppyDashboardItemProgress = document.createElement('div'), _uppyDashboardItemProgress.setAttribute('class', 'UppyDashboardItem-progress'), _appendChild(_uppyDashboardItemProgress, ['\n          ', (_uppyDashboardItemProgressBtn = document.createElement('button'), _uppyDashboardItemProgressBtn.setAttribute('title', '' + String(isUploaded ? 'upload complete' : props.resumableUploads ? file.isPaused ? 'resume upload' : 'pause upload' : 'cancel upload') + ''), _uppyDashboardItemProgressBtn.onclick = function (ev) {
    if (isUploaded) return;
    if (props.resumableUploads) {
      props.pauseUpload(file.id);
    } else {
      props.cancelUpload(file.id);
    }
  }, _uppyDashboardItemProgressBtn.setAttribute('class', 'UppyDashboardItem-progressBtn'), _appendChild(_uppyDashboardItemProgressBtn, ['\n            ', FileItemProgress({
    progress: file.progress.percentage,
    fileID: file.id
  }), '\n          ']), _uppyDashboardItemProgressBtn), '\n          ', props.showProgressDetails ? (_uppyDashboardItemProgressInfo = document.createElement('div'), _uppyDashboardItemProgressInfo.setAttribute('title', '' + String(props.i18n('fileProgress')) + ''), _uppyDashboardItemProgressInfo.setAttribute('aria-label', '' + String(props.i18n('fileProgress')) + ''), _uppyDashboardItemProgressInfo.setAttribute('class', 'UppyDashboardItem-progressInfo'), _appendChild(_uppyDashboardItemProgressInfo, ['\n                ', !file.isPaused && !isUploaded ? (_span = document.createElement('span'), _appendChild(_span, [prettyETA(getETA(file.progress)), ' \u30FB \u2191 ', prettyBytes(getSpeed(file.progress)), '/s']), _span) : null, '\n              ']), _uppyDashboardItemProgressInfo) : null, '\n        ']), _uppyDashboardItemProgress), '\n      ']), _uppyDashboardItemPreview), '\n    ', (_uppyDashboardItemInfo = document.createElement('div'), _uppyDashboardItemInfo.setAttribute('class', 'UppyDashboardItem-info'), _appendChild(_uppyDashboardItemInfo, ['\n      ', (_uppyDashboardItemName = document.createElement('h4'), _uppyDashboardItemName.setAttribute('title', '' + String(fileName) + ''), _uppyDashboardItemName.setAttribute('class', 'UppyDashboardItem-name'), _appendChild(_uppyDashboardItemName, ['\n        ', file.uploadURL ? (_a = document.createElement('a'), _a.setAttribute('href', '' + String(file.uploadURL) + ''), _a.setAttribute('target', '_blank'), _appendChild(_a, ['\n              ', file.extension ? truncatedFileName + '.' + file.extension : truncatedFileName, '\n            ']), _a) : file.extension ? truncatedFileName + '.' + file.extension : truncatedFileName, '\n      ']), _uppyDashboardItemName), '\n      ', (_uppyDashboardItemStatus = document.createElement('div'), _uppyDashboardItemStatus.setAttribute('class', 'UppyDashboardItem-status'), _appendChild(_uppyDashboardItemStatus, ['\n        ', (_uppyDashboardItemStatusSize = document.createElement('span'), _uppyDashboardItemStatusSize.setAttribute('class', 'UppyDashboardItem-statusSize'), _appendChild(_uppyDashboardItemStatusSize, [file.data.size ? prettyBytes(file.data.size) : '?']), _uppyDashboardItemStatusSize), '\n      ']), _uppyDashboardItemStatus), '\n      ', !uploadInProgressOrComplete ? (_uppyDashboardItemEdit = document.createElement('button'), _uppyDashboardItemEdit.setAttribute('aria-label', 'Edit file'), _uppyDashboardItemEdit.setAttribute('title', 'Edit file'), _uppyDashboardItemEdit.onclick = function (e) {
    return props.showFileCard(file.id);
  }, _uppyDashboardItemEdit.setAttribute('class', 'UppyDashboardItem-edit'), _appendChild(_uppyDashboardItemEdit, ['\n                        ', iconEdit()]), _uppyDashboardItemEdit) : null, '\n      ', file.uploadURL ? (_uppyDashboardItemCopyLink = document.createElement('button'), _uppyDashboardItemCopyLink.setAttribute('aria-label', 'Copy link'), _uppyDashboardItemCopyLink.setAttribute('title', 'Copy link'), _uppyDashboardItemCopyLink.onclick = function () {
    copyToClipboard(file.uploadURL, props.i18n('copyLinkToClipboardFallback')).then(function () {
      props.log('Link copied to clipboard.');
      props.info(props.i18n('copyLinkToClipboardSuccess'), 'info', 3000);
    }).catch(props.log);
  }, _uppyDashboardItemCopyLink.setAttribute('class', 'UppyDashboardItem-copyLink'), _appendChild(_uppyDashboardItemCopyLink, [iconCopy()]), _uppyDashboardItemCopyLink) : null, '\n    ']), _uppyDashboardItemInfo), '\n    ', (_uppyDashboardItemAction = document.createElement('div'), _uppyDashboardItemAction.setAttribute('class', 'UppyDashboardItem-action'), _appendChild(_uppyDashboardItemAction, ['\n      ', !isUploaded ? (_uppyDashboardItemRemove = document.createElement('button'), _uppyDashboardItemRemove.setAttribute('aria-label', 'Remove file'), _uppyDashboardItemRemove.setAttribute('title', 'Remove file'), _uppyDashboardItemRemove.onclick = function () {
    return props.removeFile(file.id);
  }, _uppyDashboardItemRemove.setAttribute('class', 'UppyDashboardItem-remove'), _appendChild(_uppyDashboardItemRemove, ['\n                 ', (_uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '22'), _uppyIcon.setAttribute('height', '21'), _uppyIcon.setAttribute('viewBox', '0 0 18 17'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, ['\n                   ', (_ellipse = document.createElementNS(_svgNamespace, 'ellipse'), _ellipse.setAttribute('cx', '8.62'), _ellipse.setAttribute('cy', '8.383'), _ellipse.setAttribute('rx', '8.62'), _ellipse.setAttribute('ry', '8.383'), _ellipse), '\n                   ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('stroke', '#FFF'), _path.setAttribute('fill', '#FFF'), _path.setAttribute('d', 'M11 6.147L10.85 6 8.5 8.284 6.15 6 6 6.147 8.35 8.43 6 10.717l.15.146L8.5 8.578l2.35 2.284.15-.146L8.65 8.43z'), _path), '\n                 ']), _uppyIcon), '\n               ']), _uppyDashboardItemRemove) : null, '\n    ']), _uppyDashboardItemAction), '\n  ']), _li;
};

},{"../../core/Utils":35,"./FileItemProgress":51,"./getFileTypeIcon":56,"./icons":57,"prettier-bytes":10,"yo-yo":22,"yo-yoify/lib/appendChild":31}],51:[function(require,module,exports){
'use strict';

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');

// http://codepen.io/Harkko/pen/rVxvNM
// https://css-tricks.com/svg-line-animation-works/
// https://gist.github.com/eswak/ad4ea57bcd5ff7aa5d42

// circle length equals 2 * PI * R
var circleLength = 2 * Math.PI * 15;

// stroke-dashoffset is a percentage of the progress from circleLength,
// substracted from circleLength, because its an offset
module.exports = function (props) {
  var _bg, _progress, _progressGroup, _play, _rect, _rect2, _pause, _check, _cancel, _uppyIcon;

  return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '70'), _uppyIcon.setAttribute('height', '70'), _uppyIcon.setAttribute('viewBox', '0 0 36 36'), _uppyIcon.setAttribute('class', 'UppyIcon UppyIcon-progressCircle'), _appendChild(_uppyIcon, ['\n      ', (_progressGroup = document.createElementNS(_svgNamespace, 'g'), _progressGroup.setAttribute('class', 'progress-group'), _appendChild(_progressGroup, ['\n        ', (_bg = document.createElementNS(_svgNamespace, 'circle'), _bg.setAttribute('r', '15'), _bg.setAttribute('cx', '18'), _bg.setAttribute('cy', '18'), _bg.setAttribute('stroke-width', '2'), _bg.setAttribute('fill', 'none'), _bg.setAttribute('class', 'bg'), _bg), '\n        ', (_progress = document.createElementNS(_svgNamespace, 'circle'), _progress.setAttribute('r', '15'), _progress.setAttribute('cx', '18'), _progress.setAttribute('cy', '18'), _progress.setAttribute('transform', 'rotate(-90, 18, 18)'), _progress.setAttribute('stroke-width', '2'), _progress.setAttribute('fill', 'none'), _progress.setAttribute('stroke-dasharray', '' + String(circleLength) + ''), _progress.setAttribute('stroke-dashoffset', '' + String(circleLength - circleLength / 100 * props.progress) + ''), _progress.setAttribute('class', 'progress'), _progress), '\n      ']), _progressGroup), '\n      ', (_play = document.createElementNS(_svgNamespace, 'polygon'), _play.setAttribute('transform', 'translate(3, 3)'), _play.setAttribute('points', '12 20 12 10 20 15'), _play.setAttribute('class', 'play'), _play), '\n      ', (_pause = document.createElementNS(_svgNamespace, 'g'), _pause.setAttribute('transform', 'translate(14.5, 13)'), _pause.setAttribute('class', 'pause'), _appendChild(_pause, ['\n        ', (_rect = document.createElementNS(_svgNamespace, 'rect'), _rect.setAttribute('x', '0'), _rect.setAttribute('y', '0'), _rect.setAttribute('width', '2'), _rect.setAttribute('height', '10'), _rect.setAttribute('rx', '0'), _rect), '\n        ', (_rect2 = document.createElementNS(_svgNamespace, 'rect'), _rect2.setAttribute('x', '5'), _rect2.setAttribute('y', '0'), _rect2.setAttribute('width', '2'), _rect2.setAttribute('height', '10'), _rect2.setAttribute('rx', '0'), _rect2), '\n      ']), _pause), '\n      ', (_check = document.createElementNS(_svgNamespace, 'polygon'), _check.setAttribute('transform', 'translate(2, 3)'), _check.setAttribute('points', '14 22.5 7 15.2457065 8.99985857 13.1732815 14 18.3547104 22.9729883 9 25 11.1005634'), _check.setAttribute('class', 'check'), _check), '\n      ', (_cancel = document.createElementNS(_svgNamespace, 'polygon'), _cancel.setAttribute('transform', 'translate(2, 2)'), _cancel.setAttribute('points', '19.8856516 11.0625 16 14.9481516 12.1019737 11.0625 11.0625 12.1143484 14.9481516 16 11.0625 19.8980263 12.1019737 20.9375 16 17.0518484 19.8856516 20.9375 20.9375 19.8980263 17.0518484 16 20.9375 12'), _cancel.setAttribute('class', 'cancel'), _cancel)]), _uppyIcon;
};

},{"yo-yo":22,"yo-yoify/lib/appendChild":31}],52:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');
var FileItem = require('./FileItem');
var ActionBrowseTagline = require('./ActionBrowseTagline');

var _require = require('./icons'),
    dashboardBgIcon = _require.dashboardBgIcon;

module.exports = function (props) {
  var _ul, _uppyDashboardDropFilesTitle, _uppyDashboardInput, _uppyDashboardBgIcon;

  return _ul = document.createElement('ul'), _ul.setAttribute('class', 'UppyDashboard-files\n                         ' + String(props.totalFileCount === 0 ? 'UppyDashboard-files--noFiles' : '') + ''), _appendChild(_ul, ['\n      ', props.totalFileCount === 0 ? (_uppyDashboardBgIcon = document.createElement('div'), _uppyDashboardBgIcon.setAttribute('class', 'UppyDashboard-bgIcon'), _appendChild(_uppyDashboardBgIcon, ['\n          ', dashboardBgIcon(), '\n          ', (_uppyDashboardDropFilesTitle = document.createElement('h3'), _uppyDashboardDropFilesTitle.setAttribute('class', 'UppyDashboard-dropFilesTitle'), _appendChild(_uppyDashboardDropFilesTitle, ['\n            ', ActionBrowseTagline({
    acquirers: props.acquirers,
    container: props.container,
    handleInputChange: props.handleInputChange,
    i18n: props.i18n
  }), '\n          ']), _uppyDashboardDropFilesTitle), '\n          ', (_uppyDashboardInput = document.createElement('input'), _uppyDashboardInput.setAttribute('type', 'file'), _uppyDashboardInput.setAttribute('name', 'files[]'), _uppyDashboardInput.setAttribute('multiple', 'true'), _uppyDashboardInput.onchange = props.handleInputChange, _uppyDashboardInput.setAttribute('class', 'UppyDashboard-input'), _uppyDashboardInput), '\n         ']), _uppyDashboardBgIcon) : null, '\n      ', Object.keys(props.files).map(function (fileID) {
    return FileItem({
      file: props.files[fileID],
      showFileCard: props.showFileCard,
      showProgressDetails: props.showProgressDetails,
      info: props.info,
      log: props.log,
      i18n: props.i18n,
      removeFile: props.removeFile,
      pauseUpload: props.pauseUpload,
      cancelUpload: props.cancelUpload,
      resumableUploads: props.resumableUploads,
      isWide: props.isWide
    });
  }), '\n    ']), _ul;
};

},{"./ActionBrowseTagline":47,"./FileItem":50,"./icons":57,"yo-yo":22,"yo-yoify/lib/appendChild":31}],53:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild'),
    _svgNamespace = 'http://www.w3.org/2000/svg';

var html = require('yo-yo');
var throttle = require('lodash.throttle');

function progressBarWidth(props) {
  return props.totalProgress;
}

function progressDetails(props) {
  var _span;

  // console.log(Date.now())
  return _span = document.createElement('span'), _appendChild(_span, [props.totalProgress || 0, '%\u30FB', props.complete, ' / ', props.inProgress, '\u30FB', props.totalUploadedSize, ' / ', props.totalSize, '\u30FB\u2191 ', props.totalSpeed, '/s\u30FB', props.totalETA]), _span;
}

var throttledProgressDetails = throttle(progressDetails, 1000, { leading: true, trailing: true });
// const throttledProgressBarWidth = throttle(progressBarWidth, 300, {leading: true, trailing: true})

module.exports = function (props) {
  var _progress, _uppyDashboardStatusBarProgress, _uppyDashboardStatusBarContent, _div, _span2, _span3, _path, _uppyDashboardStatusBarAction, _span4;

  props = props || {};

  var isHidden = props.totalFileCount === 0 || !props.isUploadStarted;

  return _div = document.createElement('div'), _div.setAttribute('aria-hidden', '' + String(isHidden) + ''), _div.setAttribute('title', ''), _div.setAttribute('class', 'UppyDashboard-statusBar\n                ' + String(props.isAllComplete ? 'is-complete' : '') + ''), _appendChild(_div, ['\n      ', (_progress = document.createElement('progress'), _progress.setAttribute('style', 'display: none;'), _progress.setAttribute('min', '0'), _progress.setAttribute('max', '100'), _progress.setAttribute('value', '' + String(props.totalProgress) + ''), _progress), '\n      ', (_uppyDashboardStatusBarProgress = document.createElement('div'), _uppyDashboardStatusBarProgress.setAttribute('style', 'width: ' + String(progressBarWidth(props)) + '%'), _uppyDashboardStatusBarProgress.setAttribute('class', 'UppyDashboard-statusBarProgress'), _uppyDashboardStatusBarProgress), '\n      ', (_uppyDashboardStatusBarContent = document.createElement('div'), _uppyDashboardStatusBarContent.setAttribute('class', 'UppyDashboard-statusBarContent'), _appendChild(_uppyDashboardStatusBarContent, ['\n        ', props.isUploadStarted && !props.isAllComplete ? !props.isAllPaused ? (_span2 = document.createElement('span'), _span2.setAttribute('title', 'Uploading'), _appendChild(_span2, [pauseResumeButtons(props), ' Uploading... ', throttledProgressDetails(props)]), _span2) : (_span3 = document.createElement('span'), _span3.setAttribute('title', 'Paused'), _appendChild(_span3, [pauseResumeButtons(props), ' Paused\u30FB', props.totalProgress, '%']), _span3) : null, '\n        ', props.isAllComplete ? (_span4 = document.createElement('span'), _span4.setAttribute('title', 'Complete'), _appendChild(_span4, [(_uppyDashboardStatusBarAction = document.createElementNS(_svgNamespace, 'svg'), _uppyDashboardStatusBarAction.setAttribute('width', '18'), _uppyDashboardStatusBarAction.setAttribute('height', '17'), _uppyDashboardStatusBarAction.setAttribute('viewBox', '0 0 23 17'), _uppyDashboardStatusBarAction.setAttribute('class', 'UppyDashboard-statusBarAction UppyIcon'), _appendChild(_uppyDashboardStatusBarAction, ['\n              ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M8.944 17L0 7.865l2.555-2.61 6.39 6.525L20.41 0 23 2.645z'), _path), '\n            ']), _uppyDashboardStatusBarAction), 'Upload complete\u30FB', props.totalProgress, '%']), _span4) : null, '\n      ']), _uppyDashboardStatusBarContent), '\n    ']), _div;
};

var pauseResumeButtons = function pauseResumeButtons(props) {
  var _uppyDashboardStatusBarAction2, _path2, _uppyIcon, _path3, _uppyIcon2, _path4, _uppyIcon3;

  var title = props.resumableUploads ? props.isAllPaused ? 'resume upload' : 'pause upload' : 'cancel upload';

  return _uppyDashboardStatusBarAction2 = document.createElement('button'), _uppyDashboardStatusBarAction2.setAttribute('title', '' + String(title) + ''), _uppyDashboardStatusBarAction2.setAttribute('type', 'button'), _uppyDashboardStatusBarAction2.onclick = function () {
    return togglePauseResume(props);
  }, _uppyDashboardStatusBarAction2.setAttribute('class', 'UppyDashboard-statusBarAction'), _appendChild(_uppyDashboardStatusBarAction2, ['\n    ', props.resumableUploads ? props.isAllPaused ? (_uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '15'), _uppyIcon.setAttribute('height', '17'), _uppyIcon.setAttribute('viewBox', '0 0 11 13'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, ['\n          ', (_path2 = document.createElementNS(_svgNamespace, 'path'), _path2.setAttribute('d', 'M1.26 12.534a.67.67 0 0 1-.674.012.67.67 0 0 1-.336-.583v-11C.25.724.38.5.586.382a.658.658 0 0 1 .673.012l9.165 5.5a.66.66 0 0 1 .325.57.66.66 0 0 1-.325.573l-9.166 5.5z'), _path2), '\n        ']), _uppyIcon) : (_uppyIcon2 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon2.setAttribute('width', '16'), _uppyIcon2.setAttribute('height', '17'), _uppyIcon2.setAttribute('viewBox', '0 0 12 13'), _uppyIcon2.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon2, ['\n          ', (_path3 = document.createElementNS(_svgNamespace, 'path'), _path3.setAttribute('d', 'M4.888.81v11.38c0 .446-.324.81-.722.81H2.722C2.324 13 2 12.636 2 12.19V.81c0-.446.324-.81.722-.81h1.444c.398 0 .722.364.722.81zM9.888.81v11.38c0 .446-.324.81-.722.81H7.722C7.324 13 7 12.636 7 12.19V.81c0-.446.324-.81.722-.81h1.444c.398 0 .722.364.722.81z'), _path3), '\n        ']), _uppyIcon2) : (_uppyIcon3 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon3.setAttribute('width', '16px'), _uppyIcon3.setAttribute('height', '16px'), _uppyIcon3.setAttribute('viewBox', '0 0 19 19'), _uppyIcon3.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon3, ['\n        ', (_path4 = document.createElementNS(_svgNamespace, 'path'), _path4.setAttribute('d', 'M17.318 17.232L9.94 9.854 9.586 9.5l-.354.354-7.378 7.378h.707l-.62-.62v.706L9.318 9.94l.354-.354-.354-.354L1.94 1.854v.707l.62-.62h-.706l7.378 7.378.354.354.354-.354 7.378-7.378h-.707l.622.62v-.706L9.854 9.232l-.354.354.354.354 7.378 7.378.708-.707-7.38-7.378v.708l7.38-7.38.353-.353-.353-.353-.622-.622-.353-.353-.354.352-7.378 7.38h.708L2.56 1.23 2.208.88l-.353.353-.622.62-.353.355.352.353 7.38 7.38v-.708l-7.38 7.38-.353.353.352.353.622.622.353.353.354-.353 7.38-7.38h-.708l7.38 7.38z'), _path4), '\n      ']), _uppyIcon3), '\n  ']), _uppyDashboardStatusBarAction2;
};

var togglePauseResume = function togglePauseResume(props) {
  if (props.isAllComplete) return;

  if (!props.resumableUploads) {
    return props.cancelAll();
  }

  if (props.isAllPaused) {
    return props.resumeAll();
  }

  return props.pauseAll();
};

},{"lodash.throttle":5,"yo-yo":22,"yo-yoify/lib/appendChild":31}],54:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');
var ActionBrowseTagline = require('./ActionBrowseTagline');

var _require = require('./icons'),
    localIcon = _require.localIcon;

module.exports = function (props) {
  var _uppyDashboardTabName, _uppyDashboardTabBtn, _uppyDashboardInput, _uppyDashboardTab, _uppyDashboardTabsList, _nav, _uppyDashboardTabs2;

  var isHidden = Object.keys(props.files).length === 0;

  if (props.acquirers.length === 0) {
    var _uppyDashboardTabsTitle, _uppyDashboardTabs;

    return _uppyDashboardTabs = document.createElement('div'), _uppyDashboardTabs.setAttribute('aria-hidden', '' + String(isHidden) + ''), _uppyDashboardTabs.setAttribute('class', 'UppyDashboardTabs'), _appendChild(_uppyDashboardTabs, ['\n        ', (_uppyDashboardTabsTitle = document.createElement('h3'), _uppyDashboardTabsTitle.setAttribute('class', 'UppyDashboardTabs-title'), _appendChild(_uppyDashboardTabsTitle, ['\n        ', ActionBrowseTagline({
      acquirers: props.acquirers,
      container: props.container,
      handleInputChange: props.handleInputChange,
      i18n: props.i18n
    }), '\n        ']), _uppyDashboardTabsTitle), '\n      ']), _uppyDashboardTabs;
  }

  return _uppyDashboardTabs2 = document.createElement('div'), _uppyDashboardTabs2.setAttribute('class', 'UppyDashboardTabs'), _appendChild(_uppyDashboardTabs2, ['\n    ', (_nav = document.createElement('nav'), _appendChild(_nav, ['\n      ', (_uppyDashboardTabsList = document.createElement('ul'), _uppyDashboardTabsList.setAttribute('role', 'tablist'), _uppyDashboardTabsList.setAttribute('class', 'UppyDashboardTabs-list'), _appendChild(_uppyDashboardTabsList, ['\n        ', (_uppyDashboardTab = document.createElement('li'), _uppyDashboardTab.setAttribute('class', 'UppyDashboardTab'), _appendChild(_uppyDashboardTab, ['\n          ', (_uppyDashboardTabBtn = document.createElement('button'), _uppyDashboardTabBtn.setAttribute('type', 'button'), _uppyDashboardTabBtn.setAttribute('role', 'tab'), _uppyDashboardTabBtn.setAttribute('tabindex', '0'), _uppyDashboardTabBtn.onclick = function (ev) {
    var input = document.querySelector(props.container + ' .UppyDashboard-input');
    input.click();
  }, _uppyDashboardTabBtn.setAttribute('class', 'UppyDashboardTab-btn UppyDashboard-focus'), _appendChild(_uppyDashboardTabBtn, ['\n            ', localIcon(), '\n            ', (_uppyDashboardTabName = document.createElement('h5'), _uppyDashboardTabName.setAttribute('class', 'UppyDashboardTab-name'), _appendChild(_uppyDashboardTabName, [props.i18n('localDisk')]), _uppyDashboardTabName), '\n          ']), _uppyDashboardTabBtn), '\n          ', (_uppyDashboardInput = document.createElement('input'), _uppyDashboardInput.setAttribute('type', 'file'), _uppyDashboardInput.setAttribute('name', 'files[]'), _uppyDashboardInput.setAttribute('multiple', 'true'), _uppyDashboardInput.onchange = props.handleInputChange, _uppyDashboardInput.setAttribute('class', 'UppyDashboard-input'), _uppyDashboardInput), '\n        ']), _uppyDashboardTab), '\n        ', props.acquirers.map(function (target) {
    var _uppyDashboardTabName2, _uppyDashboardTabBtn2, _uppyDashboardTab2;

    return _uppyDashboardTab2 = document.createElement('li'), _uppyDashboardTab2.setAttribute('class', 'UppyDashboardTab'), _appendChild(_uppyDashboardTab2, ['\n            ', (_uppyDashboardTabBtn2 = document.createElement('button'), _uppyDashboardTabBtn2.setAttribute('role', 'tab'), _uppyDashboardTabBtn2.setAttribute('tabindex', '0'), _uppyDashboardTabBtn2.setAttribute('aria-controls', 'UppyDashboardContent-panel--' + String(target.id) + ''), _uppyDashboardTabBtn2.setAttribute('aria-selected', '' + String(target.isHidden ? 'false' : 'true') + ''), _uppyDashboardTabBtn2.onclick = function () {
      return props.showPanel(target.id);
    }, _uppyDashboardTabBtn2.setAttribute('class', 'UppyDashboardTab-btn'), _appendChild(_uppyDashboardTabBtn2, ['\n              ', target.icon, '\n              ', (_uppyDashboardTabName2 = document.createElement('h5'), _uppyDashboardTabName2.setAttribute('class', 'UppyDashboardTab-name'), _appendChild(_uppyDashboardTabName2, [target.name]), _uppyDashboardTabName2), '\n            ']), _uppyDashboardTabBtn2), '\n          ']), _uppyDashboardTab2;
  }), '\n      ']), _uppyDashboardTabsList), '\n    ']), _nav), '\n  ']), _uppyDashboardTabs2;
};

},{"./ActionBrowseTagline":47,"./icons":57,"yo-yo":22,"yo-yoify/lib/appendChild":31}],55:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');

var _require = require('./icons'),
    uploadIcon = _require.uploadIcon;

module.exports = function (props) {
  var _uppyDashboardUploadCount, _uppyButtonCircular;

  props = props || {};

  return _uppyButtonCircular = document.createElement('button'), _uppyButtonCircular.setAttribute('type', 'button'), _uppyButtonCircular.setAttribute('title', '' + String(props.i18n('uploadAllNewFiles')) + ''), _uppyButtonCircular.setAttribute('aria-label', '' + String(props.i18n('uploadAllNewFiles')) + ''), _uppyButtonCircular.onclick = props.startUpload, _uppyButtonCircular.setAttribute('class', 'UppyButton--circular\n                   UppyButton--blue\n                   UppyDashboard-upload'), _appendChild(_uppyButtonCircular, ['\n            ', uploadIcon(), '\n            ', (_uppyDashboardUploadCount = document.createElement('sup'), _uppyDashboardUploadCount.setAttribute('title', '' + String(props.i18n('numberOfSelectedFiles')) + ''), _uppyDashboardUploadCount.setAttribute('aria-label', '' + String(props.i18n('numberOfSelectedFiles')) + ''), _uppyDashboardUploadCount.setAttribute('class', 'UppyDashboard-uploadCount'), _appendChild(_uppyDashboardUploadCount, ['\n                  ', props.newFileCount]), _uppyDashboardUploadCount), '\n    ']), _uppyButtonCircular;
};

},{"./icons":57,"yo-yo":22,"yo-yoify/lib/appendChild":31}],56:[function(require,module,exports){
'use strict';

var _require = require('./icons'),
    iconText = _require.iconText,
    iconFile = _require.iconFile,
    iconAudio = _require.iconAudio,
    iconVideo = _require.iconVideo,
    iconPDF = _require.iconPDF;

module.exports = function getIconByMime(fileTypeGeneral, fileTypeSpecific) {
  if (fileTypeGeneral === 'text') {
    return {
      color: '#000',
      icon: iconText()
    };
  }

  if (fileTypeGeneral === 'audio') {
    return {
      color: '#1abc9c',
      icon: iconAudio()
    };
  }

  if (fileTypeGeneral === 'video') {
    return {
      color: '#2980b9',
      icon: iconVideo()
    };
  }

  if (fileTypeGeneral === 'application' && fileTypeSpecific === 'pdf') {
    return {
      color: '#e74c3c',
      icon: iconPDF()
    };
  }

  return {
    color: '#000',
    icon: iconFile()
  };
};

},{"./icons":57}],57:[function(require,module,exports){
'use strict';

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');

// https://css-tricks.com/creating-svg-icon-system-react/

function defaultTabIcon() {
  var _path, _uppyIcon;

  return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '30'), _uppyIcon.setAttribute('height', '30'), _uppyIcon.setAttribute('viewBox', '0 0 30 30'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, ['\n    ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M15 30c8.284 0 15-6.716 15-15 0-8.284-6.716-15-15-15C6.716 0 0 6.716 0 15c0 8.284 6.716 15 15 15zm4.258-12.676v6.846h-8.426v-6.846H5.204l9.82-12.364 9.82 12.364H19.26z'), _path), '\n  ']), _uppyIcon;
}

function iconCopy() {
  var _path2, _path3, _uppyIcon2;

  return _uppyIcon2 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon2.setAttribute('width', '51'), _uppyIcon2.setAttribute('height', '51'), _uppyIcon2.setAttribute('viewBox', '0 0 51 51'), _uppyIcon2.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon2, ['\n    ', (_path2 = document.createElementNS(_svgNamespace, 'path'), _path2.setAttribute('d', 'M17.21 45.765a5.394 5.394 0 0 1-7.62 0l-4.12-4.122a5.393 5.393 0 0 1 0-7.618l6.774-6.775-2.404-2.404-6.775 6.776c-3.424 3.427-3.424 9 0 12.426l4.12 4.123a8.766 8.766 0 0 0 6.216 2.57c2.25 0 4.5-.858 6.214-2.57l13.55-13.552a8.72 8.72 0 0 0 2.575-6.213 8.73 8.73 0 0 0-2.575-6.213l-4.123-4.12-2.404 2.404 4.123 4.12a5.352 5.352 0 0 1 1.58 3.81c0 1.438-.562 2.79-1.58 3.808l-13.55 13.55z'), _path2), '\n    ', (_path3 = document.createElementNS(_svgNamespace, 'path'), _path3.setAttribute('d', 'M44.256 2.858A8.728 8.728 0 0 0 38.043.283h-.002a8.73 8.73 0 0 0-6.212 2.574l-13.55 13.55a8.725 8.725 0 0 0-2.575 6.214 8.73 8.73 0 0 0 2.574 6.216l4.12 4.12 2.405-2.403-4.12-4.12a5.357 5.357 0 0 1-1.58-3.812c0-1.437.562-2.79 1.58-3.808l13.55-13.55a5.348 5.348 0 0 1 3.81-1.58c1.44 0 2.792.562 3.81 1.58l4.12 4.12c2.1 2.1 2.1 5.518 0 7.617L39.2 23.775l2.404 2.404 6.775-6.777c3.426-3.427 3.426-9 0-12.426l-4.12-4.12z'), _path3), '\n  ']), _uppyIcon2;
}

function iconResume() {
  var _play, _uppyIcon3;

  return _uppyIcon3 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon3.setAttribute('width', '25'), _uppyIcon3.setAttribute('height', '25'), _uppyIcon3.setAttribute('viewBox', '0 0 44 44'), _uppyIcon3.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon3, ['\n    ', (_play = document.createElementNS(_svgNamespace, 'polygon'), _play.setAttribute('transform', 'translate(6, 5.5)'), _play.setAttribute('points', '13 21.6666667 13 11 21 16.3333333'), _play.setAttribute('class', 'play'), _play), '\n  ']), _uppyIcon3;
}

function iconPause() {
  var _rect, _rect2, _pause, _uppyIcon4;

  return _uppyIcon4 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon4.setAttribute('width', '25px'), _uppyIcon4.setAttribute('height', '25px'), _uppyIcon4.setAttribute('viewBox', '0 0 44 44'), _uppyIcon4.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon4, ['\n    ', (_pause = document.createElementNS(_svgNamespace, 'g'), _pause.setAttribute('transform', 'translate(18, 17)'), _pause.setAttribute('class', 'pause'), _appendChild(_pause, ['\n      ', (_rect = document.createElementNS(_svgNamespace, 'rect'), _rect.setAttribute('x', '0'), _rect.setAttribute('y', '0'), _rect.setAttribute('width', '2'), _rect.setAttribute('height', '10'), _rect.setAttribute('rx', '0'), _rect), '\n      ', (_rect2 = document.createElementNS(_svgNamespace, 'rect'), _rect2.setAttribute('x', '6'), _rect2.setAttribute('y', '0'), _rect2.setAttribute('width', '2'), _rect2.setAttribute('height', '10'), _rect2.setAttribute('rx', '0'), _rect2), '\n    ']), _pause), '\n  ']), _uppyIcon4;
}

function iconEdit() {
  var _path4, _uppyIcon5;

  return _uppyIcon5 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon5.setAttribute('width', '28'), _uppyIcon5.setAttribute('height', '28'), _uppyIcon5.setAttribute('viewBox', '0 0 28 28'), _uppyIcon5.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon5, ['\n    ', (_path4 = document.createElementNS(_svgNamespace, 'path'), _path4.setAttribute('d', 'M25.436 2.566a7.98 7.98 0 0 0-2.078-1.51C22.638.703 21.906.5 21.198.5a3 3 0 0 0-1.023.17 2.436 2.436 0 0 0-.893.562L2.292 18.217.5 27.5l9.28-1.796 16.99-16.99c.255-.254.444-.56.562-.888a3 3 0 0 0 .17-1.023c0-.708-.205-1.44-.555-2.16a8 8 0 0 0-1.51-2.077zM9.01 24.252l-4.313.834c0-.03.008-.06.012-.09.007-.944-.74-1.715-1.67-1.723-.04 0-.078.007-.118.01l.83-4.29L17.72 5.024l5.264 5.264L9.01 24.252zm16.84-16.96a.818.818 0 0 1-.194.31l-1.57 1.57-5.26-5.26 1.57-1.57a.82.82 0 0 1 .31-.194 1.45 1.45 0 0 1 .492-.074c.397 0 .917.126 1.468.397.55.27 1.13.678 1.656 1.21.53.53.94 1.11 1.208 1.655.272.55.397 1.07.393 1.468.004.193-.027.358-.074.488z'), _path4), '\n  ']), _uppyIcon5;
}

function localIcon() {
  var _path5, _path6, _uppyIcon6;

  return _uppyIcon6 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon6.setAttribute('width', '27'), _uppyIcon6.setAttribute('height', '25'), _uppyIcon6.setAttribute('viewBox', '0 0 27 25'), _uppyIcon6.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon6, ['\n    ', (_path5 = document.createElementNS(_svgNamespace, 'path'), _path5.setAttribute('d', 'M5.586 9.288a.313.313 0 0 0 .282.176h4.84v3.922c0 1.514 1.25 2.24 2.792 2.24 1.54 0 2.79-.726 2.79-2.24V9.464h4.84c.122 0 .23-.068.284-.176a.304.304 0 0 0-.046-.324L13.735.106a.316.316 0 0 0-.472 0l-7.63 8.857a.302.302 0 0 0-.047.325z'), _path5), '\n    ', (_path6 = document.createElementNS(_svgNamespace, 'path'), _path6.setAttribute('d', 'M24.3 5.093c-.218-.76-.54-1.187-1.208-1.187h-4.856l1.018 1.18h3.948l2.043 11.038h-7.193v2.728H9.114v-2.725h-7.36l2.66-11.04h3.33l1.018-1.18H3.907c-.668 0-1.06.46-1.21 1.186L0 16.456v7.062C0 24.338.676 25 1.51 25h23.98c.833 0 1.51-.663 1.51-1.482v-7.062L24.3 5.093z'), _path6), '\n  ']), _uppyIcon6;
}

function closeIcon() {
  var _path7, _uppyIcon7;

  return _uppyIcon7 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon7.setAttribute('width', '14px'), _uppyIcon7.setAttribute('height', '14px'), _uppyIcon7.setAttribute('viewBox', '0 0 19 19'), _uppyIcon7.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon7, ['\n    ', (_path7 = document.createElementNS(_svgNamespace, 'path'), _path7.setAttribute('d', 'M17.318 17.232L9.94 9.854 9.586 9.5l-.354.354-7.378 7.378h.707l-.62-.62v.706L9.318 9.94l.354-.354-.354-.354L1.94 1.854v.707l.62-.62h-.706l7.378 7.378.354.354.354-.354 7.378-7.378h-.707l.622.62v-.706L9.854 9.232l-.354.354.354.354 7.378 7.378.708-.707-7.38-7.378v.708l7.38-7.38.353-.353-.353-.353-.622-.622-.353-.353-.354.352-7.378 7.38h.708L2.56 1.23 2.208.88l-.353.353-.622.62-.353.355.352.353 7.38 7.38v-.708l-7.38 7.38-.353.353.352.353.622.622.353.353.354-.353 7.38-7.38h-.708l7.38 7.38z'), _path7), '\n  ']), _uppyIcon7;
}

function pluginIcon() {
  var _path8, _path9, _uppyIcon8;

  return _uppyIcon8 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon8.setAttribute('width', '16px'), _uppyIcon8.setAttribute('height', '16px'), _uppyIcon8.setAttribute('viewBox', '0 0 32 30'), _uppyIcon8.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon8, ['\n      ', (_path8 = document.createElementNS(_svgNamespace, 'path'), _path8.setAttribute('d', 'M6.6209894,11.1451162 C6.6823051,11.2751669 6.81374248,11.3572188 6.95463813,11.3572188 L12.6925482,11.3572188 L12.6925482,16.0630427 C12.6925482,17.880509 14.1726048,18.75 16.0000083,18.75 C17.8261072,18.75 19.3074684,17.8801847 19.3074684,16.0630427 L19.3074684,11.3572188 L25.0437478,11.3572188 C25.1875787,11.3572188 25.3164069,11.2751669 25.3790272,11.1451162 C25.4370814,11.0173358 25.4171865,10.8642587 25.3252129,10.7562615 L16.278212,0.127131837 C16.2093949,0.0463771751 16.1069846,0 15.9996822,0 C15.8910751,0 15.7886648,0.0463771751 15.718217,0.127131837 L6.6761083,10.7559371 C6.58250402,10.8642587 6.56293518,11.0173358 6.6209894,11.1451162 L6.6209894,11.1451162 Z'), _path8), '\n      ', (_path9 = document.createElementNS(_svgNamespace, 'path'), _path9.setAttribute('d', 'M28.8008722,6.11142645 C28.5417891,5.19831555 28.1583331,4.6875 27.3684848,4.6875 L21.6124454,4.6875 L22.8190234,6.10307874 L27.4986725,6.10307874 L29.9195817,19.3486449 L21.3943891,19.3502502 L21.3943891,22.622552 L10.8023461,22.622552 L10.8023461,19.3524977 L2.07815702,19.3534609 L5.22979699,6.10307874 L9.17871529,6.10307874 L10.3840011,4.6875 L4.6308691,4.6875 C3.83940559,4.6875 3.37421888,5.2390909 3.19815864,6.11142645 L0,19.7470874 L0,28.2212959 C0,29.2043992 0.801477937,30 1.78870751,30 L30.2096773,30 C31.198199,30 32,29.2043992 32,28.2212959 L32,19.7470874 L28.8008722,6.11142645 L28.8008722,6.11142645 Z'), _path9), '\n    ']), _uppyIcon8;
}

function checkIcon() {
  var _polygon, _uppyIcon9;

  return _uppyIcon9 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon9.setAttribute('width', '13px'), _uppyIcon9.setAttribute('height', '9px'), _uppyIcon9.setAttribute('viewBox', '0 0 13 9'), _uppyIcon9.setAttribute('class', 'UppyIcon UppyIcon-check'), _appendChild(_uppyIcon9, ['\n    ', (_polygon = document.createElementNS(_svgNamespace, 'polygon'), _polygon.setAttribute('points', '5 7.293 1.354 3.647 0.646 4.354 5 8.707 12.354 1.354 11.646 0.647'), _polygon)]), _uppyIcon9;
}

function iconAudio() {
  var _path10, _uppyIcon10;

  return _uppyIcon10 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon10.setAttribute('viewBox', '0 0 55 55'), _uppyIcon10.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon10, ['\n    ', (_path10 = document.createElementNS(_svgNamespace, 'path'), _path10.setAttribute('d', 'M52.66.25c-.216-.19-.5-.276-.79-.242l-31 4.01a1 1 0 0 0-.87.992V40.622C18.174 38.428 15.273 37 12 37c-5.514 0-10 4.037-10 9s4.486 9 10 9 10-4.037 10-9c0-.232-.02-.46-.04-.687.014-.065.04-.124.04-.192V16.12l29-3.753v18.257C49.174 28.428 46.273 27 43 27c-5.514 0-10 4.037-10 9s4.486 9 10 9c5.464 0 9.913-3.966 9.993-8.867 0-.013.007-.024.007-.037V1a.998.998 0 0 0-.34-.75zM12 53c-4.41 0-8-3.14-8-7s3.59-7 8-7 8 3.14 8 7-3.59 7-8 7zm31-10c-4.41 0-8-3.14-8-7s3.59-7 8-7 8 3.14 8 7-3.59 7-8 7zM22 14.1V5.89l29-3.753v8.21l-29 3.754z'), _path10), '\n  ']), _uppyIcon10;
}

function iconVideo() {
  var _path11, _path12, _uppyIcon11;

  return _uppyIcon11 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon11.setAttribute('viewBox', '0 0 58 58'), _uppyIcon11.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon11, ['\n    ', (_path11 = document.createElementNS(_svgNamespace, 'path'), _path11.setAttribute('d', 'M36.537 28.156l-11-7a1.005 1.005 0 0 0-1.02-.033C24.2 21.3 24 21.635 24 22v14a1 1 0 0 0 1.537.844l11-7a1.002 1.002 0 0 0 0-1.688zM26 34.18V23.82L34.137 29 26 34.18z'), _path11), (_path12 = document.createElementNS(_svgNamespace, 'path'), _path12.setAttribute('d', 'M57 6H1a1 1 0 0 0-1 1v44a1 1 0 0 0 1 1h56a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1zM10 28H2v-9h8v9zm-8 2h8v9H2v-9zm10 10V8h34v42H12V40zm44-12h-8v-9h8v9zm-8 2h8v9h-8v-9zm8-22v9h-8V8h8zM2 8h8v9H2V8zm0 42v-9h8v9H2zm54 0h-8v-9h8v9z'), _path12), '\n  ']), _uppyIcon11;
}

function iconPDF() {
  var _path13, _uppyIcon12;

  return _uppyIcon12 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon12.setAttribute('viewBox', '0 0 342 335'), _uppyIcon12.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon12, ['\n    ', (_path13 = document.createElementNS(_svgNamespace, 'path'), _path13.setAttribute('d', 'M329.337 227.84c-2.1 1.3-8.1 2.1-11.9 2.1-12.4 0-27.6-5.7-49.1-14.9 8.3-.6 15.8-.9 22.6-.9 12.4 0 16 0 28.2 3.1 12.1 3 12.2 9.3 10.2 10.6zm-215.1 1.9c4.8-8.4 9.7-17.3 14.7-26.8 12.2-23.1 20-41.3 25.7-56.2 11.5 20.9 25.8 38.6 42.5 52.8 2.1 1.8 4.3 3.5 6.7 5.3-34.1 6.8-63.6 15-89.6 24.9zm39.8-218.9c6.8 0 10.7 17.06 11 33.16.3 16-3.4 27.2-8.1 35.6-3.9-12.4-5.7-31.8-5.7-44.5 0 0-.3-24.26 2.8-24.26zm-133.4 307.2c3.9-10.5 19.1-31.3 41.6-49.8 1.4-1.1 4.9-4.4 8.1-7.4-23.5 37.6-39.3 52.5-49.7 57.2zm315.2-112.3c-6.8-6.7-22-10.2-45-10.5-15.6-.2-34.3 1.2-54.1 3.9-8.8-5.1-17.9-10.6-25.1-17.3-19.2-18-35.2-42.9-45.2-70.3.6-2.6 1.2-4.8 1.7-7.1 0 0 10.8-61.5 7.9-82.3-.4-2.9-.6-3.7-1.4-5.9l-.9-2.5c-2.9-6.76-8.7-13.96-17.8-13.57l-5.3-.17h-.1c-10.1 0-18.4 5.17-20.5 12.84-6.6 24.3.2 60.5 12.5 107.4l-3.2 7.7c-8.8 21.4-19.8 43-29.5 62l-1.3 2.5c-10.2 20-19.5 37-27.9 51.4l-8.7 4.6c-.6.4-15.5 8.2-19 10.3-29.6 17.7-49.28 37.8-52.54 53.8-1.04 5-.26 11.5 5.01 14.6l8.4 4.2c3.63 1.8 7.53 2.7 11.43 2.7 21.1 0 45.6-26.2 79.3-85.1 39-12.7 83.4-23.3 122.3-29.1 29.6 16.7 66 28.3 89 28.3 4.1 0 7.6-.4 10.5-1.2 4.4-1.1 8.1-3.6 10.4-7.1 4.4-6.7 5.4-15.9 4.1-25.4-.3-2.8-2.6-6.3-5-8.7z'), _path13), '\n  ']), _uppyIcon12;
}

function iconFile() {
  var _path14, _uppyIcon13;

  return _uppyIcon13 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon13.setAttribute('width', '44'), _uppyIcon13.setAttribute('height', '58'), _uppyIcon13.setAttribute('viewBox', '0 0 44 58'), _uppyIcon13.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon13, ['\n    ', (_path14 = document.createElementNS(_svgNamespace, 'path'), _path14.setAttribute('d', 'M27.437.517a1 1 0 0 0-.094.03H4.25C2.037.548.217 2.368.217 4.58v48.405c0 2.212 1.82 4.03 4.03 4.03H39.03c2.21 0 4.03-1.818 4.03-4.03V15.61a1 1 0 0 0-.03-.28 1 1 0 0 0 0-.093 1 1 0 0 0-.03-.032 1 1 0 0 0 0-.03 1 1 0 0 0-.032-.063 1 1 0 0 0-.03-.063 1 1 0 0 0-.032 0 1 1 0 0 0-.03-.063 1 1 0 0 0-.032-.03 1 1 0 0 0-.03-.063 1 1 0 0 0-.063-.062l-14.593-14a1 1 0 0 0-.062-.062A1 1 0 0 0 28 .708a1 1 0 0 0-.374-.157 1 1 0 0 0-.156 0 1 1 0 0 0-.03-.03l-.003-.003zM4.25 2.547h22.218v9.97c0 2.21 1.82 4.03 4.03 4.03h10.564v36.438a2.02 2.02 0 0 1-2.032 2.032H4.25c-1.13 0-2.032-.9-2.032-2.032V4.58c0-1.13.902-2.032 2.03-2.032zm24.218 1.345l10.375 9.937.75.718H30.5c-1.13 0-2.032-.9-2.032-2.03V3.89z'), _path14), '\n  ']), _uppyIcon13;
}

function iconText() {
  var _path15, _path16, _uppyIcon14;

  return _uppyIcon14 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon14.setAttribute('viewBox', '0 0 64 64'), _uppyIcon14.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon14, ['\n    ', (_path15 = document.createElementNS(_svgNamespace, 'path'), _path15.setAttribute('d', 'M8 64h48V0H22.586L8 14.586V64zm46-2H10V16h14V2h30v60zM11.414 14L22 3.414V14H11.414z'), _path15), '\n    ', (_path16 = document.createElementNS(_svgNamespace, 'path'), _path16.setAttribute('d', 'M32 13h14v2H32zM18 23h28v2H18zM18 33h28v2H18zM18 43h28v2H18zM18 53h28v2H18z'), _path16), '\n  ']), _uppyIcon14;
}

function uploadIcon() {
  var _path17, _path18, _uppyIcon15;

  return _uppyIcon15 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon15.setAttribute('width', '37'), _uppyIcon15.setAttribute('height', '33'), _uppyIcon15.setAttribute('viewBox', '0 0 37 33'), _uppyIcon15.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon15, ['\n    ', (_path17 = document.createElementNS(_svgNamespace, 'path'), _path17.setAttribute('d', 'M29.107 24.5c4.07 0 7.393-3.355 7.393-7.442 0-3.994-3.105-7.307-7.012-7.502l.468.415C29.02 4.52 24.34.5 18.886.5c-4.348 0-8.27 2.522-10.138 6.506l.446-.288C4.394 6.782.5 10.758.5 15.608c0 4.924 3.906 8.892 8.76 8.892h4.872c.635 0 1.095-.467 1.095-1.104 0-.636-.46-1.103-1.095-1.103H9.26c-3.644 0-6.63-3.035-6.63-6.744 0-3.71 2.926-6.685 6.57-6.685h.964l.14-.28.177-.362c1.477-3.4 4.744-5.576 8.347-5.576 4.58 0 8.45 3.452 9.01 8.072l.06.536.05.446h1.101c2.87 0 5.204 2.37 5.204 5.295s-2.333 5.296-5.204 5.296h-6.062c-.634 0-1.094.467-1.094 1.103 0 .637.46 1.104 1.094 1.104h6.12z'), _path17), '\n    ', (_path18 = document.createElementNS(_svgNamespace, 'path'), _path18.setAttribute('d', 'M23.196 18.92l-4.828-5.258-.366-.4-.368.398-4.828 5.196a1.13 1.13 0 0 0 0 1.546c.428.46 1.11.46 1.537 0l3.45-3.71-.868-.34v15.03c0 .64.445 1.118 1.075 1.118.63 0 1.075-.48 1.075-1.12V16.35l-.867.34 3.45 3.712a1 1 0 0 0 .767.345 1 1 0 0 0 .77-.345c.416-.33.416-1.036 0-1.485v.003z'), _path18), '\n  ']), _uppyIcon15;
}

function dashboardBgIcon() {
  var _path19, _uppyIcon16;

  return _uppyIcon16 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon16.setAttribute('width', '48'), _uppyIcon16.setAttribute('height', '69'), _uppyIcon16.setAttribute('viewBox', '0 0 48 69'), _uppyIcon16.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon16, ['\n    ', (_path19 = document.createElementNS(_svgNamespace, 'path'), _path19.setAttribute('d', 'M.5 1.5h5zM10.5 1.5h5zM20.5 1.5h5zM30.504 1.5h5zM45.5 11.5v5zM45.5 21.5v5zM45.5 31.5v5zM45.5 41.502v5zM45.5 51.502v5zM45.5 61.5v5zM45.5 66.502h-4.998zM35.503 66.502h-5zM25.5 66.502h-5zM15.5 66.502h-5zM5.5 66.502h-5zM.5 66.502v-5zM.5 56.502v-5zM.5 46.503V41.5zM.5 36.5v-5zM.5 26.5v-5zM.5 16.5v-5zM.5 6.5V1.498zM44.807 11H36V2.195z'), _path19), '\n  ']), _uppyIcon16;
}

module.exports = {
  defaultTabIcon: defaultTabIcon,
  iconCopy: iconCopy,
  iconResume: iconResume,
  iconPause: iconPause,
  iconEdit: iconEdit,
  localIcon: localIcon,
  closeIcon: closeIcon,
  pluginIcon: pluginIcon,
  checkIcon: checkIcon,
  iconAudio: iconAudio,
  iconVideo: iconVideo,
  iconPDF: iconPDF,
  iconFile: iconFile,
  iconText: iconText,
  uploadIcon: uploadIcon,
  dashboardBgIcon: dashboardBgIcon
};

},{"yo-yo":22,"yo-yoify/lib/appendChild":31}],58:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Plugin = require('../Plugin');
var Translator = require('../../core/Translator');
var dragDrop = require('drag-drop');
var Dashboard = require('./Dashboard');

var _require = require('../../core/Utils'),
    getSpeed = _require.getSpeed;

var _require2 = require('../../core/Utils'),
    getETA = _require2.getETA;

var _require3 = require('../../core/Utils'),
    prettyETA = _require3.prettyETA;

var prettyBytes = require('prettier-bytes');

var _require4 = require('./icons'),
    defaultTabIcon = _require4.defaultTabIcon;

/**
 * Modal Dialog & Dashboard
 */


module.exports = function (_Plugin) {
  _inherits(DashboardUI, _Plugin);

  function DashboardUI(core, opts) {
    _classCallCheck(this, DashboardUI);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.id = 'DashboardUI';
    _this.title = 'Dashboard UI';
    _this.type = 'orchestrator';

    var defaultLocale = {
      strings: {
        selectToUpload: 'Select files to upload',
        closeModal: 'Close Modal',
        upload: 'Upload',
        importFrom: 'Import files from',
        dashboardWindowTitle: 'Uppy Dashboard Window (Press escape to close)',
        dashboardTitle: 'Uppy Dashboard',
        copyLinkToClipboardSuccess: 'Link copied to clipboard.',
        copyLinkToClipboardFallback: 'Copy the URL below',
        done: 'Done',
        localDisk: 'Local Disk',
        dropPasteImport: 'Drop files here, paste, import from one of the locations above or',
        dropPaste: 'Drop files here, paste or',
        browse: 'browse',
        fileProgress: 'File progress: upload speed and ETA',
        numberOfSelectedFiles: 'Number of selected files',
        uploadAllNewFiles: 'Upload all new files'
      }
    };

    // set default options
    var defaultOptions = {
      target: 'body',
      inline: false,
      width: 750,
      height: 550,
      semiTransparent: false,
      defaultTabIcon: defaultTabIcon(),
      showProgressDetails: false,
      locale: defaultLocale
    };

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);

    _this.locale = _extends({}, defaultLocale, _this.opts.locale);
    _this.locale.strings = _extends({}, defaultLocale.strings, _this.opts.locale.strings);

    _this.translator = new Translator({ locale: _this.locale });
    _this.containerWidth = _this.translator.translate.bind(_this.translator);

    _this.hideModal = _this.hideModal.bind(_this);
    _this.showModal = _this.showModal.bind(_this);

    _this.addTarget = _this.addTarget.bind(_this);
    _this.actions = _this.actions.bind(_this);
    _this.hideAllPanels = _this.hideAllPanels.bind(_this);
    _this.showPanel = _this.showPanel.bind(_this);
    _this.initEvents = _this.initEvents.bind(_this);
    _this.handleDrop = _this.handleDrop.bind(_this);
    _this.pauseAll = _this.pauseAll.bind(_this);
    _this.resumeAll = _this.resumeAll.bind(_this);
    _this.cancelAll = _this.cancelAll.bind(_this);
    _this.updateDashboardElWidth = _this.updateDashboardElWidth.bind(_this);
    _this.render = _this.render.bind(_this);
    _this.install = _this.install.bind(_this);
    return _this;
  }

  DashboardUI.prototype.addTarget = function addTarget(plugin) {
    var callerPluginId = plugin.constructor.name;
    var callerPluginName = plugin.title || callerPluginId;
    var callerPluginIcon = plugin.icon || this.opts.defaultTabIcon;
    var callerPluginType = plugin.type;

    if (callerPluginType !== 'acquirer' && callerPluginType !== 'progressindicator' && callerPluginType !== 'presenter') {
      var msg = 'Error: Modal can only be used by plugins of types: acquirer, progressindicator, presenter';
      this.core.log(msg);
      return;
    }

    var target = {
      id: callerPluginId,
      name: callerPluginName,
      icon: callerPluginIcon,
      type: callerPluginType,
      focus: plugin.focus,
      render: plugin.render,
      isHidden: true
    };

    var modal = this.core.getState().modal;
    var newTargets = modal.targets.slice();
    newTargets.push(target);

    this.core.setState({
      modal: _extends({}, modal, {
        targets: newTargets
      })
    });

    return this.opts.target;
  };

  DashboardUI.prototype.hideAllPanels = function hideAllPanels() {
    var modal = this.core.getState().modal;

    this.core.setState({ modal: _extends({}, modal, {
        activePanel: false
      }) });
  };

  DashboardUI.prototype.showPanel = function showPanel(id) {
    var modal = this.core.getState().modal;

    var activePanel = modal.targets.filter(function (target) {
      return target.type === 'acquirer' && target.id === id;
    })[0];

    this.core.setState({ modal: _extends({}, modal, {
        activePanel: activePanel
      }) });
  };

  DashboardUI.prototype.hideModal = function hideModal() {
    var modal = this.core.getState().modal;

    this.core.setState({
      modal: _extends({}, modal, {
        isHidden: true
      })
    });

    document.body.classList.remove('is-UppyDashboard-open');
  };

  DashboardUI.prototype.showModal = function showModal() {
    var modal = this.core.getState().modal;

    this.core.setState({
      modal: _extends({}, modal, {
        isHidden: false
      })
    });

    // add class to body that sets position fixed
    document.body.classList.add('is-UppyDashboard-open');
    // focus on modal inner block
    document.querySelector('.UppyDashboard-inner').focus();

    this.updateDashboardElWidth();
    // to be sure, sometimes when the function runs, container size is still 0
    setTimeout(this.updateDashboardElWidth, 300);
  };

  DashboardUI.prototype.initEvents = function initEvents() {
    var _this2 = this;

    // const dashboardEl = document.querySelector(`${this.opts.target} .UppyDashboard`)

    // Modal open button
    var showModalTrigger = document.querySelector(this.opts.trigger);
    if (!this.opts.inline && showModalTrigger) {
      showModalTrigger.addEventListener('click', this.showModal);
    } else {
      this.core.log('Modal trigger wasn’t found');
    }

    // Close the Modal on esc key press
    document.body.addEventListener('keyup', function (event) {
      if (event.keyCode === 27) {
        _this2.hideModal();
      }
    });

    // Drag Drop
    dragDrop(this.el, function (files) {
      _this2.handleDrop(files);
    });
  };

  DashboardUI.prototype.actions = function actions() {
    var _this3 = this;

    var bus = this.core.bus;

    bus.on('core:file-add', function () {
      _this3.hideAllPanels();
    });

    bus.on('dashboard:file-card', function (fileId) {
      var modal = _this3.core.getState().modal;

      _this3.core.setState({
        modal: _extends({}, modal, {
          fileCardFor: fileId || false
        })
      });
    });

    window.addEventListener('resize', this.updateDashboardElWidth);

    // bus.on('core:success', (uploadedCount) => {
    //   bus.emit(
    //     'informer',
    //     `${this.core.i18n('files', {'smart_count': uploadedCount})} successfully uploaded, Sir!`,
    //     'info',
    //     6000
    //   )
    // })
  };

  DashboardUI.prototype.updateDashboardElWidth = function updateDashboardElWidth() {
    var dashboardEl = document.querySelector('.UppyDashboard-inner');
    var containerWidth = dashboardEl.offsetWidth;
    console.log(containerWidth);

    var modal = this.core.getState().modal;
    this.core.setState({
      modal: _extends({}, modal, {
        containerWidth: dashboardEl.offsetWidth
      })
    });
  };

  DashboardUI.prototype.handleDrop = function handleDrop(files) {
    var _this4 = this;

    this.core.log('All right, someone dropped something...');

    files.forEach(function (file) {
      _this4.core.bus.emit('core:file-add', {
        source: _this4.id,
        name: file.name,
        type: file.type,
        data: file
      });
    });
  };

  DashboardUI.prototype.cancelAll = function cancelAll() {
    this.core.bus.emit('core:cancel-all');
  };

  DashboardUI.prototype.pauseAll = function pauseAll() {
    this.core.bus.emit('core:pause-all');
  };

  DashboardUI.prototype.resumeAll = function resumeAll() {
    this.core.bus.emit('core:resume-all');
  };

  DashboardUI.prototype.getTotalSpeed = function getTotalSpeed(files) {
    var totalSpeed = 0;
    files.forEach(function (file) {
      totalSpeed = totalSpeed + getSpeed(file.progress);
    });
    return totalSpeed;
  };

  DashboardUI.prototype.getTotalETA = function getTotalETA(files) {
    var totalSeconds = 0;

    files.forEach(function (file) {
      totalSeconds = totalSeconds + getETA(file.progress);
    });

    return totalSeconds;
  };

  DashboardUI.prototype.render = function render(state) {
    var _this5 = this;

    var files = state.files;

    var newFiles = Object.keys(files).filter(function (file) {
      return !files[file].progress.uploadStarted;
    });
    var uploadStartedFiles = Object.keys(files).filter(function (file) {
      return files[file].progress.uploadStarted;
    });
    var completeFiles = Object.keys(files).filter(function (file) {
      return files[file].progress.uploadComplete;
    });
    var inProgressFiles = Object.keys(files).filter(function (file) {
      return !files[file].progress.uploadComplete && files[file].progress.uploadStarted && !files[file].isPaused;
    });

    var inProgressFilesArray = [];
    inProgressFiles.forEach(function (file) {
      inProgressFilesArray.push(files[file]);
    });

    var totalSpeed = prettyBytes(this.getTotalSpeed(inProgressFilesArray));
    var totalETA = prettyETA(this.getTotalETA(inProgressFilesArray));

    // total size and uploaded size
    var totalSize = 0;
    var totalUploadedSize = 0;
    inProgressFilesArray.forEach(function (file) {
      totalSize = totalSize + (file.progress.bytesTotal || 0);
      totalUploadedSize = totalUploadedSize + (file.progress.bytesUploaded || 0);
    });
    totalSize = prettyBytes(totalSize);
    totalUploadedSize = prettyBytes(totalUploadedSize);

    var isAllComplete = state.totalProgress === 100;
    var isAllPaused = inProgressFiles.length === 0 && !isAllComplete && uploadStartedFiles.length > 0;
    var isUploadStarted = uploadStartedFiles.length > 0;

    var acquirers = state.modal.targets.filter(function (target) {
      return target.type === 'acquirer';
    });

    var progressindicators = state.modal.targets.filter(function (target) {
      return target.type === 'progressindicator';
    });

    var addFile = function addFile(file) {
      _this5.core.emitter.emit('core:file-add', file);
    };

    var removeFile = function removeFile(fileID) {
      _this5.core.emitter.emit('core:file-remove', fileID);
    };

    var startUpload = function startUpload(ev) {
      _this5.core.emitter.emit('core:upload');
    };

    var pauseUpload = function pauseUpload(fileID) {
      _this5.core.emitter.emit('core:upload-pause', fileID);
    };

    var cancelUpload = function cancelUpload(fileID) {
      _this5.core.emitter.emit('core:upload-cancel', fileID);
      _this5.core.emitter.emit('core:file-remove', fileID);
    };

    var showFileCard = function showFileCard(fileID) {
      _this5.core.emitter.emit('dashboard:file-card', fileID);
    };

    var fileCardDone = function fileCardDone(meta, fileID) {
      _this5.core.emitter.emit('core:update-meta', meta, fileID);
      _this5.core.emitter.emit('dashboard:file-card');
    };

    var info = function info(text, type, duration) {
      _this5.core.emitter.emit('informer', text, type, duration);
    };

    var resumableUploads = this.core.getState().capabilities.resumableUploads || false;

    return Dashboard({
      state: state,
      modal: state.modal,
      newFiles: newFiles,
      files: files,
      totalFileCount: Object.keys(files).length,
      isUploadStarted: isUploadStarted,
      inProgress: uploadStartedFiles.length,
      completeFiles: completeFiles,
      inProgressFiles: inProgressFiles,
      totalSpeed: totalSpeed,
      totalETA: totalETA,
      totalProgress: state.totalProgress,
      totalSize: totalSize,
      totalUploadedSize: totalUploadedSize,
      isAllComplete: isAllComplete,
      isAllPaused: isAllPaused,
      acquirers: acquirers,
      activePanel: state.modal.activePanel,
      progressindicators: progressindicators,
      autoProceed: this.core.opts.autoProceed,
      id: this.id,
      container: this.opts.target,
      hideModal: this.hideModal,
      showProgressDetails: this.opts.showProgressDetails,
      inline: this.opts.inline,
      semiTransparent: this.opts.semiTransparent,
      onPaste: this.handlePaste,
      showPanel: this.showPanel,
      hideAllPanels: this.hideAllPanels,
      log: this.core.log,
      bus: this.core.emitter,
      i18n: this.containerWidth,
      pauseAll: this.pauseAll,
      resumeAll: this.resumeAll,
      cancelAll: this.cancelAll,
      addFile: addFile,
      removeFile: removeFile,
      info: info,
      metaFields: state.metaFields,
      resumableUploads: resumableUploads,
      startUpload: startUpload,
      pauseUpload: pauseUpload,
      cancelUpload: cancelUpload,
      fileCardFor: state.modal.fileCardFor,
      showFileCard: showFileCard,
      fileCardDone: fileCardDone,
      updateDashboardElWidth: this.updateDashboardElWidth,
      maxWidth: this.opts.maxWidth,
      maxHeight: this.opts.maxHeight,
      currentWidth: state.modal.containerWidth,
      isWide: state.modal.containerWidth > 400
    });
  };

  DashboardUI.prototype.install = function install() {
    // Set default state for Modal
    this.core.setState({ modal: {
        isHidden: true,
        showFileCard: false,
        activePanel: false,
        targets: []
      } });

    var target = this.opts.target;
    var plugin = this;
    this.target = this.mount(target, plugin);

    this.initEvents();
    this.actions();
  };

  return DashboardUI;
}(Plugin);

},{"../../core/Translator":33,"../../core/Utils":35,"../Plugin":64,"./Dashboard":48,"./icons":57,"drag-drop":1,"prettier-bytes":10}],59:[function(require,module,exports){
'use strict';

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');

module.exports = {
  folder: function folder() {
    var _path, _uppyIcon;

    return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('style', 'width:16px;margin-right:3px'), _uppyIcon.setAttribute('viewBox', '0 0 276.157 276.157'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, ['\n      ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M273.08 101.378c-3.3-4.65-8.86-7.32-15.254-7.32h-24.34V67.59c0-10.2-8.3-18.5-18.5-18.5h-85.322c-3.63 0-9.295-2.875-11.436-5.805l-6.386-8.735c-4.982-6.814-15.104-11.954-23.546-11.954H58.73c-9.292 0-18.638 6.608-21.737 15.372l-2.033 5.752c-.958 2.71-4.72 5.37-7.596 5.37H18.5C8.3 49.09 0 57.39 0 67.59v167.07c0 .886.16 1.73.443 2.52.152 3.306 1.18 6.424 3.053 9.064 3.3 4.652 8.86 7.32 15.255 7.32h188.487c11.395 0 23.27-8.425 27.035-19.18l40.677-116.188c2.11-6.035 1.43-12.164-1.87-16.816zM18.5 64.088h8.864c9.295 0 18.64-6.607 21.738-15.37l2.032-5.75c.96-2.712 4.722-5.373 7.597-5.373h29.565c3.63 0 9.295 2.876 11.437 5.806l6.386 8.735c4.982 6.815 15.104 11.954 23.546 11.954h85.322c1.898 0 3.5 1.602 3.5 3.5v26.47H69.34c-11.395 0-23.27 8.423-27.035 19.178L15 191.23V67.59c0-1.898 1.603-3.5 3.5-3.5zm242.29 49.15l-40.676 116.188c-1.674 4.78-7.812 9.135-12.877 9.135H18.75c-1.447 0-2.576-.372-3.02-.997-.442-.625-.422-1.814.057-3.18l40.677-116.19c1.674-4.78 7.812-9.134 12.877-9.134h188.487c1.448 0 2.577.372 3.02.997.443.625.423 1.814-.056 3.18z'), _path), '\n  ']), _uppyIcon;
  },
  music: function music() {
    var _path2, _path3, _path4, _path5, _g, _uppyIcon2;

    return _uppyIcon2 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon2.setAttribute('width', '16.000000pt'), _uppyIcon2.setAttribute('height', '16.000000pt'), _uppyIcon2.setAttribute('viewBox', '0 0 48.000000 48.000000'), _uppyIcon2.setAttribute('preserveAspectRatio', 'xMidYMid meet'), _uppyIcon2.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon2, ['\n    ', (_g = document.createElementNS(_svgNamespace, 'g'), _g.setAttribute('transform', 'translate(0.000000,48.000000) scale(0.100000,-0.100000)'), _g.setAttribute('fill', '#525050'), _g.setAttribute('stroke', 'none'), _appendChild(_g, ['\n    ', (_path2 = document.createElementNS(_svgNamespace, 'path'), _path2.setAttribute('d', 'M209 473 c0 -5 0 -52 1 -106 1 -54 -2 -118 -6 -143 l-7 -46 -44 5\n    c-73 8 -133 -46 -133 -120 0 -17 -5 -35 -10 -38 -18 -11 0 -25 33 -24 30 1 30\n    1 7 8 -15 4 -20 10 -13 14 6 4 9 16 6 27 -9 34 7 70 40 90 17 11 39 20 47 20\n    8 0 -3 -9 -26 -19 -42 -19 -54 -36 -54 -75 0 -36 30 -56 84 -56 41 0 53 5 82\n    34 19 19 34 31 34 27 0 -4 -5 -12 -12 -19 -9 -9 -1 -12 39 -12 106 0 183 -21\n    121 -33 -17 -3 -14 -5 10 -6 25 -1 32 3 32 17 0 26 -20 42 -51 42 -39 0 -43\n    13 -10 38 56 41 76 124 45 185 -25 48 -72 105 -103 123 -15 9 -36 29 -47 45\n    -17 26 -63 41 -65 22z m56 -48 c16 -24 31 -42 34 -39 9 9 79 -69 74 -83 -3 -7\n    -2 -13 3 -12 18 3 25 -1 19 -12 -5 -7 -16 -2 -33 13 l-26 23 16 -25 c17 -27\n    29 -92 16 -84 -4 3 -8 -8 -8 -25 0 -16 4 -33 10 -36 5 -3 7 0 4 9 -3 9 3 20\n    15 28 13 8 21 24 22 43 1 18 3 23 6 12 3 -10 2 -29 -1 -43 -7 -26 -62 -94 -77\n    -94 -13 0 -11 17 4 32 21 19 4 88 -28 115 -14 13 -22 23 -16 23 5 0 21 -14 35\n    -31 14 -17 26 -25 26 -19 0 21 -60 72 -79 67 -16 -4 -17 -1 -8 34 6 24 14 36\n    21 32 6 -3 1 5 -11 18 -12 13 -22 29 -23 34 -1 6 -6 17 -12 25 -6 10 -7 -39\n    -4 -142 l6 -158 -26 10 c-33 13 -44 12 -21 -1 17 -10 24 -44 10 -52 -5 -3 -39\n    -8 -76 -12 -68 -7 -69 -7 -65 17 4 28 64 60 117 62 l36 1 0 157 c0 87 2 158 5\n    158 3 0 18 -20 35 -45z m15 -159 c0 -2 -7 -7 -16 -10 -8 -3 -12 -2 -9 4 6 10\n    25 14 25 6z m50 -92 c0 -13 -4 -26 -10 -29 -14 -9 -13 -48 2 -63 9 -9 6 -12\n    -15 -12 -22 0 -27 5 -27 24 0 14 -4 28 -10 31 -15 9 -13 102 3 108 18 7 57\n    -33 57 -59z m-139 -135 c-32 -26 -121 -25 -121 2 0 6 8 5 19 -1 26 -14 64 -13\n    55 1 -4 8 1 9 16 4 13 -4 20 -3 17 2 -3 5 4 10 16 10 22 2 22 2 -2 -18z'), _path2), '\n    ', (_path3 = document.createElementNS(_svgNamespace, 'path'), _path3.setAttribute('d', 'M330 345 c19 -19 36 -35 39 -35 3 0 -10 16 -29 35 -19 19 -36 35 -39\n    35 -3 0 10 -16 29 -35z'), _path3), '\n    ', (_path4 = document.createElementNS(_svgNamespace, 'path'), _path4.setAttribute('d', 'M349 123 c-13 -16 -12 -17 4 -4 16 13 21 21 13 21 -2 0 -10 -8 -17\n    -17z'), _path4), '\n    ', (_path5 = document.createElementNS(_svgNamespace, 'path'), _path5.setAttribute('d', 'M243 13 c15 -2 39 -2 55 0 15 2 2 4 -28 4 -30 0 -43 -2 -27 -4z'), _path5), '\n    ']), _g), '\n    ']), _uppyIcon2;
  },
  page_white_picture: function page_white_picture() {
    var _path6, _path7, _path8, _path9, _path10, _path11, _path12, _path13, _path14, _g2, _uppyIcon3;

    return _uppyIcon3 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon3.setAttribute('width', '16.000000pt'), _uppyIcon3.setAttribute('height', '16.000000pt'), _uppyIcon3.setAttribute('viewBox', '0 0 48.000000 36.000000'), _uppyIcon3.setAttribute('preserveAspectRatio', 'xMidYMid meet'), _uppyIcon3.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon3, ['\n    ', (_g2 = document.createElementNS(_svgNamespace, 'g'), _g2.setAttribute('transform', 'translate(0.000000,36.000000) scale(0.100000,-0.100000)'), _g2.setAttribute('fill', '#565555'), _g2.setAttribute('stroke', 'none'), _appendChild(_g2, ['\n    ', (_path6 = document.createElementNS(_svgNamespace, 'path'), _path6.setAttribute('d', 'M0 180 l0 -180 240 0 240 0 0 180 0 180 -240 0 -240 0 0 -180z m470\n    0 l0 -170 -230 0 -230 0 0 170 0 170 230 0 230 0 0 -170z'), _path6), '\n    ', (_path7 = document.createElementNS(_svgNamespace, 'path'), _path7.setAttribute('d', 'M40 185 l0 -135 200 0 200 0 0 135 0 135 -200 0 -200 0 0 -135z m390\n    59 l0 -65 -29 20 c-37 27 -45 26 -65 -4 -9 -14 -22 -25 -28 -25 -7 0 -24 -12\n    -39 -26 -26 -25 -28 -25 -53 -9 -17 11 -26 13 -26 6 0 -7 -4 -9 -10 -6 -5 3\n    -22 -2 -37 -12 l-28 -18 20 27 c11 15 26 25 33 23 6 -2 12 -1 12 4 0 10 -37\n    21 -65 20 -14 -1 -12 -3 7 -8 l28 -6 -50 -55 -49 -55 0 126 1 126 189 1 189 2\n    0 -66z m-16 -73 c11 -12 14 -21 8 -21 -6 0 -13 4 -17 10 -3 5 -12 7 -19 4 -8\n    -3 -16 2 -19 13 -3 11 -4 7 -4 -9 1 -19 6 -25 18 -23 19 4 46 -21 35 -32 -4\n    -4 -11 -1 -16 7 -6 8 -10 10 -10 4 0 -6 7 -17 15 -24 24 -20 11 -24 -76 -27\n    -69 -1 -83 1 -97 18 -9 10 -20 19 -25 19 -5 0 -4 -6 2 -14 14 -17 -5 -26 -55\n    -26 -36 0 -46 16 -17 27 10 4 22 13 27 22 8 13 10 12 17 -4 7 -17 8 -18 8 -2\n    1 23 11 22 55 -8 33 -22 35 -23 26 -5 -9 16 -8 20 5 20 8 0 15 5 15 11 0 5 -4\n    7 -10 4 -5 -3 -10 -4 -10 -1 0 4 59 36 67 36 2 0 1 -10 -2 -21 -5 -15 -4 -19\n    5 -14 6 4 9 17 6 28 -12 49 27 53 68 8z'), _path7), '\n    ', (_path8 = document.createElementNS(_svgNamespace, 'path'), _path8.setAttribute('d', 'M100 296 c0 -2 7 -7 16 -10 8 -3 12 -2 9 4 -6 10 -25 14 -25 6z'), _path8), '\n    ', (_path9 = document.createElementNS(_svgNamespace, 'path'), _path9.setAttribute('d', 'M243 293 c9 -2 23 -2 30 0 6 3 -1 5 -18 5 -16 0 -22 -2 -12 -5z'), _path9), '\n    ', (_path10 = document.createElementNS(_svgNamespace, 'path'), _path10.setAttribute('d', 'M65 280 c-3 -5 -2 -10 4 -10 5 0 13 5 16 10 3 6 2 10 -4 10 -5 0 -13\n    -4 -16 -10z'), _path10), '\n    ', (_path11 = document.createElementNS(_svgNamespace, 'path'), _path11.setAttribute('d', 'M155 270 c-3 -6 1 -7 9 -4 18 7 21 14 7 14 -6 0 -13 -4 -16 -10z'), _path11), '\n    ', (_path12 = document.createElementNS(_svgNamespace, 'path'), _path12.setAttribute('d', 'M233 252 c-13 -2 -23 -8 -23 -13 0 -7 -12 -8 -30 -4 -22 5 -30 3 -30\n    -7 0 -10 -2 -10 -9 1 -5 8 -19 12 -35 9 -14 -3 -27 -1 -30 4 -2 5 -4 4 -3 -3\n    2 -6 6 -10 10 -10 3 0 20 -4 37 -9 18 -5 32 -5 36 1 3 6 13 8 21 5 13 -5 113\n    21 113 30 0 3 -19 2 -57 -4z'), _path12), '\n    ', (_path13 = document.createElementNS(_svgNamespace, 'path'), _path13.setAttribute('d', 'M275 220 c-13 -6 -15 -9 -5 -9 8 0 22 4 30 9 18 12 2 12 -25 0z'), _path13), '\n    ', (_path14 = document.createElementNS(_svgNamespace, 'path'), _path14.setAttribute('d', 'M132 23 c59 -2 158 -2 220 0 62 1 14 3 -107 3 -121 0 -172 -2 -113\n    -3z'), _path14), '\n    ']), _g2), '\n    ']), _uppyIcon3;
  },
  word: function word() {
    var _path15, _path16, _path17, _path18, _path19, _path20, _path21, _g3, _uppyIcon4;

    return _uppyIcon4 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon4.setAttribute('width', '16.000000pt'), _uppyIcon4.setAttribute('height', '16.000000pt'), _uppyIcon4.setAttribute('viewBox', '0 0 48.000000 48.000000'), _uppyIcon4.setAttribute('preserveAspectRatio', 'xMidYMid meet'), _uppyIcon4.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon4, ['\n    ', (_g3 = document.createElementNS(_svgNamespace, 'g'), _g3.setAttribute('transform', 'translate(0.000000,48.000000) scale(0.100000,-0.100000)'), _g3.setAttribute('fill', '#423d3d'), _g3.setAttribute('stroke', 'none'), _appendChild(_g3, ['\n    ', (_path15 = document.createElementNS(_svgNamespace, 'path'), _path15.setAttribute('d', 'M0 466 c0 -15 87 -26 213 -26 l77 0 0 -140 0 -140 -77 0 c-105 0\n    -213 -11 -213 -21 0 -5 15 -9 34 -9 25 0 33 -4 33 -17 0 -74 4 -113 13 -113 6\n    0 10 32 10 75 l0 75 105 0 105 0 0 150 0 150 -105 0 c-87 0 -105 3 -105 15 0\n    11 -12 15 -45 15 -31 0 -45 -4 -45 -14z'), _path15), '\n    ', (_path16 = document.createElementNS(_svgNamespace, 'path'), _path16.setAttribute('d', 'M123 468 c-2 -5 50 -8 116 -8 l121 0 0 -50 c0 -46 -2 -50 -23 -50\n    -14 0 -24 -6 -24 -15 0 -8 4 -15 9 -15 4 0 8 -20 8 -45 0 -25 -4 -45 -8 -45\n    -5 0 -9 -7 -9 -15 0 -9 10 -15 24 -15 22 0 23 3 23 75 l0 75 50 0 50 0 0 -170\n    0 -170 -175 0 -175 0 -2 63 c-2 59 -2 60 -5 13 -3 -27 -2 -60 2 -73 l5 -23\n    183 2 182 3 2 216 c3 275 19 254 -194 254 -85 0 -157 -3 -160 -7z m337 -85 c0\n    -2 -18 -3 -39 -3 -39 0 -39 0 -43 45 l-3 44 42 -41 c24 -23 43 -43 43 -45z\n    m-19 50 c19 -22 23 -29 9 -18 -36 30 -50 43 -50 49 0 11 6 6 41 -31z'), _path16), '\n    ', (_path17 = document.createElementNS(_svgNamespace, 'path'), _path17.setAttribute('d', 'M4 300 c0 -74 1 -105 3 -67 2 37 2 97 0 135 -2 37 -3 6 -3 -68z'), _path17), '\n    ', (_path18 = document.createElementNS(_svgNamespace, 'path'), _path18.setAttribute('d', 'M20 300 l0 -131 128 3 127 3 3 128 3 127 -131 0 -130 0 0 -130z m250\n    100 c0 -16 -7 -20 -33 -20 -31 0 -34 -2 -34 -31 0 -28 2 -30 13 -14 8 10 11\n    22 8 26 -3 5 1 9 9 9 11 0 9 -12 -12 -50 -14 -27 -32 -50 -39 -50 -15 0 -31\n    38 -26 63 2 10 -1 15 -8 11 -6 -4 -9 -1 -6 6 2 8 10 16 16 18 8 2 12 -10 12\n    -38 0 -38 2 -41 16 -29 9 7 12 15 7 16 -5 2 -7 17 -5 33 4 26 1 30 -20 30 -17\n    0 -29 -9 -39 -27 -20 -41 -22 -50 -6 -30 14 17 15 16 20 -5 4 -13 2 -40 -2\n    -60 -9 -37 -8 -38 20 -38 26 0 33 8 64 70 19 39 37 70 40 70 3 0 5 -40 5 -90\n    l0 -90 -120 0 -120 0 0 120 0 120 120 0 c113 0 120 -1 120 -20z'), _path18), '\n    ', (_path19 = document.createElementNS(_svgNamespace, 'path'), _path19.setAttribute('d', 'M40 371 c0 -6 5 -13 10 -16 6 -3 10 -35 10 -71 0 -57 2 -64 20 -64\n    13 0 27 14 40 40 25 49 25 63 0 30 -19 -25 -39 -23 -24 2 5 7 7 23 6 35 -2 11\n    2 24 7 28 23 13 9 25 -29 25 -22 0 -40 -4 -40 -9z m53 -9 c-6 -4 -13 -28 -15\n    -52 l-3 -45 -5 53 c-5 47 -3 52 15 52 13 0 16 -3 8 -8z'), _path19), '\n    ', (_path20 = document.createElementNS(_svgNamespace, 'path'), _path20.setAttribute('d', 'M313 165 c0 -9 10 -15 24 -15 14 0 23 6 23 15 0 9 -9 15 -23 15 -14\n    0 -24 -6 -24 -15z'), _path20), '\n    ', (_path21 = document.createElementNS(_svgNamespace, 'path'), _path21.setAttribute('d', 'M180 105 c0 -12 17 -15 90 -15 73 0 90 3 90 15 0 12 -17 15 -90 15\n    -73 0 -90 -3 -90 -15z'), _path21), '\n    ']), _g3), '\n    ']), _uppyIcon4;
  },
  powerpoint: function powerpoint() {
    var _path22, _path23, _path24, _path25, _path26, _path27, _path28, _path29, _path30, _path31, _path32, _path33, _path34, _path35, _path36, _path37, _path38, _path39, _g4, _uppyIcon5;

    return _uppyIcon5 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon5.setAttribute('width', '16.000000pt'), _uppyIcon5.setAttribute('height', '16.000000pt'), _uppyIcon5.setAttribute('viewBox', '0 0 16.000000 16.000000'), _uppyIcon5.setAttribute('preserveAspectRatio', 'xMidYMid meet'), _uppyIcon5.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon5, ['\n    ', (_g4 = document.createElementNS(_svgNamespace, 'g'), _g4.setAttribute('transform', 'translate(0.000000,144.000000) scale(0.100000,-0.100000)'), _g4.setAttribute('fill', '#494747'), _g4.setAttribute('stroke', 'none'), _appendChild(_g4, ['\n    ', (_path22 = document.createElementNS(_svgNamespace, 'path'), _path22.setAttribute('d', 'M0 1390 l0 -50 93 0 c50 0 109 -3 130 -6 l37 -7 0 57 0 56 -130 0\n    -130 0 0 -50z'), _path22), '\n    ', (_path23 = document.createElementNS(_svgNamespace, 'path'), _path23.setAttribute('d', 'M870 1425 c0 -8 -12 -18 -27 -22 l-28 -6 30 -9 c17 -5 75 -10 130\n    -12 86 -2 100 -5 99 -19 0 -10 -1 -80 -2 -157 l-2 -140 -65 0 c-60 0 -80 -9\n    -55 -25 8 -5 7 -11 -1 -21 -17 -20 2 -25 112 -27 l94 -2 0 40 0 40 100 5 c55\n    3 104 3 108 -1 8 -6 11 -1008 4 -1016 -2 -2 -236 -4 -520 -6 -283 -1 -519 -5\n    -523 -9 -4 -4 -1 -14 6 -23 11 -13 82 -15 561 -15 l549 0 0 570 c0 543 -1 570\n    -18 570 -10 0 -56 39 -103 86 -46 47 -93 90 -104 95 -11 6 22 -31 73 -82 50\n    -50 92 -95 92 -99 0 -14 -23 -16 -136 -12 l-111 4 -6 124 c-6 119 -7 126 -32\n    145 -14 12 -23 25 -20 30 4 5 -38 9 -99 9 -87 0 -106 -3 -106 -15z'), _path23), '\n    ', (_path24 = document.createElementNS(_svgNamespace, 'path'), _path24.setAttribute('d', 'M1190 1429 c0 -14 225 -239 239 -239 7 0 11 30 11 85 0 77 -2 85 -19\n    85 -21 0 -61 44 -61 66 0 11 -20 14 -85 14 -55 0 -85 -4 -85 -11z'), _path24), '\n    ', (_path25 = document.createElementNS(_svgNamespace, 'path'), _path25.setAttribute('d', 'M281 1331 c-24 -16 7 -23 127 -31 100 -6 107 -7 47 -9 -38 -1 -142\n    -8 -229 -14 l-160 -12 -7 -28 c-10 -37 -16 -683 -6 -693 4 -4 10 -4 15 0 4 4\n    8 166 9 359 l2 352 358 -3 358 -2 5 -353 c3 -193 2 -356 -2 -361 -3 -4 -136\n    -8 -295 -7 -290 2 -423 -4 -423 -20 0 -5 33 -9 73 -9 39 0 90 -3 111 -7 l39\n    -6 -45 -18 c-26 -10 -90 -20 -151 -25 l-107 -7 0 -38 c0 -35 3 -39 24 -39 36\n    0 126 -48 128 -68 1 -9 2 -40 3 -69 2 -29 6 -91 10 -138 l7 -85 44 0 44 0 0\n    219 0 220 311 1 c172 0 314 2 318 4 5 4 6 301 2 759 l-1 137 -297 0 c-164 0\n    -304 -4 -312 -9z'), _path25), '\n    ', (_path26 = document.createElementNS(_svgNamespace, 'path'), _path26.setAttribute('d', 'M2 880 c-1 -276 2 -378 10 -360 12 30 11 657 -2 710 -5 21 -8 -121\n    -8 -350z'), _path26), '\n    ', (_path27 = document.createElementNS(_svgNamespace, 'path'), _path27.setAttribute('d', 'M145 1178 c-3 -8 -4 -141 -3 -298 l3 -285 295 0 295 0 0 295 0 295\n    -293 3 c-230 2 -294 0 -297 -10z m553 -27 c11 -6 13 -60 11 -260 -1 -139 -6\n    -254 -9 -256 -4 -3 -124 -6 -266 -7 l-259 -3 -3 255 c-1 140 0 260 3 267 3 10\n    62 13 257 13 139 0 259 -4 266 -9z'), _path27), '\n    ', (_path28 = document.createElementNS(_svgNamespace, 'path'), _path28.setAttribute('d', 'M445 1090 l-210 -5 -3 -37 -3 -38 225 0 226 0 0 34 c0 18 -6 37 -12\n    42 -7 5 -107 7 -223 4z'), _path28), '\n    ', (_path29 = document.createElementNS(_svgNamespace, 'path'), _path29.setAttribute('d', 'M295 940 c-3 -6 1 -12 9 -15 9 -3 23 -7 31 -10 10 -3 15 -18 15 -49\n    0 -25 3 -47 8 -49 15 -9 47 11 52 33 9 38 28 34 41 -8 10 -35 9 -43 -7 -66\n    -23 -31 -51 -34 -56 -4 -4 31 -26 34 -38 4 -5 -14 -12 -26 -16 -26 -4 0 -22\n    16 -41 36 -33 35 -34 40 -28 86 7 48 6 50 -16 46 -18 -2 -23 -9 -21 -23 2 -11\n    3 -49 3 -85 0 -72 6 -83 60 -111 57 -29 95 -25 144 15 37 31 46 34 83 29 40\n    -5 42 -5 42 21 0 24 -3 27 -27 24 -24 -3 -28 1 -31 25 -3 24 0 28 20 25 13 -2\n    23 2 23 7 0 6 -9 9 -20 8 -13 -2 -28 9 -44 32 -13 19 -31 35 -41 35 -10 0 -23\n    7 -30 15 -14 17 -105 21 -115 5z'), _path29), '\n    ', (_path30 = document.createElementNS(_svgNamespace, 'path'), _path30.setAttribute('d', 'M522 919 c-28 -11 -20 -29 14 -29 14 0 24 6 24 14 0 21 -11 25 -38\n    15z'), _path30), '\n    ', (_path31 = document.createElementNS(_svgNamespace, 'path'), _path31.setAttribute('d', 'M623 922 c-53 -5 -43 -32 12 -32 32 0 45 4 45 14 0 17 -16 22 -57 18z'), _path31), '\n    ', (_path32 = document.createElementNS(_svgNamespace, 'path'), _path32.setAttribute('d', 'M597 854 c-13 -14 6 -24 44 -24 28 0 39 4 39 15 0 11 -11 15 -38 15\n    -21 0 -42 -3 -45 -6z'), _path32), '\n    ', (_path33 = document.createElementNS(_svgNamespace, 'path'), _path33.setAttribute('d', 'M597 794 c-4 -4 -7 -18 -7 -31 0 -21 4 -23 46 -23 44 0 45 1 42 28\n    -3 23 -8 27 -38 30 -20 2 -39 0 -43 -4z'), _path33), '\n    ', (_path34 = document.createElementNS(_svgNamespace, 'path'), _path34.setAttribute('d', 'M989 883 c-34 -4 -37 -6 -37 -37 0 -32 2 -34 45 -40 25 -3 72 -6 104\n    -6 l59 0 0 45 0 45 -67 -2 c-38 -1 -84 -3 -104 -5z'), _path34), '\n    ', (_path35 = document.createElementNS(_svgNamespace, 'path'), _path35.setAttribute('d', 'M993 703 c-42 -4 -54 -15 -33 -28 8 -5 8 -11 0 -20 -16 -20 -3 -24\n    104 -31 l96 -7 0 47 0 46 -62 -2 c-35 -1 -82 -3 -105 -5z'), _path35), '\n    ', (_path36 = document.createElementNS(_svgNamespace, 'path'), _path36.setAttribute('d', 'M1005 523 c-50 -6 -59 -12 -46 -26 8 -10 7 -17 -1 -25 -6 -6 -9 -14\n    -6 -17 3 -3 51 -8 107 -12 l101 -6 0 46 0 47 -62 -1 c-35 -1 -76 -4 -93 -6z'), _path36), '\n    ', (_path37 = document.createElementNS(_svgNamespace, 'path'), _path37.setAttribute('d', 'M537 344 c-4 -4 -7 -25 -7 -46 l0 -38 46 0 45 0 -3 43 c-3 40 -4 42\n    -38 45 -20 2 -39 0 -43 -4z'), _path37), '\n    ', (_path38 = document.createElementNS(_svgNamespace, 'path'), _path38.setAttribute('d', 'M714 341 c-2 -2 -4 -22 -4 -43 l0 -38 225 0 225 0 0 45 0 46 -221 -3\n    c-121 -2 -222 -5 -225 -7z'), _path38), '\n    ', (_path39 = document.createElementNS(_svgNamespace, 'path'), _path39.setAttribute('d', 'M304 205 c0 -66 1 -92 3 -57 2 34 2 88 0 120 -2 31 -3 3 -3 -63z'), _path39), '\n    ']), _g4), '\n    ']), _uppyIcon5;
  },
  page_white: function page_white() {
    var _path40, _path41, _path42, _path43, _path44, _g5, _uppyIcon6;

    return _uppyIcon6 = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon6.setAttribute('width', '16.000000pt'), _uppyIcon6.setAttribute('height', '16.000000pt'), _uppyIcon6.setAttribute('viewBox', '0 0 48.000000 48.000000'), _uppyIcon6.setAttribute('preserveAspectRatio', 'xMidYMid meet'), _uppyIcon6.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon6, ['\n    ', (_g5 = document.createElementNS(_svgNamespace, 'g'), _g5.setAttribute('transform', 'translate(0.000000,48.000000) scale(0.100000,-0.100000)'), _g5.setAttribute('fill', '#000000'), _g5.setAttribute('stroke', 'none'), _appendChild(_g5, ['\n    ', (_path40 = document.createElementNS(_svgNamespace, 'path'), _path40.setAttribute('d', 'M20 240 c1 -202 3 -240 16 -240 12 0 14 38 14 240 0 208 -2 240 -15\n    240 -13 0 -15 -31 -15 -240z'), _path40), '\n    ', (_path41 = document.createElementNS(_svgNamespace, 'path'), _path41.setAttribute('d', 'M75 471 c-4 -8 32 -11 119 -11 l126 0 0 -50 0 -50 50 0 c28 0 50 5\n    50 10 0 6 -18 10 -40 10 l-40 0 0 42 0 42 43 -39 42 -40 -43 45 -42 45 -129 3\n    c-85 2 -131 0 -136 -7z'), _path41), '\n    ', (_path42 = document.createElementNS(_svgNamespace, 'path'), _path42.setAttribute('d', 'M398 437 l42 -43 0 -197 c0 -168 2 -197 15 -197 13 0 15 29 15 198\n    l0 198 -36 42 c-21 25 -44 42 -57 42 -18 0 -16 -6 21 -43z'), _path42), '\n    ', (_path43 = document.createElementNS(_svgNamespace, 'path'), _path43.setAttribute('d', 'M92 353 l2 -88 3 78 4 77 89 0 89 0 8 -42 c8 -43 9 -43 55 -46 44 -3\n    47 -5 51 -35 4 -31 4 -31 5 6 l2 37 -50 0 -50 0 0 50 0 50 -105 0 -105 0 2\n    -87z'), _path43), '\n    ', (_path44 = document.createElementNS(_svgNamespace, 'path'), _path44.setAttribute('d', 'M75 10 c8 -13 332 -13 340 0 4 7 -55 10 -170 10 -115 0 -174 -3 -170\n    -10z'), _path44), '\n    ']), _g5), '\n    ']), _uppyIcon6;
  }
};

},{"yo-yo":22,"yo-yoify/lib/appendChild":31}],60:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var html = require('yo-yo');
var Plugin = require('../Plugin');

var Provider = require('../../uppy-base/src/plugins/Provider');

var View = require('../../generic-provider-views/index');
var icons = require('./icons');

module.exports = function (_Plugin) {
  _inherits(Dropbox, _Plugin);

  function Dropbox(core, opts) {
    var _path, _path2, _path3, _uppyIcon;

    _classCallCheck(this, Dropbox);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.type = 'acquirer';
    _this.id = 'Dropbox';
    _this.title = 'Dropbox';
    _this.stateId = 'dropbox';
    _this.icon = (_uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '128'), _uppyIcon.setAttribute('height', '118'), _uppyIcon.setAttribute('viewBox', '0 0 128 118'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, ['\n        ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M38.145.777L1.108 24.96l25.608 20.507 37.344-23.06z'), _path), '\n        ', (_path2 = document.createElementNS(_svgNamespace, 'path'), _path2.setAttribute('d', 'M1.108 65.975l37.037 24.183L64.06 68.525l-37.343-23.06zM64.06 68.525l25.917 21.633 37.036-24.183-25.61-20.51z'), _path2), '\n        ', (_path3 = document.createElementNS(_svgNamespace, 'path'), _path3.setAttribute('d', 'M127.014 24.96L89.977.776 64.06 22.407l37.345 23.06zM64.136 73.18l-25.99 21.567-11.122-7.262v8.142l37.112 22.256 37.114-22.256v-8.142l-11.12 7.262z'), _path3), '\n      ']), _uppyIcon);

    // writing out the key explicitly for readability the key used to store
    // the provider instance must be equal to this.id.
    _this.Dropbox = new Provider({
      host: _this.opts.host,
      provider: 'dropbox'
    });

    _this.files = [];

    _this.onAuth = _this.onAuth.bind(_this);
    // Visual
    _this.render = _this.render.bind(_this);

    // set default options
    var defaultOptions = {};

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);
    return _this;
  }

  Dropbox.prototype.install = function install() {
    this.view = new View(this);
    // Set default state
    this.core.setState({
      // writing out the key explicitly for readability the key used to store
      // the plugin state must be equal to this.stateId.
      dropbox: {
        authenticated: false,
        files: [],
        folders: [],
        directories: [],
        activeRow: -1,
        filterInput: ''
      }
    });

    var target = this.opts.target;
    var plugin = this;
    this.target = this.mount(target, plugin);

    this[this.id].auth().then(this.onAuth).catch(this.view.handleError);

    return;
  };

  Dropbox.prototype.onAuth = function onAuth(authenticated) {
    this.view.updateState({ authenticated: authenticated });
    if (authenticated) {
      this.view.getFolder();
    }
  };

  Dropbox.prototype.isFolder = function isFolder(item) {
    return item.is_dir;
  };

  Dropbox.prototype.getItemData = function getItemData(item) {
    return _extends({}, item, { size: item.bytes });
  };

  Dropbox.prototype.getItemIcon = function getItemIcon(item) {
    var icon = icons[item.icon];

    if (!icon) {
      if (item.icon.startsWith('folder')) {
        icon = icons['folder'];
      } else {
        icon = icons['page_white'];
      }
    }
    return icon();
  };

  Dropbox.prototype.getItemSubList = function getItemSubList(item) {
    return item.contents;
  };

  Dropbox.prototype.getItemName = function getItemName(item) {
    return item.path.length > 1 ? item.path.substring(1) : item.path;
  };

  Dropbox.prototype.getMimeType = function getMimeType(item) {
    return item.mime_type;
  };

  Dropbox.prototype.getItemId = function getItemId(item) {
    return item.rev;
  };

  Dropbox.prototype.getItemRequestPath = function getItemRequestPath(item) {
    return encodeURIComponent(this.getItemName(item));
  };

  Dropbox.prototype.getItemModifiedDate = function getItemModifiedDate(item) {
    return item.modified;
  };

  Dropbox.prototype.render = function render(state) {
    return this.view.render(state);
  };

  return Dropbox;
}(Plugin);

},{"../../generic-provider-views/index":46,"../../uppy-base/src/plugins/Provider":71,"../Plugin":64,"./icons":59,"yo-yo":22,"yo-yoify/lib/appendChild":31}],61:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var html = require('yo-yo');
var Plugin = require('../Plugin');

var Provider = require('../../uppy-base/src/plugins/Provider');

var View = require('../../generic-provider-views/index');

module.exports = function (_Plugin) {
  _inherits(Google, _Plugin);

  function Google(core, opts) {
    var _path, _uppyIcon;

    _classCallCheck(this, Google);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.type = 'acquirer';
    _this.id = 'GoogleDrive';
    _this.title = 'Google Drive';
    _this.stateId = 'googleDrive';
    _this.icon = (_uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '28'), _uppyIcon.setAttribute('height', '28'), _uppyIcon.setAttribute('viewBox', '0 0 16 16'), _uppyIcon.setAttribute('class', 'UppyIcon UppyModalTab-icon'), _appendChild(_uppyIcon, ['\n        ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M2.955 14.93l2.667-4.62H16l-2.667 4.62H2.955zm2.378-4.62l-2.666 4.62L0 10.31l5.19-8.99 2.666 4.62-2.523 4.37zm10.523-.25h-5.333l-5.19-8.99h5.334l5.19 8.99z'), _path), '\n      ']), _uppyIcon);

    // writing out the key explicitly for readability the key used to store
    // the provider instance must be equal to this.id.
    _this.GoogleDrive = new Provider({
      host: _this.opts.host,
      provider: 'drive',
      authProvider: 'google'
    });

    _this.files = [];

    _this.onAuth = _this.onAuth.bind(_this);
    // Visual
    _this.render = _this.render.bind(_this);

    // set default options
    var defaultOptions = {};

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);
    return _this;
  }

  Google.prototype.install = function install() {
    this.view = new View(this);
    // Set default state for Google Drive
    this.core.setState({
      // writing out the key explicitly for readability the key used to store
      // the plugin state must be equal to this.stateId.
      googleDrive: {
        authenticated: false,
        files: [],
        folders: [],
        directories: [],
        activeRow: -1,
        filterInput: ''
      }
    });

    var target = this.opts.target;
    var plugin = this;
    this.target = this.mount(target, plugin);

    // catch error here.
    this[this.id].auth().then(this.onAuth).catch(this.view.handleError);
    return;
  };

  Google.prototype.onAuth = function onAuth(authenticated) {
    this.view.updateState({ authenticated: authenticated });
    if (authenticated) {
      this.view.getFolder('root');
    }
  };

  Google.prototype.isFolder = function isFolder(item) {
    return item.mimeType === 'application/vnd.google-apps.folder';
  };

  Google.prototype.getItemData = function getItemData(item) {
    return _extends({}, item, { size: parseFloat(item.fileSize) });
  };

  Google.prototype.getItemIcon = function getItemIcon(item) {
    var _img;

    return _img = document.createElement('img'), _img.setAttribute('src', '' + String(item.iconLink) + ''), _img;
  };

  Google.prototype.getItemSubList = function getItemSubList(item) {
    return item.items;
  };

  Google.prototype.getItemName = function getItemName(item) {
    return item.title ? item.title : '/';
  };

  Google.prototype.getMimeType = function getMimeType(item) {
    return item.mimeType;
  };

  Google.prototype.getItemId = function getItemId(item) {
    return item.id;
  };

  Google.prototype.getItemRequestPath = function getItemRequestPath(item) {
    return this.getItemId(item);
  };

  Google.prototype.getItemModifiedDate = function getItemModifiedDate(item) {
    return item.modifiedByMeDate;
  };

  Google.prototype.render = function render(state) {
    return this.view.render(state);
  };

  return Google;
}(Plugin);

},{"../../generic-provider-views/index":46,"../../uppy-base/src/plugins/Provider":71,"../Plugin":64,"yo-yo":22,"yo-yoify/lib/appendChild":31}],62:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Plugin = require('./Plugin');
var html = require('yo-yo');

/**
 * Informer
 * Shows rad message bubbles
 * used like this: `bus.emit('informer', 'hello world', 'info', 5000)`
 * or for errors: `bus.emit('informer', 'Error uploading img.jpg', 'error', 5000)`
 *
 */
module.exports = function (_Plugin) {
  _inherits(Informer, _Plugin);

  function Informer(core, opts) {
    _classCallCheck(this, Informer);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.type = 'progressindicator';
    _this.id = 'Informer';
    _this.title = 'Informer';
    _this.timeoutID = undefined;

    // set default options
    var defaultOptions = {
      typeColors: {
        info: {
          text: '#fff',
          bg: '#000'
        },
        error: {
          text: '#fff',
          bg: '#F6A623'
        },
        success: {
          text: '#fff',
          bg: '#7ac824'
        }
      }
    };

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);

    _this.render = _this.render.bind(_this);
    return _this;
  }

  Informer.prototype.showInformer = function showInformer(msg, type, duration) {
    var _this2 = this;

    this.core.setState({
      informer: {
        isHidden: false,
        type: type,
        msg: msg
      }
    });

    window.clearTimeout(this.timeoutID);
    if (duration === 0) {
      this.timeoutID = undefined;
      return;
    }

    // hide the informer after `duration` milliseconds
    this.timeoutID = setTimeout(function () {
      var newInformer = _extends({}, _this2.core.getState().informer, {
        isHidden: true
      });
      _this2.core.setState({
        informer: newInformer
      });
    }, duration);
  };

  Informer.prototype.hideInformer = function hideInformer() {
    var newInformer = _extends({}, this.core.getState().informer, {
      isHidden: true
    });
    this.core.setState({
      informer: newInformer
    });
  };

  Informer.prototype.render = function render(state) {
    var _p, _uppyInformer;

    var isHidden = state.informer.isHidden;
    var msg = state.informer.msg;
    var type = state.informer.type || 'info';
    var style = 'background-color: ' + this.opts.typeColors[type].bg + '; color: ' + this.opts.typeColors[type].text + ';';

    // @TODO add aria-live for screen-readers
    return _uppyInformer = document.createElement('div'), _uppyInformer.setAttribute('style', '' + String(style) + ''), _uppyInformer.setAttribute('aria-hidden', '' + String(isHidden) + ''), _uppyInformer.setAttribute('class', 'UppyInformer'), _appendChild(_uppyInformer, ['\n      ', (_p = document.createElement('p'), _appendChild(_p, [msg]), _p), '\n    ']), _uppyInformer;
  };

  Informer.prototype.install = function install() {
    var _this3 = this;

    // Set default state for Google Drive
    this.core.setState({
      informer: {
        isHidden: true,
        type: '',
        msg: ''
      }
    });

    this.core.on('informer', function (msg, type, duration) {
      _this3.showInformer(msg, type, duration);
    });

    this.core.on('informer:hide', function () {
      _this3.hideInformer();
    });

    var target = this.opts.target;
    var plugin = this;
    this.target = this.mount(target, plugin);
  };

  return Informer;
}(Plugin);

},{"./Plugin":64,"yo-yo":22,"yo-yoify/lib/appendChild":31}],63:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Plugin = require('./Plugin');

/**
 * Meta Data
 * Adds metadata fields to Uppy
 *
 */
module.exports = function (_Plugin) {
  _inherits(MetaData, _Plugin);

  function MetaData(core, opts) {
    _classCallCheck(this, MetaData);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.type = 'modifier';
    _this.id = 'MetaData';
    _this.title = 'Meta Data';

    // set default options
    var defaultOptions = {};

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);
    return _this;
  }

  MetaData.prototype.addInitialMeta = function addInitialMeta() {
    var _this2 = this;

    var metaFields = this.opts.fields;

    this.core.setState({
      metaFields: metaFields
    });

    this.core.emitter.on('file-added', function (fileID) {
      metaFields.forEach(function (item) {
        var obj = {};
        obj[item.id] = item.value;
        _this2.core.updateMeta(obj, fileID);
      });
    });
  };

  MetaData.prototype.install = function install() {
    this.addInitialMeta();
  };

  return MetaData;
}(Plugin);

},{"./Plugin":64}],64:[function(require,module,exports){
'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var yo = require('yo-yo');
// const nanoraf = require('nanoraf')

/**
 * Boilerplate that all Plugins share - and should not be used
 * directly. It also shows which methods final plugins should implement/override,
 * this deciding on structure.
 *
 * @param {object} main Uppy core object
 * @param {object} object with plugin options
 * @return {array | string} files or success/fail message
 */
module.exports = function () {
  function Plugin(core, opts) {
    _classCallCheck(this, Plugin);

    this.core = core;
    this.opts = opts || {};
    this.type = 'none';

    // clear everything inside the target selector
    this.opts.replaceTargetContent === this.opts.replaceTargetContent || true;

    this.update = this.update.bind(this);
    this.mount = this.mount.bind(this);
    this.focus = this.focus.bind(this);
    this.install = this.install.bind(this);

    // this.frame = null
  }

  Plugin.prototype.update = function update(state) {
    if (typeof this.el === 'undefined') {
      return;
    }

    // const prev = {}
    // if (!this.frame) {
    //   console.log('creating frame')
    //   this.frame = nanoraf((state, prev) => {
    //     console.log('updating!', Date.now())
    //     const newEl = this.render(state)
    //     this.el = yo.update(this.el, newEl)
    //   })
    // }
    // console.log('attempting an update...', Date.now())
    // this.frame(state, prev)

    this.core.log('update number: ' + this.core.updateNum++);

    var newEl = this.render(state);
    yo.update(this.el, newEl);

    // optimizes performance?
    // requestAnimationFrame(() => {
    //   const newEl = this.render(state)
    //   yo.update(this.el, newEl)
    // })
  };

  /**
   * Check if supplied `target` is a `string` or an `object`.
   * If it’s an object — target is a plugin, and we search `plugins`
   * for a plugin with same name and return its target.
   *
   * @param {String|Object} target
   *
   */


  Plugin.prototype.mount = function mount(target, plugin) {
    var callerPluginName = plugin.id;

    if (typeof target === 'string') {
      this.core.log('Installing ' + callerPluginName + ' to ' + target);

      // clear everything inside the target container
      if (this.opts.replaceTargetContent) {
        document.querySelector(target).innerHTML = '';
      }

      this.el = plugin.render(this.core.state);
      document.querySelector(target).appendChild(this.el);

      return target;
    } else {
      // TODO: is instantiating the plugin really the way to roll
      // just to get the plugin name?
      var Target = target;
      var targetPluginName = new Target().id;

      this.core.log('Installing ' + callerPluginName + ' to ' + targetPluginName);

      var targetPlugin = this.core.getPlugin(targetPluginName);
      var selectorTarget = targetPlugin.addTarget(plugin);

      return selectorTarget;
    }
  };

  Plugin.prototype.focus = function focus() {
    return;
  };

  Plugin.prototype.install = function install() {
    return;
  };

  return Plugin;
}();

},{"yo-yo":22}],65:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _Promise = typeof Promise === 'undefined' ? require('es6-promise').Promise : Promise;

var Plugin = require('./Plugin');
var tus = require('tus-js-client');
var UppySocket = require('../core/UppySocket');
var throttle = require('lodash.throttle');
require('whatwg-fetch');

/**
 * Tus resumable file uploader
 *
 */
module.exports = function (_Plugin) {
  _inherits(Tus10, _Plugin);

  function Tus10(core, opts) {
    _classCallCheck(this, Tus10);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.type = 'uploader';
    _this.id = 'Tus';
    _this.title = 'Tus';

    // set default options
    var defaultOptions = {
      resume: true,
      allowPause: true
    };

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);
    return _this;
  }

  Tus10.prototype.pauseResume = function pauseResume(action, fileID) {
    var updatedFiles = _extends({}, this.core.getState().files);
    var inProgressUpdatedFiles = Object.keys(updatedFiles).filter(function (file) {
      return !updatedFiles[file].progress.uploadComplete && updatedFiles[file].progress.uploadStarted;
    });

    switch (action) {
      case 'toggle':
        if (updatedFiles[fileID].uploadComplete) return;

        var wasPaused = updatedFiles[fileID].isPaused || false;
        var isPaused = !wasPaused;
        var updatedFile = void 0;
        if (wasPaused) {
          updatedFile = _extends({}, updatedFiles[fileID], {
            isPaused: false
          });
        } else {
          updatedFile = _extends({}, updatedFiles[fileID], {
            isPaused: true
          });
        }
        updatedFiles[fileID] = updatedFile;
        this.core.setState({ files: updatedFiles });
        return isPaused;
      case 'pauseAll':
        inProgressUpdatedFiles.forEach(function (file) {
          var updatedFile = _extends({}, updatedFiles[file], {
            isPaused: true
          });
          updatedFiles[file] = updatedFile;
        });
        this.core.setState({ files: updatedFiles });
        return;
      case 'resumeAll':
        inProgressUpdatedFiles.forEach(function (file) {
          var updatedFile = _extends({}, updatedFiles[file], {
            isPaused: false
          });
          updatedFiles[file] = updatedFile;
        });
        this.core.setState({ files: updatedFiles });
        return;
    }
  };

  /**
   * Create a new Tus upload
   *
   * @param {object} file for use with upload
   * @param {integer} current file in a queue
   * @param {integer} total number of files in a queue
   * @returns {Promise}
   */


  Tus10.prototype.upload = function upload(file, current, total) {
    var _this2 = this;

    this.core.log('uploading ' + current + ' of ' + total);

    // Create a new tus upload
    return new _Promise(function (resolve, reject) {
      var upload = new tus.Upload(file.data, {

        // TODO merge this.opts or this.opts.tus here
        metadata: file.meta,
        resume: _this2.opts.resume,
        endpoint: _this2.opts.endpoint,

        onError: function onError(err) {
          _this2.core.log(err);
          _this2.core.emitter.emit('core:upload-error', file.id, err);
          reject('Failed because: ' + err);
        },
        onProgress: function onProgress(bytesUploaded, bytesTotal) {
          _this2.core.emitter.emit('core:upload-progress', {
            uploader: _this2,
            id: file.id,
            bytesUploaded: bytesUploaded,
            bytesTotal: bytesTotal
          });
        },
        onSuccess: function onSuccess() {
          _this2.core.emitter.emit('core:upload-success', file.id, upload, upload.url);

          if (upload.url) {
            _this2.core.log('Download ' + upload.file.name + ' from ' + upload.url);
          }

          resolve(upload);
        }
      });

      _this2.onFileRemove(file.id, function () {
        _this2.core.log('removing file:', file.id);
        upload.abort();
        resolve('upload ' + file.id + ' was removed');
      });

      _this2.onPause(file.id, function (isPaused) {
        isPaused ? upload.abort() : upload.start();
      });

      _this2.onPauseAll(file.id, function () {
        upload.abort();
      });

      _this2.onResumeAll(file.id, function () {
        upload.start();
      });

      upload.start();
      _this2.core.emitter.emit('core:upload-started', file.id, upload);
    });
  };

  Tus10.prototype.uploadRemote = function uploadRemote(file, current, total) {
    var _this3 = this;

    return new _Promise(function (resolve, reject) {
      _this3.core.log(file.remote.url);
      fetch(file.remote.url, {
        method: 'post',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(_extends({}, file.remote.body, {
          endpoint: _this3.opts.endpoint,
          protocol: 'tus'
        }))
      }).then(function (res) {
        if (res.status < 200 && res.status > 300) {
          return reject(res.statusText);
        }

        _this3.core.emitter.emit('core:upload-started', file.id);

        res.json().then(function (data) {
          // get the host domain
          // var regex = /^(?:https?:\/\/|\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^\/\n]+)/
          var regex = /^(?:https?:\/\/|\/\/)?(?:[^@\n]+@)?(?:www\.)?([^\n]+)/;
          var host = regex.exec(file.remote.host)[1];
          var socketProtocol = location.protocol === 'https:' ? 'wss' : 'ws';

          var token = data.token;
          var socket = new UppySocket({
            target: socketProtocol + ('://' + host + '/api/' + token)
          });

          _this3.onFileRemove(file.id, function () {
            socket.send('pause', {});
            resolve('upload ' + file.id + ' was removed');
          });

          _this3.onPause(file.id, function (isPaused) {
            isPaused ? socket.send('pause', {}) : socket.send('resume', {});
          });

          _this3.onPauseAll(file.id, function () {
            socket.send('pause', {});
          });

          _this3.onResumeAll(file.id, function () {
            socket.send('resume', {});
          });

          var emitProgress = function emitProgress(progressData) {
            var progress = progressData.progress,
                bytesUploaded = progressData.bytesUploaded,
                bytesTotal = progressData.bytesTotal;


            if (progress) {
              _this3.core.log('Upload progress: ' + progress);
              console.log(file.id);

              _this3.core.emitter.emit('core:upload-progress', {
                uploader: _this3,
                id: file.id,
                bytesUploaded: bytesUploaded,
                bytesTotal: bytesTotal
              });
            }
          };

          var throttledEmitProgress = throttle(emitProgress, 300, { leading: true, trailing: true });
          socket.on('progress', throttledEmitProgress);

          socket.on('success', function (data) {
            _this3.core.emitter.emit('core:upload-success', file.id, data, data.url);
            socket.close();
            return resolve();
          });
        });
      });
    });
  };

  Tus10.prototype.onFileRemove = function onFileRemove(fileID, cb) {
    this.core.emitter.on('core:file-remove', function (targetFileID) {
      if (fileID === targetFileID) cb();
    });
  };

  Tus10.prototype.onPause = function onPause(fileID, cb) {
    var _this4 = this;

    this.core.emitter.on('core:upload-pause', function (targetFileID) {
      if (fileID === targetFileID) {
        var isPaused = _this4.pauseResume('toggle', fileID);
        cb(isPaused);
      }
    });
  };

  Tus10.prototype.onPauseAll = function onPauseAll(fileID, cb) {
    var _this5 = this;

    this.core.emitter.on('core:pause-all', function () {
      var files = _this5.core.getState().files;
      if (!files[fileID]) return;
      cb();
    });
  };

  Tus10.prototype.onResumeAll = function onResumeAll(fileID, cb) {
    var _this6 = this;

    this.core.emitter.on('core:resume-all', function () {
      var files = _this6.core.getState().files;
      if (!files[fileID]) return;
      cb();
    });
  };

  Tus10.prototype.uploadFiles = function uploadFiles(files) {
    var _this7 = this;

    if (Object.keys(files).length === 0) {
      this.core.log('no files to upload!');
      return;
    }

    var uploaders = [];
    files.forEach(function (file, index) {
      var current = parseInt(index, 10) + 1;
      var total = files.length;

      if (!file.isRemote) {
        uploaders.push(_this7.upload(file, current, total));
      } else {
        uploaders.push(_this7.uploadRemote(file, current, total));
      }
    });

    return Promise.all(uploaders).then(function () {
      _this7.core.log('All files uploaded');
      return { uploadedCount: files.length };
    }).catch(function (err) {
      _this7.core.log('Upload error: ' + err);
    });
  };

  Tus10.prototype.selectForUpload = function selectForUpload(files) {
    // TODO: replace files[file].isRemote with some logic
    //
    // filter files that are now yet being uploaded / haven’t been uploaded
    // and remote too
    var filesForUpload = Object.keys(files).filter(function (file) {
      if (!files[file].progress.uploadStarted || files[file].isRemote) {
        return true;
      }
      return false;
    }).map(function (file) {
      return files[file];
    });

    this.uploadFiles(filesForUpload);
  };

  Tus10.prototype.actions = function actions() {
    var _this8 = this;

    this.core.emitter.on('core:pause-all', function () {
      _this8.pauseResume('pauseAll');
    });

    this.core.emitter.on('core:resume-all', function () {
      _this8.pauseResume('resumeAll');
    });

    this.core.emitter.on('core:upload', function () {
      _this8.core.log('Tus is uploading...');
      var files = _this8.core.getState().files;
      _this8.selectForUpload(files);
    });
  };

  Tus10.prototype.addResumableUploadsCapabilityFlag = function addResumableUploadsCapabilityFlag() {
    var newCapabilities = _extends({}, this.core.getState().capabilities);
    newCapabilities.resumableUploads = true;
    this.core.setState({
      capabilities: newCapabilities
    });
  };

  Tus10.prototype.install = function install() {
    this.addResumableUploadsCapabilityFlag();
    this.actions();
  };

  return Tus10;
}(Plugin);

},{"../core/UppySocket":34,"./Plugin":64,"es6-promise":4,"lodash.throttle":5,"tus-js-client":17,"whatwg-fetch":21}],66:[function(require,module,exports){
'use strict';

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');

module.exports = function (props) {
  var _path, _path2, _uppyIcon;

  return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '100'), _uppyIcon.setAttribute('height', '77'), _uppyIcon.setAttribute('viewBox', '0 0 100 77'), _uppyIcon.setAttribute('class', 'UppyIcon'), _appendChild(_uppyIcon, ['\n    ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M50 32c-7.168 0-13 5.832-13 13s5.832 13 13 13 13-5.832 13-13-5.832-13-13-13z'), _path), '\n    ', (_path2 = document.createElementNS(_svgNamespace, 'path'), _path2.setAttribute('d', 'M87 13H72c0-7.18-5.82-13-13-13H41c-7.18 0-13 5.82-13 13H13C5.82 13 0 18.82 0 26v38c0 7.18 5.82 13 13 13h74c7.18 0 13-5.82 13-13V26c0-7.18-5.82-13-13-13zM50 68c-12.683 0-23-10.318-23-23s10.317-23 23-23 23 10.318 23 23-10.317 23-23 23z'), _path2), '\n  ']), _uppyIcon;
};

},{"yo-yo":22,"yo-yoify/lib/appendChild":31}],67:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild'),
    _onload = require('on-load');

var html = require('yo-yo');
var CameraIcon = require('./CameraIcon');

module.exports = function (props) {
  var _uppyWebcamVideoContainer, _uppyButtonCircular, _uppyWebcamButtonContainer, _uppyWebcamCanvas, _uppyWebcamContainer;

  var src = props.src || '';
  var video = void 0;

  if (props.useTheFlash) {
    video = props.getSWFHTML();
  } else {
    var _uppyWebcamVideo;

    video = (_uppyWebcamVideo = document.createElement('video'), _uppyWebcamVideo.setAttribute('autoplay', 'autoplay'), _uppyWebcamVideo.setAttribute('src', '' + String(src) + ''), _uppyWebcamVideo.setAttribute('class', 'UppyWebcam-video'), _uppyWebcamVideo);
  }

  return _uppyWebcamContainer = document.createElement('div'), _onload(_uppyWebcamContainer, function (el) {
    props.onFocus();
    document.querySelector('.UppyWebcam-stopRecordBtn').focus();
  }, function (el) {
    props.onStop();
  }, 2), _uppyWebcamContainer.setAttribute('class', 'UppyWebcam-container'), _appendChild(_uppyWebcamContainer, ['\n      ', (_uppyWebcamVideoContainer = document.createElement('div'), _uppyWebcamVideoContainer.setAttribute('class', 'UppyWebcam-videoContainer'), _appendChild(_uppyWebcamVideoContainer, ['\n        ', video, '\n      ']), _uppyWebcamVideoContainer), '\n      ', (_uppyWebcamButtonContainer = document.createElement('div'), _uppyWebcamButtonContainer.setAttribute('class', 'UppyWebcam-buttonContainer'), _appendChild(_uppyWebcamButtonContainer, ['\n        ', (_uppyButtonCircular = document.createElement('button'), _uppyButtonCircular.setAttribute('type', 'button'), _uppyButtonCircular.setAttribute('title', 'Take a snapshot'), _uppyButtonCircular.setAttribute('aria-label', 'Take a snapshot'), _uppyButtonCircular.onclick = props.onSnapshot, _uppyButtonCircular.setAttribute('class', 'UppyButton--circular UppyButton--red UppyButton--sizeM UppyWebcam-stopRecordBtn'), _appendChild(_uppyButtonCircular, ['\n          ', CameraIcon(), '\n        ']), _uppyButtonCircular), '\n      ']), _uppyWebcamButtonContainer), '\n      ', (_uppyWebcamCanvas = document.createElement('canvas'), _uppyWebcamCanvas.setAttribute('style', 'display: none;'), _uppyWebcamCanvas.setAttribute('class', 'UppyWebcam-canvas'), _uppyWebcamCanvas), '\n    ']), _uppyWebcamContainer;
};

},{"./CameraIcon":66,"on-load":7,"yo-yo":22,"yo-yoify/lib/appendChild":31}],68:[function(require,module,exports){
'use strict';

var _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');

module.exports = function (props) {
  var _h, _span, _div;

  return _div = document.createElement('div'), _appendChild(_div, ['\n      ', (_h = document.createElement('h1'), _h.textContent = 'Please allow access to your camera', _h), '\n      ', (_span = document.createElement('span'), _span.textContent = 'You have been prompted to allow camera access from this site. In order to take pictures with your camera you must approve this request.', _span), '\n    ']), _div;
};

},{"yo-yo":22,"yo-yoify/lib/appendChild":31}],69:[function(require,module,exports){
'use strict';

var _svgNamespace = 'http://www.w3.org/2000/svg',
    _appendChild = require('yo-yoify/lib/appendChild');

var html = require('yo-yo');

module.exports = function (props) {
  var _path, _path2, _uppyIcon;

  return _uppyIcon = document.createElementNS(_svgNamespace, 'svg'), _uppyIcon.setAttribute('width', '18'), _uppyIcon.setAttribute('height', '21'), _uppyIcon.setAttribute('viewBox', '0 0 18 21'), _uppyIcon.setAttribute('class', 'UppyIcon UppyModalTab-icon'), _appendChild(_uppyIcon, ['\n      ', (_path = document.createElementNS(_svgNamespace, 'path'), _path.setAttribute('d', 'M14.8 16.9c1.9-1.7 3.2-4.1 3.2-6.9 0-5-4-9-9-9s-9 4-9 9c0 2.8 1.2 5.2 3.2 6.9C1.9 17.9.5 19.4 0 21h3c1-1.9 11-1.9 12 0h3c-.5-1.6-1.9-3.1-3.2-4.1zM9 4c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6 2.7-6 6-6z'), _path), '\n      ', (_path2 = document.createElementNS(_svgNamespace, 'path'), _path2.setAttribute('d', 'M9 14c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zM8 8c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1c0-.5.4-1 1-1z'), _path2), '\n    ']), _uppyIcon;
};

},{"yo-yo":22,"yo-yoify/lib/appendChild":31}],70:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Plugin = require('../Plugin');
var WebcamProvider = require('../../uppy-base/src/plugins/Webcam');

var _require = require('../../core/Utils'),
    extend = _require.extend;

var WebcamIcon = require('./WebcamIcon');
var CameraScreen = require('./CameraScreen');
var PermissionsScreen = require('./PermissionsScreen');

/**
 * Webcam
 */
module.exports = function (_Plugin) {
  _inherits(Webcam, _Plugin);

  function Webcam(core, opts) {
    _classCallCheck(this, Webcam);

    var _this = _possibleConstructorReturn(this, _Plugin.call(this, core, opts));

    _this.userMedia = true;
    _this.protocol = location.protocol.match(/https/i) ? 'https' : 'http';
    _this.type = 'acquirer';
    _this.id = 'Webcam';
    _this.title = 'Webcam';
    _this.icon = WebcamIcon();

    // set default options
    var defaultOptions = {
      enableFlash: true
    };

    _this.params = {
      swfURL: 'webcam.swf',
      width: 400,
      height: 300,
      dest_width: 800, // size of captured image
      dest_height: 600, // these default to width/height
      image_format: 'jpeg', // image format (may be jpeg or png)
      jpeg_quality: 90, // jpeg image quality from 0 (worst) to 100 (best)
      enable_flash: true, // enable flash fallback,
      force_flash: false, // force flash mode,
      flip_horiz: false, // flip image horiz (mirror mode)
      fps: 30, // camera frames per second
      upload_name: 'webcam', // name of file in upload post data
      constraints: null, // custom user media constraints,
      flashNotDetectedText: 'ERROR: No Adobe Flash Player detected.  Webcam.js relies on Flash for browsers that do not support getUserMedia (like yours).',
      noInterfaceFoundText: 'No supported webcam interface found.',
      unfreeze_snap: true // Whether to unfreeze the camera after snap (defaults to true)
    };

    // merge default options with the ones set by user
    _this.opts = _extends({}, defaultOptions, opts);

    _this.install = _this.install.bind(_this);
    _this.updateState = _this.updateState.bind(_this);

    _this.render = _this.render.bind(_this);

    // Camera controls
    _this.start = _this.start.bind(_this);
    _this.stop = _this.stop.bind(_this);
    _this.takeSnapshot = _this.takeSnapshot.bind(_this);

    _this.webcam = new WebcamProvider(_this.opts, _this.params);
    _this.webcamActive = false;
    return _this;
  }

  Webcam.prototype.start = function start() {
    var _this2 = this;

    this.webcamActive = true;

    this.webcam.start().then(function (stream) {
      _this2.stream = stream;
      _this2.updateState({
        // videoStream: stream,
        cameraReady: true
      });
    }).catch(function (err) {
      _this2.updateState({
        cameraError: err
      });
    });
  };

  Webcam.prototype.stop = function stop() {
    this.stream.getVideoTracks()[0].stop();
    this.webcamActive = false;
    this.stream = null;
    this.streamSrc = null;
  };

  Webcam.prototype.takeSnapshot = function takeSnapshot() {
    var opts = {
      name: 'webcam-' + Date.now() + '.jpg',
      mimeType: 'image/jpeg'
    };

    var video = document.querySelector('.UppyWebcam-video');

    var image = this.webcam.getImage(video, opts);

    var tagFile = {
      source: this.id,
      name: opts.name,
      data: image.data,
      type: opts.mimeType
    };

    this.core.emitter.emit('core:file-add', tagFile);
  };

  Webcam.prototype.render = function render(state) {
    if (!this.webcamActive) {
      this.start();
    }

    if (!state.webcam.cameraReady && !state.webcam.useTheFlash) {
      return PermissionsScreen(state.webcam);
    }

    if (!this.streamSrc) {
      this.streamSrc = this.stream ? URL.createObjectURL(this.stream) : null;
    }

    return CameraScreen(extend(state.webcam, {
      onSnapshot: this.takeSnapshot,
      onFocus: this.focus,
      onStop: this.stop,
      getSWFHTML: this.webcam.getSWFHTML,
      src: this.streamSrc
    }));
  };

  Webcam.prototype.focus = function focus() {
    var _this3 = this;

    setTimeout(function () {
      _this3.core.emitter.emit('informer', 'Smile!', 'info', 2000);
    }, 1000);
  };

  Webcam.prototype.install = function install() {
    this.webcam.init();
    this.core.setState({
      webcam: {
        cameraReady: false
      }
    });

    var target = this.opts.target;
    var plugin = this;
    this.target = this.mount(target, plugin);
  };

  /**
   * Little shorthand to update the state with my new state
   */


  Webcam.prototype.updateState = function updateState(newState) {
    var state = this.core.state;

    var webcam = _extends({}, state.webcam, newState);

    this.core.setState({ webcam: webcam });
  };

  return Webcam;
}(Plugin);

},{"../../core/Utils":35,"../../uppy-base/src/plugins/Webcam":72,"../Plugin":64,"./CameraScreen":67,"./PermissionsScreen":68,"./WebcamIcon":69}],71:[function(require,module,exports){
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

require('whatwg-fetch');

var _getName = function _getName(id) {
  return id.split('-').map(function (s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }).join(' ');
};

module.exports = function () {
  function Provider(opts) {
    _classCallCheck(this, Provider);

    this.opts = opts;
    this.provider = opts.provider;
    this.id = this.provider;
    this.authProvider = opts.authProvider || this.provider;
    this.name = this.opts.name || _getName(this.id);
  }

  _createClass(Provider, [{
    key: 'auth',
    value: function auth() {
      return fetch(this.opts.host + '/' + this.id + '/auth', {
        method: 'get',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application.json'
        }
      }).then(function (res) {
        return res.json().then(function (payload) {
          return payload.authenticated;
        });
      });
    }
  }, {
    key: 'list',
    value: function list(directory) {
      return fetch(this.opts.host + '/' + this.id + '/list/' + (directory || ''), {
        method: 'get',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }).then(function (res) {
        return res.json();
      });
    }
  }, {
    key: 'logout',
    value: function logout() {
      var redirect = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : location.href;

      return fetch(this.opts.host + '/' + this.id + '/logout?redirect=' + redirect, {
        method: 'get',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
    }
  }]);

  return Provider;
}();

},{"whatwg-fetch":21}],72:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var dataURItoFile = require('../utils/dataURItoFile');

/**
 * Webcam Plugin
 */
module.exports = function () {
  function Webcam() {
    var opts = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    _classCallCheck(this, Webcam);

    this._userMedia;
    this.userMedia = true;
    this.protocol = location.protocol.match(/https/i) ? 'https' : 'http';

    // set default options
    var defaultOptions = {
      enableFlash: true
    };

    var defaultParams = {
      swfURL: 'webcam.swf',
      width: 400,
      height: 300,
      dest_width: 800, // size of captured image
      dest_height: 600, // these default to width/height
      image_format: 'jpeg', // image format (may be jpeg or png)
      jpeg_quality: 90, // jpeg image quality from 0 (worst) to 100 (best)
      enable_flash: true, // enable flash fallback,
      force_flash: false, // force flash mode,
      flip_horiz: false, // flip image horiz (mirror mode)
      fps: 30, // camera frames per second
      upload_name: 'webcam', // name of file in upload post data
      constraints: null, // custom user media constraints,
      flashNotDetectedText: 'ERROR: No Adobe Flash Player detected.  Webcam.js relies on Flash for browsers that do not support getUserMedia (like yours).',
      noInterfaceFoundText: 'No supported webcam interface found.',
      unfreeze_snap: true // Whether to unfreeze the camera after snap (defaults to true)
    };

    this.params = Object.assign({}, defaultParams, params);

    // merge default options with the ones set by user
    this.opts = Object.assign({}, defaultOptions, opts);

    // Camera controls
    this.start = this.start.bind(this);
    this.init = this.init.bind(this);
    this.stop = this.stop.bind(this);
    // this.startRecording = this.startRecording.bind(this)
    // this.stopRecording = this.stopRecording.bind(this)
    this.takeSnapshot = this.takeSnapshot.bind(this);
    this.getImage = this.getImage.bind(this);
    this.getSWFHTML = this.getSWFHTML.bind(this);
    this.detectFlash = this.detectFlash.bind(this);
    this.getUserMedia = this.getUserMedia.bind(this);
    this.getMediaDevices = this.getMediaDevices.bind(this);
  }

  /**
   * Checks for getUserMedia support
   */


  _createClass(Webcam, [{
    key: 'init',
    value: function init() {
      var _this = this;

      // initialize, check for getUserMedia support
      this.mediaDevices = this.getMediaDevices();

      this.userMedia = this.getUserMedia(this.mediaDevices);

      // Make sure media stream is closed when navigating away from page
      if (this.userMedia) {
        window.addEventListener('beforeunload', function (event) {
          _this.reset();
        });
      }

      return {
        mediaDevices: this.mediaDevices,
        userMedia: this.userMedia
      };
    }

    // Setup getUserMedia, with polyfill for older browsers
    // Adapted from: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

  }, {
    key: 'getMediaDevices',
    value: function getMediaDevices() {
      return navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? navigator.mediaDevices : navigator.mozGetUserMedia || navigator.webkitGetUserMedia ? {
        getUserMedia: function getUserMedia(opts) {
          return new Promise(function (resolve, reject) {
            (navigator.mozGetUserMedia || navigator.webkitGetUserMedia).call(navigator, opts, resolve, reject);
          });
        }
      } : null;
    }
  }, {
    key: 'getUserMedia',
    value: function getUserMedia(mediaDevices) {
      var userMedia = true;
      // Older versions of firefox (< 21) apparently claim support but user media does not actually work
      if (navigator.userAgent.match(/Firefox\D+(\d+)/)) {
        if (parseInt(RegExp.$1, 10) < 21) {
          return null;
        }
      }

      window.URL = window.URL || window.webkitURL || window.mozURL || window.msURL;
      return userMedia && !!mediaDevices && !!window.URL;
    }
  }, {
    key: 'start',
    value: function start() {
      var _this2 = this;

      this.userMedia = this._userMedia === undefined ? this.userMedia : this._userMedia;
      return new Promise(function (resolve, reject) {
        if (_this2.userMedia) {
          // ask user for access to their camera
          _this2.mediaDevices.getUserMedia({
            audio: false,
            video: true
          }).then(function (stream) {
            return resolve(stream);
          }).catch(function (err) {
            return reject(err);
          });
        }
      });
    }

    /**
     * Detects if browser supports flash
     * Code snippet borrowed from: https://github.com/swfobject/swfobject
     *
     * @return {bool} flash supported
     */

  }, {
    key: 'detectFlash',
    value: function detectFlash() {
      var SHOCKWAVE_FLASH = 'Shockwave Flash';
      var SHOCKWAVE_FLASH_AX = 'ShockwaveFlash.ShockwaveFlash';
      var FLASH_MIME_TYPE = 'application/x-shockwave-flash';
      var win = window;
      var nav = navigator;
      var hasFlash = false;

      if (typeof nav.plugins !== 'undefined' && _typeof(nav.plugins[SHOCKWAVE_FLASH]) === 'object') {
        var desc = nav.plugins[SHOCKWAVE_FLASH].description;
        if (desc && typeof nav.mimeTypes !== 'undefined' && nav.mimeTypes[FLASH_MIME_TYPE] && nav.mimeTypes[FLASH_MIME_TYPE].enabledPlugin) {
          hasFlash = true;
        }
      } else if (typeof win.ActiveXObject !== 'undefined') {
        try {
          var ax = new win.ActiveXObject(SHOCKWAVE_FLASH_AX);
          if (ax) {
            var ver = ax.GetVariable('$version');
            if (ver) hasFlash = true;
          }
        } catch (e) {}
      }

      return hasFlash;
    }
  }, {
    key: 'reset',
    value: function reset() {
      // shutdown camera, reset to potentially attach again
      if (this.preview_active) this.unfreeze();

      if (this.userMedia) {
        if (this.stream) {
          if (this.stream.getVideoTracks) {
            // get video track to call stop on it
            var tracks = this.stream.getVideoTracks();
            if (tracks && tracks[0] && tracks[0].stop) tracks[0].stop();
          } else if (this.stream.stop) {
            // deprecated, may be removed in future
            this.stream.stop();
          }
        }
        delete this.stream;
        delete this.video;
      }

      if (this.userMedia !== true) {
        // call for turn off camera in flash
        this.getMovie()._releaseCamera();
      }
    }
  }, {
    key: 'getSWFHTML',
    value: function getSWFHTML() {
      // Return HTML for embedding flash based webcam capture movie
      var swfURL = this.params.swfURL;

      // make sure we aren't running locally (flash doesn't work)
      if (location.protocol.match(/file/)) {
        return '<h3 style="color:red">ERROR: the Webcam.js Flash fallback does not work from local disk.  Please run it from a web server.</h3>';
      }

      // make sure we have flash
      if (!this.detectFlash()) {
        return '<h3 style="color:red">No flash</h3>';
      }

      // set default swfURL if not explicitly set
      if (!swfURL) {
        // find our script tag, and use that base URL
        var baseUrl = '';
        var scpts = document.getElementsByTagName('script');
        for (var idx = 0, len = scpts.length; idx < len; idx++) {
          var src = scpts[idx].getAttribute('src');
          if (src && src.match(/\/webcam(\.min)?\.js/)) {
            baseUrl = src.replace(/\/webcam(\.min)?\.js.*$/, '');
            idx = len;
          }
        }
        if (baseUrl) swfURL = baseUrl + '/webcam.swf';else swfURL = 'webcam.swf';
      }

      // // if this is the user's first visit, set flashvar so flash privacy settings panel is shown first
      // if (window.localStorage && !localStorage.getItem('visited')) {
      //   // this.params.new_user = 1
      //   localStorage.setItem('visited', 1)
      // }
      // this.params.new_user = 1
      // construct flashvars string
      var flashvars = '';
      for (var key in this.params) {
        if (flashvars) flashvars += '&';
        flashvars += key + '=' + escape(this.params[key]);
      }

      // construct object/embed tag

      return '<object classid="clsid:d27cdb6e-ae6d-11cf-96b8-444553540000" type="application/x-shockwave-flash" codebase="' + this.protocol + '://download.macromedia.com/pub/shockwave/cabs/flash/swflash.cab#version=9,0,0,0" width="' + this.params.width + '" height="' + this.params.height + '" id="webcam_movie_obj" align="middle"><param name="wmode" value="opaque" /><param name="allowScriptAccess" value="always" /><param name="allowFullScreen" value="false" /><param name="movie" value="' + swfURL + '" /><param name="loop" value="false" /><param name="menu" value="false" /><param name="quality" value="best" /><param name="bgcolor" value="#ffffff" /><param name="flashvars" value="' + flashvars + '"/><embed id="webcam_movie_embed" src="' + swfURL + '" wmode="opaque" loop="false" menu="false" quality="best" bgcolor="#ffffff" width="' + this.params.width + '" height="' + this.params.height + '" name="webcam_movie_embed" align="middle" allowScriptAccess="always" allowFullScreen="false" type="application/x-shockwave-flash" pluginspage="http://www.macromedia.com/go/getflashplayer" flashvars="' + flashvars + '"></embed></object>';
    }
  }, {
    key: 'getMovie',
    value: function getMovie() {
      // get reference to movie object/embed in DOM
      var movie = document.getElementById('webcam_movie_obj');
      if (!movie || !movie._snap) movie = document.getElementById('webcam_movie_embed');
      if (!movie) console.log('getMovie error');
      return movie;
    }

    /**
     * Stops the webcam capture and video playback.
     */

  }, {
    key: 'stop',
    value: function stop() {
      var video = this.video,
          videoStream = this.videoStream;


      this.updateState({
        cameraReady: false
      });

      if (videoStream) {
        if (videoStream.stop) {
          videoStream.stop();
        } else if (videoStream.msStop) {
          videoStream.msStop();
        }

        videoStream.onended = null;
        videoStream = null;
      }

      if (video) {
        video.onerror = null;
        video.pause();

        if (video.mozSrcObject) {
          video.mozSrcObject = null;
        }

        video.src = '';
      }

      this.video = document.querySelector('.UppyWebcam-video');
      this.canvas = document.querySelector('.UppyWebcam-canvas');
    }
  }, {
    key: 'flashNotify',
    value: function flashNotify(type, msg) {
      // receive notification from flash about event
      switch (type) {
        case 'flashLoadComplete':
          // movie loaded successfully
          break;

        case 'cameraLive':
          // camera is live and ready to snap
          this.live = true;
          break;

        case 'error':
          // Flash error
          console.log('There was a flash error', msg);
          break;

        default:
          // catch-all event, just in case
          console.log('webcam flash_notify: ' + type + ': ' + msg);
          break;
      }
    }
  }, {
    key: 'configure',
    value: function configure(panel) {
      // open flash configuration panel -- specify tab name:
      // 'camera', 'privacy', 'default', 'localStorage', 'microphone', 'settingsManager'
      if (!panel) panel = 'camera';
      this.getMovie()._configure(panel);
    }

    /**
     * Takes a snapshot and displays it in a canvas.
     */

  }, {
    key: 'getImage',
    value: function getImage(video, opts) {
      var canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      var dataUrl = canvas.toDataURL(opts.mimeType);

      var file = dataURItoFile(dataUrl, {
        name: opts.name
      });

      return {
        dataUrl: dataUrl,
        data: file,
        type: opts.mimeType
      };
    }
  }, {
    key: 'takeSnapshot',
    value: function takeSnapshot(video, canvas) {
      var opts = {
        name: 'webcam-' + Date.now() + '.jpg',
        mimeType: 'image/jpeg'
      };

      var image = this.getImage(video, canvas, opts);

      var tagFile = {
        source: this.id,
        name: opts.name,
        data: image.data,
        type: opts.type
      };

      return tagFile;
    }
  }]);

  return Webcam;
}();

},{"../utils/dataURItoFile":73}],73:[function(require,module,exports){
'use strict';

function dataURItoBlob(dataURI, opts, toFile) {
  // get the base64 data
  var data = dataURI.split(',')[1];

  // user may provide mime type, if not get it from data URI
  var mimeType = opts.mimeType || dataURI.split(',')[0].split(':')[1].split(';')[0];

  // default to plain/text if data URI has no mimeType
  if (mimeType == null) {
    mimeType = 'plain/text';
  }

  var binary = atob(data);
  var array = [];
  for (var i = 0; i < binary.length; i++) {
    array.push(binary.charCodeAt(i));
  }

  // Convert to a File?
  if (toFile) {
    return new File([new Uint8Array(array)], opts.name || '', { type: mimeType });
  }

  return new Blob([new Uint8Array(array)], { type: mimeType });
}

module.exports = function (dataURI, opts) {
  return dataURItoBlob(dataURI, opts, true);
};

},{}],74:[function(require,module,exports){

},{}],75:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],76:[function(require,module,exports){
'use strict';

var Uppy = require('../../../../src/core');
var Dashboard = require('../../../../src/plugins/Dashboard');
var GoogleDrive = require('../../../../src/plugins/GoogleDrive');
var Dropbox = require('../../../../src/plugins/Dropbox');
var Webcam = require('../../../../src/plugins/Webcam');
var Tus10 = require('../../../../src/plugins/Tus10');
var MetaData = require('../../../../src/plugins/MetaData');
var Informer = require('../../../../src/plugins/Informer');

var UPPY_SERVER = require('../env');

var PROTOCOL = location.protocol === 'https:' ? 'https' : 'http';
var TUS_ENDPOINT = PROTOCOL + '://master.tus.io/files/';

function uppyInit() {
  var opts = window.uppyOptions;
  var dashboardEl = document.querySelector('.UppyDashboard');
  if (dashboardEl) {
    var dashboardElParent = dashboardEl.parentNode;
    dashboardElParent.removeChild(dashboardEl);
  }

  var uppy = Uppy({ debug: true, autoProceed: opts.autoProceed });
  uppy.use(Dashboard, {
    trigger: '.UppyModalOpenerBtn',
    inline: opts.DashboardInline,
    target: opts.DashboardInline ? '.DashboardContainer' : 'body'
  });

  if (opts.GoogleDrive) {
    uppy.use(GoogleDrive, { target: Dashboard, host: UPPY_SERVER });
  }

  if (opts.Dropbox) {
    uppy.use(Dropbox, { target: Dashboard, host: UPPY_SERVER });
  }

  if (opts.Webcam) {
    uppy.use(Webcam, { target: Dashboard });
  }

  uppy.use(Tus10, { endpoint: TUS_ENDPOINT, resume: true });
  uppy.use(Informer, { target: Dashboard });
  uppy.use(MetaData, {
    fields: [{ id: 'resizeTo', name: 'Resize to', value: 1200, placeholder: 'specify future image size' }, { id: 'description', name: 'Description', value: 'none', placeholder: 'describe what the file is for' }]
  });
  uppy.run();

  uppy.on('core:success', function (fileCount) {
    console.log('Yo, uploaded: ' + fileCount);
  });
}

uppyInit();
window.uppyInit = uppyInit;

},{"../../../../src/core":36,"../../../../src/plugins/Dashboard":58,"../../../../src/plugins/Dropbox":60,"../../../../src/plugins/GoogleDrive":61,"../../../../src/plugins/Informer":62,"../../../../src/plugins/MetaData":63,"../../../../src/plugins/Tus10":65,"../../../../src/plugins/Webcam":70,"../env":77}],77:[function(require,module,exports){
'use strict';

var uppyServerEndpoint = 'http://localhost:3020';

if (location.hostname === 'uppy.io') {
  uppyServerEndpoint = '//server.uppy.io';
}

var UPPY_SERVER = uppyServerEndpoint;
module.exports = UPPY_SERVER;

},{}]},{},[76])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuLi9ub2RlX21vZHVsZXMvZHJhZy1kcm9wL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL2RyYWctZHJvcC9ub2RlX21vZHVsZXMvZmxhdHRlbi9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9kcmFnLWRyb3Avbm9kZV9tb2R1bGVzL3J1bi1wYXJhbGxlbC9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9lczYtcHJvbWlzZS9kaXN0L2VzNi1wcm9taXNlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL2xvZGFzaC50aHJvdHRsZS9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9uYW1lc3BhY2UtZW1pdHRlci9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9vbi1sb2FkL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL29uLWxvYWQvbm9kZV9tb2R1bGVzL2dsb2JhbC9kb2N1bWVudC5qcyIsIi4uL25vZGVfbW9kdWxlcy9vbi1sb2FkL25vZGVfbW9kdWxlcy9nbG9iYWwvd2luZG93LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3ByZXR0aWVyLWJ5dGVzL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3R1cy1qcy1jbGllbnQvbGliLmVzNS9icm93c2VyL2Jhc2U2NC5qcyIsIi4uL25vZGVfbW9kdWxlcy90dXMtanMtY2xpZW50L2xpYi5lczUvYnJvd3Nlci9yZXF1ZXN0LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3R1cy1qcy1jbGllbnQvbGliLmVzNS9icm93c2VyL3NvdXJjZS5qcyIsIi4uL25vZGVfbW9kdWxlcy90dXMtanMtY2xpZW50L2xpYi5lczUvYnJvd3Nlci9zdG9yYWdlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3R1cy1qcy1jbGllbnQvbGliLmVzNS9lcnJvci5qcyIsIi4uL25vZGVfbW9kdWxlcy90dXMtanMtY2xpZW50L2xpYi5lczUvZmluZ2VycHJpbnQuanMiLCIuLi9ub2RlX21vZHVsZXMvdHVzLWpzLWNsaWVudC9saWIuZXM1L2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3R1cy1qcy1jbGllbnQvbGliLmVzNS91cGxvYWQuanMiLCIuLi9ub2RlX21vZHVsZXMvdHVzLWpzLWNsaWVudC9ub2RlX21vZHVsZXMvZXh0ZW5kL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3R1cy1qcy1jbGllbnQvbm9kZV9tb2R1bGVzL3Jlc29sdmUtdXJsL3Jlc29sdmUtdXJsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3doYXR3Zy1mZXRjaC9mZXRjaC5qcyIsIi4uL25vZGVfbW9kdWxlcy95by15by9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy95by15by9ub2RlX21vZHVsZXMvYmVsL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3lvLXlvL25vZGVfbW9kdWxlcy9iZWwvbm9kZV9tb2R1bGVzL2dsb2JhbC9kb2N1bWVudC5qcyIsIi4uL25vZGVfbW9kdWxlcy95by15by9ub2RlX21vZHVsZXMvYmVsL25vZGVfbW9kdWxlcy9nbG9iYWwvd2luZG93LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3lvLXlvL25vZGVfbW9kdWxlcy9iZWwvbm9kZV9tb2R1bGVzL2h5cGVyeC9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy95by15by9ub2RlX21vZHVsZXMvYmVsL25vZGVfbW9kdWxlcy9oeXBlcngvbm9kZV9tb2R1bGVzL2h5cGVyc2NyaXB0LWF0dHJpYnV0ZS10by1wcm9wZXJ0eS9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy95by15by9ub2RlX21vZHVsZXMvbW9ycGhkb20vZGlzdC9tb3JwaGRvbS5qcyIsIi4uL25vZGVfbW9kdWxlcy95by15by91cGRhdGUtZXZlbnRzLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3lvLXlvaWZ5L2xpYi9hcHBlbmRDaGlsZC5qcyIsIi4uL3NyYy9jb3JlL0NvcmUuanMiLCIuLi9zcmMvY29yZS9UcmFuc2xhdG9yLmpzIiwiLi4vc3JjL2NvcmUvVXBweVNvY2tldC5qcyIsIi4uL3NyYy9jb3JlL1V0aWxzLmpzIiwiLi4vc3JjL2NvcmUvaW5kZXguanMiLCIuLi9zcmMvZ2VuZXJpYy1wcm92aWRlci12aWV3cy9BdXRoVmlldy5qcyIsIi4uL3NyYy9nZW5lcmljLXByb3ZpZGVyLXZpZXdzL0JyZWFkY3J1bWIuanMiLCIuLi9zcmMvZ2VuZXJpYy1wcm92aWRlci12aWV3cy9CcmVhZGNydW1icy5qcyIsIi4uL3NyYy9nZW5lcmljLXByb3ZpZGVyLXZpZXdzL0Jyb3dzZXIuanMiLCIuLi9zcmMvZ2VuZXJpYy1wcm92aWRlci12aWV3cy9FcnJvci5qcyIsIi4uL3NyYy9nZW5lcmljLXByb3ZpZGVyLXZpZXdzL0xvYWRlci5qcyIsIi4uL3NyYy9nZW5lcmljLXByb3ZpZGVyLXZpZXdzL1RhYmxlLmpzIiwiLi4vc3JjL2dlbmVyaWMtcHJvdmlkZXItdmlld3MvVGFibGVDb2x1bW4uanMiLCIuLi9zcmMvZ2VuZXJpYy1wcm92aWRlci12aWV3cy9UYWJsZVJvdy5qcyIsIi4uL3NyYy9nZW5lcmljLXByb3ZpZGVyLXZpZXdzL2luZGV4LmpzIiwiLi4vc3JjL3BsdWdpbnMvRGFzaGJvYXJkL0FjdGlvbkJyb3dzZVRhZ2xpbmUuanMiLCIuLi9zcmMvcGx1Z2lucy9EYXNoYm9hcmQvRGFzaGJvYXJkLmpzIiwiLi4vc3JjL3BsdWdpbnMvRGFzaGJvYXJkL0ZpbGVDYXJkLmpzIiwiLi4vc3JjL3BsdWdpbnMvRGFzaGJvYXJkL0ZpbGVJdGVtLmpzIiwiLi4vc3JjL3BsdWdpbnMvRGFzaGJvYXJkL0ZpbGVJdGVtUHJvZ3Jlc3MuanMiLCIuLi9zcmMvcGx1Z2lucy9EYXNoYm9hcmQvRmlsZUxpc3QuanMiLCIuLi9zcmMvcGx1Z2lucy9EYXNoYm9hcmQvU3RhdHVzQmFyLmpzIiwiLi4vc3JjL3BsdWdpbnMvRGFzaGJvYXJkL1RhYnMuanMiLCIuLi9zcmMvcGx1Z2lucy9EYXNoYm9hcmQvVXBsb2FkQnRuLmpzIiwiLi4vc3JjL3BsdWdpbnMvRGFzaGJvYXJkL2dldEZpbGVUeXBlSWNvbi5qcyIsIi4uL3NyYy9wbHVnaW5zL0Rhc2hib2FyZC9pY29ucy5qcyIsIi4uL3NyYy9wbHVnaW5zL0Rhc2hib2FyZC9pbmRleC5qcyIsIi4uL3NyYy9wbHVnaW5zL0Ryb3Bib3gvaWNvbnMuanMiLCIuLi9zcmMvcGx1Z2lucy9Ecm9wYm94L2luZGV4LmpzIiwiLi4vc3JjL3BsdWdpbnMvR29vZ2xlRHJpdmUvaW5kZXguanMiLCIuLi9zcmMvcGx1Z2lucy9JbmZvcm1lci5qcyIsIi4uL3NyYy9wbHVnaW5zL01ldGFEYXRhLmpzIiwiLi4vc3JjL3BsdWdpbnMvUGx1Z2luLmpzIiwiLi4vc3JjL3BsdWdpbnMvVHVzMTAuanMiLCIuLi9zcmMvcGx1Z2lucy9XZWJjYW0vQ2FtZXJhSWNvbi5qcyIsIi4uL3NyYy9wbHVnaW5zL1dlYmNhbS9DYW1lcmFTY3JlZW4uanMiLCIuLi9zcmMvcGx1Z2lucy9XZWJjYW0vUGVybWlzc2lvbnNTY3JlZW4uanMiLCIuLi9zcmMvcGx1Z2lucy9XZWJjYW0vV2ViY2FtSWNvbi5qcyIsIi4uL3NyYy9wbHVnaW5zL1dlYmNhbS9pbmRleC5qcyIsIi4uL3NyYy91cHB5LWJhc2Uvc3JjL3BsdWdpbnMvUHJvdmlkZXIuanMiLCIuLi9zcmMvdXBweS1iYXNlL3NyYy9wbHVnaW5zL1dlYmNhbS5qcyIsIi4uL3NyYy91cHB5LWJhc2Uvc3JjL3V0aWxzL2RhdGFVUkl0b0ZpbGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1yZXNvbHZlL2VtcHR5LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsInNyYy9leGFtcGxlcy9kYXNoYm9hcmQvYXBwLmVzNiIsInNyYy9leGFtcGxlcy9lbnYuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQy83QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3ZiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3ZGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ1RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoaUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2piQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNySkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdlFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqcUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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QUZEO0FBR0Q7O0FBRUQ7QUFDQSxPQUFPLFFBQVAsR0FBa0IsUUFBbEI7Ozs7O0FDekRBLElBQUkscUJBQXFCLHVCQUF6Qjs7QUFFQSxJQUFJLFNBQVMsUUFBVCxLQUFzQixTQUExQixFQUFxQztBQUNuQyx1QkFBcUIsa0JBQXJCO0FBQ0Q7O0FBRUQsSUFBTSxjQUFjLGtCQUFwQjtBQUNBLE9BQU8sT0FBUCxHQUFpQixXQUFqQiIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJtb2R1bGUuZXhwb3J0cyA9IGRyYWdEcm9wXG5cbnZhciBmbGF0dGVuID0gcmVxdWlyZSgnZmxhdHRlbicpXG52YXIgcGFyYWxsZWwgPSByZXF1aXJlKCdydW4tcGFyYWxsZWwnKVxuXG5mdW5jdGlvbiBkcmFnRHJvcCAoZWxlbSwgbGlzdGVuZXJzKSB7XG4gIGlmICh0eXBlb2YgZWxlbSA9PT0gJ3N0cmluZycpIHtcbiAgICB2YXIgc2VsZWN0b3IgPSBlbGVtXG4gICAgZWxlbSA9IHdpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKGVsZW0pXG4gICAgaWYgKCFlbGVtKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1wiJyArIHNlbGVjdG9yICsgJ1wiIGRvZXMgbm90IG1hdGNoIGFueSBIVE1MIGVsZW1lbnRzJylcbiAgICB9XG4gIH1cblxuICBpZiAoIWVsZW0pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1wiJyArIGVsZW0gKyAnXCIgaXMgbm90IGEgdmFsaWQgSFRNTCBlbGVtZW50JylcbiAgfVxuXG4gIGlmICh0eXBlb2YgbGlzdGVuZXJzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgbGlzdGVuZXJzID0geyBvbkRyb3A6IGxpc3RlbmVycyB9XG4gIH1cblxuICB2YXIgdGltZW91dFxuXG4gIGVsZW0uYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2VudGVyJywgb25EcmFnRW50ZXIsIGZhbHNlKVxuICBlbGVtLmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdvdmVyJywgb25EcmFnT3ZlciwgZmFsc2UpXG4gIGVsZW0uYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2xlYXZlJywgb25EcmFnTGVhdmUsIGZhbHNlKVxuICBlbGVtLmFkZEV2ZW50TGlzdGVuZXIoJ2Ryb3AnLCBvbkRyb3AsIGZhbHNlKVxuXG4gIC8vIEZ1bmN0aW9uIHRvIHJlbW92ZSBkcmFnLWRyb3AgbGlzdGVuZXJzXG4gIHJldHVybiBmdW5jdGlvbiByZW1vdmUgKCkge1xuICAgIHJlbW92ZURyYWdDbGFzcygpXG4gICAgZWxlbS5yZW1vdmVFdmVudExpc3RlbmVyKCdkcmFnZW50ZXInLCBvbkRyYWdFbnRlciwgZmFsc2UpXG4gICAgZWxlbS5yZW1vdmVFdmVudExpc3RlbmVyKCdkcmFnb3ZlcicsIG9uRHJhZ092ZXIsIGZhbHNlKVxuICAgIGVsZW0ucmVtb3ZlRXZlbnRMaXN0ZW5lcignZHJhZ2xlYXZlJywgb25EcmFnTGVhdmUsIGZhbHNlKVxuICAgIGVsZW0ucmVtb3ZlRXZlbnRMaXN0ZW5lcignZHJvcCcsIG9uRHJvcCwgZmFsc2UpXG4gIH1cblxuICBmdW5jdGlvbiBvbkRyYWdFbnRlciAoZSkge1xuICAgIGlmIChsaXN0ZW5lcnMub25EcmFnRW50ZXIpIHtcbiAgICAgIGxpc3RlbmVycy5vbkRyYWdFbnRlcihlKVxuICAgIH1cblxuICAgIC8vIFByZXZlbnQgZXZlbnRcbiAgICBlLnN0b3BQcm9wYWdhdGlvbigpXG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBvbkRyYWdPdmVyIChlKSB7XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKVxuICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgIGlmIChlLmRhdGFUcmFuc2Zlci5pdGVtcykge1xuICAgICAgLy8gT25seSBhZGQgXCJkcmFnXCIgY2xhc3Mgd2hlbiBgaXRlbXNgIGNvbnRhaW5zIGl0ZW1zIHRoYXQgYXJlIGFibGUgdG8gYmVcbiAgICAgIC8vIGhhbmRsZWQgYnkgdGhlIHJlZ2lzdGVyZWQgbGlzdGVuZXJzIChmaWxlcyB2cy4gdGV4dClcbiAgICAgIHZhciBpdGVtcyA9IHRvQXJyYXkoZS5kYXRhVHJhbnNmZXIuaXRlbXMpXG4gICAgICB2YXIgZmlsZUl0ZW1zID0gaXRlbXMuZmlsdGVyKGZ1bmN0aW9uIChpdGVtKSB7IHJldHVybiBpdGVtLmtpbmQgPT09ICdmaWxlJyB9KVxuICAgICAgdmFyIHRleHRJdGVtcyA9IGl0ZW1zLmZpbHRlcihmdW5jdGlvbiAoaXRlbSkgeyByZXR1cm4gaXRlbS5raW5kID09PSAnc3RyaW5nJyB9KVxuXG4gICAgICBpZiAoZmlsZUl0ZW1zLmxlbmd0aCA9PT0gMCAmJiAhbGlzdGVuZXJzLm9uRHJvcFRleHQpIHJldHVyblxuICAgICAgaWYgKHRleHRJdGVtcy5sZW5ndGggPT09IDAgJiYgIWxpc3RlbmVycy5vbkRyb3ApIHJldHVyblxuICAgICAgaWYgKGZpbGVJdGVtcy5sZW5ndGggPT09IDAgJiYgdGV4dEl0ZW1zLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG4gICAgfVxuXG4gICAgZWxlbS5jbGFzc0xpc3QuYWRkKCdkcmFnJylcbiAgICBjbGVhclRpbWVvdXQodGltZW91dClcblxuICAgIGlmIChsaXN0ZW5lcnMub25EcmFnT3Zlcikge1xuICAgICAgbGlzdGVuZXJzLm9uRHJhZ092ZXIoZSlcbiAgICB9XG5cbiAgICBlLmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ2NvcHknXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiBvbkRyYWdMZWF2ZSAoZSkge1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICBlLnByZXZlbnREZWZhdWx0KClcblxuICAgIGlmIChsaXN0ZW5lcnMub25EcmFnTGVhdmUpIHtcbiAgICAgIGxpc3RlbmVycy5vbkRyYWdMZWF2ZShlKVxuICAgIH1cblxuICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KVxuICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KHJlbW92ZURyYWdDbGFzcywgNTApXG5cbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uRHJvcCAoZSkge1xuICAgIGUuc3RvcFByb3BhZ2F0aW9uKClcbiAgICBlLnByZXZlbnREZWZhdWx0KClcblxuICAgIGlmIChsaXN0ZW5lcnMub25EcmFnTGVhdmUpIHtcbiAgICAgIGxpc3RlbmVycy5vbkRyYWdMZWF2ZShlKVxuICAgIH1cblxuICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KVxuICAgIHJlbW92ZURyYWdDbGFzcygpXG5cbiAgICB2YXIgcG9zID0ge1xuICAgICAgeDogZS5jbGllbnRYLFxuICAgICAgeTogZS5jbGllbnRZXG4gICAgfVxuXG4gICAgLy8gdGV4dCBkcm9wIHN1cHBvcnRcbiAgICB2YXIgdGV4dCA9IGUuZGF0YVRyYW5zZmVyLmdldERhdGEoJ3RleHQnKVxuICAgIGlmICh0ZXh0ICYmIGxpc3RlbmVycy5vbkRyb3BUZXh0KSB7XG4gICAgICBsaXN0ZW5lcnMub25Ecm9wVGV4dCh0ZXh0LCBwb3MpXG4gICAgfVxuXG4gICAgLy8gZmlsZSBkcm9wIHN1cHBvcnRcbiAgICBpZiAoZS5kYXRhVHJhbnNmZXIuaXRlbXMpIHtcbiAgICAgIC8vIEhhbmRsZSBkaXJlY3RvcmllcyBpbiBDaHJvbWUgdXNpbmcgdGhlIHByb3ByaWV0YXJ5IEZpbGVTeXN0ZW0gQVBJXG4gICAgICB2YXIgaXRlbXMgPSB0b0FycmF5KGUuZGF0YVRyYW5zZmVyLml0ZW1zKS5maWx0ZXIoZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGl0ZW0ua2luZCA9PT0gJ2ZpbGUnXG4gICAgICB9KVxuXG4gICAgICBpZiAoaXRlbXMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAgICAgcGFyYWxsZWwoaXRlbXMubWFwKGZ1bmN0aW9uIChpdGVtKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoY2IpIHtcbiAgICAgICAgICBwcm9jZXNzRW50cnkoaXRlbS53ZWJraXRHZXRBc0VudHJ5KCksIGNiKVxuICAgICAgICB9XG4gICAgICB9KSwgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgICAvLyBUaGlzIGNhdGNoZXMgcGVybWlzc2lvbiBlcnJvcnMgd2l0aCBmaWxlOi8vIGluIENocm9tZS4gVGhpcyBzaG91bGQgbmV2ZXJcbiAgICAgICAgLy8gdGhyb3cgaW4gcHJvZHVjdGlvbiBjb2RlLCBzbyB0aGUgdXNlciBkb2VzIG5vdCBuZWVkIHRvIHVzZSB0cnktY2F0Y2guXG4gICAgICAgIGlmIChlcnIpIHRocm93IGVyclxuICAgICAgICBpZiAobGlzdGVuZXJzLm9uRHJvcCkge1xuICAgICAgICAgIGxpc3RlbmVycy5vbkRyb3AoZmxhdHRlbihyZXN1bHRzKSwgcG9zKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZmlsZXMgPSB0b0FycmF5KGUuZGF0YVRyYW5zZmVyLmZpbGVzKVxuXG4gICAgICBpZiAoZmlsZXMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAgICAgZmlsZXMuZm9yRWFjaChmdW5jdGlvbiAoZmlsZSkge1xuICAgICAgICBmaWxlLmZ1bGxQYXRoID0gJy8nICsgZmlsZS5uYW1lXG4gICAgICB9KVxuXG4gICAgICBpZiAobGlzdGVuZXJzLm9uRHJvcCkge1xuICAgICAgICBsaXN0ZW5lcnMub25Ecm9wKGZpbGVzLCBwb3MpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBmdW5jdGlvbiByZW1vdmVEcmFnQ2xhc3MgKCkge1xuICAgIGVsZW0uY2xhc3NMaXN0LnJlbW92ZSgnZHJhZycpXG4gIH1cbn1cblxuZnVuY3Rpb24gcHJvY2Vzc0VudHJ5IChlbnRyeSwgY2IpIHtcbiAgdmFyIGVudHJpZXMgPSBbXVxuXG4gIGlmIChlbnRyeS5pc0ZpbGUpIHtcbiAgICBlbnRyeS5maWxlKGZ1bmN0aW9uIChmaWxlKSB7XG4gICAgICBmaWxlLmZ1bGxQYXRoID0gZW50cnkuZnVsbFBhdGggIC8vIHByZXNlcnZlIHBhdGhpbmcgZm9yIGNvbnN1bWVyXG4gICAgICBjYihudWxsLCBmaWxlKVxuICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIGNiKGVycilcbiAgICB9KVxuICB9IGVsc2UgaWYgKGVudHJ5LmlzRGlyZWN0b3J5KSB7XG4gICAgdmFyIHJlYWRlciA9IGVudHJ5LmNyZWF0ZVJlYWRlcigpXG4gICAgcmVhZEVudHJpZXMoKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVhZEVudHJpZXMgKCkge1xuICAgIHJlYWRlci5yZWFkRW50cmllcyhmdW5jdGlvbiAoZW50cmllc18pIHtcbiAgICAgIGlmIChlbnRyaWVzXy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGVudHJpZXMgPSBlbnRyaWVzLmNvbmNhdCh0b0FycmF5KGVudHJpZXNfKSlcbiAgICAgICAgcmVhZEVudHJpZXMoKSAvLyBjb250aW51ZSByZWFkaW5nIGVudHJpZXMgdW50aWwgYHJlYWRFbnRyaWVzYCByZXR1cm5zIG5vIG1vcmVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRvbmVFbnRyaWVzKClcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gZG9uZUVudHJpZXMgKCkge1xuICAgIHBhcmFsbGVsKGVudHJpZXMubWFwKGZ1bmN0aW9uIChlbnRyeSkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChjYikge1xuICAgICAgICBwcm9jZXNzRW50cnkoZW50cnksIGNiKVxuICAgICAgfVxuICAgIH0pLCBjYilcbiAgfVxufVxuXG5mdW5jdGlvbiB0b0FycmF5IChsaXN0KSB7XG4gIHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChsaXN0IHx8IFtdLCAwKVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBmbGF0dGVuKGxpc3QsIGRlcHRoKSB7XG4gIGRlcHRoID0gKHR5cGVvZiBkZXB0aCA9PSAnbnVtYmVyJykgPyBkZXB0aCA6IEluZmluaXR5O1xuXG4gIGlmICghZGVwdGgpIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShsaXN0KSkge1xuICAgICAgcmV0dXJuIGxpc3QubWFwKGZ1bmN0aW9uKGkpIHsgcmV0dXJuIGk7IH0pO1xuICAgIH1cbiAgICByZXR1cm4gbGlzdDtcbiAgfVxuXG4gIHJldHVybiBfZmxhdHRlbihsaXN0LCAxKTtcblxuICBmdW5jdGlvbiBfZmxhdHRlbihsaXN0LCBkKSB7XG4gICAgcmV0dXJuIGxpc3QucmVkdWNlKGZ1bmN0aW9uIChhY2MsIGl0ZW0pIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGl0ZW0pICYmIGQgPCBkZXB0aCkge1xuICAgICAgICByZXR1cm4gYWNjLmNvbmNhdChfZmxhdHRlbihpdGVtLCBkICsgMSkpO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBhY2MuY29uY2F0KGl0ZW0pO1xuICAgICAgfVxuICAgIH0sIFtdKTtcbiAgfVxufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKHRhc2tzLCBjYikge1xuICB2YXIgcmVzdWx0cywgcGVuZGluZywga2V5c1xuICB2YXIgaXNTeW5jID0gdHJ1ZVxuXG4gIGlmIChBcnJheS5pc0FycmF5KHRhc2tzKSkge1xuICAgIHJlc3VsdHMgPSBbXVxuICAgIHBlbmRpbmcgPSB0YXNrcy5sZW5ndGhcbiAgfSBlbHNlIHtcbiAgICBrZXlzID0gT2JqZWN0LmtleXModGFza3MpXG4gICAgcmVzdWx0cyA9IHt9XG4gICAgcGVuZGluZyA9IGtleXMubGVuZ3RoXG4gIH1cblxuICBmdW5jdGlvbiBkb25lIChlcnIpIHtcbiAgICBmdW5jdGlvbiBlbmQgKCkge1xuICAgICAgaWYgKGNiKSBjYihlcnIsIHJlc3VsdHMpXG4gICAgICBjYiA9IG51bGxcbiAgICB9XG4gICAgaWYgKGlzU3luYykgcHJvY2Vzcy5uZXh0VGljayhlbmQpXG4gICAgZWxzZSBlbmQoKVxuICB9XG5cbiAgZnVuY3Rpb24gZWFjaCAoaSwgZXJyLCByZXN1bHQpIHtcbiAgICByZXN1bHRzW2ldID0gcmVzdWx0XG4gICAgaWYgKC0tcGVuZGluZyA9PT0gMCB8fCBlcnIpIHtcbiAgICAgIGRvbmUoZXJyKVxuICAgIH1cbiAgfVxuXG4gIGlmICghcGVuZGluZykge1xuICAgIC8vIGVtcHR5XG4gICAgZG9uZShudWxsKVxuICB9IGVsc2UgaWYgKGtleXMpIHtcbiAgICAvLyBvYmplY3RcbiAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgICAgdGFza3Nba2V5XShmdW5jdGlvbiAoZXJyLCByZXN1bHQpIHsgZWFjaChrZXksIGVyciwgcmVzdWx0KSB9KVxuICAgIH0pXG4gIH0gZWxzZSB7XG4gICAgLy8gYXJyYXlcbiAgICB0YXNrcy5mb3JFYWNoKGZ1bmN0aW9uICh0YXNrLCBpKSB7XG4gICAgICB0YXNrKGZ1bmN0aW9uIChlcnIsIHJlc3VsdCkgeyBlYWNoKGksIGVyciwgcmVzdWx0KSB9KVxuICAgIH0pXG4gIH1cblxuICBpc1N5bmMgPSBmYWxzZVxufVxuIiwiLyohXG4gKiBAb3ZlcnZpZXcgZXM2LXByb21pc2UgLSBhIHRpbnkgaW1wbGVtZW50YXRpb24gb2YgUHJvbWlzZXMvQSsuXG4gKiBAY29weXJpZ2h0IENvcHlyaWdodCAoYykgMjAxNCBZZWh1ZGEgS2F0eiwgVG9tIERhbGUsIFN0ZWZhbiBQZW5uZXIgYW5kIGNvbnRyaWJ1dG9ycyAoQ29udmVyc2lvbiB0byBFUzYgQVBJIGJ5IEpha2UgQXJjaGliYWxkKVxuICogQGxpY2Vuc2UgICBMaWNlbnNlZCB1bmRlciBNSVQgbGljZW5zZVxuICogICAgICAgICAgICBTZWUgaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL2pha2VhcmNoaWJhbGQvZXM2LXByb21pc2UvbWFzdGVyL0xJQ0VOU0VcbiAqIEB2ZXJzaW9uICAgMy4yLjFcbiAqL1xuXG4oZnVuY3Rpb24oKSB7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHV0aWxzJCRvYmplY3RPckZ1bmN0aW9uKHgpIHtcbiAgICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyB8fCAodHlwZW9mIHggPT09ICdvYmplY3QnICYmIHggIT09IG51bGwpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNGdW5jdGlvbih4KSB7XG4gICAgICByZXR1cm4gdHlwZW9mIHggPT09ICdmdW5jdGlvbic7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc01heWJlVGhlbmFibGUoeCkge1xuICAgICAgcmV0dXJuIHR5cGVvZiB4ID09PSAnb2JqZWN0JyAmJiB4ICE9PSBudWxsO1xuICAgIH1cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkdXRpbHMkJF9pc0FycmF5O1xuICAgIGlmICghQXJyYXkuaXNBcnJheSkge1xuICAgICAgbGliJGVzNiRwcm9taXNlJHV0aWxzJCRfaXNBcnJheSA9IGZ1bmN0aW9uICh4KSB7XG4gICAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeCkgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkdXRpbHMkJF9pc0FycmF5ID0gQXJyYXkuaXNBcnJheTtcbiAgICB9XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHV0aWxzJCRpc0FycmF5ID0gbGliJGVzNiRwcm9taXNlJHV0aWxzJCRfaXNBcnJheTtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiA9IDA7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR2ZXJ0eE5leHQ7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRjdXN0b21TY2hlZHVsZXJGbjtcblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcCA9IGZ1bmN0aW9uIGFzYXAoY2FsbGJhY2ssIGFyZykge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2xpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW5dID0gY2FsbGJhY2s7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiArIDFdID0gYXJnO1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGxlbiArPSAyO1xuICAgICAgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW4gPT09IDIpIHtcbiAgICAgICAgLy8gSWYgbGVuIGlzIDIsIHRoYXQgbWVhbnMgdGhhdCB3ZSBuZWVkIHRvIHNjaGVkdWxlIGFuIGFzeW5jIGZsdXNoLlxuICAgICAgICAvLyBJZiBhZGRpdGlvbmFsIGNhbGxiYWNrcyBhcmUgcXVldWVkIGJlZm9yZSB0aGUgcXVldWUgaXMgZmx1c2hlZCwgdGhleVxuICAgICAgICAvLyB3aWxsIGJlIHByb2Nlc3NlZCBieSB0aGlzIGZsdXNoIHRoYXQgd2UgYXJlIHNjaGVkdWxpbmcuXG4gICAgICAgIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkY3VzdG9tU2NoZWR1bGVyRm4pIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkY3VzdG9tU2NoZWR1bGVyRm4obGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHNldFNjaGVkdWxlcihzY2hlZHVsZUZuKSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkY3VzdG9tU2NoZWR1bGVyRm4gPSBzY2hlZHVsZUZuO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzZXRBc2FwKGFzYXBGbikge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXAgPSBhc2FwRm47XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyV2luZG93ID0gKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSA/IHdpbmRvdyA6IHVuZGVmaW5lZDtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJHbG9iYWwgPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3NlcldpbmRvdyB8fCB7fTtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJGFzYXAkJEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJGJyb3dzZXJHbG9iYWwuTXV0YXRpb25PYnNlcnZlciB8fCBsaWIkZXM2JHByb21pc2UkYXNhcCQkYnJvd3Nlckdsb2JhbC5XZWJLaXRNdXRhdGlvbk9ic2VydmVyO1xuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkaXNOb2RlID0gdHlwZW9mIHNlbGYgPT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiB7fS50b1N0cmluZy5jYWxsKHByb2Nlc3MpID09PSAnW29iamVjdCBwcm9jZXNzXSc7XG5cbiAgICAvLyB0ZXN0IGZvciB3ZWIgd29ya2VyIGJ1dCBub3QgaW4gSUUxMFxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkYXNhcCQkaXNXb3JrZXIgPSB0eXBlb2YgVWludDhDbGFtcGVkQXJyYXkgIT09ICd1bmRlZmluZWQnICYmXG4gICAgICB0eXBlb2YgaW1wb3J0U2NyaXB0cyAhPT0gJ3VuZGVmaW5lZCcgJiZcbiAgICAgIHR5cGVvZiBNZXNzYWdlQ2hhbm5lbCAhPT0gJ3VuZGVmaW5lZCc7XG5cbiAgICAvLyBub2RlXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU5leHRUaWNrKCkge1xuICAgICAgLy8gbm9kZSB2ZXJzaW9uIDAuMTAueCBkaXNwbGF5cyBhIGRlcHJlY2F0aW9uIHdhcm5pbmcgd2hlbiBuZXh0VGljayBpcyB1c2VkIHJlY3Vyc2l2ZWx5XG4gICAgICAvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2N1am9qcy93aGVuL2lzc3Vlcy80MTAgZm9yIGRldGFpbHNcbiAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgcHJvY2Vzcy5uZXh0VGljayhsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2gpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyB2ZXJ0eFxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VWZXJ0eFRpbWVyKCkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkdmVydHhOZXh0KGxpYiRlczYkcHJvbWlzZSRhc2FwJCRmbHVzaCk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VNdXRhdGlvbk9ic2VydmVyKCkge1xuICAgICAgdmFyIGl0ZXJhdGlvbnMgPSAwO1xuICAgICAgdmFyIG9ic2VydmVyID0gbmV3IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRCcm93c2VyTXV0YXRpb25PYnNlcnZlcihsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2gpO1xuICAgICAgdmFyIG5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnJyk7XG4gICAgICBvYnNlcnZlci5vYnNlcnZlKG5vZGUsIHsgY2hhcmFjdGVyRGF0YTogdHJ1ZSB9KTtcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICBub2RlLmRhdGEgPSAoaXRlcmF0aW9ucyA9ICsraXRlcmF0aW9ucyAlIDIpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyB3ZWIgd29ya2VyXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU1lc3NhZ2VDaGFubmVsKCkge1xuICAgICAgdmFyIGNoYW5uZWwgPSBuZXcgTWVzc2FnZUNoYW5uZWwoKTtcbiAgICAgIGNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoO1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY2hhbm5lbC5wb3J0Mi5wb3N0TWVzc2FnZSgwKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZVNldFRpbWVvdXQoKSB7XG4gICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHNldFRpbWVvdXQobGliJGVzNiRwcm9taXNlJGFzYXAkJGZsdXNoLCAxKTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZSA9IG5ldyBBcnJheSgxMDAwKTtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkZmx1c2goKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRsZW47IGkrPTIpIHtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2ldO1xuICAgICAgICB2YXIgYXJnID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHF1ZXVlW2krMV07XG5cbiAgICAgICAgY2FsbGJhY2soYXJnKTtcblxuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkcXVldWVbaV0gPSB1bmRlZmluZWQ7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRxdWV1ZVtpKzFdID0gdW5kZWZpbmVkO1xuICAgICAgfVxuXG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkbGVuID0gMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXR0ZW1wdFZlcnR4KCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdmFyIHIgPSByZXF1aXJlO1xuICAgICAgICB2YXIgdmVydHggPSByKCd2ZXJ0eCcpO1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkdmVydHhOZXh0ID0gdmVydHgucnVuT25Mb29wIHx8IHZlcnR4LnJ1bk9uQ29udGV4dDtcbiAgICAgICAgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VWZXJ0eFRpbWVyKCk7XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VTZXRUaW1lb3V0KCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoO1xuICAgIC8vIERlY2lkZSB3aGF0IGFzeW5jIG1ldGhvZCB0byB1c2UgdG8gdHJpZ2dlcmluZyBwcm9jZXNzaW5nIG9mIHF1ZXVlZCBjYWxsYmFja3M6XG4gICAgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRpc05vZGUpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU5leHRUaWNrKCk7XG4gICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkYXNhcCQkQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHVzZU11dGF0aW9uT2JzZXJ2ZXIoKTtcbiAgICB9IGVsc2UgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRpc1dvcmtlcikge1xuICAgICAgbGliJGVzNiRwcm9taXNlJGFzYXAkJHNjaGVkdWxlRmx1c2ggPSBsaWIkZXM2JHByb21pc2UkYXNhcCQkdXNlTWVzc2FnZUNoYW5uZWwoKTtcbiAgICB9IGVsc2UgaWYgKGxpYiRlczYkcHJvbWlzZSRhc2FwJCRicm93c2VyV2luZG93ID09PSB1bmRlZmluZWQgJiYgdHlwZW9mIHJlcXVpcmUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzY2hlZHVsZUZsdXNoID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJGF0dGVtcHRWZXJ0eCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkc2NoZWR1bGVGbHVzaCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCR1c2VTZXRUaW1lb3V0KCk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSR0aGVuJCR0aGVuKG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKSB7XG4gICAgICB2YXIgcGFyZW50ID0gdGhpcztcblxuICAgICAgdmFyIGNoaWxkID0gbmV3IHRoaXMuY29uc3RydWN0b3IobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCk7XG5cbiAgICAgIGlmIChjaGlsZFtsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQUk9NSVNFX0lEXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG1ha2VQcm9taXNlKGNoaWxkKTtcbiAgICAgIH1cblxuICAgICAgdmFyIHN0YXRlID0gcGFyZW50Ll9zdGF0ZTtcblxuICAgICAgaWYgKHN0YXRlKSB7XG4gICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3VtZW50c1tzdGF0ZSAtIDFdO1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcChmdW5jdGlvbigpe1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGludm9rZUNhbGxiYWNrKHN0YXRlLCBjaGlsZCwgY2FsbGJhY2ssIHBhcmVudC5fcmVzdWx0KTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzdWJzY3JpYmUocGFyZW50LCBjaGlsZCwgb25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gY2hpbGQ7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkdGhlbiQkZGVmYXVsdCA9IGxpYiRlczYkcHJvbWlzZSR0aGVuJCR0aGVuO1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJHJlc29sdmUob2JqZWN0KSB7XG4gICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICAgICAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcblxuICAgICAgaWYgKG9iamVjdCAmJiB0eXBlb2Ygb2JqZWN0ID09PSAnb2JqZWN0JyAmJiBvYmplY3QuY29uc3RydWN0b3IgPT09IENvbnN0cnVjdG9yKSB7XG4gICAgICAgIHJldHVybiBvYmplY3Q7XG4gICAgICB9XG5cbiAgICAgIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVzb2x2ZShwcm9taXNlLCBvYmplY3QpO1xuICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZXNvbHZlJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkcmVzb2x2ZTtcbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUFJPTUlTRV9JRCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cmluZygxNik7XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wKCkge31cblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HICAgPSB2b2lkIDA7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRCA9IDE7XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEICA9IDI7XG5cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1IgPSBuZXcgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkRXJyb3JPYmplY3QoKTtcblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHNlbGZGdWxmaWxsbWVudCgpIHtcbiAgICAgIHJldHVybiBuZXcgVHlwZUVycm9yKFwiWW91IGNhbm5vdCByZXNvbHZlIGEgcHJvbWlzZSB3aXRoIGl0c2VsZlwiKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRjYW5ub3RSZXR1cm5Pd24oKSB7XG4gICAgICByZXR1cm4gbmV3IFR5cGVFcnJvcignQSBwcm9taXNlcyBjYWxsYmFjayBjYW5ub3QgcmV0dXJuIHRoYXQgc2FtZSBwcm9taXNlLicpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGdldFRoZW4ocHJvbWlzZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIHByb21pc2UudGhlbjtcbiAgICAgIH0gY2F0Y2goZXJyb3IpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkR0VUX1RIRU5fRVJST1IuZXJyb3IgPSBlcnJvcjtcbiAgICAgICAgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEdFVF9USEVOX0VSUk9SO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHRyeVRoZW4odGhlbiwgdmFsdWUsIGZ1bGZpbGxtZW50SGFuZGxlciwgcmVqZWN0aW9uSGFuZGxlcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdGhlbi5jYWxsKHZhbHVlLCBmdWxmaWxsbWVudEhhbmRsZXIsIHJlamVjdGlvbkhhbmRsZXIpO1xuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIHJldHVybiBlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZUZvcmVpZ25UaGVuYWJsZShwcm9taXNlLCB0aGVuYWJsZSwgdGhlbikge1xuICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGZ1bmN0aW9uKHByb21pc2UpIHtcbiAgICAgICAgdmFyIHNlYWxlZCA9IGZhbHNlO1xuICAgICAgICB2YXIgZXJyb3IgPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCR0cnlUaGVuKHRoZW4sIHRoZW5hYmxlLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgIGlmIChzZWFsZWQpIHsgcmV0dXJuOyB9XG4gICAgICAgICAgc2VhbGVkID0gdHJ1ZTtcbiAgICAgICAgICBpZiAodGhlbmFibGUgIT09IHZhbHVlKSB7XG4gICAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgICBpZiAoc2VhbGVkKSB7IHJldHVybjsgfVxuICAgICAgICAgIHNlYWxlZCA9IHRydWU7XG5cbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICAgICAgfSwgJ1NldHRsZTogJyArIChwcm9taXNlLl9sYWJlbCB8fCAnIHVua25vd24gcHJvbWlzZScpKTtcblxuICAgICAgICBpZiAoIXNlYWxlZCAmJiBlcnJvcikge1xuICAgICAgICAgIHNlYWxlZCA9IHRydWU7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfSwgcHJvbWlzZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlT3duVGhlbmFibGUocHJvbWlzZSwgdGhlbmFibGUpIHtcbiAgICAgIGlmICh0aGVuYWJsZS5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHRoZW5hYmxlLl9yZXN1bHQpO1xuICAgICAgfSBlbHNlIGlmICh0aGVuYWJsZS5fc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCB0aGVuYWJsZS5fcmVzdWx0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZSh0aGVuYWJsZSwgdW5kZWZpbmVkLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaGFuZGxlTWF5YmVUaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlLCB0aGVuKSB7XG4gICAgICBpZiAobWF5YmVUaGVuYWJsZS5jb25zdHJ1Y3RvciA9PT0gcHJvbWlzZS5jb25zdHJ1Y3RvciAmJlxuICAgICAgICAgIHRoZW4gPT09IGxpYiRlczYkcHJvbWlzZSR0aGVuJCRkZWZhdWx0ICYmXG4gICAgICAgICAgY29uc3RydWN0b3IucmVzb2x2ZSA9PT0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVzb2x2ZSQkZGVmYXVsdCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVPd25UaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICh0aGVuID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUikge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRHRVRfVEhFTl9FUlJPUi5lcnJvcik7XG4gICAgICAgIH0gZWxzZSBpZiAodGhlbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzRnVuY3Rpb24odGhlbikpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRoYW5kbGVGb3JlaWduVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSwgdGhlbik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpIHtcbiAgICAgIGlmIChwcm9taXNlID09PSB2YWx1ZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkc2VsZkZ1bGZpbGxtZW50KCkpO1xuICAgICAgfSBlbHNlIGlmIChsaWIkZXM2JHByb21pc2UkdXRpbHMkJG9iamVjdE9yRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgdmFsdWUsIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGdldFRoZW4odmFsdWUpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2hSZWplY3Rpb24ocHJvbWlzZSkge1xuICAgICAgaWYgKHByb21pc2UuX29uZXJyb3IpIHtcbiAgICAgICAgcHJvbWlzZS5fb25lcnJvcihwcm9taXNlLl9yZXN1bHQpO1xuICAgICAgfVxuXG4gICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoKHByb21pc2UpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpIHtcbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykgeyByZXR1cm47IH1cblxuICAgICAgcHJvbWlzZS5fcmVzdWx0ID0gdmFsdWU7XG4gICAgICBwcm9taXNlLl9zdGF0ZSA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRDtcblxuICAgICAgaWYgKHByb21pc2UuX3N1YnNjcmliZXJzLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoLCBwcm9taXNlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKSB7XG4gICAgICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBFTkRJTkcpIHsgcmV0dXJuOyB9XG4gICAgICBwcm9taXNlLl9zdGF0ZSA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEO1xuICAgICAgcHJvbWlzZS5fcmVzdWx0ID0gcmVhc29uO1xuXG4gICAgICBsaWIkZXM2JHByb21pc2UkYXNhcCQkYXNhcChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRwdWJsaXNoUmVqZWN0aW9uLCBwcm9taXNlKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRzdWJzY3JpYmUocGFyZW50LCBjaGlsZCwgb25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pIHtcbiAgICAgIHZhciBzdWJzY3JpYmVycyA9IHBhcmVudC5fc3Vic2NyaWJlcnM7XG4gICAgICB2YXIgbGVuZ3RoID0gc3Vic2NyaWJlcnMubGVuZ3RoO1xuXG4gICAgICBwYXJlbnQuX29uZXJyb3IgPSBudWxsO1xuXG4gICAgICBzdWJzY3JpYmVyc1tsZW5ndGhdID0gY2hpbGQ7XG4gICAgICBzdWJzY3JpYmVyc1tsZW5ndGggKyBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRURdID0gb25GdWxmaWxsbWVudDtcbiAgICAgIHN1YnNjcmliZXJzW2xlbmd0aCArIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEXSAgPSBvblJlamVjdGlvbjtcblxuICAgICAgaWYgKGxlbmd0aCA9PT0gMCAmJiBwYXJlbnQuX3N0YXRlKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSRhc2FwJCRhc2FwKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHB1Ymxpc2gsIHBhcmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcHVibGlzaChwcm9taXNlKSB7XG4gICAgICB2YXIgc3Vic2NyaWJlcnMgPSBwcm9taXNlLl9zdWJzY3JpYmVycztcbiAgICAgIHZhciBzZXR0bGVkID0gcHJvbWlzZS5fc3RhdGU7XG5cbiAgICAgIGlmIChzdWJzY3JpYmVycy5sZW5ndGggPT09IDApIHsgcmV0dXJuOyB9XG5cbiAgICAgIHZhciBjaGlsZCwgY2FsbGJhY2ssIGRldGFpbCA9IHByb21pc2UuX3Jlc3VsdDtcblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdWJzY3JpYmVycy5sZW5ndGg7IGkgKz0gMykge1xuICAgICAgICBjaGlsZCA9IHN1YnNjcmliZXJzW2ldO1xuICAgICAgICBjYWxsYmFjayA9IHN1YnNjcmliZXJzW2kgKyBzZXR0bGVkXTtcblxuICAgICAgICBpZiAoY2hpbGQpIHtcbiAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbnZva2VDYWxsYmFjayhzZXR0bGVkLCBjaGlsZCwgY2FsbGJhY2ssIGRldGFpbCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2FsbGJhY2soZGV0YWlsKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBwcm9taXNlLl9zdWJzY3JpYmVycy5sZW5ndGggPSAwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEVycm9yT2JqZWN0KCkge1xuICAgICAgdGhpcy5lcnJvciA9IG51bGw7XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFRSWV9DQVRDSF9FUlJPUiA9IG5ldyBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRFcnJvck9iamVjdCgpO1xuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkdHJ5Q2F0Y2goY2FsbGJhY2ssIGRldGFpbCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGRldGFpbCk7XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SLmVycm9yID0gZTtcbiAgICAgICAgcmV0dXJuIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFRSWV9DQVRDSF9FUlJPUjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbnZva2VDYWxsYmFjayhzZXR0bGVkLCBwcm9taXNlLCBjYWxsYmFjaywgZGV0YWlsKSB7XG4gICAgICB2YXIgaGFzQ2FsbGJhY2sgPSBsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzRnVuY3Rpb24oY2FsbGJhY2spLFxuICAgICAgICAgIHZhbHVlLCBlcnJvciwgc3VjY2VlZGVkLCBmYWlsZWQ7XG5cbiAgICAgIGlmIChoYXNDYWxsYmFjaykge1xuICAgICAgICB2YWx1ZSA9IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHRyeUNhdGNoKGNhbGxiYWNrLCBkZXRhaWwpO1xuXG4gICAgICAgIGlmICh2YWx1ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkVFJZX0NBVENIX0VSUk9SKSB7XG4gICAgICAgICAgZmFpbGVkID0gdHJ1ZTtcbiAgICAgICAgICBlcnJvciA9IHZhbHVlLmVycm9yO1xuICAgICAgICAgIHZhbHVlID0gbnVsbDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdWNjZWVkZWQgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb21pc2UgPT09IHZhbHVlKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGNhbm5vdFJldHVybk93bigpKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWUgPSBkZXRhaWw7XG4gICAgICAgIHN1Y2NlZWRlZCA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykge1xuICAgICAgICAvLyBub29wXG4gICAgICB9IGVsc2UgaWYgKGhhc0NhbGxiYWNrICYmIHN1Y2NlZWRlZCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH0gZWxzZSBpZiAoZmFpbGVkKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCBlcnJvcik7XG4gICAgICB9IGVsc2UgaWYgKHNldHRsZWQgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJEZVTEZJTExFRCkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH0gZWxzZSBpZiAoc2V0dGxlZCA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQpIHtcbiAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRpbml0aWFsaXplUHJvbWlzZShwcm9taXNlLCByZXNvbHZlcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmVzb2x2ZXIoZnVuY3Rpb24gcmVzb2x2ZVByb21pc2UodmFsdWUpe1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgICB9LCBmdW5jdGlvbiByZWplY3RQcm9taXNlKHJlYXNvbikge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGlkID0gMDtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRuZXh0SWQoKSB7XG4gICAgICByZXR1cm4gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaWQrKztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRtYWtlUHJvbWlzZShwcm9taXNlKSB7XG4gICAgICBwcm9taXNlW2xpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBST01JU0VfSURdID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaWQrKztcbiAgICAgIHByb21pc2UuX3N0YXRlID0gdW5kZWZpbmVkO1xuICAgICAgcHJvbWlzZS5fcmVzdWx0ID0gdW5kZWZpbmVkO1xuICAgICAgcHJvbWlzZS5fc3Vic2NyaWJlcnMgPSBbXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRhbGwkJGFsbChlbnRyaWVzKSB7XG4gICAgICByZXR1cm4gbmV3IGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRkZWZhdWx0KHRoaXMsIGVudHJpZXMpLnByb21pc2U7XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRhbGwkJGRlZmF1bHQgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRhbGwkJGFsbDtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyYWNlJCRyYWNlKGVudHJpZXMpIHtcbiAgICAgIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gICAgICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuXG4gICAgICBpZiAoIWxpYiRlczYkcHJvbWlzZSR1dGlscyQkaXNBcnJheShlbnRyaWVzKSkge1xuICAgICAgICByZXR1cm4gbmV3IENvbnN0cnVjdG9yKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAgIHJlamVjdChuZXcgVHlwZUVycm9yKCdZb3UgbXVzdCBwYXNzIGFuIGFycmF5IHRvIHJhY2UuJykpO1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgQ29uc3RydWN0b3IoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgdmFyIGxlbmd0aCA9IGVudHJpZXMubGVuZ3RoO1xuICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIENvbnN0cnVjdG9yLnJlc29sdmUoZW50cmllc1tpXSkudGhlbihyZXNvbHZlLCByZWplY3QpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyYWNlJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmFjZSQkcmFjZTtcbiAgICBmdW5jdGlvbiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZWplY3QkJHJlamVjdChyZWFzb24pIHtcbiAgICAgIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gICAgICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuICAgICAgdmFyIHByb21pc2UgPSBuZXcgQ29uc3RydWN0b3IobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCk7XG4gICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRyZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICAgIHJldHVybiBwcm9taXNlO1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVqZWN0JCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkcmVqZWN0JCRyZWplY3Q7XG5cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc1Jlc29sdmVyKCkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignWW91IG11c3QgcGFzcyBhIHJlc29sdmVyIGZ1bmN0aW9uIGFzIHRoZSBmaXJzdCBhcmd1bWVudCB0byB0aGUgcHJvbWlzZSBjb25zdHJ1Y3RvcicpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRuZWVkc05ldygpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJGYWlsZWQgdG8gY29uc3RydWN0ICdQcm9taXNlJzogUGxlYXNlIHVzZSB0aGUgJ25ldycgb3BlcmF0b3IsIHRoaXMgb2JqZWN0IGNvbnN0cnVjdG9yIGNhbm5vdCBiZSBjYWxsZWQgYXMgYSBmdW5jdGlvbi5cIik7XG4gICAgfVxuXG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2U7XG4gICAgLyoqXG4gICAgICBQcm9taXNlIG9iamVjdHMgcmVwcmVzZW50IHRoZSBldmVudHVhbCByZXN1bHQgb2YgYW4gYXN5bmNocm9ub3VzIG9wZXJhdGlvbi4gVGhlXG4gICAgICBwcmltYXJ5IHdheSBvZiBpbnRlcmFjdGluZyB3aXRoIGEgcHJvbWlzZSBpcyB0aHJvdWdoIGl0cyBgdGhlbmAgbWV0aG9kLCB3aGljaFxuICAgICAgcmVnaXN0ZXJzIGNhbGxiYWNrcyB0byByZWNlaXZlIGVpdGhlciBhIHByb21pc2UncyBldmVudHVhbCB2YWx1ZSBvciB0aGUgcmVhc29uXG4gICAgICB3aHkgdGhlIHByb21pc2UgY2Fubm90IGJlIGZ1bGZpbGxlZC5cblxuICAgICAgVGVybWlub2xvZ3lcbiAgICAgIC0tLS0tLS0tLS0tXG5cbiAgICAgIC0gYHByb21pc2VgIGlzIGFuIG9iamVjdCBvciBmdW5jdGlvbiB3aXRoIGEgYHRoZW5gIG1ldGhvZCB3aG9zZSBiZWhhdmlvciBjb25mb3JtcyB0byB0aGlzIHNwZWNpZmljYXRpb24uXG4gICAgICAtIGB0aGVuYWJsZWAgaXMgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uIHRoYXQgZGVmaW5lcyBhIGB0aGVuYCBtZXRob2QuXG4gICAgICAtIGB2YWx1ZWAgaXMgYW55IGxlZ2FsIEphdmFTY3JpcHQgdmFsdWUgKGluY2x1ZGluZyB1bmRlZmluZWQsIGEgdGhlbmFibGUsIG9yIGEgcHJvbWlzZSkuXG4gICAgICAtIGBleGNlcHRpb25gIGlzIGEgdmFsdWUgdGhhdCBpcyB0aHJvd24gdXNpbmcgdGhlIHRocm93IHN0YXRlbWVudC5cbiAgICAgIC0gYHJlYXNvbmAgaXMgYSB2YWx1ZSB0aGF0IGluZGljYXRlcyB3aHkgYSBwcm9taXNlIHdhcyByZWplY3RlZC5cbiAgICAgIC0gYHNldHRsZWRgIHRoZSBmaW5hbCByZXN0aW5nIHN0YXRlIG9mIGEgcHJvbWlzZSwgZnVsZmlsbGVkIG9yIHJlamVjdGVkLlxuXG4gICAgICBBIHByb21pc2UgY2FuIGJlIGluIG9uZSBvZiB0aHJlZSBzdGF0ZXM6IHBlbmRpbmcsIGZ1bGZpbGxlZCwgb3IgcmVqZWN0ZWQuXG5cbiAgICAgIFByb21pc2VzIHRoYXQgYXJlIGZ1bGZpbGxlZCBoYXZlIGEgZnVsZmlsbG1lbnQgdmFsdWUgYW5kIGFyZSBpbiB0aGUgZnVsZmlsbGVkXG4gICAgICBzdGF0ZS4gIFByb21pc2VzIHRoYXQgYXJlIHJlamVjdGVkIGhhdmUgYSByZWplY3Rpb24gcmVhc29uIGFuZCBhcmUgaW4gdGhlXG4gICAgICByZWplY3RlZCBzdGF0ZS4gIEEgZnVsZmlsbG1lbnQgdmFsdWUgaXMgbmV2ZXIgYSB0aGVuYWJsZS5cblxuICAgICAgUHJvbWlzZXMgY2FuIGFsc28gYmUgc2FpZCB0byAqcmVzb2x2ZSogYSB2YWx1ZS4gIElmIHRoaXMgdmFsdWUgaXMgYWxzbyBhXG4gICAgICBwcm9taXNlLCB0aGVuIHRoZSBvcmlnaW5hbCBwcm9taXNlJ3Mgc2V0dGxlZCBzdGF0ZSB3aWxsIG1hdGNoIHRoZSB2YWx1ZSdzXG4gICAgICBzZXR0bGVkIHN0YXRlLiAgU28gYSBwcm9taXNlIHRoYXQgKnJlc29sdmVzKiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpbGxcbiAgICAgIGl0c2VsZiByZWplY3QsIGFuZCBhIHByb21pc2UgdGhhdCAqcmVzb2x2ZXMqIGEgcHJvbWlzZSB0aGF0IGZ1bGZpbGxzIHdpbGxcbiAgICAgIGl0c2VsZiBmdWxmaWxsLlxuXG5cbiAgICAgIEJhc2ljIFVzYWdlOlxuICAgICAgLS0tLS0tLS0tLS0tXG5cbiAgICAgIGBgYGpzXG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAvLyBvbiBzdWNjZXNzXG4gICAgICAgIHJlc29sdmUodmFsdWUpO1xuXG4gICAgICAgIC8vIG9uIGZhaWx1cmVcbiAgICAgICAgcmVqZWN0KHJlYXNvbik7XG4gICAgICB9KTtcblxuICAgICAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIC8vIG9uIGZ1bGZpbGxtZW50XG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgLy8gb24gcmVqZWN0aW9uXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBBZHZhbmNlZCBVc2FnZTpcbiAgICAgIC0tLS0tLS0tLS0tLS0tLVxuXG4gICAgICBQcm9taXNlcyBzaGluZSB3aGVuIGFic3RyYWN0aW5nIGF3YXkgYXN5bmNocm9ub3VzIGludGVyYWN0aW9ucyBzdWNoIGFzXG4gICAgICBgWE1MSHR0cFJlcXVlc3Rgcy5cblxuICAgICAgYGBganNcbiAgICAgIGZ1bmN0aW9uIGdldEpTT04odXJsKSB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgICAgICAgIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblxuICAgICAgICAgIHhoci5vcGVuKCdHRVQnLCB1cmwpO1xuICAgICAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBoYW5kbGVyO1xuICAgICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSAnanNvbic7XG4gICAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoJ0FjY2VwdCcsICdhcHBsaWNhdGlvbi9qc29uJyk7XG4gICAgICAgICAgeGhyLnNlbmQoKTtcblxuICAgICAgICAgIGZ1bmN0aW9uIGhhbmRsZXIoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5yZWFkeVN0YXRlID09PSB0aGlzLkRPTkUpIHtcbiAgICAgICAgICAgICAgaWYgKHRoaXMuc3RhdHVzID09PSAyMDApIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlKHRoaXMucmVzcG9uc2UpO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ2dldEpTT046IGAnICsgdXJsICsgJ2AgZmFpbGVkIHdpdGggc3RhdHVzOiBbJyArIHRoaXMuc3RhdHVzICsgJ10nKSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgZ2V0SlNPTignL3Bvc3RzLmpzb24nKS50aGVuKGZ1bmN0aW9uKGpzb24pIHtcbiAgICAgICAgLy8gb24gZnVsZmlsbG1lbnRcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAvLyBvbiByZWplY3Rpb25cbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIFVubGlrZSBjYWxsYmFja3MsIHByb21pc2VzIGFyZSBncmVhdCBjb21wb3NhYmxlIHByaW1pdGl2ZXMuXG5cbiAgICAgIGBgYGpzXG4gICAgICBQcm9taXNlLmFsbChbXG4gICAgICAgIGdldEpTT04oJy9wb3N0cycpLFxuICAgICAgICBnZXRKU09OKCcvY29tbWVudHMnKVxuICAgICAgXSkudGhlbihmdW5jdGlvbih2YWx1ZXMpe1xuICAgICAgICB2YWx1ZXNbMF0gLy8gPT4gcG9zdHNKU09OXG4gICAgICAgIHZhbHVlc1sxXSAvLyA9PiBjb21tZW50c0pTT05cblxuICAgICAgICByZXR1cm4gdmFsdWVzO1xuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQGNsYXNzIFByb21pc2VcbiAgICAgIEBwYXJhbSB7ZnVuY3Rpb259IHJlc29sdmVyXG4gICAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgICBAY29uc3RydWN0b3JcbiAgICAqL1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlKHJlc29sdmVyKSB7XG4gICAgICB0aGlzW2xpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBST01JU0VfSURdID0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbmV4dElkKCk7XG4gICAgICB0aGlzLl9yZXN1bHQgPSB0aGlzLl9zdGF0ZSA9IHVuZGVmaW5lZDtcbiAgICAgIHRoaXMuX3N1YnNjcmliZXJzID0gW107XG5cbiAgICAgIGlmIChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRub29wICE9PSByZXNvbHZlcikge1xuICAgICAgICB0eXBlb2YgcmVzb2x2ZXIgIT09ICdmdW5jdGlvbicgJiYgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJG5lZWRzUmVzb2x2ZXIoKTtcbiAgICAgICAgdGhpcyBpbnN0YW5jZW9mIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlID8gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkaW5pdGlhbGl6ZVByb21pc2UodGhpcywgcmVzb2x2ZXIpIDogbGliJGVzNiRwcm9taXNlJHByb21pc2UkJG5lZWRzTmV3KCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UuYWxsID0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkYWxsJCRkZWZhdWx0O1xuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLnJhY2UgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyYWNlJCRkZWZhdWx0O1xuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLnJlc29sdmUgPSBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSRyZXNvbHZlJCRkZWZhdWx0O1xuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLnJlamVjdCA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlamVjdCQkZGVmYXVsdDtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5fc2V0U2NoZWR1bGVyID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJHNldFNjaGVkdWxlcjtcbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5fc2V0QXNhcCA9IGxpYiRlczYkcHJvbWlzZSRhc2FwJCRzZXRBc2FwO1xuICAgIGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRQcm9taXNlLl9hc2FwID0gbGliJGVzNiRwcm9taXNlJGFzYXAkJGFzYXA7XG5cbiAgICBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkUHJvbWlzZS5wcm90b3R5cGUgPSB7XG4gICAgICBjb25zdHJ1Y3RvcjogbGliJGVzNiRwcm9taXNlJHByb21pc2UkJFByb21pc2UsXG5cbiAgICAvKipcbiAgICAgIFRoZSBwcmltYXJ5IHdheSBvZiBpbnRlcmFjdGluZyB3aXRoIGEgcHJvbWlzZSBpcyB0aHJvdWdoIGl0cyBgdGhlbmAgbWV0aG9kLFxuICAgICAgd2hpY2ggcmVnaXN0ZXJzIGNhbGxiYWNrcyB0byByZWNlaXZlIGVpdGhlciBhIHByb21pc2UncyBldmVudHVhbCB2YWx1ZSBvciB0aGVcbiAgICAgIHJlYXNvbiB3aHkgdGhlIHByb21pc2UgY2Fubm90IGJlIGZ1bGZpbGxlZC5cblxuICAgICAgYGBganNcbiAgICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbih1c2VyKXtcbiAgICAgICAgLy8gdXNlciBpcyBhdmFpbGFibGVcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAgIC8vIHVzZXIgaXMgdW5hdmFpbGFibGUsIGFuZCB5b3UgYXJlIGdpdmVuIHRoZSByZWFzb24gd2h5XG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBDaGFpbmluZ1xuICAgICAgLS0tLS0tLS1cblxuICAgICAgVGhlIHJldHVybiB2YWx1ZSBvZiBgdGhlbmAgaXMgaXRzZWxmIGEgcHJvbWlzZS4gIFRoaXMgc2Vjb25kLCAnZG93bnN0cmVhbSdcbiAgICAgIHByb21pc2UgaXMgcmVzb2x2ZWQgd2l0aCB0aGUgcmV0dXJuIHZhbHVlIG9mIHRoZSBmaXJzdCBwcm9taXNlJ3MgZnVsZmlsbG1lbnRcbiAgICAgIG9yIHJlamVjdGlvbiBoYW5kbGVyLCBvciByZWplY3RlZCBpZiB0aGUgaGFuZGxlciB0aHJvd3MgYW4gZXhjZXB0aW9uLlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHJldHVybiB1c2VyLm5hbWU7XG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIHJldHVybiAnZGVmYXVsdCBuYW1lJztcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHVzZXJOYW1lKSB7XG4gICAgICAgIC8vIElmIGBmaW5kVXNlcmAgZnVsZmlsbGVkLCBgdXNlck5hbWVgIHdpbGwgYmUgdGhlIHVzZXIncyBuYW1lLCBvdGhlcndpc2UgaXRcbiAgICAgICAgLy8gd2lsbCBiZSBgJ2RlZmF1bHQgbmFtZSdgXG4gICAgICB9KTtcblxuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRm91bmQgdXNlciwgYnV0IHN0aWxsIHVuaGFwcHknKTtcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdgZmluZFVzZXJgIHJlamVjdGVkIGFuZCB3ZSdyZSB1bmhhcHB5Jyk7XG4gICAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIC8vIGlmIGBmaW5kVXNlcmAgZnVsZmlsbGVkLCBgcmVhc29uYCB3aWxsIGJlICdGb3VuZCB1c2VyLCBidXQgc3RpbGwgdW5oYXBweScuXG4gICAgICAgIC8vIElmIGBmaW5kVXNlcmAgcmVqZWN0ZWQsIGByZWFzb25gIHdpbGwgYmUgJ2BmaW5kVXNlcmAgcmVqZWN0ZWQgYW5kIHdlJ3JlIHVuaGFwcHknLlxuICAgICAgfSk7XG4gICAgICBgYGBcbiAgICAgIElmIHRoZSBkb3duc3RyZWFtIHByb21pc2UgZG9lcyBub3Qgc3BlY2lmeSBhIHJlamVjdGlvbiBoYW5kbGVyLCByZWplY3Rpb24gcmVhc29ucyB3aWxsIGJlIHByb3BhZ2F0ZWQgZnVydGhlciBkb3duc3RyZWFtLlxuXG4gICAgICBgYGBqc1xuICAgICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICAgIHRocm93IG5ldyBQZWRhZ29naWNhbEV4Y2VwdGlvbignVXBzdHJlYW0gZXJyb3InKTtcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIC8vIG5ldmVyIHJlYWNoZWRcbiAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIC8vIG5ldmVyIHJlYWNoZWRcbiAgICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgICAgLy8gVGhlIGBQZWRnYWdvY2lhbEV4Y2VwdGlvbmAgaXMgcHJvcGFnYXRlZCBhbGwgdGhlIHdheSBkb3duIHRvIGhlcmVcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEFzc2ltaWxhdGlvblxuICAgICAgLS0tLS0tLS0tLS0tXG5cbiAgICAgIFNvbWV0aW1lcyB0aGUgdmFsdWUgeW91IHdhbnQgdG8gcHJvcGFnYXRlIHRvIGEgZG93bnN0cmVhbSBwcm9taXNlIGNhbiBvbmx5IGJlXG4gICAgICByZXRyaWV2ZWQgYXN5bmNocm9ub3VzbHkuIFRoaXMgY2FuIGJlIGFjaGlldmVkIGJ5IHJldHVybmluZyBhIHByb21pc2UgaW4gdGhlXG4gICAgICBmdWxmaWxsbWVudCBvciByZWplY3Rpb24gaGFuZGxlci4gVGhlIGRvd25zdHJlYW0gcHJvbWlzZSB3aWxsIHRoZW4gYmUgcGVuZGluZ1xuICAgICAgdW50aWwgdGhlIHJldHVybmVkIHByb21pc2UgaXMgc2V0dGxlZC4gVGhpcyBpcyBjYWxsZWQgKmFzc2ltaWxhdGlvbiouXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgcmV0dXJuIGZpbmRDb21tZW50c0J5QXV0aG9yKHVzZXIpO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAoY29tbWVudHMpIHtcbiAgICAgICAgLy8gVGhlIHVzZXIncyBjb21tZW50cyBhcmUgbm93IGF2YWlsYWJsZVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgSWYgdGhlIGFzc2ltbGlhdGVkIHByb21pc2UgcmVqZWN0cywgdGhlbiB0aGUgZG93bnN0cmVhbSBwcm9taXNlIHdpbGwgYWxzbyByZWplY3QuXG5cbiAgICAgIGBgYGpzXG4gICAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgICAgcmV0dXJuIGZpbmRDb21tZW50c0J5QXV0aG9yKHVzZXIpO1xuICAgICAgfSkudGhlbihmdW5jdGlvbiAoY29tbWVudHMpIHtcbiAgICAgICAgLy8gSWYgYGZpbmRDb21tZW50c0J5QXV0aG9yYCBmdWxmaWxscywgd2UnbGwgaGF2ZSB0aGUgdmFsdWUgaGVyZVxuICAgICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICAvLyBJZiBgZmluZENvbW1lbnRzQnlBdXRob3JgIHJlamVjdHMsIHdlJ2xsIGhhdmUgdGhlIHJlYXNvbiBoZXJlXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBTaW1wbGUgRXhhbXBsZVxuICAgICAgLS0tLS0tLS0tLS0tLS1cblxuICAgICAgU3luY2hyb25vdXMgRXhhbXBsZVxuXG4gICAgICBgYGBqYXZhc2NyaXB0XG4gICAgICB2YXIgcmVzdWx0O1xuXG4gICAgICB0cnkge1xuICAgICAgICByZXN1bHQgPSBmaW5kUmVzdWx0KCk7XG4gICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAgIC8vIGZhaWx1cmVcbiAgICAgIH1cbiAgICAgIGBgYFxuXG4gICAgICBFcnJiYWNrIEV4YW1wbGVcblxuICAgICAgYGBganNcbiAgICAgIGZpbmRSZXN1bHQoZnVuY3Rpb24ocmVzdWx0LCBlcnIpe1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgUHJvbWlzZSBFeGFtcGxlO1xuXG4gICAgICBgYGBqYXZhc2NyaXB0XG4gICAgICBmaW5kUmVzdWx0KCkudGhlbihmdW5jdGlvbihyZXN1bHQpe1xuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9KTtcbiAgICAgIGBgYFxuXG4gICAgICBBZHZhbmNlZCBFeGFtcGxlXG4gICAgICAtLS0tLS0tLS0tLS0tLVxuXG4gICAgICBTeW5jaHJvbm91cyBFeGFtcGxlXG5cbiAgICAgIGBgYGphdmFzY3JpcHRcbiAgICAgIHZhciBhdXRob3IsIGJvb2tzO1xuXG4gICAgICB0cnkge1xuICAgICAgICBhdXRob3IgPSBmaW5kQXV0aG9yKCk7XG4gICAgICAgIGJvb2tzICA9IGZpbmRCb29rc0J5QXV0aG9yKGF1dGhvcik7XG4gICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAgIC8vIGZhaWx1cmVcbiAgICAgIH1cbiAgICAgIGBgYFxuXG4gICAgICBFcnJiYWNrIEV4YW1wbGVcblxuICAgICAgYGBganNcblxuICAgICAgZnVuY3Rpb24gZm91bmRCb29rcyhib29rcykge1xuXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGZhaWx1cmUocmVhc29uKSB7XG5cbiAgICAgIH1cblxuICAgICAgZmluZEF1dGhvcihmdW5jdGlvbihhdXRob3IsIGVycil7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICBmYWlsdXJlKGVycik7XG4gICAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBmaW5kQm9vb2tzQnlBdXRob3IoYXV0aG9yLCBmdW5jdGlvbihib29rcywgZXJyKSB7XG4gICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBmYWlsdXJlKGVycik7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgIGZvdW5kQm9va3MoYm9va3MpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAgICAgICAgICAgICBmYWlsdXJlKHJlYXNvbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGNhdGNoKGVycm9yKSB7XG4gICAgICAgICAgICBmYWlsdXJlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgUHJvbWlzZSBFeGFtcGxlO1xuXG4gICAgICBgYGBqYXZhc2NyaXB0XG4gICAgICBmaW5kQXV0aG9yKCkuXG4gICAgICAgIHRoZW4oZmluZEJvb2tzQnlBdXRob3IpLlxuICAgICAgICB0aGVuKGZ1bmN0aW9uKGJvb2tzKXtcbiAgICAgICAgICAvLyBmb3VuZCBib29rc1xuICAgICAgfSkuY2F0Y2goZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgICAgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmdcbiAgICAgIH0pO1xuICAgICAgYGBgXG5cbiAgICAgIEBtZXRob2QgdGhlblxuICAgICAgQHBhcmFtIHtGdW5jdGlvbn0gb25GdWxmaWxsZWRcbiAgICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVqZWN0ZWRcbiAgICAgIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgICAgIEByZXR1cm4ge1Byb21pc2V9XG4gICAgKi9cbiAgICAgIHRoZW46IGxpYiRlczYkcHJvbWlzZSR0aGVuJCRkZWZhdWx0LFxuXG4gICAgLyoqXG4gICAgICBgY2F0Y2hgIGlzIHNpbXBseSBzdWdhciBmb3IgYHRoZW4odW5kZWZpbmVkLCBvblJlamVjdGlvbilgIHdoaWNoIG1ha2VzIGl0IHRoZSBzYW1lXG4gICAgICBhcyB0aGUgY2F0Y2ggYmxvY2sgb2YgYSB0cnkvY2F0Y2ggc3RhdGVtZW50LlxuXG4gICAgICBgYGBqc1xuICAgICAgZnVuY3Rpb24gZmluZEF1dGhvcigpe1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NvdWxkbid0IGZpbmQgdGhhdCBhdXRob3InKTtcbiAgICAgIH1cblxuICAgICAgLy8gc3luY2hyb25vdXNcbiAgICAgIHRyeSB7XG4gICAgICAgIGZpbmRBdXRob3IoKTtcbiAgICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgICB9XG5cbiAgICAgIC8vIGFzeW5jIHdpdGggcHJvbWlzZXNcbiAgICAgIGZpbmRBdXRob3IoKS5jYXRjaChmdW5jdGlvbihyZWFzb24pe1xuICAgICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgICAgfSk7XG4gICAgICBgYGBcblxuICAgICAgQG1ldGhvZCBjYXRjaFxuICAgICAgQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3Rpb25cbiAgICAgIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgICAgIEByZXR1cm4ge1Byb21pc2V9XG4gICAgKi9cbiAgICAgICdjYXRjaCc6IGZ1bmN0aW9uKG9uUmVqZWN0aW9uKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRoZW4obnVsbCwgb25SZWplY3Rpb24pO1xuICAgICAgfVxuICAgIH07XG4gICAgdmFyIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3I7XG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IoQ29uc3RydWN0b3IsIGlucHV0KSB7XG4gICAgICB0aGlzLl9pbnN0YW5jZUNvbnN0cnVjdG9yID0gQ29uc3RydWN0b3I7XG4gICAgICB0aGlzLnByb21pc2UgPSBuZXcgQ29uc3RydWN0b3IobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkbm9vcCk7XG5cbiAgICAgIGlmICghdGhpcy5wcm9taXNlW2xpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFBST01JU0VfSURdKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG1ha2VQcm9taXNlKHRoaXMucHJvbWlzZSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChsaWIkZXM2JHByb21pc2UkdXRpbHMkJGlzQXJyYXkoaW5wdXQpKSB7XG4gICAgICAgIHRoaXMuX2lucHV0ICAgICA9IGlucHV0O1xuICAgICAgICB0aGlzLmxlbmd0aCAgICAgPSBpbnB1dC5sZW5ndGg7XG4gICAgICAgIHRoaXMuX3JlbWFpbmluZyA9IGlucHV0Lmxlbmd0aDtcblxuICAgICAgICB0aGlzLl9yZXN1bHQgPSBuZXcgQXJyYXkodGhpcy5sZW5ndGgpO1xuXG4gICAgICAgIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwodGhpcy5wcm9taXNlLCB0aGlzLl9yZXN1bHQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMubGVuZ3RoID0gdGhpcy5sZW5ndGggfHwgMDtcbiAgICAgICAgICB0aGlzLl9lbnVtZXJhdGUoKTtcbiAgICAgICAgICBpZiAodGhpcy5fcmVtYWluaW5nID09PSAwKSB7XG4gICAgICAgICAgICBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRmdWxmaWxsKHRoaXMucHJvbWlzZSwgdGhpcy5fcmVzdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHJlamVjdCh0aGlzLnByb21pc2UsIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCR2YWxpZGF0aW9uRXJyb3IoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJHZhbGlkYXRpb25FcnJvcigpIHtcbiAgICAgIHJldHVybiBuZXcgRXJyb3IoJ0FycmF5IE1ldGhvZHMgbXVzdCBiZSBwcm92aWRlZCBhbiBBcnJheScpO1xuICAgIH1cblxuICAgIGxpYiRlczYkcHJvbWlzZSRlbnVtZXJhdG9yJCRFbnVtZXJhdG9yLnByb3RvdHlwZS5fZW51bWVyYXRlID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgbGVuZ3RoICA9IHRoaXMubGVuZ3RoO1xuICAgICAgdmFyIGlucHV0ICAgPSB0aGlzLl9pbnB1dDtcblxuICAgICAgZm9yICh2YXIgaSA9IDA7IHRoaXMuX3N0YXRlID09PSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRQRU5ESU5HICYmIGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICB0aGlzLl9lYWNoRW50cnkoaW5wdXRbaV0sIGkpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX2VhY2hFbnRyeSA9IGZ1bmN0aW9uKGVudHJ5LCBpKSB7XG4gICAgICB2YXIgYyA9IHRoaXMuX2luc3RhbmNlQ29uc3RydWN0b3I7XG4gICAgICB2YXIgcmVzb2x2ZSA9IGMucmVzb2x2ZTtcblxuICAgICAgaWYgKHJlc29sdmUgPT09IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJHJlc29sdmUkJGRlZmF1bHQpIHtcbiAgICAgICAgdmFyIHRoZW4gPSBsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRnZXRUaGVuKGVudHJ5KTtcblxuICAgICAgICBpZiAodGhlbiA9PT0gbGliJGVzNiRwcm9taXNlJHRoZW4kJGRlZmF1bHQgJiZcbiAgICAgICAgICAgIGVudHJ5Ll9zdGF0ZSAhPT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykge1xuICAgICAgICAgIHRoaXMuX3NldHRsZWRBdChlbnRyeS5fc3RhdGUsIGksIGVudHJ5Ll9yZXN1bHQpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB0aGVuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgdGhpcy5fcmVtYWluaW5nLS07XG4gICAgICAgICAgdGhpcy5fcmVzdWx0W2ldID0gZW50cnk7XG4gICAgICAgIH0gZWxzZSBpZiAoYyA9PT0gbGliJGVzNiRwcm9taXNlJHByb21pc2UkJGRlZmF1bHQpIHtcbiAgICAgICAgICB2YXIgcHJvbWlzZSA9IG5ldyBjKGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJG5vb3ApO1xuICAgICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgZW50cnksIHRoZW4pO1xuICAgICAgICAgIHRoaXMuX3dpbGxTZXR0bGVBdChwcm9taXNlLCBpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLl93aWxsU2V0dGxlQXQobmV3IGMoZnVuY3Rpb24ocmVzb2x2ZSkgeyByZXNvbHZlKGVudHJ5KTsgfSksIGkpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl93aWxsU2V0dGxlQXQocmVzb2x2ZShlbnRyeSksIGkpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBsaWIkZXM2JHByb21pc2UkZW51bWVyYXRvciQkRW51bWVyYXRvci5wcm90b3R5cGUuX3NldHRsZWRBdCA9IGZ1bmN0aW9uKHN0YXRlLCBpLCB2YWx1ZSkge1xuICAgICAgdmFyIHByb21pc2UgPSB0aGlzLnByb21pc2U7XG5cbiAgICAgIGlmIChwcm9taXNlLl9zdGF0ZSA9PT0gbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUEVORElORykge1xuICAgICAgICB0aGlzLl9yZW1haW5pbmctLTtcblxuICAgICAgICBpZiAoc3RhdGUgPT09IGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJFJFSkVDVEVEKSB7XG4gICAgICAgICAgbGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkcmVqZWN0KHByb21pc2UsIHZhbHVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLl9yZXN1bHRbaV0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5fcmVtYWluaW5nID09PSAwKSB7XG4gICAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJGZ1bGZpbGwocHJvbWlzZSwgdGhpcy5fcmVzdWx0KTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgbGliJGVzNiRwcm9taXNlJGVudW1lcmF0b3IkJEVudW1lcmF0b3IucHJvdG90eXBlLl93aWxsU2V0dGxlQXQgPSBmdW5jdGlvbihwcm9taXNlLCBpKSB7XG4gICAgICB2YXIgZW51bWVyYXRvciA9IHRoaXM7XG5cbiAgICAgIGxpYiRlczYkcHJvbWlzZSQkaW50ZXJuYWwkJHN1YnNjcmliZShwcm9taXNlLCB1bmRlZmluZWQsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIGVudW1lcmF0b3IuX3NldHRsZWRBdChsaWIkZXM2JHByb21pc2UkJGludGVybmFsJCRGVUxGSUxMRUQsIGksIHZhbHVlKTtcbiAgICAgIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICBlbnVtZXJhdG9yLl9zZXR0bGVkQXQobGliJGVzNiRwcm9taXNlJCRpbnRlcm5hbCQkUkVKRUNURUQsIGksIHJlYXNvbik7XG4gICAgICB9KTtcbiAgICB9O1xuICAgIGZ1bmN0aW9uIGxpYiRlczYkcHJvbWlzZSRwb2x5ZmlsbCQkcG9seWZpbGwoKSB7XG4gICAgICB2YXIgbG9jYWw7XG5cbiAgICAgIGlmICh0eXBlb2YgZ2xvYmFsICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGxvY2FsID0gZ2xvYmFsO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBsb2NhbCA9IHNlbGY7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGxvY2FsID0gRnVuY3Rpb24oJ3JldHVybiB0aGlzJykoKTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigncG9seWZpbGwgZmFpbGVkIGJlY2F1c2UgZ2xvYmFsIG9iamVjdCBpcyB1bmF2YWlsYWJsZSBpbiB0aGlzIGVudmlyb25tZW50Jyk7XG4gICAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgUCA9IGxvY2FsLlByb21pc2U7XG5cbiAgICAgIGlmIChQICYmIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChQLnJlc29sdmUoKSkgPT09ICdbb2JqZWN0IFByb21pc2VdJyAmJiAhUC5jYXN0KSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgbG9jYWwuUHJvbWlzZSA9IGxpYiRlczYkcHJvbWlzZSRwcm9taXNlJCRkZWZhdWx0O1xuICAgIH1cbiAgICB2YXIgbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRkZWZhdWx0ID0gbGliJGVzNiRwcm9taXNlJHBvbHlmaWxsJCRwb2x5ZmlsbDtcblxuICAgIHZhciBsaWIkZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlID0ge1xuICAgICAgJ1Byb21pc2UnOiBsaWIkZXM2JHByb21pc2UkcHJvbWlzZSQkZGVmYXVsdCxcbiAgICAgICdwb2x5ZmlsbCc6IGxpYiRlczYkcHJvbWlzZSRwb2x5ZmlsbCQkZGVmYXVsdFxuICAgIH07XG5cbiAgICAvKiBnbG9iYWwgZGVmaW5lOnRydWUgbW9kdWxlOnRydWUgd2luZG93OiB0cnVlICovXG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lWydhbWQnXSkge1xuICAgICAgZGVmaW5lKGZ1bmN0aW9uKCkgeyByZXR1cm4gbGliJGVzNiRwcm9taXNlJHVtZCQkRVM2UHJvbWlzZTsgfSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGVbJ2V4cG9ydHMnXSkge1xuICAgICAgbW9kdWxlWydleHBvcnRzJ10gPSBsaWIkZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHRoaXMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aGlzWydFUzZQcm9taXNlJ10gPSBsaWIkZXM2JHByb21pc2UkdW1kJCRFUzZQcm9taXNlO1xuICAgIH1cblxuICAgIGxpYiRlczYkcHJvbWlzZSRwb2x5ZmlsbCQkZGVmYXVsdCgpO1xufSkuY2FsbCh0aGlzKTtcblxuIiwiLyoqXG4gKiBsb2Rhc2ggKEN1c3RvbSBCdWlsZCkgPGh0dHBzOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2R1bGFyaXplIGV4cG9ydHM9XCJucG1cIiAtbyAuL2BcbiAqIENvcHlyaWdodCBqUXVlcnkgRm91bmRhdGlvbiBhbmQgb3RoZXIgY29udHJpYnV0b3JzIDxodHRwczovL2pxdWVyeS5vcmcvPlxuICogUmVsZWFzZWQgdW5kZXIgTUlUIGxpY2Vuc2UgPGh0dHBzOi8vbG9kYXNoLmNvbS9saWNlbnNlPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjguMyA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICovXG5cbi8qKiBVc2VkIGFzIHRoZSBgVHlwZUVycm9yYCBtZXNzYWdlIGZvciBcIkZ1bmN0aW9uc1wiIG1ldGhvZHMuICovXG52YXIgRlVOQ19FUlJPUl9URVhUID0gJ0V4cGVjdGVkIGEgZnVuY3Rpb24nO1xuXG4vKiogVXNlZCBhcyByZWZlcmVuY2VzIGZvciB2YXJpb3VzIGBOdW1iZXJgIGNvbnN0YW50cy4gKi9cbnZhciBOQU4gPSAwIC8gMDtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIHN5bWJvbFRhZyA9ICdbb2JqZWN0IFN5bWJvbF0nO1xuXG4vKiogVXNlZCB0byBtYXRjaCBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlLiAqL1xudmFyIHJlVHJpbSA9IC9eXFxzK3xcXHMrJC9nO1xuXG4vKiogVXNlZCB0byBkZXRlY3QgYmFkIHNpZ25lZCBoZXhhZGVjaW1hbCBzdHJpbmcgdmFsdWVzLiAqL1xudmFyIHJlSXNCYWRIZXggPSAvXlstK10weFswLTlhLWZdKyQvaTtcblxuLyoqIFVzZWQgdG8gZGV0ZWN0IGJpbmFyeSBzdHJpbmcgdmFsdWVzLiAqL1xudmFyIHJlSXNCaW5hcnkgPSAvXjBiWzAxXSskL2k7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBvY3RhbCBzdHJpbmcgdmFsdWVzLiAqL1xudmFyIHJlSXNPY3RhbCA9IC9eMG9bMC03XSskL2k7XG5cbi8qKiBCdWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcyB3aXRob3V0IGEgZGVwZW5kZW5jeSBvbiBgcm9vdGAuICovXG52YXIgZnJlZVBhcnNlSW50ID0gcGFyc2VJbnQ7XG5cbi8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZSBgZ2xvYmFsYCBmcm9tIE5vZGUuanMuICovXG52YXIgZnJlZUdsb2JhbCA9IHR5cGVvZiBnbG9iYWwgPT0gJ29iamVjdCcgJiYgZ2xvYmFsICYmIGdsb2JhbC5PYmplY3QgPT09IE9iamVjdCAmJiBnbG9iYWw7XG5cbi8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZSBgc2VsZmAuICovXG52YXIgZnJlZVNlbGYgPSB0eXBlb2Ygc2VsZiA9PSAnb2JqZWN0JyAmJiBzZWxmICYmIHNlbGYuT2JqZWN0ID09PSBPYmplY3QgJiYgc2VsZjtcblxuLyoqIFVzZWQgYXMgYSByZWZlcmVuY2UgdG8gdGhlIGdsb2JhbCBvYmplY3QuICovXG52YXIgcm9vdCA9IGZyZWVHbG9iYWwgfHwgZnJlZVNlbGYgfHwgRnVuY3Rpb24oJ3JldHVybiB0aGlzJykoKTtcblxuLyoqIFVzZWQgZm9yIGJ1aWx0LWluIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIG9iamVjdFByb3RvID0gT2JqZWN0LnByb3RvdHlwZTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlXG4gKiBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNy4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG9iamVjdFRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qIEJ1aWx0LWluIG1ldGhvZCByZWZlcmVuY2VzIGZvciB0aG9zZSB3aXRoIHRoZSBzYW1lIG5hbWUgYXMgb3RoZXIgYGxvZGFzaGAgbWV0aG9kcy4gKi9cbnZhciBuYXRpdmVNYXggPSBNYXRoLm1heCxcbiAgICBuYXRpdmVNaW4gPSBNYXRoLm1pbjtcblxuLyoqXG4gKiBHZXRzIHRoZSB0aW1lc3RhbXAgb2YgdGhlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgdGhhdCBoYXZlIGVsYXBzZWQgc2luY2VcbiAqIHRoZSBVbml4IGVwb2NoICgxIEphbnVhcnkgMTk3MCAwMDowMDowMCBVVEMpLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAc2luY2UgMi40LjBcbiAqIEBjYXRlZ29yeSBEYXRlXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBSZXR1cm5zIHRoZSB0aW1lc3RhbXAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uZGVmZXIoZnVuY3Rpb24oc3RhbXApIHtcbiAqICAgY29uc29sZS5sb2coXy5ub3coKSAtIHN0YW1wKTtcbiAqIH0sIF8ubm93KCkpO1xuICogLy8gPT4gTG9ncyB0aGUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyBpdCB0b29rIGZvciB0aGUgZGVmZXJyZWQgaW52b2NhdGlvbi5cbiAqL1xudmFyIG5vdyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gcm9vdC5EYXRlLm5vdygpO1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgZGVib3VuY2VkIGZ1bmN0aW9uIHRoYXQgZGVsYXlzIGludm9raW5nIGBmdW5jYCB1bnRpbCBhZnRlciBgd2FpdGBcbiAqIG1pbGxpc2Vjb25kcyBoYXZlIGVsYXBzZWQgc2luY2UgdGhlIGxhc3QgdGltZSB0aGUgZGVib3VuY2VkIGZ1bmN0aW9uIHdhc1xuICogaW52b2tlZC4gVGhlIGRlYm91bmNlZCBmdW5jdGlvbiBjb21lcyB3aXRoIGEgYGNhbmNlbGAgbWV0aG9kIHRvIGNhbmNlbFxuICogZGVsYXllZCBgZnVuY2AgaW52b2NhdGlvbnMgYW5kIGEgYGZsdXNoYCBtZXRob2QgdG8gaW1tZWRpYXRlbHkgaW52b2tlIHRoZW0uXG4gKiBQcm92aWRlIGBvcHRpb25zYCB0byBpbmRpY2F0ZSB3aGV0aGVyIGBmdW5jYCBzaG91bGQgYmUgaW52b2tlZCBvbiB0aGVcbiAqIGxlYWRpbmcgYW5kL29yIHRyYWlsaW5nIGVkZ2Ugb2YgdGhlIGB3YWl0YCB0aW1lb3V0LiBUaGUgYGZ1bmNgIGlzIGludm9rZWRcbiAqIHdpdGggdGhlIGxhc3QgYXJndW1lbnRzIHByb3ZpZGVkIHRvIHRoZSBkZWJvdW5jZWQgZnVuY3Rpb24uIFN1YnNlcXVlbnRcbiAqIGNhbGxzIHRvIHRoZSBkZWJvdW5jZWQgZnVuY3Rpb24gcmV0dXJuIHRoZSByZXN1bHQgb2YgdGhlIGxhc3QgYGZ1bmNgXG4gKiBpbnZvY2F0aW9uLlxuICpcbiAqICoqTm90ZToqKiBJZiBgbGVhZGluZ2AgYW5kIGB0cmFpbGluZ2Agb3B0aW9ucyBhcmUgYHRydWVgLCBgZnVuY2AgaXNcbiAqIGludm9rZWQgb24gdGhlIHRyYWlsaW5nIGVkZ2Ugb2YgdGhlIHRpbWVvdXQgb25seSBpZiB0aGUgZGVib3VuY2VkIGZ1bmN0aW9uXG4gKiBpcyBpbnZva2VkIG1vcmUgdGhhbiBvbmNlIGR1cmluZyB0aGUgYHdhaXRgIHRpbWVvdXQuXG4gKlxuICogSWYgYHdhaXRgIGlzIGAwYCBhbmQgYGxlYWRpbmdgIGlzIGBmYWxzZWAsIGBmdW5jYCBpbnZvY2F0aW9uIGlzIGRlZmVycmVkXG4gKiB1bnRpbCB0byB0aGUgbmV4dCB0aWNrLCBzaW1pbGFyIHRvIGBzZXRUaW1lb3V0YCB3aXRoIGEgdGltZW91dCBvZiBgMGAuXG4gKlxuICogU2VlIFtEYXZpZCBDb3JiYWNobydzIGFydGljbGVdKGh0dHBzOi8vY3NzLXRyaWNrcy5jb20vZGVib3VuY2luZy10aHJvdHRsaW5nLWV4cGxhaW5lZC1leGFtcGxlcy8pXG4gKiBmb3IgZGV0YWlscyBvdmVyIHRoZSBkaWZmZXJlbmNlcyBiZXR3ZWVuIGBfLmRlYm91bmNlYCBhbmQgYF8udGhyb3R0bGVgLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAc2luY2UgMC4xLjBcbiAqIEBjYXRlZ29yeSBGdW5jdGlvblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gZGVib3VuY2UuXG4gKiBAcGFyYW0ge251bWJlcn0gW3dhaXQ9MF0gVGhlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgdG8gZGVsYXkuXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnM9e31dIFRoZSBvcHRpb25zIG9iamVjdC5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMubGVhZGluZz1mYWxzZV1cbiAqICBTcGVjaWZ5IGludm9raW5nIG9uIHRoZSBsZWFkaW5nIGVkZ2Ugb2YgdGhlIHRpbWVvdXQuXG4gKiBAcGFyYW0ge251bWJlcn0gW29wdGlvbnMubWF4V2FpdF1cbiAqICBUaGUgbWF4aW11bSB0aW1lIGBmdW5jYCBpcyBhbGxvd2VkIHRvIGJlIGRlbGF5ZWQgYmVmb3JlIGl0J3MgaW52b2tlZC5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMudHJhaWxpbmc9dHJ1ZV1cbiAqICBTcGVjaWZ5IGludm9raW5nIG9uIHRoZSB0cmFpbGluZyBlZGdlIG9mIHRoZSB0aW1lb3V0LlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgZGVib3VuY2VkIGZ1bmN0aW9uLlxuICogQGV4YW1wbGVcbiAqXG4gKiAvLyBBdm9pZCBjb3N0bHkgY2FsY3VsYXRpb25zIHdoaWxlIHRoZSB3aW5kb3cgc2l6ZSBpcyBpbiBmbHV4LlxuICogalF1ZXJ5KHdpbmRvdykub24oJ3Jlc2l6ZScsIF8uZGVib3VuY2UoY2FsY3VsYXRlTGF5b3V0LCAxNTApKTtcbiAqXG4gKiAvLyBJbnZva2UgYHNlbmRNYWlsYCB3aGVuIGNsaWNrZWQsIGRlYm91bmNpbmcgc3Vic2VxdWVudCBjYWxscy5cbiAqIGpRdWVyeShlbGVtZW50KS5vbignY2xpY2snLCBfLmRlYm91bmNlKHNlbmRNYWlsLCAzMDAsIHtcbiAqICAgJ2xlYWRpbmcnOiB0cnVlLFxuICogICAndHJhaWxpbmcnOiBmYWxzZVxuICogfSkpO1xuICpcbiAqIC8vIEVuc3VyZSBgYmF0Y2hMb2dgIGlzIGludm9rZWQgb25jZSBhZnRlciAxIHNlY29uZCBvZiBkZWJvdW5jZWQgY2FsbHMuXG4gKiB2YXIgZGVib3VuY2VkID0gXy5kZWJvdW5jZShiYXRjaExvZywgMjUwLCB7ICdtYXhXYWl0JzogMTAwMCB9KTtcbiAqIHZhciBzb3VyY2UgPSBuZXcgRXZlbnRTb3VyY2UoJy9zdHJlYW0nKTtcbiAqIGpRdWVyeShzb3VyY2UpLm9uKCdtZXNzYWdlJywgZGVib3VuY2VkKTtcbiAqXG4gKiAvLyBDYW5jZWwgdGhlIHRyYWlsaW5nIGRlYm91bmNlZCBpbnZvY2F0aW9uLlxuICogalF1ZXJ5KHdpbmRvdykub24oJ3BvcHN0YXRlJywgZGVib3VuY2VkLmNhbmNlbCk7XG4gKi9cbmZ1bmN0aW9uIGRlYm91bmNlKGZ1bmMsIHdhaXQsIG9wdGlvbnMpIHtcbiAgdmFyIGxhc3RBcmdzLFxuICAgICAgbGFzdFRoaXMsXG4gICAgICBtYXhXYWl0LFxuICAgICAgcmVzdWx0LFxuICAgICAgdGltZXJJZCxcbiAgICAgIGxhc3RDYWxsVGltZSxcbiAgICAgIGxhc3RJbnZva2VUaW1lID0gMCxcbiAgICAgIGxlYWRpbmcgPSBmYWxzZSxcbiAgICAgIG1heGluZyA9IGZhbHNlLFxuICAgICAgdHJhaWxpbmcgPSB0cnVlO1xuXG4gIGlmICh0eXBlb2YgZnVuYyAhPSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihGVU5DX0VSUk9SX1RFWFQpO1xuICB9XG4gIHdhaXQgPSB0b051bWJlcih3YWl0KSB8fCAwO1xuICBpZiAoaXNPYmplY3Qob3B0aW9ucykpIHtcbiAgICBsZWFkaW5nID0gISFvcHRpb25zLmxlYWRpbmc7XG4gICAgbWF4aW5nID0gJ21heFdhaXQnIGluIG9wdGlvbnM7XG4gICAgbWF4V2FpdCA9IG1heGluZyA/IG5hdGl2ZU1heCh0b051bWJlcihvcHRpb25zLm1heFdhaXQpIHx8IDAsIHdhaXQpIDogbWF4V2FpdDtcbiAgICB0cmFpbGluZyA9ICd0cmFpbGluZycgaW4gb3B0aW9ucyA/ICEhb3B0aW9ucy50cmFpbGluZyA6IHRyYWlsaW5nO1xuICB9XG5cbiAgZnVuY3Rpb24gaW52b2tlRnVuYyh0aW1lKSB7XG4gICAgdmFyIGFyZ3MgPSBsYXN0QXJncyxcbiAgICAgICAgdGhpc0FyZyA9IGxhc3RUaGlzO1xuXG4gICAgbGFzdEFyZ3MgPSBsYXN0VGhpcyA9IHVuZGVmaW5lZDtcbiAgICBsYXN0SW52b2tlVGltZSA9IHRpbWU7XG4gICAgcmVzdWx0ID0gZnVuYy5hcHBseSh0aGlzQXJnLCBhcmdzKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgZnVuY3Rpb24gbGVhZGluZ0VkZ2UodGltZSkge1xuICAgIC8vIFJlc2V0IGFueSBgbWF4V2FpdGAgdGltZXIuXG4gICAgbGFzdEludm9rZVRpbWUgPSB0aW1lO1xuICAgIC8vIFN0YXJ0IHRoZSB0aW1lciBmb3IgdGhlIHRyYWlsaW5nIGVkZ2UuXG4gICAgdGltZXJJZCA9IHNldFRpbWVvdXQodGltZXJFeHBpcmVkLCB3YWl0KTtcbiAgICAvLyBJbnZva2UgdGhlIGxlYWRpbmcgZWRnZS5cbiAgICByZXR1cm4gbGVhZGluZyA/IGludm9rZUZ1bmModGltZSkgOiByZXN1bHQ7XG4gIH1cblxuICBmdW5jdGlvbiByZW1haW5pbmdXYWl0KHRpbWUpIHtcbiAgICB2YXIgdGltZVNpbmNlTGFzdENhbGwgPSB0aW1lIC0gbGFzdENhbGxUaW1lLFxuICAgICAgICB0aW1lU2luY2VMYXN0SW52b2tlID0gdGltZSAtIGxhc3RJbnZva2VUaW1lLFxuICAgICAgICByZXN1bHQgPSB3YWl0IC0gdGltZVNpbmNlTGFzdENhbGw7XG5cbiAgICByZXR1cm4gbWF4aW5nID8gbmF0aXZlTWluKHJlc3VsdCwgbWF4V2FpdCAtIHRpbWVTaW5jZUxhc3RJbnZva2UpIDogcmVzdWx0O1xuICB9XG5cbiAgZnVuY3Rpb24gc2hvdWxkSW52b2tlKHRpbWUpIHtcbiAgICB2YXIgdGltZVNpbmNlTGFzdENhbGwgPSB0aW1lIC0gbGFzdENhbGxUaW1lLFxuICAgICAgICB0aW1lU2luY2VMYXN0SW52b2tlID0gdGltZSAtIGxhc3RJbnZva2VUaW1lO1xuXG4gICAgLy8gRWl0aGVyIHRoaXMgaXMgdGhlIGZpcnN0IGNhbGwsIGFjdGl2aXR5IGhhcyBzdG9wcGVkIGFuZCB3ZSdyZSBhdCB0aGVcbiAgICAvLyB0cmFpbGluZyBlZGdlLCB0aGUgc3lzdGVtIHRpbWUgaGFzIGdvbmUgYmFja3dhcmRzIGFuZCB3ZSdyZSB0cmVhdGluZ1xuICAgIC8vIGl0IGFzIHRoZSB0cmFpbGluZyBlZGdlLCBvciB3ZSd2ZSBoaXQgdGhlIGBtYXhXYWl0YCBsaW1pdC5cbiAgICByZXR1cm4gKGxhc3RDYWxsVGltZSA9PT0gdW5kZWZpbmVkIHx8ICh0aW1lU2luY2VMYXN0Q2FsbCA+PSB3YWl0KSB8fFxuICAgICAgKHRpbWVTaW5jZUxhc3RDYWxsIDwgMCkgfHwgKG1heGluZyAmJiB0aW1lU2luY2VMYXN0SW52b2tlID49IG1heFdhaXQpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRpbWVyRXhwaXJlZCgpIHtcbiAgICB2YXIgdGltZSA9IG5vdygpO1xuICAgIGlmIChzaG91bGRJbnZva2UodGltZSkpIHtcbiAgICAgIHJldHVybiB0cmFpbGluZ0VkZ2UodGltZSk7XG4gICAgfVxuICAgIC8vIFJlc3RhcnQgdGhlIHRpbWVyLlxuICAgIHRpbWVySWQgPSBzZXRUaW1lb3V0KHRpbWVyRXhwaXJlZCwgcmVtYWluaW5nV2FpdCh0aW1lKSk7XG4gIH1cblxuICBmdW5jdGlvbiB0cmFpbGluZ0VkZ2UodGltZSkge1xuICAgIHRpbWVySWQgPSB1bmRlZmluZWQ7XG5cbiAgICAvLyBPbmx5IGludm9rZSBpZiB3ZSBoYXZlIGBsYXN0QXJnc2Agd2hpY2ggbWVhbnMgYGZ1bmNgIGhhcyBiZWVuXG4gICAgLy8gZGVib3VuY2VkIGF0IGxlYXN0IG9uY2UuXG4gICAgaWYgKHRyYWlsaW5nICYmIGxhc3RBcmdzKSB7XG4gICAgICByZXR1cm4gaW52b2tlRnVuYyh0aW1lKTtcbiAgICB9XG4gICAgbGFzdEFyZ3MgPSBsYXN0VGhpcyA9IHVuZGVmaW5lZDtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgZnVuY3Rpb24gY2FuY2VsKCkge1xuICAgIGlmICh0aW1lcklkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aW1lcklkKTtcbiAgICB9XG4gICAgbGFzdEludm9rZVRpbWUgPSAwO1xuICAgIGxhc3RBcmdzID0gbGFzdENhbGxUaW1lID0gbGFzdFRoaXMgPSB0aW1lcklkID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgZnVuY3Rpb24gZmx1c2goKSB7XG4gICAgcmV0dXJuIHRpbWVySWQgPT09IHVuZGVmaW5lZCA/IHJlc3VsdCA6IHRyYWlsaW5nRWRnZShub3coKSk7XG4gIH1cblxuICBmdW5jdGlvbiBkZWJvdW5jZWQoKSB7XG4gICAgdmFyIHRpbWUgPSBub3coKSxcbiAgICAgICAgaXNJbnZva2luZyA9IHNob3VsZEludm9rZSh0aW1lKTtcblxuICAgIGxhc3RBcmdzID0gYXJndW1lbnRzO1xuICAgIGxhc3RUaGlzID0gdGhpcztcbiAgICBsYXN0Q2FsbFRpbWUgPSB0aW1lO1xuXG4gICAgaWYgKGlzSW52b2tpbmcpIHtcbiAgICAgIGlmICh0aW1lcklkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGxlYWRpbmdFZGdlKGxhc3RDYWxsVGltZSk7XG4gICAgICB9XG4gICAgICBpZiAobWF4aW5nKSB7XG4gICAgICAgIC8vIEhhbmRsZSBpbnZvY2F0aW9ucyBpbiBhIHRpZ2h0IGxvb3AuXG4gICAgICAgIHRpbWVySWQgPSBzZXRUaW1lb3V0KHRpbWVyRXhwaXJlZCwgd2FpdCk7XG4gICAgICAgIHJldHVybiBpbnZva2VGdW5jKGxhc3RDYWxsVGltZSk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmICh0aW1lcklkID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHRpbWVySWQgPSBzZXRUaW1lb3V0KHRpbWVyRXhwaXJlZCwgd2FpdCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cbiAgZGVib3VuY2VkLmNhbmNlbCA9IGNhbmNlbDtcbiAgZGVib3VuY2VkLmZsdXNoID0gZmx1c2g7XG4gIHJldHVybiBkZWJvdW5jZWQ7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIHRocm90dGxlZCBmdW5jdGlvbiB0aGF0IG9ubHkgaW52b2tlcyBgZnVuY2AgYXQgbW9zdCBvbmNlIHBlclxuICogZXZlcnkgYHdhaXRgIG1pbGxpc2Vjb25kcy4gVGhlIHRocm90dGxlZCBmdW5jdGlvbiBjb21lcyB3aXRoIGEgYGNhbmNlbGBcbiAqIG1ldGhvZCB0byBjYW5jZWwgZGVsYXllZCBgZnVuY2AgaW52b2NhdGlvbnMgYW5kIGEgYGZsdXNoYCBtZXRob2QgdG9cbiAqIGltbWVkaWF0ZWx5IGludm9rZSB0aGVtLiBQcm92aWRlIGBvcHRpb25zYCB0byBpbmRpY2F0ZSB3aGV0aGVyIGBmdW5jYFxuICogc2hvdWxkIGJlIGludm9rZWQgb24gdGhlIGxlYWRpbmcgYW5kL29yIHRyYWlsaW5nIGVkZ2Ugb2YgdGhlIGB3YWl0YFxuICogdGltZW91dC4gVGhlIGBmdW5jYCBpcyBpbnZva2VkIHdpdGggdGhlIGxhc3QgYXJndW1lbnRzIHByb3ZpZGVkIHRvIHRoZVxuICogdGhyb3R0bGVkIGZ1bmN0aW9uLiBTdWJzZXF1ZW50IGNhbGxzIHRvIHRoZSB0aHJvdHRsZWQgZnVuY3Rpb24gcmV0dXJuIHRoZVxuICogcmVzdWx0IG9mIHRoZSBsYXN0IGBmdW5jYCBpbnZvY2F0aW9uLlxuICpcbiAqICoqTm90ZToqKiBJZiBgbGVhZGluZ2AgYW5kIGB0cmFpbGluZ2Agb3B0aW9ucyBhcmUgYHRydWVgLCBgZnVuY2AgaXNcbiAqIGludm9rZWQgb24gdGhlIHRyYWlsaW5nIGVkZ2Ugb2YgdGhlIHRpbWVvdXQgb25seSBpZiB0aGUgdGhyb3R0bGVkIGZ1bmN0aW9uXG4gKiBpcyBpbnZva2VkIG1vcmUgdGhhbiBvbmNlIGR1cmluZyB0aGUgYHdhaXRgIHRpbWVvdXQuXG4gKlxuICogSWYgYHdhaXRgIGlzIGAwYCBhbmQgYGxlYWRpbmdgIGlzIGBmYWxzZWAsIGBmdW5jYCBpbnZvY2F0aW9uIGlzIGRlZmVycmVkXG4gKiB1bnRpbCB0byB0aGUgbmV4dCB0aWNrLCBzaW1pbGFyIHRvIGBzZXRUaW1lb3V0YCB3aXRoIGEgdGltZW91dCBvZiBgMGAuXG4gKlxuICogU2VlIFtEYXZpZCBDb3JiYWNobydzIGFydGljbGVdKGh0dHBzOi8vY3NzLXRyaWNrcy5jb20vZGVib3VuY2luZy10aHJvdHRsaW5nLWV4cGxhaW5lZC1leGFtcGxlcy8pXG4gKiBmb3IgZGV0YWlscyBvdmVyIHRoZSBkaWZmZXJlbmNlcyBiZXR3ZWVuIGBfLnRocm90dGxlYCBhbmQgYF8uZGVib3VuY2VgLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAc2luY2UgMC4xLjBcbiAqIEBjYXRlZ29yeSBGdW5jdGlvblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gdGhyb3R0bGUuXG4gKiBAcGFyYW0ge251bWJlcn0gW3dhaXQ9MF0gVGhlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgdG8gdGhyb3R0bGUgaW52b2NhdGlvbnMgdG8uXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnM9e31dIFRoZSBvcHRpb25zIG9iamVjdC5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMubGVhZGluZz10cnVlXVxuICogIFNwZWNpZnkgaW52b2tpbmcgb24gdGhlIGxlYWRpbmcgZWRnZSBvZiB0aGUgdGltZW91dC5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMudHJhaWxpbmc9dHJ1ZV1cbiAqICBTcGVjaWZ5IGludm9raW5nIG9uIHRoZSB0cmFpbGluZyBlZGdlIG9mIHRoZSB0aW1lb3V0LlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgdGhyb3R0bGVkIGZ1bmN0aW9uLlxuICogQGV4YW1wbGVcbiAqXG4gKiAvLyBBdm9pZCBleGNlc3NpdmVseSB1cGRhdGluZyB0aGUgcG9zaXRpb24gd2hpbGUgc2Nyb2xsaW5nLlxuICogalF1ZXJ5KHdpbmRvdykub24oJ3Njcm9sbCcsIF8udGhyb3R0bGUodXBkYXRlUG9zaXRpb24sIDEwMCkpO1xuICpcbiAqIC8vIEludm9rZSBgcmVuZXdUb2tlbmAgd2hlbiB0aGUgY2xpY2sgZXZlbnQgaXMgZmlyZWQsIGJ1dCBub3QgbW9yZSB0aGFuIG9uY2UgZXZlcnkgNSBtaW51dGVzLlxuICogdmFyIHRocm90dGxlZCA9IF8udGhyb3R0bGUocmVuZXdUb2tlbiwgMzAwMDAwLCB7ICd0cmFpbGluZyc6IGZhbHNlIH0pO1xuICogalF1ZXJ5KGVsZW1lbnQpLm9uKCdjbGljaycsIHRocm90dGxlZCk7XG4gKlxuICogLy8gQ2FuY2VsIHRoZSB0cmFpbGluZyB0aHJvdHRsZWQgaW52b2NhdGlvbi5cbiAqIGpRdWVyeSh3aW5kb3cpLm9uKCdwb3BzdGF0ZScsIHRocm90dGxlZC5jYW5jZWwpO1xuICovXG5mdW5jdGlvbiB0aHJvdHRsZShmdW5jLCB3YWl0LCBvcHRpb25zKSB7XG4gIHZhciBsZWFkaW5nID0gdHJ1ZSxcbiAgICAgIHRyYWlsaW5nID0gdHJ1ZTtcblxuICBpZiAodHlwZW9mIGZ1bmMgIT0gJ2Z1bmN0aW9uJykge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRlVOQ19FUlJPUl9URVhUKTtcbiAgfVxuICBpZiAoaXNPYmplY3Qob3B0aW9ucykpIHtcbiAgICBsZWFkaW5nID0gJ2xlYWRpbmcnIGluIG9wdGlvbnMgPyAhIW9wdGlvbnMubGVhZGluZyA6IGxlYWRpbmc7XG4gICAgdHJhaWxpbmcgPSAndHJhaWxpbmcnIGluIG9wdGlvbnMgPyAhIW9wdGlvbnMudHJhaWxpbmcgOiB0cmFpbGluZztcbiAgfVxuICByZXR1cm4gZGVib3VuY2UoZnVuYywgd2FpdCwge1xuICAgICdsZWFkaW5nJzogbGVhZGluZyxcbiAgICAnbWF4V2FpdCc6IHdhaXQsXG4gICAgJ3RyYWlsaW5nJzogdHJhaWxpbmdcbiAgfSk7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgdGhlXG4gKiBbbGFuZ3VhZ2UgdHlwZV0oaHR0cDovL3d3dy5lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzcuMC8jc2VjLWVjbWFzY3JpcHQtbGFuZ3VhZ2UtdHlwZXMpXG4gKiBvZiBgT2JqZWN0YC4gKGUuZy4gYXJyYXlzLCBmdW5jdGlvbnMsIG9iamVjdHMsIHJlZ2V4ZXMsIGBuZXcgTnVtYmVyKDApYCwgYW5kIGBuZXcgU3RyaW5nKCcnKWApXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBzaW5jZSAwLjEuMFxuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYW4gb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNPYmplY3Qoe30pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KF8ubm9vcCk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdChudWxsKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlKSB7XG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICByZXR1cm4gISF2YWx1ZSAmJiAodHlwZSA9PSAnb2JqZWN0JyB8fCB0eXBlID09ICdmdW5jdGlvbicpO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIG9iamVjdC1saWtlLiBBIHZhbHVlIGlzIG9iamVjdC1saWtlIGlmIGl0J3Mgbm90IGBudWxsYFxuICogYW5kIGhhcyBhIGB0eXBlb2ZgIHJlc3VsdCBvZiBcIm9iamVjdFwiLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAc2luY2UgNC4wLjBcbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIG9iamVjdC1saWtlLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNPYmplY3RMaWtlKHt9KTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0TGlrZShbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3RMaWtlKF8ubm9vcCk7XG4gKiAvLyA9PiBmYWxzZVxuICpcbiAqIF8uaXNPYmplY3RMaWtlKG51bGwpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNPYmplY3RMaWtlKHZhbHVlKSB7XG4gIHJldHVybiAhIXZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0Jztcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBjbGFzc2lmaWVkIGFzIGEgYFN5bWJvbGAgcHJpbWl0aXZlIG9yIG9iamVjdC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQHNpbmNlIDQuMC4wXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhIHN5bWJvbCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzU3ltYm9sKFN5bWJvbC5pdGVyYXRvcik7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc1N5bWJvbCgnYWJjJyk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc1N5bWJvbCh2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09ICdzeW1ib2wnIHx8XG4gICAgKGlzT2JqZWN0TGlrZSh2YWx1ZSkgJiYgb2JqZWN0VG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT0gc3ltYm9sVGFnKTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBgdmFsdWVgIHRvIGEgbnVtYmVyLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAc2luY2UgNC4wLjBcbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBwcm9jZXNzLlxuICogQHJldHVybnMge251bWJlcn0gUmV0dXJucyB0aGUgbnVtYmVyLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLnRvTnVtYmVyKDMuMik7XG4gKiAvLyA9PiAzLjJcbiAqXG4gKiBfLnRvTnVtYmVyKE51bWJlci5NSU5fVkFMVUUpO1xuICogLy8gPT4gNWUtMzI0XG4gKlxuICogXy50b051bWJlcihJbmZpbml0eSk7XG4gKiAvLyA9PiBJbmZpbml0eVxuICpcbiAqIF8udG9OdW1iZXIoJzMuMicpO1xuICogLy8gPT4gMy4yXG4gKi9cbmZ1bmN0aW9uIHRvTnVtYmVyKHZhbHVlKSB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgaWYgKGlzU3ltYm9sKHZhbHVlKSkge1xuICAgIHJldHVybiBOQU47XG4gIH1cbiAgaWYgKGlzT2JqZWN0KHZhbHVlKSkge1xuICAgIHZhciBvdGhlciA9IHR5cGVvZiB2YWx1ZS52YWx1ZU9mID09ICdmdW5jdGlvbicgPyB2YWx1ZS52YWx1ZU9mKCkgOiB2YWx1ZTtcbiAgICB2YWx1ZSA9IGlzT2JqZWN0KG90aGVyKSA/IChvdGhlciArICcnKSA6IG90aGVyO1xuICB9XG4gIGlmICh0eXBlb2YgdmFsdWUgIT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdmFsdWUgPT09IDAgPyB2YWx1ZSA6ICt2YWx1ZTtcbiAgfVxuICB2YWx1ZSA9IHZhbHVlLnJlcGxhY2UocmVUcmltLCAnJyk7XG4gIHZhciBpc0JpbmFyeSA9IHJlSXNCaW5hcnkudGVzdCh2YWx1ZSk7XG4gIHJldHVybiAoaXNCaW5hcnkgfHwgcmVJc09jdGFsLnRlc3QodmFsdWUpKVxuICAgID8gZnJlZVBhcnNlSW50KHZhbHVlLnNsaWNlKDIpLCBpc0JpbmFyeSA/IDIgOiA4KVxuICAgIDogKHJlSXNCYWRIZXgudGVzdCh2YWx1ZSkgPyBOQU4gOiArdmFsdWUpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHRocm90dGxlO1xuIiwiLyoqXG4qIENyZWF0ZSBhbiBldmVudCBlbWl0dGVyIHdpdGggbmFtZXNwYWNlc1xuKiBAbmFtZSBjcmVhdGVOYW1lc3BhY2VFbWl0dGVyXG4qIEBleGFtcGxlXG4qIHZhciBlbWl0dGVyID0gcmVxdWlyZSgnLi9pbmRleCcpKClcbipcbiogZW1pdHRlci5vbignKicsIGZ1bmN0aW9uICgpIHtcbiogICBjb25zb2xlLmxvZygnYWxsIGV2ZW50cyBlbWl0dGVkJywgdGhpcy5ldmVudClcbiogfSlcbipcbiogZW1pdHRlci5vbignZXhhbXBsZScsIGZ1bmN0aW9uICgpIHtcbiogICBjb25zb2xlLmxvZygnZXhhbXBsZSBldmVudCBlbWl0dGVkJylcbiogfSlcbiovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGNyZWF0ZU5hbWVzcGFjZUVtaXR0ZXIgKCkge1xuICB2YXIgZW1pdHRlciA9IHsgX2Zuczoge30gfVxuXG4gIC8qKlxuICAqIEVtaXQgYW4gZXZlbnQuIE9wdGlvbmFsbHkgbmFtZXNwYWNlIHRoZSBldmVudC4gU2VwYXJhdGUgdGhlIG5hbWVzcGFjZSBhbmQgZXZlbnQgd2l0aCBhIGA6YFxuICAqIEBuYW1lIGVtaXRcbiAgKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQg4oCTIHRoZSBuYW1lIG9mIHRoZSBldmVudCwgd2l0aCBvcHRpb25hbCBuYW1lc3BhY2VcbiAgKiBAcGFyYW0gey4uLip9IGRhdGEg4oCTIGRhdGEgdmFyaWFibGVzIHRoYXQgd2lsbCBiZSBwYXNzZWQgYXMgYXJndW1lbnRzIHRvIHRoZSBldmVudCBsaXN0ZW5lclxuICAqIEBleGFtcGxlXG4gICogZW1pdHRlci5lbWl0KCdleGFtcGxlJylcbiAgKiBlbWl0dGVyLmVtaXQoJ2RlbW86dGVzdCcpXG4gICogZW1pdHRlci5lbWl0KCdkYXRhJywgeyBleGFtcGxlOiB0cnVlfSwgJ2Egc3RyaW5nJywgMSlcbiAgKi9cbiAgZW1pdHRlci5lbWl0ID0gZnVuY3Rpb24gZW1pdCAoZXZlbnQpIHtcbiAgICB2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKVxuICAgIHZhciBuYW1lc3BhY2VkID0gbmFtZXNwYWNlcyhldmVudClcbiAgICBpZiAodGhpcy5fZm5zW2V2ZW50XSkgZW1pdEFsbChldmVudCwgdGhpcy5fZm5zW2V2ZW50XSwgYXJncylcbiAgICBpZiAobmFtZXNwYWNlZCkgZW1pdEFsbChldmVudCwgbmFtZXNwYWNlZCwgYXJncylcbiAgfVxuXG4gIC8qKlxuICAqIENyZWF0ZSBlbiBldmVudCBsaXN0ZW5lci5cbiAgKiBAbmFtZSBvblxuICAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gICogQGV4YW1wbGVcbiAgKiBlbWl0dGVyLm9uKCdleGFtcGxlJywgZnVuY3Rpb24gKCkge30pXG4gICogZW1pdHRlci5vbignZGVtbycsIGZ1bmN0aW9uICgpIHt9KVxuICAqL1xuICBlbWl0dGVyLm9uID0gZnVuY3Rpb24gb24gKGV2ZW50LCBmbikge1xuICAgIGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHsgdGhyb3cgbmV3IEVycm9yKCdjYWxsYmFjayByZXF1aXJlZCcpIH1cbiAgICAodGhpcy5fZm5zW2V2ZW50XSA9IHRoaXMuX2Zuc1tldmVudF0gfHwgW10pLnB1c2goZm4pXG4gIH1cblxuICAvKipcbiAgKiBDcmVhdGUgZW4gZXZlbnQgbGlzdGVuZXIgdGhhdCBmaXJlcyBvbmNlLlxuICAqIEBuYW1lIG9uY2VcbiAgKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICAqIEBleGFtcGxlXG4gICogZW1pdHRlci5vbmNlKCdleGFtcGxlJywgZnVuY3Rpb24gKCkge30pXG4gICogZW1pdHRlci5vbmNlKCdkZW1vJywgZnVuY3Rpb24gKCkge30pXG4gICovXG4gIGVtaXR0ZXIub25jZSA9IGZ1bmN0aW9uIG9uY2UgKGV2ZW50LCBmbikge1xuICAgIGZ1bmN0aW9uIG9uZSAoKSB7XG4gICAgICBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gICAgICBlbWl0dGVyLm9mZihldmVudCwgb25lKVxuICAgIH1cbiAgICB0aGlzLm9uKGV2ZW50LCBvbmUpXG4gIH1cblxuICAvKipcbiAgKiBTdG9wIGxpc3RlbmluZyB0byBhbiBldmVudC4gU3RvcCBhbGwgbGlzdGVuZXJzIG9uIGFuIGV2ZW50IGJ5IG9ubHkgcGFzc2luZyB0aGUgZXZlbnQgbmFtZS4gU3RvcCBhIHNpbmdsZSBsaXN0ZW5lciBieSBwYXNzaW5nIHRoYXQgZXZlbnQgaGFuZGxlciBhcyBhIGNhbGxiYWNrLlxuICAqIFlvdSBtdXN0IGJlIGV4cGxpY2l0IGFib3V0IHdoYXQgd2lsbCBiZSB1bnN1YnNjcmliZWQ6IGBlbWl0dGVyLm9mZignZGVtbycpYCB3aWxsIHVuc3Vic2NyaWJlIGFuIGBlbWl0dGVyLm9uKCdkZW1vJylgIGxpc3RlbmVyLCBcbiAgKiBgZW1pdHRlci5vZmYoJ2RlbW86ZXhhbXBsZScpYCB3aWxsIHVuc3Vic2NyaWJlIGFuIGBlbWl0dGVyLm9uKCdkZW1vOmV4YW1wbGUnKWAgbGlzdGVuZXJcbiAgKiBAbmFtZSBvZmZcbiAgKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbZm5dIOKAkyB0aGUgc3BlY2lmaWMgaGFuZGxlclxuICAqIEBleGFtcGxlXG4gICogZW1pdHRlci5vZmYoJ2V4YW1wbGUnKVxuICAqIGVtaXR0ZXIub2ZmKCdkZW1vJywgZnVuY3Rpb24gKCkge30pXG4gICovXG4gIGVtaXR0ZXIub2ZmID0gZnVuY3Rpb24gb2ZmIChldmVudCwgZm4pIHtcbiAgICB2YXIga2VlcCA9IFtdXG5cbiAgICBpZiAoZXZlbnQgJiYgZm4pIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5fZm5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICh0aGlzLl9mbnNbaV0gIT09IGZuKSB7XG4gICAgICAgICAga2VlcC5wdXNoKHRoaXMuX2Zuc1tpXSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGtlZXAubGVuZ3RoID8gdGhpcy5fZm5zW2V2ZW50XSA9IGtlZXAgOiBkZWxldGUgdGhpcy5fZm5zW2V2ZW50XVxuICB9XG5cbiAgZnVuY3Rpb24gbmFtZXNwYWNlcyAoZSkge1xuICAgIHZhciBvdXQgPSBbXVxuICAgIHZhciBhcmdzID0gZS5zcGxpdCgnOicpXG4gICAgdmFyIGZucyA9IGVtaXR0ZXIuX2Zuc1xuICAgIE9iamVjdC5rZXlzKGZucykuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICAgICBpZiAoa2V5ID09PSAnKicpIG91dCA9IG91dC5jb25jYXQoZm5zW2tleV0pXG4gICAgICBpZiAoYXJncy5sZW5ndGggPT09IDIgJiYgYXJnc1swXSA9PT0ga2V5KSBvdXQgPSBvdXQuY29uY2F0KGZuc1trZXldKVxuICAgIH0pXG4gICAgcmV0dXJuIG91dFxuICB9XG5cbiAgZnVuY3Rpb24gZW1pdEFsbCAoZSwgZm5zLCBhcmdzKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmICghZm5zW2ldKSBicmVha1xuICAgICAgZm5zW2ldLmV2ZW50ID0gZVxuICAgICAgZm5zW2ldLmFwcGx5KGZuc1tpXSwgYXJncylcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZW1pdHRlclxufVxuIiwiLyogZ2xvYmFsIE11dGF0aW9uT2JzZXJ2ZXIgKi9cbnZhciBkb2N1bWVudCA9IHJlcXVpcmUoJ2dsb2JhbC9kb2N1bWVudCcpXG52YXIgd2luZG93ID0gcmVxdWlyZSgnZ2xvYmFsL3dpbmRvdycpXG52YXIgd2F0Y2ggPSBPYmplY3QuY3JlYXRlKG51bGwpXG52YXIgS0VZX0lEID0gJ29ubG9hZGlkJyArIChuZXcgRGF0ZSgpICUgOWU2KS50b1N0cmluZygzNilcbnZhciBLRVlfQVRUUiA9ICdkYXRhLScgKyBLRVlfSURcbnZhciBJTkRFWCA9IDBcblxuaWYgKHdpbmRvdyAmJiB3aW5kb3cuTXV0YXRpb25PYnNlcnZlcikge1xuICB2YXIgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcihmdW5jdGlvbiAobXV0YXRpb25zKSB7XG4gICAgaWYgKE9iamVjdC5rZXlzKHdhdGNoKS5sZW5ndGggPCAxKSByZXR1cm5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG11dGF0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKG11dGF0aW9uc1tpXS5hdHRyaWJ1dGVOYW1lID09PSBLRVlfQVRUUikge1xuICAgICAgICBlYWNoQXR0cihtdXRhdGlvbnNbaV0sIHR1cm5vbiwgdHVybm9mZilcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGVhY2hNdXRhdGlvbihtdXRhdGlvbnNbaV0ucmVtb3ZlZE5vZGVzLCB0dXJub2ZmKVxuICAgICAgZWFjaE11dGF0aW9uKG11dGF0aW9uc1tpXS5hZGRlZE5vZGVzLCB0dXJub24pXG4gICAgfVxuICB9KVxuICBvYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHtcbiAgICBjaGlsZExpc3Q6IHRydWUsXG4gICAgc3VidHJlZTogdHJ1ZSxcbiAgICBhdHRyaWJ1dGVzOiB0cnVlLFxuICAgIGF0dHJpYnV0ZU9sZFZhbHVlOiB0cnVlLFxuICAgIGF0dHJpYnV0ZUZpbHRlcjogW0tFWV9BVFRSXVxuICB9KVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIG9ubG9hZCAoZWwsIG9uLCBvZmYsIGNhbGxlcikge1xuICBvbiA9IG9uIHx8IGZ1bmN0aW9uICgpIHt9XG4gIG9mZiA9IG9mZiB8fCBmdW5jdGlvbiAoKSB7fVxuICBlbC5zZXRBdHRyaWJ1dGUoS0VZX0FUVFIsICdvJyArIElOREVYKVxuICB3YXRjaFsnbycgKyBJTkRFWF0gPSBbb24sIG9mZiwgMCwgY2FsbGVyIHx8IG9ubG9hZC5jYWxsZXJdXG4gIElOREVYICs9IDFcbiAgcmV0dXJuIGVsXG59XG5cbmZ1bmN0aW9uIHR1cm5vbiAoaW5kZXgsIGVsKSB7XG4gIGlmICh3YXRjaFtpbmRleF1bMF0gJiYgd2F0Y2hbaW5kZXhdWzJdID09PSAwKSB7XG4gICAgd2F0Y2hbaW5kZXhdWzBdKGVsKVxuICAgIHdhdGNoW2luZGV4XVsyXSA9IDFcbiAgfVxufVxuXG5mdW5jdGlvbiB0dXJub2ZmIChpbmRleCwgZWwpIHtcbiAgaWYgKHdhdGNoW2luZGV4XVsxXSAmJiB3YXRjaFtpbmRleF1bMl0gPT09IDEpIHtcbiAgICB3YXRjaFtpbmRleF1bMV0oZWwpXG4gICAgd2F0Y2hbaW5kZXhdWzJdID0gMFxuICB9XG59XG5cbmZ1bmN0aW9uIGVhY2hBdHRyIChtdXRhdGlvbiwgb24sIG9mZikge1xuICB2YXIgbmV3VmFsdWUgPSBtdXRhdGlvbi50YXJnZXQuZ2V0QXR0cmlidXRlKEtFWV9BVFRSKVxuICBpZiAoc2FtZU9yaWdpbihtdXRhdGlvbi5vbGRWYWx1ZSwgbmV3VmFsdWUpKSB7XG4gICAgd2F0Y2hbbmV3VmFsdWVdID0gd2F0Y2hbbXV0YXRpb24ub2xkVmFsdWVdXG4gICAgcmV0dXJuXG4gIH1cbiAgaWYgKHdhdGNoW211dGF0aW9uLm9sZFZhbHVlXSkge1xuICAgIG9mZihtdXRhdGlvbi5vbGRWYWx1ZSwgbXV0YXRpb24udGFyZ2V0KVxuICB9XG4gIGlmICh3YXRjaFtuZXdWYWx1ZV0pIHtcbiAgICBvbihuZXdWYWx1ZSwgbXV0YXRpb24udGFyZ2V0KVxuICB9XG59XG5cbmZ1bmN0aW9uIHNhbWVPcmlnaW4gKG9sZFZhbHVlLCBuZXdWYWx1ZSkge1xuICBpZiAoIW9sZFZhbHVlIHx8ICFuZXdWYWx1ZSkgcmV0dXJuIGZhbHNlXG4gIHJldHVybiB3YXRjaFtvbGRWYWx1ZV1bM10gPT09IHdhdGNoW25ld1ZhbHVlXVszXVxufVxuXG5mdW5jdGlvbiBlYWNoTXV0YXRpb24gKG5vZGVzLCBmbikge1xuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHdhdGNoKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IG5vZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKG5vZGVzW2ldICYmIG5vZGVzW2ldLmdldEF0dHJpYnV0ZSAmJiBub2Rlc1tpXS5nZXRBdHRyaWJ1dGUoS0VZX0FUVFIpKSB7XG4gICAgICB2YXIgb25sb2FkaWQgPSBub2Rlc1tpXS5nZXRBdHRyaWJ1dGUoS0VZX0FUVFIpXG4gICAgICBrZXlzLmZvckVhY2goZnVuY3Rpb24gKGspIHtcbiAgICAgICAgaWYgKG9ubG9hZGlkID09PSBrKSB7XG4gICAgICAgICAgZm4oaywgbm9kZXNbaV0pXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuICAgIGlmIChub2Rlc1tpXS5jaGlsZE5vZGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGVhY2hNdXRhdGlvbihub2Rlc1tpXS5jaGlsZE5vZGVzLCBmbilcbiAgICB9XG4gIH1cbn1cbiIsInZhciB0b3BMZXZlbCA9IHR5cGVvZiBnbG9iYWwgIT09ICd1bmRlZmluZWQnID8gZ2xvYmFsIDpcbiAgICB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHdpbmRvdyA6IHt9XG52YXIgbWluRG9jID0gcmVxdWlyZSgnbWluLWRvY3VtZW50Jyk7XG5cbmlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBkb2N1bWVudDtcbn0gZWxzZSB7XG4gICAgdmFyIGRvY2N5ID0gdG9wTGV2ZWxbJ19fR0xPQkFMX0RPQ1VNRU5UX0NBQ0hFQDQnXTtcblxuICAgIGlmICghZG9jY3kpIHtcbiAgICAgICAgZG9jY3kgPSB0b3BMZXZlbFsnX19HTE9CQUxfRE9DVU1FTlRfQ0FDSEVANCddID0gbWluRG9jO1xuICAgIH1cblxuICAgIG1vZHVsZS5leHBvcnRzID0gZG9jY3k7XG59XG4iLCJpZiAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIG1vZHVsZS5leHBvcnRzID0gd2luZG93O1xufSBlbHNlIGlmICh0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBnbG9iYWw7XG59IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiKXtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHNlbGY7XG59IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0ge307XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHByZXR0aWVyQnl0ZXNcblxuZnVuY3Rpb24gcHJldHRpZXJCeXRlcyAobnVtKSB7XG4gIGlmICh0eXBlb2YgbnVtICE9PSAnbnVtYmVyJyB8fCBOdW1iZXIuaXNOYU4obnVtKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0V4cGVjdGVkIGEgbnVtYmVyLCBnb3QgJyArIHR5cGVvZiBudW0pXG4gIH1cblxuICB2YXIgbmVnID0gbnVtIDwgMFxuICB2YXIgdW5pdHMgPSBbJ0InLCAnS0InLCAnTUInLCAnR0InLCAnVEInLCAnUEInLCAnRUInLCAnWkInLCAnWUInXVxuXG4gIGlmIChuZWcpIHtcbiAgICBudW0gPSAtbnVtXG4gIH1cblxuICBpZiAobnVtIDwgMSkge1xuICAgIHJldHVybiAobmVnID8gJy0nIDogJycpICsgbnVtICsgJyBCJ1xuICB9XG5cbiAgdmFyIGV4cG9uZW50ID0gTWF0aC5taW4oTWF0aC5mbG9vcihNYXRoLmxvZyhudW0pIC8gTWF0aC5sb2coMTAwMCkpLCB1bml0cy5sZW5ndGggLSAxKVxuICBudW0gPSBOdW1iZXIobnVtIC8gTWF0aC5wb3coMTAwMCwgZXhwb25lbnQpKVxuICB2YXIgdW5pdCA9IHVuaXRzW2V4cG9uZW50XVxuXG4gIGlmIChudW0gPj0gMTAgfHwgbnVtICUgMSA9PT0gMCkge1xuICAgIC8vIERvIG5vdCBzaG93IGRlY2ltYWxzIHdoZW4gdGhlIG51bWJlciBpcyB0d28tZGlnaXQsIG9yIGlmIHRoZSBudW1iZXIgaGFzIG5vXG4gICAgLy8gZGVjaW1hbCBjb21wb25lbnQuXG4gICAgcmV0dXJuIChuZWcgPyAnLScgOiAnJykgKyBudW0udG9GaXhlZCgwKSArICcgJyArIHVuaXRcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gKG5lZyA/ICctJyA6ICcnKSArIG51bS50b0ZpeGVkKDEpICsgJyAnICsgdW5pdFxuICB9XG59XG4iLCIvLyBHZW5lcmF0ZWQgYnkgQmFiZWxcblwidXNlIHN0cmljdFwiO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5lbmNvZGUgPSBlbmNvZGU7XG4vKiBnbG9iYWw6IHdpbmRvdyAqL1xuXG52YXIgX3dpbmRvdyA9IHdpbmRvdztcbnZhciBidG9hID0gX3dpbmRvdy5idG9hO1xuZnVuY3Rpb24gZW5jb2RlKGRhdGEpIHtcbiAgcmV0dXJuIGJ0b2EodW5lc2NhcGUoZW5jb2RlVVJJQ29tcG9uZW50KGRhdGEpKSk7XG59XG5cbnZhciBpc1N1cHBvcnRlZCA9IGV4cG9ydHMuaXNTdXBwb3J0ZWQgPSBcImJ0b2FcIiBpbiB3aW5kb3c7IiwiLy8gR2VuZXJhdGVkIGJ5IEJhYmVsXG5cInVzZSBzdHJpY3RcIjtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMubmV3UmVxdWVzdCA9IG5ld1JlcXVlc3Q7XG5leHBvcnRzLnJlc29sdmVVcmwgPSByZXNvbHZlVXJsO1xuXG52YXIgX3Jlc29sdmVVcmwgPSByZXF1aXJlKFwicmVzb2x2ZS11cmxcIik7XG5cbnZhciBfcmVzb2x2ZVVybDIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9yZXNvbHZlVXJsKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZnVuY3Rpb24gbmV3UmVxdWVzdCgpIHtcbiAgcmV0dXJuIG5ldyB3aW5kb3cuWE1MSHR0cFJlcXVlc3QoKTtcbn0gLyogZ2xvYmFsIHdpbmRvdyAqL1xuXG5cbmZ1bmN0aW9uIHJlc29sdmVVcmwob3JpZ2luLCBsaW5rKSB7XG4gIHJldHVybiAoMCwgX3Jlc29sdmVVcmwyLmRlZmF1bHQpKG9yaWdpbiwgbGluayk7XG59IiwiLy8gR2VuZXJhdGVkIGJ5IEJhYmVsXG5cInVzZSBzdHJpY3RcIjtcblxudmFyIF9jcmVhdGVDbGFzcyA9IGZ1bmN0aW9uICgpIHsgZnVuY3Rpb24gZGVmaW5lUHJvcGVydGllcyh0YXJnZXQsIHByb3BzKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgcHJvcHMubGVuZ3RoOyBpKyspIHsgdmFyIGRlc2NyaXB0b3IgPSBwcm9wc1tpXTsgZGVzY3JpcHRvci5lbnVtZXJhYmxlID0gZGVzY3JpcHRvci5lbnVtZXJhYmxlIHx8IGZhbHNlOyBkZXNjcmlwdG9yLmNvbmZpZ3VyYWJsZSA9IHRydWU7IGlmIChcInZhbHVlXCIgaW4gZGVzY3JpcHRvcikgZGVzY3JpcHRvci53cml0YWJsZSA9IHRydWU7IE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0YXJnZXQsIGRlc2NyaXB0b3Iua2V5LCBkZXNjcmlwdG9yKTsgfSB9IHJldHVybiBmdW5jdGlvbiAoQ29uc3RydWN0b3IsIHByb3RvUHJvcHMsIHN0YXRpY1Byb3BzKSB7IGlmIChwcm90b1Byb3BzKSBkZWZpbmVQcm9wZXJ0aWVzKENvbnN0cnVjdG9yLnByb3RvdHlwZSwgcHJvdG9Qcm9wcyk7IGlmIChzdGF0aWNQcm9wcykgZGVmaW5lUHJvcGVydGllcyhDb25zdHJ1Y3Rvciwgc3RhdGljUHJvcHMpOyByZXR1cm4gQ29uc3RydWN0b3I7IH07IH0oKTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZ2V0U291cmNlID0gZ2V0U291cmNlO1xuXG5mdW5jdGlvbiBfY2xhc3NDYWxsQ2hlY2soaW5zdGFuY2UsIENvbnN0cnVjdG9yKSB7IGlmICghKGluc3RhbmNlIGluc3RhbmNlb2YgQ29uc3RydWN0b3IpKSB7IHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW5ub3QgY2FsbCBhIGNsYXNzIGFzIGEgZnVuY3Rpb25cIik7IH0gfVxuXG52YXIgRmlsZVNvdXJjZSA9IGZ1bmN0aW9uICgpIHtcbiAgZnVuY3Rpb24gRmlsZVNvdXJjZShmaWxlKSB7XG4gICAgX2NsYXNzQ2FsbENoZWNrKHRoaXMsIEZpbGVTb3VyY2UpO1xuXG4gICAgdGhpcy5fZmlsZSA9IGZpbGU7XG4gICAgdGhpcy5zaXplID0gZmlsZS5zaXplO1xuICB9XG5cbiAgX2NyZWF0ZUNsYXNzKEZpbGVTb3VyY2UsIFt7XG4gICAga2V5OiBcInNsaWNlXCIsXG4gICAgdmFsdWU6IGZ1bmN0aW9uIHNsaWNlKHN0YXJ0LCBlbmQpIHtcbiAgICAgIHJldHVybiB0aGlzLl9maWxlLnNsaWNlKHN0YXJ0LCBlbmQpO1xuICAgIH1cbiAgfSwge1xuICAgIGtleTogXCJjbG9zZVwiLFxuICAgIHZhbHVlOiBmdW5jdGlvbiBjbG9zZSgpIHt9XG4gIH1dKTtcblxuICByZXR1cm4gRmlsZVNvdXJjZTtcbn0oKTtcblxuZnVuY3Rpb24gZ2V0U291cmNlKGlucHV0KSB7XG4gIC8vIFNpbmNlIHdlIGVtdWxhdGUgdGhlIEJsb2IgdHlwZSBpbiBvdXIgdGVzdHMgKG5vdCBhbGwgdGFyZ2V0IGJyb3dzZXJzXG4gIC8vIHN1cHBvcnQgaXQpLCB3ZSBjYW5ub3QgdXNlIGBpbnN0YW5jZW9mYCBmb3IgdGVzdGluZyB3aGV0aGVyIHRoZSBpbnB1dCB2YWx1ZVxuICAvLyBjYW4gYmUgaGFuZGxlZC4gSW5zdGVhZCwgd2Ugc2ltcGx5IGNoZWNrIGlzIHRoZSBzbGljZSgpIGZ1bmN0aW9uIGFuZCB0aGVcbiAgLy8gc2l6ZSBwcm9wZXJ0eSBhcmUgYXZhaWxhYmxlLlxuICBpZiAodHlwZW9mIGlucHV0LnNsaWNlID09PSBcImZ1bmN0aW9uXCIgJiYgdHlwZW9mIGlucHV0LnNpemUgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICByZXR1cm4gbmV3IEZpbGVTb3VyY2UoaW5wdXQpO1xuICB9XG5cbiAgdGhyb3cgbmV3IEVycm9yKFwic291cmNlIG9iamVjdCBtYXkgb25seSBiZSBhbiBpbnN0YW5jZSBvZiBGaWxlIG9yIEJsb2IgaW4gdGhpcyBlbnZpcm9ubWVudFwiKTtcbn0iLCIvLyBHZW5lcmF0ZWQgYnkgQmFiZWxcblwidXNlIHN0cmljdFwiO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuZXhwb3J0cy5zZXRJdGVtID0gc2V0SXRlbTtcbmV4cG9ydHMuZ2V0SXRlbSA9IGdldEl0ZW07XG5leHBvcnRzLnJlbW92ZUl0ZW0gPSByZW1vdmVJdGVtO1xuLyogZ2xvYmFsIHdpbmRvdywgbG9jYWxTdG9yYWdlICovXG5cbnZhciBoYXNTdG9yYWdlID0gZmFsc2U7XG50cnkge1xuICBoYXNTdG9yYWdlID0gXCJsb2NhbFN0b3JhZ2VcIiBpbiB3aW5kb3c7XG5cbiAgLy8gQXR0ZW1wdCB0byBzdG9yZSBhbmQgcmVhZCBlbnRyaWVzIGZyb20gdGhlIGxvY2FsIHN0b3JhZ2UgdG8gZGV0ZWN0IFByaXZhdGVcbiAgLy8gTW9kZSBvbiBTYWZhcmkgb24gaU9TIChzZWUgIzQ5KVxuICB2YXIga2V5ID0gXCJ0dXNTdXBwb3J0XCI7XG4gIGxvY2FsU3RvcmFnZS5zZXRJdGVtKGtleSwgbG9jYWxTdG9yYWdlLmdldEl0ZW0oa2V5KSk7XG59IGNhdGNoIChlKSB7XG4gIC8vIElmIHdlIHRyeSB0byBhY2Nlc3MgbG9jYWxTdG9yYWdlIGluc2lkZSBhIHNhbmRib3hlZCBpZnJhbWUsIGEgU2VjdXJpdHlFcnJvclxuICAvLyBpcyB0aHJvd24uIFdoZW4gaW4gcHJpdmF0ZSBtb2RlIG9uIGlPUyBTYWZhcmksIGEgUXVvdGFFeGNlZWRlZEVycm9yIGlzXG4gIC8vIHRocm93biAoc2VlICM0OSlcbiAgaWYgKGUuY29kZSA9PT0gZS5TRUNVUklUWV9FUlIgfHwgZS5jb2RlID09PSBlLlFVT1RBX0VYQ0VFREVEX0VSUikge1xuICAgIGhhc1N0b3JhZ2UgPSBmYWxzZTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBlO1xuICB9XG59XG5cbnZhciBjYW5TdG9yZVVSTHMgPSBleHBvcnRzLmNhblN0b3JlVVJMcyA9IGhhc1N0b3JhZ2U7XG5cbmZ1bmN0aW9uIHNldEl0ZW0oa2V5LCB2YWx1ZSkge1xuICBpZiAoIWhhc1N0b3JhZ2UpIHJldHVybjtcbiAgcmV0dXJuIGxvY2FsU3RvcmFnZS5zZXRJdGVtKGtleSwgdmFsdWUpO1xufVxuXG5mdW5jdGlvbiBnZXRJdGVtKGtleSkge1xuICBpZiAoIWhhc1N0b3JhZ2UpIHJldHVybjtcbiAgcmV0dXJuIGxvY2FsU3RvcmFnZS5nZXRJdGVtKGtleSk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUl0ZW0oa2V5KSB7XG4gIGlmICghaGFzU3RvcmFnZSkgcmV0dXJuO1xuICByZXR1cm4gbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oa2V5KTtcbn0iLCIvLyBHZW5lcmF0ZWQgYnkgQmFiZWxcblwidXNlIHN0cmljdFwiO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHtcbiAgdmFsdWU6IHRydWVcbn0pO1xuXG5mdW5jdGlvbiBfY2xhc3NDYWxsQ2hlY2soaW5zdGFuY2UsIENvbnN0cnVjdG9yKSB7IGlmICghKGluc3RhbmNlIGluc3RhbmNlb2YgQ29uc3RydWN0b3IpKSB7IHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW5ub3QgY2FsbCBhIGNsYXNzIGFzIGEgZnVuY3Rpb25cIik7IH0gfVxuXG5mdW5jdGlvbiBfcG9zc2libGVDb25zdHJ1Y3RvclJldHVybihzZWxmLCBjYWxsKSB7IGlmICghc2VsZikgeyB0aHJvdyBuZXcgUmVmZXJlbmNlRXJyb3IoXCJ0aGlzIGhhc24ndCBiZWVuIGluaXRpYWxpc2VkIC0gc3VwZXIoKSBoYXNuJ3QgYmVlbiBjYWxsZWRcIik7IH0gcmV0dXJuIGNhbGwgJiYgKHR5cGVvZiBjYWxsID09PSBcIm9iamVjdFwiIHx8IHR5cGVvZiBjYWxsID09PSBcImZ1bmN0aW9uXCIpID8gY2FsbCA6IHNlbGY7IH1cblxuZnVuY3Rpb24gX2luaGVyaXRzKHN1YkNsYXNzLCBzdXBlckNsYXNzKSB7IGlmICh0eXBlb2Ygc3VwZXJDbGFzcyAhPT0gXCJmdW5jdGlvblwiICYmIHN1cGVyQ2xhc3MgIT09IG51bGwpIHsgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlN1cGVyIGV4cHJlc3Npb24gbXVzdCBlaXRoZXIgYmUgbnVsbCBvciBhIGZ1bmN0aW9uLCBub3QgXCIgKyB0eXBlb2Ygc3VwZXJDbGFzcyk7IH0gc3ViQ2xhc3MucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShzdXBlckNsYXNzICYmIHN1cGVyQ2xhc3MucHJvdG90eXBlLCB7IGNvbnN0cnVjdG9yOiB7IHZhbHVlOiBzdWJDbGFzcywgZW51bWVyYWJsZTogZmFsc2UsIHdyaXRhYmxlOiB0cnVlLCBjb25maWd1cmFibGU6IHRydWUgfSB9KTsgaWYgKHN1cGVyQ2xhc3MpIE9iamVjdC5zZXRQcm90b3R5cGVPZiA/IE9iamVjdC5zZXRQcm90b3R5cGVPZihzdWJDbGFzcywgc3VwZXJDbGFzcykgOiBzdWJDbGFzcy5fX3Byb3RvX18gPSBzdXBlckNsYXNzOyB9XG5cbnZhciBEZXRhaWxlZEVycm9yID0gZnVuY3Rpb24gKF9FcnJvcikge1xuICBfaW5oZXJpdHMoRGV0YWlsZWRFcnJvciwgX0Vycm9yKTtcblxuICBmdW5jdGlvbiBEZXRhaWxlZEVycm9yKGVycm9yKSB7XG4gICAgdmFyIGNhdXNpbmdFcnIgPSBhcmd1bWVudHMubGVuZ3RoIDw9IDEgfHwgYXJndW1lbnRzWzFdID09PSB1bmRlZmluZWQgPyBudWxsIDogYXJndW1lbnRzWzFdO1xuICAgIHZhciB4aHIgPSBhcmd1bWVudHMubGVuZ3RoIDw9IDIgfHwgYXJndW1lbnRzWzJdID09PSB1bmRlZmluZWQgPyBudWxsIDogYXJndW1lbnRzWzJdO1xuXG4gICAgX2NsYXNzQ2FsbENoZWNrKHRoaXMsIERldGFpbGVkRXJyb3IpO1xuXG4gICAgdmFyIF90aGlzID0gX3Bvc3NpYmxlQ29uc3RydWN0b3JSZXR1cm4odGhpcywgT2JqZWN0LmdldFByb3RvdHlwZU9mKERldGFpbGVkRXJyb3IpLmNhbGwodGhpcywgZXJyb3IubWVzc2FnZSkpO1xuXG4gICAgX3RoaXMub3JpZ2luYWxSZXF1ZXN0ID0geGhyO1xuICAgIF90aGlzLmNhdXNpbmdFcnJvciA9IGNhdXNpbmdFcnI7XG5cbiAgICB2YXIgbWVzc2FnZSA9IGVycm9yLm1lc3NhZ2U7XG4gICAgaWYgKGNhdXNpbmdFcnIgIT0gbnVsbCkge1xuICAgICAgbWVzc2FnZSArPSBcIiwgY2F1c2VkIGJ5IFwiICsgY2F1c2luZ0Vyci50b1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAoeGhyICE9IG51bGwpIHtcbiAgICAgIG1lc3NhZ2UgKz0gXCIsIG9yaWdpbmF0ZWQgZnJvbSByZXF1ZXN0IChyZXNwb25zZSBjb2RlOiBcIiArIHhoci5zdGF0dXMgKyBcIiwgcmVzcG9uc2UgdGV4dDogXCIgKyB4aHIucmVzcG9uc2VUZXh0ICsgXCIpXCI7XG4gICAgfVxuICAgIF90aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuICAgIHJldHVybiBfdGhpcztcbiAgfVxuXG4gIHJldHVybiBEZXRhaWxlZEVycm9yO1xufShFcnJvcik7XG5cbmV4cG9ydHMuZGVmYXVsdCA9IERldGFpbGVkRXJyb3I7IiwiLy8gR2VuZXJhdGVkIGJ5IEJhYmVsXG5cInVzZSBzdHJpY3RcIjtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7XG4gIHZhbHVlOiB0cnVlXG59KTtcbmV4cG9ydHMuZGVmYXVsdCA9IGZpbmdlcnByaW50O1xuLyoqXG4gKiBHZW5lcmF0ZSBhIGZpbmdlcnByaW50IGZvciBhIGZpbGUgd2hpY2ggd2lsbCBiZSB1c2VkIHRoZSBzdG9yZSB0aGUgZW5kcG9pbnRcbiAqXG4gKiBAcGFyYW0ge0ZpbGV9IGZpbGVcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xuZnVuY3Rpb24gZmluZ2VycHJpbnQoZmlsZSkge1xuICByZXR1cm4gW1widHVzXCIsIGZpbGUubmFtZSwgZmlsZS50eXBlLCBmaWxlLnNpemUsIGZpbGUubGFzdE1vZGlmaWVkXS5qb2luKFwiLVwiKTtcbn0iLCIvLyBHZW5lcmF0ZWQgYnkgQmFiZWxcblwidXNlIHN0cmljdFwiO1xuXG52YXIgX3VwbG9hZCA9IHJlcXVpcmUoXCIuL3VwbG9hZFwiKTtcblxudmFyIF91cGxvYWQyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfdXBsb2FkKTtcblxudmFyIF9zdG9yYWdlID0gcmVxdWlyZShcIi4vbm9kZS9zdG9yYWdlXCIpO1xuXG5mdW5jdGlvbiBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KG9iaikgeyByZXR1cm4gb2JqICYmIG9iai5fX2VzTW9kdWxlID8gb2JqIDogeyBkZWZhdWx0OiBvYmogfTsgfVxuXG4vKiBnbG9iYWwgd2luZG93ICovXG52YXIgZGVmYXVsdE9wdGlvbnMgPSBfdXBsb2FkMi5kZWZhdWx0LmRlZmF1bHRPcHRpb25zO1xuXG5cbmlmICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gIC8vIEJyb3dzZXIgZW52aXJvbm1lbnQgdXNpbmcgWE1MSHR0cFJlcXVlc3RcbiAgdmFyIF93aW5kb3cgPSB3aW5kb3c7XG4gIHZhciBYTUxIdHRwUmVxdWVzdCA9IF93aW5kb3cuWE1MSHR0cFJlcXVlc3Q7XG4gIHZhciBCbG9iID0gX3dpbmRvdy5CbG9iO1xuXG5cbiAgdmFyIGlzU3VwcG9ydGVkID0gWE1MSHR0cFJlcXVlc3QgJiYgQmxvYiAmJiB0eXBlb2YgQmxvYi5wcm90b3R5cGUuc2xpY2UgPT09IFwiZnVuY3Rpb25cIjtcbn0gZWxzZSB7XG4gIC8vIE5vZGUuanMgZW52aXJvbm1lbnQgdXNpbmcgaHR0cCBtb2R1bGVcbiAgdmFyIGlzU3VwcG9ydGVkID0gdHJ1ZTtcbn1cblxuLy8gVGhlIHVzYWdlIG9mIHRoZSBjb21tb25qcyBleHBvcnRpbmcgc3ludGF4IGluc3RlYWQgb2YgdGhlIG5ldyBFQ01BU2NyaXB0XG4vLyBvbmUgaXMgYWN0dWFsbHkgaW50ZWRlZCBhbmQgcHJldmVudHMgd2VpcmQgYmVoYXZpb3VyIGlmIHdlIGFyZSB0cnlpbmcgdG9cbi8vIGltcG9ydCB0aGlzIG1vZHVsZSBpbiBhbm90aGVyIG1vZHVsZSB1c2luZyBCYWJlbC5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBVcGxvYWQ6IF91cGxvYWQyLmRlZmF1bHQsXG4gIGlzU3VwcG9ydGVkOiBpc1N1cHBvcnRlZCxcbiAgY2FuU3RvcmVVUkxzOiBfc3RvcmFnZS5jYW5TdG9yZVVSTHMsXG4gIGRlZmF1bHRPcHRpb25zOiBkZWZhdWx0T3B0aW9uc1xufTsiLCIvLyBHZW5lcmF0ZWQgYnkgQmFiZWxcblwidXNlIHN0cmljdFwiO1xuXG52YXIgX2NyZWF0ZUNsYXNzID0gZnVuY3Rpb24gKCkgeyBmdW5jdGlvbiBkZWZpbmVQcm9wZXJ0aWVzKHRhcmdldCwgcHJvcHMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBwcm9wcy5sZW5ndGg7IGkrKykgeyB2YXIgZGVzY3JpcHRvciA9IHByb3BzW2ldOyBkZXNjcmlwdG9yLmVudW1lcmFibGUgPSBkZXNjcmlwdG9yLmVudW1lcmFibGUgfHwgZmFsc2U7IGRlc2NyaXB0b3IuY29uZmlndXJhYmxlID0gdHJ1ZTsgaWYgKFwidmFsdWVcIiBpbiBkZXNjcmlwdG9yKSBkZXNjcmlwdG9yLndyaXRhYmxlID0gdHJ1ZTsgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRhcmdldCwgZGVzY3JpcHRvci5rZXksIGRlc2NyaXB0b3IpOyB9IH0gcmV0dXJuIGZ1bmN0aW9uIChDb25zdHJ1Y3RvciwgcHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHsgaWYgKHByb3RvUHJvcHMpIGRlZmluZVByb3BlcnRpZXMoQ29uc3RydWN0b3IucHJvdG90eXBlLCBwcm90b1Byb3BzKTsgaWYgKHN0YXRpY1Byb3BzKSBkZWZpbmVQcm9wZXJ0aWVzKENvbnN0cnVjdG9yLCBzdGF0aWNQcm9wcyk7IHJldHVybiBDb25zdHJ1Y3RvcjsgfTsgfSgpOyAvKiBnbG9iYWwgd2luZG93ICovXG5cblxuLy8gV2UgaW1wb3J0IHRoZSBmaWxlcyB1c2VkIGluc2lkZSB0aGUgTm9kZSBlbnZpcm9ubWVudCB3aGljaCBhcmUgcmV3cml0dGVuXG4vLyBmb3IgYnJvd3NlcnMgdXNpbmcgdGhlIHJ1bGVzIGRlZmluZWQgaW4gdGhlIHBhY2thZ2UuanNvblxuXG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwge1xuICB2YWx1ZTogdHJ1ZVxufSk7XG5cbnZhciBfZmluZ2VycHJpbnQgPSByZXF1aXJlKFwiLi9maW5nZXJwcmludFwiKTtcblxudmFyIF9maW5nZXJwcmludDIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9maW5nZXJwcmludCk7XG5cbnZhciBfZXJyb3IgPSByZXF1aXJlKFwiLi9lcnJvclwiKTtcblxudmFyIF9lcnJvcjIgPSBfaW50ZXJvcFJlcXVpcmVEZWZhdWx0KF9lcnJvcik7XG5cbnZhciBfZXh0ZW5kID0gcmVxdWlyZShcImV4dGVuZFwiKTtcblxudmFyIF9leHRlbmQyID0gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChfZXh0ZW5kKTtcblxudmFyIF9yZXF1ZXN0ID0gcmVxdWlyZShcIi4vbm9kZS9yZXF1ZXN0XCIpO1xuXG52YXIgX3NvdXJjZSA9IHJlcXVpcmUoXCIuL25vZGUvc291cmNlXCIpO1xuXG52YXIgX2Jhc2UgPSByZXF1aXJlKFwiLi9ub2RlL2Jhc2U2NFwiKTtcblxudmFyIEJhc2U2NCA9IF9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkKF9iYXNlKTtcblxudmFyIF9zdG9yYWdlID0gcmVxdWlyZShcIi4vbm9kZS9zdG9yYWdlXCIpO1xuXG52YXIgU3RvcmFnZSA9IF9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkKF9zdG9yYWdlKTtcblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQob2JqKSB7IGlmIChvYmogJiYgb2JqLl9fZXNNb2R1bGUpIHsgcmV0dXJuIG9iajsgfSBlbHNlIHsgdmFyIG5ld09iaiA9IHt9OyBpZiAob2JqICE9IG51bGwpIHsgZm9yICh2YXIga2V5IGluIG9iaikgeyBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkgbmV3T2JqW2tleV0gPSBvYmpba2V5XTsgfSB9IG5ld09iai5kZWZhdWx0ID0gb2JqOyByZXR1cm4gbmV3T2JqOyB9IH1cblxuZnVuY3Rpb24gX2ludGVyb3BSZXF1aXJlRGVmYXVsdChvYmopIHsgcmV0dXJuIG9iaiAmJiBvYmouX19lc01vZHVsZSA/IG9iaiA6IHsgZGVmYXVsdDogb2JqIH07IH1cblxuZnVuY3Rpb24gX2NsYXNzQ2FsbENoZWNrKGluc3RhbmNlLCBDb25zdHJ1Y3RvcikgeyBpZiAoIShpbnN0YW5jZSBpbnN0YW5jZW9mIENvbnN0cnVjdG9yKSkgeyB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IGNhbGwgYSBjbGFzcyBhcyBhIGZ1bmN0aW9uXCIpOyB9IH1cblxudmFyIGRlZmF1bHRPcHRpb25zID0ge1xuICBlbmRwb2ludDogXCJcIixcbiAgZmluZ2VycHJpbnQ6IF9maW5nZXJwcmludDIuZGVmYXVsdCxcbiAgcmVzdW1lOiB0cnVlLFxuICBvblByb2dyZXNzOiBudWxsLFxuICBvbkNodW5rQ29tcGxldGU6IG51bGwsXG4gIG9uU3VjY2VzczogbnVsbCxcbiAgb25FcnJvcjogbnVsbCxcbiAgaGVhZGVyczoge30sXG4gIGNodW5rU2l6ZTogSW5maW5pdHksXG4gIHdpdGhDcmVkZW50aWFsczogZmFsc2UsXG4gIHVwbG9hZFVybDogbnVsbCxcbiAgdXBsb2FkU2l6ZTogbnVsbCxcbiAgb3ZlcnJpZGVQYXRjaE1ldGhvZDogZmFsc2UsXG4gIHJldHJ5RGVsYXlzOiBudWxsXG59O1xuXG52YXIgVXBsb2FkID0gZnVuY3Rpb24gKCkge1xuICBmdW5jdGlvbiBVcGxvYWQoZmlsZSwgb3B0aW9ucykge1xuICAgIF9jbGFzc0NhbGxDaGVjayh0aGlzLCBVcGxvYWQpO1xuXG4gICAgdGhpcy5vcHRpb25zID0gKDAsIF9leHRlbmQyLmRlZmF1bHQpKHRydWUsIHt9LCBkZWZhdWx0T3B0aW9ucywgb3B0aW9ucyk7XG5cbiAgICAvLyBUaGUgdW5kZXJseWluZyBGaWxlL0Jsb2Igb2JqZWN0XG4gICAgdGhpcy5maWxlID0gZmlsZTtcblxuICAgIC8vIFRoZSBVUkwgYWdhaW5zdCB3aGljaCB0aGUgZmlsZSB3aWxsIGJlIHVwbG9hZGVkXG4gICAgdGhpcy51cmwgPSBudWxsO1xuXG4gICAgLy8gVGhlIHVuZGVybHlpbmcgWEhSIG9iamVjdCBmb3IgdGhlIGN1cnJlbnQgUEFUQ0ggcmVxdWVzdFxuICAgIHRoaXMuX3hociA9IG51bGw7XG5cbiAgICAvLyBUaGUgZmluZ2VycGlucnQgZm9yIHRoZSBjdXJyZW50IGZpbGUgKHNldCBhZnRlciBzdGFydCgpKVxuICAgIHRoaXMuX2ZpbmdlcnByaW50ID0gbnVsbDtcblxuICAgIC8vIFRoZSBvZmZzZXQgdXNlZCBpbiB0aGUgY3VycmVudCBQQVRDSCByZXF1ZXN0XG4gICAgdGhpcy5fb2Zmc2V0ID0gbnVsbDtcblxuICAgIC8vIFRydWUgaWYgdGhlIGN1cnJlbnQgUEFUQ0ggcmVxdWVzdCBoYXMgYmVlbiBhYm9ydGVkXG4gICAgdGhpcy5fYWJvcnRlZCA9IGZhbHNlO1xuXG4gICAgLy8gVGhlIGZpbGUncyBzaXplIGluIGJ5dGVzXG4gICAgdGhpcy5fc2l6ZSA9IG51bGw7XG5cbiAgICAvLyBUaGUgU291cmNlIG9iamVjdCB3aGljaCB3aWxsIHdyYXAgYXJvdW5kIHRoZSBnaXZlbiBmaWxlIGFuZCBwcm92aWRlcyB1c1xuICAgIC8vIHdpdGggYSB1bmlmaWVkIGludGVyZmFjZSBmb3IgZ2V0dGluZyBpdHMgc2l6ZSBhbmQgc2xpY2UgY2h1bmtzIGZyb20gaXRzXG4gICAgLy8gY29udGVudCBhbGxvd2luZyB1cyB0byBlYXNpbHkgaGFuZGxlIEZpbGVzLCBCbG9icywgQnVmZmVycyBhbmQgU3RyZWFtcy5cbiAgICB0aGlzLl9zb3VyY2UgPSBudWxsO1xuXG4gICAgLy8gVGhlIGN1cnJlbnQgY291bnQgb2YgYXR0ZW1wdHMgd2hpY2ggaGF2ZSBiZWVuIG1hZGUuIE51bGwgaW5kaWNhdGVzIG5vbmUuXG4gICAgdGhpcy5fcmV0cnlBdHRlbXB0ID0gMDtcblxuICAgIC8vIFRoZSB0aW1lb3V0J3MgSUQgd2hpY2ggaXMgdXNlZCB0byBkZWxheSB0aGUgbmV4dCByZXRyeVxuICAgIHRoaXMuX3JldHJ5VGltZW91dCA9IG51bGw7XG5cbiAgICAvLyBUaGUgb2Zmc2V0IG9mIHRoZSByZW1vdGUgdXBsb2FkIGJlZm9yZSB0aGUgbGF0ZXN0IGF0dGVtcHQgd2FzIHN0YXJ0ZWQuXG4gICAgdGhpcy5fb2Zmc2V0QmVmb3JlUmV0cnkgPSAwO1xuICB9XG5cbiAgX2NyZWF0ZUNsYXNzKFVwbG9hZCwgW3tcbiAgICBrZXk6IFwic3RhcnRcIixcbiAgICB2YWx1ZTogZnVuY3Rpb24gc3RhcnQoKSB7XG4gICAgICB2YXIgX3RoaXMgPSB0aGlzO1xuXG4gICAgICB2YXIgZmlsZSA9IHRoaXMuZmlsZTtcblxuICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgIHRoaXMuX2VtaXRFcnJvcihuZXcgRXJyb3IoXCJ0dXM6IG5vIGZpbGUgb3Igc3RyZWFtIHRvIHVwbG9hZCBwcm92aWRlZFwiKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKCF0aGlzLm9wdGlvbnMuZW5kcG9pbnQpIHtcbiAgICAgICAgdGhpcy5fZW1pdEVycm9yKG5ldyBFcnJvcihcInR1czogbm8gZW5kcG9pbnQgcHJvdmlkZWRcIikpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHZhciBzb3VyY2UgPSB0aGlzLl9zb3VyY2UgPSAoMCwgX3NvdXJjZS5nZXRTb3VyY2UpKGZpbGUsIHRoaXMub3B0aW9ucy5jaHVua1NpemUpO1xuXG4gICAgICAvLyBGaXJzdGx5LCBjaGVjayBpZiB0aGUgY2FsbGVyIGhhcyBzdXBwbGllZCBhIG1hbnVhbCB1cGxvYWQgc2l6ZSBvciBlbHNlXG4gICAgICAvLyB3ZSB3aWxsIHVzZSB0aGUgY2FsY3VsYXRlZCBzaXplIGJ5IHRoZSBzb3VyY2Ugb2JqZWN0LlxuICAgICAgaWYgKHRoaXMub3B0aW9ucy51cGxvYWRTaXplICE9IG51bGwpIHtcbiAgICAgICAgdmFyIHNpemUgPSArdGhpcy5vcHRpb25zLnVwbG9hZFNpemU7XG4gICAgICAgIGlmIChpc05hTihzaXplKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInR1czogY2Fubm90IGNvbnZlcnQgYHVwbG9hZFNpemVgIG9wdGlvbiBpbnRvIGEgbnVtYmVyXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fc2l6ZSA9IHNpemU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgc2l6ZSA9IHNvdXJjZS5zaXplO1xuXG4gICAgICAgIC8vIFRoZSBzaXplIHByb3BlcnR5IHdpbGwgYmUgbnVsbCBpZiB3ZSBjYW5ub3QgY2FsY3VsYXRlIHRoZSBmaWxlJ3Mgc2l6ZSxcbiAgICAgICAgLy8gZm9yIGV4YW1wbGUgaWYgeW91IGhhbmRsZSBhIHN0cmVhbS5cbiAgICAgICAgaWYgKHNpemUgPT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInR1czogY2Fubm90IGF1dG9tYXRpY2FsbHkgZGVyaXZlIHVwbG9hZCdzIHNpemUgZnJvbSBpbnB1dCBhbmQgbXVzdCBiZSBzcGVjaWZpZWQgbWFudWFsbHkgdXNpbmcgdGhlIGB1cGxvYWRTaXplYCBvcHRpb25cIik7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9zaXplID0gc2l6ZTtcbiAgICAgIH1cblxuICAgICAgdmFyIHJldHJ5RGVsYXlzID0gdGhpcy5vcHRpb25zLnJldHJ5RGVsYXlzO1xuICAgICAgaWYgKHJldHJ5RGVsYXlzICE9IG51bGwpIHtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChyZXRyeURlbGF5cykgIT09IFwiW29iamVjdCBBcnJheV1cIikge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInR1czogdGhlIGByZXRyeURlbGF5c2Agb3B0aW9uIG11c3QgZWl0aGVyIGJlIGFuIGFycmF5IG9yIG51bGxcIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBlcnJvckNhbGxiYWNrID0gX3RoaXMub3B0aW9ucy5vbkVycm9yO1xuICAgICAgICAgICAgX3RoaXMub3B0aW9ucy5vbkVycm9yID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAvLyBSZXN0b3JlIHRoZSBvcmlnaW5hbCBlcnJvciBjYWxsYmFjayB3aGljaCBtYXkgaGF2ZSBiZWVuIHNldC5cbiAgICAgICAgICAgICAgX3RoaXMub3B0aW9ucy5vbkVycm9yID0gZXJyb3JDYWxsYmFjaztcblxuICAgICAgICAgICAgICAvLyBXZSB3aWxsIHJlc2V0IHRoZSBhdHRlbXB0IGNvdW50ZXIgaWZcbiAgICAgICAgICAgICAgLy8gLSB3ZSB3ZXJlIGFscmVhZHkgYWJsZSB0byBjb25uZWN0IHRvIHRoZSBzZXJ2ZXIgKG9mZnNldCAhPSBudWxsKSBhbmRcbiAgICAgICAgICAgICAgLy8gLSB3ZSB3ZXJlIGFibGUgdG8gdXBsb2FkIGEgc21hbGwgY2h1bmsgb2YgZGF0YSB0byB0aGUgc2VydmVyXG4gICAgICAgICAgICAgIHZhciBzaG91bGRSZXNldERlbGF5cyA9IF90aGlzLl9vZmZzZXQgIT0gbnVsbCAmJiBfdGhpcy5fb2Zmc2V0ID4gX3RoaXMuX29mZnNldEJlZm9yZVJldHJ5O1xuICAgICAgICAgICAgICBpZiAoc2hvdWxkUmVzZXREZWxheXMpIHtcbiAgICAgICAgICAgICAgICBfdGhpcy5fcmV0cnlBdHRlbXB0ID0gMDtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHZhciBpc09ubGluZSA9IHRydWU7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiICYmIFwibmF2aWdhdG9yXCIgaW4gd2luZG93ICYmIHdpbmRvdy5uYXZpZ2F0b3Iub25MaW5lID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIGlzT25saW5lID0gZmFsc2U7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyBXZSBvbmx5IGF0dGVtcHQgYSByZXRyeSBpZlxuICAgICAgICAgICAgICAvLyAtIHdlIGRpZG4ndCBleGNlZWQgdGhlIG1heGl1bSBudW1iZXIgb2YgcmV0cmllcywgeWV0LCBhbmRcbiAgICAgICAgICAgICAgLy8gLSB0aGlzIGVycm9yIHdhcyBjYXVzZWQgYnkgYSByZXF1ZXN0IG9yIGl0J3MgcmVzcG9uc2UgYW5kXG4gICAgICAgICAgICAgIC8vIC0gdGhlIGJyb3dzZXIgZG9lcyBub3QgaW5kaWNhdGUgdGhhdCB3ZSBhcmUgb2ZmbGluZVxuICAgICAgICAgICAgICB2YXIgc2hvdWxkUmV0cnkgPSBfdGhpcy5fcmV0cnlBdHRlbXB0IDwgcmV0cnlEZWxheXMubGVuZ3RoICYmIGVyci5vcmlnaW5hbFJlcXVlc3QgIT0gbnVsbCAmJiBpc09ubGluZTtcblxuICAgICAgICAgICAgICBpZiAoIXNob3VsZFJldHJ5KSB7XG4gICAgICAgICAgICAgICAgX3RoaXMuX2VtaXRFcnJvcihlcnIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHZhciBkZWxheSA9IHJldHJ5RGVsYXlzW190aGlzLl9yZXRyeUF0dGVtcHQrK107XG5cbiAgICAgICAgICAgICAgX3RoaXMuX29mZnNldEJlZm9yZVJldHJ5ID0gX3RoaXMuX29mZnNldDtcbiAgICAgICAgICAgICAgX3RoaXMub3B0aW9ucy51cGxvYWRVcmwgPSBfdGhpcy51cmw7XG5cbiAgICAgICAgICAgICAgX3RoaXMuX3JldHJ5VGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIF90aGlzLnN0YXJ0KCk7XG4gICAgICAgICAgICAgIH0sIGRlbGF5KTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSkoKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBSZXNldCB0aGUgYWJvcnRlZCBmbGFnIHdoZW4gdGhlIHVwbG9hZCBpcyBzdGFydGVkIG9yIGVsc2UgdGhlXG4gICAgICAvLyBfc3RhcnRVcGxvYWQgd2lsbCBzdG9wIGJlZm9yZSBzZW5kaW5nIGEgcmVxdWVzdCBpZiB0aGUgdXBsb2FkIGhhcyBiZWVuXG4gICAgICAvLyBhYm9ydGVkIHByZXZpb3VzbHkuXG4gICAgICB0aGlzLl9hYm9ydGVkID0gZmFsc2U7XG5cbiAgICAgIC8vIEEgVVJMIGhhcyBtYW51YWxseSBiZWVuIHNwZWNpZmllZCwgc28gd2UgdHJ5IHRvIHJlc3VtZVxuICAgICAgaWYgKHRoaXMub3B0aW9ucy51cGxvYWRVcmwgIT0gbnVsbCkge1xuICAgICAgICB0aGlzLnVybCA9IHRoaXMub3B0aW9ucy51cGxvYWRVcmw7XG4gICAgICAgIHRoaXMuX3Jlc3VtZVVwbG9hZCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSBlbmRwb2ludCBmb3IgdGhlIGZpbGUgaW4gdGhlIHN0b3JhZ2VcbiAgICAgIGlmICh0aGlzLm9wdGlvbnMucmVzdW1lKSB7XG4gICAgICAgIHRoaXMuX2ZpbmdlcnByaW50ID0gdGhpcy5vcHRpb25zLmZpbmdlcnByaW50KGZpbGUpO1xuICAgICAgICB2YXIgcmVzdW1lZFVybCA9IFN0b3JhZ2UuZ2V0SXRlbSh0aGlzLl9maW5nZXJwcmludCk7XG5cbiAgICAgICAgaWYgKHJlc3VtZWRVcmwgIT0gbnVsbCkge1xuICAgICAgICAgIHRoaXMudXJsID0gcmVzdW1lZFVybDtcbiAgICAgICAgICB0aGlzLl9yZXN1bWVVcGxvYWQoKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQW4gdXBsb2FkIGhhcyBub3Qgc3RhcnRlZCBmb3IgdGhlIGZpbGUgeWV0LCBzbyB3ZSBzdGFydCBhIG5ldyBvbmVcbiAgICAgIHRoaXMuX2NyZWF0ZVVwbG9hZCgpO1xuICAgIH1cbiAgfSwge1xuICAgIGtleTogXCJhYm9ydFwiLFxuICAgIHZhbHVlOiBmdW5jdGlvbiBhYm9ydCgpIHtcbiAgICAgIGlmICh0aGlzLl94aHIgIT09IG51bGwpIHtcbiAgICAgICAgdGhpcy5feGhyLmFib3J0KCk7XG4gICAgICAgIHRoaXMuX3NvdXJjZS5jbG9zZSgpO1xuICAgICAgICB0aGlzLl9hYm9ydGVkID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuX3JldHJ5VGltZW91dCAhPSBudWxsKSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLl9yZXRyeVRpbWVvdXQpO1xuICAgICAgICB0aGlzLl9yZXRyeVRpbWVvdXQgPSBudWxsO1xuICAgICAgfVxuICAgIH1cbiAgfSwge1xuICAgIGtleTogXCJfZW1pdFhockVycm9yXCIsXG4gICAgdmFsdWU6IGZ1bmN0aW9uIF9lbWl0WGhyRXJyb3IoeGhyLCBlcnIsIGNhdXNpbmdFcnIpIHtcbiAgICAgIHRoaXMuX2VtaXRFcnJvcihuZXcgX2Vycm9yMi5kZWZhdWx0KGVyciwgY2F1c2luZ0VyciwgeGhyKSk7XG4gICAgfVxuICB9LCB7XG4gICAga2V5OiBcIl9lbWl0RXJyb3JcIixcbiAgICB2YWx1ZTogZnVuY3Rpb24gX2VtaXRFcnJvcihlcnIpIHtcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5vcHRpb25zLm9uRXJyb3IgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICB0aGlzLm9wdGlvbnMub25FcnJvcihlcnIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfVxuICAgIH1cbiAgfSwge1xuICAgIGtleTogXCJfZW1pdFN1Y2Nlc3NcIixcbiAgICB2YWx1ZTogZnVuY3Rpb24gX2VtaXRTdWNjZXNzKCkge1xuICAgICAgaWYgKHR5cGVvZiB0aGlzLm9wdGlvbnMub25TdWNjZXNzID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgdGhpcy5vcHRpb25zLm9uU3VjY2VzcygpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFB1Ymxpc2hlcyBub3RpZmljYXRpb24gd2hlbiBkYXRhIGhhcyBiZWVuIHNlbnQgdG8gdGhlIHNlcnZlci4gVGhpc1xuICAgICAqIGRhdGEgbWF5IG5vdCBoYXZlIGJlZW4gYWNjZXB0ZWQgYnkgdGhlIHNlcnZlciB5ZXQuXG4gICAgICogQHBhcmFtICB7bnVtYmVyfSBieXRlc1NlbnQgIE51bWJlciBvZiBieXRlcyBzZW50IHRvIHRoZSBzZXJ2ZXIuXG4gICAgICogQHBhcmFtICB7bnVtYmVyfSBieXRlc1RvdGFsIFRvdGFsIG51bWJlciBvZiBieXRlcyB0byBiZSBzZW50IHRvIHRoZSBzZXJ2ZXIuXG4gICAgICovXG5cbiAgfSwge1xuICAgIGtleTogXCJfZW1pdFByb2dyZXNzXCIsXG4gICAgdmFsdWU6IGZ1bmN0aW9uIF9lbWl0UHJvZ3Jlc3MoYnl0ZXNTZW50LCBieXRlc1RvdGFsKSB7XG4gICAgICBpZiAodHlwZW9mIHRoaXMub3B0aW9ucy5vblByb2dyZXNzID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgdGhpcy5vcHRpb25zLm9uUHJvZ3Jlc3MoYnl0ZXNTZW50LCBieXRlc1RvdGFsKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQdWJsaXNoZXMgbm90aWZpY2F0aW9uIHdoZW4gYSBjaHVuayBvZiBkYXRhIGhhcyBiZWVuIHNlbnQgdG8gdGhlIHNlcnZlclxuICAgICAqIGFuZCBhY2NlcHRlZCBieSB0aGUgc2VydmVyLlxuICAgICAqIEBwYXJhbSAge251bWJlcn0gY2h1bmtTaXplICBTaXplIG9mIHRoZSBjaHVuayB0aGF0IHdhcyBhY2NlcHRlZCBieSB0aGVcbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VydmVyLlxuICAgICAqIEBwYXJhbSAge251bWJlcn0gYnl0ZXNBY2NlcHRlZCBUb3RhbCBudW1iZXIgb2YgYnl0ZXMgdGhhdCBoYXZlIGJlZW5cbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWNjZXB0ZWQgYnkgdGhlIHNlcnZlci5cbiAgICAgKiBAcGFyYW0gIHtudW1iZXJ9IGJ5dGVzVG90YWwgVG90YWwgbnVtYmVyIG9mIGJ5dGVzIHRvIGJlIHNlbnQgdG8gdGhlIHNlcnZlci5cbiAgICAgKi9cblxuICB9LCB7XG4gICAga2V5OiBcIl9lbWl0Q2h1bmtDb21wbGV0ZVwiLFxuICAgIHZhbHVlOiBmdW5jdGlvbiBfZW1pdENodW5rQ29tcGxldGUoY2h1bmtTaXplLCBieXRlc0FjY2VwdGVkLCBieXRlc1RvdGFsKSB7XG4gICAgICBpZiAodHlwZW9mIHRoaXMub3B0aW9ucy5vbkNodW5rQ29tcGxldGUgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICB0aGlzLm9wdGlvbnMub25DaHVua0NvbXBsZXRlKGNodW5rU2l6ZSwgYnl0ZXNBY2NlcHRlZCwgYnl0ZXNUb3RhbCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IHRoZSBoZWFkZXJzIHVzZWQgaW4gdGhlIHJlcXVlc3QgYW5kIHRoZSB3aXRoQ3JlZGVudGlhbHMgcHJvcGVydHlcbiAgICAgKiBhcyBkZWZpbmVkIGluIHRoZSBvcHRpb25zXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1hNTEh0dHBSZXF1ZXN0fSB4aHJcbiAgICAgKi9cblxuICB9LCB7XG4gICAga2V5OiBcIl9zZXR1cFhIUlwiLFxuICAgIHZhbHVlOiBmdW5jdGlvbiBfc2V0dXBYSFIoeGhyKSB7XG4gICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihcIlR1cy1SZXN1bWFibGVcIiwgXCIxLjAuMFwiKTtcbiAgICAgIHZhciBoZWFkZXJzID0gdGhpcy5vcHRpb25zLmhlYWRlcnM7XG5cbiAgICAgIGZvciAodmFyIG5hbWUgaW4gaGVhZGVycykge1xuICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihuYW1lLCBoZWFkZXJzW25hbWVdKTtcbiAgICAgIH1cblxuICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9IHRoaXMub3B0aW9ucy53aXRoQ3JlZGVudGlhbHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIGEgbmV3IHVwbG9hZCB1c2luZyB0aGUgY3JlYXRpb24gZXh0ZW5zaW9uIGJ5IHNlbmRpbmcgYSBQT1NUXG4gICAgICogcmVxdWVzdCB0byB0aGUgZW5kcG9pbnQuIEFmdGVyIHN1Y2Nlc3NmdWwgY3JlYXRpb24gdGhlIGZpbGUgd2lsbCBiZVxuICAgICAqIHVwbG9hZGVkXG4gICAgICpcbiAgICAgKiBAYXBpIHByaXZhdGVcbiAgICAgKi9cblxuICB9LCB7XG4gICAga2V5OiBcIl9jcmVhdGVVcGxvYWRcIixcbiAgICB2YWx1ZTogZnVuY3Rpb24gX2NyZWF0ZVVwbG9hZCgpIHtcbiAgICAgIHZhciBfdGhpczIgPSB0aGlzO1xuXG4gICAgICB2YXIgeGhyID0gKDAsIF9yZXF1ZXN0Lm5ld1JlcXVlc3QpKCk7XG4gICAgICB4aHIub3BlbihcIlBPU1RcIiwgdGhpcy5vcHRpb25zLmVuZHBvaW50LCB0cnVlKTtcblxuICAgICAgeGhyLm9ubG9hZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCEoeGhyLnN0YXR1cyA+PSAyMDAgJiYgeGhyLnN0YXR1cyA8IDMwMCkpIHtcbiAgICAgICAgICBfdGhpczIuX2VtaXRYaHJFcnJvcih4aHIsIG5ldyBFcnJvcihcInR1czogdW5leHBlY3RlZCByZXNwb25zZSB3aGlsZSBjcmVhdGluZyB1cGxvYWRcIikpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIF90aGlzMi51cmwgPSAoMCwgX3JlcXVlc3QucmVzb2x2ZVVybCkoX3RoaXMyLm9wdGlvbnMuZW5kcG9pbnQsIHhoci5nZXRSZXNwb25zZUhlYWRlcihcIkxvY2F0aW9uXCIpKTtcblxuICAgICAgICBpZiAoX3RoaXMyLm9wdGlvbnMucmVzdW1lKSB7XG4gICAgICAgICAgU3RvcmFnZS5zZXRJdGVtKF90aGlzMi5fZmluZ2VycHJpbnQsIF90aGlzMi51cmwpO1xuICAgICAgICB9XG5cbiAgICAgICAgX3RoaXMyLl9vZmZzZXQgPSAwO1xuICAgICAgICBfdGhpczIuX3N0YXJ0VXBsb2FkKCk7XG4gICAgICB9O1xuXG4gICAgICB4aHIub25lcnJvciA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgX3RoaXMyLl9lbWl0WGhyRXJyb3IoeGhyLCBuZXcgRXJyb3IoXCJ0dXM6IGZhaWxlZCB0byBjcmVhdGUgdXBsb2FkXCIpLCBlcnIpO1xuICAgICAgfTtcblxuICAgICAgdGhpcy5fc2V0dXBYSFIoeGhyKTtcbiAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKFwiVXBsb2FkLUxlbmd0aFwiLCB0aGlzLl9zaXplKTtcblxuICAgICAgLy8gQWRkIG1ldGFkYXRhIGlmIHZhbHVlcyBoYXZlIGJlZW4gYWRkZWRcbiAgICAgIHZhciBtZXRhZGF0YSA9IGVuY29kZU1ldGFkYXRhKHRoaXMub3B0aW9ucy5tZXRhZGF0YSk7XG4gICAgICBpZiAobWV0YWRhdGEgIT09IFwiXCIpIHtcbiAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoXCJVcGxvYWQtTWV0YWRhdGFcIiwgbWV0YWRhdGEpO1xuICAgICAgfVxuXG4gICAgICB4aHIuc2VuZChudWxsKTtcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIFRyeSB0byByZXN1bWUgYW4gZXhpc3RpbmcgdXBsb2FkLiBGaXJzdCBhIEhFQUQgcmVxdWVzdCB3aWxsIGJlIHNlbnRcbiAgICAgKiB0byByZXRyaWV2ZSB0aGUgb2Zmc2V0LiBJZiB0aGUgcmVxdWVzdCBmYWlscyBhIG5ldyB1cGxvYWQgd2lsbCBiZVxuICAgICAqIGNyZWF0ZWQuIEluIHRoZSBjYXNlIG9mIGEgc3VjY2Vzc2Z1bCByZXNwb25zZSB0aGUgZmlsZSB3aWxsIGJlIHVwbG9hZGVkLlxuICAgICAqXG4gICAgICogQGFwaSBwcml2YXRlXG4gICAgICovXG5cbiAgfSwge1xuICAgIGtleTogXCJfcmVzdW1lVXBsb2FkXCIsXG4gICAgdmFsdWU6IGZ1bmN0aW9uIF9yZXN1bWVVcGxvYWQoKSB7XG4gICAgICB2YXIgX3RoaXMzID0gdGhpcztcblxuICAgICAgdmFyIHhociA9ICgwLCBfcmVxdWVzdC5uZXdSZXF1ZXN0KSgpO1xuICAgICAgeGhyLm9wZW4oXCJIRUFEXCIsIHRoaXMudXJsLCB0cnVlKTtcblxuICAgICAgeGhyLm9ubG9hZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCEoeGhyLnN0YXR1cyA+PSAyMDAgJiYgeGhyLnN0YXR1cyA8IDMwMCkpIHtcbiAgICAgICAgICBpZiAoX3RoaXMzLm9wdGlvbnMucmVzdW1lKSB7XG4gICAgICAgICAgICAvLyBSZW1vdmUgc3RvcmVkIGZpbmdlcnByaW50IGFuZCBjb3JyZXNwb25kaW5nIGVuZHBvaW50LFxuICAgICAgICAgICAgLy8gc2luY2UgdGhlIGZpbGUgY2FuIG5vdCBiZSBmb3VuZFxuICAgICAgICAgICAgU3RvcmFnZS5yZW1vdmVJdGVtKF90aGlzMy5fZmluZ2VycHJpbnQpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIElmIHRoZSB1cGxvYWQgaXMgbG9ja2VkIChpbmRpY2F0ZWQgYnkgdGhlIDQyMyBMb2NrZWQgc3RhdHVzIGNvZGUpLCB3ZVxuICAgICAgICAgIC8vIGVtaXQgYW4gZXJyb3IgaW5zdGVhZCBvZiBkaXJlY3RseSBzdGFydGluZyBhIG5ldyB1cGxvYWQuIFRoaXMgd2F5IHRoZVxuICAgICAgICAgIC8vIHJldHJ5IGxvZ2ljIGNhbiBjYXRjaCB0aGUgZXJyb3IgYW5kIHdpbGwgcmV0cnkgdGhlIHVwbG9hZC4gQW4gdXBsb2FkXG4gICAgICAgICAgLy8gaXMgdXN1YWxseSBsb2NrZWQgZm9yIGEgc2hvcnQgcGVyaW9kIG9mIHRpbWUgYW5kIHdpbGwgYmUgYXZhaWxhYmxlXG4gICAgICAgICAgLy8gYWZ0ZXJ3YXJkcy5cbiAgICAgICAgICBpZiAoeGhyLnN0YXR1cyA9PT0gNDIzKSB7XG4gICAgICAgICAgICBfdGhpczMuX2VtaXRYaHJFcnJvcih4aHIsIG5ldyBFcnJvcihcInR1czogdXBsb2FkIGlzIGN1cnJlbnRseSBsb2NrZWQ7IHJldHJ5IGxhdGVyXCIpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBUcnkgdG8gY3JlYXRlIGEgbmV3IHVwbG9hZFxuICAgICAgICAgIF90aGlzMy51cmwgPSBudWxsO1xuICAgICAgICAgIF90aGlzMy5fY3JlYXRlVXBsb2FkKCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG9mZnNldCA9IHBhcnNlSW50KHhoci5nZXRSZXNwb25zZUhlYWRlcihcIlVwbG9hZC1PZmZzZXRcIiksIDEwKTtcbiAgICAgICAgaWYgKGlzTmFOKG9mZnNldCkpIHtcbiAgICAgICAgICBfdGhpczMuX2VtaXRYaHJFcnJvcih4aHIsIG5ldyBFcnJvcihcInR1czogaW52YWxpZCBvciBtaXNzaW5nIG9mZnNldCB2YWx1ZVwiKSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxlbmd0aCA9IHBhcnNlSW50KHhoci5nZXRSZXNwb25zZUhlYWRlcihcIlVwbG9hZC1MZW5ndGhcIiksIDEwKTtcbiAgICAgICAgaWYgKGlzTmFOKGxlbmd0aCkpIHtcbiAgICAgICAgICBfdGhpczMuX2VtaXRYaHJFcnJvcih4aHIsIG5ldyBFcnJvcihcInR1czogaW52YWxpZCBvciBtaXNzaW5nIGxlbmd0aCB2YWx1ZVwiKSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVXBsb2FkIGhhcyBhbHJlYWR5IGJlZW4gY29tcGxldGVkIGFuZCB3ZSBkbyBub3QgbmVlZCB0byBzZW5kIGFkZGl0aW9uYWxcbiAgICAgICAgLy8gZGF0YSB0byB0aGUgc2VydmVyXG4gICAgICAgIGlmIChvZmZzZXQgPT09IGxlbmd0aCkge1xuICAgICAgICAgIF90aGlzMy5fZW1pdFByb2dyZXNzKGxlbmd0aCwgbGVuZ3RoKTtcbiAgICAgICAgICBfdGhpczMuX2VtaXRTdWNjZXNzKCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgX3RoaXMzLl9vZmZzZXQgPSBvZmZzZXQ7XG4gICAgICAgIF90aGlzMy5fc3RhcnRVcGxvYWQoKTtcbiAgICAgIH07XG5cbiAgICAgIHhoci5vbmVycm9yID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICBfdGhpczMuX2VtaXRYaHJFcnJvcih4aHIsIG5ldyBFcnJvcihcInR1czogZmFpbGVkIHRvIHJlc3VtZSB1cGxvYWRcIiksIGVycik7XG4gICAgICB9O1xuXG4gICAgICB0aGlzLl9zZXR1cFhIUih4aHIpO1xuICAgICAgeGhyLnNlbmQobnVsbCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RhcnQgdXBsb2FkaW5nIHRoZSBmaWxlIHVzaW5nIFBBVENIIHJlcXVlc3RzLiBUaGUgZmlsZSB3aWxsIGJlIGRpdmlkZWRcbiAgICAgKiBpbnRvIGNodW5rcyBhcyBzcGVjaWZpZWQgaW4gdGhlIGNodW5rU2l6ZSBvcHRpb24uIER1cmluZyB0aGUgdXBsb2FkXG4gICAgICogdGhlIG9uUHJvZ3Jlc3MgZXZlbnQgaGFuZGxlciBtYXkgYmUgaW52b2tlZCBtdWx0aXBsZSB0aW1lcy5cbiAgICAgKlxuICAgICAqIEBhcGkgcHJpdmF0ZVxuICAgICAqL1xuXG4gIH0sIHtcbiAgICBrZXk6IFwiX3N0YXJ0VXBsb2FkXCIsXG4gICAgdmFsdWU6IGZ1bmN0aW9uIF9zdGFydFVwbG9hZCgpIHtcbiAgICAgIHZhciBfdGhpczQgPSB0aGlzO1xuXG4gICAgICAvLyBJZiB0aGUgdXBsb2FkIGhhcyBiZWVuIGFib3J0ZWQsIHdlIHdpbGwgbm90IHNlbmQgdGhlIG5leHQgUEFUQ0ggcmVxdWVzdC5cbiAgICAgIC8vIFRoaXMgaXMgaW1wb3J0YW50IGlmIHRoZSBhYm9ydCBtZXRob2Qgd2FzIGNhbGxlZCBkdXJpbmcgYSBjYWxsYmFjaywgc3VjaFxuICAgICAgLy8gYXMgb25DaHVua0NvbXBsZXRlIG9yIG9uUHJvZ3Jlc3MuXG4gICAgICBpZiAodGhpcy5fYWJvcnRlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHZhciB4aHIgPSB0aGlzLl94aHIgPSAoMCwgX3JlcXVlc3QubmV3UmVxdWVzdCkoKTtcblxuICAgICAgLy8gU29tZSBicm93c2VyIGFuZCBzZXJ2ZXJzIG1heSBub3Qgc3VwcG9ydCB0aGUgUEFUQ0ggbWV0aG9kLiBGb3IgdGhvc2VcbiAgICAgIC8vIGNhc2VzLCB5b3UgY2FuIHRlbGwgdHVzLWpzLWNsaWVudCB0byB1c2UgYSBQT1NUIHJlcXVlc3Qgd2l0aCB0aGVcbiAgICAgIC8vIFgtSFRUUC1NZXRob2QtT3ZlcnJpZGUgaGVhZGVyIGZvciBzaW11bGF0aW5nIGEgUEFUQ0ggcmVxdWVzdC5cbiAgICAgIGlmICh0aGlzLm9wdGlvbnMub3ZlcnJpZGVQYXRjaE1ldGhvZCkge1xuICAgICAgICB4aHIub3BlbihcIlBPU1RcIiwgdGhpcy51cmwsIHRydWUpO1xuICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihcIlgtSFRUUC1NZXRob2QtT3ZlcnJpZGVcIiwgXCJQQVRDSFwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHhoci5vcGVuKFwiUEFUQ0hcIiwgdGhpcy51cmwsIHRydWUpO1xuICAgICAgfVxuXG4gICAgICB4aHIub25sb2FkID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoISh4aHIuc3RhdHVzID49IDIwMCAmJiB4aHIuc3RhdHVzIDwgMzAwKSkge1xuICAgICAgICAgIF90aGlzNC5fZW1pdFhockVycm9yKHhociwgbmV3IEVycm9yKFwidHVzOiB1bmV4cGVjdGVkIHJlc3BvbnNlIHdoaWxlIHVwbG9hZGluZyBjaHVua1wiKSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG9mZnNldCA9IHBhcnNlSW50KHhoci5nZXRSZXNwb25zZUhlYWRlcihcIlVwbG9hZC1PZmZzZXRcIiksIDEwKTtcbiAgICAgICAgaWYgKGlzTmFOKG9mZnNldCkpIHtcbiAgICAgICAgICBfdGhpczQuX2VtaXRYaHJFcnJvcih4aHIsIG5ldyBFcnJvcihcInR1czogaW52YWxpZCBvciBtaXNzaW5nIG9mZnNldCB2YWx1ZVwiKSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgX3RoaXM0Ll9lbWl0UHJvZ3Jlc3Mob2Zmc2V0LCBfdGhpczQuX3NpemUpO1xuICAgICAgICBfdGhpczQuX2VtaXRDaHVua0NvbXBsZXRlKG9mZnNldCAtIF90aGlzNC5fb2Zmc2V0LCBvZmZzZXQsIF90aGlzNC5fc2l6ZSk7XG5cbiAgICAgICAgX3RoaXM0Ll9vZmZzZXQgPSBvZmZzZXQ7XG5cbiAgICAgICAgaWYgKG9mZnNldCA9PSBfdGhpczQuX3NpemUpIHtcbiAgICAgICAgICAvLyBZYXksIGZpbmFsbHkgZG9uZSA6KVxuICAgICAgICAgIF90aGlzNC5fZW1pdFN1Y2Nlc3MoKTtcbiAgICAgICAgICBfdGhpczQuX3NvdXJjZS5jbG9zZSgpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIF90aGlzNC5fc3RhcnRVcGxvYWQoKTtcbiAgICAgIH07XG5cbiAgICAgIHhoci5vbmVycm9yID0gZnVuY3Rpb24gKGVycikge1xuICAgICAgICAvLyBEb24ndCBlbWl0IGFuIGVycm9yIGlmIHRoZSB1cGxvYWQgd2FzIGFib3J0ZWQgbWFudWFsbHlcbiAgICAgICAgaWYgKF90aGlzNC5fYWJvcnRlZCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIF90aGlzNC5fZW1pdFhockVycm9yKHhociwgbmV3IEVycm9yKFwidHVzOiBmYWlsZWQgdG8gdXBsb2FkIGNodW5rIGF0IG9mZnNldCBcIiArIF90aGlzNC5fb2Zmc2V0KSwgZXJyKTtcbiAgICAgIH07XG5cbiAgICAgIC8vIFRlc3Qgc3VwcG9ydCBmb3IgcHJvZ3Jlc3MgZXZlbnRzIGJlZm9yZSBhdHRhY2hpbmcgYW4gZXZlbnQgbGlzdGVuZXJcbiAgICAgIGlmIChcInVwbG9hZFwiIGluIHhocikge1xuICAgICAgICB4aHIudXBsb2FkLm9ucHJvZ3Jlc3MgPSBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgIGlmICghZS5sZW5ndGhDb21wdXRhYmxlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgX3RoaXM0Ll9lbWl0UHJvZ3Jlc3Moc3RhcnQgKyBlLmxvYWRlZCwgX3RoaXM0Ll9zaXplKTtcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5fc2V0dXBYSFIoeGhyKTtcblxuICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoXCJVcGxvYWQtT2Zmc2V0XCIsIHRoaXMuX29mZnNldCk7XG4gICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihcIkNvbnRlbnQtVHlwZVwiLCBcImFwcGxpY2F0aW9uL29mZnNldCtvY3RldC1zdHJlYW1cIik7XG5cbiAgICAgIHZhciBzdGFydCA9IHRoaXMuX29mZnNldDtcbiAgICAgIHZhciBlbmQgPSB0aGlzLl9vZmZzZXQgKyB0aGlzLm9wdGlvbnMuY2h1bmtTaXplO1xuXG4gICAgICAvLyBUaGUgc3BlY2lmaWVkIGNodW5rU2l6ZSBtYXkgYmUgSW5maW5pdHkgb3IgdGhlIGNhbGNsdWF0ZWQgZW5kIHBvc2l0aW9uXG4gICAgICAvLyBtYXkgZXhjZWVkIHRoZSBmaWxlJ3Mgc2l6ZS4gSW4gYm90aCBjYXNlcywgd2UgbGltaXQgdGhlIGVuZCBwb3NpdGlvbiB0b1xuICAgICAgLy8gdGhlIGlucHV0J3MgdG90YWwgc2l6ZSBmb3Igc2ltcGxlciBjYWxjdWxhdGlvbnMgYW5kIGNvcnJlY3RuZXNzLlxuICAgICAgaWYgKGVuZCA9PT0gSW5maW5pdHkgfHwgZW5kID4gdGhpcy5fc2l6ZSkge1xuICAgICAgICBlbmQgPSB0aGlzLl9zaXplO1xuICAgICAgfVxuXG4gICAgICB4aHIuc2VuZCh0aGlzLl9zb3VyY2Uuc2xpY2Uoc3RhcnQsIGVuZCkpO1xuICAgIH1cbiAgfV0pO1xuXG4gIHJldHVybiBVcGxvYWQ7XG59KCk7XG5cbmZ1bmN0aW9uIGVuY29kZU1ldGFkYXRhKG1ldGFkYXRhKSB7XG4gIGlmICghQmFzZTY0LmlzU3VwcG9ydGVkKSB7XG4gICAgcmV0dXJuIFwiXCI7XG4gIH1cblxuICB2YXIgZW5jb2RlZCA9IFtdO1xuXG4gIGZvciAodmFyIGtleSBpbiBtZXRhZGF0YSkge1xuICAgIGVuY29kZWQucHVzaChrZXkgKyBcIiBcIiArIEJhc2U2NC5lbmNvZGUobWV0YWRhdGFba2V5XSkpO1xuICB9XG5cbiAgcmV0dXJuIGVuY29kZWQuam9pbihcIixcIik7XG59XG5cblVwbG9hZC5kZWZhdWx0T3B0aW9ucyA9IGRlZmF1bHRPcHRpb25zO1xuXG5leHBvcnRzLmRlZmF1bHQgPSBVcGxvYWQ7IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgaGFzT3duID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcbnZhciB0b1N0ciA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7XG5cbnZhciBpc0FycmF5ID0gZnVuY3Rpb24gaXNBcnJheShhcnIpIHtcblx0aWYgKHR5cGVvZiBBcnJheS5pc0FycmF5ID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkoYXJyKTtcblx0fVxuXG5cdHJldHVybiB0b1N0ci5jYWxsKGFycikgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuXG52YXIgaXNQbGFpbk9iamVjdCA9IGZ1bmN0aW9uIGlzUGxhaW5PYmplY3Qob2JqKSB7XG5cdGlmICghb2JqIHx8IHRvU3RyLmNhbGwob2JqKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHR2YXIgaGFzT3duQ29uc3RydWN0b3IgPSBoYXNPd24uY2FsbChvYmosICdjb25zdHJ1Y3RvcicpO1xuXHR2YXIgaGFzSXNQcm90b3R5cGVPZiA9IG9iai5jb25zdHJ1Y3RvciAmJiBvYmouY29uc3RydWN0b3IucHJvdG90eXBlICYmIGhhc093bi5jYWxsKG9iai5jb25zdHJ1Y3Rvci5wcm90b3R5cGUsICdpc1Byb3RvdHlwZU9mJyk7XG5cdC8vIE5vdCBvd24gY29uc3RydWN0b3IgcHJvcGVydHkgbXVzdCBiZSBPYmplY3Rcblx0aWYgKG9iai5jb25zdHJ1Y3RvciAmJiAhaGFzT3duQ29uc3RydWN0b3IgJiYgIWhhc0lzUHJvdG90eXBlT2YpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyBPd24gcHJvcGVydGllcyBhcmUgZW51bWVyYXRlZCBmaXJzdGx5LCBzbyB0byBzcGVlZCB1cCxcblx0Ly8gaWYgbGFzdCBvbmUgaXMgb3duLCB0aGVuIGFsbCBwcm9wZXJ0aWVzIGFyZSBvd24uXG5cdHZhciBrZXk7XG5cdGZvciAoa2V5IGluIG9iaikgey8qKi99XG5cblx0cmV0dXJuIHR5cGVvZiBrZXkgPT09ICd1bmRlZmluZWQnIHx8IGhhc093bi5jYWxsKG9iaiwga2V5KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZXh0ZW5kKCkge1xuXHR2YXIgb3B0aW9ucywgbmFtZSwgc3JjLCBjb3B5LCBjb3B5SXNBcnJheSwgY2xvbmUsXG5cdFx0dGFyZ2V0ID0gYXJndW1lbnRzWzBdLFxuXHRcdGkgPSAxLFxuXHRcdGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGgsXG5cdFx0ZGVlcCA9IGZhbHNlO1xuXG5cdC8vIEhhbmRsZSBhIGRlZXAgY29weSBzaXR1YXRpb25cblx0aWYgKHR5cGVvZiB0YXJnZXQgPT09ICdib29sZWFuJykge1xuXHRcdGRlZXAgPSB0YXJnZXQ7XG5cdFx0dGFyZ2V0ID0gYXJndW1lbnRzWzFdIHx8IHt9O1xuXHRcdC8vIHNraXAgdGhlIGJvb2xlYW4gYW5kIHRoZSB0YXJnZXRcblx0XHRpID0gMjtcblx0fSBlbHNlIGlmICgodHlwZW9mIHRhcmdldCAhPT0gJ29iamVjdCcgJiYgdHlwZW9mIHRhcmdldCAhPT0gJ2Z1bmN0aW9uJykgfHwgdGFyZ2V0ID09IG51bGwpIHtcblx0XHR0YXJnZXQgPSB7fTtcblx0fVxuXG5cdGZvciAoOyBpIDwgbGVuZ3RoOyArK2kpIHtcblx0XHRvcHRpb25zID0gYXJndW1lbnRzW2ldO1xuXHRcdC8vIE9ubHkgZGVhbCB3aXRoIG5vbi1udWxsL3VuZGVmaW5lZCB2YWx1ZXNcblx0XHRpZiAob3B0aW9ucyAhPSBudWxsKSB7XG5cdFx0XHQvLyBFeHRlbmQgdGhlIGJhc2Ugb2JqZWN0XG5cdFx0XHRmb3IgKG5hbWUgaW4gb3B0aW9ucykge1xuXHRcdFx0XHRzcmMgPSB0YXJnZXRbbmFtZV07XG5cdFx0XHRcdGNvcHkgPSBvcHRpb25zW25hbWVdO1xuXG5cdFx0XHRcdC8vIFByZXZlbnQgbmV2ZXItZW5kaW5nIGxvb3Bcblx0XHRcdFx0aWYgKHRhcmdldCAhPT0gY29weSkge1xuXHRcdFx0XHRcdC8vIFJlY3Vyc2UgaWYgd2UncmUgbWVyZ2luZyBwbGFpbiBvYmplY3RzIG9yIGFycmF5c1xuXHRcdFx0XHRcdGlmIChkZWVwICYmIGNvcHkgJiYgKGlzUGxhaW5PYmplY3QoY29weSkgfHwgKGNvcHlJc0FycmF5ID0gaXNBcnJheShjb3B5KSkpKSB7XG5cdFx0XHRcdFx0XHRpZiAoY29weUlzQXJyYXkpIHtcblx0XHRcdFx0XHRcdFx0Y29weUlzQXJyYXkgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0Y2xvbmUgPSBzcmMgJiYgaXNBcnJheShzcmMpID8gc3JjIDogW107XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjbG9uZSA9IHNyYyAmJiBpc1BsYWluT2JqZWN0KHNyYykgPyBzcmMgOiB7fTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gTmV2ZXIgbW92ZSBvcmlnaW5hbCBvYmplY3RzLCBjbG9uZSB0aGVtXG5cdFx0XHRcdFx0XHR0YXJnZXRbbmFtZV0gPSBleHRlbmQoZGVlcCwgY2xvbmUsIGNvcHkpO1xuXG5cdFx0XHRcdFx0Ly8gRG9uJ3QgYnJpbmcgaW4gdW5kZWZpbmVkIHZhbHVlc1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGNvcHkgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdFx0XHR0YXJnZXRbbmFtZV0gPSBjb3B5O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIFJldHVybiB0aGUgbW9kaWZpZWQgb2JqZWN0XG5cdHJldHVybiB0YXJnZXQ7XG59O1xuXG4iLCIvLyBDb3B5cmlnaHQgMjAxNCBTaW1vbiBMeWRlbGxcclxuLy8gWDExICjigJxNSVTigJ0pIExpY2Vuc2VkLiAoU2VlIExJQ0VOU0UuKVxyXG5cclxudm9pZCAoZnVuY3Rpb24ocm9vdCwgZmFjdG9yeSkge1xyXG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xyXG4gICAgZGVmaW5lKGZhY3RvcnkpXHJcbiAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KClcclxuICB9IGVsc2Uge1xyXG4gICAgcm9vdC5yZXNvbHZlVXJsID0gZmFjdG9yeSgpXHJcbiAgfVxyXG59KHRoaXMsIGZ1bmN0aW9uKCkge1xyXG5cclxuICBmdW5jdGlvbiByZXNvbHZlVXJsKC8qIC4uLnVybHMgKi8pIHtcclxuICAgIHZhciBudW1VcmxzID0gYXJndW1lbnRzLmxlbmd0aFxyXG5cclxuICAgIGlmIChudW1VcmxzID09PSAwKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcInJlc29sdmVVcmwgcmVxdWlyZXMgYXQgbGVhc3Qgb25lIGFyZ3VtZW50OyBnb3Qgbm9uZS5cIilcclxuICAgIH1cclxuXHJcbiAgICB2YXIgYmFzZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJiYXNlXCIpXHJcbiAgICBiYXNlLmhyZWYgPSBhcmd1bWVudHNbMF1cclxuXHJcbiAgICBpZiAobnVtVXJscyA9PT0gMSkge1xyXG4gICAgICByZXR1cm4gYmFzZS5ocmVmXHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGhlYWQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcImhlYWRcIilbMF1cclxuICAgIGhlYWQuaW5zZXJ0QmVmb3JlKGJhc2UsIGhlYWQuZmlyc3RDaGlsZClcclxuXHJcbiAgICB2YXIgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpXHJcbiAgICB2YXIgcmVzb2x2ZWRcclxuXHJcbiAgICBmb3IgKHZhciBpbmRleCA9IDE7IGluZGV4IDwgbnVtVXJsczsgaW5kZXgrKykge1xyXG4gICAgICBhLmhyZWYgPSBhcmd1bWVudHNbaW5kZXhdXHJcbiAgICAgIHJlc29sdmVkID0gYS5ocmVmXHJcbiAgICAgIGJhc2UuaHJlZiA9IHJlc29sdmVkXHJcbiAgICB9XHJcblxyXG4gICAgaGVhZC5yZW1vdmVDaGlsZChiYXNlKVxyXG5cclxuICAgIHJldHVybiByZXNvbHZlZFxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHJlc29sdmVVcmxcclxuXHJcbn0pKTtcclxuIiwiKGZ1bmN0aW9uKHNlbGYpIHtcbiAgJ3VzZSBzdHJpY3QnO1xuXG4gIGlmIChzZWxmLmZldGNoKSB7XG4gICAgcmV0dXJuXG4gIH1cblxuICB2YXIgc3VwcG9ydCA9IHtcbiAgICBzZWFyY2hQYXJhbXM6ICdVUkxTZWFyY2hQYXJhbXMnIGluIHNlbGYsXG4gICAgaXRlcmFibGU6ICdTeW1ib2wnIGluIHNlbGYgJiYgJ2l0ZXJhdG9yJyBpbiBTeW1ib2wsXG4gICAgYmxvYjogJ0ZpbGVSZWFkZXInIGluIHNlbGYgJiYgJ0Jsb2InIGluIHNlbGYgJiYgKGZ1bmN0aW9uKCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgbmV3IEJsb2IoKVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgfVxuICAgIH0pKCksXG4gICAgZm9ybURhdGE6ICdGb3JtRGF0YScgaW4gc2VsZixcbiAgICBhcnJheUJ1ZmZlcjogJ0FycmF5QnVmZmVyJyBpbiBzZWxmXG4gIH1cblxuICBmdW5jdGlvbiBub3JtYWxpemVOYW1lKG5hbWUpIHtcbiAgICBpZiAodHlwZW9mIG5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICBuYW1lID0gU3RyaW5nKG5hbWUpXG4gICAgfVxuICAgIGlmICgvW15hLXowLTlcXC0jJCUmJyorLlxcXl9gfH5dL2kudGVzdChuYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignSW52YWxpZCBjaGFyYWN0ZXIgaW4gaGVhZGVyIGZpZWxkIG5hbWUnKVxuICAgIH1cbiAgICByZXR1cm4gbmFtZS50b0xvd2VyQ2FzZSgpXG4gIH1cblxuICBmdW5jdGlvbiBub3JtYWxpemVWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB2YWx1ZSA9IFN0cmluZyh2YWx1ZSlcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlXG4gIH1cblxuICAvLyBCdWlsZCBhIGRlc3RydWN0aXZlIGl0ZXJhdG9yIGZvciB0aGUgdmFsdWUgbGlzdFxuICBmdW5jdGlvbiBpdGVyYXRvckZvcihpdGVtcykge1xuICAgIHZhciBpdGVyYXRvciA9IHtcbiAgICAgIG5leHQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgdmFsdWUgPSBpdGVtcy5zaGlmdCgpXG4gICAgICAgIHJldHVybiB7ZG9uZTogdmFsdWUgPT09IHVuZGVmaW5lZCwgdmFsdWU6IHZhbHVlfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzdXBwb3J0Lml0ZXJhYmxlKSB7XG4gICAgICBpdGVyYXRvcltTeW1ib2wuaXRlcmF0b3JdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBpdGVyYXRvclxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBpdGVyYXRvclxuICB9XG5cbiAgZnVuY3Rpb24gSGVhZGVycyhoZWFkZXJzKSB7XG4gICAgdGhpcy5tYXAgPSB7fVxuXG4gICAgaWYgKGhlYWRlcnMgaW5zdGFuY2VvZiBIZWFkZXJzKSB7XG4gICAgICBoZWFkZXJzLmZvckVhY2goZnVuY3Rpb24odmFsdWUsIG5hbWUpIHtcbiAgICAgICAgdGhpcy5hcHBlbmQobmFtZSwgdmFsdWUpXG4gICAgICB9LCB0aGlzKVxuXG4gICAgfSBlbHNlIGlmIChoZWFkZXJzKSB7XG4gICAgICBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhoZWFkZXJzKS5mb3JFYWNoKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgdGhpcy5hcHBlbmQobmFtZSwgaGVhZGVyc1tuYW1lXSlcbiAgICAgIH0sIHRoaXMpXG4gICAgfVxuICB9XG5cbiAgSGVhZGVycy5wcm90b3R5cGUuYXBwZW5kID0gZnVuY3Rpb24obmFtZSwgdmFsdWUpIHtcbiAgICBuYW1lID0gbm9ybWFsaXplTmFtZShuYW1lKVxuICAgIHZhbHVlID0gbm9ybWFsaXplVmFsdWUodmFsdWUpXG4gICAgdmFyIGxpc3QgPSB0aGlzLm1hcFtuYW1lXVxuICAgIGlmICghbGlzdCkge1xuICAgICAgbGlzdCA9IFtdXG4gICAgICB0aGlzLm1hcFtuYW1lXSA9IGxpc3RcbiAgICB9XG4gICAgbGlzdC5wdXNoKHZhbHVlKVxuICB9XG5cbiAgSGVhZGVycy5wcm90b3R5cGVbJ2RlbGV0ZSddID0gZnVuY3Rpb24obmFtZSkge1xuICAgIGRlbGV0ZSB0aGlzLm1hcFtub3JtYWxpemVOYW1lKG5hbWUpXVxuICB9XG5cbiAgSGVhZGVycy5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24obmFtZSkge1xuICAgIHZhciB2YWx1ZXMgPSB0aGlzLm1hcFtub3JtYWxpemVOYW1lKG5hbWUpXVxuICAgIHJldHVybiB2YWx1ZXMgPyB2YWx1ZXNbMF0gOiBudWxsXG4gIH1cblxuICBIZWFkZXJzLnByb3RvdHlwZS5nZXRBbGwgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgcmV0dXJuIHRoaXMubWFwW25vcm1hbGl6ZU5hbWUobmFtZSldIHx8IFtdXG4gIH1cblxuICBIZWFkZXJzLnByb3RvdHlwZS5oYXMgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgcmV0dXJuIHRoaXMubWFwLmhhc093blByb3BlcnR5KG5vcm1hbGl6ZU5hbWUobmFtZSkpXG4gIH1cblxuICBIZWFkZXJzLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuICAgIHRoaXMubWFwW25vcm1hbGl6ZU5hbWUobmFtZSldID0gW25vcm1hbGl6ZVZhbHVlKHZhbHVlKV1cbiAgfVxuXG4gIEhlYWRlcnMucHJvdG90eXBlLmZvckVhY2ggPSBmdW5jdGlvbihjYWxsYmFjaywgdGhpc0FyZykge1xuICAgIE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHRoaXMubWFwKS5mb3JFYWNoKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHRoaXMubWFwW25hbWVdLmZvckVhY2goZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgY2FsbGJhY2suY2FsbCh0aGlzQXJnLCB2YWx1ZSwgbmFtZSwgdGhpcylcbiAgICAgIH0sIHRoaXMpXG4gICAgfSwgdGhpcylcbiAgfVxuXG4gIEhlYWRlcnMucHJvdG90eXBlLmtleXMgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgaXRlbXMgPSBbXVxuICAgIHRoaXMuZm9yRWFjaChmdW5jdGlvbih2YWx1ZSwgbmFtZSkgeyBpdGVtcy5wdXNoKG5hbWUpIH0pXG4gICAgcmV0dXJuIGl0ZXJhdG9yRm9yKGl0ZW1zKVxuICB9XG5cbiAgSGVhZGVycy5wcm90b3R5cGUudmFsdWVzID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGl0ZW1zID0gW11cbiAgICB0aGlzLmZvckVhY2goZnVuY3Rpb24odmFsdWUpIHsgaXRlbXMucHVzaCh2YWx1ZSkgfSlcbiAgICByZXR1cm4gaXRlcmF0b3JGb3IoaXRlbXMpXG4gIH1cblxuICBIZWFkZXJzLnByb3RvdHlwZS5lbnRyaWVzID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGl0ZW1zID0gW11cbiAgICB0aGlzLmZvckVhY2goZnVuY3Rpb24odmFsdWUsIG5hbWUpIHsgaXRlbXMucHVzaChbbmFtZSwgdmFsdWVdKSB9KVxuICAgIHJldHVybiBpdGVyYXRvckZvcihpdGVtcylcbiAgfVxuXG4gIGlmIChzdXBwb3J0Lml0ZXJhYmxlKSB7XG4gICAgSGVhZGVycy5wcm90b3R5cGVbU3ltYm9sLml0ZXJhdG9yXSA9IEhlYWRlcnMucHJvdG90eXBlLmVudHJpZXNcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbnN1bWVkKGJvZHkpIHtcbiAgICBpZiAoYm9keS5ib2R5VXNlZCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBUeXBlRXJyb3IoJ0FscmVhZHkgcmVhZCcpKVxuICAgIH1cbiAgICBib2R5LmJvZHlVc2VkID0gdHJ1ZVxuICB9XG5cbiAgZnVuY3Rpb24gZmlsZVJlYWRlclJlYWR5KHJlYWRlcikge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgIHJlYWRlci5vbmxvYWQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVzb2x2ZShyZWFkZXIucmVzdWx0KVxuICAgICAgfVxuICAgICAgcmVhZGVyLm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVqZWN0KHJlYWRlci5lcnJvcilcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgZnVuY3Rpb24gcmVhZEJsb2JBc0FycmF5QnVmZmVyKGJsb2IpIHtcbiAgICB2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKVxuICAgIHJlYWRlci5yZWFkQXNBcnJheUJ1ZmZlcihibG9iKVxuICAgIHJldHVybiBmaWxlUmVhZGVyUmVhZHkocmVhZGVyKVxuICB9XG5cbiAgZnVuY3Rpb24gcmVhZEJsb2JBc1RleHQoYmxvYikge1xuICAgIHZhciByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpXG4gICAgcmVhZGVyLnJlYWRBc1RleHQoYmxvYilcbiAgICByZXR1cm4gZmlsZVJlYWRlclJlYWR5KHJlYWRlcilcbiAgfVxuXG4gIGZ1bmN0aW9uIEJvZHkoKSB7XG4gICAgdGhpcy5ib2R5VXNlZCA9IGZhbHNlXG5cbiAgICB0aGlzLl9pbml0Qm9keSA9IGZ1bmN0aW9uKGJvZHkpIHtcbiAgICAgIHRoaXMuX2JvZHlJbml0ID0gYm9keVxuICAgICAgaWYgKHR5cGVvZiBib2R5ID09PSAnc3RyaW5nJykge1xuICAgICAgICB0aGlzLl9ib2R5VGV4dCA9IGJvZHlcbiAgICAgIH0gZWxzZSBpZiAoc3VwcG9ydC5ibG9iICYmIEJsb2IucHJvdG90eXBlLmlzUHJvdG90eXBlT2YoYm9keSkpIHtcbiAgICAgICAgdGhpcy5fYm9keUJsb2IgPSBib2R5XG4gICAgICB9IGVsc2UgaWYgKHN1cHBvcnQuZm9ybURhdGEgJiYgRm9ybURhdGEucHJvdG90eXBlLmlzUHJvdG90eXBlT2YoYm9keSkpIHtcbiAgICAgICAgdGhpcy5fYm9keUZvcm1EYXRhID0gYm9keVxuICAgICAgfSBlbHNlIGlmIChzdXBwb3J0LnNlYXJjaFBhcmFtcyAmJiBVUkxTZWFyY2hQYXJhbXMucHJvdG90eXBlLmlzUHJvdG90eXBlT2YoYm9keSkpIHtcbiAgICAgICAgdGhpcy5fYm9keVRleHQgPSBib2R5LnRvU3RyaW5nKClcbiAgICAgIH0gZWxzZSBpZiAoIWJvZHkpIHtcbiAgICAgICAgdGhpcy5fYm9keVRleHQgPSAnJ1xuICAgICAgfSBlbHNlIGlmIChzdXBwb3J0LmFycmF5QnVmZmVyICYmIEFycmF5QnVmZmVyLnByb3RvdHlwZS5pc1Byb3RvdHlwZU9mKGJvZHkpKSB7XG4gICAgICAgIC8vIE9ubHkgc3VwcG9ydCBBcnJheUJ1ZmZlcnMgZm9yIFBPU1QgbWV0aG9kLlxuICAgICAgICAvLyBSZWNlaXZpbmcgQXJyYXlCdWZmZXJzIGhhcHBlbnMgdmlhIEJsb2JzLCBpbnN0ZWFkLlxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBCb2R5SW5pdCB0eXBlJylcbiAgICAgIH1cblxuICAgICAgaWYgKCF0aGlzLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKSkge1xuICAgICAgICBpZiAodHlwZW9mIGJvZHkgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhpcy5oZWFkZXJzLnNldCgnY29udGVudC10eXBlJywgJ3RleHQvcGxhaW47Y2hhcnNldD1VVEYtOCcpXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fYm9keUJsb2IgJiYgdGhpcy5fYm9keUJsb2IudHlwZSkge1xuICAgICAgICAgIHRoaXMuaGVhZGVycy5zZXQoJ2NvbnRlbnQtdHlwZScsIHRoaXMuX2JvZHlCbG9iLnR5cGUpXG4gICAgICAgIH0gZWxzZSBpZiAoc3VwcG9ydC5zZWFyY2hQYXJhbXMgJiYgVVJMU2VhcmNoUGFyYW1zLnByb3RvdHlwZS5pc1Byb3RvdHlwZU9mKGJvZHkpKSB7XG4gICAgICAgICAgdGhpcy5oZWFkZXJzLnNldCgnY29udGVudC10eXBlJywgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZDtjaGFyc2V0PVVURi04JylcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzdXBwb3J0LmJsb2IpIHtcbiAgICAgIHRoaXMuYmxvYiA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcmVqZWN0ZWQgPSBjb25zdW1lZCh0aGlzKVxuICAgICAgICBpZiAocmVqZWN0ZWQpIHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0ZWRcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9ib2R5QmxvYikge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5fYm9keUJsb2IpXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fYm9keUZvcm1EYXRhKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjb3VsZCBub3QgcmVhZCBGb3JtRGF0YSBib2R5IGFzIGJsb2InKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUobmV3IEJsb2IoW3RoaXMuX2JvZHlUZXh0XSkpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5hcnJheUJ1ZmZlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5ibG9iKCkudGhlbihyZWFkQmxvYkFzQXJyYXlCdWZmZXIpXG4gICAgICB9XG5cbiAgICAgIHRoaXMudGV4dCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcmVqZWN0ZWQgPSBjb25zdW1lZCh0aGlzKVxuICAgICAgICBpZiAocmVqZWN0ZWQpIHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0ZWRcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLl9ib2R5QmxvYikge1xuICAgICAgICAgIHJldHVybiByZWFkQmxvYkFzVGV4dCh0aGlzLl9ib2R5QmxvYilcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9ib2R5Rm9ybURhdGEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NvdWxkIG5vdCByZWFkIEZvcm1EYXRhIGJvZHkgYXMgdGV4dCcpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLl9ib2R5VGV4dClcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnRleHQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHJlamVjdGVkID0gY29uc3VtZWQodGhpcylcbiAgICAgICAgcmV0dXJuIHJlamVjdGVkID8gcmVqZWN0ZWQgOiBQcm9taXNlLnJlc29sdmUodGhpcy5fYm9keVRleHQpXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHN1cHBvcnQuZm9ybURhdGEpIHtcbiAgICAgIHRoaXMuZm9ybURhdGEgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudGV4dCgpLnRoZW4oZGVjb2RlKVxuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuanNvbiA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHRoaXMudGV4dCgpLnRoZW4oSlNPTi5wYXJzZSlcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpc1xuICB9XG5cbiAgLy8gSFRUUCBtZXRob2RzIHdob3NlIGNhcGl0YWxpemF0aW9uIHNob3VsZCBiZSBub3JtYWxpemVkXG4gIHZhciBtZXRob2RzID0gWydERUxFVEUnLCAnR0VUJywgJ0hFQUQnLCAnT1BUSU9OUycsICdQT1NUJywgJ1BVVCddXG5cbiAgZnVuY3Rpb24gbm9ybWFsaXplTWV0aG9kKG1ldGhvZCkge1xuICAgIHZhciB1cGNhc2VkID0gbWV0aG9kLnRvVXBwZXJDYXNlKClcbiAgICByZXR1cm4gKG1ldGhvZHMuaW5kZXhPZih1cGNhc2VkKSA+IC0xKSA/IHVwY2FzZWQgOiBtZXRob2RcbiAgfVxuXG4gIGZ1bmN0aW9uIFJlcXVlc3QoaW5wdXQsIG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuICAgIHZhciBib2R5ID0gb3B0aW9ucy5ib2R5XG4gICAgaWYgKFJlcXVlc3QucHJvdG90eXBlLmlzUHJvdG90eXBlT2YoaW5wdXQpKSB7XG4gICAgICBpZiAoaW5wdXQuYm9keVVzZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQWxyZWFkeSByZWFkJylcbiAgICAgIH1cbiAgICAgIHRoaXMudXJsID0gaW5wdXQudXJsXG4gICAgICB0aGlzLmNyZWRlbnRpYWxzID0gaW5wdXQuY3JlZGVudGlhbHNcbiAgICAgIGlmICghb3B0aW9ucy5oZWFkZXJzKSB7XG4gICAgICAgIHRoaXMuaGVhZGVycyA9IG5ldyBIZWFkZXJzKGlucHV0LmhlYWRlcnMpXG4gICAgICB9XG4gICAgICB0aGlzLm1ldGhvZCA9IGlucHV0Lm1ldGhvZFxuICAgICAgdGhpcy5tb2RlID0gaW5wdXQubW9kZVxuICAgICAgaWYgKCFib2R5KSB7XG4gICAgICAgIGJvZHkgPSBpbnB1dC5fYm9keUluaXRcbiAgICAgICAgaW5wdXQuYm9keVVzZWQgPSB0cnVlXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMudXJsID0gaW5wdXRcbiAgICB9XG5cbiAgICB0aGlzLmNyZWRlbnRpYWxzID0gb3B0aW9ucy5jcmVkZW50aWFscyB8fCB0aGlzLmNyZWRlbnRpYWxzIHx8ICdvbWl0J1xuICAgIGlmIChvcHRpb25zLmhlYWRlcnMgfHwgIXRoaXMuaGVhZGVycykge1xuICAgICAgdGhpcy5oZWFkZXJzID0gbmV3IEhlYWRlcnMob3B0aW9ucy5oZWFkZXJzKVxuICAgIH1cbiAgICB0aGlzLm1ldGhvZCA9IG5vcm1hbGl6ZU1ldGhvZChvcHRpb25zLm1ldGhvZCB8fCB0aGlzLm1ldGhvZCB8fCAnR0VUJylcbiAgICB0aGlzLm1vZGUgPSBvcHRpb25zLm1vZGUgfHwgdGhpcy5tb2RlIHx8IG51bGxcbiAgICB0aGlzLnJlZmVycmVyID0gbnVsbFxuXG4gICAgaWYgKCh0aGlzLm1ldGhvZCA9PT0gJ0dFVCcgfHwgdGhpcy5tZXRob2QgPT09ICdIRUFEJykgJiYgYm9keSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQm9keSBub3QgYWxsb3dlZCBmb3IgR0VUIG9yIEhFQUQgcmVxdWVzdHMnKVxuICAgIH1cbiAgICB0aGlzLl9pbml0Qm9keShib2R5KVxuICB9XG5cbiAgUmVxdWVzdC5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IFJlcXVlc3QodGhpcylcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlY29kZShib2R5KSB7XG4gICAgdmFyIGZvcm0gPSBuZXcgRm9ybURhdGEoKVxuICAgIGJvZHkudHJpbSgpLnNwbGl0KCcmJykuZm9yRWFjaChmdW5jdGlvbihieXRlcykge1xuICAgICAgaWYgKGJ5dGVzKSB7XG4gICAgICAgIHZhciBzcGxpdCA9IGJ5dGVzLnNwbGl0KCc9JylcbiAgICAgICAgdmFyIG5hbWUgPSBzcGxpdC5zaGlmdCgpLnJlcGxhY2UoL1xcKy9nLCAnICcpXG4gICAgICAgIHZhciB2YWx1ZSA9IHNwbGl0LmpvaW4oJz0nKS5yZXBsYWNlKC9cXCsvZywgJyAnKVxuICAgICAgICBmb3JtLmFwcGVuZChkZWNvZGVVUklDb21wb25lbnQobmFtZSksIGRlY29kZVVSSUNvbXBvbmVudCh2YWx1ZSkpXG4gICAgICB9XG4gICAgfSlcbiAgICByZXR1cm4gZm9ybVxuICB9XG5cbiAgZnVuY3Rpb24gaGVhZGVycyh4aHIpIHtcbiAgICB2YXIgaGVhZCA9IG5ldyBIZWFkZXJzKClcbiAgICB2YXIgcGFpcnMgPSAoeGhyLmdldEFsbFJlc3BvbnNlSGVhZGVycygpIHx8ICcnKS50cmltKCkuc3BsaXQoJ1xcbicpXG4gICAgcGFpcnMuZm9yRWFjaChmdW5jdGlvbihoZWFkZXIpIHtcbiAgICAgIHZhciBzcGxpdCA9IGhlYWRlci50cmltKCkuc3BsaXQoJzonKVxuICAgICAgdmFyIGtleSA9IHNwbGl0LnNoaWZ0KCkudHJpbSgpXG4gICAgICB2YXIgdmFsdWUgPSBzcGxpdC5qb2luKCc6JykudHJpbSgpXG4gICAgICBoZWFkLmFwcGVuZChrZXksIHZhbHVlKVxuICAgIH0pXG4gICAgcmV0dXJuIGhlYWRcbiAgfVxuXG4gIEJvZHkuY2FsbChSZXF1ZXN0LnByb3RvdHlwZSlcblxuICBmdW5jdGlvbiBSZXNwb25zZShib2R5SW5pdCwgb3B0aW9ucykge1xuICAgIGlmICghb3B0aW9ucykge1xuICAgICAgb3B0aW9ucyA9IHt9XG4gICAgfVxuXG4gICAgdGhpcy50eXBlID0gJ2RlZmF1bHQnXG4gICAgdGhpcy5zdGF0dXMgPSBvcHRpb25zLnN0YXR1c1xuICAgIHRoaXMub2sgPSB0aGlzLnN0YXR1cyA+PSAyMDAgJiYgdGhpcy5zdGF0dXMgPCAzMDBcbiAgICB0aGlzLnN0YXR1c1RleHQgPSBvcHRpb25zLnN0YXR1c1RleHRcbiAgICB0aGlzLmhlYWRlcnMgPSBvcHRpb25zLmhlYWRlcnMgaW5zdGFuY2VvZiBIZWFkZXJzID8gb3B0aW9ucy5oZWFkZXJzIDogbmV3IEhlYWRlcnMob3B0aW9ucy5oZWFkZXJzKVxuICAgIHRoaXMudXJsID0gb3B0aW9ucy51cmwgfHwgJydcbiAgICB0aGlzLl9pbml0Qm9keShib2R5SW5pdClcbiAgfVxuXG4gIEJvZHkuY2FsbChSZXNwb25zZS5wcm90b3R5cGUpXG5cbiAgUmVzcG9uc2UucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZSh0aGlzLl9ib2R5SW5pdCwge1xuICAgICAgc3RhdHVzOiB0aGlzLnN0YXR1cyxcbiAgICAgIHN0YXR1c1RleHQ6IHRoaXMuc3RhdHVzVGV4dCxcbiAgICAgIGhlYWRlcnM6IG5ldyBIZWFkZXJzKHRoaXMuaGVhZGVycyksXG4gICAgICB1cmw6IHRoaXMudXJsXG4gICAgfSlcbiAgfVxuXG4gIFJlc3BvbnNlLmVycm9yID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHJlc3BvbnNlID0gbmV3IFJlc3BvbnNlKG51bGwsIHtzdGF0dXM6IDAsIHN0YXR1c1RleHQ6ICcnfSlcbiAgICByZXNwb25zZS50eXBlID0gJ2Vycm9yJ1xuICAgIHJldHVybiByZXNwb25zZVxuICB9XG5cbiAgdmFyIHJlZGlyZWN0U3RhdHVzZXMgPSBbMzAxLCAzMDIsIDMwMywgMzA3LCAzMDhdXG5cbiAgUmVzcG9uc2UucmVkaXJlY3QgPSBmdW5jdGlvbih1cmwsIHN0YXR1cykge1xuICAgIGlmIChyZWRpcmVjdFN0YXR1c2VzLmluZGV4T2Yoc3RhdHVzKSA9PT0gLTEpIHtcbiAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdJbnZhbGlkIHN0YXR1cyBjb2RlJylcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKG51bGwsIHtzdGF0dXM6IHN0YXR1cywgaGVhZGVyczoge2xvY2F0aW9uOiB1cmx9fSlcbiAgfVxuXG4gIHNlbGYuSGVhZGVycyA9IEhlYWRlcnNcbiAgc2VsZi5SZXF1ZXN0ID0gUmVxdWVzdFxuICBzZWxmLlJlc3BvbnNlID0gUmVzcG9uc2VcblxuICBzZWxmLmZldGNoID0gZnVuY3Rpb24oaW5wdXQsIGluaXQpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICB2YXIgcmVxdWVzdFxuICAgICAgaWYgKFJlcXVlc3QucHJvdG90eXBlLmlzUHJvdG90eXBlT2YoaW5wdXQpICYmICFpbml0KSB7XG4gICAgICAgIHJlcXVlc3QgPSBpbnB1dFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVxdWVzdCA9IG5ldyBSZXF1ZXN0KGlucHV0LCBpbml0KVxuICAgICAgfVxuXG4gICAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KClcblxuICAgICAgZnVuY3Rpb24gcmVzcG9uc2VVUkwoKSB7XG4gICAgICAgIGlmICgncmVzcG9uc2VVUkwnIGluIHhocikge1xuICAgICAgICAgIHJldHVybiB4aHIucmVzcG9uc2VVUkxcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEF2b2lkIHNlY3VyaXR5IHdhcm5pbmdzIG9uIGdldFJlc3BvbnNlSGVhZGVyIHdoZW4gbm90IGFsbG93ZWQgYnkgQ09SU1xuICAgICAgICBpZiAoL15YLVJlcXVlc3QtVVJMOi9tLnRlc3QoeGhyLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKSkge1xuICAgICAgICAgIHJldHVybiB4aHIuZ2V0UmVzcG9uc2VIZWFkZXIoJ1gtUmVxdWVzdC1VUkwnKVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHhoci5vbmxvYWQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSB7XG4gICAgICAgICAgc3RhdHVzOiB4aHIuc3RhdHVzLFxuICAgICAgICAgIHN0YXR1c1RleHQ6IHhoci5zdGF0dXNUZXh0LFxuICAgICAgICAgIGhlYWRlcnM6IGhlYWRlcnMoeGhyKSxcbiAgICAgICAgICB1cmw6IHJlc3BvbnNlVVJMKClcbiAgICAgICAgfVxuICAgICAgICB2YXIgYm9keSA9ICdyZXNwb25zZScgaW4geGhyID8geGhyLnJlc3BvbnNlIDogeGhyLnJlc3BvbnNlVGV4dFxuICAgICAgICByZXNvbHZlKG5ldyBSZXNwb25zZShib2R5LCBvcHRpb25zKSlcbiAgICAgIH1cblxuICAgICAgeGhyLm9uZXJyb3IgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmVqZWN0KG5ldyBUeXBlRXJyb3IoJ05ldHdvcmsgcmVxdWVzdCBmYWlsZWQnKSlcbiAgICAgIH1cblxuICAgICAgeGhyLm9udGltZW91dCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZWplY3QobmV3IFR5cGVFcnJvcignTmV0d29yayByZXF1ZXN0IGZhaWxlZCcpKVxuICAgICAgfVxuXG4gICAgICB4aHIub3BlbihyZXF1ZXN0Lm1ldGhvZCwgcmVxdWVzdC51cmwsIHRydWUpXG5cbiAgICAgIGlmIChyZXF1ZXN0LmNyZWRlbnRpYWxzID09PSAnaW5jbHVkZScpIHtcbiAgICAgICAgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWVcbiAgICAgIH1cblxuICAgICAgaWYgKCdyZXNwb25zZVR5cGUnIGluIHhociAmJiBzdXBwb3J0LmJsb2IpIHtcbiAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdibG9iJ1xuICAgICAgfVxuXG4gICAgICByZXF1ZXN0LmhlYWRlcnMuZm9yRWFjaChmdW5jdGlvbih2YWx1ZSwgbmFtZSkge1xuICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihuYW1lLCB2YWx1ZSlcbiAgICAgIH0pXG5cbiAgICAgIHhoci5zZW5kKHR5cGVvZiByZXF1ZXN0Ll9ib2R5SW5pdCA9PT0gJ3VuZGVmaW5lZCcgPyBudWxsIDogcmVxdWVzdC5fYm9keUluaXQpXG4gICAgfSlcbiAgfVxuICBzZWxmLmZldGNoLnBvbHlmaWxsID0gdHJ1ZVxufSkodHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnID8gc2VsZiA6IHRoaXMpO1xuIiwidmFyIGJlbCA9IHJlcXVpcmUoJ2JlbCcpIC8vIHR1cm5zIHRlbXBsYXRlIHRhZyBpbnRvIERPTSBlbGVtZW50c1xudmFyIG1vcnBoZG9tID0gcmVxdWlyZSgnbW9ycGhkb20nKSAvLyBlZmZpY2llbnRseSBkaWZmcyArIG1vcnBocyB0d28gRE9NIGVsZW1lbnRzXG52YXIgZGVmYXVsdEV2ZW50cyA9IHJlcXVpcmUoJy4vdXBkYXRlLWV2ZW50cy5qcycpIC8vIGRlZmF1bHQgZXZlbnRzIHRvIGJlIGNvcGllZCB3aGVuIGRvbSBlbGVtZW50cyB1cGRhdGVcblxubW9kdWxlLmV4cG9ydHMgPSBiZWxcblxuLy8gVE9ETyBtb3ZlIHRoaXMgKyBkZWZhdWx0RXZlbnRzIHRvIGEgbmV3IG1vZHVsZSBvbmNlIHdlIHJlY2VpdmUgbW9yZSBmZWVkYmFja1xubW9kdWxlLmV4cG9ydHMudXBkYXRlID0gZnVuY3Rpb24gKGZyb21Ob2RlLCB0b05vZGUsIG9wdHMpIHtcbiAgaWYgKCFvcHRzKSBvcHRzID0ge31cbiAgaWYgKG9wdHMuZXZlbnRzICE9PSBmYWxzZSkge1xuICAgIGlmICghb3B0cy5vbkJlZm9yZUVsVXBkYXRlZCkgb3B0cy5vbkJlZm9yZUVsVXBkYXRlZCA9IGNvcGllclxuICB9XG5cbiAgcmV0dXJuIG1vcnBoZG9tKGZyb21Ob2RlLCB0b05vZGUsIG9wdHMpXG5cbiAgLy8gbW9ycGhkb20gb25seSBjb3BpZXMgYXR0cmlidXRlcy4gd2UgZGVjaWRlZCB3ZSBhbHNvIHdhbnRlZCB0byBjb3B5IGV2ZW50c1xuICAvLyB0aGF0IGNhbiBiZSBzZXQgdmlhIGF0dHJpYnV0ZXNcbiAgZnVuY3Rpb24gY29waWVyIChmLCB0KSB7XG4gICAgLy8gY29weSBldmVudHM6XG4gICAgdmFyIGV2ZW50cyA9IG9wdHMuZXZlbnRzIHx8IGRlZmF1bHRFdmVudHNcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGV2ZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGV2ID0gZXZlbnRzW2ldXG4gICAgICBpZiAodFtldl0pIHsgLy8gaWYgbmV3IGVsZW1lbnQgaGFzIGEgd2hpdGVsaXN0ZWQgYXR0cmlidXRlXG4gICAgICAgIGZbZXZdID0gdFtldl0gLy8gdXBkYXRlIGV4aXN0aW5nIGVsZW1lbnRcbiAgICAgIH0gZWxzZSBpZiAoZltldl0pIHsgLy8gaWYgZXhpc3RpbmcgZWxlbWVudCBoYXMgaXQgYW5kIG5ldyBvbmUgZG9lc250XG4gICAgICAgIGZbZXZdID0gdW5kZWZpbmVkIC8vIHJlbW92ZSBpdCBmcm9tIGV4aXN0aW5nIGVsZW1lbnRcbiAgICAgIH1cbiAgICB9XG4gICAgdmFyIG9sZFZhbHVlID0gZi52YWx1ZVxuICAgIHZhciBuZXdWYWx1ZSA9IHQudmFsdWVcbiAgICAvLyBjb3B5IHZhbHVlcyBmb3IgZm9ybSBlbGVtZW50c1xuICAgIGlmICgoZi5ub2RlTmFtZSA9PT0gJ0lOUFVUJyAmJiBmLnR5cGUgIT09ICdmaWxlJykgfHwgZi5ub2RlTmFtZSA9PT0gJ1NFTEVDVCcpIHtcbiAgICAgIGlmICghbmV3VmFsdWUpIHtcbiAgICAgICAgdC52YWx1ZSA9IGYudmFsdWVcbiAgICAgIH0gZWxzZSBpZiAobmV3VmFsdWUgIT09IG9sZFZhbHVlKSB7XG4gICAgICAgIGYudmFsdWUgPSBuZXdWYWx1ZVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZi5ub2RlTmFtZSA9PT0gJ1RFWFRBUkVBJykge1xuICAgICAgaWYgKHQuZ2V0QXR0cmlidXRlKCd2YWx1ZScpID09PSBudWxsKSBmLnZhbHVlID0gdC52YWx1ZVxuICAgIH1cbiAgfVxufVxuIiwidmFyIGRvY3VtZW50ID0gcmVxdWlyZSgnZ2xvYmFsL2RvY3VtZW50JylcbnZhciBoeXBlcnggPSByZXF1aXJlKCdoeXBlcngnKVxudmFyIG9ubG9hZCA9IHJlcXVpcmUoJ29uLWxvYWQnKVxuXG52YXIgU1ZHTlMgPSAnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnXG52YXIgWExJTktOUyA9ICdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rJ1xuXG52YXIgQk9PTF9QUk9QUyA9IHtcbiAgYXV0b2ZvY3VzOiAxLFxuICBjaGVja2VkOiAxLFxuICBkZWZhdWx0Y2hlY2tlZDogMSxcbiAgZGlzYWJsZWQ6IDEsXG4gIGZvcm1ub3ZhbGlkYXRlOiAxLFxuICBpbmRldGVybWluYXRlOiAxLFxuICByZWFkb25seTogMSxcbiAgcmVxdWlyZWQ6IDEsXG4gIHNlbGVjdGVkOiAxLFxuICB3aWxsdmFsaWRhdGU6IDFcbn1cbnZhciBTVkdfVEFHUyA9IFtcbiAgJ3N2ZycsXG4gICdhbHRHbHlwaCcsICdhbHRHbHlwaERlZicsICdhbHRHbHlwaEl0ZW0nLCAnYW5pbWF0ZScsICdhbmltYXRlQ29sb3InLFxuICAnYW5pbWF0ZU1vdGlvbicsICdhbmltYXRlVHJhbnNmb3JtJywgJ2NpcmNsZScsICdjbGlwUGF0aCcsICdjb2xvci1wcm9maWxlJyxcbiAgJ2N1cnNvcicsICdkZWZzJywgJ2Rlc2MnLCAnZWxsaXBzZScsICdmZUJsZW5kJywgJ2ZlQ29sb3JNYXRyaXgnLFxuICAnZmVDb21wb25lbnRUcmFuc2ZlcicsICdmZUNvbXBvc2l0ZScsICdmZUNvbnZvbHZlTWF0cml4JywgJ2ZlRGlmZnVzZUxpZ2h0aW5nJyxcbiAgJ2ZlRGlzcGxhY2VtZW50TWFwJywgJ2ZlRGlzdGFudExpZ2h0JywgJ2ZlRmxvb2QnLCAnZmVGdW5jQScsICdmZUZ1bmNCJyxcbiAgJ2ZlRnVuY0cnLCAnZmVGdW5jUicsICdmZUdhdXNzaWFuQmx1cicsICdmZUltYWdlJywgJ2ZlTWVyZ2UnLCAnZmVNZXJnZU5vZGUnLFxuICAnZmVNb3JwaG9sb2d5JywgJ2ZlT2Zmc2V0JywgJ2ZlUG9pbnRMaWdodCcsICdmZVNwZWN1bGFyTGlnaHRpbmcnLFxuICAnZmVTcG90TGlnaHQnLCAnZmVUaWxlJywgJ2ZlVHVyYnVsZW5jZScsICdmaWx0ZXInLCAnZm9udCcsICdmb250LWZhY2UnLFxuICAnZm9udC1mYWNlLWZvcm1hdCcsICdmb250LWZhY2UtbmFtZScsICdmb250LWZhY2Utc3JjJywgJ2ZvbnQtZmFjZS11cmknLFxuICAnZm9yZWlnbk9iamVjdCcsICdnJywgJ2dseXBoJywgJ2dseXBoUmVmJywgJ2hrZXJuJywgJ2ltYWdlJywgJ2xpbmUnLFxuICAnbGluZWFyR3JhZGllbnQnLCAnbWFya2VyJywgJ21hc2snLCAnbWV0YWRhdGEnLCAnbWlzc2luZy1nbHlwaCcsICdtcGF0aCcsXG4gICdwYXRoJywgJ3BhdHRlcm4nLCAncG9seWdvbicsICdwb2x5bGluZScsICdyYWRpYWxHcmFkaWVudCcsICdyZWN0JyxcbiAgJ3NldCcsICdzdG9wJywgJ3N3aXRjaCcsICdzeW1ib2wnLCAndGV4dCcsICd0ZXh0UGF0aCcsICd0aXRsZScsICd0cmVmJyxcbiAgJ3RzcGFuJywgJ3VzZScsICd2aWV3JywgJ3ZrZXJuJ1xuXVxuXG5mdW5jdGlvbiBiZWxDcmVhdGVFbGVtZW50ICh0YWcsIHByb3BzLCBjaGlsZHJlbikge1xuICB2YXIgZWxcblxuICAvLyBJZiBhbiBzdmcgdGFnLCBpdCBuZWVkcyBhIG5hbWVzcGFjZVxuICBpZiAoU1ZHX1RBR1MuaW5kZXhPZih0YWcpICE9PSAtMSkge1xuICAgIHByb3BzLm5hbWVzcGFjZSA9IFNWR05TXG4gIH1cblxuICAvLyBJZiB3ZSBhcmUgdXNpbmcgYSBuYW1lc3BhY2VcbiAgdmFyIG5zID0gZmFsc2VcbiAgaWYgKHByb3BzLm5hbWVzcGFjZSkge1xuICAgIG5zID0gcHJvcHMubmFtZXNwYWNlXG4gICAgZGVsZXRlIHByb3BzLm5hbWVzcGFjZVxuICB9XG5cbiAgLy8gQ3JlYXRlIHRoZSBlbGVtZW50XG4gIGlmIChucykge1xuICAgIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKG5zLCB0YWcpXG4gIH0gZWxzZSB7XG4gICAgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZylcbiAgfVxuXG4gIC8vIElmIGFkZGluZyBvbmxvYWQgZXZlbnRzXG4gIGlmIChwcm9wcy5vbmxvYWQgfHwgcHJvcHMub251bmxvYWQpIHtcbiAgICB2YXIgbG9hZCA9IHByb3BzLm9ubG9hZCB8fCBmdW5jdGlvbiAoKSB7fVxuICAgIHZhciB1bmxvYWQgPSBwcm9wcy5vbnVubG9hZCB8fCBmdW5jdGlvbiAoKSB7fVxuICAgIG9ubG9hZChlbCwgZnVuY3Rpb24gYmVsT25sb2FkICgpIHtcbiAgICAgIGxvYWQoZWwpXG4gICAgfSwgZnVuY3Rpb24gYmVsT251bmxvYWQgKCkge1xuICAgICAgdW5sb2FkKGVsKVxuICAgIH0sXG4gICAgLy8gV2UgaGF2ZSB0byB1c2Ugbm9uLXN0YW5kYXJkIGBjYWxsZXJgIHRvIGZpbmQgd2hvIGludm9rZXMgYGJlbENyZWF0ZUVsZW1lbnRgXG4gICAgYmVsQ3JlYXRlRWxlbWVudC5jYWxsZXIuY2FsbGVyLmNhbGxlcilcbiAgICBkZWxldGUgcHJvcHMub25sb2FkXG4gICAgZGVsZXRlIHByb3BzLm9udW5sb2FkXG4gIH1cblxuICAvLyBDcmVhdGUgdGhlIHByb3BlcnRpZXNcbiAgZm9yICh2YXIgcCBpbiBwcm9wcykge1xuICAgIGlmIChwcm9wcy5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgdmFyIGtleSA9IHAudG9Mb3dlckNhc2UoKVxuICAgICAgdmFyIHZhbCA9IHByb3BzW3BdXG4gICAgICAvLyBOb3JtYWxpemUgY2xhc3NOYW1lXG4gICAgICBpZiAoa2V5ID09PSAnY2xhc3NuYW1lJykge1xuICAgICAgICBrZXkgPSAnY2xhc3MnXG4gICAgICAgIHAgPSAnY2xhc3MnXG4gICAgICB9XG4gICAgICAvLyBUaGUgZm9yIGF0dHJpYnV0ZSBnZXRzIHRyYW5zZm9ybWVkIHRvIGh0bWxGb3IsIGJ1dCB3ZSBqdXN0IHNldCBhcyBmb3JcbiAgICAgIGlmIChwID09PSAnaHRtbEZvcicpIHtcbiAgICAgICAgcCA9ICdmb3InXG4gICAgICB9XG4gICAgICAvLyBJZiBhIHByb3BlcnR5IGlzIGJvb2xlYW4sIHNldCBpdHNlbGYgdG8gdGhlIGtleVxuICAgICAgaWYgKEJPT0xfUFJPUFNba2V5XSkge1xuICAgICAgICBpZiAodmFsID09PSAndHJ1ZScpIHZhbCA9IGtleVxuICAgICAgICBlbHNlIGlmICh2YWwgPT09ICdmYWxzZScpIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICAvLyBJZiBhIHByb3BlcnR5IHByZWZlcnMgYmVpbmcgc2V0IGRpcmVjdGx5IHZzIHNldEF0dHJpYnV0ZVxuICAgICAgaWYgKGtleS5zbGljZSgwLCAyKSA9PT0gJ29uJykge1xuICAgICAgICBlbFtwXSA9IHZhbFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKG5zKSB7XG4gICAgICAgICAgaWYgKHAgPT09ICd4bGluazpocmVmJykge1xuICAgICAgICAgICAgZWwuc2V0QXR0cmlidXRlTlMoWExJTktOUywgcCwgdmFsKVxuICAgICAgICAgIH0gZWxzZSBpZiAoL154bWxucygkfDopL2kudGVzdChwKSkge1xuICAgICAgICAgICAgLy8gc2tpcCB4bWxucyBkZWZpbml0aW9uc1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbC5zZXRBdHRyaWJ1dGVOUyhudWxsLCBwLCB2YWwpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGVsLnNldEF0dHJpYnV0ZShwLCB2YWwpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhcHBlbmRDaGlsZCAoY2hpbGRzKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGNoaWxkcykpIHJldHVyblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2hpbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgbm9kZSA9IGNoaWxkc1tpXVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkobm9kZSkpIHtcbiAgICAgICAgYXBwZW5kQ2hpbGQobm9kZSlcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiBub2RlID09PSAnbnVtYmVyJyB8fFxuICAgICAgICB0eXBlb2Ygbm9kZSA9PT0gJ2Jvb2xlYW4nIHx8XG4gICAgICAgIG5vZGUgaW5zdGFuY2VvZiBEYXRlIHx8XG4gICAgICAgIG5vZGUgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgICAgbm9kZSA9IG5vZGUudG9TdHJpbmcoKVxuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIG5vZGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmIChlbC5sYXN0Q2hpbGQgJiYgZWwubGFzdENoaWxkLm5vZGVOYW1lID09PSAnI3RleHQnKSB7XG4gICAgICAgICAgZWwubGFzdENoaWxkLm5vZGVWYWx1ZSArPSBub2RlXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICBub2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobm9kZSlcbiAgICAgIH1cblxuICAgICAgaWYgKG5vZGUgJiYgbm9kZS5ub2RlVHlwZSkge1xuICAgICAgICBlbC5hcHBlbmRDaGlsZChub2RlKVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBhcHBlbmRDaGlsZChjaGlsZHJlbilcblxuICByZXR1cm4gZWxcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBoeXBlcngoYmVsQ3JlYXRlRWxlbWVudClcbm1vZHVsZS5leHBvcnRzLmRlZmF1bHQgPSBtb2R1bGUuZXhwb3J0c1xubW9kdWxlLmV4cG9ydHMuY3JlYXRlRWxlbWVudCA9IGJlbENyZWF0ZUVsZW1lbnRcbiIsInZhciB0b3BMZXZlbCA9IHR5cGVvZiBnbG9iYWwgIT09ICd1bmRlZmluZWQnID8gZ2xvYmFsIDpcbiAgICB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHdpbmRvdyA6IHt9XG52YXIgbWluRG9jID0gcmVxdWlyZSgnbWluLWRvY3VtZW50Jyk7XG5cbmlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBkb2N1bWVudDtcbn0gZWxzZSB7XG4gICAgdmFyIGRvY2N5ID0gdG9wTGV2ZWxbJ19fR0xPQkFMX0RPQ1VNRU5UX0NBQ0hFQDQnXTtcblxuICAgIGlmICghZG9jY3kpIHtcbiAgICAgICAgZG9jY3kgPSB0b3BMZXZlbFsnX19HTE9CQUxfRE9DVU1FTlRfQ0FDSEVANCddID0gbWluRG9jO1xuICAgIH1cblxuICAgIG1vZHVsZS5leHBvcnRzID0gZG9jY3k7XG59XG4iLCJpZiAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIG1vZHVsZS5leHBvcnRzID0gd2luZG93O1xufSBlbHNlIGlmICh0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBnbG9iYWw7XG59IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiKXtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IHNlbGY7XG59IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0ge307XG59XG4iLCJ2YXIgYXR0clRvUHJvcCA9IHJlcXVpcmUoJ2h5cGVyc2NyaXB0LWF0dHJpYnV0ZS10by1wcm9wZXJ0eScpXG5cbnZhciBWQVIgPSAwLCBURVhUID0gMSwgT1BFTiA9IDIsIENMT1NFID0gMywgQVRUUiA9IDRcbnZhciBBVFRSX0tFWSA9IDUsIEFUVFJfS0VZX1cgPSA2XG52YXIgQVRUUl9WQUxVRV9XID0gNywgQVRUUl9WQUxVRSA9IDhcbnZhciBBVFRSX1ZBTFVFX1NRID0gOSwgQVRUUl9WQUxVRV9EUSA9IDEwXG52YXIgQVRUUl9FUSA9IDExLCBBVFRSX0JSRUFLID0gMTJcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoaCwgb3B0cykge1xuICBoID0gYXR0clRvUHJvcChoKVxuICBpZiAoIW9wdHMpIG9wdHMgPSB7fVxuICB2YXIgY29uY2F0ID0gb3B0cy5jb25jYXQgfHwgZnVuY3Rpb24gKGEsIGIpIHtcbiAgICByZXR1cm4gU3RyaW5nKGEpICsgU3RyaW5nKGIpXG4gIH1cblxuICByZXR1cm4gZnVuY3Rpb24gKHN0cmluZ3MpIHtcbiAgICB2YXIgc3RhdGUgPSBURVhULCByZWcgPSAnJ1xuICAgIHZhciBhcmdsZW4gPSBhcmd1bWVudHMubGVuZ3RoXG4gICAgdmFyIHBhcnRzID0gW11cblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyaW5ncy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGkgPCBhcmdsZW4gLSAxKSB7XG4gICAgICAgIHZhciBhcmcgPSBhcmd1bWVudHNbaSsxXVxuICAgICAgICB2YXIgcCA9IHBhcnNlKHN0cmluZ3NbaV0pXG4gICAgICAgIHZhciB4c3RhdGUgPSBzdGF0ZVxuICAgICAgICBpZiAoeHN0YXRlID09PSBBVFRSX1ZBTFVFX0RRKSB4c3RhdGUgPSBBVFRSX1ZBTFVFXG4gICAgICAgIGlmICh4c3RhdGUgPT09IEFUVFJfVkFMVUVfU1EpIHhzdGF0ZSA9IEFUVFJfVkFMVUVcbiAgICAgICAgaWYgKHhzdGF0ZSA9PT0gQVRUUl9WQUxVRV9XKSB4c3RhdGUgPSBBVFRSX1ZBTFVFXG4gICAgICAgIGlmICh4c3RhdGUgPT09IEFUVFIpIHhzdGF0ZSA9IEFUVFJfS0VZXG4gICAgICAgIHAucHVzaChbIFZBUiwgeHN0YXRlLCBhcmcgXSlcbiAgICAgICAgcGFydHMucHVzaC5hcHBseShwYXJ0cywgcClcbiAgICAgIH0gZWxzZSBwYXJ0cy5wdXNoLmFwcGx5KHBhcnRzLCBwYXJzZShzdHJpbmdzW2ldKSlcbiAgICB9XG5cbiAgICB2YXIgdHJlZSA9IFtudWxsLHt9LFtdXVxuICAgIHZhciBzdGFjayA9IFtbdHJlZSwtMV1dXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGN1ciA9IHN0YWNrW3N0YWNrLmxlbmd0aC0xXVswXVxuICAgICAgdmFyIHAgPSBwYXJ0c1tpXSwgcyA9IHBbMF1cbiAgICAgIGlmIChzID09PSBPUEVOICYmIC9eXFwvLy50ZXN0KHBbMV0pKSB7XG4gICAgICAgIHZhciBpeCA9IHN0YWNrW3N0YWNrLmxlbmd0aC0xXVsxXVxuICAgICAgICBpZiAoc3RhY2subGVuZ3RoID4gMSkge1xuICAgICAgICAgIHN0YWNrLnBvcCgpXG4gICAgICAgICAgc3RhY2tbc3RhY2subGVuZ3RoLTFdWzBdWzJdW2l4XSA9IGgoXG4gICAgICAgICAgICBjdXJbMF0sIGN1clsxXSwgY3VyWzJdLmxlbmd0aCA/IGN1clsyXSA6IHVuZGVmaW5lZFxuICAgICAgICAgIClcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChzID09PSBPUEVOKSB7XG4gICAgICAgIHZhciBjID0gW3BbMV0se30sW11dXG4gICAgICAgIGN1clsyXS5wdXNoKGMpXG4gICAgICAgIHN0YWNrLnB1c2goW2MsY3VyWzJdLmxlbmd0aC0xXSlcbiAgICAgIH0gZWxzZSBpZiAocyA9PT0gQVRUUl9LRVkgfHwgKHMgPT09IFZBUiAmJiBwWzFdID09PSBBVFRSX0tFWSkpIHtcbiAgICAgICAgdmFyIGtleSA9ICcnXG4gICAgICAgIHZhciBjb3B5S2V5XG4gICAgICAgIGZvciAoOyBpIDwgcGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZiAocGFydHNbaV1bMF0gPT09IEFUVFJfS0VZKSB7XG4gICAgICAgICAgICBrZXkgPSBjb25jYXQoa2V5LCBwYXJ0c1tpXVsxXSlcbiAgICAgICAgICB9IGVsc2UgaWYgKHBhcnRzW2ldWzBdID09PSBWQVIgJiYgcGFydHNbaV1bMV0gPT09IEFUVFJfS0VZKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHBhcnRzW2ldWzJdID09PSAnb2JqZWN0JyAmJiAha2V5KSB7XG4gICAgICAgICAgICAgIGZvciAoY29weUtleSBpbiBwYXJ0c1tpXVsyXSkge1xuICAgICAgICAgICAgICAgIGlmIChwYXJ0c1tpXVsyXS5oYXNPd25Qcm9wZXJ0eShjb3B5S2V5KSAmJiAhY3VyWzFdW2NvcHlLZXldKSB7XG4gICAgICAgICAgICAgICAgICBjdXJbMV1bY29weUtleV0gPSBwYXJ0c1tpXVsyXVtjb3B5S2V5XVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAga2V5ID0gY29uY2F0KGtleSwgcGFydHNbaV1bMl0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGJyZWFrXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHBhcnRzW2ldWzBdID09PSBBVFRSX0VRKSBpKytcbiAgICAgICAgdmFyIGogPSBpXG4gICAgICAgIGZvciAoOyBpIDwgcGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZiAocGFydHNbaV1bMF0gPT09IEFUVFJfVkFMVUUgfHwgcGFydHNbaV1bMF0gPT09IEFUVFJfS0VZKSB7XG4gICAgICAgICAgICBpZiAoIWN1clsxXVtrZXldKSBjdXJbMV1ba2V5XSA9IHN0cmZuKHBhcnRzW2ldWzFdKVxuICAgICAgICAgICAgZWxzZSBjdXJbMV1ba2V5XSA9IGNvbmNhdChjdXJbMV1ba2V5XSwgcGFydHNbaV1bMV0pXG4gICAgICAgICAgfSBlbHNlIGlmIChwYXJ0c1tpXVswXSA9PT0gVkFSXG4gICAgICAgICAgJiYgKHBhcnRzW2ldWzFdID09PSBBVFRSX1ZBTFVFIHx8IHBhcnRzW2ldWzFdID09PSBBVFRSX0tFWSkpIHtcbiAgICAgICAgICAgIGlmICghY3VyWzFdW2tleV0pIGN1clsxXVtrZXldID0gc3RyZm4ocGFydHNbaV1bMl0pXG4gICAgICAgICAgICBlbHNlIGN1clsxXVtrZXldID0gY29uY2F0KGN1clsxXVtrZXldLCBwYXJ0c1tpXVsyXSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGtleS5sZW5ndGggJiYgIWN1clsxXVtrZXldICYmIGkgPT09IGpcbiAgICAgICAgICAgICYmIChwYXJ0c1tpXVswXSA9PT0gQ0xPU0UgfHwgcGFydHNbaV1bMF0gPT09IEFUVFJfQlJFQUspKSB7XG4gICAgICAgICAgICAgIC8vIGh0dHBzOi8vaHRtbC5zcGVjLndoYXR3Zy5vcmcvbXVsdGlwYWdlL2luZnJhc3RydWN0dXJlLmh0bWwjYm9vbGVhbi1hdHRyaWJ1dGVzXG4gICAgICAgICAgICAgIC8vIGVtcHR5IHN0cmluZyBpcyBmYWxzeSwgbm90IHdlbGwgYmVoYXZlZCB2YWx1ZSBpbiBicm93c2VyXG4gICAgICAgICAgICAgIGN1clsxXVtrZXldID0ga2V5LnRvTG93ZXJDYXNlKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHMgPT09IEFUVFJfS0VZKSB7XG4gICAgICAgIGN1clsxXVtwWzFdXSA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAocyA9PT0gVkFSICYmIHBbMV0gPT09IEFUVFJfS0VZKSB7XG4gICAgICAgIGN1clsxXVtwWzJdXSA9IHRydWVcbiAgICAgIH0gZWxzZSBpZiAocyA9PT0gQ0xPU0UpIHtcbiAgICAgICAgaWYgKHNlbGZDbG9zaW5nKGN1clswXSkgJiYgc3RhY2subGVuZ3RoKSB7XG4gICAgICAgICAgdmFyIGl4ID0gc3RhY2tbc3RhY2subGVuZ3RoLTFdWzFdXG4gICAgICAgICAgc3RhY2sucG9wKClcbiAgICAgICAgICBzdGFja1tzdGFjay5sZW5ndGgtMV1bMF1bMl1baXhdID0gaChcbiAgICAgICAgICAgIGN1clswXSwgY3VyWzFdLCBjdXJbMl0ubGVuZ3RoID8gY3VyWzJdIDogdW5kZWZpbmVkXG4gICAgICAgICAgKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHMgPT09IFZBUiAmJiBwWzFdID09PSBURVhUKSB7XG4gICAgICAgIGlmIChwWzJdID09PSB1bmRlZmluZWQgfHwgcFsyXSA9PT0gbnVsbCkgcFsyXSA9ICcnXG4gICAgICAgIGVsc2UgaWYgKCFwWzJdKSBwWzJdID0gY29uY2F0KCcnLCBwWzJdKVxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShwWzJdWzBdKSkge1xuICAgICAgICAgIGN1clsyXS5wdXNoLmFwcGx5KGN1clsyXSwgcFsyXSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjdXJbMl0ucHVzaChwWzJdKVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHMgPT09IFRFWFQpIHtcbiAgICAgICAgY3VyWzJdLnB1c2gocFsxXSlcbiAgICAgIH0gZWxzZSBpZiAocyA9PT0gQVRUUl9FUSB8fCBzID09PSBBVFRSX0JSRUFLKSB7XG4gICAgICAgIC8vIG5vLW9wXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3VuaGFuZGxlZDogJyArIHMpXG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRyZWVbMl0ubGVuZ3RoID4gMSAmJiAvXlxccyokLy50ZXN0KHRyZWVbMl1bMF0pKSB7XG4gICAgICB0cmVlWzJdLnNoaWZ0KClcbiAgICB9XG5cbiAgICBpZiAodHJlZVsyXS5sZW5ndGggPiAyXG4gICAgfHwgKHRyZWVbMl0ubGVuZ3RoID09PSAyICYmIC9cXFMvLnRlc3QodHJlZVsyXVsxXSkpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICdtdWx0aXBsZSByb290IGVsZW1lbnRzIG11c3QgYmUgd3JhcHBlZCBpbiBhbiBlbmNsb3NpbmcgdGFnJ1xuICAgICAgKVxuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheSh0cmVlWzJdWzBdKSAmJiB0eXBlb2YgdHJlZVsyXVswXVswXSA9PT0gJ3N0cmluZydcbiAgICAmJiBBcnJheS5pc0FycmF5KHRyZWVbMl1bMF1bMl0pKSB7XG4gICAgICB0cmVlWzJdWzBdID0gaCh0cmVlWzJdWzBdWzBdLCB0cmVlWzJdWzBdWzFdLCB0cmVlWzJdWzBdWzJdKVxuICAgIH1cbiAgICByZXR1cm4gdHJlZVsyXVswXVxuXG4gICAgZnVuY3Rpb24gcGFyc2UgKHN0cikge1xuICAgICAgdmFyIHJlcyA9IFtdXG4gICAgICBpZiAoc3RhdGUgPT09IEFUVFJfVkFMVUVfVykgc3RhdGUgPSBBVFRSXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgYyA9IHN0ci5jaGFyQXQoaSlcbiAgICAgICAgaWYgKHN0YXRlID09PSBURVhUICYmIGMgPT09ICc8Jykge1xuICAgICAgICAgIGlmIChyZWcubGVuZ3RoKSByZXMucHVzaChbVEVYVCwgcmVnXSlcbiAgICAgICAgICByZWcgPSAnJ1xuICAgICAgICAgIHN0YXRlID0gT1BFTlxuICAgICAgICB9IGVsc2UgaWYgKGMgPT09ICc+JyAmJiAhcXVvdChzdGF0ZSkpIHtcbiAgICAgICAgICBpZiAoc3RhdGUgPT09IE9QRU4pIHtcbiAgICAgICAgICAgIHJlcy5wdXNoKFtPUEVOLHJlZ10pXG4gICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gQVRUUl9LRVkpIHtcbiAgICAgICAgICAgIHJlcy5wdXNoKFtBVFRSX0tFWSxyZWddKVxuICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IEFUVFJfVkFMVUUgJiYgcmVnLmxlbmd0aCkge1xuICAgICAgICAgICAgcmVzLnB1c2goW0FUVFJfVkFMVUUscmVnXSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmVzLnB1c2goW0NMT1NFXSlcbiAgICAgICAgICByZWcgPSAnJ1xuICAgICAgICAgIHN0YXRlID0gVEVYVFxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBURVhUKSB7XG4gICAgICAgICAgcmVnICs9IGNcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gT1BFTiAmJiAvXFxzLy50ZXN0KGMpKSB7XG4gICAgICAgICAgcmVzLnB1c2goW09QRU4sIHJlZ10pXG4gICAgICAgICAgcmVnID0gJydcbiAgICAgICAgICBzdGF0ZSA9IEFUVFJcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gT1BFTikge1xuICAgICAgICAgIHJlZyArPSBjXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IEFUVFIgJiYgL1tcXHctXS8udGVzdChjKSkge1xuICAgICAgICAgIHN0YXRlID0gQVRUUl9LRVlcbiAgICAgICAgICByZWcgPSBjXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IEFUVFIgJiYgL1xccy8udGVzdChjKSkge1xuICAgICAgICAgIGlmIChyZWcubGVuZ3RoKSByZXMucHVzaChbQVRUUl9LRVkscmVnXSlcbiAgICAgICAgICByZXMucHVzaChbQVRUUl9CUkVBS10pXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IEFUVFJfS0VZICYmIC9cXHMvLnRlc3QoYykpIHtcbiAgICAgICAgICByZXMucHVzaChbQVRUUl9LRVkscmVnXSlcbiAgICAgICAgICByZWcgPSAnJ1xuICAgICAgICAgIHN0YXRlID0gQVRUUl9LRVlfV1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBBVFRSX0tFWSAmJiBjID09PSAnPScpIHtcbiAgICAgICAgICByZXMucHVzaChbQVRUUl9LRVkscmVnXSxbQVRUUl9FUV0pXG4gICAgICAgICAgcmVnID0gJydcbiAgICAgICAgICBzdGF0ZSA9IEFUVFJfVkFMVUVfV1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBBVFRSX0tFWSkge1xuICAgICAgICAgIHJlZyArPSBjXG4gICAgICAgIH0gZWxzZSBpZiAoKHN0YXRlID09PSBBVFRSX0tFWV9XIHx8IHN0YXRlID09PSBBVFRSKSAmJiBjID09PSAnPScpIHtcbiAgICAgICAgICByZXMucHVzaChbQVRUUl9FUV0pXG4gICAgICAgICAgc3RhdGUgPSBBVFRSX1ZBTFVFX1dcbiAgICAgICAgfSBlbHNlIGlmICgoc3RhdGUgPT09IEFUVFJfS0VZX1cgfHwgc3RhdGUgPT09IEFUVFIpICYmICEvXFxzLy50ZXN0KGMpKSB7XG4gICAgICAgICAgcmVzLnB1c2goW0FUVFJfQlJFQUtdKVxuICAgICAgICAgIGlmICgvW1xcdy1dLy50ZXN0KGMpKSB7XG4gICAgICAgICAgICByZWcgKz0gY1xuICAgICAgICAgICAgc3RhdGUgPSBBVFRSX0tFWVxuICAgICAgICAgIH0gZWxzZSBzdGF0ZSA9IEFUVFJcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gQVRUUl9WQUxVRV9XICYmIGMgPT09ICdcIicpIHtcbiAgICAgICAgICBzdGF0ZSA9IEFUVFJfVkFMVUVfRFFcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gQVRUUl9WQUxVRV9XICYmIGMgPT09IFwiJ1wiKSB7XG4gICAgICAgICAgc3RhdGUgPSBBVFRSX1ZBTFVFX1NRXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IEFUVFJfVkFMVUVfRFEgJiYgYyA9PT0gJ1wiJykge1xuICAgICAgICAgIHJlcy5wdXNoKFtBVFRSX1ZBTFVFLHJlZ10sW0FUVFJfQlJFQUtdKVxuICAgICAgICAgIHJlZyA9ICcnXG4gICAgICAgICAgc3RhdGUgPSBBVFRSXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IEFUVFJfVkFMVUVfU1EgJiYgYyA9PT0gXCInXCIpIHtcbiAgICAgICAgICByZXMucHVzaChbQVRUUl9WQUxVRSxyZWddLFtBVFRSX0JSRUFLXSlcbiAgICAgICAgICByZWcgPSAnJ1xuICAgICAgICAgIHN0YXRlID0gQVRUUlxuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBBVFRSX1ZBTFVFX1cgJiYgIS9cXHMvLnRlc3QoYykpIHtcbiAgICAgICAgICBzdGF0ZSA9IEFUVFJfVkFMVUVcbiAgICAgICAgICBpLS1cbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gQVRUUl9WQUxVRSAmJiAvXFxzLy50ZXN0KGMpKSB7XG4gICAgICAgICAgcmVzLnB1c2goW0FUVFJfVkFMVUUscmVnXSxbQVRUUl9CUkVBS10pXG4gICAgICAgICAgcmVnID0gJydcbiAgICAgICAgICBzdGF0ZSA9IEFUVFJcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gQVRUUl9WQUxVRSB8fCBzdGF0ZSA9PT0gQVRUUl9WQUxVRV9TUVxuICAgICAgICB8fCBzdGF0ZSA9PT0gQVRUUl9WQUxVRV9EUSkge1xuICAgICAgICAgIHJlZyArPSBjXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzdGF0ZSA9PT0gVEVYVCAmJiByZWcubGVuZ3RoKSB7XG4gICAgICAgIHJlcy5wdXNoKFtURVhULHJlZ10pXG4gICAgICAgIHJlZyA9ICcnXG4gICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBBVFRSX1ZBTFVFICYmIHJlZy5sZW5ndGgpIHtcbiAgICAgICAgcmVzLnB1c2goW0FUVFJfVkFMVUUscmVnXSlcbiAgICAgICAgcmVnID0gJydcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT09IEFUVFJfVkFMVUVfRFEgJiYgcmVnLmxlbmd0aCkge1xuICAgICAgICByZXMucHVzaChbQVRUUl9WQUxVRSxyZWddKVxuICAgICAgICByZWcgPSAnJ1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZSA9PT0gQVRUUl9WQUxVRV9TUSAmJiByZWcubGVuZ3RoKSB7XG4gICAgICAgIHJlcy5wdXNoKFtBVFRSX1ZBTFVFLHJlZ10pXG4gICAgICAgIHJlZyA9ICcnXG4gICAgICB9IGVsc2UgaWYgKHN0YXRlID09PSBBVFRSX0tFWSkge1xuICAgICAgICByZXMucHVzaChbQVRUUl9LRVkscmVnXSlcbiAgICAgICAgcmVnID0gJydcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXNcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBzdHJmbiAoeCkge1xuICAgIGlmICh0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJykgcmV0dXJuIHhcbiAgICBlbHNlIGlmICh0eXBlb2YgeCA9PT0gJ3N0cmluZycpIHJldHVybiB4XG4gICAgZWxzZSBpZiAoeCAmJiB0eXBlb2YgeCA9PT0gJ29iamVjdCcpIHJldHVybiB4XG4gICAgZWxzZSByZXR1cm4gY29uY2F0KCcnLCB4KVxuICB9XG59XG5cbmZ1bmN0aW9uIHF1b3QgKHN0YXRlKSB7XG4gIHJldHVybiBzdGF0ZSA9PT0gQVRUUl9WQUxVRV9TUSB8fCBzdGF0ZSA9PT0gQVRUUl9WQUxVRV9EUVxufVxuXG52YXIgaGFzT3duID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eVxuZnVuY3Rpb24gaGFzIChvYmosIGtleSkgeyByZXR1cm4gaGFzT3duLmNhbGwob2JqLCBrZXkpIH1cblxudmFyIGNsb3NlUkUgPSBSZWdFeHAoJ14oJyArIFtcbiAgJ2FyZWEnLCAnYmFzZScsICdiYXNlZm9udCcsICdiZ3NvdW5kJywgJ2JyJywgJ2NvbCcsICdjb21tYW5kJywgJ2VtYmVkJyxcbiAgJ2ZyYW1lJywgJ2hyJywgJ2ltZycsICdpbnB1dCcsICdpc2luZGV4JywgJ2tleWdlbicsICdsaW5rJywgJ21ldGEnLCAncGFyYW0nLFxuICAnc291cmNlJywgJ3RyYWNrJywgJ3dicicsXG4gIC8vIFNWRyBUQUdTXG4gICdhbmltYXRlJywgJ2FuaW1hdGVUcmFuc2Zvcm0nLCAnY2lyY2xlJywgJ2N1cnNvcicsICdkZXNjJywgJ2VsbGlwc2UnLFxuICAnZmVCbGVuZCcsICdmZUNvbG9yTWF0cml4JywgJ2ZlQ29tcG9zaXRlJyxcbiAgJ2ZlQ29udm9sdmVNYXRyaXgnLCAnZmVEaWZmdXNlTGlnaHRpbmcnLCAnZmVEaXNwbGFjZW1lbnRNYXAnLFxuICAnZmVEaXN0YW50TGlnaHQnLCAnZmVGbG9vZCcsICdmZUZ1bmNBJywgJ2ZlRnVuY0InLCAnZmVGdW5jRycsICdmZUZ1bmNSJyxcbiAgJ2ZlR2F1c3NpYW5CbHVyJywgJ2ZlSW1hZ2UnLCAnZmVNZXJnZU5vZGUnLCAnZmVNb3JwaG9sb2d5JyxcbiAgJ2ZlT2Zmc2V0JywgJ2ZlUG9pbnRMaWdodCcsICdmZVNwZWN1bGFyTGlnaHRpbmcnLCAnZmVTcG90TGlnaHQnLCAnZmVUaWxlJyxcbiAgJ2ZlVHVyYnVsZW5jZScsICdmb250LWZhY2UtZm9ybWF0JywgJ2ZvbnQtZmFjZS1uYW1lJywgJ2ZvbnQtZmFjZS11cmknLFxuICAnZ2x5cGgnLCAnZ2x5cGhSZWYnLCAnaGtlcm4nLCAnaW1hZ2UnLCAnbGluZScsICdtaXNzaW5nLWdseXBoJywgJ21wYXRoJyxcbiAgJ3BhdGgnLCAncG9seWdvbicsICdwb2x5bGluZScsICdyZWN0JywgJ3NldCcsICdzdG9wJywgJ3RyZWYnLCAndXNlJywgJ3ZpZXcnLFxuICAndmtlcm4nXG5dLmpvaW4oJ3wnKSArICcpKD86W1xcLiNdW2EtekEtWjAtOVxcdTAwN0YtXFx1RkZGRl86LV0rKSokJylcbmZ1bmN0aW9uIHNlbGZDbG9zaW5nICh0YWcpIHsgcmV0dXJuIGNsb3NlUkUudGVzdCh0YWcpIH1cbiIsIm1vZHVsZS5leHBvcnRzID0gYXR0cmlidXRlVG9Qcm9wZXJ0eVxuXG52YXIgdHJhbnNmb3JtID0ge1xuICAnY2xhc3MnOiAnY2xhc3NOYW1lJyxcbiAgJ2Zvcic6ICdodG1sRm9yJyxcbiAgJ2h0dHAtZXF1aXYnOiAnaHR0cEVxdWl2J1xufVxuXG5mdW5jdGlvbiBhdHRyaWJ1dGVUb1Byb3BlcnR5IChoKSB7XG4gIHJldHVybiBmdW5jdGlvbiAodGFnTmFtZSwgYXR0cnMsIGNoaWxkcmVuKSB7XG4gICAgZm9yICh2YXIgYXR0ciBpbiBhdHRycykge1xuICAgICAgaWYgKGF0dHIgaW4gdHJhbnNmb3JtKSB7XG4gICAgICAgIGF0dHJzW3RyYW5zZm9ybVthdHRyXV0gPSBhdHRyc1thdHRyXVxuICAgICAgICBkZWxldGUgYXR0cnNbYXR0cl1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGgodGFnTmFtZSwgYXR0cnMsIGNoaWxkcmVuKVxuICB9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciByYW5nZTsgLy8gQ3JlYXRlIGEgcmFuZ2Ugb2JqZWN0IGZvciBlZmZpY2VudGx5IHJlbmRlcmluZyBzdHJpbmdzIHRvIGVsZW1lbnRzLlxudmFyIE5TX1hIVE1MID0gJ2h0dHA6Ly93d3cudzMub3JnLzE5OTkveGh0bWwnO1xuXG52YXIgZG9jID0gdHlwZW9mIGRvY3VtZW50ID09PSAndW5kZWZpbmVkJyA/IHVuZGVmaW5lZCA6IGRvY3VtZW50O1xuXG52YXIgdGVzdEVsID0gZG9jID9cbiAgICBkb2MuYm9keSB8fCBkb2MuY3JlYXRlRWxlbWVudCgnZGl2JykgOlxuICAgIHt9O1xuXG4vLyBGaXhlcyA8aHR0cHM6Ly9naXRodWIuY29tL3BhdHJpY2stc3RlZWxlLWlkZW0vbW9ycGhkb20vaXNzdWVzLzMyPlxuLy8gKElFNysgc3VwcG9ydCkgPD1JRTcgZG9lcyBub3Qgc3VwcG9ydCBlbC5oYXNBdHRyaWJ1dGUobmFtZSlcbnZhciBhY3R1YWxIYXNBdHRyaWJ1dGVOUztcblxuaWYgKHRlc3RFbC5oYXNBdHRyaWJ1dGVOUykge1xuICAgIGFjdHVhbEhhc0F0dHJpYnV0ZU5TID0gZnVuY3Rpb24oZWwsIG5hbWVzcGFjZVVSSSwgbmFtZSkge1xuICAgICAgICByZXR1cm4gZWwuaGFzQXR0cmlidXRlTlMobmFtZXNwYWNlVVJJLCBuYW1lKTtcbiAgICB9O1xufSBlbHNlIGlmICh0ZXN0RWwuaGFzQXR0cmlidXRlKSB7XG4gICAgYWN0dWFsSGFzQXR0cmlidXRlTlMgPSBmdW5jdGlvbihlbCwgbmFtZXNwYWNlVVJJLCBuYW1lKSB7XG4gICAgICAgIHJldHVybiBlbC5oYXNBdHRyaWJ1dGUobmFtZSk7XG4gICAgfTtcbn0gZWxzZSB7XG4gICAgYWN0dWFsSGFzQXR0cmlidXRlTlMgPSBmdW5jdGlvbihlbCwgbmFtZXNwYWNlVVJJLCBuYW1lKSB7XG4gICAgICAgIHJldHVybiBlbC5nZXRBdHRyaWJ1dGVOb2RlKG5hbWVzcGFjZVVSSSwgbmFtZSkgIT0gbnVsbDtcbiAgICB9O1xufVxuXG52YXIgaGFzQXR0cmlidXRlTlMgPSBhY3R1YWxIYXNBdHRyaWJ1dGVOUztcblxuXG5mdW5jdGlvbiB0b0VsZW1lbnQoc3RyKSB7XG4gICAgaWYgKCFyYW5nZSAmJiBkb2MuY3JlYXRlUmFuZ2UpIHtcbiAgICAgICAgcmFuZ2UgPSBkb2MuY3JlYXRlUmFuZ2UoKTtcbiAgICAgICAgcmFuZ2Uuc2VsZWN0Tm9kZShkb2MuYm9keSk7XG4gICAgfVxuXG4gICAgdmFyIGZyYWdtZW50O1xuICAgIGlmIChyYW5nZSAmJiByYW5nZS5jcmVhdGVDb250ZXh0dWFsRnJhZ21lbnQpIHtcbiAgICAgICAgZnJhZ21lbnQgPSByYW5nZS5jcmVhdGVDb250ZXh0dWFsRnJhZ21lbnQoc3RyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBmcmFnbWVudCA9IGRvYy5jcmVhdGVFbGVtZW50KCdib2R5Jyk7XG4gICAgICAgIGZyYWdtZW50LmlubmVySFRNTCA9IHN0cjtcbiAgICB9XG4gICAgcmV0dXJuIGZyYWdtZW50LmNoaWxkTm9kZXNbMF07XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIHR3byBub2RlJ3MgbmFtZXMgYXJlIHRoZSBzYW1lLlxuICpcbiAqIE5PVEU6IFdlIGRvbid0IGJvdGhlciBjaGVja2luZyBgbmFtZXNwYWNlVVJJYCBiZWNhdXNlIHlvdSB3aWxsIG5ldmVyIGZpbmQgdHdvIEhUTUwgZWxlbWVudHMgd2l0aCB0aGUgc2FtZVxuICogICAgICAgbm9kZU5hbWUgYW5kIGRpZmZlcmVudCBuYW1lc3BhY2UgVVJJcy5cbiAqXG4gKiBAcGFyYW0ge0VsZW1lbnR9IGFcbiAqIEBwYXJhbSB7RWxlbWVudH0gYiBUaGUgdGFyZ2V0IGVsZW1lbnRcbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmZ1bmN0aW9uIGNvbXBhcmVOb2RlTmFtZXMoZnJvbUVsLCB0b0VsKSB7XG4gICAgdmFyIGZyb21Ob2RlTmFtZSA9IGZyb21FbC5ub2RlTmFtZTtcbiAgICB2YXIgdG9Ob2RlTmFtZSA9IHRvRWwubm9kZU5hbWU7XG5cbiAgICBpZiAoZnJvbU5vZGVOYW1lID09PSB0b05vZGVOYW1lKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmICh0b0VsLmFjdHVhbGl6ZSAmJlxuICAgICAgICBmcm9tTm9kZU5hbWUuY2hhckNvZGVBdCgwKSA8IDkxICYmIC8qIGZyb20gdGFnIG5hbWUgaXMgdXBwZXIgY2FzZSAqL1xuICAgICAgICB0b05vZGVOYW1lLmNoYXJDb2RlQXQoMCkgPiA5MCAvKiB0YXJnZXQgdGFnIG5hbWUgaXMgbG93ZXIgY2FzZSAqLykge1xuICAgICAgICAvLyBJZiB0aGUgdGFyZ2V0IGVsZW1lbnQgaXMgYSB2aXJ0dWFsIERPTSBub2RlIHRoZW4gd2UgbWF5IG5lZWQgdG8gbm9ybWFsaXplIHRoZSB0YWcgbmFtZVxuICAgICAgICAvLyBiZWZvcmUgY29tcGFyaW5nLiBOb3JtYWwgSFRNTCBlbGVtZW50cyB0aGF0IGFyZSBpbiB0aGUgXCJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hodG1sXCJcbiAgICAgICAgLy8gYXJlIGNvbnZlcnRlZCB0byB1cHBlciBjYXNlXG4gICAgICAgIHJldHVybiBmcm9tTm9kZU5hbWUgPT09IHRvTm9kZU5hbWUudG9VcHBlckNhc2UoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuXG4vKipcbiAqIENyZWF0ZSBhbiBlbGVtZW50LCBvcHRpb25hbGx5IHdpdGggYSBrbm93biBuYW1lc3BhY2UgVVJJLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIHRoZSBlbGVtZW50IG5hbWUsIGUuZy4gJ2Rpdicgb3IgJ3N2ZydcbiAqIEBwYXJhbSB7c3RyaW5nfSBbbmFtZXNwYWNlVVJJXSB0aGUgZWxlbWVudCdzIG5hbWVzcGFjZSBVUkksIGkuZS4gdGhlIHZhbHVlIG9mXG4gKiBpdHMgYHhtbG5zYCBhdHRyaWJ1dGUgb3IgaXRzIGluZmVycmVkIG5hbWVzcGFjZS5cbiAqXG4gKiBAcmV0dXJuIHtFbGVtZW50fVxuICovXG5mdW5jdGlvbiBjcmVhdGVFbGVtZW50TlMobmFtZSwgbmFtZXNwYWNlVVJJKSB7XG4gICAgcmV0dXJuICFuYW1lc3BhY2VVUkkgfHwgbmFtZXNwYWNlVVJJID09PSBOU19YSFRNTCA/XG4gICAgICAgIGRvYy5jcmVhdGVFbGVtZW50KG5hbWUpIDpcbiAgICAgICAgZG9jLmNyZWF0ZUVsZW1lbnROUyhuYW1lc3BhY2VVUkksIG5hbWUpO1xufVxuXG4vKipcbiAqIENvcGllcyB0aGUgY2hpbGRyZW4gb2Ygb25lIERPTSBlbGVtZW50IHRvIGFub3RoZXIgRE9NIGVsZW1lbnRcbiAqL1xuZnVuY3Rpb24gbW92ZUNoaWxkcmVuKGZyb21FbCwgdG9FbCkge1xuICAgIHZhciBjdXJDaGlsZCA9IGZyb21FbC5maXJzdENoaWxkO1xuICAgIHdoaWxlIChjdXJDaGlsZCkge1xuICAgICAgICB2YXIgbmV4dENoaWxkID0gY3VyQ2hpbGQubmV4dFNpYmxpbmc7XG4gICAgICAgIHRvRWwuYXBwZW5kQ2hpbGQoY3VyQ2hpbGQpO1xuICAgICAgICBjdXJDaGlsZCA9IG5leHRDaGlsZDtcbiAgICB9XG4gICAgcmV0dXJuIHRvRWw7XG59XG5cbmZ1bmN0aW9uIG1vcnBoQXR0cnMoZnJvbU5vZGUsIHRvTm9kZSkge1xuICAgIHZhciBhdHRycyA9IHRvTm9kZS5hdHRyaWJ1dGVzO1xuICAgIHZhciBpO1xuICAgIHZhciBhdHRyO1xuICAgIHZhciBhdHRyTmFtZTtcbiAgICB2YXIgYXR0ck5hbWVzcGFjZVVSSTtcbiAgICB2YXIgYXR0clZhbHVlO1xuICAgIHZhciBmcm9tVmFsdWU7XG5cbiAgICBmb3IgKGkgPSBhdHRycy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgICBhdHRyID0gYXR0cnNbaV07XG4gICAgICAgIGF0dHJOYW1lID0gYXR0ci5uYW1lO1xuICAgICAgICBhdHRyTmFtZXNwYWNlVVJJID0gYXR0ci5uYW1lc3BhY2VVUkk7XG4gICAgICAgIGF0dHJWYWx1ZSA9IGF0dHIudmFsdWU7XG5cbiAgICAgICAgaWYgKGF0dHJOYW1lc3BhY2VVUkkpIHtcbiAgICAgICAgICAgIGF0dHJOYW1lID0gYXR0ci5sb2NhbE5hbWUgfHwgYXR0ck5hbWU7XG4gICAgICAgICAgICBmcm9tVmFsdWUgPSBmcm9tTm9kZS5nZXRBdHRyaWJ1dGVOUyhhdHRyTmFtZXNwYWNlVVJJLCBhdHRyTmFtZSk7XG5cbiAgICAgICAgICAgIGlmIChmcm9tVmFsdWUgIT09IGF0dHJWYWx1ZSkge1xuICAgICAgICAgICAgICAgIGZyb21Ob2RlLnNldEF0dHJpYnV0ZU5TKGF0dHJOYW1lc3BhY2VVUkksIGF0dHJOYW1lLCBhdHRyVmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZnJvbVZhbHVlID0gZnJvbU5vZGUuZ2V0QXR0cmlidXRlKGF0dHJOYW1lKTtcblxuICAgICAgICAgICAgaWYgKGZyb21WYWx1ZSAhPT0gYXR0clZhbHVlKSB7XG4gICAgICAgICAgICAgICAgZnJvbU5vZGUuc2V0QXR0cmlidXRlKGF0dHJOYW1lLCBhdHRyVmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGFueSBleHRyYSBhdHRyaWJ1dGVzIGZvdW5kIG9uIHRoZSBvcmlnaW5hbCBET00gZWxlbWVudCB0aGF0XG4gICAgLy8gd2VyZW4ndCBmb3VuZCBvbiB0aGUgdGFyZ2V0IGVsZW1lbnQuXG4gICAgYXR0cnMgPSBmcm9tTm9kZS5hdHRyaWJ1dGVzO1xuXG4gICAgZm9yIChpID0gYXR0cnMubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgICAgYXR0ciA9IGF0dHJzW2ldO1xuICAgICAgICBpZiAoYXR0ci5zcGVjaWZpZWQgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICBhdHRyTmFtZSA9IGF0dHIubmFtZTtcbiAgICAgICAgICAgIGF0dHJOYW1lc3BhY2VVUkkgPSBhdHRyLm5hbWVzcGFjZVVSSTtcblxuICAgICAgICAgICAgaWYgKGF0dHJOYW1lc3BhY2VVUkkpIHtcbiAgICAgICAgICAgICAgICBhdHRyTmFtZSA9IGF0dHIubG9jYWxOYW1lIHx8IGF0dHJOYW1lO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFoYXNBdHRyaWJ1dGVOUyh0b05vZGUsIGF0dHJOYW1lc3BhY2VVUkksIGF0dHJOYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICBmcm9tTm9kZS5yZW1vdmVBdHRyaWJ1dGVOUyhhdHRyTmFtZXNwYWNlVVJJLCBhdHRyTmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoIWhhc0F0dHJpYnV0ZU5TKHRvTm9kZSwgbnVsbCwgYXR0ck5hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIGZyb21Ob2RlLnJlbW92ZUF0dHJpYnV0ZShhdHRyTmFtZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBzeW5jQm9vbGVhbkF0dHJQcm9wKGZyb21FbCwgdG9FbCwgbmFtZSkge1xuICAgIGlmIChmcm9tRWxbbmFtZV0gIT09IHRvRWxbbmFtZV0pIHtcbiAgICAgICAgZnJvbUVsW25hbWVdID0gdG9FbFtuYW1lXTtcbiAgICAgICAgaWYgKGZyb21FbFtuYW1lXSkge1xuICAgICAgICAgICAgZnJvbUVsLnNldEF0dHJpYnV0ZShuYW1lLCAnJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmcm9tRWwucmVtb3ZlQXR0cmlidXRlKG5hbWUsICcnKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxudmFyIHNwZWNpYWxFbEhhbmRsZXJzID0ge1xuICAgIC8qKlxuICAgICAqIE5lZWRlZCBmb3IgSUUuIEFwcGFyZW50bHkgSUUgZG9lc24ndCB0aGluayB0aGF0IFwic2VsZWN0ZWRcIiBpcyBhblxuICAgICAqIGF0dHJpYnV0ZSB3aGVuIHJlYWRpbmcgb3ZlciB0aGUgYXR0cmlidXRlcyB1c2luZyBzZWxlY3RFbC5hdHRyaWJ1dGVzXG4gICAgICovXG4gICAgT1BUSU9OOiBmdW5jdGlvbihmcm9tRWwsIHRvRWwpIHtcbiAgICAgICAgc3luY0Jvb2xlYW5BdHRyUHJvcChmcm9tRWwsIHRvRWwsICdzZWxlY3RlZCcpO1xuICAgIH0sXG4gICAgLyoqXG4gICAgICogVGhlIFwidmFsdWVcIiBhdHRyaWJ1dGUgaXMgc3BlY2lhbCBmb3IgdGhlIDxpbnB1dD4gZWxlbWVudCBzaW5jZSBpdCBzZXRzXG4gICAgICogdGhlIGluaXRpYWwgdmFsdWUuIENoYW5naW5nIHRoZSBcInZhbHVlXCIgYXR0cmlidXRlIHdpdGhvdXQgY2hhbmdpbmcgdGhlXG4gICAgICogXCJ2YWx1ZVwiIHByb3BlcnR5IHdpbGwgaGF2ZSBubyBlZmZlY3Qgc2luY2UgaXQgaXMgb25seSB1c2VkIHRvIHRoZSBzZXQgdGhlXG4gICAgICogaW5pdGlhbCB2YWx1ZS4gIFNpbWlsYXIgZm9yIHRoZSBcImNoZWNrZWRcIiBhdHRyaWJ1dGUsIGFuZCBcImRpc2FibGVkXCIuXG4gICAgICovXG4gICAgSU5QVVQ6IGZ1bmN0aW9uKGZyb21FbCwgdG9FbCkge1xuICAgICAgICBzeW5jQm9vbGVhbkF0dHJQcm9wKGZyb21FbCwgdG9FbCwgJ2NoZWNrZWQnKTtcbiAgICAgICAgc3luY0Jvb2xlYW5BdHRyUHJvcChmcm9tRWwsIHRvRWwsICdkaXNhYmxlZCcpO1xuXG4gICAgICAgIGlmIChmcm9tRWwudmFsdWUgIT09IHRvRWwudmFsdWUpIHtcbiAgICAgICAgICAgIGZyb21FbC52YWx1ZSA9IHRvRWwudmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWhhc0F0dHJpYnV0ZU5TKHRvRWwsIG51bGwsICd2YWx1ZScpKSB7XG4gICAgICAgICAgICBmcm9tRWwucmVtb3ZlQXR0cmlidXRlKCd2YWx1ZScpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIFRFWFRBUkVBOiBmdW5jdGlvbihmcm9tRWwsIHRvRWwpIHtcbiAgICAgICAgdmFyIG5ld1ZhbHVlID0gdG9FbC52YWx1ZTtcbiAgICAgICAgaWYgKGZyb21FbC52YWx1ZSAhPT0gbmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGZyb21FbC52YWx1ZSA9IG5ld1ZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZyb21FbC5maXJzdENoaWxkKSB7XG4gICAgICAgICAgICAvLyBOZWVkZWQgZm9yIElFLiBBcHBhcmVudGx5IElFIHNldHMgdGhlIHBsYWNlaG9sZGVyIGFzIHRoZVxuICAgICAgICAgICAgLy8gbm9kZSB2YWx1ZSBhbmQgdmlzZSB2ZXJzYS4gVGhpcyBpZ25vcmVzIGFuIGVtcHR5IHVwZGF0ZS5cbiAgICAgICAgICAgIGlmIChuZXdWYWx1ZSA9PT0gJycgJiYgZnJvbUVsLmZpcnN0Q2hpbGQubm9kZVZhbHVlID09PSBmcm9tRWwucGxhY2Vob2xkZXIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZyb21FbC5maXJzdENoaWxkLm5vZGVWYWx1ZSA9IG5ld1ZhbHVlO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBTRUxFQ1Q6IGZ1bmN0aW9uKGZyb21FbCwgdG9FbCkge1xuICAgICAgICBpZiAoIWhhc0F0dHJpYnV0ZU5TKHRvRWwsIG51bGwsICdtdWx0aXBsZScpKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0ZWRJbmRleCA9IC0xO1xuICAgICAgICAgICAgdmFyIGkgPSAwO1xuICAgICAgICAgICAgdmFyIGN1ckNoaWxkID0gdG9FbC5maXJzdENoaWxkO1xuICAgICAgICAgICAgd2hpbGUoY3VyQ2hpbGQpIHtcbiAgICAgICAgICAgICAgICB2YXIgbm9kZU5hbWUgPSBjdXJDaGlsZC5ub2RlTmFtZTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZU5hbWUgJiYgbm9kZU5hbWUudG9VcHBlckNhc2UoKSA9PT0gJ09QVElPTicpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhhc0F0dHJpYnV0ZU5TKGN1ckNoaWxkLCBudWxsLCAnc2VsZWN0ZWQnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRJbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGN1ckNoaWxkID0gY3VyQ2hpbGQubmV4dFNpYmxpbmc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZyb21FbC5zZWxlY3RlZEluZGV4ID0gaTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbnZhciBFTEVNRU5UX05PREUgPSAxO1xudmFyIFRFWFRfTk9ERSA9IDM7XG52YXIgQ09NTUVOVF9OT0RFID0gODtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbmZ1bmN0aW9uIGRlZmF1bHRHZXROb2RlS2V5KG5vZGUpIHtcbiAgICByZXR1cm4gbm9kZS5pZDtcbn1cblxuZnVuY3Rpb24gbW9ycGhkb21GYWN0b3J5KG1vcnBoQXR0cnMpIHtcblxuICAgIHJldHVybiBmdW5jdGlvbiBtb3JwaGRvbShmcm9tTm9kZSwgdG9Ob2RlLCBvcHRpb25zKSB7XG4gICAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IHt9O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiB0b05vZGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBpZiAoZnJvbU5vZGUubm9kZU5hbWUgPT09ICcjZG9jdW1lbnQnIHx8IGZyb21Ob2RlLm5vZGVOYW1lID09PSAnSFRNTCcpIHtcbiAgICAgICAgICAgICAgICB2YXIgdG9Ob2RlSHRtbCA9IHRvTm9kZTtcbiAgICAgICAgICAgICAgICB0b05vZGUgPSBkb2MuY3JlYXRlRWxlbWVudCgnaHRtbCcpO1xuICAgICAgICAgICAgICAgIHRvTm9kZS5pbm5lckhUTUwgPSB0b05vZGVIdG1sO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b05vZGUgPSB0b0VsZW1lbnQodG9Ob2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBnZXROb2RlS2V5ID0gb3B0aW9ucy5nZXROb2RlS2V5IHx8IGRlZmF1bHRHZXROb2RlS2V5O1xuICAgICAgICB2YXIgb25CZWZvcmVOb2RlQWRkZWQgPSBvcHRpb25zLm9uQmVmb3JlTm9kZUFkZGVkIHx8IG5vb3A7XG4gICAgICAgIHZhciBvbk5vZGVBZGRlZCA9IG9wdGlvbnMub25Ob2RlQWRkZWQgfHwgbm9vcDtcbiAgICAgICAgdmFyIG9uQmVmb3JlRWxVcGRhdGVkID0gb3B0aW9ucy5vbkJlZm9yZUVsVXBkYXRlZCB8fCBub29wO1xuICAgICAgICB2YXIgb25FbFVwZGF0ZWQgPSBvcHRpb25zLm9uRWxVcGRhdGVkIHx8IG5vb3A7XG4gICAgICAgIHZhciBvbkJlZm9yZU5vZGVEaXNjYXJkZWQgPSBvcHRpb25zLm9uQmVmb3JlTm9kZURpc2NhcmRlZCB8fCBub29wO1xuICAgICAgICB2YXIgb25Ob2RlRGlzY2FyZGVkID0gb3B0aW9ucy5vbk5vZGVEaXNjYXJkZWQgfHwgbm9vcDtcbiAgICAgICAgdmFyIG9uQmVmb3JlRWxDaGlsZHJlblVwZGF0ZWQgPSBvcHRpb25zLm9uQmVmb3JlRWxDaGlsZHJlblVwZGF0ZWQgfHwgbm9vcDtcbiAgICAgICAgdmFyIGNoaWxkcmVuT25seSA9IG9wdGlvbnMuY2hpbGRyZW5Pbmx5ID09PSB0cnVlO1xuXG4gICAgICAgIC8vIFRoaXMgb2JqZWN0IGlzIHVzZWQgYXMgYSBsb29rdXAgdG8gcXVpY2tseSBmaW5kIGFsbCBrZXllZCBlbGVtZW50cyBpbiB0aGUgb3JpZ2luYWwgRE9NIHRyZWUuXG4gICAgICAgIHZhciBmcm9tTm9kZXNMb29rdXAgPSB7fTtcbiAgICAgICAgdmFyIGtleWVkUmVtb3ZhbExpc3Q7XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkS2V5ZWRSZW1vdmFsKGtleSkge1xuICAgICAgICAgICAgaWYgKGtleWVkUmVtb3ZhbExpc3QpIHtcbiAgICAgICAgICAgICAgICBrZXllZFJlbW92YWxMaXN0LnB1c2goa2V5KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAga2V5ZWRSZW1vdmFsTGlzdCA9IFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gd2Fsa0Rpc2NhcmRlZENoaWxkTm9kZXMobm9kZSwgc2tpcEtleWVkTm9kZXMpIHtcbiAgICAgICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBFTEVNRU5UX05PREUpIHtcbiAgICAgICAgICAgICAgICB2YXIgY3VyQ2hpbGQgPSBub2RlLmZpcnN0Q2hpbGQ7XG4gICAgICAgICAgICAgICAgd2hpbGUgKGN1ckNoaWxkKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGtleSA9IHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoc2tpcEtleWVkTm9kZXMgJiYgKGtleSA9IGdldE5vZGVLZXkoY3VyQ2hpbGQpKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgd2UgYXJlIHNraXBwaW5nIGtleWVkIG5vZGVzIHRoZW4gd2UgYWRkIHRoZSBrZXlcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRvIGEgbGlzdCBzbyB0aGF0IGl0IGNhbiBiZSBoYW5kbGVkIGF0IHRoZSB2ZXJ5IGVuZC5cbiAgICAgICAgICAgICAgICAgICAgICAgIGFkZEtleWVkUmVtb3ZhbChrZXkpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gT25seSByZXBvcnQgdGhlIG5vZGUgYXMgZGlzY2FyZGVkIGlmIGl0IGlzIG5vdCBrZXllZC4gV2UgZG8gdGhpcyBiZWNhdXNlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBhdCB0aGUgZW5kIHdlIGxvb3AgdGhyb3VnaCBhbGwga2V5ZWQgZWxlbWVudHMgdGhhdCB3ZXJlIHVubWF0Y2hlZFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYW5kIHRoZW4gZGlzY2FyZCB0aGVtIGluIG9uZSBmaW5hbCBwYXNzLlxuICAgICAgICAgICAgICAgICAgICAgICAgb25Ob2RlRGlzY2FyZGVkKGN1ckNoaWxkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdXJDaGlsZC5maXJzdENoaWxkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2Fsa0Rpc2NhcmRlZENoaWxkTm9kZXMoY3VyQ2hpbGQsIHNraXBLZXllZE5vZGVzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGN1ckNoaWxkID0gY3VyQ2hpbGQubmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlbW92ZXMgYSBET00gbm9kZSBvdXQgb2YgdGhlIG9yaWdpbmFsIERPTVxuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0gIHtOb2RlfSBub2RlIFRoZSBub2RlIHRvIHJlbW92ZVxuICAgICAgICAgKiBAcGFyYW0gIHtOb2RlfSBwYXJlbnROb2RlIFRoZSBub2RlcyBwYXJlbnRcbiAgICAgICAgICogQHBhcmFtICB7Qm9vbGVhbn0gc2tpcEtleWVkTm9kZXMgSWYgdHJ1ZSB0aGVuIGVsZW1lbnRzIHdpdGgga2V5cyB3aWxsIGJlIHNraXBwZWQgYW5kIG5vdCBkaXNjYXJkZWQuXG4gICAgICAgICAqIEByZXR1cm4ge3VuZGVmaW5lZH1cbiAgICAgICAgICovXG4gICAgICAgIGZ1bmN0aW9uIHJlbW92ZU5vZGUobm9kZSwgcGFyZW50Tm9kZSwgc2tpcEtleWVkTm9kZXMpIHtcbiAgICAgICAgICAgIGlmIChvbkJlZm9yZU5vZGVEaXNjYXJkZWQobm9kZSkgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgICAgIHBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIG9uTm9kZURpc2NhcmRlZChub2RlKTtcbiAgICAgICAgICAgIHdhbGtEaXNjYXJkZWRDaGlsZE5vZGVzKG5vZGUsIHNraXBLZXllZE5vZGVzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIC8vIFRyZWVXYWxrZXIgaW1wbGVtZW50YXRpb24gaXMgbm8gZmFzdGVyLCBidXQga2VlcGluZyB0aGlzIGFyb3VuZCBpbiBjYXNlIHRoaXMgY2hhbmdlcyBpbiB0aGUgZnV0dXJlXG4gICAgICAgIC8vIGZ1bmN0aW9uIGluZGV4VHJlZShyb290KSB7XG4gICAgICAgIC8vICAgICB2YXIgdHJlZVdhbGtlciA9IGRvY3VtZW50LmNyZWF0ZVRyZWVXYWxrZXIoXG4gICAgICAgIC8vICAgICAgICAgcm9vdCxcbiAgICAgICAgLy8gICAgICAgICBOb2RlRmlsdGVyLlNIT1dfRUxFTUVOVCk7XG4gICAgICAgIC8vXG4gICAgICAgIC8vICAgICB2YXIgZWw7XG4gICAgICAgIC8vICAgICB3aGlsZSgoZWwgPSB0cmVlV2Fsa2VyLm5leHROb2RlKCkpKSB7XG4gICAgICAgIC8vICAgICAgICAgdmFyIGtleSA9IGdldE5vZGVLZXkoZWwpO1xuICAgICAgICAvLyAgICAgICAgIGlmIChrZXkpIHtcbiAgICAgICAgLy8gICAgICAgICAgICAgZnJvbU5vZGVzTG9va3VwW2tleV0gPSBlbDtcbiAgICAgICAgLy8gICAgICAgICB9XG4gICAgICAgIC8vICAgICB9XG4gICAgICAgIC8vIH1cblxuICAgICAgICAvLyAvLyBOb2RlSXRlcmF0b3IgaW1wbGVtZW50YXRpb24gaXMgbm8gZmFzdGVyLCBidXQga2VlcGluZyB0aGlzIGFyb3VuZCBpbiBjYXNlIHRoaXMgY2hhbmdlcyBpbiB0aGUgZnV0dXJlXG4gICAgICAgIC8vXG4gICAgICAgIC8vIGZ1bmN0aW9uIGluZGV4VHJlZShub2RlKSB7XG4gICAgICAgIC8vICAgICB2YXIgbm9kZUl0ZXJhdG9yID0gZG9jdW1lbnQuY3JlYXRlTm9kZUl0ZXJhdG9yKG5vZGUsIE5vZGVGaWx0ZXIuU0hPV19FTEVNRU5UKTtcbiAgICAgICAgLy8gICAgIHZhciBlbDtcbiAgICAgICAgLy8gICAgIHdoaWxlKChlbCA9IG5vZGVJdGVyYXRvci5uZXh0Tm9kZSgpKSkge1xuICAgICAgICAvLyAgICAgICAgIHZhciBrZXkgPSBnZXROb2RlS2V5KGVsKTtcbiAgICAgICAgLy8gICAgICAgICBpZiAoa2V5KSB7XG4gICAgICAgIC8vICAgICAgICAgICAgIGZyb21Ob2Rlc0xvb2t1cFtrZXldID0gZWw7XG4gICAgICAgIC8vICAgICAgICAgfVxuICAgICAgICAvLyAgICAgfVxuICAgICAgICAvLyB9XG5cbiAgICAgICAgZnVuY3Rpb24gaW5kZXhUcmVlKG5vZGUpIHtcbiAgICAgICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSBFTEVNRU5UX05PREUpIHtcbiAgICAgICAgICAgICAgICB2YXIgY3VyQ2hpbGQgPSBub2RlLmZpcnN0Q2hpbGQ7XG4gICAgICAgICAgICAgICAgd2hpbGUgKGN1ckNoaWxkKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBrZXkgPSBnZXROb2RlS2V5KGN1ckNoaWxkKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGtleSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZnJvbU5vZGVzTG9va3VwW2tleV0gPSBjdXJDaGlsZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFdhbGsgcmVjdXJzaXZlbHlcbiAgICAgICAgICAgICAgICAgICAgaW5kZXhUcmVlKGN1ckNoaWxkKTtcblxuICAgICAgICAgICAgICAgICAgICBjdXJDaGlsZCA9IGN1ckNoaWxkLm5leHRTaWJsaW5nO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGluZGV4VHJlZShmcm9tTm9kZSk7XG5cbiAgICAgICAgZnVuY3Rpb24gaGFuZGxlTm9kZUFkZGVkKGVsKSB7XG4gICAgICAgICAgICBvbk5vZGVBZGRlZChlbCk7XG5cbiAgICAgICAgICAgIHZhciBjdXJDaGlsZCA9IGVsLmZpcnN0Q2hpbGQ7XG4gICAgICAgICAgICB3aGlsZSAoY3VyQ2hpbGQpIHtcbiAgICAgICAgICAgICAgICB2YXIgbmV4dFNpYmxpbmcgPSBjdXJDaGlsZC5uZXh0U2libGluZztcblxuICAgICAgICAgICAgICAgIHZhciBrZXkgPSBnZXROb2RlS2V5KGN1ckNoaWxkKTtcbiAgICAgICAgICAgICAgICBpZiAoa2V5KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB1bm1hdGNoZWRGcm9tRWwgPSBmcm9tTm9kZXNMb29rdXBba2V5XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHVubWF0Y2hlZEZyb21FbCAmJiBjb21wYXJlTm9kZU5hbWVzKGN1ckNoaWxkLCB1bm1hdGNoZWRGcm9tRWwpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJDaGlsZC5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZCh1bm1hdGNoZWRGcm9tRWwsIGN1ckNoaWxkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vcnBoRWwodW5tYXRjaGVkRnJvbUVsLCBjdXJDaGlsZCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBoYW5kbGVOb2RlQWRkZWQoY3VyQ2hpbGQpO1xuICAgICAgICAgICAgICAgIGN1ckNoaWxkID0gbmV4dFNpYmxpbmc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBtb3JwaEVsKGZyb21FbCwgdG9FbCwgY2hpbGRyZW5Pbmx5KSB7XG4gICAgICAgICAgICB2YXIgdG9FbEtleSA9IGdldE5vZGVLZXkodG9FbCk7XG4gICAgICAgICAgICB2YXIgY3VyRnJvbU5vZGVLZXk7XG5cbiAgICAgICAgICAgIGlmICh0b0VsS2V5KSB7XG4gICAgICAgICAgICAgICAgLy8gSWYgYW4gZWxlbWVudCB3aXRoIGFuIElEIGlzIGJlaW5nIG1vcnBoZWQgdGhlbiBpdCBpcyB3aWxsIGJlIGluIHRoZSBmaW5hbFxuICAgICAgICAgICAgICAgIC8vIERPTSBzbyBjbGVhciBpdCBvdXQgb2YgdGhlIHNhdmVkIGVsZW1lbnRzIGNvbGxlY3Rpb25cbiAgICAgICAgICAgICAgICBkZWxldGUgZnJvbU5vZGVzTG9va3VwW3RvRWxLZXldO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodG9Ob2RlLmlzU2FtZU5vZGUgJiYgdG9Ob2RlLmlzU2FtZU5vZGUoZnJvbU5vZGUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWNoaWxkcmVuT25seSkge1xuICAgICAgICAgICAgICAgIGlmIChvbkJlZm9yZUVsVXBkYXRlZChmcm9tRWwsIHRvRWwpID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgbW9ycGhBdHRycyhmcm9tRWwsIHRvRWwpO1xuICAgICAgICAgICAgICAgIG9uRWxVcGRhdGVkKGZyb21FbCk7XG5cbiAgICAgICAgICAgICAgICBpZiAob25CZWZvcmVFbENoaWxkcmVuVXBkYXRlZChmcm9tRWwsIHRvRWwpID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZnJvbUVsLm5vZGVOYW1lICE9PSAnVEVYVEFSRUEnKSB7XG4gICAgICAgICAgICAgICAgdmFyIGN1clRvTm9kZUNoaWxkID0gdG9FbC5maXJzdENoaWxkO1xuICAgICAgICAgICAgICAgIHZhciBjdXJGcm9tTm9kZUNoaWxkID0gZnJvbUVsLmZpcnN0Q2hpbGQ7XG4gICAgICAgICAgICAgICAgdmFyIGN1clRvTm9kZUtleTtcblxuICAgICAgICAgICAgICAgIHZhciBmcm9tTmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgdmFyIHRvTmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgdmFyIG1hdGNoaW5nRnJvbUVsO1xuXG4gICAgICAgICAgICAgICAgb3V0ZXI6IHdoaWxlIChjdXJUb05vZGVDaGlsZCkge1xuICAgICAgICAgICAgICAgICAgICB0b05leHRTaWJsaW5nID0gY3VyVG9Ob2RlQ2hpbGQubmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgICAgIGN1clRvTm9kZUtleSA9IGdldE5vZGVLZXkoY3VyVG9Ob2RlQ2hpbGQpO1xuXG4gICAgICAgICAgICAgICAgICAgIHdoaWxlIChjdXJGcm9tTm9kZUNoaWxkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmcm9tTmV4dFNpYmxpbmcgPSBjdXJGcm9tTm9kZUNoaWxkLm5leHRTaWJsaW5nO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY3VyVG9Ob2RlQ2hpbGQuaXNTYW1lTm9kZSAmJiBjdXJUb05vZGVDaGlsZC5pc1NhbWVOb2RlKGN1ckZyb21Ob2RlQ2hpbGQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VyVG9Ob2RlQ2hpbGQgPSB0b05leHRTaWJsaW5nO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1ckZyb21Ob2RlQ2hpbGQgPSBmcm9tTmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWUgb3V0ZXI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGN1ckZyb21Ob2RlS2V5ID0gZ2V0Tm9kZUtleShjdXJGcm9tTm9kZUNoaWxkKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGN1ckZyb21Ob2RlVHlwZSA9IGN1ckZyb21Ob2RlQ2hpbGQubm9kZVR5cGU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBpc0NvbXBhdGlibGUgPSB1bmRlZmluZWQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdXJGcm9tTm9kZVR5cGUgPT09IGN1clRvTm9kZUNoaWxkLm5vZGVUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGN1ckZyb21Ob2RlVHlwZSA9PT0gRUxFTUVOVF9OT0RFKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEJvdGggbm9kZXMgYmVpbmcgY29tcGFyZWQgYXJlIEVsZW1lbnQgbm9kZXNcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY3VyVG9Ob2RlS2V5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGUgdGFyZ2V0IG5vZGUgaGFzIGEga2V5IHNvIHdlIHdhbnQgdG8gbWF0Y2ggaXQgdXAgd2l0aCB0aGUgY29ycmVjdCBlbGVtZW50XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpbiB0aGUgb3JpZ2luYWwgRE9NIHRyZWVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdXJUb05vZGVLZXkgIT09IGN1ckZyb21Ob2RlS2V5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGN1cnJlbnQgZWxlbWVudCBpbiB0aGUgb3JpZ2luYWwgRE9NIHRyZWUgZG9lcyBub3QgaGF2ZSBhIG1hdGNoaW5nIGtleSBzb1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGxldCdzIGNoZWNrIG91ciBsb29rdXAgdG8gc2VlIGlmIHRoZXJlIGlzIGEgbWF0Y2hpbmcgZWxlbWVudCBpbiB0aGUgb3JpZ2luYWxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBET00gdHJlZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICgobWF0Y2hpbmdGcm9tRWwgPSBmcm9tTm9kZXNMb29rdXBbY3VyVG9Ob2RlS2V5XSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGN1ckZyb21Ob2RlQ2hpbGQubmV4dFNpYmxpbmcgPT09IG1hdGNoaW5nRnJvbUVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBTcGVjaWFsIGNhc2UgZm9yIHNpbmdsZSBlbGVtZW50IHJlbW92YWxzLiBUbyBhdm9pZCByZW1vdmluZyB0aGUgb3JpZ2luYWxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIERPTSBub2RlIG91dCBvZiB0aGUgdHJlZSAoc2luY2UgdGhhdCBjYW4gYnJlYWsgQ1NTIHRyYW5zaXRpb25zLCBldGMuKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHdlIHdpbGwgaW5zdGVhZCBkaXNjYXJkIHRoZSBjdXJyZW50IG5vZGUgYW5kIHdhaXQgdW50aWwgdGhlIG5leHRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGl0ZXJhdGlvbiB0byBwcm9wZXJseSBtYXRjaCB1cCB0aGUga2V5ZWQgdGFyZ2V0IGVsZW1lbnQgd2l0aCBpdHMgbWF0Y2hpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGVsZW1lbnQgaW4gdGhlIG9yaWdpbmFsIHRyZWVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzQ29tcGF0aWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2UgZm91bmQgYSBtYXRjaGluZyBrZXllZCBlbGVtZW50IHNvbWV3aGVyZSBpbiB0aGUgb3JpZ2luYWwgRE9NIHRyZWUuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBMZXQncyBtb3ZpbmcgdGhlIG9yaWdpbmFsIERPTSBub2RlIGludG8gdGhlIGN1cnJlbnQgcG9zaXRpb24gYW5kIG1vcnBoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpdC5cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gTk9URTogV2UgdXNlIGluc2VydEJlZm9yZSBpbnN0ZWFkIG9mIHJlcGxhY2VDaGlsZCBiZWNhdXNlIHdlIHdhbnQgdG8gZ28gdGhyb3VnaFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIGByZW1vdmVOb2RlKClgIGZ1bmN0aW9uIGZvciB0aGUgbm9kZSB0aGF0IGlzIGJlaW5nIGRpc2NhcmRlZCBzbyB0aGF0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBhbGwgbGlmZWN5Y2xlIGhvb2tzIGFyZSBjb3JyZWN0bHkgaW52b2tlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZnJvbUVsLmluc2VydEJlZm9yZShtYXRjaGluZ0Zyb21FbCwgY3VyRnJvbU5vZGVDaGlsZCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZyb21OZXh0U2libGluZyA9IGN1ckZyb21Ob2RlQ2hpbGQubmV4dFNpYmxpbmc7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdXJGcm9tTm9kZUtleSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNpbmNlIHRoZSBub2RlIGlzIGtleWVkIGl0IG1pZ2h0IGJlIG1hdGNoZWQgdXAgbGF0ZXIgc28gd2UgZGVmZXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgYWN0dWFsIHJlbW92YWwgdG8gbGF0ZXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhZGRLZXllZFJlbW92YWwoY3VyRnJvbU5vZGVLZXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOT1RFOiB3ZSBza2lwIG5lc3RlZCBrZXllZCBub2RlcyBmcm9tIGJlaW5nIHJlbW92ZWQgc2luY2UgdGhlcmUgaXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgICBzdGlsbCBhIGNoYW5jZSB0aGV5IHdpbGwgYmUgbWF0Y2hlZCB1cCBsYXRlclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZU5vZGUoY3VyRnJvbU5vZGVDaGlsZCwgZnJvbUVsLCB0cnVlIC8qIHNraXAga2V5ZWQgbm9kZXMgKi8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJGcm9tTm9kZUNoaWxkID0gbWF0Y2hpbmdGcm9tRWw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGUgbm9kZXMgYXJlIG5vdCBjb21wYXRpYmxlIHNpbmNlIHRoZSBcInRvXCIgbm9kZSBoYXMgYSBrZXkgYW5kIHRoZXJlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlzIG5vIG1hdGNoaW5nIGtleWVkIG5vZGUgaW4gdGhlIHNvdXJjZSB0cmVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzQ29tcGF0aWJsZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjdXJGcm9tTm9kZUtleSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhlIG9yaWdpbmFsIGhhcyBhIGtleVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNDb21wYXRpYmxlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc0NvbXBhdGlibGUgPSBpc0NvbXBhdGlibGUgIT09IGZhbHNlICYmIGNvbXBhcmVOb2RlTmFtZXMoY3VyRnJvbU5vZGVDaGlsZCwgY3VyVG9Ob2RlQ2hpbGQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNDb21wYXRpYmxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSBmb3VuZCBjb21wYXRpYmxlIERPTSBlbGVtZW50cyBzbyB0cmFuc2Zvcm1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZSBjdXJyZW50IFwiZnJvbVwiIG5vZGUgdG8gbWF0Y2ggdGhlIGN1cnJlbnRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRhcmdldCBET00gbm9kZS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vcnBoRWwoY3VyRnJvbU5vZGVDaGlsZCwgY3VyVG9Ob2RlQ2hpbGQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGN1ckZyb21Ob2RlVHlwZSA9PT0gVEVYVF9OT0RFIHx8IGN1ckZyb21Ob2RlVHlwZSA9PSBDT01NRU5UX05PREUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQm90aCBub2RlcyBiZWluZyBjb21wYXJlZCBhcmUgVGV4dCBvciBDb21tZW50IG5vZGVzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzQ29tcGF0aWJsZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNpbXBseSB1cGRhdGUgbm9kZVZhbHVlIG9uIHRoZSBvcmlnaW5hbCBub2RlIHRvXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNoYW5nZSB0aGUgdGV4dCB2YWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJGcm9tTm9kZUNoaWxkLm5vZGVWYWx1ZSA9IGN1clRvTm9kZUNoaWxkLm5vZGVWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc0NvbXBhdGlibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBBZHZhbmNlIGJvdGggdGhlIFwidG9cIiBjaGlsZCBhbmQgdGhlIFwiZnJvbVwiIGNoaWxkIHNpbmNlIHdlIGZvdW5kIGEgbWF0Y2hcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJUb05vZGVDaGlsZCA9IHRvTmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VyRnJvbU5vZGVDaGlsZCA9IGZyb21OZXh0U2libGluZztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZSBvdXRlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gTm8gY29tcGF0aWJsZSBtYXRjaCBzbyByZW1vdmUgdGhlIG9sZCBub2RlIGZyb20gdGhlIERPTSBhbmQgY29udGludWUgdHJ5aW5nIHRvIGZpbmQgYVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbWF0Y2ggaW4gdGhlIG9yaWdpbmFsIERPTS4gSG93ZXZlciwgd2Ugb25seSBkbyB0aGlzIGlmIHRoZSBmcm9tIG5vZGUgaXMgbm90IGtleWVkXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzaW5jZSBpdCBpcyBwb3NzaWJsZSB0aGF0IGEga2V5ZWQgbm9kZSBtaWdodCBtYXRjaCB1cCB3aXRoIGEgbm9kZSBzb21ld2hlcmUgZWxzZSBpbiB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRhcmdldCB0cmVlIGFuZCB3ZSBkb24ndCB3YW50IHRvIGRpc2NhcmQgaXQganVzdCB5ZXQgc2luY2UgaXQgc3RpbGwgbWlnaHQgZmluZCBhXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBob21lIGluIHRoZSBmaW5hbCBET00gdHJlZS4gQWZ0ZXIgZXZlcnl0aGluZyBpcyBkb25lIHdlIHdpbGwgcmVtb3ZlIGFueSBrZXllZCBub2Rlc1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhhdCBkaWRuJ3QgZmluZCBhIGhvbWVcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdXJGcm9tTm9kZUtleSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNpbmNlIHRoZSBub2RlIGlzIGtleWVkIGl0IG1pZ2h0IGJlIG1hdGNoZWQgdXAgbGF0ZXIgc28gd2UgZGVmZXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgYWN0dWFsIHJlbW92YWwgdG8gbGF0ZXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhZGRLZXllZFJlbW92YWwoY3VyRnJvbU5vZGVLZXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOT1RFOiB3ZSBza2lwIG5lc3RlZCBrZXllZCBub2RlcyBmcm9tIGJlaW5nIHJlbW92ZWQgc2luY2UgdGhlcmUgaXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgICBzdGlsbCBhIGNoYW5jZSB0aGV5IHdpbGwgYmUgbWF0Y2hlZCB1cCBsYXRlclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZU5vZGUoY3VyRnJvbU5vZGVDaGlsZCwgZnJvbUVsLCB0cnVlIC8qIHNraXAga2V5ZWQgbm9kZXMgKi8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJGcm9tTm9kZUNoaWxkID0gZnJvbU5leHRTaWJsaW5nO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgd2UgZ290IHRoaXMgZmFyIHRoZW4gd2UgZGlkIG5vdCBmaW5kIGEgY2FuZGlkYXRlIG1hdGNoIGZvclxuICAgICAgICAgICAgICAgICAgICAvLyBvdXIgXCJ0byBub2RlXCIgYW5kIHdlIGV4aGF1c3RlZCBhbGwgb2YgdGhlIGNoaWxkcmVuIFwiZnJvbVwiXG4gICAgICAgICAgICAgICAgICAgIC8vIG5vZGVzLiBUaGVyZWZvcmUsIHdlIHdpbGwganVzdCBhcHBlbmQgdGhlIGN1cnJlbnQgXCJ0b1wiIG5vZGVcbiAgICAgICAgICAgICAgICAgICAgLy8gdG8gdGhlIGVuZFxuICAgICAgICAgICAgICAgICAgICBpZiAoY3VyVG9Ob2RlS2V5ICYmIChtYXRjaGluZ0Zyb21FbCA9IGZyb21Ob2Rlc0xvb2t1cFtjdXJUb05vZGVLZXldKSAmJiBjb21wYXJlTm9kZU5hbWVzKG1hdGNoaW5nRnJvbUVsLCBjdXJUb05vZGVDaGlsZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZyb21FbC5hcHBlbmRDaGlsZChtYXRjaGluZ0Zyb21FbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBtb3JwaEVsKG1hdGNoaW5nRnJvbUVsLCBjdXJUb05vZGVDaGlsZCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgb25CZWZvcmVOb2RlQWRkZWRSZXN1bHQgPSBvbkJlZm9yZU5vZGVBZGRlZChjdXJUb05vZGVDaGlsZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAob25CZWZvcmVOb2RlQWRkZWRSZXN1bHQgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9uQmVmb3JlTm9kZUFkZGVkUmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1clRvTm9kZUNoaWxkID0gb25CZWZvcmVOb2RlQWRkZWRSZXN1bHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGN1clRvTm9kZUNoaWxkLmFjdHVhbGl6ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJUb05vZGVDaGlsZCA9IGN1clRvTm9kZUNoaWxkLmFjdHVhbGl6ZShmcm9tRWwub3duZXJEb2N1bWVudCB8fCBkb2MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmcm9tRWwuYXBwZW5kQ2hpbGQoY3VyVG9Ob2RlQ2hpbGQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZU5vZGVBZGRlZChjdXJUb05vZGVDaGlsZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBjdXJUb05vZGVDaGlsZCA9IHRvTmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgICAgIGN1ckZyb21Ob2RlQ2hpbGQgPSBmcm9tTmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gV2UgaGF2ZSBwcm9jZXNzZWQgYWxsIG9mIHRoZSBcInRvIG5vZGVzXCIuIElmIGN1ckZyb21Ob2RlQ2hpbGQgaXNcbiAgICAgICAgICAgICAgICAvLyBub24tbnVsbCB0aGVuIHdlIHN0aWxsIGhhdmUgc29tZSBmcm9tIG5vZGVzIGxlZnQgb3ZlciB0aGF0IG5lZWRcbiAgICAgICAgICAgICAgICAvLyB0byBiZSByZW1vdmVkXG4gICAgICAgICAgICAgICAgd2hpbGUgKGN1ckZyb21Ob2RlQ2hpbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgZnJvbU5leHRTaWJsaW5nID0gY3VyRnJvbU5vZGVDaGlsZC5uZXh0U2libGluZztcbiAgICAgICAgICAgICAgICAgICAgaWYgKChjdXJGcm9tTm9kZUtleSA9IGdldE5vZGVLZXkoY3VyRnJvbU5vZGVDaGlsZCkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBTaW5jZSB0aGUgbm9kZSBpcyBrZXllZCBpdCBtaWdodCBiZSBtYXRjaGVkIHVwIGxhdGVyIHNvIHdlIGRlZmVyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgYWN0dWFsIHJlbW92YWwgdG8gbGF0ZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkZEtleWVkUmVtb3ZhbChjdXJGcm9tTm9kZUtleSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBOT1RFOiB3ZSBza2lwIG5lc3RlZCBrZXllZCBub2RlcyBmcm9tIGJlaW5nIHJlbW92ZWQgc2luY2UgdGhlcmUgaXNcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICAgIHN0aWxsIGEgY2hhbmNlIHRoZXkgd2lsbCBiZSBtYXRjaGVkIHVwIGxhdGVyXG4gICAgICAgICAgICAgICAgICAgICAgICByZW1vdmVOb2RlKGN1ckZyb21Ob2RlQ2hpbGQsIGZyb21FbCwgdHJ1ZSAvKiBza2lwIGtleWVkIG5vZGVzICovKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjdXJGcm9tTm9kZUNoaWxkID0gZnJvbU5leHRTaWJsaW5nO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHNwZWNpYWxFbEhhbmRsZXIgPSBzcGVjaWFsRWxIYW5kbGVyc1tmcm9tRWwubm9kZU5hbWVdO1xuICAgICAgICAgICAgaWYgKHNwZWNpYWxFbEhhbmRsZXIpIHtcbiAgICAgICAgICAgICAgICBzcGVjaWFsRWxIYW5kbGVyKGZyb21FbCwgdG9FbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gLy8gRU5EOiBtb3JwaEVsKC4uLilcblxuICAgICAgICB2YXIgbW9ycGhlZE5vZGUgPSBmcm9tTm9kZTtcbiAgICAgICAgdmFyIG1vcnBoZWROb2RlVHlwZSA9IG1vcnBoZWROb2RlLm5vZGVUeXBlO1xuICAgICAgICB2YXIgdG9Ob2RlVHlwZSA9IHRvTm9kZS5ub2RlVHlwZTtcblxuICAgICAgICBpZiAoIWNoaWxkcmVuT25seSkge1xuICAgICAgICAgICAgLy8gSGFuZGxlIHRoZSBjYXNlIHdoZXJlIHdlIGFyZSBnaXZlbiB0d28gRE9NIG5vZGVzIHRoYXQgYXJlIG5vdFxuICAgICAgICAgICAgLy8gY29tcGF0aWJsZSAoZS5nLiA8ZGl2PiAtLT4gPHNwYW4+IG9yIDxkaXY+IC0tPiBURVhUKVxuICAgICAgICAgICAgaWYgKG1vcnBoZWROb2RlVHlwZSA9PT0gRUxFTUVOVF9OT0RFKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRvTm9kZVR5cGUgPT09IEVMRU1FTlRfTk9ERSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWNvbXBhcmVOb2RlTmFtZXMoZnJvbU5vZGUsIHRvTm9kZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9uTm9kZURpc2NhcmRlZChmcm9tTm9kZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBtb3JwaGVkTm9kZSA9IG1vdmVDaGlsZHJlbihmcm9tTm9kZSwgY3JlYXRlRWxlbWVudE5TKHRvTm9kZS5ub2RlTmFtZSwgdG9Ob2RlLm5hbWVzcGFjZVVSSSkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gR29pbmcgZnJvbSBhbiBlbGVtZW50IG5vZGUgdG8gYSB0ZXh0IG5vZGVcbiAgICAgICAgICAgICAgICAgICAgbW9ycGhlZE5vZGUgPSB0b05vZGU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChtb3JwaGVkTm9kZVR5cGUgPT09IFRFWFRfTk9ERSB8fCBtb3JwaGVkTm9kZVR5cGUgPT09IENPTU1FTlRfTk9ERSkgeyAvLyBUZXh0IG9yIGNvbW1lbnQgbm9kZVxuICAgICAgICAgICAgICAgIGlmICh0b05vZGVUeXBlID09PSBtb3JwaGVkTm9kZVR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgbW9ycGhlZE5vZGUubm9kZVZhbHVlID0gdG9Ob2RlLm5vZGVWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1vcnBoZWROb2RlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRleHQgbm9kZSB0byBzb21ldGhpbmcgZWxzZVxuICAgICAgICAgICAgICAgICAgICBtb3JwaGVkTm9kZSA9IHRvTm9kZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobW9ycGhlZE5vZGUgPT09IHRvTm9kZSkge1xuICAgICAgICAgICAgLy8gVGhlIFwidG8gbm9kZVwiIHdhcyBub3QgY29tcGF0aWJsZSB3aXRoIHRoZSBcImZyb20gbm9kZVwiIHNvIHdlIGhhZCB0b1xuICAgICAgICAgICAgLy8gdG9zcyBvdXQgdGhlIFwiZnJvbSBub2RlXCIgYW5kIHVzZSB0aGUgXCJ0byBub2RlXCJcbiAgICAgICAgICAgIG9uTm9kZURpc2NhcmRlZChmcm9tTm9kZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBtb3JwaEVsKG1vcnBoZWROb2RlLCB0b05vZGUsIGNoaWxkcmVuT25seSk7XG5cbiAgICAgICAgICAgIC8vIFdlIG5vdyBuZWVkIHRvIGxvb3Agb3ZlciBhbnkga2V5ZWQgbm9kZXMgdGhhdCBtaWdodCBuZWVkIHRvIGJlXG4gICAgICAgICAgICAvLyByZW1vdmVkLiBXZSBvbmx5IGRvIHRoZSByZW1vdmFsIGlmIHdlIGtub3cgdGhhdCB0aGUga2V5ZWQgbm9kZVxuICAgICAgICAgICAgLy8gbmV2ZXIgZm91bmQgYSBtYXRjaC4gV2hlbiBhIGtleWVkIG5vZGUgaXMgbWF0Y2hlZCB1cCB3ZSByZW1vdmVcbiAgICAgICAgICAgIC8vIGl0IG91dCBvZiBmcm9tTm9kZXNMb29rdXAgYW5kIHdlIHVzZSBmcm9tTm9kZXNMb29rdXAgdG8gZGV0ZXJtaW5lXG4gICAgICAgICAgICAvLyBpZiBhIGtleWVkIG5vZGUgaGFzIGJlZW4gbWF0Y2hlZCB1cCBvciBub3RcbiAgICAgICAgICAgIGlmIChrZXllZFJlbW92YWxMaXN0KSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaT0wLCBsZW49a2V5ZWRSZW1vdmFsTGlzdC5sZW5ndGg7IGk8bGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGVsVG9SZW1vdmUgPSBmcm9tTm9kZXNMb29rdXBba2V5ZWRSZW1vdmFsTGlzdFtpXV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChlbFRvUmVtb3ZlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZW1vdmVOb2RlKGVsVG9SZW1vdmUsIGVsVG9SZW1vdmUucGFyZW50Tm9kZSwgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFjaGlsZHJlbk9ubHkgJiYgbW9ycGhlZE5vZGUgIT09IGZyb21Ob2RlICYmIGZyb21Ob2RlLnBhcmVudE5vZGUpIHtcbiAgICAgICAgICAgIGlmIChtb3JwaGVkTm9kZS5hY3R1YWxpemUpIHtcbiAgICAgICAgICAgICAgICBtb3JwaGVkTm9kZSA9IG1vcnBoZWROb2RlLmFjdHVhbGl6ZShmcm9tTm9kZS5vd25lckRvY3VtZW50IHx8IGRvYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBJZiB3ZSBoYWQgdG8gc3dhcCBvdXQgdGhlIGZyb20gbm9kZSB3aXRoIGEgbmV3IG5vZGUgYmVjYXVzZSB0aGUgb2xkXG4gICAgICAgICAgICAvLyBub2RlIHdhcyBub3QgY29tcGF0aWJsZSB3aXRoIHRoZSB0YXJnZXQgbm9kZSB0aGVuIHdlIG5lZWQgdG9cbiAgICAgICAgICAgIC8vIHJlcGxhY2UgdGhlIG9sZCBET00gbm9kZSBpbiB0aGUgb3JpZ2luYWwgRE9NIHRyZWUuIFRoaXMgaXMgb25seVxuICAgICAgICAgICAgLy8gcG9zc2libGUgaWYgdGhlIG9yaWdpbmFsIERPTSBub2RlIHdhcyBwYXJ0IG9mIGEgRE9NIHRyZWUgd2hpY2hcbiAgICAgICAgICAgIC8vIHdlIGtub3cgaXMgdGhlIGNhc2UgaWYgaXQgaGFzIGEgcGFyZW50IG5vZGUuXG4gICAgICAgICAgICBmcm9tTm9kZS5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZChtb3JwaGVkTm9kZSwgZnJvbU5vZGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG1vcnBoZWROb2RlO1xuICAgIH07XG59XG5cbnZhciBtb3JwaGRvbSA9IG1vcnBoZG9tRmFjdG9yeShtb3JwaEF0dHJzKTtcblxubW9kdWxlLmV4cG9ydHMgPSBtb3JwaGRvbTtcbiIsIm1vZHVsZS5leHBvcnRzID0gW1xuICAvLyBhdHRyaWJ1dGUgZXZlbnRzIChjYW4gYmUgc2V0IHdpdGggYXR0cmlidXRlcylcbiAgJ29uY2xpY2snLFxuICAnb25kYmxjbGljaycsXG4gICdvbm1vdXNlZG93bicsXG4gICdvbm1vdXNldXAnLFxuICAnb25tb3VzZW92ZXInLFxuICAnb25tb3VzZW1vdmUnLFxuICAnb25tb3VzZW91dCcsXG4gICdvbmRyYWdzdGFydCcsXG4gICdvbmRyYWcnLFxuICAnb25kcmFnZW50ZXInLFxuICAnb25kcmFnbGVhdmUnLFxuICAnb25kcmFnb3ZlcicsXG4gICdvbmRyb3AnLFxuICAnb25kcmFnZW5kJyxcbiAgJ29ua2V5ZG93bicsXG4gICdvbmtleXByZXNzJyxcbiAgJ29ua2V5dXAnLFxuICAnb251bmxvYWQnLFxuICAnb25hYm9ydCcsXG4gICdvbmVycm9yJyxcbiAgJ29ucmVzaXplJyxcbiAgJ29uc2Nyb2xsJyxcbiAgJ29uc2VsZWN0JyxcbiAgJ29uY2hhbmdlJyxcbiAgJ29uc3VibWl0JyxcbiAgJ29ucmVzZXQnLFxuICAnb25mb2N1cycsXG4gICdvbmJsdXInLFxuICAnb25pbnB1dCcsXG4gIC8vIG90aGVyIGNvbW1vbiBldmVudHNcbiAgJ29uY29udGV4dG1lbnUnLFxuICAnb25mb2N1c2luJyxcbiAgJ29uZm9jdXNvdXQnXG5dXG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHlveW9pZnlBcHBlbmRDaGlsZCAoZWwsIGNoaWxkcykge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGNoaWxkcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBub2RlID0gY2hpbGRzW2ldXG4gICAgaWYgKEFycmF5LmlzQXJyYXkobm9kZSkpIHtcbiAgICAgIHlveW9pZnlBcHBlbmRDaGlsZChlbCwgbm9kZSlcbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuICAgIGlmICh0eXBlb2Ygbm9kZSA9PT0gJ251bWJlcicgfHxcbiAgICAgIHR5cGVvZiBub2RlID09PSAnYm9vbGVhbicgfHxcbiAgICAgIG5vZGUgaW5zdGFuY2VvZiBEYXRlIHx8XG4gICAgICBub2RlIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgICBub2RlID0gbm9kZS50b1N0cmluZygpXG4gICAgfVxuICAgIGlmICh0eXBlb2Ygbm9kZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGlmIChlbC5sYXN0Q2hpbGQgJiYgZWwubGFzdENoaWxkLm5vZGVOYW1lID09PSAnI3RleHQnKSB7XG4gICAgICAgIGVsLmxhc3RDaGlsZC5ub2RlVmFsdWUgKz0gbm9kZVxuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuICAgICAgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKG5vZGUpXG4gICAgfVxuICAgIGlmIChub2RlICYmIG5vZGUubm9kZVR5cGUpIHtcbiAgICAgIGVsLmFwcGVuZENoaWxkKG5vZGUpXG4gICAgfVxuICB9XG59XG4iLCJjb25zdCBVdGlscyA9IHJlcXVpcmUoJy4uL2NvcmUvVXRpbHMnKVxuY29uc3QgVHJhbnNsYXRvciA9IHJlcXVpcmUoJy4uL2NvcmUvVHJhbnNsYXRvcicpXG5jb25zdCBVcHB5U29ja2V0ID0gcmVxdWlyZSgnLi9VcHB5U29ja2V0JylcbmNvbnN0IGVlID0gcmVxdWlyZSgnbmFtZXNwYWNlLWVtaXR0ZXInKVxuY29uc3QgdGhyb3R0bGUgPSByZXF1aXJlKCdsb2Rhc2gudGhyb3R0bGUnKVxuLy8gY29uc3QgZW5fVVMgPSByZXF1aXJlKCcuLi9sb2NhbGVzL2VuX1VTJylcbi8vIGNvbnN0IGRlZXBGcmVlemUgPSByZXF1aXJlKCdkZWVwLWZyZWV6ZS1zdHJpY3QnKVxuXG4vKipcbiAqIE1haW4gVXBweSBjb3JlXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IG9wdHMgZ2VuZXJhbCBvcHRpb25zLCBsaWtlIGxvY2FsZXMsIHRvIHNob3cgbW9kYWwgb3Igbm90IHRvIHNob3dcbiAqL1xuY2xhc3MgVXBweSB7XG4gIGNvbnN0cnVjdG9yIChvcHRzKSB7XG4gICAgLy8gc2V0IGRlZmF1bHQgb3B0aW9uc1xuICAgIGNvbnN0IGRlZmF1bHRPcHRpb25zID0ge1xuICAgICAgLy8gbG9hZCBFbmdsaXNoIGFzIHRoZSBkZWZhdWx0IGxvY2FsZVxuICAgICAgLy8gbG9jYWxlOiBlbl9VUyxcbiAgICAgIGF1dG9Qcm9jZWVkOiB0cnVlLFxuICAgICAgZGVidWc6IGZhbHNlXG4gICAgfVxuXG4gICAgLy8gTWVyZ2UgZGVmYXVsdCBvcHRpb25zIHdpdGggdGhlIG9uZXMgc2V0IGJ5IHVzZXJcbiAgICB0aGlzLm9wdHMgPSBPYmplY3QuYXNzaWduKHt9LCBkZWZhdWx0T3B0aW9ucywgb3B0cylcblxuICAgIC8vIC8vIERpY3RhdGVzIGluIHdoYXQgb3JkZXIgZGlmZmVyZW50IHBsdWdpbiB0eXBlcyBhcmUgcmFuOlxuICAgIC8vIHRoaXMudHlwZXMgPSBbICdwcmVzZXR0ZXInLCAnb3JjaGVzdHJhdG9yJywgJ3Byb2dyZXNzaW5kaWNhdG9yJyxcbiAgICAvLyAgICAgICAgICAgICAgICAgJ2FjcXVpcmVyJywgJ21vZGlmaWVyJywgJ3VwbG9hZGVyJywgJ3ByZXNlbnRlcicsICdkZWJ1Z2dlciddXG5cbiAgICAvLyBDb250YWluZXIgZm9yIGRpZmZlcmVudCB0eXBlcyBvZiBwbHVnaW5zXG4gICAgdGhpcy5wbHVnaW5zID0ge31cblxuICAgIHRoaXMudHJhbnNsYXRvciA9IG5ldyBUcmFuc2xhdG9yKHtsb2NhbGU6IHRoaXMub3B0cy5sb2NhbGV9KVxuICAgIHRoaXMuaTE4biA9IHRoaXMudHJhbnNsYXRvci50cmFuc2xhdGUuYmluZCh0aGlzLnRyYW5zbGF0b3IpXG4gICAgdGhpcy5nZXRTdGF0ZSA9IHRoaXMuZ2V0U3RhdGUuYmluZCh0aGlzKVxuICAgIHRoaXMudXBkYXRlTWV0YSA9IHRoaXMudXBkYXRlTWV0YS5iaW5kKHRoaXMpXG4gICAgdGhpcy5pbml0U29ja2V0ID0gdGhpcy5pbml0U29ja2V0LmJpbmQodGhpcylcbiAgICB0aGlzLmxvZyA9IHRoaXMubG9nLmJpbmQodGhpcylcbiAgICB0aGlzLmFkZEZpbGUgPSB0aGlzLmFkZEZpbGUuYmluZCh0aGlzKVxuICAgIHRoaXMuY2FsY3VsYXRlUHJvZ3Jlc3MgPSB0aGlzLmNhbGN1bGF0ZVByb2dyZXNzLmJpbmQodGhpcylcblxuICAgIHRoaXMuYnVzID0gdGhpcy5lbWl0dGVyID0gZWUoKVxuICAgIHRoaXMub24gPSB0aGlzLmJ1cy5vbi5iaW5kKHRoaXMuYnVzKVxuICAgIHRoaXMuZW1pdCA9IHRoaXMuYnVzLmVtaXQuYmluZCh0aGlzLmJ1cylcblxuICAgIHRoaXMuc3RhdGUgPSB7XG4gICAgICBmaWxlczoge30sXG4gICAgICBjYXBhYmlsaXRpZXM6IHtcbiAgICAgICAgcmVzdW1hYmxlVXBsb2FkczogZmFsc2VcbiAgICAgIH0sXG4gICAgICB0b3RhbFByb2dyZXNzOiAwXG4gICAgfVxuXG4gICAgLy8gZm9yIGRlYnVnZ2luZyBhbmQgdGVzdGluZ1xuICAgIHRoaXMudXBkYXRlTnVtID0gMFxuICAgIGlmICh0aGlzLm9wdHMuZGVidWcpIHtcbiAgICAgIGdsb2JhbC5VcHB5U3RhdGUgPSB0aGlzLnN0YXRlXG4gICAgICBnbG9iYWwudXBweUxvZyA9ICcnXG4gICAgICBnbG9iYWwuVXBweUFkZEZpbGUgPSB0aGlzLmFkZEZpbGUuYmluZCh0aGlzKVxuICAgICAgZ2xvYmFsLl9VcHB5ID0gdGhpc1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBJdGVyYXRlIG9uIGFsbCBwbHVnaW5zIGFuZCBydW4gYHVwZGF0ZWAgb24gdGhlbS4gQ2FsbGVkIGVhY2ggdGltZSBzdGF0ZSBjaGFuZ2VzXG4gICAqXG4gICAqL1xuICB1cGRhdGVBbGwgKHN0YXRlKSB7XG4gICAgT2JqZWN0LmtleXModGhpcy5wbHVnaW5zKS5mb3JFYWNoKChwbHVnaW5UeXBlKSA9PiB7XG4gICAgICB0aGlzLnBsdWdpbnNbcGx1Z2luVHlwZV0uZm9yRWFjaCgocGx1Z2luKSA9PiB7XG4gICAgICAgIHBsdWdpbi51cGRhdGUoc3RhdGUpXG4gICAgICB9KVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlcyBzdGF0ZVxuICAgKlxuICAgKiBAcGFyYW0ge25ld1N0YXRlfSBvYmplY3RcbiAgICovXG4gIHNldFN0YXRlIChzdGF0ZVVwZGF0ZSkge1xuICAgIGNvbnN0IG5ld1N0YXRlID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5zdGF0ZSwgc3RhdGVVcGRhdGUpXG4gICAgdGhpcy5lbWl0KCdjb3JlOnN0YXRlLXVwZGF0ZScsIHRoaXMuc3RhdGUsIG5ld1N0YXRlLCBzdGF0ZVVwZGF0ZSlcblxuICAgIHRoaXMuc3RhdGUgPSBuZXdTdGF0ZVxuICAgIHRoaXMudXBkYXRlQWxsKHRoaXMuc3RhdGUpXG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBjdXJyZW50IHN0YXRlXG4gICAqXG4gICAqL1xuICBnZXRTdGF0ZSAoKSB7XG4gICAgLy8gdXNlIGRlZXBGcmVlemUgZm9yIGRlYnVnZ2luZ1xuICAgIC8vIHJldHVybiBkZWVwRnJlZXplKHRoaXMuc3RhdGUpXG4gICAgcmV0dXJuIHRoaXMuc3RhdGVcbiAgfVxuXG4gIHVwZGF0ZU1ldGEgKGRhdGEsIGZpbGVJRCkge1xuICAgIGNvbnN0IHVwZGF0ZWRGaWxlcyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuZ2V0U3RhdGUoKS5maWxlcylcbiAgICBjb25zdCBuZXdNZXRhID0gT2JqZWN0LmFzc2lnbih7fSwgdXBkYXRlZEZpbGVzW2ZpbGVJRF0ubWV0YSwgZGF0YSlcbiAgICB1cGRhdGVkRmlsZXNbZmlsZUlEXSA9IE9iamVjdC5hc3NpZ24oe30sIHVwZGF0ZWRGaWxlc1tmaWxlSURdLCB7XG4gICAgICBtZXRhOiBuZXdNZXRhXG4gICAgfSlcbiAgICB0aGlzLnNldFN0YXRlKHtmaWxlczogdXBkYXRlZEZpbGVzfSlcbiAgfVxuXG4gIGFkZEZpbGUgKGZpbGUpIHtcbiAgICBjb25zdCB1cGRhdGVkRmlsZXMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLnN0YXRlLmZpbGVzKVxuXG4gICAgY29uc3QgZmlsZU5hbWUgPSBmaWxlLm5hbWUgfHwgJ25vbmFtZSdcbiAgICBjb25zdCBmaWxlVHlwZSA9IFV0aWxzLmdldEZpbGVUeXBlKGZpbGUpID8gVXRpbHMuZ2V0RmlsZVR5cGUoZmlsZSkuc3BsaXQoJy8nKSA6IFsnJywgJyddXG4gICAgY29uc3QgZmlsZVR5cGVHZW5lcmFsID0gZmlsZVR5cGVbMF1cbiAgICBjb25zdCBmaWxlVHlwZVNwZWNpZmljID0gZmlsZVR5cGVbMV1cbiAgICBjb25zdCBmaWxlRXh0ZW5zaW9uID0gVXRpbHMuZ2V0RmlsZU5hbWVBbmRFeHRlbnNpb24oZmlsZU5hbWUpWzFdXG4gICAgY29uc3QgaXNSZW1vdGUgPSBmaWxlLmlzUmVtb3RlIHx8IGZhbHNlXG5cbiAgICBjb25zdCBmaWxlSUQgPSBVdGlscy5nZW5lcmF0ZUZpbGVJRChmaWxlTmFtZSlcblxuICAgIGNvbnN0IG5ld0ZpbGUgPSB7XG4gICAgICBzb3VyY2U6IGZpbGUuc291cmNlIHx8ICcnLFxuICAgICAgaWQ6IGZpbGVJRCxcbiAgICAgIG5hbWU6IGZpbGVOYW1lLFxuICAgICAgZXh0ZW5zaW9uOiBmaWxlRXh0ZW5zaW9uIHx8ICcnLFxuICAgICAgbWV0YToge1xuICAgICAgICBuYW1lOiBmaWxlTmFtZVxuICAgICAgfSxcbiAgICAgIHR5cGU6IHtcbiAgICAgICAgZ2VuZXJhbDogZmlsZVR5cGVHZW5lcmFsLFxuICAgICAgICBzcGVjaWZpYzogZmlsZVR5cGVTcGVjaWZpY1xuICAgICAgfSxcbiAgICAgIGRhdGE6IGZpbGUuZGF0YSxcbiAgICAgIHByb2dyZXNzOiB7XG4gICAgICAgIHBlcmNlbnRhZ2U6IDAsXG4gICAgICAgIHVwbG9hZENvbXBsZXRlOiBmYWxzZSxcbiAgICAgICAgdXBsb2FkU3RhcnRlZDogZmFsc2VcbiAgICAgIH0sXG4gICAgICBzaXplOiBmaWxlLmRhdGEuc2l6ZSB8fCAnTi9BJyxcbiAgICAgIGlzUmVtb3RlOiBpc1JlbW90ZSxcbiAgICAgIHJlbW90ZTogZmlsZS5yZW1vdGUgfHwgJydcbiAgICB9XG5cbiAgICB1cGRhdGVkRmlsZXNbZmlsZUlEXSA9IG5ld0ZpbGVcbiAgICB0aGlzLnNldFN0YXRlKHtmaWxlczogdXBkYXRlZEZpbGVzfSlcblxuICAgIHRoaXMuYnVzLmVtaXQoJ2ZpbGUtYWRkZWQnLCBmaWxlSUQpXG4gICAgdGhpcy5sb2coYEFkZGVkIGZpbGU6ICR7ZmlsZU5hbWV9LCAke2ZpbGVJRH0sIG1pbWUgdHlwZTogJHtmaWxlVHlwZX1gKVxuXG4gICAgaWYgKGZpbGVUeXBlR2VuZXJhbCA9PT0gJ2ltYWdlJyAmJiAhaXNSZW1vdGUpIHtcbiAgICAgIHRoaXMuYWRkVGh1bWJuYWlsKG5ld0ZpbGUuaWQpXG4gICAgfVxuXG4gICAgaWYgKHRoaXMub3B0cy5hdXRvUHJvY2VlZCkge1xuICAgICAgdGhpcy5idXMuZW1pdCgnY29yZTp1cGxvYWQnKVxuICAgIH1cbiAgfVxuXG4gIHJlbW92ZUZpbGUgKGZpbGVJRCkge1xuICAgIGNvbnN0IHVwZGF0ZWRGaWxlcyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuZ2V0U3RhdGUoKS5maWxlcylcbiAgICBkZWxldGUgdXBkYXRlZEZpbGVzW2ZpbGVJRF1cbiAgICB0aGlzLnNldFN0YXRlKHtmaWxlczogdXBkYXRlZEZpbGVzfSlcbiAgICB0aGlzLmNhbGN1bGF0ZVRvdGFsUHJvZ3Jlc3MoKVxuICAgIHRoaXMubG9nKGBSZW1vdmVkIGZpbGU6ICR7ZmlsZUlEfWApXG4gIH1cblxuICBhZGRUaHVtYm5haWwgKGZpbGVJRCkge1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldFN0YXRlKCkuZmlsZXNbZmlsZUlEXVxuXG4gICAgVXRpbHMucmVhZEZpbGUoZmlsZS5kYXRhKVxuICAgICAgLnRoZW4oKGltZ0RhdGFVUkkpID0+IFV0aWxzLmNyZWF0ZUltYWdlVGh1bWJuYWlsKGltZ0RhdGFVUkksIDIwMCkpXG4gICAgICAudGhlbigodGh1bWJuYWlsKSA9PiB7XG4gICAgICAgIGNvbnN0IHVwZGF0ZWRGaWxlcyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuZ2V0U3RhdGUoKS5maWxlcylcbiAgICAgICAgY29uc3QgdXBkYXRlZEZpbGUgPSBPYmplY3QuYXNzaWduKHt9LCB1cGRhdGVkRmlsZXNbZmlsZUlEXSwge1xuICAgICAgICAgIHByZXZpZXc6IHRodW1ibmFpbFxuICAgICAgICB9KVxuICAgICAgICB1cGRhdGVkRmlsZXNbZmlsZUlEXSA9IHVwZGF0ZWRGaWxlXG4gICAgICAgIHRoaXMuc2V0U3RhdGUoe2ZpbGVzOiB1cGRhdGVkRmlsZXN9KVxuICAgICAgfSlcbiAgfVxuXG4gIHN0YXJ0VXBsb2FkICgpIHtcbiAgICB0aGlzLmVtaXQoJ2NvcmU6dXBsb2FkJylcbiAgfVxuXG4gIGNhbGN1bGF0ZVByb2dyZXNzIChkYXRhKSB7XG4gICAgY29uc3QgZmlsZUlEID0gZGF0YS5pZFxuICAgIGNvbnN0IHVwZGF0ZWRGaWxlcyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuZ2V0U3RhdGUoKS5maWxlcylcblxuICAgIC8vIHNraXAgcHJvZ3Jlc3MgZXZlbnQgZm9yIGEgZmlsZSB0aGF04oCZcyBiZWVuIHJlbW92ZWRcbiAgICBpZiAoIXVwZGF0ZWRGaWxlc1tmaWxlSURdKSB7XG4gICAgICB0aGlzLmxvZygnVHJ5aW5nIHRvIHNldCBwcm9ncmVzcyBmb3IgYSBmaWxlIHRoYXTigJlzIG5vdCB3aXRoIHVzIGFueW1vcmU6ICcsIGZpbGVJRClcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IHVwZGF0ZWRGaWxlID0gT2JqZWN0LmFzc2lnbih7fSwgdXBkYXRlZEZpbGVzW2ZpbGVJRF0sXG4gICAgICBPYmplY3QuYXNzaWduKHt9LCB7XG4gICAgICAgIHByb2dyZXNzOiBPYmplY3QuYXNzaWduKHt9LCB1cGRhdGVkRmlsZXNbZmlsZUlEXS5wcm9ncmVzcywge1xuICAgICAgICAgIGJ5dGVzVXBsb2FkZWQ6IGRhdGEuYnl0ZXNVcGxvYWRlZCxcbiAgICAgICAgICBieXRlc1RvdGFsOiBkYXRhLmJ5dGVzVG90YWwsXG4gICAgICAgICAgcGVyY2VudGFnZTogTWF0aC5mbG9vcigoZGF0YS5ieXRlc1VwbG9hZGVkIC8gZGF0YS5ieXRlc1RvdGFsICogMTAwKS50b0ZpeGVkKDIpKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICkpXG4gICAgdXBkYXRlZEZpbGVzW2RhdGEuaWRdID0gdXBkYXRlZEZpbGVcblxuICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgZmlsZXM6IHVwZGF0ZWRGaWxlc1xuICAgIH0pXG5cbiAgICB0aGlzLmNhbGN1bGF0ZVRvdGFsUHJvZ3Jlc3MoKVxuICB9XG5cbiAgY2FsY3VsYXRlVG90YWxQcm9ncmVzcyAoKSB7XG4gICAgLy8gY2FsY3VsYXRlIHRvdGFsIHByb2dyZXNzLCB1c2luZyB0aGUgbnVtYmVyIG9mIGZpbGVzIGN1cnJlbnRseSB1cGxvYWRpbmcsXG4gICAgLy8gbXVsdGlwbGllZCBieSAxMDAgYW5kIHRoZSBzdW1tIG9mIGluZGl2aWR1YWwgcHJvZ3Jlc3Mgb2YgZWFjaCBmaWxlXG4gICAgY29uc3QgZmlsZXMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmdldFN0YXRlKCkuZmlsZXMpXG5cbiAgICBjb25zdCBpblByb2dyZXNzID0gT2JqZWN0LmtleXMoZmlsZXMpLmZpbHRlcigoZmlsZSkgPT4ge1xuICAgICAgcmV0dXJuIGZpbGVzW2ZpbGVdLnByb2dyZXNzLnVwbG9hZFN0YXJ0ZWRcbiAgICB9KVxuICAgIGNvbnN0IHByb2dyZXNzTWF4ID0gaW5Qcm9ncmVzcy5sZW5ndGggKiAxMDBcbiAgICBsZXQgcHJvZ3Jlc3NBbGwgPSAwXG4gICAgaW5Qcm9ncmVzcy5mb3JFYWNoKChmaWxlKSA9PiB7XG4gICAgICBwcm9ncmVzc0FsbCA9IHByb2dyZXNzQWxsICsgZmlsZXNbZmlsZV0ucHJvZ3Jlc3MucGVyY2VudGFnZVxuICAgIH0pXG5cbiAgICBjb25zdCB0b3RhbFByb2dyZXNzID0gTWF0aC5mbG9vcigocHJvZ3Jlc3NBbGwgKiAxMDAgLyBwcm9ncmVzc01heCkudG9GaXhlZCgyKSlcblxuICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgdG90YWxQcm9ncmVzczogdG90YWxQcm9ncmVzc1xuICAgIH0pXG5cbiAgICAvLyBpZiAodG90YWxQcm9ncmVzcyA9PT0gMTAwKSB7XG4gICAgLy8gICBjb25zdCBjb21wbGV0ZUZpbGVzID0gT2JqZWN0LmtleXModXBkYXRlZEZpbGVzKS5maWx0ZXIoKGZpbGUpID0+IHtcbiAgICAvLyAgICAgLy8gdGhpcyBzaG91bGQgYmUgYHVwbG9hZENvbXBsZXRlYFxuICAgIC8vICAgICByZXR1cm4gdXBkYXRlZEZpbGVzW2ZpbGVdLnByb2dyZXNzLnBlcmNlbnRhZ2UgPT09IDEwMFxuICAgIC8vICAgfSlcbiAgICAvLyAgIHRoaXMuZW1pdCgnY29yZTpzdWNjZXNzJywgY29tcGxldGVGaWxlcy5sZW5ndGgpXG4gICAgLy8gfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlZ2lzdGVycyBsaXN0ZW5lcnMgZm9yIGFsbCBnbG9iYWwgYWN0aW9ucywgbGlrZTpcbiAgICogYGZpbGUtYWRkYCwgYGZpbGUtcmVtb3ZlYCwgYHVwbG9hZC1wcm9ncmVzc2AsIGByZXNldGBcbiAgICpcbiAgICovXG4gIGFjdGlvbnMgKCkge1xuICAgIC8vIHRoaXMuYnVzLm9uKCcqJywgKHBheWxvYWQpID0+IHtcbiAgICAvLyAgIGNvbnNvbGUubG9nKCdlbWl0dGVkOiAnLCB0aGlzLmV2ZW50KVxuICAgIC8vICAgY29uc29sZS5sb2coJ3dpdGggcGF5bG9hZDogJywgcGF5bG9hZClcbiAgICAvLyB9KVxuXG4gICAgLy8gc3RyZXNzLXRlc3QgcmUtcmVuZGVyaW5nXG4gICAgLy8gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgIC8vICAgdGhpcy5zZXRTdGF0ZSh7YmxhOiAnYmxhJ30pXG4gICAgLy8gfSwgMjApXG5cbiAgICB0aGlzLm9uKCdjb3JlOmZpbGUtYWRkJywgKGRhdGEpID0+IHtcbiAgICAgIHRoaXMuYWRkRmlsZShkYXRhKVxuICAgIH0pXG5cbiAgICAvLyBgcmVtb3ZlLWZpbGVgIHJlbW92ZXMgYSBmaWxlIGZyb20gYHN0YXRlLmZpbGVzYCwgZm9yIGV4YW1wbGUgd2hlblxuICAgIC8vIGEgdXNlciBkZWNpZGVzIG5vdCB0byB1cGxvYWQgcGFydGljdWxhciBmaWxlIGFuZCBjbGlja3MgYSBidXR0b24gdG8gcmVtb3ZlIGl0XG4gICAgdGhpcy5vbignY29yZTpmaWxlLXJlbW92ZScsIChmaWxlSUQpID0+IHtcbiAgICAgIHRoaXMucmVtb3ZlRmlsZShmaWxlSUQpXG4gICAgfSlcblxuICAgIHRoaXMub24oJ2NvcmU6Y2FuY2VsLWFsbCcsICgpID0+IHtcbiAgICAgIGNvbnN0IGZpbGVzID0gdGhpcy5nZXRTdGF0ZSgpLmZpbGVzXG4gICAgICBPYmplY3Qua2V5cyhmaWxlcykuZm9yRWFjaCgoZmlsZSkgPT4ge1xuICAgICAgICB0aGlzLnJlbW92ZUZpbGUoZmlsZXNbZmlsZV0uaWQpXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0aGlzLm9uKCdjb3JlOnVwbG9hZC1zdGFydGVkJywgKGZpbGVJRCwgdXBsb2FkKSA9PiB7XG4gICAgICBjb25zdCB1cGRhdGVkRmlsZXMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmdldFN0YXRlKCkuZmlsZXMpXG4gICAgICBjb25zdCB1cGRhdGVkRmlsZSA9IE9iamVjdC5hc3NpZ24oe30sIHVwZGF0ZWRGaWxlc1tmaWxlSURdLFxuICAgICAgICBPYmplY3QuYXNzaWduKHt9LCB7XG4gICAgICAgICAgcHJvZ3Jlc3M6IE9iamVjdC5hc3NpZ24oe30sIHVwZGF0ZWRGaWxlc1tmaWxlSURdLnByb2dyZXNzLCB7XG4gICAgICAgICAgICB1cGxvYWRTdGFydGVkOiBEYXRlLm5vdygpXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgKSlcbiAgICAgIHVwZGF0ZWRGaWxlc1tmaWxlSURdID0gdXBkYXRlZEZpbGVcblxuICAgICAgdGhpcy5zZXRTdGF0ZSh7ZmlsZXM6IHVwZGF0ZWRGaWxlc30pXG4gICAgfSlcblxuICAgIGNvbnN0IHRocm90dGxlZENhbGN1bGF0ZVByb2dyZXNzID0gdGhyb3R0bGUodGhpcy5jYWxjdWxhdGVQcm9ncmVzcywgMzAwKVxuXG4gICAgdGhpcy5vbignY29yZTp1cGxvYWQtcHJvZ3Jlc3MnLCAoZGF0YSkgPT4ge1xuICAgICAgLy8gdGhpcy5jYWxjdWxhdGVQcm9ncmVzcyhkYXRhKVxuICAgICAgdGhyb3R0bGVkQ2FsY3VsYXRlUHJvZ3Jlc3MoZGF0YSlcbiAgICB9KVxuXG4gICAgdGhpcy5vbignY29yZTp1cGxvYWQtc3VjY2VzcycsIChmaWxlSUQsIHVwbG9hZFJlc3AsIHVwbG9hZFVSTCkgPT4ge1xuICAgICAgY29uc3QgdXBkYXRlZEZpbGVzID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5nZXRTdGF0ZSgpLmZpbGVzKVxuICAgICAgY29uc3QgdXBkYXRlZEZpbGUgPSBPYmplY3QuYXNzaWduKHt9LCB1cGRhdGVkRmlsZXNbZmlsZUlEXSwge1xuICAgICAgICBwcm9ncmVzczogT2JqZWN0LmFzc2lnbih7fSwgdXBkYXRlZEZpbGVzW2ZpbGVJRF0ucHJvZ3Jlc3MsIHtcbiAgICAgICAgICB1cGxvYWRDb21wbGV0ZTogdHJ1ZSxcbiAgICAgICAgICAvLyBnb29kIG9yIGJhZCBpZGVhPyBzZXR0aW5nIHRoZSBwZXJjZW50YWdlIHRvIDEwMCBpZiB1cGxvYWQgaXMgc3VjY2Vzc2Z1bCxcbiAgICAgICAgICAvLyBzbyB0aGF0IGlmIHdlIGxvc3Qgc29tZSBwcm9ncmVzcyBldmVudHMgb24gdGhlIHdheSwgaXRzIHN0aWxsIG1hcmtlZCDigJxjb21wZXRl4oCdP1xuICAgICAgICAgIHBlcmNlbnRhZ2U6IDEwMFxuICAgICAgICB9KSxcbiAgICAgICAgdXBsb2FkVVJMOiB1cGxvYWRVUkxcbiAgICAgIH0pXG4gICAgICB1cGRhdGVkRmlsZXNbZmlsZUlEXSA9IHVwZGF0ZWRGaWxlXG5cbiAgICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgICBmaWxlczogdXBkYXRlZEZpbGVzXG4gICAgICB9KVxuXG4gICAgICB0aGlzLmNhbGN1bGF0ZVRvdGFsUHJvZ3Jlc3MoKVxuXG4gICAgICBpZiAodGhpcy5nZXRTdGF0ZSgpLnRvdGFsUHJvZ3Jlc3MgPT09IDEwMCkge1xuICAgICAgICBjb25zdCBjb21wbGV0ZUZpbGVzID0gT2JqZWN0LmtleXModXBkYXRlZEZpbGVzKS5maWx0ZXIoKGZpbGUpID0+IHtcbiAgICAgICAgICByZXR1cm4gdXBkYXRlZEZpbGVzW2ZpbGVdLnByb2dyZXNzLnVwbG9hZENvbXBsZXRlXG4gICAgICAgIH0pXG4gICAgICAgIHRoaXMuZW1pdCgnY29yZTpzdWNjZXNzJywgY29tcGxldGVGaWxlcy5sZW5ndGgpXG4gICAgICB9XG4gICAgfSlcblxuICAgIHRoaXMub24oJ2NvcmU6dXBkYXRlLW1ldGEnLCAoZGF0YSwgZmlsZUlEKSA9PiB7XG4gICAgICB0aGlzLnVwZGF0ZU1ldGEoZGF0YSwgZmlsZUlEKVxuICAgIH0pXG5cbiAgICAvLyBzaG93IGluZm9ybWVyIGlmIG9mZmxpbmVcbiAgICBpZiAodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdvbmxpbmUnLCAoKSA9PiB0aGlzLmlzT25saW5lKHRydWUpKVxuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ29mZmxpbmUnLCAoKSA9PiB0aGlzLmlzT25saW5lKGZhbHNlKSlcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5pc09ubGluZSgpLCAzMDAwKVxuICAgIH1cbiAgfVxuXG4gIGlzT25saW5lIChzdGF0dXMpIHtcbiAgICBjb25zdCBvbmxpbmUgPSBzdGF0dXMgfHwgd2luZG93Lm5hdmlnYXRvci5vbkxpbmVcbiAgICBpZiAoIW9ubGluZSkge1xuICAgICAgdGhpcy5lbWl0KCdpcy1vZmZsaW5lJylcbiAgICAgIHRoaXMuZW1pdCgnaW5mb3JtZXInLCAnTm8gaW50ZXJuZXQgY29ubmVjdGlvbicsICdlcnJvcicsIDApXG4gICAgICB0aGlzLndhc09mZmxpbmUgPSB0cnVlXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZW1pdCgnaXMtb25saW5lJylcbiAgICAgIGlmICh0aGlzLndhc09mZmxpbmUpIHtcbiAgICAgICAgdGhpcy5lbWl0KCdpbmZvcm1lcicsICdDb25uZWN0ZWQhJywgJ3N1Y2Nlc3MnLCAzMDAwKVxuICAgICAgICB0aGlzLndhc09mZmxpbmUgPSBmYWxzZVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4vKipcbiAqIFJlZ2lzdGVycyBhIHBsdWdpbiB3aXRoIENvcmVcbiAqXG4gKiBAcGFyYW0ge0NsYXNzfSBQbHVnaW4gb2JqZWN0XG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBvYmplY3QgdGhhdCB3aWxsIGJlIHBhc3NlZCB0byBQbHVnaW4gbGF0ZXJcbiAqIEByZXR1cm4ge09iamVjdH0gc2VsZiBmb3IgY2hhaW5pbmdcbiAqL1xuICB1c2UgKFBsdWdpbiwgb3B0cykge1xuICAgIC8vIEluc3RhbnRpYXRlXG4gICAgY29uc3QgcGx1Z2luID0gbmV3IFBsdWdpbih0aGlzLCBvcHRzKVxuICAgIGNvbnN0IHBsdWdpbk5hbWUgPSBwbHVnaW4uaWRcbiAgICB0aGlzLnBsdWdpbnNbcGx1Z2luLnR5cGVdID0gdGhpcy5wbHVnaW5zW3BsdWdpbi50eXBlXSB8fCBbXVxuXG4gICAgaWYgKCFwbHVnaW5OYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1lvdXIgcGx1Z2luIG11c3QgaGF2ZSBhIG5hbWUnKVxuICAgIH1cblxuICAgIGlmICghcGx1Z2luLnR5cGUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignWW91ciBwbHVnaW4gbXVzdCBoYXZlIGEgdHlwZScpXG4gICAgfVxuXG4gICAgbGV0IGV4aXN0c1BsdWdpbkFscmVhZHkgPSB0aGlzLmdldFBsdWdpbihwbHVnaW5OYW1lKVxuICAgIGlmIChleGlzdHNQbHVnaW5BbHJlYWR5KSB7XG4gICAgICBsZXQgbXNnID0gYEFscmVhZHkgZm91bmQgYSBwbHVnaW4gbmFtZWQgJyR7ZXhpc3RzUGx1Z2luQWxyZWFkeS5uYW1lfScuXG4gICAgICAgIFRyaWVkIHRvIHVzZTogJyR7cGx1Z2luTmFtZX0nLlxuICAgICAgICBVcHB5IGlzIGN1cnJlbnRseSBsaW1pdGVkIHRvIHJ1bm5pbmcgb25lIG9mIGV2ZXJ5IHBsdWdpbi5cbiAgICAgICAgU2hhcmUgeW91ciB1c2UgY2FzZSB3aXRoIHVzIG92ZXIgYXRcbiAgICAgICAgaHR0cHM6Ly9naXRodWIuY29tL3RyYW5zbG9hZGl0L3VwcHkvaXNzdWVzL1xuICAgICAgICBpZiB5b3Ugd2FudCB1cyB0byByZWNvbnNpZGVyLmBcbiAgICAgIHRocm93IG5ldyBFcnJvcihtc2cpXG4gICAgfVxuXG4gICAgdGhpcy5wbHVnaW5zW3BsdWdpbi50eXBlXS5wdXNoKHBsdWdpbilcbiAgICBwbHVnaW4uaW5zdGFsbCgpXG5cbiAgICByZXR1cm4gdGhpc1xuICB9XG5cbi8qKlxuICogRmluZCBvbmUgUGx1Z2luIGJ5IG5hbWVcbiAqXG4gKiBAcGFyYW0gc3RyaW5nIG5hbWUgZGVzY3JpcHRpb25cbiAqL1xuICBnZXRQbHVnaW4gKG5hbWUpIHtcbiAgICBsZXQgZm91bmRQbHVnaW4gPSBmYWxzZVxuICAgIHRoaXMuaXRlcmF0ZVBsdWdpbnMoKHBsdWdpbikgPT4ge1xuICAgICAgY29uc3QgcGx1Z2luTmFtZSA9IHBsdWdpbi5pZFxuICAgICAgaWYgKHBsdWdpbk5hbWUgPT09IG5hbWUpIHtcbiAgICAgICAgZm91bmRQbHVnaW4gPSBwbHVnaW5cbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICB9XG4gICAgfSlcbiAgICByZXR1cm4gZm91bmRQbHVnaW5cbiAgfVxuXG4vKipcbiAqIEl0ZXJhdGUgdGhyb3VnaCBhbGwgYHVzZWBkIHBsdWdpbnNcbiAqXG4gKiBAcGFyYW0gZnVuY3Rpb24gbWV0aG9kIGRlc2NyaXB0aW9uXG4gKi9cbiAgaXRlcmF0ZVBsdWdpbnMgKG1ldGhvZCkge1xuICAgIE9iamVjdC5rZXlzKHRoaXMucGx1Z2lucykuZm9yRWFjaCgocGx1Z2luVHlwZSkgPT4ge1xuICAgICAgdGhpcy5wbHVnaW5zW3BsdWdpblR5cGVdLmZvckVhY2gobWV0aG9kKVxuICAgIH0pXG4gIH1cblxuLyoqXG4gKiBMb2dzIHN0dWZmIHRvIGNvbnNvbGUsIG9ubHkgaWYgYGRlYnVnYCBpcyBzZXQgdG8gdHJ1ZS4gU2lsZW50IGluIHByb2R1Y3Rpb24uXG4gKlxuICogQHJldHVybiB7U3RyaW5nfE9iamVjdH0gdG8gbG9nXG4gKi9cbiAgbG9nIChtc2csIHR5cGUpIHtcbiAgICBpZiAoIXRoaXMub3B0cy5kZWJ1Zykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmIChtc2cgPT09IGAke21zZ31gKSB7XG4gICAgICBjb25zb2xlLmxvZyhgTE9HOiAke21zZ31gKVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmRpcihtc2cpXG4gICAgfVxuXG4gICAgaWYgKHR5cGUgPT09ICdlcnJvcicpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYExPRzogJHttc2d9YClcbiAgICB9XG5cbiAgICBnbG9iYWwudXBweUxvZyA9IGdsb2JhbC51cHB5TG9nICsgJ1xcbicgKyAnREVCVUcgTE9HOiAnICsgbXNnXG4gIH1cblxuICBpbml0U29ja2V0IChvcHRzKSB7XG4gICAgaWYgKCF0aGlzLnNvY2tldCkge1xuICAgICAgdGhpcy5zb2NrZXQgPSBuZXcgVXBweVNvY2tldChvcHRzKVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNvY2tldFxuICB9XG5cbiAgLy8gaW5zdGFsbEFsbCAoKSB7XG4gIC8vICAgT2JqZWN0LmtleXModGhpcy5wbHVnaW5zKS5mb3JFYWNoKChwbHVnaW5UeXBlKSA9PiB7XG4gIC8vICAgICB0aGlzLnBsdWdpbnNbcGx1Z2luVHlwZV0uZm9yRWFjaCgocGx1Z2luKSA9PiB7XG4gIC8vICAgICAgIHBsdWdpbi5pbnN0YWxsKHRoaXMpXG4gIC8vICAgICB9KVxuICAvLyAgIH0pXG4gIC8vIH1cblxuLyoqXG4gKiBJbml0aWFsaXplcyBhY3Rpb25zLCBpbnN0YWxscyBhbGwgcGx1Z2lucyAoYnkgaXRlcmF0aW5nIG9uIHRoZW0gYW5kIGNhbGxpbmcgYGluc3RhbGxgKSwgc2V0cyBvcHRpb25zXG4gKlxuICovXG4gIHJ1biAoKSB7XG4gICAgdGhpcy5sb2coJ0NvcmUgaXMgcnVuLCBpbml0aWFsaXppbmcgYWN0aW9ucy4uLicpXG5cbiAgICB0aGlzLmFjdGlvbnMoKVxuXG4gICAgLy8gRm9yc2Ugc2V0IGBhdXRvUHJvY2VlZGAgb3B0aW9uIHRvIGZhbHNlIGlmIHRoZXJlIGFyZSBtdWx0aXBsZSBzZWxlY3RvciBQbHVnaW5zIGFjdGl2ZVxuICAgIC8vIGlmICh0aGlzLnBsdWdpbnMuYWNxdWlyZXIgJiYgdGhpcy5wbHVnaW5zLmFjcXVpcmVyLmxlbmd0aCA+IDEpIHtcbiAgICAvLyAgIHRoaXMub3B0cy5hdXRvUHJvY2VlZCA9IGZhbHNlXG4gICAgLy8gfVxuXG4gICAgLy8gSW5zdGFsbCBhbGwgcGx1Z2luc1xuICAgIC8vIHRoaXMuaW5zdGFsbEFsbCgpXG5cbiAgICByZXR1cm5cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvcHRzKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBVcHB5KSkge1xuICAgIHJldHVybiBuZXcgVXBweShvcHRzKVxuICB9XG59XG4iLCIvKipcbiAqIFRyYW5zbGF0ZXMgc3RyaW5ncyB3aXRoIGludGVycG9sYXRpb24gJiBwbHVyYWxpemF0aW9uIHN1cHBvcnQuXG4gKiBFeHRlbnNpYmxlIHdpdGggY3VzdG9tIGRpY3Rpb25hcmllcyBhbmQgcGx1cmFsaXphdGlvbiBmdW5jdGlvbnMuXG4gKlxuICogQm9ycm93cyBoZWF2aWx5IGZyb20gYW5kIGluc3BpcmVkIGJ5IFBvbHlnbG90IGh0dHBzOi8vZ2l0aHViLmNvbS9haXJibmIvcG9seWdsb3QuanMsXG4gKiBiYXNpY2FsbHkgYSBzdHJpcHBlZC1kb3duIHZlcnNpb24gb2YgaXQuIERpZmZlcmVuY2VzOiBwbHVyYWxpemF0aW9uIGZ1bmN0aW9ucyBhcmUgbm90IGhhcmRjb2RlZFxuICogYW5kIGNhbiBiZSBlYXNpbHkgYWRkZWQgYW1vbmcgd2l0aCBkaWN0aW9uYXJpZXMsIG5lc3RlZCBvYmplY3RzIGFyZSB1c2VkIGZvciBwbHVyYWxpemF0aW9uXG4gKiBhcyBvcHBvc2VkIHRvIGB8fHx8YCBkZWxpbWV0ZXJcbiAqXG4gKiBVc2FnZSBleGFtcGxlOiBgdHJhbnNsYXRvci50cmFuc2xhdGUoJ2ZpbGVzX2Nob3NlbicsIHtzbWFydF9jb3VudDogM30pYFxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBvcHRzXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gY2xhc3MgVHJhbnNsYXRvciB7XG4gIGNvbnN0cnVjdG9yIChvcHRzKSB7XG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICBsb2NhbGU6IHtcbiAgICAgICAgc3RyaW5nczoge30sXG4gICAgICAgIHBsdXJhbGl6ZTogZnVuY3Rpb24gKG4pIHtcbiAgICAgICAgICBpZiAobiA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIDBcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIDFcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMub3B0cyA9IE9iamVjdC5hc3NpZ24oe30sIGRlZmF1bHRPcHRpb25zLCBvcHRzKVxuICAgIHRoaXMubG9jYWxlID0gT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdE9wdGlvbnMubG9jYWxlLCBvcHRzLmxvY2FsZSlcblxuICAgIC8vIGNvbnNvbGUubG9nKHRoaXMub3B0cy5sb2NhbGUpXG5cbiAgICAvLyB0aGlzLmxvY2FsZS5wbHVyYWxpemUgPSB0aGlzLmxvY2FsZSA/IHRoaXMubG9jYWxlLnBsdXJhbGl6ZSA6IGRlZmF1bHRQbHVyYWxpemVcbiAgICAvLyB0aGlzLmxvY2FsZS5zdHJpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgZW5fVVMuc3RyaW5ncywgdGhpcy5vcHRzLmxvY2FsZS5zdHJpbmdzKVxuICB9XG5cbi8qKlxuICogVGFrZXMgYSBzdHJpbmcgd2l0aCBwbGFjZWhvbGRlciB2YXJpYWJsZXMgbGlrZSBgJXtzbWFydF9jb3VudH0gZmlsZSBzZWxlY3RlZGBcbiAqIGFuZCByZXBsYWNlcyBpdCB3aXRoIHZhbHVlcyBmcm9tIG9wdGlvbnMgYHtzbWFydF9jb3VudDogNX1gXG4gKlxuICogQGxpY2Vuc2UgaHR0cHM6Ly9naXRodWIuY29tL2FpcmJuYi9wb2x5Z2xvdC5qcy9ibG9iL21hc3Rlci9MSUNFTlNFXG4gKiB0YWtlbiBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9haXJibmIvcG9seWdsb3QuanMvYmxvYi9tYXN0ZXIvbGliL3BvbHlnbG90LmpzI0wyOTlcbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gcGhyYXNlIHRoYXQgbmVlZHMgaW50ZXJwb2xhdGlvbiwgd2l0aCBwbGFjZWhvbGRlcnNcbiAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIHdpdGggdmFsdWVzIHRoYXQgd2lsbCBiZSB1c2VkIHRvIHJlcGxhY2UgcGxhY2Vob2xkZXJzXG4gKiBAcmV0dXJuIHtzdHJpbmd9IGludGVycG9sYXRlZFxuICovXG4gIGludGVycG9sYXRlIChwaHJhc2UsIG9wdGlvbnMpIHtcbiAgICBjb25zdCByZXBsYWNlID0gU3RyaW5nLnByb3RvdHlwZS5yZXBsYWNlXG4gICAgY29uc3QgZG9sbGFyUmVnZXggPSAvXFwkL2dcbiAgICBjb25zdCBkb2xsYXJCaWxsc1lhbGwgPSAnJCQkJCdcblxuICAgIGZvciAobGV0IGFyZyBpbiBvcHRpb25zKSB7XG4gICAgICBpZiAoYXJnICE9PSAnXycgJiYgb3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShhcmcpKSB7XG4gICAgICAgIC8vIEVuc3VyZSByZXBsYWNlbWVudCB2YWx1ZSBpcyBlc2NhcGVkIHRvIHByZXZlbnQgc3BlY2lhbCAkLXByZWZpeGVkXG4gICAgICAgIC8vIHJlZ2V4IHJlcGxhY2UgdG9rZW5zLiB0aGUgXCIkJCQkXCIgaXMgbmVlZGVkIGJlY2F1c2UgZWFjaCBcIiRcIiBuZWVkcyB0b1xuICAgICAgICAvLyBiZSBlc2NhcGVkIHdpdGggXCIkXCIgaXRzZWxmLCBhbmQgd2UgbmVlZCB0d28gaW4gdGhlIHJlc3VsdGluZyBvdXRwdXQuXG4gICAgICAgIHZhciByZXBsYWNlbWVudCA9IG9wdGlvbnNbYXJnXVxuICAgICAgICBpZiAodHlwZW9mIHJlcGxhY2VtZW50ID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHJlcGxhY2VtZW50ID0gcmVwbGFjZS5jYWxsKG9wdGlvbnNbYXJnXSwgZG9sbGFyUmVnZXgsIGRvbGxhckJpbGxzWWFsbClcbiAgICAgICAgfVxuICAgICAgICAvLyBXZSBjcmVhdGUgYSBuZXcgYFJlZ0V4cGAgZWFjaCB0aW1lIGluc3RlYWQgb2YgdXNpbmcgYSBtb3JlLWVmZmljaWVudFxuICAgICAgICAvLyBzdHJpbmcgcmVwbGFjZSBzbyB0aGF0IHRoZSBzYW1lIGFyZ3VtZW50IGNhbiBiZSByZXBsYWNlZCBtdWx0aXBsZSB0aW1lc1xuICAgICAgICAvLyBpbiB0aGUgc2FtZSBwaHJhc2UuXG4gICAgICAgIHBocmFzZSA9IHJlcGxhY2UuY2FsbChwaHJhc2UsIG5ldyBSZWdFeHAoJyVcXFxceycgKyBhcmcgKyAnXFxcXH0nLCAnZycpLCByZXBsYWNlbWVudClcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHBocmFzZVxuICB9XG5cbi8qKlxuICogUHVibGljIHRyYW5zbGF0ZSBtZXRob2RcbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30ga2V5XG4gKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucyB3aXRoIHZhbHVlcyB0aGF0IHdpbGwgYmUgdXNlZCBsYXRlciB0byByZXBsYWNlIHBsYWNlaG9sZGVycyBpbiBzdHJpbmdcbiAqIEByZXR1cm4ge3N0cmluZ30gdHJhbnNsYXRlZCAoYW5kIGludGVycG9sYXRlZClcbiAqL1xuICB0cmFuc2xhdGUgKGtleSwgb3B0aW9ucykge1xuICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMuc21hcnRfY291bnQpIHtcbiAgICAgIHZhciBwbHVyYWwgPSB0aGlzLmxvY2FsZS5wbHVyYWxpemUob3B0aW9ucy5zbWFydF9jb3VudClcbiAgICAgIHJldHVybiB0aGlzLmludGVycG9sYXRlKHRoaXMub3B0cy5sb2NhbGUuc3RyaW5nc1trZXldW3BsdXJhbF0sIG9wdGlvbnMpXG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuaW50ZXJwb2xhdGUodGhpcy5vcHRzLmxvY2FsZS5zdHJpbmdzW2tleV0sIG9wdGlvbnMpXG4gIH1cbn1cbiIsImNvbnN0IGVlID0gcmVxdWlyZSgnbmFtZXNwYWNlLWVtaXR0ZXInKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNsYXNzIFVwcHlTb2NrZXQge1xuICBjb25zdHJ1Y3RvciAob3B0cykge1xuICAgIHRoaXMucXVldWVkID0gW11cbiAgICB0aGlzLmlzT3BlbiA9IGZhbHNlXG4gICAgdGhpcy5zb2NrZXQgPSBuZXcgV2ViU29ja2V0KG9wdHMudGFyZ2V0KVxuICAgIHRoaXMuZW1pdHRlciA9IGVlKClcblxuICAgIHRoaXMuc29ja2V0Lm9ub3BlbiA9IChlKSA9PiB7XG4gICAgICB0aGlzLmlzT3BlbiA9IHRydWVcblxuICAgICAgd2hpbGUgKHRoaXMucXVldWVkLmxlbmd0aCA+IDAgJiYgdGhpcy5pc09wZW4pIHtcbiAgICAgICAgY29uc3QgZmlyc3QgPSB0aGlzLnF1ZXVlZFswXVxuICAgICAgICB0aGlzLnNlbmQoZmlyc3QuYWN0aW9uLCBmaXJzdC5wYXlsb2FkKVxuICAgICAgICB0aGlzLnF1ZXVlZCA9IHRoaXMucXVldWVkLnNsaWNlKDEpXG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5zb2NrZXQub25jbG9zZSA9IChlKSA9PiB7XG4gICAgICB0aGlzLmlzT3BlbiA9IGZhbHNlXG4gICAgfVxuXG4gICAgdGhpcy5faGFuZGxlTWVzc2FnZSA9IHRoaXMuX2hhbmRsZU1lc3NhZ2UuYmluZCh0aGlzKVxuXG4gICAgdGhpcy5zb2NrZXQub25tZXNzYWdlID0gdGhpcy5faGFuZGxlTWVzc2FnZVxuXG4gICAgdGhpcy5jbG9zZSA9IHRoaXMuY2xvc2UuYmluZCh0aGlzKVxuICAgIHRoaXMuZW1pdCA9IHRoaXMuZW1pdC5iaW5kKHRoaXMpXG4gICAgdGhpcy5vbiA9IHRoaXMub24uYmluZCh0aGlzKVxuICAgIHRoaXMub25jZSA9IHRoaXMub25jZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5zZW5kID0gdGhpcy5zZW5kLmJpbmQodGhpcylcbiAgfVxuXG4gIGNsb3NlICgpIHtcbiAgICByZXR1cm4gdGhpcy5zb2NrZXQuY2xvc2UoKVxuICB9XG5cbiAgc2VuZCAoYWN0aW9uLCBwYXlsb2FkKSB7XG4gICAgLy8gYXR0YWNoIHV1aWRcblxuICAgIGlmICghdGhpcy5pc09wZW4pIHtcbiAgICAgIHRoaXMucXVldWVkLnB1c2goe2FjdGlvbiwgcGF5bG9hZH0pXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB0aGlzLnNvY2tldC5zZW5kKEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIGFjdGlvbixcbiAgICAgIHBheWxvYWRcbiAgICB9KSlcbiAgfVxuXG4gIG9uIChhY3Rpb24sIGhhbmRsZXIpIHtcbiAgICBjb25zb2xlLmxvZyhhY3Rpb24pXG4gICAgdGhpcy5lbWl0dGVyLm9uKGFjdGlvbiwgaGFuZGxlcilcbiAgfVxuXG4gIGVtaXQgKGFjdGlvbiwgcGF5bG9hZCkge1xuICAgIGNvbnNvbGUubG9nKGFjdGlvbilcbiAgICB0aGlzLmVtaXR0ZXIuZW1pdChhY3Rpb24sIHBheWxvYWQpXG4gIH1cblxuICBvbmNlIChhY3Rpb24sIGhhbmRsZXIpIHtcbiAgICB0aGlzLmVtaXR0ZXIub25jZShhY3Rpb24sIGhhbmRsZXIpXG4gIH1cblxuICBfaGFuZGxlTWVzc2FnZSAoZSkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gSlNPTi5wYXJzZShlLmRhdGEpXG4gICAgICBjb25zb2xlLmxvZyhtZXNzYWdlKVxuICAgICAgdGhpcy5lbWl0KG1lc3NhZ2UuYWN0aW9uLCBtZXNzYWdlLnBheWxvYWQpXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjb25zb2xlLmxvZyhlcnIpXG4gICAgfVxuICB9XG59XG4iLCIvLyBpbXBvcnQgbWltZSBmcm9tICdtaW1lLXR5cGVzJ1xuLy8gaW1wb3J0IHBpY2EgZnJvbSAncGljYSdcblxuLyoqXG4gKiBBIGNvbGxlY3Rpb24gb2Ygc21hbGwgdXRpbGl0eSBmdW5jdGlvbnMgdGhhdCBoZWxwIHdpdGggZG9tIG1hbmlwdWxhdGlvbiwgYWRkaW5nIGxpc3RlbmVycyxcbiAqIHByb21pc2VzIGFuZCBvdGhlciBnb29kIHRoaW5ncy5cbiAqXG4gKiBAbW9kdWxlIFV0aWxzXG4gKi9cblxuLyoqXG4gKiBTaGFsbG93IGZsYXR0ZW4gbmVzdGVkIGFycmF5cy5cbiAqL1xuZnVuY3Rpb24gZmxhdHRlbiAoYXJyKSB7XG4gIHJldHVybiBbXS5jb25jYXQuYXBwbHkoW10sIGFycilcbn1cblxuZnVuY3Rpb24gaXNUb3VjaERldmljZSAoKSB7XG4gIHJldHVybiAnb250b3VjaHN0YXJ0JyBpbiB3aW5kb3cgfHwgLy8gd29ya3Mgb24gbW9zdCBicm93c2Vyc1xuICAgICAgICAgIG5hdmlnYXRvci5tYXhUb3VjaFBvaW50cyAgIC8vIHdvcmtzIG9uIElFMTAvMTEgYW5kIFN1cmZhY2Vcbn1cblxuLy8gLyoqXG4vLyAgKiBTaG9ydGVyIGFuZCBmYXN0IHdheSB0byBzZWxlY3QgYSBzaW5nbGUgbm9kZSBpbiB0aGUgRE9NXG4vLyAgKiBAcGFyYW0gICB7IFN0cmluZyB9IHNlbGVjdG9yIC0gdW5pcXVlIGRvbSBzZWxlY3RvclxuLy8gICogQHBhcmFtICAgeyBPYmplY3QgfSBjdHggLSBET00gbm9kZSB3aGVyZSB0aGUgdGFyZ2V0IG9mIG91ciBzZWFyY2ggd2lsbCBpcyBsb2NhdGVkXG4vLyAgKiBAcmV0dXJucyB7IE9iamVjdCB9IGRvbSBub2RlIGZvdW5kXG4vLyAgKi9cbi8vIGZ1bmN0aW9uICQgKHNlbGVjdG9yLCBjdHgpIHtcbi8vICAgcmV0dXJuIChjdHggfHwgZG9jdW1lbnQpLnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpXG4vLyB9XG5cbi8vIC8qKlxuLy8gICogU2hvcnRlciBhbmQgZmFzdCB3YXkgdG8gc2VsZWN0IG11bHRpcGxlIG5vZGVzIGluIHRoZSBET01cbi8vICAqIEBwYXJhbSAgIHsgU3RyaW5nfEFycmF5IH0gc2VsZWN0b3IgLSBET00gc2VsZWN0b3Igb3Igbm9kZXMgbGlzdFxuLy8gICogQHBhcmFtICAgeyBPYmplY3QgfSBjdHggLSBET00gbm9kZSB3aGVyZSB0aGUgdGFyZ2V0cyBvZiBvdXIgc2VhcmNoIHdpbGwgaXMgbG9jYXRlZFxuLy8gICogQHJldHVybnMgeyBPYmplY3QgfSBkb20gbm9kZXMgZm91bmRcbi8vICAqL1xuLy8gZnVuY3Rpb24gJCQgKHNlbGVjdG9yLCBjdHgpIHtcbi8vICAgdmFyIGVsc1xuLy8gICBpZiAodHlwZW9mIHNlbGVjdG9yID09PSAnc3RyaW5nJykge1xuLy8gICAgIGVscyA9IChjdHggfHwgZG9jdW1lbnQpLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpXG4vLyAgIH0gZWxzZSB7XG4vLyAgICAgZWxzID0gc2VsZWN0b3Jcbi8vICAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoZWxzKVxuLy8gICB9XG4vLyB9XG5cbmZ1bmN0aW9uIHRydW5jYXRlU3RyaW5nIChzdHIsIGxlbmd0aCkge1xuICBpZiAoc3RyLmxlbmd0aCA+IGxlbmd0aCkge1xuICAgIHJldHVybiBzdHIuc3Vic3RyKDAsIGxlbmd0aCAvIDIpICsgJy4uLicgKyBzdHIuc3Vic3RyKHN0ci5sZW5ndGggLSBsZW5ndGggLyA0LCBzdHIubGVuZ3RoKVxuICB9XG4gIHJldHVybiBzdHJcblxuICAvLyBtb3JlIHByZWNpc2UgdmVyc2lvbiBpZiBuZWVkZWRcbiAgLy8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvODMxNTgzXG59XG5cbmZ1bmN0aW9uIHNlY29uZHNUb1RpbWUgKHJhd1NlY29uZHMpIHtcbiAgY29uc3QgaG91cnMgPSBNYXRoLmZsb29yKHJhd1NlY29uZHMgLyAzNjAwKSAlIDI0XG4gIGNvbnN0IG1pbnV0ZXMgPSBNYXRoLmZsb29yKHJhd1NlY29uZHMgLyA2MCkgJSA2MFxuICBjb25zdCBzZWNvbmRzID0gTWF0aC5mbG9vcihyYXdTZWNvbmRzICUgNjApXG5cbiAgcmV0dXJuIHsgaG91cnMsIG1pbnV0ZXMsIHNlY29uZHMgfVxufVxuXG4vKipcbiAqIFBhcnRpdGlvbiBhcnJheSBieSBhIGdyb3VwaW5nIGZ1bmN0aW9uLlxuICogQHBhcmFtICB7W3R5cGVdfSBhcnJheSAgICAgIElucHV0IGFycmF5XG4gKiBAcGFyYW0gIHtbdHlwZV19IGdyb3VwaW5nRm4gR3JvdXBpbmcgZnVuY3Rpb25cbiAqIEByZXR1cm4ge1t0eXBlXX0gICAgICAgICAgICBBcnJheSBvZiBhcnJheXNcbiAqL1xuZnVuY3Rpb24gZ3JvdXBCeSAoYXJyYXksIGdyb3VwaW5nRm4pIHtcbiAgcmV0dXJuIGFycmF5LnJlZHVjZSgocmVzdWx0LCBpdGVtKSA9PiB7XG4gICAgbGV0IGtleSA9IGdyb3VwaW5nRm4oaXRlbSlcbiAgICBsZXQgeHMgPSByZXN1bHQuZ2V0KGtleSkgfHwgW11cbiAgICB4cy5wdXNoKGl0ZW0pXG4gICAgcmVzdWx0LnNldChrZXksIHhzKVxuICAgIHJldHVybiByZXN1bHRcbiAgfSwgbmV3IE1hcCgpKVxufVxuXG4vKipcbiAqIFRlc3RzIGlmIGV2ZXJ5IGFycmF5IGVsZW1lbnQgcGFzc2VzIHByZWRpY2F0ZVxuICogQHBhcmFtICB7QXJyYXl9ICBhcnJheSAgICAgICBJbnB1dCBhcnJheVxuICogQHBhcmFtICB7T2JqZWN0fSBwcmVkaWNhdGVGbiBQcmVkaWNhdGVcbiAqIEByZXR1cm4ge2Jvb2x9ICAgICAgICAgICAgICAgRXZlcnkgZWxlbWVudCBwYXNzXG4gKi9cbmZ1bmN0aW9uIGV2ZXJ5IChhcnJheSwgcHJlZGljYXRlRm4pIHtcbiAgcmV0dXJuIGFycmF5LnJlZHVjZSgocmVzdWx0LCBpdGVtKSA9PiB7XG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIHJldHVybiBwcmVkaWNhdGVGbihpdGVtKVxuICB9LCB0cnVlKVxufVxuXG4vKipcbiAqIENvbnZlcnRzIGxpc3QgaW50byBhcnJheVxuKi9cbmZ1bmN0aW9uIHRvQXJyYXkgKGxpc3QpIHtcbiAgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGxpc3QgfHwgW10sIDApXG59XG5cbi8qKlxuICogVGFrZXMgYSBmaWxlTmFtZSBhbmQgdHVybnMgaXQgaW50byBmaWxlSUQsIGJ5IGNvbnZlcnRpbmcgdG8gbG93ZXJjYXNlLFxuICogcmVtb3ZpbmcgZXh0cmEgY2hhcmFjdGVycyBhbmQgYWRkaW5nIHVuaXggdGltZXN0YW1wXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGZpbGVOYW1lXG4gKlxuICovXG5mdW5jdGlvbiBnZW5lcmF0ZUZpbGVJRCAoZmlsZU5hbWUpIHtcbiAgbGV0IGZpbGVJRCA9IGZpbGVOYW1lLnRvTG93ZXJDYXNlKClcbiAgZmlsZUlEID0gZmlsZUlELnJlcGxhY2UoL1teQS1aMC05XS9pZywgJycpXG4gIGZpbGVJRCA9IGZpbGVJRCArIERhdGUubm93KClcbiAgcmV0dXJuIGZpbGVJRFxufVxuXG5mdW5jdGlvbiBleHRlbmQgKC4uLm9ianMpIHtcbiAgcmV0dXJuIE9iamVjdC5hc3NpZ24uYXBwbHkodGhpcywgW3t9XS5jb25jYXQob2JqcykpXG59XG5cbi8qKlxuICogVGFrZXMgZnVuY3Rpb24gb3IgY2xhc3MsIHJldHVybnMgaXRzIG5hbWUuXG4gKiBCZWNhdXNlIElFIGRvZXNu4oCZdCBzdXBwb3J0IGBjb25zdHJ1Y3Rvci5uYW1lYC5cbiAqIGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL2Rma2F5ZS82Mzg0NDM5LCBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xNTcxNDQ0NVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBmbiDigJQgZnVuY3Rpb25cbiAqXG4gKi9cbi8vIGZ1bmN0aW9uIGdldEZuTmFtZSAoZm4pIHtcbi8vICAgdmFyIGYgPSB0eXBlb2YgZm4gPT09ICdmdW5jdGlvbidcbi8vICAgdmFyIHMgPSBmICYmICgoZm4ubmFtZSAmJiBbJycsIGZuLm5hbWVdKSB8fCBmbi50b1N0cmluZygpLm1hdGNoKC9mdW5jdGlvbiAoW15cXChdKykvKSlcbi8vICAgcmV0dXJuICghZiAmJiAnbm90IGEgZnVuY3Rpb24nKSB8fCAocyAmJiBzWzFdIHx8ICdhbm9ueW1vdXMnKVxuLy8gfVxuXG5mdW5jdGlvbiBnZXRQcm9wb3J0aW9uYWxJbWFnZUhlaWdodCAoaW1nLCBuZXdXaWR0aCkge1xuICB2YXIgYXNwZWN0ID0gaW1nLndpZHRoIC8gaW1nLmhlaWdodFxuICB2YXIgbmV3SGVpZ2h0ID0gTWF0aC5yb3VuZChuZXdXaWR0aCAvIGFzcGVjdClcbiAgcmV0dXJuIG5ld0hlaWdodFxufVxuXG5mdW5jdGlvbiBnZXRGaWxlVHlwZSAoZmlsZSkge1xuICBpZiAoZmlsZS50eXBlKSB7XG4gICAgcmV0dXJuIGZpbGUudHlwZVxuICB9XG4gIHJldHVybiAnJ1xuICAvLyByZXR1cm4gbWltZS5sb29rdXAoZmlsZS5uYW1lKVxufVxuXG4vLyByZXR1cm5zIFtmaWxlTmFtZSwgZmlsZUV4dF1cbmZ1bmN0aW9uIGdldEZpbGVOYW1lQW5kRXh0ZW5zaW9uIChmdWxsRmlsZU5hbWUpIHtcbiAgdmFyIHJlID0gLyg/OlxcLihbXi5dKykpPyQvXG4gIHZhciBmaWxlRXh0ID0gcmUuZXhlYyhmdWxsRmlsZU5hbWUpWzFdXG4gIHZhciBmaWxlTmFtZSA9IGZ1bGxGaWxlTmFtZS5yZXBsYWNlKCcuJyArIGZpbGVFeHQsICcnKVxuICByZXR1cm4gW2ZpbGVOYW1lLCBmaWxlRXh0XVxufVxuXG4vKipcbiAqIFJlYWRzIGZpbGUgYXMgZGF0YSBVUkkgZnJvbSBmaWxlIG9iamVjdCxcbiAqIHRoZSBvbmUgeW91IGdldCBmcm9tIGlucHV0W3R5cGU9ZmlsZV0gb3IgZHJhZyAmIGRyb3AuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGZpbGUgb2JqZWN0XG4gKiBAcmV0dXJuIHtQcm9taXNlfSBkYXRhVVJMIG9mIHRoZSBmaWxlXG4gKlxuICovXG5mdW5jdGlvbiByZWFkRmlsZSAoZmlsZU9iaikge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKClcbiAgICByZWFkZXIuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIGZ1bmN0aW9uIChldikge1xuICAgICAgcmV0dXJuIHJlc29sdmUoZXYudGFyZ2V0LnJlc3VsdClcbiAgICB9KVxuICAgIHJlYWRlci5yZWFkQXNEYXRhVVJMKGZpbGVPYmopXG5cbiAgICAvLyBmdW5jdGlvbiB3b3JrZXJTY3JpcHQgKCkge1xuICAgIC8vICAgc2VsZi5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgKGUpID0+IHtcbiAgICAvLyAgICAgY29uc3QgZmlsZSA9IGUuZGF0YS5maWxlXG4gICAgLy8gICAgIHRyeSB7XG4gICAgLy8gICAgICAgY29uc3QgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXJTeW5jKClcbiAgICAvLyAgICAgICBwb3N0TWVzc2FnZSh7XG4gICAgLy8gICAgICAgICBmaWxlOiByZWFkZXIucmVhZEFzRGF0YVVSTChmaWxlKVxuICAgIC8vICAgICAgIH0pXG4gICAgLy8gICAgIH0gY2F0Y2ggKGVycikge1xuICAgIC8vICAgICAgIGNvbnNvbGUubG9nKGVycilcbiAgICAvLyAgICAgfVxuICAgIC8vICAgfSlcbiAgICAvLyB9XG4gICAgLy9cbiAgICAvLyBjb25zdCB3b3JrZXIgPSBtYWtlV29ya2VyKHdvcmtlclNjcmlwdClcbiAgICAvLyB3b3JrZXIucG9zdE1lc3NhZ2Uoe2ZpbGU6IGZpbGVPYmp9KVxuICAgIC8vIHdvcmtlci5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgKGUpID0+IHtcbiAgICAvLyAgIGNvbnN0IGZpbGVEYXRhVVJMID0gZS5kYXRhLmZpbGVcbiAgICAvLyAgIGNvbnNvbGUubG9nKCdGSUxFIF8gREFUQSBfIFVSTCcpXG4gICAgLy8gICByZXR1cm4gcmVzb2x2ZShmaWxlRGF0YVVSTClcbiAgICAvLyB9KVxuICB9KVxufVxuXG4vKipcbiAqIFJlc2l6ZXMgYW4gaW1hZ2UgdG8gc3BlY2lmaWVkIHdpZHRoIGFuZCBwcm9wb3J0aW9uYWwgaGVpZ2h0LCB1c2luZyBjYW52YXNcbiAqIFNlZSBodHRwczovL2Rhdmlkd2Fsc2gubmFtZS9yZXNpemUtaW1hZ2UtY2FudmFzLFxuICogaHR0cDovL2JhYmFsYW4uY29tL3Jlc2l6aW5nLWltYWdlcy13aXRoLWphdmFzY3JpcHQvXG4gKiBAVE9ETyBzZWUgaWYgd2UgbmVlZCBodHRwczovL2dpdGh1Yi5jb20vc3RvbWl0YS9pb3MtaW1hZ2VmaWxlLW1lZ2FwaXhlbCBmb3IgaU9TXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IERhdGEgVVJJIG9mIHRoZSBvcmlnaW5hbCBpbWFnZVxuICogQHBhcmFtIHtTdHJpbmd9IHdpZHRoIG9mIHRoZSByZXN1bHRpbmcgaW1hZ2VcbiAqIEByZXR1cm4ge1N0cmluZ30gRGF0YSBVUkkgb2YgdGhlIHJlc2l6ZWQgaW1hZ2VcbiAqL1xuZnVuY3Rpb24gY3JlYXRlSW1hZ2VUaHVtYm5haWwgKGltZ0RhdGFVUkksIG5ld1dpZHRoKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgaW1nID0gbmV3IEltYWdlKClcbiAgICBpbWcuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsICgpID0+IHtcbiAgICAgIGNvbnN0IG5ld0ltYWdlV2lkdGggPSBuZXdXaWR0aFxuICAgICAgY29uc3QgbmV3SW1hZ2VIZWlnaHQgPSBnZXRQcm9wb3J0aW9uYWxJbWFnZUhlaWdodChpbWcsIG5ld0ltYWdlV2lkdGgpXG5cbiAgICAgIC8vIGNyZWF0ZSBhbiBvZmYtc2NyZWVuIGNhbnZhc1xuICAgICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJylcbiAgICAgIGNvbnN0IGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpXG5cbiAgICAgIC8vIHNldCBpdHMgZGltZW5zaW9uIHRvIHRhcmdldCBzaXplXG4gICAgICBjYW52YXMud2lkdGggPSBuZXdJbWFnZVdpZHRoXG4gICAgICBjYW52YXMuaGVpZ2h0ID0gbmV3SW1hZ2VIZWlnaHRcblxuICAgICAgLy8gZHJhdyBzb3VyY2UgaW1hZ2UgaW50byB0aGUgb2ZmLXNjcmVlbiBjYW52YXM6XG4gICAgICAvLyBjdHguY2xlYXJSZWN0KDAsIDAsIHdpZHRoLCBoZWlnaHQpXG4gICAgICBjdHguZHJhd0ltYWdlKGltZywgMCwgMCwgbmV3SW1hZ2VXaWR0aCwgbmV3SW1hZ2VIZWlnaHQpXG5cbiAgICAgIC8vIHBpY2EucmVzaXplQ2FudmFzKGltZywgY2FudmFzLCAoZXJyKSA9PiB7XG4gICAgICAvLyAgIGlmIChlcnIpIGNvbnNvbGUubG9nKGVycilcbiAgICAgIC8vICAgY29uc3QgdGh1bWJuYWlsID0gY2FudmFzLnRvRGF0YVVSTCgnaW1hZ2UvcG5nJylcbiAgICAgIC8vICAgcmV0dXJuIHJlc29sdmUodGh1bWJuYWlsKVxuICAgICAgLy8gfSlcblxuICAgICAgLy8gZW5jb2RlIGltYWdlIHRvIGRhdGEtdXJpIHdpdGggYmFzZTY0IHZlcnNpb24gb2YgY29tcHJlc3NlZCBpbWFnZVxuICAgICAgLy8gY2FudmFzLnRvRGF0YVVSTCgnaW1hZ2UvanBlZycsIHF1YWxpdHkpOyAgLy8gcXVhbGl0eSA9IFswLjAsIDEuMF1cbiAgICAgIGNvbnN0IHRodW1ibmFpbCA9IGNhbnZhcy50b0RhdGFVUkwoJ2ltYWdlL3BuZycpXG4gICAgICByZXR1cm4gcmVzb2x2ZSh0aHVtYm5haWwpXG4gICAgfSlcbiAgICBpbWcuc3JjID0gaW1nRGF0YVVSSVxuICB9KVxufVxuXG5mdW5jdGlvbiBkYXRhVVJJdG9CbG9iIChkYXRhVVJJLCBvcHRzLCB0b0ZpbGUpIHtcbiAgLy8gZ2V0IHRoZSBiYXNlNjQgZGF0YVxuICB2YXIgZGF0YSA9IGRhdGFVUkkuc3BsaXQoJywnKVsxXVxuXG4gIC8vIHVzZXIgbWF5IHByb3ZpZGUgbWltZSB0eXBlLCBpZiBub3QgZ2V0IGl0IGZyb20gZGF0YSBVUklcbiAgdmFyIG1pbWVUeXBlID0gb3B0cy5taW1lVHlwZSB8fCBkYXRhVVJJLnNwbGl0KCcsJylbMF0uc3BsaXQoJzonKVsxXS5zcGxpdCgnOycpWzBdXG5cbiAgLy8gZGVmYXVsdCB0byBwbGFpbi90ZXh0IGlmIGRhdGEgVVJJIGhhcyBubyBtaW1lVHlwZVxuICBpZiAobWltZVR5cGUgPT0gbnVsbCkge1xuICAgIG1pbWVUeXBlID0gJ3BsYWluL3RleHQnXG4gIH1cblxuICB2YXIgYmluYXJ5ID0gYXRvYihkYXRhKVxuICB2YXIgYXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGJpbmFyeS5sZW5ndGg7IGkrKykge1xuICAgIGFycmF5LnB1c2goYmluYXJ5LmNoYXJDb2RlQXQoaSkpXG4gIH1cblxuICAvLyBDb252ZXJ0IHRvIGEgRmlsZT9cbiAgaWYgKHRvRmlsZSkge1xuICAgIHJldHVybiBuZXcgRmlsZShbbmV3IFVpbnQ4QXJyYXkoYXJyYXkpXSwgb3B0cy5uYW1lIHx8ICcnLCB7dHlwZTogbWltZVR5cGV9KVxuICB9XG5cbiAgcmV0dXJuIG5ldyBCbG9iKFtuZXcgVWludDhBcnJheShhcnJheSldLCB7dHlwZTogbWltZVR5cGV9KVxufVxuXG5mdW5jdGlvbiBkYXRhVVJJdG9GaWxlIChkYXRhVVJJLCBvcHRzKSB7XG4gIHJldHVybiBkYXRhVVJJdG9CbG9iKGRhdGFVUkksIG9wdHMsIHRydWUpXG59XG5cbi8qKlxuICogQ29waWVzIHRleHQgdG8gY2xpcGJvYXJkIGJ5IGNyZWF0aW5nIGFuIGFsbW9zdCBpbnZpc2libGUgdGV4dGFyZWEsXG4gKiBhZGRpbmcgdGV4dCB0aGVyZSwgdGhlbiBydW5uaW5nIGV4ZWNDb21tYW5kKCdjb3B5JykuXG4gKiBGYWxscyBiYWNrIHRvIHByb21wdCgpIHdoZW4gdGhlIGVhc3kgd2F5IGZhaWxzIChoZWxsbywgU2FmYXJpISlcbiAqIEZyb20gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMzA4MTAzMjJcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdGV4dFRvQ29weVxuICogQHBhcmFtIHtTdHJpbmd9IGZhbGxiYWNrU3RyaW5nXG4gKiBAcmV0dXJuIHtQcm9taXNlfVxuICovXG5mdW5jdGlvbiBjb3B5VG9DbGlwYm9hcmQgKHRleHRUb0NvcHksIGZhbGxiYWNrU3RyaW5nKSB7XG4gIGZhbGxiYWNrU3RyaW5nID0gZmFsbGJhY2tTdHJpbmcgfHwgJ0NvcHkgdGhlIFVSTCBiZWxvdydcblxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHRleHRBcmVhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGV4dGFyZWEnKVxuICAgIHRleHRBcmVhLnNldEF0dHJpYnV0ZSgnc3R5bGUnLCB7XG4gICAgICBwb3NpdGlvbjogJ2ZpeGVkJyxcbiAgICAgIHRvcDogMCxcbiAgICAgIGxlZnQ6IDAsXG4gICAgICB3aWR0aDogJzJlbScsXG4gICAgICBoZWlnaHQ6ICcyZW0nLFxuICAgICAgcGFkZGluZzogMCxcbiAgICAgIGJvcmRlcjogJ25vbmUnLFxuICAgICAgb3V0bGluZTogJ25vbmUnLFxuICAgICAgYm94U2hhZG93OiAnbm9uZScsXG4gICAgICBiYWNrZ3JvdW5kOiAndHJhbnNwYXJlbnQnXG4gICAgfSlcblxuICAgIHRleHRBcmVhLnZhbHVlID0gdGV4dFRvQ29weVxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGV4dEFyZWEpXG4gICAgdGV4dEFyZWEuc2VsZWN0KClcblxuICAgIGNvbnN0IG1hZ2ljQ29weUZhaWxlZCA9IChlcnIpID0+IHtcbiAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQodGV4dEFyZWEpXG4gICAgICB3aW5kb3cucHJvbXB0KGZhbGxiYWNrU3RyaW5nLCB0ZXh0VG9Db3B5KVxuICAgICAgcmV0dXJuIHJlamVjdCgnT29wcywgdW5hYmxlIHRvIGNvcHkgZGlzcGxheWVkIGZhbGxiYWNrIHByb21wdDogJyArIGVycilcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3Qgc3VjY2Vzc2Z1bCA9IGRvY3VtZW50LmV4ZWNDb21tYW5kKCdjb3B5JylcbiAgICAgIGlmICghc3VjY2Vzc2Z1bCkge1xuICAgICAgICByZXR1cm4gbWFnaWNDb3B5RmFpbGVkKCdjb3B5IGNvbW1hbmQgdW5hdmFpbGFibGUnKVxuICAgICAgfVxuICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZCh0ZXh0QXJlYSlcbiAgICAgIHJldHVybiByZXNvbHZlKClcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQodGV4dEFyZWEpXG4gICAgICByZXR1cm4gbWFnaWNDb3B5RmFpbGVkKGVycilcbiAgICB9XG4gIH0pXG59XG5cbi8vIGZ1bmN0aW9uIGNyZWF0ZUlubGluZVdvcmtlciAod29ya2VyRnVuY3Rpb24pIHtcbi8vICAgbGV0IGNvZGUgPSB3b3JrZXJGdW5jdGlvbi50b1N0cmluZygpXG4vLyAgIGNvZGUgPSBjb2RlLnN1YnN0cmluZyhjb2RlLmluZGV4T2YoJ3snKSArIDEsIGNvZGUubGFzdEluZGV4T2YoJ30nKSlcbi8vXG4vLyAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbY29kZV0sIHt0eXBlOiAnYXBwbGljYXRpb24vamF2YXNjcmlwdCd9KVxuLy8gICBjb25zdCB3b3JrZXIgPSBuZXcgV29ya2VyKFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYikpXG4vL1xuLy8gICByZXR1cm4gd29ya2VyXG4vLyB9XG5cbi8vIGZ1bmN0aW9uIG1ha2VXb3JrZXIgKHNjcmlwdCkge1xuLy8gICB2YXIgVVJMID0gd2luZG93LlVSTCB8fCB3aW5kb3cud2Via2l0VVJMXG4vLyAgIHZhciBCbG9iID0gd2luZG93LkJsb2Jcbi8vICAgdmFyIFdvcmtlciA9IHdpbmRvdy5Xb3JrZXJcbi8vXG4vLyAgIGlmICghVVJMIHx8ICFCbG9iIHx8ICFXb3JrZXIgfHwgIXNjcmlwdCkge1xuLy8gICAgIHJldHVybiBudWxsXG4vLyAgIH1cbi8vXG4vLyAgIGxldCBjb2RlID0gc2NyaXB0LnRvU3RyaW5nKClcbi8vICAgY29kZSA9IGNvZGUuc3Vic3RyaW5nKGNvZGUuaW5kZXhPZigneycpICsgMSwgY29kZS5sYXN0SW5kZXhPZignfScpKVxuLy9cbi8vICAgdmFyIGJsb2IgPSBuZXcgQmxvYihbY29kZV0pXG4vLyAgIHZhciB3b3JrZXIgPSBuZXcgV29ya2VyKFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYikpXG4vLyAgIHJldHVybiB3b3JrZXJcbi8vIH1cblxuZnVuY3Rpb24gZ2V0U3BlZWQgKGZpbGVQcm9ncmVzcykge1xuICBpZiAoIWZpbGVQcm9ncmVzcy5ieXRlc1VwbG9hZGVkKSByZXR1cm4gMFxuXG4gIGNvbnN0IHRpbWVFbGFwc2VkID0gKG5ldyBEYXRlKCkpIC0gZmlsZVByb2dyZXNzLnVwbG9hZFN0YXJ0ZWRcbiAgY29uc3QgdXBsb2FkU3BlZWQgPSBmaWxlUHJvZ3Jlc3MuYnl0ZXNVcGxvYWRlZCAvICh0aW1lRWxhcHNlZCAvIDEwMDApXG4gIHJldHVybiB1cGxvYWRTcGVlZFxufVxuXG5mdW5jdGlvbiBnZXRFVEEgKGZpbGVQcm9ncmVzcykge1xuICBpZiAoIWZpbGVQcm9ncmVzcy5ieXRlc1VwbG9hZGVkKSByZXR1cm4gMFxuXG4gIGNvbnN0IHVwbG9hZFNwZWVkID0gZ2V0U3BlZWQoZmlsZVByb2dyZXNzKVxuICBjb25zdCBieXRlc1JlbWFpbmluZyA9IGZpbGVQcm9ncmVzcy5ieXRlc1RvdGFsIC0gZmlsZVByb2dyZXNzLmJ5dGVzVXBsb2FkZWRcbiAgY29uc3Qgc2Vjb25kc1JlbWFpbmluZyA9IE1hdGgucm91bmQoYnl0ZXNSZW1haW5pbmcgLyB1cGxvYWRTcGVlZCAqIDEwKSAvIDEwXG5cbiAgcmV0dXJuIHNlY29uZHNSZW1haW5pbmdcbn1cblxuZnVuY3Rpb24gcHJldHR5RVRBIChzZWNvbmRzKSB7XG4gIGNvbnN0IHRpbWUgPSBzZWNvbmRzVG9UaW1lKHNlY29uZHMpXG5cbiAgLy8gT25seSBkaXNwbGF5IGhvdXJzIGFuZCBtaW51dGVzIGlmIHRoZXkgYXJlIGdyZWF0ZXIgdGhhbiAwIGJ1dCBhbHdheXNcbiAgLy8gZGlzcGxheSBtaW51dGVzIGlmIGhvdXJzIGlzIGJlaW5nIGRpc3BsYXllZFxuICAvLyBEaXNwbGF5IGEgbGVhZGluZyB6ZXJvIGlmIHRoZSB0aGVyZSBpcyBhIHByZWNlZGluZyB1bml0OiAxbSAwNXMsIGJ1dCA1c1xuICBjb25zdCBob3Vyc1N0ciA9IHRpbWUuaG91cnMgPyB0aW1lLmhvdXJzICsgJ2ggJyA6ICcnXG4gIGNvbnN0IG1pbnV0ZXNWYWwgPSB0aW1lLmhvdXJzID8gKCcwJyArIHRpbWUubWludXRlcykuc3Vic3RyKC0yKSA6IHRpbWUubWludXRlc1xuICBjb25zdCBtaW51dGVzU3RyID0gbWludXRlc1ZhbCA/IG1pbnV0ZXNWYWwgKyAnbSAnIDogJydcbiAgY29uc3Qgc2Vjb25kc1ZhbCA9IG1pbnV0ZXNWYWwgPyAoJzAnICsgdGltZS5zZWNvbmRzKS5zdWJzdHIoLTIpIDogdGltZS5zZWNvbmRzXG4gIGNvbnN0IHNlY29uZHNTdHIgPSBzZWNvbmRzVmFsICsgJ3MnXG5cbiAgcmV0dXJuIGAke2hvdXJzU3RyfSR7bWludXRlc1N0cn0ke3NlY29uZHNTdHJ9YFxufVxuXG4vLyBmdW5jdGlvbiBtYWtlQ2FjaGluZ0Z1bmN0aW9uICgpIHtcbi8vICAgbGV0IGNhY2hlZEVsID0gbnVsbFxuLy8gICBsZXQgbGFzdFVwZGF0ZSA9IERhdGUubm93KClcbi8vXG4vLyAgIHJldHVybiBmdW5jdGlvbiBjYWNoZUVsZW1lbnQgKGVsLCB0aW1lKSB7XG4vLyAgICAgaWYgKERhdGUubm93KCkgLSBsYXN0VXBkYXRlIDwgdGltZSkge1xuLy8gICAgICAgcmV0dXJuIGNhY2hlZEVsXG4vLyAgICAgfVxuLy9cbi8vICAgICBjYWNoZWRFbCA9IGVsXG4vLyAgICAgbGFzdFVwZGF0ZSA9IERhdGUubm93KClcbi8vXG4vLyAgICAgcmV0dXJuIGVsXG4vLyAgIH1cbi8vIH1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGdlbmVyYXRlRmlsZUlELFxuICB0b0FycmF5LFxuICBldmVyeSxcbiAgZmxhdHRlbixcbiAgZ3JvdXBCeSxcbiAgLy8gJCxcbiAgLy8gJCQsXG4gIGV4dGVuZCxcbiAgcmVhZEZpbGUsXG4gIGNyZWF0ZUltYWdlVGh1bWJuYWlsLFxuICBnZXRQcm9wb3J0aW9uYWxJbWFnZUhlaWdodCxcbiAgaXNUb3VjaERldmljZSxcbiAgZ2V0RmlsZU5hbWVBbmRFeHRlbnNpb24sXG4gIHRydW5jYXRlU3RyaW5nLFxuICBnZXRGaWxlVHlwZSxcbiAgc2Vjb25kc1RvVGltZSxcbiAgZGF0YVVSSXRvQmxvYixcbiAgZGF0YVVSSXRvRmlsZSxcbiAgZ2V0U3BlZWQsXG4gIGdldEVUQSxcbiAgLy8gbWFrZVdvcmtlcixcbiAgLy8gbWFrZUNhY2hpbmdGdW5jdGlvbixcbiAgY29weVRvQ2xpcGJvYXJkLFxuICBwcmV0dHlFVEFcbn1cbiIsImNvbnN0IENvcmUgPSByZXF1aXJlKCcuL0NvcmUnKVxubW9kdWxlLmV4cG9ydHMgPSBDb3JlXG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICBjb25zdCBkZW1vTGluayA9IHByb3BzLmRlbW8gPyBodG1sYDxidXR0b24gY2xhc3M9XCJVcHB5UHJvdmlkZXItYXV0aEJ0bkRlbW9cIiBvbmNsaWNrPSR7cHJvcHMuaGFuZGxlRGVtb0F1dGh9PlByb2NlZWQgd2l0aCBEZW1vIEFjY291bnQ8L2J1dHRvbj5gIDogbnVsbFxuICByZXR1cm4gaHRtbGBcbiAgICA8ZGl2IGNsYXNzPVwiVXBweVByb3ZpZGVyLWF1dGhcIj5cbiAgICAgIDxoMSBjbGFzcz1cIlVwcHlQcm92aWRlci1hdXRoVGl0bGVcIj5cbiAgICAgICAgUGxlYXNlIGF1dGhlbnRpY2F0ZSB3aXRoIDxzcGFuIGNsYXNzPVwiVXBweVByb3ZpZGVyLWF1dGhUaXRsZU5hbWVcIj4ke3Byb3BzLnBsdWdpbk5hbWV9PC9zcGFuPjxicj4gdG8gc2VsZWN0IGZpbGVzXG4gICAgICA8L2gxPlxuICAgICAgPGJ1dHRvbiBjbGFzcz1cIlVwcHlQcm92aWRlci1hdXRoQnRuXCIgb25jbGljaz0ke3Byb3BzLmhhbmRsZUF1dGh9PkF1dGhlbnRpY2F0ZTwvYnV0dG9uPlxuICAgICAgJHtkZW1vTGlua31cbiAgICA8L2Rpdj5cbiAgYFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcblxubW9kdWxlLmV4cG9ydHMgPSAocHJvcHMpID0+IHtcbiAgcmV0dXJuIGh0bWxgXG4gICAgPGxpPlxuICAgICAgPGJ1dHRvbiBvbmNsaWNrPSR7cHJvcHMuZ2V0Rm9sZGVyfT4ke3Byb3BzLnRpdGxlfTwvYnV0dG9uPlxuICAgIDwvbGk+XG4gIGBcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5jb25zdCBCcmVhZGNydW1iID0gcmVxdWlyZSgnLi9CcmVhZGNydW1iJylcblxubW9kdWxlLmV4cG9ydHMgPSAocHJvcHMpID0+IHtcbiAgcmV0dXJuIGh0bWxgXG4gICAgPHVsIGNsYXNzPVwiVXBweVByb3ZpZGVyLWJyZWFkY3J1bWJzXCI+XG4gICAgICAke1xuICAgICAgICBwcm9wcy5kaXJlY3Rvcmllcy5tYXAoKGRpcmVjdG9yeSkgPT4ge1xuICAgICAgICAgIHJldHVybiBCcmVhZGNydW1iKHtcbiAgICAgICAgICAgIGdldEZvbGRlcjogKCkgPT4gcHJvcHMuZ2V0Rm9sZGVyKGRpcmVjdG9yeS5pZCksXG4gICAgICAgICAgICB0aXRsZTogZGlyZWN0b3J5LnRpdGxlXG4gICAgICAgICAgfSlcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICA8L3VsPlxuICBgXG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuY29uc3QgQnJlYWRjcnVtYnMgPSByZXF1aXJlKCcuL0JyZWFkY3J1bWJzJylcbmNvbnN0IFRhYmxlID0gcmVxdWlyZSgnLi9UYWJsZScpXG5cbm1vZHVsZS5leHBvcnRzID0gKHByb3BzKSA9PiB7XG4gIGxldCBmaWx0ZXJlZEZvbGRlcnMgPSBwcm9wcy5mb2xkZXJzXG4gIGxldCBmaWx0ZXJlZEZpbGVzID0gcHJvcHMuZmlsZXNcblxuICBpZiAocHJvcHMuZmlsdGVySW5wdXQgIT09ICcnKSB7XG4gICAgZmlsdGVyZWRGb2xkZXJzID0gcHJvcHMuZmlsdGVySXRlbXMocHJvcHMuZm9sZGVycylcbiAgICBmaWx0ZXJlZEZpbGVzID0gcHJvcHMuZmlsdGVySXRlbXMocHJvcHMuZmlsZXMpXG4gIH1cblxuICByZXR1cm4gaHRtbGBcbiAgICA8ZGl2IGNsYXNzPVwiQnJvd3NlclwiPlxuICAgICAgPGRpdj5cbiAgICAgICAgPGJ1dHRvbiBvbmNsaWNrPSR7cHJvcHMubG9nb3V0fSBjbGFzcz1cIlVwcHlEYXNoYm9hcmRUYWItYnRuXCI+U2lnbiBvdXQ8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgICAgPGhlYWRlcj5cbiAgICAgICAgPGlucHV0XG4gICAgICAgICAgdHlwZT1cInRleHRcIlxuICAgICAgICAgIGNsYXNzPVwiQnJvd3Nlci1zZWFyY2hcIlxuICAgICAgICAgIHBsYWNlaG9sZGVyPVwiU2VhcmNoIERyaXZlXCJcbiAgICAgICAgICBvbmtleXVwPSR7cHJvcHMuZmlsdGVyUXVlcnl9XG4gICAgICAgICAgdmFsdWU9JHtwcm9wcy5maWx0ZXJJbnB1dH0vPlxuICAgICAgPC9oZWFkZXI+XG4gICAgICA8ZGl2IGNsYXNzPVwiQnJvd3Nlci1zdWJIZWFkZXJcIj5cbiAgICAgICAgJHtCcmVhZGNydW1icyh7XG4gICAgICAgICAgZ2V0Rm9sZGVyOiBwcm9wcy5nZXRGb2xkZXIsXG4gICAgICAgICAgZGlyZWN0b3JpZXM6IHByb3BzLmRpcmVjdG9yaWVzXG4gICAgICAgIH0pfVxuICAgICAgPC9kaXY+XG4gICAgICA8ZGl2IGNsYXNzPVwiQnJvd3Nlci1ib2R5XCI+XG4gICAgICAgIDxtYWluIGNsYXNzPVwiQnJvd3Nlci1jb250ZW50XCI+XG4gICAgICAgICAgJHtUYWJsZSh7XG4gICAgICAgICAgICBjb2x1bW5zOiBbe1xuICAgICAgICAgICAgICBuYW1lOiAnTmFtZScsXG4gICAgICAgICAgICAgIGtleTogJ3RpdGxlJ1xuICAgICAgICAgICAgfV0sXG4gICAgICAgICAgICBmb2xkZXJzOiBmaWx0ZXJlZEZvbGRlcnMsXG4gICAgICAgICAgICBmaWxlczogZmlsdGVyZWRGaWxlcyxcbiAgICAgICAgICAgIGFjdGl2ZVJvdzogcHJvcHMuaXNBY3RpdmVSb3csXG4gICAgICAgICAgICBzb3J0QnlUaXRsZTogcHJvcHMuc29ydEJ5VGl0bGUsXG4gICAgICAgICAgICBzb3J0QnlEYXRlOiBwcm9wcy5zb3J0QnlEYXRlLFxuICAgICAgICAgICAgaGFuZGxlUm93Q2xpY2s6IHByb3BzLmhhbmRsZVJvd0NsaWNrLFxuICAgICAgICAgICAgaGFuZGxlRmlsZURvdWJsZUNsaWNrOiBwcm9wcy5hZGRGaWxlLFxuICAgICAgICAgICAgaGFuZGxlRm9sZGVyRG91YmxlQ2xpY2s6IHByb3BzLmdldE5leHRGb2xkZXIsXG4gICAgICAgICAgICBnZXRJdGVtTmFtZTogcHJvcHMuZ2V0SXRlbU5hbWUsXG4gICAgICAgICAgICBnZXRJdGVtSWNvbjogcHJvcHMuZ2V0SXRlbUljb25cbiAgICAgICAgICB9KX1cbiAgICAgICAgPC9tYWluPlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gIGBcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5cbm1vZHVsZS5leHBvcnRzID0gKHByb3BzKSA9PiB7XG4gIHJldHVybiBodG1sYFxuICAgIDxkaXYgY2xhc3M9XCJVcHB5UHJvdmlkZXItZXJyb3JcIj5cbiAgICAgIDxzcGFuPlxuICAgICAgICBTb21ldGhpbmcgd2VudCB3cm9uZy4gIFByb2JhYmx5IG91ciBmYXVsdC4gJHtwcm9wcy5lcnJvcn1cbiAgICAgIDwvc3Bhbj5cbiAgICA8L2Rpdj5cbiAgYFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcblxubW9kdWxlLmV4cG9ydHMgPSAocHJvcHMpID0+IHtcbiAgcmV0dXJuIGh0bWxgXG4gICAgPGRpdiBjbGFzcz1cIlVwcHlQcm92aWRlci1sb2FkaW5nXCI+XG4gICAgICA8c3Bhbj5cbiAgICAgICAgTG9hZGluZyAuLi5cbiAgICAgIDwvc3Bhbj5cbiAgICA8L2Rpdj5cbiAgYFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcbmNvbnN0IFJvdyA9IHJlcXVpcmUoJy4vVGFibGVSb3cnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICBjb25zdCBoZWFkZXJzID0gcHJvcHMuY29sdW1ucy5tYXAoKGNvbHVtbikgPT4ge1xuICAgIHJldHVybiBodG1sYFxuICAgICAgPHRoIGNsYXNzPVwiQnJvd3NlclRhYmxlLWhlYWRlckNvbHVtbiBCcm93c2VyVGFibGUtY29sdW1uXCIgb25jbGljaz0ke3Byb3BzLnNvcnRCeVRpdGxlfT5cbiAgICAgICAgJHtjb2x1bW4ubmFtZX1cbiAgICAgIDwvdGg+XG4gICAgYFxuICB9KVxuXG4gIHJldHVybiBodG1sYFxuICAgIDx0YWJsZSBjbGFzcz1cIkJyb3dzZXJUYWJsZVwiPlxuICAgICAgPHRoZWFkIGNsYXNzPVwiQnJvd3NlclRhYmxlLWhlYWRlclwiPlxuICAgICAgICA8dHI+XG4gICAgICAgICAgJHtoZWFkZXJzfVxuICAgICAgICA8L3RyPlxuICAgICAgPC90aGVhZD5cbiAgICAgIDx0Ym9keT5cbiAgICAgICAgJHtwcm9wcy5mb2xkZXJzLm1hcCgoZm9sZGVyKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIFJvdyh7XG4gICAgICAgICAgICB0aXRsZTogcHJvcHMuZ2V0SXRlbU5hbWUoZm9sZGVyKSxcbiAgICAgICAgICAgIGFjdGl2ZTogcHJvcHMuYWN0aXZlUm93KGZvbGRlciksXG4gICAgICAgICAgICBnZXRJdGVtSWNvbjogKCkgPT4gcHJvcHMuZ2V0SXRlbUljb24oZm9sZGVyKSxcbiAgICAgICAgICAgIGhhbmRsZUNsaWNrOiAoKSA9PiBwcm9wcy5oYW5kbGVSb3dDbGljayhmb2xkZXIpLFxuICAgICAgICAgICAgaGFuZGxlRG91YmxlQ2xpY2s6ICgpID0+IHByb3BzLmhhbmRsZUZvbGRlckRvdWJsZUNsaWNrKGZvbGRlciksXG4gICAgICAgICAgICBjb2x1bW5zOiBwcm9wcy5jb2x1bW5zXG4gICAgICAgICAgfSlcbiAgICAgICAgfSl9XG4gICAgICAgICR7cHJvcHMuZmlsZXMubWFwKChmaWxlKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIFJvdyh7XG4gICAgICAgICAgICB0aXRsZTogcHJvcHMuZ2V0SXRlbU5hbWUoZmlsZSksXG4gICAgICAgICAgICBhY3RpdmU6IHByb3BzLmFjdGl2ZVJvdyhmaWxlKSxcbiAgICAgICAgICAgIGdldEl0ZW1JY29uOiAoKSA9PiBwcm9wcy5nZXRJdGVtSWNvbihmaWxlKSxcbiAgICAgICAgICAgIGhhbmRsZUNsaWNrOiAoKSA9PiBwcm9wcy5oYW5kbGVSb3dDbGljayhmaWxlKSxcbiAgICAgICAgICAgIGhhbmRsZURvdWJsZUNsaWNrOiAoKSA9PiBwcm9wcy5oYW5kbGVGaWxlRG91YmxlQ2xpY2soZmlsZSksXG4gICAgICAgICAgICBjb2x1bW5zOiBwcm9wcy5jb2x1bW5zXG4gICAgICAgICAgfSlcbiAgICAgICAgfSl9XG4gICAgICA8L3Rib2R5PlxuICAgIDwvdGFibGU+XG4gIGBcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5cbm1vZHVsZS5leHBvcnRzID0gKHByb3BzKSA9PiB7XG4gIHJldHVybiBodG1sYFxuICAgIDx0ZCBjbGFzcz1cIkJyb3dzZXJUYWJsZS1yb3dDb2x1bW4gQnJvd3NlclRhYmxlLWNvbHVtblwiPlxuICAgICAgJHtwcm9wcy5nZXRJdGVtSWNvbigpfSAke3Byb3BzLnZhbHVlfVxuICAgIDwvdGQ+XG4gIGBcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5jb25zdCBDb2x1bW4gPSByZXF1aXJlKCcuL1RhYmxlQ29sdW1uJylcblxubW9kdWxlLmV4cG9ydHMgPSAocHJvcHMpID0+IHtcbiAgY29uc3QgY2xhc3NlcyA9IHByb3BzLmFjdGl2ZSA/ICdCcm93c2VyVGFibGUtcm93IGlzLWFjdGl2ZScgOiAnQnJvd3NlclRhYmxlLXJvdydcbiAgcmV0dXJuIGh0bWxgXG4gICAgPHRyIG9uY2xpY2s9JHtwcm9wcy5oYW5kbGVDbGlja30gb25kYmxjbGljaz0ke3Byb3BzLmhhbmRsZURvdWJsZUNsaWNrfSBjbGFzcz0ke2NsYXNzZXN9PlxuICAgICAgJHtDb2x1bW4oe1xuICAgICAgICBnZXRJdGVtSWNvbjogcHJvcHMuZ2V0SXRlbUljb24sXG4gICAgICAgIHZhbHVlOiBwcm9wcy50aXRsZVxuICAgICAgfSl9XG4gICAgPC90cj5cbiAgYFxufVxuIiwiY29uc3QgQXV0aFZpZXcgPSByZXF1aXJlKCcuL0F1dGhWaWV3JylcbmNvbnN0IEJyb3dzZXIgPSByZXF1aXJlKCcuL0Jyb3dzZXInKVxuY29uc3QgRXJyb3JWaWV3ID0gcmVxdWlyZSgnLi9FcnJvcicpXG5jb25zdCBMb2FkZXJWaWV3ID0gcmVxdWlyZSgnLi9Mb2FkZXInKVxuXG4vKipcbiAqIENsYXNzIHRvIGVhc2lseSBnZW5lcmF0ZSBnZW5lcmljIHZpZXdzIGZvciBwbHVnaW5zXG4gKlxuICogVGhpcyBjbGFzcyBleHBlY3RzIHRoZSBwbHVnaW4gdXNpbmcgdG8gaGF2ZSB0aGUgZm9sbG93aW5nIGF0dHJpYnV0ZXNcbiAqXG4gKiBzdGF0ZUlkIHtTdHJpbmd9IG9iamVjdCBrZXkgb2Ygd2hpY2ggdGhlIHBsdWdpbiBzdGF0ZSBpcyBzdG9yZWRcbiAqXG4gKiBUaGlzIGNsYXNzIGFsc28gZXhwZWN0cyB0aGUgcGx1Z2luIGluc3RhbmNlIHVzaW5nIGl0IHRvIGhhdmUgdGhlIGZvbGxvd2luZ1xuICogYWNjZXNzb3IgbWV0aG9kcy5cbiAqIEVhY2ggbWV0aG9kIHRha2VzIHRoZSBpdGVtIHdob3NlIHByb3BlcnR5IGlzIHRvIGJlIGFjY2Vzc2VkXG4gKiBhcyBhIHBhcmFtXG4gKlxuICogaXNGb2xkZXJcbiAqICAgIEByZXR1cm4ge0Jvb2xlYW59IGZvciBpZiB0aGUgaXRlbSBpcyBhIGZvbGRlciBvciBub3RcbiAqIGdldEl0ZW1EYXRhXG4gKiAgICBAcmV0dXJuIHtPYmplY3R9IHRoYXQgaXMgZm9ybWF0IHJlYWR5IGZvciB1cHB5IHVwbG9hZC9kb3dubG9hZFxuICogZ2V0SXRlbUljb25cbiAqICAgIEByZXR1cm4ge09iamVjdH0gaHRtbCBpbnN0YW5jZSBvZiB0aGUgaXRlbSdzIGljb25cbiAqIGdldEl0ZW1TdWJMaXN0XG4gKiAgICBAcmV0dXJuIHtBcnJheX0gc3ViLWl0ZW1zIGluIHRoZSBpdGVtLiBlLmcgYSBmb2xkZXIgbWF5IGNvbnRhaW4gc3ViLWl0ZW1zXG4gKiBnZXRJdGVtTmFtZVxuICogICAgQHJldHVybiB7U3RyaW5nfSBkaXNwbGF5IGZyaWVuZGx5IG5hbWUgb2YgdGhlIGl0ZW1cbiAqIGdldE1pbWVUeXBlXG4gKiAgICBAcmV0dXJuIHtTdHJpbmd9IG1pbWUgdHlwZSBvZiB0aGUgaXRlbVxuICogZ2V0SXRlbUlkXG4gKiAgICBAcmV0dXJuIHtTdHJpbmd9IHVuaXF1ZSBpZCBvZiB0aGUgaXRlbVxuICogZ2V0SXRlbVJlcXVlc3RQYXRoXG4gKiAgICBAcmV0dXJuIHtTdHJpbmd9IHVuaXF1ZSByZXF1ZXN0IHBhdGggb2YgdGhlIGl0ZW0gd2hlbiBtYWtpbmcgY2FsbHMgdG8gdXBweSBzZXJ2ZXJcbiAqIGdldEl0ZW1Nb2RpZmllZERhdGVcbiAqICAgIEByZXR1cm4ge29iamVjdH0gb3Ige1N0cmluZ30gZGF0ZSBvZiB3aGVuIGxhc3QgdGhlIGl0ZW0gd2FzIG1vZGlmaWVkXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gY2xhc3MgVmlldyB7XG4gIC8qKlxuICAgKiBAcGFyYW0ge29iamVjdH0gaW5zdGFuY2Ugb2YgdGhlIHBsdWdpblxuICAgKi9cbiAgY29uc3RydWN0b3IgKHBsdWdpbikge1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luXG4gICAgdGhpcy5Qcm92aWRlciA9IHBsdWdpbltwbHVnaW4uaWRdXG5cbiAgICAvLyBMb2dpY1xuICAgIHRoaXMuYWRkRmlsZSA9IHRoaXMuYWRkRmlsZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5maWx0ZXJJdGVtcyA9IHRoaXMuZmlsdGVySXRlbXMuYmluZCh0aGlzKVxuICAgIHRoaXMuZmlsdGVyUXVlcnkgPSB0aGlzLmZpbHRlclF1ZXJ5LmJpbmQodGhpcylcbiAgICB0aGlzLmdldEZvbGRlciA9IHRoaXMuZ2V0Rm9sZGVyLmJpbmQodGhpcylcbiAgICB0aGlzLmdldE5leHRGb2xkZXIgPSB0aGlzLmdldE5leHRGb2xkZXIuYmluZCh0aGlzKVxuICAgIHRoaXMuaGFuZGxlUm93Q2xpY2sgPSB0aGlzLmhhbmRsZVJvd0NsaWNrLmJpbmQodGhpcylcbiAgICB0aGlzLmxvZ291dCA9IHRoaXMubG9nb3V0LmJpbmQodGhpcylcbiAgICB0aGlzLmhhbmRsZUF1dGggPSB0aGlzLmhhbmRsZUF1dGguYmluZCh0aGlzKVxuICAgIHRoaXMuaGFuZGxlRGVtb0F1dGggPSB0aGlzLmhhbmRsZURlbW9BdXRoLmJpbmQodGhpcylcbiAgICB0aGlzLnNvcnRCeVRpdGxlID0gdGhpcy5zb3J0QnlUaXRsZS5iaW5kKHRoaXMpXG4gICAgdGhpcy5zb3J0QnlEYXRlID0gdGhpcy5zb3J0QnlEYXRlLmJpbmQodGhpcylcbiAgICB0aGlzLmlzQWN0aXZlUm93ID0gdGhpcy5pc0FjdGl2ZVJvdy5iaW5kKHRoaXMpXG4gICAgdGhpcy5oYW5kbGVFcnJvciA9IHRoaXMuaGFuZGxlRXJyb3IuYmluZCh0aGlzKVxuXG4gICAgLy8gVmlzdWFsXG4gICAgdGhpcy5yZW5kZXIgPSB0aGlzLnJlbmRlci5iaW5kKHRoaXMpXG4gIH1cblxuICAvKipcbiAgICogTGl0dGxlIHNob3J0aGFuZCB0byB1cGRhdGUgdGhlIHN0YXRlIHdpdGggdGhlIHBsdWdpbidzIHN0YXRlXG4gICAqL1xuICB1cGRhdGVTdGF0ZSAobmV3U3RhdGUpIHtcbiAgICBsZXQgc3RhdGVJZCA9IHRoaXMucGx1Z2luLnN0YXRlSWRcbiAgICBjb25zdCB7c3RhdGV9ID0gdGhpcy5wbHVnaW4uY29yZVxuXG4gICAgdGhpcy5wbHVnaW4uY29yZS5zZXRTdGF0ZSh7W3N0YXRlSWRdOiBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZVtzdGF0ZUlkXSwgbmV3U3RhdGUpfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBCYXNlZCBvbiBmb2xkZXIgSUQsIGZldGNoIGEgbmV3IGZvbGRlciBhbmQgdXBkYXRlIGl0IHRvIHN0YXRlXG4gICAqIEBwYXJhbSAge1N0cmluZ30gaWQgRm9sZGVyIGlkXG4gICAqIEByZXR1cm4ge1Byb21pc2V9ICAgRm9sZGVycy9maWxlcyBpbiBmb2xkZXJcbiAgICovXG4gIGdldEZvbGRlciAoaWQsIG5hbWUpIHtcbiAgICByZXR1cm4gdGhpcy5fbG9hZGVyV3JhcHBlcihcbiAgICAgIHRoaXMuUHJvdmlkZXIubGlzdChpZCksXG4gICAgICAocmVzKSA9PiB7XG4gICAgICAgIGxldCBmb2xkZXJzID0gW11cbiAgICAgICAgbGV0IGZpbGVzID0gW11cbiAgICAgICAgbGV0IHVwZGF0ZWREaXJlY3Rvcmllc1xuXG4gICAgICAgIGNvbnN0IHN0YXRlID0gdGhpcy5wbHVnaW4uY29yZS5nZXRTdGF0ZSgpW3RoaXMucGx1Z2luLnN0YXRlSWRdXG4gICAgICAgIGNvbnN0IGluZGV4ID0gc3RhdGUuZGlyZWN0b3JpZXMuZmluZEluZGV4KChkaXIpID0+IGlkID09PSBkaXIuaWQpXG5cbiAgICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xuICAgICAgICAgIHVwZGF0ZWREaXJlY3RvcmllcyA9IHN0YXRlLmRpcmVjdG9yaWVzLnNsaWNlKDAsIGluZGV4ICsgMSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB1cGRhdGVkRGlyZWN0b3JpZXMgPSBzdGF0ZS5kaXJlY3Rvcmllcy5jb25jYXQoW3tpZCwgdGl0bGU6IG5hbWUgfHwgdGhpcy5wbHVnaW4uZ2V0SXRlbU5hbWUocmVzKX1dKVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wbHVnaW4uZ2V0SXRlbVN1Ykxpc3QocmVzKS5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICAgICAgaWYgKHRoaXMucGx1Z2luLmlzRm9sZGVyKGl0ZW0pKSB7XG4gICAgICAgICAgICBmb2xkZXJzLnB1c2goaXRlbSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZmlsZXMucHVzaChpdGVtKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcblxuICAgICAgICBsZXQgZGF0YSA9IHtmb2xkZXJzLCBmaWxlcywgZGlyZWN0b3JpZXM6IHVwZGF0ZWREaXJlY3Rvcmllc31cbiAgICAgICAgdGhpcy51cGRhdGVTdGF0ZShkYXRhKVxuXG4gICAgICAgIHJldHVybiBkYXRhXG4gICAgICB9LFxuICAgICAgdGhpcy5oYW5kbGVFcnJvcilcbiAgfVxuXG4gIC8qKlxuICAgKiBGZXRjaGVzIG5ldyBmb2xkZXJcbiAgICogQHBhcmFtICB7T2JqZWN0fSBGb2xkZXJcbiAgICogQHBhcmFtICB7U3RyaW5nfSB0aXRsZSBGb2xkZXIgdGl0bGVcbiAgICovXG4gIGdldE5leHRGb2xkZXIgKGZvbGRlcikge1xuICAgIGxldCBpZCA9IHRoaXMucGx1Z2luLmdldEl0ZW1SZXF1ZXN0UGF0aChmb2xkZXIpXG4gICAgdGhpcy5nZXRGb2xkZXIoaWQsIHRoaXMucGx1Z2luLmdldEl0ZW1OYW1lKGZvbGRlcikpXG4gIH1cblxuICBhZGRGaWxlIChmaWxlKSB7XG4gICAgY29uc3QgdGFnRmlsZSA9IHtcbiAgICAgIHNvdXJjZTogdGhpcy5wbHVnaW4uaWQsXG4gICAgICBkYXRhOiB0aGlzLnBsdWdpbi5nZXRJdGVtRGF0YShmaWxlKSxcbiAgICAgIG5hbWU6IHRoaXMucGx1Z2luLmdldEl0ZW1OYW1lKGZpbGUpLFxuICAgICAgdHlwZTogdGhpcy5wbHVnaW4uZ2V0TWltZVR5cGUoZmlsZSksXG4gICAgICBpc1JlbW90ZTogdHJ1ZSxcbiAgICAgIGJvZHk6IHtcbiAgICAgICAgZmlsZUlkOiB0aGlzLnBsdWdpbi5nZXRJdGVtSWQoZmlsZSlcbiAgICAgIH0sXG4gICAgICByZW1vdGU6IHtcbiAgICAgICAgaG9zdDogdGhpcy5wbHVnaW4ub3B0cy5ob3N0LFxuICAgICAgICB1cmw6IGAke3RoaXMucGx1Z2luLm9wdHMuaG9zdH0vJHt0aGlzLlByb3ZpZGVyLmlkfS9nZXQvJHt0aGlzLnBsdWdpbi5nZXRJdGVtUmVxdWVzdFBhdGgoZmlsZSl9YCxcbiAgICAgICAgYm9keToge1xuICAgICAgICAgIGZpbGVJZDogdGhpcy5wbHVnaW4uZ2V0SXRlbUlkKGZpbGUpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgY29uc29sZS5sb2coJ2FkZGluZyBmaWxlJylcbiAgICB0aGlzLnBsdWdpbi5jb3JlLmVtaXR0ZXIuZW1pdCgnY29yZTpmaWxlLWFkZCcsIHRhZ0ZpbGUpXG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyBzZXNzaW9uIHRva2VuIG9uIGNsaWVudCBzaWRlLlxuICAgKi9cbiAgbG9nb3V0ICgpIHtcbiAgICB0aGlzLlByb3ZpZGVyLmxvZ291dChsb2NhdGlvbi5ocmVmKVxuICAgICAgLnRoZW4oKHJlcykgPT4gcmVzLmpzb24oKSlcbiAgICAgIC50aGVuKChyZXMpID0+IHtcbiAgICAgICAgaWYgKHJlcy5vaykge1xuICAgICAgICAgIGNvbnN0IG5ld1N0YXRlID0ge1xuICAgICAgICAgICAgYXV0aGVudGljYXRlZDogZmFsc2UsXG4gICAgICAgICAgICBmaWxlczogW10sXG4gICAgICAgICAgICBmb2xkZXJzOiBbXSxcbiAgICAgICAgICAgIGRpcmVjdG9yaWVzOiBbXVxuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLnVwZGF0ZVN0YXRlKG5ld1N0YXRlKVxuICAgICAgICB9XG4gICAgICB9KS5jYXRjaCh0aGlzLmhhbmRsZUVycm9yKVxuICB9XG5cbiAgLyoqXG4gICAqIFVzZWQgdG8gc2V0IGFjdGl2ZSBmaWxlL2ZvbGRlci5cbiAgICogQHBhcmFtICB7T2JqZWN0fSBmaWxlICAgQWN0aXZlIGZpbGUvZm9sZGVyXG4gICAqL1xuICBoYW5kbGVSb3dDbGljayAoZmlsZSkge1xuICAgIGNvbnN0IHN0YXRlID0gdGhpcy5wbHVnaW4uY29yZS5nZXRTdGF0ZSgpW3RoaXMucGx1Z2luLnN0YXRlSWRdXG4gICAgY29uc3QgbmV3U3RhdGUgPSBPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSwge1xuICAgICAgYWN0aXZlUm93OiB0aGlzLnBsdWdpbi5nZXRJdGVtSWQoZmlsZSlcbiAgICB9KVxuXG4gICAgdGhpcy51cGRhdGVTdGF0ZShuZXdTdGF0ZSlcbiAgfVxuXG4gIGZpbHRlclF1ZXJ5IChlKSB7XG4gICAgY29uc3Qgc3RhdGUgPSB0aGlzLnBsdWdpbi5jb3JlLmdldFN0YXRlKClbdGhpcy5wbHVnaW4uc3RhdGVJZF1cbiAgICB0aGlzLnVwZGF0ZVN0YXRlKE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLCB7XG4gICAgICBmaWx0ZXJJbnB1dDogZS50YXJnZXQudmFsdWVcbiAgICB9KSlcbiAgfVxuXG4gIGZpbHRlckl0ZW1zIChpdGVtcykge1xuICAgIGNvbnN0IHN0YXRlID0gdGhpcy5wbHVnaW4uY29yZS5nZXRTdGF0ZSgpW3RoaXMucGx1Z2luLnN0YXRlSWRdXG4gICAgcmV0dXJuIGl0ZW1zLmZpbHRlcigoZm9sZGVyKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5wbHVnaW4uZ2V0SXRlbU5hbWUoZm9sZGVyKS50b0xvd2VyQ2FzZSgpLmluZGV4T2Yoc3RhdGUuZmlsdGVySW5wdXQudG9Mb3dlckNhc2UoKSkgIT09IC0xXG4gICAgfSlcbiAgfVxuXG4gIHNvcnRCeVRpdGxlICgpIHtcbiAgICBjb25zdCBzdGF0ZSA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMucGx1Z2luLmNvcmUuZ2V0U3RhdGUoKVt0aGlzLnBsdWdpbi5zdGF0ZUlkXSlcbiAgICBjb25zdCB7ZmlsZXMsIGZvbGRlcnMsIHNvcnRpbmd9ID0gc3RhdGVcblxuICAgIGxldCBzb3J0ZWRGaWxlcyA9IGZpbGVzLnNvcnQoKGZpbGVBLCBmaWxlQikgPT4ge1xuICAgICAgaWYgKHNvcnRpbmcgPT09ICd0aXRsZURlc2NlbmRpbmcnKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnBsdWdpbi5nZXRJdGVtTmFtZShmaWxlQikubG9jYWxlQ29tcGFyZSh0aGlzLnBsdWdpbi5nZXRJdGVtTmFtZShmaWxlQSkpXG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5wbHVnaW4uZ2V0SXRlbU5hbWUoZmlsZUEpLmxvY2FsZUNvbXBhcmUodGhpcy5wbHVnaW4uZ2V0SXRlbU5hbWUoZmlsZUIpKVxuICAgIH0pXG5cbiAgICBsZXQgc29ydGVkRm9sZGVycyA9IGZvbGRlcnMuc29ydCgoZm9sZGVyQSwgZm9sZGVyQikgPT4ge1xuICAgICAgaWYgKHNvcnRpbmcgPT09ICd0aXRsZURlc2NlbmRpbmcnKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnBsdWdpbi5nZXRJdGVtTmFtZShmb2xkZXJCKS5sb2NhbGVDb21wYXJlKHRoaXMucGx1Z2luLmdldEl0ZW1OYW1lKGZvbGRlckEpKVxuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMucGx1Z2luLmdldEl0ZW1OYW1lKGZvbGRlckEpLmxvY2FsZUNvbXBhcmUodGhpcy5wbHVnaW4uZ2V0SXRlbU5hbWUoZm9sZGVyQikpXG4gICAgfSlcblxuICAgIHRoaXMudXBkYXRlU3RhdGUoT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUsIHtcbiAgICAgIGZpbGVzOiBzb3J0ZWRGaWxlcyxcbiAgICAgIGZvbGRlcnM6IHNvcnRlZEZvbGRlcnMsXG4gICAgICBzb3J0aW5nOiAoc29ydGluZyA9PT0gJ3RpdGxlRGVzY2VuZGluZycpID8gJ3RpdGxlQXNjZW5kaW5nJyA6ICd0aXRsZURlc2NlbmRpbmcnXG4gICAgfSkpXG4gIH1cblxuICBzb3J0QnlEYXRlICgpIHtcbiAgICBjb25zdCBzdGF0ZSA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMucGx1Z2luLmNvcmUuZ2V0U3RhdGUoKVt0aGlzLnBsdWdpbi5zdGF0ZUlkXSlcbiAgICBjb25zdCB7ZmlsZXMsIGZvbGRlcnMsIHNvcnRpbmd9ID0gc3RhdGVcblxuICAgIGxldCBzb3J0ZWRGaWxlcyA9IGZpbGVzLnNvcnQoKGZpbGVBLCBmaWxlQikgPT4ge1xuICAgICAgbGV0IGEgPSBuZXcgRGF0ZSh0aGlzLnBsdWdpbi5nZXRJdGVtTW9kaWZpZWREYXRlKGZpbGVBKSlcbiAgICAgIGxldCBiID0gbmV3IERhdGUodGhpcy5wbHVnaW4uZ2V0SXRlbU1vZGlmaWVkRGF0ZShmaWxlQikpXG5cbiAgICAgIGlmIChzb3J0aW5nID09PSAnZGF0ZURlc2NlbmRpbmcnKSB7XG4gICAgICAgIHJldHVybiBhID4gYiA/IC0xIDogYSA8IGIgPyAxIDogMFxuICAgICAgfVxuICAgICAgcmV0dXJuIGEgPiBiID8gMSA6IGEgPCBiID8gLTEgOiAwXG4gICAgfSlcblxuICAgIGxldCBzb3J0ZWRGb2xkZXJzID0gZm9sZGVycy5zb3J0KChmb2xkZXJBLCBmb2xkZXJCKSA9PiB7XG4gICAgICBsZXQgYSA9IG5ldyBEYXRlKHRoaXMucGx1Z2luLmdldEl0ZW1Nb2RpZmllZERhdGUoZm9sZGVyQSkpXG4gICAgICBsZXQgYiA9IG5ldyBEYXRlKHRoaXMucGx1Z2luLmdldEl0ZW1Nb2RpZmllZERhdGUoZm9sZGVyQikpXG5cbiAgICAgIGlmIChzb3J0aW5nID09PSAnZGF0ZURlc2NlbmRpbmcnKSB7XG4gICAgICAgIHJldHVybiBhID4gYiA/IC0xIDogYSA8IGIgPyAxIDogMFxuICAgICAgfVxuXG4gICAgICByZXR1cm4gYSA+IGIgPyAxIDogYSA8IGIgPyAtMSA6IDBcbiAgICB9KVxuXG4gICAgdGhpcy51cGRhdGVTdGF0ZShPYmplY3QuYXNzaWduKHt9LCBzdGF0ZSwge1xuICAgICAgZmlsZXM6IHNvcnRlZEZpbGVzLFxuICAgICAgZm9sZGVyczogc29ydGVkRm9sZGVycyxcbiAgICAgIHNvcnRpbmc6IChzb3J0aW5nID09PSAnZGF0ZURlc2NlbmRpbmcnKSA/ICdkYXRlQXNjZW5kaW5nJyA6ICdkYXRlRGVzY2VuZGluZydcbiAgICB9KSlcbiAgfVxuXG4gIGlzQWN0aXZlUm93IChmaWxlKSB7XG4gICAgcmV0dXJuIHRoaXMucGx1Z2luLmNvcmUuZ2V0U3RhdGUoKVt0aGlzLnBsdWdpbi5zdGF0ZUlkXS5hY3RpdmVSb3cgPT09IHRoaXMucGx1Z2luLmdldEl0ZW1JZChmaWxlKVxuICB9XG5cbiAgaGFuZGxlRGVtb0F1dGggKCkge1xuICAgIGNvbnN0IHN0YXRlID0gdGhpcy5wbHVnaW4uY29yZS5nZXRTdGF0ZSgpW3RoaXMucGx1Z2luLnN0YXRlSWRdXG4gICAgdGhpcy51cGRhdGVTdGF0ZSh7fSwgc3RhdGUsIHtcbiAgICAgIGF1dGhlbnRpY2F0ZWQ6IHRydWVcbiAgICB9KVxuICB9XG5cbiAgaGFuZGxlQXV0aCAoKSB7XG4gICAgY29uc3QgdXJsSWQgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiA5OTk5OTkpICsgMVxuICAgIGNvbnN0IHJlZGlyZWN0ID0gYCR7bG9jYXRpb24uaHJlZn0ke2xvY2F0aW9uLnNlYXJjaCA/ICcmJyA6ICc/J31pZD0ke3VybElkfWBcblxuICAgIGNvbnN0IGF1dGhTdGF0ZSA9IGJ0b2EoSlNPTi5zdHJpbmdpZnkoeyByZWRpcmVjdCB9KSlcbiAgICBjb25zdCBsaW5rID0gYCR7dGhpcy5wbHVnaW4ub3B0cy5ob3N0fS9jb25uZWN0LyR7dGhpcy5Qcm92aWRlci5hdXRoUHJvdmlkZXJ9P3N0YXRlPSR7YXV0aFN0YXRlfWBcblxuICAgIGNvbnN0IGF1dGhXaW5kb3cgPSB3aW5kb3cub3BlbihsaW5rLCAnX2JsYW5rJylcbiAgICBjb25zdCBjaGVja0F1dGggPSAoKSA9PiB7XG4gICAgICBsZXQgYXV0aFdpbmRvd1VybFxuXG4gICAgICB0cnkge1xuICAgICAgICBhdXRoV2luZG93VXJsID0gYXV0aFdpbmRvdy5sb2NhdGlvbi5ocmVmXG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmIChlIGluc3RhbmNlb2YgRE9NRXhjZXB0aW9uIHx8IGUgaW5zdGFuY2VvZiBUeXBlRXJyb3IpIHtcbiAgICAgICAgICByZXR1cm4gc2V0VGltZW91dChjaGVja0F1dGgsIDEwMClcbiAgICAgICAgfSBlbHNlIHRocm93IGVcbiAgICAgIH1cblxuICAgICAgLy8gc3BsaXQgdXJsIGJlY2F1c2UgY2hyb21lIGFkZHMgJyMnIHRvIHJlZGlyZWN0c1xuICAgICAgaWYgKGF1dGhXaW5kb3dVcmwuc3BsaXQoJyMnKVswXSA9PT0gcmVkaXJlY3QpIHtcbiAgICAgICAgYXV0aFdpbmRvdy5jbG9zZSgpXG4gICAgICAgIHRoaXMuX2xvYWRlcldyYXBwZXIodGhpcy5Qcm92aWRlci5hdXRoKCksIHRoaXMucGx1Z2luLm9uQXV0aCwgdGhpcy5oYW5kbGVFcnJvcilcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNldFRpbWVvdXQoY2hlY2tBdXRoLCAxMDApXG4gICAgICB9XG4gICAgfVxuXG4gICAgY2hlY2tBdXRoKClcbiAgfVxuXG4gIGhhbmRsZUVycm9yIChlcnJvcikge1xuICAgIHRoaXMudXBkYXRlU3RhdGUoeyBlcnJvciB9KVxuICB9XG5cbiAgLy8gZGlzcGxheXMgbG9hZGVyIHZpZXcgd2hpbGUgYXN5bmNocm9ub3VzIHJlcXVlc3QgaXMgYmVpbmcgbWFkZS5cbiAgX2xvYWRlcldyYXBwZXIgKHByb21pc2UsIHRoZW4sIGNhdGNoXykge1xuICAgIHByb21pc2VcbiAgICAgIC50aGVuKChyZXN1bHQpID0+IHtcbiAgICAgICAgdGhpcy51cGRhdGVTdGF0ZSh7IGxvYWRpbmc6IGZhbHNlIH0pXG4gICAgICAgIHRoZW4ocmVzdWx0KVxuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgIHRoaXMudXBkYXRlU3RhdGUoeyBsb2FkaW5nOiBmYWxzZSB9KVxuICAgICAgICBjYXRjaF8oZXJyKVxuICAgICAgfSlcbiAgICB0aGlzLnVwZGF0ZVN0YXRlKHsgbG9hZGluZzogdHJ1ZSB9KVxuICB9XG5cbiAgcmVuZGVyIChzdGF0ZSkge1xuICAgIGNvbnN0IHsgYXV0aGVudGljYXRlZCwgZXJyb3IsIGxvYWRpbmcgfSA9IHN0YXRlW3RoaXMucGx1Z2luLnN0YXRlSWRdXG5cbiAgICBpZiAoZXJyb3IpIHtcbiAgICAgIHRoaXMudXBkYXRlU3RhdGUoeyBlcnJvcjogdW5kZWZpbmVkIH0pXG4gICAgICByZXR1cm4gRXJyb3JWaWV3KHsgZXJyb3I6IGVycm9yIH0pXG4gICAgfVxuXG4gICAgaWYgKGxvYWRpbmcpIHtcbiAgICAgIHJldHVybiBMb2FkZXJWaWV3KClcbiAgICB9XG5cbiAgICBpZiAoIWF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgIHJldHVybiBBdXRoVmlldyh7XG4gICAgICAgIHBsdWdpbk5hbWU6IHRoaXMucGx1Z2luLnRpdGxlLFxuICAgICAgICBkZW1vOiB0aGlzLnBsdWdpbi5vcHRzLmRlbW8sXG4gICAgICAgIGhhbmRsZUF1dGg6IHRoaXMuaGFuZGxlQXV0aCxcbiAgICAgICAgaGFuZGxlRGVtb0F1dGg6IHRoaXMuaGFuZGxlRGVtb0F1dGhcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgY29uc3QgYnJvd3NlclByb3BzID0gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGVbdGhpcy5wbHVnaW4uc3RhdGVJZF0sIHtcbiAgICAgIGdldE5leHRGb2xkZXI6IHRoaXMuZ2V0TmV4dEZvbGRlcixcbiAgICAgIGdldEZvbGRlcjogdGhpcy5nZXRGb2xkZXIsXG4gICAgICBhZGRGaWxlOiB0aGlzLmFkZEZpbGUsXG4gICAgICBmaWx0ZXJJdGVtczogdGhpcy5maWx0ZXJJdGVtcyxcbiAgICAgIGZpbHRlclF1ZXJ5OiB0aGlzLmZpbHRlclF1ZXJ5LFxuICAgICAgaGFuZGxlUm93Q2xpY2s6IHRoaXMuaGFuZGxlUm93Q2xpY2ssXG4gICAgICBzb3J0QnlUaXRsZTogdGhpcy5zb3J0QnlUaXRsZSxcbiAgICAgIHNvcnRCeURhdGU6IHRoaXMuc29ydEJ5RGF0ZSxcbiAgICAgIGxvZ291dDogdGhpcy5sb2dvdXQsXG4gICAgICBkZW1vOiB0aGlzLnBsdWdpbi5vcHRzLmRlbW8sXG4gICAgICBpc0FjdGl2ZVJvdzogdGhpcy5pc0FjdGl2ZVJvdyxcbiAgICAgIGdldEl0ZW1OYW1lOiB0aGlzLnBsdWdpbi5nZXRJdGVtTmFtZSxcbiAgICAgIGdldEl0ZW1JY29uOiB0aGlzLnBsdWdpbi5nZXRJdGVtSWNvblxuICAgIH0pXG5cbiAgICByZXR1cm4gQnJvd3Nlcihicm93c2VyUHJvcHMpXG4gIH1cbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5cbm1vZHVsZS5leHBvcnRzID0gKHByb3BzKSA9PiB7XG4gIHJldHVybiBodG1sYFxuICAgIDxzcGFuPlxuICAgICAgJHtwcm9wcy5hY3F1aXJlcnMubGVuZ3RoID09PSAwXG4gICAgICAgID8gcHJvcHMuaTE4bignZHJvcFBhc3RlJylcbiAgICAgICAgOiBwcm9wcy5pMThuKCdkcm9wUGFzdGVJbXBvcnQnKVxuICAgICAgfVxuICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCJcbiAgICAgICAgICAgICAgY2xhc3M9XCJVcHB5RGFzaGJvYXJkLWJyb3dzZVwiXG4gICAgICAgICAgICAgIG9uY2xpY2s9JHsoZXYpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBpbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYCR7cHJvcHMuY29udGFpbmVyfSAuVXBweURhc2hib2FyZC1pbnB1dGApXG4gICAgICAgICAgICAgICAgaW5wdXQuY2xpY2soKVxuICAgICAgICAgICAgICB9fT4ke3Byb3BzLmkxOG4oJ2Jyb3dzZScpfTwvYnV0dG9uPlxuICAgICAgPGlucHV0IGNsYXNzPVwiVXBweURhc2hib2FyZC1pbnB1dFwiIHR5cGU9XCJmaWxlXCIgbmFtZT1cImZpbGVzW11cIiBtdWx0aXBsZT1cInRydWVcIlxuICAgICAgICAgICAgIG9uY2hhbmdlPSR7cHJvcHMuaGFuZGxlSW5wdXRDaGFuZ2V9IC8+XG4gICAgPC9zcGFuPlxuICBgXG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuY29uc3QgRmlsZUxpc3QgPSByZXF1aXJlKCcuL0ZpbGVMaXN0JylcbmNvbnN0IFRhYnMgPSByZXF1aXJlKCcuL1RhYnMnKVxuY29uc3QgRmlsZUNhcmQgPSByZXF1aXJlKCcuL0ZpbGVDYXJkJylcbmNvbnN0IFVwbG9hZEJ0biA9IHJlcXVpcmUoJy4vVXBsb2FkQnRuJylcbmNvbnN0IFN0YXR1c0JhciA9IHJlcXVpcmUoJy4vU3RhdHVzQmFyJylcbmNvbnN0IHsgaXNUb3VjaERldmljZSwgdG9BcnJheSB9ID0gcmVxdWlyZSgnLi4vLi4vY29yZS9VdGlscycpXG5jb25zdCB7IGNsb3NlSWNvbiB9ID0gcmVxdWlyZSgnLi9pY29ucycpXG5cbi8vIGh0dHA6Ly9kZXYuZWRlbnNwaWVrZXJtYW5uLmNvbS8yMDE2LzAyLzExL2ludHJvZHVjaW5nLWFjY2Vzc2libGUtbW9kYWwtZGlhbG9nXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gRGFzaGJvYXJkIChwcm9wcykge1xuICBmdW5jdGlvbiBoYW5kbGVJbnB1dENoYW5nZSAoZXYpIHtcbiAgICBldi5wcmV2ZW50RGVmYXVsdCgpXG4gICAgY29uc3QgZmlsZXMgPSB0b0FycmF5KGV2LnRhcmdldC5maWxlcylcblxuICAgIGZpbGVzLmZvckVhY2goKGZpbGUpID0+IHtcbiAgICAgIHByb3BzLmFkZEZpbGUoe1xuICAgICAgICBzb3VyY2U6IHByb3BzLmlkLFxuICAgICAgICBuYW1lOiBmaWxlLm5hbWUsXG4gICAgICAgIHR5cGU6IGZpbGUudHlwZSxcbiAgICAgICAgZGF0YTogZmlsZVxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgLy8gQFRPRE8gRXhwcmltZW50YWwsIHdvcmsgaW4gcHJvZ3Jlc3NcbiAgLy8gbm8gbmFtZXMsIHdlaXJkIEFQSSwgQ2hyb21lLW9ubHkgaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMjI5NDAwMjBcbiAgZnVuY3Rpb24gaGFuZGxlUGFzdGUgKGV2KSB7XG4gICAgZXYucHJldmVudERlZmF1bHQoKVxuXG4gICAgY29uc3QgZmlsZXMgPSB0b0FycmF5KGV2LmNsaXBib2FyZERhdGEuaXRlbXMpXG4gICAgZmlsZXMuZm9yRWFjaCgoZmlsZSkgPT4ge1xuICAgICAgaWYgKGZpbGUua2luZCAhPT0gJ2ZpbGUnKSByZXR1cm5cblxuICAgICAgY29uc3QgYmxvYiA9IGZpbGUuZ2V0QXNGaWxlKClcbiAgICAgIHByb3BzLmxvZygnRmlsZSBwYXN0ZWQnKVxuICAgICAgcHJvcHMuYWRkRmlsZSh7XG4gICAgICAgIHNvdXJjZTogcHJvcHMuaWQsXG4gICAgICAgIG5hbWU6IGZpbGUubmFtZSxcbiAgICAgICAgdHlwZTogZmlsZS50eXBlLFxuICAgICAgICBkYXRhOiBibG9iXG4gICAgICB9KVxuICAgIH0pXG4gIH1cblxuICByZXR1cm4gaHRtbGBcbiAgICA8ZGl2IGNsYXNzPVwiVXBweSBVcHB5VGhlbWUtLWRlZmF1bHQgVXBweURhc2hib2FyZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAke2lzVG91Y2hEZXZpY2UoKSA/ICdVcHB5LS1pc1RvdWNoRGV2aWNlJyA6ICcnfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAke3Byb3BzLnNlbWlUcmFuc3BhcmVudCA/ICdVcHB5RGFzaGJvYXJkLS1zZW1pVHJhbnNwYXJlbnQnIDogJyd9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICR7IXByb3BzLmlubGluZSA/ICdVcHB5RGFzaGJvYXJkLS1tb2RhbCcgOiAnJ31cbiAgICAgICAgICAgICAgICAgICAgICAgICAgJHtwcm9wcy5pc1dpZGUgPyAnVXBweURhc2hib2FyZC0td2lkZScgOiAnJ31cIlxuICAgICAgICAgIGFyaWEtaGlkZGVuPVwiJHtwcm9wcy5pbmxpbmUgPyAnZmFsc2UnIDogcHJvcHMubW9kYWwuaXNIaWRkZW59XCJcbiAgICAgICAgICBhcmlhLWxhYmVsPVwiJHshcHJvcHMuaW5saW5lXG4gICAgICAgICAgICAgICAgICAgICAgID8gcHJvcHMuaTE4bignZGFzaGJvYXJkV2luZG93VGl0bGUnKVxuICAgICAgICAgICAgICAgICAgICAgICA6IHByb3BzLmkxOG4oJ2Rhc2hib2FyZFRpdGxlJyl9XCJcbiAgICAgICAgICByb2xlPVwiZGlhbG9nXCJcbiAgICAgICAgICBvbnBhc3RlPSR7aGFuZGxlUGFzdGV9XG4gICAgICAgICAgb25sb2FkPSR7KCkgPT4gcHJvcHMudXBkYXRlRGFzaGJvYXJkRWxXaWR0aCgpfT5cblxuICAgIDxidXR0b24gY2xhc3M9XCJVcHB5RGFzaGJvYXJkLWNsb3NlXCJcbiAgICAgICAgICAgIGFyaWEtbGFiZWw9XCIke3Byb3BzLmkxOG4oJ2Nsb3NlTW9kYWwnKX1cIlxuICAgICAgICAgICAgdGl0bGU9XCIke3Byb3BzLmkxOG4oJ2Nsb3NlTW9kYWwnKX1cIlxuICAgICAgICAgICAgb25jbGljaz0ke3Byb3BzLmhpZGVNb2RhbH0+JHtjbG9zZUljb24oKX08L2J1dHRvbj5cblxuICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkLW92ZXJsYXlcIiBvbmNsaWNrPSR7cHJvcHMuaGlkZU1vZGFsfT48L2Rpdj5cblxuICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkLWlubmVyXCJcbiAgICAgICAgIHRhYmluZGV4PVwiMFwiXG4gICAgICAgICBzdHlsZT1cIlxuICAgICAgICAgICR7cHJvcHMuaW5saW5lICYmIHByb3BzLm1heFdpZHRoID8gYG1heC13aWR0aDogJHtwcm9wcy5tYXhXaWR0aH1weDtgIDogJyd9XG4gICAgICAgICAgJHtwcm9wcy5pbmxpbmUgJiYgcHJvcHMubWF4SGVpZ2h0ID8gYG1heC1oZWlnaHQ6ICR7cHJvcHMubWF4SGVpZ2h0fXB4O2AgOiAnJ31cbiAgICAgICAgIFwiPlxuICAgICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtaW5uZXJXcmFwXCI+XG5cbiAgICAgICAgJHtUYWJzKHtcbiAgICAgICAgICBmaWxlczogcHJvcHMuZmlsZXMsXG4gICAgICAgICAgaGFuZGxlSW5wdXRDaGFuZ2U6IGhhbmRsZUlucHV0Q2hhbmdlLFxuICAgICAgICAgIGFjcXVpcmVyczogcHJvcHMuYWNxdWlyZXJzLFxuICAgICAgICAgIGNvbnRhaW5lcjogcHJvcHMuY29udGFpbmVyLFxuICAgICAgICAgIHBhbmVsU2VsZWN0b3JQcmVmaXg6IHByb3BzLnBhbmVsU2VsZWN0b3JQcmVmaXgsXG4gICAgICAgICAgc2hvd1BhbmVsOiBwcm9wcy5zaG93UGFuZWwsXG4gICAgICAgICAgaTE4bjogcHJvcHMuaTE4blxuICAgICAgICB9KX1cblxuICAgICAgICAke0ZpbGVDYXJkKHtcbiAgICAgICAgICBmaWxlczogcHJvcHMuZmlsZXMsXG4gICAgICAgICAgZmlsZUNhcmRGb3I6IHByb3BzLmZpbGVDYXJkRm9yLFxuICAgICAgICAgIGRvbmU6IHByb3BzLmZpbGVDYXJkRG9uZSxcbiAgICAgICAgICBtZXRhRmllbGRzOiBwcm9wcy5tZXRhRmllbGRzLFxuICAgICAgICAgIGxvZzogcHJvcHMubG9nLFxuICAgICAgICAgIGkxOG46IHByb3BzLmkxOG5cbiAgICAgICAgfSl9XG5cbiAgICAgICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtZmlsZXNDb250YWluZXJcIj5cblxuICAgICAgICAgICR7RmlsZUxpc3Qoe1xuICAgICAgICAgICAgYWNxdWlyZXJzOiBwcm9wcy5hY3F1aXJlcnMsXG4gICAgICAgICAgICBmaWxlczogcHJvcHMuZmlsZXMsXG4gICAgICAgICAgICBoYW5kbGVJbnB1dENoYW5nZTogaGFuZGxlSW5wdXRDaGFuZ2UsXG4gICAgICAgICAgICBjb250YWluZXI6IHByb3BzLmNvbnRhaW5lcixcbiAgICAgICAgICAgIHNob3dGaWxlQ2FyZDogcHJvcHMuc2hvd0ZpbGVDYXJkLFxuICAgICAgICAgICAgc2hvd1Byb2dyZXNzRGV0YWlsczogcHJvcHMuc2hvd1Byb2dyZXNzRGV0YWlscyxcbiAgICAgICAgICAgIHRvdGFsUHJvZ3Jlc3M6IHByb3BzLnRvdGFsUHJvZ3Jlc3MsXG4gICAgICAgICAgICB0b3RhbEZpbGVDb3VudDogcHJvcHMudG90YWxGaWxlQ291bnQsXG4gICAgICAgICAgICBpbmZvOiBwcm9wcy5pbmZvLFxuICAgICAgICAgICAgaTE4bjogcHJvcHMuaTE4bixcbiAgICAgICAgICAgIGxvZzogcHJvcHMubG9nLFxuICAgICAgICAgICAgcmVtb3ZlRmlsZTogcHJvcHMucmVtb3ZlRmlsZSxcbiAgICAgICAgICAgIHBhdXNlQWxsOiBwcm9wcy5wYXVzZUFsbCxcbiAgICAgICAgICAgIHJlc3VtZUFsbDogcHJvcHMucmVzdW1lQWxsLFxuICAgICAgICAgICAgcGF1c2VVcGxvYWQ6IHByb3BzLnBhdXNlVXBsb2FkLFxuICAgICAgICAgICAgc3RhcnRVcGxvYWQ6IHByb3BzLnN0YXJ0VXBsb2FkLFxuICAgICAgICAgICAgY2FuY2VsVXBsb2FkOiBwcm9wcy5jYW5jZWxVcGxvYWQsXG4gICAgICAgICAgICByZXN1bWFibGVVcGxvYWRzOiBwcm9wcy5yZXN1bWFibGVVcGxvYWRzLFxuICAgICAgICAgICAgaXNXaWRlOiBwcm9wcy5pc1dpZGVcbiAgICAgICAgICB9KX1cblxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkLWFjdGlvbnNcIj5cbiAgICAgICAgICAgICR7IXByb3BzLmF1dG9Qcm9jZWVkICYmIHByb3BzLm5ld0ZpbGVzLmxlbmd0aCA+IDBcbiAgICAgICAgICAgICAgPyBVcGxvYWRCdG4oe1xuICAgICAgICAgICAgICAgIGkxOG46IHByb3BzLmkxOG4sXG4gICAgICAgICAgICAgICAgc3RhcnRVcGxvYWQ6IHByb3BzLnN0YXJ0VXBsb2FkLFxuICAgICAgICAgICAgICAgIG5ld0ZpbGVDb3VudDogcHJvcHMubmV3RmlsZXMubGVuZ3RoXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIDogbnVsbFxuICAgICAgICAgICAgfVxuICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgIDwvZGl2PlxuXG4gICAgICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkQ29udGVudC1wYW5lbFwiXG4gICAgICAgICAgICAgcm9sZT1cInRhYnBhbmVsXCJcbiAgICAgICAgICAgICBhcmlhLWhpZGRlbj1cIiR7cHJvcHMuYWN0aXZlUGFuZWwgPyAnZmFsc2UnIDogJ3RydWUnfVwiPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkQ29udGVudC1iYXJcIj5cbiAgICAgICAgICAgIDxoMiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRDb250ZW50LXRpdGxlXCI+XG4gICAgICAgICAgICAgICR7cHJvcHMuaTE4bignaW1wb3J0RnJvbScpfSAke3Byb3BzLmFjdGl2ZVBhbmVsID8gcHJvcHMuYWN0aXZlUGFuZWwubmFtZSA6IG51bGx9XG4gICAgICAgICAgICA8L2gyPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRDb250ZW50LWJhY2tcIlxuICAgICAgICAgICAgICAgICAgICBvbmNsaWNrPSR7cHJvcHMuaGlkZUFsbFBhbmVsc30+JHtwcm9wcy5pMThuKCdkb25lJyl9PC9idXR0b24+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgJHtwcm9wcy5hY3RpdmVQYW5lbCA/IHByb3BzLmFjdGl2ZVBhbmVsLnJlbmRlcihwcm9wcy5zdGF0ZSkgOiAnJ31cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtcHJvZ3Jlc3NpbmRpY2F0b3JzXCI+XG4gICAgICAgICAgJHtTdGF0dXNCYXIoe1xuICAgICAgICAgICAgdG90YWxQcm9ncmVzczogcHJvcHMudG90YWxQcm9ncmVzcyxcbiAgICAgICAgICAgIHRvdGFsRmlsZUNvdW50OiBwcm9wcy50b3RhbEZpbGVDb3VudCxcbiAgICAgICAgICAgIHRvdGFsU2l6ZTogcHJvcHMudG90YWxTaXplLFxuICAgICAgICAgICAgdG90YWxVcGxvYWRlZFNpemU6IHByb3BzLnRvdGFsVXBsb2FkZWRTaXplLFxuICAgICAgICAgICAgdXBsb2FkU3RhcnRlZEZpbGVzOiBwcm9wcy51cGxvYWRTdGFydGVkRmlsZXMsXG4gICAgICAgICAgICBpc0FsbENvbXBsZXRlOiBwcm9wcy5pc0FsbENvbXBsZXRlLFxuICAgICAgICAgICAgaXNBbGxQYXVzZWQ6IHByb3BzLmlzQWxsUGF1c2VkLFxuICAgICAgICAgICAgaXNVcGxvYWRTdGFydGVkOiBwcm9wcy5pc1VwbG9hZFN0YXJ0ZWQsXG4gICAgICAgICAgICBwYXVzZUFsbDogcHJvcHMucGF1c2VBbGwsXG4gICAgICAgICAgICByZXN1bWVBbGw6IHByb3BzLnJlc3VtZUFsbCxcbiAgICAgICAgICAgIGNhbmNlbEFsbDogcHJvcHMuY2FuY2VsQWxsLFxuICAgICAgICAgICAgY29tcGxldGU6IHByb3BzLmNvbXBsZXRlRmlsZXMubGVuZ3RoLFxuICAgICAgICAgICAgaW5Qcm9ncmVzczogcHJvcHMuaW5Qcm9ncmVzcyxcbiAgICAgICAgICAgIHRvdGFsU3BlZWQ6IHByb3BzLnRvdGFsU3BlZWQsXG4gICAgICAgICAgICB0b3RhbEVUQTogcHJvcHMudG90YWxFVEEsXG4gICAgICAgICAgICBzdGFydFVwbG9hZDogcHJvcHMuc3RhcnRVcGxvYWQsXG4gICAgICAgICAgICBuZXdGaWxlQ291bnQ6IHByb3BzLm5ld0ZpbGVzLmxlbmd0aCxcbiAgICAgICAgICAgIGkxOG46IHByb3BzLmkxOG4sXG4gICAgICAgICAgICByZXN1bWFibGVVcGxvYWRzOiBwcm9wcy5yZXN1bWFibGVVcGxvYWRzXG4gICAgICAgICAgfSl9XG5cbiAgICAgICAgICAke3Byb3BzLnByb2dyZXNzaW5kaWNhdG9ycy5tYXAoKHRhcmdldCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHRhcmdldC5yZW5kZXIocHJvcHMuc3RhdGUpXG4gICAgICAgICAgfSl9XG4gICAgICAgIDwvZGl2PlxuXG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgPC9kaXY+XG4gIGBcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5jb25zdCBnZXRGaWxlVHlwZUljb24gPSByZXF1aXJlKCcuL2dldEZpbGVUeXBlSWNvbicpXG5jb25zdCB7IGNoZWNrSWNvbiB9ID0gcmVxdWlyZSgnLi9pY29ucycpXG5cbi8vIGZ1bmN0aW9uIGdldEljb25CeU1pbWUgKGZpbGVUeXBlR2VuZXJhbCkge1xuLy8gICBzd2l0Y2ggKGZpbGVUeXBlR2VuZXJhbCkge1xuLy8gICAgIGNhc2UgJ3RleHQnOlxuLy8gICAgICAgcmV0dXJuIGljb25UZXh0KClcbi8vICAgICBjYXNlICdhdWRpbyc6XG4vLyAgICAgICByZXR1cm4gaWNvbkF1ZGlvKClcbi8vICAgICBkZWZhdWx0OlxuLy8gICAgICAgcmV0dXJuIGljb25GaWxlKClcbi8vICAgfVxuLy8gfVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGZpbGVDYXJkIChwcm9wcykge1xuICBjb25zdCBmaWxlID0gcHJvcHMuZmlsZUNhcmRGb3IgPyBwcm9wcy5maWxlc1twcm9wcy5maWxlQ2FyZEZvcl0gOiBmYWxzZVxuICBjb25zdCBtZXRhID0ge31cblxuICBmdW5jdGlvbiB0ZW1wU3RvcmVNZXRhIChldikge1xuICAgIGNvbnN0IHZhbHVlID0gZXYudGFyZ2V0LnZhbHVlXG4gICAgY29uc3QgbmFtZSA9IGV2LnRhcmdldC5hdHRyaWJ1dGVzLm5hbWUudmFsdWVcbiAgICBtZXRhW25hbWVdID0gdmFsdWVcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbmRlck1ldGFGaWVsZHMgKGZpbGUpIHtcbiAgICBjb25zdCBtZXRhRmllbGRzID0gcHJvcHMubWV0YUZpZWxkcyB8fCBbXVxuICAgIHJldHVybiBtZXRhRmllbGRzLm1hcCgoZmllbGQpID0+IHtcbiAgICAgIHJldHVybiBodG1sYDxmaWVsZHNldCBjbGFzcz1cIlVwcHlEYXNoYm9hcmRGaWxlQ2FyZC1maWVsZHNldFwiPlxuICAgICAgICA8bGFiZWwgY2xhc3M9XCJVcHB5RGFzaGJvYXJkRmlsZUNhcmQtbGFiZWxcIj4ke2ZpZWxkLm5hbWV9PC9sYWJlbD5cbiAgICAgICAgPGlucHV0IGNsYXNzPVwiVXBweURhc2hib2FyZEZpbGVDYXJkLWlucHV0XCJcbiAgICAgICAgICAgICAgIG5hbWU9XCIke2ZpZWxkLmlkfVwiXG4gICAgICAgICAgICAgICB0eXBlPVwidGV4dFwiXG4gICAgICAgICAgICAgICB2YWx1ZT1cIiR7ZmlsZS5tZXRhW2ZpZWxkLmlkXX1cIlxuICAgICAgICAgICAgICAgcGxhY2Vob2xkZXI9XCIke2ZpZWxkLnBsYWNlaG9sZGVyIHx8ICcnfVwiXG4gICAgICAgICAgICAgICBvbmtleXVwPSR7dGVtcFN0b3JlTWV0YX0gLz48L2ZpZWxkc2V0PmBcbiAgICB9KVxuICB9XG5cbiAgcmV0dXJuIGh0bWxgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRGaWxlQ2FyZFwiIGFyaWEtaGlkZGVuPVwiJHshcHJvcHMuZmlsZUNhcmRGb3J9XCI+XG4gICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRDb250ZW50LWJhclwiPlxuICAgICAgPGgyIGNsYXNzPVwiVXBweURhc2hib2FyZENvbnRlbnQtdGl0bGVcIj5FZGl0aW5nIDxzcGFuIGNsYXNzPVwiVXBweURhc2hib2FyZENvbnRlbnQtdGl0bGVGaWxlXCI+JHtmaWxlLm1ldGEgPyBmaWxlLm1ldGEubmFtZSA6IGZpbGUubmFtZX08L3NwYW4+PC9oMj5cbiAgICAgIDxidXR0b24gY2xhc3M9XCJVcHB5RGFzaGJvYXJkQ29udGVudC1iYWNrXCIgdGl0bGU9XCJGaW5pc2ggZWRpdGluZyBmaWxlXCJcbiAgICAgICAgICAgICAgb25jbGljaz0keygpID0+IHByb3BzLmRvbmUobWV0YSwgZmlsZS5pZCl9PkRvbmU8L2J1dHRvbj5cbiAgICA8L2Rpdj5cbiAgICAke3Byb3BzLmZpbGVDYXJkRm9yXG4gICAgICA/IGh0bWxgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRGaWxlQ2FyZC1pbm5lclwiPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkRmlsZUNhcmQtcHJldmlld1wiPlxuICAgICAgICAgICAgJHtmaWxlLnByZXZpZXdcbiAgICAgICAgICAgICAgPyBodG1sYDxpbWcgYWx0PVwiJHtmaWxlLm5hbWV9XCIgc3JjPVwiJHtmaWxlLnByZXZpZXd9XCI+YFxuICAgICAgICAgICAgICA6IGh0bWxgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRJdGVtLXByZXZpZXdJY29uXCIgc3R5bGU9XCJjb2xvcjogJHtnZXRGaWxlVHlwZUljb24oZmlsZS50eXBlLmdlbmVyYWwsIGZpbGUudHlwZS5zcGVjaWZpYykuY29sb3J9XCI+XG4gICAgICAgICAgICAgICAgICAke2dldEZpbGVUeXBlSWNvbihmaWxlLnR5cGUuZ2VuZXJhbCwgZmlsZS50eXBlLnNwZWNpZmljKS5pY29ufVxuICAgICAgICAgICAgICAgIDwvZGl2PmBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZEZpbGVDYXJkLWluZm9cIj5cbiAgICAgICAgICAgIDxmaWVsZHNldCBjbGFzcz1cIlVwcHlEYXNoYm9hcmRGaWxlQ2FyZC1maWVsZHNldFwiPlxuICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJVcHB5RGFzaGJvYXJkRmlsZUNhcmQtbGFiZWxcIj5OYW1lPC9sYWJlbD5cbiAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiVXBweURhc2hib2FyZEZpbGVDYXJkLWlucHV0XCIgbmFtZT1cIm5hbWVcIiB0eXBlPVwidGV4dFwiIHZhbHVlPVwiJHtmaWxlLm1ldGEubmFtZX1cIlxuICAgICAgICAgICAgICAgICAgICAgb25rZXl1cD0ke3RlbXBTdG9yZU1ldGF9IC8+XG4gICAgICAgICAgICA8L2ZpZWxkc2V0PlxuICAgICAgICAgICAgJHtyZW5kZXJNZXRhRmllbGRzKGZpbGUpfVxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5gXG4gICAgICA6IG51bGxcbiAgICB9XG4gICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtYWN0aW9uc1wiPlxuICAgICAgPGJ1dHRvbiBjbGFzcz1cIlVwcHlCdXR0b24tLWNpcmN1bGFyIFVwcHlCdXR0b24tLWJsdWUgVXBweURhc2hib2FyZEZpbGVDYXJkLWRvbmVcIlxuICAgICAgICAgICAgICB0eXBlPVwiYnV0dG9uXCJcbiAgICAgICAgICAgICAgdGl0bGU9XCJGaW5pc2ggZWRpdGluZyBmaWxlXCJcbiAgICAgICAgICAgICAgb25jbGljaz0keygpID0+IHByb3BzLmRvbmUobWV0YSwgZmlsZS5pZCl9PiR7Y2hlY2tJY29uKCl9PC9idXR0b24+XG4gICAgPC9kaXY+XG4gICAgPC9kaXY+YFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcbmNvbnN0IHsgZ2V0RVRBLFxuICAgICAgICAgZ2V0U3BlZWQsXG4gICAgICAgICBwcmV0dHlFVEEsXG4gICAgICAgICBnZXRGaWxlTmFtZUFuZEV4dGVuc2lvbixcbiAgICAgICAgIHRydW5jYXRlU3RyaW5nLFxuICAgICAgICAgY29weVRvQ2xpcGJvYXJkIH0gPSByZXF1aXJlKCcuLi8uLi9jb3JlL1V0aWxzJylcbmNvbnN0IHByZXR0eUJ5dGVzID0gcmVxdWlyZSgncHJldHRpZXItYnl0ZXMnKVxuY29uc3QgRmlsZUl0ZW1Qcm9ncmVzcyA9IHJlcXVpcmUoJy4vRmlsZUl0ZW1Qcm9ncmVzcycpXG5jb25zdCBnZXRGaWxlVHlwZUljb24gPSByZXF1aXJlKCcuL2dldEZpbGVUeXBlSWNvbicpXG5jb25zdCB7IGljb25FZGl0LCBpY29uQ29weSB9ID0gcmVxdWlyZSgnLi9pY29ucycpXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZmlsZUl0ZW0gKHByb3BzKSB7XG4gIGNvbnN0IGZpbGUgPSBwcm9wcy5maWxlXG5cbiAgY29uc3QgaXNVcGxvYWRlZCA9IGZpbGUucHJvZ3Jlc3MudXBsb2FkQ29tcGxldGVcbiAgY29uc3QgdXBsb2FkSW5Qcm9ncmVzc09yQ29tcGxldGUgPSBmaWxlLnByb2dyZXNzLnVwbG9hZFN0YXJ0ZWRcbiAgY29uc3QgdXBsb2FkSW5Qcm9ncmVzcyA9IGZpbGUucHJvZ3Jlc3MudXBsb2FkU3RhcnRlZCAmJiAhZmlsZS5wcm9ncmVzcy51cGxvYWRDb21wbGV0ZVxuICBjb25zdCBpc1BhdXNlZCA9IGZpbGUuaXNQYXVzZWQgfHwgZmFsc2VcblxuICBjb25zdCBmaWxlTmFtZSA9IGdldEZpbGVOYW1lQW5kRXh0ZW5zaW9uKGZpbGUubWV0YS5uYW1lKVswXVxuICBjb25zdCB0cnVuY2F0ZWRGaWxlTmFtZSA9IHByb3BzLmlzV2lkZSA/IHRydW5jYXRlU3RyaW5nKGZpbGVOYW1lLCAxNSkgOiBmaWxlTmFtZVxuXG4gIHJldHVybiBodG1sYDxsaSBjbGFzcz1cIlVwcHlEYXNoYm9hcmRJdGVtXG4gICAgICAgICAgICAgICAgICAgICAgICAke3VwbG9hZEluUHJvZ3Jlc3MgPyAnaXMtaW5wcm9ncmVzcycgOiAnJ31cbiAgICAgICAgICAgICAgICAgICAgICAgICR7aXNVcGxvYWRlZCA/ICdpcy1jb21wbGV0ZScgOiAnJ31cbiAgICAgICAgICAgICAgICAgICAgICAgICR7aXNQYXVzZWQgPyAnaXMtcGF1c2VkJyA6ICcnfVxuICAgICAgICAgICAgICAgICAgICAgICAgJHtwcm9wcy5yZXN1bWFibGVVcGxvYWRzID8gJ2lzLXJlc3VtYWJsZScgOiAnJ31cIlxuICAgICAgICAgICAgICAgICAgaWQ9XCJ1cHB5XyR7ZmlsZS5pZH1cIlxuICAgICAgICAgICAgICAgICAgdGl0bGU9XCIke2ZpbGUubWV0YS5uYW1lfVwiPlxuICAgICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRJdGVtLXByZXZpZXdcIj5cbiAgICAgICAgJHtmaWxlLnByZXZpZXdcbiAgICAgICAgICA/IGh0bWxgPGltZyBhbHQ9XCIke2ZpbGUubmFtZX1cIiBzcmM9XCIke2ZpbGUucHJldmlld31cIj5gXG4gICAgICAgICAgOiBodG1sYDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1wcmV2aWV3SWNvblwiIHN0eWxlPVwiY29sb3I6ICR7Z2V0RmlsZVR5cGVJY29uKGZpbGUudHlwZS5nZW5lcmFsLCBmaWxlLnR5cGUuc3BlY2lmaWMpLmNvbG9yfVwiPlxuICAgICAgICAgICAgICAke2dldEZpbGVUeXBlSWNvbihmaWxlLnR5cGUuZ2VuZXJhbCwgZmlsZS50eXBlLnNwZWNpZmljKS5pY29ufVxuICAgICAgICAgICAgPC9kaXY+YFxuICAgICAgICB9XG4gICAgICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1wcm9ncmVzc1wiPlxuICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1wcm9ncmVzc0J0blwiXG4gICAgICAgICAgICAgICAgICB0aXRsZT1cIiR7aXNVcGxvYWRlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICA/ICd1cGxvYWQgY29tcGxldGUnXG4gICAgICAgICAgICAgICAgICAgICAgICAgIDogcHJvcHMucmVzdW1hYmxlVXBsb2Fkc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gZmlsZS5pc1BhdXNlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyAncmVzdW1lIHVwbG9hZCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogJ3BhdXNlIHVwbG9hZCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA6ICdjYW5jZWwgdXBsb2FkJ1xuICAgICAgICAgICAgICAgICAgICAgICAgfVwiXG4gICAgICAgICAgICAgICAgICBvbmNsaWNrPSR7KGV2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc1VwbG9hZGVkKSByZXR1cm5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BzLnJlc3VtYWJsZVVwbG9hZHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICBwcm9wcy5wYXVzZVVwbG9hZChmaWxlLmlkKVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgIHByb3BzLmNhbmNlbFVwbG9hZChmaWxlLmlkKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9fT5cbiAgICAgICAgICAgICR7RmlsZUl0ZW1Qcm9ncmVzcyh7XG4gICAgICAgICAgICAgIHByb2dyZXNzOiBmaWxlLnByb2dyZXNzLnBlcmNlbnRhZ2UsXG4gICAgICAgICAgICAgIGZpbGVJRDogZmlsZS5pZFxuICAgICAgICAgICAgfSl9XG4gICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgJHtwcm9wcy5zaG93UHJvZ3Jlc3NEZXRhaWxzXG4gICAgICAgICAgICA/IGh0bWxgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRJdGVtLXByb2dyZXNzSW5mb1wiXG4gICAgICAgICAgICAgICAgICAgICAgICB0aXRsZT1cIiR7cHJvcHMuaTE4bignZmlsZVByb2dyZXNzJyl9XCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyaWEtbGFiZWw9XCIke3Byb3BzLmkxOG4oJ2ZpbGVQcm9ncmVzcycpfVwiPlxuICAgICAgICAgICAgICAgICR7IWZpbGUuaXNQYXVzZWQgJiYgIWlzVXBsb2FkZWRcbiAgICAgICAgICAgICAgICAgID8gaHRtbGA8c3Bhbj4ke3ByZXR0eUVUQShnZXRFVEEoZmlsZS5wcm9ncmVzcykpfSDjg7sg4oaRICR7cHJldHR5Qnl0ZXMoZ2V0U3BlZWQoZmlsZS5wcm9ncmVzcykpfS9zPC9zcGFuPmBcbiAgICAgICAgICAgICAgICAgIDogbnVsbFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgPC9kaXY+YFxuICAgICAgICAgICAgOiBudWxsXG4gICAgICAgICAgfVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1pbmZvXCI+XG4gICAgICA8aDQgY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1uYW1lXCIgdGl0bGU9XCIke2ZpbGVOYW1lfVwiPlxuICAgICAgICAke2ZpbGUudXBsb2FkVVJMXG4gICAgICAgICAgPyBodG1sYDxhIGhyZWY9XCIke2ZpbGUudXBsb2FkVVJMfVwiIHRhcmdldD1cIl9ibGFua1wiPlxuICAgICAgICAgICAgICAke2ZpbGUuZXh0ZW5zaW9uID8gdHJ1bmNhdGVkRmlsZU5hbWUgKyAnLicgKyBmaWxlLmV4dGVuc2lvbiA6IHRydW5jYXRlZEZpbGVOYW1lfVxuICAgICAgICAgICAgPC9hPmBcbiAgICAgICAgICA6IGZpbGUuZXh0ZW5zaW9uID8gdHJ1bmNhdGVkRmlsZU5hbWUgKyAnLicgKyBmaWxlLmV4dGVuc2lvbiA6IHRydW5jYXRlZEZpbGVOYW1lXG4gICAgICAgIH1cbiAgICAgIDwvaDQ+XG4gICAgICA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZEl0ZW0tc3RhdHVzXCI+XG4gICAgICAgIDxzcGFuIGNsYXNzPVwiVXBweURhc2hib2FyZEl0ZW0tc3RhdHVzU2l6ZVwiPiR7ZmlsZS5kYXRhLnNpemUgPyBwcmV0dHlCeXRlcyhmaWxlLmRhdGEuc2l6ZSkgOiAnPyd9PC9zcGFuPlxuICAgICAgPC9kaXY+XG4gICAgICAkeyF1cGxvYWRJblByb2dyZXNzT3JDb21wbGV0ZVxuICAgICAgICA/IGh0bWxgPGJ1dHRvbiBjbGFzcz1cIlVwcHlEYXNoYm9hcmRJdGVtLWVkaXRcIlxuICAgICAgICAgICAgICAgICAgICAgICBhcmlhLWxhYmVsPVwiRWRpdCBmaWxlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgdGl0bGU9XCJFZGl0IGZpbGVcIlxuICAgICAgICAgICAgICAgICAgICAgICBvbmNsaWNrPSR7KGUpID0+IHByb3BzLnNob3dGaWxlQ2FyZChmaWxlLmlkKX0+XG4gICAgICAgICAgICAgICAgICAgICAgICAke2ljb25FZGl0KCl9PC9idXR0b24+YFxuICAgICAgICA6IG51bGxcbiAgICAgIH1cbiAgICAgICR7ZmlsZS51cGxvYWRVUkxcbiAgICAgICAgPyBodG1sYDxidXR0b24gY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1jb3B5TGlua1wiXG4gICAgICAgICAgICAgICAgICAgICAgIGFyaWEtbGFiZWw9XCJDb3B5IGxpbmtcIlxuICAgICAgICAgICAgICAgICAgICAgICB0aXRsZT1cIkNvcHkgbGlua1wiXG4gICAgICAgICAgICAgICAgICAgICAgIG9uY2xpY2s9JHsoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgY29weVRvQ2xpcGJvYXJkKGZpbGUudXBsb2FkVVJMLCBwcm9wcy5pMThuKCdjb3B5TGlua1RvQ2xpcGJvYXJkRmFsbGJhY2snKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BzLmxvZygnTGluayBjb3BpZWQgdG8gY2xpcGJvYXJkLicpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcHMuaW5mbyhwcm9wcy5pMThuKCdjb3B5TGlua1RvQ2xpcGJvYXJkU3VjY2VzcycpLCAnaW5mbycsIDMwMDApXG4gICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaChwcm9wcy5sb2cpXG4gICAgICAgICAgICAgICAgICAgICAgIH19PiR7aWNvbkNvcHkoKX08L2J1dHRvbj5gXG4gICAgICAgIDogbnVsbFxuICAgICAgfVxuICAgIDwvZGl2PlxuICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1hY3Rpb25cIj5cbiAgICAgICR7IWlzVXBsb2FkZWRcbiAgICAgICAgPyBodG1sYDxidXR0b24gY2xhc3M9XCJVcHB5RGFzaGJvYXJkSXRlbS1yZW1vdmVcIlxuICAgICAgICAgICAgICAgICAgICAgICBhcmlhLWxhYmVsPVwiUmVtb3ZlIGZpbGVcIlxuICAgICAgICAgICAgICAgICAgICAgICB0aXRsZT1cIlJlbW92ZSBmaWxlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgb25jbGljaz0keygpID0+IHByb3BzLnJlbW92ZUZpbGUoZmlsZS5pZCl9PlxuICAgICAgICAgICAgICAgICA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjIyXCIgaGVpZ2h0PVwiMjFcIiB2aWV3Qm94PVwiMCAwIDE4IDE3XCI+XG4gICAgICAgICAgICAgICAgICAgPGVsbGlwc2UgY3g9XCI4LjYyXCIgY3k9XCI4LjM4M1wiIHJ4PVwiOC42MlwiIHJ5PVwiOC4zODNcIi8+XG4gICAgICAgICAgICAgICAgICAgPHBhdGggc3Ryb2tlPVwiI0ZGRlwiIGZpbGw9XCIjRkZGXCIgZD1cIk0xMSA2LjE0N0wxMC44NSA2IDguNSA4LjI4NCA2LjE1IDYgNiA2LjE0NyA4LjM1IDguNDMgNiAxMC43MTdsLjE1LjE0Nkw4LjUgOC41NzhsMi4zNSAyLjI4NC4xNS0uMTQ2TDguNjUgOC40M3pcIi8+XG4gICAgICAgICAgICAgICAgIDwvc3ZnPlxuICAgICAgICAgICAgICAgPC9idXR0b24+YFxuICAgICAgICA6IG51bGxcbiAgICAgIH1cbiAgICA8L2Rpdj5cbiAgPC9saT5gXG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuXG4vLyBodHRwOi8vY29kZXBlbi5pby9IYXJra28vcGVuL3JWeHZOTVxuLy8gaHR0cHM6Ly9jc3MtdHJpY2tzLmNvbS9zdmctbGluZS1hbmltYXRpb24td29ya3MvXG4vLyBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9lc3dhay9hZDRlYTU3YmNkNWZmN2FhNWQ0MlxuXG4vLyBjaXJjbGUgbGVuZ3RoIGVxdWFscyAyICogUEkgKiBSXG5jb25zdCBjaXJjbGVMZW5ndGggPSAyICogTWF0aC5QSSAqIDE1XG5cbi8vIHN0cm9rZS1kYXNob2Zmc2V0IGlzIGEgcGVyY2VudGFnZSBvZiB0aGUgcHJvZ3Jlc3MgZnJvbSBjaXJjbGVMZW5ndGgsXG4vLyBzdWJzdHJhY3RlZCBmcm9tIGNpcmNsZUxlbmd0aCwgYmVjYXVzZSBpdHMgYW4gb2Zmc2V0XG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICByZXR1cm4gaHRtbGBcbiAgICA8c3ZnIHdpZHRoPVwiNzBcIiBoZWlnaHQ9XCI3MFwiIHZpZXdCb3g9XCIwIDAgMzYgMzZcIiBjbGFzcz1cIlVwcHlJY29uIFVwcHlJY29uLXByb2dyZXNzQ2lyY2xlXCI+XG4gICAgICA8ZyBjbGFzcz1cInByb2dyZXNzLWdyb3VwXCI+XG4gICAgICAgIDxjaXJjbGUgcj1cIjE1XCIgY3g9XCIxOFwiIGN5PVwiMThcIiBzdHJva2Utd2lkdGg9XCIyXCIgZmlsbD1cIm5vbmVcIiBjbGFzcz1cImJnXCIvPlxuICAgICAgICA8Y2lyY2xlIHI9XCIxNVwiIGN4PVwiMThcIiBjeT1cIjE4XCIgdHJhbnNmb3JtPVwicm90YXRlKC05MCwgMTgsIDE4KVwiIHN0cm9rZS13aWR0aD1cIjJcIiBmaWxsPVwibm9uZVwiIGNsYXNzPVwicHJvZ3Jlc3NcIlxuICAgICAgICAgICAgICAgIHN0cm9rZS1kYXNoYXJyYXk9JHtjaXJjbGVMZW5ndGh9XG4gICAgICAgICAgICAgICAgc3Ryb2tlLWRhc2hvZmZzZXQ9JHtjaXJjbGVMZW5ndGggLSAoY2lyY2xlTGVuZ3RoIC8gMTAwICogcHJvcHMucHJvZ3Jlc3MpfVxuICAgICAgICAvPlxuICAgICAgPC9nPlxuICAgICAgPHBvbHlnb24gdHJhbnNmb3JtPVwidHJhbnNsYXRlKDMsIDMpXCIgcG9pbnRzPVwiMTIgMjAgMTIgMTAgMjAgMTVcIiBjbGFzcz1cInBsYXlcIi8+XG4gICAgICA8ZyB0cmFuc2Zvcm09XCJ0cmFuc2xhdGUoMTQuNSwgMTMpXCIgY2xhc3M9XCJwYXVzZVwiPlxuICAgICAgICA8cmVjdCB4PVwiMFwiIHk9XCIwXCIgd2lkdGg9XCIyXCIgaGVpZ2h0PVwiMTBcIiByeD1cIjBcIiAvPlxuICAgICAgICA8cmVjdCB4PVwiNVwiIHk9XCIwXCIgd2lkdGg9XCIyXCIgaGVpZ2h0PVwiMTBcIiByeD1cIjBcIiAvPlxuICAgICAgPC9nPlxuICAgICAgPHBvbHlnb24gdHJhbnNmb3JtPVwidHJhbnNsYXRlKDIsIDMpXCIgcG9pbnRzPVwiMTQgMjIuNSA3IDE1LjI0NTcwNjUgOC45OTk4NTg1NyAxMy4xNzMyODE1IDE0IDE4LjM1NDcxMDQgMjIuOTcyOTg4MyA5IDI1IDExLjEwMDU2MzRcIiBjbGFzcz1cImNoZWNrXCIvPlxuICAgICAgPHBvbHlnb24gY2xhc3M9XCJjYW5jZWxcIiB0cmFuc2Zvcm09XCJ0cmFuc2xhdGUoMiwgMilcIiBwb2ludHM9XCIxOS44ODU2NTE2IDExLjA2MjUgMTYgMTQuOTQ4MTUxNiAxMi4xMDE5NzM3IDExLjA2MjUgMTEuMDYyNSAxMi4xMTQzNDg0IDE0Ljk0ODE1MTYgMTYgMTEuMDYyNSAxOS44OTgwMjYzIDEyLjEwMTk3MzcgMjAuOTM3NSAxNiAxNy4wNTE4NDg0IDE5Ljg4NTY1MTYgMjAuOTM3NSAyMC45Mzc1IDE5Ljg5ODAyNjMgMTcuMDUxODQ4NCAxNiAyMC45Mzc1IDEyXCI+PC9wb2x5Z29uPlxuICA8L3N2Zz5gXG59XG4iLCJjb25zdCBodG1sID0gcmVxdWlyZSgneW8teW8nKVxuY29uc3QgRmlsZUl0ZW0gPSByZXF1aXJlKCcuL0ZpbGVJdGVtJylcbmNvbnN0IEFjdGlvbkJyb3dzZVRhZ2xpbmUgPSByZXF1aXJlKCcuL0FjdGlvbkJyb3dzZVRhZ2xpbmUnKVxuY29uc3QgeyBkYXNoYm9hcmRCZ0ljb24gfSA9IHJlcXVpcmUoJy4vaWNvbnMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICByZXR1cm4gaHRtbGA8dWwgY2xhc3M9XCJVcHB5RGFzaGJvYXJkLWZpbGVzXG4gICAgICAgICAgICAgICAgICAgICAgICAgJHtwcm9wcy50b3RhbEZpbGVDb3VudCA9PT0gMCA/ICdVcHB5RGFzaGJvYXJkLWZpbGVzLS1ub0ZpbGVzJyA6ICcnfVwiPlxuICAgICAgJHtwcm9wcy50b3RhbEZpbGVDb3VudCA9PT0gMFxuICAgICAgID8gaHRtbGA8ZGl2IGNsYXNzPVwiVXBweURhc2hib2FyZC1iZ0ljb25cIj5cbiAgICAgICAgICAke2Rhc2hib2FyZEJnSWNvbigpfVxuICAgICAgICAgIDxoMyBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtZHJvcEZpbGVzVGl0bGVcIj5cbiAgICAgICAgICAgICR7QWN0aW9uQnJvd3NlVGFnbGluZSh7XG4gICAgICAgICAgICAgIGFjcXVpcmVyczogcHJvcHMuYWNxdWlyZXJzLFxuICAgICAgICAgICAgICBjb250YWluZXI6IHByb3BzLmNvbnRhaW5lcixcbiAgICAgICAgICAgICAgaGFuZGxlSW5wdXRDaGFuZ2U6IHByb3BzLmhhbmRsZUlucHV0Q2hhbmdlLFxuICAgICAgICAgICAgICBpMThuOiBwcm9wcy5pMThuXG4gICAgICAgICAgICB9KX1cbiAgICAgICAgICA8L2gzPlxuICAgICAgICAgIDxpbnB1dCBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtaW5wdXRcIiB0eXBlPVwiZmlsZVwiIG5hbWU9XCJmaWxlc1tdXCIgbXVsdGlwbGU9XCJ0cnVlXCJcbiAgICAgICAgICAgICAgICAgb25jaGFuZ2U9JHtwcm9wcy5oYW5kbGVJbnB1dENoYW5nZX0gLz5cbiAgICAgICAgIDwvZGl2PmBcbiAgICAgICA6IG51bGxcbiAgICAgIH1cbiAgICAgICR7T2JqZWN0LmtleXMocHJvcHMuZmlsZXMpLm1hcCgoZmlsZUlEKSA9PiB7XG4gICAgICAgIHJldHVybiBGaWxlSXRlbSh7XG4gICAgICAgICAgZmlsZTogcHJvcHMuZmlsZXNbZmlsZUlEXSxcbiAgICAgICAgICBzaG93RmlsZUNhcmQ6IHByb3BzLnNob3dGaWxlQ2FyZCxcbiAgICAgICAgICBzaG93UHJvZ3Jlc3NEZXRhaWxzOiBwcm9wcy5zaG93UHJvZ3Jlc3NEZXRhaWxzLFxuICAgICAgICAgIGluZm86IHByb3BzLmluZm8sXG4gICAgICAgICAgbG9nOiBwcm9wcy5sb2csXG4gICAgICAgICAgaTE4bjogcHJvcHMuaTE4bixcbiAgICAgICAgICByZW1vdmVGaWxlOiBwcm9wcy5yZW1vdmVGaWxlLFxuICAgICAgICAgIHBhdXNlVXBsb2FkOiBwcm9wcy5wYXVzZVVwbG9hZCxcbiAgICAgICAgICBjYW5jZWxVcGxvYWQ6IHByb3BzLmNhbmNlbFVwbG9hZCxcbiAgICAgICAgICByZXN1bWFibGVVcGxvYWRzOiBwcm9wcy5yZXN1bWFibGVVcGxvYWRzLFxuICAgICAgICAgIGlzV2lkZTogcHJvcHMuaXNXaWRlXG4gICAgICAgIH0pXG4gICAgICB9KX1cbiAgICA8L3VsPmBcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5jb25zdCB0aHJvdHRsZSA9IHJlcXVpcmUoJ2xvZGFzaC50aHJvdHRsZScpXG5cbmZ1bmN0aW9uIHByb2dyZXNzQmFyV2lkdGggKHByb3BzKSB7XG4gIHJldHVybiBwcm9wcy50b3RhbFByb2dyZXNzXG59XG5cbmZ1bmN0aW9uIHByb2dyZXNzRGV0YWlscyAocHJvcHMpIHtcbiAgLy8gY29uc29sZS5sb2coRGF0ZS5ub3coKSlcbiAgcmV0dXJuIGh0bWxgPHNwYW4+JHtwcm9wcy50b3RhbFByb2dyZXNzIHx8IDB9JeODuyR7cHJvcHMuY29tcGxldGV9IC8gJHtwcm9wcy5pblByb2dyZXNzfeODuyR7cHJvcHMudG90YWxVcGxvYWRlZFNpemV9IC8gJHtwcm9wcy50b3RhbFNpemV944O74oaRICR7cHJvcHMudG90YWxTcGVlZH0vc+ODuyR7cHJvcHMudG90YWxFVEF9PC9zcGFuPmBcbn1cblxuY29uc3QgdGhyb3R0bGVkUHJvZ3Jlc3NEZXRhaWxzID0gdGhyb3R0bGUocHJvZ3Jlc3NEZXRhaWxzLCAxMDAwLCB7bGVhZGluZzogdHJ1ZSwgdHJhaWxpbmc6IHRydWV9KVxuLy8gY29uc3QgdGhyb3R0bGVkUHJvZ3Jlc3NCYXJXaWR0aCA9IHRocm90dGxlKHByb2dyZXNzQmFyV2lkdGgsIDMwMCwge2xlYWRpbmc6IHRydWUsIHRyYWlsaW5nOiB0cnVlfSlcblxubW9kdWxlLmV4cG9ydHMgPSAocHJvcHMpID0+IHtcbiAgcHJvcHMgPSBwcm9wcyB8fCB7fVxuXG4gIGNvbnN0IGlzSGlkZGVuID0gcHJvcHMudG90YWxGaWxlQ291bnQgPT09IDAgfHwgIXByb3BzLmlzVXBsb2FkU3RhcnRlZFxuXG4gIHJldHVybiBodG1sYFxuICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkLXN0YXR1c0JhclxuICAgICAgICAgICAgICAgICR7cHJvcHMuaXNBbGxDb21wbGV0ZSA/ICdpcy1jb21wbGV0ZScgOiAnJ31cIlxuICAgICAgICAgICAgICAgIGFyaWEtaGlkZGVuPVwiJHtpc0hpZGRlbn1cIlxuICAgICAgICAgICAgICAgIHRpdGxlPVwiXCI+XG4gICAgICA8cHJvZ3Jlc3Mgc3R5bGU9XCJkaXNwbGF5OiBub25lO1wiIG1pbj1cIjBcIiBtYXg9XCIxMDBcIiB2YWx1ZT1cIiR7cHJvcHMudG90YWxQcm9ncmVzc31cIj48L3Byb2dyZXNzPlxuICAgICAgPGRpdiBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtc3RhdHVzQmFyUHJvZ3Jlc3NcIiBzdHlsZT1cIndpZHRoOiAke3Byb2dyZXNzQmFyV2lkdGgocHJvcHMpfSVcIj48L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkLXN0YXR1c0JhckNvbnRlbnRcIj5cbiAgICAgICAgJHtwcm9wcy5pc1VwbG9hZFN0YXJ0ZWQgJiYgIXByb3BzLmlzQWxsQ29tcGxldGVcbiAgICAgICAgICA/ICFwcm9wcy5pc0FsbFBhdXNlZFxuICAgICAgICAgICAgPyBodG1sYDxzcGFuIHRpdGxlPVwiVXBsb2FkaW5nXCI+JHtwYXVzZVJlc3VtZUJ1dHRvbnMocHJvcHMpfSBVcGxvYWRpbmcuLi4gJHt0aHJvdHRsZWRQcm9ncmVzc0RldGFpbHMocHJvcHMpfTwvc3Bhbj5gXG4gICAgICAgICAgICA6IGh0bWxgPHNwYW4gdGl0bGU9XCJQYXVzZWRcIj4ke3BhdXNlUmVzdW1lQnV0dG9ucyhwcm9wcyl9IFBhdXNlZOODuyR7cHJvcHMudG90YWxQcm9ncmVzc30lPC9zcGFuPmBcbiAgICAgICAgICA6IG51bGxcbiAgICAgICAgICB9XG4gICAgICAgICR7cHJvcHMuaXNBbGxDb21wbGV0ZVxuICAgICAgICAgID8gaHRtbGA8c3BhbiB0aXRsZT1cIkNvbXBsZXRlXCI+PHN2ZyBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtc3RhdHVzQmFyQWN0aW9uIFVwcHlJY29uXCIgd2lkdGg9XCIxOFwiIGhlaWdodD1cIjE3XCIgdmlld0JveD1cIjAgMCAyMyAxN1wiPlxuICAgICAgICAgICAgICA8cGF0aCBkPVwiTTguOTQ0IDE3TDAgNy44NjVsMi41NTUtMi42MSA2LjM5IDYuNTI1TDIwLjQxIDAgMjMgMi42NDV6XCIgLz5cbiAgICAgICAgICAgIDwvc3ZnPlVwbG9hZCBjb21wbGV0ZeODuyR7cHJvcHMudG90YWxQcm9ncmVzc30lPC9zcGFuPmBcbiAgICAgICAgICA6IG51bGxcbiAgICAgICAgfVxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gIGBcbn1cblxuY29uc3QgcGF1c2VSZXN1bWVCdXR0b25zID0gKHByb3BzKSA9PiB7XG4gIGNvbnN0IHRpdGxlID0gcHJvcHMucmVzdW1hYmxlVXBsb2Fkc1xuICAgICAgICAgICAgICAgID8gcHJvcHMuaXNBbGxQYXVzZWRcbiAgICAgICAgICAgICAgICAgID8gJ3Jlc3VtZSB1cGxvYWQnXG4gICAgICAgICAgICAgICAgICA6ICdwYXVzZSB1cGxvYWQnXG4gICAgICAgICAgICAgICAgOiAnY2FuY2VsIHVwbG9hZCdcblxuICByZXR1cm4gaHRtbGA8YnV0dG9uIHRpdGxlPVwiJHt0aXRsZX1cIiBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtc3RhdHVzQmFyQWN0aW9uXCIgdHlwZT1cImJ1dHRvblwiIG9uY2xpY2s9JHsoKSA9PiB0b2dnbGVQYXVzZVJlc3VtZShwcm9wcyl9PlxuICAgICR7cHJvcHMucmVzdW1hYmxlVXBsb2Fkc1xuICAgICAgPyBwcm9wcy5pc0FsbFBhdXNlZFxuICAgICAgICA/IGh0bWxgPHN2ZyBjbGFzcz1cIlVwcHlJY29uXCIgd2lkdGg9XCIxNVwiIGhlaWdodD1cIjE3XCIgdmlld0JveD1cIjAgMCAxMSAxM1wiPlxuICAgICAgICAgIDxwYXRoIGQ9XCJNMS4yNiAxMi41MzRhLjY3LjY3IDAgMCAxLS42NzQuMDEyLjY3LjY3IDAgMCAxLS4zMzYtLjU4M3YtMTFDLjI1LjcyNC4zOC41LjU4Ni4zODJhLjY1OC42NTggMCAwIDEgLjY3My4wMTJsOS4xNjUgNS41YS42Ni42NiAwIDAgMSAuMzI1LjU3LjY2LjY2IDAgMCAxLS4zMjUuNTczbC05LjE2NiA1LjV6XCIgLz5cbiAgICAgICAgPC9zdmc+YFxuICAgICAgICA6IGh0bWxgPHN2ZyBjbGFzcz1cIlVwcHlJY29uXCIgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE3XCIgdmlld0JveD1cIjAgMCAxMiAxM1wiPlxuICAgICAgICAgIDxwYXRoIGQ9XCJNNC44ODguODF2MTEuMzhjMCAuNDQ2LS4zMjQuODEtLjcyMi44MUgyLjcyMkMyLjMyNCAxMyAyIDEyLjYzNiAyIDEyLjE5Vi44MWMwLS40NDYuMzI0LS44MS43MjItLjgxaDEuNDQ0Yy4zOTggMCAuNzIyLjM2NC43MjIuODF6TTkuODg4LjgxdjExLjM4YzAgLjQ0Ni0uMzI0LjgxLS43MjIuODFINy43MjJDNy4zMjQgMTMgNyAxMi42MzYgNyAxMi4xOVYuODFjMC0uNDQ2LjMyNC0uODEuNzIyLS44MWgxLjQ0NGMuMzk4IDAgLjcyMi4zNjQuNzIyLjgxelwiLz5cbiAgICAgICAgPC9zdmc+YFxuICAgICAgOiBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiMTZweFwiIGhlaWdodD1cIjE2cHhcIiB2aWV3Qm94PVwiMCAwIDE5IDE5XCI+XG4gICAgICAgIDxwYXRoIGQ9XCJNMTcuMzE4IDE3LjIzMkw5Ljk0IDkuODU0IDkuNTg2IDkuNWwtLjM1NC4zNTQtNy4zNzggNy4zNzhoLjcwN2wtLjYyLS42MnYuNzA2TDkuMzE4IDkuOTRsLjM1NC0uMzU0LS4zNTQtLjM1NEwxLjk0IDEuODU0di43MDdsLjYyLS42MmgtLjcwNmw3LjM3OCA3LjM3OC4zNTQuMzU0LjM1NC0uMzU0IDcuMzc4LTcuMzc4aC0uNzA3bC42MjIuNjJ2LS43MDZMOS44NTQgOS4yMzJsLS4zNTQuMzU0LjM1NC4zNTQgNy4zNzggNy4zNzguNzA4LS43MDctNy4zOC03LjM3OHYuNzA4bDcuMzgtNy4zOC4zNTMtLjM1My0uMzUzLS4zNTMtLjYyMi0uNjIyLS4zNTMtLjM1My0uMzU0LjM1Mi03LjM3OCA3LjM4aC43MDhMMi41NiAxLjIzIDIuMjA4Ljg4bC0uMzUzLjM1My0uNjIyLjYyLS4zNTMuMzU1LjM1Mi4zNTMgNy4zOCA3LjM4di0uNzA4bC03LjM4IDcuMzgtLjM1My4zNTMuMzUyLjM1My42MjIuNjIyLjM1My4zNTMuMzU0LS4zNTMgNy4zOC03LjM4aC0uNzA4bDcuMzggNy4zOHpcIi8+XG4gICAgICA8L3N2Zz5gXG4gICAgfVxuICA8L2J1dHRvbj5gXG59XG5cbmNvbnN0IHRvZ2dsZVBhdXNlUmVzdW1lID0gKHByb3BzKSA9PiB7XG4gIGlmIChwcm9wcy5pc0FsbENvbXBsZXRlKSByZXR1cm5cblxuICBpZiAoIXByb3BzLnJlc3VtYWJsZVVwbG9hZHMpIHtcbiAgICByZXR1cm4gcHJvcHMuY2FuY2VsQWxsKClcbiAgfVxuXG4gIGlmIChwcm9wcy5pc0FsbFBhdXNlZCkge1xuICAgIHJldHVybiBwcm9wcy5yZXN1bWVBbGwoKVxuICB9XG5cbiAgcmV0dXJuIHByb3BzLnBhdXNlQWxsKClcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5jb25zdCBBY3Rpb25Ccm93c2VUYWdsaW5lID0gcmVxdWlyZSgnLi9BY3Rpb25Ccm93c2VUYWdsaW5lJylcbmNvbnN0IHsgbG9jYWxJY29uIH0gPSByZXF1aXJlKCcuL2ljb25zJylcblxubW9kdWxlLmV4cG9ydHMgPSAocHJvcHMpID0+IHtcbiAgY29uc3QgaXNIaWRkZW4gPSBPYmplY3Qua2V5cyhwcm9wcy5maWxlcykubGVuZ3RoID09PSAwXG5cbiAgaWYgKHByb3BzLmFjcXVpcmVycy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gaHRtbGBcbiAgICAgIDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkVGFic1wiIGFyaWEtaGlkZGVuPVwiJHtpc0hpZGRlbn1cIj5cbiAgICAgICAgPGgzIGNsYXNzPVwiVXBweURhc2hib2FyZFRhYnMtdGl0bGVcIj5cbiAgICAgICAgJHtBY3Rpb25Ccm93c2VUYWdsaW5lKHtcbiAgICAgICAgICBhY3F1aXJlcnM6IHByb3BzLmFjcXVpcmVycyxcbiAgICAgICAgICBjb250YWluZXI6IHByb3BzLmNvbnRhaW5lcixcbiAgICAgICAgICBoYW5kbGVJbnB1dENoYW5nZTogcHJvcHMuaGFuZGxlSW5wdXRDaGFuZ2UsXG4gICAgICAgICAgaTE4bjogcHJvcHMuaTE4blxuICAgICAgICB9KX1cbiAgICAgICAgPC9oMz5cbiAgICAgIDwvZGl2PlxuICAgIGBcbiAgfVxuXG4gIHJldHVybiBodG1sYDxkaXYgY2xhc3M9XCJVcHB5RGFzaGJvYXJkVGFic1wiPlxuICAgIDxuYXY+XG4gICAgICA8dWwgY2xhc3M9XCJVcHB5RGFzaGJvYXJkVGFicy1saXN0XCIgcm9sZT1cInRhYmxpc3RcIj5cbiAgICAgICAgPGxpIGNsYXNzPVwiVXBweURhc2hib2FyZFRhYlwiPlxuICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiVXBweURhc2hib2FyZFRhYi1idG4gVXBweURhc2hib2FyZC1mb2N1c1wiXG4gICAgICAgICAgICAgICAgICByb2xlPVwidGFiXCJcbiAgICAgICAgICAgICAgICAgIHRhYmluZGV4PVwiMFwiXG4gICAgICAgICAgICAgICAgICBvbmNsaWNrPSR7KGV2KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgJHtwcm9wcy5jb250YWluZXJ9IC5VcHB5RGFzaGJvYXJkLWlucHV0YClcbiAgICAgICAgICAgICAgICAgICAgaW5wdXQuY2xpY2soKVxuICAgICAgICAgICAgICAgICAgfX0+XG4gICAgICAgICAgICAke2xvY2FsSWNvbigpfVxuICAgICAgICAgICAgPGg1IGNsYXNzPVwiVXBweURhc2hib2FyZFRhYi1uYW1lXCI+JHtwcm9wcy5pMThuKCdsb2NhbERpc2snKX08L2g1PlxuICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgIDxpbnB1dCBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtaW5wdXRcIiB0eXBlPVwiZmlsZVwiIG5hbWU9XCJmaWxlc1tdXCIgbXVsdGlwbGU9XCJ0cnVlXCJcbiAgICAgICAgICAgICAgICAgb25jaGFuZ2U9JHtwcm9wcy5oYW5kbGVJbnB1dENoYW5nZX0gLz5cbiAgICAgICAgPC9saT5cbiAgICAgICAgJHtwcm9wcy5hY3F1aXJlcnMubWFwKCh0YXJnZXQpID0+IHtcbiAgICAgICAgICByZXR1cm4gaHRtbGA8bGkgY2xhc3M9XCJVcHB5RGFzaGJvYXJkVGFiXCI+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiVXBweURhc2hib2FyZFRhYi1idG5cIlxuICAgICAgICAgICAgICAgICAgICByb2xlPVwidGFiXCJcbiAgICAgICAgICAgICAgICAgICAgdGFiaW5kZXg9XCIwXCJcbiAgICAgICAgICAgICAgICAgICAgYXJpYS1jb250cm9scz1cIlVwcHlEYXNoYm9hcmRDb250ZW50LXBhbmVsLS0ke3RhcmdldC5pZH1cIlxuICAgICAgICAgICAgICAgICAgICBhcmlhLXNlbGVjdGVkPVwiJHt0YXJnZXQuaXNIaWRkZW4gPyAnZmFsc2UnIDogJ3RydWUnfVwiXG4gICAgICAgICAgICAgICAgICAgIG9uY2xpY2s9JHsoKSA9PiBwcm9wcy5zaG93UGFuZWwodGFyZ2V0LmlkKX0+XG4gICAgICAgICAgICAgICR7dGFyZ2V0Lmljb259XG4gICAgICAgICAgICAgIDxoNSBjbGFzcz1cIlVwcHlEYXNoYm9hcmRUYWItbmFtZVwiPiR7dGFyZ2V0Lm5hbWV9PC9oNT5cbiAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgIDwvbGk+YFxuICAgICAgICB9KX1cbiAgICAgIDwvdWw+XG4gICAgPC9uYXY+XG4gIDwvZGl2PmBcbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5jb25zdCB7IHVwbG9hZEljb24gfSA9IHJlcXVpcmUoJy4vaWNvbnMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICBwcm9wcyA9IHByb3BzIHx8IHt9XG5cbiAgcmV0dXJuIGh0bWxgPGJ1dHRvbiBjbGFzcz1cIlVwcHlCdXR0b24tLWNpcmN1bGFyXG4gICAgICAgICAgICAgICAgICAgVXBweUJ1dHRvbi0tYmx1ZVxuICAgICAgICAgICAgICAgICAgIFVwcHlEYXNoYm9hcmQtdXBsb2FkXCJcbiAgICAgICAgICAgICAgICAgdHlwZT1cImJ1dHRvblwiXG4gICAgICAgICAgICAgICAgIHRpdGxlPVwiJHtwcm9wcy5pMThuKCd1cGxvYWRBbGxOZXdGaWxlcycpfVwiXG4gICAgICAgICAgICAgICAgIGFyaWEtbGFiZWw9XCIke3Byb3BzLmkxOG4oJ3VwbG9hZEFsbE5ld0ZpbGVzJyl9XCJcbiAgICAgICAgICAgICAgICAgb25jbGljaz0ke3Byb3BzLnN0YXJ0VXBsb2FkfT5cbiAgICAgICAgICAgICR7dXBsb2FkSWNvbigpfVxuICAgICAgICAgICAgPHN1cCBjbGFzcz1cIlVwcHlEYXNoYm9hcmQtdXBsb2FkQ291bnRcIlxuICAgICAgICAgICAgICAgICB0aXRsZT1cIiR7cHJvcHMuaTE4bignbnVtYmVyT2ZTZWxlY3RlZEZpbGVzJyl9XCJcbiAgICAgICAgICAgICAgICAgYXJpYS1sYWJlbD1cIiR7cHJvcHMuaTE4bignbnVtYmVyT2ZTZWxlY3RlZEZpbGVzJyl9XCI+XG4gICAgICAgICAgICAgICAgICAke3Byb3BzLm5ld0ZpbGVDb3VudH08L3N1cD5cbiAgICA8L2J1dHRvbj5cbiAgYFxufVxuIiwiY29uc3QgeyBpY29uVGV4dCwgaWNvbkZpbGUsIGljb25BdWRpbywgaWNvblZpZGVvLCBpY29uUERGIH0gPSByZXF1aXJlKCcuL2ljb25zJylcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBnZXRJY29uQnlNaW1lIChmaWxlVHlwZUdlbmVyYWwsIGZpbGVUeXBlU3BlY2lmaWMpIHtcbiAgaWYgKGZpbGVUeXBlR2VuZXJhbCA9PT0gJ3RleHQnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbG9yOiAnIzAwMCcsXG4gICAgICBpY29uOiBpY29uVGV4dCgpXG4gICAgfVxuICB9XG5cbiAgaWYgKGZpbGVUeXBlR2VuZXJhbCA9PT0gJ2F1ZGlvJykge1xuICAgIHJldHVybiB7XG4gICAgICBjb2xvcjogJyMxYWJjOWMnLFxuICAgICAgaWNvbjogaWNvbkF1ZGlvKClcbiAgICB9XG4gIH1cblxuICBpZiAoZmlsZVR5cGVHZW5lcmFsID09PSAndmlkZW8nKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbG9yOiAnIzI5ODBiOScsXG4gICAgICBpY29uOiBpY29uVmlkZW8oKVxuICAgIH1cbiAgfVxuXG4gIGlmIChmaWxlVHlwZUdlbmVyYWwgPT09ICdhcHBsaWNhdGlvbicgJiYgZmlsZVR5cGVTcGVjaWZpYyA9PT0gJ3BkZicpIHtcbiAgICByZXR1cm4ge1xuICAgICAgY29sb3I6ICcjZTc0YzNjJyxcbiAgICAgIGljb246IGljb25QREYoKVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgY29sb3I6ICcjMDAwJyxcbiAgICBpY29uOiBpY29uRmlsZSgpXG4gIH1cbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5cbi8vIGh0dHBzOi8vY3NzLXRyaWNrcy5jb20vY3JlYXRpbmctc3ZnLWljb24tc3lzdGVtLXJlYWN0L1xuXG5mdW5jdGlvbiBkZWZhdWx0VGFiSWNvbiAoKSB7XG4gIHJldHVybiBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiMzBcIiBoZWlnaHQ9XCIzMFwiIHZpZXdCb3g9XCIwIDAgMzAgMzBcIj5cbiAgICA8cGF0aCBkPVwiTTE1IDMwYzguMjg0IDAgMTUtNi43MTYgMTUtMTUgMC04LjI4NC02LjcxNi0xNS0xNS0xNUM2LjcxNiAwIDAgNi43MTYgMCAxNWMwIDguMjg0IDYuNzE2IDE1IDE1IDE1em00LjI1OC0xMi42NzZ2Ni44NDZoLTguNDI2di02Ljg0Nkg1LjIwNGw5LjgyLTEyLjM2NCA5LjgyIDEyLjM2NEgxOS4yNnpcIiAvPlxuICA8L3N2Zz5gXG59XG5cbmZ1bmN0aW9uIGljb25Db3B5ICgpIHtcbiAgcmV0dXJuIGh0bWxgPHN2ZyBjbGFzcz1cIlVwcHlJY29uXCIgd2lkdGg9XCI1MVwiIGhlaWdodD1cIjUxXCIgdmlld0JveD1cIjAgMCA1MSA1MVwiPlxuICAgIDxwYXRoIGQ9XCJNMTcuMjEgNDUuNzY1YTUuMzk0IDUuMzk0IDAgMCAxLTcuNjIgMGwtNC4xMi00LjEyMmE1LjM5MyA1LjM5MyAwIDAgMSAwLTcuNjE4bDYuNzc0LTYuNzc1LTIuNDA0LTIuNDA0LTYuNzc1IDYuNzc2Yy0zLjQyNCAzLjQyNy0zLjQyNCA5IDAgMTIuNDI2bDQuMTIgNC4xMjNhOC43NjYgOC43NjYgMCAwIDAgNi4yMTYgMi41N2MyLjI1IDAgNC41LS44NTggNi4yMTQtMi41N2wxMy41NS0xMy41NTJhOC43MiA4LjcyIDAgMCAwIDIuNTc1LTYuMjEzIDguNzMgOC43MyAwIDAgMC0yLjU3NS02LjIxM2wtNC4xMjMtNC4xMi0yLjQwNCAyLjQwNCA0LjEyMyA0LjEyYTUuMzUyIDUuMzUyIDAgMCAxIDEuNTggMy44MWMwIDEuNDM4LS41NjIgMi43OS0xLjU4IDMuODA4bC0xMy41NSAxMy41NXpcIi8+XG4gICAgPHBhdGggZD1cIk00NC4yNTYgMi44NThBOC43MjggOC43MjggMCAwIDAgMzguMDQzLjI4M2gtLjAwMmE4LjczIDguNzMgMCAwIDAtNi4yMTIgMi41NzRsLTEzLjU1IDEzLjU1YTguNzI1IDguNzI1IDAgMCAwLTIuNTc1IDYuMjE0IDguNzMgOC43MyAwIDAgMCAyLjU3NCA2LjIxNmw0LjEyIDQuMTIgMi40MDUtMi40MDMtNC4xMi00LjEyYTUuMzU3IDUuMzU3IDAgMCAxLTEuNTgtMy44MTJjMC0xLjQzNy41NjItMi43OSAxLjU4LTMuODA4bDEzLjU1LTEzLjU1YTUuMzQ4IDUuMzQ4IDAgMCAxIDMuODEtMS41OGMxLjQ0IDAgMi43OTIuNTYyIDMuODEgMS41OGw0LjEyIDQuMTJjMi4xIDIuMSAyLjEgNS41MTggMCA3LjYxN0wzOS4yIDIzLjc3NWwyLjQwNCAyLjQwNCA2Ljc3NS02Ljc3N2MzLjQyNi0zLjQyNyAzLjQyNi05IDAtMTIuNDI2bC00LjEyLTQuMTJ6XCIvPlxuICA8L3N2Zz5gXG59XG5cbmZ1bmN0aW9uIGljb25SZXN1bWUgKCkge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjI1XCIgaGVpZ2h0PVwiMjVcIiB2aWV3Qm94PVwiMCAwIDQ0IDQ0XCI+XG4gICAgPHBvbHlnb24gY2xhc3M9XCJwbGF5XCIgdHJhbnNmb3JtPVwidHJhbnNsYXRlKDYsIDUuNSlcIiBwb2ludHM9XCIxMyAyMS42NjY2NjY3IDEzIDExIDIxIDE2LjMzMzMzMzNcIiAvPlxuICA8L3N2Zz5gXG59XG5cbmZ1bmN0aW9uIGljb25QYXVzZSAoKSB7XG4gIHJldHVybiBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiMjVweFwiIGhlaWdodD1cIjI1cHhcIiB2aWV3Qm94PVwiMCAwIDQ0IDQ0XCI+XG4gICAgPGcgdHJhbnNmb3JtPVwidHJhbnNsYXRlKDE4LCAxNylcIiBjbGFzcz1cInBhdXNlXCI+XG4gICAgICA8cmVjdCB4PVwiMFwiIHk9XCIwXCIgd2lkdGg9XCIyXCIgaGVpZ2h0PVwiMTBcIiByeD1cIjBcIiAvPlxuICAgICAgPHJlY3QgeD1cIjZcIiB5PVwiMFwiIHdpZHRoPVwiMlwiIGhlaWdodD1cIjEwXCIgcng9XCIwXCIgLz5cbiAgICA8L2c+XG4gIDwvc3ZnPmBcbn1cblxuZnVuY3Rpb24gaWNvbkVkaXQgKCkge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjI4XCIgaGVpZ2h0PVwiMjhcIiB2aWV3Qm94PVwiMCAwIDI4IDI4XCI+XG4gICAgPHBhdGggZD1cIk0yNS40MzYgMi41NjZhNy45OCA3Ljk4IDAgMCAwLTIuMDc4LTEuNTFDMjIuNjM4LjcwMyAyMS45MDYuNSAyMS4xOTguNWEzIDMgMCAwIDAtMS4wMjMuMTcgMi40MzYgMi40MzYgMCAwIDAtLjg5My41NjJMMi4yOTIgMTguMjE3LjUgMjcuNWw5LjI4LTEuNzk2IDE2Ljk5LTE2Ljk5Yy4yNTUtLjI1NC40NDQtLjU2LjU2Mi0uODg4YTMgMyAwIDAgMCAuMTctMS4wMjNjMC0uNzA4LS4yMDUtMS40NC0uNTU1LTIuMTZhOCA4IDAgMCAwLTEuNTEtMi4wNzd6TTkuMDEgMjQuMjUybC00LjMxMy44MzRjMC0uMDMuMDA4LS4wNi4wMTItLjA5LjAwNy0uOTQ0LS43NC0xLjcxNS0xLjY3LTEuNzIzLS4wNCAwLS4wNzguMDA3LS4xMTguMDFsLjgzLTQuMjlMMTcuNzIgNS4wMjRsNS4yNjQgNS4yNjRMOS4wMSAyNC4yNTJ6bTE2Ljg0LTE2Ljk2YS44MTguODE4IDAgMCAxLS4xOTQuMzFsLTEuNTcgMS41Ny01LjI2LTUuMjYgMS41Ny0xLjU3YS44Mi44MiAwIDAgMSAuMzEtLjE5NCAxLjQ1IDEuNDUgMCAwIDEgLjQ5Mi0uMDc0Yy4zOTcgMCAuOTE3LjEyNiAxLjQ2OC4zOTcuNTUuMjcgMS4xMy42NzggMS42NTYgMS4yMS41My41My45NCAxLjExIDEuMjA4IDEuNjU1LjI3Mi41NS4zOTcgMS4wNy4zOTMgMS40NjguMDA0LjE5My0uMDI3LjM1OC0uMDc0LjQ4OHpcIiAvPlxuICA8L3N2Zz5gXG59XG5cbmZ1bmN0aW9uIGxvY2FsSWNvbiAoKSB7XG4gIHJldHVybiBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiMjdcIiBoZWlnaHQ9XCIyNVwiIHZpZXdCb3g9XCIwIDAgMjcgMjVcIj5cbiAgICA8cGF0aCBkPVwiTTUuNTg2IDkuMjg4YS4zMTMuMzEzIDAgMCAwIC4yODIuMTc2aDQuODR2My45MjJjMCAxLjUxNCAxLjI1IDIuMjQgMi43OTIgMi4yNCAxLjU0IDAgMi43OS0uNzI2IDIuNzktMi4yNFY5LjQ2NGg0Ljg0Yy4xMjIgMCAuMjMtLjA2OC4yODQtLjE3NmEuMzA0LjMwNCAwIDAgMC0uMDQ2LS4zMjRMMTMuNzM1LjEwNmEuMzE2LjMxNiAwIDAgMC0uNDcyIDBsLTcuNjMgOC44NTdhLjMwMi4zMDIgMCAwIDAtLjA0Ny4zMjV6XCIvPlxuICAgIDxwYXRoIGQ9XCJNMjQuMyA1LjA5M2MtLjIxOC0uNzYtLjU0LTEuMTg3LTEuMjA4LTEuMTg3aC00Ljg1NmwxLjAxOCAxLjE4aDMuOTQ4bDIuMDQzIDExLjAzOGgtNy4xOTN2Mi43MjhIOS4xMTR2LTIuNzI1aC03LjM2bDIuNjYtMTEuMDRoMy4zM2wxLjAxOC0xLjE4SDMuOTA3Yy0uNjY4IDAtMS4wNi40Ni0xLjIxIDEuMTg2TDAgMTYuNDU2djcuMDYyQzAgMjQuMzM4LjY3NiAyNSAxLjUxIDI1aDIzLjk4Yy44MzMgMCAxLjUxLS42NjMgMS41MS0xLjQ4MnYtNy4wNjJMMjQuMyA1LjA5M3pcIi8+XG4gIDwvc3ZnPmBcbn1cblxuZnVuY3Rpb24gY2xvc2VJY29uICgpIHtcbiAgcmV0dXJuIGh0bWxgPHN2ZyBjbGFzcz1cIlVwcHlJY29uXCIgd2lkdGg9XCIxNHB4XCIgaGVpZ2h0PVwiMTRweFwiIHZpZXdCb3g9XCIwIDAgMTkgMTlcIj5cbiAgICA8cGF0aCBkPVwiTTE3LjMxOCAxNy4yMzJMOS45NCA5Ljg1NCA5LjU4NiA5LjVsLS4zNTQuMzU0LTcuMzc4IDcuMzc4aC43MDdsLS42Mi0uNjJ2LjcwNkw5LjMxOCA5Ljk0bC4zNTQtLjM1NC0uMzU0LS4zNTRMMS45NCAxLjg1NHYuNzA3bC42Mi0uNjJoLS43MDZsNy4zNzggNy4zNzguMzU0LjM1NC4zNTQtLjM1NCA3LjM3OC03LjM3OGgtLjcwN2wuNjIyLjYydi0uNzA2TDkuODU0IDkuMjMybC0uMzU0LjM1NC4zNTQuMzU0IDcuMzc4IDcuMzc4LjcwOC0uNzA3LTcuMzgtNy4zNzh2LjcwOGw3LjM4LTcuMzguMzUzLS4zNTMtLjM1My0uMzUzLS42MjItLjYyMi0uMzUzLS4zNTMtLjM1NC4zNTItNy4zNzggNy4zOGguNzA4TDIuNTYgMS4yMyAyLjIwOC44OGwtLjM1My4zNTMtLjYyMi42Mi0uMzUzLjM1NS4zNTIuMzUzIDcuMzggNy4zOHYtLjcwOGwtNy4zOCA3LjM4LS4zNTMuMzUzLjM1Mi4zNTMuNjIyLjYyMi4zNTMuMzUzLjM1NC0uMzUzIDcuMzgtNy4zOGgtLjcwOGw3LjM4IDcuMzh6XCIvPlxuICA8L3N2Zz5gXG59XG5cbmZ1bmN0aW9uIHBsdWdpbkljb24gKCkge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjE2cHhcIiBoZWlnaHQ9XCIxNnB4XCIgdmlld0JveD1cIjAgMCAzMiAzMFwiPlxuICAgICAgPHBhdGggZD1cIk02LjYyMDk4OTQsMTEuMTQ1MTE2MiBDNi42ODIzMDUxLDExLjI3NTE2NjkgNi44MTM3NDI0OCwxMS4zNTcyMTg4IDYuOTU0NjM4MTMsMTEuMzU3MjE4OCBMMTIuNjkyNTQ4MiwxMS4zNTcyMTg4IEwxMi42OTI1NDgyLDE2LjA2MzA0MjcgQzEyLjY5MjU0ODIsMTcuODgwNTA5IDE0LjE3MjYwNDgsMTguNzUgMTYuMDAwMDA4MywxOC43NSBDMTcuODI2MTA3MiwxOC43NSAxOS4zMDc0Njg0LDE3Ljg4MDE4NDcgMTkuMzA3NDY4NCwxNi4wNjMwNDI3IEwxOS4zMDc0Njg0LDExLjM1NzIxODggTDI1LjA0Mzc0NzgsMTEuMzU3MjE4OCBDMjUuMTg3NTc4NywxMS4zNTcyMTg4IDI1LjMxNjQwNjksMTEuMjc1MTY2OSAyNS4zNzkwMjcyLDExLjE0NTExNjIgQzI1LjQzNzA4MTQsMTEuMDE3MzM1OCAyNS40MTcxODY1LDEwLjg2NDI1ODcgMjUuMzI1MjEyOSwxMC43NTYyNjE1IEwxNi4yNzgyMTIsMC4xMjcxMzE4MzcgQzE2LjIwOTM5NDksMC4wNDYzNzcxNzUxIDE2LjEwNjk4NDYsMCAxNS45OTk2ODIyLDAgQzE1Ljg5MTA3NTEsMCAxNS43ODg2NjQ4LDAuMDQ2Mzc3MTc1MSAxNS43MTgyMTcsMC4xMjcxMzE4MzcgTDYuNjc2MTA4MywxMC43NTU5MzcxIEM2LjU4MjUwNDAyLDEwLjg2NDI1ODcgNi41NjI5MzUxOCwxMS4wMTczMzU4IDYuNjIwOTg5NCwxMS4xNDUxMTYyIEw2LjYyMDk4OTQsMTEuMTQ1MTE2MiBaXCIvPlxuICAgICAgPHBhdGggZD1cIk0yOC44MDA4NzIyLDYuMTExNDI2NDUgQzI4LjU0MTc4OTEsNS4xOTgzMTU1NSAyOC4xNTgzMzMxLDQuNjg3NSAyNy4zNjg0ODQ4LDQuNjg3NSBMMjEuNjEyNDQ1NCw0LjY4NzUgTDIyLjgxOTAyMzQsNi4xMDMwNzg3NCBMMjcuNDk4NjcyNSw2LjEwMzA3ODc0IEwyOS45MTk1ODE3LDE5LjM0ODY0NDkgTDIxLjM5NDM4OTEsMTkuMzUwMjUwMiBMMjEuMzk0Mzg5MSwyMi42MjI1NTIgTDEwLjgwMjM0NjEsMjIuNjIyNTUyIEwxMC44MDIzNDYxLDE5LjM1MjQ5NzcgTDIuMDc4MTU3MDIsMTkuMzUzNDYwOSBMNS4yMjk3OTY5OSw2LjEwMzA3ODc0IEw5LjE3ODcxNTI5LDYuMTAzMDc4NzQgTDEwLjM4NDAwMTEsNC42ODc1IEw0LjYzMDg2OTEsNC42ODc1IEMzLjgzOTQwNTU5LDQuNjg3NSAzLjM3NDIxODg4LDUuMjM5MDkwOSAzLjE5ODE1ODY0LDYuMTExNDI2NDUgTDAsMTkuNzQ3MDg3NCBMMCwyOC4yMjEyOTU5IEMwLDI5LjIwNDM5OTIgMC44MDE0Nzc5MzcsMzAgMS43ODg3MDc1MSwzMCBMMzAuMjA5Njc3MywzMCBDMzEuMTk4MTk5LDMwIDMyLDI5LjIwNDM5OTIgMzIsMjguMjIxMjk1OSBMMzIsMTkuNzQ3MDg3NCBMMjguODAwODcyMiw2LjExMTQyNjQ1IEwyOC44MDA4NzIyLDYuMTExNDI2NDUgWlwiLz5cbiAgICA8L3N2Zz5gXG59XG5cbmZ1bmN0aW9uIGNoZWNrSWNvbiAoKSB7XG4gIHJldHVybiBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvbiBVcHB5SWNvbi1jaGVja1wiIHdpZHRoPVwiMTNweFwiIGhlaWdodD1cIjlweFwiIHZpZXdCb3g9XCIwIDAgMTMgOVwiPlxuICAgIDxwb2x5Z29uIHBvaW50cz1cIjUgNy4yOTMgMS4zNTQgMy42NDcgMC42NDYgNC4zNTQgNSA4LjcwNyAxMi4zNTQgMS4zNTQgMTEuNjQ2IDAuNjQ3XCI+PC9wb2x5Z29uPlxuICA8L3N2Zz5gXG59XG5cbmZ1bmN0aW9uIGljb25BdWRpbyAoKSB7XG4gIHJldHVybiBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHZpZXdCb3g9XCIwIDAgNTUgNTVcIj5cbiAgICA8cGF0aCBkPVwiTTUyLjY2LjI1Yy0uMjE2LS4xOS0uNS0uMjc2LS43OS0uMjQybC0zMSA0LjAxYTEgMSAwIDAgMC0uODcuOTkyVjQwLjYyMkMxOC4xNzQgMzguNDI4IDE1LjI3MyAzNyAxMiAzN2MtNS41MTQgMC0xMCA0LjAzNy0xMCA5czQuNDg2IDkgMTAgOSAxMC00LjAzNyAxMC05YzAtLjIzMi0uMDItLjQ2LS4wNC0uNjg3LjAxNC0uMDY1LjA0LS4xMjQuMDQtLjE5MlYxNi4xMmwyOS0zLjc1M3YxOC4yNTdDNDkuMTc0IDI4LjQyOCA0Ni4yNzMgMjcgNDMgMjdjLTUuNTE0IDAtMTAgNC4wMzctMTAgOXM0LjQ4NiA5IDEwIDljNS40NjQgMCA5LjkxMy0zLjk2NiA5Ljk5My04Ljg2NyAwLS4wMTMuMDA3LS4wMjQuMDA3LS4wMzdWMWEuOTk4Ljk5OCAwIDAgMC0uMzQtLjc1ek0xMiA1M2MtNC40MSAwLTgtMy4xNC04LTdzMy41OS03IDgtNyA4IDMuMTQgOCA3LTMuNTkgNy04IDd6bTMxLTEwYy00LjQxIDAtOC0zLjE0LTgtN3MzLjU5LTcgOC03IDggMy4xNCA4IDctMy41OSA3LTggN3pNMjIgMTQuMVY1Ljg5bDI5LTMuNzUzdjguMjFsLTI5IDMuNzU0elwiLz5cbiAgPC9zdmc+YFxufVxuXG5mdW5jdGlvbiBpY29uVmlkZW8gKCkge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB2aWV3Qm94PVwiMCAwIDU4IDU4XCI+XG4gICAgPHBhdGggZD1cIk0zNi41MzcgMjguMTU2bC0xMS03YTEuMDA1IDEuMDA1IDAgMCAwLTEuMDItLjAzM0MyNC4yIDIxLjMgMjQgMjEuNjM1IDI0IDIydjE0YTEgMSAwIDAgMCAxLjUzNy44NDRsMTEtN2ExLjAwMiAxLjAwMiAwIDAgMCAwLTEuNjg4ek0yNiAzNC4xOFYyMy44MkwzNC4xMzcgMjkgMjYgMzQuMTh6XCIvPjxwYXRoIGQ9XCJNNTcgNkgxYTEgMSAwIDAgMC0xIDF2NDRhMSAxIDAgMCAwIDEgMWg1NmExIDEgMCAwIDAgMS0xVjdhMSAxIDAgMCAwLTEtMXpNMTAgMjhIMnYtOWg4djl6bS04IDJoOHY5SDJ2LTl6bTEwIDEwVjhoMzR2NDJIMTJWNDB6bTQ0LTEyaC04di05aDh2OXptLTggMmg4djloLTh2LTl6bTgtMjJ2OWgtOFY4aDh6TTIgOGg4djlIMlY4em0wIDQydi05aDh2OUgyem01NCAwaC04di05aDh2OXpcIi8+XG4gIDwvc3ZnPmBcbn1cblxuZnVuY3Rpb24gaWNvblBERiAoKSB7XG4gIHJldHVybiBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHZpZXdCb3g9XCIwIDAgMzQyIDMzNVwiPlxuICAgIDxwYXRoIGQ9XCJNMzI5LjMzNyAyMjcuODRjLTIuMSAxLjMtOC4xIDIuMS0xMS45IDIuMS0xMi40IDAtMjcuNi01LjctNDkuMS0xNC45IDguMy0uNiAxNS44LS45IDIyLjYtLjkgMTIuNCAwIDE2IDAgMjguMiAzLjEgMTIuMSAzIDEyLjIgOS4zIDEwLjIgMTAuNnptLTIxNS4xIDEuOWM0LjgtOC40IDkuNy0xNy4zIDE0LjctMjYuOCAxMi4yLTIzLjEgMjAtNDEuMyAyNS43LTU2LjIgMTEuNSAyMC45IDI1LjggMzguNiA0Mi41IDUyLjggMi4xIDEuOCA0LjMgMy41IDYuNyA1LjMtMzQuMSA2LjgtNjMuNiAxNS04OS42IDI0Ljl6bTM5LjgtMjE4LjljNi44IDAgMTAuNyAxNy4wNiAxMSAzMy4xNi4zIDE2LTMuNCAyNy4yLTguMSAzNS42LTMuOS0xMi40LTUuNy0zMS44LTUuNy00NC41IDAgMC0uMy0yNC4yNiAyLjgtMjQuMjZ6bS0xMzMuNCAzMDcuMmMzLjktMTAuNSAxOS4xLTMxLjMgNDEuNi00OS44IDEuNC0xLjEgNC45LTQuNCA4LjEtNy40LTIzLjUgMzcuNi0zOS4zIDUyLjUtNDkuNyA1Ny4yem0zMTUuMi0xMTIuM2MtNi44LTYuNy0yMi0xMC4yLTQ1LTEwLjUtMTUuNi0uMi0zNC4zIDEuMi01NC4xIDMuOS04LjgtNS4xLTE3LjktMTAuNi0yNS4xLTE3LjMtMTkuMi0xOC0zNS4yLTQyLjktNDUuMi03MC4zLjYtMi42IDEuMi00LjggMS43LTcuMSAwIDAgMTAuOC02MS41IDcuOS04Mi4zLS40LTIuOS0uNi0zLjctMS40LTUuOWwtLjktMi41Yy0yLjktNi43Ni04LjctMTMuOTYtMTcuOC0xMy41N2wtNS4zLS4xN2gtLjFjLTEwLjEgMC0xOC40IDUuMTctMjAuNSAxMi44NC02LjYgMjQuMy4yIDYwLjUgMTIuNSAxMDcuNGwtMy4yIDcuN2MtOC44IDIxLjQtMTkuOCA0My0yOS41IDYybC0xLjMgMi41Yy0xMC4yIDIwLTE5LjUgMzctMjcuOSA1MS40bC04LjcgNC42Yy0uNi40LTE1LjUgOC4yLTE5IDEwLjMtMjkuNiAxNy43LTQ5LjI4IDM3LjgtNTIuNTQgNTMuOC0xLjA0IDUtLjI2IDExLjUgNS4wMSAxNC42bDguNCA0LjJjMy42MyAxLjggNy41MyAyLjcgMTEuNDMgMi43IDIxLjEgMCA0NS42LTI2LjIgNzkuMy04NS4xIDM5LTEyLjcgODMuNC0yMy4zIDEyMi4zLTI5LjEgMjkuNiAxNi43IDY2IDI4LjMgODkgMjguMyA0LjEgMCA3LjYtLjQgMTAuNS0xLjIgNC40LTEuMSA4LjEtMy42IDEwLjQtNy4xIDQuNC02LjcgNS40LTE1LjkgNC4xLTI1LjQtLjMtMi44LTIuNi02LjMtNS04Ljd6XCIgLz5cbiAgPC9zdmc+YFxufVxuXG5mdW5jdGlvbiBpY29uRmlsZSAoKSB7XG4gIHJldHVybiBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiNDRcIiBoZWlnaHQ9XCI1OFwiIHZpZXdCb3g9XCIwIDAgNDQgNThcIj5cbiAgICA8cGF0aCBkPVwiTTI3LjQzNy41MTdhMSAxIDAgMCAwLS4wOTQuMDNINC4yNUMyLjAzNy41NDguMjE3IDIuMzY4LjIxNyA0LjU4djQ4LjQwNWMwIDIuMjEyIDEuODIgNC4wMyA0LjAzIDQuMDNIMzkuMDNjMi4yMSAwIDQuMDMtMS44MTggNC4wMy00LjAzVjE1LjYxYTEgMSAwIDAgMC0uMDMtLjI4IDEgMSAwIDAgMCAwLS4wOTMgMSAxIDAgMCAwLS4wMy0uMDMyIDEgMSAwIDAgMCAwLS4wMyAxIDEgMCAwIDAtLjAzMi0uMDYzIDEgMSAwIDAgMC0uMDMtLjA2MyAxIDEgMCAwIDAtLjAzMiAwIDEgMSAwIDAgMC0uMDMtLjA2MyAxIDEgMCAwIDAtLjAzMi0uMDMgMSAxIDAgMCAwLS4wMy0uMDYzIDEgMSAwIDAgMC0uMDYzLS4wNjJsLTE0LjU5My0xNGExIDEgMCAwIDAtLjA2Mi0uMDYyQTEgMSAwIDAgMCAyOCAuNzA4YTEgMSAwIDAgMC0uMzc0LS4xNTcgMSAxIDAgMCAwLS4xNTYgMCAxIDEgMCAwIDAtLjAzLS4wM2wtLjAwMy0uMDAzek00LjI1IDIuNTQ3aDIyLjIxOHY5Ljk3YzAgMi4yMSAxLjgyIDQuMDMgNC4wMyA0LjAzaDEwLjU2NHYzNi40MzhhMi4wMiAyLjAyIDAgMCAxLTIuMDMyIDIuMDMySDQuMjVjLTEuMTMgMC0yLjAzMi0uOS0yLjAzMi0yLjAzMlY0LjU4YzAtMS4xMy45MDItMi4wMzIgMi4wMy0yLjAzMnptMjQuMjE4IDEuMzQ1bDEwLjM3NSA5LjkzNy43NS43MThIMzAuNWMtMS4xMyAwLTIuMDMyLS45LTIuMDMyLTIuMDNWMy44OXpcIiAvPlxuICA8L3N2Zz5gXG59XG5cbmZ1bmN0aW9uIGljb25UZXh0ICgpIHtcbiAgcmV0dXJuIGh0bWxgPHN2ZyBjbGFzcz1cIlVwcHlJY29uXCIgdmlld0JveD1cIjAgMCA2NCA2NFwiPlxuICAgIDxwYXRoIGQ9XCJNOCA2NGg0OFYwSDIyLjU4Nkw4IDE0LjU4NlY2NHptNDYtMkgxMFYxNmgxNFYyaDMwdjYwek0xMS40MTQgMTRMMjIgMy40MTRWMTRIMTEuNDE0elwiLz5cbiAgICA8cGF0aCBkPVwiTTMyIDEzaDE0djJIMzJ6TTE4IDIzaDI4djJIMTh6TTE4IDMzaDI4djJIMTh6TTE4IDQzaDI4djJIMTh6TTE4IDUzaDI4djJIMTh6XCIvPlxuICA8L3N2Zz5gXG59XG5cbmZ1bmN0aW9uIHVwbG9hZEljb24gKCkge1xuICByZXR1cm4gaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjM3XCIgaGVpZ2h0PVwiMzNcIiB2aWV3Qm94PVwiMCAwIDM3IDMzXCI+XG4gICAgPHBhdGggZD1cIk0yOS4xMDcgMjQuNWM0LjA3IDAgNy4zOTMtMy4zNTUgNy4zOTMtNy40NDIgMC0zLjk5NC0zLjEwNS03LjMwNy03LjAxMi03LjUwMmwuNDY4LjQxNUMyOS4wMiA0LjUyIDI0LjM0LjUgMTguODg2LjVjLTQuMzQ4IDAtOC4yNyAyLjUyMi0xMC4xMzggNi41MDZsLjQ0Ni0uMjg4QzQuMzk0IDYuNzgyLjUgMTAuNzU4LjUgMTUuNjA4YzAgNC45MjQgMy45MDYgOC44OTIgOC43NiA4Ljg5Mmg0Ljg3MmMuNjM1IDAgMS4wOTUtLjQ2NyAxLjA5NS0xLjEwNCAwLS42MzYtLjQ2LTEuMTAzLTEuMDk1LTEuMTAzSDkuMjZjLTMuNjQ0IDAtNi42My0zLjAzNS02LjYzLTYuNzQ0IDAtMy43MSAyLjkyNi02LjY4NSA2LjU3LTYuNjg1aC45NjRsLjE0LS4yOC4xNzctLjM2MmMxLjQ3Ny0zLjQgNC43NDQtNS41NzYgOC4zNDctNS41NzYgNC41OCAwIDguNDUgMy40NTIgOS4wMSA4LjA3MmwuMDYuNTM2LjA1LjQ0NmgxLjEwMWMyLjg3IDAgNS4yMDQgMi4zNyA1LjIwNCA1LjI5NXMtMi4zMzMgNS4yOTYtNS4yMDQgNS4yOTZoLTYuMDYyYy0uNjM0IDAtMS4wOTQuNDY3LTEuMDk0IDEuMTAzIDAgLjYzNy40NiAxLjEwNCAxLjA5NCAxLjEwNGg2LjEyelwiLz5cbiAgICA8cGF0aCBkPVwiTTIzLjE5NiAxOC45MmwtNC44MjgtNS4yNTgtLjM2Ni0uNC0uMzY4LjM5OC00LjgyOCA1LjE5NmExLjEzIDEuMTMgMCAwIDAgMCAxLjU0NmMuNDI4LjQ2IDEuMTEuNDYgMS41MzcgMGwzLjQ1LTMuNzEtLjg2OC0uMzR2MTUuMDNjMCAuNjQuNDQ1IDEuMTE4IDEuMDc1IDEuMTE4LjYzIDAgMS4wNzUtLjQ4IDEuMDc1LTEuMTJWMTYuMzVsLS44NjcuMzQgMy40NSAzLjcxMmExIDEgMCAwIDAgLjc2Ny4zNDUgMSAxIDAgMCAwIC43Ny0uMzQ1Yy40MTYtLjMzLjQxNi0xLjAzNiAwLTEuNDg1di4wMDN6XCIvPlxuICA8L3N2Zz5gXG59XG5cbmZ1bmN0aW9uIGRhc2hib2FyZEJnSWNvbiAoKSB7XG4gIHJldHVybiBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiNDhcIiBoZWlnaHQ9XCI2OVwiIHZpZXdCb3g9XCIwIDAgNDggNjlcIj5cbiAgICA8cGF0aCBkPVwiTS41IDEuNWg1ek0xMC41IDEuNWg1ek0yMC41IDEuNWg1ek0zMC41MDQgMS41aDV6TTQ1LjUgMTEuNXY1ek00NS41IDIxLjV2NXpNNDUuNSAzMS41djV6TTQ1LjUgNDEuNTAydjV6TTQ1LjUgNTEuNTAydjV6TTQ1LjUgNjEuNXY1ek00NS41IDY2LjUwMmgtNC45OTh6TTM1LjUwMyA2Ni41MDJoLTV6TTI1LjUgNjYuNTAyaC01ek0xNS41IDY2LjUwMmgtNXpNNS41IDY2LjUwMmgtNXpNLjUgNjYuNTAydi01ek0uNSA1Ni41MDJ2LTV6TS41IDQ2LjUwM1Y0MS41ek0uNSAzNi41di01ek0uNSAyNi41di01ek0uNSAxNi41di01ek0uNSA2LjVWMS40OTh6TTQ0LjgwNyAxMUgzNlYyLjE5NXpcIi8+XG4gIDwvc3ZnPmBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGRlZmF1bHRUYWJJY29uLFxuICBpY29uQ29weSxcbiAgaWNvblJlc3VtZSxcbiAgaWNvblBhdXNlLFxuICBpY29uRWRpdCxcbiAgbG9jYWxJY29uLFxuICBjbG9zZUljb24sXG4gIHBsdWdpbkljb24sXG4gIGNoZWNrSWNvbixcbiAgaWNvbkF1ZGlvLFxuICBpY29uVmlkZW8sXG4gIGljb25QREYsXG4gIGljb25GaWxlLFxuICBpY29uVGV4dCxcbiAgdXBsb2FkSWNvbixcbiAgZGFzaGJvYXJkQmdJY29uXG59XG4iLCJjb25zdCBQbHVnaW4gPSByZXF1aXJlKCcuLi9QbHVnaW4nKVxuY29uc3QgVHJhbnNsYXRvciA9IHJlcXVpcmUoJy4uLy4uL2NvcmUvVHJhbnNsYXRvcicpXG5jb25zdCBkcmFnRHJvcCA9IHJlcXVpcmUoJ2RyYWctZHJvcCcpXG5jb25zdCBEYXNoYm9hcmQgPSByZXF1aXJlKCcuL0Rhc2hib2FyZCcpXG5jb25zdCB7IGdldFNwZWVkIH0gPSByZXF1aXJlKCcuLi8uLi9jb3JlL1V0aWxzJylcbmNvbnN0IHsgZ2V0RVRBIH0gPSByZXF1aXJlKCcuLi8uLi9jb3JlL1V0aWxzJylcbmNvbnN0IHsgcHJldHR5RVRBIH0gPSByZXF1aXJlKCcuLi8uLi9jb3JlL1V0aWxzJylcbmNvbnN0IHByZXR0eUJ5dGVzID0gcmVxdWlyZSgncHJldHRpZXItYnl0ZXMnKVxuY29uc3QgeyBkZWZhdWx0VGFiSWNvbiB9ID0gcmVxdWlyZSgnLi9pY29ucycpXG5cbi8qKlxuICogTW9kYWwgRGlhbG9nICYgRGFzaGJvYXJkXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gY2xhc3MgRGFzaGJvYXJkVUkgZXh0ZW5kcyBQbHVnaW4ge1xuICBjb25zdHJ1Y3RvciAoY29yZSwgb3B0cykge1xuICAgIHN1cGVyKGNvcmUsIG9wdHMpXG4gICAgdGhpcy5pZCA9ICdEYXNoYm9hcmRVSSdcbiAgICB0aGlzLnRpdGxlID0gJ0Rhc2hib2FyZCBVSSdcbiAgICB0aGlzLnR5cGUgPSAnb3JjaGVzdHJhdG9yJ1xuXG4gICAgY29uc3QgZGVmYXVsdExvY2FsZSA9IHtcbiAgICAgIHN0cmluZ3M6IHtcbiAgICAgICAgc2VsZWN0VG9VcGxvYWQ6ICdTZWxlY3QgZmlsZXMgdG8gdXBsb2FkJyxcbiAgICAgICAgY2xvc2VNb2RhbDogJ0Nsb3NlIE1vZGFsJyxcbiAgICAgICAgdXBsb2FkOiAnVXBsb2FkJyxcbiAgICAgICAgaW1wb3J0RnJvbTogJ0ltcG9ydCBmaWxlcyBmcm9tJyxcbiAgICAgICAgZGFzaGJvYXJkV2luZG93VGl0bGU6ICdVcHB5IERhc2hib2FyZCBXaW5kb3cgKFByZXNzIGVzY2FwZSB0byBjbG9zZSknLFxuICAgICAgICBkYXNoYm9hcmRUaXRsZTogJ1VwcHkgRGFzaGJvYXJkJyxcbiAgICAgICAgY29weUxpbmtUb0NsaXBib2FyZFN1Y2Nlc3M6ICdMaW5rIGNvcGllZCB0byBjbGlwYm9hcmQuJyxcbiAgICAgICAgY29weUxpbmtUb0NsaXBib2FyZEZhbGxiYWNrOiAnQ29weSB0aGUgVVJMIGJlbG93JyxcbiAgICAgICAgZG9uZTogJ0RvbmUnLFxuICAgICAgICBsb2NhbERpc2s6ICdMb2NhbCBEaXNrJyxcbiAgICAgICAgZHJvcFBhc3RlSW1wb3J0OiAnRHJvcCBmaWxlcyBoZXJlLCBwYXN0ZSwgaW1wb3J0IGZyb20gb25lIG9mIHRoZSBsb2NhdGlvbnMgYWJvdmUgb3InLFxuICAgICAgICBkcm9wUGFzdGU6ICdEcm9wIGZpbGVzIGhlcmUsIHBhc3RlIG9yJyxcbiAgICAgICAgYnJvd3NlOiAnYnJvd3NlJyxcbiAgICAgICAgZmlsZVByb2dyZXNzOiAnRmlsZSBwcm9ncmVzczogdXBsb2FkIHNwZWVkIGFuZCBFVEEnLFxuICAgICAgICBudW1iZXJPZlNlbGVjdGVkRmlsZXM6ICdOdW1iZXIgb2Ygc2VsZWN0ZWQgZmlsZXMnLFxuICAgICAgICB1cGxvYWRBbGxOZXdGaWxlczogJ1VwbG9hZCBhbGwgbmV3IGZpbGVzJ1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgICBjb25zdCBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgIHRhcmdldDogJ2JvZHknLFxuICAgICAgaW5saW5lOiBmYWxzZSxcbiAgICAgIHdpZHRoOiA3NTAsXG4gICAgICBoZWlnaHQ6IDU1MCxcbiAgICAgIHNlbWlUcmFuc3BhcmVudDogZmFsc2UsXG4gICAgICBkZWZhdWx0VGFiSWNvbjogZGVmYXVsdFRhYkljb24oKSxcbiAgICAgIHNob3dQcm9ncmVzc0RldGFpbHM6IGZhbHNlLFxuICAgICAgbG9jYWxlOiBkZWZhdWx0TG9jYWxlXG4gICAgfVxuXG4gICAgLy8gbWVyZ2UgZGVmYXVsdCBvcHRpb25zIHdpdGggdGhlIG9uZXMgc2V0IGJ5IHVzZXJcbiAgICB0aGlzLm9wdHMgPSBPYmplY3QuYXNzaWduKHt9LCBkZWZhdWx0T3B0aW9ucywgb3B0cylcblxuICAgIHRoaXMubG9jYWxlID0gT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdExvY2FsZSwgdGhpcy5vcHRzLmxvY2FsZSlcbiAgICB0aGlzLmxvY2FsZS5zdHJpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdExvY2FsZS5zdHJpbmdzLCB0aGlzLm9wdHMubG9jYWxlLnN0cmluZ3MpXG5cbiAgICB0aGlzLnRyYW5zbGF0b3IgPSBuZXcgVHJhbnNsYXRvcih7bG9jYWxlOiB0aGlzLmxvY2FsZX0pXG4gICAgdGhpcy5jb250YWluZXJXaWR0aCA9IHRoaXMudHJhbnNsYXRvci50cmFuc2xhdGUuYmluZCh0aGlzLnRyYW5zbGF0b3IpXG5cbiAgICB0aGlzLmhpZGVNb2RhbCA9IHRoaXMuaGlkZU1vZGFsLmJpbmQodGhpcylcbiAgICB0aGlzLnNob3dNb2RhbCA9IHRoaXMuc2hvd01vZGFsLmJpbmQodGhpcylcblxuICAgIHRoaXMuYWRkVGFyZ2V0ID0gdGhpcy5hZGRUYXJnZXQuYmluZCh0aGlzKVxuICAgIHRoaXMuYWN0aW9ucyA9IHRoaXMuYWN0aW9ucy5iaW5kKHRoaXMpXG4gICAgdGhpcy5oaWRlQWxsUGFuZWxzID0gdGhpcy5oaWRlQWxsUGFuZWxzLmJpbmQodGhpcylcbiAgICB0aGlzLnNob3dQYW5lbCA9IHRoaXMuc2hvd1BhbmVsLmJpbmQodGhpcylcbiAgICB0aGlzLmluaXRFdmVudHMgPSB0aGlzLmluaXRFdmVudHMuYmluZCh0aGlzKVxuICAgIHRoaXMuaGFuZGxlRHJvcCA9IHRoaXMuaGFuZGxlRHJvcC5iaW5kKHRoaXMpXG4gICAgdGhpcy5wYXVzZUFsbCA9IHRoaXMucGF1c2VBbGwuYmluZCh0aGlzKVxuICAgIHRoaXMucmVzdW1lQWxsID0gdGhpcy5yZXN1bWVBbGwuYmluZCh0aGlzKVxuICAgIHRoaXMuY2FuY2VsQWxsID0gdGhpcy5jYW5jZWxBbGwuYmluZCh0aGlzKVxuICAgIHRoaXMudXBkYXRlRGFzaGJvYXJkRWxXaWR0aCA9IHRoaXMudXBkYXRlRGFzaGJvYXJkRWxXaWR0aC5iaW5kKHRoaXMpXG4gICAgdGhpcy5yZW5kZXIgPSB0aGlzLnJlbmRlci5iaW5kKHRoaXMpXG4gICAgdGhpcy5pbnN0YWxsID0gdGhpcy5pbnN0YWxsLmJpbmQodGhpcylcbiAgfVxuXG4gIGFkZFRhcmdldCAocGx1Z2luKSB7XG4gICAgY29uc3QgY2FsbGVyUGx1Z2luSWQgPSBwbHVnaW4uY29uc3RydWN0b3IubmFtZVxuICAgIGNvbnN0IGNhbGxlclBsdWdpbk5hbWUgPSBwbHVnaW4udGl0bGUgfHwgY2FsbGVyUGx1Z2luSWRcbiAgICBjb25zdCBjYWxsZXJQbHVnaW5JY29uID0gcGx1Z2luLmljb24gfHwgdGhpcy5vcHRzLmRlZmF1bHRUYWJJY29uXG4gICAgY29uc3QgY2FsbGVyUGx1Z2luVHlwZSA9IHBsdWdpbi50eXBlXG5cbiAgICBpZiAoY2FsbGVyUGx1Z2luVHlwZSAhPT0gJ2FjcXVpcmVyJyAmJlxuICAgICAgICBjYWxsZXJQbHVnaW5UeXBlICE9PSAncHJvZ3Jlc3NpbmRpY2F0b3InICYmXG4gICAgICAgIGNhbGxlclBsdWdpblR5cGUgIT09ICdwcmVzZW50ZXInKSB7XG4gICAgICBsZXQgbXNnID0gJ0Vycm9yOiBNb2RhbCBjYW4gb25seSBiZSB1c2VkIGJ5IHBsdWdpbnMgb2YgdHlwZXM6IGFjcXVpcmVyLCBwcm9ncmVzc2luZGljYXRvciwgcHJlc2VudGVyJ1xuICAgICAgdGhpcy5jb3JlLmxvZyhtc2cpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCB0YXJnZXQgPSB7XG4gICAgICBpZDogY2FsbGVyUGx1Z2luSWQsXG4gICAgICBuYW1lOiBjYWxsZXJQbHVnaW5OYW1lLFxuICAgICAgaWNvbjogY2FsbGVyUGx1Z2luSWNvbixcbiAgICAgIHR5cGU6IGNhbGxlclBsdWdpblR5cGUsXG4gICAgICBmb2N1czogcGx1Z2luLmZvY3VzLFxuICAgICAgcmVuZGVyOiBwbHVnaW4ucmVuZGVyLFxuICAgICAgaXNIaWRkZW46IHRydWVcbiAgICB9XG5cbiAgICBjb25zdCBtb2RhbCA9IHRoaXMuY29yZS5nZXRTdGF0ZSgpLm1vZGFsXG4gICAgY29uc3QgbmV3VGFyZ2V0cyA9IG1vZGFsLnRhcmdldHMuc2xpY2UoKVxuICAgIG5ld1RhcmdldHMucHVzaCh0YXJnZXQpXG5cbiAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe1xuICAgICAgbW9kYWw6IE9iamVjdC5hc3NpZ24oe30sIG1vZGFsLCB7XG4gICAgICAgIHRhcmdldHM6IG5ld1RhcmdldHNcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHJldHVybiB0aGlzLm9wdHMudGFyZ2V0XG4gIH1cblxuICBoaWRlQWxsUGFuZWxzICgpIHtcbiAgICBjb25zdCBtb2RhbCA9IHRoaXMuY29yZS5nZXRTdGF0ZSgpLm1vZGFsXG5cbiAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe21vZGFsOiBPYmplY3QuYXNzaWduKHt9LCBtb2RhbCwge1xuICAgICAgYWN0aXZlUGFuZWw6IGZhbHNlXG4gICAgfSl9KVxuICB9XG5cbiAgc2hvd1BhbmVsIChpZCkge1xuICAgIGNvbnN0IG1vZGFsID0gdGhpcy5jb3JlLmdldFN0YXRlKCkubW9kYWxcblxuICAgIGNvbnN0IGFjdGl2ZVBhbmVsID0gbW9kYWwudGFyZ2V0cy5maWx0ZXIoKHRhcmdldCkgPT4ge1xuICAgICAgcmV0dXJuIHRhcmdldC50eXBlID09PSAnYWNxdWlyZXInICYmIHRhcmdldC5pZCA9PT0gaWRcbiAgICB9KVswXVxuXG4gICAgdGhpcy5jb3JlLnNldFN0YXRlKHttb2RhbDogT2JqZWN0LmFzc2lnbih7fSwgbW9kYWwsIHtcbiAgICAgIGFjdGl2ZVBhbmVsOiBhY3RpdmVQYW5lbFxuICAgIH0pfSlcbiAgfVxuXG4gIGhpZGVNb2RhbCAoKSB7XG4gICAgY29uc3QgbW9kYWwgPSB0aGlzLmNvcmUuZ2V0U3RhdGUoKS5tb2RhbFxuXG4gICAgdGhpcy5jb3JlLnNldFN0YXRlKHtcbiAgICAgIG1vZGFsOiBPYmplY3QuYXNzaWduKHt9LCBtb2RhbCwge1xuICAgICAgICBpc0hpZGRlbjogdHJ1ZVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QucmVtb3ZlKCdpcy1VcHB5RGFzaGJvYXJkLW9wZW4nKVxuICB9XG5cbiAgc2hvd01vZGFsICgpIHtcbiAgICBjb25zdCBtb2RhbCA9IHRoaXMuY29yZS5nZXRTdGF0ZSgpLm1vZGFsXG5cbiAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe1xuICAgICAgbW9kYWw6IE9iamVjdC5hc3NpZ24oe30sIG1vZGFsLCB7XG4gICAgICAgIGlzSGlkZGVuOiBmYWxzZVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgLy8gYWRkIGNsYXNzIHRvIGJvZHkgdGhhdCBzZXRzIHBvc2l0aW9uIGZpeGVkXG4gICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKCdpcy1VcHB5RGFzaGJvYXJkLW9wZW4nKVxuICAgIC8vIGZvY3VzIG9uIG1vZGFsIGlubmVyIGJsb2NrXG4gICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLlVwcHlEYXNoYm9hcmQtaW5uZXInKS5mb2N1cygpXG5cbiAgICB0aGlzLnVwZGF0ZURhc2hib2FyZEVsV2lkdGgoKVxuICAgIC8vIHRvIGJlIHN1cmUsIHNvbWV0aW1lcyB3aGVuIHRoZSBmdW5jdGlvbiBydW5zLCBjb250YWluZXIgc2l6ZSBpcyBzdGlsbCAwXG4gICAgc2V0VGltZW91dCh0aGlzLnVwZGF0ZURhc2hib2FyZEVsV2lkdGgsIDMwMClcbiAgfVxuXG4gIGluaXRFdmVudHMgKCkge1xuICAgIC8vIGNvbnN0IGRhc2hib2FyZEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgJHt0aGlzLm9wdHMudGFyZ2V0fSAuVXBweURhc2hib2FyZGApXG5cbiAgICAvLyBNb2RhbCBvcGVuIGJ1dHRvblxuICAgIGNvbnN0IHNob3dNb2RhbFRyaWdnZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHRoaXMub3B0cy50cmlnZ2VyKVxuICAgIGlmICghdGhpcy5vcHRzLmlubGluZSAmJiBzaG93TW9kYWxUcmlnZ2VyKSB7XG4gICAgICBzaG93TW9kYWxUcmlnZ2VyLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5zaG93TW9kYWwpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY29yZS5sb2coJ01vZGFsIHRyaWdnZXIgd2FzbuKAmXQgZm91bmQnKVxuICAgIH1cblxuICAgIC8vIENsb3NlIHRoZSBNb2RhbCBvbiBlc2Mga2V5IHByZXNzXG4gICAgZG9jdW1lbnQuYm9keS5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIChldmVudCkgPT4ge1xuICAgICAgaWYgKGV2ZW50LmtleUNvZGUgPT09IDI3KSB7XG4gICAgICAgIHRoaXMuaGlkZU1vZGFsKClcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gRHJhZyBEcm9wXG4gICAgZHJhZ0Ryb3AodGhpcy5lbCwgKGZpbGVzKSA9PiB7XG4gICAgICB0aGlzLmhhbmRsZURyb3AoZmlsZXMpXG4gICAgfSlcbiAgfVxuXG4gIGFjdGlvbnMgKCkge1xuICAgIGNvbnN0IGJ1cyA9IHRoaXMuY29yZS5idXNcblxuICAgIGJ1cy5vbignY29yZTpmaWxlLWFkZCcsICgpID0+IHtcbiAgICAgIHRoaXMuaGlkZUFsbFBhbmVscygpXG4gICAgfSlcblxuICAgIGJ1cy5vbignZGFzaGJvYXJkOmZpbGUtY2FyZCcsIChmaWxlSWQpID0+IHtcbiAgICAgIGNvbnN0IG1vZGFsID0gdGhpcy5jb3JlLmdldFN0YXRlKCkubW9kYWxcblxuICAgICAgdGhpcy5jb3JlLnNldFN0YXRlKHtcbiAgICAgICAgbW9kYWw6IE9iamVjdC5hc3NpZ24oe30sIG1vZGFsLCB7XG4gICAgICAgICAgZmlsZUNhcmRGb3I6IGZpbGVJZCB8fCBmYWxzZVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHRoaXMudXBkYXRlRGFzaGJvYXJkRWxXaWR0aClcblxuICAgIC8vIGJ1cy5vbignY29yZTpzdWNjZXNzJywgKHVwbG9hZGVkQ291bnQpID0+IHtcbiAgICAvLyAgIGJ1cy5lbWl0KFxuICAgIC8vICAgICAnaW5mb3JtZXInLFxuICAgIC8vICAgICBgJHt0aGlzLmNvcmUuaTE4bignZmlsZXMnLCB7J3NtYXJ0X2NvdW50JzogdXBsb2FkZWRDb3VudH0pfSBzdWNjZXNzZnVsbHkgdXBsb2FkZWQsIFNpciFgLFxuICAgIC8vICAgICAnaW5mbycsXG4gICAgLy8gICAgIDYwMDBcbiAgICAvLyAgIClcbiAgICAvLyB9KVxuICB9XG5cbiAgdXBkYXRlRGFzaGJvYXJkRWxXaWR0aCAoKSB7XG4gICAgY29uc3QgZGFzaGJvYXJkRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuVXBweURhc2hib2FyZC1pbm5lcicpXG4gICAgY29uc3QgY29udGFpbmVyV2lkdGggPSBkYXNoYm9hcmRFbC5vZmZzZXRXaWR0aFxuICAgIGNvbnNvbGUubG9nKGNvbnRhaW5lcldpZHRoKVxuXG4gICAgY29uc3QgbW9kYWwgPSB0aGlzLmNvcmUuZ2V0U3RhdGUoKS5tb2RhbFxuICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7XG4gICAgICBtb2RhbDogT2JqZWN0LmFzc2lnbih7fSwgbW9kYWwsIHtcbiAgICAgICAgY29udGFpbmVyV2lkdGg6IGRhc2hib2FyZEVsLm9mZnNldFdpZHRoXG4gICAgICB9KVxuICAgIH0pXG4gIH1cblxuICBoYW5kbGVEcm9wIChmaWxlcykge1xuICAgIHRoaXMuY29yZS5sb2coJ0FsbCByaWdodCwgc29tZW9uZSBkcm9wcGVkIHNvbWV0aGluZy4uLicpXG5cbiAgICBmaWxlcy5mb3JFYWNoKChmaWxlKSA9PiB7XG4gICAgICB0aGlzLmNvcmUuYnVzLmVtaXQoJ2NvcmU6ZmlsZS1hZGQnLCB7XG4gICAgICAgIHNvdXJjZTogdGhpcy5pZCxcbiAgICAgICAgbmFtZTogZmlsZS5uYW1lLFxuICAgICAgICB0eXBlOiBmaWxlLnR5cGUsXG4gICAgICAgIGRhdGE6IGZpbGVcbiAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIGNhbmNlbEFsbCAoKSB7XG4gICAgdGhpcy5jb3JlLmJ1cy5lbWl0KCdjb3JlOmNhbmNlbC1hbGwnKVxuICB9XG5cbiAgcGF1c2VBbGwgKCkge1xuICAgIHRoaXMuY29yZS5idXMuZW1pdCgnY29yZTpwYXVzZS1hbGwnKVxuICB9XG5cbiAgcmVzdW1lQWxsICgpIHtcbiAgICB0aGlzLmNvcmUuYnVzLmVtaXQoJ2NvcmU6cmVzdW1lLWFsbCcpXG4gIH1cblxuICBnZXRUb3RhbFNwZWVkIChmaWxlcykge1xuICAgIGxldCB0b3RhbFNwZWVkID0gMFxuICAgIGZpbGVzLmZvckVhY2goKGZpbGUpID0+IHtcbiAgICAgIHRvdGFsU3BlZWQgPSB0b3RhbFNwZWVkICsgZ2V0U3BlZWQoZmlsZS5wcm9ncmVzcylcbiAgICB9KVxuICAgIHJldHVybiB0b3RhbFNwZWVkXG4gIH1cblxuICBnZXRUb3RhbEVUQSAoZmlsZXMpIHtcbiAgICBsZXQgdG90YWxTZWNvbmRzID0gMFxuXG4gICAgZmlsZXMuZm9yRWFjaCgoZmlsZSkgPT4ge1xuICAgICAgdG90YWxTZWNvbmRzID0gdG90YWxTZWNvbmRzICsgZ2V0RVRBKGZpbGUucHJvZ3Jlc3MpXG4gICAgfSlcblxuICAgIHJldHVybiB0b3RhbFNlY29uZHNcbiAgfVxuXG4gIHJlbmRlciAoc3RhdGUpIHtcbiAgICBjb25zdCBmaWxlcyA9IHN0YXRlLmZpbGVzXG5cbiAgICBjb25zdCBuZXdGaWxlcyA9IE9iamVjdC5rZXlzKGZpbGVzKS5maWx0ZXIoKGZpbGUpID0+IHtcbiAgICAgIHJldHVybiAhZmlsZXNbZmlsZV0ucHJvZ3Jlc3MudXBsb2FkU3RhcnRlZFxuICAgIH0pXG4gICAgY29uc3QgdXBsb2FkU3RhcnRlZEZpbGVzID0gT2JqZWN0LmtleXMoZmlsZXMpLmZpbHRlcigoZmlsZSkgPT4ge1xuICAgICAgcmV0dXJuIGZpbGVzW2ZpbGVdLnByb2dyZXNzLnVwbG9hZFN0YXJ0ZWRcbiAgICB9KVxuICAgIGNvbnN0IGNvbXBsZXRlRmlsZXMgPSBPYmplY3Qua2V5cyhmaWxlcykuZmlsdGVyKChmaWxlKSA9PiB7XG4gICAgICByZXR1cm4gZmlsZXNbZmlsZV0ucHJvZ3Jlc3MudXBsb2FkQ29tcGxldGVcbiAgICB9KVxuICAgIGNvbnN0IGluUHJvZ3Jlc3NGaWxlcyA9IE9iamVjdC5rZXlzKGZpbGVzKS5maWx0ZXIoKGZpbGUpID0+IHtcbiAgICAgIHJldHVybiAhZmlsZXNbZmlsZV0ucHJvZ3Jlc3MudXBsb2FkQ29tcGxldGUgJiZcbiAgICAgICAgICAgICBmaWxlc1tmaWxlXS5wcm9ncmVzcy51cGxvYWRTdGFydGVkICYmXG4gICAgICAgICAgICAgIWZpbGVzW2ZpbGVdLmlzUGF1c2VkXG4gICAgfSlcblxuICAgIGxldCBpblByb2dyZXNzRmlsZXNBcnJheSA9IFtdXG4gICAgaW5Qcm9ncmVzc0ZpbGVzLmZvckVhY2goKGZpbGUpID0+IHtcbiAgICAgIGluUHJvZ3Jlc3NGaWxlc0FycmF5LnB1c2goZmlsZXNbZmlsZV0pXG4gICAgfSlcblxuICAgIGNvbnN0IHRvdGFsU3BlZWQgPSBwcmV0dHlCeXRlcyh0aGlzLmdldFRvdGFsU3BlZWQoaW5Qcm9ncmVzc0ZpbGVzQXJyYXkpKVxuICAgIGNvbnN0IHRvdGFsRVRBID0gcHJldHR5RVRBKHRoaXMuZ2V0VG90YWxFVEEoaW5Qcm9ncmVzc0ZpbGVzQXJyYXkpKVxuXG4gICAgLy8gdG90YWwgc2l6ZSBhbmQgdXBsb2FkZWQgc2l6ZVxuICAgIGxldCB0b3RhbFNpemUgPSAwXG4gICAgbGV0IHRvdGFsVXBsb2FkZWRTaXplID0gMFxuICAgIGluUHJvZ3Jlc3NGaWxlc0FycmF5LmZvckVhY2goKGZpbGUpID0+IHtcbiAgICAgIHRvdGFsU2l6ZSA9IHRvdGFsU2l6ZSArIChmaWxlLnByb2dyZXNzLmJ5dGVzVG90YWwgfHwgMClcbiAgICAgIHRvdGFsVXBsb2FkZWRTaXplID0gdG90YWxVcGxvYWRlZFNpemUgKyAoZmlsZS5wcm9ncmVzcy5ieXRlc1VwbG9hZGVkIHx8IDApXG4gICAgfSlcbiAgICB0b3RhbFNpemUgPSBwcmV0dHlCeXRlcyh0b3RhbFNpemUpXG4gICAgdG90YWxVcGxvYWRlZFNpemUgPSBwcmV0dHlCeXRlcyh0b3RhbFVwbG9hZGVkU2l6ZSlcblxuICAgIGNvbnN0IGlzQWxsQ29tcGxldGUgPSBzdGF0ZS50b3RhbFByb2dyZXNzID09PSAxMDBcbiAgICBjb25zdCBpc0FsbFBhdXNlZCA9IGluUHJvZ3Jlc3NGaWxlcy5sZW5ndGggPT09IDAgJiYgIWlzQWxsQ29tcGxldGUgJiYgdXBsb2FkU3RhcnRlZEZpbGVzLmxlbmd0aCA+IDBcbiAgICBjb25zdCBpc1VwbG9hZFN0YXJ0ZWQgPSB1cGxvYWRTdGFydGVkRmlsZXMubGVuZ3RoID4gMFxuXG4gICAgY29uc3QgYWNxdWlyZXJzID0gc3RhdGUubW9kYWwudGFyZ2V0cy5maWx0ZXIoKHRhcmdldCkgPT4ge1xuICAgICAgcmV0dXJuIHRhcmdldC50eXBlID09PSAnYWNxdWlyZXInXG4gICAgfSlcblxuICAgIGNvbnN0IHByb2dyZXNzaW5kaWNhdG9ycyA9IHN0YXRlLm1vZGFsLnRhcmdldHMuZmlsdGVyKCh0YXJnZXQpID0+IHtcbiAgICAgIHJldHVybiB0YXJnZXQudHlwZSA9PT0gJ3Byb2dyZXNzaW5kaWNhdG9yJ1xuICAgIH0pXG5cbiAgICBjb25zdCBhZGRGaWxlID0gKGZpbGUpID0+IHtcbiAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2NvcmU6ZmlsZS1hZGQnLCBmaWxlKVxuICAgIH1cblxuICAgIGNvbnN0IHJlbW92ZUZpbGUgPSAoZmlsZUlEKSA9PiB7XG4gICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOmZpbGUtcmVtb3ZlJywgZmlsZUlEKVxuICAgIH1cblxuICAgIGNvbnN0IHN0YXJ0VXBsb2FkID0gKGV2KSA9PiB7XG4gICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOnVwbG9hZCcpXG4gICAgfVxuXG4gICAgY29uc3QgcGF1c2VVcGxvYWQgPSAoZmlsZUlEKSA9PiB7XG4gICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOnVwbG9hZC1wYXVzZScsIGZpbGVJRClcbiAgICB9XG5cbiAgICBjb25zdCBjYW5jZWxVcGxvYWQgPSAoZmlsZUlEKSA9PiB7XG4gICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOnVwbG9hZC1jYW5jZWwnLCBmaWxlSUQpXG4gICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOmZpbGUtcmVtb3ZlJywgZmlsZUlEKVxuICAgIH1cblxuICAgIGNvbnN0IHNob3dGaWxlQ2FyZCA9IChmaWxlSUQpID0+IHtcbiAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2Rhc2hib2FyZDpmaWxlLWNhcmQnLCBmaWxlSUQpXG4gICAgfVxuXG4gICAgY29uc3QgZmlsZUNhcmREb25lID0gKG1ldGEsIGZpbGVJRCkgPT4ge1xuICAgICAgdGhpcy5jb3JlLmVtaXR0ZXIuZW1pdCgnY29yZTp1cGRhdGUtbWV0YScsIG1ldGEsIGZpbGVJRClcbiAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2Rhc2hib2FyZDpmaWxlLWNhcmQnKVxuICAgIH1cblxuICAgIGNvbnN0IGluZm8gPSAodGV4dCwgdHlwZSwgZHVyYXRpb24pID0+IHtcbiAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2luZm9ybWVyJywgdGV4dCwgdHlwZSwgZHVyYXRpb24pXG4gICAgfVxuXG4gICAgY29uc3QgcmVzdW1hYmxlVXBsb2FkcyA9IHRoaXMuY29yZS5nZXRTdGF0ZSgpLmNhcGFiaWxpdGllcy5yZXN1bWFibGVVcGxvYWRzIHx8IGZhbHNlXG5cbiAgICByZXR1cm4gRGFzaGJvYXJkKHtcbiAgICAgIHN0YXRlOiBzdGF0ZSxcbiAgICAgIG1vZGFsOiBzdGF0ZS5tb2RhbCxcbiAgICAgIG5ld0ZpbGVzOiBuZXdGaWxlcyxcbiAgICAgIGZpbGVzOiBmaWxlcyxcbiAgICAgIHRvdGFsRmlsZUNvdW50OiBPYmplY3Qua2V5cyhmaWxlcykubGVuZ3RoLFxuICAgICAgaXNVcGxvYWRTdGFydGVkOiBpc1VwbG9hZFN0YXJ0ZWQsXG4gICAgICBpblByb2dyZXNzOiB1cGxvYWRTdGFydGVkRmlsZXMubGVuZ3RoLFxuICAgICAgY29tcGxldGVGaWxlczogY29tcGxldGVGaWxlcyxcbiAgICAgIGluUHJvZ3Jlc3NGaWxlczogaW5Qcm9ncmVzc0ZpbGVzLFxuICAgICAgdG90YWxTcGVlZDogdG90YWxTcGVlZCxcbiAgICAgIHRvdGFsRVRBOiB0b3RhbEVUQSxcbiAgICAgIHRvdGFsUHJvZ3Jlc3M6IHN0YXRlLnRvdGFsUHJvZ3Jlc3MsXG4gICAgICB0b3RhbFNpemU6IHRvdGFsU2l6ZSxcbiAgICAgIHRvdGFsVXBsb2FkZWRTaXplOiB0b3RhbFVwbG9hZGVkU2l6ZSxcbiAgICAgIGlzQWxsQ29tcGxldGU6IGlzQWxsQ29tcGxldGUsXG4gICAgICBpc0FsbFBhdXNlZDogaXNBbGxQYXVzZWQsXG4gICAgICBhY3F1aXJlcnM6IGFjcXVpcmVycyxcbiAgICAgIGFjdGl2ZVBhbmVsOiBzdGF0ZS5tb2RhbC5hY3RpdmVQYW5lbCxcbiAgICAgIHByb2dyZXNzaW5kaWNhdG9yczogcHJvZ3Jlc3NpbmRpY2F0b3JzLFxuICAgICAgYXV0b1Byb2NlZWQ6IHRoaXMuY29yZS5vcHRzLmF1dG9Qcm9jZWVkLFxuICAgICAgaWQ6IHRoaXMuaWQsXG4gICAgICBjb250YWluZXI6IHRoaXMub3B0cy50YXJnZXQsXG4gICAgICBoaWRlTW9kYWw6IHRoaXMuaGlkZU1vZGFsLFxuICAgICAgc2hvd1Byb2dyZXNzRGV0YWlsczogdGhpcy5vcHRzLnNob3dQcm9ncmVzc0RldGFpbHMsXG4gICAgICBpbmxpbmU6IHRoaXMub3B0cy5pbmxpbmUsXG4gICAgICBzZW1pVHJhbnNwYXJlbnQ6IHRoaXMub3B0cy5zZW1pVHJhbnNwYXJlbnQsXG4gICAgICBvblBhc3RlOiB0aGlzLmhhbmRsZVBhc3RlLFxuICAgICAgc2hvd1BhbmVsOiB0aGlzLnNob3dQYW5lbCxcbiAgICAgIGhpZGVBbGxQYW5lbHM6IHRoaXMuaGlkZUFsbFBhbmVscyxcbiAgICAgIGxvZzogdGhpcy5jb3JlLmxvZyxcbiAgICAgIGJ1czogdGhpcy5jb3JlLmVtaXR0ZXIsXG4gICAgICBpMThuOiB0aGlzLmNvbnRhaW5lcldpZHRoLFxuICAgICAgcGF1c2VBbGw6IHRoaXMucGF1c2VBbGwsXG4gICAgICByZXN1bWVBbGw6IHRoaXMucmVzdW1lQWxsLFxuICAgICAgY2FuY2VsQWxsOiB0aGlzLmNhbmNlbEFsbCxcbiAgICAgIGFkZEZpbGU6IGFkZEZpbGUsXG4gICAgICByZW1vdmVGaWxlOiByZW1vdmVGaWxlLFxuICAgICAgaW5mbzogaW5mbyxcbiAgICAgIG1ldGFGaWVsZHM6IHN0YXRlLm1ldGFGaWVsZHMsXG4gICAgICByZXN1bWFibGVVcGxvYWRzOiByZXN1bWFibGVVcGxvYWRzLFxuICAgICAgc3RhcnRVcGxvYWQ6IHN0YXJ0VXBsb2FkLFxuICAgICAgcGF1c2VVcGxvYWQ6IHBhdXNlVXBsb2FkLFxuICAgICAgY2FuY2VsVXBsb2FkOiBjYW5jZWxVcGxvYWQsXG4gICAgICBmaWxlQ2FyZEZvcjogc3RhdGUubW9kYWwuZmlsZUNhcmRGb3IsXG4gICAgICBzaG93RmlsZUNhcmQ6IHNob3dGaWxlQ2FyZCxcbiAgICAgIGZpbGVDYXJkRG9uZTogZmlsZUNhcmREb25lLFxuICAgICAgdXBkYXRlRGFzaGJvYXJkRWxXaWR0aDogdGhpcy51cGRhdGVEYXNoYm9hcmRFbFdpZHRoLFxuICAgICAgbWF4V2lkdGg6IHRoaXMub3B0cy5tYXhXaWR0aCxcbiAgICAgIG1heEhlaWdodDogdGhpcy5vcHRzLm1heEhlaWdodCxcbiAgICAgIGN1cnJlbnRXaWR0aDogc3RhdGUubW9kYWwuY29udGFpbmVyV2lkdGgsXG4gICAgICBpc1dpZGU6IHN0YXRlLm1vZGFsLmNvbnRhaW5lcldpZHRoID4gNDAwXG4gICAgfSlcbiAgfVxuXG4gIGluc3RhbGwgKCkge1xuICAgIC8vIFNldCBkZWZhdWx0IHN0YXRlIGZvciBNb2RhbFxuICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7bW9kYWw6IHtcbiAgICAgIGlzSGlkZGVuOiB0cnVlLFxuICAgICAgc2hvd0ZpbGVDYXJkOiBmYWxzZSxcbiAgICAgIGFjdGl2ZVBhbmVsOiBmYWxzZSxcbiAgICAgIHRhcmdldHM6IFtdXG4gICAgfX0pXG5cbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLm9wdHMudGFyZ2V0XG4gICAgY29uc3QgcGx1Z2luID0gdGhpc1xuICAgIHRoaXMudGFyZ2V0ID0gdGhpcy5tb3VudCh0YXJnZXQsIHBsdWdpbilcblxuICAgIHRoaXMuaW5pdEV2ZW50cygpXG4gICAgdGhpcy5hY3Rpb25zKClcbiAgfVxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGZvbGRlcjogKCkgPT5cbiAgICBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHN0eWxlPVwid2lkdGg6MTZweDttYXJnaW4tcmlnaHQ6M3B4XCIgdmlld0JveD1cIjAgMCAyNzYuMTU3IDI3Ni4xNTdcIj5cbiAgICAgIDxwYXRoIGQ9XCJNMjczLjA4IDEwMS4zNzhjLTMuMy00LjY1LTguODYtNy4zMi0xNS4yNTQtNy4zMmgtMjQuMzRWNjcuNTljMC0xMC4yLTguMy0xOC41LTE4LjUtMTguNWgtODUuMzIyYy0zLjYzIDAtOS4yOTUtMi44NzUtMTEuNDM2LTUuODA1bC02LjM4Ni04LjczNWMtNC45ODItNi44MTQtMTUuMTA0LTExLjk1NC0yMy41NDYtMTEuOTU0SDU4LjczYy05LjI5MiAwLTE4LjYzOCA2LjYwOC0yMS43MzcgMTUuMzcybC0yLjAzMyA1Ljc1MmMtLjk1OCAyLjcxLTQuNzIgNS4zNy03LjU5NiA1LjM3SDE4LjVDOC4zIDQ5LjA5IDAgNTcuMzkgMCA2Ny41OXYxNjcuMDdjMCAuODg2LjE2IDEuNzMuNDQzIDIuNTIuMTUyIDMuMzA2IDEuMTggNi40MjQgMy4wNTMgOS4wNjQgMy4zIDQuNjUyIDguODYgNy4zMiAxNS4yNTUgNy4zMmgxODguNDg3YzExLjM5NSAwIDIzLjI3LTguNDI1IDI3LjAzNS0xOS4xOGw0MC42NzctMTE2LjE4OGMyLjExLTYuMDM1IDEuNDMtMTIuMTY0LTEuODctMTYuODE2ek0xOC41IDY0LjA4OGg4Ljg2NGM5LjI5NSAwIDE4LjY0LTYuNjA3IDIxLjczOC0xNS4zN2wyLjAzMi01Ljc1Yy45Ni0yLjcxMiA0LjcyMi01LjM3MyA3LjU5Ny01LjM3M2gyOS41NjVjMy42MyAwIDkuMjk1IDIuODc2IDExLjQzNyA1LjgwNmw2LjM4NiA4LjczNWM0Ljk4MiA2LjgxNSAxNS4xMDQgMTEuOTU0IDIzLjU0NiAxMS45NTRoODUuMzIyYzEuODk4IDAgMy41IDEuNjAyIDMuNSAzLjV2MjYuNDdINjkuMzRjLTExLjM5NSAwLTIzLjI3IDguNDIzLTI3LjAzNSAxOS4xNzhMMTUgMTkxLjIzVjY3LjU5YzAtMS44OTggMS42MDMtMy41IDMuNS0zLjV6bTI0Mi4yOSA0OS4xNWwtNDAuNjc2IDExNi4xODhjLTEuNjc0IDQuNzgtNy44MTIgOS4xMzUtMTIuODc3IDkuMTM1SDE4Ljc1Yy0xLjQ0NyAwLTIuNTc2LS4zNzItMy4wMi0uOTk3LS40NDItLjYyNS0uNDIyLTEuODE0LjA1Ny0zLjE4bDQwLjY3Ny0xMTYuMTljMS42NzQtNC43OCA3LjgxMi05LjEzNCAxMi44NzctOS4xMzRoMTg4LjQ4N2MxLjQ0OCAwIDIuNTc3LjM3MiAzLjAyLjk5Ny40NDMuNjI1LjQyMyAxLjgxNC0uMDU2IDMuMTh6XCIvPlxuICA8L3N2Zz5gLFxuICBtdXNpYzogKCkgPT5cbiAgICBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiMTYuMDAwMDAwcHRcIiBoZWlnaHQ9XCIxNi4wMDAwMDBwdFwiIHZpZXdCb3g9XCIwIDAgNDguMDAwMDAwIDQ4LjAwMDAwMFwiXG4gICAgcHJlc2VydmVBc3BlY3RSYXRpbz1cInhNaWRZTWlkIG1lZXRcIj5cbiAgICA8ZyB0cmFuc2Zvcm09XCJ0cmFuc2xhdGUoMC4wMDAwMDAsNDguMDAwMDAwKSBzY2FsZSgwLjEwMDAwMCwtMC4xMDAwMDApXCJcbiAgICBmaWxsPVwiIzUyNTA1MFwiIHN0cm9rZT1cIm5vbmVcIj5cbiAgICA8cGF0aCBkPVwiTTIwOSA0NzMgYzAgLTUgMCAtNTIgMSAtMTA2IDEgLTU0IC0yIC0xMTggLTYgLTE0MyBsLTcgLTQ2IC00NCA1XG4gICAgYy03MyA4IC0xMzMgLTQ2IC0xMzMgLTEyMCAwIC0xNyAtNSAtMzUgLTEwIC0zOCAtMTggLTExIDAgLTI1IDMzIC0yNCAzMCAxIDMwXG4gICAgMSA3IDggLTE1IDQgLTIwIDEwIC0xMyAxNCA2IDQgOSAxNiA2IDI3IC05IDM0IDcgNzAgNDAgOTAgMTcgMTEgMzkgMjAgNDcgMjBcbiAgICA4IDAgLTMgLTkgLTI2IC0xOSAtNDIgLTE5IC01NCAtMzYgLTU0IC03NSAwIC0zNiAzMCAtNTYgODQgLTU2IDQxIDAgNTMgNSA4MlxuICAgIDM0IDE5IDE5IDM0IDMxIDM0IDI3IDAgLTQgLTUgLTEyIC0xMiAtMTkgLTkgLTkgLTEgLTEyIDM5IC0xMiAxMDYgMCAxODMgLTIxXG4gICAgMTIxIC0zMyAtMTcgLTMgLTE0IC01IDEwIC02IDI1IC0xIDMyIDMgMzIgMTcgMCAyNiAtMjAgNDIgLTUxIDQyIC0zOSAwIC00M1xuICAgIDEzIC0xMCAzOCA1NiA0MSA3NiAxMjQgNDUgMTg1IC0yNSA0OCAtNzIgMTA1IC0xMDMgMTIzIC0xNSA5IC0zNiAyOSAtNDcgNDVcbiAgICAtMTcgMjYgLTYzIDQxIC02NSAyMnogbTU2IC00OCBjMTYgLTI0IDMxIC00MiAzNCAtMzkgOSA5IDc5IC02OSA3NCAtODMgLTMgLTdcbiAgICAtMiAtMTMgMyAtMTIgMTggMyAyNSAtMSAxOSAtMTIgLTUgLTcgLTE2IC0yIC0zMyAxMyBsLTI2IDIzIDE2IC0yNSBjMTcgLTI3XG4gICAgMjkgLTkyIDE2IC04NCAtNCAzIC04IC04IC04IC0yNSAwIC0xNiA0IC0zMyAxMCAtMzYgNSAtMyA3IDAgNCA5IC0zIDkgMyAyMFxuICAgIDE1IDI4IDEzIDggMjEgMjQgMjIgNDMgMSAxOCAzIDIzIDYgMTIgMyAtMTAgMiAtMjkgLTEgLTQzIC03IC0yNiAtNjIgLTk0IC03N1xuICAgIC05NCAtMTMgMCAtMTEgMTcgNCAzMiAyMSAxOSA0IDg4IC0yOCAxMTUgLTE0IDEzIC0yMiAyMyAtMTYgMjMgNSAwIDIxIC0xNCAzNVxuICAgIC0zMSAxNCAtMTcgMjYgLTI1IDI2IC0xOSAwIDIxIC02MCA3MiAtNzkgNjcgLTE2IC00IC0xNyAtMSAtOCAzNCA2IDI0IDE0IDM2XG4gICAgMjEgMzIgNiAtMyAxIDUgLTExIDE4IC0xMiAxMyAtMjIgMjkgLTIzIDM0IC0xIDYgLTYgMTcgLTEyIDI1IC02IDEwIC03IC0zOVxuICAgIC00IC0xNDIgbDYgLTE1OCAtMjYgMTAgYy0zMyAxMyAtNDQgMTIgLTIxIC0xIDE3IC0xMCAyNCAtNDQgMTAgLTUyIC01IC0zIC0zOVxuICAgIC04IC03NiAtMTIgLTY4IC03IC02OSAtNyAtNjUgMTcgNCAyOCA2NCA2MCAxMTcgNjIgbDM2IDEgMCAxNTcgYzAgODcgMiAxNTggNVxuICAgIDE1OCAzIDAgMTggLTIwIDM1IC00NXogbTE1IC0xNTkgYzAgLTIgLTcgLTcgLTE2IC0xMCAtOCAtMyAtMTIgLTIgLTkgNCA2IDEwXG4gICAgMjUgMTQgMjUgNnogbTUwIC05MiBjMCAtMTMgLTQgLTI2IC0xMCAtMjkgLTE0IC05IC0xMyAtNDggMiAtNjMgOSAtOSA2IC0xMlxuICAgIC0xNSAtMTIgLTIyIDAgLTI3IDUgLTI3IDI0IDAgMTQgLTQgMjggLTEwIDMxIC0xNSA5IC0xMyAxMDIgMyAxMDggMTggNyA1N1xuICAgIC0zMyA1NyAtNTl6IG0tMTM5IC0xMzUgYy0zMiAtMjYgLTEyMSAtMjUgLTEyMSAyIDAgNiA4IDUgMTkgLTEgMjYgLTE0IDY0IC0xM1xuICAgIDU1IDEgLTQgOCAxIDkgMTYgNCAxMyAtNCAyMCAtMyAxNyAyIC0zIDUgNCAxMCAxNiAxMCAyMiAyIDIyIDIgLTIgLTE4elwiLz5cbiAgICA8cGF0aCBkPVwiTTMzMCAzNDUgYzE5IC0xOSAzNiAtMzUgMzkgLTM1IDMgMCAtMTAgMTYgLTI5IDM1IC0xOSAxOSAtMzYgMzUgLTM5XG4gICAgMzUgLTMgMCAxMCAtMTYgMjkgLTM1elwiLz5cbiAgICA8cGF0aCBkPVwiTTM0OSAxMjMgYy0xMyAtMTYgLTEyIC0xNyA0IC00IDE2IDEzIDIxIDIxIDEzIDIxIC0yIDAgLTEwIC04IC0xN1xuICAgIC0xN3pcIi8+XG4gICAgPHBhdGggZD1cIk0yNDMgMTMgYzE1IC0yIDM5IC0yIDU1IDAgMTUgMiAyIDQgLTI4IDQgLTMwIDAgLTQzIC0yIC0yNyAtNHpcIi8+XG4gICAgPC9nPlxuICAgIDwvc3ZnPmAsXG4gIHBhZ2Vfd2hpdGVfcGljdHVyZTogKCkgPT5cbiAgICBodG1sYFxuICAgIDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiMTYuMDAwMDAwcHRcIiBoZWlnaHQ9XCIxNi4wMDAwMDBwdFwiIHZpZXdCb3g9XCIwIDAgNDguMDAwMDAwIDM2LjAwMDAwMFwiXG4gICAgcHJlc2VydmVBc3BlY3RSYXRpbz1cInhNaWRZTWlkIG1lZXRcIj5cbiAgICA8ZyB0cmFuc2Zvcm09XCJ0cmFuc2xhdGUoMC4wMDAwMDAsMzYuMDAwMDAwKSBzY2FsZSgwLjEwMDAwMCwtMC4xMDAwMDApXCJcbiAgICBmaWxsPVwiIzU2NTU1NVwiIHN0cm9rZT1cIm5vbmVcIj5cbiAgICA8cGF0aCBkPVwiTTAgMTgwIGwwIC0xODAgMjQwIDAgMjQwIDAgMCAxODAgMCAxODAgLTI0MCAwIC0yNDAgMCAwIC0xODB6IG00NzBcbiAgICAwIGwwIC0xNzAgLTIzMCAwIC0yMzAgMCAwIDE3MCAwIDE3MCAyMzAgMCAyMzAgMCAwIC0xNzB6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNDAgMTg1IGwwIC0xMzUgMjAwIDAgMjAwIDAgMCAxMzUgMCAxMzUgLTIwMCAwIC0yMDAgMCAwIC0xMzV6IG0zOTBcbiAgICA1OSBsMCAtNjUgLTI5IDIwIGMtMzcgMjcgLTQ1IDI2IC02NSAtNCAtOSAtMTQgLTIyIC0yNSAtMjggLTI1IC03IDAgLTI0IC0xMlxuICAgIC0zOSAtMjYgLTI2IC0yNSAtMjggLTI1IC01MyAtOSAtMTcgMTEgLTI2IDEzIC0yNiA2IDAgLTcgLTQgLTkgLTEwIC02IC01IDNcbiAgICAtMjIgLTIgLTM3IC0xMiBsLTI4IC0xOCAyMCAyNyBjMTEgMTUgMjYgMjUgMzMgMjMgNiAtMiAxMiAtMSAxMiA0IDAgMTAgLTM3XG4gICAgMjEgLTY1IDIwIC0xNCAtMSAtMTIgLTMgNyAtOCBsMjggLTYgLTUwIC01NSAtNDkgLTU1IDAgMTI2IDEgMTI2IDE4OSAxIDE4OSAyXG4gICAgMCAtNjZ6IG0tMTYgLTczIGMxMSAtMTIgMTQgLTIxIDggLTIxIC02IDAgLTEzIDQgLTE3IDEwIC0zIDUgLTEyIDcgLTE5IDQgLThcbiAgICAtMyAtMTYgMiAtMTkgMTMgLTMgMTEgLTQgNyAtNCAtOSAxIC0xOSA2IC0yNSAxOCAtMjMgMTkgNCA0NiAtMjEgMzUgLTMyIC00XG4gICAgLTQgLTExIC0xIC0xNiA3IC02IDggLTEwIDEwIC0xMCA0IDAgLTYgNyAtMTcgMTUgLTI0IDI0IC0yMCAxMSAtMjQgLTc2IC0yN1xuICAgIC02OSAtMSAtODMgMSAtOTcgMTggLTkgMTAgLTIwIDE5IC0yNSAxOSAtNSAwIC00IC02IDIgLTE0IDE0IC0xNyAtNSAtMjYgLTU1XG4gICAgLTI2IC0zNiAwIC00NiAxNiAtMTcgMjcgMTAgNCAyMiAxMyAyNyAyMiA4IDEzIDEwIDEyIDE3IC00IDcgLTE3IDggLTE4IDggLTJcbiAgICAxIDIzIDExIDIyIDU1IC04IDMzIC0yMiAzNSAtMjMgMjYgLTUgLTkgMTYgLTggMjAgNSAyMCA4IDAgMTUgNSAxNSAxMSAwIDUgLTRcbiAgICA3IC0xMCA0IC01IC0zIC0xMCAtNCAtMTAgLTEgMCA0IDU5IDM2IDY3IDM2IDIgMCAxIC0xMCAtMiAtMjEgLTUgLTE1IC00IC0xOVxuICAgIDUgLTE0IDYgNCA5IDE3IDYgMjggLTEyIDQ5IDI3IDUzIDY4IDh6XCIvPlxuICAgIDxwYXRoIGQ9XCJNMTAwIDI5NiBjMCAtMiA3IC03IDE2IC0xMCA4IC0zIDEyIC0yIDkgNCAtNiAxMCAtMjUgMTQgLTI1IDZ6XCIvPlxuICAgIDxwYXRoIGQ9XCJNMjQzIDI5MyBjOSAtMiAyMyAtMiAzMCAwIDYgMyAtMSA1IC0xOCA1IC0xNiAwIC0yMiAtMiAtMTIgLTV6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNjUgMjgwIGMtMyAtNSAtMiAtMTAgNCAtMTAgNSAwIDEzIDUgMTYgMTAgMyA2IDIgMTAgLTQgMTAgLTUgMCAtMTNcbiAgICAtNCAtMTYgLTEwelwiLz5cbiAgICA8cGF0aCBkPVwiTTE1NSAyNzAgYy0zIC02IDEgLTcgOSAtNCAxOCA3IDIxIDE0IDcgMTQgLTYgMCAtMTMgLTQgLTE2IC0xMHpcIi8+XG4gICAgPHBhdGggZD1cIk0yMzMgMjUyIGMtMTMgLTIgLTIzIC04IC0yMyAtMTMgMCAtNyAtMTIgLTggLTMwIC00IC0yMiA1IC0zMCAzIC0zMFxuICAgIC03IDAgLTEwIC0yIC0xMCAtOSAxIC01IDggLTE5IDEyIC0zNSA5IC0xNCAtMyAtMjcgLTEgLTMwIDQgLTIgNSAtNCA0IC0zIC0zXG4gICAgMiAtNiA2IC0xMCAxMCAtMTAgMyAwIDIwIC00IDM3IC05IDE4IC01IDMyIC01IDM2IDEgMyA2IDEzIDggMjEgNSAxMyAtNSAxMTNcbiAgICAyMSAxMTMgMzAgMCAzIC0xOSAyIC01NyAtNHpcIi8+XG4gICAgPHBhdGggZD1cIk0yNzUgMjIwIGMtMTMgLTYgLTE1IC05IC01IC05IDggMCAyMiA0IDMwIDkgMTggMTIgMiAxMiAtMjUgMHpcIi8+XG4gICAgPHBhdGggZD1cIk0xMzIgMjMgYzU5IC0yIDE1OCAtMiAyMjAgMCA2MiAxIDE0IDMgLTEwNyAzIC0xMjEgMCAtMTcyIC0yIC0xMTNcbiAgICAtM3pcIi8+XG4gICAgPC9nPlxuICAgIDwvc3ZnPmAsXG4gIHdvcmQ6ICgpID0+XG4gICAgaHRtbGA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjE2LjAwMDAwMHB0XCIgaGVpZ2h0PVwiMTYuMDAwMDAwcHRcIiB2aWV3Qm94PVwiMCAwIDQ4LjAwMDAwMCA0OC4wMDAwMDBcIlxuICAgIHByZXNlcnZlQXNwZWN0UmF0aW89XCJ4TWlkWU1pZCBtZWV0XCI+XG4gICAgPGcgdHJhbnNmb3JtPVwidHJhbnNsYXRlKDAuMDAwMDAwLDQ4LjAwMDAwMCkgc2NhbGUoMC4xMDAwMDAsLTAuMTAwMDAwKVwiXG4gICAgZmlsbD1cIiM0MjNkM2RcIiBzdHJva2U9XCJub25lXCI+XG4gICAgPHBhdGggZD1cIk0wIDQ2NiBjMCAtMTUgODcgLTI2IDIxMyAtMjYgbDc3IDAgMCAtMTQwIDAgLTE0MCAtNzcgMCBjLTEwNSAwXG4gICAgLTIxMyAtMTEgLTIxMyAtMjEgMCAtNSAxNSAtOSAzNCAtOSAyNSAwIDMzIC00IDMzIC0xNyAwIC03NCA0IC0xMTMgMTMgLTExMyA2XG4gICAgMCAxMCAzMiAxMCA3NSBsMCA3NSAxMDUgMCAxMDUgMCAwIDE1MCAwIDE1MCAtMTA1IDAgYy04NyAwIC0xMDUgMyAtMTA1IDE1IDBcbiAgICAxMSAtMTIgMTUgLTQ1IDE1IC0zMSAwIC00NSAtNCAtNDUgLTE0elwiLz5cbiAgICA8cGF0aCBkPVwiTTEyMyA0NjggYy0yIC01IDUwIC04IDExNiAtOCBsMTIxIDAgMCAtNTAgYzAgLTQ2IC0yIC01MCAtMjMgLTUwXG4gICAgLTE0IDAgLTI0IC02IC0yNCAtMTUgMCAtOCA0IC0xNSA5IC0xNSA0IDAgOCAtMjAgOCAtNDUgMCAtMjUgLTQgLTQ1IC04IC00NVxuICAgIC01IDAgLTkgLTcgLTkgLTE1IDAgLTkgMTAgLTE1IDI0IC0xNSAyMiAwIDIzIDMgMjMgNzUgbDAgNzUgNTAgMCA1MCAwIDAgLTE3MFxuICAgIDAgLTE3MCAtMTc1IDAgLTE3NSAwIC0yIDYzIGMtMiA1OSAtMiA2MCAtNSAxMyAtMyAtMjcgLTIgLTYwIDIgLTczIGw1IC0yM1xuICAgIDE4MyAyIDE4MiAzIDIgMjE2IGMzIDI3NSAxOSAyNTQgLTE5NCAyNTQgLTg1IDAgLTE1NyAtMyAtMTYwIC03eiBtMzM3IC04NSBjMFxuICAgIC0yIC0xOCAtMyAtMzkgLTMgLTM5IDAgLTM5IDAgLTQzIDQ1IGwtMyA0NCA0MiAtNDEgYzI0IC0yMyA0MyAtNDMgNDMgLTQ1elxuICAgIG0tMTkgNTAgYzE5IC0yMiAyMyAtMjkgOSAtMTggLTM2IDMwIC01MCA0MyAtNTAgNDkgMCAxMSA2IDYgNDEgLTMxelwiLz5cbiAgICA8cGF0aCBkPVwiTTQgMzAwIGMwIC03NCAxIC0xMDUgMyAtNjcgMiAzNyAyIDk3IDAgMTM1IC0yIDM3IC0zIDYgLTMgLTY4elwiLz5cbiAgICA8cGF0aCBkPVwiTTIwIDMwMCBsMCAtMTMxIDEyOCAzIDEyNyAzIDMgMTI4IDMgMTI3IC0xMzEgMCAtMTMwIDAgMCAtMTMweiBtMjUwXG4gICAgMTAwIGMwIC0xNiAtNyAtMjAgLTMzIC0yMCAtMzEgMCAtMzQgLTIgLTM0IC0zMSAwIC0yOCAyIC0zMCAxMyAtMTQgOCAxMCAxMVxuICAgIDIyIDggMjYgLTMgNSAxIDkgOSA5IDExIDAgOSAtMTIgLTEyIC01MCAtMTQgLTI3IC0zMiAtNTAgLTM5IC01MCAtMTUgMCAtMzFcbiAgICAzOCAtMjYgNjMgMiAxMCAtMSAxNSAtOCAxMSAtNiAtNCAtOSAtMSAtNiA2IDIgOCAxMCAxNiAxNiAxOCA4IDIgMTIgLTEwIDEyXG4gICAgLTM4IDAgLTM4IDIgLTQxIDE2IC0yOSA5IDcgMTIgMTUgNyAxNiAtNSAyIC03IDE3IC01IDMzIDQgMjYgMSAzMCAtMjAgMzAgLTE3XG4gICAgMCAtMjkgLTkgLTM5IC0yNyAtMjAgLTQxIC0yMiAtNTAgLTYgLTMwIDE0IDE3IDE1IDE2IDIwIC01IDQgLTEzIDIgLTQwIC0yXG4gICAgLTYwIC05IC0zNyAtOCAtMzggMjAgLTM4IDI2IDAgMzMgOCA2NCA3MCAxOSAzOSAzNyA3MCA0MCA3MCAzIDAgNSAtNDAgNSAtOTBcbiAgICBsMCAtOTAgLTEyMCAwIC0xMjAgMCAwIDEyMCAwIDEyMCAxMjAgMCBjMTEzIDAgMTIwIC0xIDEyMCAtMjB6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNDAgMzcxIGMwIC02IDUgLTEzIDEwIC0xNiA2IC0zIDEwIC0zNSAxMCAtNzEgMCAtNTcgMiAtNjQgMjAgLTY0XG4gICAgMTMgMCAyNyAxNCA0MCA0MCAyNSA0OSAyNSA2MyAwIDMwIC0xOSAtMjUgLTM5IC0yMyAtMjQgMiA1IDcgNyAyMyA2IDM1IC0yIDExXG4gICAgMiAyNCA3IDI4IDIzIDEzIDkgMjUgLTI5IDI1IC0yMiAwIC00MCAtNCAtNDAgLTl6IG01MyAtOSBjLTYgLTQgLTEzIC0yOCAtMTVcbiAgICAtNTIgbC0zIC00NSAtNSA1MyBjLTUgNDcgLTMgNTIgMTUgNTIgMTMgMCAxNiAtMyA4IC04elwiLz5cbiAgICA8cGF0aCBkPVwiTTMxMyAxNjUgYzAgLTkgMTAgLTE1IDI0IC0xNSAxNCAwIDIzIDYgMjMgMTUgMCA5IC05IDE1IC0yMyAxNSAtMTRcbiAgICAwIC0yNCAtNiAtMjQgLTE1elwiLz5cbiAgICA8cGF0aCBkPVwiTTE4MCAxMDUgYzAgLTEyIDE3IC0xNSA5MCAtMTUgNzMgMCA5MCAzIDkwIDE1IDAgMTIgLTE3IDE1IC05MCAxNVxuICAgIC03MyAwIC05MCAtMyAtOTAgLTE1elwiLz5cbiAgICA8L2c+XG4gICAgPC9zdmc+YCxcbiAgcG93ZXJwb2ludDogKCkgPT5cbiAgICBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiMTYuMDAwMDAwcHRcIiBoZWlnaHQ9XCIxNi4wMDAwMDBwdFwiIHZpZXdCb3g9XCIwIDAgMTYuMDAwMDAwIDE2LjAwMDAwMFwiXG4gICAgcHJlc2VydmVBc3BlY3RSYXRpbz1cInhNaWRZTWlkIG1lZXRcIj5cbiAgICA8ZyB0cmFuc2Zvcm09XCJ0cmFuc2xhdGUoMC4wMDAwMDAsMTQ0LjAwMDAwMCkgc2NhbGUoMC4xMDAwMDAsLTAuMTAwMDAwKVwiXG4gICAgZmlsbD1cIiM0OTQ3NDdcIiBzdHJva2U9XCJub25lXCI+XG4gICAgPHBhdGggZD1cIk0wIDEzOTAgbDAgLTUwIDkzIDAgYzUwIDAgMTA5IC0zIDEzMCAtNiBsMzcgLTcgMCA1NyAwIDU2IC0xMzAgMFxuICAgIC0xMzAgMCAwIC01MHpcIi8+XG4gICAgPHBhdGggZD1cIk04NzAgMTQyNSBjMCAtOCAtMTIgLTE4IC0yNyAtMjIgbC0yOCAtNiAzMCAtOSBjMTcgLTUgNzUgLTEwIDEzMFxuICAgIC0xMiA4NiAtMiAxMDAgLTUgOTkgLTE5IDAgLTEwIC0xIC04MCAtMiAtMTU3IGwtMiAtMTQwIC02NSAwIGMtNjAgMCAtODAgLTlcbiAgICAtNTUgLTI1IDggLTUgNyAtMTEgLTEgLTIxIC0xNyAtMjAgMiAtMjUgMTEyIC0yNyBsOTQgLTIgMCA0MCAwIDQwIDEwMCA1IGM1NVxuICAgIDMgMTA0IDMgMTA4IC0xIDggLTYgMTEgLTEwMDggNCAtMTAxNiAtMiAtMiAtMjM2IC00IC01MjAgLTYgLTI4MyAtMSAtNTE5IC01XG4gICAgLTUyMyAtOSAtNCAtNCAtMSAtMTQgNiAtMjMgMTEgLTEzIDgyIC0xNSA1NjEgLTE1IGw1NDkgMCAwIDU3MCBjMCA1NDMgLTEgNTcwXG4gICAgLTE4IDU3MCAtMTAgMCAtNTYgMzkgLTEwMyA4NiAtNDYgNDcgLTkzIDkwIC0xMDQgOTUgLTExIDYgMjIgLTMxIDczIC04MiA1MFxuICAgIC01MCA5MiAtOTUgOTIgLTk5IDAgLTE0IC0yMyAtMTYgLTEzNiAtMTIgbC0xMTEgNCAtNiAxMjQgYy02IDExOSAtNyAxMjYgLTMyXG4gICAgMTQ1IC0xNCAxMiAtMjMgMjUgLTIwIDMwIDQgNSAtMzggOSAtOTkgOSAtODcgMCAtMTA2IC0zIC0xMDYgLTE1elwiLz5cbiAgICA8cGF0aCBkPVwiTTExOTAgMTQyOSBjMCAtMTQgMjI1IC0yMzkgMjM5IC0yMzkgNyAwIDExIDMwIDExIDg1IDAgNzcgLTIgODUgLTE5XG4gICAgODUgLTIxIDAgLTYxIDQ0IC02MSA2NiAwIDExIC0yMCAxNCAtODUgMTQgLTU1IDAgLTg1IC00IC04NSAtMTF6XCIvPlxuICAgIDxwYXRoIGQ9XCJNMjgxIDEzMzEgYy0yNCAtMTYgNyAtMjMgMTI3IC0zMSAxMDAgLTYgMTA3IC03IDQ3IC05IC0zOCAtMSAtMTQyXG4gICAgLTggLTIyOSAtMTQgbC0xNjAgLTEyIC03IC0yOCBjLTEwIC0zNyAtMTYgLTY4MyAtNiAtNjkzIDQgLTQgMTAgLTQgMTUgMCA0IDRcbiAgICA4IDE2NiA5IDM1OSBsMiAzNTIgMzU4IC0zIDM1OCAtMiA1IC0zNTMgYzMgLTE5MyAyIC0zNTYgLTIgLTM2MSAtMyAtNCAtMTM2XG4gICAgLTggLTI5NSAtNyAtMjkwIDIgLTQyMyAtNCAtNDIzIC0yMCAwIC01IDMzIC05IDczIC05IDM5IDAgOTAgLTMgMTExIC03IGwzOVxuICAgIC02IC00NSAtMTggYy0yNiAtMTAgLTkwIC0yMCAtMTUxIC0yNSBsLTEwNyAtNyAwIC0zOCBjMCAtMzUgMyAtMzkgMjQgLTM5IDM2XG4gICAgMCAxMjYgLTQ4IDEyOCAtNjggMSAtOSAyIC00MCAzIC02OSAyIC0yOSA2IC05MSAxMCAtMTM4IGw3IC04NSA0NCAwIDQ0IDAgMFxuICAgIDIxOSAwIDIyMCAzMTEgMSBjMTcyIDAgMzE0IDIgMzE4IDQgNSA0IDYgMzAxIDIgNzU5IGwtMSAxMzcgLTI5NyAwIGMtMTY0IDBcbiAgICAtMzA0IC00IC0zMTIgLTl6XCIvPlxuICAgIDxwYXRoIGQ9XCJNMiA4ODAgYy0xIC0yNzYgMiAtMzc4IDEwIC0zNjAgMTIgMzAgMTEgNjU3IC0yIDcxMCAtNSAyMSAtOCAtMTIxXG4gICAgLTggLTM1MHpcIi8+XG4gICAgPHBhdGggZD1cIk0xNDUgMTE3OCBjLTMgLTggLTQgLTE0MSAtMyAtMjk4IGwzIC0yODUgMjk1IDAgMjk1IDAgMCAyOTUgMCAyOTVcbiAgICAtMjkzIDMgYy0yMzAgMiAtMjk0IDAgLTI5NyAtMTB6IG01NTMgLTI3IGMxMSAtNiAxMyAtNjAgMTEgLTI2MCAtMSAtMTM5IC02XG4gICAgLTI1NCAtOSAtMjU2IC00IC0zIC0xMjQgLTYgLTI2NiAtNyBsLTI1OSAtMyAtMyAyNTUgYy0xIDE0MCAwIDI2MCAzIDI2NyAzIDEwXG4gICAgNjIgMTMgMjU3IDEzIDEzOSAwIDI1OSAtNCAyNjYgLTl6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNDQ1IDEwOTAgbC0yMTAgLTUgLTMgLTM3IC0zIC0zOCAyMjUgMCAyMjYgMCAwIDM0IGMwIDE4IC02IDM3IC0xMlxuICAgIDQyIC03IDUgLTEwNyA3IC0yMjMgNHpcIi8+XG4gICAgPHBhdGggZD1cIk0yOTUgOTQwIGMtMyAtNiAxIC0xMiA5IC0xNSA5IC0zIDIzIC03IDMxIC0xMCAxMCAtMyAxNSAtMTggMTUgLTQ5XG4gICAgMCAtMjUgMyAtNDcgOCAtNDkgMTUgLTkgNDcgMTEgNTIgMzMgOSAzOCAyOCAzNCA0MSAtOCAxMCAtMzUgOSAtNDMgLTcgLTY2XG4gICAgLTIzIC0zMSAtNTEgLTM0IC01NiAtNCAtNCAzMSAtMjYgMzQgLTM4IDQgLTUgLTE0IC0xMiAtMjYgLTE2IC0yNiAtNCAwIC0yMlxuICAgIDE2IC00MSAzNiAtMzMgMzUgLTM0IDQwIC0yOCA4NiA3IDQ4IDYgNTAgLTE2IDQ2IC0xOCAtMiAtMjMgLTkgLTIxIC0yMyAyIC0xMVxuICAgIDMgLTQ5IDMgLTg1IDAgLTcyIDYgLTgzIDYwIC0xMTEgNTcgLTI5IDk1IC0yNSAxNDQgMTUgMzcgMzEgNDYgMzQgODMgMjkgNDBcbiAgICAtNSA0MiAtNSA0MiAyMSAwIDI0IC0zIDI3IC0yNyAyNCAtMjQgLTMgLTI4IDEgLTMxIDI1IC0zIDI0IDAgMjggMjAgMjUgMTMgLTJcbiAgICAyMyAyIDIzIDcgMCA2IC05IDkgLTIwIDggLTEzIC0yIC0yOCA5IC00NCAzMiAtMTMgMTkgLTMxIDM1IC00MSAzNSAtMTAgMCAtMjNcbiAgICA3IC0zMCAxNSAtMTQgMTcgLTEwNSAyMSAtMTE1IDV6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNTIyIDkxOSBjLTI4IC0xMSAtMjAgLTI5IDE0IC0yOSAxNCAwIDI0IDYgMjQgMTQgMCAyMSAtMTEgMjUgLTM4XG4gICAgMTV6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNjIzIDkyMiBjLTUzIC01IC00MyAtMzIgMTIgLTMyIDMyIDAgNDUgNCA0NSAxNCAwIDE3IC0xNiAyMiAtNTcgMTh6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNTk3IDg1NCBjLTEzIC0xNCA2IC0yNCA0NCAtMjQgMjggMCAzOSA0IDM5IDE1IDAgMTEgLTExIDE1IC0zOCAxNVxuICAgIC0yMSAwIC00MiAtMyAtNDUgLTZ6XCIvPlxuICAgIDxwYXRoIGQ9XCJNNTk3IDc5NCBjLTQgLTQgLTcgLTE4IC03IC0zMSAwIC0yMSA0IC0yMyA0NiAtMjMgNDQgMCA0NSAxIDQyIDI4XG4gICAgLTMgMjMgLTggMjcgLTM4IDMwIC0yMCAyIC0zOSAwIC00MyAtNHpcIi8+XG4gICAgPHBhdGggZD1cIk05ODkgODgzIGMtMzQgLTQgLTM3IC02IC0zNyAtMzcgMCAtMzIgMiAtMzQgNDUgLTQwIDI1IC0zIDcyIC02IDEwNFxuICAgIC02IGw1OSAwIDAgNDUgMCA0NSAtNjcgLTIgYy0zOCAtMSAtODQgLTMgLTEwNCAtNXpcIi8+XG4gICAgPHBhdGggZD1cIk05OTMgNzAzIGMtNDIgLTQgLTU0IC0xNSAtMzMgLTI4IDggLTUgOCAtMTEgMCAtMjAgLTE2IC0yMCAtMyAtMjRcbiAgICAxMDQgLTMxIGw5NiAtNyAwIDQ3IDAgNDYgLTYyIC0yIGMtMzUgLTEgLTgyIC0zIC0xMDUgLTV6XCIvPlxuICAgIDxwYXRoIGQ9XCJNMTAwNSA1MjMgYy01MCAtNiAtNTkgLTEyIC00NiAtMjYgOCAtMTAgNyAtMTcgLTEgLTI1IC02IC02IC05IC0xNFxuICAgIC02IC0xNyAzIC0zIDUxIC04IDEwNyAtMTIgbDEwMSAtNiAwIDQ2IDAgNDcgLTYyIC0xIGMtMzUgLTEgLTc2IC00IC05MyAtNnpcIi8+XG4gICAgPHBhdGggZD1cIk01MzcgMzQ0IGMtNCAtNCAtNyAtMjUgLTcgLTQ2IGwwIC0zOCA0NiAwIDQ1IDAgLTMgNDMgYy0zIDQwIC00IDQyXG4gICAgLTM4IDQ1IC0yMCAyIC0zOSAwIC00MyAtNHpcIi8+XG4gICAgPHBhdGggZD1cIk03MTQgMzQxIGMtMiAtMiAtNCAtMjIgLTQgLTQzIGwwIC0zOCAyMjUgMCAyMjUgMCAwIDQ1IDAgNDYgLTIyMSAtM1xuICAgIGMtMTIxIC0yIC0yMjIgLTUgLTIyNSAtN3pcIi8+XG4gICAgPHBhdGggZD1cIk0zMDQgMjA1IGMwIC02NiAxIC05MiAzIC01NyAyIDM0IDIgODggMCAxMjAgLTIgMzEgLTMgMyAtMyAtNjN6XCIvPlxuICAgIDwvZz5cbiAgICA8L3N2Zz5gLFxuICBwYWdlX3doaXRlOiAoKSA9PlxuICAgIGh0bWxgPHN2ZyBjbGFzcz1cIlVwcHlJY29uXCIgd2lkdGg9XCIxNi4wMDAwMDBwdFwiIGhlaWdodD1cIjE2LjAwMDAwMHB0XCIgdmlld0JveD1cIjAgMCA0OC4wMDAwMDAgNDguMDAwMDAwXCJcbiAgICBwcmVzZXJ2ZUFzcGVjdFJhdGlvPVwieE1pZFlNaWQgbWVldFwiPlxuICAgIDxnIHRyYW5zZm9ybT1cInRyYW5zbGF0ZSgwLjAwMDAwMCw0OC4wMDAwMDApIHNjYWxlKDAuMTAwMDAwLC0wLjEwMDAwMClcIlxuICAgIGZpbGw9XCIjMDAwMDAwXCIgc3Ryb2tlPVwibm9uZVwiPlxuICAgIDxwYXRoIGQ9XCJNMjAgMjQwIGMxIC0yMDIgMyAtMjQwIDE2IC0yNDAgMTIgMCAxNCAzOCAxNCAyNDAgMCAyMDggLTIgMjQwIC0xNVxuICAgIDI0MCAtMTMgMCAtMTUgLTMxIC0xNSAtMjQwelwiLz5cbiAgICA8cGF0aCBkPVwiTTc1IDQ3MSBjLTQgLTggMzIgLTExIDExOSAtMTEgbDEyNiAwIDAgLTUwIDAgLTUwIDUwIDAgYzI4IDAgNTAgNVxuICAgIDUwIDEwIDAgNiAtMTggMTAgLTQwIDEwIGwtNDAgMCAwIDQyIDAgNDIgNDMgLTM5IDQyIC00MCAtNDMgNDUgLTQyIDQ1IC0xMjkgM1xuICAgIGMtODUgMiAtMTMxIDAgLTEzNiAtN3pcIi8+XG4gICAgPHBhdGggZD1cIk0zOTggNDM3IGw0MiAtNDMgMCAtMTk3IGMwIC0xNjggMiAtMTk3IDE1IC0xOTcgMTMgMCAxNSAyOSAxNSAxOThcbiAgICBsMCAxOTggLTM2IDQyIGMtMjEgMjUgLTQ0IDQyIC01NyA0MiAtMTggMCAtMTYgLTYgMjEgLTQzelwiLz5cbiAgICA8cGF0aCBkPVwiTTkyIDM1MyBsMiAtODggMyA3OCA0IDc3IDg5IDAgODkgMCA4IC00MiBjOCAtNDMgOSAtNDMgNTUgLTQ2IDQ0IC0zXG4gICAgNDcgLTUgNTEgLTM1IDQgLTMxIDQgLTMxIDUgNiBsMiAzNyAtNTAgMCAtNTAgMCAwIDUwIDAgNTAgLTEwNSAwIC0xMDUgMCAyXG4gICAgLTg3elwiLz5cbiAgICA8cGF0aCBkPVwiTTc1IDEwIGM4IC0xMyAzMzIgLTEzIDM0MCAwIDQgNyAtNTUgMTAgLTE3MCAxMCAtMTE1IDAgLTE3NCAtMyAtMTcwXG4gICAgLTEwelwiLz5cbiAgICA8L2c+XG4gICAgPC9zdmc+YFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcbmNvbnN0IFBsdWdpbiA9IHJlcXVpcmUoJy4uL1BsdWdpbicpXG5cbmNvbnN0IFByb3ZpZGVyID0gcmVxdWlyZSgnLi4vLi4vdXBweS1iYXNlL3NyYy9wbHVnaW5zL1Byb3ZpZGVyJylcblxuY29uc3QgVmlldyA9IHJlcXVpcmUoJy4uLy4uL2dlbmVyaWMtcHJvdmlkZXItdmlld3MvaW5kZXgnKVxuY29uc3QgaWNvbnMgPSByZXF1aXJlKCcuL2ljb25zJylcblxubW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBEcm9wYm94IGV4dGVuZHMgUGx1Z2luIHtcbiAgY29uc3RydWN0b3IgKGNvcmUsIG9wdHMpIHtcbiAgICBzdXBlcihjb3JlLCBvcHRzKVxuICAgIHRoaXMudHlwZSA9ICdhY3F1aXJlcidcbiAgICB0aGlzLmlkID0gJ0Ryb3Bib3gnXG4gICAgdGhpcy50aXRsZSA9ICdEcm9wYm94J1xuICAgIHRoaXMuc3RhdGVJZCA9ICdkcm9wYm94J1xuICAgIHRoaXMuaWNvbiA9IGh0bWxgXG4gICAgICA8c3ZnIGNsYXNzPVwiVXBweUljb25cIiB3aWR0aD1cIjEyOFwiIGhlaWdodD1cIjExOFwiIHZpZXdCb3g9XCIwIDAgMTI4IDExOFwiPlxuICAgICAgICA8cGF0aCBkPVwiTTM4LjE0NS43NzdMMS4xMDggMjQuOTZsMjUuNjA4IDIwLjUwNyAzNy4zNDQtMjMuMDZ6XCIvPlxuICAgICAgICA8cGF0aCBkPVwiTTEuMTA4IDY1Ljk3NWwzNy4wMzcgMjQuMTgzTDY0LjA2IDY4LjUyNWwtMzcuMzQzLTIzLjA2ek02NC4wNiA2OC41MjVsMjUuOTE3IDIxLjYzMyAzNy4wMzYtMjQuMTgzLTI1LjYxLTIwLjUxelwiLz5cbiAgICAgICAgPHBhdGggZD1cIk0xMjcuMDE0IDI0Ljk2TDg5Ljk3Ny43NzYgNjQuMDYgMjIuNDA3bDM3LjM0NSAyMy4wNnpNNjQuMTM2IDczLjE4bC0yNS45OSAyMS41NjctMTEuMTIyLTcuMjYydjguMTQybDM3LjExMiAyMi4yNTYgMzcuMTE0LTIyLjI1NnYtOC4xNDJsLTExLjEyIDcuMjYyelwiLz5cbiAgICAgIDwvc3ZnPlxuICAgIGBcblxuICAgIC8vIHdyaXRpbmcgb3V0IHRoZSBrZXkgZXhwbGljaXRseSBmb3IgcmVhZGFiaWxpdHkgdGhlIGtleSB1c2VkIHRvIHN0b3JlXG4gICAgLy8gdGhlIHByb3ZpZGVyIGluc3RhbmNlIG11c3QgYmUgZXF1YWwgdG8gdGhpcy5pZC5cbiAgICB0aGlzLkRyb3Bib3ggPSBuZXcgUHJvdmlkZXIoe1xuICAgICAgaG9zdDogdGhpcy5vcHRzLmhvc3QsXG4gICAgICBwcm92aWRlcjogJ2Ryb3Bib3gnXG4gICAgfSlcblxuICAgIHRoaXMuZmlsZXMgPSBbXVxuXG4gICAgdGhpcy5vbkF1dGggPSB0aGlzLm9uQXV0aC5iaW5kKHRoaXMpXG4gICAgLy8gVmlzdWFsXG4gICAgdGhpcy5yZW5kZXIgPSB0aGlzLnJlbmRlci5iaW5kKHRoaXMpXG5cbiAgICAvLyBzZXQgZGVmYXVsdCBvcHRpb25zXG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnMgPSB7fVxuXG4gICAgLy8gbWVyZ2UgZGVmYXVsdCBvcHRpb25zIHdpdGggdGhlIG9uZXMgc2V0IGJ5IHVzZXJcbiAgICB0aGlzLm9wdHMgPSBPYmplY3QuYXNzaWduKHt9LCBkZWZhdWx0T3B0aW9ucywgb3B0cylcbiAgfVxuXG4gIGluc3RhbGwgKCkge1xuICAgIHRoaXMudmlldyA9IG5ldyBWaWV3KHRoaXMpXG4gICAgLy8gU2V0IGRlZmF1bHQgc3RhdGVcbiAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe1xuICAgICAgLy8gd3JpdGluZyBvdXQgdGhlIGtleSBleHBsaWNpdGx5IGZvciByZWFkYWJpbGl0eSB0aGUga2V5IHVzZWQgdG8gc3RvcmVcbiAgICAgIC8vIHRoZSBwbHVnaW4gc3RhdGUgbXVzdCBiZSBlcXVhbCB0byB0aGlzLnN0YXRlSWQuXG4gICAgICBkcm9wYm94OiB7XG4gICAgICAgIGF1dGhlbnRpY2F0ZWQ6IGZhbHNlLFxuICAgICAgICBmaWxlczogW10sXG4gICAgICAgIGZvbGRlcnM6IFtdLFxuICAgICAgICBkaXJlY3RvcmllczogW10sXG4gICAgICAgIGFjdGl2ZVJvdzogLTEsXG4gICAgICAgIGZpbHRlcklucHV0OiAnJ1xuICAgICAgfVxuICAgIH0pXG5cbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLm9wdHMudGFyZ2V0XG4gICAgY29uc3QgcGx1Z2luID0gdGhpc1xuICAgIHRoaXMudGFyZ2V0ID0gdGhpcy5tb3VudCh0YXJnZXQsIHBsdWdpbilcblxuICAgIHRoaXNbdGhpcy5pZF0uYXV0aCgpLnRoZW4odGhpcy5vbkF1dGgpLmNhdGNoKHRoaXMudmlldy5oYW5kbGVFcnJvcilcblxuICAgIHJldHVyblxuICB9XG5cbiAgb25BdXRoIChhdXRoZW50aWNhdGVkKSB7XG4gICAgdGhpcy52aWV3LnVwZGF0ZVN0YXRlKHthdXRoZW50aWNhdGVkfSlcbiAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgdGhpcy52aWV3LmdldEZvbGRlcigpXG4gICAgfVxuICB9XG5cbiAgaXNGb2xkZXIgKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbS5pc19kaXJcbiAgfVxuXG4gIGdldEl0ZW1EYXRhIChpdGVtKSB7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIGl0ZW0sIHtzaXplOiBpdGVtLmJ5dGVzfSlcbiAgfVxuXG4gIGdldEl0ZW1JY29uIChpdGVtKSB7XG4gICAgdmFyIGljb24gPSBpY29uc1tpdGVtLmljb25dXG5cbiAgICBpZiAoIWljb24pIHtcbiAgICAgIGlmIChpdGVtLmljb24uc3RhcnRzV2l0aCgnZm9sZGVyJykpIHtcbiAgICAgICAgaWNvbiA9IGljb25zWydmb2xkZXInXVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWNvbiA9IGljb25zWydwYWdlX3doaXRlJ11cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGljb24oKVxuICB9XG5cbiAgZ2V0SXRlbVN1Ykxpc3QgKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbS5jb250ZW50c1xuICB9XG5cbiAgZ2V0SXRlbU5hbWUgKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbS5wYXRoLmxlbmd0aCA+IDEgPyBpdGVtLnBhdGguc3Vic3RyaW5nKDEpIDogaXRlbS5wYXRoXG4gIH1cblxuICBnZXRNaW1lVHlwZSAoaXRlbSkge1xuICAgIHJldHVybiBpdGVtLm1pbWVfdHlwZVxuICB9XG5cbiAgZ2V0SXRlbUlkIChpdGVtKSB7XG4gICAgcmV0dXJuIGl0ZW0ucmV2XG4gIH1cblxuICBnZXRJdGVtUmVxdWVzdFBhdGggKGl0ZW0pIHtcbiAgICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMuZ2V0SXRlbU5hbWUoaXRlbSkpXG4gIH1cblxuICBnZXRJdGVtTW9kaWZpZWREYXRlIChpdGVtKSB7XG4gICAgcmV0dXJuIGl0ZW0ubW9kaWZpZWRcbiAgfVxuXG4gIHJlbmRlciAoc3RhdGUpIHtcbiAgICByZXR1cm4gdGhpcy52aWV3LnJlbmRlcihzdGF0ZSlcbiAgfVxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcbmNvbnN0IFBsdWdpbiA9IHJlcXVpcmUoJy4uL1BsdWdpbicpXG5cbmNvbnN0IFByb3ZpZGVyID0gcmVxdWlyZSgnLi4vLi4vdXBweS1iYXNlL3NyYy9wbHVnaW5zL1Byb3ZpZGVyJylcblxuY29uc3QgVmlldyA9IHJlcXVpcmUoJy4uLy4uL2dlbmVyaWMtcHJvdmlkZXItdmlld3MvaW5kZXgnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNsYXNzIEdvb2dsZSBleHRlbmRzIFBsdWdpbiB7XG4gIGNvbnN0cnVjdG9yIChjb3JlLCBvcHRzKSB7XG4gICAgc3VwZXIoY29yZSwgb3B0cylcbiAgICB0aGlzLnR5cGUgPSAnYWNxdWlyZXInXG4gICAgdGhpcy5pZCA9ICdHb29nbGVEcml2ZSdcbiAgICB0aGlzLnRpdGxlID0gJ0dvb2dsZSBEcml2ZSdcbiAgICB0aGlzLnN0YXRlSWQgPSAnZ29vZ2xlRHJpdmUnXG4gICAgdGhpcy5pY29uID0gaHRtbGBcbiAgICAgIDxzdmcgY2xhc3M9XCJVcHB5SWNvbiBVcHB5TW9kYWxUYWItaWNvblwiIHdpZHRoPVwiMjhcIiBoZWlnaHQ9XCIyOFwiIHZpZXdCb3g9XCIwIDAgMTYgMTZcIj5cbiAgICAgICAgPHBhdGggZD1cIk0yLjk1NSAxNC45M2wyLjY2Ny00LjYySDE2bC0yLjY2NyA0LjYySDIuOTU1em0yLjM3OC00LjYybC0yLjY2NiA0LjYyTDAgMTAuMzFsNS4xOS04Ljk5IDIuNjY2IDQuNjItMi41MjMgNC4zN3ptMTAuNTIzLS4yNWgtNS4zMzNsLTUuMTktOC45OWg1LjMzNGw1LjE5IDguOTl6XCIvPlxuICAgICAgPC9zdmc+XG4gICAgYFxuXG4gICAgLy8gd3JpdGluZyBvdXQgdGhlIGtleSBleHBsaWNpdGx5IGZvciByZWFkYWJpbGl0eSB0aGUga2V5IHVzZWQgdG8gc3RvcmVcbiAgICAvLyB0aGUgcHJvdmlkZXIgaW5zdGFuY2UgbXVzdCBiZSBlcXVhbCB0byB0aGlzLmlkLlxuICAgIHRoaXMuR29vZ2xlRHJpdmUgPSBuZXcgUHJvdmlkZXIoe1xuICAgICAgaG9zdDogdGhpcy5vcHRzLmhvc3QsXG4gICAgICBwcm92aWRlcjogJ2RyaXZlJyxcbiAgICAgIGF1dGhQcm92aWRlcjogJ2dvb2dsZSdcbiAgICB9KVxuXG4gICAgdGhpcy5maWxlcyA9IFtdXG5cbiAgICB0aGlzLm9uQXV0aCA9IHRoaXMub25BdXRoLmJpbmQodGhpcylcbiAgICAvLyBWaXN1YWxcbiAgICB0aGlzLnJlbmRlciA9IHRoaXMucmVuZGVyLmJpbmQodGhpcylcblxuICAgIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgICBjb25zdCBkZWZhdWx0T3B0aW9ucyA9IHt9XG5cbiAgICAvLyBtZXJnZSBkZWZhdWx0IG9wdGlvbnMgd2l0aCB0aGUgb25lcyBzZXQgYnkgdXNlclxuICAgIHRoaXMub3B0cyA9IE9iamVjdC5hc3NpZ24oe30sIGRlZmF1bHRPcHRpb25zLCBvcHRzKVxuICB9XG5cbiAgaW5zdGFsbCAoKSB7XG4gICAgdGhpcy52aWV3ID0gbmV3IFZpZXcodGhpcylcbiAgICAvLyBTZXQgZGVmYXVsdCBzdGF0ZSBmb3IgR29vZ2xlIERyaXZlXG4gICAgdGhpcy5jb3JlLnNldFN0YXRlKHtcbiAgICAgIC8vIHdyaXRpbmcgb3V0IHRoZSBrZXkgZXhwbGljaXRseSBmb3IgcmVhZGFiaWxpdHkgdGhlIGtleSB1c2VkIHRvIHN0b3JlXG4gICAgICAvLyB0aGUgcGx1Z2luIHN0YXRlIG11c3QgYmUgZXF1YWwgdG8gdGhpcy5zdGF0ZUlkLlxuICAgICAgZ29vZ2xlRHJpdmU6IHtcbiAgICAgICAgYXV0aGVudGljYXRlZDogZmFsc2UsXG4gICAgICAgIGZpbGVzOiBbXSxcbiAgICAgICAgZm9sZGVyczogW10sXG4gICAgICAgIGRpcmVjdG9yaWVzOiBbXSxcbiAgICAgICAgYWN0aXZlUm93OiAtMSxcbiAgICAgICAgZmlsdGVySW5wdXQ6ICcnXG4gICAgICB9XG4gICAgfSlcblxuICAgIGNvbnN0IHRhcmdldCA9IHRoaXMub3B0cy50YXJnZXRcbiAgICBjb25zdCBwbHVnaW4gPSB0aGlzXG4gICAgdGhpcy50YXJnZXQgPSB0aGlzLm1vdW50KHRhcmdldCwgcGx1Z2luKVxuXG4gICAgLy8gY2F0Y2ggZXJyb3IgaGVyZS5cbiAgICB0aGlzW3RoaXMuaWRdLmF1dGgoKS50aGVuKHRoaXMub25BdXRoKS5jYXRjaCh0aGlzLnZpZXcuaGFuZGxlRXJyb3IpXG4gICAgcmV0dXJuXG4gIH1cblxuICBvbkF1dGggKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICB0aGlzLnZpZXcudXBkYXRlU3RhdGUoe2F1dGhlbnRpY2F0ZWR9KVxuICAgIGlmIChhdXRoZW50aWNhdGVkKSB7XG4gICAgICB0aGlzLnZpZXcuZ2V0Rm9sZGVyKCdyb290JylcbiAgICB9XG4gIH1cblxuICBpc0ZvbGRlciAoaXRlbSkge1xuICAgIHJldHVybiBpdGVtLm1pbWVUeXBlID09PSAnYXBwbGljYXRpb24vdm5kLmdvb2dsZS1hcHBzLmZvbGRlcidcbiAgfVxuXG4gIGdldEl0ZW1EYXRhIChpdGVtKSB7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe30sIGl0ZW0sIHtzaXplOiBwYXJzZUZsb2F0KGl0ZW0uZmlsZVNpemUpfSlcbiAgfVxuXG4gIGdldEl0ZW1JY29uIChpdGVtKSB7XG4gICAgcmV0dXJuIGh0bWxgPGltZyBzcmM9JHtpdGVtLmljb25MaW5rfS8+YFxuICB9XG5cbiAgZ2V0SXRlbVN1Ykxpc3QgKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbS5pdGVtc1xuICB9XG5cbiAgZ2V0SXRlbU5hbWUgKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbS50aXRsZSA/IGl0ZW0udGl0bGUgOiAnLydcbiAgfVxuXG4gIGdldE1pbWVUeXBlIChpdGVtKSB7XG4gICAgcmV0dXJuIGl0ZW0ubWltZVR5cGVcbiAgfVxuXG4gIGdldEl0ZW1JZCAoaXRlbSkge1xuICAgIHJldHVybiBpdGVtLmlkXG4gIH1cblxuICBnZXRJdGVtUmVxdWVzdFBhdGggKGl0ZW0pIHtcbiAgICByZXR1cm4gdGhpcy5nZXRJdGVtSWQoaXRlbSlcbiAgfVxuXG4gIGdldEl0ZW1Nb2RpZmllZERhdGUgKGl0ZW0pIHtcbiAgICByZXR1cm4gaXRlbS5tb2RpZmllZEJ5TWVEYXRlXG4gIH1cblxuICByZW5kZXIgKHN0YXRlKSB7XG4gICAgcmV0dXJuIHRoaXMudmlldy5yZW5kZXIoc3RhdGUpXG4gIH1cbn1cbiIsImNvbnN0IFBsdWdpbiA9IHJlcXVpcmUoJy4vUGx1Z2luJylcbmNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5cbi8qKlxuICogSW5mb3JtZXJcbiAqIFNob3dzIHJhZCBtZXNzYWdlIGJ1YmJsZXNcbiAqIHVzZWQgbGlrZSB0aGlzOiBgYnVzLmVtaXQoJ2luZm9ybWVyJywgJ2hlbGxvIHdvcmxkJywgJ2luZm8nLCA1MDAwKWBcbiAqIG9yIGZvciBlcnJvcnM6IGBidXMuZW1pdCgnaW5mb3JtZXInLCAnRXJyb3IgdXBsb2FkaW5nIGltZy5qcGcnLCAnZXJyb3InLCA1MDAwKWBcbiAqXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gY2xhc3MgSW5mb3JtZXIgZXh0ZW5kcyBQbHVnaW4ge1xuICBjb25zdHJ1Y3RvciAoY29yZSwgb3B0cykge1xuICAgIHN1cGVyKGNvcmUsIG9wdHMpXG4gICAgdGhpcy50eXBlID0gJ3Byb2dyZXNzaW5kaWNhdG9yJ1xuICAgIHRoaXMuaWQgPSAnSW5mb3JtZXInXG4gICAgdGhpcy50aXRsZSA9ICdJbmZvcm1lcidcbiAgICB0aGlzLnRpbWVvdXRJRCA9IHVuZGVmaW5lZFxuXG4gICAgLy8gc2V0IGRlZmF1bHQgb3B0aW9uc1xuICAgIGNvbnN0IGRlZmF1bHRPcHRpb25zID0ge1xuICAgICAgdHlwZUNvbG9yczoge1xuICAgICAgICBpbmZvOiB7XG4gICAgICAgICAgdGV4dDogJyNmZmYnLFxuICAgICAgICAgIGJnOiAnIzAwMCdcbiAgICAgICAgfSxcbiAgICAgICAgZXJyb3I6IHtcbiAgICAgICAgICB0ZXh0OiAnI2ZmZicsXG4gICAgICAgICAgYmc6ICcjRjZBNjIzJ1xuICAgICAgICB9LFxuICAgICAgICBzdWNjZXNzOiB7XG4gICAgICAgICAgdGV4dDogJyNmZmYnLFxuICAgICAgICAgIGJnOiAnIzdhYzgyNCdcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIG1lcmdlIGRlZmF1bHQgb3B0aW9ucyB3aXRoIHRoZSBvbmVzIHNldCBieSB1c2VyXG4gICAgdGhpcy5vcHRzID0gT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdE9wdGlvbnMsIG9wdHMpXG5cbiAgICB0aGlzLnJlbmRlciA9IHRoaXMucmVuZGVyLmJpbmQodGhpcylcbiAgfVxuXG4gIHNob3dJbmZvcm1lciAobXNnLCB0eXBlLCBkdXJhdGlvbikge1xuICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7XG4gICAgICBpbmZvcm1lcjoge1xuICAgICAgICBpc0hpZGRlbjogZmFsc2UsXG4gICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgIG1zZzogbXNnXG4gICAgICB9XG4gICAgfSlcblxuICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy50aW1lb3V0SUQpXG4gICAgaWYgKGR1cmF0aW9uID09PSAwKSB7XG4gICAgICB0aGlzLnRpbWVvdXRJRCA9IHVuZGVmaW5lZFxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gaGlkZSB0aGUgaW5mb3JtZXIgYWZ0ZXIgYGR1cmF0aW9uYCBtaWxsaXNlY29uZHNcbiAgICB0aGlzLnRpbWVvdXRJRCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgY29uc3QgbmV3SW5mb3JtZXIgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmNvcmUuZ2V0U3RhdGUoKS5pbmZvcm1lciwge1xuICAgICAgICBpc0hpZGRlbjogdHJ1ZVxuICAgICAgfSlcbiAgICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7XG4gICAgICAgIGluZm9ybWVyOiBuZXdJbmZvcm1lclxuICAgICAgfSlcbiAgICB9LCBkdXJhdGlvbilcbiAgfVxuXG4gIGhpZGVJbmZvcm1lciAoKSB7XG4gICAgY29uc3QgbmV3SW5mb3JtZXIgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmNvcmUuZ2V0U3RhdGUoKS5pbmZvcm1lciwge1xuICAgICAgaXNIaWRkZW46IHRydWVcbiAgICB9KVxuICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7XG4gICAgICBpbmZvcm1lcjogbmV3SW5mb3JtZXJcbiAgICB9KVxuICB9XG5cbiAgcmVuZGVyIChzdGF0ZSkge1xuICAgIGNvbnN0IGlzSGlkZGVuID0gc3RhdGUuaW5mb3JtZXIuaXNIaWRkZW5cbiAgICBjb25zdCBtc2cgPSBzdGF0ZS5pbmZvcm1lci5tc2dcbiAgICBjb25zdCB0eXBlID0gc3RhdGUuaW5mb3JtZXIudHlwZSB8fCAnaW5mbydcbiAgICBjb25zdCBzdHlsZSA9IGBiYWNrZ3JvdW5kLWNvbG9yOiAke3RoaXMub3B0cy50eXBlQ29sb3JzW3R5cGVdLmJnfTsgY29sb3I6ICR7dGhpcy5vcHRzLnR5cGVDb2xvcnNbdHlwZV0udGV4dH07YFxuXG4gICAgLy8gQFRPRE8gYWRkIGFyaWEtbGl2ZSBmb3Igc2NyZWVuLXJlYWRlcnNcbiAgICByZXR1cm4gaHRtbGA8ZGl2IGNsYXNzPVwiVXBweUluZm9ybWVyXCIgc3R5bGU9XCIke3N0eWxlfVwiIGFyaWEtaGlkZGVuPVwiJHtpc0hpZGRlbn1cIj5cbiAgICAgIDxwPiR7bXNnfTwvcD5cbiAgICA8L2Rpdj5gXG4gIH1cblxuICBpbnN0YWxsICgpIHtcbiAgICAvLyBTZXQgZGVmYXVsdCBzdGF0ZSBmb3IgR29vZ2xlIERyaXZlXG4gICAgdGhpcy5jb3JlLnNldFN0YXRlKHtcbiAgICAgIGluZm9ybWVyOiB7XG4gICAgICAgIGlzSGlkZGVuOiB0cnVlLFxuICAgICAgICB0eXBlOiAnJyxcbiAgICAgICAgbXNnOiAnJ1xuICAgICAgfVxuICAgIH0pXG5cbiAgICB0aGlzLmNvcmUub24oJ2luZm9ybWVyJywgKG1zZywgdHlwZSwgZHVyYXRpb24pID0+IHtcbiAgICAgIHRoaXMuc2hvd0luZm9ybWVyKG1zZywgdHlwZSwgZHVyYXRpb24pXG4gICAgfSlcblxuICAgIHRoaXMuY29yZS5vbignaW5mb3JtZXI6aGlkZScsICgpID0+IHtcbiAgICAgIHRoaXMuaGlkZUluZm9ybWVyKClcbiAgICB9KVxuXG4gICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5vcHRzLnRhcmdldFxuICAgIGNvbnN0IHBsdWdpbiA9IHRoaXNcbiAgICB0aGlzLnRhcmdldCA9IHRoaXMubW91bnQodGFyZ2V0LCBwbHVnaW4pXG4gIH1cbn1cbiIsImNvbnN0IFBsdWdpbiA9IHJlcXVpcmUoJy4vUGx1Z2luJylcblxuLyoqXG4gKiBNZXRhIERhdGFcbiAqIEFkZHMgbWV0YWRhdGEgZmllbGRzIHRvIFVwcHlcbiAqXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gY2xhc3MgTWV0YURhdGEgZXh0ZW5kcyBQbHVnaW4ge1xuICBjb25zdHJ1Y3RvciAoY29yZSwgb3B0cykge1xuICAgIHN1cGVyKGNvcmUsIG9wdHMpXG4gICAgdGhpcy50eXBlID0gJ21vZGlmaWVyJ1xuICAgIHRoaXMuaWQgPSAnTWV0YURhdGEnXG4gICAgdGhpcy50aXRsZSA9ICdNZXRhIERhdGEnXG5cbiAgICAvLyBzZXQgZGVmYXVsdCBvcHRpb25zXG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnMgPSB7fVxuXG4gICAgLy8gbWVyZ2UgZGVmYXVsdCBvcHRpb25zIHdpdGggdGhlIG9uZXMgc2V0IGJ5IHVzZXJcbiAgICB0aGlzLm9wdHMgPSBPYmplY3QuYXNzaWduKHt9LCBkZWZhdWx0T3B0aW9ucywgb3B0cylcbiAgfVxuXG4gIGFkZEluaXRpYWxNZXRhICgpIHtcbiAgICBjb25zdCBtZXRhRmllbGRzID0gdGhpcy5vcHRzLmZpZWxkc1xuXG4gICAgdGhpcy5jb3JlLnNldFN0YXRlKHtcbiAgICAgIG1ldGFGaWVsZHM6IG1ldGFGaWVsZHNcbiAgICB9KVxuXG4gICAgdGhpcy5jb3JlLmVtaXR0ZXIub24oJ2ZpbGUtYWRkZWQnLCAoZmlsZUlEKSA9PiB7XG4gICAgICBtZXRhRmllbGRzLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgICAgY29uc3Qgb2JqID0ge31cbiAgICAgICAgb2JqW2l0ZW0uaWRdID0gaXRlbS52YWx1ZVxuICAgICAgICB0aGlzLmNvcmUudXBkYXRlTWV0YShvYmosIGZpbGVJRClcbiAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIGluc3RhbGwgKCkge1xuICAgIHRoaXMuYWRkSW5pdGlhbE1ldGEoKVxuICB9XG59XG4iLCJjb25zdCB5byA9IHJlcXVpcmUoJ3lvLXlvJylcbi8vIGNvbnN0IG5hbm9yYWYgPSByZXF1aXJlKCduYW5vcmFmJylcblxuLyoqXG4gKiBCb2lsZXJwbGF0ZSB0aGF0IGFsbCBQbHVnaW5zIHNoYXJlIC0gYW5kIHNob3VsZCBub3QgYmUgdXNlZFxuICogZGlyZWN0bHkuIEl0IGFsc28gc2hvd3Mgd2hpY2ggbWV0aG9kcyBmaW5hbCBwbHVnaW5zIHNob3VsZCBpbXBsZW1lbnQvb3ZlcnJpZGUsXG4gKiB0aGlzIGRlY2lkaW5nIG9uIHN0cnVjdHVyZS5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gbWFpbiBVcHB5IGNvcmUgb2JqZWN0XG4gKiBAcGFyYW0ge29iamVjdH0gb2JqZWN0IHdpdGggcGx1Z2luIG9wdGlvbnNcbiAqIEByZXR1cm4ge2FycmF5IHwgc3RyaW5nfSBmaWxlcyBvciBzdWNjZXNzL2ZhaWwgbWVzc2FnZVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGNsYXNzIFBsdWdpbiB7XG5cbiAgY29uc3RydWN0b3IgKGNvcmUsIG9wdHMpIHtcbiAgICB0aGlzLmNvcmUgPSBjb3JlXG4gICAgdGhpcy5vcHRzID0gb3B0cyB8fCB7fVxuICAgIHRoaXMudHlwZSA9ICdub25lJ1xuXG4gICAgLy8gY2xlYXIgZXZlcnl0aGluZyBpbnNpZGUgdGhlIHRhcmdldCBzZWxlY3RvclxuICAgIHRoaXMub3B0cy5yZXBsYWNlVGFyZ2V0Q29udGVudCA9PT0gdGhpcy5vcHRzLnJlcGxhY2VUYXJnZXRDb250ZW50IHx8IHRydWVcblxuICAgIHRoaXMudXBkYXRlID0gdGhpcy51cGRhdGUuYmluZCh0aGlzKVxuICAgIHRoaXMubW91bnQgPSB0aGlzLm1vdW50LmJpbmQodGhpcylcbiAgICB0aGlzLmZvY3VzID0gdGhpcy5mb2N1cy5iaW5kKHRoaXMpXG4gICAgdGhpcy5pbnN0YWxsID0gdGhpcy5pbnN0YWxsLmJpbmQodGhpcylcblxuICAgIC8vIHRoaXMuZnJhbWUgPSBudWxsXG4gIH1cblxuICB1cGRhdGUgKHN0YXRlKSB7XG4gICAgaWYgKHR5cGVvZiB0aGlzLmVsID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gY29uc3QgcHJldiA9IHt9XG4gICAgLy8gaWYgKCF0aGlzLmZyYW1lKSB7XG4gICAgLy8gICBjb25zb2xlLmxvZygnY3JlYXRpbmcgZnJhbWUnKVxuICAgIC8vICAgdGhpcy5mcmFtZSA9IG5hbm9yYWYoKHN0YXRlLCBwcmV2KSA9PiB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKCd1cGRhdGluZyEnLCBEYXRlLm5vdygpKVxuICAgIC8vICAgICBjb25zdCBuZXdFbCA9IHRoaXMucmVuZGVyKHN0YXRlKVxuICAgIC8vICAgICB0aGlzLmVsID0geW8udXBkYXRlKHRoaXMuZWwsIG5ld0VsKVxuICAgIC8vICAgfSlcbiAgICAvLyB9XG4gICAgLy8gY29uc29sZS5sb2coJ2F0dGVtcHRpbmcgYW4gdXBkYXRlLi4uJywgRGF0ZS5ub3coKSlcbiAgICAvLyB0aGlzLmZyYW1lKHN0YXRlLCBwcmV2KVxuXG4gICAgdGhpcy5jb3JlLmxvZygndXBkYXRlIG51bWJlcjogJyArIHRoaXMuY29yZS51cGRhdGVOdW0rKylcblxuICAgIGNvbnN0IG5ld0VsID0gdGhpcy5yZW5kZXIoc3RhdGUpXG4gICAgeW8udXBkYXRlKHRoaXMuZWwsIG5ld0VsKVxuXG4gICAgLy8gb3B0aW1pemVzIHBlcmZvcm1hbmNlP1xuICAgIC8vIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgLy8gICBjb25zdCBuZXdFbCA9IHRoaXMucmVuZGVyKHN0YXRlKVxuICAgIC8vICAgeW8udXBkYXRlKHRoaXMuZWwsIG5ld0VsKVxuICAgIC8vIH0pXG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgc3VwcGxpZWQgYHRhcmdldGAgaXMgYSBgc3RyaW5nYCBvciBhbiBgb2JqZWN0YC5cbiAgICogSWYgaXTigJlzIGFuIG9iamVjdCDigJQgdGFyZ2V0IGlzIGEgcGx1Z2luLCBhbmQgd2Ugc2VhcmNoIGBwbHVnaW5zYFxuICAgKiBmb3IgYSBwbHVnaW4gd2l0aCBzYW1lIG5hbWUgYW5kIHJldHVybiBpdHMgdGFyZ2V0LlxuICAgKlxuICAgKiBAcGFyYW0ge1N0cmluZ3xPYmplY3R9IHRhcmdldFxuICAgKlxuICAgKi9cbiAgbW91bnQgKHRhcmdldCwgcGx1Z2luKSB7XG4gICAgY29uc3QgY2FsbGVyUGx1Z2luTmFtZSA9IHBsdWdpbi5pZFxuXG4gICAgaWYgKHR5cGVvZiB0YXJnZXQgPT09ICdzdHJpbmcnKSB7XG4gICAgICB0aGlzLmNvcmUubG9nKGBJbnN0YWxsaW5nICR7Y2FsbGVyUGx1Z2luTmFtZX0gdG8gJHt0YXJnZXR9YClcblxuICAgICAgLy8gY2xlYXIgZXZlcnl0aGluZyBpbnNpZGUgdGhlIHRhcmdldCBjb250YWluZXJcbiAgICAgIGlmICh0aGlzLm9wdHMucmVwbGFjZVRhcmdldENvbnRlbnQpIHtcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3Rvcih0YXJnZXQpLmlubmVySFRNTCA9ICcnXG4gICAgICB9XG5cbiAgICAgIHRoaXMuZWwgPSBwbHVnaW4ucmVuZGVyKHRoaXMuY29yZS5zdGF0ZSlcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IodGFyZ2V0KS5hcHBlbmRDaGlsZCh0aGlzLmVsKVxuXG4gICAgICByZXR1cm4gdGFyZ2V0XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFRPRE86IGlzIGluc3RhbnRpYXRpbmcgdGhlIHBsdWdpbiByZWFsbHkgdGhlIHdheSB0byByb2xsXG4gICAgICAvLyBqdXN0IHRvIGdldCB0aGUgcGx1Z2luIG5hbWU/XG4gICAgICBjb25zdCBUYXJnZXQgPSB0YXJnZXRcbiAgICAgIGNvbnN0IHRhcmdldFBsdWdpbk5hbWUgPSBuZXcgVGFyZ2V0KCkuaWRcblxuICAgICAgdGhpcy5jb3JlLmxvZyhgSW5zdGFsbGluZyAke2NhbGxlclBsdWdpbk5hbWV9IHRvICR7dGFyZ2V0UGx1Z2luTmFtZX1gKVxuXG4gICAgICBjb25zdCB0YXJnZXRQbHVnaW4gPSB0aGlzLmNvcmUuZ2V0UGx1Z2luKHRhcmdldFBsdWdpbk5hbWUpXG4gICAgICBjb25zdCBzZWxlY3RvclRhcmdldCA9IHRhcmdldFBsdWdpbi5hZGRUYXJnZXQocGx1Z2luKVxuXG4gICAgICByZXR1cm4gc2VsZWN0b3JUYXJnZXRcbiAgICB9XG4gIH1cblxuICBmb2N1cyAoKSB7XG4gICAgcmV0dXJuXG4gIH1cblxuICBpbnN0YWxsICgpIHtcbiAgICByZXR1cm5cbiAgfVxufVxuIiwiY29uc3QgUGx1Z2luID0gcmVxdWlyZSgnLi9QbHVnaW4nKVxuY29uc3QgdHVzID0gcmVxdWlyZSgndHVzLWpzLWNsaWVudCcpXG5jb25zdCBVcHB5U29ja2V0ID0gcmVxdWlyZSgnLi4vY29yZS9VcHB5U29ja2V0JylcbmNvbnN0IHRocm90dGxlID0gcmVxdWlyZSgnbG9kYXNoLnRocm90dGxlJylcbnJlcXVpcmUoJ3doYXR3Zy1mZXRjaCcpXG5cbi8qKlxuICogVHVzIHJlc3VtYWJsZSBmaWxlIHVwbG9hZGVyXG4gKlxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGNsYXNzIFR1czEwIGV4dGVuZHMgUGx1Z2luIHtcbiAgY29uc3RydWN0b3IgKGNvcmUsIG9wdHMpIHtcbiAgICBzdXBlcihjb3JlLCBvcHRzKVxuICAgIHRoaXMudHlwZSA9ICd1cGxvYWRlcidcbiAgICB0aGlzLmlkID0gJ1R1cydcbiAgICB0aGlzLnRpdGxlID0gJ1R1cydcblxuICAgIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgICBjb25zdCBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICAgIHJlc3VtZTogdHJ1ZSxcbiAgICAgIGFsbG93UGF1c2U6IHRydWVcbiAgICB9XG5cbiAgICAvLyBtZXJnZSBkZWZhdWx0IG9wdGlvbnMgd2l0aCB0aGUgb25lcyBzZXQgYnkgdXNlclxuICAgIHRoaXMub3B0cyA9IE9iamVjdC5hc3NpZ24oe30sIGRlZmF1bHRPcHRpb25zLCBvcHRzKVxuICB9XG5cbiAgcGF1c2VSZXN1bWUgKGFjdGlvbiwgZmlsZUlEKSB7XG4gICAgY29uc3QgdXBkYXRlZEZpbGVzID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5jb3JlLmdldFN0YXRlKCkuZmlsZXMpXG4gICAgY29uc3QgaW5Qcm9ncmVzc1VwZGF0ZWRGaWxlcyA9IE9iamVjdC5rZXlzKHVwZGF0ZWRGaWxlcykuZmlsdGVyKChmaWxlKSA9PiB7XG4gICAgICByZXR1cm4gIXVwZGF0ZWRGaWxlc1tmaWxlXS5wcm9ncmVzcy51cGxvYWRDb21wbGV0ZSAmJlxuICAgICAgICAgICAgIHVwZGF0ZWRGaWxlc1tmaWxlXS5wcm9ncmVzcy51cGxvYWRTdGFydGVkXG4gICAgfSlcblxuICAgIHN3aXRjaCAoYWN0aW9uKSB7XG4gICAgICBjYXNlICd0b2dnbGUnOlxuICAgICAgICBpZiAodXBkYXRlZEZpbGVzW2ZpbGVJRF0udXBsb2FkQ29tcGxldGUpIHJldHVyblxuXG4gICAgICAgIGNvbnN0IHdhc1BhdXNlZCA9IHVwZGF0ZWRGaWxlc1tmaWxlSURdLmlzUGF1c2VkIHx8IGZhbHNlXG4gICAgICAgIGNvbnN0IGlzUGF1c2VkID0gIXdhc1BhdXNlZFxuICAgICAgICBsZXQgdXBkYXRlZEZpbGVcbiAgICAgICAgaWYgKHdhc1BhdXNlZCkge1xuICAgICAgICAgIHVwZGF0ZWRGaWxlID0gT2JqZWN0LmFzc2lnbih7fSwgdXBkYXRlZEZpbGVzW2ZpbGVJRF0sIHtcbiAgICAgICAgICAgIGlzUGF1c2VkOiBmYWxzZVxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlZEZpbGUgPSBPYmplY3QuYXNzaWduKHt9LCB1cGRhdGVkRmlsZXNbZmlsZUlEXSwge1xuICAgICAgICAgICAgaXNQYXVzZWQ6IHRydWVcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIHVwZGF0ZWRGaWxlc1tmaWxlSURdID0gdXBkYXRlZEZpbGVcbiAgICAgICAgdGhpcy5jb3JlLnNldFN0YXRlKHtmaWxlczogdXBkYXRlZEZpbGVzfSlcbiAgICAgICAgcmV0dXJuIGlzUGF1c2VkXG4gICAgICBjYXNlICdwYXVzZUFsbCc6XG4gICAgICAgIGluUHJvZ3Jlc3NVcGRhdGVkRmlsZXMuZm9yRWFjaCgoZmlsZSkgPT4ge1xuICAgICAgICAgIGNvbnN0IHVwZGF0ZWRGaWxlID0gT2JqZWN0LmFzc2lnbih7fSwgdXBkYXRlZEZpbGVzW2ZpbGVdLCB7XG4gICAgICAgICAgICBpc1BhdXNlZDogdHJ1ZVxuICAgICAgICAgIH0pXG4gICAgICAgICAgdXBkYXRlZEZpbGVzW2ZpbGVdID0gdXBkYXRlZEZpbGVcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy5jb3JlLnNldFN0YXRlKHtmaWxlczogdXBkYXRlZEZpbGVzfSlcbiAgICAgICAgcmV0dXJuXG4gICAgICBjYXNlICdyZXN1bWVBbGwnOlxuICAgICAgICBpblByb2dyZXNzVXBkYXRlZEZpbGVzLmZvckVhY2goKGZpbGUpID0+IHtcbiAgICAgICAgICBjb25zdCB1cGRhdGVkRmlsZSA9IE9iamVjdC5hc3NpZ24oe30sIHVwZGF0ZWRGaWxlc1tmaWxlXSwge1xuICAgICAgICAgICAgaXNQYXVzZWQ6IGZhbHNlXG4gICAgICAgICAgfSlcbiAgICAgICAgICB1cGRhdGVkRmlsZXNbZmlsZV0gPSB1cGRhdGVkRmlsZVxuICAgICAgICB9KVxuICAgICAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe2ZpbGVzOiB1cGRhdGVkRmlsZXN9KVxuICAgICAgICByZXR1cm5cbiAgICB9XG4gIH1cblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgVHVzIHVwbG9hZFxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBmaWxlIGZvciB1c2Ugd2l0aCB1cGxvYWRcbiAqIEBwYXJhbSB7aW50ZWdlcn0gY3VycmVudCBmaWxlIGluIGEgcXVldWVcbiAqIEBwYXJhbSB7aW50ZWdlcn0gdG90YWwgbnVtYmVyIG9mIGZpbGVzIGluIGEgcXVldWVcbiAqIEByZXR1cm5zIHtQcm9taXNlfVxuICovXG4gIHVwbG9hZCAoZmlsZSwgY3VycmVudCwgdG90YWwpIHtcbiAgICB0aGlzLmNvcmUubG9nKGB1cGxvYWRpbmcgJHtjdXJyZW50fSBvZiAke3RvdGFsfWApXG5cbiAgICAvLyBDcmVhdGUgYSBuZXcgdHVzIHVwbG9hZFxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCB1cGxvYWQgPSBuZXcgdHVzLlVwbG9hZChmaWxlLmRhdGEsIHtcblxuICAgICAgICAvLyBUT0RPIG1lcmdlIHRoaXMub3B0cyBvciB0aGlzLm9wdHMudHVzIGhlcmVcbiAgICAgICAgbWV0YWRhdGE6IGZpbGUubWV0YSxcbiAgICAgICAgcmVzdW1lOiB0aGlzLm9wdHMucmVzdW1lLFxuICAgICAgICBlbmRwb2ludDogdGhpcy5vcHRzLmVuZHBvaW50LFxuXG4gICAgICAgIG9uRXJyb3I6IChlcnIpID0+IHtcbiAgICAgICAgICB0aGlzLmNvcmUubG9nKGVycilcbiAgICAgICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOnVwbG9hZC1lcnJvcicsIGZpbGUuaWQsIGVycilcbiAgICAgICAgICByZWplY3QoJ0ZhaWxlZCBiZWNhdXNlOiAnICsgZXJyKVxuICAgICAgICB9LFxuICAgICAgICBvblByb2dyZXNzOiAoYnl0ZXNVcGxvYWRlZCwgYnl0ZXNUb3RhbCkgPT4ge1xuICAgICAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2NvcmU6dXBsb2FkLXByb2dyZXNzJywge1xuICAgICAgICAgICAgdXBsb2FkZXI6IHRoaXMsXG4gICAgICAgICAgICBpZDogZmlsZS5pZCxcbiAgICAgICAgICAgIGJ5dGVzVXBsb2FkZWQ6IGJ5dGVzVXBsb2FkZWQsXG4gICAgICAgICAgICBieXRlc1RvdGFsOiBieXRlc1RvdGFsXG4gICAgICAgICAgfSlcbiAgICAgICAgfSxcbiAgICAgICAgb25TdWNjZXNzOiAoKSA9PiB7XG4gICAgICAgICAgdGhpcy5jb3JlLmVtaXR0ZXIuZW1pdCgnY29yZTp1cGxvYWQtc3VjY2VzcycsIGZpbGUuaWQsIHVwbG9hZCwgdXBsb2FkLnVybClcblxuICAgICAgICAgIGlmICh1cGxvYWQudXJsKSB7XG4gICAgICAgICAgICB0aGlzLmNvcmUubG9nKGBEb3dubG9hZCAke3VwbG9hZC5maWxlLm5hbWV9IGZyb20gJHt1cGxvYWQudXJsfWApXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmVzb2x2ZSh1cGxvYWQpXG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIHRoaXMub25GaWxlUmVtb3ZlKGZpbGUuaWQsICgpID0+IHtcbiAgICAgICAgdGhpcy5jb3JlLmxvZygncmVtb3ZpbmcgZmlsZTonLCBmaWxlLmlkKVxuICAgICAgICB1cGxvYWQuYWJvcnQoKVxuICAgICAgICByZXNvbHZlKGB1cGxvYWQgJHtmaWxlLmlkfSB3YXMgcmVtb3ZlZGApXG4gICAgICB9KVxuXG4gICAgICB0aGlzLm9uUGF1c2UoZmlsZS5pZCwgKGlzUGF1c2VkKSA9PiB7XG4gICAgICAgIGlzUGF1c2VkID8gdXBsb2FkLmFib3J0KCkgOiB1cGxvYWQuc3RhcnQoKVxuICAgICAgfSlcblxuICAgICAgdGhpcy5vblBhdXNlQWxsKGZpbGUuaWQsICgpID0+IHtcbiAgICAgICAgdXBsb2FkLmFib3J0KClcbiAgICAgIH0pXG5cbiAgICAgIHRoaXMub25SZXN1bWVBbGwoZmlsZS5pZCwgKCkgPT4ge1xuICAgICAgICB1cGxvYWQuc3RhcnQoKVxuICAgICAgfSlcblxuICAgICAgdXBsb2FkLnN0YXJ0KClcbiAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2NvcmU6dXBsb2FkLXN0YXJ0ZWQnLCBmaWxlLmlkLCB1cGxvYWQpXG4gICAgfSlcbiAgfVxuXG4gIHVwbG9hZFJlbW90ZSAoZmlsZSwgY3VycmVudCwgdG90YWwpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgdGhpcy5jb3JlLmxvZyhmaWxlLnJlbW90ZS51cmwpXG4gICAgICBmZXRjaChmaWxlLnJlbW90ZS51cmwsIHtcbiAgICAgICAgbWV0aG9kOiAncG9zdCcsXG4gICAgICAgIGNyZWRlbnRpYWxzOiAnaW5jbHVkZScsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbidcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoT2JqZWN0LmFzc2lnbih7fSwgZmlsZS5yZW1vdGUuYm9keSwge1xuICAgICAgICAgIGVuZHBvaW50OiB0aGlzLm9wdHMuZW5kcG9pbnQsXG4gICAgICAgICAgcHJvdG9jb2w6ICd0dXMnXG4gICAgICAgIH0pKVxuICAgICAgfSlcbiAgICAgIC50aGVuKChyZXMpID0+IHtcbiAgICAgICAgaWYgKHJlcy5zdGF0dXMgPCAyMDAgJiYgcmVzLnN0YXR1cyA+IDMwMCkge1xuICAgICAgICAgIHJldHVybiByZWplY3QocmVzLnN0YXR1c1RleHQpXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdjb3JlOnVwbG9hZC1zdGFydGVkJywgZmlsZS5pZClcblxuICAgICAgICByZXMuanNvbigpLnRoZW4oKGRhdGEpID0+IHtcbiAgICAgICAgICAvLyBnZXQgdGhlIGhvc3QgZG9tYWluXG4gICAgICAgICAgLy8gdmFyIHJlZ2V4ID0gL14oPzpodHRwcz86XFwvXFwvfFxcL1xcLyk/KD86W15AXFwvXFxuXStAKT8oPzp3d3dcXC4pPyhbXlxcL1xcbl0rKS9cbiAgICAgICAgICB2YXIgcmVnZXggPSAvXig/Omh0dHBzPzpcXC9cXC98XFwvXFwvKT8oPzpbXkBcXG5dK0ApPyg/Ond3d1xcLik/KFteXFxuXSspL1xuICAgICAgICAgIHZhciBob3N0ID0gcmVnZXguZXhlYyhmaWxlLnJlbW90ZS5ob3N0KVsxXVxuICAgICAgICAgIHZhciBzb2NrZXRQcm90b2NvbCA9IGxvY2F0aW9uLnByb3RvY29sID09PSAnaHR0cHM6JyA/ICd3c3MnIDogJ3dzJ1xuXG4gICAgICAgICAgdmFyIHRva2VuID0gZGF0YS50b2tlblxuICAgICAgICAgIHZhciBzb2NrZXQgPSBuZXcgVXBweVNvY2tldCh7XG4gICAgICAgICAgICB0YXJnZXQ6IHNvY2tldFByb3RvY29sICsgYDovLyR7aG9zdH0vYXBpLyR7dG9rZW59YFxuICAgICAgICAgIH0pXG5cbiAgICAgICAgICB0aGlzLm9uRmlsZVJlbW92ZShmaWxlLmlkLCAoKSA9PiB7XG4gICAgICAgICAgICBzb2NrZXQuc2VuZCgncGF1c2UnLCB7fSlcbiAgICAgICAgICAgIHJlc29sdmUoYHVwbG9hZCAke2ZpbGUuaWR9IHdhcyByZW1vdmVkYClcbiAgICAgICAgICB9KVxuXG4gICAgICAgICAgdGhpcy5vblBhdXNlKGZpbGUuaWQsIChpc1BhdXNlZCkgPT4ge1xuICAgICAgICAgICAgaXNQYXVzZWQgPyBzb2NrZXQuc2VuZCgncGF1c2UnLCB7fSkgOiBzb2NrZXQuc2VuZCgncmVzdW1lJywge30pXG4gICAgICAgICAgfSlcblxuICAgICAgICAgIHRoaXMub25QYXVzZUFsbChmaWxlLmlkLCAoKSA9PiB7XG4gICAgICAgICAgICBzb2NrZXQuc2VuZCgncGF1c2UnLCB7fSlcbiAgICAgICAgICB9KVxuXG4gICAgICAgICAgdGhpcy5vblJlc3VtZUFsbChmaWxlLmlkLCAoKSA9PiB7XG4gICAgICAgICAgICBzb2NrZXQuc2VuZCgncmVzdW1lJywge30pXG4gICAgICAgICAgfSlcblxuICAgICAgICAgIGNvbnN0IGVtaXRQcm9ncmVzcyA9IChwcm9ncmVzc0RhdGEpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHtwcm9ncmVzcywgYnl0ZXNVcGxvYWRlZCwgYnl0ZXNUb3RhbH0gPSBwcm9ncmVzc0RhdGFcblxuICAgICAgICAgICAgaWYgKHByb2dyZXNzKSB7XG4gICAgICAgICAgICAgIHRoaXMuY29yZS5sb2coYFVwbG9hZCBwcm9ncmVzczogJHtwcm9ncmVzc31gKVxuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhmaWxlLmlkKVxuXG4gICAgICAgICAgICAgIHRoaXMuY29yZS5lbWl0dGVyLmVtaXQoJ2NvcmU6dXBsb2FkLXByb2dyZXNzJywge1xuICAgICAgICAgICAgICAgIHVwbG9hZGVyOiB0aGlzLFxuICAgICAgICAgICAgICAgIGlkOiBmaWxlLmlkLFxuICAgICAgICAgICAgICAgIGJ5dGVzVXBsb2FkZWQ6IGJ5dGVzVXBsb2FkZWQsXG4gICAgICAgICAgICAgICAgYnl0ZXNUb3RhbDogYnl0ZXNUb3RhbFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHRocm90dGxlZEVtaXRQcm9ncmVzcyA9IHRocm90dGxlKGVtaXRQcm9ncmVzcywgMzAwLCB7bGVhZGluZzogdHJ1ZSwgdHJhaWxpbmc6IHRydWV9KVxuICAgICAgICAgIHNvY2tldC5vbigncHJvZ3Jlc3MnLCB0aHJvdHRsZWRFbWl0UHJvZ3Jlc3MpXG5cbiAgICAgICAgICBzb2NrZXQub24oJ3N1Y2Nlc3MnLCAoZGF0YSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jb3JlLmVtaXR0ZXIuZW1pdCgnY29yZTp1cGxvYWQtc3VjY2VzcycsIGZpbGUuaWQsIGRhdGEsIGRhdGEudXJsKVxuICAgICAgICAgICAgc29ja2V0LmNsb3NlKClcbiAgICAgICAgICAgIHJldHVybiByZXNvbHZlKClcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgb25GaWxlUmVtb3ZlIChmaWxlSUQsIGNiKSB7XG4gICAgdGhpcy5jb3JlLmVtaXR0ZXIub24oJ2NvcmU6ZmlsZS1yZW1vdmUnLCAodGFyZ2V0RmlsZUlEKSA9PiB7XG4gICAgICBpZiAoZmlsZUlEID09PSB0YXJnZXRGaWxlSUQpIGNiKClcbiAgICB9KVxuICB9XG5cbiAgb25QYXVzZSAoZmlsZUlELCBjYikge1xuICAgIHRoaXMuY29yZS5lbWl0dGVyLm9uKCdjb3JlOnVwbG9hZC1wYXVzZScsICh0YXJnZXRGaWxlSUQpID0+IHtcbiAgICAgIGlmIChmaWxlSUQgPT09IHRhcmdldEZpbGVJRCkge1xuICAgICAgICBjb25zdCBpc1BhdXNlZCA9IHRoaXMucGF1c2VSZXN1bWUoJ3RvZ2dsZScsIGZpbGVJRClcbiAgICAgICAgY2IoaXNQYXVzZWQpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIG9uUGF1c2VBbGwgKGZpbGVJRCwgY2IpIHtcbiAgICB0aGlzLmNvcmUuZW1pdHRlci5vbignY29yZTpwYXVzZS1hbGwnLCAoKSA9PiB7XG4gICAgICBjb25zdCBmaWxlcyA9IHRoaXMuY29yZS5nZXRTdGF0ZSgpLmZpbGVzXG4gICAgICBpZiAoIWZpbGVzW2ZpbGVJRF0pIHJldHVyblxuICAgICAgY2IoKVxuICAgIH0pXG4gIH1cblxuICBvblJlc3VtZUFsbCAoZmlsZUlELCBjYikge1xuICAgIHRoaXMuY29yZS5lbWl0dGVyLm9uKCdjb3JlOnJlc3VtZS1hbGwnLCAoKSA9PiB7XG4gICAgICBjb25zdCBmaWxlcyA9IHRoaXMuY29yZS5nZXRTdGF0ZSgpLmZpbGVzXG4gICAgICBpZiAoIWZpbGVzW2ZpbGVJRF0pIHJldHVyblxuICAgICAgY2IoKVxuICAgIH0pXG4gIH1cblxuICB1cGxvYWRGaWxlcyAoZmlsZXMpIHtcbiAgICBpZiAoT2JqZWN0LmtleXMoZmlsZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhpcy5jb3JlLmxvZygnbm8gZmlsZXMgdG8gdXBsb2FkIScpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCB1cGxvYWRlcnMgPSBbXVxuICAgIGZpbGVzLmZvckVhY2goKGZpbGUsIGluZGV4KSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50ID0gcGFyc2VJbnQoaW5kZXgsIDEwKSArIDFcbiAgICAgIGNvbnN0IHRvdGFsID0gZmlsZXMubGVuZ3RoXG5cbiAgICAgIGlmICghZmlsZS5pc1JlbW90ZSkge1xuICAgICAgICB1cGxvYWRlcnMucHVzaCh0aGlzLnVwbG9hZChmaWxlLCBjdXJyZW50LCB0b3RhbCkpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB1cGxvYWRlcnMucHVzaCh0aGlzLnVwbG9hZFJlbW90ZShmaWxlLCBjdXJyZW50LCB0b3RhbCkpXG4gICAgICB9XG4gICAgfSlcblxuICAgIHJldHVybiBQcm9taXNlLmFsbCh1cGxvYWRlcnMpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHRoaXMuY29yZS5sb2coJ0FsbCBmaWxlcyB1cGxvYWRlZCcpXG4gICAgICAgIHJldHVybiB7IHVwbG9hZGVkQ291bnQ6IGZpbGVzLmxlbmd0aCB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgdGhpcy5jb3JlLmxvZygnVXBsb2FkIGVycm9yOiAnICsgZXJyKVxuICAgICAgfSlcbiAgfVxuXG4gIHNlbGVjdEZvclVwbG9hZCAoZmlsZXMpIHtcbiAgICAvLyBUT0RPOiByZXBsYWNlIGZpbGVzW2ZpbGVdLmlzUmVtb3RlIHdpdGggc29tZSBsb2dpY1xuICAgIC8vXG4gICAgLy8gZmlsdGVyIGZpbGVzIHRoYXQgYXJlIG5vdyB5ZXQgYmVpbmcgdXBsb2FkZWQgLyBoYXZlbuKAmXQgYmVlbiB1cGxvYWRlZFxuICAgIC8vIGFuZCByZW1vdGUgdG9vXG4gICAgY29uc3QgZmlsZXNGb3JVcGxvYWQgPSBPYmplY3Qua2V5cyhmaWxlcykuZmlsdGVyKChmaWxlKSA9PiB7XG4gICAgICBpZiAoIWZpbGVzW2ZpbGVdLnByb2dyZXNzLnVwbG9hZFN0YXJ0ZWQgfHwgZmlsZXNbZmlsZV0uaXNSZW1vdGUpIHtcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH0pLm1hcCgoZmlsZSkgPT4ge1xuICAgICAgcmV0dXJuIGZpbGVzW2ZpbGVdXG4gICAgfSlcblxuICAgIHRoaXMudXBsb2FkRmlsZXMoZmlsZXNGb3JVcGxvYWQpXG4gIH1cblxuICBhY3Rpb25zICgpIHtcbiAgICB0aGlzLmNvcmUuZW1pdHRlci5vbignY29yZTpwYXVzZS1hbGwnLCAoKSA9PiB7XG4gICAgICB0aGlzLnBhdXNlUmVzdW1lKCdwYXVzZUFsbCcpXG4gICAgfSlcblxuICAgIHRoaXMuY29yZS5lbWl0dGVyLm9uKCdjb3JlOnJlc3VtZS1hbGwnLCAoKSA9PiB7XG4gICAgICB0aGlzLnBhdXNlUmVzdW1lKCdyZXN1bWVBbGwnKVxuICAgIH0pXG5cbiAgICB0aGlzLmNvcmUuZW1pdHRlci5vbignY29yZTp1cGxvYWQnLCAoKSA9PiB7XG4gICAgICB0aGlzLmNvcmUubG9nKCdUdXMgaXMgdXBsb2FkaW5nLi4uJylcbiAgICAgIGNvbnN0IGZpbGVzID0gdGhpcy5jb3JlLmdldFN0YXRlKCkuZmlsZXNcbiAgICAgIHRoaXMuc2VsZWN0Rm9yVXBsb2FkKGZpbGVzKVxuICAgIH0pXG4gIH1cblxuICBhZGRSZXN1bWFibGVVcGxvYWRzQ2FwYWJpbGl0eUZsYWcgKCkge1xuICAgIGNvbnN0IG5ld0NhcGFiaWxpdGllcyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuY29yZS5nZXRTdGF0ZSgpLmNhcGFiaWxpdGllcylcbiAgICBuZXdDYXBhYmlsaXRpZXMucmVzdW1hYmxlVXBsb2FkcyA9IHRydWVcbiAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe1xuICAgICAgY2FwYWJpbGl0aWVzOiBuZXdDYXBhYmlsaXRpZXNcbiAgICB9KVxuICB9XG5cbiAgaW5zdGFsbCAoKSB7XG4gICAgdGhpcy5hZGRSZXN1bWFibGVVcGxvYWRzQ2FwYWJpbGl0eUZsYWcoKVxuICAgIHRoaXMuYWN0aW9ucygpXG4gIH1cbn1cbiIsImNvbnN0IGh0bWwgPSByZXF1aXJlKCd5by15bycpXG5cbm1vZHVsZS5leHBvcnRzID0gKHByb3BzKSA9PiB7XG4gIHJldHVybiBodG1sYDxzdmcgY2xhc3M9XCJVcHB5SWNvblwiIHdpZHRoPVwiMTAwXCIgaGVpZ2h0PVwiNzdcIiB2aWV3Qm94PVwiMCAwIDEwMCA3N1wiPlxuICAgIDxwYXRoIGQ9XCJNNTAgMzJjLTcuMTY4IDAtMTMgNS44MzItMTMgMTNzNS44MzIgMTMgMTMgMTMgMTMtNS44MzIgMTMtMTMtNS44MzItMTMtMTMtMTN6XCIvPlxuICAgIDxwYXRoIGQ9XCJNODcgMTNINzJjMC03LjE4LTUuODItMTMtMTMtMTNINDFjLTcuMTggMC0xMyA1LjgyLTEzIDEzSDEzQzUuODIgMTMgMCAxOC44MiAwIDI2djM4YzAgNy4xOCA1LjgyIDEzIDEzIDEzaDc0YzcuMTggMCAxMy01LjgyIDEzLTEzVjI2YzAtNy4xOC01LjgyLTEzLTEzLTEzek01MCA2OGMtMTIuNjgzIDAtMjMtMTAuMzE4LTIzLTIzczEwLjMxNy0yMyAyMy0yMyAyMyAxMC4zMTggMjMgMjMtMTAuMzE3IDIzLTIzIDIzelwiLz5cbiAgPC9zdmc+YFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcbmNvbnN0IENhbWVyYUljb24gPSByZXF1aXJlKCcuL0NhbWVyYUljb24nKVxuXG5tb2R1bGUuZXhwb3J0cyA9IChwcm9wcykgPT4ge1xuICBjb25zdCBzcmMgPSBwcm9wcy5zcmMgfHwgJydcbiAgbGV0IHZpZGVvXG5cbiAgaWYgKHByb3BzLnVzZVRoZUZsYXNoKSB7XG4gICAgdmlkZW8gPSBwcm9wcy5nZXRTV0ZIVE1MKClcbiAgfSBlbHNlIHtcbiAgICB2aWRlbyA9IGh0bWxgPHZpZGVvIGNsYXNzPVwiVXBweVdlYmNhbS12aWRlb1wiIGF1dG9wbGF5IHNyYz1cIiR7c3JjfVwiPjwvdmlkZW8+YFxuICB9XG5cbiAgcmV0dXJuIGh0bWxgXG4gICAgPGRpdiBjbGFzcz1cIlVwcHlXZWJjYW0tY29udGFpbmVyXCIgb25sb2FkPSR7KGVsKSA9PiB7XG4gICAgICBwcm9wcy5vbkZvY3VzKClcbiAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5VcHB5V2ViY2FtLXN0b3BSZWNvcmRCdG4nKS5mb2N1cygpXG4gICAgfX0gb251bmxvYWQ9JHsoZWwpID0+IHtcbiAgICAgIHByb3BzLm9uU3RvcCgpXG4gICAgfX0+XG4gICAgICA8ZGl2IGNsYXNzPSdVcHB5V2ViY2FtLXZpZGVvQ29udGFpbmVyJz5cbiAgICAgICAgJHt2aWRlb31cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz0nVXBweVdlYmNhbS1idXR0b25Db250YWluZXInPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiVXBweUJ1dHRvbi0tY2lyY3VsYXIgVXBweUJ1dHRvbi0tcmVkIFVwcHlCdXR0b24tLXNpemVNIFVwcHlXZWJjYW0tc3RvcFJlY29yZEJ0blwiXG4gICAgICAgICAgdHlwZT1cImJ1dHRvblwiXG4gICAgICAgICAgdGl0bGU9XCJUYWtlIGEgc25hcHNob3RcIlxuICAgICAgICAgIGFyaWEtbGFiZWw9XCJUYWtlIGEgc25hcHNob3RcIlxuICAgICAgICAgIG9uY2xpY2s9JHtwcm9wcy5vblNuYXBzaG90fT5cbiAgICAgICAgICAke0NhbWVyYUljb24oKX1cbiAgICAgICAgPC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxjYW52YXMgY2xhc3M9XCJVcHB5V2ViY2FtLWNhbnZhc1wiIHN0eWxlPVwiZGlzcGxheTogbm9uZTtcIj48L2NhbnZhcz5cbiAgICA8L2Rpdj5cbiAgYFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcblxubW9kdWxlLmV4cG9ydHMgPSAocHJvcHMpID0+IHtcbiAgcmV0dXJuIGh0bWxgXG4gICAgPGRpdj5cbiAgICAgIDxoMT5QbGVhc2UgYWxsb3cgYWNjZXNzIHRvIHlvdXIgY2FtZXJhPC9oMT5cbiAgICAgIDxzcGFuPllvdSBoYXZlIGJlZW4gcHJvbXB0ZWQgdG8gYWxsb3cgY2FtZXJhIGFjY2VzcyBmcm9tIHRoaXMgc2l0ZS4gSW4gb3JkZXIgdG8gdGFrZSBwaWN0dXJlcyB3aXRoIHlvdXIgY2FtZXJhIHlvdSBtdXN0IGFwcHJvdmUgdGhpcyByZXF1ZXN0Ljwvc3Bhbj5cbiAgICA8L2Rpdj5cbiAgYFxufVxuIiwiY29uc3QgaHRtbCA9IHJlcXVpcmUoJ3lvLXlvJylcblxubW9kdWxlLmV4cG9ydHMgPSAocHJvcHMpID0+IHtcbiAgcmV0dXJuIGh0bWxgXG4gICAgPHN2ZyBjbGFzcz1cIlVwcHlJY29uIFVwcHlNb2RhbFRhYi1pY29uXCIgd2lkdGg9XCIxOFwiIGhlaWdodD1cIjIxXCIgdmlld0JveD1cIjAgMCAxOCAyMVwiPlxuICAgICAgPHBhdGggZD1cIk0xNC44IDE2LjljMS45LTEuNyAzLjItNC4xIDMuMi02LjkgMC01LTQtOS05LTlzLTkgNC05IDljMCAyLjggMS4yIDUuMiAzLjIgNi45QzEuOSAxNy45LjUgMTkuNCAwIDIxaDNjMS0xLjkgMTEtMS45IDEyIDBoM2MtLjUtMS42LTEuOS0zLjEtMy4yLTQuMXpNOSA0YzMuMyAwIDYgMi43IDYgNnMtMi43IDYtNiA2LTYtMi43LTYtNiAyLjctNiA2LTZ6XCIvPlxuICAgICAgPHBhdGggZD1cIk05IDE0YzIuMiAwIDQtMS44IDQtNHMtMS44LTQtNC00LTQgMS44LTQgNCAxLjggNCA0IDR6TTggOGMuNiAwIDEgLjQgMSAxcy0uNCAxLTEgMS0xLS40LTEtMWMwLS41LjQtMSAxLTF6XCIvPlxuICAgIDwvc3ZnPlxuICBgXG59XG4iLCJjb25zdCBQbHVnaW4gPSByZXF1aXJlKCcuLi9QbHVnaW4nKVxuY29uc3QgV2ViY2FtUHJvdmlkZXIgPSByZXF1aXJlKCcuLi8uLi91cHB5LWJhc2Uvc3JjL3BsdWdpbnMvV2ViY2FtJylcbmNvbnN0IHsgZXh0ZW5kIH0gPSByZXF1aXJlKCcuLi8uLi9jb3JlL1V0aWxzJylcbmNvbnN0IFdlYmNhbUljb24gPSByZXF1aXJlKCcuL1dlYmNhbUljb24nKVxuY29uc3QgQ2FtZXJhU2NyZWVuID0gcmVxdWlyZSgnLi9DYW1lcmFTY3JlZW4nKVxuY29uc3QgUGVybWlzc2lvbnNTY3JlZW4gPSByZXF1aXJlKCcuL1Blcm1pc3Npb25zU2NyZWVuJylcblxuLyoqXG4gKiBXZWJjYW1cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBXZWJjYW0gZXh0ZW5kcyBQbHVnaW4ge1xuICBjb25zdHJ1Y3RvciAoY29yZSwgb3B0cykge1xuICAgIHN1cGVyKGNvcmUsIG9wdHMpXG4gICAgdGhpcy51c2VyTWVkaWEgPSB0cnVlXG4gICAgdGhpcy5wcm90b2NvbCA9IGxvY2F0aW9uLnByb3RvY29sLm1hdGNoKC9odHRwcy9pKSA/ICdodHRwcycgOiAnaHR0cCdcbiAgICB0aGlzLnR5cGUgPSAnYWNxdWlyZXInXG4gICAgdGhpcy5pZCA9ICdXZWJjYW0nXG4gICAgdGhpcy50aXRsZSA9ICdXZWJjYW0nXG4gICAgdGhpcy5pY29uID0gV2ViY2FtSWNvbigpXG5cbiAgICAvLyBzZXQgZGVmYXVsdCBvcHRpb25zXG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICBlbmFibGVGbGFzaDogdHJ1ZVxuICAgIH1cblxuICAgIHRoaXMucGFyYW1zID0ge1xuICAgICAgc3dmVVJMOiAnd2ViY2FtLnN3ZicsXG4gICAgICB3aWR0aDogNDAwLFxuICAgICAgaGVpZ2h0OiAzMDAsXG4gICAgICBkZXN0X3dpZHRoOiA4MDAsICAgICAgICAgLy8gc2l6ZSBvZiBjYXB0dXJlZCBpbWFnZVxuICAgICAgZGVzdF9oZWlnaHQ6IDYwMCwgICAgICAgIC8vIHRoZXNlIGRlZmF1bHQgdG8gd2lkdGgvaGVpZ2h0XG4gICAgICBpbWFnZV9mb3JtYXQ6ICdqcGVnJywgIC8vIGltYWdlIGZvcm1hdCAobWF5IGJlIGpwZWcgb3IgcG5nKVxuICAgICAganBlZ19xdWFsaXR5OiA5MCwgICAgICAvLyBqcGVnIGltYWdlIHF1YWxpdHkgZnJvbSAwICh3b3JzdCkgdG8gMTAwIChiZXN0KVxuICAgICAgZW5hYmxlX2ZsYXNoOiB0cnVlLCAgICAvLyBlbmFibGUgZmxhc2ggZmFsbGJhY2ssXG4gICAgICBmb3JjZV9mbGFzaDogZmFsc2UsICAgIC8vIGZvcmNlIGZsYXNoIG1vZGUsXG4gICAgICBmbGlwX2hvcml6OiBmYWxzZSwgICAgIC8vIGZsaXAgaW1hZ2UgaG9yaXogKG1pcnJvciBtb2RlKVxuICAgICAgZnBzOiAzMCwgICAgICAgICAgICAgICAvLyBjYW1lcmEgZnJhbWVzIHBlciBzZWNvbmRcbiAgICAgIHVwbG9hZF9uYW1lOiAnd2ViY2FtJywgLy8gbmFtZSBvZiBmaWxlIGluIHVwbG9hZCBwb3N0IGRhdGFcbiAgICAgIGNvbnN0cmFpbnRzOiBudWxsLCAgICAgLy8gY3VzdG9tIHVzZXIgbWVkaWEgY29uc3RyYWludHMsXG4gICAgICBmbGFzaE5vdERldGVjdGVkVGV4dDogJ0VSUk9SOiBObyBBZG9iZSBGbGFzaCBQbGF5ZXIgZGV0ZWN0ZWQuICBXZWJjYW0uanMgcmVsaWVzIG9uIEZsYXNoIGZvciBicm93c2VycyB0aGF0IGRvIG5vdCBzdXBwb3J0IGdldFVzZXJNZWRpYSAobGlrZSB5b3VycykuJyxcbiAgICAgIG5vSW50ZXJmYWNlRm91bmRUZXh0OiAnTm8gc3VwcG9ydGVkIHdlYmNhbSBpbnRlcmZhY2UgZm91bmQuJyxcbiAgICAgIHVuZnJlZXplX3NuYXA6IHRydWUgICAgLy8gV2hldGhlciB0byB1bmZyZWV6ZSB0aGUgY2FtZXJhIGFmdGVyIHNuYXAgKGRlZmF1bHRzIHRvIHRydWUpXG4gICAgfVxuXG4gICAgLy8gbWVyZ2UgZGVmYXVsdCBvcHRpb25zIHdpdGggdGhlIG9uZXMgc2V0IGJ5IHVzZXJcbiAgICB0aGlzLm9wdHMgPSBPYmplY3QuYXNzaWduKHt9LCBkZWZhdWx0T3B0aW9ucywgb3B0cylcblxuICAgIHRoaXMuaW5zdGFsbCA9IHRoaXMuaW5zdGFsbC5iaW5kKHRoaXMpXG4gICAgdGhpcy51cGRhdGVTdGF0ZSA9IHRoaXMudXBkYXRlU3RhdGUuYmluZCh0aGlzKVxuXG4gICAgdGhpcy5yZW5kZXIgPSB0aGlzLnJlbmRlci5iaW5kKHRoaXMpXG5cbiAgICAvLyBDYW1lcmEgY29udHJvbHNcbiAgICB0aGlzLnN0YXJ0ID0gdGhpcy5zdGFydC5iaW5kKHRoaXMpXG4gICAgdGhpcy5zdG9wID0gdGhpcy5zdG9wLmJpbmQodGhpcylcbiAgICB0aGlzLnRha2VTbmFwc2hvdCA9IHRoaXMudGFrZVNuYXBzaG90LmJpbmQodGhpcylcblxuICAgIHRoaXMud2ViY2FtID0gbmV3IFdlYmNhbVByb3ZpZGVyKHRoaXMub3B0cywgdGhpcy5wYXJhbXMpXG4gICAgdGhpcy53ZWJjYW1BY3RpdmUgPSBmYWxzZVxuICB9XG5cbiAgc3RhcnQgKCkge1xuICAgIHRoaXMud2ViY2FtQWN0aXZlID0gdHJ1ZVxuXG4gICAgdGhpcy53ZWJjYW0uc3RhcnQoKVxuICAgICAgLnRoZW4oKHN0cmVhbSkgPT4ge1xuICAgICAgICB0aGlzLnN0cmVhbSA9IHN0cmVhbVxuICAgICAgICB0aGlzLnVwZGF0ZVN0YXRlKHtcbiAgICAgICAgICAvLyB2aWRlb1N0cmVhbTogc3RyZWFtLFxuICAgICAgICAgIGNhbWVyYVJlYWR5OiB0cnVlXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgICAgLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgdGhpcy51cGRhdGVTdGF0ZSh7XG4gICAgICAgICAgY2FtZXJhRXJyb3I6IGVyclxuICAgICAgICB9KVxuICAgICAgfSlcbiAgfVxuXG4gIHN0b3AgKCkge1xuICAgIHRoaXMuc3RyZWFtLmdldFZpZGVvVHJhY2tzKClbMF0uc3RvcCgpXG4gICAgdGhpcy53ZWJjYW1BY3RpdmUgPSBmYWxzZVxuICAgIHRoaXMuc3RyZWFtID0gbnVsbFxuICAgIHRoaXMuc3RyZWFtU3JjID0gbnVsbFxuICB9XG5cbiAgdGFrZVNuYXBzaG90ICgpIHtcbiAgICBjb25zdCBvcHRzID0ge1xuICAgICAgbmFtZTogYHdlYmNhbS0ke0RhdGUubm93KCl9LmpwZ2AsXG4gICAgICBtaW1lVHlwZTogJ2ltYWdlL2pwZWcnXG4gICAgfVxuXG4gICAgY29uc3QgdmlkZW8gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuVXBweVdlYmNhbS12aWRlbycpXG5cbiAgICBjb25zdCBpbWFnZSA9IHRoaXMud2ViY2FtLmdldEltYWdlKHZpZGVvLCBvcHRzKVxuXG4gICAgY29uc3QgdGFnRmlsZSA9IHtcbiAgICAgIHNvdXJjZTogdGhpcy5pZCxcbiAgICAgIG5hbWU6IG9wdHMubmFtZSxcbiAgICAgIGRhdGE6IGltYWdlLmRhdGEsXG4gICAgICB0eXBlOiBvcHRzLm1pbWVUeXBlXG4gICAgfVxuXG4gICAgdGhpcy5jb3JlLmVtaXR0ZXIuZW1pdCgnY29yZTpmaWxlLWFkZCcsIHRhZ0ZpbGUpXG4gIH1cblxuICByZW5kZXIgKHN0YXRlKSB7XG4gICAgaWYgKCF0aGlzLndlYmNhbUFjdGl2ZSkge1xuICAgICAgdGhpcy5zdGFydCgpXG4gICAgfVxuXG4gICAgaWYgKCFzdGF0ZS53ZWJjYW0uY2FtZXJhUmVhZHkgJiYgIXN0YXRlLndlYmNhbS51c2VUaGVGbGFzaCkge1xuICAgICAgcmV0dXJuIFBlcm1pc3Npb25zU2NyZWVuKHN0YXRlLndlYmNhbSlcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuc3RyZWFtU3JjKSB7XG4gICAgICB0aGlzLnN0cmVhbVNyYyA9IHRoaXMuc3RyZWFtID8gVVJMLmNyZWF0ZU9iamVjdFVSTCh0aGlzLnN0cmVhbSkgOiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIENhbWVyYVNjcmVlbihleHRlbmQoc3RhdGUud2ViY2FtLCB7XG4gICAgICBvblNuYXBzaG90OiB0aGlzLnRha2VTbmFwc2hvdCxcbiAgICAgIG9uRm9jdXM6IHRoaXMuZm9jdXMsXG4gICAgICBvblN0b3A6IHRoaXMuc3RvcCxcbiAgICAgIGdldFNXRkhUTUw6IHRoaXMud2ViY2FtLmdldFNXRkhUTUwsXG4gICAgICBzcmM6IHRoaXMuc3RyZWFtU3JjXG4gICAgfSkpXG4gIH1cblxuICBmb2N1cyAoKSB7XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLmNvcmUuZW1pdHRlci5lbWl0KCdpbmZvcm1lcicsICdTbWlsZSEnLCAnaW5mbycsIDIwMDApXG4gICAgfSwgMTAwMClcbiAgfVxuXG4gIGluc3RhbGwgKCkge1xuICAgIHRoaXMud2ViY2FtLmluaXQoKVxuICAgIHRoaXMuY29yZS5zZXRTdGF0ZSh7XG4gICAgICB3ZWJjYW06IHtcbiAgICAgICAgY2FtZXJhUmVhZHk6IGZhbHNlXG4gICAgICB9XG4gICAgfSlcblxuICAgIGNvbnN0IHRhcmdldCA9IHRoaXMub3B0cy50YXJnZXRcbiAgICBjb25zdCBwbHVnaW4gPSB0aGlzXG4gICAgdGhpcy50YXJnZXQgPSB0aGlzLm1vdW50KHRhcmdldCwgcGx1Z2luKVxuICB9XG5cbiAgLyoqXG4gICAqIExpdHRsZSBzaG9ydGhhbmQgdG8gdXBkYXRlIHRoZSBzdGF0ZSB3aXRoIG15IG5ldyBzdGF0ZVxuICAgKi9cbiAgdXBkYXRlU3RhdGUgKG5ld1N0YXRlKSB7XG4gICAgY29uc3Qge3N0YXRlfSA9IHRoaXMuY29yZVxuICAgIGNvbnN0IHdlYmNhbSA9IE9iamVjdC5hc3NpZ24oe30sIHN0YXRlLndlYmNhbSwgbmV3U3RhdGUpXG5cbiAgICB0aGlzLmNvcmUuc2V0U3RhdGUoe3dlYmNhbX0pXG4gIH1cbn1cbiIsIid1c2Ugc3RyaWN0J1xuXG5yZXF1aXJlKCd3aGF0d2ctZmV0Y2gnKVxuXG5jb25zdCBfZ2V0TmFtZSA9IChpZCkgPT4ge1xuICByZXR1cm4gaWQuc3BsaXQoJy0nKS5tYXAoKHMpID0+IHMuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzLnNsaWNlKDEpKS5qb2luKCcgJylcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBQcm92aWRlciB7XG4gIGNvbnN0cnVjdG9yIChvcHRzKSB7XG4gICAgdGhpcy5vcHRzID0gb3B0c1xuICAgIHRoaXMucHJvdmlkZXIgPSBvcHRzLnByb3ZpZGVyXG4gICAgdGhpcy5pZCA9IHRoaXMucHJvdmlkZXJcbiAgICB0aGlzLmF1dGhQcm92aWRlciA9IG9wdHMuYXV0aFByb3ZpZGVyIHx8IHRoaXMucHJvdmlkZXJcbiAgICB0aGlzLm5hbWUgPSB0aGlzLm9wdHMubmFtZSB8fCBfZ2V0TmFtZSh0aGlzLmlkKVxuICB9XG5cbiAgYXV0aCAoKSB7XG4gICAgcmV0dXJuIGZldGNoKGAke3RoaXMub3B0cy5ob3N0fS8ke3RoaXMuaWR9L2F1dGhgLCB7XG4gICAgICBtZXRob2Q6ICdnZXQnLFxuICAgICAgY3JlZGVudGlhbHM6ICdpbmNsdWRlJyxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi5qc29uJ1xuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4oKHJlcykgPT4ge1xuICAgICAgcmV0dXJuIHJlcy5qc29uKClcbiAgICAgIC50aGVuKChwYXlsb2FkKSA9PiB7XG4gICAgICAgIHJldHVybiBwYXlsb2FkLmF1dGhlbnRpY2F0ZWRcbiAgICAgIH0pXG4gICAgfSlcbiAgfVxuXG4gIGxpc3QgKGRpcmVjdG9yeSkge1xuICAgIHJldHVybiBmZXRjaChgJHt0aGlzLm9wdHMuaG9zdH0vJHt0aGlzLmlkfS9saXN0LyR7ZGlyZWN0b3J5IHx8ICcnfWAsIHtcbiAgICAgIG1ldGhvZDogJ2dldCcsXG4gICAgICBjcmVkZW50aWFsczogJ2luY2x1ZGUnLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nXG4gICAgICB9XG4gICAgfSlcbiAgICAudGhlbigocmVzKSA9PiByZXMuanNvbigpKVxuICB9XG5cbiAgbG9nb3V0IChyZWRpcmVjdCA9IGxvY2F0aW9uLmhyZWYpIHtcbiAgICByZXR1cm4gZmV0Y2goYCR7dGhpcy5vcHRzLmhvc3R9LyR7dGhpcy5pZH0vbG9nb3V0P3JlZGlyZWN0PSR7cmVkaXJlY3R9YCwge1xuICAgICAgbWV0aG9kOiAnZ2V0JyxcbiAgICAgIGNyZWRlbnRpYWxzOiAnaW5jbHVkZScsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbidcbiAgICAgIH1cbiAgICB9KVxuICB9XG59XG4iLCIndXNlIHN0cmljdCdcblxuY29uc3QgZGF0YVVSSXRvRmlsZSA9IHJlcXVpcmUoJy4uL3V0aWxzL2RhdGFVUkl0b0ZpbGUnKVxuXG4vKipcbiAqIFdlYmNhbSBQbHVnaW5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBXZWJjYW0ge1xuICBjb25zdHJ1Y3RvciAob3B0cyA9IHt9LCBwYXJhbXMgPSB7fSkge1xuICAgIHRoaXMuX3VzZXJNZWRpYVxuICAgIHRoaXMudXNlck1lZGlhID0gdHJ1ZVxuICAgIHRoaXMucHJvdG9jb2wgPSBsb2NhdGlvbi5wcm90b2NvbC5tYXRjaCgvaHR0cHMvaSkgPyAnaHR0cHMnIDogJ2h0dHAnXG5cbiAgICAvLyBzZXQgZGVmYXVsdCBvcHRpb25zXG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICBlbmFibGVGbGFzaDogdHJ1ZVxuICAgIH1cblxuICAgIGNvbnN0IGRlZmF1bHRQYXJhbXMgPSB7XG4gICAgICBzd2ZVUkw6ICd3ZWJjYW0uc3dmJyxcbiAgICAgIHdpZHRoOiA0MDAsXG4gICAgICBoZWlnaHQ6IDMwMCxcbiAgICAgIGRlc3Rfd2lkdGg6IDgwMCwgICAgICAgICAvLyBzaXplIG9mIGNhcHR1cmVkIGltYWdlXG4gICAgICBkZXN0X2hlaWdodDogNjAwLCAgICAgICAgLy8gdGhlc2UgZGVmYXVsdCB0byB3aWR0aC9oZWlnaHRcbiAgICAgIGltYWdlX2Zvcm1hdDogJ2pwZWcnLCAgLy8gaW1hZ2UgZm9ybWF0IChtYXkgYmUganBlZyBvciBwbmcpXG4gICAgICBqcGVnX3F1YWxpdHk6IDkwLCAgICAgIC8vIGpwZWcgaW1hZ2UgcXVhbGl0eSBmcm9tIDAgKHdvcnN0KSB0byAxMDAgKGJlc3QpXG4gICAgICBlbmFibGVfZmxhc2g6IHRydWUsICAgIC8vIGVuYWJsZSBmbGFzaCBmYWxsYmFjayxcbiAgICAgIGZvcmNlX2ZsYXNoOiBmYWxzZSwgICAgLy8gZm9yY2UgZmxhc2ggbW9kZSxcbiAgICAgIGZsaXBfaG9yaXo6IGZhbHNlLCAgICAgLy8gZmxpcCBpbWFnZSBob3JpeiAobWlycm9yIG1vZGUpXG4gICAgICBmcHM6IDMwLCAgICAgICAgICAgICAgIC8vIGNhbWVyYSBmcmFtZXMgcGVyIHNlY29uZFxuICAgICAgdXBsb2FkX25hbWU6ICd3ZWJjYW0nLCAvLyBuYW1lIG9mIGZpbGUgaW4gdXBsb2FkIHBvc3QgZGF0YVxuICAgICAgY29uc3RyYWludHM6IG51bGwsICAgICAvLyBjdXN0b20gdXNlciBtZWRpYSBjb25zdHJhaW50cyxcbiAgICAgIGZsYXNoTm90RGV0ZWN0ZWRUZXh0OiAnRVJST1I6IE5vIEFkb2JlIEZsYXNoIFBsYXllciBkZXRlY3RlZC4gIFdlYmNhbS5qcyByZWxpZXMgb24gRmxhc2ggZm9yIGJyb3dzZXJzIHRoYXQgZG8gbm90IHN1cHBvcnQgZ2V0VXNlck1lZGlhIChsaWtlIHlvdXJzKS4nLFxuICAgICAgbm9JbnRlcmZhY2VGb3VuZFRleHQ6ICdObyBzdXBwb3J0ZWQgd2ViY2FtIGludGVyZmFjZSBmb3VuZC4nLFxuICAgICAgdW5mcmVlemVfc25hcDogdHJ1ZSAgICAvLyBXaGV0aGVyIHRvIHVuZnJlZXplIHRoZSBjYW1lcmEgYWZ0ZXIgc25hcCAoZGVmYXVsdHMgdG8gdHJ1ZSlcbiAgICB9XG5cbiAgICB0aGlzLnBhcmFtcyA9IE9iamVjdC5hc3NpZ24oe30sIGRlZmF1bHRQYXJhbXMsIHBhcmFtcylcblxuICAgIC8vIG1lcmdlIGRlZmF1bHQgb3B0aW9ucyB3aXRoIHRoZSBvbmVzIHNldCBieSB1c2VyXG4gICAgdGhpcy5vcHRzID0gT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdE9wdGlvbnMsIG9wdHMpXG5cbiAgICAvLyBDYW1lcmEgY29udHJvbHNcbiAgICB0aGlzLnN0YXJ0ID0gdGhpcy5zdGFydC5iaW5kKHRoaXMpXG4gICAgdGhpcy5pbml0ID0gdGhpcy5pbml0LmJpbmQodGhpcylcbiAgICB0aGlzLnN0b3AgPSB0aGlzLnN0b3AuYmluZCh0aGlzKVxuICAgIC8vIHRoaXMuc3RhcnRSZWNvcmRpbmcgPSB0aGlzLnN0YXJ0UmVjb3JkaW5nLmJpbmQodGhpcylcbiAgICAvLyB0aGlzLnN0b3BSZWNvcmRpbmcgPSB0aGlzLnN0b3BSZWNvcmRpbmcuYmluZCh0aGlzKVxuICAgIHRoaXMudGFrZVNuYXBzaG90ID0gdGhpcy50YWtlU25hcHNob3QuYmluZCh0aGlzKVxuICAgIHRoaXMuZ2V0SW1hZ2UgPSB0aGlzLmdldEltYWdlLmJpbmQodGhpcylcbiAgICB0aGlzLmdldFNXRkhUTUwgPSB0aGlzLmdldFNXRkhUTUwuYmluZCh0aGlzKVxuICAgIHRoaXMuZGV0ZWN0Rmxhc2ggPSB0aGlzLmRldGVjdEZsYXNoLmJpbmQodGhpcylcbiAgICB0aGlzLmdldFVzZXJNZWRpYSA9IHRoaXMuZ2V0VXNlck1lZGlhLmJpbmQodGhpcylcbiAgICB0aGlzLmdldE1lZGlhRGV2aWNlcyA9IHRoaXMuZ2V0TWVkaWFEZXZpY2VzLmJpbmQodGhpcylcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgZm9yIGdldFVzZXJNZWRpYSBzdXBwb3J0XG4gICAqL1xuICBpbml0ICgpIHtcbiAgICAvLyBpbml0aWFsaXplLCBjaGVjayBmb3IgZ2V0VXNlck1lZGlhIHN1cHBvcnRcbiAgICB0aGlzLm1lZGlhRGV2aWNlcyA9IHRoaXMuZ2V0TWVkaWFEZXZpY2VzKClcblxuICAgIHRoaXMudXNlck1lZGlhID0gdGhpcy5nZXRVc2VyTWVkaWEodGhpcy5tZWRpYURldmljZXMpXG5cbiAgICAvLyBNYWtlIHN1cmUgbWVkaWEgc3RyZWFtIGlzIGNsb3NlZCB3aGVuIG5hdmlnYXRpbmcgYXdheSBmcm9tIHBhZ2VcbiAgICBpZiAodGhpcy51c2VyTWVkaWEpIHtcbiAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdiZWZvcmV1bmxvYWQnLCAoZXZlbnQpID0+IHtcbiAgICAgICAgdGhpcy5yZXNldCgpXG4gICAgICB9KVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBtZWRpYURldmljZXM6IHRoaXMubWVkaWFEZXZpY2VzLFxuICAgICAgdXNlck1lZGlhOiB0aGlzLnVzZXJNZWRpYVxuICAgIH1cbiAgfVxuXG4gIC8vIFNldHVwIGdldFVzZXJNZWRpYSwgd2l0aCBwb2x5ZmlsbCBmb3Igb2xkZXIgYnJvd3NlcnNcbiAgLy8gQWRhcHRlZCBmcm9tOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvTWVkaWFEZXZpY2VzL2dldFVzZXJNZWRpYVxuICBnZXRNZWRpYURldmljZXMgKCkge1xuICAgIHJldHVybiAobmF2aWdhdG9yLm1lZGlhRGV2aWNlcyAmJiBuYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmdldFVzZXJNZWRpYSlcbiAgICAgID8gbmF2aWdhdG9yLm1lZGlhRGV2aWNlcyA6ICgobmF2aWdhdG9yLm1vekdldFVzZXJNZWRpYSB8fCBuYXZpZ2F0b3Iud2Via2l0R2V0VXNlck1lZGlhKSA/IHtcbiAgICAgICAgZ2V0VXNlck1lZGlhOiBmdW5jdGlvbiAob3B0cykge1xuICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgICAgICAobmF2aWdhdG9yLm1vekdldFVzZXJNZWRpYSB8fFxuICAgICAgICAgICAgbmF2aWdhdG9yLndlYmtpdEdldFVzZXJNZWRpYSkuY2FsbChuYXZpZ2F0b3IsIG9wdHMsIHJlc29sdmUsIHJlamVjdClcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9IDogbnVsbClcbiAgfVxuXG4gIGdldFVzZXJNZWRpYSAobWVkaWFEZXZpY2VzKSB7XG4gICAgY29uc3QgdXNlck1lZGlhID0gdHJ1ZVxuICAgIC8vIE9sZGVyIHZlcnNpb25zIG9mIGZpcmVmb3ggKDwgMjEpIGFwcGFyZW50bHkgY2xhaW0gc3VwcG9ydCBidXQgdXNlciBtZWRpYSBkb2VzIG5vdCBhY3R1YWxseSB3b3JrXG4gICAgaWYgKG5hdmlnYXRvci51c2VyQWdlbnQubWF0Y2goL0ZpcmVmb3hcXEQrKFxcZCspLykpIHtcbiAgICAgIGlmIChwYXJzZUludChSZWdFeHAuJDEsIDEwKSA8IDIxKSB7XG4gICAgICAgIHJldHVybiBudWxsXG4gICAgICB9XG4gICAgfVxuXG4gICAgd2luZG93LlVSTCA9IHdpbmRvdy5VUkwgfHwgd2luZG93LndlYmtpdFVSTCB8fCB3aW5kb3cubW96VVJMIHx8IHdpbmRvdy5tc1VSTFxuICAgIHJldHVybiB1c2VyTWVkaWEgJiYgISFtZWRpYURldmljZXMgJiYgISF3aW5kb3cuVVJMXG4gIH1cblxuICBzdGFydCAoKSB7XG4gICAgdGhpcy51c2VyTWVkaWEgPSB0aGlzLl91c2VyTWVkaWEgPT09IHVuZGVmaW5lZCA/IHRoaXMudXNlck1lZGlhIDogdGhpcy5fdXNlck1lZGlhXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGlmICh0aGlzLnVzZXJNZWRpYSkge1xuICAgICAgICAvLyBhc2sgdXNlciBmb3IgYWNjZXNzIHRvIHRoZWlyIGNhbWVyYVxuICAgICAgICB0aGlzLm1lZGlhRGV2aWNlcy5nZXRVc2VyTWVkaWEoe1xuICAgICAgICAgIGF1ZGlvOiBmYWxzZSxcbiAgICAgICAgICB2aWRlbzogdHJ1ZVxuICAgICAgICB9KVxuICAgICAgICAudGhlbigoc3RyZWFtKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHJlc29sdmUoc3RyZWFtKVxuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKGVycikgPT4ge1xuICAgICAgICAgIHJldHVybiByZWplY3QoZXJyKVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICAvKipcbiAgICogRGV0ZWN0cyBpZiBicm93c2VyIHN1cHBvcnRzIGZsYXNoXG4gICAqIENvZGUgc25pcHBldCBib3Jyb3dlZCBmcm9tOiBodHRwczovL2dpdGh1Yi5jb20vc3dmb2JqZWN0L3N3Zm9iamVjdFxuICAgKlxuICAgKiBAcmV0dXJuIHtib29sfSBmbGFzaCBzdXBwb3J0ZWRcbiAgICovXG4gIGRldGVjdEZsYXNoICgpIHtcbiAgICBjb25zdCBTSE9DS1dBVkVfRkxBU0ggPSAnU2hvY2t3YXZlIEZsYXNoJ1xuICAgIGNvbnN0IFNIT0NLV0FWRV9GTEFTSF9BWCA9ICdTaG9ja3dhdmVGbGFzaC5TaG9ja3dhdmVGbGFzaCdcbiAgICBjb25zdCBGTEFTSF9NSU1FX1RZUEUgPSAnYXBwbGljYXRpb24veC1zaG9ja3dhdmUtZmxhc2gnXG4gICAgY29uc3Qgd2luID0gd2luZG93XG4gICAgY29uc3QgbmF2ID0gbmF2aWdhdG9yXG4gICAgbGV0IGhhc0ZsYXNoID0gZmFsc2VcblxuICAgIGlmICh0eXBlb2YgbmF2LnBsdWdpbnMgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBuYXYucGx1Z2luc1tTSE9DS1dBVkVfRkxBU0hdID09PSAnb2JqZWN0Jykge1xuICAgICAgdmFyIGRlc2MgPSBuYXYucGx1Z2luc1tTSE9DS1dBVkVfRkxBU0hdLmRlc2NyaXB0aW9uXG4gICAgICBpZiAoZGVzYyAmJiAodHlwZW9mIG5hdi5taW1lVHlwZXMgIT09ICd1bmRlZmluZWQnICYmIG5hdi5taW1lVHlwZXNbRkxBU0hfTUlNRV9UWVBFXSAmJiBuYXYubWltZVR5cGVzW0ZMQVNIX01JTUVfVFlQRV0uZW5hYmxlZFBsdWdpbikpIHtcbiAgICAgICAgaGFzRmxhc2ggPSB0cnVlXG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygd2luLkFjdGl2ZVhPYmplY3QgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0cnkge1xuICAgICAgICB2YXIgYXggPSBuZXcgd2luLkFjdGl2ZVhPYmplY3QoU0hPQ0tXQVZFX0ZMQVNIX0FYKVxuICAgICAgICBpZiAoYXgpIHtcbiAgICAgICAgICB2YXIgdmVyID0gYXguR2V0VmFyaWFibGUoJyR2ZXJzaW9uJylcbiAgICAgICAgICBpZiAodmVyKSBoYXNGbGFzaCA9IHRydWVcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge31cbiAgICB9XG5cbiAgICByZXR1cm4gaGFzRmxhc2hcbiAgfVxuXG4gIHJlc2V0ICgpIHtcbiAgICAvLyBzaHV0ZG93biBjYW1lcmEsIHJlc2V0IHRvIHBvdGVudGlhbGx5IGF0dGFjaCBhZ2FpblxuICAgIGlmICh0aGlzLnByZXZpZXdfYWN0aXZlKSB0aGlzLnVuZnJlZXplKClcblxuICAgIGlmICh0aGlzLnVzZXJNZWRpYSkge1xuICAgICAgaWYgKHRoaXMuc3RyZWFtKSB7XG4gICAgICAgIGlmICh0aGlzLnN0cmVhbS5nZXRWaWRlb1RyYWNrcykge1xuICAgICAgICAgIC8vIGdldCB2aWRlbyB0cmFjayB0byBjYWxsIHN0b3Agb24gaXRcbiAgICAgICAgICB2YXIgdHJhY2tzID0gdGhpcy5zdHJlYW0uZ2V0VmlkZW9UcmFja3MoKVxuICAgICAgICAgIGlmICh0cmFja3MgJiYgdHJhY2tzWzBdICYmIHRyYWNrc1swXS5zdG9wKSB0cmFja3NbMF0uc3RvcCgpXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5zdHJlYW0uc3RvcCkge1xuICAgICAgICAgIC8vIGRlcHJlY2F0ZWQsIG1heSBiZSByZW1vdmVkIGluIGZ1dHVyZVxuICAgICAgICAgIHRoaXMuc3RyZWFtLnN0b3AoKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBkZWxldGUgdGhpcy5zdHJlYW1cbiAgICAgIGRlbGV0ZSB0aGlzLnZpZGVvXG4gICAgfVxuXG4gICAgaWYgKHRoaXMudXNlck1lZGlhICE9PSB0cnVlKSB7XG4gICAgICAvLyBjYWxsIGZvciB0dXJuIG9mZiBjYW1lcmEgaW4gZmxhc2hcbiAgICAgIHRoaXMuZ2V0TW92aWUoKS5fcmVsZWFzZUNhbWVyYSgpXG4gICAgfVxuICB9XG5cbiAgZ2V0U1dGSFRNTCAoKSB7XG4gICAgLy8gUmV0dXJuIEhUTUwgZm9yIGVtYmVkZGluZyBmbGFzaCBiYXNlZCB3ZWJjYW0gY2FwdHVyZSBtb3ZpZVxuICAgIHZhciBzd2ZVUkwgPSB0aGlzLnBhcmFtcy5zd2ZVUkxcblxuICAgIC8vIG1ha2Ugc3VyZSB3ZSBhcmVuJ3QgcnVubmluZyBsb2NhbGx5IChmbGFzaCBkb2Vzbid0IHdvcmspXG4gICAgaWYgKGxvY2F0aW9uLnByb3RvY29sLm1hdGNoKC9maWxlLykpIHtcbiAgICAgIHJldHVybiAnPGgzIHN0eWxlPVwiY29sb3I6cmVkXCI+RVJST1I6IHRoZSBXZWJjYW0uanMgRmxhc2ggZmFsbGJhY2sgZG9lcyBub3Qgd29yayBmcm9tIGxvY2FsIGRpc2suICBQbGVhc2UgcnVuIGl0IGZyb20gYSB3ZWIgc2VydmVyLjwvaDM+J1xuICAgIH1cblxuICAgIC8vIG1ha2Ugc3VyZSB3ZSBoYXZlIGZsYXNoXG4gICAgaWYgKCF0aGlzLmRldGVjdEZsYXNoKCkpIHtcbiAgICAgIHJldHVybiAnPGgzIHN0eWxlPVwiY29sb3I6cmVkXCI+Tm8gZmxhc2g8L2gzPidcbiAgICB9XG5cbiAgICAvLyBzZXQgZGVmYXVsdCBzd2ZVUkwgaWYgbm90IGV4cGxpY2l0bHkgc2V0XG4gICAgaWYgKCFzd2ZVUkwpIHtcbiAgICAgIC8vIGZpbmQgb3VyIHNjcmlwdCB0YWcsIGFuZCB1c2UgdGhhdCBiYXNlIFVSTFxuICAgICAgdmFyIGJhc2VVcmwgPSAnJ1xuICAgICAgdmFyIHNjcHRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3NjcmlwdCcpXG4gICAgICBmb3IgKHZhciBpZHggPSAwLCBsZW4gPSBzY3B0cy5sZW5ndGg7IGlkeCA8IGxlbjsgaWR4KyspIHtcbiAgICAgICAgdmFyIHNyYyA9IHNjcHRzW2lkeF0uZ2V0QXR0cmlidXRlKCdzcmMnKVxuICAgICAgICBpZiAoc3JjICYmIHNyYy5tYXRjaCgvXFwvd2ViY2FtKFxcLm1pbik/XFwuanMvKSkge1xuICAgICAgICAgIGJhc2VVcmwgPSBzcmMucmVwbGFjZSgvXFwvd2ViY2FtKFxcLm1pbik/XFwuanMuKiQvLCAnJylcbiAgICAgICAgICBpZHggPSBsZW5cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGJhc2VVcmwpIHN3ZlVSTCA9IGJhc2VVcmwgKyAnL3dlYmNhbS5zd2YnXG4gICAgICBlbHNlIHN3ZlVSTCA9ICd3ZWJjYW0uc3dmJ1xuICAgIH1cblxuICAgIC8vIC8vIGlmIHRoaXMgaXMgdGhlIHVzZXIncyBmaXJzdCB2aXNpdCwgc2V0IGZsYXNodmFyIHNvIGZsYXNoIHByaXZhY3kgc2V0dGluZ3MgcGFuZWwgaXMgc2hvd24gZmlyc3RcbiAgICAvLyBpZiAod2luZG93LmxvY2FsU3RvcmFnZSAmJiAhbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ3Zpc2l0ZWQnKSkge1xuICAgIC8vICAgLy8gdGhpcy5wYXJhbXMubmV3X3VzZXIgPSAxXG4gICAgLy8gICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgndmlzaXRlZCcsIDEpXG4gICAgLy8gfVxuICAgIC8vIHRoaXMucGFyYW1zLm5ld191c2VyID0gMVxuICAgIC8vIGNvbnN0cnVjdCBmbGFzaHZhcnMgc3RyaW5nXG4gICAgdmFyIGZsYXNodmFycyA9ICcnXG4gICAgZm9yICh2YXIga2V5IGluIHRoaXMucGFyYW1zKSB7XG4gICAgICBpZiAoZmxhc2h2YXJzKSBmbGFzaHZhcnMgKz0gJyYnXG4gICAgICBmbGFzaHZhcnMgKz0ga2V5ICsgJz0nICsgZXNjYXBlKHRoaXMucGFyYW1zW2tleV0pXG4gICAgfVxuXG4gICAgLy8gY29uc3RydWN0IG9iamVjdC9lbWJlZCB0YWdcblxuICAgIHJldHVybiBgPG9iamVjdCBjbGFzc2lkPVwiY2xzaWQ6ZDI3Y2RiNmUtYWU2ZC0xMWNmLTk2YjgtNDQ0NTUzNTQwMDAwXCIgdHlwZT1cImFwcGxpY2F0aW9uL3gtc2hvY2t3YXZlLWZsYXNoXCIgY29kZWJhc2U9XCIke3RoaXMucHJvdG9jb2x9Oi8vZG93bmxvYWQubWFjcm9tZWRpYS5jb20vcHViL3Nob2Nrd2F2ZS9jYWJzL2ZsYXNoL3N3Zmxhc2guY2FiI3ZlcnNpb249OSwwLDAsMFwiIHdpZHRoPVwiJHt0aGlzLnBhcmFtcy53aWR0aH1cIiBoZWlnaHQ9XCIke3RoaXMucGFyYW1zLmhlaWdodH1cIiBpZD1cIndlYmNhbV9tb3ZpZV9vYmpcIiBhbGlnbj1cIm1pZGRsZVwiPjxwYXJhbSBuYW1lPVwid21vZGVcIiB2YWx1ZT1cIm9wYXF1ZVwiIC8+PHBhcmFtIG5hbWU9XCJhbGxvd1NjcmlwdEFjY2Vzc1wiIHZhbHVlPVwiYWx3YXlzXCIgLz48cGFyYW0gbmFtZT1cImFsbG93RnVsbFNjcmVlblwiIHZhbHVlPVwiZmFsc2VcIiAvPjxwYXJhbSBuYW1lPVwibW92aWVcIiB2YWx1ZT1cIiR7c3dmVVJMfVwiIC8+PHBhcmFtIG5hbWU9XCJsb29wXCIgdmFsdWU9XCJmYWxzZVwiIC8+PHBhcmFtIG5hbWU9XCJtZW51XCIgdmFsdWU9XCJmYWxzZVwiIC8+PHBhcmFtIG5hbWU9XCJxdWFsaXR5XCIgdmFsdWU9XCJiZXN0XCIgLz48cGFyYW0gbmFtZT1cImJnY29sb3JcIiB2YWx1ZT1cIiNmZmZmZmZcIiAvPjxwYXJhbSBuYW1lPVwiZmxhc2h2YXJzXCIgdmFsdWU9XCIke2ZsYXNodmFyc31cIi8+PGVtYmVkIGlkPVwid2ViY2FtX21vdmllX2VtYmVkXCIgc3JjPVwiJHtzd2ZVUkx9XCIgd21vZGU9XCJvcGFxdWVcIiBsb29wPVwiZmFsc2VcIiBtZW51PVwiZmFsc2VcIiBxdWFsaXR5PVwiYmVzdFwiIGJnY29sb3I9XCIjZmZmZmZmXCIgd2lkdGg9XCIke3RoaXMucGFyYW1zLndpZHRofVwiIGhlaWdodD1cIiR7dGhpcy5wYXJhbXMuaGVpZ2h0fVwiIG5hbWU9XCJ3ZWJjYW1fbW92aWVfZW1iZWRcIiBhbGlnbj1cIm1pZGRsZVwiIGFsbG93U2NyaXB0QWNjZXNzPVwiYWx3YXlzXCIgYWxsb3dGdWxsU2NyZWVuPVwiZmFsc2VcIiB0eXBlPVwiYXBwbGljYXRpb24veC1zaG9ja3dhdmUtZmxhc2hcIiBwbHVnaW5zcGFnZT1cImh0dHA6Ly93d3cubWFjcm9tZWRpYS5jb20vZ28vZ2V0Zmxhc2hwbGF5ZXJcIiBmbGFzaHZhcnM9XCIke2ZsYXNodmFyc31cIj48L2VtYmVkPjwvb2JqZWN0PmBcbiAgfVxuXG4gIGdldE1vdmllICgpIHtcbiAgICAvLyBnZXQgcmVmZXJlbmNlIHRvIG1vdmllIG9iamVjdC9lbWJlZCBpbiBET01cbiAgICB2YXIgbW92aWUgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnd2ViY2FtX21vdmllX29iaicpXG4gICAgaWYgKCFtb3ZpZSB8fCAhbW92aWUuX3NuYXApIG1vdmllID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3dlYmNhbV9tb3ZpZV9lbWJlZCcpXG4gICAgaWYgKCFtb3ZpZSkgY29uc29sZS5sb2coJ2dldE1vdmllIGVycm9yJylcbiAgICByZXR1cm4gbW92aWVcbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wcyB0aGUgd2ViY2FtIGNhcHR1cmUgYW5kIHZpZGVvIHBsYXliYWNrLlxuICAgKi9cbiAgc3RvcCAoKSB7XG4gICAgbGV0IHsgdmlkZW8sIHZpZGVvU3RyZWFtIH0gPSB0aGlzXG5cbiAgICB0aGlzLnVwZGF0ZVN0YXRlKHtcbiAgICAgIGNhbWVyYVJlYWR5OiBmYWxzZVxuICAgIH0pXG5cbiAgICBpZiAodmlkZW9TdHJlYW0pIHtcbiAgICAgIGlmICh2aWRlb1N0cmVhbS5zdG9wKSB7XG4gICAgICAgIHZpZGVvU3RyZWFtLnN0b3AoKVxuICAgICAgfSBlbHNlIGlmICh2aWRlb1N0cmVhbS5tc1N0b3ApIHtcbiAgICAgICAgdmlkZW9TdHJlYW0ubXNTdG9wKClcbiAgICAgIH1cblxuICAgICAgdmlkZW9TdHJlYW0ub25lbmRlZCA9IG51bGxcbiAgICAgIHZpZGVvU3RyZWFtID0gbnVsbFxuICAgIH1cblxuICAgIGlmICh2aWRlbykge1xuICAgICAgdmlkZW8ub25lcnJvciA9IG51bGxcbiAgICAgIHZpZGVvLnBhdXNlKClcblxuICAgICAgaWYgKHZpZGVvLm1velNyY09iamVjdCkge1xuICAgICAgICB2aWRlby5tb3pTcmNPYmplY3QgPSBudWxsXG4gICAgICB9XG5cbiAgICAgIHZpZGVvLnNyYyA9ICcnXG4gICAgfVxuXG4gICAgdGhpcy52aWRlbyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5VcHB5V2ViY2FtLXZpZGVvJylcbiAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5VcHB5V2ViY2FtLWNhbnZhcycpXG4gIH1cblxuICBmbGFzaE5vdGlmeSAodHlwZSwgbXNnKSB7XG4gICAgLy8gcmVjZWl2ZSBub3RpZmljYXRpb24gZnJvbSBmbGFzaCBhYm91dCBldmVudFxuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgY2FzZSAnZmxhc2hMb2FkQ29tcGxldGUnOlxuICAgICAgICAvLyBtb3ZpZSBsb2FkZWQgc3VjY2Vzc2Z1bGx5XG4gICAgICAgIGJyZWFrXG5cbiAgICAgIGNhc2UgJ2NhbWVyYUxpdmUnOlxuICAgICAgICAvLyBjYW1lcmEgaXMgbGl2ZSBhbmQgcmVhZHkgdG8gc25hcFxuICAgICAgICB0aGlzLmxpdmUgPSB0cnVlXG4gICAgICAgIGJyZWFrXG5cbiAgICAgIGNhc2UgJ2Vycm9yJzpcbiAgICAgICAgLy8gRmxhc2ggZXJyb3JcbiAgICAgICAgY29uc29sZS5sb2coJ1RoZXJlIHdhcyBhIGZsYXNoIGVycm9yJywgbXNnKVxuICAgICAgICBicmVha1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICAvLyBjYXRjaC1hbGwgZXZlbnQsIGp1c3QgaW4gY2FzZVxuICAgICAgICBjb25zb2xlLmxvZygnd2ViY2FtIGZsYXNoX25vdGlmeTogJyArIHR5cGUgKyAnOiAnICsgbXNnKVxuICAgICAgICBicmVha1xuICAgIH1cbiAgfVxuXG4gIGNvbmZpZ3VyZSAocGFuZWwpIHtcbiAgICAvLyBvcGVuIGZsYXNoIGNvbmZpZ3VyYXRpb24gcGFuZWwgLS0gc3BlY2lmeSB0YWIgbmFtZTpcbiAgICAvLyAnY2FtZXJhJywgJ3ByaXZhY3knLCAnZGVmYXVsdCcsICdsb2NhbFN0b3JhZ2UnLCAnbWljcm9waG9uZScsICdzZXR0aW5nc01hbmFnZXInXG4gICAgaWYgKCFwYW5lbCkgcGFuZWwgPSAnY2FtZXJhJ1xuICAgIHRoaXMuZ2V0TW92aWUoKS5fY29uZmlndXJlKHBhbmVsKVxuICB9XG5cbiAgLyoqXG4gICAqIFRha2VzIGEgc25hcHNob3QgYW5kIGRpc3BsYXlzIGl0IGluIGEgY2FudmFzLlxuICAgKi9cbiAgZ2V0SW1hZ2UgKHZpZGVvLCBvcHRzKSB7XG4gICAgdmFyIGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpXG4gICAgY2FudmFzLndpZHRoID0gdmlkZW8udmlkZW9XaWR0aFxuICAgIGNhbnZhcy5oZWlnaHQgPSB2aWRlby52aWRlb0hlaWdodFxuICAgIGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpLmRyYXdJbWFnZSh2aWRlbywgMCwgMClcblxuICAgIHZhciBkYXRhVXJsID0gY2FudmFzLnRvRGF0YVVSTChvcHRzLm1pbWVUeXBlKVxuXG4gICAgdmFyIGZpbGUgPSBkYXRhVVJJdG9GaWxlKGRhdGFVcmwsIHtcbiAgICAgIG5hbWU6IG9wdHMubmFtZVxuICAgIH0pXG5cbiAgICByZXR1cm4ge1xuICAgICAgZGF0YVVybDogZGF0YVVybCxcbiAgICAgIGRhdGE6IGZpbGUsXG4gICAgICB0eXBlOiBvcHRzLm1pbWVUeXBlXG4gICAgfVxuICB9XG5cbiAgdGFrZVNuYXBzaG90ICh2aWRlbywgY2FudmFzKSB7XG4gICAgY29uc3Qgb3B0cyA9IHtcbiAgICAgIG5hbWU6IGB3ZWJjYW0tJHtEYXRlLm5vdygpfS5qcGdgLFxuICAgICAgbWltZVR5cGU6ICdpbWFnZS9qcGVnJ1xuICAgIH1cblxuICAgIGNvbnN0IGltYWdlID0gdGhpcy5nZXRJbWFnZSh2aWRlbywgY2FudmFzLCBvcHRzKVxuXG4gICAgY29uc3QgdGFnRmlsZSA9IHtcbiAgICAgIHNvdXJjZTogdGhpcy5pZCxcbiAgICAgIG5hbWU6IG9wdHMubmFtZSxcbiAgICAgIGRhdGE6IGltYWdlLmRhdGEsXG4gICAgICB0eXBlOiBvcHRzLnR5cGVcbiAgICB9XG5cbiAgICByZXR1cm4gdGFnRmlsZVxuICB9XG59XG4iLCJmdW5jdGlvbiBkYXRhVVJJdG9CbG9iIChkYXRhVVJJLCBvcHRzLCB0b0ZpbGUpIHtcbiAgLy8gZ2V0IHRoZSBiYXNlNjQgZGF0YVxuICB2YXIgZGF0YSA9IGRhdGFVUkkuc3BsaXQoJywnKVsxXVxuXG4gIC8vIHVzZXIgbWF5IHByb3ZpZGUgbWltZSB0eXBlLCBpZiBub3QgZ2V0IGl0IGZyb20gZGF0YSBVUklcbiAgdmFyIG1pbWVUeXBlID0gb3B0cy5taW1lVHlwZSB8fCBkYXRhVVJJLnNwbGl0KCcsJylbMF0uc3BsaXQoJzonKVsxXS5zcGxpdCgnOycpWzBdXG5cbiAgLy8gZGVmYXVsdCB0byBwbGFpbi90ZXh0IGlmIGRhdGEgVVJJIGhhcyBubyBtaW1lVHlwZVxuICBpZiAobWltZVR5cGUgPT0gbnVsbCkge1xuICAgIG1pbWVUeXBlID0gJ3BsYWluL3RleHQnXG4gIH1cblxuICB2YXIgYmluYXJ5ID0gYXRvYihkYXRhKVxuICB2YXIgYXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGJpbmFyeS5sZW5ndGg7IGkrKykge1xuICAgIGFycmF5LnB1c2goYmluYXJ5LmNoYXJDb2RlQXQoaSkpXG4gIH1cblxuICAvLyBDb252ZXJ0IHRvIGEgRmlsZT9cbiAgaWYgKHRvRmlsZSkge1xuICAgIHJldHVybiBuZXcgRmlsZShbbmV3IFVpbnQ4QXJyYXkoYXJyYXkpXSwgb3B0cy5uYW1lIHx8ICcnLCB7dHlwZTogbWltZVR5cGV9KVxuICB9XG5cbiAgcmV0dXJuIG5ldyBCbG9iKFtuZXcgVWludDhBcnJheShhcnJheSldLCB7dHlwZTogbWltZVR5cGV9KVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChkYXRhVVJJLCBvcHRzKSB7XG4gIHJldHVybiBkYXRhVVJJdG9CbG9iKGRhdGFVUkksIG9wdHMsIHRydWUpXG59XG4iLCIiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuZnVuY3Rpb24gZGVmYXVsdFNldFRpbW91dCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbmZ1bmN0aW9uIGRlZmF1bHRDbGVhclRpbWVvdXQgKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2xlYXJUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG4oZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0VGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2xlYXJUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgIH1cbn0gKCkpXG5mdW5jdGlvbiBydW5UaW1lb3V0KGZ1bikge1xuICAgIGlmIChjYWNoZWRTZXRUaW1lb3V0ID09PSBzZXRUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICAvLyBpZiBzZXRUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkU2V0VGltZW91dCA9PT0gZGVmYXVsdFNldFRpbW91dCB8fCAhY2FjaGVkU2V0VGltZW91dCkgJiYgc2V0VGltZW91dCkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dChmdW4sIDApO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwobnVsbCwgZnVuLCAwKTtcbiAgICAgICAgfSBjYXRjaChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKHRoaXMsIGZ1biwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxufVxuZnVuY3Rpb24gcnVuQ2xlYXJUaW1lb3V0KG1hcmtlcikge1xuICAgIGlmIChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGNsZWFyVGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICAvLyBpZiBjbGVhclRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGRlZmF1bHRDbGVhclRpbWVvdXQgfHwgIWNhY2hlZENsZWFyVGltZW91dCkgJiYgY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCAgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbChudWxsLCBtYXJrZXIpO1xuICAgICAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yLlxuICAgICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiBJLkUuIGhhdmUgZGlmZmVyZW50IHJ1bGVzIGZvciBjbGVhclRpbWVvdXQgdnMgc2V0VGltZW91dFxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKHRoaXMsIG1hcmtlcik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBydW5UaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBydW5DbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBydW5UaW1lb3V0KGRyYWluUXVldWUpO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiY29uc3QgVXBweSA9IHJlcXVpcmUoJy4uLy4uLy4uLy4uL3NyYy9jb3JlJylcbmNvbnN0IERhc2hib2FyZCA9IHJlcXVpcmUoJy4uLy4uLy4uLy4uL3NyYy9wbHVnaW5zL0Rhc2hib2FyZCcpXG5jb25zdCBHb29nbGVEcml2ZSA9IHJlcXVpcmUoJy4uLy4uLy4uLy4uL3NyYy9wbHVnaW5zL0dvb2dsZURyaXZlJylcbmNvbnN0IERyb3Bib3ggPSByZXF1aXJlKCcuLi8uLi8uLi8uLi9zcmMvcGx1Z2lucy9Ecm9wYm94JylcbmNvbnN0IFdlYmNhbSA9IHJlcXVpcmUoJy4uLy4uLy4uLy4uL3NyYy9wbHVnaW5zL1dlYmNhbScpXG5jb25zdCBUdXMxMCA9IHJlcXVpcmUoJy4uLy4uLy4uLy4uL3NyYy9wbHVnaW5zL1R1czEwJylcbmNvbnN0IE1ldGFEYXRhID0gcmVxdWlyZSgnLi4vLi4vLi4vLi4vc3JjL3BsdWdpbnMvTWV0YURhdGEnKVxuY29uc3QgSW5mb3JtZXIgPSByZXF1aXJlKCcuLi8uLi8uLi8uLi9zcmMvcGx1Z2lucy9JbmZvcm1lcicpXG5cbmNvbnN0IFVQUFlfU0VSVkVSID0gcmVxdWlyZSgnLi4vZW52JylcblxuY29uc3QgUFJPVE9DT0wgPSBsb2NhdGlvbi5wcm90b2NvbCA9PT0gJ2h0dHBzOicgPyAnaHR0cHMnIDogJ2h0dHAnXG5jb25zdCBUVVNfRU5EUE9JTlQgPSBQUk9UT0NPTCArICc6Ly9tYXN0ZXIudHVzLmlvL2ZpbGVzLydcblxuZnVuY3Rpb24gdXBweUluaXQgKCkge1xuICBjb25zdCBvcHRzID0gd2luZG93LnVwcHlPcHRpb25zXG4gIGNvbnN0IGRhc2hib2FyZEVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLlVwcHlEYXNoYm9hcmQnKVxuICBpZiAoZGFzaGJvYXJkRWwpIHtcbiAgICBjb25zdCBkYXNoYm9hcmRFbFBhcmVudCA9IGRhc2hib2FyZEVsLnBhcmVudE5vZGVcbiAgICBkYXNoYm9hcmRFbFBhcmVudC5yZW1vdmVDaGlsZChkYXNoYm9hcmRFbClcbiAgfVxuXG4gIGNvbnN0IHVwcHkgPSBVcHB5KHtkZWJ1ZzogdHJ1ZSwgYXV0b1Byb2NlZWQ6IG9wdHMuYXV0b1Byb2NlZWR9KVxuICB1cHB5LnVzZShEYXNoYm9hcmQsIHtcbiAgICB0cmlnZ2VyOiAnLlVwcHlNb2RhbE9wZW5lckJ0bicsXG4gICAgaW5saW5lOiBvcHRzLkRhc2hib2FyZElubGluZSxcbiAgICB0YXJnZXQ6IG9wdHMuRGFzaGJvYXJkSW5saW5lID8gJy5EYXNoYm9hcmRDb250YWluZXInIDogJ2JvZHknXG4gIH0pXG5cbiAgaWYgKG9wdHMuR29vZ2xlRHJpdmUpIHtcbiAgICB1cHB5LnVzZShHb29nbGVEcml2ZSwge3RhcmdldDogRGFzaGJvYXJkLCBob3N0OiBVUFBZX1NFUlZFUn0pXG4gIH1cblxuICBpZiAob3B0cy5Ecm9wYm94KSB7XG4gICAgdXBweS51c2UoRHJvcGJveCwge3RhcmdldDogRGFzaGJvYXJkLCBob3N0OiBVUFBZX1NFUlZFUn0pXG4gIH1cblxuICBpZiAob3B0cy5XZWJjYW0pIHtcbiAgICB1cHB5LnVzZShXZWJjYW0sIHt0YXJnZXQ6IERhc2hib2FyZH0pXG4gIH1cblxuICB1cHB5LnVzZShUdXMxMCwge2VuZHBvaW50OiBUVVNfRU5EUE9JTlQsIHJlc3VtZTogdHJ1ZX0pXG4gIHVwcHkudXNlKEluZm9ybWVyLCB7dGFyZ2V0OiBEYXNoYm9hcmR9KVxuICB1cHB5LnVzZShNZXRhRGF0YSwge1xuICAgIGZpZWxkczogW1xuICAgICAgeyBpZDogJ3Jlc2l6ZVRvJywgbmFtZTogJ1Jlc2l6ZSB0bycsIHZhbHVlOiAxMjAwLCBwbGFjZWhvbGRlcjogJ3NwZWNpZnkgZnV0dXJlIGltYWdlIHNpemUnIH0sXG4gICAgICB7IGlkOiAnZGVzY3JpcHRpb24nLCBuYW1lOiAnRGVzY3JpcHRpb24nLCB2YWx1ZTogJ25vbmUnLCBwbGFjZWhvbGRlcjogJ2Rlc2NyaWJlIHdoYXQgdGhlIGZpbGUgaXMgZm9yJyB9XG4gICAgXVxuICB9KVxuICB1cHB5LnJ1bigpXG5cbiAgdXBweS5vbignY29yZTpzdWNjZXNzJywgKGZpbGVDb3VudCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKCdZbywgdXBsb2FkZWQ6ICcgKyBmaWxlQ291bnQpXG4gIH0pXG59XG5cbnVwcHlJbml0KClcbndpbmRvdy51cHB5SW5pdCA9IHVwcHlJbml0XG4iLCJsZXQgdXBweVNlcnZlckVuZHBvaW50ID0gJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAyMCdcblxuaWYgKGxvY2F0aW9uLmhvc3RuYW1lID09PSAndXBweS5pbycpIHtcbiAgdXBweVNlcnZlckVuZHBvaW50ID0gJy8vc2VydmVyLnVwcHkuaW8nXG59XG5cbmNvbnN0IFVQUFlfU0VSVkVSID0gdXBweVNlcnZlckVuZHBvaW50XG5tb2R1bGUuZXhwb3J0cyA9IFVQUFlfU0VSVkVSXG4iXX0=
