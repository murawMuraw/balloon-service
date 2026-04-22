//Логика полёта, движение шара
// ========== ЛОГИКА ВОЗДУШНОГО ШАРА ==========

// Отображение информации о ветре
function updateWindDisplay(wind) {
    const windInfo = document.getElementById('windInfo');
    if (!windInfo) return;
    
    if (wind) {
        const directions = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
        const index = Math.round(wind.direction / 45) % 8;
        windInfo.innerHTML = `
            <div>🌬️ Ветер: ${wind.speed.toFixed(1)} м/с</div>
            <div>🧭 Направление: ${wind.direction}° (${directions[index]})</div>
            ${wind.gust ? `<div>💨 Порывы: ${wind.gust.toFixed(1)} м/с</div>` : ''}
            <div>⏱️ Обновлено: ${new Date().toLocaleTimeString()}</div>
        `;
    } else {
        windInfo.innerHTML = `<div>🌬️ Ветер: --</div><div>🧭 Направление: --</div><div>📏 Скорость: -- м/с</div>`;
    }
}

// Расчет следующей точки на основе ветра
function calculateNextPoint(start, wind, seconds) {
    const windDirection = (wind.direction + 180) % 360;
    const distance = wind.speed * seconds;
    const distanceKm = distance / 1000;
    const R = 6371; // Радиус Земли в км
    
    const lat1 = start.lat * Math.PI / 180;
    const lon1 = start.lng * Math.PI / 180;
    const bearing = windDirection * Math.PI / 180;
    
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distanceKm/R) + 
                   Math.cos(lat1) * Math.sin(distanceKm/R) * Math.cos(bearing));
    const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(distanceKm/R) * Math.cos(lat1), 
                   Math.cos(distanceKm/R) - Math.sin(lat1) * Math.sin(lat2));
    
    return { 
        lat: lat2 * 180 / Math.PI, 
        lng: lon2 * 180 / Math.PI 
    };
}

// Обновление прогноза полета
async function updateForecast(startPoint) {
    if (!startPoint) return;
    
    const wind = await getWindData(startPoint.lat, startPoint.lng);
    if (!wind) return;
    
    window.App.currentWind = wind;
    updateWindDisplay(wind);
    
    window.App.forecastPoints = [startPoint];
    let currentPoint = startPoint;
    
    for (let i = 1; i <= 12; i++) {
        const nextPoint = calculateNextPoint(currentPoint, wind, 300);
        window.App.forecastPoints.push(L.latLng(nextPoint.lat, nextPoint.lng));
        currentPoint = L.latLng(nextPoint.lat, nextPoint.lng);
    }
    
    if (window.App.forecastLine) {
        window.map.removeLayer(window.App.forecastLine);
    }
    
    window.App.forecastLine = L.polyline(window.App.forecastPoints, {
        color: '#00aaff', 
        weight: 3, 
        opacity: 0.7, 
        dashArray: '5, 5'
    }).addTo(window.map);
}

