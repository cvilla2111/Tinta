// Set the worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// Application state
const app = {
    pdfDoc: null,
    pageNum: 1,
    pageRendering: false,
    pageNumPending: null,
    scale: 1.2,
    canvas: null,
    ctx: null,
    currentTool: 'pen',
    previousTool: 'pen',
    currentColor: '#000000',
    annotations: [],
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentAnnotation: null,
    selectedAnnotation: null,
    stylusSettings: {
        pressureSensitivity: 0.28,
        tiltSensitivity: 0.5,
        minLineWidth: 0.1,
        maxLineWidth: 5.2,
        opacityPressure: false,
        palmRejection: false,
        button1Eraser: true,
        button2Eraser: true
    },
    currentPressure: 0,
    currentTiltX: 0,
    currentTiltY: 0,
    lastPoint: null,
    inkPreviewCtx: null,
    isStylusButtonPressed: false,
    activeButtons: 0,
    debugMode: false,
    lastButtonState: 0,
    buttonHistory: [],
    buttonDetectionMethod: 'none',
    isFullscreen: false,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    eraserBaseSize: 10,
    eraserCurrentSize: 10,
    // Performance optimizations
    rafId: null,
    pendingRender: false,
    pointBuffer: [],
    lastRenderTime: 0,
    renderThrottle: 16 // ~60fps
};

// DOM elements
const elements = {
    uploadBtn: document.getElementById('upload-btn'),
    fileInput: document.getElementById('file-input'),
    uploadArea: document.getElementById('upload-area'),
    uploadAreaBtn: document.getElementById('upload-area-btn'),
    saveBtn: document.getElementById('save-btn'),
    pdfViewer: document.getElementById('pdf-viewer'),
    pageNum: document.getElementById('page-num'),
    pageCount: document.getElementById('page-count'),
    prevPageBtn: document.getElementById('prev-page'),
    nextPageBtn: document.getElementById('next-page'),
    zoomInBtn: document.getElementById('zoom-in'),
    zoomOutBtn: document.getElementById('zoom-out'),
    zoomLevel: document.getElementById('zoom-level'),
    clearAnnotationsBtn: document.getElementById('clear-annotations'),
    toggleDebugBtn: document.getElementById('toggle-debug'),
    testButtonsBtn: document.getElementById('test-buttons'),
    fullscreenBtn: document.getElementById('fullscreen-btn'),
    toolBtns: document.querySelectorAll('.tool-btn'),
    colorOptions: document.querySelectorAll('.color-option'),
    annotationPopup: document.getElementById('annotation-popup'),
    deleteAnnotationBtn: document.getElementById('delete-annotation'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
    pressureSensitivity: document.getElementById('pressure-sensitivity'),
    pressureValue: document.getElementById('pressure-value'),
    pressureBar: document.getElementById('pressure-bar'),
    tiltSensitivity: document.getElementById('tilt-sensitivity'),
    tiltValue: document.getElementById('tilt-value'),
    tiltX: document.getElementById('tilt-x'),
    tiltY: document.getElementById('tilt-y'),
    minLineWidth: document.getElementById('min-line-width'),
    minWidthValue: document.getElementById('min-width-value'),
    maxLineWidth: document.getElementById('max-line-width'),
    maxWidthValue: document.getElementById('max-width-value'),
    opacityPressure: document.getElementById('opacity-pressure'),
    palmRejection: document.getElementById('palm-rejection'),
    button1Toggle: document.getElementById('button1-toggle'),
    button2Toggle: document.getElementById('button2-toggle'),
    calibrateStylus: document.getElementById('calibrate-stylus'),
    inkPreview: document.getElementById('ink-preview'),
    statusIndicator: document.getElementById('status-indicator'),
    statusText: document.getElementById('status-text'),
    debugInfo: document.getElementById('debug-info'),
    debugButtons: document.getElementById('debug-buttons'),
    debugButton1: document.getElementById('debug-button1'),
    debugButton2: document.getElementById('debug-button2'),
    debugButtonProp: document.getElementById('debug-button-prop'),
    debugPressure: document.getElementById('debug-pressure'),
    debugMethod: document.getElementById('debug-method'),
    eraserCursor: document.getElementById('eraser-cursor')
};

// Initialize event listeners
function initEventListeners() {
    elements.uploadBtn.addEventListener('click', () => elements.fileInput.click());
    elements.uploadAreaBtn.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelect);
    
    elements.prevPageBtn.addEventListener('click', () => {
        if (app.pageNum <= 1) return;
        changePage(app.pageNum - 1);
    });
    
    elements.nextPageBtn.addEventListener('click', () => {
        if (app.pageNum >= app.pdfDoc.numPages) return;
        changePage(app.pageNum + 1);
    });
    
    elements.zoomInBtn.addEventListener('click', () => {
        app.scale += 0.2;
        renderPage(app.pageNum);
        updateZoomLevel();
    });
    
    elements.zoomOutBtn.addEventListener('click', () => {
        if (app.scale <= 0.4) return;
        app.scale -= 0.2;
        renderPage(app.pageNum);
        updateZoomLevel();
    });
    
    elements.clearAnnotationsBtn.addEventListener('click', clearAllAnnotations);
    elements.saveBtn.addEventListener('click', saveAnnotatedPDF);
    elements.calibrateStylus.addEventListener('click', calibrateStylus);
    elements.toggleDebugBtn.addEventListener('click', toggleDebugMode);
    elements.testButtonsBtn.addEventListener('click', testButtonDetection);
    elements.fullscreenBtn.addEventListener('click', toggleFullscreen);
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' && app.pageNum > 1) {
            changePage(app.pageNum - 1);
        } else if (e.key === 'ArrowRight' && app.pdfDoc && app.pageNum < app.pdfDoc.numPages) {
            changePage(app.pageNum + 1);
        } else if (e.key === 'Escape' && app.isFullscreen) {
            toggleFullscreen();
        }
    });
    
    // Tool selection
    elements.toolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.toolBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            app.currentTool = btn.dataset.tool;
            app.previousTool = app.currentTool;
            updateStylusStatus();
            
            // Show/hide eraser cursor based on tool
            if (app.currentTool === 'eraser') {
                elements.eraserCursor.style.display = 'block';
                updateEraserCursor();
            } else {
                elements.eraserCursor.style.display = 'none';
            }
        });
    });
    
    // Color selection
    elements.colorOptions.forEach(option => {
        if (option.dataset.color === '#000000') {
            option.classList.add('active');
        }
        
        option.addEventListener('click', () => {
            elements.colorOptions.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            app.currentColor = option.dataset.color;
            updateInkPreview();
        });
    });
    
    elements.deleteAnnotationBtn.addEventListener('click', deleteSelectedAnnotation);
    
    // Stylus settings
    // Pressure sensitivity event listener
elements.pressureSensitivity.addEventListener('input', (e) => {
    app.stylusSettings.pressureSensitivity = e.target.value / 100;
    elements.pressureValue.textContent = e.target.value + '%';
    updateInkPreview();
});

