// Simple password hashing using Web Crypto API (available in Cloudflare Workers)
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  
  // Add salt for better security
  const salt = generateToken(16)
  const saltedPassword = salt + password
  const saltedData = encoder.encode(saltedPassword)
  const saltedHashBuffer = await crypto.subtle.digest('SHA-256', saltedData)
  const saltedHashArray = Array.from(new Uint8Array(saltedHashBuffer))
  const saltedHashHex = saltedHashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  
  return `${salt}:${saltedHashHex}`
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    const [salt, storedHash] = hash.split(':')
    if (!salt || !storedHash) {
      return false
    }
    
    const encoder = new TextEncoder()
    const saltedPassword = salt + password
    const saltedData = encoder.encode(saltedPassword)
    const saltedHashBuffer = await crypto.subtle.digest('SHA-256', saltedData)
    const saltedHashArray = Array.from(new Uint8Array(saltedHashBuffer))
    const computedHash = saltedHashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    // Constant-time comparison
    if (computedHash.length !== storedHash.length) {
      return false
    }
    
    let result = 0
    for (let i = 0; i < computedHash.length; i++) {
      result |= computedHash.charCodeAt(i) ^ storedHash.charCodeAt(i)
    }
    return result === 0
  } catch {
    return false
  }
}

export function generateToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length]
  }
  
  return result
}

export function generateUserId(): string {
  return `user_${Date.now()}_${generateToken(16)}`
}
