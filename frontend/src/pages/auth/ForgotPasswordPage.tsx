import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authService.forgotPassword(email);
      setSubmitted(true);
      if (res?.devResetToken) {
        setDevToken(res.devResetToken);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit reset request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="Brightloop Subscription Manager" className="h-12 mx-auto object-contain mb-3" />
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl mx-auto flex items-center justify-center mb-3">
            <Mail className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Reset Password</h2>
          <p className="text-sm text-slate-500 mt-1">
            Enter your registered email address and we'll send a secure reset link.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {submitted ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Reset Link Dispatched</p>
                <p className="text-xs text-emerald-700 mt-1">
                  If an account exists for {email}, a secure password reset link has been dispatched.
                </p>
              </div>
            </div>

            {devToken && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                <p className="font-semibold text-slate-700">Development Direct Link:</p>
                <Link
                  to={`/reset-password?token=${devToken}`}
                  className="block text-indigo-600 hover:underline font-mono break-all"
                >
                  Click here to proceed to Reset Screen (Token: {devToken.slice(0, 16)}...)
                </Link>
              </div>
            )}

            <div className="text-center pt-2">
              <Link to="/login" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                Return to Login
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Registered Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@brightloop.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow transition disabled:opacity-50 text-sm"
            >
              {loading ? 'Submitting...' : 'Send Password Reset Link'}
            </button>

            <div className="pt-2 text-center">
              <Link to="/login" className="inline-flex items-center space-x-1 text-sm text-slate-600 hover:text-slate-800">
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Sign In</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

