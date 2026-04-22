//Авторизация, логин/регистрация
        
        function showAuthModal(show = true) {
            document.getElementById('authModal').classList.toggle('hidden', !show);
        }
        
        function updateProfileUI() {
            const profileStatus = document.getElementById('profileStatus');
            const profileBtn = document.getElementById('profileButton');
            
            if (currentUser) {
                profileStatus.textContent = currentUser.email;
                profileBtn.style.background = 'rgba(255,255,255,0.95)';
                profileBtn.style.borderColor = '#4caf50';
            } else if (isGuest) {
                profileStatus.textContent = 'Гость';
                profileBtn.style.background = 'rgba(255,255,255,0.95)';
                profileBtn.style.borderColor = '#ff9800';
            }
        }
        
        async function login(email, password) {
            try {
                const response = await fetch(`${API_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();
                if (response.ok) {
                    token = data.token;
                    currentUser = data.user;
                    isGuest = false;
                    localStorage.setItem('token', token);
                    showAuthModal(false);
                    updateProfileUI();
                    await restoreBalloon();
                    return true;
                } else {
                    document.getElementById('loginError').textContent = data.error || 'Ошибка входа';
                    return false;
                }
            } catch (error) {
                document.getElementById('loginError').textContent = 'Ошибка соединения';
                return false;
            }
        }
        
        async function register(email, password) {
            if (password.length < 6) {
                document.getElementById('regError').textContent = 'Пароль должен быть не менее 6 символов';
                return false;
            }
            try {
                const response = await fetch(`${API_URL}/api/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();
                if (response.ok) {
                    token = data.token;
                    currentUser = data.user;
                    isGuest = false;
                    localStorage.setItem('token', token);
                    showAuthModal(false);
                    updateProfileUI();
                    return true;
                } else {
                    document.getElementById('regError').textContent = data.error || 'Ошибка регистрации';
                    return false;
                }
            } catch (error) {
                document.getElementById('regError').textContent = 'Ошибка соединения';
                return false;
            }
        }
        
        function logout() {
            localStorage.removeItem('token');
            token = null;
            currentUser = null;
            isGuest = true;
            updateProfileUI();
            resetFlight();
            showAuthModal(false);
        }
        
        function continueAsGuest() {
            isGuest = true;
            currentUser = null;
            token = null;
            showAuthModal(false);
            updateProfileUI();
        }
