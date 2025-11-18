// ============================================
// SVG Drawing Application
// Vector-based drawing with Surface Pen support
// ============================================

// Element references
const homeScreen = document.getElementById('homeScreen');
const drawingScreen = document.getElementById('drawingScreen');
const pdfInput = document.getElementById('pdfInput');
const pdfCanvas = document.getElementById('pdfCanvas');
const svg = document.getElementById('drawingCanvas');

// Drawing state
let isDrawing = false;
let isErasing = false;
let currentPath = null;
let points = [];
let eraseAnimationFrame = null;
let currentColor = '#000000';
let isLasering = false;
let currentStrokeWidth = 5;

// Eraser indicator
let eraserIndicator = null;

// Laser pointer
let laserPointer = null;
let laserStrokes = [];
let laserFadeTimeout = null;

// Active tool state
let activeTool = 'pen'; // 'pen', 'eraser', 'laser', 'lasso'
let isLassoing = false;

// Presentation state
let presentationConnection = null;
let isPresentationReceiver = false;

// Selection state
let selectedStrokes = [];
let selectionRect = null;
let selectionHandles = [];
let isDraggingSelection = false;
let isScalingSelection = false;
let dragStartPoint = null;
let scaleHandle = null;
let originalBounds = null;

// PDF state
let pdfDoc = null;
let currentPage = 1;
let pdfArrayBuffer = null; // Store PDF data for presentation

// Store drawings per page (with viewBox dimensions)
let pageDrawings = {};
let currentViewBoxWidth = 0;
let currentViewBoxHeight = 0;

// Undo/Redo state
let undoHistory = {}; // History stack per page

// ============================================
// CUSTOM ALERT MODAL
// ============================================

function showAlert(message) {
    const modal = document.getElementById('customAlertModal');
    const messageElement = document.getElementById('customAlertMessage');
    const okBtn = document.getElementById('customAlertOkBtn');

    if (!modal || !messageElement || !okBtn) {
        // Fallback to console if modal elements don't exist
        console.error('Alert:', message);
        return;
    }

    messageElement.textContent = message;
    modal.classList.add('show');

    // Remove any existing event listeners to avoid duplicates
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    // Add click event to close modal
    newOkBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    // Close modal when clicking outside the content
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
}
let redoHistory = {}; // Redo stack per page
const MAX_HISTORY = 50; // Maximum number of undo steps

// Animation state
let isPageChanging = false;

// Track if drawing canvas has been initialized
let isDrawingCanvasInitialized = false;

// ============================================
// INITIALIZATION
// ============================================

function resizeSVG() {
    // Match SVG size to PDF canvas size
    const pdfWidth = pdfCanvas.width;
    const pdfHeight = pdfCanvas.height;

    // Set viewBox to match PDF dimensions
    svg.setAttribute('viewBox', `0 0 ${pdfWidth} ${pdfHeight}`);
    svg.setAttribute('width', pdfWidth);
    svg.setAttribute('height', pdfHeight);

    // Set CSS size to match PDF display size
    svg.style.width = pdfCanvas.style.width;
    svg.style.height = pdfCanvas.style.height;

    // Store current viewBox dimensions
    currentViewBoxWidth = pdfWidth;
    currentViewBoxHeight = pdfHeight;
}

// ============================================
// BLANK CANVAS INITIALIZATION
// ============================================

function initializeBlankCanvas() {
    // Create a blank white canvas for drawing
    const container = document.getElementById('canvasContainer');
    if (!container) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Calculate 16:9 drawable area
    let drawableWidth, drawableHeight;
    const containerAspect = containerWidth / containerHeight;
    const targetAspect = 16 / 9;

    if (containerAspect > targetAspect) {
        drawableHeight = containerHeight;
        drawableWidth = drawableHeight * targetAspect;
    } else {
        drawableWidth = containerWidth;
        drawableHeight = drawableWidth / targetAspect;
    }

    // Set up blank white PDF canvas
    const dpr = window.devicePixelRatio || 1;
    pdfCanvas.width = drawableWidth * dpr;
    pdfCanvas.height = drawableHeight * dpr;
    pdfCanvas.style.width = `${drawableWidth}px`;
    pdfCanvas.style.height = `${drawableHeight}px`;

    // Fill with white background
    const ctx = pdfCanvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, pdfCanvas.width, pdfCanvas.height);

    // Set up SVG canvas to match
    resizeSVG();

    // Initialize drawing canvas
    initializeDrawingCanvas();

    // Set current page to 1 (for blank canvas mode)
    currentPage = 1;

    // Update page navigation to show we're on a blank canvas
    updatePageNavigation();
}

// PDF.js worker configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Check if this is a presentation receiver
if (window.location.hash === '#receiver') {
    isPresentationReceiver = true;
    console.log('This is a presentation receiver');

    // Immediately hide home screen and show drawing screen for receivers
    document.body.classList.add('drawing-mode');
} else {
    // Start directly on drawing screen with blank canvas
    document.body.classList.add('drawing-mode');

    // Initialize blank canvas
    initializeBlankCanvas();

    // Load PDFs in background for when user opens library
    loadPDFGallery();
}

// ============================================
// PDF GALLERY FUNCTIONS
// ============================================

async function loadPDFGallery() {
    const pdfGrid = document.getElementById('pdfGrid');
    if (!pdfGrid) return;

    let pdfFiles = [];

    // Try Node.js server endpoint
    try {
        const response = await fetch('pdf/list');
        if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
            const fileList = await response.json();
            pdfFiles = fileList.map(filename => `pdf/${filename}`);
            console.log(`Found ${pdfFiles.length} PDF(s) in the pdf/ folder`);
        }
    } catch (error) {
        console.error('Could not load PDF list. Please run the server using:');
        console.error('  node server.js');
        console.error('');
        console.error('If you don\'t have Node.js installed, download it from: https://nodejs.org/');
        return;
    }

    // Load all discovered PDFs
    for (const pdfPath of pdfFiles) {
        try {
            const response = await fetch(pdfPath);
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                // Clone the ArrayBuffer to prevent detachment issues
                const clonedBuffer = arrayBuffer.slice(0);
                await createPDFThumbnail(pdfPath, clonedBuffer, pdfGrid);
            }
        } catch (error) {
            console.error(`Failed to load ${pdfPath}:`, error.message);
        }
    }

    if (pdfFiles.length > 0) {
        console.log(`Successfully loaded ${pdfFiles.length} PDF thumbnail(s)`);
    }
}

async function createPDFThumbnail(pdfPath, arrayBuffer, container) {
    const pdfName = pdfPath.split('/').pop().replace('.pdf', '');

    // Clone the arrayBuffer again to keep a persistent copy for the click handler
    const persistentBuffer = arrayBuffer.slice(0);

    // Load PDF to get first page
    const typedArray = new Uint8Array(arrayBuffer);
    const pdf = await pdfjsLib.getDocument(typedArray).promise;
    const page = await pdf.getPage(1);

    // Get page viewport
    const viewport = page.getViewport({ scale: 1.0 });
    const aspectRatio = viewport.width / viewport.height;

    // Determine orientation
    const isLandscape = aspectRatio > 1;

    // Create thumbnail wrapper
    const thumbnail = document.createElement('div');
    thumbnail.className = 'pdf-thumbnail';

    // Create thumbnail image container
    const thumbnailImage = document.createElement('div');
    thumbnailImage.className = `pdf-thumbnail-image ${isLandscape ? 'landscape' : 'portrait'}`;

    // Create canvas for PDF thumbnail
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // Set canvas size (half of the upload box size, approximately 200px width for landscape)
    const thumbnailWidth = 200;
    const scale = thumbnailWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale: scale });

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    // Render PDF page to canvas
    await page.render({
        canvasContext: context,
        viewport: scaledViewport
    }).promise;

    // Add canvas to thumbnail image
    thumbnailImage.appendChild(canvas);
    thumbnail.appendChild(thumbnailImage);

    // Add PDF name below thumbnail
    const nameLabel = document.createElement('div');
    nameLabel.className = 'pdf-name';
    nameLabel.textContent = pdfName;
    thumbnail.appendChild(nameLabel);

    // Add click handler to load this PDF
    // Use the persistent buffer cloned at the beginning
    thumbnail.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        loadPDFFromPath(pdfPath, persistentBuffer);
    });

    // Insert before the upload box
    const uploadBox = container.querySelector('.upload-box');
    container.insertBefore(thumbnail, uploadBox);
}

async function loadPDFFromPath(pdfPath, arrayBuffer) {
    try {
        // Store PDF data
        pdfArrayBuffer = arrayBuffer.slice(0);
        const typedArray = new Uint8Array(arrayBuffer);

        pdfDoc = await pdfjsLib.getDocument(typedArray).promise;

        // Switch to drawing screen
        document.body.classList.add('drawing-mode');

        // Wait for layout to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        // Reset page drawings and current page
        currentPage = 1;
        pageDrawings = {};

        // Render PDF page
        await renderPDFPage(1);

        // Initialize drawing canvas after PDF is rendered (only once)
        initializeDrawingCanvas();

        // Sync SVG canvas size with PDF canvas
        resizeSVG();
    } catch (error) {
        console.error('Error loading PDF:', error);
    }
}

// ============================================
// PDF HANDLING
// ============================================

pdfInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;

    const fileReader = new FileReader();
    fileReader.onload = async function() {
        // Create a copy of the ArrayBuffer to prevent detachment
        const originalBuffer = this.result;
        pdfArrayBuffer = originalBuffer.slice(0); // Clone the ArrayBuffer
        const typedArray = new Uint8Array(originalBuffer);

        try {
            pdfDoc = await pdfjsLib.getDocument(typedArray).promise;

            // Switch to drawing screen first
            document.body.classList.add('drawing-mode');

            // Wait for layout to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Reset page drawings and current page
            currentPage = 1;
            pageDrawings = {};

            // Render PDF page
            await renderPDFPage(1);

            // Initialize drawing canvas after PDF is rendered (only once)
            initializeDrawingCanvas();

            // Sync SVG canvas size with PDF canvas
            resizeSVG();
        } catch (error) {
            console.error('Error loading PDF:', error);
        }
    };
    fileReader.readAsArrayBuffer(file);
});

async function renderPDFPage(pageNum) {
    const page = await pdfDoc.getPage(pageNum);

    // Get device pixel ratio for high-DPI displays
    const dpr = window.devicePixelRatio || 1;

    // Get the container dimensions (already excludes header)
    const container = document.getElementById('canvasContainer');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Calculate the maximum 16:9 drawable area that fits in the container
    let drawableWidth, drawableHeight;

    const containerAspect = containerWidth / containerHeight;
    const targetAspect = 16 / 9;

    if (containerAspect > targetAspect) {
        // Container is wider than 16:9, constrain by height
        drawableHeight = containerHeight;
        drawableWidth = drawableHeight * targetAspect;
    } else {
        // Container is taller than 16:9, constrain by width
        drawableWidth = containerWidth;
        drawableHeight = drawableWidth / targetAspect;
    }

    // Get initial viewport
    const initialViewport = page.getViewport({ scale: 1.0 });

    // Calculate scale to fill the entire drawable width
    const scale = (drawableWidth / initialViewport.width) * dpr;

    // Calculate final viewport with DPR scaling
    const viewport = page.getViewport({ scale: scale });

    const context = pdfCanvas.getContext('2d');

    // Set canvas internal size with DPR
    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;

    // Force CSS size to exactly match 16:9 drawable area (this will fill the width completely)
    pdfCanvas.style.width = `${drawableWidth}px`;
    pdfCanvas.style.height = `${drawableHeight}px`;

    // Make sure canvas is visible
    pdfCanvas.style.display = 'block';

    const renderContext = {
        canvasContext: context,
        viewport: viewport
    };

    await page.render(renderContext).promise;

    // Sync SVG after PDF renders
    if (svg) {
        resizeSVG();
    }
}

