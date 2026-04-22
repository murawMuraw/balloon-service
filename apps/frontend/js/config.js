 // Конфигурация (API_URL, ZONES)
// ========== КОНФИГУРАЦИЯ ==========
const API_URL = window.location.origin;

// Зоны тумана (в метрах)
const ZONES = { 
    BRIGHT: 5000,   // Зона полной видимости
    MEDIUM: 10000,  // Зона средней видимости  
    HAZE: 15000     // Зона тумана
};

// Глобальные переменные состояния
let token = localStorage.getItem('token');
let currentUser = null;
let isGuest = !token;

// Состояние полёта
let isFlying = false;
let startMarker = null;
let balloonMarker = null;
let balloonPosition = null;
let currentWind = null;
let forecastLine = null;
let pathLine = null;
let forecastPoints = [];
let actualPathPoints = [];
let movementInterval = null;
let windUpdateInterval = null;
let balloonId = null;
