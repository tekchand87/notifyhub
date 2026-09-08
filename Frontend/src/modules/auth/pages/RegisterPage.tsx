import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '@/modules/auth/AuthContext';
import { registerSchema, type RegisterFormData } from '@/modules/auth/schemas';
import { ROUTES } from '@/constants';
import { extractErrorMessage, cn } from '@/lib/utils';

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
    <div className="min-h-screen flex bg-surface-50 dark:bg-[#111214]">
      {/* Left panel — branding */}
      <div
        className={cn(
          'hidden lg:flex flex-col justify-between w-80 shrink-0 px-10 py-10',
          'bg-surface-900 dark:bg-[#0e0f11]',
          'border-r border-surface-800 dark:border-[#2a2d32]',
        )}
      >
        <div>
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-8 h-8 rounded bg-surface-800 border border-surface-700 flex items-center justify-center">
              <span className="text-primary-500 font-bold text-base">N</span>
            </div>
            <span className="text-white font-semibold text-sm tracking-tight">NotifyHub</span>
          </div>

          <h2 className="text-lg font-semibold text-white mb-2 leading-snug">
            Set up your<br />notification workspace
          </h2>
          <p className="text-sm text-surface-400 leading-relaxed">
            Create your organization's notification console. Invite team members and start delivering events in minutes.
          </p>
        </div>

        <div className="space-y-3">
          {[
            'Isolated tenant workspace',
            'Instant Kafka event routing',
            'API key management',
            'Team member access',
          ].map((f) => (
            <div key={f} className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-primary-500" />
              <span className="text-xs text-surface-400">{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-7 h-7 rounded bg-surface-900 dark:bg-surface-800 flex items-center justify-center">
              <span className="text-primary-500 font-bold text-sm">N</span>
            </div>
            <span className="font-semibold text-sm text-surface-900 dark:text-surface-100">
              NotifyHub
            </span>
          </div>

          <div className="mb-7">
            <h1 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
              Create account
            </h1>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
              Start your organization's notification workspace
            </p>
          </div>

          {serverError && (
            <div
              className={cn(
                'mb-5 px-3 py-2.5 rounded border text-xs',
                'bg-error-50 border-error-200 text-error-700',
                'dark:bg-error-950 dark:border-error-800 dark:text-error-300',
              )}
              role="alert"
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div className="field">
              <label htmlFor="name" className="label">Full name</label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                className="input"
                placeholder="Jane Smith"
                {...register('name')}
              />
              {errors.name && <p className="field-error">{errors.name.message}</p>}
            </div>

            <div className="field">
              <label htmlFor="reg-email" className="label">Work email</label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                className="input"
                placeholder="you@company.com"
                {...register('email')}
              />
              {errors.email && <p className="field-error">{errors.email.message}</p>}
            </div>

            <div className="field">
              <label htmlFor="tenantName" className="label">Organization name</label>
              <input
                id="tenantName"
                type="text"
                className="input"
                placeholder="Acme Corp"
                {...register('tenantName')}
              />
              {errors.tenantName && <p className="field-error">{errors.tenantName.message}</p>}
            </div>

            <div className="field">
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700 dark:hover:text-surface-300"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword
                    ? <EyeOff className="w-3.5 h-3.5" />
                    : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {errors.password && <p className="field-error">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              id="register-submit"
              disabled={isSubmitting}
              className="btn-primary w-full justify-center mt-2"
            >
              {isSubmitting ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-xs text-surface-500 dark:text-surface-400 mt-6">
            Already have an account?{' '}
            <Link to={ROUTES.LOGIN} className="link font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