function initializeDrawingCanvas() {
    // Only initialize once to prevent duplicate event listeners
    if (isDrawingCanvasInitialized) {
        return;
    }
    isDrawingCanvasInitialized = true;

    // Attach drawing event listeners
    attachEventListeners();

    // Re-render PDF on window resize with smooth fade transition
    let resizeTimeout;
    window.addEventListener('resize', async () => {
        if (!pdfDoc || !currentPage) return;

        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(async () => {
            // Fade out
            pdfCanvas.classList.add('fade-out');
            svg.classList.add('fade-out');

            // Wait for fade out animation
            await new Promise(resolve => setTimeout(resolve, 100));

            // Save current drawings before re-render
            saveCurrentPageDrawings();

            // Re-render PDF at new size
            await renderPDFPage(currentPage);

            // Restore drawings after re-render
            restorePageDrawings(currentPage);

            // Fade in
            pdfCanvas.classList.remove('fade-out');
            svg.classList.remove('fade-out');
        }, 300);
    });

    // Tool icons
    const penToolContainer = document.getElementById('penToolContainer');
    const penToolIcon = document.getElementById('penToolIcon');
    const laserIcon = document.getElementById('laserIcon');
    const eraserIcon = document.getElementById('eraserIcon');
    const lassoIcon = document.getElementById('lassoIcon');
    const penModal = document.getElementById('penModal');
    const eraserModal = document.getElementById('eraserModal');

    if (penToolContainer) {
        penToolContainer.addEventListener('pointerdown', (e) => {
            e.preventDefault();

            // If pen is already active, toggle modal
            if (activeTool === 'pen') {
                const isModalOpen = penModal.classList.contains('show');
                penModal.classList.toggle('show');

                if (!isModalOpen) {
                    // Position modal below pen icon
                    const rect = penToolContainer.getBoundingClientRect();
                    penModal.style.left = `${rect.left + rect.width / 2}px`;
                }
            } else {
                // Activate pen tool
                setActiveTool('pen');
            }
        });
    }

    if (laserIcon) {
        laserIcon.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            setActiveTool('laser');
        });
    }
    if (eraserIcon) {
        eraserIcon.addEventListener('pointerdown', (e) => {
            e.preventDefault();

            // If eraser is already active, toggle modal
            if (activeTool === 'eraser') {
                const isModalOpen = eraserModal.classList.contains('show');
                eraserModal.classList.toggle('show');

                if (!isModalOpen) {
                    // Position modal below eraser icon
                    const rect = eraserIcon.getBoundingClientRect();
                    eraserModal.style.left = `${rect.left + rect.width / 2}px`;
                }
            } else {
                // Activate eraser tool
                setActiveTool('eraser');
            }
        });
    }

    if (lassoIcon) {
        lassoIcon.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            setActiveTool('lasso');
        });
    }

    // Clear canvas button
    const clearCanvasBtn = document.getElementById('clearCanvasBtn');
    if (clearCanvasBtn) {
        clearCanvasBtn.addEventListener('click', () => {
            // Save state to history BEFORE clearing canvas
            saveCurrentPageDrawings();
            saveStateToHistory();

            clearCanvas();
            // Clear saved drawings for current page
            delete pageDrawings[currentPage];
            // Re-add eraser indicator and laser pointer
            if (eraserIndicator) {
                svg.appendChild(eraserIndicator);
            }
            if (laserPointer) {
                svg.appendChild(laserPointer);
            }
            // Close the modal
            eraserModal.classList.remove('show');

            // Send clear-canvas to presentation
            if (presentationConnection && presentationConnection.state === 'connected') {
                presentationConnection.send(JSON.stringify({
                    type: 'clear-canvas',
                    page: currentPage
                }));
            }
        });
    }

    // Color picker - single color circle
    const colorCircle = document.querySelector('.color-circle');
    const colorPaletteModal = document.getElementById('colorPaletteModal');

    if (colorCircle) {
        colorCircle.addEventListener('click', (e) => {
            e.stopPropagation();

            // Toggle color palette modal
            const wasPaletteOpen = colorPaletteModal && colorPaletteModal.classList.contains('show');

            if (wasPaletteOpen) {
                colorPaletteModal.classList.remove('show');
            } else {
                // Open color palette modal
                const currentColor = colorCircle.getAttribute('data-color');

                // Remove active-palette class from all palette colors
                const paletteColors = document.querySelectorAll('.palette-color');
                paletteColors.forEach(pc => pc.classList.remove('active-palette'));

                // Add active-palette class to matching color in palette
                paletteColors.forEach(paletteColor => {
                    const paletteColorValue = paletteColor.getAttribute('data-palette-color');
                    // Normalize hex colors for comparison (uppercase)
                    if (paletteColorValue && paletteColorValue.toUpperCase() === currentColor.toUpperCase()) {
                        paletteColor.classList.add('active-palette');
                    }
                });

                // Position palette modal at the color circle position
                const rect = colorCircle.getBoundingClientRect();
                colorPaletteModal.style.left = `${rect.left + (rect.width / 2)}px`;
                colorPaletteModal.style.top = '48px'; // Top aligned with pen modal
                colorPaletteModal.style.transform = 'translateX(-50%)';
                colorPaletteModal.classList.add('show');
            }
        });
    }

    // Color palette click handler for individual color circles
    const paletteColors = document.querySelectorAll('.palette-color');
    paletteColors.forEach(paletteColor => {
        paletteColor.addEventListener('click', (e) => {
            const newColor = paletteColor.getAttribute('data-palette-color');

            if (colorCircle) {
                // Update circle's data-color attribute
                colorCircle.setAttribute('data-color', newColor);
                // Update circle's background color
                colorCircle.style.backgroundColor = newColor;
                // Update current color
                currentColor = newColor;

                // Update active-palette class
                paletteColors.forEach(pc => pc.classList.remove('active-palette'));
                paletteColor.classList.add('active-palette');

                // Close the color palette modal
                colorPaletteModal.classList.remove('show');

                // Change to pen tool when selecting a color
                setActiveTool('pen');
            }
        });
    });

    // Stroke width presets
    const strokePresets = document.querySelectorAll('.stroke-preset');
    const sliderModal = document.getElementById('sliderModal');
    const strokeSlider = document.getElementById('strokeSlider');
    let currentEditingPreset = null;

    strokePresets.forEach(preset => {
        preset.addEventListener('click', (e) => {
            e.stopPropagation();

            // If preset is already active, open slider to edit it
            if (preset.classList.contains('active')) {
                currentEditingPreset = preset;
                const currentWidth = parseFloat(preset.getAttribute('data-width'));

                // Set slider value to match the preset's current stroke width
                if (strokeSlider) {
                    strokeSlider.value = currentWidth;
                    // Force browser to update slider position
                    strokeSlider.setAttribute('value', currentWidth);
                }

                // Position slider modal at the same position as the second preset circle (middle one)
                const secondPreset = strokePresets[1]; // Get the second preset (index 1)
                const rect = secondPreset.getBoundingClientRect();
                const modalWidth = 200; // min-width from CSS (same as pen modal)
                sliderModal.style.left = `${rect.left + (rect.width / 2) - (modalWidth / 2)}px`;
                sliderModal.style.top = `${rect.bottom + 5}px`;
                sliderModal.classList.add('show');
            } else {
                // Close slider modal if it's open
                if (sliderModal && sliderModal.classList.contains('show')) {
                    sliderModal.classList.remove('show');
                    currentEditingPreset = null;
                }

                // Activate the new preset
                strokePresets.forEach(p => p.classList.remove('active'));
                preset.classList.add('active');
                currentStrokeWidth = parseFloat(preset.getAttribute('data-width'));
            }
        });
    });

    // Slider change handler
    if (strokeSlider) {
        strokeSlider.addEventListener('input', (e) => {
            const newWidth = parseFloat(e.target.value);

            if (currentEditingPreset) {
                // Update preset's data-width attribute
                currentEditingPreset.setAttribute('data-width', newWidth);

                // Update the dot size (visual representation)
                const dot = currentEditingPreset.querySelector('.stroke-dot');
                if (dot) {
                    const dotSize = newWidth * 2; // Dot is 2x the stroke width
                    dot.style.width = dotSize + 'px';
                    dot.style.height = dotSize + 'px';
                }

                // Update current stroke width if this is the active preset
                currentStrokeWidth = newWidth;
            }
        });
    };

    // Close modals when clicking/touching outside
    const handleOutsideClick = (e) => {
        const clickedInSliderModal = sliderModal && sliderModal.contains(e.target);
        const clickedInPenModal = penModal && penModal.contains(e.target);
        const clickedOnPenTool = penToolContainer && penToolContainer.contains(e.target);
        const clickedInEraserModal = eraserModal && eraserModal.contains(e.target);
        const clickedOnEraserTool = eraserIcon && eraserIcon.contains(e.target);
        const clickedInColorPaletteModal = colorPaletteModal && colorPaletteModal.contains(e.target);
        const clickedOnColorCircle = colorCircle && colorCircle.contains(e.target);

        // Close pen modal (preset circles modal) if clicking outside
        if (penModal && penModal.classList.contains('show')) {
            if (!clickedInPenModal && !clickedOnPenTool && !clickedInSliderModal) {
                penModal.classList.remove('show');
                // Also close slider modal if it's open
                if (sliderModal && sliderModal.classList.contains('show')) {
                    sliderModal.classList.remove('show');
                    currentEditingPreset = null;
                }
            }
        }

        // Close eraser modal if clicking outside
        if (eraserModal && eraserModal.classList.contains('show')) {
            if (!clickedInEraserModal && !clickedOnEraserTool) {
                eraserModal.classList.remove('show');
            }
        }

        // Close slider modal only if clicking outside of it (but not inside pen modal or on presets)
        // The slider modal should NOT close when clicking inside the slider itself
        if (sliderModal && sliderModal.classList.contains('show')) {
            // Don't close if clicking inside the slider modal itself
            if (clickedInSliderModal) {
                return;
            }

            // Don't close if clicking on a preset circle (handled by preset click handler)
            const clickedOnPreset = Array.from(strokePresets).some(preset => preset.contains(e.target));
            if (clickedOnPreset) {
                return;
            }

            // Close if clicking outside both modals
            if (!clickedInPenModal) {
                sliderModal.classList.remove('show');
                currentEditingPreset = null;
            }
        }

        // Close color palette modal if clicking outside
        if (colorPaletteModal && colorPaletteModal.classList.contains('show')) {
            // Don't close if clicking inside the modal itself
            if (clickedInColorPaletteModal) {
                return;
            }

            // Don't close if clicking on a color circle (handled by circle click handler)
            if (clickedOnColorCircle) {
                return;
            }

            // Close if clicking outside
            colorPaletteModal.classList.remove('show');
        }
    };

    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);

    // Library icon - open PDF library
    const homeIcon = document.getElementById('homeIcon');
    if (homeIcon) {
        homeIcon.addEventListener('click', openLibrary);
    }

    // Fullscreen icon toggle
    const maximizeIcon = document.getElementById('maximizeIcon');
    if (maximizeIcon) {
        maximizeIcon.addEventListener('click', toggleFullscreen);

        // Update icon when fullscreen state changes
        document.addEventListener('fullscreenchange', updateFullscreenIcon);
        document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
        document.addEventListener('mozfullscreenchange', updateFullscreenIcon);
        document.addEventListener('MSFullscreenChange', updateFullscreenIcon);
    }

    // Create eraser indicator (initially hidden)
    eraserIndicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    eraserIndicator.setAttribute('r', '20');
    eraserIndicator.setAttribute('fill', 'none');
    eraserIndicator.setAttribute('stroke', '#000000');
    eraserIndicator.setAttribute('stroke-width', '2.5');
    eraserIndicator.setAttribute('stroke-dasharray', '6 4');
    eraserIndicator.setAttribute('opacity', '0.7');
    eraserIndicator.setAttribute('pointer-events', 'none');
    eraserIndicator.style.display = 'none';
    svg.appendChild(eraserIndicator);

    // Create laser glow filter
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'laserGlow');

    const feGaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    feGaussianBlur.setAttribute('stdDeviation', '2');
    feGaussianBlur.setAttribute('result', 'coloredBlur');

    const feMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    const feMergeNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    feMergeNode1.setAttribute('in', 'coloredBlur');
    const feMergeNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    feMergeNode2.setAttribute('in', 'SourceGraphic');

    feMerge.appendChild(feMergeNode1);
    feMerge.appendChild(feMergeNode2);
    filter.appendChild(feGaussianBlur);
    filter.appendChild(feMerge);
    defs.appendChild(filter);
    svg.appendChild(defs);

    // Create laser pointer indicator (initially hidden)
    laserPointer = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    laserPointer.setAttribute('r', '5');
    laserPointer.setAttribute('fill', '#ff0000');
    laserPointer.setAttribute('opacity', '0.8');
    laserPointer.setAttribute('pointer-events', 'none');
    laserPointer.style.display = 'none';
    svg.appendChild(laserPointer);

    // Set initial active tool
    setActiveTool('pen');

    // Page navigation
    const prevPageIcon = document.getElementById('prevPageIcon');
    const nextPageIcon = document.getElementById('nextPageIcon');
    const pageNumberDisplay = document.getElementById('pageNumber');

    if (prevPageIcon) {
        prevPageIcon.addEventListener('click', () => navigatePage('prev'));
    }
    if (nextPageIcon) {
        nextPageIcon.addEventListener('click', () => navigatePage('next'));
    }

    // Update page number display
    updatePageNavigation();

    // Presentation icon
    const presentationIcon = document.getElementById('presentationIcon');
    if (presentationIcon && !isPresentationReceiver) {
        presentationIcon.addEventListener('click', startPresentation);
    }

    // Undo/Redo icons
    const undoIcon = document.getElementById('undoIcon');
    const redoIcon = document.getElementById('redoIcon');
    if (undoIcon) {
        undoIcon.addEventListener('click', undo);
    }
    if (redoIcon) {
        redoIcon.addEventListener('click', redo);
    }

    // Update undo/redo button states
    updateUndoRedoButtons();
}

