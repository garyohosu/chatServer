import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie } from 'hono/cookie'
import { initializeLucia } from './lib/auth'
import { hashPassword, verifyPassword, generateToken, generateUserId } from './lib/utils'
import { sendEmail, generateVerificationEmail } from './lib/resend'
import type { CloudflareBindings } from '../worker-configuration'

type Env = {
  Bindings: CloudflareBindings
}

const app = new Hono<Env>()

// CORS middleware for API routes
app.use('/api/*', cors())

// ========================================
// API Routes
// ========================================

// Register new user
app.post('/api/register', async (c) => {
  try {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      return c.json({ ok: false, error: 'Email and password are required' }, 400)
    }

    if (password.length < 8) {
      return c.json({ ok: false, error: 'Password must be at least 8 characters' }, 400)
    }

    const db = c.env.DB

    // Check if user already exists
    const existingUser = await db
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first()

    if (existingUser) {
      return c.json({ ok: false, error: 'Email already registered' }, 400)
    }

    // Create user
    const userId = generateUserId()
    const passwordHash = await hashPassword(password)
    const createdAt = Date.now()

    await db
      .prepare('INSERT INTO users (id, email, password_hash, verified, created_at) VALUES (?, ?, ?, 0, ?)')
      .bind(userId, email, passwordHash, createdAt)
      .run()

    // Generate verification token
    const token = generateToken(48)
    const expiresAt = Date.now() + 60 * 60 * 1000 // 60 minutes

    await db
      .prepare('INSERT INTO email_verification_tokens (token, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(token, userId, expiresAt)
      .run()

    // Send verification email
    const baseUrl = c.env.BASE_URL || new URL(c.req.url).origin
    const verifyUrl = `${baseUrl}/verify?token=${token}`
    const apiKey = c.env.RESEND_API_KEY

    if (!apiKey) {
      console.error('RESEND_API_KEY is not configured')
      return c.json({ ok: false, error: 'Email service is not configured' }, 500)
    }

    const emailResult = await sendEmail({
      to: email,
      subject: 'メール認証を完了してください',
      html: generateVerificationEmail(verifyUrl),
      apiKey
    })

    if (!emailResult.success) {
      return c.json({ ok: false, error: emailResult.error }, 500)
    }

    return c.json({ ok: true, message: 'Check your email for verification link' })
  } catch (error) {
    console.error('Registration error:', error)
    return c.json({ ok: false, error: 'Registration failed' }, 500)
  }
})

// Verify email
app.get('/verify', async (c) => {
  try {
    const token = c.req.query('token')

    if (!token) {
      return c.html('<h1>Invalid verification link</h1>')
    }

    const db = c.env.DB

    // Get token info
    const tokenData = await db
      .prepare('SELECT user_id, expires_at FROM email_verification_tokens WHERE token = ?')
      .bind(token)
      .first<{ user_id: string; expires_at: number }>()

    if (!tokenData) {
      return c.html('<h1>Invalid or expired verification link</h1>')
    }

    if (tokenData.expires_at < Date.now()) {
      await db
        .prepare('DELETE FROM email_verification_tokens WHERE token = ?')
        .bind(token)
        .run()
      return c.html('<h1>Verification link has expired</h1>')
    }

    // Update user as verified
    await db
      .prepare('UPDATE users SET verified = 1 WHERE id = ?')
      .bind(tokenData.user_id)
      .run()

    // Delete token
    await db
      .prepare('DELETE FROM email_verification_tokens WHERE token = ?')
      .bind(token)
      .run()

    // Create session
    const lucia = initializeLucia(db)
    const session = await lucia.createSession(tokenData.user_id, {})
    const sessionCookie = lucia.createSessionCookie(session.id)

    setCookie(c, sessionCookie.name, sessionCookie.value, sessionCookie.attributes)

    // Redirect to chat
    return c.redirect('/chat')
  } catch (error) {
    console.error('Verification error:', error)
    return c.html('<h1>Verification failed</h1>')
  }
})

