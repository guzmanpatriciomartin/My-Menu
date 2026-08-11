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

// Verify the session cookie and populate req.user; 401 on missing/invalid token.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }

  try {
    const decoded = jwt.verify(token, SECRET) as SessionClaims;
    req.user = {
      email: decoded.email,
      role: decoded.role,
      establishmentId: decoded.establishmentId,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
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
