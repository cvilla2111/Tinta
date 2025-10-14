console.log('📦 External worker loaded');

self.onmessage = function(e) {
    const { operation, data, id } = e.data;
    
    // Handle connection test
    if (operation === 'connectionTest') {
        self.postMessage({ operation, id, result: 'connected' });
        return;
    }
    
    switch(operation) {
        case 'optimizePath':
            const optimized = optimizePath(data.points);
            self.postMessage({ operation, result: optimized, id, timestamp: Date.now() });
            break;
            
        case 'analyzePath':
            const analysis = analyzePath(data.points);
            self.postMessage({ operation, result: analysis, id, timestamp: Date.now() });
            break;
            
        case 'smoothPath':
            const smoothed = smoothPath(data.points, data.intensity || 0.5);
            self.postMessage({ operation, result: smoothed, id, timestamp: Date.now() });
            break;
    }
};

function optimizePath(points) {
    if (points.length < 3) return points;
    const optimized = [points[0]];
    const tolerance = 3;
    
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        
        const d1 = Math.sqrt((next.x - prev.x) ** 2 + (next.y - prev.y) ** 2);
        const d2 = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);
        const d3 = Math.sqrt((next.x - curr.x) ** 2 + (next.y - curr.y) ** 2);
        
        if (Math.abs(d2 + d3 - d1) > tolerance) {
            optimized.push(curr);
        }
    }
    
    optimized.push(points[points.length - 1]);
    return optimized;
}

function analyzePath(points) {
    if (points.length < 2) return { length: 0, complexity: 0, points: 0 };
    
    let totalLength = 0;
    let totalCurvature = 0;
    
    for (let i = 1; i < points.length; i++) {
        const dist = Math.sqrt(
            (points[i].x - points[i-1].x) ** 2 + 
            (points[i].y - points[i-1].y) ** 2
        );
        totalLength += dist;
        
        if (i > 1) {
            const a1 = Math.atan2(points[i-1].y - points[i-2].y, points[i-1].x - points[i-2].x);
            const a2 = Math.atan2(points[i].y - points[i-1].y, points[i].x - points[i-1].x);
            const curvature = Math.abs(a2 - a1);
            totalCurvature += curvature;
        }
    }
    
    return {
        length: Math.round(totalLength),
        complexity: Math.round(totalCurvature * 100) / 100,
        points: points.length
    };
}

function smoothPath(points, intensity) {
    if (points.length < 3) return points;
    
    const smoothed = [points[0]];
    
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        
        const smoothX = curr.x + (prev.x + next.x - 2 * curr.x) * intensity;
        const smoothY = curr.y + (prev.y + next.y - 2 * curr.y) * intensity;
        
        smoothed.push({ x: smoothX, y: smoothY });
    }
    
    smoothed.push(points[points.length - 1]);
    return smoothed;
}