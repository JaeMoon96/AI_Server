import { Link } from "react-router-dom";

function Header() {
  const logout = async () => {
    try {
      await fetch("http://15.165.129.131:3000/auth/logout", {
        method: "POST", // 보통 로그아웃은 POST로 처리
        credentials: "include", // 쿠키 포함 (중요)
      });
      localStorage.removeItem("token");
      window.location.href = "/login"; // 로그인 화면으로 강제 이동
    } catch (err) {
      console.error("로그아웃 실패", err);
    }
  };
  return (
    <header>
      <div className="inner">
        {/* <Link to="/main" className="logo2">I</Link> */}
        <Link to="/main" className="logo2 glitch">ISECLOTH</Link>

        <nav>
          <ul>
            <li><Link to="/my-page">MY PAGE</Link></li>
            <li><Link to="/myCloset">MY CLOSET</Link></li>
            <li><Link to="/virtualFitting">FITTING ROOM</Link></li>
            <li><Link onClick={logout}>LOGOUT</Link></li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

import "./Header.css";
export default Header;