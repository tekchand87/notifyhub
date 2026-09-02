import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '@/modules/auth/AuthContext';
import { loginSchema, type LoginFormData } from '@/modules/auth/schemas';
import { ROUTES } from '@/constants';
import { extractErrorMessage } from '@/lib/utils';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginFormData) => {
    setServerError('');
    try {
      await login(data);
      navigate(ROUTES.DASHBOARD, { replace: true });
    } catch (err) {
      setServerError(extractErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-100 dark:bg-surface-950 px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded bg-primary-600 text-white font-bold text-lg mb-3">
            N
          </div>
          <h1 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
            Sign in to NotifyHub
          </h1>
          <p className="text-sm text-surface-500 mt-1">Notification management console</p>
        </div>

        <div className="card p-6">
          {serverError && (
            <div className="mb-4 px-3 py-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label htmlFor="email" className="label">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input"
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input pr-9"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.password.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full justify-center"
            >
              {isSubmitting ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-surface-500 mt-4">
          Don't have an account?{' '}
          <Link to={ROUTES.REGISTER} className="link">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