// Login
app.post('/api/login', async (c) => {
  try {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      return c.json({ ok: false, error: 'Email and password are required' }, 400)
    }

    const db = c.env.DB

    // Get user
    const user = await db
      .prepare('SELECT id, password_hash, verified FROM users WHERE email = ?')
      .bind(email)
      .first<{ id: string; password_hash: string; verified: number }>()

    if (!user) {
      return c.json({ ok: false, error: 'Invalid email or password' }, 401)
    }

    if (!user.verified) {
      return c.json({ ok: false, error: 'Please verify your email first' }, 401)
    }

    // Verify password
    const isValidPassword = await verifyPassword(user.password_hash, password)

    if (!isValidPassword) {
      return c.json({ ok: false, error: 'Invalid email or password' }, 401)
    }

    // Create session
    const lucia = initializeLucia(db)
    const session = await lucia.createSession(user.id, {})
    const sessionCookie = lucia.createSessionCookie(session.id)

    setCookie(c, sessionCookie.name, sessionCookie.value, sessionCookie.attributes)

    return c.json({ ok: true, message: 'Login successful' })
  } catch (error) {
    console.error('Login error:', error)
    return c.json({ ok: false, error: 'Login failed' }, 500)
  }
})

// Logout
app.post('/api/logout', async (c) => {
  try {
    const db = c.env.DB
    const lucia = initializeLucia(db)
    const sessionId = getCookie(c, lucia.sessionCookieName)

    if (sessionId) {
      await lucia.invalidateSession(sessionId)
    }

    const blankCookie = lucia.createBlankSessionCookie()
    setCookie(c, blankCookie.name, blankCookie.value, blankCookie.attributes)

    return c.json({ ok: true, message: 'Logout successful' })
  } catch (error) {
    console.error('Logout error:', error)
    return c.json({ ok: false, error: 'Logout failed' }, 500)
  }
})

// Get current user
app.get('/api/user', async (c) => {
  try {
    const db = c.env.DB
    const lucia = initializeLucia(db)
    const sessionId = getCookie(c, lucia.sessionCookieName)

    if (!sessionId) {
      return c.json({ ok: false, error: 'Not authenticated' }, 401)
    }

    const { session, user } = await lucia.validateSession(sessionId)

    if (!session) {
      return c.json({ ok: false, error: 'Invalid session' }, 401)
    }

    return c.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        verified: user.verified
      }
    })
  } catch (error) {
    console.error('Get user error:', error)
    return c.json({ ok: false, error: 'Failed to get user' }, 500)
  }
})

// Post message
app.post('/api/messages', async (c) => {
  try {
    const db = c.env.DB
    const lucia = initializeLucia(db)
    const sessionId = getCookie(c, lucia.sessionCookieName)

    if (!sessionId) {
      return c.json({ ok: false, error: 'Not authenticated' }, 401)
    }

    const { session, user } = await lucia.validateSession(sessionId)

    if (!session) {
      return c.json({ ok: false, error: 'Invalid session' }, 401)
    }

    const { message } = await c.req.json()

    if (!message || message.trim().length === 0) {
      return c.json({ ok: false, error: 'Message cannot be empty' }, 400)
    }

    if (message.length > 1000) {
      return c.json({ ok: false, error: 'Message is too long (max 1000 characters)' }, 400)
    }

    const createdAt = Date.now()

    await db
      .prepare('INSERT INTO messages (user_id, message, created_at) VALUES (?, ?, ?)')
      .bind(user.id, message.trim(), createdAt)
      .run()

    return c.json({ ok: true, message: 'Message posted' })
  } catch (error) {
    console.error('Post message error:', error)
    return c.json({ ok: false, error: 'Failed to post message' }, 500)
  }
})

