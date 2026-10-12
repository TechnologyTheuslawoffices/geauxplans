import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface ProfileForm {
  firstName: string;
  lastName: string;
  displayName: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const EditProfile: React.FC = () => {
  const { user } = useAuth();

  const [formData, setFormData] = useState<ProfileForm>({
    firstName: '',
    lastName: '',
    displayName: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Seed the form from the signed-in user once it resolves (and whenever it
  // changes, e.g. after a save round-trips through onAuthStateChange).
  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        displayName: user.displayName || '',
      }));
    }
  }, [user]);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const changingPassword = !!(formData.newPassword || formData.confirmPassword);
    if (changingPassword) {
      if (!formData.currentPassword) {
        setMessage({ type: 'error', text: 'Please enter your current password to change it.' });
        return;
      }
      if (formData.newPassword !== formData.confirmPassword) {
        setMessage({ type: 'error', text: 'New passwords do not match.' });
        return;
      }
      if (formData.newPassword.length < 8) {
        setMessage({ type: 'error', text: 'New password must be at least 8 characters long.' });
        return;
      }
    }

    if (!user) {
      setMessage({ type: 'error', text: 'You must be signed in to update your account.' });
      return;
    }

    setSaving(true);
    try {
      // Verify the current password by re-authenticating before changing it —
      // Supabase's updateUser lets a logged-in session set a new password
      // without proving the old one, so we check it ourselves first.
      if (changingPassword) {
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: formData.currentPassword,
        });
        if (reauthError) {
          setMessage({ type: 'error', text: 'Current password is incorrect.' });
          setSaving(false);
          return;
        }
      }

      const payload: { data: Record<string, string>; password?: string } = {
        data: {
          first_name: formData.firstName,
          last_name: formData.lastName,
          display_name: formData.displayName,
        },
      };
      if (changingPassword) payload.password = formData.newPassword;

      const { error } = await supabase.auth.updateUser(payload);
      if (error) {
        setMessage({ type: 'error', text: error.message || 'Could not save your changes.' });
        setSaving(false);
        return;
      }

      setMessage({ type: 'success', text: 'Account details saved successfully!' });
      setFormData((prev) => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
    } catch (err) {
      setMessage({ type: 'error', text: 'An unexpected error occurred. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    border: '1px solid #eaeaea',
    borderRadius: '4px',
    fontSize: '16px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '5px',
    fontWeight: '600',
  };

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Edit Account Details</h2>
      <p style={{ marginBottom: '30px', color: '#707070' }}>
        Update your personal information and password below.
      </p>

      {message && (
        <div
          style={{
            padding: '15px 20px',
            marginBottom: '20px',
            borderRadius: '4px',
            backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
            color: message.type === 'success' ? '#155724' : '#721c24',
            border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
          }}
        >
          <i className={`fas ${message.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`} style={{ marginRight: '10px' }}></i>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-row-2col">
          <div>
            <label style={labelStyle}>
              First Name <span style={{ color: '#e74c3c' }}>*</span>
            </label>
            <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>
              Last Name <span style={{ color: '#e74c3c' }}>*</span>
            </label>
            <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} required style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>
            Display Name <span style={{ color: '#e74c3c' }}>*</span>
          </label>
          <input type="text" name="displayName" value={formData.displayName} onChange={handleChange} required style={inputStyle} />
          <p style={{ fontSize: '14px', color: '#707070', marginTop: '5px', fontStyle: 'italic' }}>
            This will be how your name will be displayed in the account section and in reviews
          </p>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <label style={labelStyle}>Email Address</label>
          <input
            type="email"
            name="email"
            value={user?.email || ''}
            disabled
            style={{ ...inputStyle, backgroundColor: '#f1f1f1', color: '#707070', cursor: 'not-allowed' }}
          />
          <p style={{ fontSize: '14px', color: '#707070', marginTop: '5px', fontStyle: 'italic' }}>
            Your email can&rsquo;t be changed here. Contact us at +1 (855) 213-6300 if you need to update it.
          </p>
        </div>

        <fieldset
          style={{
            border: '1px solid #eaeaea',
            borderRadius: '8px',
            padding: '25px',
            marginBottom: '30px',
          }}
        >
          <legend style={{ fontSize: '18px', fontWeight: '600', padding: '0 10px' }}>
            Password Change
          </legend>

          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Current Password</label>
            <input type="password" name="currentPassword" value={formData.currentPassword} onChange={handleChange} placeholder="Leave blank to leave unchanged" autoComplete="current-password" style={inputStyle} />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>New Password</label>
            <input type="password" name="newPassword" value={formData.newPassword} onChange={handleChange} placeholder="Leave blank to leave unchanged" autoComplete="new-password" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Confirm New Password</label>
            <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="Leave blank to leave unchanged" autoComplete="new-password" style={inputStyle} />
          </div>
        </fieldset>

        <button
          type="submit"
          className="btn btn-primary btn-lg"
          disabled={saving}
          style={{
            padding: '15px 40px',
            cursor: saving ? 'not-allowed' : 'pointer',
            width: '100%',
            maxWidth: '320px',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
};

export default EditProfile;
