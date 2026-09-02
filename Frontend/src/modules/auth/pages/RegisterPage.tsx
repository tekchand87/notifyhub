import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import { useAuth } from '@/modules/auth/AuthContext';
import { registerSchema, type RegisterFormData } from '@/modules/auth/schemas';
import { ROUTES } from '@/constants';
import { extractErrorMessage } from '@/lib/utils';

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError('');
    try {
      await registerUser(data);
      navigate(ROUTES.DASHBOARD, { replace: true });
    } catch (err) {
      setServerError(extractErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-100 dark:bg-surface-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded bg-primary-600 text-white font-bold text-lg mb-3">
            N
          </div>
          <h1 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
            Create your account
          </h1>
          <p className="text-sm text-surface-500 mt-1">
            Your organization's notification console
          </p>
        </div>

        <div className="card p-6">
          {serverError && (
            <div className="mb-4 px-3 py-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label htmlFor="name" className="label">Full name</label>
              <input id="name" type="text" autoComplete="name" className="input" {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name.message}</p>}
            </div>

            <div>
              <label htmlFor="reg-email" className="label">Email address</label>
              <input id="reg-email" type="email" autoComplete="email" className="input" {...register('email')} />
              {errors.email && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="tenantName" className="label">Organization name</label>
              <input id="tenantName" type="text" className="input" placeholder="Acme Corp" {...register('tenantName')} />
              {errors.tenantName && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.tenantName.message}</p>}
            </div>

            <div>
              <label htmlFor="reg-password" className="label">Password</label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
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
              {errors.password && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center">
              {isSubmitting
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <UserPlus className="w-4 h-4" />}
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-surface-500 mt-4">
          Already have an account?{' '}
          <Link to={ROUTES.LOGIN} className="link">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
