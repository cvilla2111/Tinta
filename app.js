// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

// State
let pdfDoc = null;
let pageNum = 1;
let pageIsRendering = false;
let pageNumIsPending = null;
let scale = 1.5;
let fitMode = 'width'; // Track current fit mode: 'width', 'height', 'best'

// Annotation State
let annotations = {}; // Keyed by page number
let undoStack = {}; // Undo history keyed by page number
let currentTool = 'pen';
let currentColor = '#000000';
let currentStrokeWidth = 3;
let isDrawing = false;
let currentPath = null;
let currentPoints = [];
let activePointerId = null; // Track which pointer is currently drawing
let isEraserActive = false; // Track if current stroke is erasing
let laserStrokes = []; // Store all laser strokes
let lastLaserStrokeTime = 0; // Timestamp of last laser stroke
let laserClearTimeout = null; // Timeout for clearing laser strokes
let laserFadeOpacity = 1.0; // Current opacity for laser fade animation
let laserFadeAnimationId = null; // Animation frame ID for fade
let lassoPoints = []; // Store lasso selection path points
let selectedAnnotations = []; // Store currently selected annotation indices
let isLassoing = false; // Track if user is drawing lasso
let selectionBox = null; // Visual bounding box for selected annotations
let isDraggingSelection = false; // Track if dragging selected annotations
let dragStartPos = null; // Starting position for drag
let selectionBounds = null; // Bounding box coordinates of selection
let selectionBoxNeedsRedraw = false; // Flag to batch selection box redraws
let isResizingSelection = false; // Track if resizing selected annotations
let resizeHandle = null; // Which resize handle is being dragged ('nw', 'ne', 'sw', 'se')
let resizeStartBounds = null; // Original bounds when resize started
let resizeStartAnnotations = null; // Original annotation data when resize started
const HANDLE_SIZE = 12; // Size of resize handles in pixels (50% bigger: 8 * 1.5 = 12)

// DOM Elements
const fileInput = document.getElementById('fileInput');
const welcomeFileInput = document.getElementById('welcomeFileInput');
const openFileBtn = document.getElementById('openFileBtn');
const welcomeOpenBtn = document.getElementById('welcomeOpenBtn');
const scrollToggleBtn = document.getElementById('scrollToggleBtn');
const scrollIcon = document.getElementById('scrollIcon');
const menuBtn = document.getElementById('menuBtn');
const menuModal = document.getElementById('menuModal');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');
const quitBtn = document.getElementById('quitBtn');
const quitConfirmModal = document.getElementById('quitConfirmModal');
const quitCancelBtn = document.getElementById('quitCancelBtn');
const quitConfirmBtn = document.getElementById('quitConfirmBtn');
const welcomeScreen = document.getElementById('welcomeScreen');
const pdfViewer = document.getElementById('pdfViewer');
const headerControls = document.getElementById('headerControls');
const headerRight = document.getElementById('headerRight');
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');
const pageNumDisplay = document.getElementById('pageNum');
const pageCountDisplay = document.getElementById('pageCount');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const zoomFitBtn = document.getElementById('zoomFit');
const canvasContainer = document.getElementById('canvasContainer');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const fullscreenIcon = document.getElementById('fullscreenIcon');
const filmstripModal = document.getElementById('filmstripModal');
const filmstripContent = document.getElementById('filmstripContent');
const closeFilmstrip = document.getElementById('closeFilmstrip');
const pageInfo = document.querySelector('.page-info');

// Annotation Elements
const annotationLayer = document.getElementById('annotationLayer');
const activeStrokeCanvas = document.getElementById('activeStrokeCanvas');
const activeStrokeCtx = activeStrokeCanvas.getContext('2d');
const pdfWrapper = document.getElementById('pdfWrapper');
const pageTransitionOverlay = document.getElementById('pageTransitionOverlay');

// Annotation Elements defined above - no inline styles needed
const penBtn = document.getElementById('penBtn');
const laserBtn = document.getElementById('laserBtn');
const lassoBtn = document.getElementById('lassoBtn');
const eraserBtn = document.getElementById('eraserBtn');
const eraserModal = document.getElementById('eraserModal');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearBtn = document.getElementById('clearBtn');
const colorPickerBtn = document.getElementById('colorPickerBtn');
const colorPickerModal = document.getElementById('colorPickerModal');
const colorIndicator = document.querySelector('.color-indicator');
const colorOptions = document.querySelectorAll('.color-option');
const strokePickerModal = document.getElementById('strokePickerModal');
const strokeOptions = document.querySelectorAll('.stroke-option');
const presentBtn = document.getElementById('presentBtn');

// Ink API
let inkPresenter = null;

// Event Listeners - PDF Controls
openFileBtn.addEventListener('click', () => {
    fileInput.click();
    closeAllModals();
});
welcomeOpenBtn.addEventListener('click', () => welcomeFileInput.click());
fileInput.addEventListener('change', handleFileSelect);
welcomeFileInput.addEventListener('change', handleFileSelect);
prevPageBtn.addEventListener('click', showPrevPage);
nextPageBtn.addEventListener('click', showNextPage);
zoomInBtn.addEventListener('click', zoomIn);
zoomOutBtn.addEventListener('click', zoomOut);
zoomFitBtn.addEventListener('click', cycleFitMode);
fullscreenBtn.addEventListener('click', toggleFullscreen);

// Event Listeners - Annotation Tools
penBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    // If pen is already active, toggle modal
    if (currentTool === 'pen') {
        const isVisible = strokePickerModal.style.display === 'block';
        closeAllModals();
        strokePickerModal.style.display = isVisible ? 'none' : 'block';
    } else {
        // If pen is not active, activate it without opening modal
        closeAllModals();
        setTool('pen');
    }
});

undoBtn.addEventListener('click', undoLastStroke);
redoBtn.addEventListener('click', redoLastStroke);
clearBtn.addEventListener('click', () => {
    clearAllAnnotations();
    closeAllModals();
});

// Laser pointer button
laserBtn.addEventListener('click', () => {
    closeAllModals();
    setTool('laser');
});

// Lasso selection button
lassoBtn.addEventListener('click', () => {
    closeAllModals();
    setTool('lasso');
});

// State for finger scroll
let fingerScrollEnabled = false;
let tempScrollFromBarrelButton = false; // Track if barrel button triggered temp scroll
let previousToolBeforeBarrelScroll = null; // Store previous tool state

// Helper function to close all modals
function closeAllModals() {
    colorPickerModal.style.display = 'none';
    strokePickerModal.style.display = 'none';
    eraserModal.style.display = 'none';
    menuModal.style.display = 'none';
}

// Function to disable finger scroll
function disableFingerScroll() {
    fingerScrollEnabled = false;
    scrollIcon.innerHTML = '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 11V4a2 2 0 0 0-4 0v7M10 11V6a2 2 0 0 0-4 0v5M6 11v4a8 8 0 0 0 8 8h.3a8 8 0 0 0 7.7-6.1l1-4A2 2 0 0 0 21 10h-2"></path><line x1="12" y1="2" x2="12" y2="22" stroke-dasharray="2,2" opacity="0.5"></line>';
    scrollToggleBtn.title = 'Enable Finger Scroll';
    scrollToggleBtn.classList.remove('tool-active');
    activeStrokeCanvas.style.pointerEvents = 'all';
    activeStrokeCanvas.style.touchAction = 'none';
    activeStrokeCanvas.style.display = 'block';
    annotationLayer.style.pointerEvents = 'none';
    annotationLayer.style.touchAction = 'none';
    pdfWrapper.style.touchAction = 'none';
    canvasContainer.style.touchAction = 'none';
    canvasContainer.style.overflow = 'auto';
}

// Scroll toggle functionality
scrollToggleBtn.addEventListener('click', () => {
    fingerScrollEnabled = !fingerScrollEnabled;

    if (fingerScrollEnabled) {
        // Enabled - show hand with slash to indicate scrolling is active
        scrollIcon.innerHTML = '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 11V4a2 2 0 0 0-4 0v7M10 11V6a2 2 0 0 0-4 0v5M6 11v4a8 8 0 0 0 8 8h.3a8 8 0 0 0 7.7-6.1l1-4A2 2 0 0 0 21 10h-2"></path><circle cx="14" cy="14" r="10" opacity="0.3" fill="currentColor"></circle>';
        scrollToggleBtn.title = 'Disable Finger Scroll';
        scrollToggleBtn.classList.add('tool-active');
        activeStrokeCanvas.style.display = 'none';
        annotationLayer.style.pointerEvents = 'none';
        annotationLayer.style.touchAction = 'auto';
        pdfWrapper.style.touchAction = 'auto';
        canvasContainer.style.touchAction = 'pan-y'; // Explicitly allow vertical panning
        canvasContainer.style.overflow = 'scroll'; // Force scrolling
        console.log('Finger scroll enabled - Surface Go 2 mode');
    } else {
        disableFingerScroll();
    }
});

