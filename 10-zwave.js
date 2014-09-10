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

    function ZWaveController(n) {
    	RED.nodes.createNode(this,n);
    	this.name = n.port;
        this.port = n.port;
		this.driverattempts = n.driverattempts;
	    this.pollinterval = n.pollinterval;

		// initialize OpenZWave
		this.zwave = new OpenZWave(this.port, {
        	logging: false,           // enable logging to OpenZWave_Log.txt
	        consoleoutput: true,     // copy logging to the console
	        saveconfig: true,        // write an XML network layout
	        driverattempts: this.driverattempts,        // try this many times before giving up
	        pollinterval: this.pollinterval,        // interval between polls in milliseconds
	        suppressrefresh: true    // do not send updates if nothing changed
		});
    	console.log("new ZWaveController: %s", n);
   	    var zwnodes = [];   	    
   	    var nrNodeSubscriptions = {}; // 'event' => [closure1, closure2...]
   	    
   	    // subscribe a Node-Red node to ZWave events
		this.subscribe = function(nrNode, event, callback) {
			if (!(event in nrNodeSubscriptions)) 		
				nrNodeSubscriptions[event] = [];
			nrNodeSubscriptions[event].push(callback);
		}

		// dispatch OpenZwave events onto all active Node-Red subscriptions
   		function zwcallback(event, arghash) {
			console.log("zwcallback(event: %s, args: %j)", event, arghash);
			if (event in nrNodeSubscriptions) {
				nrNodeSubscriptions[event].forEach(function(callback) {
					console.log("calling event callback %s with args %j", event, arghash);
					callback.apply(this, arghash);
				});
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
            this.zwave.disconnect();
        });


   	    /* =============== OpenZWave events ================== */
		//
		this.zwave.on('driver ready', function(homeid) {
			this.homeid = homeid;
			var homeHex = homeid.toString(16);
			this.name='0x'+ homeHex;
			console.log('scanning homeid=0x%s...', homeHex);
			zwcallback('driver ready', {homeid: homeid});
		});

		// 
		this.zwave.on('driver failed', function() {
			console.log('failed to start driver');
			zwcallback('driver failed', {});
			zwave.disconnect();
			// process.exit();
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
			zwcallback('node added', {nodeid: nodeid});
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
			zwcallback('value added', { 
				nodeid: nodeid, cmdclass: comclass, cmdinstance: valueId.instance, cmdidx: valueId.index,
				currState: valueId['value'], 
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
			zwcallback('value changed', { 
				nodeid: nodeid, cmdclass: comclass, cmdinstance: valueId.instance, cmdidx: valueId.index,
				oldState: oldst, currState: valueId['value'], 
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
					zwcallback('value deleted', { 
						nodeid: nodeid, cmdclass: comclass, cmdinstance: valueId.instance, cmdidx: valueId.index,
						oldState: oldval,
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
			zwcallback('node ready', {nodeid: nodeid, nodeinfo: nodeinfo});
		});

		//
		this.zwave.on('notification', function(nodeid, notif) {
			var s = notificationText(notif);
			console.log('node%d: %s', nodeid, s);
			zwcallback('notification', {nodeid: nodeid, notification: s});
		});

		//
		this.zwave.on('scan complete', function() {
			console.log('ZWave network scan complete.');
			zwcallback('scan complete', {});
		});

		this.zwave.connect();

		console.log('ZWave Driver Connected!');
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
			// set zwave node status initially as disconnected
			this.status({fill:"red",shape:"ring",text:"disconnected"});
			/* =============== Node-Red events ================== */
			this.on("close", function() {
		        zwaveController.zwave.disconnect();
		    });
			this.on("error", function() {
				// what?
			});
	   	    /* =============== OpenZWave events ================== */
			zwaveController.subscribe(this, 'driver ready', function(homeid) {
				node.homeid = homeid;
				node.status({fill:"green",shape:"dot",text: "0x"+homeid});
			});
			zwaveController.subscribe(this, 'value changed', function(info) {
				//console.log('zwave-in injecting: %s', info);
				node.send(info);
			});
			zwaveController.subscribe(this, 'notification', function(notif) {
				node.send(notif);
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
		this.nodeid = config.nodeid;
		this.cmdclass = config.cmdclass;
		this.cmdidx = config.cmdidx;
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
					console.log('switching on %j', payload.nodeid);
					zwaveController.zwave.switchOn(payload.nodeid); break;
				case /switchOff/.test(msg.topic):
					console.log('switching off %j', payload.nodeid);
					zwaveController.zwave.switchOff(payload.nodeid); break;
				//
				// setLevel: for dimmers
				//
				case /setLevel/.test(msg.topic):
					console.log('setting level %j', payload);
					zwaveController.zwave.setLevel(
						msg.payload.nodeid, 
						msg.payload.val
					);
				// 
				// setValue: for everything else
				//
				case /setValue/.test(msg.topic):				
					console.log('setting value %s', payload);
					zwaveController.zwave.setValue(
						payload.nodeid, 
						(payload.cmdclass 	|| 37),// default cmdclass: on-off 
						(payload.cmdidx 	|| 0), // default cmd index
						(payload.cmdinstance|| 1), // default instance
						(payload.val 		|| 0)  // default val
					);
					break;
				};
			});
			//
			this.on("close", function() {
		        zwaveController.zwave.disconnect();
		    });
			//
			this.on("error", function() {

			});

	   	    /* =============== OpenZWave events ================== */
			//
			zwaveController.subscribe(this, 'driver ready', function(homeid) {
				node.homeid = homeid;
				node.status({fill:"green",shape:"dot",text: "0x"+homeid});
			});
			//
			zwaveController.subscribe(this, 'value changed', function(zwval) {
				console.log('ZWaveOut value changed: %j', zwval);
			});
		}
	}
	//
	RED.nodes.registerType("zwave-out", ZWaveOut);
	//

}
