import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('FATAL: JWT_SECRET environment variable is not set!');
  return secret;
};

export const generateToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, getSecret(), { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
};

export const verifyToken = (token) => {
  return jwt.verify(token, getSecret());
};

export const setTokenCookie = (res, token) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

export const clearTokenCookie = (res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0),
  });
};

export const generateOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};
