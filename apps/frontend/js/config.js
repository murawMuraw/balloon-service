 // Конфигурация (API_URL, ZONES)
// ========== КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ ==========

window.App = {
    // API конфигурация
    API_URL: window.location.origin,
    
    // Зоны тумана (в метрах)
    ZONES: { 
        BRIGHT: 5000,   // Зона полной видимости
        MEDIUM: 10000,  // Зона средней видимости  
        HAZE: 15000     // Зона тумана
    },
    
    // Состояние авторизации
    token: localStorage.getItem('token'),
    currentUser: null,
    isGuest: !localStorage.getItem('token'),
    
    // Состояние полёта
    isFlying: false,
    startMarker: null,
    balloonMarker: null,
    balloonPosition: null,
    currentWind: null,
    forecastLine: null,
    pathLine: null,
    forecastPoints: [],
    actualPathPoints: [],
    movementInterval: null,
    windUpdateInterval: null,
    balloonId: null,
    
    // UI состояние
    lastPlaceCheck: null
};;
