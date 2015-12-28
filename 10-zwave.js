/*

  OpenZWave nodes for IBM's Node-Red
  https://github.com/ekarak/node-red-contrib-openzwave
  (c) 2014-2015, Elias Karakoulakis <elias.karakoulakis@gmail.com>

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

var UUIDPREFIX = "_macaddr_";
var HOMENAME = "_homename_";

require('getmac').getMac(function(err, macAddress) {
	if (err) throw err;
	UUIDPREFIX = macAddress.replace(/:/gi, '');
});

/* set this to true to get some incomprehensible Klingon text in your console */
var debug = false;
if (debug) console.log("booting up node-red-contrib-openzwave");

module.exports = function(RED) {
	var OpenZWave = require('openzwave-shared');

	var ozwConfig = {};
	var ozwDriver = null;
	var ozwConnected = false;
	var driverReadyStatus = false;
	// array of all zwave nodes with internal hashmaps for their properties and their values
	var zwnodes = {};
	// Provide context.global access to node info.
	RED.settings.functionGlobalContext.openzwaveNodes = zwnodes;
	// event routing map: which NR node gets notified for each zwave event
	var nrNodeSubscriptions = {}; // {'event1' => {node1: closure1, node2: closure2...}, 'event2' => ...}

	/* ============================================================================
	 * ZWSUBSCRIBE: subscribe a Node-Red node to OpenZWave events
	 * ============================================================================
	 **/
	function zwsubscribe(nrNode, event, callback) {
		if (!(event in nrNodeSubscriptions))
			nrNodeSubscriptions[event] = {};
		if (debug) console.log('subscribing %s(%s) to event %s', nrNode.type, nrNode.id, event);
		nrNodeSubscriptions[event][nrNode.id] = callback;
	}

	// and unsubscribe
	function zwunsubscribe(nrNode) {
		for (var event in nrNodeSubscriptions) {
			if (nrNodeSubscriptions.hasOwnProperty(event)) {
				if (debug) console.log('unsubscribing %s(%s) from %s', nrNode.type, nrNode.id, event);
				delete nrNodeSubscriptions[event][nrNode.id];
			}
		}
	}

	/* ============================================================================
	 * ZWCALLBACK: dispatch OpenZwave events onto all active Node-Red subscriptions
	 * ============================================================================
	 **/
	function zwcallback(event, arghash) {
		if (debug) console.log("zwcallback(event: %s, args: %j)", event, arghash);
		// Add uuid
		if (arghash.nodeid !== undefined && HOMENAME !== undefined)
			arghash.uuid = UUIDPREFIX+'-' +
					HOMENAME + '-' +
					arghash.nodeid;

		if (nrNodeSubscriptions.hasOwnProperty(event)) {
			var nrNodes = nrNodeSubscriptions[event];
			// an event might be subscribed by multiple NR nodes
			for (var nrnid in nrNodes) {
				if (nrNodes.hasOwnProperty(nrnid)) {
					var nrNode = RED.nodes.getNode(nrnid);
					if (debug) console.log("zwcallback => %j,  %s,  args %j", nrNode, event, arghash);
					nrNodes[nrnid].call(nrNode, event, arghash);
					updateNodeRedStatus(nrNode);
				}
			}
		}
	}

  // update the NR node's status indicator
	function updateNodeRedStatus(nrNode) {
		// update NR node status
		nrNode.status({
			fill: driverReadyStatus ? "green" : "red",
			text: driverReadyStatus ? "connected" : "disconnected",
			shape:"ring"
		});
	}


	function driverReady(homeid) {
		driverReadyStatus = true;
		ozwConfig.homeid = homeid;
		var homeHex = '0x'+ homeid.toString(16);
		HOMENAME = homeHex;
		ozwConfig.name = homeHex;
		if (debug) console.log('scanning Zwave network with homeid %s...', homeHex);
		zwcallback('driver ready', ozwConfig);
	}

	function driverFailed() {
		zwcallback('driver failed', ozwConfig);
		process.exit();
	}

	function nodeAdded(nodeid) {
		zwnodes[nodeid] = {
			manufacturer: '', manufacturerid: '',
			product: '', producttype: '', productid: '',
			type: '', 	name: '',	loc: '',
			classes: {},
			ready: false,
		};
		zwcallback('node added', {"nodeid": nodeid});
	}

	function valueAdded(nodeid, comclass, valueId) {
		if (!zwnodes[nodeid]['classes'][comclass])
			zwnodes[nodeid]['classes'][comclass] = {};
		if (!zwnodes[nodeid]['classes'][comclass][valueId.instance])
			zwnodes[nodeid]['classes'][comclass][valueId.instance] = {};
		// add to cache
		zwnodes[nodeid]['classes'][comclass][valueId.instance][valueId.index] = valueId;
		// tell NR
		zwcallback('value added', {
			"nodeid": nodeid, "cmdclass": comclass, "instance": valueId.instance, "cmdidx": valueId.index,
			"currState": valueId['value'],
			"label": valueId['label'],
			"units": valueId['units'],
			"value": valueId
		});
	}

	function valueChanged(nodeid, comclass, valueId) {
		// valueId: OpenZWave ValueID (struct) - not just a boolean
		var oldst;
		if (zwnodes[nodeid].ready) {
			oldst = zwnodes[nodeid]['classes'][comclass][valueId.instance][valueId.index].value;
			if (debug) {
				console.log('node%d: changed: %d:%s:%s->%s', nodeid, comclass, valueId['label'],  oldst, valueId['value']);
				console.log('node%d: value=%s', nodeid, JSON.stringify(valueId));
			}
			// tell NR only if the node is marked as ready
			zwcallback('value changed', {
				"nodeid": nodeid, "cmdclass": comclass, "instance": valueId.instance, "cmdidx": valueId.index,
				"oldState": oldst, "currState": valueId['value'],
				"label": valueId['label'],
				"units": valueId['units'],
				"value": valueId
			});
		}
		// update cache
		zwnodes[nodeid]['classes'][comclass][valueId.instance][valueId.index] = valueId;
	}

	function valueRemoved(nodeid, comclass, instance, index) {
		if (zwnodes[nodeid] &&
			zwnodes[nodeid]['classes'] &&
			zwnodes[nodeid]['classes'][comclass] &&
			zwnodes[nodeid]['classes'][comclass][index])
		{
			delete zwnodes[nodeid]['classes'][comclass][index];
			zwcallback('value deleted', {
				"nodeid": nodeid, "cmdclass": comclass,  "cmdidx": index, "instance": instance
			});
		}
	}

	function nodeReady(nodeid, nodeinfo) {
		for (var attrname in nodeinfo) {
			if (nodeinfo.hasOwnProperty(attrname)) {
				zwnodes[nodeid][attrname] = nodeinfo[attrname];
			}
		}
		zwnodes[nodeid].ready = true;
		//
		for (comclass in zwnodes[nodeid]['classes']) {
			switch (comclass) {
			case 0x25: // COMMAND_CLASS_SWITCH_BINARY
			case 0x26: // COMMAND_CLASS_SWITCH_MULTILEVEL
			case 0x30: // COMMAND_CLASS_SENSOR_BINARY
			case 0x31: // COMMAND_CLASS_SENSOR_MULTILEVEL
			case 0x60: // COMMAND_CLASS_MULTI_INSTANCE
				ozwDriver.enablePoll(nodeid, comclass);
				break;
			}

			var values = zwnodes[nodeid]['classes'][comclass];
			if (debug) {
				console.log('node%d: class %d', nodeid, comclass);
				for (idx in values)
					console.log('node%d:   %s=%s', nodeid, values[idx]['label'], values[idx]['value']);
			}
		};
		//
		zwcallback('node ready', {nodeid: nodeid, nodeinfo: nodeinfo});
	}

	function nodeEvent(nodeid, evtcode, valueId, msg) {
		zwcallback('node event', {
				"nodeid": nodeid, "event": evtcode,
				"cmdclass": valueId.comclass,  "cmdidx": valueId.index, "instance": valueId.instance,
				"msg": msg});
	}

	function notification(nodeid, notif, help) {
		if (debug) console.log('node%d: %s', nodeid, help);
		zwcallback('notification', {nodeid: nodeid, notification: notif, help: help});
	}

	function scanComplete() {
		if (debug) console.log('ZWave network scan complete.');
		zwcallback('scan complete', {});
	}

	function controllerCommand(nodeid, state, errcode, help) {
		if (debug) console.log('ZWave controller command feedback received');
		zwcallback('controller command', {nodeid: nodeid, state: state, errcode: errcode, help: help});
	}

	// list of events emitted by OpenZWave and redirected to Node flows by the mapped function
	var ozwEvents = {
		'driver ready' : driverReady,
		'driver failed': driverFailed,
		'node added'   : nodeAdded,
		'node ready'   : nodeReady,
		'node event'   : nodeEvent,
		'value added'  : valueAdded,
	 	'value changed': valueChanged,
		'value removed': valueRemoved,
		'notification' : notification,
		'scan complete': scanComplete,
		'controller command': controllerCommand
	}

	// ==========================
	function ZWaveController(n) {
	// ==========================
		RED.nodes.createNode(this,n);
		this.name = n.port;
		this.port = n.port;
		this.driverattempts = n.driverattempts;
		this.pollinterval = n.pollinterval;
		var node = this;

		// initialize OpenZWave upon boot or fetch it from the global reference
		// (used across Node-Red deployments which recreate all the nodes)
		// so we only get to initialise one single OZW driver (a lengthy process)
		if (!ozwDriver) {
			ozwDriver = new OpenZWave({
				Logging:       debug,
				ConsoleOutput: debug,
				QueueLogLevel: 6
			});
		}

		/* =============== OpenZWave events ================== */
		Object.keys(ozwEvents).forEach(function (evt) {
			if (debug) console.log(node.name+' addListener ' + evt);
			ozwDriver.on(evt, ozwEvents[evt]);
		})

		/* =============== Node-Red events ================== */
		this.on("close", function() {
			if (debug) console.log('zwave-controller: close');
			// controller should also unbind from the C++ addon
			if (ozwDriver) ozwDriver.removeAllListeners();
		});

		zwsubscribe(node, 'driver failed', function(event, data) {
			console.log('failed to start ZWave driver, is there a ZWave stick attached to %s ?', n.port);
		});

		/* time to connect */
		if (!ozwConnected) {
			if (debug) console.log('ZWave Driver: connecting to %s', n.port);
			ozwDriver.connect(n.port);
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
			node.err('no ZWave controller class defined!');
			return;
		}
		/* =============== Node-Red events ================== */
		this.on("close", function() {
			// set zwave node status as disconnected
			node.status({fill:"red",shape:"ring",text:"disconnected"});
			// remove all event subscriptions for this node
			zwunsubscribe(this);
			if (debug) console.log('zwave-in: close');
		});
		this.on("error", function() {
			// what? there are no errors. there never were.
			node.status({fill:"yellow",shape:"ring",text:"error"});
		});

		/* =============== OpenZWave events ================== */
		Object.keys(ozwEvents).forEach(function (key) {
			zwsubscribe(node, key, function(event, data) {
				var msg = {'topic': 'zwave: '+event};
				if (data) msg.payload = data;
				if (debug) console.log('===> ZWAVE-IN injecting: %j', msg);
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
			node.err('no ZWave controller class defined!');
			return;
		}

		/* =============== Node-Red events ================== */
		//
		this.on("input", function(msg) {
			if (debug) console.log("ZWaveOut#input: %j", msg);
			var payload;
			try {
				payload = (typeof(msg.payload) === "string") ?
					JSON.parse(msg.payload) : msg.payload;
			} catch(err) {
				node.error(node.name+': illegal msg.payload! ('+err+')');
				return;
			}
			switch(true) {

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
				if (debug) console.log("ZWaveOut.setValue payload: %j", payload);
				ozwDriver.setValue(
					payload.nodeid,
					(payload.cmdclass 	|| 37),// default cmdclass: on-off
					(payload.instance 	|| 1), // default instance
					(payload.cmdidx 	|| 0), // default cmd index
					payload.value
				);
				break;

			/* EXPERIMENTAL: send basically every available command down
			 * to OpenZWave, just name the function in the message topic
			 * and pass in the payload the function's args as an array:
			 * {"topic": "someOpenZWaveCommand", "payload": [1, 2, 3]}
			 * */
			default:
				if (ozwDriver.hasOwnProperty(msg.topic) &&
					typeof ozwDriver[msg.topic] === 'function' &&
					payload.constructor.name === 'Array'
					) {
						console.log('attempting direct call to OpenZWave API: %s(%s)', msg.topic, payload);
						try {
							ozwDriver[msg.topic](payload.args);
						} catch(err) {
							node.warn('direct OpenZWave call to '+ msg.topic+' failed: '+err);
						}
					};
			};
		});

		this.on("close", function() {
			// set zwave node status as disconnected
			node.status({fill:"red",shape:"ring",text:"disconnecting"});
			// remove all event subscriptions for this node
			zwunsubscribe(this);
			node.log('zwave-out: close');
		});

		this.on("error", function() {
			// there are. no. russians. in afghanistan.
			node.status({fill:"yellow",shape:"ring",text:"error"});
		});

		/* =============== OpenZWave events ================== */
		Object.keys(ozwEvents).forEach(function (key) {
			zwsubscribe(node, key, function(event, data) {
				// nuttin ;) we merely subscribe to have the NR node status update :)
			});
		});

		// set initial node status upon creation
		updateNodeRedStatus(node);
	}
	//
	RED.nodes.registerType("zwave-out", ZWaveOut);
	//
}
