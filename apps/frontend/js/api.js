//API запросы (ветер, места, шары)
 // ========== API ЗАПРОСЫ ==========

// Базовый API запрос с авторизацией
async function apiRequest(url, options = {}) {
    const headers = { 
        'Content-Type': 'application/json', 
        ...options.headers 
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_URL}${url}`, { 
        ...options, 
        headers 
    });
    
    return response;
}

// Получение данных о ветре
async function getWindData(lat, lng) {
    try {
        const response = await fetch(`${API_URL}/api/wind?lat=${lat}&lon=${lng}`);
        const data = await response.json();
        
        if (data.speed) {
            return data;
        }
        return null;
    } catch (error) {
        console.error('Ошибка получения ветра:', error);
        return null;
    }
}

// Проверка ближайшего населённого пункта
let lastPlaceCheck = null;

async function checkNearbyPlace(lat, lng) {
    const now = Date.now();
    if (lastPlaceCheck && (now - lastPlaceCheck) < 30000) {
        return;
    }
    lastPlaceCheck = now;
    
    try {
        const response = await fetch(`${API_URL}/api/place?lat=${lat}&lon=${lng}`);
        const data = await response.json();
        
        const placeInfo = document.getElementById('placeInfo');
        if (!placeInfo) return;
        
        if (data.found && data.name) {
            placeInfo.style.display = 'block';
            document.getElementById('placeName').innerHTML = `🏙️ ${data.name}${data.country ? `, ${data.country}` : ''}`;
            
            if (data.wikipedia_url) {
                document.getElementById('placeLink').innerHTML = `<a href="${data.wikipedia_url}" target="_blank" style="font-size: 13px; color: #4285f4; text-decoration: none;">📖 Посмотреть в Википедии →</a>`;
            } else {
                document.getElementById('placeLink').innerHTML = '<span style="font-size: 12px; color: #999;"></span>';
            }
            
            // Автоматически скрываем через 30 секунд
            setTimeout(() => {
                if (placeInfo.style.display !== 'none') {
                    placeInfo.style.display = 'none';
                }
            }, 30000);
        } else {
            placeInfo.style.display = 'none';
        }
    } catch (error) {
        console.error('Ошибка получения места:', error);
    }
}

// Получение ID пользователя (гость или авторизованный)
function getUserId() {
    if (currentUser) {
        return currentUser.id;
    }
    
    return localStorage.getItem('guest_user_id') || (() => {
        const id = 'guest_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('guest_user_id', id);
        return id;
    })();
}

// Пинг для поддержания сервера активным
function startServerPing() {
    setInterval(() => {
        fetch(`${API_URL}/api/health`)
            .then(response => response.json())
            .then(data => console.log('💓 Пинг сервера:', data.status))
            .catch(err => console.warn('⚠️ Пинг не удался:', err));
    }, 600000); // 600000 мс = 10 минут
    
    console.log('🕐 Пинг настроен (каждые 10 минут)');
}
