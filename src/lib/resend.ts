interface EmailOptions {
  to: string
  subject: string
  html: string
  apiKey: string
  from?: string
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  const { to, subject, html, apiKey, from = 'Chat App <noreply@yourdomain.com>' } = options

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Resend API error:', error)
      return { success: false, error: `Failed to send email: ${response.status}` }
    }

    return { success: true }
  } catch (error) {
    console.error('Email sending error:', error)
    return { success: false, error: 'Failed to send email' }
  }
}

export function generateVerificationEmail(verifyUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .container {
          background: #f9f9f9;
          border-radius: 8px;
          padding: 30px;
        }
        .button {
          display: inline-block;
          background: #0070f3;
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 6px;
          margin: 20px 0;
        }
        .footer {
          margin-top: 30px;
          font-size: 12px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>メール認証を完了してください</h2>
        <p>こんにちは。</p>
        <p>以下のボタンをクリックしてメール認証を完了してください。</p>
        <p>このリンクは60分で有効期限が切れます。</p>
        <a href="${verifyUrl}" class="button">メール認証を完了する</a>
        <p>または、以下のURLをコピーしてブラウザに貼り付けてください：</p>
        <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 4px;">${verifyUrl}</p>
        <div class="footer">
          <p>もしこのメールに心当たりがなければ無視して構いません。</p>
        </div>
      </div>
    </body>
    </html>
  `
}
