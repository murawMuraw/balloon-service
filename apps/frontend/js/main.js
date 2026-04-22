//Точка входа, инициализация
// ========== ГЛАВНЫЙ МОДУЛЬ (ТОЧКА ВХОДА) ==========

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Запуск приложения Aerostar');
    
    // 1. Инициализация карты
    initMap();
    
    // 2. Инициализация обработчиков UI
    initUIHandlers();
    
    // 3. Инициализация авторизации
    initAuthHandlers();
    
    // 4. Восстановление сессии пользователя
    restoreSession();
    
    // 5. Настройка пинга сервера
    startServerPing();
    
    // 6. Показываем приветственное окно
    setTimeout(() => {
        showWelcomeModal();
    }, 500);
    
    // 7. Скрываем загрузку
    hideLoading(3000);
    
    console.log('✅ Приложение готово к работе');
});

// Инициализация карты и событий карты
function initMap() {
    // Создаем карту
    window.map = L.map('map', { 
        center: [52.12, 23.72], 
        zoom: 8, 
        zoomControl: true 
    });
    
    // Добавляем слои
    const esriSatellite = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { 
        attribution: 'Tiles © Esri', 
        maxZoom: 19 
    });
    
    const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        attribution: '© OpenStreetMap', 
        maxZoom: 19 
    });
    
    esriSatellite.addTo(window.map);
    
    // Контролы
    L.control.layers(
        { "🛰️ Спутник ESRI": esriSatellite, "🗺️ Схема OSM": osmStandard }, 
        null, 
        { position: 'topleft', collapsed: false }
    ).addTo(window.map);
    
    L.control.scale({ metric: true, position: 'bottomleft' }).addTo(window.map);
    
    // Обработчик клика по карте
    window.map.on('click', async function(e) {
        if (window.App.isFlying) {
            showError('Нельзя выбрать новую точку во время полета. Сначала сбросьте полет.');
            return;
        }
        
        const { lat, lng } = e.latlng;
        
        // Очищаем предыдущий маркер
        if (window.App.startMarker) {
            window.map.removeLayer(window.App.startMarker);
        }
        
        // Создаём новый маркер
        window.App.startMarker = L.marker([lat, lng]).addTo(window.map);
        window.App.balloonPosition = L.latLng(lat, lng);
        
        // Обновляем отображение
        updateCoordDisplay(lat, lng);
        
        // Получаем прогноз ветра
        updateFlightStatus('waiting', '⏳ Получение прогноза ветра...');
        await updateForecast(window.App.balloonPosition);
        
        updateFlightStatus('ready', '⏸️ Ожидание старта');
        setStartButtonEnabled(true);
        updateHint('✅ Точка выбрана. Нажмите СТАРТ');
    });
    
    // Обновление тумана при движении карты
    window.map.on('move', () => { 
        if (window.App.balloonPosition && window.App.isFlying) {
            updateHaze(window.App.balloonPosition);
        }
    });
    
    // Обновление тумана при изменении размера окна
    window.addEventListener('resize', () => { 
        if (window.App.balloonPosition && window.App.isFlying) {
            updateHaze(window.App.balloonPosition);
        }
    });
}

// Инициализация обработчиков UI
function initUIHandlers() {
    // Кнопки управления полётом
    const startBtn = document.getElementById('startBtn');
    const resetBtn = document.getElementById('resetBtn');
    
    if (startBtn) {
        startBtn.addEventListener('click', startFlight);
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', resetFlight);
    }
    
    // Закрытие рекламного баннера
    const closeAdBtn = document.getElementById('close-ad');
    if (closeAdBtn) {
        closeAdBtn.addEventListener('click', hideAdBanner);
    }
    
    // Приветственное окно
    const closeWelcomeBtn = document.getElementById('closeWelcomeBtn');
    if (closeWelcomeBtn) {
        closeWelcomeBtn.addEventListener('click', closeWelcomeModal);
    }
    
    const dontShowCheckbox = document.getElementById('dontShowCheckbox');
    if (dontShowCheckbox) {
        dontShowCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                localStorage.setItem('welcome_dont_show', 'true');
            } else {
                localStorage.removeItem('welcome_dont_show');
            }
        });
    }
    
    // Обработчик клавиш (ESC закрывает модальные окна)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const authModal = document.getElementById('authModal');
            const welcomeModal = document.getElementById('welcomeModal');
            
            if (authModal && !authModal.classList.contains('hidden')) {
                showAuthModal(false);
            }
            
            if (welcomeModal && !welcomeModal.classList.contains('hidden')) {
                closeWelcomeModal();
            }
        }
    });
}

// Обработка ошибок глобально
window.addEventListener('error', (e) => {
    console.error('Глобальная ошибка:', e.error);
    showError('Произошла ошибка: ' + (e.error?.message || 'Неизвестная ошибка'));
});

// Обработка необработанных Promise ошибок
window.addEventListener('unhandledrejection', (e) => {
    console.error('Необработанный Promise rejection:', e.reason);
    showError('Ошибка: ' + (e.reason?.message || 'Неизвестная ошибка'));
});
