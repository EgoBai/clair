import { User } from './index';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}