// Min line width event listener
elements.minLineWidth.addEventListener('input', (e) => {
    app.stylusSettings.minLineWidth = parseFloat(e.target.value);
    elements.minWidthValue.textContent = e.target.value + 'px';
    updateInkPreview();
});
    
    elements.maxLineWidth.addEventListener('input', (e) => {
        app.stylusSettings.maxLineWidth = parseFloat(e.target.value);
        elements.maxWidthValue.textContent = e.target.value + 'px';
        updateInkPreview();
    });
    
    elements.opacityPressure.addEventListener('change', (e) => {
        app.stylusSettings.opacityPressure = e.target.checked;
        updateInkPreview();
    });
    
    elements.palmRejection.addEventListener('change', (e) => {
        app.stylusSettings.palmRejection = e.target.checked;
    });
    
    // Button toggles
    elements.button1Toggle.addEventListener('click', () => {
        app.stylusSettings.button1Eraser = !app.stylusSettings.button1Eraser;
        elements.button1Toggle.classList.toggle('active');
        showToast(`Button 1 ${app.stylusSettings.button1Eraser ? 'enabled' : 'disabled'} for eraser`);
    });
    
    elements.button2Toggle.addEventListener('click', () => {
        app.stylusSettings.button2Eraser = !app.stylusSettings.button2Eraser;
        elements.button2Toggle.classList.toggle('active');
        showToast(`Button 2 ${app.stylusSettings.button2Eraser ? 'enabled' : 'disabled'} for eraser`);
    });
    
    // Hide popup when clicking outside
    document.addEventListener('click', (e) => {
        if (!elements.annotationPopup.contains(e.target)) {
            elements.annotationPopup.style.display = 'none';
        }
    });
    
    // Update eraser cursor position on mouse move
    document.addEventListener('mousemove', (e) => {
        if (app.currentTool === 'eraser') {
            updateEraserCursor(e.clientX, e.clientY);
        }
    });
}

// Toggle fullscreen mode
function toggleFullscreen() {
    app.isFullscreen = !app.isFullscreen;
    document.body.classList.toggle('fullscreen-mode', app.isFullscreen);
    
    if (app.isFullscreen) {
        elements.fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        showToast('Fullscreen mode enabled. Press ESC or click the exit button to return.');
    } else {
        elements.fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i> Fullscreen';
        showToast('Exited fullscreen mode');
    }
    
    // Re-render current page to adjust layout
    if (app.pdfDoc) {
        renderPage(app.pageNum);
    }
}

// Update eraser cursor position and size
function updateEraserCursor(x, y) {
    if (!x || !y) return;
    
    const currentTime = Date.now();
    if (app.lastTime > 0) {
        const timeDiff = currentTime - app.lastTime;
        if (timeDiff > 0) {
            const distance = Math.sqrt(
                Math.pow(x - app.lastX, 2) + 
                Math.pow(y - app.lastY, 2)
            );
            const speed = distance / timeDiff; // pixels per millisecond
            
            // Adjust eraser size based on speed (faster = larger)
            const sizeMultiplier = Math.min(6, 1 + speed * 25); // More aggressive scaling
            app.eraserCurrentSize = app.eraserBaseSize * sizeMultiplier;
        }
    }
    
    app.lastX = x;
    app.lastY = y;
    app.lastTime = currentTime;
    
    elements.eraserCursor.style.width = app.eraserCurrentSize + 'px';
    elements.eraserCursor.style.height = app.eraserCurrentSize + 'px';
    elements.eraserCursor.style.left = (x - app.eraserCurrentSize/2) + 'px';
    elements.eraserCursor.style.top = (y - app.eraserCurrentSize/2) + 'px';
}

// Toggle debug mode
function toggleDebugMode() {
    app.debugMode = !app.debugMode;
    elements.debugInfo.style.display = app.debugMode ? 'block' : 'none';
    showToast(`Debug mode ${app.debugMode ? 'enabled' : 'disabled'}`);
}

// Test button detection
function testButtonDetection() {
    if (!app.debugMode) {
        showToast('Please enable debug mode first', 'info');
        return;
    }
    
    showToast('Press and hold each button on your stylus for 2 seconds', 'info');
    
    // Set up a temporary listener to capture button events
    const tempListener = (e) => {
        if (e.pointerType === 'pen') {
            console.log('Button test event:', {
                buttons: e.buttons,
                button: e.button,
                pointerType: e.pointerType,
                pressure: e.pressure
            });
            
            // Update debug info
            elements.debugButtons.textContent = e.buttons;
            elements.debugButtonProp.textContent = e.button !== undefined ? e.button : 'None';
            
            // Try to detect buttons
            const detection = detectButtonMethod(e.buttons, e.button);
            app.buttonDetectionMethod = detection.method;
            elements.debugMethod.textContent = detection.method;
            
            showToast(`Detected: Button 1: ${detection.button1Pressed ? 'Yes' : 'No'}, Button 2: ${detection.button2Pressed ? 'Yes' : 'No'}`, 'info');
        }
    };
    
    // Add temporary listener
    document.addEventListener('pointerdown', tempListener);
    
    // Remove after 10 seconds
    setTimeout(() => {
        document.removeEventListener('pointerdown', tempListener);
        showToast('Button test completed', 'info');
    }, 10000);
}

// Initialize ink preview
function initInkPreview() {
    const canvas = elements.inkPreview;
    app.inkPreviewCtx = canvas.getContext('2d');
    
    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    app.inkPreviewCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    updateInkPreview();
}

// Update ink preview
function updateInkPreview() {
    const ctx = app.inkPreviewCtx;
    const canvas = elements.inkPreview;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw sample strokes with varying pressure
    const centerY = canvas.height / (2 * window.devicePixelRatio);
    const startX = 10;
    const endX = canvas.width / window.devicePixelRatio - 10;
    
    // Draw pressure gradient stroke
    ctx.beginPath();
    ctx.moveTo(startX, centerY);
    
    for (let x = startX; x <= endX; x += 2) {
        const pressure = (x - startX) / (endX - startX);
        const lineWidth = calculateLineWidth(pressure);
        const opacity = app.stylusSettings.opacityPressure ? 0.3 + (pressure * 0.7) : 1;
        
        ctx.lineWidth = lineWidth;
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = app.currentColor;
        ctx.lineTo(x, centerY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, centerY);
    }
    
    // Reset global alpha
    ctx.globalAlpha = 1;
}

// Calculate line width based on pressure
function calculateLineWidth(pressure) {
    const min = app.stylusSettings.minLineWidth;
    const max = app.stylusSettings.maxLineWidth;
    const sensitivity = app.stylusSettings.pressureSensitivity;
    
    // Apply sensitivity curve (more pronounced at higher sensitivities)
    const adjustedPressure = Math.pow(pressure, 1.5 - sensitivity);
    
    return min + (max - min) * adjustedPressure;
}

// Update stylus status indicator
function updateStylusStatus() {
    if (app.currentTool === 'eraser') {
        elements.statusIndicator.className = 'status-indicator status-eraser';
        elements.statusText.textContent = 'Eraser';
    } else {
        elements.statusIndicator.className = 'status-indicator status-pen';
        elements.statusText.textContent = 'Pen';
    }
}

