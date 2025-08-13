import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './registerPage.css'

function RegisterPage() {
  const navigate = useNavigate(); 
  const[gender, setGender] = useState("남");
  const [formData, setFormData] = useState({
    name : "",
    email : "",
    password : "",
    confirmPassword : "",
    height : "",
    weight : ""
  })

  const handleChange = (e) => {
    setFormData({...formData, [e.target.name] : e.target.value } )
  }
  
  const handleSubmit = async (e) => {
  e.preventDefault();
  console.log("🔥 handleSubmit 실행됨");

  const dataToSend = {
    name: formData.name,
    email: formData.email,
    password: formData.password,
    height: parseFloat(formData.height),
    weight: parseFloat(formData.weight),
    gender
  };

  console.log("📦 서버로 보낼 데이터:", dataToSend);

  try {
    const res = await fetch("http://15.165.129.131:3000/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(dataToSend)
    });

    console.log("🌐 fetch 응답 객체:", res);

    const result = await res.json();

    console.log("📨 응답 받은 데이터:", result);

    if (res.ok) {
      alert("✅ Register Complete!");
      navigate("/login");
    } else {
      alert("❌ Register Error: " + result.message);
    }
  } catch (err) {
    console.error("❗ Servor Eror:", err);
  }
};


  return (
    <div className="registerPage">
      <span className='logo glitch' onClick={()=> navigate("/login")}>ISECLOTH</span>
      <form
        onSubmit={handleSubmit}
        className="registerForm"
      >
        <h2 className="title">Register</h2>

        <input
          type="text"
          name="name"
          placeholder="Name"
          onChange={handleChange}
          className="Name"
        />

        <input
          type="text"
          name="email"
          placeholder="email"
          onChange={handleChange}
          className='email'
        />

        <input
          type="password"
          name="password"
          placeholder="password"
          onChange={handleChange}
          className="password"
        />

        <input
          type="password"
          name="confirmPassword"
          placeholder="Confirm password"
          onChange={handleChange}
          className="confirmPassword"
        />

        <input
          type="text"
          name="height"
          placeholder="height(cm)"
          onChange={handleChange}
          className="height"
        />

        <input
          type="text"
          name="weight"
          placeholder="weight(kg)"
          onChange={handleChange}
          className="weight"
        />

        <div className="gender">
          <label className="genderDrop">Gender</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="dropDown"
          >
            <option value="남">Male</option>
            <option value="여">Female</option>
          </select>
        </div>

        <button
          type="submit"
          className="registerButton"
        >
          Register
        </button>
      </form>
    </div>
  );
}

export default RegisterPage;