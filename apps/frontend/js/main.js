//Точка входа, инициализация
// ========== main.js - ТОЧКА ВХОДА ==========

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Настройка карты
    initMapEvents();
    
    // 2. Настройка обработчиков событий
    initEventHandlers();
    
    // 3. Настройка авторизации
    initAuthHandlers();
    
    // 4. Восстановление сессии
    restoreSession();
    
    // 5. Скрываем загрузку
    setTimeout(() => {
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
    }, 3000);
});

// Инициализация событий карты
function initMapEvents() {
    // Клик по карте для выбора стартовой точки
    window.map.on('click', async function(e) {
        if (window.App.isFlying) return;
        
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
        const flightStatus = document.getElementById('flightStatus');
        flightStatus.className = 'flight-status status-waiting';
        flightStatus.innerHTML = '⏳ Получение прогноза ветра...';
        
        await updateForecast(window.App.balloonPosition);
        
        flightStatus.className = 'flight-status status-ready';
        flightStatus.innerHTML = '⏸️ Ожидание старта';
        document.getElementById('startBtn').disabled = false;
        document.getElementById('hint').innerHTML = '✅ Точка выбрана. Нажмите СТАРТ';
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

// Инициализация обработчиков кнопок
function initEventHandlers() {
    // Кнопки управления полётом
    document.getElementById('startBtn').addEventListener('click', startFlight);
    document.getElementById('resetBtn').addEventListener('click', resetFlight);
    
    // Кнопка профиля
    document.getElementById('profileButton').addEventListener('click', () => showAuthModal(true));
    document.getElementById('continueGuestBtn').addEventListener('click', continueAsGuest);
    
    // Кнопка закрытия рекламы
    const closeAdBtn = document.getElementById('close-ad');
    if (closeAdBtn) {
        closeAdBtn.addEventListener('click', () => {
            document.getElementById('ad-container').style.display = 'none';
        });
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
}

// Инициализация обработчиков авторизации
function initAuthHandlers() {
    // Переключение табов в модальном окне
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            document.getElementById('loginForm').classList.toggle('hidden', tabName !== 'login');
            document.getElementById('registerForm').classList.toggle('hidden', tabName !== 'register');
        });
    });
    
    // Кнопки входа и регистрации
    document.getElementById('loginBtn').addEventListener('click', () => {
        login(
            document.getElementById('loginEmail').value, 
            document.getElementById('loginPassword').value
        );
    });
    
    document.getElementById('registerBtn').addEventListener('click', () => {
        register(
            document.getElementById('regEmail').value, 
            document.getElementById('regPassword').value
        );
    });
}

// Восстановление сессии пользователя
async function restoreSession() {
    if (window.App.token) {
        try {
            const response = await fetch(`${window.App.API_URL}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${window.App.token}` }
            });
            const user = await response.json();
            
            if (user && !user.error) {
                window.App.currentUser = user;
                window.App.isGuest = false;
                updateProfileUI();
                await restoreBalloon();
            } else {
                logout();
            }
        } catch (error) {
            console.error('Ошибка восстановления сессии:', error);
            logout();
        }
    } else {
        updateProfileUI();
    }
}

// Импорт (если используете модули)
import { showWelcomeModal, hideLoading, updateFlightStatus } from './ui.js';

// Использование
document.addEventListener('DOMContentLoaded', () => {
    showWelcomeModal();
    hideLoading(3000);
    updateFlightStatus('ready');
});