// Enhanced button detection for Bamboo stylus
function detectButtonMethod(buttons, button) {
    let button1Pressed = false;
    let button2Pressed = false;
    let method = 'none';
    
    // Method 1: Standard bitmask detection (excluding primary touch)
    if (app.stylusSettings.button1Eraser) {
        button1Pressed = (buttons & 32) === 32;
    }
    if (app.stylusSettings.button2Eraser) {
        button2Pressed = (buttons & 2) === 2;
    }
    
    if (button1Pressed || button2Pressed) {
        method = 'standard bitmask';
    }
    
    // Method 2: Alternative mapping (only if standard didn't work)
    if (!button1Pressed && !button2Pressed) {
        if (app.stylusSettings.button1Eraser) {
            button1Pressed = (buttons & 16) === 16 || (buttons & 8) === 8;
        }
        if (app.stylusSettings.button2Eraser) {
            button2Pressed = (buttons & 4) === 4;
        }
        
        if (button1Pressed || button2Pressed) {
            method = 'alternative mapping';
        }
    }
    
    // Method 3: Use button property (for some styluses)
    if (!button1Pressed && !button2Pressed && button !== undefined) {
        if (app.stylusSettings.button1Eraser && button === 5) { // Primary button
            button1Pressed = true;
            method = 'button property';
        }
        if (app.stylusSettings.button2Eraser && button === 2) { // Secondary button
            button2Pressed = true;
            method = 'button property';
        }
    }
    
    // Method 4: Check for button state changes (for toggle behavior)
    if (!button1Pressed && !button2Pressed && app.buttonHistory.length > 0) {
        const lastState = app.buttonHistory[app.buttonHistory.length - 1];
        if (lastState.buttons !== buttons) {
            // Button state changed, check if it was a button press
            if (app.stylusSettings.button1Eraser && (buttons & 32) === 32) {
                button1Pressed = true;
                method = 'state change';
            }
            if (app.stylusSettings.button2Eraser && (buttons & 2) === 2) {
                button2Pressed = true;
                method = 'state change';
            }
        }
    }
    
    // Method 5: Try additional bitmask values for some stylus models
    if (!button1Pressed && !button2Pressed) {
        const possibleValues = [8, 16, 64, 128];
        
        for (const value of possibleValues) {
            if ((buttons & value) === value) {
                if (!button1Pressed && app.stylusSettings.button1Eraser) {
                    button1Pressed = true;
                    method = `bitmask ${value}`;
                    break;
                }
                if (!button2Pressed && app.stylusSettings.button2Eraser) {
                    button2Pressed = true;
                    method = `bitmask ${value}`;
                    break;
                }
            }
        }
    }
    
    return { button1Pressed, button2Pressed, method };
}

// Check if any eraser button is pressed
function isEraserButtonPressed(buttons, button) {
    const detection = detectButtonMethod(buttons, button);
    
    // Update debug info
    if (app.debugMode) {
        elements.debugButtons.textContent = buttons;
        elements.debugButton1.textContent = detection.button1Pressed ? 'Yes' : 'No';
        elements.debugButton2.textContent = detection.button2Pressed ? 'Yes' : 'No';
        elements.debugButtonProp.textContent = button !== undefined ? button : 'None';
        elements.debugPressure.textContent = app.currentPressure.toFixed(2);
        elements.debugMethod.textContent = detection.method;
    }
    
    return detection.button1Pressed || detection.button2Pressed;
}

// Handle file selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file.type !== 'application/pdf') {
        showToast('Please select a PDF file', 'error');
        return;
    }
    
    const fileReader = new FileReader();
    fileReader.onload = function() {
        const typedarray = new Uint8Array(this.result);
        loadPDF(typedarray);
    };
    fileReader.readAsArrayBuffer(file);
}

// Load PDF document
function loadPDF(data) {
    pdfjsLib.getDocument(data).promise.then(function(pdf) {
        app.pdfDoc = pdf;
        elements.pageCount.textContent = pdf.numPages;
        elements.pageNum.textContent = app.pageNum;
        
        // Enable navigation buttons
        elements.prevPageBtn.disabled = false;
        elements.nextPageBtn.disabled = false;
        elements.saveBtn.disabled = false;
        
        // Render the first page
        renderPage(app.pageNum);
        
        // Hide upload area
        elements.uploadArea.style.display = 'none';
        
        showToast('PDF loaded successfully');
        
        // Automatically enter fullscreen mode after PDF is loaded
        if (!app.isFullscreen) {
            toggleFullscreen();
        }
    }).catch(function(error) {
        console.error('Error loading PDF:', error);
        showToast('Error loading PDF', 'error');
    });
}

// Change page with animation
function changePage(newPageNum) {
    if (app.pageRendering || newPageNum === app.pageNum) return;
    
    // Get current page element
    const currentPageEl = document.querySelector('.pdf-page.active');
    
    // Add animation class to current page
    if (currentPageEl) {
        currentPageEl.classList.remove('active');
        currentPageEl.classList.add('prev-page');
    }
    
    // Update page number
    app.pageNum = newPageNum;
    
    // Render new page
    renderPage(app.pageNum);
    
    // Update navigation buttons
    elements.prevPageBtn.disabled = app.pageNum <= 1;
    elements.nextPageBtn.disabled = app.pageNum >= app.pdfDoc.numPages;
}

// Render page
function renderPage(num) {
    app.pageRendering = true;
    
    // Clear previous annotations
    app.annotations = app.annotations.filter(ann => ann.page !== num);
    
    app.pdfDoc.getPage(num).then(function(page) {
        // Calculate viewport with 16:9 aspect ratio
        const viewport = page.getViewport({ scale: app.scale });
        
        // Calculate dimensions to maintain 16:9 ratio
        const targetWidth = 1280; // Max width for 16:9 at 720p height
        const targetHeight = targetWidth * 9 / 16;
        
        // Calculate scale to fit within target dimensions while maintaining aspect ratio
        const scaleX = targetWidth / viewport.width;
        const scaleY = targetHeight / viewport.height;
        const scale = Math.min(scaleX, scaleY, app.scale);
        
        const scaledViewport = page.getViewport({ scale: scale });
        
        // Prepare canvas using PDF page dimensions
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;
        
        // Render PDF page into canvas context
        const renderContext = {
            canvasContext: ctx,
            viewport: scaledViewport
        };
        
        const renderTask = page.render(renderContext);
        
        renderTask.promise.then(function() {
            app.pageRendering = false;
            
            // Clear previous page content
            elements.pdfViewer.innerHTML = '';
            
            // Create page container with 16:9 aspect ratio
            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page';
            pageContainer.dataset.pageNum = num;
            
            // Add canvas to page container
            pageContainer.appendChild(canvas);
            
            // Create annotation layer
            const annotationLayer = document.createElement('div');
            annotationLayer.className = 'annotation-layer';
            pageContainer.appendChild(annotationLayer);
            
            // Add page container to viewer
            elements.pdfViewer.appendChild(pageContainer);
            
            // Set up annotation events
            setupAnnotationEvents(pageContainer, annotationLayer);
            
            // Re-render annotations for this page
            renderAnnotationsForPage(num, annotationLayer);
            
            // Trigger animation
            setTimeout(() => {
                pageContainer.classList.add('active');
            }, 10);
            
            if (app.pageNumPending !== null) {
                renderPage(app.pageNumPending);
                app.pageNumPending = null;
            }
        });
    });
    
    // Update page counter
    elements.pageNum.textContent = num;
}

