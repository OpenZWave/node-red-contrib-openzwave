module.exports = function(RED) {

	var RED = require(process.env.NODE_RED_HOME+"/red/red");
	var OZW = require('openzwave');

	// helper: get the config controller
	function getZWaveController(config) {
		var zwaveController = RED.nodes.getNode(config.controller);
		if (!zwaveController) {
			node.err('no ZWave controller class defined!')
		} else {
			return (zwaveController)
		}
	}

	// =========================
	function ZWaveNode(config) {
	// =========================
		RED.nodes.createNode(this,config);
		this.nodeid = config.nodeid;
		var ctrl = getZWaveController(config);
		var node = this;
		// set zwave node status initially as disconnected
		this.status({fill:"red",shape:"ring",text:"disconnected"});

		// TODO: when a flow is created, we need to add ourselves to the controller/config node inNodes / outNodes list
//		if (ctrl)
//			ctrl.outNodes[this] = this;
// TODO: 			this.status({fill:"green",shape:"dot",text:"connected"});		
	}
	RED.nodes.registerType("zwavenode", ZWaveNode);
}
