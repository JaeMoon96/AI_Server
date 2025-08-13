import './changePassword.css';
import { useState } from 'react';
import {useNavigate} from 'react-router-dom'
function ChangePassword() {
    const navigate = useNavigate();
  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    newPasswordConfirm: "",
  });

  const token = localStorage.getItem("token");

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const change = async () => {
    if (formData.newPassword !== formData.newPasswordConfirm) {
      alert("New passwords do not match!");
      return;
    }

    try {
      const res = await fetch("http://15.165.129.131:3000/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
      });

      const result = await res.json();

      if (res.ok) {
        alert("Password changed successfully!");
        navigate('/my-page')
      } else {
        alert("Failed to change password: " + result.message);
      }
    } catch (err) {
      console.error(err);
      alert("Server error!");
    }
  };

  return (
    <div className="ChangePasswordStart">
      <h2>Change Password</h2>
      <form className = "passwordForm">
        <input
          name="currentPassword"
          type="password"
          onChange={handleChange}
          placeholder="Current Password"
        />
        <input
          name="newPassword"
          type="password"
          onChange={handleChange}
          placeholder="New Password"
        />
        <input
          name="newPasswordConfirm"
          type="password"
          onChange={handleChange}
          placeholder="Confirm New Password"
        />
        <button type="button" onClick={change}>Change</button>
      </form>
    </div>
  );
}

export default ChangePassword;