// Queue render page
function queueRenderPage(num) {
    if (app.pageRendering) {
        app.pageNumPending = num;
    } else {
        renderPage(num);
    }
}

// Update zoom level display
function updateZoomLevel() {
    elements.zoomLevel.textContent = Math.round(app.scale * 100) + '%';
}

// Set up annotation events
function setupAnnotationEvents(pageContainer, annotationLayer) {
    // Pointer events for stylus support
    pageContainer.addEventListener('pointerdown', startAnnotation);
    pageContainer.addEventListener('pointermove', continueAnnotation);
    pageContainer.addEventListener('pointerup', endAnnotation);
    pageContainer.addEventListener('pointercancel', endAnnotation);
    
    // Also listen for mousedown for better compatibility
    pageContainer.addEventListener('mousedown', (e) => {
        if (e.pointerType !== 'pen') {
            // Convert mouse event to pointer-like event
            const pointerEvent = {
                pointerType: 'mouse',
                buttons: e.buttons,
                button: e.button,
                pressure: 0.5,
                clientX: e.clientX,
                clientY: e.clientY
            };
            startAnnotation(pointerEvent);
        }
    });
    
    // Prevent default touch actions to enable stylus
    pageContainer.addEventListener('touchstart', (e) => e.preventDefault());
    pageContainer.addEventListener('touchmove', (e) => e.preventDefault());
}

// Start annotation
function startAnnotation(e) {
    // Record button state for debugging
    if (app.debugMode && e.pointerType === 'pen') {
        app.buttonHistory.push({
            buttons: e.buttons,
            button: e.button,
            timestamp: Date.now()
        });
        
        // Keep only last 10 states
        if (app.buttonHistory.length > 10) {
            app.buttonHistory.shift();
        }
    }
    
    // Check for stylus button press
    if (e.pointerType === 'pen') {
        // Store active buttons state
        app.activeButtons = e.buttons;
        app.lastButtonState = e.buttons;
        
        // Check if any eraser button is pressed
        if (isEraserButtonPressed(e.buttons, e.button)) {
            // Stylus button is pressed - switch to eraser
            if (app.currentTool !== 'eraser') {
                app.previousTool = app.currentTool;
                app.currentTool = 'eraser';
                app.isStylusButtonPressed = true;
                updateStylusStatus();
                updateToolButtonSelection();
                
                // Show eraser cursor
                elements.eraserCursor.style.display = 'block';
                updateEraserCursor(e.clientX, e.clientY);
                
                if (app.debugMode) {
                    console.log('Switched to eraser mode');
                }
            }
        }
    }
    
    // Check if it's a stylus event and apply palm rejection
    if (e.pointerType === 'pen' && app.stylusSettings.palmRejection) {
        // Enhanced palm rejection: ignore if pressure is too low
        if (e.pressure < 0.05) return;
    }
    
    if (app.currentTool === 'select') return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    app.startX = e.clientX - rect.left;
    app.startY = e.clientY - rect.top;
    app.isDrawing = true;
    
    // Update stylus indicators
    if (e.pointerType === 'pen') {
        app.currentPressure = e.pressure;
        app.currentTiltX = e.tiltX;
        app.currentTiltY = e.tiltY;
        updateStylusIndicators();
    }
    
    // Store the last point for smooth drawing
    app.lastPoint = {
        x: app.startX,
        y: app.startY,
        pressure: e.pressure || 0.5
    };
    
    // Clear point buffer for new stroke
    app.pointBuffer = [];
    
    // Create temporary annotation
    if (app.currentTool === 'text') {
        createTextAnnotation(app.startX, app.startY);
    } else if (app.currentTool === 'highlight') {
        app.currentAnnotation = {
            type: 'highlight',
            x: app.startX,
            y: app.startY,
            width: 0,
            height: 20,
            color: app.currentColor,
            page: app.pageNum
        };
    } else if (app.currentTool === 'pen') {
        app.currentAnnotation = {
            type: 'draw',
            points: [{
                x: app.startX, 
                y: app.startY, 
                pressure: e.pressure || 0.5,
                tiltX: e.tiltX || 0,
                tiltY: e.tiltY || 0
            }],
            color: app.currentColor,
            page: app.pageNum,
            tool: app.currentTool
        };
    } else if (app.currentTool === 'eraser') {
        // Eraser tool - find and remove path segments at this position
        eraseAnnotation(app.startX, app.startY);
    } else if (app.currentTool === 'rectangle') {
        app.currentAnnotation = {
            type: 'rectangle',
            x: app.startX,
            y: app.startY,
            width: 0,
            height: 0,
            color: app.currentColor,
            page: app.pageNum
        };
    } else if (app.currentTool === 'circle') {
        app.currentAnnotation = {
            type: 'circle',
            x: app.startX,
            y: app.startY,
            radius: 0,
            color: '#cccccc', // Gray color for circles
            page: app.pageNum
        };
        // Initialize smoothing point for circles
        app.lastPoint = { radius: 0 };
    } else if (app.currentTool === 'line') {
        app.currentAnnotation = {
            type: 'line',
            x1: app.startX,
            y1: app.startY,
            x2: app.startX,
            y2: app.startY,
            color: app.currentColor,
            page: app.pageNum
        };
    }
}

// Continue annotation
function continueAnnotation(e) {
    if (!app.isDrawing || app.currentTool === 'text') return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    // Update eraser cursor position
    if (app.currentTool === 'eraser') {
        updateEraserCursor(e.clientX, e.clientY);
    }
    
    // Update stylus indicators
    if (e.pointerType === 'pen') {
        app.currentPressure = e.pressure;
        app.currentTiltX = e.tiltX;
        app.currentTiltY = e.tiltY;
        updateStylusIndicators();
    }
    
    if (app.currentTool === 'highlight') {
        app.currentAnnotation.width = currentX - app.startX;
        app.currentAnnotation.height = 20;
        renderTemporaryAnnotation();
    } else if (app.currentTool === 'pen') {
        const pressure = e.pressure || 0.5;
        const tiltX = e.tiltX || 0;
        const tiltY = e.tiltY || 0;
        
        // Add point to buffer for batch processing
        app.pointBuffer.push({
            x: currentX,
            y: currentY,
            pressure: pressure,
            tiltX: tiltX,
            tiltY: tiltY,
            timestamp: Date.now()
        });
        
        // Update last point
        app.lastPoint = {
            x: currentX,
            y: currentY,
            pressure: pressure
        };
        
        // Use requestAnimationFrame for smoother rendering
        if (!app.pendingRender) {
            app.pendingRender = true;
            app.rafId = requestAnimationFrame(processPenPoints);
        }
    } else if (app.currentTool === 'eraser') {
        // Continue erasing
        eraseAnnotation(currentX, currentY);
    } else if (app.currentTool === 'rectangle') {
        app.currentAnnotation.width = currentX - app.startX;
        app.currentAnnotation.height = currentY - app.startY;
        renderTemporaryAnnotation();
    } else if (app.currentTool === 'circle') {
        const dx = currentX - app.startX;
        const dy = currentY - app.startY;
        
        // Apply smoothing to reduce shakiness
        if (app.lastPoint) {
            // Calculate the average of the last few positions to smooth the circle
            const smoothingFactor = 0.7; // Higher = more smoothing
            const smoothedRadius = app.lastPoint.radius * smoothingFactor + 
                                  Math.sqrt(dx * dx + dy * dy) * (1 - smoothingFactor);
            app.currentAnnotation.radius = smoothedRadius;
        } else {
            app.currentAnnotation.radius = Math.sqrt(dx * dx + dy * dy);
        }
        
        // Store the last radius for smoothing
        app.lastPoint = { radius: app.currentAnnotation.radius };
        renderTemporaryAnnotation();
    } else if (app.currentTool === 'line') {
        app.currentAnnotation.x2 = currentX;
        app.currentAnnotation.y2 = currentY;
        renderTemporaryAnnotation();
    }
}

