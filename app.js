// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// State
let pdfDoc = null;
let pageNum = 1;
let pageIsRendering = false;
let pageNumIsPending = null;
let scale = 1.5;

// Annotation State
let annotations = {}; // Keyed by page number
let undoStack = {}; // Undo history keyed by page number
let currentTool = 'pen';
let currentColor = '#000000';
let currentStrokeWidth = 4;
let isDrawing = false;
let currentPath = null;
let currentPoints = [];
let activePointerId = null; // Track which pointer is currently drawing
let isEraserActive = false; // Track if current stroke is erasing

// DOM Elements
const fileInput = document.getElementById('fileInput');
const openFileBtn = document.getElementById('openFileBtn');
const welcomeScreen = document.getElementById('welcomeScreen');
const pdfViewer = document.getElementById('pdfViewer');
const headerControls = document.getElementById('headerControls');
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');
const pageNumDisplay = document.getElementById('pageNum');
const pageCountDisplay = document.getElementById('pageCount');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const zoomFitBtn = document.getElementById('zoomFit');
const zoomLevelDisplay = document.getElementById('zoomLevel');
const canvasContainer = document.getElementById('canvasContainer');

// Annotation Elements
const annotationLayer = document.getElementById('annotationLayer');
const activeStrokeCanvas = document.getElementById('activeStrokeCanvas');
const activeStrokeCtx = activeStrokeCanvas.getContext('2d');
const pdfWrapper = document.getElementById('pdfWrapper');
const penTool = document.getElementById('penTool');
const eraserTool = document.getElementById('eraserTool');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearBtn = document.getElementById('clearBtn');
const colorBtns = document.querySelectorAll('.color-btn');
const strokeBtns = document.querySelectorAll('.stroke-btn');

// Ink API
let inkPresenter = null;

// Event Listeners - PDF Controls
openFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
prevPageBtn.addEventListener('click', showPrevPage);
nextPageBtn.addEventListener('click', showNextPage);
zoomInBtn.addEventListener('click', zoomIn);
zoomOutBtn.addEventListener('click', zoomOut);
zoomFitBtn.addEventListener('click', fitToWidth);

// Event Listeners - Annotation Tools
penTool.addEventListener('click', () => setTool('pen'));
eraserTool.addEventListener('click', () => setTool('eraser'));
undoBtn.addEventListener('click', undoLastStroke);
redoBtn.addEventListener('click', redoLastStroke);
clearBtn.addEventListener('click', clearAllAnnotations);

colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        currentColor = btn.dataset.color;
        colorBtns.forEach(b => b.classList.remove('color-active'));
        btn.classList.add('color-active');
    });
});

strokeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        currentStrokeWidth = parseInt(btn.dataset.width);
        strokeBtns.forEach(b => b.classList.remove('stroke-active'));
        btn.classList.add('stroke-active');
    });
});

// Drawing Event Listeners - Use active stroke canvas
activeStrokeCanvas.addEventListener('pointerdown', startDrawing);
activeStrokeCanvas.addEventListener('pointermove', draw);
activeStrokeCanvas.addEventListener('pointerup', endDrawing);
activeStrokeCanvas.addEventListener('pointerleave', endDrawing);
activeStrokeCanvas.addEventListener('pointercancel', endDrawing);

// Disable context menu on long press
activeStrokeCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (!pdfDoc) return;

    switch(e.key) {
        case 'ArrowLeft':
        case 'PageUp':
            showPrevPage();
            break;
        case 'ArrowRight':
        case 'PageDown':
            showNextPage();
            break;
        case '+':
        case '=':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                zoomIn();
            }
            break;
        case '-':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                zoomOut();
            }
            break;
    }
});

// Handle file selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
        loadPDF(file);
    } else {
        alert('Please select a valid PDF file');
    }
}