// Get messages
app.get('/api/messages', async (c) => {
  try {
    const db = c.env.DB
    const after = c.req.query('after')
    const afterTimestamp = after ? parseInt(after) : 0

    const messages = await db
      .prepare(`
        SELECT m.id, m.message, m.created_at, u.email
        FROM messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.created_at > ?
        ORDER BY m.created_at ASC
        LIMIT 100
      `)
      .bind(afterTimestamp)
      .all()

    return c.json({
      ok: true,
      messages: messages.results.map((msg: any) => ({
        id: msg.id,
        message: msg.message,
        email: msg.email,
        createdAt: msg.created_at
      }))
    })
  } catch (error) {
    console.error('Get messages error:', error)
    return c.json({ ok: false, error: 'Failed to get messages' }, 500)
  }
})

// ========================================
// HTML Pages
// ========================================

// Home page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chat App - ホーム</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
            <h1 class="text-3xl font-bold text-gray-800 mb-6 text-center">
                チャットアプリへようこそ
            </h1>
            <p class="text-gray-600 mb-6 text-center">
                メール認証付きのセキュアなチャットアプリです
            </p>
            <div class="space-y-4">
                <a href="/register" 
                   class="block w-full bg-blue-600 text-white text-center py-3 rounded-lg hover:bg-blue-700 transition">
                    新規登録
                </a>
                <a href="/login" 
                   class="block w-full bg-gray-600 text-white text-center py-3 rounded-lg hover:bg-gray-700 transition">
                    ログイン
                </a>
            </div>
        </div>
    </body>
    </html>
  `)
})

// Register page
app.get('/register', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>新規登録 - Chat App</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
            <h1 class="text-2xl font-bold text-gray-800 mb-6">新規登録</h1>
            <form id="registerForm" class="space-y-4">
                <div>
                    <label class="block text-gray-700 mb-2">メールアドレス</label>
                    <input type="email" name="email" required
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div>
                    <label class="block text-gray-700 mb-2">パスワード（8文字以上）</label>
                    <input type="password" name="password" required minlength="8"
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <button type="submit"
                        class="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition">
                    登録
                </button>
                <div id="message" class="text-center"></div>
            </form>
            <p class="text-center text-gray-600 mt-4">
                <a href="/login" class="text-blue-600 hover:underline">ログインはこちら</a>
            </p>
        </div>
        <script>
            document.getElementById('registerForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const email = formData.get('email');
                const password = formData.get('password');
                const messageEl = document.getElementById('message');

                messageEl.textContent = '登録中...';
                messageEl.className = 'text-center text-blue-600';

                try {
                    const response = await fetch('/api/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    });

                    const data = await response.json();

                    if (data.ok) {
                        messageEl.textContent = '確認メールを送信しました。メールを確認してください。';
                        messageEl.className = 'text-center text-green-600';
                        e.target.reset();
                    } else {
                        messageEl.textContent = data.error || '登録に失敗しました';
                        messageEl.className = 'text-center text-red-600';
                    }
                } catch (error) {
                    messageEl.textContent = 'エラーが発生しました';
                    messageEl.className = 'text-center text-red-600';
                }
            });
        </script>
    </body>
    </html>
  `)
})

