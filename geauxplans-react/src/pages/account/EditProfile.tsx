import React, { useState } from 'react';

interface ProfileData {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const EditProfile: React.FC = () => {
  const [formData, setFormData] = useState<ProfileData>({
    firstName: 'John',
    lastName: 'Doe',
    displayName: 'John Doe',
    email: 'john.doe@example.com',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate passwords if trying to change
    if (formData.newPassword || formData.confirmPassword) {
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

    // Simulate save
    setMessage({ type: 'success', text: 'Account details saved successfully!' });

    // Clear password fields after save
    setFormData((prev) => ({
      ...prev,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    }));
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div>
            <label style={labelStyle}>
              First Name <span style={{ color: '#e74c3c' }}>*</span>
            </label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>
              Last Name <span style={{ color: '#e74c3c' }}>*</span>
            </label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              required
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>
            Display Name <span style={{ color: '#e74c3c' }}>*</span>
          </label>
          <input
            type="text"
            name="displayName"
            value={formData.displayName}
            onChange={handleChange}
            required
            style={inputStyle}
          />
          <p style={{ fontSize: '14px', color: '#707070', marginTop: '5px', fontStyle: 'italic' }}>
            This will be how your name will be displayed in the account section and in reviews
          </p>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <label style={labelStyle}>
            Email Address <span style={{ color: '#e74c3c' }}>*</span>
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            style={inputStyle}
          />
        </div>

        <fieldset
          style={{
            border: '1px solid #eaeaea',
            borderRadius: '8px',
            padding: '25px',
            marginBottom: '30px',
          }}
        >
          <legend
            style={{
              fontSize: '18px',
              fontWeight: '600',
              padding: '0 10px',
            }}
          >
            Password Change
          </legend>

          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Current Password</label>
            <input
              type="password"
              name="currentPassword"
              value={formData.currentPassword}
              onChange={handleChange}
              placeholder="Leave blank to leave unchanged"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>New Password</label>
            <input
              type="password"
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              placeholder="Leave blank to leave unchanged"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Confirm New Password</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Leave blank to leave unchanged"
              style={inputStyle}
            />
          </div>
        </fieldset>

        <button
          type="submit"
          className="btn btn-primary btn-lg"
          style={{
            padding: '15px 40px',
            cursor: 'pointer',
          }}
        >
          Save Changes
        </button>
      </form>
    </div>
  );
};

export default EditProfile;