// Load PDF
function loadPDF(file) {
    const fileReader = new FileReader();

    fileReader.onload = function() {
        const typedArray = new Uint8Array(this.result);

        pdfjsLib.getDocument(typedArray).promise.then(async pdf => {
            pdfDoc = pdf;
            pageCountDisplay.textContent = pdf.numPages;

            // Show PDF viewer and controls, hide welcome screen
            welcomeScreen.style.display = 'none';
            pdfViewer.style.display = 'flex';
            headerControls.style.display = 'flex';

            // Initialize Ink API
            await initInkAPI();

            // Reset to first page
            pageNum = 1;
            renderPage(pageNum);
            updatePageControls();
        }).catch(err => {
            console.error('Error loading PDF:', err);
            alert('Error loading PDF file. Please try another file.');
        });
    };

    fileReader.readAsArrayBuffer(file);
}

// Render page
function renderPage(num) {
    pageIsRendering = true;

    pdfDoc.getPage(num).then(page => {
        // Get device pixel ratio for high-DPI displays
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale });

        // Set actual canvas buffer size (accounting for DPR)
        canvas.height = viewport.height * dpr;
        canvas.width = viewport.width * dpr;

        // Set display size (CSS pixels)
        canvas.style.height = viewport.height + 'px';
        canvas.style.width = viewport.width + 'px';

        // Scale the context to match DPR
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderCtx = {
            canvasContext: ctx,
            viewport: viewport
        };

        const renderTask = page.render(renderCtx);

        renderTask.promise.then(() => {
            pageIsRendering = false;

            // Sync annotation layer
            syncAnnotationLayer();
            loadPageAnnotations();

            if (pageNumIsPending !== null) {
                renderPage(pageNumIsPending);
                pageNumIsPending = null;
            }
        });
    });

    // Update page number display
    pageNumDisplay.textContent = num;
}

// Queue page rendering
function queueRenderPage(num) {
    if (pageIsRendering) {
        pageNumIsPending = num;
    } else {
        renderPage(num);
    }
}

// Show previous page
function showPrevPage() {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
    updatePageControls();
    loadPageAnnotations();
}

// Show next page
function showNextPage() {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
    updatePageControls();
    loadPageAnnotations();
}

// Update page controls
function updatePageControls() {
    prevPageBtn.disabled = pageNum <= 1;
    nextPageBtn.disabled = pageNum >= pdfDoc.numPages;
}

// Zoom in
function zoomIn() {
    if (scale >= 3) return;
    scale += 0.25;
    updateZoomDisplay();
    queueRenderPage(pageNum);
}

// Zoom out
function zoomOut() {
    if (scale <= 0.5) return;
    scale -= 0.25;
    updateZoomDisplay();
    queueRenderPage(pageNum);
}

// Fit to width
function fitToWidth() {
    if (!pdfDoc) return;

    pdfDoc.getPage(pageNum).then(page => {
        const canvasContainer = document.getElementById('canvasContainer');
        const containerWidth = canvasContainer.clientWidth - 64; // Account for padding
        const viewport = page.getViewport({ scale: 1 });
        scale = containerWidth / viewport.width;
        updateZoomDisplay();
        queueRenderPage(pageNum);
    });
}

// Update zoom display
function updateZoomDisplay() {
    zoomLevelDisplay.textContent = Math.round(scale * 100) + '%';
}

// Initialize zoom display
updateZoomDisplay();

// Initialize Ink API
async function initInkAPI() {
    if ('ink' in navigator) {
        try {
            inkPresenter = await navigator.ink.requestPresenter({
                presentationArea: activeStrokeCanvas
            });
            console.log('Ink API initialized successfully');
        } catch (err) {
            console.warn('Ink API not available:', err);
        }
    } else {
        console.warn('Ink API not supported');
    }
}

// ============================================
// ANNOTATION FUNCTIONS
// ============================================

function setTool(tool) {
    currentTool = tool;

    if (tool === 'pen') {
        penTool.classList.add('tool-active');
        eraserTool.classList.remove('tool-active');
        annotationLayer.classList.add('drawing-mode');
    } else if (tool === 'eraser') {
        eraserTool.classList.add('tool-active');
        penTool.classList.remove('tool-active');
        annotationLayer.classList.add('drawing-mode');
    }
}

function getPointerPos(e) {
    const rect = activeStrokeCanvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    // Return both screen coordinates (for drawing) and normalized coordinates (for storage)
    return {
        x: canvasX,
        y: canvasY,
        // Normalized coordinates (0-1 range relative to canvas size)
        normalizedX: canvasX / activeStrokeCanvas.offsetWidth,
        normalizedY: canvasY / activeStrokeCanvas.offsetHeight
    };
}