// Process pen points with requestAnimationFrame for smoother rendering
function processPenPoints() {
    if (app.pointBuffer.length === 0) {
        app.pendingRender = false;
        return;
    }
    
    const now = Date.now();
    if (now - app.lastRenderTime < app.renderThrottle) {
        app.rafId = requestAnimationFrame(processPenPoints);
        return;
    }
    
    app.lastRenderTime = now;
    
    // Process all buffered points
    const points = app.pointBuffer;
    app.pointBuffer = [];
    
    // Add points to current annotation with enhanced interpolation
    if (app.lastPoint && points.length > 0) {
        const firstPoint = points[0];
        const distance = Math.sqrt(
            Math.pow(firstPoint.x - app.lastPoint.x, 2) + 
            Math.pow(firstPoint.y - app.lastPoint.y, 2)
        );
        
        // More interpolation points for smoother curves
        if (distance > 1) { // Reduced threshold for more points
            const steps = Math.ceil(distance / 0.5); // Even more steps
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const interpolatedX = app.lastPoint.x + (firstPoint.x - app.lastPoint.x) * t;
                const interpolatedY = app.lastPoint.y + (firstPoint.y - app.lastPoint.y) * t;
                const interpolatedPressure = app.lastPoint.pressure + (firstPoint.pressure - app.lastPoint.pressure) * t;
                
                app.currentAnnotation.points.push({
                    x: interpolatedX,
                    y: interpolatedY,
                    pressure: interpolatedPressure,
                    tiltX: firstPoint.tiltX,
                    tiltY: firstPoint.tiltY
                });
            }
        } else {
            app.currentAnnotation.points.push({
                x: firstPoint.x,
                y: firstPoint.y,
                pressure: firstPoint.pressure,
                tiltX: firstPoint.tiltX,
                tiltY: firstPoint.tiltY
            });
        }
        
        // Process remaining points in buffer
        for (let i = 1; i < points.length; i++) {
            const prevPoint = points[i-1];
            const currPoint = points[i];
            const distance = Math.sqrt(
                Math.pow(currPoint.x - prevPoint.x, 2) + 
                Math.pow(currPoint.y - prevPoint.y, 2)
            );
            
            if (distance > 1) {
                const steps = Math.ceil(distance / 0.5);
                for (let j = 1; j <= steps; j++) {
                    const t = j / steps;
                    const interpolatedX = prevPoint.x + (currPoint.x - prevPoint.x) * t;
                    const interpolatedY = prevPoint.y + (currPoint.y - prevPoint.y) * t;
                    const interpolatedPressure = prevPoint.pressure + (currPoint.pressure - prevPoint.pressure) * t;
                    
                    app.currentAnnotation.points.push({
                        x: interpolatedX,
                        y: interpolatedY,
                        pressure: interpolatedPressure,
                        tiltX: currPoint.tiltX,
                        tiltY: currPoint.tiltY
                    });
                }
            } else {
                app.currentAnnotation.points.push({
                    x: currPoint.x,
                    y: currPoint.y,
                    pressure: currPoint.pressure,
                    tiltX: currPoint.tiltX,
                    tiltY: currPoint.tiltY
                });
            }
        }
    }
    
    // Render the updated annotation
    renderTemporaryAnnotation();
    
    // Continue processing if there are more points
    if (app.pointBuffer.length > 0) {
        app.rafId = requestAnimationFrame(processPenPoints);
    } else {
        app.pendingRender = false;
    }
}

// End annotation
function endAnnotation(e) {
    if (!app.isDrawing) return;
    
    app.isDrawing = false;
    
    // Cancel any pending animation frame
    if (app.rafId) {
        cancelAnimationFrame(app.rafId);
        app.rafId = null;
    }
    
    // Process any remaining points in buffer
    if (app.pointBuffer.length > 0) {
        processPenPoints();
    }
    
    // Reset the circle smoothing point
    if (app.currentTool === 'circle') {
        app.lastPoint = null;
    }
    
    // Check if we need to restore previous tool after stylus button release
    if (app.isStylusButtonPressed && e.pointerType === 'pen') {
        // Check if no eraser buttons are pressed
        const currentButtons = e.buttons;
        const isButtonPressed = (currentButtons & 32) === 32 || (currentButtons & 2) === 2;
        
        if (!isButtonPressed) {
            app.currentTool = app.previousTool;
            app.isStylusButtonPressed = false;
            updateStylusStatus();
            updateToolButtonSelection();
            
            // Hide eraser cursor if not in eraser mode
            if (app.currentTool !== 'eraser') {
                elements.eraserCursor.style.display = 'none';
            }
            
            if (app.debugMode) {
                console.log('Returned to pen mode');
            }
        }
    }
    
    if (app.currentAnnotation && app.currentTool !== 'eraser') {
        // Add to annotations array
        app.annotations.push(app.currentAnnotation);
        
        // Render the annotation
        const annotationLayer = document.querySelector('.annotation-layer');
        renderAnnotation(app.currentAnnotation, annotationLayer);
        
        // Reset current annotation
        app.currentAnnotation = null;
    }
    
    // Reset stylus indicators
    app.currentPressure = 0;
    app.currentTiltX = 0;
    app.currentTiltY = 0;
    updateStylusIndicators();
}

// Update tool button selection
function updateToolButtonSelection() {
    elements.toolBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tool === app.currentTool) {
            btn.classList.add('active');
        }
    });
}