function toggleFullscreen() {
    if (!document.fullscreenElement &&
        !document.webkitFullscreenElement &&
        !document.mozFullScreenElement &&
        !document.msFullscreenElement) {
        // Enter fullscreen
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        } else if (document.documentElement.mozRequestFullScreen) {
            document.documentElement.mozRequestFullScreen();
        } else if (document.documentElement.msRequestFullscreen) {
            document.documentElement.msRequestFullscreen();
        }
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
}

async function updateFullscreenIcon() {
    const maximizeIcon = document.getElementById('maximizeIcon');
    if (!maximizeIcon) return;

    const isFullscreen = document.fullscreenElement ||
                        document.webkitFullscreenElement ||
                        document.mozFullScreenElement ||
                        document.msFullscreenElement;

    if (isFullscreen) {
        maximizeIcon.src = 'icons/minimize-2.svg';
        maximizeIcon.alt = 'Exit Fullscreen';
    } else {
        maximizeIcon.src = 'icons/maximize-2.svg';
        maximizeIcon.alt = 'Enter Fullscreen';
    }

    // Re-render PDF when changing fullscreen state
    if (pdfDoc && currentPage) {
        // Small delay to let the browser finish the fullscreen transition
        await new Promise(resolve => setTimeout(resolve, 100));

        // Save current drawings
        saveCurrentPageDrawings();

        // Re-render PDF at new size
        await renderPDFPage(currentPage);

        // Restore drawings
        restorePageDrawings(currentPage);
    }
}

function setActiveTool(tool) {
    activeTool = tool;

    // OPTIMIZATION #2: Set active tool via data attribute on parent
    const headerCenter = document.getElementById('headerCenter');
    if (headerCenter) {
        headerCenter.setAttribute('data-active-tool', tool);
    }

    // Close modals when switching tools
    const penModal = document.getElementById('penModal');
    const eraserModal = document.getElementById('eraserModal');
    if (penModal) penModal.classList.remove('show');
    if (eraserModal) eraserModal.classList.remove('show');

    // Clear selection when switching away from lasso
    if (tool !== 'lasso' && selectionRect) {
        clearSelection();
    }

    // OPTIMIZATION #7: Cursor is now controlled by CSS via data-active-tool attribute
}

function openLibrary() {
    // Exit fullscreen if active
    if (document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement) {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }

    // Switch to home screen (library view)
    document.body.classList.remove('drawing-mode');

    // Close any open modals
    const penModal = document.getElementById('penModal');
    const eraserModal = document.getElementById('eraserModal');
    const colorPaletteModal = document.getElementById('colorPaletteModal');
    if (penModal) penModal.classList.remove('show');
    if (eraserModal) eraserModal.classList.remove('show');
    if (colorPaletteModal) colorPaletteModal.classList.remove('show');
}

async function navigatePage(direction) {
    if (!pdfDoc || isPageChanging) return;

    const newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;

    // Check bounds
    if (newPage < 1 || newPage > pdfDoc.numPages) return;

    isPageChanging = true;

    // Fade out
    pdfCanvas.classList.add('fade-out');
    svg.classList.add('fade-out');

    // Wait for fade out animation
    await new Promise(resolve => setTimeout(resolve, 150));

    // Save current page drawings
    saveCurrentPageDrawings();

    // Change page
    currentPage = newPage;
    await renderPDFPage(currentPage);

    // Restore new page drawings
    restorePageDrawings(currentPage);

    // Update page navigation UI
    updatePageNavigation();

    // Update undo/redo buttons for new page
    updateUndoRedoButtons();

    // Fade in
    pdfCanvas.classList.remove('fade-out');
    svg.classList.remove('fade-out');

    isPageChanging = false;
}

function updatePageNavigation() {
    const pageNumberDisplay = document.getElementById('pageNumber');
    const prevPageIcon = document.getElementById('prevPageIcon');
    const nextPageIcon = document.getElementById('nextPageIcon');
    const prevPageContainer = document.getElementById('prevPageContainer');
    const nextPageContainer = document.getElementById('nextPageContainer');
    const pageNav = document.getElementById('pageNavigation');

    // If no PDF loaded (blank canvas mode), disable navigation and hide page number
    if (!pdfDoc) {
        if (pageNumberDisplay) {
            pageNumberDisplay.textContent = '';
        }
        if (pageNav) {
            pageNav.setAttribute('data-can-prev', 'false');
            pageNav.setAttribute('data-can-next', 'false');
        }
        return;
    }

    // Update page number display
    if (pageNumberDisplay) {
        pageNumberDisplay.textContent = currentPage;
    }

    // OPTIMIZATION #5: Enable/disable navigation via data attributes
    if (pageNav) {
        pageNav.setAttribute('data-can-prev', currentPage > 1 ? 'true' : 'false');
        pageNav.setAttribute('data-can-next', currentPage < pdfDoc.numPages ? 'true' : 'false');
    }

    // Send page update to presentation display if connected
    if (presentationConnection && presentationConnection.state === 'connected') {
        presentationConnection.send(JSON.stringify({
            type: 'page-change',
            page: currentPage,
            drawings: pageDrawings // Send updated drawings
        }));
    }
}

// ============================================
// PRESENTATION FUNCTIONS
// ============================================

function startPresentation() {
    // If presentation is already active, close it
    if (presentationConnection) {
        console.log('Closing presentation');
        presentationConnection.terminate();
        presentationConnection = null;
        return;
    }

    // Check if Presentation API is supported
    if (!window.PresentationRequest) {
        showAlert('Presentation API is not supported in this browser. Try using Chrome or Edge.');
        return;
    }

    // Save current page drawings before starting presentation
    saveCurrentPageDrawings();
    console.log('Drawings saved before presentation:', JSON.stringify(pageDrawings).length, 'characters');

    // Create presentation request with receiver URL
    const presentationUrl = window.location.href.split('#')[0] + '#receiver';
    const presentationRequest = new PresentationRequest([presentationUrl]);

    // Start the presentation
    presentationRequest.start()
        .then(connection => {
            presentationConnection = connection;
            console.log('Presentation started successfully, state:', connection.state);

            // Listen for ready signal from receiver
            connection.addEventListener('message', (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log('Controller received message:', message.type);

                    if (message.type === 'receiver-ready') {
                        console.log('Receiver is ready, sending data');

                        if (pdfDoc && pdfArrayBuffer) {
                            // Send PDF data if available
                            const base64 = arrayBufferToBase64(pdfArrayBuffer);

                            connection.send(JSON.stringify({
                                type: 'load-pdf',
                                pdfData: base64,
                                page: currentPage,
                                drawings: pageDrawings // Send all page drawings
                            }));
                            console.log('Sent PDF data to receiver');
                        } else {
                            // Send blank canvas state
                            connection.send(JSON.stringify({
                                type: 'load-blank-canvas',
                                drawings: pageDrawings,
                                canvasWidth: pdfCanvas.width,
                                canvasHeight: pdfCanvas.height
                            }));
                            console.log('Sent blank canvas data to receiver');
                        }
                    }
                } catch (error) {
                    console.error('Error handling controller message:', error);
                }
            });

            // Listen for connection state changes
            connection.addEventListener('close', () => {
                console.log('Presentation closed');
                presentationConnection = null;
            });

            connection.addEventListener('terminate', () => {
                console.log('Presentation terminated');
                presentationConnection = null;
            });
        })
        .catch(error => {
            console.error('Error starting presentation:', error);
            if (error.name === 'NotAllowedError') {
                showAlert('Presentation request was denied. Please try again.');
            } else if (error.name === 'NotFoundError') {
                showAlert('No available presentation displays found.');
            } else {
                showAlert('Failed to start presentation: ' + error.message);
            }
        });
}

