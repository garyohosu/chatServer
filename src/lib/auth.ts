import { Lucia } from 'lucia'
import { D1Adapter } from '@lucia-auth/adapter-sqlite'
import type { D1Database } from '@cloudflare/workers-types'

export function initializeLucia(db: D1Database) {
  const adapter = new D1Adapter(db, {
    user: 'users',
    session: 'sessions'
  })

  return new Lucia(adapter, {
    sessionCookie: {
      attributes: {
        secure: true
      }
    },
    getUserAttributes: (attributes) => {
      return {
        email: attributes.email,
        verified: attributes.verified
      }
    }
  })
}

declare module 'lucia' {
  interface Register {
    Lucia: ReturnType<typeof initializeLucia>
    DatabaseUserAttributes: DatabaseUserAttributes
  }
}

interface DatabaseUserAttributes {
  email: string
  verified: number
}
