/*
* Class Map
*/
var Map = function (scene, file) {
	
	this.scene = scene;
	this.roads = {};
	this.mesh = {road: {}, signal: {}};
	this.group = {road: new THREE.Group(), referenceLine: new THREE.Group(), signal: new THREE.Group()};

	if (file) {
		this.generateFrom(file);
	}

	if (this.isValidate()) {
		this.generateMesh();
	} else {
		throw Error('Map construct error: invalid openDrive data');
	}
}

Map.prototype.constructor = Map;

/*
* @Parameter xmlFile
* @Return {roads, controllers, junctions, junctionGroups} only roads must be present
*/
Map.prototype.parseFromXML = function(xmlFile) {

	var xmlHttp;
	var xmlDoc;

	try {
		// Internet Explorer
		xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
		xmlDoc.async = false;
		xmlDoc.load(xmlFile);
	} catch (e) {
		// Chrome
		xmlHttp = new window.XMLHttpRequest();
		xmlHttp.open("GET", xmlFile, false);
		xmlHttp.overrideMimeType('text/xml');
		xmlHttp.send(null);
		xmlDoc = xmlHttp.responseXML;
	}

	// road records 1+
	var roadNodes = xmlDoc.getElementsByTagName('road');
	var roads = {};

	// signals are defined per road, but store them separately for controllers (controllers' control refer to signalId), 
	// id may be duplicate in different roads, reassemble signalId as roadId.signalId if no name is given
	var signals = {};

	for ( var i=0 ; i < roadNodes.length; i++ )
	{
		var roadNode = roadNodes[i];
		var id = roadNode.id;	// road id type string

		roads[id] = {};
		roads[id].id = id;
		roads[id].name = roadNode.getAttribute('name');
		roads[id].length = parseFloat(roadNode.getAttribute('length'));
		roads[id].junction =roadNode.getAttribute('junction');	// belonging junction id, =-1 for none

		roads[id].geometry = [];
		roads[id].laneSection = [];

		if (roadNode.children[0].nodeName == 'link') {

			var roadLinkNode = roadNode.children[0];

			var predecessorNodes = roadLinkNode.getElementsByTagName('predecessor');
			if (predecessorNodes.length == 1) {
				roads[id].predecessor = {};
				roads[id].predecessor.elementType = predecessorNodes[0].getAttribute('elementType');
				roads[id].predecessor.elementId = predecessorNodes[0].getAttribute('elementId');
				roads[id].predecessor.contactPoint = predecessorNodes[0].getAttribute('contactPoint');
			}
			var successorNodes = roadLinkNode.getElementsByTagName('successor');
			if (successorNodes.length == 1) {
				roads[id].successor = {};
				roads[id].successor.elementType = successorNodes[0].getAttribute('elementType');
				roads[id].successor.elementId = successorNodes[0].getAttribute('elementId');
				roads[id].successor.contactPoint = successorNodes[0].getAttribute('contactPoint');
			}
			var neighborNodes = roadLinkNode.getElementsByTagName('neighbor');
			if (neighborNodes.length) {
				roads[id].neighbor = [];
				for (var j=0; j < neighborNodes.length; j++) {
					var neighborNode = neighborNodes[j];
					roads[id].neighbor[j] = {};
					roads[id].neighbor[j].side = neighborNode.getAttribute('side');
					roads[id].neighbor[j].elementId = neighborNode.getAttribute('elementId');
					roads[id].neighbor[j].direction = neighborNode.getAttribute('direction');
				}
			}
		}

		var geometryNodes = roadNode.getElementsByTagName('geometry');
		for (var j=0; j < geometryNodes.length; j++) {
		
			var geometryNode = geometryNodes[j];

			roads[id].geometry[j] = {};
			roads[id].geometry[j].s = parseFloat(geometryNode.getAttribute('s'));
			roads[id].geometry[j].x = parseFloat(geometryNode.getAttribute('x'));
			roads[id].geometry[j].y = parseFloat(geometryNode.getAttribute('y'));
			roads[id].geometry[j].hdg = parseFloat(geometryNode.getAttribute('hdg'));
			roads[id].geometry[j].length = parseFloat(geometryNode.getAttribute('length'));

			var geometryType = geometryNode.firstElementChild.nodeName;
			var geometryTypeNode = geometryNode.firstElementChild;
			roads[id].geometry[j].type = geometryType;

			switch(geometryType) {
				case 'line':
					break;
				case 'spiral':
					roads[id].geometry[j][geometryType] = {};
					roads[id].geometry[j][geometryType].curvStart = parseFloat(geometryTypeNode.getAttribute('curvStart'));
					roads[id].geometry[j][geometryType].curvEnd = parseFloat(geometryTypeNode.getAttribute('curvEnd'));
					break;
				case 'arc':
					roads[id].geometry[j][geometryType] = {};
					roads[id].geometry[j][geometryType].curvature = parseFloat(geometryTypeNode.getAttribute('curvature'));
					break;
				default:
					throw new Error('invalid geometry type!')
			}
		}

		// elevationPorfile 0...1
		var elevationProfileNodes = roadNode.getElementsByTagName('elevationProfile');
		if (elevationProfileNodes.length) {
		
			// elevation nodes 1+
			var elevationNodes = roadNode.getElementsByTagName('elevation');
			if (elevationNodes.length) roads[id].elevation = [];
			for (var j=0; j < elevationNodes.length; j++) {

				var elevationNode = elevationNodes[j];
				roads[id].elevation[j] = {};
				roads[id].elevation[j].s = parseFloat(elevationNode.getAttribute('s'));
				roads[id].elevation[j].a = parseFloat(elevationNode.getAttribute('a'));
				roads[id].elevation[j].b = parseFloat(elevationNode.getAttribute('b'));
				roads[id].elevation[j].c = parseFloat(elevationNode.getAttribute('c'));
				roads[id].elevation[j].d = parseFloat(elevationNode.getAttribute('d'));
			}
		}

		// superelevation 0+
		var superelevationNodes = roadNode.getElementsByTagName('superelevation');
		if (superelevationNodes.length) roads[id].superelevation = [];

		for (var j=0; j < superelevationNodes.length; j++) {

			var superelevationNode = superelevationNodes[j];

			roads[id].superelevation[j] = {};
			roads[id].superelevation[j].s = parseFloat(superelevationNode.getAttribute('s'));
			roads[id].superelevation[j].a = parseFloat(superelevationNode.getAttribute('a'));
			roads[id].superelevation[j].b = parseFloat(superelevationNode.getAttribute('b'));
			roads[id].superelevation[j].c = parseFloat(superelevationNode.getAttribute('c'));
			roads[id].superelevation[j].d = parseFloat(superelevationNode.getAttribute('d'));
		}

		// crossfall 0+ (available xdor shows no examples)
		var crossfallNodes = roadNode.getElementsByTagName('crossfall');
		if (crossfallNodes.length) roads[id].crossfall = [];

		for (var j=0; j < crossfallNodes.length; j++) {

			var crossfallNode = crossfallNodes[j];

			roads[id].crossfall[j] = {};
			roads[id].crossfall[j].side = crossfallNode.getAttribute('side');
			roads[id].crossfall[j].s = parseFloat(crossfallNode.getAttribute('s'));
			roads[id].crossfall[j].a = parseFloat(crossfallNode.getAttribute('a'));
			roads[id].crossfall[j].b = parseFloat(crossfallNode.getAttribute('b'));
			roads[id].crossfall[j].c = parseFloat(crossfallNode.getAttribute('c'));
			roads[id].crossfall[j].d = parseFloat(crossfallNode.getAttribute('d'));
		}

		// shape 0+ (available xdor shows no examples)
		var shapeNodes = roadNode.getElementsByTagName('shape');
		if (shapeNodes.length) roads[id].shape = [];

		for (var j=0; j < shapeNodes.length; j++) {

			var shapeNode = shapeNodes[j];

			roads[id].shape[j] = {};
			roads[id].shape[j].s = parseFloat(shapeNode.getAttribute('s'));
			roads[id].shape[j].t = parseFloat(shapeNode.getAttribute('t'));
			roads[id].shape[j].a = parseFloat(shapeNode.getAttribute('a'));
			roads[id].shape[j].b = parseFloat(shapeNode.getAttribute('b'));
			roads[id].shape[j].c = parseFloat(shapeNode.getAttribute('c'));
			roads[id].shape[j].d = parseFloat(shapeNode.getAttribute('d'));
		}

		var laneOffsetNodes = roadNode.getElementsByTagName('laneOffset');
		if (laneOffsetNodes.length) {

			roads[id].laneOffset = [];
			
			for (var j=0; j < laneOffsetNodes.length; j++) {

				var laneOffsetNode = laneOffsetNodes[j];

				roads[id].laneOffset[j] = {};
				roads[id].laneOffset[j].s = parseFloat(laneOffsetNode.getAttribute('s'));
				roads[id].laneOffset[j].a = parseFloat(laneOffsetNode.getAttribute('a'));
				roads[id].laneOffset[j].b = parseFloat(laneOffsetNode.getAttribute('b'));
				roads[id].laneOffset[j].c = parseFloat(laneOffsetNode.getAttribute('c'));
				roads[id].laneOffset[j].d = parseFloat(laneOffsetNode.getAttribute('d'));
			}
		}

		var laneSectionNodes = roadNode.getElementsByTagName('laneSection');
		for (var j=0; j < laneSectionNodes.length; j++) {

			var laneSectionNode = laneSectionNodes[j];

			roads[id].laneSection[j] = {};
			roads[id].laneSection[j].s = parseFloat(laneSectionNode.getAttribute('s'));
			roads[id].laneSection[j].singleSide = laneSectionNode.getAttribute('singleSide') || "false";
			roads[id].laneSection[j].lane = [];

			var laneNodes = laneSectionNode.getElementsByTagName('lane');
			for (var k=0; k < laneNodes.length; k++) {

				var laneNode = laneNodes[k];

				roads[id].laneSection[j].lane[k] = {};
				roads[id].laneSection[j].lane[k].id = parseInt(laneNode.getAttribute('id'));
				roads[id].laneSection[j].lane[k].type = laneNode.getAttribute('type');
				roads[id].laneSection[j].lane[k].level = laneNode.getAttribute('level');

				// 0..1 lane predecessor
				var lanePredecessorNodes = laneNode.getElementsByTagName('predecessor');
				if (lanePredecessorNodes.length == 1) {
					roads[id].laneSection[j].lane[k].predecessor = parseInt(lanePredecessorNodes[0].getAttribute('id'));
				}

				// 0..1 lane successor
				var laneSuccessorNodes = laneNode.getElementsByTagName('successor');
				if (laneSuccessorNodes.length == 1) {
					roads[id].laneSection[j].lane[k].successor = parseInt(laneSuccessorNodes[0].getAttribute('id'));
				}

				// 1+ if no <border> entry is present - not allowed for center lane
				var widthNodes = laneNode.getElementsByTagName('width');
				if (widthNodes.length) roads[id].laneSection[j].lane[k].width = [];

				// 1+ if no <width> entry is present - not allowed for center lane
				var borderNodes = laneNode.getElementsByTagName('border');
				if (borderNodes.width) roads[id].laneSection[j].lane[k].border = [];

				// 0+
				var roadMarkNodes = laneNode.getElementsByTagName('roadMark');
				if (roadMarkNodes.length) roads[id].laneSection[j].lane[k].roadMark = [];		

				// 0+ not allowed for center lane
				var materialNodes = laneNode.getElementsByTagName('material');
				if (materialNodes.length) roads[id].laneSection[j].lane[k].material = [];		
				
				// 0+ not allowed for center lane
				var visibilityNodes = laneNode.getElementsByTagName('visibility');
				if (visibilityNodes.length) roads[id].laneSection[j].lane[k].visibility = [];

				// 0+ not allowed for center lane
				var speedNodes = laneNode.getElementsByTagName('speed');
				if (speedNodes.length) roads[id].laneSection[j].lane[k].speed = [];
				
				// 0+ not allowed for center lane
				var accessNodes = laneNode.getElementsByTagName('access');
				if (accessNodes.length) roads[id].laneSection[j].lane[k].access = [];

				// 0+ not allowed for center lane
				var heightNodes = laneNode.getElementsByTagName('height');
				if (heightNodes.length) roads[id].laneSection[j].lane[k].height = [];

				// 0+ not allowed for center lane
				var ruleNodes = laneNode.getElementsByTagName('rule');
				if (ruleNodes.length) roads[id].laneSection[j].lane[k].rule = [];

				// get Lane Width Record 1+ - not allowed for center lane (laneId=0)
				for (var l=0; l < widthNodes.length; l++) {

					var widthNode = widthNodes[l];

					roads[id].laneSection[j].lane[k].width[l] = {};
					roads[id].laneSection[j].lane[k].width[l].sOffset = parseFloat(widthNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].width[l].a = parseFloat(widthNode.getAttribute('a'));
					roads[id].laneSection[j].lane[k].width[l].b = parseFloat(widthNode.getAttribute('b'));
					roads[id].laneSection[j].lane[k].width[l].c = parseFloat(widthNode.getAttribute('c'));
					roads[id].laneSection[j].lane[k].width[l].d = parseFloat(widthNode.getAttribute('d'));
				}

				// get Lane Border Record 1+ - if both <width> and <border> is defined, <width> prevails
				for (var l=0; l < borderNodes.length; l++) {

					var borderNode = borderNodes[l];

					roads[id].laneSection[j].lane[k].border[l] = {};
					roads[id].laneSection[j].lane[k].border[l].sOffset = parseFloat(borderNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].border[l].a = parseFloat(borderNode.getAttribute('a'));
					roads[id].laneSection[j].lane[k].border[l].b = parseFloat(borderNode.getAttribute('b'));
					roads[id].laneSection[j].lane[k].border[l].c = parseFloat(borderNode.getAttribute('c'));
					roads[id].laneSection[j].lane[k].border[l].d = parseFloat(borderNode.getAttribute('d'));
				}

				// get Lane Roadmark 0+
				// road mark's centerline is always positioned on the respective lane's outer border line
				for (var l=0; l < roadMarkNodes.length; l++) {

					var roadMarkNode = roadMarkNodes[l];

					roads[id].laneSection[j].lane[k].roadMark[l] = {};
					roads[id].laneSection[j].lane[k].roadMark[l].sOffset = parseFloat(roadMarkNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].roadMark[l].type = roadMarkNode.getAttribute('type');
					roads[id].laneSection[j].lane[k].roadMark[l].weight = roadMarkNode.getAttribute('weight');
					roads[id].laneSection[j].lane[k].roadMark[l].color = roadMarkNode.getAttribute('color');
					roads[id].laneSection[j].lane[k].roadMark[l].material = roadMarkNode.getAttribute('material');
					roads[id].laneSection[j].lane[k].roadMark[l].width = parseFloat(roadMarkNode.getAttribute('width'));
					roads[id].laneSection[j].lane[k].roadMark[l].laneChange = roadMarkNode.getAttribute('laneChange') ? roadMarkNode.getAttribute('laneChange') : "both";
					roads[id].laneSection[j].lane[k].roadMark[l].height = parseFloat(roadMarkNode.getAttribute('height') ? roadMarkNode.getAttribute('height') : "0");
				}

				// get Lane Material Record 0+ - not allowed for center lane (laneId=0)
				for (var l=0; l < materialNodes.length; l++) {
					
					var materialNode = materialNodes[l];

					roads[id].laneSection[j].lane[k].material[l] = {};
					roads[id].laneSection[j].lane[k].material[l].sOffset = parseFloat(materialNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].material[l].surface = materialNode.getAttribute('surface');
					roads[id].laneSection[j].lane[k].material[l].friction = parseFloat(materialNode.getAttribute('friction'));
					roads[id].laneSection[j].lane[k].material[l].roughness = parseFloat(materialNode.getAttribute('roughness'));
				}

				// get Lane Visibility Record - not allowed for center lane (laneId=0)
				for (var l=0; l < visibilityNodes.length; l++) {

					var visibilityNode = visibilityNodes[l];

					roads[id].laneSection[j].lane[k].visibility[l] = {};
					roads[id].laneSection[j].lane[k].visibility[l].sOffset = parseFloat(visibilityNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].visibility[l].forward = parseFloat(visibilityNode.getAttribute('forward'));
					roads[id].laneSection[j].lane[k].visibility[l].back = parseFloat(visibilityNode.getAttribute('back'));
					roads[id].laneSection[j].lane[k].visibility[l].left = parseFloat(visibilityNode.getAttribute('left'));
					roads[id].laneSection[j].lane[k].visibility[l].right = parseFloat(visibilityNode.getAttribute('right'));
				}

				// get Lane Speed Record - not allowed for center lane (laneId=0)
				for (var l=0; l < speedNodes.length; l++) {

					var speedNode = speedNodes[l];

					roads[id].laneSection[j].lane[k].speed[l] = {};
					roads[id].laneSection[j].lane[k].speed[l].sOffset = parseFloat(speedNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].speed[l].max = parseFloat(speedNode.getAttribute('max'));
					roads[id].laneSection[j].lane[k].speed[l].unit = speedNode.getAttribute('unit') ? speedNode.getAttribute('unit') : 'm/s';
				}

				// get Lane Access Record - not allowed for center lane (laneId=0)
				for (var l=0; l < accessNodes.length; l++) {

					var accessNode = accessNodes[l];

					roads[id].laneSection[j].lane[k].access[l] = {};
					roads[id].laneSection[j].lane[k].access[l].sOffset = parseFloat(accessNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].access[l].restriction = accessNode.getAttribute('restriction');
				}

				// get Lane Height Record 0+ - not allowed for center lane (laneId=0)
				for (var l=0; l < heightNodes.length; l++) {

					var heightNode = heightNodes[l];

					roads[id].laneSection[j].lane[k].height[l] = {};
					roads[id].laneSection[j].lane[k].height[l].sOffset = parseFloat(heightNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].height[l].inner = parseFloat(heightNode.getAttribute('inner') || 0);
					roads[id].laneSection[j].lane[k].height[l].outer = parseFloat(heightNode.getAttribute('outer') || 0);
				}

				// get Lane Rule Record 0+ - not allowed for center lane (laneId=0)
				for (var l=0; l < ruleNodes.length; l++) {

					var ruleNode = ruleNodes[l];

					roads[id].laneSection[j].lane[k].rule[l] = {};
					roads[id].laneSection[j].lane[k].rule[l].sOffset = parseFloat(ruleNode.getAttribute('sOffset'));
					roads[id].laneSection[j].lane[k].rule[l].value = ruleNode.getAttribute('value');
				}
			}
		}

		// signal 0+
		// NOTE: signal's data structure may need to be extended to work with outside signal system's definition!
		// For example, type - mesh
		var signalNodes = roadNode.getElementsByTagName('signal');
		if (signalNodes.length) roads[id].signal = [];

		for (var j=0; j < signalNodes.length; j++) {

			var signalNode = signalNodes[j];
			// road may contain a signalId the same as one in another road (but shouldn't), re-assemble signalId as roadId.signalId if no name entry provided
			var signalId = signalNode.id;
			var name = signalNode.getAttribute('name');
			if (name.trim() == "") signalId = id + '.' + signalId;

			// road only refer to signal id
			roads[id].signal.push(signalId);

			signals[signalId] = {};
			signals[signalId].name = name;
			signals[signalId].id = signalId;
			signals[signalId].road = id;
			signals[signalId].s = parseFloat(signalNode.getAttribute('s'));
			signals[signalId].t = parseFloat(signalNode.getAttribute('t'));
			signals[signalId].dynamic = signalNode.getAttribute('dynamic');	// yes / no
			signals[signalId].orientation = signalNode.getAttribute('orientation');	// + / - / none
			signals[signalId].zOffset = parseFloat(signalNode.getAttribute('zOffset'));
			signals[signalId].country = signalNode.getAttribute('country');
			signals[signalId].type = signalNode.getAttribute('type');
			signals[signalId].subtype = signalNode.getAttribute('subtype');
			signals[signalId].value = parseFloat(signalNode.getAttribute('value'));
			if (signalNode.getAttribute('unit'))
				signals[signalId].unit = signalNode.getAttribute('unit');	// optional
			if (signalNode.getAttribute('height'))
				signals[signalId].height = parseFloat(signalNode.getAttribute('height'));
			if (signalNode.getAttribute('width'))
				signals[signalId].width = parseFloat(signalNode.getAttribute('width'));
			if (signalNode.getAttribute('text'))
				signals[signalId].text = signalNode.getAttribute('text');
			if (signalNode.getAttribute('hOffset'))
				signals[signalId].hOffset = parseFloat(signalNode.getAttribute('hOffset')); // heading offset from orientation
			if (signalNode.getAttribute('pitch'))
				signals[signalId].pitch = parseFloat(signalNode.getAttribute('pitch'));
			if (signalNode.getAttribute('roll'))
				signals[signalId].roll = parseFloat(signalNode.getAttribute('roll'));

			// lane validity records 0+
			var validityNodes = signalNode.getElementsByTagName('validity');
			if (validityNodes.length) signals[signalId].validity = [];
			for (var k=0; k < validityNodes.length; k++) {

				var validityNode = validityNodes[k];

				signals[signalId].validity[k] = {};
				signals[signalId].validity[k].fromLane = parseInt(validityNode.getAttribute('fromLane'));
				signals[signalId].validity[k].toLane = parseInt(validityNode.getAttribute('toLane'));
			}

			// signal dependency records 0+
			var dependencyNodes = signalNode.getElementsByTagName('dependency');
			if (dependencyNodes.length) signals[signalId].dependency = {};
			for (var k=0; k < dependencyNodes.length; k++) {

				var dependencyNode = dependencyNodes[k];
				var controlledSignalId = dependencyNode.id;

				signals[signalId].dependency[controlledSignalId] = {};
				signals[signalId].dependency[controlledSignalId].id = controlledSignalId;
				signals[signalId].dependency[controlledSignalId].type = dependencyNode.getAttribute('type');
			}
		}

		// signalRerence 0+ - different refer to the same sign from multiple roads
		var signalReferenceNodes = roadNode.getElementsByTagName('signalReference');
		if (signalReferenceNodes.length) roads[id].signalReference = [];

		for (var j=0; j < signalReferenceNodes.length; j++) {

			var signalReferenceNode = signalReferenceNodes[j];

			roads[id].signalReference[j] = {};
			roads[id].signalReference[j].s = parseFloat(signalReferenceNode.getAttribute('s'));
			roads[id].signalReference[j].t = parseFloat(signalReferenceNode.getAttribute('t'));
			roads[id].signalReference[j].id = signalReferenceNode.getAttribute('id');
			roads[id].signalReference[j].orientation = signalReferenceNode.getAttribute('orientation');

			// lane validity records 0+
			var validityNodes = signalReferenceNode.getElementsByTagName('validity');
			if (validityNodes.length) roads[id].signalReference[j].validity = [];
			for (var k=0; k < validityNodes.length; k++) {

				var validityNode = validityNodes[k];

				roads[id].signalReference[j].validity[k] = {};
				roads[id].signalReference[j].validity[k].fromLane = parseInt(validityNode.getAttribute('fromLane'));
				roads[id].signalReference[j].validity[k].toLane = parseInt(validityNode.getAttribute('toLane'));
			}
		}

		// test
		//if (id == '500') console.log(roads[id])
	}

	// controller records 0+
	var controllerNodes = [];
	for (var i=0; i < xmlDoc.firstElementChild.children.length; i++) 
	{
		if (xmlDoc.firstElementChild.children[i].nodeName == 'controller') {
			controllerNodes.push(xmlDoc.firstElementChild.children[i]);
		}
	}
	
	if (controllerNodes.length) 
	{
		var controllers = {};
		
		for (var i=0; i < controllerNodes.length; i++) 
		{

			var controllerNode = controllerNodes[i];
			var id = controllerNode.id;		// controller id type string

			controllers[id] = {};
			controllers[id].id = id;
			controllers[id].name = controllerNode.getAttribute('name');
			controllers[id].sequence = parseInt(controllerNode.getAttribute('sequence') || -1);	// uint32_t [0, +oo], -1 for none
			controllers[id].control = [];

			var controlNodes = controllerNode.getElementsByTagName('control');
			for (var j=0; j < controlNodes.length; j++) {

				var controlNode = controlNodes[j];
				var signalId = controlNode.getAttribute('signalId');
				
				controllers[id].control[signalId] = {};
				controllers[id].control[signalId].signalId = signalId;
				controllers[id].control[signalId].type = controlNode.getAttribute('type');
			}
		}
	}

	// junction records 0+
	var junctionNodes = xmlDoc.getElementsByTagName('junction');

	if (junctionNodes.length) 
	{
		var junctions = {};

		for (var i=0; i < junctionNodes.length; i++) 
		{
			var junctionNode = junctionNodes[i];
			var id = junctionNode.id;	// junction id type string

			junctions[id] = {};
			junctions[id].id = id;
			junctions[id].name = junctionNode.getAttribute('name');
			junctions[id].connection = {};

			var connectionNodes = junctionNode.getElementsByTagName('connection');
			for (var j=0; j < connectionNodes.length; j++) {

				var connectionNode = connectionNodes[j];
				var connectionId = connectionNode.id;

				junctions[id].connection[connectionId] = {};
				junctions[id].connection[connectionId].id = connectionId;
				junctions[id].connection[connectionId].incomingRoad = connectionNode.getAttribute('incomingRoad');
				junctions[id].connection[connectionId].connectingRoad = connectionNode.getAttribute('connectingRoad');
				junctions[id].connection[connectionId].contactPoint = connectionNode.getAttribute('contactPoint');

				var laneLinkNodes = connectionNode.getElementsByTagName('laneLink');
				if (laneLinkNodes.length) junctions[id].connection[j].laneLink = [];
				
				// laneLink 0+ 'from' is incoming lane Id, 'to' is connection lane
				for (var k=0; k < laneLinkNodes.length; k++) {

					var laneLinkNode = laneLinkNodes[k];

					junctions[id].connection[j].laneLink[k] = {};
					junctions[id].connection[j].laneLink[k].from = parseInt(laneLinkNode.getAttribute('from'));
					junctions[id].connection[j].laneLink[k].to = parseInt(laneLinkNode.getAttribute('to'));
				}
			}

			var priorityNodes = junctionNode.getElementsByTagName('priority');
			if (priorityNodes.length) junctions[id].priority = [];
			for (var j=0; j < priorityNodes.length; j++) {

				var priorityNode = priorityNodes[j];
				
				junctions[id].priority[j] = {};
				junctions[id].priority[j].high = priorityNode.getAttribute('high');
				junctions[id].priority[j].low = priorityNode.getAttribute('low');
			}

			var controllerNodes = junctionNode.getElementsByTagName('controller');
			if (controllerNodes.length) junctions[id].controller = [];
			for (var j=0; j < controllerNodes.length; j++) {

				var controllerNode = controllerNodes[j];

				junctions[id].controller[j] = {};
				junctions[id].controller[j].id = controllerNode.getAttribute('id');
				junctions[id].controller[j].type = controllerNode.getAttribute('type');
				junctions[id].controller[j].sequence = parseInt(controllerNode.getAttribute('sequence') || -1);	// uint32_t [0, +oo], -1 for none
			}
		}
	}

	// junction group records 0+
	var junctionGroupNodes = xmlDoc.getElementsByTagName('junctionGroup');
	
	if (junctionGroupNodes.length) {
	
		var junctionGroups = {};

		for (var i=0; i < junctionGroupNodes.length; i++) 
		{

			var junctionGroupNode = junctionGroupNodes[i];

			var id = junctionGroupNode.id;
			junctionGroups[id] = {};
			junctionGroups[id].id = id;
			junctionGroups[id].name = junctionGroupNode.getAttribute('name');
			junctionGroups[id].type = junctionGroupNode.getAttribute('type');
			junctionGroups[id].junctionReference = [];

			var junctionReferenceNodes = junctionGroupNode.getElementsByTagName('junctionReference');
			for (var j=0; j < junctionReferenceNodes.length; j++) {

				var junctionReferenceNode = junctionReferenceNodes[j];
				junctionGroups[id].junctionReference[j] = {};
				junctionGroups[id].junctionReference[j].junction = junctionReferenceNode.getAttribute('junction');	// ID of the junction
			}
		}
	}

	return {roads:roads, signals: signals, controllers:controllers, junctions:junctions, junctionGroups:junctionGroups};
}

