//Авторизация, логин/регистрация
        // ========== МОДУЛЬ АВТОРИЗАЦИИ ==========

// Функции авторизации
async function login(email, password) {
    try {
        const response = await fetch(`${window.App.API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            window.App.token = data.token;
            window.App.currentUser = data.user;
            window.App.isGuest = false;
            localStorage.setItem('token', data.token);
            
            showAuthModal(false);
            updateProfileUI();
            clearAuthForms();
            await restoreBalloon();
            showSuccess('Добро пожаловать, ' + data.user.email + '!');
            return true;
        } else {
            showError(data.error || 'Ошибка входа');
            return false;
        }
    } catch (error) {
        console.error('Ошибка входа:', error);
        showError('Ошибка соединения с сервером');
        return false;
    }
}

async function register(email, password) {
    if (password.length < 6) {
        showError('Пароль должен быть не менее 6 символов');
        return false;
    }
    
    try {
        const response = await fetch(`${window.App.API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            window.App.token = data.token;
            window.App.currentUser = data.user;
            window.App.isGuest = false;
            localStorage.setItem('token', data.token);
            
            showAuthModal(false);
            updateProfileUI();
            clearAuthForms();
            showSuccess('Регистрация успешна! Добро пожаловать!');
            return true;
        } else {
            showError(data.error || 'Ошибка регистрации');
            return false;
        }
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        showError('Ошибка соединения с сервером');
        return false;
    }
}

function logout() {
    localStorage.removeItem('token');
    window.App.token = null;
    window.App.currentUser = null;
    window.App.isGuest = true;
    
    updateProfileUI();
    resetFlight();
    showAuthModal(false);
    showSuccess('Вы вышли из аккаунта');
}

function continueAsGuest() {
    window.App.isGuest = true;
    window.App.currentUser = null;
    window.App.token = null;
    
    showAuthModal(false);
    updateProfileUI();
    showSuccess('Вы вошли как гость');
}

// Восстановление сессии
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
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const continueGuestBtn = document.getElementById('continueGuestBtn');
    const profileButton = document.getElementById('profileButton');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            login(
                document.getElementById('loginEmail').value,
                document.getElementById('loginPassword').value
            );
        });
    }
    
    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            register(
                document.getElementById('regEmail').value,
                document.getElementById('regPassword').value
            );
        });
    }
    
    if (continueGuestBtn) {
        continueGuestBtn.addEventListener('click', continueAsGuest);
    }
    
    if (profileButton) {
        profileButton.addEventListener('click', () => showAuthModal(true));
    }
}
