import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { verifyPassword } from '@/lib/security'

/**
 * NextAuth configuration — safe for Vercel + Turso.
 *
 * Uses dynamic import for Prisma db client to avoid the Prisma+LibSQL
 * adapter crash at module-load time. When TURSO_DATABASE_URL is set,
 * we use raw @libsql/client SQL instead of Prisma.
 *
 * NOTE: The custom /api/auth/login endpoint (login/route.ts) is the
 * primary login path and is already fully migrated to raw SQL.
 * This NextAuth config serves as a secondary/fallback auth path.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const tursoUrl = process.env.TURSO_DATABASE_URL
        const authToken = process.env.TURSO_API_TOKEN

        if (tursoUrl) {
          // ── REMOTE: Turso cloud via raw libsql ──
          const { createClient } = await import('@libsql/client')
          const client = createClient({ url: tursoUrl, authToken: authToken || undefined })

          const result = await client.execute({
            sql: `SELECT id, email, name, password, role, active FROM "User" WHERE email = ? LIMIT 1`,
            args: [credentials.email],
          })

          if (result.rows.length === 0) return null
          const row = result.rows[0]

          if (!row.active || Number(row.active) !== 1) return null
          const { valid } = await verifyPassword(credentials.password, row.password as string)
          if (!valid) return null

          // Update last login
          await client.execute({
            sql: `UPDATE "User" SET "lastLogin" = CURRENT_TIMESTAMP WHERE id = ?`,
            args: [row.id as string],
          })

          return {
            id: row.id as string,
            email: row.email as string,
            name: row.name as string,
            role: row.role as string,
          }
        }

        // ── LOCAL: Fallback to Prisma with local SQLite ──
        const { db } = await import('@/lib/db')

        const user = await db.user.findUnique({ where: { email: credentials.email } })
        if (!user) return null
        if (!user.active) return null
        const { valid } = await verifyPassword(credentials.password, user.password)
        if (!valid) return null

        await db.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: string }).role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string }).id = token.id as string
        ;(session.user as { role: string }).role = token.role as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET || '',
}