// Listen for stylus touches when finger scroll is enabled
document.addEventListener('pointerdown', (e) => {
    // If finger scroll is enabled and stylus/pen/mouse touches anywhere on the PDF area, disable it
    if (fingerScrollEnabled && (e.pointerType === 'pen' || e.pointerType === 'mouse')) {
        // Check if the pointer is over the PDF viewer area
        const pdfViewerRect = pdfViewer.getBoundingClientRect();
        if (e.clientX >= pdfViewerRect.left && e.clientX <= pdfViewerRect.right &&
            e.clientY >= pdfViewerRect.top && e.clientY <= pdfViewerRect.bottom) {
            // Prevent scrolling immediately
            e.preventDefault();
            e.stopPropagation();
            disableFingerScroll();
        }
    }
}, { passive: false });

// Menu modal toggle
menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = menuModal.style.display === 'block';
    closeAllModals();
    menuModal.style.display = isVisible ? 'none' : 'block';
});

// Theme Management
function initTheme() {
    // Use system preference on load
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    console.log('Initializing theme. System prefers dark:', prefersDark);
    if (prefersDark) {
        document.documentElement.classList.add('dark');
    }
    console.log('Initial HTML classes:', document.documentElement.className);
    updateThemeButton(prefersDark);
}

function updateThemeButton(isDark) {
    // Check if elements exist before updating
    if (!themeIcon || !themeLabel) return;

    if (isDark) {
        // Currently dark, show sun icon (to switch to light)
        themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
        themeLabel.textContent = 'Light Mode';
    } else {
        // Currently light, show moon icon (to switch to dark)
        themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
        themeLabel.textContent = 'Dark Mode';
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');

    console.log('Toggle theme clicked. Current mode:', isDark ? 'dark' : 'light');

    if (isDark) {
        // Switch to light mode
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        console.log('Switched to light mode');
        updateThemeButton(false);
    } else {
        // Switch to dark mode
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
        console.log('Switched to dark mode');
        updateThemeButton(true);
    }

    console.log('HTML element classes:', document.documentElement.className);

    closeAllModals();
}

// Theme toggle button
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('Theme button clicked!');
        toggleTheme();
    });
} else {
    console.error('Theme toggle button not found!');
}

// Quit button
if (quitBtn) {
    quitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllModals();
        // Show quit confirmation modal
        quitConfirmModal.style.display = 'flex';
    });
}

// Quit confirmation handlers
if (quitCancelBtn) {
    quitCancelBtn.addEventListener('click', () => {
        quitConfirmModal.style.display = 'none';
    });
}

if (quitConfirmBtn) {
    quitConfirmBtn.addEventListener('click', () => {
        quitConfirmModal.style.display = 'none';

        // Try multiple methods to close the window/tab
        // Method 1: Try window.close() - works for windows opened by JavaScript
        window.close();

        // Method 2: If still here after 100ms, try the workaround
        setTimeout(() => {
            // Open a blank window and close it (sometimes helps with permissions)
            window.open('', '_self', '');
            window.close();
        }, 100);

        // Method 3: If still here, navigate to about:blank
        setTimeout(() => {
            window.location.href = 'about:blank';
        }, 200);
    });
}

// Initialize theme on page load
initTheme();

// Color picker modal toggle
colorPickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = colorPickerModal.style.display === 'block';
    closeAllModals();
    colorPickerModal.style.display = isVisible ? 'none' : 'block';
});

// Color selection
colorOptions.forEach(option => {
    option.addEventListener('click', (e) => {
        e.stopPropagation();
        currentColor = option.dataset.color;
        colorIndicator.style.background = currentColor;
        closeAllModals();
        // Activate pen tool when color is selected
        setTool('pen');
    });
});

// Eraser button - activate tool or open modal
eraserBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    // If eraser is already active, toggle modal
    if (currentTool === 'eraser') {
        const isVisible = eraserModal.style.display === 'block';
        closeAllModals();
        eraserModal.style.display = isVisible ? 'none' : 'block';
    } else {
        // If eraser is not active, activate it without opening modal
        closeAllModals();
        setTool('eraser');
    }
});

// Close modals when clicking outside
document.addEventListener('click', (e) => {
    if (!colorPickerBtn.contains(e.target) && !colorPickerModal.contains(e.target) &&
        !penBtn.contains(e.target) && !strokePickerModal.contains(e.target) &&
        !eraserBtn.contains(e.target) && !eraserModal.contains(e.target) &&
        !menuBtn.contains(e.target) && !menuModal.contains(e.target)) {
        closeAllModals();
    }
});

// Stroke width selection
strokeOptions.forEach(option => {
    option.addEventListener('click', (e) => {
        e.stopPropagation();
        currentStrokeWidth = parseInt(option.dataset.width);
        // Update active state
        strokeOptions.forEach(o => o.classList.remove('stroke-active'));
        option.classList.add('stroke-active');
        closeAllModals();
        // Pen tool is already active since modal only opens when pen is active
    });
});

// Drawing Event Listeners - Use active stroke canvas
activeStrokeCanvas.addEventListener('pointerdown', startDrawing);
activeStrokeCanvas.addEventListener('pointermove', draw);
activeStrokeCanvas.addEventListener('pointerup', endDrawing);
activeStrokeCanvas.addEventListener('pointerleave', endDrawing);
activeStrokeCanvas.addEventListener('pointercancel', endDrawing);

// Disable context menu on long press for canvas
activeStrokeCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Disable context menu on toolbars (touch and hold)
const header = document.querySelector('.header');
header.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Disable context menu on entire document to prevent fullscreen exit on long press
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

// Disable context menu on PDF viewer area specifically
pdfViewer.addEventListener('contextmenu', (e) => {
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
        loadPDFWithPresentation(file);
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
            headerRight.style.display = 'flex';

            // Initialize Ink API
            await initInkAPI();

            // Reset to first page
            pageNum = 1;

            // Set initial fit mode
            fitMode = 'width';
            pageNum = 1;

            // Show UI first
            renderPage(pageNum);
            updatePageControls();
            updateFitButton();

            // Enter fullscreen after PDF is loaded
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.log('Fullscreen not available or denied:', err);
                });
            }

            // Recalculate fit to width after fullscreen attempt (whether successful or not)
            // Give time for UI to stabilize and fullscreen to complete
            setTimeout(() => {
                fitToWidth();
            }, 300);
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

    // Fade in overlay to cover the page (EXACTLY like presentation screen)
    pageTransitionOverlay.style.opacity = '1';

    // Small delay for fade-in to complete before rendering
    setTimeout(() => {
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

            // Mark canvas as loaded to fade it in
            canvas.classList.add('loaded');

            // Sync ONLY the SVG layer size (don't touch activeStrokeCanvas - would clear it!)
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            annotationLayer.setAttribute('width', canvas.style.width);
            annotationLayer.setAttribute('height', canvas.style.height);
            annotationLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);

            // Load new annotations and sync canvas
            syncAnnotationLayer();
            loadPageAnnotations();

            // Fade out overlay to reveal the new page (EXACTLY like presentation screen)
            pageTransitionOverlay.style.opacity = '0';

            if (pageNumIsPending !== null) {
                renderPage(pageNumIsPending);
                pageNumIsPending = null;
            }
        });
        });
    }, 300); // Normal timing - match CSS transition

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
    // Don't call loadPageAnnotations here - let renderPage handle it during transition
    syncPresentationPage(pageNum);
}

// Show next page
function showNextPage() {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
    updatePageControls();
    // Don't call loadPageAnnotations here - let renderPage handle it during transition
    syncPresentationPage(pageNum);
}

// Update page controls
function updatePageControls() {
    prevPageBtn.disabled = pageNum <= 1;
    nextPageBtn.disabled = pageNum >= pdfDoc.numPages;
}

// Zoom in
function zoomIn() {
    if (scale >= 5) return;
    scale += 0.01;
    queueRenderPage(pageNum);
}

// Zoom out
function zoomOut() {
    if (scale <= 0.1) return;
    scale -= 0.01;
    queueRenderPage(pageNum);
}

// Cycle through fit modes: width -> height -> width
function cycleFitMode() {
    if (!pdfDoc) return;

    // Toggle between width and height
    if (fitMode === 'width') {
        fitMode = 'height';
        fitToHeight();
    } else {
        fitMode = 'width';
        fitToWidth();
    }

    updateFitButton();
}

// Fit to width
function fitToWidth() {
    if (!pdfDoc) return;

    pdfDoc.getPage(pageNum).then(page => {
        const canvasContainer = document.getElementById('canvasContainer');
        const containerWidth = canvasContainer.clientWidth;
        const viewport = page.getViewport({ scale: 1 });
        scale = containerWidth / viewport.width;
        queueRenderPage(pageNum);
    });
}

// Fit to height
function fitToHeight() {
    if (!pdfDoc) return;

    pdfDoc.getPage(pageNum).then(page => {
        const canvasContainer = document.getElementById('canvasContainer');
        const containerHeight = canvasContainer.clientHeight;
        const viewport = page.getViewport({ scale: 1 });
        scale = containerHeight / viewport.height;
        queueRenderPage(pageNum);
    });
}

