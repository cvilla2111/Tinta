// Worker thread for heavy computations
self.onmessage = function(e) {
    const { type, taskId, data } = e.data;
    
    switch(type) {
        case 'COLLISION_DETECTION':
            const hits = findCollisions(data.point, data.strokes, data.radius);
            self.postMessage({
                type: 'COLLISION_RESULT',
                taskId,
                hits
            });
            break;
            
        case 'OPTIMIZE_STROKES':
            const optimized = optimizeStrokes(data.strokes);
            self.postMessage({
                type: 'OPTIMIZE_RESULT',
                taskId,
                strokes: optimized
            });
            break;
            
        case 'SAVE_STATE':
            const serialized = JSON.stringify(data.strokes);
            self.postMessage({
                type: 'SAVE_RESULT',
                taskId,
                serialized
            });
            break;
    }
};

function findCollisions(point, strokes, radius) {
    const hits = [];
    const radiusSquared = radius * radius;
    
    for (let i = 0; i < strokes.length; i++) {
        const stroke = strokes[i];
        for (let j = 0; j < stroke.points.length; j++) {
            const strokePoint = stroke.points[j];
            const dx = point.x - strokePoint.x;
            const dy = point.y - strokePoint.y;
            const distanceSquared = dx * dx + dy * dy;
            
            if (distanceSquared < radiusSquared) {
                hits.push(i);
                break; // Found collision, move to next stroke
            }
        }
    }
    return hits;
}

function optimizeStrokes(strokes) {
    return strokes.map(stroke => {
        if (stroke.points.length <= 3) return stroke;
        
        // Douglas-Peucker algorithm for point reduction
        const simplified = simplifyPoints(stroke.points, 2.0);
        return { ...stroke, points: simplified };
    });
}

function simplifyPoints(points, tolerance) {
    if (points.length <= 2) return points;
    
    const toleranceSquared = tolerance * tolerance;
    
    function getDistanceSquared(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return dx * dx + dy * dy;
    }
    
    function getPerpendicularDistanceSquared(point, lineStart, lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        
        if (dx === 0 && dy === 0) {
            return getDistanceSquared(point, lineStart);
        }
        
        const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy);
        
        if (t < 0) {
            return getDistanceSquared(point, lineStart);
        } else if (t > 1) {
            return getDistanceSquared(point, lineEnd);
        }
        
        const projection = {
            x: lineStart.x + t * dx,
            y: lineStart.y + t * dy
        };
        
        return getDistanceSquared(point, projection);
    }
    
    function douglasPeucker(points, start, end, tolerance) {
        let maxDistance = 0;
        let maxIndex = 0;
        
        for (let i = start + 1; i < end; i++) {
            const distance = getPerpendicularDistanceSquared(points[i], points[start], points[end]);
            if (distance > maxDistance) {
                maxDistance = distance;
                maxIndex = i;
            }
        }
        
        if (maxDistance > tolerance) {
            const left = douglasPeucker(points, start, maxIndex, tolerance);
            const right = douglasPeucker(points, maxIndex, end, tolerance);
            return left.slice(0, -1).concat(right);
        } else {
            return [points[start], points[end]];
        }
    }
    
    return douglasPeucker(points, 0, points.length - 1, toleranceSquared);
}