function startDrawing(e) {
    // PALM REJECTION: If already drawing, ignore ALL other pointers (palm/finger touches)
    if (isDrawing && activePointerId !== null && e.pointerId !== activePointerId) {
        e.preventDefault(); // Block the palm/finger from doing anything
        return;
    }

    // Completely ignore finger touches - no interaction with PDF canvas
    if (e.pointerType === 'touch') {
        return;
    }

    // For pen/mouse only: capture pointer and prevent default
    e.preventDefault();
    e.stopPropagation();

    // CRITICAL: Capture the pointer to prevent browser from taking over mid-stroke
    activeStrokeCanvas.setPointerCapture(e.pointerId);

    // Track this pointer as the active drawing pointer
    activePointerId = e.pointerId;
    isDrawing = true;
    const pos = getPointerPos(e);
    currentPoints = [pos];

    // Detect stylus eraser end (button 5, bitmask 32)
    const isUsingEraserEnd = (e.buttons & 32) !== 0;
    isEraserActive = isUsingEraserEnd || currentTool === 'eraser';

    if (isEraserActive) {
        // Draw eraser preview circle
        drawEraserPreview(pos.x, pos.y);
        // Check for strokes to erase
        eraseAtPoint(pos.x, pos.y);
    } else if (currentTool === 'pen') {
        // Setup canvas context for drawing - match SVG stroke exactly
        activeStrokeCtx.strokeStyle = currentColor;
        activeStrokeCtx.lineWidth = currentStrokeWidth;
        activeStrokeCtx.lineCap = 'round';
        activeStrokeCtx.lineJoin = 'round';

        activeStrokeCtx.beginPath();
        activeStrokeCtx.moveTo(pos.x, pos.y);

        // Use Ink API if available - diameter should match canvas lineWidth
        if (inkPresenter && e.pointerId !== undefined) {
            inkPresenter.updateInkTrailStartPoint(e, {
                color: currentColor,
                diameter: currentStrokeWidth
            });
        }
    }
}

function draw(e) {
    // PALM REJECTION: Only process events from the active drawing pointer
    if (isDrawing && e.pointerId !== activePointerId) {
        e.preventDefault(); // Block palm/finger interference
        return;
    }

    if (!isDrawing) return;

    // Ignore finger touches
    if (e.pointerType === 'touch') return;

    // For pen/mouse: prevent any gesture interference
    e.preventDefault();
    e.stopPropagation();

    const pos = getPointerPos(e);

    if (isEraserActive) {
        // Draw eraser preview and erase
        drawEraserPreview(pos.x, pos.y);
        eraseAtPoint(pos.x, pos.y);
        return;
    }

    if (currentTool !== 'pen') return;

    // Only add point if it's far enough from the last one (reduce noise)
    const lastPoint = currentPoints[currentPoints.length - 1];
    const distance = Math.sqrt(
        Math.pow(pos.x - lastPoint.x, 2) +
        Math.pow(pos.y - lastPoint.y, 2)
    );

    // Minimum distance threshold to reduce jitter
    if (distance < 2) return;

    currentPoints.push(pos);

    // Draw smooth curve on canvas
    if (currentPoints.length >= 3) {
        // Clear and redraw with smooth curve
        activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);
        activeStrokeCtx.beginPath();
        activeStrokeCtx.moveTo(currentPoints[0].x, currentPoints[0].y);

        // Draw smooth quadratic curves
        for (let i = 1; i < currentPoints.length - 1; i++) {
            const curr = currentPoints[i];
            const next = currentPoints[i + 1];
            const midX = (curr.x + next.x) / 2;
            const midY = (curr.y + next.y) / 2;
            activeStrokeCtx.quadraticCurveTo(curr.x, curr.y, midX, midY);
        }

        // Draw to last point
        const last = currentPoints[currentPoints.length - 1];
        const secondLast = currentPoints[currentPoints.length - 2];
        activeStrokeCtx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);
        activeStrokeCtx.stroke();
    } else {
        // For first few points, just draw lines
        activeStrokeCtx.lineTo(pos.x, pos.y);
        activeStrokeCtx.stroke();
    }
}

