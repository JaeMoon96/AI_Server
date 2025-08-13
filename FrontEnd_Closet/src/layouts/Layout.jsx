import { Outlet } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import './layout.css';

function Layout() {
  return (
    <div id="layout">
      <Header />
      <main>
        <Outlet />  {/* 요게 핵심! */}
      </main>
      <Footer />
    </div>
  );
}

export default Layout;