async function loadBlankCanvasForPresentation(canvasWidth, canvasHeight, drawings) {
    console.log('Loading blank canvas for presentation');

    // No PDF in blank canvas mode
    pdfDoc = null;
    currentPage = 1;

    // Set up canvas dimensions
    pdfCanvas.width = canvasWidth;
    pdfCanvas.height = canvasHeight;

    // Calculate display size to maintain aspect ratio
    const container = document.getElementById('canvasContainer');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const canvasAspect = canvasWidth / canvasHeight;
    const containerAspect = containerWidth / containerHeight;

    let displayWidth, displayHeight;
    if (containerAspect > canvasAspect) {
        displayHeight = containerHeight;
        displayWidth = displayHeight * canvasAspect;
    } else {
        displayWidth = containerWidth;
        displayHeight = displayWidth / canvasAspect;
    }

    pdfCanvas.style.width = `${displayWidth}px`;
    pdfCanvas.style.height = `${displayHeight}px`;

    // Fill with white background
    const ctx = pdfCanvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Set up SVG canvas
    resizeSVG();

    // Restore drawings if provided
    if (drawings) {
        pageDrawings = drawings;
        restorePageDrawings(currentPage);
    }

    // Initialize drawing canvas
    initializeDrawingCanvas();
}

async function loadPDFFromBase64(base64Data, pageNum, drawings) {
    console.log('Loading PDF from base64, length:', base64Data.length);

    // Convert base64 back to ArrayBuffer
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    try {
        pdfDoc = await pdfjsLib.getDocument(bytes).promise;
        console.log('PDF loaded, pages:', pdfDoc.numPages);

        // Store drawings if provided
        if (drawings) {
            pageDrawings = drawings;
            console.log('Drawings loaded for pages:', Object.keys(drawings));
        }

        // Show drawing screen, hide home screen
        document.body.classList.add('drawing-mode');

        // Wait for layout
        await new Promise(resolve => setTimeout(resolve, 100));

        // Render the PDF
        currentPage = pageNum || 1;
        await renderPDFPage(currentPage);

        // Initialize drawing canvas if not already initialized
        if (!svg.hasChildNodes() || svg.childElementCount === 0) {
            initializeDrawingCanvas();
        }

        // Sync SVG size
        resizeSVG();

        // Restore drawings for current page
        console.log('About to restore drawings, currentViewBoxWidth:', currentViewBoxWidth);
        restorePageDrawings(currentPage);

        console.log('PDF displayed in receiver with drawings');
        console.log('SVG element children count:', svg.childElementCount);
    } catch (error) {
        console.error('Error loading PDF in receiver:', error);
    }
}

function setupPresentationReceiver() {
    console.log('Setting up presentation receiver');

    // Hide header for clean presentation view
    const header = document.getElementById('header');
    if (header) {
        header.style.display = 'none';
    }

    // Set background to black for presentation mode
    document.body.style.background = '#000000';

    // Enter fullscreen automatically
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log('Fullscreen request failed:', err);
        });
    }

    // Wait for presentation connection
    if (navigator.presentation && navigator.presentation.receiver) {
        console.log('Presentation receiver API available');
        navigator.presentation.receiver.connectionList.then(list => {
            console.log('Connection list ready, connections:', list.connections.length);

            // Handle existing connections
            list.connections.forEach(connection => {
                console.log('Existing receiver connection found');
                setupConnectionHandlers(connection);
            });

            // Handle new connections
            list.addEventListener('connectionavailable', event => {
                console.log('New connection available');
                setupConnectionHandlers(event.connection);
            });
        }).catch(err => {
            console.error('Error getting connection list:', err);
        });
    } else {
        console.error('Presentation receiver API not available');
    }
}

function setupConnectionHandlers(connection) {
    console.log('Setting up connection handlers');

    connection.addEventListener('message', async (event) => {
        console.log('Message received, data:', event.data.substring(0, 100) + '...');

        try {
            const message = JSON.parse(event.data);
            console.log('Parsed message type:', message.type);

            if (message.type === 'load-pdf') {
                console.log('Loading PDF, data length:', message.pdfData.length);
                await loadPDFFromBase64(message.pdfData, message.page, message.drawings);
            } else if (message.type === 'load-blank-canvas') {
                console.log('Loading blank canvas');
                await loadBlankCanvasForPresentation(message.canvasWidth, message.canvasHeight, message.drawings);
            } else if (message.type === 'page-change') {
                console.log('Changing to page:', message.page);

                // Update drawings if provided
                if (message.drawings) {
                    pageDrawings = message.drawings;
                }

                if (pdfDoc && message.page !== currentPage) {
                    // Fade out
                    pdfCanvas.classList.add('fade-out');
                    svg.classList.add('fade-out');

                    // Wait for fade out animation
                    await new Promise(resolve => setTimeout(resolve, 100));

                    currentPage = message.page;
                    await renderPDFPage(currentPage);
                    restorePageDrawings(currentPage);

                    // Fade in
                    pdfCanvas.classList.remove('fade-out');
                    svg.classList.remove('fade-out');
                }
            } else if (message.type === 'stroke-start') {
                // Start a new stroke on receiver
                handleReceiverStrokeStart(message);
            } else if (message.type === 'stroke-update') {
                // Update the stroke on receiver
                handleReceiverStrokeUpdate(message);
            } else if (message.type === 'stroke-end') {
                // Finalize the stroke on receiver
                handleReceiverStrokeEnd(message);
            } else if (message.type === 'stroke-erase') {
                // Remove the stroke on receiver
                handleReceiverStrokeErase(message);
            } else if (message.type === 'laser-start') {
                // Start laser stroke on receiver
                handleReceiverLaserStart(message);
            } else if (message.type === 'laser-update') {
                // Update laser stroke on receiver
                handleReceiverLaserUpdate(message);
            } else if (message.type === 'laser-end') {
                // End laser stroke on receiver
                handleReceiverLaserEnd(message);
            } else if (message.type === 'selection-update') {
                // Update drawings after selection/move/scale
                handleReceiverSelectionUpdate(message);
            } else if (message.type === 'clear-canvas') {
                // Clear canvas on receiver
                handleReceiverClearCanvas(message);
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });

    // Send ready signal to controller
    console.log('Sending ready signal to controller');
    connection.send(JSON.stringify({ type: 'receiver-ready' }));
}

// Set up receiver immediately if this is a receiver page
if (isPresentationReceiver) {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupPresentationReceiver);
    } else {
        setupPresentationReceiver();
    }
}

// Real-time stroke handlers for receiver
let receiverStrokes = {}; // Store strokes being drawn in real-time

function handleReceiverStrokeStart(message) {
    const { strokeId, color, width, point } = message;

    // Denormalize coordinates to receiver's viewBox space
    const actualPoint = {
        x: point.x * currentViewBoxWidth,
        y: point.y * currentViewBoxHeight
    };

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', width);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path._strokeId = strokeId;
    path._strokePoints = [];

    svg.appendChild(path);

    // Store stroke data
    receiverStrokes[strokeId] = {
        path: path,
        points: [actualPoint]
    };

    // Draw initial point
    const pathData = `M ${actualPoint.x} ${actualPoint.y}`;
    path.setAttribute('d', pathData);
}

function handleReceiverStrokeUpdate(message) {
    const { strokeId, point } = message;
    const stroke = receiverStrokes[strokeId];

    if (!stroke) return;

    // Denormalize coordinates to receiver's viewBox space
    const actualPoint = {
        x: point.x * currentViewBoxWidth,
        y: point.y * currentViewBoxHeight
    };

    stroke.points.push(actualPoint);

    // Store point for eraser
    if (stroke.path._strokePoints) {
        stroke.path._strokePoints.push(actualPoint);
    }

    // Update path
    const pathData = pointsToPath(stroke.points);
    stroke.path.setAttribute('d', pathData);
}

function handleReceiverStrokeEnd(message) {
    const { strokeId } = message;
    const stroke = receiverStrokes[strokeId];

    if (!stroke) return;

    // Stroke is complete, can be removed from active strokes
    delete receiverStrokes[strokeId];
}

function handleReceiverStrokeErase(message) {
    const { strokeId } = message;

    // Find and remove the stroke
    const paths = svg.querySelectorAll('path');
    paths.forEach(path => {
        if (path._strokeId === strokeId) {
            path.remove();
        }
    });

    // Also remove from active strokes if still there
    delete receiverStrokes[strokeId];
}

// Laser stroke handlers for receiver
let receiverLaserStrokes = [];
let receiverLaserTimeout = null;

