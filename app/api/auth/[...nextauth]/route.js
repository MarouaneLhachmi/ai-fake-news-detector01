import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import GithubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import clientPromise from '@/lib/mongodb';
import bcrypt from 'bcryptjs';

export const authOptions = {
  session: {
    strategy: "jwt",
  },

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    CredentialsProvider({
      name: 'Credentials',
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const client = await clientPromise;
        const db = client.db("fake-news-detector");
        const user = await db.collection('users').findOne({ email: credentials.email });
        if (!user || !user.password) return null;
        const isPasswordCorrect = await bcrypt.compare(credentials.password, user.password);
        if (!isPasswordCorrect) return null;
        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          isAdmin: user.isAdmin === true,
        };
      }
    })
  ],

  pages: {
    signIn: '/login',
  },

  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith('aifakenewsdetector://')) return url;
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {}
      return baseUrl;
    },
    
    async signIn({ user, account }) {
      if (account?.provider === "google" || account?.provider === "github") {
        try {
          const client = await clientPromise;
          const db = client.db("fake-news-detector");
          const existing = await db.collection("users").findOne({ email: user.email });
          if (!existing) {
            await db.collection("users").insertOne({
              name: user.name,
              email: user.email,
              image: user.image,
              provider: account.provider,
              role: "user",
              isAdmin: false,
              createdAt: new Date(),
            });
          }
        } catch (err) {
          console.error("Failed to save OAuth user:", err);
        }
      }
      return true;
    },

    async jwt({ token, user, trigger, session }) {
      // Handle manual session update (profile changes)
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.email) token.email = session.email;
        if (session.role) token.role = session.role;
      }

      // KEY FIX: Always fetch from DB to get real MongoDB _id + isAdmin
      // This is critical for OAuth users (Google/GitHub) where user.id is NOT the MongoDB _id
      if (token.email) {
        try {
          const client = await clientPromise;
          const db = client.db("fake-news-detector");
          const dbUser = await db.collection("users").findOne({ email: token.email });
          if (dbUser) {
            token.id = dbUser._id.toString(); // real MongoDB _id — fixes admin checks
            token.isAdmin = dbUser.isAdmin === true;
            token.role = dbUser.role || "user";
            token.name = dbUser.name || token.name;
            token.image = dbUser.image || token.image;
          }
        } catch (err) {
          console.error("JWT DB fetch error:", err);
          // fallback on first sign-in if DB fails
          if (user) {
            token.id = user.id;
            token.isAdmin = user.isAdmin || false;
            token.role = user.role || "user";
          }
        }
      } else if (user) {
        token.id = user.id;
        token.isAdmin = user.isAdmin || false;
        token.role = user.role || "user";
      }

      return token;
    },

    async session({ session, token }) {
      if (session?.user && token) {
        session.user.id = token.id;
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.role = token.role;
        session.user.isAdmin = token.isAdmin === true;
        session.user.image = token.image || session.user.image;
      }
      return session;
    }
  },

  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
