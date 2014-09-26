/*

  OpenZWave nodes for IBM's Node-Red
  https://github.com/ekarak/node-red-contrib-openzwave
  (c) 2014, Elias Karakoulakis <elias.karakoulakis@gmail.com>

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
module.exports = function(RED) {

	console.log("loading openzwave for node-red");

	var OpenZWave = require('openzwave');
	//
	var ozwDriver = null;
	var ozwConfigNode = null;

	// array of all zwave nodes with internal hashmaps for their properties and their values
	var zwnodes =  [];

	// event routing map: which NR node gets notified for each zwave event
	var nrNodeSubscriptions = {}; // {'event' => {node1: closure1, node2: closure2...}, 'event2' => ...}

	// subscribe a Node-Red node to ZWave events
	function zwsubscribe(nrNode, event, callback) {
		if (!(event in nrNodeSubscriptions)) 		
			nrNodeSubscriptions[event] = {};
		console.log('subscribing %s to event %s', nrNode.id, event);
		nrNodeSubscriptions[event][nrNode.id] = callback;
	}

	// and unsubscribe
	function zwunsubscribe(nrNode) {
		for (var event in nrNodeSubscriptions) {
			if (nrNodeSubscriptions.hasOwnProperty(event)) {
				console.log('unsubscribing %s for %s', event, nrNode.id);
				delete nrNodeSubscriptions[event][nrNode.id];
			}
		}
	}

	// dispatch OpenZwave events onto all active Node-Red subscriptions
	function zwcallback(event, arghash) {
		//console.log("zwcallback(event: %s, args: %j)", event, arghash);
		for (var event in nrNodeSubscriptions) {
			if (nrNodeSubscriptions.hasOwnProperty(event)) {
				var nrNodes = nrNodeSubscriptions[event];
				for (var nrnid in nrNodes) {
					if (nrNodes.hasOwnProperty(nrnid)) {
						var nrNode = RED.nodes.getNode(nrnid);
						//console.log("zwcallback => %j,  %s,  args %j", nrNode, event, arghash);
						nrNodes[nrnid].call(nrNode, event, arghash);
					}
				}
			}
		}
	}

	// see openzwave/cpp/src/Notification.cpp
	var notificationText = function(a) { 
		switch(a){
		case 0: return "message complete";
		case 1: return "timeout";
		case 2: return "nop";
		case 3: return "node awake";
		case 4: return "node asleep";
		case 5: return "node dead";
		case 6: return "node alive";
		default: return "unknown OZW notification: "+a;
		}
	}

	function driverReady(homeid) {
		ozwConfigNode.homeid = homeid;
		var homeHex = '0x'+ homeid.toString(16);
		ozwConfigNode.name = homeHex;
		//console.log('scanning Zwave network with homeid %s...', homeHex);
		zwcallback('driver ready', ozwConfigNode, {'homeid': homeid, 'homeHex':  homeHex});
	}

	function driverFailed() {
		//console.log('failed to start ZWave driver, is there a ZWave stick attached to %s ?', this.port);
		zwcallback('driver failed', ozwConfigNode, {});
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
		});
	}

	function valueChanged(nodeid, comclass, valueId) {
		// valueId: OpenZWave ValueID (struct) - not just a boolean
		var oldst;
		if (zwnodes[nodeid]['ready']) {
			oldst = zwnodes[nodeid]['classes'][comclass][valueId.instance][valueId.index]['value'];
			//console.log('node%d: changed: %d:%s:%s->%s', nodeid, comclass, valueId['label'],  oldst, valueId['value']);
		}
		// tell NR
		zwcallback('value changed', { 
			"nodeid": nodeid, "cmdclass": comclass, "instance": valueId.instance, "cmdidx": valueId.index,
			"oldState": oldst, "currState": valueId['value']
		});
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
		zwnodes[nodeid]['manufacturer'] 	= nodeinfo.manufacturer;
		zwnodes[nodeid]['manufacturerid'] 	= nodeinfo.manufacturerid;
		zwnodes[nodeid]['product'] 		= nodeinfo.product;
		zwnodes[nodeid]['producttype'] 		= nodeinfo.producttype;
		zwnodes[nodeid]['productid'] 		= nodeinfo.productid;
		zwnodes[nodeid]['type'] 		= nodeinfo.type;
		zwnodes[nodeid]['name'] 		= nodeinfo.name;
		zwnodes[nodeid]['loc'] 			= nodeinfo.loc;
		zwnodes[nodeid]['ready'] = true;
		/*console.log('node%d: %s, %s', nodeid,
			nodeinfo.manufacturer ? nodeinfo.manufacturer : 'id=' + nodeinfo.manufacturerid,
			nodeinfo.product ? nodeinfo.product : 'product=' + nodeinfo.productid + ', type=' + nodeinfo.producttype);
		console.log('node%d: name="%s", type="%s", location="%s"', nodeid, nodeinfo.name, nodeinfo.type, nodeinfo.loc); */
		//
		for (comclass in zwnodes[nodeid]['classes']) {
			switch (comclass) {
			case 0x25: // COMMAND_CLASS_SWITCH_BINARY
			case 0x26: // COMMAND_CLASS_SWITCH_MULTILEVEL
				ozwDriver.enablePoll(nodeid, comclass);
				break;
			}
			var values = zwnodes[nodeid]['classes'][comclass];
//			console.log('node%d: class %d', nodeid, comclass);
/*				for (idx in values)
				console.log('node%d:   %s=%s', nodeid, values[idx]['label'], values[idx]['value']); */
		};
		//
		zwcallback('node ready', {nodeid: nodeid, nodeinfo: nodeinfo});
	}

	function notification(nodeid, notif) {
		var s = notificationText(notif);
		//console.log('node%d: %s', nodeid, s);
		zwcallback('notification', {nodeid: nodeid, notification: s});
	}

	function scanComplete() {
		console.log('ZWave network scan complete.');
		zwcallback('scan complete', {});
	}

	// ==========================
	function ZWaveController(n) {
	// ==========================
    		RED.nodes.createNode(this,n);
    		this.name = n.port;
	        this.port = n.port;
		this.driverattempts = n.driverattempts;
		this.pollinterval = n.pollinterval;

		// initialize OpenZWave or fetch it from the global reference
		// (used across Node-Red deployments which recreate all the nodes)
		// so we only get to initialise one single OZW driver (a lengthy process) 
		// only when the node.js VM is starting
		ozwConfigNode = this;
		if (!ozwDriver) {
	    	console.log("initializing new OpenZWave Controller: %j", n);
			ozwDriver = new OpenZWave(
				this.port, {
			    	logging: 	false,           // enable logging to OpenZWave_Log.txt
				consoleoutput: true,     // copy logging to the console
			 	saveconfig: true,        // write an XML network layout
				driverattempts: this.driverattempts,        // try this many times before giving up
				pollinterval: this.pollinterval,        // interval between polls in milliseconds
				suppressrefresh: true    // do not send updates if nothing changed
			});

	   		/* =============== OpenZWave events ================== */
			ozwDriver.on('driver ready', 	driverReady);
			ozwDriver.on('driver failed', 	driverFailed);
			ozwDriver.on('node added',		nodeAdded);
			ozwDriver.on('node ready', 		nodeReady);
			ozwDriver.on('value added', 	valueAdded);
			ozwDriver.on('value changed', 	valueChanged);
			ozwDriver.on('value removed', 	valueRemoved);
			ozwDriver.on('notification', 	notification);
			ozwDriver.on('scan complete', 	scanComplete);

			// only connect once!
			ozwDriver.connect();
	
			console.log('ZWave Driver on %s is active!', this.port);
		}
		
		/* =============== Node-Red events ================== */
		this.on("close", function() {
			console.log('zwave-controller: close');
	        });
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
			this.status({fill:"red",shape:"ring",text:"disconnected"});
			// remove all event subscriptions for this node
			zwunsubscribe(this);
			console.log('zwave-in: close');
		});
		this.on("error", function() {
			// what? there are no errors. there never were.
		});
	       /* =============== OpenZWave events ================== */
		// pass these zwave events over to Node flows:
		var arr = ['driver ready', 'node ready', 'value changed', 'notification'];
		for (var i in arr) {
			zwsubscribe(this, arr[i], function(event, info) {
				if (event === 'driver ready') node.status({fill:"green", shape:"dot", text: info.homeHex});
				var msg = {'topic': 'zwave: '+event, 'payload': info};
				console.log('===> ZWAVE-IN injecting: %j', msg);
				node.send(msg);
			});
		}
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
		// set zwave node status initially as disconnected
		this.status({fill:"red",shape:"ring",text:"disconnected"});
		/* =============== Node-Red events ================== */
		//
		this.on("input", function(msg) {
			console.log("ZWaveOut#input: %j", msg);
			if (!(msg && msg.hasOwnProperty('payload'))) return;
			var payload;
                        if (typeof(msg.payload) === "object") {
                                payload = msg.payload;
                        } else if (typeof(msg.payload) === "string") {
                                payload = JSON.parse(msg.payload);
                        }       
                        if (payload == null) { 
                                console.log('eibdout.onInput: illegal msg.payload!');
                                return; 
                        } 
			switch(true) {
			//
			// switch On/Off: for basic single-instance switches and dimmers
			//
			case /switchOn/.test(msg.topic):
				ozwDriver.switchOn(payload.nodeid); 
				break;
			case /switchOff/.test(msg.topic):
				ozwDriver.switchOff(payload.nodeid); 
				break;
			//
			// setLevel: for dimmers
			//
			case /setLevel/.test(msg.topic):
				ozwDriver.setLevel(
					payload.nodeid, 
					payload.value
				);
				break;
			// 
			// setValue: for everything else
			//
			case /setValue/.test(msg.topic):
				ozwDriver.setValue(
					payload.nodeid, 
					(payload.cmdclass 	|| 37),// default cmdclass: on-off 
					(payload.cmdidx 	|| 0), // default cmd index
					(payload.instance 	|| 1), // default instance
					payload.value
				);
				break;
			};
		});
		
		this.on("close", function() {
			// set zwave node status as disconnected
			this.status({fill:"red",shape:"ring",text:"disconnected"});
			// remove all event subscriptions for this node
			zwunsubscribe(this);
			console.log('zwave-out: close');
		});
		
		this.on("error", function() {
			// there are. no. russians. in afghanistan.
		});

		/* =============== OpenZWave events ================== */
		//
		zwsubscribe(this, 'driver ready', function(event, info) {
			node.status({fill:"green",shape:"dot",text: info.homeHex});
		});
	}
	//
	RED.nodes.registerType("zwave-out", ZWaveOut);
	//
}