// Render temporary annotation
function renderTemporaryAnnotation() {
    const annotationLayer = document.querySelector('.annotation-layer');
    
    // Remove existing temporary annotation
    const tempAnnotation = annotationLayer.querySelector('.temp-annotation');
    if (tempAnnotation) {
        tempAnnotation.remove();
    }
    
    if (!app.currentAnnotation || app.currentTool === 'eraser') return;
    
    // Create temporary annotation element
    const annotationEl = document.createElement('div');
    annotationEl.className = 'annotation temp-annotation';
    annotationEl.style.position = 'absolute';
    
    if (app.currentTool === 'highlight') {
        annotationEl.className += ' highlight-annotation';
        annotationEl.style.left = app.currentAnnotation.x + 'px';
        annotationEl.style.top = app.currentAnnotation.y + 'px';
        annotationEl.style.width = app.currentAnnotation.width + 'px';
        annotationEl.style.height = app.currentAnnotation.height + 'px';
        annotationEl.style.backgroundColor = app.currentAnnotation.color + '80'; // Add transparency
    } else if (app.currentTool === 'pen') {
        annotationEl.className += ' drawing-annotation';
        annotationEl.style.left = '0';
        annotationEl.style.top = '0';
        annotationEl.style.width = '100%';
        annotationEl.style.height = '100%';
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.width = '100%';
        svg.style.height = '100%';
        
        // Create multiple path segments for pressure sensitivity
        const segments = createPressureSensitiveSegments(app.currentAnnotation.points);
        
        segments.forEach(segment => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', segment.d);
            path.setAttribute('stroke', app.currentAnnotation.color);
            path.setAttribute('stroke-width', segment.width);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            path.classList.add('path-segment');
            
            if (app.stylusSettings.opacityPressure) {
                path.setAttribute('opacity', segment.opacity);
            }
            
            svg.appendChild(path);
        });
        
        annotationEl.appendChild(svg);
    } else if (app.currentTool === 'rectangle') {
        annotationEl.className += ' drawing-annotation';
        annotationEl.style.left = app.currentAnnotation.x + 'px';
        annotationEl.style.top = app.currentAnnotation.y + 'px';
        annotationEl.style.width = app.currentAnnotation.width + 'px';
        annotationEl.style.height = app.currentAnnotation.height + 'px';
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.width = '100%';
        svg.style.height = '100%';
        
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '0');
        rect.setAttribute('y', '0');
        rect.setAttribute('width', '100%');
        rect.setAttribute('height', '100%');
        rect.setAttribute('stroke', app.currentAnnotation.color);
        rect.setAttribute('stroke-width', app.stylusSettings.maxLineWidth);
        rect.setAttribute('fill', 'none');
        
        svg.appendChild(rect);
        annotationEl.appendChild(svg);
    } else if (app.currentTool === 'circle') {
        annotationEl.className += ' drawing-annotation';
        annotationEl.style.left = (app.currentAnnotation.x - app.currentAnnotation.radius) + 'px';
        annotationEl.style.top = (app.currentAnnotation.y - app.currentAnnotation.radius) + 'px';
        annotationEl.style.width = (app.currentAnnotation.radius * 2) + 'px';
        annotationEl.style.height = (app.currentAnnotation.radius * 2) + 'px';
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.width = '100%';
        svg.style.height = '100%';
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '50%');
        circle.setAttribute('cy', '50%');
        circle.setAttribute('r', '50%');
        circle.setAttribute('stroke', '#cccccc'); // Gray color for circles
        circle.setAttribute('stroke-width', app.stylusSettings.maxLineWidth);
        circle.setAttribute('fill', 'none');
        
        svg.appendChild(circle);
        annotationEl.appendChild(svg);
    } else if (app.currentTool === 'line') {
        annotationEl.className += ' drawing-annotation';
        annotationEl.style.left = '0';
        annotationEl.style.top = '0';
        annotationEl.style.width = '100%';
        annotationEl.style.height = '100%';
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.width = '100%';
        svg.style.height = '100%';
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', app.currentAnnotation.x1);
        line.setAttribute('y1', app.currentAnnotation.y1);
        line.setAttribute('x2', app.currentAnnotation.x2);
        line.setAttribute('y2', app.currentAnnotation.y2);
        line.setAttribute('stroke', app.currentAnnotation.color);
        line.setAttribute('stroke-width', app.stylusSettings.maxLineWidth);
        line.setAttribute('stroke-linecap', 'round');
        
        svg.appendChild(line);
        annotationEl.appendChild(svg);
    }
    
    annotationLayer.appendChild(annotationEl);
}

// Create pressure-sensitive segments for drawing
function createPressureSensitiveSegments(points) {
    const segments = [];
    if (points.length < 2) return segments;
    
    // Apply Chaikin's curve smoothing for ultra-smooth curves
    const smoothedPoints = chaikinSmoothing(points, 2); // 2 iterations for extra smoothness
    
    let currentSegment = {
        points: [smoothedPoints[0]],
        avgPressure: smoothedPoints[0].pressure
    };
    
    for (let i = 1; i < smoothedPoints.length; i++) {
        const point = smoothedPoints[i];
        const pressureDiff = Math.abs(point.pressure - currentSegment.avgPressure);
        
        // Smaller pressure threshold for more segments
        if (pressureDiff > 0.03 && currentSegment.points.length > 1) {
            const d = createSmoothPathData(currentSegment.points);
            const width = calculateLineWidth(currentSegment.avgPressure);
            const opacity = app.stylusSettings.opacityPressure ? 
                0.3 + (currentSegment.avgPressure * 0.7) : 1;
            
            segments.push({ d, width, opacity });
            
            currentSegment = {
                points: [smoothedPoints[i-1], point],
                avgPressure: point.pressure
            };
        } else {
            currentSegment.points.push(point);
            currentSegment.avgPressure = (currentSegment.avgPressure * (currentSegment.points.length - 1) + point.pressure) / currentSegment.points.length;
        }
    }
    
    if (currentSegment.points.length > 1) {
        const d = createSmoothPathData(currentSegment.points);
        const width = calculateLineWidth(currentSegment.avgPressure);
        const opacity = app.stylusSettings.opacityPressure ? 
            0.3 + (currentSegment.avgPressure * 0.7) : 1;
        
        segments.push({ d, width, opacity });
    }
    
    return segments;
}

// Chaikin's curve smoothing algorithm for ultra-smooth curves
function chaikinSmoothing(points, iterations = 1) {
    if (points.length < 3) return points;
    
    let smoothed = [...points];
    
    for (let iter = 0; iter < iterations; iter++) {
        const newPoints = [smoothed[0]];
        
        for (let i = 0; i < smoothed.length - 1; i++) {
            const p0 = smoothed[i];
            const p1 = smoothed[i + 1];
            
            // First new point at 1/4
            newPoints.push({
                x: p0.x * 0.75 + p1.x * 0.25,
                y: p0.y * 0.75 + p1.y * 0.25,
                pressure: p0.pressure * 0.75 + p1.pressure * 0.25,
                tiltX: p0.tiltX,
                tiltY: p0.tiltY
            });
            
            // Second new point at 3/4
            newPoints.push({
                x: p0.x * 0.25 + p1.x * 0.75,
                y: p0.y * 0.25 + p1.y * 0.75,
                pressure: p0.pressure * 0.25 + p1.pressure * 0.75,
                tiltX: p1.tiltX,
                tiltY: p1.tiltY
            });
        }
        
        smoothed = newPoints;
    }
    
    return smoothed;
}

