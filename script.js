// ============================================
// SVG Drawing Application
// Vector-based drawing with Surface Pen support
// ============================================

// SVG element reference
const svg = document.getElementById('drawingCanvas');

// Drawing state
let isDrawing = false;
let currentPath = null;
let points = [];

// ============================================
// INITIALIZATION
// ============================================

function resizeSVG() {
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    svg.setAttribute('width', window.innerWidth);
    svg.setAttribute('height', window.innerHeight);
}

resizeSVG();
window.addEventListener('resize', resizeSVG);

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getCoordinates(e) {
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function pointsToPath(pts) {
    if (pts.length === 0) return '';

    let pathData = `M ${pts[0].x} ${pts[0].y}`;

    for (let i = 1; i < pts.length; i++) {
        pathData += ` L ${pts[i].x} ${pts[i].y}`;
    }

    return pathData;
}

// ============================================
// DRAWING FUNCTIONS
// ============================================

function startDrawing(e) {
    isDrawing = true;
    points = [];

    const coords = getCoordinates(e);
    points.push(coords);

    currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    currentPath.setAttribute('fill', 'none');
    currentPath.setAttribute('stroke', '#000000');
    currentPath.setAttribute('stroke-width', '2');
    currentPath.setAttribute('stroke-linecap', 'round');
    currentPath.setAttribute('stroke-linejoin', 'round');

    svg.appendChild(currentPath);

    e.preventDefault();
}

function draw(e) {
    if (!isDrawing) return;

    e.preventDefault();

    const coords = getCoordinates(e);
    points.push(coords);

    const pathData = pointsToPath(points);
    currentPath.setAttribute('d', pathData);
}

function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
        currentPath = null;
        points = [];
    }
}

function clearCanvas() {
    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

// Mouse events
svg.addEventListener('mousedown', startDrawing);
svg.addEventListener('mousemove', draw);
svg.addEventListener('mouseup', stopDrawing);
svg.addEventListener('mouseout', stopDrawing);

// Pointer events (Surface Pen support)
svg.addEventListener('pointerdown', startDrawing);
svg.addEventListener('pointermove', draw);
svg.addEventListener('pointerup', stopDrawing);
svg.addEventListener('pointerout', stopDrawing);
svg.addEventListener('pointercancel', stopDrawing);

// Touch events
svg.addEventListener('touchstart', startDrawing);
svg.addEventListener('touchmove', draw);
svg.addEventListener('touchend', stopDrawing);
svg.addEventListener('touchcancel', stopDrawing);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete') {
        clearCanvas();
    }
});