// Best fit (fit entire page in viewport)
function fitToBest() {
    if (!pdfDoc) return;

    pdfDoc.getPage(pageNum).then(page => {
        const canvasContainer = document.getElementById('canvasContainer');
        const containerWidth = canvasContainer.clientWidth;
        const containerHeight = canvasContainer.clientHeight;
        const viewport = page.getViewport({ scale: 1 });

        // Calculate scale for both dimensions and use the smaller one
        const scaleWidth = containerWidth / viewport.width;
        const scaleHeight = containerHeight / viewport.height;
        scale = Math.min(scaleWidth, scaleHeight);

        queueRenderPage(pageNum);
    });
}

// Update fit button title based on current mode (icon doesn't change - it's a static img)
function updateFitButton() {
    // Update button title only - the icon is now a static img tag
    if (fitMode === 'width') {
        zoomFitBtn.title = 'Fit to Width';
    } else {
        zoomFitBtn.title = 'Fit to Height';
    }
}

// Zoom display removed - no longer needed

// Fullscreen toggle
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        // Enter fullscreen
        document.documentElement.requestFullscreen().catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
        // Exit fullscreen
        document.exitFullscreen();
    }
}

// Update fullscreen icon when fullscreen state changes
document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
        // In fullscreen - show exit fullscreen icon
        fullscreenIcon.src = 'icons/minimize-2.svg';
        fullscreenBtn.title = 'Exit Fullscreen';
    } else {
        // Not in fullscreen - show enter fullscreen icon
        fullscreenIcon.src = 'icons/expand.svg';
        fullscreenBtn.title = 'Fullscreen';
    }

    // Recalculate fit to width when entering/exiting fullscreen
    if (pdfDoc && fitMode === 'width') {
        // Small delay to let browser finish fullscreen transition
        setTimeout(() => {
            fitToWidth();
        }, 100);
    }
});

// ============================================
// PAGE FILMSTRIP FUNCTIONS
// ============================================

// Open filmstrip when clicking page info
if (pageInfo) {
    pageInfo.addEventListener('click', () => {
        if (pdfDoc) {
            openFilmstrip();
        }
    });
}

// Close filmstrip button
if (closeFilmstrip) {
    closeFilmstrip.addEventListener('click', () => {
        closeFilmstripModal();
    });
}

// Close filmstrip when clicking overlay
if (filmstripModal) {
    filmstripModal.addEventListener('click', (e) => {
        if (e.target === filmstripModal) {
            closeFilmstripModal();
        }
    });
}

// Open filmstrip and generate thumbnails
function openFilmstrip() {
    if (!pdfDoc) return;

    filmstripModal.style.display = 'block';
    // Trigger animation after display is set
    setTimeout(() => {
        filmstripModal.classList.add('show');
    }, 10);
    generateFilmstripThumbnails();
}

// Close filmstrip with animation
function closeFilmstripModal() {
    filmstripModal.classList.remove('show');
    // Wait for animation to complete before hiding
    setTimeout(() => {
        filmstripModal.style.display = 'none';
    }, 300);
}

// Generate thumbnails for all pages
async function generateFilmstripThumbnails() {
    // Clear existing thumbnails
    filmstripContent.innerHTML = '';

    const thumbnailWidth = 300; // Fixed width for thumbnails
    const numPages = pdfDoc.numPages;

    for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });

        // Calculate scale to fit thumbnail width
        const thumbScale = thumbnailWidth / viewport.width;
        const thumbViewport = page.getViewport({ scale: thumbScale });

        // Create canvas for thumbnail
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = thumbViewport.width;
        thumbCanvas.height = thumbViewport.height;
        const thumbCtx = thumbCanvas.getContext('2d');

        // Render page to thumbnail canvas
        await page.render({
            canvasContext: thumbCtx,
            viewport: thumbViewport
        }).promise;

        // Create filmstrip page element
        const pageEl = document.createElement('div');
        pageEl.className = 'filmstrip-page';
        if (i === pageNum) {
            pageEl.classList.add('active');
        }
        pageEl.dataset.pageNum = i;

        // Add canvas
        pageEl.appendChild(thumbCanvas);

        // Add page number label
        const label = document.createElement('div');
        label.className = 'filmstrip-page-number';
        label.textContent = `Page ${i}`;
        pageEl.appendChild(label);

        // Click handler to navigate to page
        pageEl.addEventListener('click', () => {
            goToPage(i);
            closeFilmstripModal();
        });

        filmstripContent.appendChild(pageEl);
    }

    // Scroll to current page in filmstrip
    scrollToCurrentPageInFilmstrip();
}

// Navigate to specific page
function goToPage(num) {
    if (num < 1 || num > pdfDoc.numPages) return;
    pageNum = num;
    queueRenderPage(pageNum);
    updatePageControls();
    loadPageAnnotations();
    syncPresentationPage(pageNum);
}

