/** Auth types — shared by the Login / Register screens and `authService`. */
export type UserRole = 'patient' | 'doctor';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  user: AuthUser;
  /** Access token (JWT) — send as `Authorization: Bearer <token>`. */
  accessToken: string;
}