/*
* @Parameter jsonFile
* @Return {roads, controllers, junctions, junctionGroups} only roads must be present
*/
Map.prototype.parseFromJSON = function(jsonFile) {

	// Chrome
	xmlHttp = new window.XMLHttpRequest();
	xmlHttp.open("GET", jsonFile, false);
	xmlHttp.overrideMimeType('application/json');
	xmlHttp.send(null);
	jsonDoc = xmlHttp.responseText;

	return JSON.parse(jsonDoc);
}

Map.prototype.generateFrom = function(file) {

	if (file.split('.').pop() == 'xodr') {
		var map = this.parseFromXML(file);
		this.roads = map.roads;
		if (map.signals) this.signals = map.signals;
		if (map.controllers) this.controllers = map.controllers;
		if (map.junctions) this.junctions = map.junctions;
		if (map.junctionGroups) this.junctionGroups = map.junctionGroups;
	} else if (file.split('.').pop() == 'json') {
		var map = this.parseFromJSON(file);
		this.roads = map.roads;
		if (map.signals) this.signals = map.signals;
		if (map.controllers) this.controllers = map.controllers;
		if (map.junctions) this.junctions = map.junctions;
		if (map.junctionGroups) this.junctionGroups = map.junctionGroups;
	}
}

Map.prototype.generateMesh = function() {
	
	preProcessing(this.roads);

	for (var id in this.roads) {
		this.mesh.road[id] = generateRoadMesh(this.roads[id]);
	}

	for (var signalId in this.signals) {
		var signal = this.signals[signalId];
		this.mesh.signal[signalId] = generateSignalMesh(signal, this.roads[signal.road]);
	}
}

Map.prototype.isValidate = function() {

	var isValidate = true;

	if (this.roads.length == 0) isValidate = false;

	for (var id in this.roads) {
		isValidate = isValidateRoad(this.roads[id])
	}

	return isValidate;
}

Map.prototype.getRoadsCnt = function() {
	var cnt = 0;
	for (var id in this.roads) {
		cnt++;
	}
	return cnt;
}

Map.prototype.getRoadIds = function() {
	var ids = [];
	for (var id in this.roads) {
		ids.push(id);
	}
	return ids;
}

Map.prototype.hasRoad = function(roadId) {
	var doHave;
	if (roadId in this.roads) {
		doHave = true;
	} else {
		doHave = false;
	}
	return doHave;
}

Map.prototype.getRoad = function(roadId) {

	if (!this.hasRoad(roadId)) {
		throw Error('Map.getRoad error: invalid roadId');
	}

	var road = new Road(this.roads[roadId]);
	return road;
}

// laneSectionId can be omitted - should not be called publicly
Map.prototype.paveRoadById = function(roadId, laneSectionId) {
	
	if (!this.hasRoad(roadId)) {
		throw Error('Map.paveRoadById error: invalid roadId');
		return;
	}

	// laneSectionId can be omitted, if so, pave the whole road
	if (!laneSectionId) {
		for (var laneSectionId = 0; laneSectionId < this.mesh.road[roadId].length; laneSectionId++) {
			for (var i =0; i < this.mesh.road[roadId][laneSectionId].pavement.length; i++) {
				this.group.road.add(this.mesh.road[roadId][laneSectionId].pavement[i]);
			}
		}
	} else {
		if (laneSectionId < 0 || laneSectionId > this.roads[roadId].laneSection.length - 1) {
			throw Error('paveRoadById error: invalid laneSectionId#', laneSectionId);
		} else {
			for (var i = 0; i < this.mesh.road[roadId][laneSectionId].pavement.length; i++) {
				this.group.road.add(this.mesh.road[roadId][laneSectionId].pavement[i]);
			}
		}
	}
}

Map.prototype.paveAllRoads = function() {

	for (var id in this.roads) {
		this.paveRoadById(id)
	}

	this.scene.add(this.group.road);
}

Map.prototype.paveRoadsByIds = function(roadIds) {

	for (var i = 0; i < roadIds.length; i++) {

		var id = roadIds[i];
		if (!this.hasRoad(id)) {
			throw Error('Map.paveRoadsByIds error: invalid roadIds, roadId#', id, 'does not exist in Map');
			return;
		}

		this.paveRoadById(id);
	}

	this.scene.add(this.group.road);
}

Map.prototype.removeAllRoads = function() {

	if (!!this.group.road) {
		this.scene.remove(this.group.road);
	}
}

// laneSectionId can be omitted - should not be called publicly
Map.prototype.showReferenceLineById = function(roadId, laneSectionId) {
	
	if (!this.hasRoad(roadId)) {
		throw Error('Map.showReferenceLineById error: invalid roadId#', id, 'does not exist in Map');
	}

	// laneSectionId can be omitted, if so, pave the whole road
	if (!laneSectionId) {
		for (var laneSectionId = 0; laneSectionId < this.mesh.road[roadId].length; laneSectionId++) {
			for (var i =0; i < this.mesh.road[roadId][laneSectionId].referenceLine.length; i++) {
				this.group.referenceLine.add(this.mesh.road[roadId][laneSectionId].referenceLine[i]);
			}
		}
	} else {
		if (laneSectionId < 0 || laneSectionId > this.roads[roadId].laneSection.length - 1) {
			throw Error('paveRoadById error: invalid laneSectionId#', laneSectionId);
		} else {
			for (var i = 0; i < this.mesh.road[roadId][laneSectionId].referenceLine.length; i++) {
				this.group.referenceLine.add(this.mesh.road[roadId][laneSectionId].referenceLine[i]);
			}
		}
	}
}

// roadIds can be ommited
Map.prototype.showReferenceLine = function(roadIds) {

	if (roadIds) {
		for (var i=0; i < roadIds.length; i++) {
			var id = roadIds[i];
			if (!this.hasRoad(id)) {
				throw Error('Map.showReferenceLine error: invalid roadIds, Map does not have roadId#', roadId);
				return;
			}
			this.showReferenceLineById(id);
		}	
	} 
	// if roadIds are not speicified, show all roads' reference line
	else {
		for (var id in this.roads) {
			this.showReferenceLineById(id);
		}
	}

	this.scene.add(this.group.referenceLine);
}

Map.prototype.hideReferenceLine = function() {
	
	if (!!this.group.referenceLine) {
		this.scene.remove(this.group.referenceLine);
	}
}

// should not be called publicly
Map.prototype.showSignalById = function(signalId) {

	if (!this.signals[signalId]) {
		throw Error('Map.showSignalById error: invalid signalId#', signalId, 'does not exist in Map');
	}

	this.group.signal.add(this.mesh.signal[signalId]);
}

// roadIds can be ommited
Map.prototype.showSignals = function(roadIds) {

	if (roadIds) {
		for (var i=0; i < roadIds.length; i++) {
			
			var id = roadIds[i];
			if (!this.hasRoad(id)) {
				throw Error('Map.showReferenceLine error: invalid roadIds, Map does not have roadId#', roadId);
				return;
			}

			var road = this.roads[id];

			if (road.signal) {
				for (var j = 0; j < road.signal.length; j++) {
					var signalId = road.signal[j];
					this.showSignalById(signalId);
				}
			} else {
				console.log('placeSignalsInRoads: no signals along road#', roadIds[i]);
			}
		}
	}
	// if roadIds are not speicified, show all signals
	else {
		for (var signalId in this.signals) {
			this.showSignalById(signalId);
		}
	}

	this.scene.add(this.group.signal);
}

Map.prototype.hideSignals = function() {

	if (!!this.group.signal) {
		this.scene.remove(this.group.signal);
	}
}

Map.prototype.destroy = function() {

	for (var p in this) {
		delete this[p];
	}
	delete this.__proto__;
}

Map.prototype.saveAsMap = function(filename) {

	var map = {};
	map.roads = this.roads;
	if (this.controllers) map.controllers = this.controllers;
	if (this.junctions) map.junctions = this.junctions;
	if (this.junctionGroups) map.junctionGroups = this.junctionGroups;
	saveFile(map, filename);
}

Map.prototype.getConnectingRoadIds = function(roadId) {

	if (!map.roads[roadId]) return [];

	var roadIds = [];
	var junctionId = map.roads[roadId].junction;
	var predecessor = map.roads[roadId].predecessor;
	var successor = map.roads[roadId].successor;
	var addedself = false;	// flag if need to push roadId to roadIds at the end

	if (junctionId == '-1') {
		// the road is not in a junction, get its predecessor and successor if any
		if (predecessor) {
			roadIds = roadIds.concat(getLinkedRoadId(predecessor));
			if (predecessor.elementType == 'junction') addedself = true;
		}
		if (successor) {
			roadIds = roadIds.concat(getLinkedRoadId(successor));
			if (successor.elementType == 'junction') addedself = true;
		}
		
		// if neither predecessor not successor is of element type junction, meaning target roadId is not in the roadIds yet
		if (!addedself) {
			roadIds.push(roadId);
		}
	} else {
		// the road is in a junction, get all roads (incoming and connection roads) in the junction
		roadIds = getRoadIdsInJunction(junctionId);
	}

	/* POTENTIAL PROBLEM!
	* if the connecting roads of junction is very short, the returned roads do not cover enough area to show.
	* may need to specify a radius (forward or backward distance in all posible directions) given a s-position on a roadId
	*/
	return roadIds;
}

Map.prototype.track2Inertial = function(roadId, s, t, h) {

	if (!this.hasRoad(roadId)) {
		throw Error('Map.track2Inertial error: invalid roadId#', id, 'does not exist in Map');
	}

	var road = map.roads[roadId];
	
	return track2Inertial(road, s, t, h);
}

/*
* Class Road
*/
var Road = function(road) {
	
	if (road && road instanceof Object && isValidateRoad(road)) {
		
		this.id = road.id;
		this.name = road.name;
		this.length = road.length;
		this.junction = road.junction;

		this.geometry = JSON.parse(JSON.stringify(road.geometry));
		this.laneSection = JSON.parse(JSON.stringify(road.laneSection));

		if (road.predecessor) {
			this.predecessor = JSON.parse(JSON.stringify(road.predecessor));
		}
		if (road.successor) {
			this.successor = JSON.parse(JSON.stringify(road.successor));
		}
		if (road.elevation) {
			this.elevation = JSON.parse(JSON.stringify(road.elevation));
		}
		if (road.superelevation) {
			this.superelevation = JSON.parse(JSON.stringify(road.superelevation));
		}
		if (road.crossfall) {
			this.crossfall = JSON.parse(JSON.stringify(road.crossfall));
		}
		if (road.shape) {
			this.shape = JSON.parse(JSON.stringify(road.shape));
		}
		if (road.laneOffset) {
			this.laneOffset = JSON.parse(JSON.stringify(road.laneOffset));
		}
	} else {
		throw Error('Road construct error: invalid argument road');
	}
}

Road.prototype.isValidate = function() {

	return isValidateRoad(this);
}

Road.prototype.getGeometriesCnt = function() {

	return road.geometry.length;
}

Road.prototype.getLaneSectionsCnt = function() {

	return this.laneSection.length;
}

Road.prototype.saveAsMap = function() {
	var road = JSON.parse(JSON.stringify(this));
	var filename = 'road#' + road.id + '.json';
	saveFile([road], filename);
}

