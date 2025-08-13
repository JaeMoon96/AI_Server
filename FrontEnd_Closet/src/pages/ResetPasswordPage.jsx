import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import './registerPage.css'; // 같은 스타일 재사용
import LoadingOverlay from "../components/LoadingOverlay";


function ResetPasswordPage() {
  const { token } = useParams(); // URL에 있는 토큰
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [stage, setStage] = useState(token ? "reset" : "request");

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const res = await fetch("http://15.165.129.131:3000/auth/request-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const result = await res.json();
    if (res.ok) {
        setLoading(false);
      alert("이메일로 재설정 링크를 보냈습니다.");
      navigate("/login");
    } else {
        setLoading(false);
      alert("요청 실패: " + result.message);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }

    const res = await fetch("http://15.165.129.131:3000/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });

    const result = await res.json();
    if (res.ok) {
      alert("비밀번호가 성공적으로 변경되었습니다.");
      navigate("/login");
    } else {
      alert("재설정 실패: " + result.message);
    }
  };

  return (
    <div className="registerPage">
      <span className="logo glitch" onClick={() => navigate("/")}>ISECLOTH</span>
        {loading && <LoadingOverlay message={"Sending Email"}/>}
        
      {stage === "request" && (
        <form onSubmit={handleRequestReset} className="registerForm">
          <h2 className="title" style={{ fontFamily: "KIMM_Bold" }}>Forgot Your Password?</h2>
          <input
            type="email"
            name="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="email"
          />
          <button type="submit" className="registerButton">Send Reset Link</button>
        </form>
      )}

      {stage === "reset" && (
        <form onSubmit={handleResetPassword} className="registerForm">
          <h2 className="title" style={{ fontFamily: "KIMM_Bold" }}>Reset Your Password</h2>
          <input
            type="password"
            placeholder="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="password"
          />
          <input
            type="password"
            placeholder="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="confirmPassword"
          />
          <button type="submit" className="registerButton">Reset Password</button>
        </form>
      )}
    </div>
  );
}

export default ResetPasswordPage;
