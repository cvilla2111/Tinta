// Canvas setup
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');

// Drawing state
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// Resize canvas to fill the available space
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();

    // Store the current canvas content
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Resize canvas
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Restore the canvas content
    ctx.putImageData(imageData, 0, 0);

    // Set drawing properties
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}

// Initial setup
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Get coordinates relative to canvas
function getCoordinates(e) {
    const rect = canvas.getBoundingClientRect();

    // Handle both mouse and pointer events
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

// Start drawing
function startDrawing(e) {
    isDrawing = true;
    const coords = getCoordinates(e);
    lastX = coords.x;
    lastY = coords.y;

    // Prevent scrolling on touch devices
    e.preventDefault();
}

// Draw
function draw(e) {
    if (!isDrawing) return;

    e.preventDefault();

    const coords = getCoordinates(e);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    lastX = coords.x;
    lastY = coords.y;
}

// Stop drawing
function stopDrawing() {
    isDrawing = false;
}

// Mouse events
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

// Pointer events (for Surface Pen support)
canvas.addEventListener('pointerdown', startDrawing);
canvas.addEventListener('pointermove', draw);
canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointerout', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);

// Touch events
canvas.addEventListener('touchstart', startDrawing);
canvas.addEventListener('touchmove', draw);
canvas.addEventListener('touchend', stopDrawing);
canvas.addEventListener('touchcancel', stopDrawing);

// Keyboard shortcut - Delete key clears canvas
document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
});