/*
* Private functions
*/
var step = 1; // generate point in step 1m for spiral curve, later apply to arc generation

function isValidateRoad(road) {

	var isValidate = true;

	if (!(road instanceof Object)) {
		return false;
	}

	if (!road.hasOwnProperty('id') || typeof road.id != "string") {
		console.info('invalid road id: road id is not of type string')
		return false;
	} else if (typeof parseInt(road.id) != "number") {
		console.info('invalid road id: not number string')
		return false;
	} else if (typeof parseInt(road.id) < 0) {
		console.info('invalid road id: negative number string')
		return false;
	}

	if (!road.hasOwnProperty('name') || typeof road.name != "string") {
		return false;
	}

	if (!road.hasOwnProperty('length') || typeof road.length != "number") {
		return false;
	} else if (road.length <= 0) {
		console.info('invalid road length: road length <= 0')
		return false;
	}

	if (!road.hasOwnProperty('junction') || typeof road.junction != "string") {
		console.info('invalid road junction: road junction if not of type string')
		return false;
	}

	if (road.geometry.length == 0) {
		console.info('invalid road.geometry: road.geometry.length is 0')
		return false;
	}

	if (road.laneSection.length == 0) {
		console.info('invalid road.laneSection: road.laneSection.length is 0')
		return false;
	}

	if (Math.abs(road.length - road.geometry[road.geometry.length - 1].s - road.geometry[road.geometry.length - 1].length) > 1E-4) {
		console.info('invalid road.length: road.length does not match geometry total length')
		return false;
	}

	for (var i = 0; i < road.geometry.length; i++) {

		var geometry = road.geometry[i];
		//console.log('road#', road.id, 'geometry#', i, geometry)

		if (!geometry.hasOwnProperty('s') || typeof geometry.s != "number") {
			console.info('invalid road.geometry#', i, 'geometry.s is not of type number')
			isValidate = false; break;
		}

		if (!geometry.hasOwnProperty('x') || typeof geometry.x != "number") {
			console.info('invalid road.geometry#', i, 'geometry.x is not of type number')
			isValidate = false; break;
		}

		if (!geometry.hasOwnProperty('y') || typeof geometry.y != "number") {
			console.info('invalid road.geometry#', i, 'geometry.y is not of type number')
			isValidate = false; break;
		}

		if (!geometry.hasOwnProperty('hdg') || typeof geometry.hdg != "number") {
			console.info('invalid road.geometry#', i, 'geometry.hdg is not of type number')
			isValidate = false; break;
		}

		if (!geometry.hasOwnProperty('length') || typeof geometry.length != "number") {
			console.info('invalid road.geometry#', i, 'geometry.length is not of type number')
			isValidate = false; break;
		} else {
			if (geometry.length < 0) {
				console.info('invalid road.geometry#', i, 'geometry.length is < 0')
				isValidate = false; break;
			}
		}

		if (!geometry.hasOwnProperty('type') || typeof geometry.type != "string") {
			console.info('invalid road.geometry#', i, 'geometry.type is not of string')
			isValidate = false; break;
		} else if (geometry.type == 'spiral') {
			if (!geometry.hasOwnProperty('spiral') || !(geometry.spiral instanceof Object)) {
				console.info('invalid road.geometry#', i, 'geometry.spiral missing')
				isValidate = false; break;
			} else if (!geometry.spiral.hasOwnProperty('curvStart') || !geometry.spiral.hasOwnProperty('curvEnd')) {
				console.info('invalid road.geometry#', i, 'geometry.spiral.curvStart or curvEnd missing')
				isValidate = false; break;
			} else if (typeof geometry.spiral.curvStart != "number" || typeof geometry.spiral.curvEnd != "number") {
				console.info('invalid road.geometry#', i, 'geometry.spiral.curvStart or curvEnd is not of type number')
				isValidate = false; break;
			}
		} else if (geometry.type == 'arc') {
			if (!geometry.hasOwnProperty('arc') || !(geometry.arc instanceof Object)) {
				console.info('invalid road.geometry#', i, 'geometry.arc missing')
				isValidate = false; break;
			} else if (!geometry.arc.hasOwnProperty('curvature')) {
				console.info('invalid road.geometry#', i, 'geometry.arc.curvature missing')
				isValidate = false; break;
			} else if (typeof geometry.arc.curvature != "number") {
				console.info('invalid road.geometry#', i, 'geometry.arc.curvature is not of type number')
				isValidate = false; break;
			}
		}
	}

	if (!isValidate) {
		return false;
	}

	for (var i = 0; i < road.laneSection.length; i++) {
		var laneSection = road.laneSection[i];
		if (!laneSection.hasOwnProperty('s') || typeof laneSection.s != "number") {
			console.info('invalid road.laneSection#', i, 'laneSection.s is not of type number')
			isValidate = false; break;
		} else if (Math.abs(laneSection.s - road.length) < 1E-4){
			console.info('invalid road.laneSection#', i, 'laneSection.s is the same as road.length')
			isValidate = false; break;
		} else if (laneSection.lane.length == 0) {
			console.info('invalid road.laneSection#', i, 'laneSection.lane.length == 0')
			isValidate = false; break;
		}
	}

	if (!isValidate) {
		return false;
	}

	return isValidate;
}

function saveFile(data, filename){
    if(!data) {
        console.error('No data')
        return;
    }

    if(!filename) filename = 'console.json'

    if(typeof data === "object"){
        data = JSON.stringify(data, undefined, 4)
    }

    var blob = new Blob([data], {type: 'text/json'}),
        e    = document.createEvent('MouseEvents'),
        a    = document.createElement('a')

    a.download = filename
    a.href = window.URL.createObjectURL(blob)
    a.dataset.downloadurl =  ['text/json', a.download, a.href].join(':')
    e.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null)
    a.dispatchEvent(e)
}

/*
* Pre-process each road's geometry entries based on laneOffset, making sure in each geometry, there is only one kind of laneOffset
*/
function preProcessing(roads) {
	for (var id in roads) {
		var road = roads[id];
		road.geometry = subDivideRoadGeometry(road);

		// assign central reference line's position 
		// and end position for each sub-devided geometry
		for (var j=0; j < road.geometry.length; j++) {
			var geometry = road.geometry[j];
			var endPosition = getGeometryEndPosition(roads, id, j);
			geometry.ex = endPosition.ex;
			geometry.ey = endPosition.ey;
			geometry.centralX = geometry.x;
			geometry.centralY = geometry.y;
		}
	}
}

/*
* Find the successor geometry's start, as the actual end point of current geometry
*
* @Param road the road that possess current geometry
* @Param geometryId the index of current geometry in the road.geometry array
* @Return {ex, ey} the actual end position in x-y plane
*/
function getGeometryEndPosition(roads, roadId, geometryId) {

	var ex = null;
	var ey = null;
	var road = roads[roadId];

	if (geometryId < road.geometry.length - 1) {

		ex = road.geometry[geometryId + 1].x;
		ey = road.geometry[geometryId + 1].y;

	} else if (road.successor) {
		// geometryId is already the end of the road
		/** NOTE: 
			- A road's successor may be a junction, but in this situtation, the geometry must be a line
			without offset curve (not sure if there can be a offset.a), can ignore the ex, ey when paving;
			- Besides, if a road is isolated witout a successor, ex, ey is also OK to ignore.
		 */
		if (road.successor.elementType == 'road') {

			var nextGeometry = roads[road.successor.elementId].geometry[0];
			if (road.successor.contactPoint == 'start') {
				ex = nextGeometry.x;
				ey = nextGeometry.y;	
			} else if (road.successor.contactPoint == 'end') {
				
			} else {
				throwError('invalid road successor contactPoint');
			}
			
		}
	}

	return {ex: ex, ey: ey};
}

/*
* Sub-Diveide a road's geometries based on road laneOffset record
*
* NOTE: POTENTIAL BUG EXITS! (only works when laneOffset happens only on 'line' geometry)
*
* @Param road
* @Return geometries array of sub-divided geometries of the road
*/
function subDivideRoadGeometry(road) {

	if (!road.laneOffset) {
		return road.geometry;
	}

	var geometries = road.geometry;
	var newGeometries = [];

	var laneOffsetId = 0;
	for (var i = 0; i < geometries.length; i++) {
	
		var geometry = geometries[i];
		var foundHead = false;
	
		if (geometry.type != 'line') {
			console.warn('Divide Lane Offset geometry error: not surpport laneOffset on spiral or arc yet');
			newGeometries.push(geometry);
			continue;
		}

		for (var j = laneOffsetId; j < road.laneOffset.length; j++) {

			var laneOffset = road.laneOffset[j];
			var nextLaneOffsetS = road.laneOffset[j + 1] ? road.laneOffset[j + 1].s : geometries[geometries.length - 1].s + geometries[geometries.length - 1].length;

			if (geometry.s + geometry.length <= laneOffset.s) {
				
				if (!foundHead)
					newGeometries.push(geometry);
				break;

			} else if (laneOffset.s > geometry.s) {

				if (!foundHead) {
					foundHead = true;
					var subGeometry1 = {};
					subGeometry1.s = geometry.s;
					subGeometry1.hdg = geometry.hdg;
					subGeometry1.type = geometry.type;
					subGeometry1.length = laneOffset.s - geometry.s;
					subGeometry1.x = geometry.x;
					subGeometry1.y = geometry.y;
					newGeometries.push(subGeometry1);
				}
				
				var subGeometry2 = {};
				subGeometry2.s = laneOffset.s;
				subGeometry2.hdg = geometry.hdg;
				subGeometry2.type = geometry.type;
				subGeometry2.length = Math.min(geometry.s + geometry.length, nextLaneOffsetS) - laneOffset.s;
				subGeometry2.x = geometry.x + (laneOffset.s - geometry.s) * Math.cos(geometry.hdg);
				subGeometry2.y = geometry.y + (laneOffset.s - geometry.s) * Math.sin(geometry.hdg);

				if (laneOffset.a != 0 || laneOffset.b != 0 || laneOffset.c != 0 || laneOffset.d != 0) {
					subGeometry2.offset = {};
					subGeometry2.offset.a = laneOffset.a;
					subGeometry2.offset.b = laneOffset.b;
					subGeometry2.offset.c = laneOffset.c;
					subGeometry2.offset.d = laneOffset.d;
				}

				newGeometries.push(subGeometry2);
				// current LaneOffsetId is done
				if (nextLaneOffsetS <= geometry.s + geometry.length) laneOffsetId++;

			} else if (laneOffset.s == geometry.s){
				
				if (!foundHead) foundHead = true;

				var subGeometry = {};
				subGeometry.s = geometry.s;
				subGeometry.hdg = geometry.hdg;
				subGeometry.type = geometry.type;
				subGeometry.length = Math.min(geometry.s + geometry.length, nextLaneOffsetS) - laneOffset.s;
				subGeometry.x = geometry.x;
				subGeometry.y = geometry.y;

				if (laneOffset.a != 0 || laneOffset.b != 0 || laneOffset.c != 0 || laneOffset.d != 0) {
					subGeometry.offset = {};
					subGeometry.offset.a = laneOffset.a;
					subGeometry.offset.b = laneOffset.b;
					subGeometry.offset.c = laneOffset.c;
					subGeometry.offset.d = laneOffset.d;
				}

				newGeometries.push(subGeometry);
				// current LaneOffsetId is done
				if (nextLaneOffsetS <= geometry.s + geometry.length) laneOffsetId++;

			} else if (laneOffset.s < geometry.s && nextLaneOffsetS > geometry.s) {

				if (!foundHead) {
					foundHead = true;
					var subGeometry1 = {};
					subGeometry1.s = geometry.s;
					subGeometry1.hdg = geometry.hdg;
					subGeometry1.type = geometry.type;
					subGeometry1.length = Math.min(geometry.s + geometry.length, nextLaneOffsetS) - geometry.s;
					subGeometry1.x = geometry.x;
					subGeometry1.y = geometry.y;

					if (laneOffset.a != 0 || laneOffset.b != 0 || laneOffset.c != 0 || laneOffset.d != 0) {
						var sOffset = geometry.s - laneOffset.s;
						subGeometry1.offset = {};
						subGeometry1.offset.a = laneOffset.a + laneOffset.b * sOffset + laneOffset.c * Math.pow(sOffset, 2) + laneOffset.d * Math.pow(sOffset, 3);
						subGeometry1.offset.b = laneOffset.b + 2 * laneOffset.c * sOffset + 3 * laneOffset.d * Math.pow(sOffset, 2);
						subGeometry1.offset.c = laneOffset.c + 3 * laneOffset.d * sOffset;
						subGeometry1.offset.d = laneOffset.d;
						
					}

					newGeometries.push(subGeometry1);
				}

				if (nextLaneOffsetS <= geometry.s + geometry.length) laneOffsetId++;
				
			} else {
				break;
			}
		}
	}

	return newGeometries;
}

function generateRoadMesh(road) {

	var mesh = [];
	for (var i  = 0; i < road.laneSection.length; i++) {

		try {
			mesh[i] = {};
			mesh[i].pavement = generateLaneSectionMesh(road, i);
			mesh[i].referenceLine = generateLaneSectionReferenceLineMesh(road, i);
		} catch(e) {
			console.info('paving error: road#' + road.id + ' laneSection#' + i);
			console.error(e.message + '\n' + e.stack);
		}
	}
	return mesh;
}

function generateLaneSectionMesh(road, laneSectionId) {

	var mesh = [];

	// split lanes into three groups: center, left, right, (only left and right) sorted by absoluate value of lane.id in ascending order (-1 -> -n) (1->m)
	var lanes = road.laneSection[laneSectionId].lane;
	var centralLane, leftLanes = [], rightLanes = [];

	for (var i = 0; i < lanes.length; i++) {
		var lane = lanes[i];
		if (lane.id > 0) 
			leftLanes.push(lane);
		else if (lane.id < 0)
			rightLanes.push(lane);
		else
			centralLane = lane;
	}

	// sort leftLanes and rightLanes in ascending order by Math.abs(lane.id)
	leftLanes.sort(compareLane);
	rightLanes.sort(compareLane);

	// accroding to the start postion relative to the road entry, determine from which point on the geometry will be used 
	var start = road.laneSection[laneSectionId].s;
	var end = road.laneSection[laneSectionId + 1] ? road.laneSection[laneSectionId + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;
	var geometries = getGeometry(road, start, end);

	// elevation and lateral profile
	var elevationLateralProfile = {};
	elevationLateralProfile.elevations = road.elevation;
	elevationLateralProfile.superelevations = road.superelevation;
	elevationLateralProfile.crossfalls = road.crossfall;

	// pave lanes for each geometry seg
	for (var i = 0; i < geometries.length; i++ ) {

		// initiate central reference line's geometry (centralX, centralY and ex, ey is assigend during preProcessing(roads))
		var geometry = geometries[i];
		geometry.centralLength = geometry.length;
		if (!geometry.offset) {
			geometry.offset = {sOffset: 0, a: 0, b: 0, c: 0, d: 0};
		} else {
			// when paving roads, geometry.x, geometry.y is the actural reference line's start position! (drawReferenceLine x,y is still the reference line without offset)
			var tOffset = geometry.offset.a;
			geometry.x += Math.abs(tOffset) * Math.cos(geometry.hdg + Math.PI / 2 * Math.sign(tOffset));
			geometry.y += Math.abs(tOffset) * Math.sin(geometry.hdg + Math.PI / 2 * Math.sign(tOffset));
			geometry.offset.sOffset = 0;
		}

		var currentLane = [0];
		var innerGeometries = [geometry];

		// left Lanes
		while (innerGeometries.length) {

			var laneId = currentLane.pop();
			var innerGeometry = innerGeometries.pop();

			for (var j = laneId; j < leftLanes.length; j++) {

				if (j != laneId) {
					innerGeometry = innerGeometries.pop();
					currentLane.pop();
				}

				try {
					var oGeometries = generateLaneMesh(start, innerGeometry, elevationLateralProfile, leftLanes[j], mesh);
					if (j != leftLanes.length - 1) {
						for (var k = oGeometries.length; k > 0; k--) {
							innerGeometries.push(oGeometries[k - 1]);
							currentLane.push(j + 1);
						}
					}
				} catch(e) {
					console.info('paving error: road#' + road.id + ' laneSection#' + laneSectionId + ' geometry#' + i + ' lane#' + leftLanes[j].id);
					console.error(e.stack)
				}
			}

		}

		innerGeometries = [geometry];
		currentLane = [0];

		// right Lanes
		while (innerGeometries.length) {

			var laneId = currentLane.pop();
			var innerGeometry = innerGeometries.pop();

			for (var j = laneId; j < rightLanes.length; j++) {

				if (j != laneId) {
					innerGeometry = innerGeometries.pop();
					currentLane.pop();
				}

				try {
					var oGeometries = generateLaneMesh(start, innerGeometry, elevationLateralProfile, rightLanes[j], mesh);
					if (j != rightLanes.length - 1) {
						for (var k = oGeometries.length; k > 0; k--) {
							innerGeometries.push(oGeometries[k - 1]);
							currentLane.push(j + 1);
						}
					}
				} catch(e) {
					console.info('paving error: road#' + road.id + ' laneSection#' + laneSectionId + ' geometry#' + i + ' lane#' + rightLanes[j].id);
					console.error(e.stack);
				}
			}
		}

		// central lanes - draw on top of right/left lanes to be seen
		try {
			generateLaneMesh(start, geometry, elevationLateralProfile, centralLane, mesh);
		} catch(e) {
			console.info('paving error: road#' + road.id + ' laneSection#' + laneSectionId + ' geometry#' + i + ' lane#' + centralLane.id);
			console.error(e.stack)
		}
	}

	return mesh;
}

function compareLane(laneA, laneB) {

	// a < b by some ordering criterion
	if (Math.abs(laneA.id) < Math.abs(laneB.id)) {
		return -1;
	}
	// a > b by some ordering criterion
	if (Math.abs(laneA.id) > Math.abs(laneB.id)) {
		return 1;
	}
	// a == b
	return 0;
}

function getGeometry(road, s, es) {

	if (s >= es + 1E-4) {
		throw Error('getGeometry error: start-s >= endS + 1E-4');
	}

	var geometries  = [];
	var found = false;
	//if (maxLength) es = Math.min(es, s + maxLength);

	for (var i = 0; i < road.geometry.length; i++) {
		var geometry = road.geometry[i];
		
		// if already found the start of the returning geometry, copy the rest of the geometries as the suceeding ones until the next lane section starts
		if (found) {
			if (geometry.s + geometry.length <= es) {
				//console.log(found, 'push the whole geometry')				
				geometries.push(road.geometry[i]);
			}
			// Assume delta < 1mm is at the same position
			else if (geometry.s < es && Math.abs(geometry.s - es) > 1E-4) {
				//console.log(found, 'push part of the geometry')
				var newGeometry = {};
				newGeometry.s = geometry.s;
				newGeometry.x = geometry.x;
				newGeometry.y = geometry.y;
				newGeometry.hdg = geometry.hdg;
				newGeometry.type = geometry.type;
				newGeometry.length = es - geometry.s;

				newGeometry.centralX = newGeometry.x;
				newGeometry.centralY = newGeometry.y;
				newGeometry.centralLength = newGeometry.length;

				if (geometry.offset) {
					console.log(geometry.offset)
					newGeometry.offset = geometry.offset;
				}

				// get ex, ey
				switch(geometry.type) {
					case 'line':
						newGeometry.ex = newGeometry.x + newGeometry.length * Math.cos(newGeometry.hdg);
						newGeometry.ey = newGeometry.y + newGeometry.length * Math.sin(newGeometry.hdg);

						break;
					case 'spiral':
						console.error('getGeometry error: not surpport extract part of the geometry of type spiral yet')
						var points = generateSpiralPoints(geometry.length, geometry.x, geometry.y, geometry.hdg, geometry.spiral.curvStart, geoemtry.spiral, geometry.ex, geometry.ey, null, s - geometry.s, newGeometry.length).points;
						console.log(points);
						newGeometry.ex = points[points.length - 1].x;
						newGeometry.ey = points[points.length - 1].y;
						break;
					case 'arc':
						newGeometry.arc = {curvature: geometry.arc.curvature};
						var curvature = newGeometry.arc.curvature;
						var radius = 1 / Math.abs(curvature);
						var rotation = newGeometry.hdg - Math.sign(curvature) * Math.PI / 2;
						var theta = newGeometry.length * curvature;
						newGeometry.ex = newGeometry.x - radius*Math.cos(rotation) + radius * Math.cos(rotation + theta);
						newGeometry.ey = newGeometry.y - radius*Math.sin(rotation) + radius * Math.sin(rotation + theta);
				}

				geometries.push(newGeometry);
			} else {
				break;
			}
		}

		// found the geometry segment which contains the starting position
		if (!found) {
			if (geometry.s == s) {
				// s is the start of a geometry segment of the road, push the whole geometry seg if nextS is not covered by the same geometry
				if (geometry.s + geometry.length <= es) {
					//console.log(found, 'geometry.s == sectionS, push the whole geometry')
					geometries.push(geometry);
				} else {
					//console.log(found, 'geometry.s == sectionS, push part of the geometry')

					var newGeometry = {};
					newGeometry.s = s;
					newGeometry.x = geometry.x;
					newGeometry.y = geometry.y;
					newGeometry.hdg = geometry.hdg;
					newGeometry.type = geometry.type;
					newGeometry.length = es - geometry.s;

					// customely added attributes to geometry specified in .xdor file
					newGeometry.centralX = geometry.centralX;
					newGeometry.centralY = geometry.centralY;
					newGeometry.centralLength = newGeometry.length;
					if (geometry.offset) {
						console.log(geometry.offset)
						newGeometry.offset = geometry.offset;
					}

					// get ex, ey
					switch(geometry.type) {
						case 'line':
							newGeometry.ex = newGeometry.x + newGeometry.length * Math.cos(newGeometry.hdg);
							newGeometry.ey = newGeometry.y + newGeometry.length * Math.sin(newGeometry.hdg);
							break;
						case 'spiral':
							console.error('getGeometry error: not surpport extract part of the geometry of type spiral yet')
							var points = generateSpiralPoints(geometry.length, geometry.x, geometry.y, geometry.hdg, geometry.spiral.curvStart, geoemtry.spiral, geometry.ex, geometry.ey, null, s - geometry.s, newGeometry.length).points
							console.log(points)
							newGeometry.ex = points[points.length - 1].x;
							newGeometry.ey = points[points.length - 1].y;
							break;
						case 'arc':
							newGeometry.arc = {curvature: geometry.arc.curvature};
							var curvature = newGeometry.arc.curvature;
							var radius = 1 / Math.abs(curvature);
							var rotation = newGeometry.hdg - Math.sign(curvature) * Math.PI / 2;
							var theta = newGeometry.length * curvature;
							newGeometry.ex = newGeometry.x - radius*Math.cos(rotation) + radius * Math.cos(rotation + theta);
							newGeometry.ey = newGeometry.y - radius*Math.sin(rotation) + radius * Math.sin(rotation + theta);
					}

					geometries.push(newGeometry);
				}
				found = true;
			} else if (geometry.s < s && geometry.s + geometry.length > s) {
				//console.log(found, 'section is in the middle of the geometry')				
				
				// calcuate the first geometry element for the returning geometries
				var ds = s - geometry.s;
				var partialGeometry = {};
				partialGeometry.s = s;
				partialGeometry.type = geometry.type;
				partialGeometry.length = Math.min(es, geometry.s + geometry.length) - s;

				partialGeometry.centralLength = partialGeometry.length;
				if (geometry.offset) {
					console.log('section is in the middle of the geometry with offset <- offset should start along laneSection! error!')
				}

				switch(geometry.type) {
					case 'line':
						partialGeometry.x = geometry.x + ds * Math.cos(geometry.hdg);
						partialGeometry.y = geometry.y + ds * Math.sin(geometry.hdg);
						partialGeometry.hdg = geometry.hdg;

						partialGeometry.centralX = partialGeometry.x;
						partialGeometry.centralY = partialGeometry.y;
						partialGeometry.ex = geometry.x + (ds + partialGeometry.length) * Math.cos(geometry.hdg);
						partialGeometry.ey = geometry.y + (ds + partialGeometry.length) * Math.sin(geometry.hdg);
						
						geometries.push(partialGeometry);
						break;
					case 'spiral':
						// need the equation presentation for clothoid
						console.error('getGeometry error: not surpport extract part of the geometry of type spiral yet')
						var sample = generateSpiralPoints(geometry.length, geometry.x, geometry.y, geometry.hdg, geometry.spiral.curvStart, geoemtry.spiral, geometry.ex, geometry.ey, null, ds, partialGeometry.length);
						var points = sample.points;
						var heading = sample.heading;
						partialGeometry.x = points[0].x;
						partialGeometry.y = points[0].y;

						// USE Continous or Discreate HDG ? - discreate!(continous needs smaller curv as start)
						partialGeometry.hdg = heading[0];

						partialGeometry.centralX = partialGeometry.x;
						partialGeometry.centralY = partialGeometry.y;
						partialGeometry.ex = points[points.length - 1].x;
						partialGeometry.ey = points[points.length - 1].y;
						geometries.push(partialGeometry);
						break;
					case 'arc':
						var curvature = geometry.arc.curvature;
						var radius = 1 / Math.abs(curvature);
						var theta = ds * curvature;
						var rotation = geometry.hdg - Math.sign(curvature) * Math.PI / 2;
						partialGeometry.x = geometry.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
						partialGeometry.y = geometry.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
						partialGeometry.hdg = geometry.hdg + theta;
						partialGeometry.arc = {curvature: geometry.arc.curvature};

						partialGeometry.centralX = partialGeometry.x;
						partialGeometry.centralY = partialGeometry.y;
						theta += partialGeometry.length * curvature;
						/* NOTE: road#5 laneSection#3 geometry#0 ends as the geometry, caculated ex,ey is not the same as geometry's ex,ey*/
						partialGeometry.ex = geometry.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
						partialGeometry.ey = geometry.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);

						geometries.push(partialGeometry);
						break;
				}
				found = true;
			}
		}
	}

	return geometries;
}

