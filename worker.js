// Web Worker for drawing app computations
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch(type) {
        case 'smoothStroke':
            const smoothedStroke = smoothStrokePoints(data.points, data.threshold);
            self.postMessage({
                type: 'smoothStrokeResult',
                id: data.id,
                result: smoothedStroke
            });
            break;
            
        case 'processImageData':
            const processedData = processCanvasImageData(data.imageData, data.operation);
            self.postMessage({
                type: 'processImageDataResult',
                id: data.id,
                result: processedData
            });
            break;
            
        case 'calculateBounds':
            const bounds = calculateStrokeBounds(data.strokes);
            self.postMessage({
                type: 'calculateBoundsResult',
                id: data.id,
                result: bounds
            });
            break;
            
        default:
            self.postMessage({
                type: 'error',
                message: 'Unknown task type: ' + type
            });
    }
};

// Smooth stroke points using quadratic interpolation
function smoothStrokePoints(points, threshold = 3) {
    if (points.length < 3) return points;
    
    const smoothed = [points[0]]; // Keep first point
    
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        
        // Calculate distance
        const dist = Math.sqrt(
            Math.pow(curr.x - prev.x, 2) + 
            Math.pow(curr.y - prev.y, 2)
        );
        
        if (dist >= threshold) {
            // Apply smoothing
            const smoothedPoint = {
                x: (prev.x + curr.x + next.x) / 3,
                y: (prev.y + curr.y + next.y) / 3,
                tool: curr.tool,
                width: curr.width
            };
            smoothed.push(smoothedPoint);
        } else {
            smoothed.push(curr);
        }
    }
    
    smoothed.push(points[points.length - 1]); // Keep last point
    return smoothed;
}

// Process canvas image data (example: invert colors)
function processCanvasImageData(imageData, operation) {
    const data = new Uint8ClampedArray(imageData.data);
    
    switch(operation) {
        case 'invert':
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 255 - data[i];     // Red
                data[i + 1] = 255 - data[i + 1]; // Green
                data[i + 2] = 255 - data[i + 2]; // Blue
                // Alpha stays the same
            }
            break;
            
        case 'grayscale':
            for (let i = 0; i < data.length; i += 4) {
                const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
                data[i] = gray;     // Red
                data[i + 1] = gray; // Green
                data[i + 2] = gray; // Blue
            }
            break;
    }
    
    return {
        data: data,
        width: imageData.width,
        height: imageData.height
    };
}

// Calculate bounds of all strokes
function calculateStrokeBounds(strokes) {
    if (!strokes || strokes.length === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    strokes.forEach(stroke => {
        stroke.forEach(point => {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        });
    });
    
    return {
        minX: minX,
        minY: minY,
        maxX: maxX,
        maxY: maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}
