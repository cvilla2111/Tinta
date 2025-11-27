// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

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
const zoomLevelDisplay = document.getElementById('zoomLevel');
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
const penBtn = document.getElementById('penBtn');
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

// State for finger scroll
let fingerScrollEnabled = false;

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
    activeStrokeCanvas.style.touchAction = 'none'; // Re-enable stylus drawing
}

// Scroll toggle functionality
scrollToggleBtn.addEventListener('click', () => {
    fingerScrollEnabled = !fingerScrollEnabled;

    if (fingerScrollEnabled) {
        // Enabled - show hand with slash to indicate scrolling is active
        scrollIcon.innerHTML = '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 11V4a2 2 0 0 0-4 0v7M10 11V6a2 2 0 0 0-4 0v5M6 11v4a8 8 0 0 0 8 8h.3a8 8 0 0 0 7.7-6.1l1-4A2 2 0 0 0 21 10h-2"></path><circle cx="14" cy="14" r="10" opacity="0.3" fill="currentColor"></circle>';
        scrollToggleBtn.title = 'Disable Finger Scroll';
        scrollToggleBtn.classList.add('tool-active');
        activeStrokeCanvas.style.pointerEvents = 'none'; // Allow touch to pass through for scrolling
        activeStrokeCanvas.style.touchAction = 'auto'; // Allow touch scrolling
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
            headerRight.style.display = 'flex';

            // Initialize Ink API
            await initInkAPI();

            // Reset to first page
            pageNum = 1;

            // Calculate fit to width scale as default
            pdf.getPage(pageNum).then(page => {
                const canvasContainer = document.getElementById('canvasContainer');
                const containerWidth = canvasContainer.clientWidth;
                const viewport = page.getViewport({ scale: 1 });
                scale = containerWidth / viewport.width;
                fitMode = 'width'; // Set initial fit mode
                updateZoomDisplay();
                updateFitButton(); // Update button to show current mode
                renderPage(pageNum);
                updatePageControls();

                // Enter fullscreen after PDF is loaded
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(err => {
                        console.log('Fullscreen not available or denied:', err);
                    });
                }
            });
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
    if (scale >= 5) return;
    scale += 0.01;
    updateZoomDisplay();
    queueRenderPage(pageNum);
}

// Zoom out
function zoomOut() {
    if (scale <= 0.1) return;
    scale -= 0.01;
    updateZoomDisplay();
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
        updateZoomDisplay();
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
        updateZoomDisplay();
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

        updateZoomDisplay();
        queueRenderPage(pageNum);
    });
}

// Update fit button icon and title based on current mode
function updateFitButton() {
    const fitIcon = zoomFitBtn.querySelector('svg');

    if (fitMode === 'width') {
        // Fit to width icon (vertical lines)
        fitIcon.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line>';
        zoomFitBtn.title = 'Fit to Width';
    } else {
        // Fit to height icon (horizontal lines)
        fitIcon.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line>';
        zoomFitBtn.title = 'Fit to Height';
    }
}

// Update zoom display
function updateZoomDisplay() {
    zoomLevelDisplay.textContent = Math.round(scale * 100) + '%';
}

// Initialize zoom display
updateZoomDisplay();

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
        fullscreenIcon.innerHTML = '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>';
        fullscreenBtn.title = 'Exit Fullscreen';
    } else {
        // Not in fullscreen - show enter fullscreen icon
        fullscreenIcon.innerHTML = '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>';
        fullscreenBtn.title = 'Fullscreen';
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

    if (tool === 'pen') {
        penBtn.classList.add('tool-active');
        eraserBtn.classList.remove('tool-active');
        annotationLayer.classList.add('drawing-mode');
    } else if (tool === 'eraser') {
        eraserBtn.classList.add('tool-active');
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
