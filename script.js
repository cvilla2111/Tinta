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
let currentStrokeWidth = 2;

// Eraser indicator
let eraserIndicator = null;

// Laser pointer
let laserPointer = null;

// Active tool state
let activeTool = 'pen'; // 'pen', 'eraser', 'laser'

// PDF state
let pdfDoc = null;
let currentPage = 1;

// Store drawings per page (with viewBox dimensions)
let pageDrawings = {};
let currentViewBoxWidth = 0;
let currentViewBoxHeight = 0;

// Animation state
let isPageChanging = false;

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

// PDF.js worker configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================
// PDF HANDLING
// ============================================

pdfInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;

    const fileReader = new FileReader();
    fileReader.onload = async function() {
        const typedArray = new Uint8Array(this.result);

        try {
            pdfDoc = await pdfjsLib.getDocument(typedArray).promise;

            // Switch to drawing screen first
            homeScreen.style.display = 'none';
            drawingScreen.style.display = 'flex';

            // Wait for layout to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Render PDF page
            await renderPDFPage(1);

            // Initialize drawing canvas after PDF is rendered
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
    // Attach drawing event listeners
    attachEventListeners();

    // Re-render PDF on window resize with smooth fade transition
    let resizeTimeout;
    window.addEventListener('resize', async () => {
        if (!pdfDoc || !currentPage) return;

        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(async () => {
            // Fade out
            pdfCanvas.style.opacity = '0';
            svg.style.opacity = '0';

            // Wait for fade out animation
            await new Promise(resolve => setTimeout(resolve, 100));

            // Save current drawings before re-render
            saveCurrentPageDrawings();

            // Re-render PDF at new size
            await renderPDFPage(currentPage);

            // Restore drawings after re-render
            restorePageDrawings(currentPage);

            // Fade in
            pdfCanvas.style.opacity = '1';
            svg.style.opacity = '1';
        }, 300);
    });

    // Tool icons
    const penToolContainer = document.getElementById('penToolContainer');
    const penToolIcon = document.getElementById('penToolIcon');
    const laserIcon = document.getElementById('laserIcon');
    const eraserIcon = document.getElementById('eraserIcon');
    const penModal = document.getElementById('penModal');

    if (penToolContainer) {
        penToolContainer.addEventListener('click', (e) => {
            // If pen is already active, toggle modal
            if (activeTool === 'pen') {
                const isModalOpen = penModal.style.display === 'block';
                penModal.style.display = isModalOpen ? 'none' : 'block';

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
        laserIcon.addEventListener('click', () => setActiveTool('laser'));
    }
    if (eraserIcon) {
        eraserIcon.addEventListener('click', () => setActiveTool('eraser'));
    }

    // Color picker
    const colorCircles = document.querySelectorAll('.color-circle');
    colorCircles.forEach(circle => {
        circle.addEventListener('click', () => {
            // Remove active class from all circles
            colorCircles.forEach(c => c.classList.remove('active'));
            // Add active class to clicked circle
            circle.classList.add('active');
            // Set current color
            currentColor = circle.getAttribute('data-color');
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
                sliderModal.style.display = 'block';
            } else {
                // Close slider modal if it's open
                if (sliderModal && sliderModal.style.display === 'block') {
                    sliderModal.style.display = 'none';
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

        // Close pen modal (preset circles modal) if clicking outside
        if (penModal && penModal.style.display === 'block') {
            if (!clickedInPenModal && !clickedOnPenTool && !clickedInSliderModal) {
                penModal.style.display = 'none';
                // Also close slider modal if it's open
                if (sliderModal && sliderModal.style.display === 'block') {
                    sliderModal.style.display = 'none';
                    currentEditingPreset = null;
                }
            }
        }

        // Close slider modal only if clicking outside of it (but not inside pen modal or on presets)
        // The slider modal should NOT close when clicking inside the slider itself
        if (sliderModal && sliderModal.style.display === 'block') {
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
                sliderModal.style.display = 'none';
                currentEditingPreset = null;
            }
        }
    };

    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);

    // Home icon - return to homepage
    const homeIcon = document.getElementById('homeIcon');
    if (homeIcon) {
        homeIcon.addEventListener('click', returnToHome);
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

    // Update icon styles to show active tool
    const penToolContainer = document.getElementById('penToolContainer');
    const laserIcon = document.getElementById('laserIcon');
    const eraserIcon = document.getElementById('eraserIcon');
    const penModal = document.getElementById('penModal');

    // Remove active class from all icons
    if (penToolContainer) penToolContainer.classList.remove('active');
    if (laserIcon) laserIcon.classList.remove('active');
    if (eraserIcon) eraserIcon.classList.remove('active');

    // Close modal when switching tools
    if (penModal) penModal.style.display = 'none';

    // Add active class to selected tool
    if (tool === 'pen' && penToolContainer) {
        penToolContainer.classList.add('active');
    } else if (tool === 'laser' && laserIcon) {
        laserIcon.classList.add('active');
    } else if (tool === 'eraser' && eraserIcon) {
        eraserIcon.classList.add('active');
    }

    // Update cursor
    if (tool === 'laser') {
        svg.style.cursor = 'none';
    } else {
        svg.style.cursor = 'crosshair';
    }
}

function returnToHome() {
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

    // Return to home screen
    drawingScreen.style.display = 'none';
    homeScreen.style.display = 'flex';

    // Reset PDF state to allow opening new PDFs
    pdfDoc = null;
    currentPage = 1;
    pageDrawings = {};

    // Clear the canvas
    clearCanvas();

    // Re-add indicators after clearing
    if (eraserIndicator) {
        svg.appendChild(eraserIndicator);
    }
    if (laserPointer) {
        svg.appendChild(laserPointer);
    }

    // Reset file input to allow selecting the same file again
    pdfInput.value = '';
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

    // Check if eraser button (top of pen) is being used
    if (e.button === 5 || e.buttons === 32) {
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
        currentPath.setAttribute('stroke-width', '3');
        currentPath.setAttribute('stroke-linecap', 'round');
        currentPath.setAttribute('stroke-linejoin', 'round');
        currentPath.setAttribute('opacity', '1');
        currentPath.setAttribute('filter', 'url(#laserGlow)');
        currentPath.classList.add('laser-stroke');

        svg.appendChild(currentPath);

        e.preventDefault();
        return;
    } else if (activeTool === 'eraser') {
        // Activate eraser mode
        isErasing = true;
        eraserIndicator.style.display = 'block';
        erase(e);
        e.preventDefault();
        return;
    }

    // Pen mode - default drawing behavior
    isDrawing = true;
    points = [];

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

    svg.appendChild(currentPath);

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
}

function stopDrawing() {
    if (isDrawing) {
        isDrawing = false;
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

        // Fade out and remove after 3 seconds
        if (laserPath) {
            setTimeout(() => {
                // Start fade animation
                laserPath.style.transition = 'opacity 0.5s ease';
                laserPath.setAttribute('opacity', '0');

                // Remove after fade completes
                setTimeout(() => {
                    if (laserPath.parentNode) {
                        laserPath.remove();
                    }
                }, 500);
            }, 2500); // Wait 2.5 seconds, then fade for 0.5 seconds = 3 seconds total
        }

        currentPath = null;
        points = [];
    }
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
                    path.remove();
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
            strokePoints: path._strokePoints || []
        }))
    };
}

function restorePageDrawings(pageNum) {
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
        const scaleX = currentViewBoxWidth / savedData.viewBoxWidth;
        const scaleY = currentViewBoxHeight / savedData.viewBoxHeight;

        savedData.paths.forEach(pathData => {
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

            svg.insertBefore(path, eraserIndicator);
        });
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
                pdfCanvas.style.opacity = '0';
                svg.style.opacity = '0';

                // Wait for fade out animation
                await new Promise(resolve => setTimeout(resolve, 150));

                // Save current page drawings
                saveCurrentPageDrawings();

                // Change page
                currentPage++;
                await renderPDFPage(currentPage);

                // Restore new page drawings
                restorePageDrawings(currentPage);

                // Fade in
                pdfCanvas.style.opacity = '1';
                svg.style.opacity = '1';

                isPageChanging = false;
            }
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentPage > 1 && !isPageChanging) {
                isPageChanging = true;

                // Fade out
                pdfCanvas.style.opacity = '0';
                svg.style.opacity = '0';

                // Wait for fade out animation
                await new Promise(resolve => setTimeout(resolve, 150));

                // Save current page drawings
                saveCurrentPageDrawings();

                // Change page
                currentPage--;
                await renderPDFPage(currentPage);

                // Restore new page drawings
                restorePageDrawings(currentPage);

                // Fade in
                pdfCanvas.style.opacity = '1';
                svg.style.opacity = '1';

                isPageChanging = false;
            }
        }
    }
});