function handleReceiverLaserStart(message) {
    const { strokeId, point } = message;

    // Denormalize coordinates
    const actualPoint = {
        x: point.x * currentViewBoxWidth,
        y: point.y * currentViewBoxHeight
    };

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#ff0000');
    path.setAttribute('stroke-width', '8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('opacity', '1');
    path.setAttribute('filter', 'url(#laserGlow)');
    path.classList.add('laser-stroke');
    path._strokeId = strokeId;

    // Create white inner stroke
    const innerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    innerPath.setAttribute('fill', 'none');
    innerPath.setAttribute('stroke', '#ffffff');
    innerPath.setAttribute('stroke-width', '3');
    innerPath.setAttribute('stroke-linecap', 'round');
    innerPath.setAttribute('stroke-linejoin', 'round');
    innerPath.setAttribute('opacity', '1');
    innerPath.setAttribute('pointer-events', 'none');
    innerPath.classList.add('laser-stroke');
    innerPath.classList.add('laser-inner');
    path._innerPath = innerPath;

    svg.appendChild(path);
    svg.appendChild(innerPath);

    // Store laser stroke data
    receiverStrokes[strokeId] = {
        path: path,
        points: [actualPoint]
    };

    // Draw initial point
    const pathData = `M ${actualPoint.x} ${actualPoint.y}`;
    path.setAttribute('d', pathData);

    // Clear any existing fade timeout
    if (receiverLaserTimeout) {
        clearTimeout(receiverLaserTimeout);
        receiverLaserTimeout = null;
    }
}

function handleReceiverLaserUpdate(message) {
    const { strokeId, point } = message;
    const stroke = receiverStrokes[strokeId];

    if (!stroke) return;

    // Denormalize coordinates
    const actualPoint = {
        x: point.x * currentViewBoxWidth,
        y: point.y * currentViewBoxHeight
    };

    stroke.points.push(actualPoint);

    // Update path
    const pathData = pointsToPath(stroke.points);
    stroke.path.setAttribute('d', pathData);

    // Update inner path
    if (stroke.path._innerPath) {
        stroke.path._innerPath.setAttribute('d', pathData);
    }
}

function handleReceiverLaserEnd(message) {
    const { strokeId } = message;
    const stroke = receiverStrokes[strokeId];

    if (!stroke) return;

    // Add to laser strokes array for fading
    receiverLaserStrokes.push(stroke.path);

    // Remove from active strokes
    delete receiverStrokes[strokeId];

    // Clear existing timeout
    if (receiverLaserTimeout) {
        clearTimeout(receiverLaserTimeout);
    }

    // Fade all laser strokes after 1 second
    receiverLaserTimeout = setTimeout(() => {
        receiverLaserStrokes.forEach(laserPath => {
            laserPath.classList.add('fade-out');

            // Fade inner path too
            if (laserPath._innerPath) {
                laserPath._innerPath.classList.add('fade-out');
            }

            setTimeout(() => {
                if (laserPath.parentNode) {
                    laserPath.remove();
                }
                if (laserPath._innerPath && laserPath._innerPath.parentNode) {
                    laserPath._innerPath.remove();
                }
            }, 500);
        });

        receiverLaserStrokes = [];
        receiverLaserTimeout = null;
    }, 1000);
}

function handleReceiverSelectionUpdate(message) {
    const { page, drawings } = message;

    // Update drawings data
    if (drawings) {
        pageDrawings = drawings;
    }

    // Re-render current page if it matches
    if (page === currentPage) {
        restorePageDrawings(currentPage);
    }
}

function handleReceiverClearCanvas(message) {
    const { page } = message;

    // Clear drawings for the specified page
    delete pageDrawings[page];

    // If it's the current page, clear the canvas
    if (page === currentPage) {
        clearCanvas();

        // Re-add eraser indicator and laser pointer
        if (eraserIndicator) {
            svg.appendChild(eraserIndicator);
        }
        if (laserPointer) {
            svg.appendChild(laserPointer);
        }
    }
}

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// ============================================
// UNDO/REDO FUNCTIONS
// ============================================

function saveStateToHistory() {
    // Initialize history arrays for current page if they don't exist
    if (!undoHistory[currentPage]) {
        undoHistory[currentPage] = [];
    }

    // Save current state to undo history
    const currentState = JSON.parse(JSON.stringify(pageDrawings[currentPage] || { paths: [], viewBoxWidth: currentViewBoxWidth, viewBoxHeight: currentViewBoxHeight }));
    undoHistory[currentPage].push(currentState);

    // Limit history size
    if (undoHistory[currentPage].length > MAX_HISTORY) {
        undoHistory[currentPage].shift();
    }

    // Clear redo history when a new action is performed
    redoHistory[currentPage] = [];

    updateUndoRedoButtons();
}

function undo() {
    if (!undoHistory[currentPage] || undoHistory[currentPage].length === 0) {
        return;
    }

    // Initialize redo history for current page if it doesn't exist
    if (!redoHistory[currentPage]) {
        redoHistory[currentPage] = [];
    }

    // Save current state to redo history
    // First sync current SVG state to pageDrawings
    saveCurrentPageDrawings();
    const currentState = JSON.parse(JSON.stringify(pageDrawings[currentPage] || { paths: [], viewBoxWidth: currentViewBoxWidth, viewBoxHeight: currentViewBoxHeight }));
    redoHistory[currentPage].push(currentState);

    // Pop from undo history and restore
    const previousState = undoHistory[currentPage].pop();
    pageDrawings[currentPage] = JSON.parse(JSON.stringify(previousState));

    // Restore the previous state to canvas
    restorePageDrawings(currentPage);

    // Update button states
    updateUndoRedoButtons();

    // Send update to presentation if connected
    if (presentationConnection && presentationConnection.state === 'connected') {
        presentationConnection.send(JSON.stringify({
            type: 'selection-update',
            page: currentPage,
            drawings: pageDrawings
        }));
    }
}

function redo() {
    if (!redoHistory[currentPage] || redoHistory[currentPage].length === 0) {
        return;
    }

    // Save current state to undo history
    // First sync current SVG state to pageDrawings
    saveCurrentPageDrawings();
    const currentState = JSON.parse(JSON.stringify(pageDrawings[currentPage] || { paths: [], viewBoxWidth: currentViewBoxWidth, viewBoxHeight: currentViewBoxHeight }));

    if (!undoHistory[currentPage]) {
        undoHistory[currentPage] = [];
    }
    undoHistory[currentPage].push(currentState);

    // Pop from redo history and restore
    const nextState = redoHistory[currentPage].pop();
    pageDrawings[currentPage] = JSON.parse(JSON.stringify(nextState));

    // Restore the next state to canvas
    restorePageDrawings(currentPage);

    // Update button states
    updateUndoRedoButtons();

    // Send update to presentation if connected
    if (presentationConnection && presentationConnection.state === 'connected') {
        presentationConnection.send(JSON.stringify({
            type: 'selection-update',
            page: currentPage,
            drawings: pageDrawings
        }));
    }
}

function updateUndoRedoButtons() {
    // OPTIMIZATION #6: Update undo/redo states via data attributes
    const undoRedoContainer = document.getElementById('undoRedoContainer');

    if (!undoRedoContainer) return;

    const canUndo = undoHistory[currentPage] && undoHistory[currentPage].length > 0;
    const canRedo = redoHistory[currentPage] && redoHistory[currentPage].length > 0;

    undoRedoContainer.setAttribute('data-can-undo', canUndo ? 'true' : 'false');
    undoRedoContainer.setAttribute('data-can-redo', canRedo ? 'true' : 'false');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getCoordinates(e) {
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    // Get coordinates relative to SVG element
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Get current viewBox dimensions
    const viewBox = svg.viewBox.baseVal;
    const viewBoxWidth = viewBox.width;
    const viewBoxHeight = viewBox.height;

    // Scale from screen coordinates to viewBox coordinates
    const scaleX = viewBoxWidth / rect.width;
    const scaleY = viewBoxHeight / rect.height;

    return {
        x: x * scaleX,
        y: y * scaleY
    };
}

function pointsToPath(pts) {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

    // Start at first point
    let pathData = `M ${pts[0].x} ${pts[0].y}`;

    // Use quadratic curves with midpoints
    for (let i = 1; i < pts.length - 1; i++) {
        const xMid = (pts[i].x + pts[i + 1].x) / 2;
        const yMid = (pts[i].y + pts[i + 1].y) / 2;

        // Quadratic curve: control point at current point, end at midpoint to next
        pathData += ` Q ${pts[i].x} ${pts[i].y}, ${xMid} ${yMid}`;
    }

    // Draw final segment to last point
    const lastIdx = pts.length - 1;
    pathData += ` Q ${pts[lastIdx].x} ${pts[lastIdx].y}, ${pts[lastIdx].x} ${pts[lastIdx].y}`;

    return pathData;
}

// ============================================
// DRAWING FUNCTIONS
// ============================================

function startDrawing(e) {
    // Ignore finger/touch input, only allow pen and mouse
    if (e.pointerType === 'touch') {
        return;
    }

    // If clicking outside selection when lasso is active, clear selection
    if (activeTool === 'lasso' && selectionRect) {
        const target = e.target;
        if (target !== selectionRect && !target.classList.contains('selection-rect')) {
            clearSelection();
            return;
        }
    }

    // Check if eraser button (top of pen) is being used
    if (e.button === 5 || e.buttons === 32) {
        // Save state to history BEFORE starting to erase
        if (!isErasing) {
            saveCurrentPageDrawings();
            saveStateToHistory();
        }
        isErasing = true;
        eraserIndicator.style.display = 'block';
        erase(e);
        e.preventDefault();
        return;
    }

    // Handle tool modes
    if (activeTool === 'laser') {
        // Laser mode - draw a stroke that will fade
        isLasering = true;
        points = [];

        const coords = getCoordinates(e);
        points.push(coords);

        currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        currentPath.setAttribute('fill', 'none');
        currentPath.setAttribute('stroke', '#ff0000');
        currentPath.setAttribute('stroke-width', '8');
        currentPath.setAttribute('stroke-linecap', 'round');
        currentPath.setAttribute('stroke-linejoin', 'round');
        currentPath.setAttribute('opacity', '1');
        currentPath.setAttribute('filter', 'url(#laserGlow)');
        currentPath.classList.add('laser-stroke');

        // Create white inner stroke
        const innerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        innerPath.setAttribute('fill', 'none');
        innerPath.setAttribute('stroke', '#ffffff');
        innerPath.setAttribute('stroke-width', '3');
        innerPath.setAttribute('stroke-linecap', 'round');
        innerPath.setAttribute('stroke-linejoin', 'round');
        innerPath.setAttribute('opacity', '1');
        innerPath.setAttribute('pointer-events', 'none');
        innerPath.classList.add('laser-stroke');
        innerPath.classList.add('laser-inner');
        currentPath._innerPath = innerPath;

        // Generate unique ID for laser stroke
        currentPath._strokeId = Date.now() + '_' + Math.random();

        svg.appendChild(currentPath);
        svg.appendChild(innerPath);

        // Clear any existing fade timeout
        if (laserFadeTimeout) {
            clearTimeout(laserFadeTimeout);
            laserFadeTimeout = null;
        }

        // Send laser-start to presentation
        if (presentationConnection && presentationConnection.state === 'connected') {
            const normalizedPoint = {
                x: coords.x / currentViewBoxWidth,
                y: coords.y / currentViewBoxHeight
            };

            presentationConnection.send(JSON.stringify({
                type: 'laser-start',
                strokeId: currentPath._strokeId,
                point: normalizedPoint
            }));
        }

        e.preventDefault();
        return;
    } else if (activeTool === 'eraser') {
        // Activate eraser mode
        // Save state to history BEFORE starting to erase
        if (!isErasing) {
            saveCurrentPageDrawings();
            saveStateToHistory();
        }
        isErasing = true;
        eraserIndicator.style.display = 'block';
        erase(e);
        e.preventDefault();
        return;
    } else if (activeTool === 'lasso') {
        // Lasso mode - draw a dashed selection line
        isLassoing = true;
        points = [];

        const coords = getCoordinates(e);
        points.push(coords);

        currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        currentPath.setAttribute('fill', 'none');
        currentPath.setAttribute('stroke', '#0066ff');
        currentPath.setAttribute('stroke-width', '2');
        currentPath.setAttribute('stroke-dasharray', '5,5');
        currentPath.setAttribute('stroke-linecap', 'round');
        currentPath.setAttribute('stroke-linejoin', 'round');

        svg.appendChild(currentPath);

        e.preventDefault();
        return;
    }

    // Pen mode - default drawing behavior
    isDrawing = true;
    points = [];

    // Save state to history BEFORE starting new stroke
    // First sync current SVG state to pageDrawings
    saveCurrentPageDrawings();
    // Then save that state to history
    saveStateToHistory();

    const coords = getCoordinates(e);
    points.push(coords);

    currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    currentPath.setAttribute('fill', 'none');
    currentPath.setAttribute('stroke', currentColor);
    currentPath.setAttribute('stroke-width', currentStrokeWidth);
    currentPath.setAttribute('stroke-linecap', 'round');
    currentPath.setAttribute('stroke-linejoin', 'round');

    // Store points for fast eraser collision detection
    currentPath._strokePoints = [];

    // Generate unique ID for this stroke
    currentPath._strokeId = Date.now() + '_' + Math.random();

    svg.appendChild(currentPath);

    // Send stroke-start to presentation
    if (presentationConnection && presentationConnection.state === 'connected') {
        // Normalize coordinates (0-1 range) for cross-resolution compatibility
        const normalizedPoint = {
            x: coords.x / currentViewBoxWidth,
            y: coords.y / currentViewBoxHeight
        };

        presentationConnection.send(JSON.stringify({
            type: 'stroke-start',
            strokeId: currentPath._strokeId,
            color: currentColor,
            width: currentStrokeWidth,
            point: normalizedPoint
        }));
    }

    e.preventDefault();
}

function draw(e) {
    // Ignore finger/touch input, only allow pen and mouse
    if (e.pointerType === 'touch') {
        return;
    }

    e.preventDefault();

    // Handle erasing
    if (isErasing) {
        erase(e);
        return;
    }

    // Handle laser drawing
    if (isLasering) {
        const coords = getCoordinates(e);
        points.push(coords);

        const pathData = pointsToPath(points);
        currentPath.setAttribute('d', pathData);

        // Update inner path
        if (currentPath._innerPath) {
            currentPath._innerPath.setAttribute('d', pathData);
        }

        // Send laser-update to presentation
        if (presentationConnection && presentationConnection.state === 'connected' && currentPath._strokeId) {
            const normalizedPoint = {
                x: coords.x / currentViewBoxWidth,
                y: coords.y / currentViewBoxHeight
            };

            presentationConnection.send(JSON.stringify({
                type: 'laser-update',
                strokeId: currentPath._strokeId,
                point: normalizedPoint
            }));
        }

        return;
    }

    // Handle lasso drawing
    if (isLassoing) {
        const coords = getCoordinates(e);
        points.push(coords);

        const pathData = pointsToPath(points);
        currentPath.setAttribute('d', pathData);
        return;
    }

    if (!isDrawing) return;

    const coords = getCoordinates(e);
    points.push(coords);

    // Store points in the path element for fast eraser access
    if (currentPath && currentPath._strokePoints) {
        currentPath._strokePoints.push(coords);
    }

    const pathData = pointsToPath(points);
    currentPath.setAttribute('d', pathData);

    // Send stroke-update to presentation
    if (presentationConnection && presentationConnection.state === 'connected' && currentPath._strokeId) {
        // Normalize coordinates (0-1 range) for cross-resolution compatibility
        const normalizedPoint = {
            x: coords.x / currentViewBoxWidth,
            y: coords.y / currentViewBoxHeight
        };

        presentationConnection.send(JSON.stringify({
            type: 'stroke-update',
            strokeId: currentPath._strokeId,
            point: normalizedPoint
        }));
    }
}

function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;

        // Send stroke-end to presentation
        if (presentationConnection && presentationConnection.state === 'connected' && currentPath && currentPath._strokeId) {
            presentationConnection.send(JSON.stringify({
                type: 'stroke-end',
                strokeId: currentPath._strokeId
            }));
        }

        currentPath = null;
        points = [];
    }
    if (isErasing) {
        isErasing = false;
        eraserIndicator.style.display = 'none';

        // Cancel any pending erase operation
        if (eraseAnimationFrame) {
            cancelAnimationFrame(eraseAnimationFrame);
            eraseAnimationFrame = null;
        }
    }
    if (isLasering) {
        isLasering = false;
        const laserPath = currentPath;
        const laserStrokeId = currentPath ? currentPath._strokeId : null;

        // Add to active laser strokes array
        if (laserPath) {
            laserStrokes.push(laserPath);
        }

        // Send laser-end to presentation
        if (presentationConnection && presentationConnection.state === 'connected' && laserStrokeId) {
            presentationConnection.send(JSON.stringify({
                type: 'laser-end',
                strokeId: laserStrokeId
            }));
        }

        // Clear existing timeout
        if (laserFadeTimeout) {
            clearTimeout(laserFadeTimeout);
        }

        // Set new timeout to fade all laser strokes after 1 second of inactivity
        laserFadeTimeout = setTimeout(() => {
            // OPTIMIZATION #10: Fade out all laser strokes via CSS class
            laserStrokes.forEach(stroke => {
                stroke.classList.add('fade-out');

                // Fade inner path too
                if (stroke._innerPath) {
                    stroke._innerPath.classList.add('fade-out');
                }

                // Remove after fade completes
                setTimeout(() => {
                    if (stroke.parentNode) {
                        stroke.remove();
                    }
                    if (stroke._innerPath && stroke._innerPath.parentNode) {
                        stroke._innerPath.remove();
                    }
                }, 500);
            });

            // Clear the array
            laserStrokes = [];
            laserFadeTimeout = null;
        }, 1000); // Wait 1 second, then fade

        currentPath = null;
        points = [];
    }
    if (isLassoing) {
        isLassoing = false;

        // Close the lasso path by connecting to the first point
        if (points.length > 2) {
            points.push(points[0]);
            const pathData = pointsToPath(points);
            currentPath.setAttribute('d', pathData);

            // Find strokes within the lasso
            selectStrokesInLasso(points);
        }

        // Remove the lasso path
        const lassoPath = currentPath;
        if (lassoPath && lassoPath.parentNode) {
            lassoPath.remove();
        }

        currentPath = null;
        points = [];
    }
}

