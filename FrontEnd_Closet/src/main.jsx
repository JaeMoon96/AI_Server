import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext'; // 👈 추가
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider> {/* 모든 컴포넌트가 로그인 상태 접근 가능 */}
      <App />
    </AuthProvider>
  </React.StrictMode>
);