function endDrawing(e) {
    // PALM REJECTION: Only end drawing for the active pointer, ignore palm/finger lifts
    if (e && isDrawing && e.pointerId !== activePointerId) {
        e.preventDefault();
        return;
    }

    if (!isDrawing) return;

    // Release pointer capture for pen/mouse
    if (e && e.pointerId !== undefined && e.pointerType !== 'touch') {
        try {
            activeStrokeCanvas.releasePointerCapture(e.pointerId);
        } catch (err) {
            // Ignore if already released
        }
        e.preventDefault();
        e.stopPropagation();
    }

    // Clear eraser preview if we were erasing
    if (isEraserActive) {
        activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);
    }

    isDrawing = false;
    activePointerId = null; // Clear active pointer
    const wasEraserActive = isEraserActive;
    isEraserActive = false; // Reset eraser state

    if (!wasEraserActive && currentTool === 'pen' && currentPoints.length > 1) {
        // Extract normalized coordinates for storage
        const normalizedPoints = currentPoints.map(p => ({
            x: p.normalizedX,
            y: p.normalizedY
        }));

        // Convert canvas stroke to SVG path using screen coordinates
        const svgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        svgPath.setAttribute('stroke', currentColor);
        svgPath.setAttribute('stroke-width', currentStrokeWidth);
        svgPath.setAttribute('d', pointsToPath(currentPoints));
        annotationLayer.appendChild(svgPath);

        // Save to annotations with NORMALIZED coordinates
        if (!annotations[pageNum]) {
            annotations[pageNum] = [];
        }

        annotations[pageNum].push({
            type: 'path',
            element: svgPath,
            color: currentColor,
            width: currentStrokeWidth,
            points: normalizedPoints // Store normalized (0-1) coordinates
        });

        // Clear active stroke canvas
        activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);

        // Clear redo stack when new stroke is added
        undoStack[pageNum] = [];

        updateUndoRedoButtons();
    }

    currentPoints = [];
}

