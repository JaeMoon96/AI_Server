import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './loginPage.css'

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      if (email === "admin") {
        navigate("/")
      }
      const response = await fetch('http://15.165.129.131:3000/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      const data = await response.json();
      console.log("Response status:", response.status);
      console.log("Response data:", data);
      if (response.ok) {
        setMessage('로그인 성공!');
        console.log('Login success:', data);

        localStorage.setItem("token", data.token);  // ✅ 이거 추가해야 MyCloset 등에서 토큰 인식 가능

        navigate('/main');
      } else {
        alert("올바르지 않습니다.")
        setMessage(`로그인 실패: ${data.message}`);
      }
    } catch (error) {
      console.error('Error:', error);
      setMessage('서버 오류 발생');
    }
  };

  return (
    <div className="loginForm">
      <span className='logo glitch'>ISECLOTH</span>
      <label className='email-form'>
        <input onChange={(e) => setEmail(e.target.value)} placeholder="Email" name="email">
        </input>
      </label>
    
      <label>
        <input onChange={(e) => setPassword(e.target.value)} placeholder='Password' type='password' name="password"></input>
      </label>
      
      {/* <div className="bar"></div> */}

      <button onClick={()=>handleLogin()} className='loginButton'>
        Login
      </button>

      <Link to={"/register"} className='register'>Don't you have account yet?</Link>
      <Link to={"/reset-password"} className='register'>Forgot your password?</Link>
    </div>
  );
}

export default LoginPage;