// Login page
app.get('/login', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ログイン - Chat App</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 min-h-screen flex items-center justify-center">
        <div class="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
            <h1 class="text-2xl font-bold text-gray-800 mb-6">ログイン</h1>
            <form id="loginForm" class="space-y-4">
                <div>
                    <label class="block text-gray-700 mb-2">メールアドレス</label>
                    <input type="email" name="email" required
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div>
                    <label class="block text-gray-700 mb-2">パスワード</label>
                    <input type="password" name="password" required
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <button type="submit"
                        class="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition">
                    ログイン
                </button>
                <div id="message" class="text-center"></div>
            </form>
            <p class="text-center text-gray-600 mt-4">
                <a href="/register" class="text-blue-600 hover:underline">新規登録はこちら</a>
            </p>
        </div>
        <script>
            document.getElementById('loginForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const email = formData.get('email');
                const password = formData.get('password');
                const messageEl = document.getElementById('message');

                messageEl.textContent = 'ログイン中...';
                messageEl.className = 'text-center text-blue-600';

                try {
                    const response = await fetch('/api/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    });

                    const data = await response.json();

                    if (data.ok) {
                        window.location.href = '/chat';
                    } else {
                        messageEl.textContent = data.error || 'ログインに失敗しました';
                        messageEl.className = 'text-center text-red-600';
                    }
                } catch (error) {
                    messageEl.textContent = 'エラーが発生しました';
                    messageEl.className = 'text-center text-red-600';
                }
            });
        </script>
    </body>
    </html>
  `)
})

// Chat page
app.get('/chat', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>チャット - Chat App</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 min-h-screen">
        <div class="container mx-auto px-4 py-8 max-w-4xl">
            <div class="bg-white rounded-lg shadow-md p-6 mb-4">
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold text-gray-800">チャットルーム</h1>
                        <p class="text-gray-600" id="userInfo">読み込み中...</p>
                    </div>
                    <button id="logoutBtn"
                            class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition">
                        ログアウト
                    </button>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-md p-6 mb-4">
                <div id="messages" class="space-y-4 mb-4 h-96 overflow-y-auto">
                    <!-- Messages will be loaded here -->
                </div>
                <form id="messageForm" class="flex gap-2">
                    <input type="text" name="message" required maxlength="1000" placeholder="メッセージを入力..."
                           class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <button type="submit"
                            class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition">
                        送信
                    </button>
                </form>
            </div>
        </div>

        <script>
            let lastTimestamp = 0;
            let currentUserEmail = '';

            async function checkAuth() {
                try {
                    const response = await fetch('/api/user');
                    const data = await response.json();

                    if (!data.ok) {
                        window.location.href = '/login';
                        return false;
                    }

                    currentUserEmail = data.user.email;
                    document.getElementById('userInfo').textContent = \`ログイン中: \${data.user.email}\`;
                    return true;
                } catch (error) {
                    console.error('Auth check error:', error);
                    window.location.href = '/login';
                    return false;
                }
            }

            async function loadMessages() {
                try {
                    const response = await fetch(\`/api/messages?after=\${lastTimestamp}\`);
                    const data = await response.json();

                    if (data.ok && data.messages.length > 0) {
                        const messagesDiv = document.getElementById('messages');
                        data.messages.forEach(msg => {
                            const messageEl = document.createElement('div');
                            const isOwn = msg.email === currentUserEmail;
                            messageEl.className = \`p-3 rounded-lg \${isOwn ? 'bg-blue-100 ml-auto' : 'bg-gray-100'} max-w-lg\`;
                            
                            const time = new Date(msg.createdAt).toLocaleString('ja-JP');
                            messageEl.innerHTML = \`
                                <div class="text-xs text-gray-600 mb-1">\${msg.email} - \${time}</div>
                                <div class="text-gray-800">\${escapeHtml(msg.message)}</div>
                            \`;
                            messagesDiv.appendChild(messageEl);
                            lastTimestamp = Math.max(lastTimestamp, msg.createdAt);
                        });

                        messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    }
                } catch (error) {
                    console.error('Load messages error:', error);
                }
            }

            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            document.getElementById('messageForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const message = formData.get('message');

                try {
                    const response = await fetch('/api/messages', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message })
                    });

                    const data = await response.json();

                    if (data.ok) {
                        e.target.reset();
                        loadMessages();
                    } else {
                        alert(data.error || 'メッセージの送信に失敗しました');
                    }
                } catch (error) {
                    alert('エラーが発生しました');
                }
            });

            document.getElementById('logoutBtn').addEventListener('click', async () => {
                try {
                    await fetch('/api/logout', { method: 'POST' });
                    window.location.href = '/';
                } catch (error) {
                    console.error('Logout error:', error);
                }
            });

            // Initialize
            checkAuth().then(isAuthenticated => {
                if (isAuthenticated) {
                    loadMessages();
                    setInterval(loadMessages, 3000);
                }
            });
        </script>
    </body>
    </html>
  `)
})

export default app