function generateLaneMesh(laneSectionStart, geometry, elevationLateralProfile, lane, mesh) {

	if (!geometry || !lane) {
		console.info('pave: invalid lane. skipped')
		return;
	}

	var subElevationLateralProfile = {elevations: null, superelevations: null, crossfalls: null};

	if (lane.id == 0) {
		subElevationLateralProfile.elevations = getElevation(elevationLateralProfile.elevations, geometry.s, geometry.s + geometry.length);
		subElevationLateralProfile.superelevations = getSuperElevation(elevationLateralProfile.superelevations, geometry.s, geometry.s + geometry.length);
		subElevationLateralProfile.crossfalls = getCrossfall(elevationLateralProfile.crossfalls, geometry.s, geometry.s + geometry.length);

		// width and border is not allowed for center lane. center lane only needs to draw the mark
		drawRoadMark(laneSectionStart, lane.id, geometry, subElevationLateralProfile, null, lane.roadMark, mesh);
		return;
	}

	// lane color based on lane type
	var color = {};
	color.default = 0xCFCFCF;
	color.restricted = 0xB3834C;
	color.shoulder = 0x32CD32;
	color.parking = 0x9999FF;

	var x = geometry.x;
	var y = geometry.y;
	var ex = geometry.ex;
	var ey = geometry.ey;
	var centralX = geometry.centralX;
	var centralY = geometry.centralY;
	var hdg = geometry.hdg;
	var length = geometry.length;
	var type = geometry.type;
	var oGeometries = [];	// outer border of current geometry

	// store the relative width entries covered by this sgement of geometry
	var currentWidth = [];
	for (var i = 0; i < lane.width.length; i++) {
		var width = lane.width[i];
		var nextWidthSOffset = lane.width[i + 1] ? lane.width[i + 1].sOffset : geometry.s + geometry.centralLength - laneSectionStart;
		if (nextWidthSOffset + laneSectionStart <= geometry.s) {
			continue;
		} else if (geometry.s + geometry.centralLength <= width.sOffset + laneSectionStart) {
			break;
		} else {
			currentWidth.push(width);
		}
	}

	var iBorderPoints, oBorderPoints, topiBorderPoints, topoBorderPoints;
	// laneBase is lane face geomtry without height, the rest 5 are used when lane has height, thus lane has six face geometry
	var laneBase, laneTop, laneInnerSide, laneOuterSide, lanePositiveS, laneNegativeS;

	for (var i = 0; i < currentWidth.length; i++) {

		var oGeometry = {};
		oGeometry.hdg = hdg;
		oGeometry.type = type;
		
		// offset distance along central geometry (line) from start of the geometry to start of the current width seg
		var width = currentWidth[i];
		var gOffset = Math.max(width.sOffset + laneSectionStart - geometry.s, 0);
		var nextWidthSOffset = currentWidth[i + 1] ? currentWidth[i + 1].sOffset : geometry.s + geometry.centralLength - laneSectionStart;
		
		length = Math.min(nextWidthSOffset + laneSectionStart, geometry.s + geometry.centralLength) - Math.max(width.sOffset + laneSectionStart, geometry.s);
		
		// generate data for oGeometry
		oGeometry.s = Math.max(width.sOffset + laneSectionStart, geometry.s);
		oGeometry.length = length;
		oGeometry.centralLength = length;

		// width offset distance along central geometry (line) from start of the width entry to start of the current geometry.s
		var wOffset = Math.max(geometry.s - width.sOffset - laneSectionStart, 0);

		/** NOTE: make sure WHICH geometry is used here to generate shifted inner border's coefficients! */
		var innerA = geometry.offset.a + geometry.offset.b * gOffset + geometry.offset.c * Math.pow(gOffset, 2) + geometry.offset.d * Math.pow(gOffset, 3);
		var innerB = geometry.offset.b + 2 * geometry.offset.c * gOffset + 3 * geometry.offset.d * Math.pow(gOffset, 2);
		var innerC = geometry.offset.c + 3 * geometry.offset.d * gOffset;
		var innerD = geometry.offset.d;
		var widthA = width.a + width.b * wOffset + width.c * Math.pow(wOffset, 2) + width.d * Math.pow(wOffset, 3);
		var widthB = width.b + 2 * width.c * wOffset + 3 * width.d * Math.pow(wOffset, 2);
		var widthC = width.c + 3 * width.d * wOffset;
		var widthD = width.d;

		oGeometry.offset = {};
		oGeometry.offset.a = innerA + Math.sign(lane.id) * widthA;
		oGeometry.offset.b = innerB + Math.sign(lane.id) * widthB;
		oGeometry.offset.c = innerC + Math.sign(lane.id) * widthC;
		oGeometry.offset.d = innerD + Math.sign(lane.id) * widthD;

		// elevations covered by this width segment
		subElevationLateralProfile.elevations = getElevation(elevationLateralProfile.elevations, Math.max(width.sOffset + laneSectionStart, geometry.s), Math.min(nextWidthSOffset + laneSectionStart, geometry.s + geometry.centralLength));
		subElevationLateralProfile.superelevations = getSuperElevation(elevationLateralProfile.superelevations, Math.max(width.sOffset + laneSectionStart, geometry.s), Math.min(nextWidthSOffset + laneSectionStart, geometry.s + geometry.centralLength));
		subElevationLateralProfile.crossfalls = getCrossfall(elevationLateralProfile.crossfalls, Math.max(width.sOffset + laneSectionStart, geometry.s), Math.min(nextWidthSOffset + laneSectionStart, geometry.s + geometry.centralLength));

		// laneHeights of the current lane covered by this width segment {inner: array of {s, height}, outer: array of {s, height}}
		var laneHeights = getLaneHeight(laneSectionStart, lane.height, Math.max(width.sOffset + laneSectionStart, geometry.s), Math.min(nextWidthSOffset + laneSectionStart, geometry.s + geometry.centralLength));

		switch(type) {
			
			case 'line':
				var sx = centralX + gOffset * Math.cos(hdg);
				var sy = centralY + gOffset * Math.sin(hdg);

				// tOffset of centralLane at start of the current width seg
				var ds = gOffset;
				var tOffset = geometry.offset.a + geometry.offset.b * ds + geometry.offset.c * Math.pow(ds, 2) + geometry.offset.d * Math.pow(ds, 3);

				// tOffset of centralLane at the end of the current width seg
				var ds = gOffset + length;
				var tOffset = geometry.offset.a + geometry.offset.b * ds + geometry.offset.c * Math.pow(ds, 2) + geometry.offset.d * Math.pow(ds, 3);

				ex = sx + length * Math.cos(hdg) + Math.abs(tOffset) * Math.cos(hdg + Math.PI / 2 * Math.sign(tOffset));
				ey = sy + length * Math.sin(hdg) + Math.abs(tOffset) * Math.sin(hdg + Math.PI / 2 * Math.sign(tOffset));
				
				oGeometry.x = sx + Math.abs(oGeometry.offset.a) * Math.cos(hdg + Math.PI / 2 * Math.sign(oGeometry.offset.a));
				oGeometry.y = sy + Math.abs(oGeometry.offset.a) * Math.sin(hdg + Math.PI / 2 * Math.sign(oGeometry.offset.a));
				
				tOffset = oGeometry.offset.a + oGeometry.offset.b * length  + oGeometry.offset.c * Math.pow(length, 2) + oGeometry.offset.d * Math.pow(length, 3);
				oGeometry.ex = ex + Math.abs(tOffset) * Math.cos(hdg + Math.PI / 2 * Math.sign(tOffset));
				oGeometry.ey = ey + Math.abs(tOffset) * Math.sin(hdg + Math.PI / 2 * Math.sign(tOffset));

				oGeometry.centralX = sx;
				oGeometry.centralY = sy;

				// generate spline points
				if (!(width.a == 0 && width.b == 0 && width.c == 0 && width.d == 0)) {

					// get inner border spline points
					iBorderPoints = generateCubicPoints(gOffset, length, subElevationLateralProfile, null, sx, sy, hdg, geometry.offset);
					//drawCustomLine(iBorderPoints, 0xFF6666);

					// get outer border spline points
					oBorderPoints = generateCubicPoints(0, length, subElevationLateralProfile, null, sx, sy, hdg, oGeometry.offset);
					//drawCustomLine(oBorderPoints, 0x6666FF);
					
					if (lane.id < 0)
						laneBase = createCustomFaceGeometry(iBorderPoints, oBorderPoints);
					else if (lane.id > 0)
						laneBase = createCustomFaceGeometry(oBorderPoints, iBorderPoints);

					if (laneHeights.inner.length && laneHeights.outer.length) {

						topiBorderPoints = generateCubicPoints(gOffset, length, subElevationLateralProfile, laneHeights.inner, sx, sy, hdg, geometry.offset);
						topoBorderPoints = generateCubicPoints(0, length, subElevationLateralProfile, laneHeights.outer, sx, sy, hdg, oGeometry.offset);

						if (lane.id < 0) {
							laneTop = createCustomFaceGeometry(topiBorderPoints, topoBorderPoints);
							laneInnerSide = createCustomFaceGeometry(iBorderPoints, topiBorderPoints);
							laneOuterSide = createCustomFaceGeometry(topoBorderPoints, oBorderPoints);
							lanePositiveS = createCustomFaceGeometry([topiBorderPoints[topiBorderPoints.length - 1], iBorderPoints[iBorderPoints.length - 1]], [topoBorderPoints[topoBorderPoints.length - 1], oBorderPoints[oBorderPoints.length - 1]]);
							laneNegativeS = createCustomFaceGeometry([topoBorderPoints[0], oBorderPoints[0]], [topiBorderPoints[0], iBorderPoints[0]]);
						}
						else if (lane.id > 0) {
							laneTop = createCustomFaceGeometry(topoBorderPoints, topiBorderPoints);
							laneInnerSide = createCustomFaceGeometry(topiBorderPoints, iBorderPoints);
							laneOuterSide = createCustomFaceGeometry(oBorderPoints, topoBorderPoints);
							lanePositiveS = createCustomFaceGeometry([topoBorderPoints[topoBorderPoints.length - 1], oBorderPoints[oBorderPoints.length - 1]], [topiBorderPoints[topiBorderPoints.length - 1], iBorderPoints[iBorderPoints.length - 1]]);
							laneNegativeS = createCustomFaceGeometry([topiBorderPoints[0], iBorderPoints[0]], [topoBorderPoints[0], oBorderPoints[0]]);
						}
					}
				}

				break;
			case 'spiral':

				//* ALWAYS use the central clothoid and shift by tOffset to find the border when paving along spiral line

				var centralSample = generateSpiralPoints(geometry.centralLength, null, null, geometry.centralX, geometry.centralY, geometry.hdg, geometry.spiral.curvStart, geometry.spiral.curvEnd, geometry.ex, geometry.ey, null, gOffset, length);
				var sx = centralSample.points[0].x;
				var sy = centralSample.points[0].y;
				hdg = centralSample.heading[0];
				ex = centralSample.points[centralSample.points.length - 1].x;
				ey = centralSample.points[centralSample.points.length - 1].y;

				//* NOTE: for spiral only, all its x,y, ex,ey, curvStart, curvEnd are the same as central reference line, i.e. keeps the same as original geometry when paving across lanes
				oGeometry.x = sx;
				oGeometry.y = sy;
				oGeometry.centralX = sx;
				oGeometry.centralY = sy;
				oGeometry.ex = ex;
				oGeometry.ey = ey;
				oGeometry.hdg = hdg;

				var curvStart = geometry.spiral.curvStart + gOffset * (geometry.spiral.curvEnd - geometry.spiral.curvStart) / geometry.centralLength;
				var curvEnd = geometry.spiral.curvStart + (gOffset + length) * (geometry.spiral.curvEnd - geometry.spiral.curvStart) / geometry.centralLength;

				oGeometry.spiral = {curvStart: curvStart, curvEnd: curvEnd};

				// generate spline points
				if (!(width.a == 0 && width.b == 0 && width.c == 0 && width.d == 0)) {

					// get inner border spline points
					iBorderPoints = generateSpiralPoints(length, subElevationLateralProfile, null, sx, sy, hdg, curvStart, curvEnd, ex, ey, {a: innerA, b: innerB, c: innerC, d: innerD}).points;
					//drawCustomLine(iBorderPoints, 0xFF6666);
					//if (lane.type != 'border' && lane.type != 'none') drawLineAtPoint(iBorderPoints[iBorderPoints.length - 1].x, iBorderPoints[iBorderPoints.length - 1].y, iBorderPoints[iBorderPoints.length - 1].z, geometry.hdg + Math.sign(lane.id) * Math.PI / 4)
					
					// get outer border spline points
					oBorderPoints = generateSpiralPoints(oGeometry.length, subElevationLateralProfile, null, oGeometry.x, oGeometry.y, oGeometry.hdg, oGeometry.spiral.curvStart, oGeometry.spiral.curvEnd, oGeometry.ex, oGeometry.ey, oGeometry.offset).points;
					//drawCustomLine(oBorderPoints, 0x6666FF);
					//if (lane.type != 'border' && lane.type != 'none') drawLineAtPoint(oBorderPoints[oBorderPoints.length - 1].x, oBorderPoints[oBorderPoints.length - 1].y, oBorderPoints[oBorderPoints.length - 1].z, geometry.hdg + Math.sign(lane.id) * Math.PI / 4)
					
					if (lane.id < 0)
						laneBase = createCustomFaceGeometry(iBorderPoints, oBorderPoints);
					if (lane.id > 0)
						laneBase = createCustomFaceGeometry(oBorderPoints, iBorderPoints);

					if (laneHeights.inner.length && laneHeights.outer.length) {

						topiBorderPoints = generateSpiralPoints(geometry.length, subElevationLateralProfile, laneHeights.inner, geometry.x, geometry.y, geometry.hdg, geometry.spiral.curvStart, geometry.spiral.curvEnd, geometry.ex, geometry.ey, geometry.offset, gOffset, length).points;
						topoBorderPoints = generateSpiralPoints(oGeometry.length, subElevationLateralProfile, laneHeights.outer, oGeometry.x, oGeometry.y, oGeometry.hdg, oGeometry.spiral.curvStart, oGeometry.spiral.curvEnd, oGeometry.ex, oGeometry.ey, oGeometry.offset).points;

						if (lane.id < 0) {
							laneTop = createCustomFaceGeometry(topiBorderPoints, topoBorderPoints);
							laneInnerSide = createCustomFaceGeometry(iBorderPoints, topiBorderPoints);
							laneOuterSide = createCustomFaceGeometry(topoBorderPoints, oBorderPoints);
							lanePositiveS = createCustomFaceGeometry([topiBorderPoints[topiBorderPoints.length - 1], iBorderPoints[iBorderPoints.length - 1]], [topoBorderPoints[topoBorderPoints.length - 1], oBorderPoints[oBorderPoints.length - 1]]);
							laneNegativeS = createCustomFaceGeometry([topoBorderPoints[0], oBorderPoints[0]], [topiBorderPoints[0], iBorderPoints[0]]);
						}
						else if (lane.id > 0) {
							laneTop = createCustomFaceGeometry(topoBorderPoints, topiBorderPoints);
							laneInnerSide = createCustomFaceGeometry(topiBorderPoints, iBorderPoints);
							laneOuterSide = createCustomFaceGeometry(oBorderPoints, topoBorderPoints);
							lanePositiveS = createCustomFaceGeometry([topoBorderPoints[topoBorderPoints.length - 1], oBorderPoints[oBorderPoints.length - 1]], [topiBorderPoints[topiBorderPoints.length - 1], iBorderPoints[iBorderPoints.length - 1]]);
							laneNegativeS = createCustomFaceGeometry([topiBorderPoints[0], iBorderPoints[0]], [topoBorderPoints[0], oBorderPoints[0]]);
						}
					}
				}

				break;
			case 'arc':

				//* ALWAYS use the central arc and shift by tOffset to find the border when paving along arc line
				
				var curvature = geometry.arc.curvature;
				var radius = 1 / Math.abs(curvature);
				var rotation = geometry.hdg - Math.sign(curvature) * Math.PI / 2;
				var theta = gOffset * curvature;

				//* NOTE: for arc only, all its x,y, ex,ey, curvStart, curvEnd are the same as central reference line, i.e. keeps the same as original geometry when paving across lanes
				var sx = geometry.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
				var sy = geometry.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
				hdg = geometry.hdg + theta;
				theta = (gOffset + length) * curvature;
				ex = geometry.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
				ey = geometry.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);

				oGeometry.x = sx;
				oGeometry.y = sy;
				oGeometry.centralX = sx;
				oGeometry.centralY = sy;
				oGeometry.hdg = hdg;
				oGeometry.arc = {curvature: curvature};

				// generate spline points
				if (!(width.a == 0 && width.b == 0 && width.c == 0 && width.d == 0)) {

					// get inner border spline points
					iBorderPoints = generateArcPoints(length, subElevationLateralProfile, null, sx, sy, hdg, curvature, ex, ey, {a: innerA, b: innerB, c: innerC, d: innerD}).points;
					//drawCustomLine(iBorderPoints, 0xFF6666);

					// get outer border spline points
					oBorderPoints = generateArcPoints(length, subElevationLateralProfile, null, sx, sy, hdg, curvature, ex, ey, oGeometry.offset).points;
					//drawCustomLine(oBorderPoints, 0x6666FF);
					
					if (lane.id < 0)
						laneBase = createCustomFaceGeometry(iBorderPoints, oBorderPoints);
					if (lane.id > 0)
						laneBase = createCustomFaceGeometry(oBorderPoints, iBorderPoints);

					if (laneHeights.inner.length && laneHeights.outer.length) {

						topiBorderPoints = generateArcPoints(length, subElevationLateralProfile, laneHeights.inner, sx, sy, hdg, curvature, ex, ey, {a: innerA, b: innerB, c: innerC, d: innerD}).points;
						topoBorderPoints = generateArcPoints(length, subElevationLateralProfile, laneHeights.outer, sx, sy, hdg, curvature, ex, ey, oGeometry.offset).points;

						if (lane.id < 0) {
							laneTop = createCustomFaceGeometry(topiBorderPoints, topoBorderPoints);
							laneInnerSide = createCustomFaceGeometry(iBorderPoints, topiBorderPoints);
							laneOuterSide = createCustomFaceGeometry(topoBorderPoints, oBorderPoints);
							lanePositiveS = createCustomFaceGeometry([topiBorderPoints[topiBorderPoints.length - 1], iBorderPoints[iBorderPoints.length - 1]], [topoBorderPoints[topoBorderPoints.length - 1], oBorderPoints[oBorderPoints.length - 1]]);
							laneNegativeS = createCustomFaceGeometry([topoBorderPoints[0], oBorderPoints[0]], [topiBorderPoints[0], iBorderPoints[0]]);
						}
						else if (lane.id > 0) {
							laneTop = createCustomFaceGeometry(topoBorderPoints, topiBorderPoints);
							laneInnerSide = createCustomFaceGeometry(topiBorderPoints, iBorderPoints);
							laneOuterSide = createCustomFaceGeometry(oBorderPoints, topoBorderPoints);
							lanePositiveS = createCustomFaceGeometry([topoBorderPoints[topoBorderPoints.length - 1], oBorderPoints[oBorderPoints.length - 1]], [topiBorderPoints[topiBorderPoints.length - 1], iBorderPoints[iBorderPoints.length - 1]]);
							laneNegativeS = createCustomFaceGeometry([topiBorderPoints[0], iBorderPoints[0]], [topoBorderPoints[0], oBorderPoints[0]]);
						}
					}
				}

				break;
		}

		oGeometries.push(oGeometry);

		try {
			if (lane.type != 'border' && lane.type != 'none') {
				var laneMesh = new THREE.Group();
				var baseMesh = new THREE.Mesh(laneBase, new THREE.MeshBasicMaterial({color: color[lane.type]? color[lane.type] : color.default, side: THREE.DoubleSide}));
				laneMesh.add(baseMesh);

				if (laneHeights.inner.length && laneHeights.outer.length) {
					var topMesh = new THREE.Mesh(laneTop, new THREE.MeshBasicMaterial({color: color[lane.Type]? color[lane.type] : color.default, side: THREE.DoubleSide}))
					var innerMesh = new THREE.Mesh(laneInnerSide, new THREE.MeshBasicMaterial({color: color[lane.type]? color[lane.type] : color.default, side: THREE.DoubleSide}));
					var outerMesh = new THREE.Mesh(laneOuterSide, new THREE.MeshBasicMaterial({color: color[lane.type]? color[lane.type] : color.default, side: THREE.DoubleSide}));
					var frontMesh = new THREE.Mesh(lanePositiveS, new THREE.MeshBasicMaterial({color: color[lane.type]? color[lane.type] : color.default, side: THREE.DoubleSide}));
					var backMesh = new THREE.Mesh(laneNegativeS, new THREE.MeshBasicMaterial({color: color[lane.type]? color[lane.type] : color.default, side: THREE.DoubleSide}));
					laneMesh.add(topMesh);
					laneMesh.add(innerMesh);
					laneMesh.add(outerMesh);
					laneMesh.add(frontMesh);
					laneMesh.add(backMesh);
				}
				mesh.push(laneMesh);
			}
		} catch(e) {
			console.error(type, e.stack)
		}

		// draw road marks
		try {
			if (oGeometry.length > 1E-10)
				drawRoadMark(laneSectionStart, lane.id, oGeometries[i], subElevationLateralProfile, laneHeights.outer, lane.roadMark, mesh);
		} catch(e) {
			console.error(e);
		}
	}

	return oGeometries;
}

