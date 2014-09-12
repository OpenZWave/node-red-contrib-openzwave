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
	var globalZWave = null;
    var zwnodes =  [];

    function ZWaveController(n) {
    	RED.nodes.createNode(this,n);
    	this.name = n.port;
        this.port = n.port;
		this.driverattempts = n.driverattempts;
	    this.pollinterval = n.pollinterval;

		// initialize OpenZWave or fetch it from the global reference
		// (used across Node-Red deployments which recreate all the nodes)
		// so we only get to initialise OZW (a lengthy process) only when the node.js VM is starting

		if (globalZWave) {
			this.zwave = globalZWave;
		} else {
	    	console.log("initializing new OpenZWave Controller: %j", n);
			this.zwave = new OpenZWave(this.port, {
		    	logging: false,           // enable logging to OpenZWave_Log.txt
			    consoleoutput: true,     // copy logging to the console
			    saveconfig: true,        // write an XML network layout
			    driverattempts: this.driverattempts,        // try this many times before giving up
			    pollinterval: this.pollinterval,        // interval between polls in milliseconds
			    suppressrefresh: true    // do not send updates if nothing changed
			});
		}

		// event routing map: which NR node gets notified for each zwave event
   	    var nrNodeSubscriptions = {}; // {'event' => {node1: closure1, node2: closure2...}, 'event2' => ...}

   	    // subscribe a Node-Red node to ZWave events
		this.subscribe = function(nrNode, event, callback) {
			if (!(event in nrNodeSubscriptions)) 		
				nrNodeSubscriptions[event] = {};
			console.log('subscribing %s to event %s', nrNode.id, event);
			nrNodeSubscriptions[event][nrNode.id] = callback;
		}
		this.unsubscribe = function(nrNode) {
			for (var event in nrNodeSubscriptions) {
			  if (nrNodeSubscriptions.hasOwnProperty(event)) {
				delete nrNodeSubscriptions[event][nrNode.id];
			  }
			}
		}
		// dispatch OpenZwave events onto all active Node-Red subscriptions
   		function zwcallback(event, ctx, arghash) {
			console.log("zwcallback(event: %s, args: %j)", event, arghash);
			for (var event in nrNodeSubscriptions) {
				if (nrNodeSubscriptions.hasOwnProperty(event)) {
					var nrNodes = nrNodeSubscriptions[event];
					for (var nrnid in nrNodes) {
						if (nrNodes.hasOwnProperty(nrnid)) {
							console.log("zwcallback: '%s', args %j", event, arghash);
							nrNodes[nrnid].call(ctx, event, arghash);
						}
					}
				}
			}
		}

		// see openzwave/cpp/src/Notification.cpp
		function notificationText(a) { 
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

   	    /* =============== Node-Red events ================== */
		//
		this.on("close", function() {			
            this.zwave = null;
        });


   	    /* =============== OpenZWave events ================== */
		//
		this.zwave.on('driver ready', function(homeid) {
			this.homeid = homeid;
			var homeHex = '0x'+ homeid.toString(16);
			this.name = homeHex;
			console.log('scanning Zwave network with homeid %s...', homeHex);
			zwcallback('driver ready', this, {'homeid': homeid, 'homeHex':  homeHex});
		});

		// 
		this.zwave.on('driver failed', function() {
			console.log('failed to start ZWave driver, is there a ZWave stick attached to %s ?', this.port);
			zwcallback('driver failed', this, {});
			process.exit();
		});

		//
		this.zwave.on('node added', function(nodeid) {
			zwnodes[nodeid] = {
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
			zwcallback('node added', this, {"nodeid": nodeid});
		});

		//
		this.zwave.on('value added', function(nodeid, comclass, valueId) {
			if (!zwnodes[nodeid]['classes'][comclass])
				zwnodes[nodeid]['classes'][comclass] = {};
			if (!zwnodes[nodeid]['classes'][comclass][valueId.instance])
				zwnodes[nodeid]['classes'][comclass][valueId.instance] = {};
			// add to cache
			zwnodes[nodeid]['classes'][comclass][valueId.instance][valueId.index] = valueId;
			// tell NR
			zwcallback('value added', this, { 
				"nodeid": nodeid, "cmdclass": comclass, "instance": valueId.instance, "cmdidx": valueId.index,
				"currState": valueId['value'], 
			});
		});

		//
		this.zwave.on('value changed', function(nodeid, comclass, valueId) {
			// valueId: OpenZWave ValueID (struct) - not just a boolean
			var oldst;
			if (zwnodes[nodeid]['ready']) {
				oldst = zwnodes[nodeid]['classes'][comclass][valueId.instance][valueId.index]['value'];
				console.log('node%d: changed: %d:%s:%s->%s', nodeid, comclass, valueId['label'],  oldst, valueId['value']); // new
			}
			// tell NR
			zwcallback('value changed', this, { 
				"nodeid": nodeid, "cmdclass": comclass, "instance": valueId.instance, "cmdidx": valueId.index,
				"oldState": oldst, "currState": valueId['value'], 
			});
			// update cache
			zwnodes[nodeid]['classes'][comclass][valueId.instance][valueId.index] = valueId;
		});

		//
		this.zwave.on('value removed', function(nodeid, comclass, index) {
			if (zwnodes[nodeid] &&
				zwnodes[nodeid]['classes'] &&
				zwnodes[nodeid]['classes'][comclass] &&
				zwnodes[nodeid]['classes'][comclass][index]) {
					delete zwnodes[nodeid]['classes'][comclass][index];
					zwcallback('value deleted', this, { 
						"nodeid": nodeid, "cmdclass": comclass, "instance": valueId.instance, "cmdidx": valueId.index
					});
				}
		});

		//
		this.zwave.on('node ready', function(nodeid, nodeinfo) {
			zwnodes[nodeid]['manufacturer'] 	= nodeinfo.manufacturer;
			zwnodes[nodeid]['manufacturerid'] 	= nodeinfo.manufacturerid;
			zwnodes[nodeid]['product'] 			= nodeinfo.product;
			zwnodes[nodeid]['producttype'] 		= nodeinfo.producttype;
			zwnodes[nodeid]['productid'] 		= nodeinfo.productid;
			zwnodes[nodeid]['type'] 			= nodeinfo.type;
			zwnodes[nodeid]['name'] 			= nodeinfo.name;
			zwnodes[nodeid]['loc'] 				= nodeinfo.loc;
			zwnodes[nodeid]['ready'] = true;
			console.log('node%d: %s, %s', nodeid,
				nodeinfo.manufacturer ? nodeinfo.manufacturer : 'id=' + nodeinfo.manufacturerid,
				nodeinfo.product ? nodeinfo.product : 'product=' + nodeinfo.productid + ', type=' + nodeinfo.producttype);
			console.log('node%d: name="%s", type="%s", location="%s"', nodeid, nodeinfo.name, nodeinfo.type, nodeinfo.loc);
			//
			for (comclass in zwnodes[nodeid]['classes']) {
				switch (comclass) {
				case 0x25: // COMMAND_CLASS_SWITCH_BINARY
				case 0x26: // COMMAND_CLASS_SWITCH_MULTILEVEL
					zwave.enablePoll(nodeid, comclass);
					break;
				}
				var values = zwnodes[nodeid]['classes'][comclass];
				console.log('node%d: class %d', nodeid, comclass);
				for (idx in values)
					console.log('node%d:   %s=%s', nodeid, values[idx]['label'], values[idx]['value']);
			};
			//
			zwcallback('node ready', this, {nodeid: nodeid, nodeinfo: nodeinfo});
		});

		//
		this.zwave.on('notification', function(nodeid, notif) {
			var s = notificationText(notif);
			console.log('node%d: %s', nodeid, s);
			zwcallback('notification', this, {nodeid: nodeid, notification: s});
		});

		//
		this.zwave.on('scan complete', function() {
			console.log('ZWave network scan complete.');
			zwcallback('scan complete', this, {});
		});

		if (!globalZWave) {
			this.zwave.connect();
			globalZWave = this.zwave;
			console.log('ZWave Driver on %s is active!', this.port);
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
		} else {
			/* =============== Node-Red events ================== */
			this.on("close", function() {
				// set zwave node status as disconnected
				this.status({fill:"red",shape:"ring",text:"disconnected"});
				// remove all event subscriptions for this node
				zwaveController.unsubscribe(this);
		    });
			this.on("error", function() {
				// what? there are no errors. there never were.
			});
	   	    /* =============== OpenZWave events ================== */
			// pass these zwave events over to Node flows:
			var arr = ['driver ready', 'node ready', 'value changed', 'notification'];
			for (var i in arr) {
				zwaveController.subscribe(this, arr[i], function(event, info) {
					if (event === 'driver ready') node.status({fill:"green", shape:"dot", text: info.homeHex});
					var msg = {'topic': 'zwave: '+event, 'payload': info};
					console.log('===> ZWAVE-IN injecting: %j', msg);
					node.send(msg);
				});
			}
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
		} else {
			// set zwave node status initially as disconnected
			this.status({fill:"red",shape:"ring",text:"disconnected"});
			/* =============== Node-Red events ================== */
			//
			this.on("input", function(msg) {
				console.log("ZWaveOut#input: %j", msg);
				var payload = JSON.parse(msg.payload);
				switch(true) {
				//
				// switch On/Off: for basic single-instance switches and dimmers
				//
				case /switchOn/.test(msg.topic):
					zwaveController.zwave.switchOn(payload.nodeid); 
					break;
				case /switchOff/.test(msg.topic):
					zwaveController.zwave.switchOff(payload.nodeid); 
					break;
				//
				// setLevel: for dimmers
				//
				case /setLevel/.test(msg.topic):
					zwaveController.zwave.setLevel(
						payload.nodeid, 
						payload.value
					);
					break;
				// 
				// setValue: for everything else
				//
				case /setValue/.test(msg.topic):
					zwaveController.zwave.setValue(
						payload.nodeid, 
						(payload.cmdclass 	|| 37),// default cmdclass: on-off 
						(payload.cmdidx 	|| 0), // default cmd index
						(payload.instance 	|| 1), // default instance
						(payload.value		|| 0)  // default val
					);
					break;
				};
			});
			//
			this.on("close", function() {
				// set zwave node status as disconnected
				this.status({fill:"red",shape:"ring",text:"disconnected"});
				// remove all event subscriptions for this node
				zwaveController.unsubscribe(this);
		    });
			this.on("error", function() {
				// there are. no. russians. in afghanistan.
			});

	   	    /* =============== OpenZWave events ================== */
			//
			zwaveController.subscribe(this, 'driver ready', function(event, info) {
				node.status({fill:"green",shape:"dot",text: info.homeHex});
			});
		}
	}
	//
	RED.nodes.registerType("zwave-out", ZWaveOut);
	//
}