// Scroll filmstrip to show current page
function scrollToCurrentPageInFilmstrip() {
    const activePage = filmstripContent.querySelector('.filmstrip-page.active');
    if (activePage) {
        activePage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

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

    // Clear any existing selection when switching tools
    clearSelection();

    if (tool === 'pen') {
        penBtn.classList.add('tool-active');
        laserBtn.classList.remove('tool-active');
        lassoBtn.classList.remove('tool-active');
        eraserBtn.classList.remove('tool-active');
        annotationLayer.classList.add('drawing-mode');
    } else if (tool === 'laser') {
        laserBtn.classList.add('tool-active');
        penBtn.classList.remove('tool-active');
        lassoBtn.classList.remove('tool-active');
        eraserBtn.classList.remove('tool-active');
        annotationLayer.classList.add('drawing-mode');
    } else if (tool === 'lasso') {
        lassoBtn.classList.add('tool-active');
        penBtn.classList.remove('tool-active');
        laserBtn.classList.remove('tool-active');
        eraserBtn.classList.remove('tool-active');
        annotationLayer.classList.add('drawing-mode');
    } else if (tool === 'eraser') {
        eraserBtn.classList.add('tool-active');
        laserBtn.classList.remove('tool-active');
        lassoBtn.classList.remove('tool-active');
        penBtn.classList.remove('tool-active');
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

    // Close all modals when stylus/pen touches the screen
    closeAllModals();

    // Detect stylus barrel button (button 1, bitmask 2 for Microsoft Surface Pen)
    const isBarrelButtonPressed = (e.buttons & 2) !== 0 && e.pointerType === 'pen';

    // If barrel button is pressed, start scrolling mode with stylus
    if (isBarrelButtonPressed) {
        tempScrollFromBarrelButton = true;
        previousToolBeforeBarrelScroll = currentTool;

        // Update UI to show scroll mode is active
        scrollIcon.innerHTML = '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 11V4a2 2 0 0 0-4 0v7M10 11V6a2 2 0 0 0-4 0v5M6 11v4a8 8 0 0 0 8 8h.3a8 8 0 0 0 7.7-6.1l1-4A2 2 0 0 0 21 10h-2"></path><circle cx="14" cy="14" r="10" opacity="0.3" fill="currentColor"></circle>';
        scrollToggleBtn.title = 'Barrel Button Scrolling';
        scrollToggleBtn.classList.add('tool-active');

        // Start scroll tracking
        activePointerId = e.pointerId;
        isDrawing = true; // Use isDrawing to track that we're in barrel button scroll mode
        const pos = getPointerPos(e);
        currentPoints = [pos]; // Store starting position for scroll delta

        // Don't draw, just track for scrolling
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
    } else if (currentTool === 'lasso') {
        // Check if clicking on a resize handle
        const handle = getResizeHandle(pos.x, pos.y);
        if (handle) {
            isResizingSelection = true;
            resizeHandle = handle;
            dragStartPos = pos;
            resizeStartBounds = { ...selectionBounds };
            // Save original annotation data
            const pageAnnotations = annotations[pageNum];
            resizeStartAnnotations = selectedAnnotations.map(index => ({
                index,
                points: pageAnnotations[index].points.map(p => ({ ...p }))
            }));
        } else if (isPointInSelectionBox(pos.x, pos.y)) {
            // Click inside selection box to drag
            isDraggingSelection = true;
            dragStartPos = pos;
        } else {
            // Start new lasso selection
            clearSelection();
            isLassoing = true;
            lassoPoints = [pos];
            activeStrokeCtx.strokeStyle = '#0099FF';
            activeStrokeCtx.lineWidth = 2;
            activeStrokeCtx.setLineDash([5, 5]); // Dashed line
            activeStrokeCtx.lineCap = 'round';
            activeStrokeCtx.lineJoin = 'round';
            activeStrokeCtx.beginPath();
            activeStrokeCtx.moveTo(pos.x, pos.y);
            // Sync initial lasso point to presentation
            syncPresentationActiveStroke(lassoPoints, 'lasso', '#0099FF', 2, 1);
        }
    } else if (currentTool === 'laser') {
        // Cancel any ongoing fade animation when starting new laser stroke
        if (laserFadeAnimationId) {
            cancelAnimationFrame(laserFadeAnimationId);
            laserFadeAnimationId = null;
        }

        // Ensure full opacity when drawing
        laserFadeOpacity = 1.0;

        // Setup laser - same as pen but red
        activeStrokeCtx.strokeStyle = '#FF0000'; // Red color
        activeStrokeCtx.lineWidth = 4; // Medium size
        activeStrokeCtx.lineCap = 'round';
        activeStrokeCtx.lineJoin = 'round';

        activeStrokeCtx.beginPath();
        activeStrokeCtx.moveTo(pos.x, pos.y);
    } else if (currentTool === 'pen') {
        // Setup canvas context for drawing - match SVG stroke exactly
        activeStrokeCtx.strokeStyle = currentColor;
        activeStrokeCtx.lineWidth = currentStrokeWidth;
        activeStrokeCtx.lineCap = 'round';
        activeStrokeCtx.lineJoin = 'round';
        // Clear any shadow settings from laser
        activeStrokeCtx.shadowBlur = 0;
        activeStrokeCtx.shadowColor = 'transparent';

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

    // Handle barrel button scrolling
    if (tempScrollFromBarrelButton) {
        const lastPos = currentPoints[currentPoints.length - 1];
        const dx = pos.x - lastPos.x;
        const dy = pos.y - lastPos.y;

        // Scroll the canvas container
        canvasContainer.scrollLeft -= dx;
        canvasContainer.scrollTop -= dy;

        // Update position for next delta
        currentPoints = [pos];
        return;
    }

    if (isEraserActive) {
        // Draw eraser preview and erase
        drawEraserPreview(pos.x, pos.y);
        eraseAtPoint(pos.x, pos.y);
        return;
    }

    if (currentTool === 'lasso') {
        if (isResizingSelection && dragStartPos && resizeHandle) {
            // Resize selected annotations
            resizeSelectedAnnotations(pos);
            return;
        } else if (isDraggingSelection && dragStartPos) {
            // Drag selected annotations
            const dx = pos.x - dragStartPos.x;
            const dy = pos.y - dragStartPos.y;
            moveSelectedAnnotations(dx, dy);
            dragStartPos = pos;
            return;
        } else if (isLassoing) {
            // Draw lasso path
            lassoPoints.push(pos);
            activeStrokeCtx.lineTo(pos.x, pos.y);
            activeStrokeCtx.stroke();
            // Sync lasso to presentation
            syncPresentationActiveStroke(lassoPoints, 'lasso', '#0099FF', 2, 1);
            return;
        }
    }

    if (currentTool === 'laser' || currentTool === 'pen') {
        // Continue drawing (works for both laser and pen)
        // If laser, ensure opacity is at 100% while actively drawing
        if (currentTool === 'laser') {
            laserFadeOpacity = 1.0;
        }
    } else {
        return;
    }

    // Only add point if it's far enough from the last one (reduce noise)
    const lastPoint = currentPoints[currentPoints.length - 1];
    const distance = Math.sqrt(
        Math.pow(pos.x - lastPoint.x, 2) +
        Math.pow(pos.y - lastPoint.y, 2)
    );

    // Minimum distance threshold to reduce jitter (optimized for performance)
    if (distance < 4) return;

    currentPoints.push(pos);

    // Sync real-time drawing to presentation
    if (currentTool === 'pen') {
        syncPresentationActiveStroke(currentPoints, 'pen', currentColor, currentStrokeWidth, 1);
    } else if (currentTool === 'laser') {
        syncPresentationActiveStroke(currentPoints, 'laser', '#FF0000', 4, laserFadeOpacity);
    }

    // Draw smooth curve on canvas
    if (currentPoints.length >= 3) {
        // Clear and redraw with smooth curve
        activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);

        // If laser tool, redraw all saved laser strokes first
        if (currentTool === 'laser') {
            // Include current stroke being drawn for real-time sync to presentation
            redrawLaserStrokes(1.0, true); // Force full opacity while drawing

            // Set up context for laser (since we cleared and used save/restore)
            activeStrokeCtx.strokeStyle = '#FF0000';
            activeStrokeCtx.lineWidth = 4;
            activeStrokeCtx.lineCap = 'round';
            activeStrokeCtx.lineJoin = 'round';
            // Add blur/glow effect (optimized for performance)
            activeStrokeCtx.shadowBlur = 10;
            activeStrokeCtx.shadowColor = 'rgba(255, 0, 0, 0.9)';
            activeStrokeCtx.shadowOffsetX = 0;
            activeStrokeCtx.shadowOffsetY = 0;
            activeStrokeCtx.globalCompositeOperation = 'source-over';
        }

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

        // For laser, draw thin bright core line on top
        if (currentTool === 'laser') {
            activeStrokeCtx.strokeStyle = 'rgba(255, 200, 200, 1.0)'; // Bright pinkish-white core
            activeStrokeCtx.lineWidth = 0.8; // Very thin core line
            activeStrokeCtx.shadowBlur = 0; // No blur for the core
            activeStrokeCtx.shadowColor = 'transparent';

            activeStrokeCtx.beginPath();
            activeStrokeCtx.moveTo(currentPoints[0].x, currentPoints[0].y);

            for (let i = 1; i < currentPoints.length - 1; i++) {
                const curr = currentPoints[i];
                const next = currentPoints[i + 1];
                const midX = (curr.x + next.x) / 2;
                const midY = (curr.y + next.y) / 2;
                activeStrokeCtx.quadraticCurveTo(curr.x, curr.y, midX, midY);
            }

            activeStrokeCtx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);
            activeStrokeCtx.stroke();
        }

        // Reset shadow settings after drawing (for non-laser tools)
        if (currentTool !== 'laser') {
            activeStrokeCtx.shadowBlur = 0;
            activeStrokeCtx.shadowColor = 'transparent';
        }
    } else {
        // For first few points, just draw lines
        // If laser tool, we need to preserve saved strokes
        if (currentTool === 'laser') {
            // Clear and redraw everything for laser
            activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);

            // Redraw all saved laser strokes with full opacity, including current stroke
            redrawLaserStrokes(1.0, true); // Force full opacity while drawing

            // Draw current stroke with simple lines (for first few points)
            activeStrokeCtx.save();
            activeStrokeCtx.strokeStyle = '#FF0000';
            activeStrokeCtx.lineWidth = 4;
            activeStrokeCtx.lineCap = 'round';
            activeStrokeCtx.lineJoin = 'round';
            // Add blur/glow effect (optimized for performance)
            activeStrokeCtx.shadowBlur = 10;
            activeStrokeCtx.shadowColor = 'rgba(255, 0, 0, 0.9)';
            activeStrokeCtx.shadowOffsetX = 0;
            activeStrokeCtx.shadowOffsetY = 0;
            activeStrokeCtx.globalCompositeOperation = 'source-over';
            activeStrokeCtx.beginPath();
            activeStrokeCtx.moveTo(currentPoints[0].x, currentPoints[0].y);
            for (let i = 1; i < currentPoints.length; i++) {
                activeStrokeCtx.lineTo(currentPoints[i].x, currentPoints[i].y);
            }
            activeStrokeCtx.stroke();

            // Draw thin bright core line on top
            activeStrokeCtx.strokeStyle = 'rgba(255, 200, 200, 1.0)'; // Bright pinkish-white core
            activeStrokeCtx.lineWidth = 0.8; // Very thin core line
            activeStrokeCtx.shadowBlur = 0; // No blur for the core
            activeStrokeCtx.shadowColor = 'transparent';
            activeStrokeCtx.beginPath();
            activeStrokeCtx.moveTo(currentPoints[0].x, currentPoints[0].y);
            for (let i = 1; i < currentPoints.length; i++) {
                activeStrokeCtx.lineTo(currentPoints[i].x, currentPoints[i].y);
            }
            activeStrokeCtx.stroke();

            activeStrokeCtx.restore();
        } else {
            // For pen tool, just continue drawing
            activeStrokeCtx.lineTo(pos.x, pos.y);
            activeStrokeCtx.stroke();
        }
    }
}