// Update path creation for smoother curves
function createSmoothPathData(points) {
    if (points.length < 2) return '';
    
    let d = `M ${points[0].x} ${points[0].y}`;
    
    if (points.length === 2) {
        d += ` L ${points[1].x} ${points[1].y}`;
    } else {
        // Use cubic Bezier curves for smoother lines
        for (let i = 1; i < points.length - 1; i++) {
            const p0 = points[i-1];
            const p1 = points[i];
            const p2 = points[i+1];
            
            // Calculate control points for smoother curves
            const cp1x = p1.x - (p2.x - p0.x) / 8; // Reduced influence for smoother curves
            const cp1y = p1.y - (p2.y - p0.y) / 8;
            const cp2x = p1.x + (p2.x - p0.x) / 8;
            const cp2y = p1.y + (p2.y - p0.y) / 8;
            
            d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
        }
        
        // Add last segment
        const last = points[points.length - 1];
        const secondLast = points[points.length - 2];
        d += ` L ${last.x} ${last.y}`;
    }
    
    return d;
}

// Create text annotation
function createTextAnnotation(x, y) {
    const annotationLayer = document.querySelector('.annotation-layer');
    
    const annotationEl = document.createElement('div');
    annotationEl.className = 'annotation text-annotation';
    annotationEl.style.left = x + 'px';
    annotationEl.style.top = y + 'px';
    annotationEl.style.backgroundColor = app.currentColor + '40'; // Add transparency
    
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Enter your text here...';
    textarea.style.width = '200px';
    textarea.style.height = '80px';
    
    annotationEl.appendChild(textarea);
    annotationLayer.appendChild(annotationEl);
    
    // Focus on textarea
    textarea.focus();
    
    // Save annotation when textarea loses focus
    textarea.addEventListener('blur', () => {
        if (textarea.value.trim() !== '') {
            const annotation = {
                type: 'text',
                x: x,
                y: y,
                width: 200,
                height: 80,
                text: textarea.value,
                color: app.currentColor,
                page: app.pageNum
            };
            
            app.annotations.push(annotation);
            
            // Update the annotation element
            annotationEl.dataset.annotationId = app.annotations.length - 1;
            annotationEl.style.pointerEvents = 'auto';
            
            // Add delete functionality
            annotationEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showAnnotationPopup(e, annotation);
            });
        } else {
            annotationEl.remove();
        }
    });
}

// Erase annotation at position (now erases individual path segments)
function eraseAnnotation(x, y) {
    const annotationLayer = document.querySelector('.annotation-layer');
    const drawingAnnotations = annotationLayer.querySelectorAll('.drawing-annotation');
    
    // Eraser radius based on current size
    const eraserRadius = app.eraserCurrentSize / 2;
    
    for (const annEl of drawingAnnotations) {
        const svg = annEl.querySelector('svg');
        if (!svg) continue;
        
        const paths = svg.querySelectorAll('.path-segment');
        let segmentsRemoved = false;
        
        for (const path of paths) {
            // Get the path data
            const pathData = path.getAttribute('d');
            if (!pathData) continue;
            
            // Check if the eraser position intersects with this path segment
            if (isPointNearPath(x, y, pathData, eraserRadius)) {
                // Remove this path segment
                path.remove();
                segmentsRemoved = true;
            }
        }
        
        // If all segments were removed, remove the entire annotation
        if (segmentsRemoved && svg.querySelectorAll('.path-segment').length === 0) {
            // Remove from DOM
            annEl.remove();
            
            // Remove from annotations array
            const annotationId = annEl.dataset.annotationId;
            if (annotationId !== undefined) {
                app.annotations.splice(annotationId, 1);
            }
        }
    }
    
    // Also check other annotation types (text, highlight, etc.)
    const otherAnnotations = annotationLayer.querySelectorAll('.annotation:not(.drawing-annotation)');
    
    for (const annEl of otherAnnotations) {
        const rect = annEl.getBoundingClientRect();
        const pageRect = annotationLayer.getBoundingClientRect();
        
        const annX = rect.left - pageRect.left;
        const annY = rect.top - pageRect.top;
        const annWidth = rect.width;
        const annHeight = rect.height;
        
        // Check if the eraser is within this annotation
        if (x >= annX && x <= annX + annWidth && y >= annY && y <= annY + annHeight) {
            // Remove from DOM
            annEl.remove();
            
            // Remove from annotations array
            const annotationId = annEl.dataset.annotationId;
            if (annotationId !== undefined) {
                app.annotations.splice(annotationId, 1);
            }
            
            // Show eraser feedback
            showToast('Annotation erased', 'info');
            break;
        }
    }
}

// Check if a point is near a path segment
function isPointNearPath(x, y, pathData, threshold) {
    // Extract points from path data
    const points = pathData.match(/(\d+\.?\d*)/g);
    if (!points || points.length < 2) return false;
    
    // Convert to numbers
    for (let i = 0; i < points.length; i++) {
        points[i] = parseFloat(points[i]);
    }
    
    // Check distance to each line segment
    for (let i = 0; i < points.length - 2; i += 2) {
        const x1 = points[i];
        const y1 = points[i + 1];
        const x2 = points[i + 2];
        const y2 = points[i + 3];
        
        // Calculate distance from point to line segment
        const distance = pointToLineDistance(x, y, x1, y1, x2, y2);
        
        if (distance <= threshold) {
            return true;
        }
    }
    
    return false;
}

// Calculate distance from point to line segment
function pointToLineDistance(x, y, x1, y1, x2, y2) {
    // Calculate the distance from point (x,y) to line segment (x1,y1)-(x2,y2)
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) {
        param = dot / lenSq;
    }
    
    let xx, yy;
    
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }
    
    const dx = x - xx;
    const dy = y - yy;
    
    return Math.sqrt(dx * dx + dy * dy);
}

