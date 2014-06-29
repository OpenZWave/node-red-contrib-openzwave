module.exports = function(RED) {

    var OZW = require('openzwave');
    var zwnodes = [];
	var inNodes = {};
	var outNodes = {};
    var zwave;

    function ZWaveControllerNode(n) {
        RED.nodes.createNode(this,n);
        this.port = n.port;
		this.driverattempts = n.driverattempts;
	    this.pollinterval = n.pollinterval;
		//
		zwave = new OZW(this.port, {
        	logging: false,           // enable logging to OZW_Log.txt
	        consoleoutput: false,     // copy logging to the console
	        saveconfig: true,        // write an XML network layout
	        driverattempts: this.driverattempts,        // try this many times before giving up
	        pollinterval: this.pollinterval,        // interval between polls in milliseconds
	        suppressrefresh: true,    // do not send updates if nothing changed
		});
		this.zwave = zwave;

		// 
		zwave.on('driver ready', function(homeid) {
			console.log('scanning homeid=0x%s...', homeid.toString(16));
		});

		// 
		zwave.on('driver failed', function() {
			console.log('failed to start driver');
			this.status({fill:"red",shape:"ring",text:"disconnected"});
			zwave.disconnect();
			// process.exit();
		});

		zwave.on('node added', function(nodeid) {
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
			console.log('value added: %s', value)
			if (!zwnodes[nodeid]['classes'][comclass])
				zwnodes[nodeid]['classes'][comclass] = {};
			zwnodes[nodeid]['classes'][comclass][value.index] = value;
		});

		zwave.on('value changed', function(nodeid, comclass, value) {
			if (zwnodes[nodeid]['ready']) {
				console.log('node%d: changed: %d:%s:%s->%s', nodeid, comclass,
				    value['label'],
				    zwnodes[nodeid]['classes'][comclass][value.index]['value'],
				    value['value']);
			}
			zwnodes[nodeid]['classes'][comclass][value.index] = value;
		});

		zwave.on('value removed', function(nodeid, comclass, index) {
			if (zwnodes[nodeid]['classes'][comclass] &&
				zwnodes[nodeid]['classes'][comclass][index])
					delete zwnodes[nodeid]['classes'][comclass][index];
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
				nodeinfo.name,
				nodeinfo.type,
				nodeinfo.loc);
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
				console.log('node%d: nop', nodeid);
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
    }
    //
    RED.nodes.registerType("zwave-controller", ZWaveControllerNode);
}
