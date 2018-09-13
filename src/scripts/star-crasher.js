var g = (function(){

// ---------------------------------------------
// Viewer information

const camera = {
	x:			512., // x position on the map
	y:			800., // y position on the map
	height:		78., // height of the camera
	heightOffset: 10, // distance above ground
	angle:		0., // direction of the camera
	horizon:	100., // horizon position (look up and down)
	baseHorizon: 100.,
	distance:	800   // distance of map
};

// ---------------------------------------------
// Screen data

const screen = {
	canvas:		null,
	context:	null,
	imageData:	null,

	bufArray:	null, // color data
	buf8:		null, // the same array but with bytes
	buf32:		null, // the same array but with 32-Bit words

	backgroundColor: 0xFF400030 // 0xFFE09090
};

// ---------------------------------------------
// Keyboard and mouse interaction

const input = new Input();

input.anyKeyDownAction = startDrawFrameLoop;
input.updateCameraHorizon = (h) => camera.horizon = h;
input.zAction = () => setGravityOn(!gravityOn);

let gravityAcceleration = 0;
let gravityOn = true;
let updateRunning = false;
let time = new Date().getTime();
let timeLastFrame = new Date().getTime(); // for fps display
let frames = 0;
let speed = 3;

init();

return {
	camera, map, screen, input,
	setGravityOn
};

function setGravityOn(on) {
	//document.getElementsByNamae('gravityOn')[0].checked = on;
	gravityOn = on;
	startDrawFrameLoop();
}

// Update the camera for next frame. Dependent on keypresses
function updateCamera(input) {
	const current = new Date().getTime();
	const movementScale = 0.03;
	const deltaTime = current - time;
	const deltaMovement = deltaTime * movementScale;
	const original = {x: camera.x, y: camera.y, height: camera.height};
	const moved = (input.forwardBackward !== 0);

	if (input.leftRight != 0) {
		camera.angle += input.leftRight * 0.1 * deltaMovement;
	}
	if (moved) {
		camera.x -= input.forwardBackward * speed * Math.sin(camera.angle) * deltaMovement;
		camera.y -= input.forwardBackward * speed * Math.cos(camera.angle) * deltaMovement;
	}
	if (input.upDown != 0) {
		camera.height += input.upDown * deltaMovement;
	}
	if (input.lookUp) {
		camera.horizon += 4 * deltaMovement;
	}
	if (input.lookDown) {
		camera.horizon -= 4 * deltaMovement;
	}
	
	// Collision detection. Don't fly below the surface.
	const minZ = getMapZ(camera.x, camera.y) + camera.heightOffset;
	if (gravityOn && camera.height > minZ) {
		gravityAcceleration -= 0.0002 * deltaTime;
		camera.height += gravityAcceleration * deltaTime;
	} else {
		gravityAcceleration = 0;
	}
	if (minZ > camera.height) {
		camera.height = minZ;
	}
	if (minZ === camera.height && gravityOn && moved) {
		if (original.height === camera.height) { // level
			camera.horizon += (camera.horizon - camera.baseHorizon) / -10;
			camera.horizon = Math.round(camera.horizon);
		} else {
			camera.horizon += (camera.height - original.height) * 3;
		}
	}

	time = current;
}

function getMapZ(x, y) {
	const mapOffset = ((Math.floor(y) & (map.width-1)) << map.shift) + (Math.floor(x) & (map.height-1))|0;
	return map.altitude[mapOffset];
}

// ---------------------------------------------
// Fast way to draw vertical lines

function drawVerticalLine(x, ytop, ybottom, col) {
	x = x|0;
	ytop = ytop|0;
	ybottom = ybottom|0;
	col = col|0;
	const buf32 = screen.buf32;
	const screenWidth = screen.canvas.width|0;
	if (ytop < 0) { ytop = 0; }
	if (ytop > ybottom) { return; }

	// get offset on screen for the vertical line
	let offset = ((ytop * screenWidth) + x)|0;
	for (let k = ytop|0; k < ybottom|0; k=k+1|0) {
		buf32[offset|0] = col|0;
		offset = offset + screenWidth|0;
	}
}

// ---------------------------------------------
// Basic screen handling

function drawBackground() {
	const buf32 = screen.buf32;
	const color = screen.backgroundColor|0;
	for (let i = 0; i < buf32.length; i++) {
		buf32[i] = color|0;
	}
}

// Show the back buffer on screen
function flip() {
	screen.imageData.data.set(screen.buf8);
	screen.context.putImageData(screen.imageData, 0, 0);
}

// ---------------------------------------------
// The main render routine

function render(screen, map, camera) {
	const mapWidthPeriod = map.width - 1;
	const mapHeightPeriod = map.height - 1;

	const screenWidth = screen.canvas.width|0;
	const sinAng = Math.sin(camera.angle);
	const cosAng = Math.cos(camera.angle);

	const hiddenY = new Int32Array(screenWidth);
	for(let i=0; i<screen.canvas.width|0; i=i+1|0) {
		hiddenY[i] = screen.canvas.height;
	}

	let deltaZ = 1.;

	// draw from front to back
	for(let z=1; z<camera.distance; z+=deltaZ) {
		// 90 degree field of view
		let plx =  -cosAng * z - sinAng * z;
		let ply =   sinAng * z - cosAng * z;
		const prx =   cosAng * z - sinAng * z;
		const pry =  -sinAng * z - cosAng * z;

		const dx = (prx - plx) / screenWidth;
		const dy = (pry - ply) / screenWidth;
		plx += camera.x;
		ply += camera.y;
		const invz = 1. / z * 240.;
		for(let i=0; i<screenWidth|0; i=i+1|0) {
			const mapOffset = ((Math.floor(ply) & mapWidthPeriod) << map.shift) + (Math.floor(plx) & mapHeightPeriod)|0;
			let heightOnScreen = (camera.height - map.altitude[mapOffset]) * invz + camera.horizon|0;
			drawVerticalLine(i, heightOnScreen|0, hiddenY[i], map.color[mapOffset]);
			if (heightOnScreen < hiddenY[i]) {
				hiddenY[i] = heightOnScreen;
			}
			plx += dx;
			ply += dy;
		}
		deltaZ += 0.005;
	}
}


// ---------------------------------------------
// draw the next frame

function drawFrame() {
	updateRunning = true;
	updateCamera(input);
	drawBackground();
	render(screen, map, camera);
	flip();
	frames++;

	if (!input.keyPressed) {
		updateRunning = false;
	} else {
		window.setTimeout(drawFrame, 0);
	}
}

function startDrawFrameLoop() {
	if (!updateRunning) {
		time = new Date().getTime();
		drawFrame();
	}
}

// ---------------------------------------------

function onResizeWindow() {
	setupScreen();
}

function setupScreen() {
	screen.canvas = document.getElementById('terrain');

	const aspect = window.innerWidth / window.innerHeight;

	screen.canvas.width = window.innerWidth<800?window.innerWidth:800;
	screen.canvas.height = screen.canvas.width / aspect;

	if (screen.canvas.getContext) {
		screen.context = screen.canvas.getContext('2d');
		screen.imageData = screen.context.createImageData(screen.canvas.width, screen.canvas.height);
		screen.canvas.style.filter = 'blur(1px)';
		// screen.context.filter = 'blur(4px)';
	}

	screen.bufArray = new ArrayBuffer(screen.imageData.width * screen.imageData.height * 4);
	screen.buf8     = new Uint8Array(screen.bufArray);
	screen.buf32    = new Uint32Array(screen.bufArray);
	drawFrame();
}

function init() {
	for(let i=0; i<map.width*map.height; i++) {
		map.color[i] = 0xFF007050;
		map.altitude[i] = 0;
	}
	
	setupScreen();
	map.setup();
	drawFrame();

	// set event handlers for keyboard, mouse, touchscreen and window resize
	const canvas = document.getElementById("terrain");
	input.init(canvas, document);
	window.onresize = onResizeWindow;

	window.setInterval(updateFramesPerSecond, 2000);
	startDrawFrameLoop();
}

function updateFramesPerSecond() {
	const current = new Date().getTime();
	document.getElementById('fps').innerText = (frames / (current-timeLastFrame) * 1000).toFixed(1) + " fps";
	frames = 0;
	timeLastFrame = current;	
}


})();