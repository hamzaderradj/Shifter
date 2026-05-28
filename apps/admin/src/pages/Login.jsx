import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bike } from 'lucide-react';
import { authAPI } from '../services/api';
import { useAuthStore } from '../store/auth';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [step, setStep] = useState('phone'); // phone | otp
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.sendOtp(phone);
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur envoi OTP');
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authAPI.verifyOtp(phone, otp);
      if (data.user.role !== 'admin') {
        setError('Accès réservé aux administrateurs.');
        return;
      }
      login(data.accessToken, data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Code incorrect');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/20 border-2 border-primary/30 mb-4">
            <Bike size={40} className="text-primary" />
          </div>
          <h1 className="text-3xl font-black text-white">TaxaMoto</h1>
          <p className="text-white/50 mt-1">Panneau d'administration</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-secondary mb-6">
            {step === 'phone' ? 'Connexion admin' : 'Code de vérification'}
          </h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
              {error}
            </div>
          )}

          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Numéro de téléphone admin
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+221 77 000 00 00"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-secondary focus:outline-none focus:border-primary transition-colors"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading || !phone}
                className="btn-primary w-full py-3 text-base"
              >
                {loading ? 'Envoi...' : 'Recevoir le code OTP'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                En développement, le code OTP est : <strong className="text-primary">123456</strong>
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <p className="text-sm text-gray-500 mb-4">
                Code envoyé au <strong className="text-secondary">{phone}</strong>
              </p>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Code à 6 chiffres
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl font-bold text-secondary tracking-widest focus:outline-none focus:border-primary transition-colors"
                  maxLength={6}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="btn-primary w-full py-3 text-base"
              >
                {loading ? 'Vérification...' : 'Accéder au dashboard'}
              </button>
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
              >
                ← Changer de numéro
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