// Обновление эффекта тумана
function updateHaze(center) {
    const canvas = document.getElementById('haze-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = window.map.getSize().x;
    canvas.height = window.map.getSize().y;
    
    if (!center || !window.App.isFlying) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    
    const centerPoint = window.map.latLngToContainerPoint(center);
    const maxRadius = Math.max(canvas.width, canvas.height) * 1.5;
    const gradient = ctx.createRadialGradient(centerPoint.x, centerPoint.y, 0, 
                                               centerPoint.x, centerPoint.y, maxRadius);
    
    const metersPerPixel = window.map.distance(
        window.map.containerPointToLatLng([0, 0]), 
        window.map.containerPointToLatLng([1, 0])
    );
    
    const brightRadius = window.App.ZONES.BRIGHT / metersPerPixel;
    const mediumRadius = window.App.ZONES.MEDIUM / metersPerPixel;
    const hazeRadius = window.App.ZONES.HAZE / metersPerPixel;
    
    const pos1 = Math.min(1, brightRadius / maxRadius);
    const pos2 = Math.min(1, mediumRadius / maxRadius);
    const pos3 = Math.min(1, hazeRadius / maxRadius);
    
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(pos1, 'rgba(0,0,0,0)');
    gradient.addColorStop(pos2, 'rgba(100,100,100,0.2)');
    gradient.addColorStop(pos3, 'rgba(50,50,50,0.2)');
    gradient.addColorStop(1, 'rgba(25,25,25,0.15)');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Движение шара
function moveBalloon() {
    if (!window.App.isFlying || !window.App.balloonPosition || !window.App.currentWind) return;
    
    const nextPoint = calculateNextPoint(window.App.balloonPosition, window.App.currentWind, 1);
    window.App.balloonPosition = L.latLng(nextPoint.lat, nextPoint.lng);
    
    if (window.App.balloonMarker) {
        window.App.balloonMarker.setLatLng(window.App.balloonPosition);
    }
    
    updateCoordDisplay(window.App.balloonPosition.lat, window.App.balloonPosition.lng);
    updateHaze(window.App.balloonPosition);
    checkNearbyPlace(window.App.balloonPosition.lat, window.App.balloonPosition.lng);
    
    // Сохраняем путь
    if (window.App.actualPathPoints.length === 0 || 
        window.map.distance(window.App.balloonPosition, window.App.actualPathPoints[window.App.actualPathPoints.length - 1]) > 10) {
        window.App.actualPathPoints.push(window.App.balloonPosition);
        
        if (window.App.pathLine) {
            window.map.removeLayer(window.App.pathLine);
        }
        
        window.App.pathLine = L.polyline(window.App.actualPathPoints, { 
            color: '#ff4444', 
            weight: 4, 
            opacity: 0.8 
        }).addTo(window.map);
    }
}

// Обновление отображения координат
function updateCoordDisplay(lat, lng) {
    const coordDisplay = document.getElementById('coordinates');
    if (coordDisplay) {
        coordDisplay.innerHTML = `Широта: ${lat.toFixed(6)}<br>Долгота: ${lng.toFixed(6)}`;
    }
}

// Старт полета
async function startFlight() {
    if (!window.App.balloonPosition) {
        alert('Сначала выберите точку старта');
        return;
    }
    
    const flightStatus = document.getElementById('flightStatus');
    flightStatus.className = 'flight-status status-waiting';
    flightStatus.innerHTML = '⏳ Создание шара...';
    
    try {
        const response = await apiRequest('/api/balloons', {
            method: 'POST',
            body: JSON.stringify({ 
                lat: window.App.balloonPosition.lat, 
                lng: window.App.balloonPosition.lng, 
                userId: getUserId(),
                isGuest: window.App.isGuest 
            })
        });
        
        const balloon = await response.json();
        if (balloon.error) throw new Error(balloon.error);
        
        window.App.balloonId = balloon.id;
        window.App.currentWind = { 
            speed: balloon.wind_speed, 
            direction: balloon.wind_direction 
        };
        updateWindDisplay(window.App.currentWind);
        
        if (window.App.startMarker) {
            window.map.removeLayer(window.App.startMarker);
            window.App.startMarker = null;
        }
        
        const balloonIcon = L.icon({
            iconUrl: '/images/balloon.png',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16]
        });
        
        window.App.balloonMarker = L.marker(window.App.balloonPosition, { 
            icon: balloonIcon, 
            zIndexOffset: 1000 
        }).addTo(window.map);
        
        window.App.actualPathPoints = [window.App.balloonPosition];
        
        if (window.App.movementInterval) clearInterval(window.App.movementInterval);
        window.App.movementInterval = setInterval(moveBalloon, 1000);
        
        if (window.App.windUpdateInterval) clearInterval(window.App.windUpdateInterval);
        window.App.windUpdateInterval = setInterval(async () => {
            if (window.App.isFlying && window.App.balloonPosition) {
                const newWind = await getWindData(window.App.balloonPosition.lat, window.App.balloonPosition.lng);
                if (newWind) {
                    window.App.currentWind = newWind;
                    updateWindDisplay(window.App.currentWind);
                    updateForecast(window.App.balloonPosition);
                }
            }
        }, 60000);
        
        window.App.isFlying = true;
        document.getElementById('startBtn').disabled = true;
        flightStatus.className = 'flight-status status-flying';
        flightStatus.innerHTML = '🎈 В ПОЛЁТЕ';
        document.getElementById('hint').style.display = 'none';
        updateHaze(window.App.balloonPosition);
        
    } catch (error) {
        console.error('Ошибка старта:', error);
        alert('Не удалось создать шар: ' + error.message);
        flightStatus.className = 'flight-status status-ready';
        flightStatus.innerHTML = '⏸️ Ожидание старта';
    }
}

// Восстановление полета после перезагрузки
async function restoreBalloon() {
    try {
        const userId = getUserId();
        const response = await fetch(`${window.App.API_URL}/api/balloons/${userId}`);
        
        if (response.status === 404) return false;
        
        const balloon = await response.json();
        if (balloon && balloon.is_flying) {
            console.log('🔄 Восстанавливаем шар:', balloon.id);
            
            window.App.balloonPosition = L.latLng(balloon.current_lat, balloon.current_lng);
            window.App.currentWind = { 
                speed: balloon.wind_speed, 
                direction: balloon.wind_direction 
            };
            window.App.balloonId = balloon.id;
            
            if (balloon.path && balloon.path.length > 0) {
                window.App.actualPathPoints = balloon.path.map(p => L.latLng(p.lat, p.lng));
                if (window.App.pathLine) window.map.removeLayer(window.App.pathLine);
                window.App.pathLine = L.polyline(window.App.actualPathPoints, { 
                    color: '#ff4444', 
                    weight: 4, 
                    opacity: 0.8 
                }).addTo(window.map);
            }
            
            const balloonIcon = L.icon({
                iconUrl: '/images/balloon.png',
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                popupAnchor: [0, -16]
            });
            
            window.App.balloonMarker = L.marker(window.App.balloonPosition, { 
                icon: balloonIcon, 
                zIndexOffset: 1000 
            }).addTo(window.map);
            
            window.map.setView(window.App.balloonPosition, 10);
            updateCoordDisplay(window.App.balloonPosition.lat, window.App.balloonPosition.lng);
            updateWindDisplay(window.App.currentWind);
            
            window.App.isFlying = true;
            document.getElementById('startBtn').disabled = true;
            document.getElementById('flightStatus').className = 'flight-status status-flying';
            document.getElementById('flightStatus').innerHTML = '🎈 В ПОЛЁТЕ';
            document.getElementById('hint').style.display = 'none';
            updateHaze(window.App.balloonPosition);
            
            if (window.App.movementInterval) clearInterval(window.App.movementInterval);
            window.App.movementInterval = setInterval(moveBalloon, 1000);
            
            if (window.App.windUpdateInterval) clearInterval(window.App.windUpdateInterval);
            window.App.windUpdateInterval = setInterval(async () => {
                if (window.App.isFlying && window.App.balloonPosition) {
                    const newWind = await getWindData(window.App.balloonPosition.lat, window.App.balloonPosition.lng);
                    if (newWind) {
                        window.App.currentWind = newWind;
                        updateWindDisplay(window.App.currentWind);
                    }
                }
            }, 60000);
            
            return true;
        }
        return false;
        
    } catch (error) {
        console.error('Ошибка восстановления:', error);
        return false;
    }
}

// Сброс полета
function resetFlight() {
    if (window.App.movementInterval) {
        clearInterval(window.App.movementInterval);
        window.App.movementInterval = null;
    }
    
    if (window.App.windUpdateInterval) {
        clearInterval(window.App.windUpdateInterval);
        window.App.windUpdateInterval = null;
    }
    
    if (window.App.balloonId) {
        apiRequest(`/api/balloons/${window.App.balloonId}/stop`, { method: 'POST' }).catch(console.error);
    }
    
    if (window.App.balloonMarker) {
        window.map.removeLayer(window.App.balloonMarker);
        window.App.balloonMarker = null;
    }
    
    if (window.App.startMarker) {
        window.map.removeLayer(window.App.startMarker);
        window.App.startMarker = null;
    }
    
    if (window.App.forecastLine) {
        window.map.removeLayer(window.App.forecastLine);
        window.App.forecastLine = null;
    }
    
    if (window.App.pathLine) {
        window.map.removeLayer(window.App.pathLine);
        window.App.pathLine = null;
    }
    
    window.App.forecastPoints = [];
    window.App.actualPathPoints = [];
    window.App.isFlying = false;
    window.App.balloonPosition = null;
    window.App.currentWind = null;
    window.App.balloonId = null;
    
    document.getElementById('coordinates').innerHTML = 'Широта: --<br>Долгота: --';
    updateWindDisplay(null);
    document.getElementById('startBtn').disabled = true;
    document.getElementById('flightStatus').className = 'flight-status status-ready';
    document.getElementById('flightStatus').innerHTML = '⏸️ Ожидание старта';
    document.getElementById('hint').style.display = 'block';
    document.getElementById('hint').innerHTML = '👆 Кликните на карту, чтобы выбрать место старта';
    updateHaze(null);
}