// Point-in-polygon algorithm (ray casting)
function isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        const intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function selectStrokesInLasso(lassoPoints) {
    // Clear previous selection
    clearSelection();

    // Get all paths (exclude laser strokes and utility elements)
    const paths = svg.querySelectorAll('path:not(.laser-stroke)');

    paths.forEach(path => {
        // Skip if no stroke points
        if (!path._strokePoints || path._strokePoints.length === 0) {
            return;
        }

        // Check if any point of the stroke is inside the lasso
        let isInside = false;
        for (let point of path._strokePoints) {
            if (isPointInPolygon(point, lassoPoints)) {
                isInside = true;
                break;
            }
        }

        if (isInside) {
            selectedStrokes.push(path);
        }
    });

    // Create selection rectangle if strokes were selected
    if (selectedStrokes.length > 0) {
        createSelectionRect();
    }
}

function createSelectionRect() {
    // Calculate bounding box of all selected strokes
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    selectedStrokes.forEach(stroke => {
        const bbox = stroke.getBBox();
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
    });

    // Add padding
    const padding = 10;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    // Create selection rectangle
    selectionRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    selectionRect.setAttribute('x', minX);
    selectionRect.setAttribute('y', minY);
    selectionRect.setAttribute('width', maxX - minX);
    selectionRect.setAttribute('height', maxY - minY);
    selectionRect.setAttribute('fill', 'rgba(0, 102, 255, 0.1)');
    selectionRect.setAttribute('stroke', '#0066ff');
    selectionRect.setAttribute('stroke-width', '2');
    selectionRect.setAttribute('stroke-dasharray', '5,5');
    selectionRect.setAttribute('rx', '4');
    selectionRect.setAttribute('ry', '4');
    selectionRect.style.cursor = 'move';
    selectionRect.classList.add('selection-rect');

    // Store original position for dragging
    selectionRect._bounds = { minX, minY, maxX, maxY };

    svg.appendChild(selectionRect);

    // Create corner handles for scaling
    createScaleHandles(minX, minY, maxX, maxY);

    // Add drag listeners to selection rect
    selectionRect.addEventListener('pointerdown', startDraggingSelection);
}

function createScaleHandles(minX, minY, maxX, maxY) {
    // Clear existing handles
    selectionHandles.forEach(handle => {
        if (handle.parentNode) handle.remove();
    });
    selectionHandles = [];

    const handleSize = 10; // Increased by 25% from 8
    const positions = [
        { x: minX, y: minY, cursor: 'nwse-resize', corner: 'top-left' },
        { x: maxX, y: minY, cursor: 'nesw-resize', corner: 'top-right' },
        { x: minX, y: maxY, cursor: 'nesw-resize', corner: 'bottom-left' },
        { x: maxX, y: maxY, cursor: 'nwse-resize', corner: 'bottom-right' }
    ];

    positions.forEach(pos => {
        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        handle.setAttribute('x', pos.x - handleSize / 2);
        handle.setAttribute('y', pos.y - handleSize / 2);
        handle.setAttribute('width', handleSize);
        handle.setAttribute('height', handleSize);
        handle.setAttribute('fill', '#ffffff');
        handle.setAttribute('stroke', '#0066ff');
        handle.setAttribute('stroke-width', '2');
        handle.setAttribute('rx', '2');
        handle.setAttribute('ry', '2');
        handle.style.cursor = pos.cursor;
        handle.classList.add('scale-handle');
        handle._corner = pos.corner;

        svg.appendChild(handle);
        selectionHandles.push(handle);

        // Add scaling listeners
        handle.addEventListener('pointerdown', startScalingSelection);
    });
}

function updateScaleHandles() {
    if (!selectionRect || selectionHandles.length === 0) return;

    const minX = parseFloat(selectionRect.getAttribute('x'));
    const minY = parseFloat(selectionRect.getAttribute('y'));
    const width = parseFloat(selectionRect.getAttribute('width'));
    const height = parseFloat(selectionRect.getAttribute('height'));
    const maxX = minX + width;
    const maxY = minY + height;

    const handleSize = 10; // Increased by 25% from 8
    const positions = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: minX, y: maxY },
        { x: maxX, y: maxY }
    ];

    selectionHandles.forEach((handle, index) => {
        const pos = positions[index];
        handle.setAttribute('x', pos.x - handleSize / 2);
        handle.setAttribute('y', pos.y - handleSize / 2);
    });
}

function startScalingSelection(e) {
    if (e.pointerType === 'touch') return;

    e.preventDefault();
    e.stopPropagation();

    // Save state to history BEFORE starting to scale
    saveCurrentPageDrawings();
    saveStateToHistory();

    isScalingSelection = true;
    scaleHandle = e.target;
    dragStartPoint = getCoordinates(e);

    // Store original bounds and stroke data
    const bounds = selectionRect._bounds;
    originalBounds = {
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
        centerX: (bounds.minX + bounds.maxX) / 2,
        centerY: (bounds.minY + bounds.maxY) / 2
    };

    // Store original stroke data
    selectedStrokes.forEach(stroke => {
        const d = stroke.getAttribute('d');
        stroke._originalD = d;
        stroke._originalPoints = stroke._strokePoints ? [...stroke._strokePoints] : [];
    });

    document.addEventListener('pointermove', scaleSelection);
    document.addEventListener('pointerup', stopScalingSelection);
}