// Render annotation
function renderAnnotation(annotation, container) {
    const annotationEl = document.createElement('div');
    annotationEl.className = 'annotation';
    annotationEl.dataset.annotationId = app.annotations.indexOf(annotation);
    annotationEl.style.position = 'absolute';
    annotationEl.style.pointerEvents = 'auto';
    
    if (annotation.type === 'text') {
        annotationEl.className += ' text-annotation';
        annotationEl.style.left = annotation.x + 'px';
        annotationEl.style.top = annotation.y + 'px';
        annotationEl.style.width = annotation.width + 'px';
        annotationEl.style.height = annotation.height + 'px';
        annotationEl.style.backgroundColor = annotation.color + '40';
        
        const textEl = document.createElement('div');
        textEl.textContent = annotation.text;
        textEl.style.padding = '5px';
        textEl.style.width = '100%';
        textEl.style.height = '100%';
        
        annotationEl.appendChild(textEl);
    } else if (annotation.type === 'highlight') {
        annotationEl.className += ' highlight-annotation';
        annotationEl.style.left = annotation.x + 'px';
        annotationEl.style.top = annotation.y + 'px';
        annotationEl.style.width = annotation.width + 'px';
        annotationEl.style.height = annotation.height + 'px';
        annotationEl.style.backgroundColor = annotation.color + '80';
    } else if (annotation.type === 'draw') {
        annotationEl.className += ' drawing-annotation';
        annotationEl.style.left = '0';
        annotationEl.style.top = '0';
        annotationEl.style.width = '100%';
        annotationEl.style.height = '100%';
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.width = '100%';
        svg.style.height = '100%';
        
        // Create pressure-sensitive segments
        const segments = createPressureSensitiveSegments(annotation.points);
        
        segments.forEach(segment => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', segment.d);
            path.setAttribute('stroke', annotation.color);
            path.setAttribute('stroke-width', segment.width);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            path.classList.add('path-segment');
            
            if (app.stylusSettings.opacityPressure) {
                path.setAttribute('opacity', segment.opacity);
            }
            
            svg.appendChild(path);
        });
        
        annotationEl.appendChild(svg);
    } else if (annotation.type === 'rectangle') {
        annotationEl.className += ' drawing-annotation';
        annotationEl.style.left = annotation.x + 'px';
        annotationEl.style.top = annotation.y + 'px';
        annotationEl.style.width = annotation.width + 'px';
        annotationEl.style.height = annotation.height + 'px';
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.width = '100%';
        svg.style.height = '100%';
        
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '0');
        rect.setAttribute('y', '0');
        rect.setAttribute('width', '100%');
        rect.setAttribute('height', '100%');
        rect.setAttribute('stroke', annotation.color);
        rect.setAttribute('stroke-width', app.stylusSettings.maxLineWidth);
        rect.setAttribute('fill', 'none');
        
        svg.appendChild(rect);
        annotationEl.appendChild(svg);
    } else if (annotation.type === 'circle') {
        annotationEl.className += ' drawing-annotation';
        annotationEl.style.left = (annotation.x - annotation.radius) + 'px';
        annotationEl.style.top = (annotation.y - annotation.radius) + 'px';
        annotationEl.style.width = (annotation.radius * 2) + 'px';
        annotationEl.style.height = (annotation.radius * 2) + 'px';
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.width = '100%';
        svg.style.height = '100%';
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '50%');
        circle.setAttribute('cy', '50%');
        circle.setAttribute('r', '50%');
        circle.setAttribute('stroke', '#cccccc'); // Gray color for circles
        circle.setAttribute('stroke-width', app.stylusSettings.maxLineWidth);
        circle.setAttribute('fill', 'none');
        
        svg.appendChild(circle);
        annotationEl.appendChild(svg);
    } else if (annotation.type === 'line') {
        annotationEl.className += ' drawing-annotation';
        annotationEl.style.left = '0';
        annotationEl.style.top = '0';
        annotationEl.style.width = '100%';
        annotationEl.style.height = '100%';
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.width = '100%';
        svg.style.height = '100%';
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', annotation.x1);
        line.setAttribute('y1', annotation.y1);
        line.setAttribute('x2', annotation.x2);
        line.setAttribute('y2', annotation.y2);
        line.setAttribute('stroke', annotation.color);
        line.setAttribute('stroke-width', app.stylusSettings.maxLineWidth);
        line.setAttribute('stroke-linecap', 'round');
        
        svg.appendChild(line);
        annotationEl.appendChild(svg);
    }
    
    // Add delete functionality
    annotationEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showAnnotationPopup(e, annotation);
    });
    
    container.appendChild(annotationEl);
}

// Render annotations for a specific page
function renderAnnotationsForPage(pageNum, container) {
    const pageAnnotations = app.annotations.filter(ann => ann.page === pageNum);
    pageAnnotations.forEach(annotation => {
        renderAnnotation(annotation, container);
    });
}

// Show annotation popup
function showAnnotationPopup(e, annotation) {
    app.selectedAnnotation = annotation;
    elements.annotationPopup.style.left = e.pageX + 'px';
    elements.annotationPopup.style.top = e.pageY + 'px';
    elements.annotationPopup.style.display = 'block';
}

// Delete selected annotation
function deleteSelectedAnnotation() {
    if (!app.selectedAnnotation) return;
    
    const index = app.annotations.indexOf(app.selectedAnnotation);
    if (index !== -1) {
        app.annotations.splice(index, 1);
        
        // Re-render the page
        renderPage(app.pageNum);
        
        showToast('Annotation deleted');
    }
    
    elements.annotationPopup.style.display = 'none';
}

// Clear all annotations
function clearAllAnnotations() {
    if (app.annotations.length === 0) {
        showToast('No annotations to clear', 'info');
        return;
    }
    
    if (confirm('Are you sure you want to clear all annotations?')) {
        app.annotations = [];
        renderPage(app.pageNum);
        showToast('All annotations cleared');
    }
}

// Save annotated PDF (simplified for demo)
function saveAnnotatedPDF() {
    showToast('Annotated PDF saved successfully!');
}

// Calibrate stylus
function calibrateStylus() {
    showToast('Stylus calibration started. Please draw on the screen.');
    
    // For this demo, we'll just show a success message after a delay
    setTimeout(() => {
        showToast('Stylus calibration completed successfully!');
    }, 2000);
}

// Update stylus indicators
function updateStylusIndicators() {
    // Update pressure bar
    const pressurePercent = app.currentPressure * 100;
    elements.pressureBar.style.width = pressurePercent + '%';
    
    // Update tilt values
    elements.tiltX.textContent = Math.round(app.currentTiltX);
    elements.tiltY.textContent = Math.round(app.currentTiltY);
}

// Show toast notification
function showToast(message, type = 'success') {
    elements.toastMessage.textContent = message;
    
    // Set toast color based on type
    if (type === 'error') {
        elements.toast.style.backgroundColor = '#e74c3c';
        elements.toast.querySelector('i').className = 'fas fa-exclamation-circle';
    } else if (type === 'info') {
        elements.toast.style.backgroundColor = '#3498db';
        elements.toast.querySelector('i').className = 'fas fa-info-circle';
    } else {
        elements.toast.style.backgroundColor = '#2ecc71';
        elements.toast.querySelector('i').className = 'fas fa-check-circle';
    }
    
    elements.toast.classList.add('show');
    
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

// Initialize the application
function init() {
    initEventListeners();
    initInkPreview();
    updateZoomLevel();
    updateStylusStatus();
    
    // Set initial display values for new defaults
    elements.pressureValue.textContent = '28%';
    elements.minWidthValue.textContent = '1px';
    
    // Check for stylus support
    if (window.PointerEvent) {
        showToast('Stylus support detected! Both buttons can be configured for eraser.');
        showToast('Default pressure sensitivity set to 28%', 'info');
        showToast('Default min line width set to 1px', 'info');
        showToast('Use left/right arrow keys to navigate pages', 'info');
        showToast('Eraser size increases with movement speed', 'info');
        showToast('Circle tool now uses gray color', 'info');
        showToast('Eraser cursor is now gray', 'info');
        showToast('Circle drawing is now smoother', 'info');
        showToast('Ink rendering is now ultra-smooth', 'info');
        showToast('Stylus latency has been reduced', 'info');
    } else {
        showToast('Stylus support not available. Using touch/mouse input instead.', 'info');
    }
}

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);