function getElevation(elevations, s, es) {

	if (s >= es + 1E-4) {
		throw Error('getElevation error: start-s >= endS + 1E-4');
	}

	var newElevations = [];
	var found = false;
	
	if (!elevations) {
		return elevations;
	}

	for (var i = 0; i < elevations.length; i++) {
		var elevation = elevations[i];
		var nextElevationS = elevations[i + 1] ? elevations[i + 1].s : es
		
		// if already found the start of the returning elevation, copy the rest of the elevations as the succeeding ones until es
		if (found) {
			if (elevation.s < es) {
				newElevations.push(elevation);
			} else {
				break;
			}
		}

		if (!found) {
			if (nextElevationS <= s) {
				continue;
			}
			if (elevation.s == s) {
				newElevations.push(elevation);
			} else if (elevation.s < s && nextElevationS > s) {
				var sOffset = s - elevation.s;
				var newElevation = {};
				newElevation.s = s;
				newElevation.a = elevation.a + elevation.b * sOffset + elevation.c * Math.pow(sOffset, 2) + elevation.d * Math.pow(sOffset, 3);
				newElevation.b = elevation.b + 2 * elevation.c * sOffset + 3 * elevation.d * Math.pow(sOffset, 2);
				newElevation.c = elevation.c + 3 * elevation.d * sOffset;
				newElevation.d = elevation.d;
				newElevations.push(newElevation);
			} else {
				console.error(elevation.s, s, nextElevationS)
			}
			found = true;
		}
	}

	return newElevations;
}

function getSuperElevation(superelevations, s, es) {

	if (s >= es + 1E-4) {
		throw Error('getSuperElevation error: start-s >= endS + 1E-4');
	}

	var newSuperelevations = [];
	var found = false;

	if (!superelevations) {
		return superelevations;
	}

	for (var i = 0; i < superelevations.length; i++) {

		var superelevation = superelevations[i];
		var nextSupserElevationS = superelevations[i + 1] ? superelevations[i + 1].s : es;

		// if already fount the start of the returning supserelevation, copy the rest supserelevations as the succeeding ones until es
		if (found) {
			if (superelevation.s < es) {
				newSuperelevations.push(superelevation);
			} else {
				break;
			}
		}

		if (!found) {
			if (nextSupserElevationS <= s) {
				continue;
			}
			if (superelevation.s == s) {
				newSuperelevations.push(superelevation);
			} else if (superelevation.s < s && nextSupserElevationS > s) {
				var sOffset = s - superelevation.s;
				var newSuperelevation = {};
				newSuperelevation.s = s;
				newSuperelevation.a = superelevation.a + superelevation.b * sOffset + superelevation.c * Math.pow(sOffset, 2) + superelevation.d * Math.pow(sOffset, 3);
				newSuperelevation.b = superelevation.b + 2 * superelevation.c * sOffset + 3 * superelevation.d * Math.pow(sOffset, 2);
				newSuperelevation.c = superelevation.c + 3 * superelevation.d * sOffset;
				newSuperelevation.d = superelevation.d;
				newSuperelevations.push(newSuperelevation);
			}
			found = true;
		}
	}

	return newSuperelevations;
}

function getCrossfall(crossfalls, s, es) {

	if (s >= es + 1E-4) {
		throw Error('getCrossfall error: start-s >= endS + 1E-4');
	}

	var newCrossfalls = [];
	var found = false;

	if (!crossfalls) {
		return crossfalls;
	}

	for (var i = 0; i < crossfalls.length; i++) {

		var crossfall = crossfalls[i];
		var nextCrossfallS = crossfalls[i + 1] ? crossfalls[i + 1].s : es;

		// if already fount the start of the returning supserelevation, copy the rest supserelevations as the succeeding ones until es
		if (found) {
			if (crossfall.s < es) {
				newCrossfalls.push(crossfall);
			} else {
				break;
			}
		}

		if (!found) {
			if (nextCrossfallS <= s) {
				continue;
			}
			if (crossfall.s == s) {
				newCrossfalls.push(crossfall);
			} else if (crossfall.s < s && nextCrossfallS > s) {
				var sOffset = s - crossfall.s;
				var newCrossfall = {};
				newCrossfall.s = s;
				newCrossfall.side = crossfall.side;
				newCrossfall.a = crossfall.a + crossfall.b * sOffset + crossfall.c * Math.pow(sOffset, 2) + crossfall.d * Math.pow(sOffset, 3);
				newCrossfall.b = crossfall.b + 2 * crossfall.c * sOffset + 3 * crossfall.d * Math.pow(sOffset, 2);
				newCrossfall.c = crossfall.c + 3 * crossfall.d * sOffset;
				newCrossfall.d = crossfall.d;
				newCrossfalls.push(newCrossfall);
			}
			found = true;
		}
	}

	return newCrossfalls;
}

function getLaneHeight(laneSectionStart, laneHeights, s, es) {

	if (s >= es + 1E-4) {
		throw Error('getCrossfall error: start-s >= endS + 1E-4');
	}
	
	var newLaneHeights;
	var innerHeights = [];
	var outerHeights = [];
	var found = false;

	if (!laneHeights) {
		return {inner: innerHeights, outer: outerHeights};
	}

	for (var i = 0; i < laneHeights.length; i++) {

		var laneHeight = laneHeights[i];
		var nextLaneHeightS = laneHeights[i + 1] ? laneHeights[i + 1].sOffset + laneSectionStart : es;

		// if already fount the start of the returning superelevation, copy the rest superelevations as the succeeding ones until es
		if (found) {
			if (laneHeight.s < es) {
				innerHeights.push({s: laneHeight.s, height: laneHeight.inner});
				outerHeights.push({s: laneHeight.s, height: laneHeight.outer});
			} else {
				break;
			}
		}

		if (!found) {
			if (nextLaneHeightS <= s) {
				continue;
			}
			if (laneHeight.sOffset + laneSectionStart == s || (laneHeight.sOffset + laneSectionStart < s && nextLaneHeightS > s)) {
				innerHeights.push({s: laneHeight.sOffset + laneSectionStart, height: laneHeight.inner});
				outerHeights.push({s: laneHeight.sOffset + laneSectionStart, height: laneHeight.outer});
				found = true;
			}
		}
	}

	newLaneHeights = {inner: innerHeights, outer: outerHeights};

	return newLaneHeights;
}

function createCustomFaceGeometry(lBorderPoints, rBorderPoints)  {

	var geometry = new THREE.BufferGeometry();
	var vertices = [];

	// start from iBorder's first point, each loop draw 2 triangles representing the quadralateral iBorderP[i], iBorderP[i+1], oBorder[i+1], oBorder[i] 
	for (var i = 0; i < Math.min(lBorderPoints.length, rBorderPoints.length) - 1; i++) {
		vertices = vertices.concat([rBorderPoints[i].x, rBorderPoints[i].y, rBorderPoints[i].z]);
		vertices = vertices.concat([rBorderPoints[i + 1].x, rBorderPoints[i + 1].y, rBorderPoints[i + 1].z]);
		vertices = vertices.concat([lBorderPoints[i + 1].x, lBorderPoints[i + 1].y, lBorderPoints[i + 1].z]);

		vertices = vertices.concat([rBorderPoints[i].x, rBorderPoints[i].y, rBorderPoints[i].z]);
		vertices = vertices.concat([lBorderPoints[i + 1].x, lBorderPoints[i + 1].y, lBorderPoints[i + 1].z]);
		vertices = vertices.concat([lBorderPoints[i].x, lBorderPoints[i].y, lBorderPoints[i].z]);
	}

	if (lBorderPoints.length < rBorderPoints.length) {

		var lPoint = lBorderPoints[lBorderPoints.length - 1];

		for (var i = lBorderPoints.length - 1; i < rBorderPoints.length - 1; i++) {
			vertices = vertices.concat([lPoint.x, lPoint.y, lPoint.z]);
			vertices = vertices.concat([rBorderPoints[i].x, rBorderPoints[i].y, rBorderPoints[i].z]);
			vertices = vertices.concat([rBorderPoints[i + 1].x, rBorderPoints[i + 1].y, rBorderPoints[i + 1].z]);
		}
	}


	if (lBorderPoints.length > rBorderPoints.length) {

		var rPoint = rBorderPoints[rBorderPoints.length - 1];

		for (var i = rBorderPoints.length - 1; i < lBorderPoints.length - 1; i++) {
			vertices = vertices.concat([rPoint.x, rPoint.y, rPoint.z]);
			vertices = vertices.concat([lBorderPoints[i + 1].x, lBorderPoints[i + 1].y, lBorderPoints[i + 1].z]);
			vertices = vertices.concat([lBorderPoints[i].x, lBorderPoints[i].y, lBorderPoints[i].z]);
		}
	}

	vertices = Float32Array.from(vertices)
	// itemSize = 3 becuase there are 3 values (components) per vertex
	geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));

	return geometry;
}

function drawCustomLine(points, color, zOffset) {

	var geometry = new THREE.Geometry();
	geometry.vertices = points;
	var material = new THREE.MeshBasicMaterial({color: color != undefined ? color : 0x00FF00});
	var mesh = new THREE.Line(geometry, material);
	mesh.position.set(0, 0, zOffset || 0)
	scene.add(mesh);
}

function drawLineAtPoint(point, hdg, length, color) {

	length = length || 10;
	var points = [new THREE.Vector3(point.x, point.y, point.z), new THREE.Vector3(point.x + length * Math.cos(hdg), point.y + length * Math.sin(hdg), point.z)];
	drawCustomLine(points, color);
}

function drawSphereAtPoint(point, color) {
	var geometry = new THREE.SphereBufferGeometry(0.08, 16, 16);
	var material = new THREE.MeshBasicMaterial({color: color != undefined ? color : 0x00FF00});
	var mesh = new THREE.Mesh(geometry, material);
	mesh.position.set(point.x, point.y, point.z);
	scene.add(mesh);
}