function scaleSelection(e) {
    if (!isScalingSelection || !scaleHandle || !originalBounds) return;

    const currentPoint = getCoordinates(e);
    const corner = scaleHandle._corner;

    // Calculate scale factor based on corner being dragged
    let scaleX, scaleY;

    if (corner === 'bottom-right') {
        const dx = currentPoint.x - dragStartPoint.x;
        const dy = currentPoint.y - dragStartPoint.y;

        // Use the larger dimension change to maintain aspect ratio
        const scaleFactorX = (originalBounds.width + dx) / originalBounds.width;
        const scaleFactorY = (originalBounds.height + dy) / originalBounds.height;
        const scaleFactor = Math.max(scaleFactorX, scaleFactorY);

        scaleX = scaleY = Math.max(0.1, scaleFactor); // Minimum 10% scale
    } else if (corner === 'top-left') {
        const dx = dragStartPoint.x - currentPoint.x;
        const dy = dragStartPoint.y - currentPoint.y;

        const scaleFactorX = (originalBounds.width + dx) / originalBounds.width;
        const scaleFactorY = (originalBounds.height + dy) / originalBounds.height;
        const scaleFactor = Math.max(scaleFactorX, scaleFactorY);

        scaleX = scaleY = Math.max(0.1, scaleFactor);
    } else if (corner === 'top-right') {
        const dx = currentPoint.x - dragStartPoint.x;
        const dy = dragStartPoint.y - currentPoint.y;

        const scaleFactorX = (originalBounds.width + dx) / originalBounds.width;
        const scaleFactorY = (originalBounds.height + dy) / originalBounds.height;
        const scaleFactor = Math.max(scaleFactorX, scaleFactorY);

        scaleX = scaleY = Math.max(0.1, scaleFactor);
    } else if (corner === 'bottom-left') {
        const dx = dragStartPoint.x - currentPoint.x;
        const dy = currentPoint.y - dragStartPoint.y;

        const scaleFactorX = (originalBounds.width + dx) / originalBounds.width;
        const scaleFactorY = (originalBounds.height + dy) / originalBounds.height;
        const scaleFactor = Math.max(scaleFactorX, scaleFactorY);

        scaleX = scaleY = Math.max(0.1, scaleFactor);
    }

    // Apply scaling to strokes
    selectedStrokes.forEach(stroke => {
        const transform = `translate(${originalBounds.centerX}, ${originalBounds.centerY}) scale(${scaleX}, ${scaleY}) translate(${-originalBounds.centerX}, ${-originalBounds.centerY})`;
        stroke.setAttribute('transform', transform);
    });

    // Update selection rectangle
    const newWidth = originalBounds.width * scaleX;
    const newHeight = originalBounds.height * scaleY;
    const newMinX = originalBounds.centerX - newWidth / 2;
    const newMinY = originalBounds.centerY - newHeight / 2;

    selectionRect.setAttribute('x', newMinX);
    selectionRect.setAttribute('y', newMinY);
    selectionRect.setAttribute('width', newWidth);
    selectionRect.setAttribute('height', newHeight);

    // Update handles
    updateScaleHandles();
}

function stopScalingSelection(e) {
    if (!isScalingSelection) return;

    const currentPoint = getCoordinates(e);
    const corner = scaleHandle._corner;

    // Calculate final scale factor
    let scaleFactor;

    if (corner === 'bottom-right') {
        const dx = currentPoint.x - dragStartPoint.x;
        const dy = currentPoint.y - dragStartPoint.y;
        const scaleFactorX = (originalBounds.width + dx) / originalBounds.width;
        const scaleFactorY = (originalBounds.height + dy) / originalBounds.height;
        scaleFactor = Math.max(scaleFactorX, scaleFactorY);
    } else if (corner === 'top-left') {
        const dx = dragStartPoint.x - currentPoint.x;
        const dy = dragStartPoint.y - currentPoint.y;
        const scaleFactorX = (originalBounds.width + dx) / originalBounds.width;
        const scaleFactorY = (originalBounds.height + dy) / originalBounds.height;
        scaleFactor = Math.max(scaleFactorX, scaleFactorY);
    } else if (corner === 'top-right') {
        const dx = currentPoint.x - dragStartPoint.x;
        const dy = dragStartPoint.y - currentPoint.y;
        const scaleFactorX = (originalBounds.width + dx) / originalBounds.width;
        const scaleFactorY = (originalBounds.height + dy) / originalBounds.height;
        scaleFactor = Math.max(scaleFactorX, scaleFactorY);
    } else if (corner === 'bottom-left') {
        const dx = dragStartPoint.x - currentPoint.x;
        const dy = currentPoint.y - dragStartPoint.y;
        const scaleFactorX = (originalBounds.width + dx) / originalBounds.width;
        const scaleFactorY = (originalBounds.height + dy) / originalBounds.height;
        scaleFactor = Math.max(scaleFactorX, scaleFactorY);
    }

    scaleFactor = Math.max(0.1, scaleFactor);

    // Apply scaling permanently to strokes
    selectedStrokes.forEach(stroke => {
        stroke.removeAttribute('transform');

        // Scale the path data
        const originalD = stroke._originalD;
        const scaledD = scalePathDataAroundPoint(originalD, originalBounds.centerX, originalBounds.centerY, scaleFactor, scaleFactor);
        stroke.setAttribute('d', scaledD);

        // Scale and update stroke points
        if (stroke._originalPoints && stroke._originalPoints.length > 0) {
            stroke._strokePoints = stroke._originalPoints.map(pt => {
                const dx = pt.x - originalBounds.centerX;
                const dy = pt.y - originalBounds.centerY;
                return {
                    x: originalBounds.centerX + dx * scaleFactor,
                    y: originalBounds.centerY + dy * scaleFactor
                };
            });
        }

        // Clean up temporary data
        delete stroke._originalD;
        delete stroke._originalPoints;
    });

    // Update selection bounds
    const newWidth = originalBounds.width * scaleFactor;
    const newHeight = originalBounds.height * scaleFactor;
    const newMinX = originalBounds.centerX - newWidth / 2;
    const newMinY = originalBounds.centerY - newHeight / 2;
    const newMaxX = newMinX + newWidth;
    const newMaxY = newMinY + newHeight;

    selectionRect._bounds = {
        minX: newMinX,
        minY: newMinY,
        maxX: newMaxX,
        maxY: newMaxY
    };

    // Send selection update to presentation
    if (presentationConnection && presentationConnection.state === 'connected') {
        sendSelectionUpdate();
    }

    isScalingSelection = false;
    scaleHandle = null;
    originalBounds = null;
    dragStartPoint = null;

    document.removeEventListener('pointermove', scaleSelection);
    document.removeEventListener('pointerup', stopScalingSelection);
}

function scalePathDataAroundPoint(pathD, cx, cy, scaleX, scaleY) {
    // Scale path data around a center point
    return pathD.replace(/([MLQ])\s*([\d.\-]+)\s+([\d.\-]+)(?:\s*,\s*([\d.\-]+)\s+([\d.\-]+))?/g,
        (match, command, x1, y1, x2, y2) => {
            const dx1 = parseFloat(x1) - cx;
            const dy1 = parseFloat(y1) - cy;
            const newX1 = cx + dx1 * scaleX;
            const newY1 = cy + dy1 * scaleY;

            if (command === 'Q' && x2 !== undefined && y2 !== undefined) {
                const dx2 = parseFloat(x2) - cx;
                const dy2 = parseFloat(y2) - cy;
                const newX2 = cx + dx2 * scaleX;
                const newY2 = cy + dy2 * scaleY;
                return `${command} ${newX1} ${newY1}, ${newX2} ${newY2}`;
            } else {
                return `${command} ${newX1} ${newY1}`;
            }
        });
}

function startDraggingSelection(e) {
    if (e.pointerType === 'touch') return;

    e.preventDefault();
    e.stopPropagation();

    // Save state to history BEFORE starting to drag
    saveCurrentPageDrawings();
    saveStateToHistory();

    isDraggingSelection = true;
    dragStartPoint = getCoordinates(e);

    // Add move and up listeners to document
    document.addEventListener('pointermove', dragSelection);
    document.addEventListener('pointerup', stopDraggingSelection);
}

function dragSelection(e) {
    if (!isDraggingSelection || !dragStartPoint) return;

    const currentPoint = getCoordinates(e);
    const dx = currentPoint.x - dragStartPoint.x;
    const dy = currentPoint.y - dragStartPoint.y;

    // Move selection rectangle
    if (selectionRect) {
        const bounds = selectionRect._bounds;
        selectionRect.setAttribute('x', bounds.minX + dx);
        selectionRect.setAttribute('y', bounds.minY + dy);
    }

    // Move all selected strokes
    selectedStrokes.forEach(stroke => {
        if (!stroke._originalTransform) {
            stroke._originalTransform = { dx: 0, dy: 0 };
        }

        const transform = `translate(${dx}, ${dy})`;
        stroke.setAttribute('transform', transform);
    });

    // Update handles
    updateScaleHandles();
}

function stopDraggingSelection(e) {
    if (!isDraggingSelection) return;

    const currentPoint = getCoordinates(e);
    const dx = currentPoint.x - dragStartPoint.x;
    const dy = currentPoint.y - dragStartPoint.y;

    // Apply the translation permanently to each stroke
    selectedStrokes.forEach(stroke => {
        const currentD = stroke.getAttribute('d');
        if (currentD) {
            // Remove transform and update path data directly
            stroke.removeAttribute('transform');

            // Update path data with the translation
            const newD = translatePathData(currentD, dx, dy);
            stroke.setAttribute('d', newD);

            // Update stored stroke points
            if (stroke._strokePoints) {
                stroke._strokePoints = stroke._strokePoints.map(pt => ({
                    x: pt.x + dx,
                    y: pt.y + dy
                }));
            }
        }
    });

    // Update selection rect bounds
    if (selectionRect) {
        const bounds = selectionRect._bounds;
        bounds.minX += dx;
        bounds.minY += dy;
        bounds.maxX += dx;
        bounds.maxY += dy;
    }

    // Send selection update to presentation
    if (presentationConnection && presentationConnection.state === 'connected') {
        sendSelectionUpdate();
    }

    isDraggingSelection = false;
    dragStartPoint = null;

    // Remove listeners
    document.removeEventListener('pointermove', dragSelection);
    document.removeEventListener('pointerup', stopDraggingSelection);
}

function sendSelectionUpdate() {
    // Save current page drawings first
    saveCurrentPageDrawings();

    // Send updated drawings to presentation
    presentationConnection.send(JSON.stringify({
        type: 'selection-update',
        page: currentPage,
        drawings: pageDrawings
    }));
}

function translatePathData(pathD, dx, dy) {
    // Translate path data coordinates
    return pathD.replace(/([MLQ])\s*([\d.\-]+)\s+([\d.\-]+)(?:\s*,\s*([\d.\-]+)\s+([\d.\-]+))?/g,
        (match, command, x1, y1, x2, y2) => {
            const newX1 = parseFloat(x1) + dx;
            const newY1 = parseFloat(y1) + dy;

            if (command === 'Q' && x2 !== undefined && y2 !== undefined) {
                const newX2 = parseFloat(x2) + dx;
                const newY2 = parseFloat(y2) + dy;
                return `${command} ${newX1} ${newY1}, ${newX2} ${newY2}`;
            } else {
                return `${command} ${newX1} ${newY1}`;
            }
        });
}

function clearSelection() {
    // Remove selection rectangle
    if (selectionRect && selectionRect.parentNode) {
        selectionRect.remove();
    }
    selectionRect = null;

    // Remove handles
    selectionHandles.forEach(handle => {
        if (handle.parentNode) handle.remove();
    });
    selectionHandles = [];

    // Clear selected strokes array
    selectedStrokes = [];
}

