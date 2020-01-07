/*

  OpenZWave nodes for IBM's Node-Red
  https://github.com/ekarak/node-red-contrib-openzwave
  (c) 2014-2017, Elias Karakoulakis <elias.karakoulakis@gmail.com>

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

*/
var fs = require('fs');
var path = require('path');
var util = require('util');
var UUIDPREFIX = "_macaddr_";
var HOMENAME = "_homename_";

var ozwsharedpath = path.dirname(path.dirname(require.resolve('openzwave-shared')));
var ozwsharedpackage = JSON.parse(fs.readFileSync(ozwsharedpath+"/package.json"));
var thispackage = JSON.parse(fs.readFileSync(__dirname+'/package.json'));

require('getmac').getMac(function(err, macAddress) {
  if (err) throw err;
  UUIDPREFIX = macAddress.replace(/:/gi, '');
});

module.exports = function(RED) {

  function log(level, message, method) {
    if (level >= logging) {
      RED.log[method || 'info'].apply(this, ["OpenZwave: "+message]);
    }
  }

  RED.log.info('node-red-contrib-openzwave: ' + thispackage.version);
  RED.log.info('openzwave-shared: ' + ozwsharedpackage.version);

  var OpenZWave = require('openzwave-shared');
  var ozwConfig = {};
  var ozwDriver = null;
  var ozwConnected = false;
  var ozwBoundEvents = false;
  var driverReadyStatus = false;
  var allowunreadyupdates = false;
  var logging = "minimal";

  // Provide context.global access to ZWave node info.
  RED.settings.functionGlobalContext.openzwaveNodes = {};
  // event routing map: which NR node gets notified for each zwave event
  var nrNodeSubscriptions = {}; // {'event1' => {node1: closure1, node2: closure2...}, 'event2' => ...}

  /* ============================================================================
   * ZWSUBSCRIBE: subscribe a Node-Red node to OpenZWave events
   * ============================================================================
   **/
  function zwsubscribe(nrNode, event, callback) {
    if (!(event in nrNodeSubscriptions)) {
      nrNodeSubscriptions[event] = {};
    }
    nrNodeSubscriptions[event][nrNode.id] = callback;
    log('full', util.format('%s(%s) subscribed to \"%s\"', nrNode.type,
        nrNode.id, event));
  }

  // and unsubscribe
  function zwunsubscribe(nrNode) {
    for (var event in nrNodeSubscriptions) {
      if (nrNodeSubscriptions.hasOwnProperty(event)) {
        delete nrNodeSubscriptions[event][nrNode.id];
        log('full', util.format('%s(%s) unsubscribed from \"%s\"', nrNode.type,
          nrNode.id, event));
      }
    }
  }

  /* ============================================================================
   * ZWCALLBACK: dispatch OpenZwave events onto all active Node-Red subscriptions
   * ============================================================================
   **/
  function zwcallback(event, arghash) {
    log('full', util.format("%s, args: %j", event, arghash));
    // Add uuid
    if (arghash.nodeid !== undefined && HOMENAME !== undefined)
      arghash.uuid = UUIDPREFIX + '-' +
      HOMENAME + '-' +
      arghash.nodeid;

    if (nrNodeSubscriptions.hasOwnProperty(event)) {
      var nrNodes = nrNodeSubscriptions[event];
      // an event might be subscribed by multiple NR nodes
      for (var nrnid in nrNodes) {
        var nrNode = RED.nodes.getNode(nrnid);
        log('full', "\t\\==> " + nrnid + " event:" + event);
        nrNodes[nrnid].call(nrNode, event, arghash);
        // update the node status accordingly
        var status = {fill: "yellow",  text: event, shape: "ring"};
        var transient = true;
        switch(event) {
          case 'node event':
          case 'node ready':
          case 'node removed':
            status.text = util.format('node %j: %s', arghash.nodeid, event);
            break;
          case 'value changed':
            status.text = util.format('node %j: %s', arghash.nodeid, event);
            break;
          case 'notification':
          case 'controller command':
            transient = false;
            status.text = util.format('%s', arghash.help);
            break;
          default:
            break;
        }
        updateNodeRedStatus(nrNode, status);
        if (transient) {
          setTimeout(function() {
            updateNodeRedStatus(nrNode);
          }, 500);
        }
      }
    }
  }

  // update the NR node's status indicator
  function updateNodeRedStatus(nrNode, options) {
    // update NR node status
    nrNode.status(options || {
      fill: driverReadyStatus ? "green" : "red",
      text: driverReadyStatus ? "connected" : "disconnected",
      shape: "ring"
    });
  }

  function driverReady(homeid) {
    driverReadyStatus = true;
    ozwConfig.homeid = homeid;
    var homeHex = '0x' + homeid.toString(16);
    HOMENAME = homeHex;
    ozwConfig.name = homeHex;
    log('minimal', 'scanning network with homeid: ' + homeHex);
    zwcallback('driver ready', ozwConfig);
  }

  function driverFailed() {
    zwcallback('driver failed', ozwConfig);
    process.exit();
  }

  function nodeAdded(nodeid) {
    RED.settings.functionGlobalContext.openzwaveNodes[nodeid] = {
      manufacturer: '',
      manufacturerid: '',
      product: '',
      producttype: '',
      productid: '',
      type: '',
      name: '',
      loc: '',
      classes: {},
      ready: false,
    };
    zwcallback('node added', {
      "nodeid": nodeid
    });
  }

  function nodeRemoved(nodeid) {
    RED.settings.functionGlobalContext.openzwaveNodes[nodeid] = {
      manufacturer: '',
      manufacturerid: '',
      product: '',
      producttype: '',
      productid: '',
      type: '',
      name: '',
      loc: '',
      classes: {},
      ready: false,
    };
    zwcallback('node removed', {
      "nodeid": nodeid
    });
  }

  function valueAdded(nodeid, comclass, valueId) {
    var ozwnode = RED.settings.functionGlobalContext.openzwaveNodes[nodeid];
    if (!ozwnode) {
      log('off', 'valueAdded: no such node: '+nodeid, 'error');
    }
    if (!ozwnode['classes'][comclass])
      ozwnode['classes'][comclass] = {};
    if (!ozwnode['classes'][comclass][valueId.instance])
      ozwnode['classes'][comclass][valueId.instance] = {};
    // add to cache
    log('full', "added "+JSON.stringify(valueId));
    ozwnode['classes'][comclass][valueId.instance][valueId.index] = valueId;
    // tell NR
    zwcallback('value added', {
      "nodeid": nodeid,
      "cmdclass": comclass,
      "instance": valueId.instance,
      "cmdidx": valueId.index,
      "currState": valueId['value'],
      "label": valueId['label'],
      "units": valueId['units'],
      "value": valueId
    });
  }

  function valueChanged(nodeid, comclass, valueId) {
    var ozwnode = RED.settings.functionGlobalContext.openzwaveNodes[nodeid];
    if (!ozwnode) {
      log('off', 'valueChanged: no such node: '+nodeid, 'error');
    } else {
      // valueId: OpenZWave ValueID (struct) - not just a boolean
      var oldst;
      if (ozwnode.ready || allowunreadyupdates) {
        oldst = ozwnode['classes'][comclass][valueId.instance][valueId.index].value;
        log('full', util.format(
          'zwave node %d: changed: %d:%s:%s -> %j', nodeid, comclass,
            valueId['label'], oldst, JSON.stringify(valueId)));
        // tell NR only if the node is marked as ready
        zwcallback('value changed', {
          "nodeid": nodeid,
          "cmdclass": comclass,
          "cmdidx": valueId.index,
          "instance": valueId.instance,
          "oldState": oldst,
          "currState": valueId['value'],
          "label": valueId['label'],
          "units": valueId['units'],
          "value": valueId
        });
      }
      // update cache
      ozwnode['classes'][comclass][valueId.instance][valueId.index] = valueId;
    }
  }

  function valueRemoved(nodeid, comclass, instance, index) {
    var ozwnode = RED.settings.functionGlobalContext.openzwaveNodes[nodeid];
    if (ozwnode &&
        ozwnode['classes'] &&
        ozwnode['classes'][comclass] &&
        ozwnode['classes'][comclass][instance] &&
        ozwnode['classes'][comclass][instance][index]) {
      delete ozwnode['classes'][comclass][instance][index];
      zwcallback('value deleted', {
        "nodeid": nodeid,
        "cmdclass": comclass,
        "cmdidx": index,
        "instance": instance
      });
    } else {
      log('off', 'valueRemoved: no such node: '+nodeid, 'error');}
  }

  function nodeReady(nodeid, nodeinfo) {
    var ozwnode = RED.settings.functionGlobalContext.openzwaveNodes[nodeid];
    if (ozwnode) {
      for (var attrname in nodeinfo) {
        if (nodeinfo.hasOwnProperty(attrname)) {
          ozwnode[attrname] = nodeinfo[attrname];
        }
      }
      ozwnode.ready = true;
      //
      log('full', 'only|R|W| (nodeid-cmdclass-instance-index): type : current state');
      for (var comclass in ozwnode['classes']) {
        switch (comclass) {
          case 0x25: // COMMAND_CLASS_SWITCH_BINARY
          case 0x26: // COMMAND_CLASS_SWITCH_MULTILEVEL
          case 0x30: // COMMAND_CLASS_SENSOR_BINARY
          case 0x31: // COMMAND_CLASS_SENSOR_MULTILEVEL
          case 0x60: // COMMAND_CLASS_MULTI_INSTANCE
            ozwDriver.enablePoll(nodeid, comclass);
            break;
        }
        var values = ozwnode['classes'][comclass];

        for (var inst in values)
          for (var idx in values[inst]) {
            var ozwval = values[inst][idx];
            var rdonly = ozwval.read_only ? '*' : ' ';
            var wronly = ozwval.write_only ? '*' : ' ';
            log('full', util.format(
              '\t|%s|%s| %s: %s:\t%s\t', rdonly, wronly, ozwval.value_id, ozwval.label, ozwval.value));
          }
      }
      //
      zwcallback('node ready', {
        nodeid: nodeid,
        nodeinfo: nodeinfo
      });
    }
  }

  function nodeEvent(nodeid, evtcode) {
    zwcallback('node event', {
      "nodeid": nodeid,
      "event": evtcode
    });
  }

  function sceneEvent(nodeid, scene) {
    zwcallback('scene event', {
      "nodeid": nodeid,
      "scene": scene
    });
  }

  function notification(nodeid, notif, help) {
    log('full', util.format('node %d: %s', nodeid, help));
    zwcallback('notification', {
      nodeid: nodeid,
      notification: notif,
      help: help
    });
  }

  function scanComplete() {
    log('minimal', 'network scan complete.');
    zwcallback('scan complete', {});
  }

  function controllerCommand(nodeid, state, errcode, help) {
    var obj = {
      nodeid: nodeid,
      state: state,
      errcode: errcode,
      help: help
    };
    log('full', util.format('command feedback received: %j', JSON.stringify(obj)));
    zwcallback('controller command', obj);
  }

  // list of events emitted by OpenZWave and redirected to Node flows by the mapped function
  var ozwEvents = {
    'driver ready': driverReady,
    'driver failed': driverFailed,
    'node added': nodeAdded,
    'node ready': nodeReady,
    'node event': nodeEvent,
	'scene event': sceneEvent,
    'value added': valueAdded,
    'value changed': valueChanged,
    'value removed': valueRemoved,
    'notification': notification,
    'scan complete': scanComplete,
    'controller command': controllerCommand,
    'node removed': nodeRemoved
  };

  // ==========================
  function ZWaveController(cfg) {
    // ==========================
    RED.nodes.createNode(this, cfg);
    var node = this;
    this.name = cfg.port;
    logging = cfg.logging;
    // initialize OpenZWave upon boot or fetch it from the global reference
    // (used across Node-Red deployments which recreate all the nodes)
    // so we only get to initialise one single OZW driver (a lengthy process)
    if (!ozwDriver) {
      ozwDriver = new OpenZWave({
        Logging: (logging != "off"),
        ConsoleOutput: (logging != "off"),
        QueueLogLevel: ((logging == "full") ? 8 : 6),
        UserPath: RED.settings.userDir,
        DriverMaxAttempts: cfg.driverattempts,
		NetworkKey: cfg.networkkey||""
      });
    }
    if (!ozwBoundEvents) {
      /* =========== bind to low-level OpenZWave events ============== */
      Object.keys(ozwEvents).forEach(function(evt) {
          log('full', node.name + ' addListener ' + evt);
          ozwDriver.on(evt, ozwEvents[evt]);
      });
      ozwBoundEvents = true;
    }

    /* =============== Node-Red events ================== */
    this.on("close", function() {
      log('full', 'zwave-controller: close');
      // write out zwcfg_homeid.xml to disk
      ozwDriver.writeConfig();
      // controller should also unbind from the C++ addon
      if (ozwDriver) {
        ozwDriver.removeAllListeners();
        ozwBoundEvents = false;
      }
    });

    zwsubscribe(node, 'driver failed', function(event, data) {
      log('minimal',
        'Driver failed. Please check if there a ZWave stick attached to ' + cfg.port, 'error');
    });

    zwsubscribe(node, 'scan complete', function(event, data) {
      ozwDriver.setPollInterval(cfg.pollinterval);
      allowunreadyupdates = cfg.allowunreadyupdates;
    });

    /* time to connect */
    if (!ozwConnected) {
      log('minimal', 'connecting to '+cfg.port);
      ozwDriver.connect(cfg.port);
      ozwConnected = true;
    }
  }
  //
  RED.nodes.registerType("zwave-controller", ZWaveController);
  //

  // =========================
  function ZWaveIn(config) {
    // =========================
    RED.nodes.createNode(this, config);
    this.name = config.name;
    //
    var node = this;
    var zwaveController = RED.nodes.getNode(config.controller);

    if (!zwaveController) {
      log('minimal', 'no ZWave controller class defined!', 'error');
      return;
    }
    /* =============== Node-Red events ================== */
    this.on("close", function() {
      // set zwave node status as disconnected
      updateNodeRedStatus(node, {fill: "red", shape: "ring", text: "disconnected"});
      // remove all event subscriptions for this node
      zwunsubscribe(this);
      log('full', 'zwave-in: close');
    });
    this.on("error", function() {
      // what? there are no errors. there never were.
      updateNodeRedStatus(node, {fill: "yellow",shape: "ring", text: "error"});
    });

    /* =============== OpenZWave events ================== */
    Object.keys(ozwEvents).forEach(function(key) {
      zwsubscribe(node, key, function(event, data) {
        var msg = {
          'topic': 'zwave: ' + event
        };
        if (data) msg.payload = data;
        node.send(msg);
      });
    });
    // set initial node status upon creation
    updateNodeRedStatus(node);
  }
  //
  RED.nodes.registerType("zwave-in", ZWaveIn);
  //

  // =========================
  function ZWaveOut(config) {
    // =========================
    RED.nodes.createNode(this, config);
    this.name = config.name;
    //
    var node = this;
    var zwaveController = RED.nodes.getNode(config.controller);

    if (!zwaveController) {
      log('minimal', 'no ZWave controller class defined!', 'error');
      return;
    }

    /* =============== Node-Red events ================== */
    //
    this.on("input", function(msg) {
      log('full', util.format("input: %j", msg));
      var payload;
      try {
        payload = (typeof(msg.payload) === "string") ?
          JSON.parse(msg.payload) : msg.payload;
      } catch (err) {
        node.error(node.name + ': illegal msg.payload! (' + err + ')');
        return;
      }
      switch (true) {
        // switch On/Off: for basic single-instance switches and dimmers
        case /switchOn/.test(msg.topic):
          ozwDriver.setValue(payload.nodeid, 37, 1, 0, true);
          break;
        case /switchOff/.test(msg.topic):
          ozwDriver.setValue(payload.nodeid, 37, 1, 0, false);
          break;
        // setLevel: for dimmers
        case /setLevel/.test(msg.topic):
          ozwDriver.setValue(payload.nodeid, 38, 1, 0, payload.value);
          break;
        // setValue: for everything else
        case /setValue/.test(msg.topic):
          log('full', util.format("ZWaveOut.setValue payload: %j", payload));
          ozwDriver.setValue( {
            node_id:   payload.nodeid,
            class_id: (payload.cmdclass || 37), // default cmdclass: on-off
            instance: (payload.instance || 1), // default instance
            index:    (payload.cmdidx || 0), // default cmd index
          }, payload.value );
          break;
          /* EXPERIMENTAL: send basically every available command down
           * to OpenZWave, just name the function in the message topic
           * and pass in the arguments as "payload.args" as an array:
           * {"topic": "someOpenZWaveCommand", "payload": {"args": [1, 2, 3]}}
           * If the command needs the HomeID as the 1st arg, use "payload.prependHomeId"
           * */
        default:
          if (msg.topic && typeof ozwDriver[msg.topic] === 'function' &&
            payload) {
            var args = payload.args || [];
            if (payload.prependHomeId) args.unshift(ozwConfig.homeid);
            log('minimal', 'attempting direct API call to ' + msg.topic + '()');
            try {
              var result = ozwDriver[msg.topic].apply(ozwDriver, args);
              log('minimal', 'direct API call success, result=' + JSON.stringify(result));
              if (typeof result != 'undefined') {
                msg.payload.result = result;
                // send off the direct API call's result to the output
                node.send(msg);
              }
            } catch (err) {
              log('minimal', 'direct API call to ' + msg.topic + ' failed: ' + err, 'error');
            }
          }
      }
    });

    this.on("close", function() {
      // set zwave node status as disconnected
      updateNodeRedStatus(node, {
        fill: "red",
        shape: "ring",
        text: "disconnecting"
      });
      // remove all event subscriptions for this node
      zwunsubscribe(this);
      log('full', 'close');
    });

    this.on("error", function() {
      updateNodeRedStatus(node, {
        fill: "yellow",
        shape: "ring",
        text: "error"
      });
    });

    /* =============== OpenZWave events ================== */
    Object.keys(ozwEvents).forEach(function(key) {
      zwsubscribe(node, key, function(event, data) {
        // nuttin'! callback exists simply to update the node status
      });
    });

    // set initial node status upon creation
    updateNodeRedStatus(node);
  }
  //
  RED.nodes.registerType("zwave-out", ZWaveOut);
  //
}
