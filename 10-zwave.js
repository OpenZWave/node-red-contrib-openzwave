module.exports = function(RED) {
	console.log("loading openzwave for node-red");
    var OZW = require('openzwave');

    function ZWaveController(n) {
    	RED.nodes.createNode(this,n);
        this.port = n.port;
		this.driverattempts = n.driverattempts;
	    this.pollinterval = n.pollinterval;
		this.zwave = new OZW(this.port, {
        	logging: false,           // enable logging to OZW_Log.txt
	        consoleoutput: false,     // copy logging to the console
	        saveconfig: true,        // write an XML network layout
	        driverattempts: this.driverattempts,        // try this many times before giving up
	        pollinterval: this.pollinterval,        // interval between polls in milliseconds
	        suppressrefresh: true    // do not send updates if nothing changed
		});
		var zwave = this.zwave;
    	console.log("new ZWaveController: %s", n);
   	    var zwnodes = [];   	    
   	    var nrNodes = {}; // 'event' => [node-red-node1_closure, ...]
   	    /* =============== 
   	      Node-Red events
   	    ================== */
		this.on("close", function() {
            this.zwave.disconnect();
        });
   	    /* =============== 
   	      OpenZWave events
   	    ================== */
		zwave.on('driver ready', function(homeid) {
			console.log('scanning homeid=0x%s...', homeid.toString(16));
			for (cb in nrNodeSubscriptions['driver ready']) cb(homeid.toString(16));
		});
		// 
		zwave.on('driver failed', function() {
			console.log('failed to start driver');
			for (cb in nrNodeSubscriptions['driver failed']) cb();
			zwave.disconnect();
			// process.exit();
		});
		//
		zwave.on('node added', function(nodeid) {
			for (cb in nrNodeSubscriptions['node added']) cb(nodeid);
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
		});

		zwave.on('value added', function(nodeid, comclass, value) {
//			console.log('value added: %s', value)
			for (cb in nrNodeSubscriptions['value added']) cb(value);
			//
			if (!zwnodes[nodeid]['classes'][comclass])
				zwnodes[nodeid]['classes'][comclass] = {};
			zwnodes[nodeid]['classes'][comclass][value.index] = value;
		});

		zwave.on('value changed', function(nodeid, comclass, value) {
			if (zwnodes[nodeid]['ready']) {
				// 
				for (cb in nrNodeSubscriptions['value changed']) cb(value);
				// 
				console.log('node%d: changed: %d:%s:%s->%s', nodeid, comclass,
				    value['label'],  
				    zwnodes[nodeid]['classes'][comclass][value.index]['value'], // old
				    value['value']); // new
			}
			// update cache
			zwnodes[nodeid]['classes'][comclass][value.index] = value;
		});

		zwave.on('value removed', function(nodeid, comclass, index) {
			if (zwnodes[nodeid]['classes'][comclass] &&
				zwnodes[nodeid]['classes'][comclass][index]) {
					for (cb in nrNodeSubscriptions['value deleted']) cb(nodeid, comclass, index);
					delete zwnodes[nodeid]['classes'][comclass][index];
				}
		});

		zwave.on('node ready', function(nodeid, nodeinfo) {
			zwnodes[nodeid]['manufacturer'] = nodeinfo.manufacturer;
			zwnodes[nodeid]['manufacturerid'] = nodeinfo.manufacturerid;
			zwnodes[nodeid]['product'] = nodeinfo.product;
			zwnodes[nodeid]['producttype'] = nodeinfo.producttype;
			zwnodes[nodeid]['productid'] = nodeinfo.productid;
			zwnodes[nodeid]['type'] = nodeinfo.type;
			zwnodes[nodeid]['name'] = nodeinfo.name;
			zwnodes[nodeid]['loc'] = nodeinfo.loc;
			zwnodes[nodeid]['ready'] = true;
			console.log('node%d: %s, %s', nodeid,
				nodeinfo.manufacturer ? nodeinfo.manufacturer
				          : 'id=' + nodeinfo.manufacturerid,
				nodeinfo.product ? nodeinfo.product
				         : 'product=' + nodeinfo.productid +
				           ', type=' + nodeinfo.producttype);
			console.log('node%d: name="%s", type="%s", location="%s"', nodeid,
				nodeinfo.name,	nodeinfo.type,	nodeinfo.loc);
			//
			for (cb in nrNodeSubscriptions['node ready']) cb(nodeid, nodeinfo);
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
			}
		});

		zwave.on('notification', function(nodeid, notif) {
			switch (notif) {
				case 0:
					console.log('node%d: message complete', nodeid);
				break;
				case 1:
					console.log('node%d: timeout', nodeid);
				break;
				case 2:
					//console.log('node%d: nop', nodeid);
				break;
				case 3:
					console.log('node%d: node awake', nodeid);
				break;
				case 4:
					console.log('node%d: node sleep', nodeid);
				break;
				case 5:
					console.log('node%d: node dead', nodeid);
				break;
				case 6:
					console.log('node%d: node alive', nodeid);
				break;
			}
		});

		zwave.on('scan complete', function() {
			console.log('ZWave network scan complete.');
		});

		zwave.connect();
		
		// the fun part begins:
		this.subscribe = function(nrNode, eventCallbacks) {
			Object.keys(eventCallbacks).forEach(function (evt) {
				var cb = eventCallbacks(evt);
				if (!(evt in nrNodeSubscriptions)) {
					nrNodeSubscriptions[evt] = [];
				};
				nrNodeSubscriptions[evt].push(cb);
			});
		}
	}
    //
    RED.nodes.registerType("zwave-controller", ZWaveController);
    //
    
    // =========================
	function ZWaveNode(config) {
	// =========================
		RED.nodes.createNode(this,config);
		this.name = config.name;
		this.nodeid = config.nodeid;
		this.cmdclass = config.cmdclass;
		this.cmdidx = config.cmdidx;
		var node = this;
		// set zwave node status initially as disconnected
		this.status({fill:"red",shape:"ring",text:"disconnected"});
		//		
		var zwaveController = RED.nodes.getNode(config.controller);
		if (!zwaveController) {
			console.log('no ZWave controller class defined!');
		} else {
	   	    /* =============== 
	   	      Node-Red events
	   	    ================== */
			this.on("input", function(msg) {
				zwaveController.zwave.setValue(msg.payload.nodeId, msg.payload.cmdclass, msg.payload.cmdindx, msg.payload.value);
			});
			this.on("close", function() {
		        this.zwave.disconnect();
		    });
			this.on("error", function() {

			});
	   	    /* =============== 
	   	      OpenZWave events
	   	    ================== */
			zwaveController.subscribe(this, {
				'node ready': function(nodeid, nodeinfo) {
					console.log('ZWaveNode ==> node %d ready, nodeinfo:%s', nodeid, nodeinfo);
					if (nodeid == this.nodeid) {
						this.status({fill:"green",shape:"dot",text:"connected"});
					}
				},
				'value changed': function(val) {
					console.log('ZWaveNode ==> value changed');
					//
				}
			});
		}
	}
	RED.nodes.registerType("zwave-node", ZWaveNode);

	
	// =========================
	function ZWaveIn(config) {
	// =========================
		RED.nodes.createNode(this, config);
		this.name = config.name;
		this.nodeid = config.nodeid;
		this.cmdclass = config.cmdclass;
		this.cmdidx = config.cmdidx;
		//
		var node = this;
		var ctrl = getZWaveController(config);
		var zwaveController = RED.nodes.getNode(config.controller);
		if (!zwaveController) {
			node.err('no ZWave controller class defined!');
		} else {
			// set zwave node status initially as disconnected
			this.status({fill:"red",shape:"ring",text:"disconnected"});
			/* =============== Node-Red events ================== */
			this.on("input", function(msg) {
				zwaveController.zwave.setValue(this.nodeId, this.cmdclass, this.cmdindx, msg.payload.value);
			});
			this.on("close", function() {
		        this.zwave.disconnect();
		    });
			this.on("error", function() {
				// what?
			});
	   	    /* =============== OpenZWave events ================== */
			zwaveController.register(this, {
				'driver ready': function(homeid) {
					node.homeid = homeid;
					this.status({fill:"green",shape:"dot",text: "0x"+homeid});
				},
				'value changed': function(val) {
					console.log('node %d value changed');
				}
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
		var ctrl = getZWaveController(config);
		var zwaveController = RED.nodes.getNode(config.controller);
		if (!zwaveController) {
			node.err('no ZWave controller class defined!');
		} else {
			// set zwave node status initially as disconnected
			this.status({fill:"red",shape:"ring",text:"disconnected"});
			/* =============== Node-Red events ================== */
			this.on("input", function(msg) {

			});
			this.on("close", function() {
		        this.zwave.disconnect();
		    });
			this.on("error", function() {

			});
	   	    /* =============== OpenZWave events ================== */
			zwaveController.register(this, {
				'driver ready': function(homeid) {
					node.homeid = homeid;
					this.status({fill:"green",shape:"dot",text: "0x"+homeid});
				},
				'value changed': function(val) {
					console.log('ZWaveOut node %d value changed');
				}
			});						
		}
	}
	//
	RED.nodes.registerType("zwave-out", ZWaveOut);
	//
}