function endDrawing(e) {
    // Check if barrel button was released - if so, restore previous mode
    if (e && tempScrollFromBarrelButton && (e.buttons & 2) === 0) {
        // Barrel button released - disable temp scroll mode
        tempScrollFromBarrelButton = false;

        // Restore scroll button UI
        scrollIcon.innerHTML = '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 11V4a2 2 0 0 0-4 0v7M10 11V6a2 2 0 0 0-4 0v5M6 11v4a8 8 0 0 0 8 8h.3a8 8 0 0 0 7.7-6.1l1-4A2 2 0 0 0 21 10h-2"></path><line x1="12" y1="2" x2="12" y2="22" stroke-dasharray="2,2" opacity="0.5"></line>';
        scrollToggleBtn.title = 'Enable Finger Scroll';
        scrollToggleBtn.classList.remove('tool-active');

        // Restore previous tool if it was stored
        if (previousToolBeforeBarrelScroll !== null) {
            currentTool = previousToolBeforeBarrelScroll;
            previousToolBeforeBarrelScroll = null;
        }

        // Reset drawing state
        isDrawing = false;
        activePointerId = null;
        currentPoints = [];

        return;
    }

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

    // Complete lasso selection
    if (isLassoing && currentTool === 'lasso' && lassoPoints.length > 2) {
        completeLassoSelection();
        clearPresentationActiveStroke();
    }

    // Save laser stroke for temporary display
    if (currentTool === 'laser' && currentPoints.length > 1) {
        saveLaserStroke();
        // Don't clear presentation active stroke for laser - let it fade naturally
    } else if (currentTool === 'pen' && currentPoints.length > 1) {
        // Clear active stroke for pen when finished
        clearPresentationActiveStroke();
    }

    isDrawing = false;
    isLassoing = false;
    isDraggingSelection = false;
    isResizingSelection = false;
    resizeHandle = null;
    dragStartPos = null;
    resizeStartBounds = null;
    resizeStartAnnotations = null;
    activePointerId = null; // Clear active pointer
    const wasEraserActive = isEraserActive;
    isEraserActive = false; // Reset eraser state

    if (!wasEraserActive && currentTool === 'pen' && currentPoints.length >= 1) {
        // Extract normalized coordinates for storage
        const normalizedPoints = currentPoints.map(p => ({
            x: p.normalizedX,
            y: p.normalizedY
        }));

        // Handle single-point tap (dot/period)
        if (currentPoints.length === 1) {
            // Create a small circle for a dot
            const point = currentPoints[0];
            const radius = currentStrokeWidth / 2; // Dot size matches stroke width

            // Draw a circle using SVG
            const svgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            svgCircle.setAttribute('cx', point.x);
            svgCircle.setAttribute('cy', point.y);
            svgCircle.setAttribute('r', radius);
            svgCircle.setAttribute('fill', currentColor);
            annotationLayer.appendChild(svgCircle);

            // Save as annotation
            if (!annotations[pageNum]) {
                annotations[pageNum] = [];
            }

            annotations[pageNum].push({
                type: 'circle',
                element: svgCircle,
                color: currentColor,
                width: currentStrokeWidth,
                points: normalizedPoints,
                radius: radius
            });
        } else {
            // Multiple points - draw as path (normal stroke)
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
        }

        // Clear active stroke canvas
        activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);

        // Clear redo stack when new stroke is added
        undoStack[pageNum] = [];

        updateUndoRedoButtons();
        syncPresentationAnnotations();
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
    syncPresentationAnnotations();
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

    if (strokeToRedo.type === 'circle') {
        // Handle circle annotations (dots/periods)
        const newCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        newCircle.setAttribute('cx', screenPoints[0].x);
        newCircle.setAttribute('cy', screenPoints[0].y);
        newCircle.setAttribute('r', strokeToRedo.radius);
        newCircle.setAttribute('fill', strokeToRedo.color);
        annotationLayer.appendChild(newCircle);

        // Update element reference
        strokeToRedo.element = newCircle;
    } else {
        // Handle path annotations (strokes)
        const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        newPath.setAttribute('stroke', strokeToRedo.color);
        newPath.setAttribute('stroke-width', strokeToRedo.width);
        newPath.setAttribute('d', pointsToPath(screenPoints));
        annotationLayer.appendChild(newPath);

        // Update element reference
        strokeToRedo.element = newPath;
    }

    // Add back to annotations
    if (!annotations[pageNum]) {
        annotations[pageNum] = [];
    }
    annotations[pageNum].push(strokeToRedo);

    updateUndoRedoButtons();
    syncPresentationAnnotations();
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
    syncPresentationAnnotations();
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

            if (annotation.type === 'circle') {
                // Handle circle annotations (dots/periods from single taps)
                const newCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                newCircle.setAttribute('cx', screenPoints[0].x);
                newCircle.setAttribute('cy', screenPoints[0].y);
                newCircle.setAttribute('r', annotation.radius);
                newCircle.setAttribute('fill', annotation.color);
                annotation.element = newCircle;
                annotationLayer.appendChild(newCircle);
            } else {
                // Handle path annotations (strokes)
                const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                newPath.setAttribute('stroke', annotation.color);
                newPath.setAttribute('stroke-width', annotation.width);
                newPath.setAttribute('d', pointsToPath(screenPoints));
                annotation.element = newPath;
                annotationLayer.appendChild(newPath);
            }
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
    // Clear any shadow settings from laser
    activeStrokeCtx.shadowBlur = 0;
    activeStrokeCtx.shadowColor = 'transparent';
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

            // Check if this annotation is in the selection
            const selectionIndex = selectedAnnotations.indexOf(i);
            if (selectionIndex !== -1) {
                // Remove from selection
                selectedAnnotations.splice(selectionIndex, 1);
            }

            // Remove from array
            pageAnnotations.splice(i, 1);

            // Adjust selection indices since we removed an annotation
            // All indices >= i need to be decremented by 1
            selectedAnnotations = selectedAnnotations.map(idx => idx > i ? idx - 1 : idx);
        }
    }

    // If all selected annotations were erased, clear the selection box
    if (selectedAnnotations.length === 0 && selectionBounds) {
        clearSelection();
        syncPresentationSelectionBox(); // Clear selection box from presentation
    } else if (selectedAnnotations.length > 0) {
        // Recalculate selection box for remaining selected annotations
        drawSelectionBox();
    }

    // Clear redo stack when erasing
    undoStack[pageNum] = [];

    updateUndoRedoButtons();
    syncPresentationAnnotations();
}

// ============================================
// LASER POINTER FUNCTIONS
// ============================================

function saveLaserStroke() {
    // Store the laser stroke
    const laserStroke = {
        points: currentPoints.map(p => ({ x: p.x, y: p.y }))
    };

    laserStrokes.push(laserStroke);
    lastLaserStrokeTime = Date.now();

    // Reset opacity when new stroke is added
    laserFadeOpacity = 1.0;

    // Cancel any ongoing fade animation
    if (laserFadeAnimationId) {
        cancelAnimationFrame(laserFadeAnimationId);
        laserFadeAnimationId = null;
    }

    // Clear any existing timeout
    if (laserClearTimeout) {
        clearTimeout(laserClearTimeout);
    }

    // Set timeout to start fade after 0.5 seconds of no activity
    laserClearTimeout = setTimeout(() => {
        startLaserFade();
    }, 500);

    // Clear the canvas first to avoid double-drawing
    activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);

    // Redraw all laser strokes (including the one we just saved)
    redrawLaserStrokes(1.0);

    // CRITICAL: Sync all laser strokes to presentation after completing a stroke
    syncPresentationLaserStrokes(laserStrokes, 1.0);
}