function drawRoadMark(laneSectionStart, laneId, oBorder, elevationLateralProfile, outerHeights, roadMarks, mesh) {

	if (!roadMarks) return;
	
	if (roadMarks.length == 0) return;

	// road mark color info
	var colorMaterial = {};
	colorMaterial.standard = new THREE.MeshBasicMaterial({color: 0xFFFFFF});
	colorMaterial.blue = new THREE.MeshBasicMaterial({color: 0x0000FF});
	colorMaterial.green = new THREE.MeshBasicMaterial({color: 0x00FF00});
	colorMaterial.red = new THREE.MeshBasicMaterial({color: 0xFF0000});
	colorMaterial.white = new THREE.MeshBasicMaterial({color: 0xFFFFFF});
	colorMaterial.yellow = new THREE.MeshBasicMaterial({color: 0xFFD700});

	// find which roadMarks are covered by this oBorder seg
	var currentMarks = [];
	for (var i = 0; i < roadMarks.length; i++) {
		var roadMark = roadMarks[i];
		var nextRoadMarkSOffset = roadMarks[i + 1] ? roadMarks[i + 1].sOffset : oBorder.s + oBorder.centralLength - laneSectionStart;
		if (nextRoadMarkSOffset + laneSectionStart <= oBorder.s || Math.abs(nextRoadMarkSOffset + laneSectionStart - oBorder.s) <= 1E-4) {	
			continue;
		} else if (oBorder.s + oBorder.centralLength <= roadMark.sOffset + laneSectionStart || Math.abs(oBorder.s + oBorder.centralLength - roadMark.sOffset - laneSectionStart) <= 1E-4) {
			break;
		} else {
			currentMarks.push(roadMark);
		}
	}

	for (var i = 0; i < currentMarks.length; i++) {

		var roadMark = currentMarks[i];

		var nextRoadMarkSOffset = currentMarks[i + 1] ? currentMarks[i + 1].sOffset : oBorder.s + oBorder.centralLength - laneSectionStart;

		if (roadMark.type == 'none') continue;

		var sOffset = Math.max(roadMark.sOffset + laneSectionStart - oBorder.s, 0);
		var width = roadMark.width;
		var length = Math.min(nextRoadMarkSOffset + laneSectionStart, oBorder.s + oBorder.centralLength) - Math.max(roadMark.sOffset + laneSectionStart, oBorder.s);

		var offsetA = oBorder.offset.a + oBorder.offset.b * sOffset + oBorder.offset.c * Math.pow(sOffset, 2) + oBorder.offset.d * Math.pow(sOffset, 3);
		var offsetB = oBorder.offset.b + 2 * oBorder.offset.c * sOffset + 3 * oBorder.offset.d * Math.pow(sOffset, 2);
		var offsetC = oBorder.offset.c + 3 * oBorder.offset.d * sOffset;
		var offsetD = oBorder.offset.d;

		var subElevationLateralProfile = {};
		subElevationLateralProfile.elevations = getElevation(elevationLateralProfile.elevations, Math.max(roadMark.sOffset + laneSectionStart, oBorder.s),  Math.min(nextRoadMarkSOffset + laneSectionStart, oBorder.s + oBorder.centralLength));
		subElevationLateralProfile.superelevations = getSuperElevation(elevationLateralProfile.superelevations, Math.max(roadMark.sOffset + laneSectionStart, oBorder.s),  Math.min(nextRoadMarkSOffset + laneSectionStart, oBorder.s + oBorder.centralLength));
		subElevationLateralProfile.crossfalls = getCrossfall(elevationLateralProfile.crossfalls, Math.max(roadMark.sOffset + laneSectionStart, oBorder.s),  Math.min(nextRoadMarkSOffset + laneSectionStart, oBorder.s + oBorder.centralLength));

		var lBorderPoints, rBorderPoints;
		var llBorderPoints, lrBorderPoints, rlBorderPoints, rrBorderPoints;
		var geometry, lgeometry, rgeometry, roadMarkMesh;

		switch(oBorder.type) {

			case 'line':

				var sx = oBorder.centralX + sOffset * Math.cos(oBorder.hdg);
				var sy = oBorder.centralY + sOffset * Math.sin(oBorder.hdg);

				var lateralOffset;

				if (roadMark.type.split(' ').length == 1) {
					lateralOffset = {a: offsetA - width / 2, b: offsetB, c: offsetC, d: offsetD};
					rBorderPoints = generateCubicPoints(sOffset, length, subElevationLateralProfile, outerHeights, sx, sy, oBorder.hdg, lateralOffset);
					
					lateralOffset = {a: offsetA + width / 2, b: offsetB, c: offsetC, d: offsetD};
					lBorderPoints = generateCubicPoints(sOffset, length, subElevationLateralProfile, outerHeights, sx, sy, oBorder.hdg, lateralOffset);
				}
				
				if (roadMark.type.split(' ').length == 2) {
					lateralOffset = {a: offsetA - 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
					rrBorderPoints = generateCubicPoints(sOffset, length, subElevationLateralProfile, outerHeights, sx, sy, oBorder.hdg, lateralOffset);
					
					lateralOffset = {a: offsetA - 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
					rlBorderPoints = generateCubicPoints(sOffset, length, subElevationLateralProfile, outerHeights, sx, sy, oBorder.hdg, lateralOffset);

					lateralOffset = {a: offsetA + 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
					lrBorderPoints = generateCubicPoints(sOffset, length, subElevationLateralProfile, outerHeights, sx, sy, oBorder.hdg, lateralOffset);
					
					lateralOffset = {a: offsetA + 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
					llBorderPoints = generateCubicPoints(sOffset, length, subElevationLateralProfile, outerHeights, sx, sy, oBorder.hdg, lateralOffset);
				}

				break;
			case 'spiral':

				/* NOTE: multiple roadMarks may happen on geometries besides 'line', e.g. road#91 geometry#1*/
				var lateralOffset;

				if (roadMark.type.split(' ').length == 1) {
					lateralOffset = {a: offsetA - width / 2, b: offsetB, c: offsetC, d: offsetD};
					rBorderPoints = generateSpiralPoints(oBorder.length, subElevationLateralProfile, outerHeights, oBorder.centralX, oBorder.centralY, oBorder.hdg, oBorder.spiral.curvStart, oBorder.spiral.curvEnd, oBorder.ex, oBorder.ey, lateralOffset, sOffset, length).points;
					//drawCustomLine(rBorderPoints, 0xFF6666);

					lateralOffset = {a: offsetA + width / 2, b: offsetB, c: offsetC, d: offsetD};
					lBorderPoints = generateSpiralPoints(oBorder.length, subElevationLateralProfile, outerHeights, oBorder.centralX, oBorder.centralY, oBorder.hdg, oBorder.spiral.curvStart, oBorder.spiral.curvEnd, oBorder.ex, oBorder.ey, lateralOffset, sOffset, length).points;
					//drawCustomLine(lBorderPoints, 0x6666FF);
				}

				if (roadMark.type.split(' ').length == 2) {
					lateralOffset = {a: offsetA - 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
					rrBorderPoints = generateSpiralPoints(oBorder.length, subElevationLateralProfile, outerHeights, oBorder.centralX, oBorder.centralY, oBorder.hdg, oBorder.spiral.curvStart, oBorder.spiral.curvEnd, oBorder.ex, oBorder.ey, lateralOffset, sOffset, length).points;

					lateralOffset = {a: offsetA - 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
					rlBorderPoints = generateSpiralPoints(oBorder.length, subElevationLateralProfile, outerHeights, oBorder.centralX, oBorder.centralY, oBorder.hdg, oBorder.spiral.curvStart, oBorder.spiral.curvEnd, oBorder.ex, oBorder.ey, lateralOffset, sOffset, length).points;

					lateralOffset = {a: offsetA + 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
					lrBorderPoints = generateSpiralPoints(oBorder.length, subElevationLateralProfile, outerHeights, oBorder.centralX, oBorder.centralY, oBorder.hdg, oBorder.spiral.curvStart, oBorder.spiral.curvEnd, oBorder.ex, oBorder.ey, lateralOffset, sOffset, length).points;

					lateralOffset = {a: offsetA + 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
					llBorderPoints = generateSpiralPoints(oBorder.length, subElevationLateralProfile, outerHeights, oBorder.centralX, oBorder.centralY, oBorder.hdg, oBorder.spiral.curvStart, oBorder.spiral.curvEnd, oBorder.ex, oBorder.ey, lateralOffset, sOffset, length).points;
				}

				break;
			case 'arc':

				var curvature = oBorder.arc.curvature;
				var radius = 1 / Math.abs(curvature);
				var theta = sOffset * curvature;
				var rotation = oBorder.hdg - Math.sign(curvature) * Math.PI / 2;
				hdg = oBorder.hdg + theta;

				// get the central reference line start point first
				var sx = oBorder.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
				var sy = oBorder.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
				var ex = oBorder.ex;
				var ey = oBorder.ey;
				if (nextRoadMarkSOffset != oBorder.s + oBorder.centralLength - laneSectionStart) {
					theta = (sOffset + length) * curvature;
					ex = oBorder.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
					ey = oBorder.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
				}

				var lateralOffset;

				if (roadMark.type.split(' ').length == 1) {
					lateralOffset = {a: offsetA - width / 2, b: offsetB, c: offsetC, d: offsetD};
					rBorderPoints = generateArcPoints(length, subElevationLateralProfile, outerHeights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;
					
					lateralOffset = {a: offsetA + width / 2, b: offsetB, c: offsetC, d: offsetD};
					lBorderPoints = generateArcPoints(length, subElevationLateralProfile, outerHeights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;
				}

				if (roadMark.type.split(' ').length == 2) {
					lateralOffset = {a: offsetA - 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
					rrBorderPoints = generateArcPoints(length, subElevationLateralProfile, outerHeights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;
					
					lateralOffset = {a: offsetA - 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
					rlBorderPoints = generateArcPoints(length, subElevationLateralProfile, outerHeights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;

					lateralOffset = {a: offsetA + 0.75 * width - width / 2, b: offsetB, c: offsetC, d: offsetD};
					lrBorderPoints = generateArcPoints(length, subElevationLateralProfile, outerHeights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;
					
					lateralOffset = {a: offsetA + 0.75 * width + width / 2, b: offsetB, c: offsetC, d: offsetD};
					llBorderPoints = generateArcPoints(length, subElevationLateralProfile, outerHeights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;
				}

				break;
		}
			
		if (roadMark.type == 'broken')
			geometry = createDiscontiniousMeshGeometry(lBorderPoints, rBorderPoints)
		if (roadMark.type == 'solid')
			geometry = createCustomFaceGeometry(lBorderPoints, rBorderPoints)
		if (roadMark.type == 'solid solid') {
			lgeometry = createCustomFaceGeometry(llBorderPoints, lrBorderPoints)
			rgeometry = createCustomFaceGeometry(rlBorderPoints, rrBorderPoints)
		}
		if (roadMark.type == 'broken broken') {
			lgeometry = createDiscontiniousMeshGeometry(llBorderPoints, lrBorderPoints)
			rgeometry = createDiscontiniousMeshGeometry(rlBorderPoints, rrBorderPoints)
		}
		if (roadMark.type == 'solid broken') {
			if (laneId > 0) {
				lgeometry = createDiscontiniousMeshGeometry(llBorderPoints, lrBorderPoints)
				rgeometry = createCustomFaceGeometry(rlBorderPoints, rrBorderPoints)
			} else {
				lgeometry = createCustomFaceGeometry(llBorderPoints, lrBorderPoints)
				rgeometry = createDiscontiniousMeshGeometry(rlBorderPoints, rrBorderPoints)
			}
		}
		if (roadMark.type == 'broken solid') {
			if (laneId > 0) {
				lgeometry = createCustomFaceGeometry(llBorderPoints, lrBorderPoints)
				rgeometry = createDiscontiniousMeshGeometry(rlBorderPoints, rrBorderPoints)
			} else {
				lgeometry = createDiscontiniousMeshGeometry(llBorderPoints, lrBorderPoints)
				rgeometry = createCustomFaceGeometry(rlBorderPoints, rrBorderPoints)
			}
		}

		if (geometry) {
			roadMarkMesh = new THREE.Mesh(geometry, colorMaterial[roadMark.color]);
		}
		else {
			roadMarkMesh = new THREE.Group();
			roadMarkMesh.add(new THREE.Mesh(lgeometry, colorMaterial[roadMark.color]));
			roadMarkMesh.add(new THREE.Mesh(rgeometry, colorMaterial[roadMark.color]));
		}
		roadMarkMesh.position.set(0,0,0.001);
		mesh.push(roadMarkMesh);
	}
}

function createDiscontiniousMeshGeometry(lBorderPoints, rBorderPoints) {

	var dashPnts = 5;
	var gapPnts = 3;

	var geometry = new THREE.BufferGeometry();
	var vertices = [];

	for (var i = 0; i < Math.min(lBorderPoints.length, rBorderPoints.length) - 1; i++) {
 
		// 0 -- 1 -- 2 -- 3 -- 4 -- 5 xx 6 xx 7 xx 8 -- 9 ...
		if (i % (dashPnts + gapPnts) < dashPnts) {
			vertices = vertices.concat([rBorderPoints[i].x, rBorderPoints[i].y, rBorderPoints[i].z]);
			vertices = vertices.concat([rBorderPoints[i + 1].x, rBorderPoints[i + 1].y, rBorderPoints[i + 1].z]);
			vertices = vertices.concat([lBorderPoints[i + 1].x, lBorderPoints[i + 1].y, lBorderPoints[i + 1].z]);

			vertices = vertices.concat([rBorderPoints[i].x, rBorderPoints[i].y, rBorderPoints[i].z]);
			vertices = vertices.concat([lBorderPoints[i + 1].x, lBorderPoints[i + 1].y, lBorderPoints[i + 1].z]);
			vertices = vertices.concat([lBorderPoints[i].x, lBorderPoints[i].y, lBorderPoints[i].z]);
		}
	}

	vertices = Float32Array.from(vertices)
	// itemSize = 3 becuase there are 3 values (components) per vertex
	geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));

	return geometry;
}

function generateLaneSectionReferenceLineMesh(road, laneSectionId) {

	// sub divide road's geometry if necessary, i.e when laneOffset record exists
	var start = road.laneSection[laneSectionId].s;
	var end = road.laneSection[laneSectionId + 1] ? road.laneSection[laneSectionId + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length; 
	var geometries = getGeometry(road, start, end);

	var mesh = [];
	for (var i = 0; i < geometries.length; i++) {

		var geometry = geometries[i];
		if (!geometry.offset) geometry.offset = {sOffset: 0, a: 0, b: 0, c: 0, d: 0};
		
		var elevations = getElevation(road.elevation, geometry.s, geometry.s + geometry.length);

		var referenceLineMesh = generateReferenceLineMesh(geometry, elevations);
		mesh.push(referenceLineMesh);
	}
	return mesh;
}

function generateReferenceLineMesh(geometry, elevations) {

	var mesh;
	var heights = null;
	switch(geometry.type) {
		case 'line':
			mesh = createCubic(geometry.length, {elevations}, heights, geometry.centralX, geometry.centralY, geometry.hdg, geometry.offset);
			break;
		case 'spiral':
			if (geometry.offset.a || geometry.offset.b || geometry.offset.c || geometry.offset.d) {
				console.warn('reference line error (spiral): not surpport laneOffset on spiral or arc yet');
			}
			mesh = createSpiral(geometry.length, {elevations}, heights, geometry.x, geometry.y, geometry.hdg, geometry.spiral.curvStart, geometry.spiral.curvEnd, geometry.ex, geometry.ey, geometry.offset);
			break;
		case 'arc':
			if (geometry.offset.a || geometry.offset.b || geometry.offset.c || geometry.offset.d) {
				console.warn('reference line error (arc): not surpport laneOffset on spiral or arc yet');
			}
			mesh = createArc(geometry.length, {elevations}, heights, geometry.x, geometry.y, geometry.hdg, geometry.arc.curvature, geometry.ex, geometry.ey, geometry.offset);
			break;
	}

	// referec line's horizontal position sets to 0.001 (higher than lanes and same as roadMarks' 0.001 to be on top to avoid covering)
	mesh.position.set(0, 0, 0.001)
	return mesh;
}

function generateCubicPoints(offset, length, elevationLateralProfile, heights, sx, sy, hdg, lateralOffset) {

	var x, y, z;
	var points = [];
	var tOffset = [];
	var sOffset = [];	// each point's s distance from the begining of the cubic curve
	var elevations, superelevations, crossfalls;

	if (elevationLateralProfile) {
		elevations = elevationLateralProfile.elevations;
		superelevations = elevationLateralProfile.superelevations;
		crossfalls = elevationLateralProfile.crossfalls;
	}

	if (!elevations)
		elevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];
	if (!superelevations)
		superelevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];
	if (!crossfalls)
		crossfalls = [{s: 0, a: 0, b: 0, c: 0, d: 0}];

	if (!heights)
		heights = [{s: 0, height: 0}];
	else if (heights.length == 0)
		heights = [{s: 0, height: 0}];

	var elevationS0 = elevations[0].s;
	for (var i = 0; i < elevations.length; i++) {

		var elevationS = elevations[i].s;
		var nextElevationS = elevations[i + 1] ? elevations[i + 1].s : elevationS0 + length;
		var elevationLength = nextElevationS - elevationS;

		var ds = 0;
		var elevationSOffset = elevationS - elevationS0;

		do {

			if (ds > elevationLength || Math.abs(ds - elevationLength) < 1E-4) {

				if (Math.abs(elevationSOffset + elevationLength - length) < 1E-4) {
					// if it reaches the end of the whole spiral, calculate it
					ds = elevationLength;
				} else {
					// else ends current elevation segment, the next elevation segment's start will be the end of this one
					ds += step;
					break;
				}
			}

			x = sx + (ds + elevationSOffset) * Math.cos(hdg);
			y = sy + (ds + elevationSOffset) * Math.sin(hdg);
			z = cubicPolynomial(ds, elevations[i].a, elevations[i].b, elevations[i].c, elevations[i].d);

			points.push(new THREE.Vector3(x, y, z));
			sOffset.push(ds + elevationSOffset);
			if (lateralOffset) tOffset.push(cubicPolynomial(ds + elevationSOffset + offset, lateralOffset.a, lateralOffset.b, lateralOffset.c, lateralOffset.d));

			ds += step;
		
		} while (ds < elevationLength + step);
	}

	// apply lateral offset along t, and apply superelevation, crossfalls if any; since lane height is not allowed for central lane, if it is defined for a lane, the lateral offset must exist
	if (lateralOffset) {

		var svector, tvector, hvector;

		var superelevationIndex = 0;
		var crossfallIndex = 0;
		var heightIndex = 0;
		var superelevation = superelevations[superelevationIndex];
		var nextSuperElevation = superelevations[superelevationIndex + 1] || {s: elevationS0 + length};
		var crossfall = crossfalls[crossfallIndex];
		var nextCrossfall = crossfalls[crossfallIndex + 1] || {s: elevationS0 + length};
		var height = heights[heightIndex];
		var nextHeight = heights[heightIndex + 1] || {s: elevationS0 + length};

		// shift points at central clothoid by tOffset to get the parallel curve points
		for (var i = 0; i < points.length; i++) {

			var point = points[i];
			var t = tOffset[i];
			var ds = sOffset[i];

			// make sure no over flow happens for superelevations and crossfalls - should not be, since sOffset won't exceeds length
			if (nextSuperElevation.s <= ds + elevationS0 || Math.abs(nextSuperElevation.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextSuperElevation.s >= 1E-4) {
					superelevationIndex++;
					superelevation = superelevations[superelevationIndex];
					nextSuperElevation = superelevations[superelevationIndex + 1] || {s: elevationS0 + length};
				}
			}

			if (nextCrossfall.s <= ds + elevationS0 || Math.abs(nextCrossfall.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextCrossfall.s >= 1E-4) {
					crossfallIndex++;
					crossfall = crossfalls[crossfallIndex];
					nextCrossfall = crossfalls[crossfallIndex + 1] || {s: elevationS0 + length};
				}
			}

			if (nextHeight.s <= ds + elevationS0 || Math.abs(nextHeight.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextHeight.s >= 1E-4) {
					heightIndex++;
					height = heights[heightIndex];
					nextHeight = heights[heightIndex + 1] || {s: elevationS0 + length};
				}
			}

			svector = new THREE.Vector3(1, 0, 0);
			svector.applyAxisAngle(new THREE.Vector3(0, 0, 1), hdg);
			tvector = svector.clone();
			tvector.cross(new THREE.Vector3(0, 0, -1));

			if (t != 0) {
				var superelevationAngle = cubicPolynomial(ds + elevationS0 - superelevation.s, superelevation.a, superelevation.b, superelevation.c, superelevation.d);
				var crossfallAngle = cubicPolynomial(ds + elevationS0 - crossfall.s, crossfall.a, crossfall.b, crossfall.c, crossfall.d);

				tvector.applyAxisAngle(svector, superelevationAngle);

				if (!((t > 0 && crossfall.side == 'right') || (t < 0 && crossfall.side == 'left'))) {
					// Positive crossfall results in a road surface "falling" from the reference line to the outer boundary
					tvector.applyAxisAngle(svector, crossfallAngle * (- Math.sign(t)));
				}
			}

			hvector = svector.clone();
			hvector.cross(tvector);

			tvector.multiplyScalar(t);
			hvector.multiplyScalar(height.height);

			point.x += tvector.x + hvector.x;
			point.y += tvector.y + hvector.y;
			point.z += tvector.z + hvector.z;
		}
	}

	return points;
}

function createCubic(length, elevationLateralProfile, heights, sx, sy, hdg, lateralOffset) {

	// since geometry is divided on laneOffset, each geometry starts at offset = 0 along a laneOffset (ds starts from 0) if geometry offset exists, when createCubic is called
	var offset = 0;
	var points = generateCubicPoints(offset, length, elevationLateralProfile, heights , sx, sy, hdg, lateralOffset);
	var geometry = new THREE.Geometry();
	geometry.vertices = points;
	var material = new THREE.MeshBasicMaterial({color: 0xFF0000});
	var cubic = new THREE.Line(geometry, material);

	return cubic;
}

function generateSpiralPoints(length, elevationLateralProfile, heights, sx, sy, hdg, curvStart, curvEnd, ex, ey, lateralOffset, subOffset, subLength) {

	var points = [];
	var heading = [];
	var tOffset = [];
	var sOffset = [];	// sOffset from the beginning of the curve
	var k = (curvEnd - curvStart) / length;
	var elevations, superelevations, crossfalls;

	if (elevationLateralProfile) {
		elevations = elevationLateralProfile.elevations;
		superelevations = elevationLateralProfile.superelevations;
		crossfalls = elevationLateralProfile.crossfalls;
	}

	var theta = hdg; 	// current heading direction

	if (!elevations)
		elevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];
	if (!superelevations)
		superelevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];
	if (!crossfalls)
		crossfalls = [{s: 0, a: 0, b: 0, c: 0, d: 0}];

	if (!heights)
		heights = [{s: 0, height: 0}];
	else if (heights.length == 0)
		heights = [{s: 0, height: 0}];

	// s ranges between [0, length]
	var s = 0;
	var preS = 0;
	var elevationS0 = elevations[0].s;
	
	var point, x, y, z;

	for (var i = 0; i < elevations.length; i++) {

		var elevationS = elevations[i].s;
		var nextElevationS = elevations[i + 1] ? elevations[i + 1].s : elevationS0 + length;
		var elevationLength = nextElevationS - elevationS;

		
		var elevationSOffset = elevationS - elevationS0;

		s = elevationSOffset;
		do {

			if (s == 0) {
				points.push(new THREE.Vector3(sx, sy, elevations[0].a));
				heading.push(theta);
				if (lateralOffset) tOffset.push(lateralOffset.a);
				sOffset.push(s);
				s += step;
				continue;
			}

			if (s > elevationSOffset + elevationLength || Math.abs(s - elevationSOffset - elevationLength) < 1E-4) {

				if (Math.abs(elevationSOffset + elevationLength - length) < 1E-4) {
					// if elevation seg reaches the end of the whole spiral, calculate it
					s = elevationSOffset + elevationLength;
				} else {
					// else ends current elevation segment, the next elevation segment's start will be the end of this one
					s += step;
					break;
				}
			}

			var curvature = (s + preS) * 0.5 * k + curvStart;
			var prePoint = points[points.length - 1];
			
			x = prePoint.x + (s - preS) * Math.cos(theta + curvature * (s - preS) / 2);
			y = prePoint.y + (s - preS) * Math.sin(theta + curvature * (s - preS) / 2);
			z = cubicPolynomial(s - elevationSOffset, elevations[i].a, elevations[i].b, elevations[i].c, elevations[i].d);

			theta += curvature * (s - preS);
			preS = s;
			s += step;
			
			points.push(new THREE.Vector3(x, y, z));
			heading.push(theta);
			if (lateralOffset) tOffset.push(cubicPolynomial(preS, lateralOffset.a, lateralOffset.b, lateralOffset.c, lateralOffset.d));
			sOffset.push(preS);

		} while (s < elevationSOffset + elevationLength + step);
	}

	// fix the error by altering the end point to he connecting road's start
	if (typeof ex == 'number' && typeof ey == 'number') {

		var delta = new THREE.Vector3(ex - points[points.length - 1].x, ey - points[points.length - 1].y, 0);
		points[points.length - 1].x = ex;
		points[points.length - 1].y = ey;

		var lastStep = points[points.length - 1].distanceTo(points[points.length - 2]);
		// distrubte error across sample points for central clothoid 		
		for (var i = points.length - 2; i > 0; i--) {
			points[i].x += delta.x * sOffset[i] / length;
			points[i].y += delta.y * sOffset[i] / length;
		}
	}

	// apply lateralOffset if any
	if (lateralOffset) {

		var svector, tvector, hvector;

		var superelevationIndex = 0;
		var crossfallIndex = 0;
		var heightIndex = 0;
		var superelevation = superelevations[superelevationIndex];
		var nextSuperElevation = superelevations[superelevationIndex + 1] || {s: elevationS0 + length};
		var crossfall = crossfalls[crossfallIndex];
		var nextCrossfall = crossfalls[crossfallIndex + 1] || {s: elevationS0 + length};
		var height = heights[heightIndex];
		var nextHeight = heights[heightIndex + 1] || {s: elevationS0 + length};

		// shift points at central clothoid by tOffset to get the parallel curve points
		for (var i = 0; i < points.length; i++) {

			var point = points[i];
			var currentHeading = heading[i];
			var t = tOffset[i];
			var ds = sOffset[i];

			// make sure no over flow happens for superelevations and crossfalls - should not be, since sOffset won't exceeds length
			if (nextSuperElevation.s <= ds + elevationS0 || Math.abs(nextSuperElevation.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextSuperElevation.s >= 1E-4) {
					superelevationIndex++;
					superelevation = superelevations[superelevationIndex];
					nextSuperElevation = superelevations[superelevationIndex + 1] || {s: elevationS0 + length};				
				}
			}

			if (nextCrossfall.s <= ds + elevationS0 || Math.abs(nextCrossfall.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextCrossfall.s >= 1E-4) {
					crossfallIndex++;
					crossfall = crossfalls[crossfallIndex];
					nextCrossfall = crossfalls[crossfallIndex + 1] || {s: elevationS0 + length};
				}
			}

			if (nextHeight.s <= ds + elevationS0 || Math.abs(nextHeight.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextHeight.s >= 1E-4) {
					heightIndex++;
					height = heights[heightIndex];
					nextHeight = heights[heightIndex + 1] || {s: elevationS0 + length};
				}
			}

			svector = new THREE.Vector3(1, 0, 0);
			svector.applyAxisAngle(new THREE.Vector3(0, 0, 1), currentHeading);
			tvector = svector.clone();
			tvector.cross(new THREE.Vector3(0, 0, -1));

			if (t != 0) {
				var superelevationAngle = cubicPolynomial(ds + elevationS0 - superelevation.s, superelevation.a, superelevation.b, superelevation.c, superelevation.d);
				var crossfallAngle = cubicPolynomial(ds + elevationS0 - crossfall.s, crossfall.a, crossfall.b, crossfall.c, crossfall.d);

				tvector.applyAxisAngle(svector, superelevationAngle);

				if (!((t > 0 && crossfall.side == 'right') || (t < 0 && crossfall.side == 'left'))) {
					// Positive crossfall results in a road surface "falling" from the reference line to the outer boundary
					tvector.applyAxisAngle(svector, crossfallAngle * (- Math.sign(t)));
				}
			}

			hvector = svector.clone();
			hvector.cross(tvector);

			tvector.multiplyScalar(t);
			hvector.multiplyScalar(height.height);

			point.x += tvector.x + hvector.x;
			point.y += tvector.y + hvector.y;
			point.z += tvector.z + hvector.z;
		}
	}

	// if  needs take only part of the segment -- need changing due to introducing multiple elevations
	if (typeof subOffset == 'number' && typeof subLength == 'number') {
		
		var p1, p2;
		var startPoint, endPoint;
		var startIndex, endIndex, startIndexDiff, endIndexDiff;
		var startIndexFound, endIndexFound;

		startIndex = 0;
		endIndex = 0;
		startIndexFound = false;
		endIndexFound = false;

		// extract the sample points for the sub spiral
		for (var i = 0; i < elevations.length; i++) {
			var elevationS = elevations[i].s;
			var nextElevationS = elevations[i + 1] ? elevations[i + 1].s : elevationS0 + length;

			if (!startIndexFound) {
				if (nextElevationS <= elevationS0 + subOffset - 1E-4) {
					startIndex += Math.ceil((nextElevationS - elevationS) / step - 1);
				} else if (Math.abs(elevationS - (elevationS0 + subOffset)) < 1E-4) {
					if (Math.abs(elevationS - elevationS0) < 1E-4) {
						startIndex = 0;
						startIndexDiff = 0;
					} else {
						startIndex += 1;
						startIndexDiff = 0;
					}
					startIndexFound = true;
				} else if (elevationS < elevationS0 + subOffset) {
					startIndex += Math.floor((elevationS0 + subOffset - elevationS) / step);
					startIndexDiff = (elevationS0 + subOffset - elevationS) / step - Math.floor((elevationS0 + subOffset - elevationS) / step);
					startIndexFound = true;
				}
			}

			if (!endIndexFound) {
				if (nextElevationS <= elevationS0 + subOffset + subLength - 1E-4) {
					endIndex += Math.ceil((nextElevationS - elevationS) / step);
				} else if (Math.abs(nextElevationS - (elevationS0 + subOffset + subLength)) < 1E-4) {
					endIndex += Math.ceil((nextElevationS - elevationS) / step);
					endIndexDiff = 0;
					endIndexFound = true;
				} else if (elevationS < elevationS0 + subOffset + subLength) {
					endIndex += Math.floor((elevationS0 + subOffset + subLength - elevationS) / step);
					endIndexDiff = (elevationS0 + subOffset + subLength - elevationS) / step - Math.floor((elevationS0 + subOffset + subLength - elevationS) / step);
					endIndexFound = true;
				} else {
					console.log(elevationS, elevationS0 + subOffset + subLength)
				}
			}

			if (startIndexFound && endIndexFound) break;
		}

		// extract points from startIndex + diff to endIndex + diff
		p1 = points[startIndex];
		p2 = points[startIndex + 1];
		startPoint = new THREE.Vector3(p1.x + startIndexDiff / step * (p2.x - p1.x), p1.y + startIndexDiff / step * (p2.y - p1.y), p1.z + startIndexDiff / step * (p2.z - p1.z));
		points[startIndex] = startPoint;
		heading[startIndex] = heading[startIndex] + (heading[startIndex + 1] - heading[startIndex]) * startIndexDiff / step;

		if (endIndexDiff > 0) {
			p1 = points[endIndex];
			p2 = points[endIndex + 1];
			endPoint = new THREE.Vector3(p1.x + endIndexDiff / step * (p2.x - p1.x), p1.y + endIndexDiff / step * (p2.y - p1.y), p1.z + endIndexDiff / step * (p2.z - p1.z));
			endIndex = endIndex + 1;
			points[endIndex] = endPoint;
			heading[endIndex] = heading[endIndex + 1] ? heading[endIndex] + (heading[endIndex + 1] - heading[endIndex]) * endIndexDiff / step : heading[endIndex];
		}

		points.splice(endIndex + 1);
		points.splice(0, startIndex);
		heading.splice(endIndex + 1);
		heading.splice(0, startIndex);
	}

	return {points: points, heading: heading};
}

function createSpiral(length, elevationLateralProfile, heights, sx, sy, hdg, curvStart, curvEnd, ex, ey, lateralOffset) {

	var material = new THREE.MeshBasicMaterial({color: 0xFFC125});
	var points = generateSpiralPoints(length, elevationLateralProfile, heights, sx, sy, hdg, curvStart, curvEnd, ex, ey, lateralOffset).points;
	var geometry = new THREE.Geometry();
	geometry.vertices = points;	
	var spiral = new THREE.Line(geometry, material);
	
	return spiral;
}

function generateArcPoints(length, elevationLateralProfile, heights, sx, sy, hdg, curvature, ex, ey, lateralOffset, subOffset, subLength) {

	var points = [];
	var heading = [];
	var tOffset = [];
	var sOffset = [];	// sOffset from the beginning of the curve, used for distribute error
	var currentHeading = hdg;
	var prePoint, x, y, z;

	var elevations, superelevations, crossfalls;

	if (elevationLateralProfile) {
		elevations = elevationLateralProfile.elevations;
		superelevations = elevationLateralProfile.superelevations;
		crossfalls = elevationLateralProfile.crossfalls;
	}

	if (!elevations)
		elevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];
	if (!superelevations)
		superelevations = [{s: 0, a: 0, b: 0, c: 0, d: 0}];
	if (!crossfalls)
		crossfalls = [{s: 0, a: 0, b: 0, c: 0, d: 0}];

	if (!heights)
		heights = [{s: 0, height: 0}];
	else if (heights.length == 0)
		heights = [{s: 0, height: 0}];

	// s ranges between [0, length]
	var s = 0;
	var preS = 0;
	var elevationS0 = elevations[0].s;

	for (var i = 0; i < elevations.length; i++) {

		var elevationS = elevations[i].s;
		var nextElevationS = elevations[i + 1] ? elevations[i + 1].s : elevationS0 + length;
		var elevationLength = nextElevationS - elevationS;

		var elevationSOffset = elevationS - elevationS0;
		//console.log('elevation #', i, 'start at', elevationSOffset)
		
		s = elevationSOffset;
		do {
			
			if (s == 0) {
				points.push(new THREE.Vector3(sx, sy, elevations[0].a));		
				heading.push(currentHeading);
				if (lateralOffset) tOffset.push(lateralOffset.a);
				sOffset.push(s);
				s += step;
				continue;
			}

			if (s > elevationSOffset + elevationLength || Math.abs(s - elevationSOffset - elevationLength) < 1E-4) {
			
				if (Math.abs(elevationSOffset + elevationLength - length) < 1E-4) {
					// if elevation seg reaches the end of the whole spiral, calculate it
					s = elevationSOffset + elevationLength;
				} else {
					// else ends current elevation segment, the next elevation segment's start will be the end of this one			
					s += step;
					break;
				}
			}

			prePoint = points[points.length - 1];

			x = prePoint.x + (s - preS) * Math.cos(currentHeading + curvature * (s - preS) / 2);
			y = prePoint.y + (s - preS) * Math.sin(currentHeading + curvature * (s - preS) / 2);
			z = cubicPolynomial(s - elevationSOffset, elevations[i].a, elevations[i].b, elevations[i].c, elevations[i].d);

			currentHeading += curvature * (s - preS);
			
			preS = s;
			s += step;

			points.push(new THREE.Vector3(x, y, z));
			heading.push(currentHeading);
			if (lateralOffset) tOffset.push(cubicPolynomial(preS, lateralOffset.a, lateralOffset.b, lateralOffset.c, lateralOffset.d));
			sOffset.push(preS);

		} while (s < elevationSOffset + elevationLength + step);
	}

	// fix the error by altering the end point to he connecting road's start
	if (typeof ex == 'number' && typeof ey == 'number') {

		var delta = new THREE.Vector3(ex - points[points.length - 1].x, ey - points[points.length - 1].y, 0);
		points[points.length - 1].x = ex;
		points[points.length - 1].y = ey;

		// distrubte error across sample points for central clothoid 		
		for (var i = points.length - 2; i > -1; i--) {
			points[i].x += delta.x * sOffset[i] / length;
			points[i].y += delta.y * sOffset[i] / length;
		}
	}

	// apply lateral offset along t, and apply superelevation, crossfalls if any
	if (lateralOffset) {

		var svector, tvector;

		var superelevationIndex = 0;
		var crossfallIndex = 0;
		var heightIndex = 0;
		var superelevation = superelevations[superelevationIndex];
		var nextSuperElevation = superelevations[superelevationIndex + 1] || {s: elevationS0 + length};
		var crossfall = crossfalls[crossfallIndex];
		var nextCrossfall = crossfalls[crossfallIndex + 1] || {s: elevationS0 + length};
		var height = heights[heightIndex];
		var nextHeight = heights[heightIndex + 1] || {s: elevationS0 + length};

		// shift points at central clothoid by tOffset to get the parallel curve points
		for (var i = 0; i < points.length; i++) {

			var point = points[i];
			var t = tOffset[i];
			var currentHeading = heading[i];
			var ds = sOffset[i];

			// make sure no over flow happens for superelevations and crossfalls - should not be, since sOffset won't exceeds length
			if (nextSuperElevation.s <= ds + elevationS0 || Math.abs(nextSuperElevation.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextSuperElevation.s >= 1E-4) {
					superelevationIndex++;
					superelevation = superelevations[superelevationIndex];
					nextSuperElevation = superelevations[superelevationIndex + 1] || {s: elevationS0 + length};
				}
			}

			if (nextCrossfall.s <= ds + elevationS0 || Math.abs(nextCrossfall.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextCrossfall.s >= 1E-4) {
					crossfallIndex++;
					crossfall = crossfalls[crossfallIndex];
					nextCrossfall = crossfalls[crossfallIndex + 1] || {s: elevationS0 + length};
				}
			}

			if (nextHeight.s <= ds + elevationS0 || Math.abs(nextHeight.s - ds - elevationS0) < 1E-4) {

				// if not reaches the end of the cubic line yet
				if (elevationS0 + length - nextHeight.s >= 1E-4) {
					heightIndex++;
					height = heights[heightIndex];
					nextHeight = heights[heightIndex + 1] || {s: elevationS0 + length};
				}
			}

			svector = new THREE.Vector3(1, 0, 0);
			svector.applyAxisAngle(new THREE.Vector3(0, 0, 1), currentHeading);
			tvector = svector.clone();
			tvector.cross(new THREE.Vector3(0, 0, -1));

			if (t != 0) {
				var superelevationAngle = cubicPolynomial(ds + elevationS0 - superelevation.s, superelevation.a, superelevation.b, superelevation.c, superelevation.d);
				var crossfallAngle = cubicPolynomial(ds + elevationS0 - crossfall.s, crossfall.a, crossfall.b, crossfall.c, crossfall.d);

				tvector.applyAxisAngle(svector, superelevationAngle);

				if (!((t > 0 && crossfall.side == 'right') || (t < 0 && crossfall.side == 'left'))) {
					// Positive crossfall results in a road surface "falling" from the reference line to the outer boundary
					tvector.applyAxisAngle(svector, crossfallAngle * (- Math.sign(t)));
				}
			}

			hvector = svector.clone();
			hvector.cross(tvector);

			tvector.multiplyScalar(t);
			hvector.multiplyScalar(height.height);

			point.x += tvector.x + hvector.x;
			point.y += tvector.y + hvector.y;
			point.z += tvector.z + hvector.z;
		}
	}

	// if  needs take only part of the segment -- need changing due to introducing multiple elevations
	if (typeof subOffset == 'number' && typeof subLength == 'number') {

		var p1, p2;
		var startPoint, endPoint;
		var startIndex, endIndex, startIndexDiff, endIndexDiff;
		var startIndexFound, endIndexFound;

		startIndex = 0;
		endIndex = 0;
		startIndexFound = false;
		endIndexFound = false;

		// extract the sample points for the sub spiral
		for (var i = 0; i < elevations.length; i++) {
			var elevationS = elevations[i].s;
			var nextElevationS = elevations[i + 1] ? elevations[i + 1].s : elevationS0 + length;

			if (!startIndexFound) {
				if (nextElevationS <= elevationS0 + subOffset - 1E-4) {
					startIndex += Math.ceil((nextElevationS - elevationS) / step - 1);
				} else if (Math.abs(elevationS - (elevationS0 + subOffset)) < 1E-4) {
					if (Math.abs(elevationS - elevationS0) < 1E-4) {
						startIndex = 0;
						startIndexDiff = 0;
					} else {
						startIndex += 1;
						startIndexDiff = 0;
					}
					startIndexFound = true;
				} else if (elevationS < elevationS0 + subOffset) {
					startIndex += Math.floor((elevationS0 + subOffset - elevationS) / step);
					startIndexDiff = (elevationS0 + subOffset - elevationS) / step - Math.floor((elevationS0 + subOffset - elevationS) / step);
					startIndexFound = true;
				}
			}

			if (!endIndexFound) {
				if (nextElevationS + 1E-4 <= elevationS0 + subOffset + subLength) {
					endIndex += Math.ceil((nextElevationS - elevationS) / step);
				} else if (Math.abs(nextElevationS - (elevationS0 + subOffset + subLength)) < 1E-4) {
					endIndex += Math.ceil((nextElevationS - elevationS) / step);
					endIndexDiff = 0;
					endIndexFound = true;
				} else if (elevationS < elevationS0 + subOffset + subLength) {
					endIndex += Math.floor((elevationS0 + subOffset + subLength - elevationS) / step);
					endIndexDiff = (elevationS0 + subOffset + subLength - elevationS) / step - Math.floor((elevationS0 + subOffset + subLength -elevationS ) / step);
					endIndexFound = true;
				}
			}

			if (startIndexFound && endIndexFound) break;
		}
		
		//console.log('extracting arc from', elevationS0 + subOffset, 'to', elevationS0 + subOffset + subLength, '\nstartIndex', startIndex, 'startIndexDiff', startIndexDiff, '\nendIndex', endIndex, 'endIndexDiff', endIndexDiff)
		
		// extract points from startIndex + diff to endIndex + diff
		p1 = points[startIndex];
		p2 = points[startIndex + 1];
		startPoint = new THREE.Vector3(p1.x + startIndexDiff / step * (p2.x - p1.x), p1.y + startIndexDiff / step * (p2.y - p1.y), p1.z + startIndexDiff / step * (p2.z - p1.z));
		points[startIndex] = startPoint;
		heading[startIndex] = heading[startIndex] + (heading[startIndex + 1] - heading[startIndex]) * startIndexDiff / step;

		if (endIndexDiff > 0) {
			p1 = points[endIndex];
			p2 = points[endIndex + 1];
			endPoint = new THREE.Vector3(p1.x + endIndexDiff / step * (p2.x - p1.x), p1.y + endIndexDiff / step * (p2.y - p1.y), p1.z + endIndexDiff / step * (p2.z - p1.z));
			endIndex = endIndex + 1;
			points[endIndex] = endPoint;
			heading[endIndex] = heading[endIndex + 1] ? heading[endIndex] + (heading[endIndex + 1] - heading[endIndex]) * endIndexDiff / step : heading[endIndex];
		}
		
		//console.log('start heading', heading[startIndex], 'end heading', heading[endIndex])
		
		points.splice(endIndex + 1);
		points.splice(0, startIndex);
		heading.splice(endIndex + 1);
		heading.splice(0, startIndex);
	}

	return {points: points, heading: heading};
}

function createArc(length, elevationLateralProfile, heights, sx, sy, hdg, curvature, ex, ey, lateralOffset) {
	
	var material = new THREE.MeshBasicMaterial({color: 0x3A5FCD});
	
	var points = generateArcPoints(length, elevationLateralProfile, heights, sx, sy, hdg, curvature, ex, ey, lateralOffset).points;
	var geometry = new THREE.Geometry();
	geometry.vertices = points;
	var arc = new THREE.Line(geometry, material);
	
	return arc;
}

function cubicPolynomial(ds, a, b, c, d) {

	return a + b * ds + c * Math.pow(ds, 2) + d * Math.pow(ds, 3);	
}

function generateSignalMesh(signal, road) {

	var mesh;
	var transform = track2Inertial(road, signal.s, signal.t, 0);	
	var position = transform.position;
	var rotation = transform.rotation;
	position.z += signal.zOffset;

	// traffic signals' mesh use from outside, need to provide such an interface (signalType - signalMesh)
	if (signal.dynamic == 'yes')
		mesh = generateDefaultSignalMesh();
	else
		mesh = generateDefaultSignMesh();
	mesh.position.set(position.x, position.y, position.z);	
	mesh.rotation.set(0, 0, rotation.z + Math.PI / 2);

	if (signal.orientation == '+') {
		mesh.rotateZ(Math.PI);
	}

	return mesh;
}

function track2Inertial(road, s, t, h) {

	if (!road) {
		console.warn('track2Inertial: no road of roadId#', roadId, 'found');
		return;
	}

	if (s < 0 || s > road.length) {
		throw Error('converting from track system to inertial system error: invalid s', s, 'for road#', roadId, 'total length', road.length);
	}

	var geometry = getGeometryAtS(road, s);
	var elevation = getElevationAtS(road, s);
	var superelevation = getSupserelevationAtS(road, s);
	var crossfall = getCrossfallAtS(road, s);

	var sOffset, hdg, roll, pitch, centralTOffset;
	var svector, tvector;
	var x, y, z;

	if (!elevation) elevation = {s: 0, a: 0, b: 0, c: 0, d: 0};
	if (!superelevation) superelevation = {s: 0, a: 0, b: 0, c: 0, d: 0};
	if (!crossfall) crossfall = {side: 'both', s: 0, a: 0, b: 0, c: 0, d: 0};

	// find x-y on central reference line in x-y plane
	sOffset = s - geometry.s;
	switch(geometry.type) {
		case 'line':
			hdg = geometry.hdg;
			x = geometry.x + sOffset * Math.cos(geometry.hdg);
			y = geometry.y + sOffset * Math.sin(geometry.hdg);
			
			break;
		case 'spiral':
			//generateSpiralPoints(length, elevationLateralProfile sx, sy, hdg, curvStart, curvEnd, ex, ey, lateralOffset, subOffset, subLength)
			var sample = generateSpiralPoints(geometry.length, null, null, geometry.x, geometry.y, geometry.hdg, geometry.spiral.curvStart, geometry.spiral.curvEnd, geometry.ex, geometry.ey, null, sOffset, geometry.length + geometry.s - s);
			hdg = sample.heading[0];
			x = sample.points[0].x;
			y = sample.points[0].y;

			break;
		case 'arc':
			var curvature = geometry.arc.curvature;
			var radius = 1 / Math.abs(curvature);
			var rotation = geometry.hdg - Math.sign(curvature) * Math.PI / 2;
			var theta = sOffset * curvature;
			hdg = geometry.hdg + theta;
			x = geometry.x - radius * Math.cos(rotation) + radius * Math.cos(rotation + theta);
			y = geometry.y - radius * Math.sin(rotation) + radius * Math.sin(rotation + theta);
			
			break;
	}

	sOffset = s - elevation.s;
	z = cubicPolynomial(sOffset, elevation.a, elevation.b, elevation.c, elevation.d);
	var prez = cubicPolynomial(sOffset - 0.1, elevation.a, elevation.b, elevation.c, elevation.d);
	pitch = Math.atan((z - prez) / 0.1);

	sOffset = s - superelevation.s;
	var superelevationAngle = cubicPolynomial(sOffset, superelevation.a, superelevation.b, superelevation.c, superelevation.d);

	sOffset = s - crossfall.s;
	var crossfallAngle = cubicPolynomial(sOffset, crossfall.a, crossfall.b, crossfall.c, crossfall.d);

	roll = superelevationAngle;

	if (!((t < 0 && crossfall.side == 'left') || (t > 0 && crossfall.side == 'right'))) {
		roll += crossfallAngle * (- Math.sign(t));
	}

	// find x, y, z in s - t - h
	var svector = new THREE.Vector3(1, 0, 0);
	svector.applyAxisAngle(new THREE.Vector3(0, 0, 1), hdg);

	var tvector = svector.clone();
	tvector.cross(new THREE.Vector3(0, 0, -1));
	tvector.applyAxisAngle(svector, roll);

	var hvector = svector.clone();
	hvector.cross(tvector);

	tvector.multiplyScalar(t);
	hvector.multiplyScalar(h);

	x += tvector.x + hvector.x;
	y += tvector.y + hvector.y;
	z += tvector.z + hvector.z;

	return {
		position: new THREE.Vector3(x, y, z),
		rotation: new THREE.Euler(roll, -pitch, hdg, 'XYZ')
	}
}

/*
* Helper for track2Inertial, get road info at speific s in a road
*/
function getGeometryAtS(road, s) {

	var result = null;

	if (s < 0 || s > road.length + 1E-4) {
		throw Error('getGeometryAtS error: invalid s', s, 'road length', road.length);
	}

	for (var i = 0; i < road.geometry.length; i++) {
		var geometry = road.geometry[i];

		if (geometry.s + geometry.length <= s) continue;
		else if (geometry.s <= s) result = geometry; //console.log(geometry.s, s, geometry.s <= s)}
		else break;
	}

	// must be s == road.length if result == null
	if (result == null) {
		result = road.geometry[road.geometry.length - 1]
	}
	
	return result;
}

function getElevationAtS(road, s) {
	
	var result = null;

	if (s < 0 || s > road.length + 1E-4) {
		throw Error('getElevationAtS error: invalid s', s, 'road length', road.length);
	}

	if (!road.elevation || !road.elevation.length) return null;

	for (var i = 0; i < road.elevation.length; i++) {
		var elevation = road.elevation[i];
		var nextElevationS = road.elevation[i + 1] ? road.elevation[i + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;

		if (nextElevationS <= s) continue;
		else if (elevation.s > s) break;
		else {
			if (!(elevation.s <= s)) throw Error('condition needs changing')
			result = elevation;
		}
	}

	// must be s == road.length if result == null
	if (result == null) {
		result = road.elevation[road.elevation.length - 1];
	}

	return result;
}

function getSupserelevationAtS(road, s) {

	var result = null;
	
	if (s < 0 || s > road.length + 1E-4) {
		throw Error('getSupserelevationAtS error: invalid s', s, 'road length', road.length);
	}

	if (!road.superelevation) return null;

	for (var i = 0; i < road.superelevation.length; i++) {
		var superelevation = road.superelevation[i];
		var nextSuperElevationS = road.superelevation[i + 1] ? road.superelevation[i + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;

		if (nextSuperElevationS <= s) continue;
		else if (superelevation.s > s) break;
		else {
			if (!(superelevation.s <= s)) throw Error('condition needs changing');
			result = superelevation;
		}
	}

	// must be s == road.length if result == null
	if (result == null) {
		result = road.superelevation[road.superelevation.length - 1];
	}

	return result;
}

function getCrossfallAtS(road, s) {

	var result = null;

	if (s < 0 || s > road.length + 1E-4) {
		throw Error('getCrossfallAtS error: invalid s', s, 'road length', road.length);
	}

	if (!road.crossfall) return null;

	for (var i = 0; i < road.crossfall.length; i++) {
		var crossfall = road.corssfall[i];
		var nextCrossfallS = road.crossfall[i + 1] ? road.crossfall[i + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;

		if (nextCrossfallS <= s) continue;
		else if (crossfall.s > s) break;
		else {
			if (!(crossfall.s <= s)) throw Error('condition needs changing');
			result = crossfall;
		}
	}

	// must be s == road.length if result == null
	if (result == null) {
		result = road.crossfall[road.crossfall.length - 1];
	}

	return result;
}

function getLaneOffsetAtS(road, s) {

	var result = null;

	if (s < 0 || s > road.length + 1E-4) {
		throw Error('getLaneOffsetAtS error: invalid s', s, 'road length', road.length);
	}

	if (!road.laneOffset) return null;

	for (var i = 0; i < road.laneOffset.length; i++) {
		var laneOffset = road.laneOffset[i];
		var nextLaneOffsetS = road.laneOffset[i + 1] ? road.laneOffset[i + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;

		if (nextLaneOffsetS <= s) continue;
		else if (laneOffset.s > s) break;
		else {
			if (!(laneOffset.s <= s)) throw Error('condition needs changing')
			result = laneOffset;
		}
	}

	// must be s == road.length if result == null
	if (result == null) {
		result = road.laneOffset[road.laneOffset.length - 1];
	}

	return result;
}

function getLaneSectionAtS(road, s) {

	var result = null;

	if (s < 0 || s > road.length + 1E-4) {
		throw Error('getLaneSectionAtS error: invalid s', s, 'road length', road.length);
	}

	for (var i = 0; i < road.laneSection.length; i++) {
		var laneSection = road.laneSection[i];
		var nextLaneSectionS = road.laneSection[i + 1] ? road.laneSection[i + 1].s : road.geometry[road.geometry.length - 1].s + road.geometry[road.geometry.length - 1].length;

		if (nextLaneSectionS <= s) continue;
		else if (laneSection.s > s) break;
		else {
			if (!(laneSection.s <= s)) throw Error('condition needs changing');
			result = laneSection;
		}
	}

	// must be s == road.length if result == null
	if (result == null) {
		result = road.laneSection[road.laneSection.length - 1];
	}
	return result;
}

function generateDefaultSignMesh() {

	var poleRadius = 0.02;
	var poleHeight = 2;
	var signTopWidth = 0.7;
	var signTopHeight = 0.7;
	var signTopThickness = 0.01; 

	var geometry = new THREE.BoxBufferGeometry(signTopWidth, signTopThickness, signTopHeight);
	var material = new THREE.MeshBasicMaterial({color: 0x6F6F6F});
	var signTop = new THREE.Mesh(geometry, material);
	signTop.rotateY(-Math.PI / 4);
	signTop.position.set(0, -poleRadius - signTopThickness / 2, poleHeight - signTopHeight / 2);

	geometry = new THREE.BoxBufferGeometry(2*poleRadius, 2*poleRadius, poleHeight);
	var signlPole = new THREE.Mesh(geometry, material);
	signlPole.position.set(0, 0, poleHeight / 2);

	var sign = new THREE.Group();
	sign.add(signTop);
	sign.add(signlPole);

	return sign;
}

function generateDefaultSignalMesh() {

	var poleRadius = 0.02;
	var poleHeight = 2;
	var signalBoxWidth = 0.2;
	var signalBoxDepth = 0.2;
	var signalBoxHeight = 0.8;
	var signalLightRadius = signalBoxHeight / 10;

	var geometry = new THREE.BoxBufferGeometry(signalBoxWidth, signalBoxDepth, signalBoxHeight);
	var material = new THREE.MeshBasicMaterial({color: 0x6F6F6F});
	var signalBox = new THREE.Mesh(geometry, material);
	signalBox.position.set(0, poleRadius - signalBoxDepth / 2, poleHeight - signalBoxHeight / 2);

	geometry = new THREE.BoxBufferGeometry(2*poleRadius, 2*poleRadius, poleHeight);
	var signalPole = new THREE.Mesh(geometry, material);
	signalPole.position.set(0, 0, poleHeight / 2);

	geometry = new THREE.CircleBufferGeometry(signalLightRadius, 32);
	material = new THREE.MeshBasicMaterial({color: 0xFF0000});
	var redLight = new THREE.Mesh(geometry, material);
	redLight.rotateX(Math.PI / 2);
	redLight.position.set(0, poleRadius - signalBoxDepth - 0.01, poleHeight - signalLightRadius * 2);
	
	material = new THREE.MeshBasicMaterial({color: 0xFFFF00});
	var yellowLight = new THREE.Mesh(geometry, material);
	yellowLight.rotateX(Math.PI / 2);
	yellowLight.position.set(0, poleRadius - signalBoxDepth - 0.01, poleHeight - signalLightRadius * 5);

	material = new THREE.MeshBasicMaterial({color: 0x00CD00});
	var greenLight = new THREE.Mesh(geometry, material);
	greenLight.rotateX(Math.PI / 2);
	greenLight.position.set(0, poleRadius - signalBoxDepth - 0.01, poleHeight - signalLightRadius * 8);

	var signal = new THREE.Group();
	signal.add(signalBox);
	signal.add(redLight);
	signal.add(yellowLight);
	signal.add(greenLight);
	signal.add(signalPole);

	return signal;
}

/*
* Helper for getConnectingRoadIds
*/
function getRoadIdsInJunction(junctionId) {

	if (junctionId == '-1') {
		throw Error('invalid junctionId', jucntionId);
	}

	var roadIds = [];
	var foundIds = {};
	var junction = map.junctions[junctionId];
	
	for (var connectionId in junction.connection) {
		var connection = junction.connection[connectionId];
		
		if (!(connection.incomingRoad in foundIds)) {
			roadIds.push(connection.incomingRoad);
			foundIds[connection.incomingRoad] = true;
		}
		if (!(connection.connectingRoad in foundIds)) {
			roadIds.push(connection.connectingRoad);
			foundIds[connection.connectionRoad] = true;
		}
	}

	return roadIds;
}

function getLinkedRoadId(linkedInfo) {

	var elementType = linkedInfo.elementType;
	var elementId = linkedInfo.elementId;
	var contactPoint = linkedInfo.contactPoint;

	var roadIds = [];

	if (elementType == 'road') {
		roadIds.push(elementId);
	} else if (elementType == 'junction') {
		roadIds = getRoadIdsInJunction(elementId);
	}

	return roadIds;
}

var scene, camera, renderer;
var container;

init();
animate();

function init() {

	container = document.createElement('div');
	document.body.appendChild(container);

	scene = new THREE.Scene();

	/** Setting up camera */
	camera = new THREE.PerspectiveCamera(100, window.innerWidth / window.innerHeight, 0.05, 10000);
	camera.position.set(0, 0, 200);
	scene.add(camera);

	/** Setting up light */
	//scene.add(new THREE.AmbientLight(0xf0f0f0));

	/** Settting up Plane with Grid Helper */
	var planeGeometry = new THREE.PlaneGeometry(1000, 1000);
	planeGeometry.rotateX(- Math.PI / 2);
	var planeMaterial = new THREE.ShadowMaterial();
	planeMaterial.opacity = 0.2;
	var plane = new THREE.Mesh(planeGeometry, planeMaterial);
	plane.receiveShadow = true;
	scene.add(plane);

	var helper = new THREE.GridHelper(1000, 100);
	helper.rotateX(- Math.PI / 2);
	helper.position.y = 0;
	helper.material.opacity = 0.25;
	helper.material.transparent = true;
	scene.add(helper);

	/** Settign up rendere */
	renderer = new THREE.WebGLRenderer( {antialias: true} );
	renderer.setClearColor(0xf0f0f0);
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.shadowMap.enabled = true;
	container.appendChild(renderer.domElement);

	/** Setting up controls */
	controls = new THREE.OrbitControls(camera, renderer.domElement);

	main();
}

function animate() {
	requestAnimationFrame(animate);
	renderer.render(scene, camera);
}

function main() {

	var map = new Map(scene, "../data/Crossing8Course.xodr");

	var maps = {
		Crossing8Course: 'Crossing8Course.xodr',
		CrossingComplex8Course: 'CrossingComplex8Course.xodr',
		Roundabout8Course: 'Roundabout8Course.xodr',
		Country: 'Country.xodr',
	}

	var params = {
		mapName: 'Crossing8Course',
		referenceLine: false,
		signal: false,
		saveAsJSON: ( function() { map.saveAsMap(params.mapName + '.json') } ),
	};

	var gui = new dat.GUI({width: 300});

	var mapViewer = gui.addFolder('Map Viewer');
	mapViewer.add(params, 'mapName', Object.keys(maps)).onFinishChange( function(value) { map.removeAllRoads(); map.hideSignals(); map.hideReferenceLine(); map.destroy(); map = new Map(scene, '../data/' + maps[params.mapName]); map.paveAllRoads(); } );
	mapViewer.add(params, 'referenceLine').onFinishChange( function(value) { if (value == true) map.showReferenceLine(); if (value == false) map.hideReferenceLine() } );
	mapViewer.add(params, 'signal').onFinishChange( function(value) {if (value == true) map.showSignals(); if (value == false) map.hideSignals() } )
	mapViewer.add(params, 'saveAsJSON');
	mapViewer.open();

	map.paveAllRoads()

}