function pointsToPath(points) {
    if (points.length < 2) return `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

    // Use quadratic Bezier curves for smooth strokes
    let path = `M ${points[0].x} ${points[0].y}`;

    // Create smooth curve through points using quadratic Bezier
    for (let i = 1; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];

        // Control point is the current point
        // End point is midpoint between current and next
        const endX = (curr.x + next.x) / 2;
        const endY = (curr.y + next.y) / 2;

        path += ` Q ${curr.x} ${curr.y} ${endX} ${endY}`;
    }

    // Add final point
    const last = points[points.length - 1];
    const secondLast = points[points.length - 2];
    path += ` Q ${secondLast.x} ${secondLast.y} ${last.x} ${last.y}`;

    return path;
}

function undoLastStroke() {
    const pageAnnotations = annotations[pageNum];
    if (!pageAnnotations || pageAnnotations.length === 0) return;

    const lastStroke = pageAnnotations.pop();
    if (lastStroke.element && lastStroke.element.parentNode) {
        lastStroke.element.parentNode.removeChild(lastStroke.element);
    }

    // Add to undo stack
    if (!undoStack[pageNum]) {
        undoStack[pageNum] = [];
    }
    undoStack[pageNum].push(lastStroke);

    updateUndoRedoButtons();
}

function redoLastStroke() {
    const pageUndoStack = undoStack[pageNum];
    if (!pageUndoStack || pageUndoStack.length === 0) return;

    const strokeToRedo = pageUndoStack.pop();

    // Convert normalized coordinates to screen coordinates for rendering
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const screenPoints = strokeToRedo.points.map(p => ({
        x: p.x * width,
        y: p.y * height,
        normalizedX: p.x,
        normalizedY: p.y
    }));

    // Create new SVG path element
    const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    newPath.setAttribute('stroke', strokeToRedo.color);
    newPath.setAttribute('stroke-width', strokeToRedo.width);
    newPath.setAttribute('d', pointsToPath(screenPoints));
    annotationLayer.appendChild(newPath);

    // Update element reference
    strokeToRedo.element = newPath;

    // Add back to annotations
    if (!annotations[pageNum]) {
        annotations[pageNum] = [];
    }
    annotations[pageNum].push(strokeToRedo);

    updateUndoRedoButtons();
}

function clearAllAnnotations() {
    if (!annotations[pageNum] || annotations[pageNum].length === 0) return;

    // Clear SVG layer
    while (annotationLayer.firstChild) {
        annotationLayer.removeChild(annotationLayer.firstChild);
    }

    // Clear annotations data
    annotations[pageNum] = [];

    // Clear undo stack since we can't redo after clear all
    undoStack[pageNum] = [];

    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    const hasAnnotations = annotations[pageNum] && annotations[pageNum].length > 0;
    const hasUndoStack = undoStack[pageNum] && undoStack[pageNum].length > 0;

    undoBtn.disabled = !hasAnnotations;
    redoBtn.disabled = !hasUndoStack;
}

function syncAnnotationLayer() {
    // Match SVG and active stroke canvas size to PDF canvas
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const dpr = window.devicePixelRatio || 1;

    // Sync SVG layer
    annotationLayer.setAttribute('width', canvas.style.width);
    annotationLayer.setAttribute('height', canvas.style.height);
    annotationLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Sync active stroke canvas with DPR for crisp rendering
    activeStrokeCanvas.width = width * dpr;
    activeStrokeCanvas.height = height * dpr;
    activeStrokeCanvas.style.width = width + 'px';
    activeStrokeCanvas.style.height = height + 'px';

    // Scale context to match DPR (like PDF canvas)
    activeStrokeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function loadPageAnnotations() {
    // Clear current annotations from display
    while (annotationLayer.firstChild) {
        annotationLayer.removeChild(annotationLayer.firstChild);
    }

    // Load annotations for current page
    const pageAnnotations = annotations[pageNum];
    if (pageAnnotations && pageAnnotations.length > 0) {
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;

        pageAnnotations.forEach(annotation => {
            // Convert normalized coordinates (0-1) to current screen coordinates
            const screenPoints = annotation.points.map(p => ({
                x: p.x * width,
                y: p.y * height,
                normalizedX: p.x,
                normalizedY: p.y
            }));

            const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            newPath.setAttribute('stroke', annotation.color);
            newPath.setAttribute('stroke-width', annotation.width);
            newPath.setAttribute('d', pointsToPath(screenPoints));
            annotation.element = newPath;
            annotationLayer.appendChild(newPath);
        });
    }

    updateUndoRedoButtons();
}

// ============================================
// ERASER FUNCTIONS
// ============================================

function drawEraserPreview(x, y) {
    const eraserSize = 10; // Eraser radius

    activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);
    activeStrokeCtx.beginPath();
    activeStrokeCtx.arc(x, y, eraserSize, 0, Math.PI * 2);
    activeStrokeCtx.strokeStyle = '#999';
    activeStrokeCtx.lineWidth = 2;
    activeStrokeCtx.stroke();
}

function eraseAtPoint(x, y) {
    const eraserSize = 10; // Match preview size
    const pageAnnotations = annotations[pageNum];

    if (!pageAnnotations || pageAnnotations.length === 0) return;

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    // Check each annotation stroke
    for (let i = pageAnnotations.length - 1; i >= 0; i--) {
        const annotation = pageAnnotations[i];

        // Convert normalized points to screen coordinates
        const screenPoints = annotation.points.map(p => ({
            x: p.x * width,
            y: p.y * height
        }));

        // Check if eraser touches any point in the stroke
        let shouldErase = false;
        for (const point of screenPoints) {
            const distance = Math.sqrt(
                Math.pow(point.x - x, 2) +
                Math.pow(point.y - y, 2)
            );

            if (distance < eraserSize) {
                shouldErase = true;
                break;
            }
        }

        if (shouldErase) {
            // Remove from SVG
            if (annotation.element && annotation.element.parentNode) {
                annotation.element.parentNode.removeChild(annotation.element);
            }

            // Remove from array
            pageAnnotations.splice(i, 1);
        }
    }

    // Clear redo stack when erasing
    undoStack[pageNum] = [];

    updateUndoRedoButtons();
}