function redrawLaserStrokes(opacity = null, includeCurrentStroke = false) {
    // Don't clear - just draw all laser strokes
    // (caller is responsible for clearing if needed)

    // Use provided opacity or current fade opacity
    // When actively drawing (opacity = 1.0), always use full opacity
    const useOpacity = opacity !== null ? opacity : laserFadeOpacity;

    // Build list of strokes to sync (include current stroke if actively drawing)
    let strokesToSync = [...laserStrokes];
    if (includeCurrentStroke && currentPoints.length > 0) {
        strokesToSync.push({
            points: currentPoints.map(p => ({ x: p.x, y: p.y }))
        });
    }

    // CRITICAL FIX: Only sync ALL laser strokes when NOT actively drawing
    // While drawing, ACTIVE_STROKE handles the current stroke (no flickering)
    // After drawing completes, LASER_STROKES handles fade-out animation
    if (!isDrawing) {
        syncPresentationLaserStrokes(strokesToSync, useOpacity);
    }

    // Save current context state
    activeStrokeCtx.save();

    // Draw all laser strokes with smooth curves (same as pen)
    // Use rgba to support fade opacity
    const red = 255;
    const green = 0;
    const blue = 0;
    activeStrokeCtx.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${useOpacity})`;
    activeStrokeCtx.lineWidth = 4;
    activeStrokeCtx.lineCap = 'round';
    activeStrokeCtx.lineJoin = 'round';

    // Add blur/glow effect (optimized for performance)
    activeStrokeCtx.shadowBlur = 10;
    activeStrokeCtx.shadowColor = `rgba(${red}, ${green}, ${blue}, ${useOpacity * 0.9})`;
    activeStrokeCtx.shadowOffsetX = 0;
    activeStrokeCtx.shadowOffsetY = 0;
    // Prevent shadow stacking - draw blur only once per stroke
    activeStrokeCtx.globalCompositeOperation = 'source-over';

    laserStrokes.forEach(stroke => {
        if (stroke.points.length === 0) return;

        activeStrokeCtx.beginPath();
        activeStrokeCtx.moveTo(stroke.points[0].x, stroke.points[0].y);

        if (stroke.points.length >= 3) {
            // Draw smooth quadratic curves (same technique as pen)
            for (let i = 1; i < stroke.points.length - 1; i++) {
                const curr = stroke.points[i];
                const next = stroke.points[i + 1];
                const midX = (curr.x + next.x) / 2;
                const midY = (curr.y + next.y) / 2;
                activeStrokeCtx.quadraticCurveTo(curr.x, curr.y, midX, midY);
            }

            // Draw to last point
            const last = stroke.points[stroke.points.length - 1];
            const secondLast = stroke.points[stroke.points.length - 2];
            activeStrokeCtx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);
        } else {
            // For strokes with few points, just draw lines
            for (let i = 1; i < stroke.points.length; i++) {
                activeStrokeCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
        }

        activeStrokeCtx.stroke();
    });

    // Draw thin bright core line on top of each stroke
    activeStrokeCtx.strokeStyle = `rgba(255, 200, 200, ${useOpacity})`; // Bright pinkish-white core
    activeStrokeCtx.lineWidth = 0.8; // Very thin core line
    activeStrokeCtx.shadowBlur = 0; // No blur for the core
    activeStrokeCtx.shadowColor = 'transparent';

    laserStrokes.forEach(stroke => {
        if (stroke.points.length === 0) return;

        activeStrokeCtx.beginPath();
        activeStrokeCtx.moveTo(stroke.points[0].x, stroke.points[0].y);

        if (stroke.points.length >= 3) {
            // Draw smooth quadratic curves (same technique as outer glow)
            for (let i = 1; i < stroke.points.length - 1; i++) {
                const curr = stroke.points[i];
                const next = stroke.points[i + 1];
                const midX = (curr.x + next.x) / 2;
                const midY = (curr.y + next.y) / 2;
                activeStrokeCtx.quadraticCurveTo(curr.x, curr.y, midX, midY);
            }

            // Draw to last point
            const last = stroke.points[stroke.points.length - 1];
            const secondLast = stroke.points[stroke.points.length - 2];
            activeStrokeCtx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);
        } else {
            // For strokes with few points, just draw lines
            for (let i = 1; i < stroke.points.length; i++) {
                activeStrokeCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
        }

        activeStrokeCtx.stroke();
    });

    // Restore context state
    activeStrokeCtx.restore();
}

function startLaserFade() {
    // Start fade animation
    const fadeStartTime = performance.now();
    const fadeDuration = 500; // 0.5 second fade

    function animateFade(currentTime) {
        // CRITICAL: Stop fade animation if user starts drawing again
        if (isDrawing && currentTool === 'laser') {
            laserFadeOpacity = 1.0;
            laserFadeAnimationId = null;
            return;
        }

        const elapsed = currentTime - fadeStartTime;
        const progress = Math.min(elapsed / fadeDuration, 1);

        // Ease-out cubic for smooth fade
        laserFadeOpacity = 1 - (progress * progress * progress);

        // Clear and redraw with new opacity
        activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);

        if (laserStrokes.length > 0) {
            redrawLaserStrokes();
        }

        if (progress < 1) {
            // Continue animation
            laserFadeAnimationId = requestAnimationFrame(animateFade);
        } else {
            // Fade complete, clear everything
            clearLaserStrokes();
        }
    }

    laserFadeAnimationId = requestAnimationFrame(animateFade);
}

function clearLaserStrokes() {
    laserStrokes = [];
    laserFadeOpacity = 1.0;
    activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);

    // Clear laser from presentation
    clearPresentationActiveStroke();

    if (laserClearTimeout) {
        clearTimeout(laserClearTimeout);
        laserClearTimeout = null;
    }

    if (laserFadeAnimationId) {
        cancelAnimationFrame(laserFadeAnimationId);
        laserFadeAnimationId = null;
    }
}

// ============================================
// LASSO SELECTION FUNCTIONS
// ============================================

function completeLassoSelection() {
    // Close the lasso path
    activeStrokeCtx.closePath();
    activeStrokeCtx.stroke();

    // Find annotations inside lasso
    selectAnnotationsInLasso();

    // Clear lasso drawing and show selection box
    setTimeout(() => {
        activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);
        activeStrokeCtx.setLineDash([]); // Reset line dash

        // Redraw selection box if we have selected annotations
        if (selectedAnnotations.length > 0 && selectionBounds) {
            const { minX, minY, maxX, maxY } = selectionBounds;
            activeStrokeCtx.save();
            activeStrokeCtx.strokeStyle = '#0099FF';
            activeStrokeCtx.lineWidth = 2;
            activeStrokeCtx.setLineDash([5, 5]);
            activeStrokeCtx.strokeRect(minX, minY, maxX - minX, maxY - minY);
            activeStrokeCtx.restore();
        }
    }, 200);

    lassoPoints = [];
}

function selectAnnotationsInLasso() {
    const pageAnnotations = annotations[pageNum];
    if (!pageAnnotations || pageAnnotations.length === 0) return;

    // Clear previous selection
    clearSelection();

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    // Check each annotation
    pageAnnotations.forEach((annotation, index) => {
        // Convert normalized points to screen coordinates
        const screenPoints = annotation.points.map(p => ({
            x: p.x * width,
            y: p.y * height
        }));

        // Check if any point of the annotation is inside the lasso
        let isSelected = false;
        for (const point of screenPoints) {
            if (isPointInPolygon(point, lassoPoints)) {
                isSelected = true;
                break;
            }
        }

        if (isSelected) {
            selectedAnnotations.push(index);
        }
    });

    if (selectedAnnotations.length > 0) {
        // Calculate and draw bounding box
        drawSelectionBox();
    }

    console.log(`Selected ${selectedAnnotations.length} annotations`);
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

function clearSelection() {
    selectedAnnotations = [];
    selectionBounds = null;

    // Clear selection box from canvas
    if (!isDrawing && !isDraggingSelection) {
        activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);
    }

    // Sync cleared selection to presentation
    syncPresentationSelectionBox();
}

function drawSelectionBox() {
    const pageAnnotations = annotations[pageNum];
    if (!pageAnnotations || selectedAnnotations.length === 0) return;

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    // Calculate bounding box of selected annotations
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    selectedAnnotations.forEach(index => {
        const annotation = pageAnnotations[index];
        annotation.points.forEach(p => {
            const x = p.x * width;
            const y = p.y * height;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        });
    });

    // Add padding
    const padding = 10;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    selectionBounds = { minX, minY, maxX, maxY };

    // Draw selection box
    activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);
    activeStrokeCtx.save();
    activeStrokeCtx.strokeStyle = '#0099FF';
    activeStrokeCtx.lineWidth = 2;
    activeStrokeCtx.setLineDash([5, 5]);
    activeStrokeCtx.strokeRect(minX, minY, maxX - minX, maxY - minY);

    // Draw resize handles at corners
    activeStrokeCtx.fillStyle = '#0099FF';
    activeStrokeCtx.setLineDash([]); // Solid fill for handles
    const halfHandle = HANDLE_SIZE / 2;

    // Top-left
    activeStrokeCtx.fillRect(minX - halfHandle, minY - halfHandle, HANDLE_SIZE, HANDLE_SIZE);
    // Top-right
    activeStrokeCtx.fillRect(maxX - halfHandle, minY - halfHandle, HANDLE_SIZE, HANDLE_SIZE);
    // Bottom-left
    activeStrokeCtx.fillRect(minX - halfHandle, maxY - halfHandle, HANDLE_SIZE, HANDLE_SIZE);
    // Bottom-right
    activeStrokeCtx.fillRect(maxX - halfHandle, maxY - halfHandle, HANDLE_SIZE, HANDLE_SIZE);

    activeStrokeCtx.restore();

    // Sync selection box to presentation
    syncPresentationSelectionBox();
}

function getResizeHandle(x, y) {
    if (!selectionBounds) return null;

    const { minX, minY, maxX, maxY } = selectionBounds;
    const halfHandle = HANDLE_SIZE / 2;

    // Check each corner handle
    // Top-left
    if (Math.abs(x - minX) <= halfHandle && Math.abs(y - minY) <= halfHandle) {
        return 'nw';
    }
    // Top-right
    if (Math.abs(x - maxX) <= halfHandle && Math.abs(y - minY) <= halfHandle) {
        return 'ne';
    }
    // Bottom-left
    if (Math.abs(x - minX) <= halfHandle && Math.abs(y - maxY) <= halfHandle) {
        return 'sw';
    }
    // Bottom-right
    if (Math.abs(x - maxX) <= halfHandle && Math.abs(y - maxY) <= halfHandle) {
        return 'se';
    }

    return null;
}

function isPointInSelectionBox(x, y) {
    if (!selectionBounds) return false;
    const { minX, minY, maxX, maxY } = selectionBounds;
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

function moveSelectedAnnotations(dx, dy) {
    const pageAnnotations = annotations[pageNum];
    if (!pageAnnotations) return;

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    // Convert pixel delta to normalized delta
    const normalizedDx = dx / width;
    const normalizedDy = dy / height;

    selectedAnnotations.forEach(index => {
        const annotation = pageAnnotations[index];

        // Update normalized points
        annotation.points = annotation.points.map(p => ({
            x: p.x + normalizedDx,
            y: p.y + normalizedDy
        }));

        // Update SVG element
        const screenPoints = annotation.points.map(p => ({
            x: p.x * width,
            y: p.y * height,
            normalizedX: p.x,
            normalizedY: p.y
        }));

        if (annotation.type === 'circle') {
            // Update circle position
            annotation.element.setAttribute('cx', screenPoints[0].x);
            annotation.element.setAttribute('cy', screenPoints[0].y);
        } else {
            // Update path
            annotation.element.setAttribute('d', pointsToPath(screenPoints));
        }
    });

    // Update selection box position
    if (selectionBounds) {
        selectionBounds.minX += dx;
        selectionBounds.minY += dy;
        selectionBounds.maxX += dx;
        selectionBounds.maxY += dy;

        // Request redraw in next frame for smoother rendering
        if (!selectionBoxNeedsRedraw) {
            selectionBoxNeedsRedraw = true;
            requestAnimationFrame(() => {
                if (selectionBounds) {
                    const { minX, minY, maxX, maxY } = selectionBounds;
                    activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);
                    activeStrokeCtx.save();
                    activeStrokeCtx.strokeStyle = '#0099FF';
                    activeStrokeCtx.lineWidth = 2;
                    activeStrokeCtx.setLineDash([5, 5]);
                    activeStrokeCtx.strokeRect(minX, minY, maxX - minX, maxY - minY);

                    // Draw resize handles
                    activeStrokeCtx.fillStyle = '#0099FF';
                    activeStrokeCtx.setLineDash([]);
                    const halfHandle = HANDLE_SIZE / 2;
                    activeStrokeCtx.fillRect(minX - halfHandle, minY - halfHandle, HANDLE_SIZE, HANDLE_SIZE);
                    activeStrokeCtx.fillRect(maxX - halfHandle, minY - halfHandle, HANDLE_SIZE, HANDLE_SIZE);
                    activeStrokeCtx.fillRect(minX - halfHandle, maxY - halfHandle, HANDLE_SIZE, HANDLE_SIZE);
                    activeStrokeCtx.fillRect(maxX - halfHandle, maxY - halfHandle, HANDLE_SIZE, HANDLE_SIZE);

                    activeStrokeCtx.restore();
                }
                selectionBoxNeedsRedraw = false;
                // Sync selection box to presentation
                syncPresentationSelectionBox();
            });
        }
    }

    // Sync moved annotations to presentation in real-time
    syncPresentationAnnotations();
}

function resizeSelectedAnnotations(currentPos) {
    if (!resizeStartBounds || !resizeStartAnnotations || !resizeHandle) return;

    const pageAnnotations = annotations[pageNum];
    if (!pageAnnotations) return;

    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    // Calculate original dimensions
    const oldWidth = resizeStartBounds.maxX - resizeStartBounds.minX;
    const oldHeight = resizeStartBounds.maxY - resizeStartBounds.minY;
    const aspectRatio = oldWidth / oldHeight;

    // Calculate the distance from the opposite corner (anchor point)
    let anchorX, anchorY, newWidth, newHeight;

    switch (resizeHandle) {
        case 'nw': // Top-left (anchor: bottom-right)
            anchorX = resizeStartBounds.maxX;
            anchorY = resizeStartBounds.maxY;
            // Calculate new width and height based on pointer position
            const nwWidth = anchorX - currentPos.x;
            const nwHeight = anchorY - currentPos.y;
            // Use the larger scale factor to maintain aspect ratio
            const nwScale = Math.max(Math.abs(nwWidth / oldWidth), Math.abs(nwHeight / oldHeight));
            newWidth = oldWidth * nwScale;
            newHeight = oldHeight * nwScale;
            break;
        case 'ne': // Top-right (anchor: bottom-left)
            anchorX = resizeStartBounds.minX;
            anchorY = resizeStartBounds.maxY;
            const neWidth = currentPos.x - anchorX;
            const neHeight = anchorY - currentPos.y;
            const neScale = Math.max(Math.abs(neWidth / oldWidth), Math.abs(neHeight / oldHeight));
            newWidth = oldWidth * neScale;
            newHeight = oldHeight * neScale;
            break;
        case 'sw': // Bottom-left (anchor: top-right)
            anchorX = resizeStartBounds.maxX;
            anchorY = resizeStartBounds.minY;
            const swWidth = anchorX - currentPos.x;
            const swHeight = currentPos.y - anchorY;
            const swScale = Math.max(Math.abs(swWidth / oldWidth), Math.abs(swHeight / oldHeight));
            newWidth = oldWidth * swScale;
            newHeight = oldHeight * swScale;
            break;
        case 'se': // Bottom-right (anchor: top-left)
            anchorX = resizeStartBounds.minX;
            anchorY = resizeStartBounds.minY;
            const seWidth = currentPos.x - anchorX;
            const seHeight = currentPos.y - anchorY;
            const seScale = Math.max(Math.abs(seWidth / oldWidth), Math.abs(seHeight / oldHeight));
            newWidth = oldWidth * seScale;
            newHeight = oldHeight * seScale;
            break;
    }

    // Calculate new bounds based on anchor point and new dimensions
    let newMinX, newMinY, newMaxX, newMaxY;

    switch (resizeHandle) {
        case 'nw': // Top-left
            newMaxX = anchorX;
            newMaxY = anchorY;
            newMinX = anchorX - newWidth;
            newMinY = anchorY - newHeight;
            break;
        case 'ne': // Top-right
            newMinX = anchorX;
            newMaxY = anchorY;
            newMaxX = anchorX + newWidth;
            newMinY = anchorY - newHeight;
            break;
        case 'sw': // Bottom-left
            newMaxX = anchorX;
            newMinY = anchorY;
            newMinX = anchorX - newWidth;
            newMaxY = anchorY + newHeight;
            break;
        case 'se': // Bottom-right
            newMinX = anchorX;
            newMinY = anchorY;
            newMaxX = anchorX + newWidth;
            newMaxY = anchorY + newHeight;
            break;
    }

    // Calculate uniform scale factor (same for both X and Y to maintain aspect ratio)
    const scale = newWidth / oldWidth;

    // Apply uniform scaling to annotations (maintains aspect ratio)
    resizeStartAnnotations.forEach(({ index, points }) => {
        const annotation = pageAnnotations[index];

        // Scale each point relative to the resize anchor
        annotation.points = points.map(p => {
            const screenX = p.x * width;
            const screenY = p.y * height;

            // Calculate relative position within original bounds
            const relX = (screenX - resizeStartBounds.minX) / oldWidth;
            const relY = (screenY - resizeStartBounds.minY) / oldHeight;

            // Apply uniform scale and translate to new bounds
            const newScreenX = newMinX + relX * newWidth;
            const newScreenY = newMinY + relY * newHeight;

            return {
                x: newScreenX / width,
                y: newScreenY / height
            };
        });

        // Update SVG element
        const screenPoints = annotation.points.map(p => ({
            x: p.x * width,
            y: p.y * height,
            normalizedX: p.x,
            normalizedY: p.y
        }));

        if (annotation.type === 'circle') {
            // Update circle position and scale radius
            annotation.element.setAttribute('cx', screenPoints[0].x);
            annotation.element.setAttribute('cy', screenPoints[0].y);
            annotation.element.setAttribute('r', annotation.radius * scale);
            // Update stored radius
            annotation.radius = annotation.radius * scale;
        } else {
            // Update path
            annotation.element.setAttribute('d', pointsToPath(screenPoints));
        }
    });

    // Update selection bounds
    selectionBounds = { minX: newMinX, minY: newMinY, maxX: newMaxX, maxY: newMaxY };

    // Redraw selection box with handles
    if (!selectionBoxNeedsRedraw) {
        selectionBoxNeedsRedraw = true;
        requestAnimationFrame(() => {
            if (selectionBounds) {
                const { minX, minY, maxX, maxY } = selectionBounds;
                activeStrokeCtx.clearRect(0, 0, activeStrokeCanvas.width, activeStrokeCanvas.height);
                activeStrokeCtx.save();
                activeStrokeCtx.strokeStyle = '#0099FF';
                activeStrokeCtx.lineWidth = 2;
                activeStrokeCtx.setLineDash([5, 5]);
                activeStrokeCtx.strokeRect(minX, minY, maxX - minX, maxY - minY);

                // Draw resize handles
                activeStrokeCtx.fillStyle = '#0099FF';
                activeStrokeCtx.setLineDash([]);
                const halfHandle = HANDLE_SIZE / 2;
                activeStrokeCtx.fillRect(minX - halfHandle, minY - halfHandle, HANDLE_SIZE, HANDLE_SIZE);
                activeStrokeCtx.fillRect(maxX - halfHandle, minY - halfHandle, HANDLE_SIZE, HANDLE_SIZE);
                activeStrokeCtx.fillRect(minX - halfHandle, maxY - halfHandle, HANDLE_SIZE, HANDLE_SIZE);
                activeStrokeCtx.fillRect(maxX - halfHandle, maxY - halfHandle, HANDLE_SIZE, HANDLE_SIZE);

                activeStrokeCtx.restore();
            }
            selectionBoxNeedsRedraw = false;
            // Sync selection box to presentation
            syncPresentationSelectionBox();
        });
    }

    // Sync resized annotations to presentation in real-time
    syncPresentationAnnotations();
}
// ============================================
// PRESENTATION MODE FUNCTIONS (Using Presentation API)
// ============================================

// Presentation state
let presentationRequest = null;
let presentationConnection = null;
let pdfFileData = null; // Store PDF data for presentation

// Store PDF data when loading
const originalLoadPDF = loadPDF;
function loadPDFWithPresentation(file) {
    // Read PDF file as array buffer for presentation
    const reader = new FileReader();
    reader.onload = function(e) {
        pdfFileData = e.target.result;
    };
    reader.readAsArrayBuffer(file);

    // Call original loadPDF function
    originalLoadPDF(file);
}

// Initialize Presentation Request
function initPresentationRequest() {
    if (!navigator.presentation) {
        console.warn('Presentation API not supported');
        return;
    }

    // Create presentation request with the receiver URL
    presentationRequest = new PresentationRequest(['presentation.html']);

    // Set as default request (allows browser cast button)
    navigator.presentation.defaultRequest = presentationRequest;

    console.log('Presentation request initialized');
}

// Present button click handler
if (presentBtn) {
    presentBtn.addEventListener('click', startPresentation);
}

async function startPresentation() {
    console.log('startPresentation called, current connection state:', presentationConnection?.state);

    // If already presenting, stop it
    if (presentationConnection && presentationConnection.state !== 'closed' && presentationConnection.state !== 'terminated') {
        console.log('Stopping existing presentation');
        stopPresentation();
        return;
    }

    if (!pdfDoc || !pdfFileData) {
        alert('Please load a PDF first');
        return;
    }

    if (!navigator.presentation) {
        alert('Presentation API is not supported in this browser. Please use Chrome or Edge.');
        return;
    }

    try {
        // Always recreate presentation request to ensure clean state
        console.log('Creating new presentation request');
        initPresentationRequest();

        console.log('Starting presentation...');
        // Start presentation - this opens the receiver and returns a PresentationConnection
        presentationConnection = await presentationRequest.start();
        console.log('Presentation started, connection state:', presentationConnection.state);

        setupPresentationConnection();

        // Update button appearance
        presentBtn.classList.add('tool-active');
        presentBtn.title = 'Stop Presenting';
    } catch (err) {
        console.error('Failed to start presentation:', err);
        if (err.name === 'NotAllowedError') {
            alert('Presentation was cancelled or not allowed');
        } else {
            alert('Failed to start presentation: ' + err.message);
        }
        // Clear connection on error
        presentationConnection = null;
    }
}

// Store handler references for cleanup
let presentationCloseHandler = null;
let presentationTerminateHandler = null;

function setupPresentationConnection() {
    if (!presentationConnection) return;

    console.log('Setting up presentation connection, state:', presentationConnection.state);

    // Define handlers
    presentationCloseHandler = () => {
        console.log('Presentation connection closed');
        stopPresentation();
    };

    presentationTerminateHandler = () => {
        console.log('Presentation connection terminated');
        stopPresentation();
    };

    // Connection state change
    presentationConnection.addEventListener('close', presentationCloseHandler);
    presentationConnection.addEventListener('terminate', presentationTerminateHandler);

    // Listen for state changes
    presentationConnection.addEventListener('statechange', () => {
        console.log('Connection state changed to:', presentationConnection.state);
    });

    // Wait for connection to be established, then send initial data
    if (presentationConnection.state === 'connected') {
        console.log('Connection already connected, sending data immediately');
        // Add small delay to ensure receiver is ready
        setTimeout(() => {
            sendInitialData();
        }, 500);
    } else {
        console.log('Waiting for connection to connect...');
        presentationConnection.addEventListener('connect', () => {
            console.log('Connection connected, sending initial data');
            setTimeout(() => {
                sendInitialData();
            }, 500);
        });
    }
}

function sendInitialData() {
    if (!presentationConnection || presentationConnection.state !== 'connected') {
        console.warn('Cannot send initial data - connection not ready. State:', presentationConnection?.state);
        return;
    }

    console.log('Sending initial data to presentation...');

    // Send PDF data
    console.log('Sending PDF data, size:', pdfFileData.byteLength, 'bytes');
    sendMessage({
        type: 'LOAD_PDF',
        pdfData: Array.from(new Uint8Array(pdfFileData))
    });

    // Send current page and scale
    console.log('Sending page:', pageNum, 'scale:', scale);
    sendMessage({
        type: 'PAGE_CHANGE',
        pageNum: pageNum
    });

    sendMessage({
        type: 'SCALE_CHANGE',
        scale: scale
    });

    // Send all annotations
    console.log('Sending annotations');
    sendMessage({
        type: 'ANNOTATIONS_UPDATE',
        annotations: annotations
    });

    console.log('Initial data sent successfully');
}

function sendMessage(message) {
    if (presentationConnection && presentationConnection.state === 'connected') {
        try {
            presentationConnection.send(JSON.stringify(message));
        } catch (err) {
            console.error('Failed to send message:', err);
        }
    }
}

function stopPresentation() {
    console.log('Stopping presentation, current state:', presentationConnection?.state);

    if (presentationConnection) {
        try {
            // Remove event listeners to prevent memory leaks and recursive calls
            if (presentationCloseHandler) {
                presentationConnection.removeEventListener('close', presentationCloseHandler);
            }
            if (presentationTerminateHandler) {
                presentationConnection.removeEventListener('terminate', presentationTerminateHandler);
            }

            if (presentationConnection.state !== 'closed' && presentationConnection.state !== 'terminated') {
                console.log('Terminating presentation connection');
                // Use terminate() instead of close() to fully end the presentation session
                presentationConnection.terminate();
            }
        } catch (err) {
            console.error('Error terminating presentation:', err);
        }
    }

    // Clear connection and handler references
    presentationConnection = null;
    presentationCloseHandler = null;
    presentationTerminateHandler = null;

    // Update button appearance
    if (presentBtn) {
        presentBtn.classList.remove('tool-active');
        presentBtn.title = 'Present to Second Screen';
    }

    console.log('Presentation terminated, connection cleared');
}

// Sync presentation with main window
function syncPresentationPage(num) {
    sendMessage({
        type: 'PAGE_CHANGE',
        pageNum: num
    });
}

function syncPresentationScale(newScale) {
    sendMessage({
        type: 'SCALE_CHANGE',
        scale: newScale
    });
}

function syncPresentationAnnotations() {
    sendMessage({
        type: 'ANNOTATIONS_UPDATE',
        annotations: annotations
    });
}

// Throttle real-time drawing updates
let lastDrawSyncTime = 0;
const DRAW_SYNC_THROTTLE = 16; // milliseconds (~60fps, optimized for performance)

function syncPresentationActiveStroke(points, tool, color, width, opacity) {
    const now = Date.now();
    if (now - lastDrawSyncTime < DRAW_SYNC_THROTTLE) {
        return; // Throttle to avoid too many messages
    }
    lastDrawSyncTime = now;

    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;

    // Normalize points
    const normalizedPoints = points.map(p => ({
        x: p.x / canvasWidth,
        y: p.y / canvasHeight
    }));

    console.log('Syncing active stroke:', tool, 'points:', points.length);
    sendMessage({
        type: 'ACTIVE_STROKE',
        points: normalizedPoints,
        tool: tool,
        color: color,
        width: width,
        opacity: opacity
    });
}

function clearPresentationActiveStroke() {
    sendMessage({
        type: 'CLEAR_ACTIVE_STROKE'
    });
}

// Throttle laser stroke updates - same as pen strokes for consistency
let lastLaserSyncTime = 0;
const LASER_SYNC_THROTTLE = 16; // milliseconds (~60fps, optimized for performance)

function syncPresentationLaserStrokes(strokes, opacity) {
    const now = Date.now();
    if (now - lastLaserSyncTime < LASER_SYNC_THROTTLE) {
        return; // Throttle to avoid too many messages
    }
    lastLaserSyncTime = now;

    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;

    // Normalize all laser strokes
    const normalizedStrokes = strokes.map(stroke => ({
        points: stroke.points.map(p => ({
            x: p.x / canvasWidth,
            y: p.y / canvasHeight
        }))
    }));

    sendMessage({
        type: 'LASER_STROKES',
        strokes: normalizedStrokes,
        opacity: opacity
    });
}

function syncPresentationSelectionBox() {
    if (!selectionBounds) {
        // Clear selection box from presentation
        sendMessage({
            type: 'CLEAR_SELECTION_BOX'
        });
        return;
    }

    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;

    // Normalize selection bounds
    const normalizedBounds = {
        minX: selectionBounds.minX / canvasWidth,
        minY: selectionBounds.minY / canvasHeight,
        maxX: selectionBounds.maxX / canvasWidth,
        maxY: selectionBounds.maxY / canvasHeight
    };

    sendMessage({
        type: 'SELECTION_BOX',
        bounds: normalizedBounds
    });
}

// Handle window close
window.addEventListener('beforeunload', () => {
    stopPresentation();
});

// Initialize presentation request when PDF is loaded
window.addEventListener('load', () => {
    if (navigator.presentation) {
        initPresentationRequest();
    }
});
