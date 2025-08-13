import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';

import Layout from './layouts/Layout';
import PrivateRoute from './components/PrivateRoute'; // ✅ 추가

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import WelcomePage from './pages/WelcomePage';


import MainPage from './pages/MainPage';
import MyClosetPage from './pages/MyClosetPage';
import MyPage from './pages/MyPage';
import VirtualFitting from './pages/VirtualFitting';
import ClothRegisterPage from './pages/ClothRegisterPage';
import ChangePassword from './pages/ChangePassword';
import ResetPasswordPage from './pages/ResetPasswordPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* 로그인 필요 없는 경로 */}
          <Route path="/" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          
          {/* 로그인 필요한 경로 (PrivateRoute + Layout으로 감싸기) */}
          <Route element={<PrivateRoute />}>
            <Route element={<Layout />}>
              <Route path="/main" element={<MainPage />} />
              <Route path="/myCloset" element={<MyClosetPage />} />
              <Route path="/register-cloth" element={<ClothRegisterPage />} />
              <Route path="/virtualFitting" element={<VirtualFitting />} />
              <Route path="/my-page" element = {<MyPage />} />
              <Route path="/change-password" element = {<ChangePassword />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