function erase(e) {
    const coords = getCoordinates(e);
    const eraserRadius = 20; // Eraser size in viewBox units

    // Update eraser indicator position immediately
    eraserIndicator.setAttribute('cx', coords.x);
    eraserIndicator.setAttribute('cy', coords.y);

    // Cancel any pending erase operation
    if (eraseAnimationFrame) {
        cancelAnimationFrame(eraseAnimationFrame);
    }

    // Use requestAnimationFrame to throttle erase operations
    eraseAnimationFrame = requestAnimationFrame(() => {
        // Get all path elements
        const paths = svg.querySelectorAll('path');
        const eraserRadiusSquared = eraserRadius * eraserRadius;

        paths.forEach(path => {
            // Skip if path doesn't have stored points (shouldn't happen for our strokes)
            if (!path._strokePoints || path._strokePoints.length === 0) {
                return;
            }

            const bbox = path.getBBox();

            // Quick bounding box check first
            if (coords.x >= bbox.x - eraserRadius &&
                coords.x <= bbox.x + bbox.width + eraserRadius &&
                coords.y >= bbox.y - eraserRadius &&
                coords.y <= bbox.y + bbox.height + eraserRadius) {

                // Check stored stroke points directly (much faster than getPointAtLength)
                let shouldErase = false;
                const strokePoints = path._strokePoints;

                // Sample every few points for performance (checking every 3rd point)
                for (let i = 0; i < strokePoints.length; i += 3) {
                    const point = strokePoints[i];
                    const dx = point.x - coords.x;
                    const dy = point.y - coords.y;
                    const distanceSquared = dx * dx + dy * dy;

                    if (distanceSquared <= eraserRadiusSquared) {
                        shouldErase = true;
                        break;
                    }
                }

                if (shouldErase) {
                    const strokeId = path._strokeId;
                    path.remove();

                    // Send erase notification to presentation
                    if (presentationConnection && presentationConnection.state === 'connected' && strokeId) {
                        presentationConnection.send(JSON.stringify({
                            type: 'stroke-erase',
                            strokeId: strokeId
                        }));
                    }
                }
            }
        });

        eraseAnimationFrame = null;
    });
}

function clearCanvas() {
    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }
}

function saveCurrentPageDrawings() {
    // Get all path elements (excluding eraser indicator)
    const paths = Array.from(svg.querySelectorAll('path'));

    // Save the SVG path data for current page with viewBox dimensions
    pageDrawings[currentPage] = {
        viewBoxWidth: currentViewBoxWidth,
        viewBoxHeight: currentViewBoxHeight,
        paths: paths.map(path => ({
            d: path.getAttribute('d'),
            stroke: path.getAttribute('stroke'),
            strokeWidth: path.getAttribute('stroke-width'),
            fill: path.getAttribute('fill'),
            strokeLinecap: path.getAttribute('stroke-linecap'),
            strokeLinejoin: path.getAttribute('stroke-linejoin'),
            strokePoints: path._strokePoints || [],
            strokeId: path._strokeId // Save strokeId for presentation sync
        }))
    };
}

function restorePageDrawings(pageNum) {
    console.log('Restoring drawings for page:', pageNum, 'Available pages:', Object.keys(pageDrawings));

    // Clear current canvas
    clearCanvas();

    // Re-add eraser indicator and laser pointer
    if (eraserIndicator) {
        svg.appendChild(eraserIndicator);
    }
    if (laserPointer) {
        svg.appendChild(laserPointer);
    }

    // Restore drawings for this page if they exist
    if (pageDrawings[pageNum] && pageDrawings[pageNum].paths) {
        const savedData = pageDrawings[pageNum];
        console.log('Found', savedData.paths.length, 'paths for page', pageNum);

        const scaleX = currentViewBoxWidth / savedData.viewBoxWidth;
        const scaleY = currentViewBoxHeight / savedData.viewBoxHeight;
        console.log('Scale factors:', scaleX, scaleY);

        let restoredCount = 0;
        savedData.paths.forEach(pathData => {
            // Skip if path data is missing
            if (!pathData.d) {
                console.log('Skipping path with no data');
                return;
            }

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

            // Scale the path if viewBox dimensions changed
            let pathD = pathData.d;
            if (scaleX !== 1 || scaleY !== 1) {
                pathD = scalePathData(pathData.d, scaleX, scaleY);
            }

            path.setAttribute('d', pathD);
            path.setAttribute('stroke', pathData.stroke);
            path.setAttribute('stroke-width', pathData.strokeWidth);
            path.setAttribute('fill', pathData.fill);
            path.setAttribute('stroke-linecap', pathData.strokeLinecap);
            path.setAttribute('stroke-linejoin', pathData.strokeLinejoin);

            // Restore stroke points for eraser (scale them if needed)
            if (pathData.strokePoints) {
                path._strokePoints = pathData.strokePoints.map(pt => ({
                    x: pt.x * scaleX,
                    y: pt.y * scaleY
                }));
            }

            // Restore strokeId for presentation sync
            if (pathData.strokeId) {
                path._strokeId = pathData.strokeId;
            }

            svg.insertBefore(path, eraserIndicator);
            restoredCount++;
        });

        console.log('Restored', restoredCount, 'paths to SVG');
    } else {
        console.log('No drawings found for page', pageNum);
    }
}

function scalePathData(pathD, scaleX, scaleY) {
    // Parse and scale path data for both linear and quadratic curves
    return pathD.replace(/([MLQ])\s*([\d.\-]+)\s+([\d.\-]+)(?:\s*,\s*([\d.\-]+)\s+([\d.\-]+))?/g,
        (match, command, x1, y1, x2, y2) => {
            const scaledX1 = parseFloat(x1) * scaleX;
            const scaledY1 = parseFloat(y1) * scaleY;

            if (command === 'Q' && x2 !== undefined && y2 !== undefined) {
                // Quadratic curve with control point and end point
                const scaledX2 = parseFloat(x2) * scaleX;
                const scaledY2 = parseFloat(y2) * scaleY;
                return `${command} ${scaledX1} ${scaledY1}, ${scaledX2} ${scaledY2}`;
            } else {
                // Move or Line command
                return `${command} ${scaledX1} ${scaledY1}`;
            }
        });
}

// ============================================
// EVENT LISTENERS
// ============================================

function attachEventListeners() {
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

    // Prevent context menu on double-tap and right-click
    svg.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });

    // Prevent default touch behaviors on canvas container
    const canvasContainer = document.getElementById('canvasContainer');
    if (canvasContainer) {
        canvasContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });
        canvasContainer.addEventListener('touchstart', (e) => {
            // Prevent default to disable double-tap zoom and context menu
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });
    }

    // Touch events disabled - fingers will not draw
    // Only Surface Pen (pointer events) and mouse will work
}

// Keyboard shortcuts
document.addEventListener('keydown', async (e) => {
    if (e.key === 'Delete') {
        clearCanvas();
        // Clear saved drawings for current page
        delete pageDrawings[currentPage];
        // Re-add eraser indicator and laser pointer
        if (eraserIndicator) {
            svg.appendChild(eraserIndicator);
        }
        if (laserPointer) {
            svg.appendChild(laserPointer);
        }
    }

    // PDF page navigation with arrow keys
    if (pdfDoc) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (currentPage < pdfDoc.numPages && !isPageChanging) {
                isPageChanging = true;

                // Fade out
                pdfCanvas.classList.add('fade-out');
                svg.classList.add('fade-out');

                // Wait for fade out animation
                await new Promise(resolve => setTimeout(resolve, 150));

                // Save current page drawings
                saveCurrentPageDrawings();

                // Change page
                currentPage++;
                await renderPDFPage(currentPage);

                // Restore new page drawings
                restorePageDrawings(currentPage);

                // Update page navigation UI
                updatePageNavigation();

                // Update undo/redo buttons for new page
                updateUndoRedoButtons();

                // Fade in
                pdfCanvas.classList.remove('fade-out');
                svg.classList.remove('fade-out');

                isPageChanging = false;
            }
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentPage > 1 && !isPageChanging) {
                isPageChanging = true;

                // Fade out
                pdfCanvas.classList.add('fade-out');
                svg.classList.add('fade-out');

                // Wait for fade out animation
                await new Promise(resolve => setTimeout(resolve, 150));

                // Save current page drawings
                saveCurrentPageDrawings();

                // Change page
                currentPage--;
                await renderPDFPage(currentPage);

                // Restore new page drawings
                restorePageDrawings(currentPage);

                // Update page navigation UI
                updatePageNavigation();

                // Update undo/redo buttons for new page
                updateUndoRedoButtons();

                // Fade in
                pdfCanvas.classList.remove('fade-out');
                svg.classList.remove('fade-out');

                isPageChanging = false;
            }
        }
    }
});

// ============================================
// PAGE FILMSTRIP FUNCTIONS
// ============================================

let isFilmstripOpen = false;

async function generateFilmstripThumbnails() {
    if (!pdfDoc) return;

    const filmstripPages = document.getElementById('filmstripPages');
    if (!filmstripPages) return;

    // Clear existing thumbnails
    filmstripPages.innerHTML = '';

    // Generate thumbnail for each page
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.5 });

        // Create canvas for thumbnail
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render page to canvas
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        // Create filmstrip page container
        const pageContainer = document.createElement('div');
        pageContainer.className = 'filmstrip-page';
        pageContainer.dataset.pageNum = pageNum;
        if (pageNum === currentPage) {
            pageContainer.classList.add('active');
        }

        // Add page number label
        const pageLabel = document.createElement('div');
        pageLabel.className = 'filmstrip-page-number';
        pageLabel.textContent = pageNum;

        pageContainer.appendChild(canvas);
        pageContainer.appendChild(pageLabel);
        filmstripPages.appendChild(pageContainer);

        // Add click handler
        pageContainer.addEventListener('click', async () => {
            if (pageNum !== currentPage) {
                await goToPage(pageNum);
            }
            // Close filmstrip after selecting a page
            toggleFilmstrip();
        });
    }
}

function toggleFilmstrip() {
    const filmstrip = document.getElementById('pageFilmstrip');
    if (!filmstrip) return;

    isFilmstripOpen = !isFilmstripOpen;

    if (isFilmstripOpen) {
        filmstrip.classList.add('show');
        // Generate thumbnails if not already generated
        if (filmstrip.querySelector('#filmstripPages').children.length === 0) {
            generateFilmstripThumbnails();
        } else {
            // Update active state
            updateFilmstripActiveState();
        }
    } else {
        filmstrip.classList.remove('show');
    }
}

function updateFilmstripActiveState() {
    const filmstripPages = document.querySelectorAll('.filmstrip-page');
    filmstripPages.forEach(page => {
        const pageNum = parseInt(page.dataset.pageNum);
        if (pageNum === currentPage) {
            page.classList.add('active');
        } else {
            page.classList.remove('active');
        }
    });
}

async function goToPage(pageNum) {
    if (!pdfDoc || pageNum < 1 || pageNum > pdfDoc.numPages || pageNum === currentPage) {
        return;
    }

    // Save current page drawings
    saveCurrentPageDrawings();

    // Fade out
    pdfCanvas.classList.add('fade-out');
    svg.classList.add('fade-out');

    // Wait for fade animation
    await new Promise(resolve => setTimeout(resolve, 100));

    // Change page
    currentPage = pageNum;
    await renderPDFPage(currentPage);

    // Restore new page drawings
    restorePageDrawings(currentPage);

    // Update page navigation UI
    updatePageNavigation();

    // Update undo/redo buttons
    updateUndoRedoButtons();

    // Update filmstrip active state
    updateFilmstripActiveState();

    // Fade in
    pdfCanvas.classList.remove('fade-out');
    svg.classList.remove('fade-out');
}

// Add click handler to page number
const pageNumber = document.getElementById('pageNumber');
if (pageNumber) {
    pageNumber.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFilmstrip();
    });
}

// Close filmstrip when clicking outside
document.addEventListener('click', (e) => {
    const filmstrip = document.getElementById('pageFilmstrip');
    const pageNumber = document.getElementById('pageNumber');

    if (isFilmstripOpen && filmstrip && !filmstrip.contains(e.target) && e.target !== pageNumber) {
        toggleFilmstrip();
    }
});
