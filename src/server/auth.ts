import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../types';

// Authenticated principal derived from the verified JWT.
export interface AuthUser {
  email: string;
  role: UserRole;
  establishmentId: string;
}

// Declaration merging: make req.user available and typed across the app.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const DEFAULT_SECRET = 'dev-only-change-me';
export const SECRET: string = process.env.AUTH_SECRET || DEFAULT_SECRET;
if (SECRET === DEFAULT_SECRET) {
  // In production the default secret is public (it lives in the repo), so anyone
  // could forge admin tokens. Refuse to boot instead of silently accepting it.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[auth] AUTH_SECRET must be set in production. Refusing to start with the insecure default secret.'
    );
  }
  console.warn(
    '[auth] AUTH_SECRET not set — using insecure default "dev-only-change-me". Set AUTH_SECRET in production.'
  );
}

export const SESSION_COOKIE = 'mimenu_session';

interface SessionClaims {
  sub: string;
  email: string;
  role: UserRole;
  establishmentId: string;
}

// Soft session check: returns the authenticated principal or null, WITHOUT ever
// responding. Used by endpoints that must serve both authenticated and anonymous
// callers (e.g. the /api/realtime SSE stream, where a diner is valid without a cookie).
//
// The web frontend authenticates ONLY via the httpOnly session cookie — the token is
// never returned to the browser (XSS token-theft protection). The Authorization: Bearer
// path exists purely for external/programmatic API clients that obtain a token by other
// means; it must NOT be used from the web frontend.
export function verifySession(req: Request): AuthUser | null {
  let token = req.cookies?.[SESSION_COOKIE];

  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, SECRET) as SessionClaims;
    return {
      email: decoded.email,
      role: decoded.role,
      establishmentId: decoded.establishmentId,
    };
  } catch {
    return null;
  }
}

// Verify the session cookie or Authorization header and populate req.user; 401 on missing/invalid token.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = verifySession(req);
  if (!user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  req.user = user;
  next();
}

// Guard a route by role; must run after requireAuth.
export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.role !== role) {
      res.status(403).json({ error: 'Permisos insuficientes' });
      return;
    }
    next();
  };
}
